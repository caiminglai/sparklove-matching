// 全局常量配置（从环境变量读取，带默认值）
// 避免各 route 文件硬编码请求体大小、分页等魔法数字

// 请求体大小上限（字节）
const MAX_BODY_SIZE = parseInt(process.env.MAX_BODY_SIZE) || 5 * 1024 * 1024; // 默认 5MB

// 上传文件大小上限（字节）
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE) || 5 * 1024 * 1024; // 默认 5MB

// 向量批量接口请求体上限（字节，向量数据较大）
const MAX_VECTOR_BODY = parseInt(process.env.MAX_VECTOR_BODY) || 10 * 1024 * 1024; // 默认 10MB

// 分页默认大小
const DEFAULT_PAGE_SIZE = parseInt(process.env.DEFAULT_PAGE_SIZE) || 100;

module.exports = {
  MAX_BODY_SIZE,
  MAX_UPLOAD_SIZE,
  MAX_VECTOR_BODY,
  DEFAULT_PAGE_SIZE,
};
