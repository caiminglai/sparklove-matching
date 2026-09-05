const { getDb, encrypt, decrypt } = require('./index');

const ALL_FIELDS = [
  'id', 'user_id', 'deposit', 'created_at', 'name', 'gender', 'age', 'height', 'weight',
  'skin_tone', 'zodiac', 'blood_type', 'city', 'marriage', 'children', 'education', 'job',
  'income', 'house', 'car', 'face_type', 'eye_type', 'mouth_type', 'body_type',
  'hobbies', 'food', 'sport', 'music', 'smoke', 'drink', 'religion', 'pet',
  'personality', 'expectation', 'contact', 'interest_tags', 'purpose', 'extra_data',
  'avatar'
];

function jsonToDbRow(jsonRow) {
  const data = jsonRow.data || {};
  const extraData = {};
  for (const key of Object.keys(data)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase();
    if (!ALL_FIELDS.slice(4).includes(snakeKey)) {
      extraData[key] = data[key];
    }
  }
  return [
    jsonRow.id,
    jsonRow.user_id || null,
    jsonRow.deposit || 0,
    jsonRow.createdAt || Date.now(),
    data.name || '',
    data.gender || '',
    String(data.age || ''),
    String(data.height || ''),
    data.weight || '',
    data.skinTone || '',
    data.zodiac || '',
    data.bloodType || '',
    data.city || '',
    data.marriage || '',
    data.children || '',
    data.education || '',
    data.job || '',
    data.income || '',
    data.house || '',
    data.car || '',
    data.faceType || '',
    data.eyeType || '',
    data.mouthType || '',
    data.bodyType || '',
    data.hobbies || '',
    data.food || '',
    data.sport || '',
    data.music || '',
    data.smoke || '',
    data.drink || '',
    data.religion || '',
    data.pet || '',
    data.personality || '',
    data.expectation || '',
    encrypt(data.contact || ''),
    data.interestTags || '',
    data.purpose || '',
    JSON.stringify(extraData),
    data.avatar || ''
  ];
}

function dbRowToJson(row) {
  if (!row) return null;
  const statusVal = typeof row.status !== 'undefined' ? row.status : 'approved';
  let extraData = {};
  if (row.extra_data) {
    try { extraData = JSON.parse(row.extra_data); } catch { extraData = {}; }
  }
  return {
    id: row.id,
    user_id: row.user_id,
    deposit: row.deposit,
    createdAt: row.created_at,
    status: statusVal,
    data: {
      ...extraData,
      name: row.name,
      gender: row.gender,
      age: row.age,
      height: row.height,
      weight: row.weight,
      skinTone: row.skin_tone,
      zodiac: row.zodiac,
      bloodType: row.blood_type,
      city: row.city,
      marriage: row.marriage,
      children: row.children,
      education: row.education,
      job: row.job,
      income: row.income,
      house: row.house,
      car: row.car,
      faceType: row.face_type,
      eyeType: row.eye_type,
      mouthType: row.mouth_type,
      bodyType: row.body_type,
      hobbies: row.hobbies,
      food: row.food,
      sport: row.sport,
      music: row.music,
      smoke: row.smoke,
      drink: row.drink,
      religion: row.religion,
      pet: row.pet,
      personality: row.personality,
      expectation: row.expectation,
      contact: decrypt(row.contact),
      interestTags: row.interest_tags,
      purpose: row.purpose,
      avatar: row.avatar
    }
  };
}

function getAllUsers(page = 1, limit = 20) {
  const database = getDb();
  const offset = (page - 1) * limit;
  const stmt = database.prepare(
    `SELECT ${ALL_FIELDS.join(', ')}, status FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`
  );
  return stmt.all(limit, offset).map(dbRowToJson);
}

function getUserById(id) {
  const database = getDb();
  const stmt = database.prepare(
    `SELECT ${ALL_FIELDS.join(', ')}, status FROM users WHERE id = $1`
  );
  const row = stmt.get(id);
  return row ? dbRowToJson(row) : null;
}

function getUsersByUserId(userId) {
  const database = getDb();
  const stmt = database.prepare(
    `SELECT ${ALL_FIELDS.join(', ')}, status FROM users WHERE user_id = $1 ORDER BY created_at DESC`
  );
  return stmt.all(userId).map(dbRowToJson);
}

function addUser(jsonRow) {
  const database = getDb();
  const values = jsonToDbRow(jsonRow);
  const placeholders = ALL_FIELDS.map((_, i) => `$${i + 1}`).join(', ');
  const stmt = database.prepare(`INSERT INTO users (${ALL_FIELDS.join(', ')}) VALUES (${placeholders})`);
  stmt.run(...values);
  return jsonRow;
}

function updateUser(id, jsonRow) {
  const database = getDb();
  const values = jsonToDbRow({ ...jsonRow, id });
  const updateFields = ALL_FIELDS.slice(2).map((f, i) => f + ' = $' + (i + 1)).join(', ');
  const updateValues = values.slice(2);
  updateValues.push(id);
  const stmt = database.prepare(`UPDATE users SET ${updateFields} WHERE id = $${ALL_FIELDS.length - 1}`);
  stmt.run(...updateValues);
  return jsonRow;
}

function deleteUser(id, ownerUserId, isAdmin = false) {
  const database = getDb();
  const user = database.prepare('SELECT user_id FROM users WHERE id = $1').get(id);
  if (!user) return false;
  if (!isAdmin) {
    if (!user.user_id) return false;
    if (user.user_id !== ownerUserId) return false;
  }
  database.prepare('DELETE FROM user_ratings WHERE rater_id = $1 OR rated_id = $2').run(id, id);
  database.prepare('DELETE FROM user_reports WHERE reporter_id = $1 OR reported_id = $2').run(id, id);
  if (user.user_id) {
    database.prepare('DELETE FROM user_custom_fields WHERE user_id = $1').run(user.user_id);
  }
  const stmt = database.prepare('DELETE FROM users WHERE id = $1');
  stmt.run(id);
  return true;
}

function batchSaveUsers(jsonRows) {
  const database = getDb();
  const placeholders = ALL_FIELDS.map((_, i) => `$${i + 1}`).join(', ');
  const insertStmt = database.prepare(`INSERT INTO users (${ALL_FIELDS.join(', ')}) VALUES (${placeholders})`);
  const updateFields = ALL_FIELDS.slice(2).map((f, i) => f + ' = $' + (i + 1)).join(', ');
  const updateStmt = database.prepare(`UPDATE users SET ${updateFields} WHERE id = $${ALL_FIELDS.length - 1}`);

  const transaction = database.transaction(() => {
    for (const jsonRow of jsonRows) {
      if (jsonRow.id) {
        const existing = database.prepare('SELECT id FROM users WHERE id = $1').get(jsonRow.id);
        if (existing) {
          const values = jsonToDbRow({ ...jsonRow });
          const updateValues = values.slice(2);
          updateValues.push(jsonRow.id);
          updateStmt.run(...updateValues);
          continue;
        }
      }
      insertStmt.run(...jsonToDbRow(jsonRow));
    }
  });
  transaction();
}

function approveUser(id) {
  const database = getDb();
  const stmt = database.prepare('UPDATE users SET status = $1 WHERE id = $2');
  stmt.run('approved', id);
  return true;
}

function rejectUser(id) {
  const database = getDb();
  const stmt = database.prepare('UPDATE users SET status = $1 WHERE id = $2');
  stmt.run('rejected', id);
  return true;
}

function getPendingUsers() {
  const database = getDb();
  try {
    const stmt = database.prepare(
      `SELECT ${ALL_FIELDS.join(', ')}, status FROM users WHERE status = 'pending' ORDER BY created_at DESC`
    );
    return stmt.all().map(dbRowToJson);
  } catch (e) {
    return [];
  }
}

function searchUsers(criteria, page = 1, limit = 20) {
  const database = getDb();
  const conditions = [];
  const params = [];
  const isExact = criteria.exact === 'true' || criteria.exact === true;

  const addLikeOrExact = (field, value) => {
    if (!value) return;
    if (isExact) {
      conditions.push(`${field} = $${params.length + 1}`);
      params.push(value);
    } else {
      conditions.push(`${field} LIKE $${params.length + 1}`);
      params.push('%' + escapeLikeString(value) + '%');
    }
  };

  if (criteria.gender) {
    conditions.push(`gender = $${params.length + 1}`);
    params.push(criteria.gender);
  }
  addLikeOrExact('city', criteria.city);
  if (criteria.age_min) {
    conditions.push(`CAST(age AS INTEGER) >= $${params.length + 1}`);
    params.push(parseInt(criteria.age_min));
  }
  if (criteria.age_max) {
    conditions.push(`CAST(age AS INTEGER) <= $${params.length + 1}`);
    params.push(parseInt(criteria.age_max));
  }
  const contactFilter = criteria.contact || null;
  let keywordContactFilter = null;

  addLikeOrExact('education', criteria.education);
  addLikeOrExact('income', criteria.income);
  addLikeOrExact('name', criteria.name);
  if (criteria.keyword) {
    keywordContactFilter = criteria.keyword;
  }

  let customFieldUserIds = null;
  if (Array.isArray(criteria.custom_fields) && criteria.custom_fields.length > 0) {
    for (const cf of criteria.custom_fields) {
      if (!cf.field_key || !cf.field_value) continue;
      const matchedIds = searchUsersByCustomField(cf.field_key, cf.field_value, isExact);
      const idSet = new Set(matchedIds);
      if (customFieldUserIds === null) {
        customFieldUserIds = idSet;
      } else {
        customFieldUserIds = new Set([...customFieldUserIds].filter(id => idSet.has(id)));
      }
    }
    if (customFieldUserIds !== null && customFieldUserIds.size === 0) {
      return { data: [], count: 0 };
    }
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const needContactFilter = contactFilter || keywordContactFilter;

  if (needContactFilter) {
    let allRows;
    if (customFieldUserIds !== null) {
      const idList = [...customFieldUserIds];
      const placeholders = idList.map((_, i) => `$${params.length + i + 1}`).join(',');
      const userFilter = `user_id IN (${placeholders})`;
      const fullWhere = whereClause ? whereClause + ' AND ' + userFilter : 'WHERE ' + userFilter;
      params.push(...idList);
      allRows = database.prepare(`SELECT ${ALL_FIELDS.join(', ')}, status FROM users ${fullWhere} ORDER BY created_at DESC`).all(...params);
    } else {
      allRows = database.prepare(`SELECT ${ALL_FIELDS.join(', ')}, status FROM users ${whereClause} ORDER BY created_at DESC`).all(...params);
    }

    const filtered = allRows.filter(row => {
      const plainContact = decrypt(row.contact) || '';
      if (contactFilter && keywordContactFilter) {
        const contactMatch = isExact
          ? plainContact === contactFilter
          : plainContact.includes(contactFilter);
        const kwMatch = (row.name && (isExact ? row.name === keywordContactFilter : row.name.includes(keywordContactFilter)))
          || (row.city && (isExact ? row.city === keywordContactFilter : row.city.includes(keywordContactFilter)))
          || (isExact ? plainContact === keywordContactFilter : plainContact.includes(keywordContactFilter));
        return contactMatch && kwMatch;
      }
      if (contactFilter) {
        return isExact ? plainContact === contactFilter : plainContact.includes(contactFilter);
      }
      if (keywordContactFilter) {
        const nameMatch = row.name && (isExact ? row.name === keywordContactFilter : row.name.includes(keywordContactFilter));
        const cityMatch = row.city && (isExact ? row.city === keywordContactFilter : row.city.includes(keywordContactFilter));
        const contactMatch = isExact ? plainContact === keywordContactFilter : plainContact.includes(keywordContactFilter);
        return nameMatch || cityMatch || contactMatch;
      }
      return true;
    }).map(dbRowToJson);

    const count = filtered.length;
    const offset = (page - 1) * limit;
    const data = filtered.slice(offset, offset + limit);
    return { data, count };
  }

  if (customFieldUserIds !== null) {
    const idList = [...customFieldUserIds];
    const placeholders = idList.map((_, i) => `$${params.length + i + 1}`).join(',');
    const userFilter = `user_id IN (${placeholders})`;
    const fullWhere = whereClause
      ? whereClause + ' AND ' + userFilter
      : 'WHERE ' + userFilter;
    params.push(...idList);

    const countSql = `SELECT COUNT(*) as count FROM users ${fullWhere}`;
    const count = parseInt(database.prepare(countSql).get(...params).count) || 0;

    const sql = `SELECT ${ALL_FIELDS.join(', ')}, status FROM users ${fullWhere} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const data = database.prepare(sql).all(...params, limit, offset).map(dbRowToJson);
    return { data, count };
  }

  const countSql = `SELECT COUNT(*) as count FROM users ${whereClause}`;
  const count = parseInt(database.prepare(countSql).get(...params).count) || 0;

  const sql = `SELECT ${ALL_FIELDS.join(', ')}, status FROM users ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const data = database.prepare(sql).all(...params, limit, offset).map(dbRowToJson);

  return { data, count };
}

function escapeLikeString(str) {
  return str.replace(/[%_\\]/g, '\\$&');
}

function getUserStats() {
  const database = getDb();
  const rows = database.prepare("SELECT age FROM users WHERE age IS NOT NULL AND age != ''").all();
  const ageDistribution = {};
  for (const row of rows) {
    const age = String(row.age);
    ageDistribution[age] = (ageDistribution[age] || 0) + 1;
  }
  return {
    total: parseInt(database.prepare('SELECT COUNT(*) as count FROM users').get().count) || 0,
    male: parseInt(database.prepare("SELECT COUNT(*) as count FROM users WHERE gender = '男'").get().count) || 0,
    female: parseInt(database.prepare("SELECT COUNT(*) as count FROM users WHERE gender = '女'").get().count) || 0,
    ageDistribution
  };
}

function getUserCustomFields(userId) {
  const database = getDb();
  return database.prepare(
    'SELECT field_key, field_value, created_at FROM user_custom_fields WHERE user_id = $1 ORDER BY created_at'
  ).all(userId);
}

function setUserCustomField(userId, fieldKey, fieldValue) {
  const database = getDb();
  const now = Date.now();
  database.prepare(
    'INSERT INTO user_custom_fields (user_id, field_key, field_value, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT(user_id, field_key) DO UPDATE SET field_value = EXCLUDED.field_value, created_at = EXCLUDED.created_at'
  ).run(userId, fieldKey.trim(), String(fieldValue).trim(), now);
  return { field_key: fieldKey.trim(), field_value: String(fieldValue).trim() };
}

function deleteUserCustomField(userId, fieldKey) {
  const database = getDb();
  const stmt = database.prepare(
    'DELETE FROM user_custom_fields WHERE user_id = $1 AND field_key = $2'
  );
  const result = stmt.run(userId, fieldKey);
  return result.changes > 0;
}

function searchUsersByCustomField(fieldKey, fieldValue, isExact) {
  const database = getDb();
  if (isExact) {
    return database.prepare(
      'SELECT DISTINCT user_id FROM user_custom_fields WHERE field_key = $1 AND field_value = $2'
    ).all(fieldKey, fieldValue).map(r => r.user_id);
  }
  return database.prepare(
    "SELECT DISTINCT user_id FROM user_custom_fields WHERE field_key = $1 AND field_value LIKE $2"
  ).all(fieldKey, '%' + escapeLikeString(fieldValue) + '%').map(r => r.user_id);
}

function getAllCustomFields() {
  const database = getDb();
  return database.prepare(
    'SELECT user_id, field_key, field_value FROM user_custom_fields ORDER BY user_id, created_at'
  ).all();
}

module.exports = {
  getAllUsers,
  getUserById,
  getUsersByUserId,
  addUser,
  updateUser,
  deleteUser,
  batchSaveUsers,
  searchUsers,
  approveUser,
  rejectUser,
  getPendingUsers,
  getUserStats,
  getUserCustomFields,
  setUserCustomField,
  deleteUserCustomField,
  searchUsersByCustomField,
  getAllCustomFields
};