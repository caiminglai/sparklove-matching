// ============================================================
// 工具 - 上传文件的磁盘侧收尾
// 库里存的凭证/头像都是 /uploads/<子目录>/<文件名> 这种公开路径，
// 而 /uploads/* 匿名可下（server.js 静态分支），所以删记录必须同时删文件，
// 否则被删账号的付款截图、举报证据图会永久留在盘上还能被猜到 URL 拖走。
// ============================================================

const fs = require('fs');
const path = require('path');

const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', 'uploads');
const PUBLIC_PREFIX = 'uploads/';

// 随机后缀命名：只带时间戳的名字可以枚举（contact_<用户id>_<毫秒>.jpg，改几个数字就是别人的凭证图），
// 口径与 routes/upload.js 存款凭证的 userId_timestamp_random 保持一致。
function buildUploadName(prefix, ext) {
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${Date.now()}_${randomStr}${ext}`;
}

// 公开路径 → 容器内绝对路径；不在 uploads 根下的一律拒绝（返回 null）
// 前导斜杠按可选处理：活库 contact_unlocks 实测有 3 行（id 4/7/9）存的是 uploads/contact-unlock/xxx.jpg
function toDiskPath(publicPath) {
  const value = String(publicPath || '').trim().replace(/^\//, '');
  if (!value.startsWith(PUBLIC_PREFIX)) return null;
  const resolved = path.resolve(UPLOADS_ROOT, value.slice(PUBLIC_PREFIX.length));
  if (resolved === UPLOADS_ROOT || !resolved.startsWith(UPLOADS_ROOT + path.sep)) return null;
  return resolved;
}

// 返回 true 仅表示盘上真删掉了一个文件。
// 删文件失败不抛错：数据库那步已经提交，不该因为一张图没删掉而让后台显示"删除失败"、
// 让管理员对着一条已消失的记录反复点。
function deleteUploadedFile(publicPath) {
  const diskPath = toDiskPath(publicPath);
  if (!diskPath) return false;
  // 必须先确认文件在：force 删除会把「什么都没删掉」报成成功，
  // 管理员看到"已删除"而凭证图还在盘上，正是这条修复要堵的失败模式
  if (!fs.existsSync(diskPath)) return false;
  try {
    fs.unlinkSync(diskPath);
    return true;
  } catch {
    return false;
  }
}

module.exports = { buildUploadName, deleteUploadedFile };
