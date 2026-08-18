const { getDb } = require('./index');

const VECTOR_DIMENSION = 1536;

function initVectorTables() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_vectors (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL UNIQUE,
      profile_vector vector(${VECTOR_DIMENSION}),
      expectation_vector vector(${VECTOR_DIMENSION}),
      profile_text TEXT,
      expectation_text TEXT,
      model VARCHAR(100) DEFAULT 'text-embedding-ada-002',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_vectors_profile ON user_vectors USING hnsw (profile_vector vector_cosine_ops);
    CREATE INDEX IF NOT EXISTS idx_user_vectors_expectation ON user_vectors USING hnsw (expectation_vector vector_cosine_ops);
  `);

  db.exec(`
    COMMENT ON TABLE user_vectors IS '用户画像向量表';
    COMMENT ON COLUMN user_vectors.user_id IS '用户ID';
    COMMENT ON COLUMN user_vectors.profile_vector IS '用户资料向量';
    COMMENT ON COLUMN user_vectors.expectation_vector IS '用户择偶要求向量';
    COMMENT ON COLUMN user_vectors.profile_text IS '用于生成向量的用户资料文本';
    COMMENT ON COLUMN user_vectors.expectation_text IS '用于生成向量的择偶要求文本';
    COMMENT ON COLUMN user_vectors.model IS '向量模型名称';
    COMMENT ON COLUMN user_vectors.created_at IS '创建时间';
    COMMENT ON COLUMN user_vectors.updated_at IS '更新时间';
  `);
}

function upsertUserVector(userId, profileVector, expectationVector, profileText, expectationText, model) {
  const db = getDb();
  const now = Date.now();
  // 修复：原 SELECT-then-INSERT/UPDATE 在并发下两个 upsert 都查不到都会 INSERT，
  // 第二个因 UNIQUE(user_id) 失败抛错。改用 ON CONFLICT DO UPDATE 原子完成。
  db.prepare(`
    INSERT INTO user_vectors (user_id, profile_vector, expectation_vector, profile_text, expectation_text, model, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
    ON CONFLICT (user_id) DO UPDATE SET
      profile_vector = EXCLUDED.profile_vector,
      expectation_vector = EXCLUDED.expectation_vector,
      profile_text = EXCLUDED.profile_text,
      expectation_text = EXCLUDED.expectation_text,
      model = EXCLUDED.model,
      updated_at = EXCLUDED.updated_at
  `).run(userId, profileVector, expectationVector, profileText, expectationText, model, now);
}

function findSimilarUsersByProfile(vector, limit = 10, excludeUserId = null) {
  const db = getDb();
  if (excludeUserId) {
    return db.prepare(`
      SELECT uv.user_id, 1 - (uv.profile_vector <=> $1) as similarity
      FROM user_vectors uv
      WHERE uv.user_id != $2
      ORDER BY uv.profile_vector <=> $1
      LIMIT $3
    `).all(vector, excludeUserId, limit);
  }
  return db.prepare(`
    SELECT uv.user_id, 1 - (uv.profile_vector <=> $1) as similarity
    FROM user_vectors uv
    ORDER BY uv.profile_vector <=> $1
    LIMIT $2
  `).all(vector, limit);
}

function findSimilarUsersByExpectation(vector, limit = 10, excludeUserId = null) {
  const db = getDb();
  if (excludeUserId) {
    return db.prepare(`
      SELECT uv.user_id, 1 - (uv.expectation_vector <=> $1) as similarity
      FROM user_vectors uv
      WHERE uv.user_id != $2
      ORDER BY uv.expectation_vector <=> $1
      LIMIT $3
    `).all(vector, excludeUserId, limit);
  }
  return db.prepare(`
    SELECT uv.user_id, 1 - (uv.expectation_vector <=> $1) as similarity
    FROM user_vectors uv
    ORDER BY uv.expectation_vector <=> $1
    LIMIT $2
  `).all(vector, limit);
}

function findMutualMatchUsers(userId, limit = 10) {
  const db = getDb();
  return db.prepare(`
    SELECT
      uv.user_id,
      (1 - (uv.profile_vector <=> (SELECT expectation_vector FROM user_vectors WHERE user_id = $1))) as profile_match_score,
      (1 - (uv.expectation_vector <=> (SELECT profile_vector FROM user_vectors WHERE user_id = $1))) as expectation_match_score,
      ((1 - (uv.profile_vector <=> (SELECT expectation_vector FROM user_vectors WHERE user_id = $1))) +
       (1 - (uv.expectation_vector <=> (SELECT profile_vector FROM user_vectors WHERE user_id = $1)))) / 2 as mutual_score
    FROM user_vectors uv
    WHERE uv.user_id != $1
    ORDER BY mutual_score DESC
    LIMIT $2
  `).all(userId, limit);
}

function getUserVector(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM user_vectors WHERE user_id = $1').get(userId);
}

function deleteUserVector(userId) {
  const db = getDb();
  db.prepare('DELETE FROM user_vectors WHERE user_id = $1').run(userId);
}

function getVectorStats() {
  const db = getDb();
  const result = db.prepare(`
    SELECT
      COUNT(*) as total_vectors,
      COUNT(DISTINCT user_id) as total_users,
      MIN(created_at) as earliest,
      MAX(updated_at) as latest
    FROM user_vectors
  `).get();
  return {
    total_vectors: parseInt(result.total_vectors) || 0,
    total_users: parseInt(result.total_users) || 0,
    earliest: result.earliest,
    latest: result.latest
  };
}

module.exports = {
  VECTOR_DIMENSION,
  initVectorTables,
  upsertUserVector,
  findSimilarUsersByProfile,
  findSimilarUsersByExpectation,
  findMutualMatchUsers,
  getUserVector,
  deleteUserVector,
  getVectorStats
};
