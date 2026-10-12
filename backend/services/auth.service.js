// ============================================================
// 业务逻辑层 - 认证服务（纯业务规则，无 SQL，无 HTTP）
// ============================================================

const authDb = require('../db/auth');
const { generateToken, verifyToken, verifyPasswordSync } = require('../db/index');

// 注册/改密的字段规矩。为什么要在后端再判一遍：现量直连 POST /api/auth/register
// 传 phone:"a"、password:"1" 照样能建出账号——只有登录页在拦，页面形同虚设。
// 判据照着 app/src/pages/LoginPage.tsx 写，且刻意「不严于页面」：
// 手机号只要求 11 位纯数字，不上 /^1[3-9]\d{9}$/ 的号段判据；页面是 length !== 11，
// 这里多出的「必须是数字」不会拦住任何一个真实手机号，但能挡住随手写的字符串。
// 昵称反过来故意留松（空串不报错，DB 默认 ''）：它不是凭据，从严只会把
// 非页面的建号调用（脚本、后台）撞死，没有收益。上限按库里的列宽来：
// auth_users.phone varchar(20)、nickname varchar(100)，现量见 information_schema。
const PHONE_RE = /^\d{11}$/;
const MIN_PASSWORD_LEN = 6;
// bcrypt 只吃 72 字节，超过会被静默截断——用户以为密码是 A，实际能登录的是前 72 字节。
// 与其静默截断，不如明确报错；null 字节同样会让 bcrypt.compareSync 抛异常。
const MAX_PASSWORD_BYTES = 72;
const MAX_NICKNAME_CHARS = 100;

// 三处判据共用一把尺子，免得注册放开、改密漏掉
function checkPasswordStrength(password, fieldLabel) {
  if (typeof password !== 'string' || password.length === 0) {
    return { success: false, message: `缺少${fieldLabel}` };
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return { success: false, message: `${fieldLabel}至少6位` };
  }
  if (password.includes('\0')) {
    return { success: false, message: `${fieldLabel}包含不支持的字符` };
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return { success: false, message: `${fieldLabel}过长，最多72字节` };
  }
  return null;
}

function checkCredentials(phone, password) {
  if (typeof phone !== 'string' || !PHONE_RE.test(phone)) {
    return { success: false, message: '手机号格式不正确，请输入11位数字手机号' };
  }
  return checkPasswordStrength(password, '密码');
}

// 归一化：去掉首尾空白，并按列宽截断，超长直接落库会报 character varying(100) 截断错误
function normalizeNickname(nickname) {
  if (typeof nickname !== 'string') return '';
  const trimmed = nickname.trim();
  if (trimmed.length === 0) return '';
  return trimmed.length > MAX_NICKNAME_CHARS ? trimmed.slice(0, MAX_NICKNAME_CHARS) : trimmed;
}

async function register(phone, password, nickname) {
  if (!phone || !password) {
    return { success: false, message: '缺少手机号或密码' };
  }
  const credentialError = checkCredentials(phone, password);
  if (credentialError) return credentialError;
  const normalizedNickname = normalizeNickname(nickname);
  const userId = await authDb.createAuthUser(phone, password, normalizedNickname);
  const token = generateToken(userId);
  return { success: true, token, user: { id: userId, phone, nickname: normalizedNickname } };
}

async function login(phone, password) {
  const user = await authDb.verifyAuthUser(phone, password);
  if (!user) {
    return { success: false, message: '手机号或密码错误' };
  }
  const token = generateToken(user.id);
  return { success: true, token, user };
}

async function getCurrentUser(token) {
  if (!token) return null;
  const userId = verifyToken(token);
  if (!userId) return null;
  return await authDb.getAuthUserById(userId);
}

async function changePassword(userId, oldPassword, newPassword) {
  if (!userId || !oldPassword || !newPassword) {
    return { success: false, message: '参数不完整' };
  }
  // 原密码不参与建哈希，只要类型门；新密码走和注册同一把尺子（至少 6 位 / 不超 72 字节 / 无 null 字节）
  if (typeof oldPassword !== 'string') {
    return { success: false, message: '参数不完整' };
  }
  const newPasswordError = checkPasswordStrength(newPassword, '新密码');
  if (newPasswordError) return newPasswordError;
  const user = await authDb.getAuthUserByIdWithPassword(userId);
  if (!user) {
    return { success: false, message: '用户不存在' };
  }
  if (!verifyPasswordSync(oldPassword, user.password)) {
    return { success: false, message: '原密码错误' };
  }
  await authDb.updateAuthUserPassword(userId, newPassword);
  return { success: true, message: '密码修改成功' };
}

module.exports = {
  register,
  login,
  getCurrentUser,
  changePassword
};