const { getDb } = require('./index');

async function addRating(raterId, ratedId, rating, comment) {
  const database = getDb();
  const createdAt = Date.now();
  const stmt = database.prepare(
    'INSERT INTO user_ratings (rater_id, rated_id, rating, comment, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT(rater_id, rated_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = EXCLUDED.created_at'
  );
  await stmt.run(raterId, ratedId, rating, comment || '', createdAt);
  return true;
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