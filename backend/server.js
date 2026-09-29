// ========== 加载环境变量（必须在所有 require 之前执行）==========
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, process.env.NODE_ENV === 'production' ? '.env.production' : '.env') });

const http = require('http');
const url = require('url');
const fs = require('fs');
const dbIndex = require('./db/index.js');
const paymentsDb = require('./db/payments.js');
const userDb = require('./db/users.js');
const adminDb = require('./db/admin.js');
const fieldMappingsDb = require('./db/field-mappings.js');
const adminService = require('./services/admin.service.js');
const { applySecurity } = require('./middleware/安全');
const { requestLogger } = require('./middleware/日志');
const { parseMultipart, collectBody, validateMagicBytes, validateExtension } = require('./utils/multipart');
const { getAuthTokenFromCookie } = require('./utils/cookie工具');
const { handleVectorRequest } = require('./routes/vector');
const { clientIp: getClientIp } = require('./utils/clientIp');

// ========== 管理员安全配置 ==========
// 管理员密码由 admin.service.js 管理，优先从环境变量读取，其次从数据库读取
// 此处不做强制检查，避免与数据库存储方式冲突

// ========== 从独立文件加载管理后台HTML ==========
const ADMIN_HTML = fs.readFileSync(path.join(__dirname, 'admin', 'login.html'), 'utf8');
const MAIN_HTML = fs.readFileSync(path.join(__dirname, 'admin', 'main.html'), 'utf8');
const M_LOGIN_HTML = fs.readFileSync(path.join(__dirname, 'admin', 'm-login.html'), 'utf8');
const M_HTML = fs.readFileSync(path.join(__dirname, 'admin', 'm.html'), 'utf8');

// ========== 管理员认证（仅 Bearer token，不使用 Cookie 以防 CSRF）==========
function getAdminTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

async function checkAdminAuth(req) {
  const token = getAdminTokenFromRequest(req);
  return await adminService.isAdminToken(token);
}

// ========== CORS 配置 ==========
const SERVER_ORIGIN = process.env.SERVER_ORIGIN || 'http://localhost:8080';
const ALLOWED_ORIGINS = [
  'http://localhost:4000',
  'http://localhost:4001',
  'http://localhost:8080',
  SERVER_ORIGIN,
  process.env.FRONTEND_URL
].filter(Boolean);

// ========== 路由模块 ==========
const authRoutes = require('./routes/auth.js');
const userRoutes = require('./routes/users.js');
const ratingRoutes = require('./routes/ratings.js');
const reportRoutes = require('./routes/reports.js');
const uploadRoutes = require('./routes/upload.js');
const paymentRoutes = require('./routes/payment.js');
const contactUnlockRoutes = require('./routes/contact-unlock.js');
const adminCustomFieldsRoutes = require('./routes/admin-custom-fields.js');
const userCustomFieldsRoutes = require('./routes/user-custom-fields.js');

// 初始化支付配置
paymentRoutes.initConfig(process.env);

// ========== 速率限制 ==========
const rateLimitMap = new Map();
const loginLimitMap = new Map();
const registerLimitMap = new Map();

function checkLimitMap(map, ip, limit, windowMs) {
  const now = Date.now();
  const record = map.get(ip) || { count: 0, startTime: now };
  if (now - record.startTime > windowMs) {
    record.count = 1;
    record.startTime = now;
  } else {
    record.count++;
  }
  map.set(ip, record);
  return record.count <= limit;
}

function cleanupLimitMap(map, windowMs) {
  const now = Date.now();
  for (const [key, val] of map) {
    if (now - val.startTime > windowMs) map.delete(key);
  }
}

setInterval(() => {
  cleanupLimitMap(rateLimitMap, 60000);
  cleanupLimitMap(loginLimitMap, 300000);
  cleanupLimitMap(registerLimitMap, 3600000);
}, 5 * 60 * 1000);

function checkRateLimit(ip, limit = 60, windowMs = 60000) {
  return checkLimitMap(rateLimitMap, ip, limit, windowMs);
}

function checkLoginRateLimit(ip, limit = 100, windowMs = 300000) {
  return checkLimitMap(loginLimitMap, ip, limit, windowMs);
}

function checkRegisterRateLimit(ip, limit = 5, windowMs = 3600000) {
  return checkLimitMap(registerLimitMap, ip, limit, windowMs);
}

// ========== 请求体读取 ==========
const { MAX_BODY_SIZE } = require('./utils/config');
function readBodyWithLimit(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error('请求体过大，最大允许5MB'));
        req.destroy();
        return;
      }
      body += c;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ========== 创建服务器 ==========
const server = http.createServer(async (req, res) => {
  // ===== 中间件 =====
  applySecurity(req, res);
  requestLogger(req, res);

  // 顶层 try/catch：防止 async handler 内同步抛错变成 unhandledRejection，
  // 导致客户端挂起到超时（如 url.parse 在异常 URL 上返回 null 后续访问属性抛错）
  try {

  // Cookie → Authorization 桥接（让所有路由自动支持 httpOnly cookie 认证）
  if (!req.headers.authorization) {
    const cookieToken = getAuthTokenFromCookie(req);
    if (cookieToken) req.headers.authorization = 'Bearer ' + cookieToken;
  }

  const origin = req.headers.origin || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : '';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const parsedUrl = url.parse(req.url, true);
  const rawPath = parsedUrl.pathname;
  const pathname = rawPath;

  // ========== 静态文件服务 ==========
  // 收款码图片
  if (req.method === 'GET' && (pathname === '/wechat-qr.png' || pathname === '/alipay-qr.png')) {
    const fileName = pathname.includes('wechat') ? 'wechat-qr.png' : 'alipay-qr.png';
    const filePath = path.join(__dirname, '..', 'app', 'public', fileName);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404); res.end('File Not Found');
      } else {
        res.writeHead(200, {'Content-Type': 'image/png'}); res.end(data);
      }
    });
    return;
  }

  // 头像图片
  if (req.method === 'GET' && pathname.startsWith('/avatars/')) {
    const fileName = pathname.replace('/avatars/', '');
    // 修复：原 fileName.includes('..') 会误伤合法文件名如 avatar..png
    // 改用 path.resolve 规范化后校验是否仍在 avatars 目录内
    const avatarsDir = path.resolve(__dirname, '..', 'uploads', 'avatars');
    const filePath = path.resolve(avatarsDir, fileName);
    if (!filePath.startsWith(avatarsDir + path.sep) || fileName.includes('\0')) {
      res.writeHead(400); res.end('Invalid path'); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('File Not Found'); }
      else { res.writeHead(200, {'Content-Type': mimeTypes[ext] || 'image/jpeg'}); res.end(data); }
    });
    return;
  }

  // ========== 管理后台页面 ==========
  if (req.method === 'GET' && (pathname === '/admin' || pathname === '/admin/')) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(ADMIN_HTML); return;
  }
  if (req.method === 'GET' && (pathname === '/admin/m' || pathname === '/admin/m/')) {
    if (!(await checkAdminAuth(req))) {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(M_LOGIN_HTML); return;
    }
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(M_HTML); return;
  }
  if (req.method === 'GET' && (pathname === '/admin/main' || pathname === '/admin/main/')) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(MAIN_HTML); return;
  }

  // 管理后台静态文件
  if (req.method === 'GET' && pathname.startsWith('/admin/')) {
    const filePath = path.join(__dirname, 'admin', path.basename(pathname));
    fs.readFile(filePath, function(err, data){
      if (err) {
        res.writeHead(404); res.end('Not Found');
      } else {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = { '.css': 'text/css', '.js': 'application/javascript', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
        res.writeHead(200, {
          'Content-Type': (mimeTypes[ext] || 'application/octet-stream') + '; charset=utf-8',
          'Content-Length': data.length,
          'Cache-Control': 'no-cache'
        });
        res.end(data);
      }
    });
    return;
  }

  // ========== API 路由（统一只处理 /api/xxx）==========

  // --- 上传 ---
  if (req.method === 'POST' && pathname === '/api/upload/avatar') {
    await uploadRoutes.uploadAvatar(req, res); return;
  }
  if (req.method === 'POST' && pathname === '/api/deposit/upload-proof') {
    uploadRoutes.uploadDepositProof(req, res); return;
  }
  if (req.method === 'GET' && pathname === '/api/admin/deposits') {
    await uploadRoutes.getDeposits(req, res, checkAdminAuth); return;
  }
  if (req.method === 'PUT' && /^\/api\/admin\/deposits\/\d+\/approve$/.test(pathname)) {
    await uploadRoutes.approveDeposit(req, res, readBodyWithLimit, checkAdminAuth, pathname); return;
  }
  if (req.method === 'PUT' && /^\/api\/admin\/deposits\/\d+\/reject$/.test(pathname)) {
    await uploadRoutes.rejectDeposit(req, res, readBodyWithLimit, checkAdminAuth, pathname); return;
  }
  if (req.method === 'GET' && pathname === '/api/users/my-deposit') {
    await uploadRoutes.getMyDeposit(req, res); return;
  }
  if (req.method === 'GET' && /^\/api\/admin\/deposits\/proof\/\d+$/.test(pathname)) {
    await uploadRoutes.getDepositProofById(req, res, checkAdminAuth, pathname); return;
  }
  if (req.method === 'DELETE' && /^\/api\/admin\/deposits\/\d+$/.test(pathname)) {
    await uploadRoutes.deleteDeposit(req, res, checkAdminAuth, pathname); return;
  }

  // --- 向量搜索 ---
  const handled = await handleVectorRequest(req, res, checkAdminAuth);
  if (handled) return;

  // --- 查看联系方式支付 ---
  if (req.method === 'POST' && pathname === '/api/payments/view-contact') {
    res.writeHead(501, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({success: false, message: '自动支付暂未开通，请使用手动上传凭证'})); return;
  }
  if (req.method === 'POST' && pathname === '/api/unlock-contact/submit') {
    contactUnlockRoutes.submitUnlockRequest(req, res); return;
  }
  if (req.method === 'GET' && pathname === '/api/admin/unlock-contact-requests') {
    await contactUnlockRoutes.getUnlockRequests(req, res, checkAdminAuth); return;
  }
  if (req.method === 'PUT' && /^\/api\/admin\/unlock-contact-requests\/\d+\/approve$/.test(pathname)) {
    await contactUnlockRoutes.approveUnlockRequest(req, res, checkAdminAuth, readBodyWithLimit, pathname); return;
  }
  if (req.method === 'PUT' && /^\/api\/admin\/unlock-contact-requests\/\d+\/reject$/.test(pathname)) {
    await contactUnlockRoutes.rejectUnlockRequest(req, res, checkAdminAuth, readBodyWithLimit, pathname); return;
  }
  if (req.method === 'DELETE' && /^\/api\/admin\/unlock-contact-requests\/\d+$/.test(pathname)) {
    await contactUnlockRoutes.deleteUnlockRequest(req, res, checkAdminAuth, pathname); return;
  }

  if (req.method === 'GET' && pathname.startsWith('/uploads/')) {
    uploadRoutes.serveUploadedFile(req, res, pathname); return;
  }

  // --- 认证 ---
  const clientIp = getClientIp(req);
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    authRoutes.register(req, res, readBodyWithLimit, checkRegisterRateLimit, clientIp); return;
  }
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    authRoutes.login(req, res, readBodyWithLimit, checkLoginRateLimit); return;
  }
  if (req.method === 'POST' && pathname === '/api/auth/change-password') {
    await authRoutes.changePassword(req, res, readBodyWithLimit); return;
  }
  if (req.method === 'GET' && pathname === '/api/auth/captcha') {
    authRoutes.getCaptcha(req, res); return;
  }
  if (req.method === 'POST' && pathname === '/api/auth/captcha/verify') {
    authRoutes.verifyCaptcha(req, res, readBodyWithLimit); return;
  }
  
  // 短信验证预留接口
  if (req.method === 'POST' && pathname === '/api/auth/sms/register-code') {
    authRoutes.sendRegisterSmsCode(req, res, readBodyWithLimit); return;
  }
  if (req.method === 'POST' && pathname === '/api/auth/sms/verify-register-code') {
    authRoutes.verifyRegisterSmsCode(req, res, readBodyWithLimit); return;
  }
  if (req.method === 'POST' && (pathname === '/api/admin/login' || pathname === '/api/admin')) {
    authRoutes.adminLogin(req, res, readBodyWithLimit, checkLoginRateLimit); return;
  }

  // --- 管理员统计 ---
  if (req.method === 'GET' && pathname === '/api/admin/stats') {
    if (!(await checkAdminAuth(req))) {
      res.writeHead(401, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(JSON.stringify({success: false, message: '需要管理员权限'})); return;
    }
    const stats = await userDb.getUserStats();
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({success: true, stats})); return;
  }

  // --- 用户路由 ---
  if (req.method === 'GET' && pathname === '/api/users') {
    await userRoutes.getUsers(req, res, null, parsedUrl); return;
  }
  if (req.method === 'POST' && pathname === '/api/users') {
    userRoutes.addUser(req, res, readBodyWithLimit); return;
  }
  if (req.method === 'POST' && pathname === '/api/users/batch') {
    await userRoutes.batchSaveUsers(req, res, readBodyWithLimit, checkAdminAuth); return;
  }
  if (req.method === 'GET' && pathname === '/api/users/my') {
    await userRoutes.getMyUser(req, res); return;
  }
  if (req.method === 'PUT' && pathname === '/api/users/my') {
    userRoutes.updateMyUser(req, res, readBodyWithLimit); return;
  }
  if (req.method === 'DELETE' && pathname === '/api/users/my') {
    await userRoutes.deleteMyUser(req, res); return;
  }
  if (req.method === 'GET' && pathname === '/api/users/pending') {
    await userRoutes.getPendingUsers(req, res, checkAdminAuth); return;
  }
  if (req.method === 'GET' && pathname === '/api/users/search') {
    await userRoutes.searchUsers(req, res, parsedUrl); return;
  }

  // --- 圈子页成员（访客本来就能逐页翻完全站成员，这里只是把几十次请求合成一次） ---
  if (req.method === 'GET' && pathname === '/api/circles/members') {
    await userRoutes.getCircleMembers(req, res); return;
  }

  // --- 用户自定义字段（EAV 键值表） ---
  if (pathname === '/api/users/custom-fields' || /^\/api\/users\/custom-fields\/[^\/]+$/.test(pathname)) {
    await userCustomFieldsRoutes.handleUserCustomFields(req, res, readBodyWithLimit, pathname); return;
  }
  // --- 批量获取用户自定义字段（按调用方给的 user_ids 下发，不做整表导出） ---
  if (req.method === 'GET' && pathname === '/api/users/all-custom-fields') {
    const rawIds = String(parsedUrl.query.user_ids || '');
    const userIds = [...new Set(
      rawIds.split(',').map(s => s.trim()).filter(id => /^[a-zA-Z0-9_-]{1,50}$/.test(id))
    )].slice(0, 100);
    const allFields = await userDb.getCustomFieldsByUserIds(userIds);
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({success: true, data: allFields})); return;
  }

  // 带ID的用户路由
  if (req.method === 'PUT' && /^\/api\/users\/[^\/]+$/.test(pathname)) {
    await userRoutes.editUser(req, res, readBodyWithLimit, checkAdminAuth, pathname); return;
  }
  if (req.method === 'DELETE' && /^\/api\/users\/[^\/]+$/.test(pathname)) {
    await userRoutes.deleteUser(req, res, null, pathname); return;
  }
  if (req.method === 'POST' && /^\/api\/users\/[^\/]+\/approve$/.test(pathname)) {
    await userRoutes.approveUser(req, res, checkAdminAuth, pathname); return;
  }
  if (req.method === 'POST' && /^\/api\/users\/[^\/]+\/reject$/.test(pathname)) {
    await userRoutes.rejectUser(req, res, checkAdminAuth, pathname); return;
  }
  // --- 解锁联系方式 ---
  if (req.method === 'POST' && /^\/api\/users\/[^\/]+\/unlock-contact$/.test(pathname)) {
    await contactUnlockRoutes.adminUnlockContact(req, res, checkAdminAuth, readBodyWithLimit, pathname); return;
  }
  if (req.method === 'GET' && /^\/api\/users\/[^\/]+\/check-unlock$/.test(pathname)) {
    await contactUnlockRoutes.checkUnlock(req, res, pathname, parsedUrl.query); return;
  }
  if (req.method === 'GET' && pathname === '/api/admin/unlock-records') {
    await contactUnlockRoutes.getUnlockRecords(req, res, checkAdminAuth); return;
  }

  // --- 评价 ---
  if (req.method === 'POST' && pathname === '/api/ratings') {
    ratingRoutes.addRating(req, res, readBodyWithLimit); return;
  }
  if (req.method === 'GET' && /^\/api\/users\/[^\/]+\/ratings$/.test(pathname)) {
    await ratingRoutes.getRatings(req, res, pathname); return;
  }

  // --- 举报 ---
  if (req.method === 'POST' && pathname === '/api/reports') {
    reportRoutes.addReport(req, res, readBodyWithLimit); return;
  }
  if (req.method === 'GET' && pathname === '/api/reports') {
    await reportRoutes.getAllReports(req, res, checkAdminAuth); return;
  }
  if (req.method === 'PUT' && /^\/api\/reports\/\d+\/status$/.test(pathname)) {
    await reportRoutes.updateReportStatus(req, res, checkAdminAuth, pathname); return;
  }
  if (req.method === 'DELETE' && /^\/api\/reports\/\d+$/.test(pathname)) {
    await reportRoutes.deleteReport(req, res, checkAdminAuth, pathname); return;
  }
  // --- 支付 ---
  if (req.method === 'GET' && pathname === '/api/payment/config') {
    await paymentRoutes.publicConfig(req, res); return;
  }
  if (req.method === 'GET' && pathname === '/api/admin/payment-price') {
    await paymentRoutes.adminGetPrice(req, res, checkAdminAuth); return;
  }
  if (req.method === 'PUT' && pathname === '/api/admin/payment-price') {
    await paymentRoutes.adminSavePrice(req, res, checkAdminAuth, readBodyWithLimit); return;
  }
  if (req.method === 'POST' && pathname === '/api/payment/create') {
    await paymentRoutes.createPayment(req, res, readBodyWithLimit); return;
  }
  if (req.method === 'POST' && pathname === '/api/payment/notify-wechat') {
    await paymentRoutes.wechatNotify(req, res, readBodyWithLimit); return;
  }
  if (req.method === 'POST' && pathname === '/api/payment/notify-alipay') {
    await paymentRoutes.alipayNotify(req, res, readBodyWithLimit); return;
  }
  if (req.method === 'GET' && pathname === '/api/payment/mock-pay') {
    await paymentRoutes.mockPay(req, res, parsedUrl); return;
  }
  if (req.method === 'GET' && pathname === '/api/payment/status') {
    await paymentRoutes.queryPaymentStatus(req, res, parsedUrl); return;
  }

  // --- 字段中文映射表（前端动态获取字段定义，支持 ETag 缓存） ---
  if (req.method === 'GET' && pathname === '/api/field-mappings') {
    try {
      const version = await fieldMappingsDb.getCacheVersion();
      if (req.headers['if-none-match'] === version) {
        res.writeHead(304); res.end(); return;
      }
      const mappings = await fieldMappingsDb.getAllFieldMappings();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'ETag': version
      });
      res.end(JSON.stringify({success: true, data: mappings})); return;
    } catch (err) {
      res.writeHead(500, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(JSON.stringify({success: false, message: err.message})); return;
    }
  }
  if (req.method === 'GET' && pathname === '/api/field-mappings/labels') {
    try {
      const version = await fieldMappingsDb.getCacheVersion();
      if (req.headers['if-none-match'] === version) {
        res.writeHead(304); res.end(); return;
      }
      const labelMap = await fieldMappingsDb.getFieldLabelMap();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'ETag': version
      });
      res.end(JSON.stringify({success: true, data: labelMap})); return;
    } catch (err) {
      res.writeHead(500, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(JSON.stringify({success: false, message: err.message})); return;
    }
  }
  // --- 自定义筛选字段 ---
  if (req.method === 'GET' && pathname === '/api/custom-fields') {
    await adminCustomFieldsRoutes.getCustomFilters(req, res); return;
  }
  if (req.method === 'POST' && pathname === '/api/admin/custom-fields') {
    await adminCustomFieldsRoutes.addCustomFilter(req, res, readBodyWithLimit, checkAdminAuth); return;
  }
  if (req.method === 'DELETE' && /^\/api\/admin\/custom-fields\/\d+$/.test(pathname)) {
    await adminCustomFieldsRoutes.deleteCustomFilter(req, res, checkAdminAuth, pathname); return;
  }

  // 404
  res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
  res.end('Not Found');

  } catch (err) {
    // 兜底错误处理：任何未捕获的同步异常或 await 抛错都到这里
    console.error('[Server] uncaught error:', err);
    if (!res.headersSent) {
      res.writeHead(500, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(JSON.stringify({ success: false, message: '服务器内部错误' }));
    }
  }
});

const PORT = process.env.PORT || 8080;

// 异步初始化数据库连接后再启动服务器
const { initConnection } = require('./db/index.js');
const { initVectorTables } = require('./db/vector.js');
const authDb = require('./db/auth.js');
initConnection().then(async () => {
  // 启动期强校验：管理员密码必须能从环境变量或数据库取到，否则拒绝启动
  // （替代原 admin.service.js 模块加载期的 process.exit(1)）
  try {
    const adminPwd = process.env.ADMIN_PASSWORD || await adminDb.getAdminPassword();
    if (!adminPwd) {
      console.error('[FATAL] ADMIN_PASSWORD not configured. Set it in .env or database.');
      process.exit(1);
    }
  } catch (e) {
    console.error('[FATAL] 管理员密码校验失败:', e.message);
    process.exit(1);
  }
  // 自动建向量表 + HNSW 索引（若已存在则跳过）
  try { await initVectorTables(); } catch(e) { console.warn('向量表初始化失败（可忽略）：', e.message); }
  // 支付订单表补 channel_txn_id 列（种子库没有这一列；IF NOT EXISTS 幂等）
  try { await paymentsDb.ensurePaymentColumns(); } catch(e) { console.warn('支付订单表补列失败：', e.message); }
  // 注册账号表补手机号唯一索引（IF NOT EXISTS 幂等）。
  // 失败通常只有一个原因：表里已经存在同手机号的重复账号，必须先人工合并再重启，
  // 否则注册仍可重复、登录命中哪个账号不确定。这里只告警不阻断启动。
  try { await authDb.ensurePhoneUniqueIndex(); } catch(e) { console.warn('手机号唯一索引创建失败（表内可能已有重复手机号，需先清理）：', e.message); }
  server.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║     精准匹配 - 后端服务已启动            ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  API地址: http://localhost:${PORT}           ║`);
    console.log(`║  环境: ${process.env.NODE_ENV || 'development'}                           ║`);
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
  });
}).catch(err => {
  console.error('数据库连接失败:', err.message);
  process.exit(1);
});

// ===== 全局错误处理 =====
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
  // closeDb 现在是异步的；进程即将退出，这里不等待、只吞掉可能的 rejection
  dbIndex.closeDb().catch(() => {});
  process.exit(1);
});

// ===== 优雅关闭 =====
process.on('SIGINT', () => {
  console.log('\n[Server] 正在关闭...');
  server.close(() => {
    dbIndex.closeDb().catch(() => {}).then(() => {
      console.log('[Server] 已关闭');
      process.exit(0);
    });
  });
  // 10秒后强制退出
  setTimeout(() => process.exit(1), 10000);
});

process.on('SIGTERM', () => {
  console.log('\n[Server] 收到 SIGTERM，正在关闭...');
  server.close(() => {
    dbIndex.closeDb().catch(() => {}).then(() => {
      console.log('[Server] 已关闭');
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 10000);
});
