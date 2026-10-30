// ============================================================
// 中间件 - multipart 上传（multer）
//
// 替掉的是两份手搓解析器：utils/multipart.js 的 parseMultipart，
// 以及 routes/upload.js 里另写一遍、按 boundary 切 Buffer 的那一段
// （同站两处同名逻辑、实现不一样，边界处理和 \r\n 的裁法都不完全一致——
//   multer 一条路走到底，这种"两份各缺一块"的账就没有了）。
//
// 内存存储：本站每条上传都是"先验魔术数字再落盘"，验不过就一行都不写，
// 所以必须整段拿到 Buffer（站3 的 middleware/upload.js 同一口径）。
//
// 一律用 any()，不用 single('字段名')。这不是省事，是为了保住旧语义：
// 旧解析器把所有 part 都收进 fields/files 两张表，路由只按自己的字段名去取，
// **叫别的名那段文件直接被忽略**，请求照常处理。而 multer 的 single('avatar')
// 会在遇到非 avatar 文件名的那一段时抛 LIMIT_UNEXPECTED_FILE、整条请求报错。
// 换成 any() 之后 req.files 是个数组，各路由自己挑 fieldname 对得上的那一段，
// 和旧写法一样"多给的文件名不当回事"。
//
// 不做 fileFilter：历史上非法扩展名的文件是"跳过这张、接着看下一张"，
// 不是"整条请求报错"。用 fileFilter 拒绝会让 multer 直接断流，语义就变了。
// 扩展名与魔术数字、单张大小的校验留在路由里，逐条对着旧响应写。
// ============================================================

const multer = require('multer');
const { MAX_BODY_SIZE, MAX_UPLOAD_SIZE } = require('../config');
const { isMultipart } = require('./body');

const storage = multer.memoryStorage();

/**
 * @param {Object} options
 * @param {number} [options.maxBytes] 单个文件上限，默认 MAX_UPLOAD_SIZE
 * @param {string} [options.invalidFormat] 缺 boundary 时的提示语（各入口历史措辞不同）
 * @param {{status:number, message:string}} [options.tooLarge] 超限时要回的那一口（同样是各入口自己的历史措辞）
 */
function multipartUpload(options = {}) {
  const maxBytes = options.maxBytes || MAX_UPLOAD_SIZE;
  const invalidFormat = options.invalidFormat || '无效的上传格式';
  const tooLarge = options.tooLarge || { status: 413, message: '文件过大，最大允许5MB' };

  const uploader = multer({
    storage,
    limits: {
      // 只限单文件；busboy 认的键名是 files/fields/parts（没有 fileCount，写错会被静默忽略——
      // 这里现量过 node_modules/busboy/lib/types/multipart.js 的 limits 读取处）
      fileSize: maxBytes,
      // 旧解析器对 part 数量没有任何上限，一条带几千个 part 的请求就能把内存吃满。
      // 这两条是补的防御，正常表单（一两张图 + 五六个字段）碰不到边。
      files: 10,
      fields: 50,
    },
  });

  return function multipartUploadMiddleware(req, res, next) {
    // 非 multipart 的请求原样放行：这几条路由同时接 JSON，走的是 body 解析那条路
    if (!isMultipart(req)) return next();

    const contentType = String(req.headers['content-type'] || '');
    if (!contentType.includes('boundary=')) {
      res.status(400).json({ success: false, message: invalidFormat });
      return;
    }

    uploader.any()(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(tooLarge.status).json({ success: false, message: tooLarge.message });
          return;
        }
        // 其余（畸形 boundary、流中途断掉）在旧写法里都落进"读取请求体失败"那一句
        if (/boundary|malphanumeric|Unexpected end|aborted/i.test(String(err.message || ''))) {
          res.status(500).json({ success: false, message: '读取请求体失败' });
          return;
        }
        next(err);
        return;
      }

      // 整条请求体的上限也要复检：旧写法是 collectBody 数"收到的总字节"，
      // multer 的 fileSize 只数单张。三张 4MB 的图（举报允许多张）在旧写法里是一条 500，
      // 只配 fileSize 就会变成一条被接受的 12MB 请求。
      // 这里按"所有文件段 + 所有文本段"求和，比旧口径少算了 boundary 与 part 头那几十字节，
      // 判据方向一致，不会因为这几字节把正常请求挡掉。
      const files = Array.isArray(req.files) ? req.files : [];
      const totalBytes =
        files.reduce((sum, f) => sum + (f.buffer ? f.buffer.length : 0), 0) +
        Buffer.byteLength(new URLSearchParams(req.body || {}).toString());
      if (totalBytes > maxBytes) {
        res.status(tooLarge.status).json({ success: false, message: tooLarge.message });
        return;
      }

      next();
    });
  };
}

/** 取表单里某个字段名对应的那一段文件；没有就回 null（旧写法是 files.<字段名>） */
function fileField(req, name) {
  const files = Array.isArray(req.files) ? req.files : [];
  return files.find((f) => f.fieldname === name) || null;
}

/**
 * multipart 表单字段的取值口径。
 * 旧手搓解析器对每个字段值做了 .trim()（utils/multipart.js 里那句
 * data.toString('utf-8').trim()），multer 不裁。浏览器 FormData 本来不会在值里
 * 前后塞空白，所以这条大多数时候是空转；但手工构造的请求（或粘贴带换行的文本框）
 * 就能让「同一个字段，改前存 '西安'、改后存 '西安\n'」——那是契约漂移，不是修 bug。
 * 统一走这里，字符串裁边，非字符串原样。
 */
function formFields(req) {
  const out = {};
  for (const [key, value] of Object.entries(req.body || {})) {
    out[key] = typeof value === 'string' ? value.trim() : value;
  }
  return out;
}

/** 头像：只认 fieldname=avatar 那一段 */
const avatarUpload = multipartUpload({
  maxBytes: MAX_UPLOAD_SIZE,
  invalidFormat: '无效的上传格式',
  tooLarge: {
    status: 413,
    message: `文件过大，最大允许${Math.round(MAX_UPLOAD_SIZE / 1024 / 1024)}MB`,
  },
});

/** 认证费凭证：只认 fieldname=proof 那一段 */
const depositProofUpload = multipartUpload({
  maxBytes: MAX_UPLOAD_SIZE,
  invalidFormat: '无效的上传格式',
  tooLarge: {
    status: 413,
    message: `文件过大，最大允许${Math.round(MAX_UPLOAD_SIZE / 1024 / 1024)}MB`,
  },
});

/** 举报：字段名不限，取第一张合法图；历史措辞是「无效的表单数据」＋超限回 500 */
const reportUpload = multipartUpload({
  maxBytes: MAX_BODY_SIZE,
  invalidFormat: '无效的表单数据',
  tooLarge: { status: 500, message: '读取请求体失败' },
});

/** 解锁凭证：同举报的额度口径（整条请求体按 MAX_BODY_SIZE 计），措辞是「无效的上传格式」 */
const unlockProofUpload = multipartUpload({
  maxBytes: MAX_BODY_SIZE,
  invalidFormat: '无效的上传格式',
  tooLarge: { status: 500, message: '读取请求体失败' },
});

/** 后台编辑资料：只认 avatar 字段，超限历史上是 collectBody 报的「请求体过大」413 */
const editAvatarUpload = multipartUpload({
  maxBytes: 5 * 1024 * 1024,
  invalidFormat: '无效的表单数据',
  tooLarge: { status: 413, message: '请求体过大' },
});

module.exports = {
  multipartUpload,
  fileField,
  formFields,
  avatarUpload,
  depositProofUpload,
  reportUpload,
  unlockProofUpload,
  editAvatarUpload,
};
