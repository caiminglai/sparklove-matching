const vectorDb = require('../db/vector');
const userDb = require('../db/users');

const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'openai';
const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || '';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-ada-002';

function buildProfileText(userData) {
  // 支持 userData.data.xxx 和 userData.xxx 两种结构
  const d = userData.data || userData;
  const parts = [];
  if (d.gender) parts.push(`性别：${d.gender}`);
  if (d.age) parts.push(`年龄：${d.age}岁`);
  if (d.height) parts.push(`身高：${d.height}cm`);
  if (d.weight) parts.push(`体重：${d.weight}kg`);
  if (d.skinTone || d.skin_tone) parts.push(`肤色：${d.skinTone || d.skin_tone}`);
  if (d.zodiac) parts.push(`星座：${d.zodiac}`);
  if (d.bloodType || d.blood_type) parts.push(`血型：${d.bloodType || d.blood_type}`);
  if (d.city) parts.push(`所在城市：${d.city}`);
  if (d.marriage) parts.push(`婚姻状况：${d.marriage}`);
  if (d.education) parts.push(`学历：${d.education}`);
  if (d.job) parts.push(`职业：${d.job}`);
  if (d.income) parts.push(`收入：${d.income}`);
  if (d.hobbies) parts.push(`兴趣爱好：${d.hobbies}`);
  if (d.personality) parts.push(`性格特点：${d.personality}`);
  if (d.purpose) parts.push(`交友目的：${d.purpose}`);
  return parts.join('；');
}

function buildExpectationText(userData) {
  const d = userData.data || userData;
  const parts = [];
  if (d.expectation) parts.push(d.expectation);
  if (d.interestTags || d.interest_tags) parts.push(`兴趣标签：${d.interestTags || d.interest_tags}`);
  return parts.join('；');
}

async function generateEmbedding(text) {
  if (!text || !text.trim()) return null;

  if (EMBEDDING_PROVIDER === 'mock') {
    return generateMockEmbedding(text);
  }

  if (!EMBEDDING_API_KEY) {
    throw new Error('未配置 EMBEDDING_API_KEY，请设置环境变量或使用 mock 模式');
  }

  const url = EMBEDDING_PROVIDER === 'openai'
    ? 'https://api.openai.com/v1/embeddings'
    : process.env.EMBEDDING_API_URL || 'https://api.openai.com/v1/embeddings';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${EMBEDDING_API_KEY}`
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`向量生成失败: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

function generateMockEmbedding(text) {
  const dim = vectorDb.VECTOR_DIMENSION;
  const vector = new Array(dim);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  for (let i = 0; i < dim; i++) {
    const seed = (hash * (i + 1)) % 10000 / 10000;
    vector[i] = seed * 2 - 1;
  }
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  return vector.map(v => v / norm);
}

async function generateAndStoreUserVector(userId) {
  const user = await userDb.getUserById(userId);
  if (!user) {
    throw new Error('用户不存在');
  }

  const profileText = buildProfileText(user);
  const expectationText = buildExpectationText(user);

  const [profileVector, expectationVector] = await Promise.all([
    generateEmbedding(profileText),
    generateEmbedding(expectationText)
  ]);

  const profileVecStr = profileVector ? `[${profileVector.join(',')}]` : null;
  const expectationVecStr = expectationVector ? `[${expectationVector.join(',')}]` : null;

  await vectorDb.upsertUserVector(
    userId,
    profileVecStr,
    expectationVecStr,
    profileText,
    expectationText,
    EMBEDDING_MODEL
  );

  return { profileText, expectationText };
}

async function findSimilarUsers(userId, type = 'profile', limit = 10) {
  let userVector = await vectorDb.getUserVector(userId);
  if (!userVector) {
    await generateAndStoreUserVector(userId);
    userVector = await vectorDb.getUserVector(userId);
  }

  if (!userVector) {
    return [];
  }

  const vector = type === 'profile'
    ? userVector.profile_vector
    : userVector.expectation_vector;

  if (!vector) {
    return [];
  }

  const results = type === 'profile'
    ? await vectorDb.findSimilarUsersByProfile(vector, limit, userId)
    : await vectorDb.findSimilarUsersByExpectation(vector, limit, userId);

  const users = [];
  for (const r of results) {
    const user = await userDb.getUserById(r.user_id);
    const merged = {
      ...user,
      similarity: r.similarity
    };
    if (merged.id) users.push(merged);
  }
  return users;
}

async function findMutualMatches(userId, limit = 10) {
  let userVector = await vectorDb.getUserVector(userId);
  if (!userVector) {
    await generateAndStoreUserVector(userId);
    userVector = await vectorDb.getUserVector(userId);
  }

  if (!userVector) {
    return [];
  }

  const results = await vectorDb.findMutualMatchUsers(userId, limit);
  const users = [];
  for (const r of results) {
    const user = await userDb.getUserById(r.user_id);
    const merged = {
      ...user,
      profile_match_score: r.profile_match_score,
      expectation_match_score: r.expectation_match_score,
      mutual_score: r.mutual_score
    };
    if (merged.id) users.push(merged);
  }
  return users;
}

async function batchGenerateVectors(limit = 100) {
  const users = await userDb.getAllUsers(1, limit);
  const results = [];

  for (const user of users) {
    try {
      await generateAndStoreUserVector(user.id);
      results.push({ userId: user.id, success: true });
    } catch (e) {
      results.push({ userId: user.id, success: false, error: e.message });
    }
  }

  return results;
}

async function getStats() {
  return await vectorDb.getVectorStats();
}

module.exports = {
  buildProfileText,
  buildExpectationText,
  generateEmbedding,
  generateAndStoreUserVector,
  findSimilarUsers,
  findMutualMatches,
  batchGenerateVectors,
  getStats
};
