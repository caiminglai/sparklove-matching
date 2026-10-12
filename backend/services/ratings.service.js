// ============================================================
// 业务逻辑层 - 评价服务（纯业务规则，无 SQL，无 HTTP）
// ============================================================

const ratingsDb = require('../db/ratings');
const userDb = require('../db/users');
const { verifyToken } = require('../db/index');

// 评语长度上限。前端 RatingModal 的 textarea 没有 maxLength，
// 直连 POST 可以塞进任意长文本（comment 是 text 列，落库不报错、后台列表直接卡）；
// 这里选「超限报错」而不是「静默截断」，截掉用户写的字又不告诉他，比拒绝更难解释。
const MAX_COMMENT_LEN = 500;

async function addRating(token, ratedId, rating, comment) {
  const userId = verifyToken(token);
  if (!userId) {
    return { success: false, message: 'token无效' };
  }
  const users = await userDb.getUsersByUserId(userId);
  if (users.length === 0) {
    return { success: false, message: '请先创建个人资料' };
  }
  if (!ratedId || rating === undefined || rating === null || rating === '') {
    return { success: false, message: '缺少参数' };
  }
  // 原来只写 `rating < 1 || rating > 5`：传 'abc' 时两个比较都是 false（NaN 参与比较恒 false），
  // 判据形同虚设，脏值一路走到 INSERT 才由 PG 的 integer 列报错、回 500。
  // 现在要求是 1-5 的整数；页面 RatingModal 发的就是 1..5 的数字，不比页面严
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return { success: false, message: '评分必须在 1-5 之间' };
  }
  const targetUser = await userDb.getUserById(ratedId);
  if (!targetUser) {
    return { success: false, message: '被评价用户不存在' };
  }
  // 一个账号名下可以有多条资料行（现量：本机有账号挂 3 行）。
  // 原来只比 users[0].id，等于只挡住自己名下的第一行——换名下的第二行照样能给自己打分。
  // 评分人身份仍然记成 users[0].id（沿用旧数据口径，不改归属规则），
  // 但「不能评价自己」必须按整个账号名下所有行来判
  const ownedIds = new Set(users.map(u => String(u.id)));
  if (ownedIds.has(String(ratedId))) {
    return { success: false, message: '不能评价自己' };
  }
  if (typeof targetUser.user_id === 'string' && targetUser.user_id === String(userId)) {
    // 双保险：行上的归属账号就是当前登录账号
    return { success: false, message: '不能评价自己' };
  }

  const normalizedComment = typeof comment === 'string' ? comment.trim() : '';
  if (normalizedComment.length > MAX_COMMENT_LEN) {
    return { success: false, message: `评语最多${MAX_COMMENT_LEN}字` };
  }

  const existingRating = await ratingsDb.checkUserRated(users[0].id, ratedId);
  if (existingRating) {
    return { success: false, message: '您已经评价过该用户，每人只能评价一次' };
  }

  try {
    const added = await ratingsDb.addRating(users[0].id, ratedId, ratingNum, normalizedComment);
    // 并发下两条请求能同时越过上面的 checkUserRated，落到 (rater_id, rated_id) 唯一索引上：
    // 现在 db 层是 DO NOTHING，第二条拿不到改动行 ⇒ 这里回「已经评价过」而不是覆盖第一条
    if (!added) {
      return { success: false, message: '您已经评价过该用户，每人只能评价一次' };
    }
    return { success: true, message: '评价成功' };
  } catch (e) {
    return { success: false, message: '评价失败：' + (e.message || '数据库错误') };
  }
}

async function getUserRatings(ratedId) {
  const ratings = await ratingsDb.getRatingsForUser(ratedId);
  const average = await ratingsDb.getAverageRating(ratedId);
  return { ratings, average };
}

module.exports = {
  addRating,
  getUserRatings
};
