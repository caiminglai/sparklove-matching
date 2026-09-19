const { Pool } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;

// 生产环境必须显式设置 PG_PASSWORD，dev 兜底仅用于本地
const _isProd = process.env.NODE_ENV === 'production';
if (_isProd && !process.env.PG_PASSWORD) {
  throw new Error('生产环境必须设置 PG_PASSWORD 环境变量');
}
const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'dev-pg-password-do-not-use-in-prod',
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'match_db',
  max: 10,                        // 连接池上限
  idleTimeoutMillis: 30000,       // 空闲连接 30s 后回收
  connectionTimeoutMillis: 5000   // 取连接超过 5s 直接报错，避免请求无限挂起
};

let pool = null;

function getPool() {
  if (!pool) pool = new Pool(pgConfig);
  return pool;
}

// 启动时调用：建池 + 立刻发一条探活查询，连不上就快速失败（让 server.js 的 .catch 走 process.exit(1)）
async function initConnection() {
  await getPool().query('SELECT 1');
}

// 统一执行入口。
// 关键点：params 为空时必须只传 sql 一个参数，让 pg 走 simple query 协议，
// 否则多语句 SQL（如 db\vector.js 的建表脚本）会被 pg 拒绝。详见交接说明第 6.3 节。
async function runQuery(sql, params, boundClient) {
  const executor = boundClient || getPool();
  if (!params || params.length === 0) return executor.query(sql);
  return executor.query(sql, params);
}

// 造一个 db 句柄。boundClient 非空时，所有查询都绑在这条连接上（事务用）。
function createDbHandle(boundClient) {
  function prepare(sql) {
    return {
      get: async (...params) => {
        const result = await runQuery(sql, params, boundClient);
        return result.rows.length > 0 ? result.rows[0] : null;
      },
      all: async (...params) => {
        const result = await runQuery(sql, params, boundClient);
        return result.rows;
      },
      run: async (...params) => {
        const result = await runQuery(sql, params, boundClient);
        return {
          changes: result.rowCount,
          lastInsertRowid: result.rows[0] && result.rows[0].id
        };
      },
      exec: async () => {
        await runQuery(sql, [], boundClient);
      }
    };
  }

  async function exec(sql) {
    await runQuery(sql, [], boundClient);
  }

  // 事务：从池里独占一条连接，BEGIN → 执行回调 → COMMIT/ROLLBACK → 归还。
  // 回调收到的是一个绑定到该连接的 db 句柄，回调内部必须用它（而不是外层的 getDb()），
  // 否则语句会跑到池里另一条连接上，脱离事务。
  async function transaction(fn) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(createDbHandle(client));
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) { /* 忽略回滚自身失败 */ }
      throw e;
    } finally {
      client.release();
    }
  }

  return { prepare, exec, transaction };
}

function getDb() {
  return createDbHandle(null);
}

async function closeDb() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

// 修复：dev 模式密钥固定，避免每次重启导致旧 token 失效、旧加密联系方式无法解密
const DEV_TOKEN_SECRET_FALLBACK = 'dev-fixed-token-secret-do-not-use-in-prod-001';
const DEV_ENCRYPTION_KEY_FALLBACK = 'a'.repeat(64); // 64 个十六进制字符 = 32 字节密钥
const TOKEN_SECRET = process.env.TOKEN_SECRET || (
  _isProd
    ? (() => { throw new Error('生产环境必须设置 TOKEN_SECRET 环境变量'); })()
    : DEV_TOKEN_SECRET_FALLBACK
);
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || (
  _isProd
    ? (() => { throw new Error('生产环境必须设置 ENCRYPTION_KEY 环境变量'); })()
    : DEV_ENCRYPTION_KEY_FALLBACK
);
const IV_LENGTH = 16;

function hashPasswordSync(password) {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

function verifyPasswordSync(password, hash) {
  if (!hash) return false;
  try {
    if (hash.length === 64 && !hash.startsWith('$2b$') && !hash.startsWith('$2a$')) {
      const computed = crypto.createHash('sha256').update(password).digest('hex');
          const a = Buffer.from(computed, 'utf8');
          const b = Buffer.from(hash, 'utf8');
          return a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  if (!encryptedText) return '';
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) return encryptedText;
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return encryptedText;
  }
}

function generateToken(userId, role = 'user') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  const payload = `${userId}:${timestamp}:${random}:${role}`;
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex').slice(0, 16);
  const data = `${payload}:${signature}`;
  return Buffer.from(data).toString('base64');
}

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 4) return null;
    const signature = parts.pop();
    const payload = parts.join(':');
    const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex').slice(0, 16);
    if (signature !== expectedSig) return null;
    const [userId, timestamp] = payload.split(':');
    if (Date.now() - parseInt(timestamp) > 7 * 24 * 60 * 60 * 1000) return null;
    return userId;
  } catch {
    return null;
  }
}

function generateAdminToken(username) {
  return generateToken(username, 'admin');
}

function verifyAdminToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 5) return null;
    const signature = parts.pop();
    const payload = parts.join(':');
    const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex').slice(0, 16);
    if (signature !== expectedSig) return null;
    const [username, timestamp, , role] = payload.split(':');
    if (role !== 'admin') return null;
    if (Date.now() - parseInt(timestamp) > 24 * 60 * 60 * 1000) return null;
    return username;
  } catch {
    return null;
  }
}

module.exports = {
  getDb,
  initConnection,
  hashPasswordSync,
  verifyPasswordSync,
  encrypt,
  decrypt,
  generateToken,
  verifyToken,
  generateAdminToken,
  verifyAdminToken,
  closeDb
};