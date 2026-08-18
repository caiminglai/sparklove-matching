// ============================================================
// API 路由层 - 用户自定义字段（EAV 键值表）
// ============================================================

const dbIndex = require('../db/index.js');
const userDb = require('../db/users.js');

// 统一 JSON 响应工具（从 utils 抽取，避免 9 个 route 文件重复定义）
const { sendJson } = require('../utils/sendJson');

// 处理 /api/users/custom-fields 和 /api/users/custom-fields/:key
function handleUserCustomFields(req, res, readBodyWithLimit, pathname) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendJson(res, 401, { success: false, message: '请先登录' }); return;
  }
  const token = authHeader.slice(7);
  const userId = dbIndex.verifyToken(token);
  if (!userId) {
    sendJson(res, 401, { success: false, message: 'token无效' }); return;
  }

  if (req.method === 'GET' && pathname === '/api/users/custom-fields') {
    const fields = userDb.getUserCustomFields(userId);
    sendJson(res, 200, { success: true, data: fields }); return;
  }

  if (req.method === 'POST' && pathname === '/api/users/custom-fields') {
    readBodyWithLimit(req).then(body => {
      try {
        const data = JSON.parse(body);
        if (!data.field_key || data.field_value === undefined || data.field_value === null) {
          sendJson(res, 400, { success: false, message: '字段名和字段值必填' }); return;
        }
        const result = userDb.setUserCustomField(userId, data.field_key, data.field_value);
        sendJson(res, 200, { success: true, data: result });
      } catch (err) {
        sendJson(res, 500, { success: false, message: err.message });
      }
    }).catch(e => {
      sendJson(res, 400, { success: false, message: e.message });
    });
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/users\/custom-fields\/[^\/]+$/.test(pathname)) {
    const fieldKey = decodeURIComponent(pathname.split('/').pop());
    const deleted = userDb.deleteUserCustomField(userId, fieldKey);
    sendJson(res, 200, { success: deleted, message: deleted ? '删除成功' : '未找到' }); return;
  }

  // 不支持的 HTTP 方法返回 405，避免请求挂起
  sendJson(res, 405, { success: false, message: '不支持的请求方法' });
}

module.exports = { handleUserCustomFields };
