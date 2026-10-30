// ============================================================
// 工具 - 按 URLSearchParams 口径读单个查询参数
//
// 为什么不用 req.query：本站的 query parser 设成了 'simple'（querystring），
// 和旧 server.js 的 url.parse(req.url, true) 逐字等价——重复键会变成数组。
// 但旧写法里有几条接口读参数走的是 new URL(...).searchParams.get(...)，
// 那个口径是「只取第一个值」。同一句 ?limit=5&limit=9 两条路读出来的东西不一样，
// 所以这几个调用点必须继续用 searchParams，不能顺手换成 req.query。
// （涉及 /api/vector/similar 与 /api/vector/match 的 type、limit，以及 GET /api/reports 的 status）
// ============================================================

// base 只是给相对路径补一个协议，不参与结果；旧写法用的是 http://localhost
const BASE = 'http://inward.invalid';

/** 取该参数的第一个值；没带就回 null（与 URLSearchParams.get 一致） */
function searchParam(req, name) {
  return new URL(req.originalUrl, BASE).searchParams.get(name);
}

module.exports = { searchParam };
