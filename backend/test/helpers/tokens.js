// ============================================================
// 测试用的令牌工装
//
// 令牌是纯 HMAC（db/index.js 的 generateToken / verifyToken / verifyAdminToken），
// 造它和验它都不连库，所以本机与 CI 都能离线签出"格式与签名都真"的令牌。
//
// ⚠ 管理员令牌在这里签不出可用的一枚：admin.service.isAdminToken 过了 HMAC 之后
//   还要查 admin_settings 里的白名单（getAdminWhitelist → 走库）。所以本套测试一律
//   用「用户令牌」和「假令牌」去打管理员闸，钉的是"这道闸会不会放错人"，
//   不是"真管理员能不能通过"——后者由 126 条契约基线在带库的容器里覆盖。
// ============================================================

require('./env');

const db = require('../../db/index.js');

/** 普通用户令牌：verifyToken 能解出 userId；verifyAdminToken 会因 role!=='admin' 直接拒，不碰库 */
function userToken(userId = 'probe-user-0000000000') {
  return db.generateToken(userId, 'user');
}

/** 签名对不上的假令牌：HMAC 那一关就该被拒，压根不该去碰库 */
const FORGED_TOKEN = 'ZmFrZS10b2tlbjpub3Qtc2lnbmVk';

module.exports = { userToken, FORGED_TOKEN, db };
