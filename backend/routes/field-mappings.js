// ============================================================
// 路由 - 字段中文映射表（前端动态获取字段定义，支持 ETag 协商缓存）
//
// 这两条原来内联在 server.js（旧 L483-512）。它们是唯一自带协商缓存的 JSON 接口，
// 版本串由库里算（field_mappings 的 updated_at 聚合），不是内容哈希，
// 所以前端改一次资料、下一次拉取就会 MISS 掉旧 ETag。
//
// ⚠ 304 那条响应历史上不带 Content-Type，所以这里用 status(304).end()；
//   200 的 ETag 必须逐字是 getCacheVersion() 的返回值——Express 自己那套
//   res.etag 生成规则（W/ 弱哈希）与它不同形，别让框架插手。
// ============================================================

const express = require('express');
const fieldMappingsDb = require('../db/field-mappings.js');

const router = express.Router({ strict: true }); // strict：尾斜杠不当同一条，理由见 routes/index.js 头部

const JSON_TYPE = 'application/json; charset=utf-8';

async function serveWithETag(req, res, load) {
  try {
    const version = await fieldMappingsDb.getCacheVersion();
    if (req.headers['if-none-match'] === version) {
      res.status(304).end();
      return;
    }
    const data = await load();
    res.status(200).set({ 'Content-Type': JSON_TYPE, ETag: version }).json({ success: true, data });
  } catch (err) {
    res.status(500).set('Content-Type', JSON_TYPE).json({ success: false, message: err.message });
  }
}

router.get('/api/field-mappings', (req, res) =>
  serveWithETag(req, res, () => fieldMappingsDb.getAllFieldMappings()),
);

router.get('/api/field-mappings/labels', (req, res) =>
  serveWithETag(req, res, () => fieldMappingsDb.getFieldLabelMap()),
);

module.exports = { fieldMappingsRouter: router };
