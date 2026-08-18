// ============================================================
// API 路由层 - 管理员自定义筛选字段
// ============================================================

const adminDb = require('../db/admin.js');

// 统一 JSON 响应工具（从 utils 抽取，避免 9 个 route 文件重复定义）
const { sendJson } = require('../utils/sendJson');

// GET /api/custom-fields
function getCustomFilters(req, res) {
  try {
    const fields = adminDb.getAllCustomFilters();
    const parsed = fields.map(f => ({
      ...f,
      options: f.field_options ? f.field_options.split(',').filter(o => o.trim()) : []
    }));
    sendJson(res, 200, { success: true, data: parsed });
  } catch (err) {
    sendJson(res, 500, { success: false, message: err.message });
  }
}

// POST /api/admin/custom-fields
function addCustomFilter(req, res, readBodyWithLimit, checkAdminAuth) {
  if (!checkAdminAuth(req)) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  readBodyWithLimit(req).then(body => {
    try {
      const data = JSON.parse(body);
      if (!data.field_key || !data.field_label) {
        sendJson(res, 400, { success: false, message: '字段名和显示名必填' }); return;
      }
      let fieldOptions = '';
      if (Array.isArray(data.field_options)) fieldOptions = data.field_options.join(',');
      else if (typeof data.field_options === 'string') fieldOptions = data.field_options;
      const field = adminDb.addCustomFilter(
        data.field_key.trim(), data.field_label.trim(),
        data.field_type || 'text', data.description || '', fieldOptions
      );
      sendJson(res, 200, { success: true, data: field });
    } catch (err) {
      sendJson(res, 500, { success: false, message: err.message });
    }
  }).catch(e => {
    sendJson(res, 400, { success: false, message: e.message });
  });
}

// DELETE /api/admin/custom-fields/:id
function deleteCustomFilter(req, res, checkAdminAuth, pathname) {
  if (!checkAdminAuth(req)) {
    sendJson(res, 401, { success: false, message: '需要管理员权限' }); return;
  }
  const parts = pathname.split('/');
  const id = parseInt(parts[parts.length - 1]);
  if (!id) {
    sendJson(res, 400, { success: false, message: '无效的 ID' }); return;
  }
  const deleted = adminDb.deleteCustomFilter(id);
  sendJson(res, 200, { success: deleted, message: deleted ? '删除成功' : '未找到' });
}

module.exports = { getCustomFilters, addCustomFilter, deleteCustomFilter };
