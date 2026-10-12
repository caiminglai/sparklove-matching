// ============================================================
// 数据访问层 - 用户互相评分（user_ratings 表）
// 导出 addRating / getRatingsForUser / getAverageRating / checkUserRated
// addRating 用 ON CONFLICT(rater_id, rated_id) DO NOTHING 并回「是否真的插入了一行」：
//   产品口径是 services/ratings.service.js 的「每人只能评价一次」，不是覆盖旧分。
//   以前这里是 DO UPDATE（注释写着"重复打分直接覆盖旧分"），和 service 层那句拒绝重复评价
//   互相矛盾——正常走接口永远碰不到 DO UPDATE，只有并发两条请求同时越过 service 的
//   checkUserRated 时才会命中，那一刻旧分被悄悄覆盖、还回用户"评价成功"。
//   现在冲突就是不写、回 false，由 service 层把它翻译成「您已经评价过该用户」。
// getAverageRating 没人评过的时候回 {avg:0, count:0} 而不是 null，前端可以直接显示 0 分，但"0 分"和"还没人评"是两种状态，要区分得看 count
// ============================================================

const { getDb } = require('./index');

async function addRating(raterId, ratedId, rating, comment) {
  const database = getDb();
  const createdAt = Date.now();
  const stmt = database.prepare(
    'INSERT INTO user_ratings (rater_id, rated_id, rating, comment, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT(rater_id, rated_id) DO NOTHING'
  );
  const info = await stmt.run(raterId, ratedId, rating, comment || '', createdAt);
  return info.changes === 1;
}

async function getRatingsForUser(ratedId) {
  const database = getDb();
  const stmt = database.prepare(
    'SELECT r.*, u.name as rater_name FROM user_ratings r LEFT JOIN users u ON r.rater_id = u.id WHERE r.rated_id = $1 ORDER BY r.created_at DESC'
  );
  return await stmt.all(ratedId);
}

async function getAverageRating(ratedId) {
  const database = getDb();
  const stmt = database.prepare(
    'SELECT AVG(rating) as avg, COUNT(*) as count FROM user_ratings WHERE rated_id = $1'
  );
  const result = await stmt.get(ratedId);
  return { avg: parseFloat(result.avg) || 0, count: parseInt(result.count) || 0 };
}

async function checkUserRated(raterId, ratedId) {
  const database = getDb();
  const stmt = database.prepare('SELECT id FROM user_ratings WHERE rater_id = $1 AND rated_id = $2 LIMIT 1');
  return await stmt.get(raterId, ratedId);
}

module.exports = {
  addRating,
  getRatingsForUser,
  getAverageRating,
  checkUserRated
};