// ============================================================
// 工具 - 上传文件的格式校验
//
// 这里只留"这块内容是不是它声称的那种图片"的判据。
// 原来同名的 utils/multipart.js 还带着两样东西：一个手搓的 boundary 解析器
// （已由 multer 取代，见 middleware/upload.js）和一个 collectBody 读流函数
// （已由 body 解析与 multer 取代）。解析器删掉之后，这个文件的名字就该说实话了。
// ============================================================

const path = require('path');

const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

// 文件签名（魔术数字）。只看扩展名等于允许任何人把 .php/.html 改名成 .png 传上来，
// 而 /uploads/* 是匿名可下的目录。
const MAGIC_NUMBERS = {
  '.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  '.jpg': Buffer.from([0xff, 0xd8, 0xff]),
  '.jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  '.gif': Buffer.from([0x47, 0x49, 0x46]),
  '.webp': Buffer.from([0x52, 0x49, 0x46, 0x46]),
};

/**
 * 校验文件魔术数字（文件签名）
 * @param {Buffer} fileData 文件原始二进制数据
 * @param {string} ext 扩展名（含点号，如 '.png'）
 * @returns {boolean} 魔术数字是否匹配
 */
function validateMagicBytes(fileData, ext) {
  const normalizedExt = String(ext || '').toLowerCase();
  const expected = MAGIC_NUMBERS[normalizedExt];
  if (!expected) return false;
  if (!fileData || fileData.length < expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (fileData[i] !== expected[i]) return false;
  }
  return true;
}

/**
 * 校验扩展名是否允许
 * @param {string} filename 原始文件名
 * @returns {{ext: string, valid: boolean}}
 */
function validateExtension(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return { ext, valid: ALLOWED_IMAGE_EXTENSIONS.includes(ext) };
}

module.exports = { ALLOWED_IMAGE_EXTENSIONS, MAGIC_NUMBERS, validateMagicBytes, validateExtension };
