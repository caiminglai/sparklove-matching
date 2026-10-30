// ============================================================
// 启动入口（Express 版）
//
// 本文件只剩三件事：按顺序初始化、listen、进程级收尾。
// 原来那 618 行 if 链（HTTP 分发、限流计数、请求体读取、静态文件；10-30 现量
// `git show 6cf49e6:backend/server.js | wc -l` = 618）已经搬到
//   app.js            —— 中间件顺序与四个改变框架默认的开关
//   routes/index.js   —— 路由装配表（命中顺序）
//   routes/*.js       —— 各接口自己那一族
//   middleware/*.js   —— 安全头、日志、CORS、鉴权、限流、请求体、上传、错误出口
//
// ⚠ 启动顺序有两条是踩过坑的，不要调整：
//   1) require('./config') 必须排在其它 require 之前——dotenv 到那一刻才跑完，
//      而 payment 的密钥、限流档位、端口都在模块加载期取值。
//   2) 必须等 initConnection() 成功再 listen。旧写法就是"库没起来则端口根本不开"，
//      探针一眼能看出来；改成先 listen 会让容器健康检查先绿、随后每个请求都 500。
// ============================================================

// ========== 加载环境变量（必须在所有 require 之前执行）==========
const config = require('./config');

const dbIndex = require('./db/index.js');
const paymentsDb = require('./db/payments.js');
const authDb = require('./db/auth.js');
const adminDb = require('./db/admin.js');
const { initVectorTables } = require('./db/vector.js');
const { createApp } = require('./app.js');

const PORT = config.PORT;

let server = null;

// ===== 全局错误处理（先注册再启动，初始化阶段抛出来的错也要有人接）=====
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
  // closeDb 现在是异步的；进程即将退出，这里不等待、只吞掉可能的 rejection
  dbIndex.closeDb().catch(() => {});
  process.exit(1);
});

// ===== 优雅关闭 =====
function shutdown(label) {
  console.log(`\n[Server] ${label}`);
  const finish = () => {
    dbIndex
      .closeDb()
      .catch(() => {})
      .then(() => {
        console.log('[Server] 已关闭');
        process.exit(0);
      });
  };
  // 信号可能落在 listen 之前（例如初始化阶段容器就发了 SIGTERM），那时没有连接要断
  if (server) server.close(finish);
  else finish();
  // 10秒后强制退出
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGINT', () => shutdown('正在关闭...'));
process.on('SIGTERM', () => shutdown('收到 SIGTERM，正在关闭...'));

// 异步初始化数据库连接后再启动服务器
dbIndex
  .initConnection()
  .then(async () => {
    // 启动期强校验：管理员密码必须能从环境变量或数据库取到，否则拒绝启动
    // （替代原 admin.service.js 模块加载期的 process.exit(1)）
    try {
      const adminPwd = process.env.ADMIN_PASSWORD || (await adminDb.getAdminPassword());
      if (!adminPwd) {
        console.error('[FATAL] ADMIN_PASSWORD not configured. Set it in .env or database.');
        process.exit(1);
      }
    } catch (e) {
      console.error('[FATAL] 管理员密码校验失败:', e.message);
      process.exit(1);
    }
    // 自动建向量表 + HNSW 索引（若已存在则跳过）
    try {
      await initVectorTables();
    } catch (e) {
      console.warn('向量表初始化失败（可忽略）：', e.message);
    }
    // 支付订单表补 channel_txn_id 列（种子库没有这一列；IF NOT EXISTS 幂等）
    try {
      await paymentsDb.ensurePaymentColumns();
    } catch (e) {
      console.warn('支付订单表补列失败：', e.message);
    }
    // 注册账号表补手机号唯一索引（IF NOT EXISTS 幂等）。
    // 失败通常只有一个原因：表里已经存在同手机号的重复账号，必须先人工合并再重启，
    // 否则注册仍可重复、登录命中哪个账号不确定。这里只告警不阻断启动。
    try {
      await authDb.ensurePhoneUniqueIndex();
    } catch (e) {
      console.warn('手机号唯一索引创建失败（表内可能已有重复手机号，需先清理）：', e.message);
    }

    server = createApp().listen(PORT, () => {
      console.log('');
      console.log('╔══════════════════════════════════════════╗');
      console.log('║     精准匹配 - 后端服务已启动            ║');
      console.log('╠══════════════════════════════════════════╣');
      console.log(`║  API地址: http://localhost:${PORT}           ║`);
      console.log(`║  环境: ${process.env.NODE_ENV || 'development'}                           ║`);
      console.log('╚══════════════════════════════════════════╝');
      console.log('');
    });
  })
  .catch((err) => {
    console.error('数据库连接失败:', err.message);
    process.exit(1);
  });
