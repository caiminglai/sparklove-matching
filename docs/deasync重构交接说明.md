# 站2 后端 deasync → pg.Pool 异步化改造 · 完整交接说明

> 本文档是给执行者（AI 助手 Kimi）看的**自包含**说明书。执行者没有参与过之前的任何对话，
> 本文假设你对这个项目**一无所知**，所有背景、范围、代码、命令、验证方法都写在这里。
>
> **重要：操作环境是 Windows `cmd`（命令提示符），不是 Git Bash，也不是 PowerShell。**
> 本文所有命令都按 `cmd` 语法写。不要使用 `$(...)`、heredoc（`<<'EOF'`）、`grep`、`sed`、`tr`、`cat -A`、`$'\r'` 这些 bash 专有语法。
> 查找用 `findstr`，看文件用 `type`，切目录用 `cd /d`，命令连接用 `&&`。

---

## 0. 你可以直接照这个节奏和我（用户）对话

我会在 cmd 里逐条执行你给的命令，把输出粘回给你。请你：

1. **一次只给一个阶段的命令**，等我粘回输出、你确认无误后，再给下一阶段。不要一口气给完。
2. **每阶段结束必须有一个"验证门"**，验证不通过就停下来修，不要往下走。
3. 改代码时**给我完整的文件内容或明确的"第 X 行改成 Y"**，不要说"你自己看着改"。
4. **全程用中文**。
5. 不要顺手做我没让你做的优化（不要重命名变量、不要调整格式、不要删注释、不要重构无关代码）。
   本次任务**只有一个目标：把同步数据库调用改成异步**。改完 diff 里除了 `async` / `await` / 连接池相关代码，不应该有别的。

---

## 1. 项目背景（你需要知道的最小上下文）

### 1.1 这是什么项目

- **项目代号**：站2 / jzxr / "精准匹配"（一个婚恋交友类网站，含用户资料、评价、举报、联系方式解锁付费、押金凭证审核、向量匹配推荐）。
- **本地路径**：`E:\website\2.my-two-website`
- **目录结构**：
  ```
  E:\website\2.my-two-website\
  ├── app\                  前端（Vue/React + Vite），本次不动
  ├── backend\              后端（Node.js 原生 http），本次全部工作都在这里
  ├── data\                 数据库备份/导出目录
  ├── docs\                 文档（本文就在这里）
  ├── Dockerfile            后端镜像
  ├── Dockerfile.frontend   前端镜像
  ├── frontend-server.mjs   前端静态服务器
  └── init-db.sh            建库脚本
  ```

### 1.2 后端**不是 Express**

这是最容易搞错的一点，请务必记住：`backend\server.js` 是**手写的原生 `http.createServer` + if/正则 分发**，没有 Express、没有 Koa、没有中间件框架、没有 `app.get()`。

分发长这样（`server.js` 第 333-335 行是典型例子）：

```js
if (req.method === 'GET' && pathname === '/api/users') {
  userRoutes.getUsers(req, res, null, parsedUrl); return;
}
```

注意三点：

1. 路由 handler 的参数是**自定义位置参数**，不是 `(req, res, next)`。常见的有：
   `checkAdminAuth`、`readBodyWithLimit`、`pathname`、`parsedUrl`、`clientIp`、
   `checkRateLimit`、`checkLoginRateLimit`、`checkRegisterRateLimit`。
2. 每个分发分支结尾都是 `handler(...); return;`，**没有 `await`**（因为 handler 现在是同步的）。
3. 顶层回调**已经是 `async` 的**（第 139 行 `http.createServer(async (req, res) => {`），
   而且整个函数体已经被一个 `try { ... } catch (err) { ...500... }` 包住了（第 146 行开始，第 481 行 catch）。
   **这是好消息**：意味着 handler 变成 async 之后，抛错会被这个 catch 接住，不会变成 unhandledRejection。
   你只需要在每个分发点加 `await`。

### 1.3 五层架构（改造的级联链）

```
第5层  server.js                ← 手写路由分发，所有 handler 调用点要加 await
         ↓
第4层  routes\*.js   (10 个文件) ← HTTP 解析 + 调用 service 或直接调 db
         ↓
第3层  services\*.js (8 个文件)  ← 业务规则，无 SQL
         ↓
第2层  db\*.js       (9 个文件)  ← 纯 SQL，无业务逻辑
         ↓
第1层  db\index.js               ← deasync + 单个 pg.Client，本次改造的核心
```

**级联规则**：第 1 层变异步 → 第 2 层所有函数必须变 async → 第 3 层调用第 2 层的必须变 async
→ 第 4 层调用第 3/2 层的必须变 async → 第 5 层调用第 4 层的必须加 `await`。
**漏掉任何一层的任何一个 `await`，都不会报错**，只会静默返回一个 Promise 对象。这是本次改造最大的风险，第 6 节专门讲。

### 1.4 当前运行环境

Docker 里有 5 个容器（站1、站2、站3 混在一起跑），**由 `E:\website\docker-compose.yml` 统一管理**
（注意：compose 文件在 `E:\website\` 根目录，**不在** `2.my-two-website\` 里面）。

⚠️ **compose 的"服务名"和真实"容器名"不一样**，这个区别会让命令直接失败，务必分清：

| compose 服务名<br>（用于 `docker compose up/logs` 等） | 真实容器名<br>（用于 `docker exec` / `docker logs <容器>`） | 作用 | 端口映射 |
|---|---|---|---|
| `jzxr` | **`jzxr-local`** | 站2 后端（本次改造对象） | `127.0.0.1:8080:8080` → 宿主机 `http://localhost:8080` |
| `jzxr-web` | **`jzxr-web-local`** | 站2 前端（Nginx） | `127.0.0.1:4000:80` → 宿主机 `http://localhost:4000` |
| `postgres` | **`postgres-local`** | PostgreSQL（镜像 `pgvector/pgvector:pg18`，带向量扩展） | `127.0.0.1:5433:5432` |
| `twym` | `twym-local` | 站1（本次无关） | — |
| `style-ai` | `style-ai-local` | 站3（本次无关） | — |

> **2026-09-20 变更**：站2 三个端口已加 `127.0.0.1:` 前缀，只监听宿主机回环。
> 原因是 `5433`（带密码的 PostgreSQL）和 `8080`（裸 API）绑在 `0.0.0.0` 上，等于在 Caddy/HTTPS 之外另开无 TLS 入口。
> **这不影响线上访问**：Caddy 是容器，按 `docker-compose.yml` 里的服务名走容器网回源（`reverse_proxy jzxr-web:80`），根本不经过宿主机端口。
> 例外：若要用手机等**局域网其它设备**访问 `http://<本机IP>:4000`，得临时去掉 `127.0.0.1:` 前缀并 `docker compose up -d` 重建该服务。

所以：
- `docker compose ...` 命令要先 `cd /d E:\website`，用**服务名** `jzxr`
- `docker exec ...` / `docker logs ...` 可以在任何目录执行，用**容器名** `jzxr-local` / `postgres-local`
- 随时用 `docker ps --format "{{.Names}}\t{{.Image}}\t{{.Ports}}"` 核对，不要凭记忆

其他环境事实：

- 数据库名：`match_db`；数据卷 `pgdata` 挂在容器内 `/var/lib/postgresql`（pg18 的路径约定，不是旧的 `.../data`）
- 后端依赖：`pg@^8.22.0`（已装，`Pool` 直接可用）、`deasync@^0.1.31`（本次要删掉）、`bcrypt@^6.0.0`、`dotenv@^17.2.0`
- 当前 git 分支：`refactor/cleanup-and-style-fixes`
- **环境变量有两个来源，这一点在第 5.4 节会变成关键**：
  1. `docker-compose.yml` 第 57-74 行用 `environment:` 直接注入，其中 `ADMIN_PASSWORD`、`ADMIN_USERNAME`、
     `ENCRYPTION_KEY`、`PG_PASSWORD`、`TOKEN_SECRET`、`EMBEDDING_*` 都是 `${VAR}` 形式，
     由 compose 从**根目录 `E:\website\.env`** 插值而来
  2. 同时 `backend\.env` 被**只读挂载**进容器（compose 第 76 行：`./2.my-two-website/backend/.env:/app/.env:ro`），
     由 `server.js` 第 3 行的 `dotenv.config()` 读取
  - **`dotenv` 默认不会覆盖已经存在的 `process.env` 键。** 所以如果 compose 注入的是空字符串
    （根 `.env` 里没配那个键），容器里 `process.env.ADMIN_PASSWORD` 就是 `''`（已定义但为空 = falsy），
    dotenv 也**不会**用 `backend\.env` 里的值去覆盖它。
  - 结论：**"本地跑 `node server.js` 时不查库"不代表"容器里也不查库"**。两者的 env 可能不一样。
    这正是第 5.4 节那个坑必须修的原因，也是阶段 0 要先做基线测试的原因。
- **`backend\.env`、根目录 `E:\website\.env`、`data\` 都在 `.gitignore` 里，不会被提交。
  里面有机密（数据库密码、加密密钥、管理员密码）。绝对不要提交、不要 `type` 出来打印到屏幕上、
  不要写进任何文档、不要贴进对话。**

---

## 2. 为什么要改（问题是什么）

现在 `backend\db\index.js` 用 `deasync` 这个库，把**异步的** `pg` 驱动强行包装成**同步 API**，
目的是让代码可以像操作 SQLite（`better-sqlite3`）那样写 `db.prepare(sql).get(id)`。

三个实际问题：

1. **`deasync` 会阻塞整个 Node.js 事件循环**。它靠一个 C++ addon 在原地自旋等待，
   期间**整个进程**无法处理任何其他请求、无法响应心跳、无法做任何 I/O。
   一次数据库查询 = 整个服务卡住一次。并发能力实际上等于 0（退化成单线程串行）。
2. **只用了单个 `pg.Client`，没有连接池**。全进程共用一条数据库连接，
   连接断了要靠代码里手写的 "Connection terminated → resetClient() → 重连重试一次" 补丁兜着（`db\index.js` 第 58-68 行）。
3. **`deasync` 是原生模块，需要按平台编译**，Docker 镜像构建慢、跨平台易出问题；
   它和 `async/await` 混用还会**死锁**——这一点项目里已经踩过了，
   `services\admin.service.js` 第 33 行留着一条注释为证：
   > `// 注意：必须用同步bcrypt，因为deasync DB层与async/await冲突会导致死锁`

改成 `pg.Pool` + 原生 `async/await` 之后：事件循环不再被阻塞、自带连接池和自动重连、
可以去掉手写重试补丁、可以删掉 `deasync` 依赖（镜像构建更快）。

---

## 3. 改造范围全景（精确到文件和函数）

### 3.1 调用点普查（已用 grep 实测，共 **167 处**，分布在 **12 个文件**）

统计口径：`.prepare(` / `.transaction(` / `getDb()` / `.exec(` 的出现次数。

| 文件 | 处数 | 说明 |
|---|---|---|
| `db\users.js` | **50** | 最密集，含唯一的 `transaction`（第 188 行） |
| `db\payments.js` | **34** | |
| `db\admin.js` | **22** | |
| `db\vector.js` | **17** | |
| `db\auth.js` | **11** | |
| `db\ratings.js` | **8** | |
| `db\reports.js` | **8** | |
| `db\field-mappings.js` | **6** | 有 ETag 缓存版本逻辑 |
| `routes\upload.js` | **5** | 其中第 248、270 行是**函数体内 inline `require('../db/index').getDb()`** |
| `routes\contact-unlock.js` | **4** | 其中第 182-185、198-201 行是 inline `dbIndex.getDb().prepare(...)` |
| `db\index.js` | **1** | 核心，本次重写对象 |
| `routes\payment.js` | **1** | |

另外 **`server.js` 自己也有 6 处直接调 db 层**，不走 routes，很容易漏：

| 行号 | 代码 |
|---|---|
| 327 | `const stats = userDb.getUserStats();` |
| 364 | `const allFields = userDb.getAllCustomFields();` |
| 434 | `const version = fieldMappingsDb.getCacheVersion();` |
| 438 | `const mappings = fieldMappingsDb.getAllFieldMappings();` |
| 451 | `const version = fieldMappingsDb.getCacheVersion();` |
| 455 | `const labelMap = fieldMappingsDb.getFieldLabelMap();` |
| 498 | `initVectorTables();`（在 `initConnection().then(() => {...})` 里，**该回调不是 async，需要改成 async**） |

### 3.2 各层需要改的函数清单

**第 2 层 `db\*.js`（全部导出函数都要加 `async`，除了下面标注的例外）**

| 文件 | 导出函数 |
|---|---|
| `db\index.js` | `getDb`、`initConnection`、`closeDb` ← 重写；`hashPasswordSync`、`verifyPasswordSync`、`encrypt`、`decrypt`、`generateToken`、`verifyToken`、`generateAdminToken`、`verifyAdminToken` ← **纯同步，一个字符都不要动** |
| `db\users.js` | `getAllUsers`、`getUserById`、`getUsersByUserId`、`addUser`、`updateUser`、`deleteUser`、`batchSaveUsers`、`searchUsers`、`approveUser`、`rejectUser`、`getPendingUsers`、`getUserStats`、`getUserCustomFields`、`setUserCustomField`、`deleteUserCustomField`、`searchUsersByCustomField`、`getAllCustomFields`（共 17 个，全改）。<br>**不改**：`ALL_FIELDS`（常量数组）、`jsonToDbRow`、`dbRowToJson`、`escapeLikeString`（这三个是纯内存转换 + 同步 `encrypt`/`decrypt`，**必须保持同步**，否则 `.map(dbRowToJson)` 会全部坏掉） |
| `db\payments.js` | `unlockContact`、`checkContactUnlocked`、`getAllUnlockRecords`、`addContactUnlockRequest`、`getAllContactUnlockRequests`、`approveContactUnlockRequest`、`rejectContactUnlockRequest`、`deleteContactUnlockRequest`、`addPaymentOrder`、`getPaymentOrder`、`updatePaymentOrder`、`approveDepositByUserId`、`getAllDeposits`、`updateDepositStatus`、`addDeposit`、`getMyDeposit`（共 16 个，全改） |
| `db\admin.js` | `getAdminPassword`、`setAdminPassword`、`getAdminLogs`、`logAdminAction`、`getAdminWhitelist`、`getAdminAccountPassword`、`getAllCustomFilters`、`addCustomFilter`、`deleteCustomFilter`（共 9 个，全改） |
| `db\auth.js` | `createAuthUser`、`verifyAuthUser`、`getAuthUserById`、`getAuthUserByIdWithPassword`、`updateAuthUserPassword`（共 5 个，全改） |
| `db\ratings.js` | `addRating`、`getRatingsForUser`、`getAverageRating`、`checkUserRated`（共 4 个，全改） |
| `db\reports.js` | `addReport`、`getAllReports`、`updateReportStatus`、`deleteReport`（共 4 个，全改） |
| `db\field-mappings.js` | `getAllFieldMappings`、`getFieldLabelMap`、`getCacheVersion`（共 3 个，全改） |
| `db\vector.js` | `initVectorTables`、`upsertUserVector`、`findSimilarUsersByProfile`、`findSimilarUsersByExpectation`、`findMutualMatchUsers`、`getUserVector`、`getVectorStats`（共 7 个，全改）。**不改**：`VECTOR_DIMENSION`（常量） |

**第 3 层 `services\*.js`**

| 文件 | 处理 |
|---|---|
| `services\user.service.js` | `authenticateUser`、`getUserList`、`getUserStats`、`getPendingUsers`、`getMyUser`、`createUser`、`updateMyUser`、`editUserById`、`removeUser`、`removeMyUser`、`approveUser`、`rejectUser`、`searchUsers`、`batchSave`、`getAdminLogs` → **全部加 async**（共 15 个）。<br>**不改**：`maskContact`、`maskUserData`、`maskUsers`、`sanitizeString`、`validateIdFormat`、`validateUserData`（纯内存/纯校验，不碰 db） |
| `services\auth.service.js` | `register`、`login`、`getCurrentUser`、`changePassword` → **全改**（4 个） |
| `services\admin.service.js` | `verifyAdminAccount`、`isAdminToken`、`getAdminWhitelist`、`isAdminUsername` → **全改**（4 个）。<br>**特殊处理见第 5.4 节**（第 11 行有模块加载期查库的坑）。<br>`comparePassword` 里的 `bcrypt.compareSync` / `bcrypt.hashSync` **保持同步不动**（改造完成后第 33 行那条"deasync 死锁"注释可以删掉，因为 deasync 没了） |
| `services\ratings.service.js` | `addRating`、`getUserRatings` → **全改**（2 个） |
| `services\reports.service.js` | `submitReport`、`getAllReportsForAdmin`、`updateStatus`、`removeReport` → **全改**（4 个） |
| `services\vector.service.js` | `generateEmbedding`、`generateAndStoreUserVector`、`findSimilarUsers`、`findMutualMatches`、`batchGenerateVectors` **已经是 async**，只需在内部调用 `vectorDb.*` / `userDb.*` 的地方**补 `await`**。<br>`getStats`（第 190 行）现在是同步的，**要改成 async**，因为它调 `vectorDb.getVectorStats()`。<br>**不改**：`buildProfileText`、`buildExpectationText`、`generateMockEmbedding`（纯内存） |
| `services\captcha.service.js` | **完全不动**（纯内存，不碰 db） |
| `services\sms.service.js` | **完全不动**（纯内存，不碰 db） |

**第 4 层 `routes\*.js`**

| 文件 | 需要改成 async 的 handler |
|---|---|
| `routes\users.js` | `getUsers`、`addUser`、`batchSaveUsers`、`getMyUser`、`updateMyUser`、`deleteMyUser`、`editUser`、`deleteUser`、`getPendingUsers`、`approveUser`、`rejectUser`、`searchUsers`（12 个）。<br>**不改**：`getAuthInfo`（第 18 行，只用同步的 `verifyToken`）。但第 27 行 `adminService.isAdminToken(token)` 在 `getAuthInfo` 内部 → **见第 5.4 节的决策** |
| `routes\auth.js` | `register`、`login`、`changePassword`、`adminLogin`、`sendRegisterSmsCode`、`verifyRegisterSmsCode`、`getCaptcha`、`verifyCaptcha`（8 个）。注意这些现在是 `return readBodyWithLimit(req).then(body => {...})` 的写法，**改成 async 后建议保留 `.then()` 结构不动，只在 `.then(body => {...})` 的回调上加 `async` 并在 db/service 调用前加 `await`**——这样 diff 最小。第 75 行 `authService.getCurrentUser(token)?.id` 要变成 `(await authService.getCurrentUser(token))?.id` |
| `routes\contact-unlock.js` | `submitUnlockRequest`、`getUnlockRequests`、`approveUnlockRequest`、`rejectUnlockRequest`、`deleteUnlockRequest`、`adminUnlockContact`、`checkUnlock`、`getUnlockRecords`（8 个） |
| `routes\upload.js` | `uploadAvatar`、`uploadDepositProof`、`getDeposits`、`approveDeposit`、`rejectDeposit`、`getMyDeposit`、`getDepositProofById`、`deleteDeposit`（8 个）。**不改**：`serveUploadedFile`（第 165 行，纯文件流，不碰 db）。第 27 行 `adminService.isAdminToken(token)` → 见第 5.4 节 |
| `routes\reports.js` | `addReport`、`getAllReports`、`updateReportStatus`、`deleteReport`（4 个） |
| `routes\ratings.js` | `addRating`、`getRatings`（2 个） |
| `routes\admin-custom-fields.js` | `getCustomFilters`、`addCustomFilter`、`deleteCustomFilter`（3 个） |
| `routes\user-custom-fields.js` | `handleUserCustomFields`（1 个） |
| `routes\payment.js` | `createMockOrder`、`mockPay`、`createPayment`、`wechatNotify`、`alipayNotify`、`queryPaymentStatus`、`handleWechatNotify`、`handleAlipayNotify` → 其中 `mockPay`、`createPayment`、`wechatNotify`、`alipayNotify`、`createWechatOrder`、`createAlipayOrder` **已经是 async**，只需补 `await`；其余按需改。<br>**不改**：`initConfig`、`isPaymentConfigured`、`generateNonceStr`、`generateOrderId`、`wechatSign`、`alipaySign`、`buildXml`、`parseXml`（纯计算，不碰 db） |
| `routes\vector.js` | **已经是 async 的样板**，只需：第 45 行 `const stats = vectorService.getStats();` → 加 `await`（因为 `getStats` 要改成 async）。**不改**：`requireAuth`（第 9 行，只用同步 `verifyToken`） |

**第 5 层 `server.js`**

- 第 39-42 行 `checkAdminAuth` → 见第 5.5 节
- 所有 `xxxRoutes.handler(...); return;` → 改成 `await xxxRoutes.handler(...); return;`
- 第 327、364、434、438、451、455 行的 inline db 调用 → 加 `await`
- 第 496-512 行 `initConnection().then(() => {...})` → 回调改成 `async () => {...}`，第 498 行改成 `await initVectorTables()`
- 第 264 行 `const handled = await handleVectorRequest(req, res);` → **已经有 await，不用动**
- 第 519-523 行 `uncaughtException` 里的 `dbIndex.closeDb()` → 见第 6.5 节
- **不改**：`applySecurity`、`requestLogger`（中间件，不碰 db）、CORS 头、`normalizePath`、`readBodyWithLimit`、
  `checkLimitMap`/`cleanupLimitMap`/`checkRateLimit`/`checkLoginRateLimit`/`checkRegisterRateLimit`（纯内存限流）、
  静态文件服务（二维码图片、`/avatars/*`、`/admin*` 页面、`/uploads/*`）

### 3.3 完全不用碰的文件/目录

`backend\utils\*`（`sendJson.js`、`multipart.js`、`config.js`、`cookie工具.js`）、
`backend\middleware\*`（`安全.js`、`日志.js`）、
`backend\admin\*`（管理后台 HTML）、
`app\`（前端）、`Dockerfile`、`Dockerfile.frontend`、`frontend-server.mjs`、`init-db.sh`。

已实测：这些文件里**没有任何一个** `require` 了 `db/` 或 `services/`。

---

## 4. 目标设计：`db\index.js` 的新实现

### 4.1 设计原则（关键，决定了整个改造的工作量）

**保留 `prepare(sql)` 这个门面（facade），只把它的四个方法 `get` / `all` / `run` / `exec` 变成 `async`。**

这样做的好处：第 2 层 `db\*.js` 里的**每一行 SQL 都不用改**，每个函数只需要：
① 函数签名前加 `async`；② 在 `.get()` / `.all()` / `.run()` / `.exec()` 前加 `await`。
纯机械操作，不动业务逻辑，不动 SQL 字符串。

**必须严格保持的返回值形状**（第 2 层有代码依赖它们）：

| 方法 | 返回值 | 依赖它的地方 |
|---|---|---|
| `.get(...p)` | 有行 → `rows[0]`（对象）；无行 → `null` | 到处都是 `if (!row) return ...` |
| `.all(...p)` | 数组（可能为空 `[]`），**不是 undefined** | `.map(dbRowToJson)`、`.filter(...)` |
| `.run(...p)` | `{ changes: <rowCount>, lastInsertRowid: <rows[0].id 或 undefined> }` | `db\admin.js:79` 用 `info.lastInsertRowid`；`db\admin.js:86` 用 `info.changes > 0` |
| `.exec()` | 无返回值 | `db\vector.js` 建表 |
| `db.exec(sql)` | 无返回值 | `db\vector.js:8,24`（**多语句 SQL**，见第 6.3 节陷阱） |
| `db.transaction(fn)` | `fn` 的返回值 | 只有 `db\users.js:188` 一处 |

### 4.2 新的 `db\index.js` 前 130 行（把原来的第 1-130 行整段替换成下面这段）

> 原文件第 **131-250 行**（`hashPasswordSync`、`verifyPasswordSync`、`encrypt`、`decrypt`、
> `generateToken`、`verifyToken`、`generateAdminToken`、`verifyAdminToken`、`module.exports`）
> **原样保留，一个字符都不要动。** 它们全是纯同步的 crypto / bcrypt / HMAC 计算，与数据库无关。
> 唯一要确认的是：文件末尾 `module.exports` 里的导出名不变（`getDb`、`initConnection`、`closeDb` 名字都不变）。

```js
const { Pool } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;

// 生产环境必须显式设置 PG_PASSWORD，dev 兜底仅用于本地
const _isProd = process.env.NODE_ENV === 'production';
if (_isProd && !process.env.PG_PASSWORD) {
  throw new Error('生产环境必须设置 PG_PASSWORD 环境变量');
}
const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'dev-pg-password-do-not-use-in-prod',
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'match_db',
  max: 10,                        // 连接池上限
  idleTimeoutMillis: 30000,       // 空闲连接 30s 后回收
  connectionTimeoutMillis: 5000   // 取连接超过 5s 直接报错，避免请求无限挂起
};

let pool = null;

function getPool() {
  if (!pool) pool = new Pool(pgConfig);
  return pool;
}

// 启动时调用：建池 + 立刻发一条探活查询，连不上就快速失败（让 server.js 的 .catch 走 process.exit(1)）
async function initConnection() {
  await getPool().query('SELECT 1');
}

// 统一执行入口。
// 关键点：params 为空时必须只传 sql 一个参数，让 pg 走 simple query 协议，
// 否则多语句 SQL（如 db\vector.js 的建表脚本）会被 pg 拒绝。详见交接说明第 6.3 节。
async function runQuery(sql, params, boundClient) {
  const executor = boundClient || getPool();
  if (!params || params.length === 0) return executor.query(sql);
  return executor.query(sql, params);
}

// 造一个 db 句柄。boundClient 非空时，所有查询都绑在这条连接上（事务用）。
function createDbHandle(boundClient) {
  function prepare(sql) {
    return {
      get: async (...params) => {
        const result = await runQuery(sql, params, boundClient);
        return result.rows.length > 0 ? result.rows[0] : null;
      },
      all: async (...params) => {
        const result = await runQuery(sql, params, boundClient);
        return result.rows;
      },
      run: async (...params) => {
        const result = await runQuery(sql, params, boundClient);
        return {
          changes: result.rowCount,
          lastInsertRowid: result.rows[0] && result.rows[0].id
        };
      },
      exec: async () => {
        await runQuery(sql, [], boundClient);
      }
    };
  }

  async function exec(sql) {
    await runQuery(sql, [], boundClient);
  }

  // 事务：从池里独占一条连接，BEGIN → 执行回调 → COMMIT/ROLLBACK → 归还。
  // 回调收到的是一个绑定到该连接的 db 句柄，回调内部必须用它（而不是外层的 getDb()），
  // 否则语句会跑到池里另一条连接上，脱离事务。
  async function transaction(fn) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(createDbHandle(client));
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) { /* 忽略回滚自身失败 */ }
      throw e;
    } finally {
      client.release();
    }
  }

  return { prepare, exec, transaction };
}

function getDb() {
  return createDbHandle(null);
}

async function closeDb() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}
```

### 4.3 被删掉的东西（这些是**故意**删的，不要"顺手恢复"）

| 删掉的 | 原因 |
|---|---|
| `const deasync = require('deasync')` | 本次改造的目的 |
| `const { Client } = require('pg')` → 换成 `Pool` | 要连接池 |
| `getClient()` / `resetClient()` / `let client` / `let connecting` | Pool 自己管连接生命周期 |
| `runQuery` 里 "Connection terminated / Connection ended → 重连重试一次" 的 try/catch（原第 58-68 行） | Pool 原生具备断线重连能力，这个补丁是单 Client 时代的产物 |
| `closeDb()` 里 `deasync((cb) => { c.end(() => cb(null, null)); })`（原第 123-126 行） | 改成 `await pool.end()`，不再需要那个防自旋的 workaround |
| 原 `runQuery(method, ...params)` 的第一个参数 `method` | **它在旧代码里就是废参数**——`'get'`/`'all'`/`'run'`/`'exec'` 传进去后从未被使用，实际执行的都是同一句 `querySync(sql, params)`。删掉不影响任何行为 |

---

## 5. 分阶段执行步骤（每阶段都有验证门，不通过不许往下走）

### 阶段 0：准备、备份、建分支

**目的**：留好回滚点。本次改造不改数据库结构和数据，但会重建镜像，备份是廉价保险。

```cmd
cd /d E:\website\2.my-two-website
git status
git branch --show-current
```

先把 `git status` 的输出粘给我看。**如果有未提交的改动，先停下来问我怎么处理，不要自行 stash、不要自行 commit、不要 `git checkout .` 丢弃。**

确认干净后：

```cmd
git switch -c refactor/deasync-to-pg-pool
docker ps --format "{{.Names}}"
```

看到 `postgres` 容器在跑之后，备份数据库：

```cmd
docker exec postgres pg_dump -U postgres match_db > data\backup_before_deasync.sql
dir data\backup_before_deasync.sql
```

> 说明：官方 postgres 镜像对容器内本地 socket 连接是 trust 认证，所以不用传密码。
> 如果这条命令报认证失败，改用：
> `docker exec postgres bash -c "PGPASSWORD=$PG_PASSWORD pg_dump -U postgres match_db" > data\backup_before_deasync.sql`
> （`$PG_PASSWORD` 在容器内是已设好的环境变量，这样密码不会出现在你的 cmd 历史里）

**验证门 0**：`data\backup_before_deasync.sql` 存在且大小 > 0（应该至少几十 KB）。用 `dir` 确认，别用 `type` 打开（文件很大，会刷屏）。

再记录一下改造前的基线，方便对比：

```cmd
cd /d E:\website\2.my-two-website\backend
findstr /s /i /c:"deasync" *.js
```

**验证门 0b**：输出应该只有 `db\index.js` 里的几行 + `services\admin.service.js` 第 33 行的注释。把输出粘给我。

#### 验证门 0c：记录"改造前功能基线"（**必做，不许跳过**）

**为什么这一步不能省**：容器内的环境变量有两个来源（见第 1.4 节）——compose 从根 `E:\website\.env` 插值注入，
外加只读挂载的 `backend\.env`；而 `dotenv` **默认不覆盖已存在的键**。
这意味着"管理员密码/白名单是否走数据库回退分支"在**容器里**和**本地 `node server.js`** 可能表现不同。
如果不先记录基线，改完之后出现问题时你**无法区分**是"我改坏了"还是"它本来就是坏的"。

在动任何代码之前，先跑这一组**只读**命令，把输出存下来：

```cmd
cd /d E:\website\2.my-two-website
mkdir tmp_test 2>nul
curl -s -o tmp_test\base_01_users.txt        -w "01 GET /api/users                  -> %%{http_code}\n" http://localhost:8080/api/users
curl -s -o tmp_test\base_02_fieldmap.txt     -w "02 GET /api/field-mappings         -> %%{http_code}\n" http://localhost:8080/api/field-mappings
curl -s -o tmp_test\base_03_labels.txt       -w "03 GET /api/field-mappings/labels  -> %%{http_code}\n" http://localhost:8080/api/field-mappings/labels
curl -s -o tmp_test\base_04_customfields.txt -w "04 GET /api/custom-fields          -> %%{http_code}\n" http://localhost:8080/api/custom-fields
curl -s -o tmp_test\base_05_captcha.txt      -w "05 GET /api/auth/captcha           -> %%{http_code}\n" http://localhost:8080/api/auth/captcha
curl -s -o tmp_test\base_06_adminstats.txt   -w "06 GET /api/admin/stats (无token)   -> %%{http_code}\n" http://localhost:8080/api/admin/stats
curl -s -o tmp_test\base_07_404.txt          -w "07 GET /api/不存在                  -> %%{http_code}\n" http://localhost:8080/api/nope
dir tmp_test
```

> 在 cmd 的 `curl -w` 格式串里，`%` 要写成 `%%` 才能输出字面量 `%`。上面已经写好了，照抄即可。
> 如果 `%%{http_code}` 输出成了 `%{http_code}` 字面量，说明你的 curl 版本不需要转义，把 `%%` 改成 `%` 重试。

**期望的基线结果**（把它记下来，改完之后必须一模一样）：

| 编号 | 期望状态码 | 期望响应体特征 |
|---|---|---|
| 01 | `200` | `{"success":true,...}`，`data` 是**数组** |
| 02 | `200` | `data` 是**非空数组** |
| 03 | `200` | `data` 是**非空对象** |
| 04 | `200` | `success:true` |
| 05 | `200` | `data` 里有 `captchaId` |
| 06 | **`401`** | `{"success":false,"message":"需要管理员权限"}` ← **必须是 401，如果这里是 200 说明改造前鉴权就已经是坏的，立刻停下来告诉我** |
| 07 | `404` | `Not Found` |

再单独测管理员登录（**这是第 5.4 节那个坑的基线**）。用编辑器创建 `tmp_test\adminlogin.json`
（**UTF-8 无 BOM**，把密码换成真实的管理员密码，别贴到对话里）：

```json
{"username":"admin","password":"在这里填真实的管理员密码"}
```

```cmd
cd /d E:\website\2.my-two-website
curl -s -o tmp_test\base_08_adminlogin.txt -w "08 POST /api/admin/login -> %%{http_code}\n" -X POST http://localhost:8080/api/admin/login -H "Content-Type: application/json" -d @tmp_test\adminlogin.json
type tmp_test\base_08_adminlogin.txt
```

**期望**：状态码 `200`，响应体形如 `{"success":true,"token":"...","username":"admin"}`。

- **如果是 200** → 记下来。改完之后第 7.4 节必须仍然是 200。
- **如果不是 200**（比如 400/401/500）→ **改造前就是坏的**。立刻停下来把状态码和
  `docker logs --tail 50 jzxr-local` 的输出粘给我，**先别开始改造**。
  在这种情况下继续改造，事后你根本分不清是谁弄坏的。

拿到 token 后再测一个真正的管理员接口，作为基线的最后一环：

```cmd
set ATOKEN=把上面返回的token粘贴到这里
curl -s -o tmp_test\base_09_adminstats_ok.txt -w "09 GET /api/admin/stats (带token) -> %%{http_code}\n" http://localhost:8080/api/admin/stats -H "Authorization: Bearer %ATOKEN%"
type tmp_test\base_09_adminstats_ok.txt
```
**期望**：`200`，且 `stats` 是**有内容的对象**（不是 `{}`）。

最后把后端日志也存一份基线：
```cmd
docker logs --tail 200 jzxr-local > tmp_test\base_logs.txt 2>&1
findstr /i /c:"error" /c:"TypeError" /c:"Unhandled" tmp_test\base_logs.txt
```
**期望**：`findstr` 无输出（或只有无害的历史噪音）。有输出的话粘给我看。

**验证门 0c 通过标准**：`tmp_test\` 下有 9 个 `base_*.txt` 文件，状态码分别是
`200/200/200/200/200/401/404/200/200`。**这 9 个数字就是本次改造的验收基准，改完必须完全一致。**

> `tmp_test\adminlogin.json` 含明文密码，**基线测完先别删**（第 7.4 节还要用）。
> `tmp_test/` 这条忽略规则**已经预先加进 `.gitignore`（第 94 行）**，就是为了防止阶段 8 的 `git add -A`
> 把管理员密码提交进仓库。请跑一次确认防护确实生效：
> ```cmd
> cd /d E:\website\2.my-two-website
> git check-ignore -v tmp_test\adminlogin.json
> git status --short
> ```
> **期望**：第一条输出 `.gitignore:94:tmp_test/  tmp_test/adminlogin.json`；
> 第二条的输出里**不应该出现任何 `tmp_test` 相关条目**。
> 如果 `git status` 里出现了 `tmp_test/`，**立刻停下来告诉我，不要继续**——
> 说明防护没生效，后面的 `git add -A` 会泄密。

---

### 阶段 1：只改 `db\index.js`（**此阶段结束后服务必然起不来，这是预期的**）

按第 4.2 节把 `db\index.js` 第 1-130 行整段替换。第 131 行往后（crypto/token 部分）**原样保留**。

改完后立刻检查：

```cmd
cd /d E:\website\2.my-two-website\backend
findstr /n /i /c:"deasync" db\index.js
findstr /n /c:"Pool" db\index.js
node -e "require('./db/index.js'); console.log('语法 OK，模块可加载')"
```

**验证门 1**：
- 第一条 `findstr` **必须无任何输出**（deasync 已彻底移除）
- 第二条能看到 `require('pg')` 的 `Pool` 和 `new Pool(pgConfig)`
- 第三条打印 `语法 OK，模块可加载`（说明没有语法错误、没有把 131-250 行改坏）

> **注意：此时不要试图启动 server.js。** 因为第 2 层还在同步调用 `prepare().get()`，
> 现在拿到的是 Promise，一定会出问题。这是正常的中间状态。
> 阶段 1 结束请**先提交一次**，这样万一后面搞乱了可以退回这个点：
> ```cmd
> cd /d E:\website\2.my-two-website
> git add backend/db/index.js
> git commit -m "refactor(db): 用 pg.Pool 替换 deasync + 单 Client，prepare 门面方法改为 async"
> ```

---

### 阶段 2：改第 2 层 `db\*.js`（8 个业务文件）

**逐个文件改，改完一个提交一个**，不要 8 个文件一起改。建议顺序（从简单到复杂，先练手）：

1. `db\field-mappings.js`（6 处，最简单，3 个函数）
2. `db\ratings.js`（8 处，4 个函数）
3. `db\reports.js`（8 处，4 个函数）
4. `db\auth.js`（11 处，5 个函数）
5. `db\admin.js`（22 处，9 个函数）
6. `db\vector.js`（17 处，7 个函数）
7. `db\payments.js`（34 处，16 个函数）
8. `db\users.js`（50 处，17 个函数，**含唯一的 transaction，最难，放最后**）

**每个函数的改法是固定的三步**（以 `db\admin.js` 的 `getAdminPassword` 为例）：

改前：
```js
function getAdminPassword() {
  const database = getDb();
  const stmt = database.prepare('SELECT "value" FROM admin_settings WHERE "key" = $1');
  const row = stmt.get('admin_password');
  return row ? row.value : null;
}
```

改后：
```js
async function getAdminPassword() {
  const database = getDb();
  const stmt = database.prepare('SELECT "value" FROM admin_settings WHERE "key" = $1');
  const row = await stmt.get('admin_password');
  return row ? row.value : null;
}
```

三步：① `function` 前加 `async`；② `stmt.get/all/run/exec(...)` 前加 `await`；③ **其他什么都不动**。
注意 `getDb()` 和 `database.prepare(sql)` **本身不是异步的**（它们只是造对象），**不要给它们加 await**。

**几个必须注意的变形情况：**

**(a) 直接 return 的写法**——加 `await`，不要只加 `async`：
```js
// 改前
function getAdminLogs(limit = 50) {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT $1');
  return stmt.all(limit);
}
// 改后
async function getAdminLogs(limit = 50) {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT $1');
  return await stmt.all(limit);
}
```

**(b) `.all()` 后面接 `.map()` / `.filter()`**——`await` 要用括号包住：
```js
// 改前（db\users.js:123）
return stmt.all(limit, offset).map(dbRowToJson);
// 改后
return (await stmt.all(limit, offset)).map(dbRowToJson);
```
**`dbRowToJson` 保持同步**（它只调同步的 `decrypt`），所以 `.map(dbRowToJson)` 不用改成 `.map(async ...)`。

**(c) 函数内部调用同文件的另一个 db 函数**——也要 `await`。例如 `db\users.js` 的 `searchUsers`
在第 276 行的 for 循环里调 `searchUsersByCustomField(...)`：
```js
// 改前
const matchedIds = searchUsersByCustomField(cf.field_key, cf.field_value, isExact);
// 改后
const matchedIds = await searchUsersByCustomField(cf.field_key, cf.field_value, isExact);
```
**循环里的 `await` 是串行执行**，这里保持串行即可（不要"优化"成 `Promise.all`，那会改变行为，超出本次范围）。

**(d) `db\vector.js` 的 `db.exec(多语句SQL)`**：
```js
// 改前
function initVectorTables() {
  const db = getDb();
  db.exec(`CREATE TABLE ...; CREATE INDEX ...;`);
  db.exec(`COMMENT ON ...; COMMENT ON ...;`);
}
// 改后
async function initVectorTables() {
  const db = getDb();
  await db.exec(`CREATE TABLE ...; CREATE INDEX ...;`);
  await db.exec(`COMMENT ON ...; COMMENT ON ...;`);
}
```

**(e) `try/catch` 里的 db 调用**——`db\users.js:220 getPendingUsers` 是这种：
```js
// 改后
async function getPendingUsers() {
  const database = getDb();
  try {
    const stmt = database.prepare(`SELECT ... WHERE status = 'pending' ORDER BY created_at DESC`);
    return (await stmt.all()).map(dbRowToJson);
  } catch (e) {
    return [];
  }
}
```

**(f) `db\admin.js:68 addCustomFilter` 用了 `info.lastInsertRowid`**——形状已保留，只需加 await：
```js
const info = await stmt.run(fieldKey, fieldLabel, fieldType, fieldOptions, description, now);
return await database.prepare('SELECT * FROM custom_filters WHERE id = $1').get(info.lastInsertRowid);
```

**(g) `db\admin.js:82 deleteCustomFilter` 用了 `info.changes > 0`**：
```js
const info = await stmt.run(id);
return info.changes > 0;
```

**(h) 唯一的事务 —— `db\users.js:181 batchSaveUsers`（最需要小心的一处）**

改前（第 181-204 行）：
```js
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
```

改后：
```js
async function batchSaveUsers(jsonRows) {
  const database = getDb();
  const placeholders = ALL_FIELDS.map((_, i) => `$${i + 1}`).join(', ');
  const updateFields = ALL_FIELDS.slice(2).map((f, i) => f + ' = $' + (i + 1)).join(', ');

  await database.transaction(async (tx) => {
    // 关键：事务内的语句必须用 tx（绑定到同一条连接），不能用外层的 database，
    // 否则会从连接池里取到另一条连接，脱离事务，BEGIN/COMMIT 失效。
    // 因此 insertStmt / updateStmt 也必须在 tx 上重新 prepare。
    const insertStmt = tx.prepare(`INSERT INTO users (${ALL_FIELDS.join(', ')}) VALUES (${placeholders})`);
    const updateStmt = tx.prepare(`UPDATE users SET ${updateFields} WHERE id = $${ALL_FIELDS.length - 1}`);

    for (const jsonRow of jsonRows) {
      if (jsonRow.id) {
        const existing = await tx.prepare('SELECT id FROM users WHERE id = $1').get(jsonRow.id);
        if (existing) {
          const values = jsonToDbRow({ ...jsonRow });
          const updateValues = values.slice(2);
          updateValues.push(jsonRow.id);
          await updateStmt.run(...updateValues);
          continue;
        }
      }
      await insertStmt.run(...jsonToDbRow(jsonRow));
    }
  });
}
```

> 注意旧代码有个奇怪的写法：`const transaction = database.transaction(() => {...}); transaction();`
> —— 旧的 `transaction` 是"传回调进去立刻执行并返回结果"，所以 `transaction()` 实际上是在调用
> `fn()` 的返回值（`undefined`），是**一行无效代码**。新写法直接 `await database.transaction(async (tx) => {...})`，
> 语义才是正确的。**这个行为差异是有意的修正，不是 bug。**

**每改完一个文件的验证门**：

```cmd
cd /d E:\website\2.my-two-website\backend
node -e "require('./db/文件.js'); console.log('OK')"
```
（把"文件"换成实际文件名，如 `node -e "require('./db/admin.js'); console.log('OK')"`）

再检查有没有漏掉 `async` 的函数——用这条命令看每个文件里 `function` 和 `async function` 的数量对不对得上：

```cmd
findstr /n /c:"function " db\admin.js
```
逐行肉眼过一遍：**凡是函数体里出现了 `await`，函数签名就必须有 `async`。** 这是本阶段唯一的硬规则。

每个文件改完提交一次：
```cmd
cd /d E:\website\2.my-two-website
git add backend/db/admin.js
git commit -m "refactor(db): admin.js 数据库访问改为 async/await"
```

**验证门 2**：8 个文件全部改完并提交。此时 `db\` 目录下：
```cmd
cd /d E:\website\2.my-two-website\backend
findstr /s /n /c:"await" db\*.js | find /c "await"
findstr /s /n /c:"async function" db\*.js | find /c "async function"
```
两个数字应该**大致相等**（每个 await 所在的函数都该是 async；一个函数里有多个 await 是正常的，所以前者会明显大于后者——这条只是粗略 sanity check，不用纠结具体数字）。

---

### 阶段 3：改第 3 层 `services\*.js`（6 个文件）

顺序：`auth.service.js` → `ratings.service.js` → `reports.service.js` → `admin.service.js` → `user.service.js` → `vector.service.js`

**`services\captcha.service.js` 和 `services\sms.service.js` 完全不动。**

改法和阶段 2 一样：调用 `xxxDb.*` 的地方加 `await`，所在函数加 `async`。

**(a) 已经是 async 的函数只需补 await**——`services\vector.service.js` 属于这种：
```js
// 改前（第 90 行起）
async function generateAndStoreUserVector(userId) {
  const user = userDb.getUserById(userId);       // ← 漏 await 的典型
  ...
  vectorDb.upsertUserVector(...);                // ← 漏 await 的典型
}
// 改后
async function generateAndStoreUserVector(userId) {
  const user = await userDb.getUserById(userId);
  ...
  await vectorDb.upsertUserVector(...);
}
```
`vector.service.js` 里 `generateEmbedding`、`generateAndStoreUserVector`、`findSimilarUsers`、
`findMutualMatches`、`batchGenerateVectors` **已经是 async**，只需补 `await`；
`getStats`（第 190 行）**要从同步改成 async**，因为它调 `vectorDb.getVectorStats()`。

**(b) `services\admin.service.js` —— 有一个必须特殊处理的坑，见第 5.4 节。**

**(c) `services\user.service.js` 的 15 个函数**里，`authenticateUser(token)`（第 68 行）只调用同步的
`verifyToken`，**理论上可以不改**；但它调完之后如果还碰了 db 就要改。请打开文件确认后再决定，
不确定的话**统一改成 async 更安全**（改成 async 只是让调用方多一个 await，不会错）。

**每个文件改完的验证门**：
```cmd
cd /d E:\website\2.my-two-website\backend
node -e "require('./services/user.service.js'); console.log('OK')"
```
> **注意**：`services\admin.service.js` 在 `require` 时会执行第 11-15 行的模块加载期逻辑，
> 在没连数据库的情况下 `node -e "require('./services/admin.service.js')"` 可能报错或 `process.exit(1)`。
> 这是**改造前就存在的行为**，不是你的 bug。这个文件请用第 5.4 节的方式验证。

改完提交：
```cmd
cd /d E:\website\2.my-two-website
git add backend/services
git commit -m "refactor(services): 业务层适配异步数据库访问"
```

---

### 5.4 【重点】`services\admin.service.js` 的模块加载期查库问题

这是本次改造**最容易踩、后果最严重**的一个坑，单独拎出来讲。

**问题代码（`services\admin.service.js` 第 9-15 行，改造前）**：
```js
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || adminDb.getAdminPassword();
if (!DEFAULT_ADMIN_PASSWORD) {
  console.error('[FATAL] ADMIN_PASSWORD not configured. Set it in .env or database.');
  process.exit(1);
}
```

`adminDb.getAdminPassword()` 出现在**模块顶层**，也就是 `require('services/admin.service.js')` 的那一刻就执行。
CommonJS 顶层**不能 `await`**。改造后这个调用会返回一个 Promise 对象，于是：

- `DEFAULT_ADMIN_PASSWORD` 变成一个 Promise（**Promise 是 truthy**）
- `if (!DEFAULT_ADMIN_PASSWORD)` 判断为 false → **不会 exit(1)，静默通过**
- 后续管理员登录时 `comparePassword(输入密码, Promise对象)` → `storedPassword.startsWith(...)` →
  **TypeError: storedPassword.startsWith is not a function**
- 现象：**管理员登录接口 400 "登录失败"，后台完全进不去，但服务正常启动、无任何启动报错**

**为什么现在看起来没爆，但它仍然是必修项**：

`backend\.env` 里 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` **都已配置**。所以在宿主机上直接
`node server.js` 时，`||` 会短路，`adminDb.getAdminPassword()` 根本不执行；
同理 `getAdminWhitelist()`（`db\admin.js:39-51`）也有 env 快速通道：
```js
const envWhitelist = process.env.ADMIN_WHITELIST || process.env.ADMIN_USERNAME || '';
if (envWhitelist) return envWhitelist.split(',')...;   // ← 走这里，不查库
```
所以在这种跑法下 `isAdminToken()` 实际上是**纯同步、不碰数据库**的。

**但在 Docker 容器里，情况可能完全不同**（见第 1.4 节的"环境变量两个来源"）：
`docker-compose.yml` 第 63-64 行用 `environment:` 注入了
`ADMIN_PASSWORD=${ADMIN_PASSWORD}` 和 `ADMIN_USERNAME=${ADMIN_USERNAME}`，
这两个 `${...}` 由 compose 从**根目录 `E:\website\.env`** 插值。
如果根 `.env` 里**没有**这两个键，compose 会把它们注入为**空字符串**——
即容器里 `process.env.ADMIN_PASSWORD` 是**"已定义但为 `''`"**。
而 `dotenv` **默认不覆盖已存在的键**，所以挂载进来的 `backend\.env` 里的真实密码**会被忽略**。
结果：`'' || adminDb.getAdminPassword()` → **走进了数据库回退分支**。

也就是说：**这条路径在容器里可能本来就是活的，不是"休眠的定时炸弹"。**
你没法靠读代码判断到底是哪种情况，**必须靠阶段 0 的验证门 0c 基线测试来判定**：
- 基线里第 08 项（`POST /api/admin/login`）返回 **200** → 说明现在能取到密码（可能来自 env，也可能来自数据库）
- 改造后如果第 08 项变成 400 + 日志里出现 `storedPassword.startsWith is not a function`
  → **就是本节这个坑**，按下面的方案改

不管基线是哪种情况，**下面的方案都必须实施**——因为它同时消除了"模块加载期查库"这个
CommonJS 根本无法正确表达的写法。

**解决方案（按此改）**：把"启动时读一次"改成"用时异步读"。

```js
// ============================================================
// 业务逻辑层 - 管理员服务（纯业务规则，无 SQL，无 HTTP）
// ============================================================

const adminDb = require('../db/admin');
const { verifyAdminToken } = require('../db/index');
const bcrypt = require('bcrypt');

// 统一默认管理员账号（兼容旧版单一密码）
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

async function getDefaultAdminPassword() {
  // 环境变量优先；未配置时回落到数据库（异步）
  return process.env.ADMIN_PASSWORD || await adminDb.getAdminPassword();
}

async function getAdminWhitelist() {
  const whitelist = await adminDb.getAdminWhitelist();
  // 如果未配置任何白名单，默认将环境变量中的管理员账号加入白名单，避免锁死后台
  if (whitelist.length === 0) {
    return [DEFAULT_ADMIN_USERNAME];
  }
  return whitelist;
}

async function isAdminUsername(username) {
  if (!username) return false;
  const whitelist = await getAdminWhitelist();
  return whitelist.includes(username);
}

// 密码比较：兼容明文密码（旧数据）和 bcrypt 哈希（新数据），登录成功后自动升级
function comparePassword(inputPassword, storedPassword) {
  if (!storedPassword) return false;
  // bcrypt 哈希以 $2a$ 或 $2b$ 开头
  if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$')) {
    return bcrypt.compareSync(inputPassword, storedPassword);
  }
  // 明文密码直接比较
  const match = (inputPassword === storedPassword);
  if (match) {
    // 自动升级为 bcrypt 哈希
    try {
      const hashed = bcrypt.hashSync(inputPassword, 10);
      adminDb.setAdminPassword(hashed);
      console.log('[Admin] 密码已自动升级为 bcrypt 哈希');
    } catch (e) {
      console.warn('[Admin] 密码升级失败:', e.message);
    }
  }
  return match;
}

async function verifyAdminAccount(username, inputPassword) {
  if (!username || !inputPassword) {
    return { success: false, message: '请输入管理员账号和密码' };
  }
  const whitelist = await getAdminWhitelist();
  if (!whitelist.includes(username)) {
    return { success: false, message: '该账号无管理员权限' };
  }

  // 优先读取该账号独立密码；未设置则回退到默认管理员密码
  let expectedPassword = await adminDb.getAdminAccountPassword(username);
  let isAccountPassword = true;
  if (!expectedPassword) {
    expectedPassword = await getDefaultAdminPassword();
    isAccountPassword = false;
  }

  const match = comparePassword(inputPassword, expectedPassword);
  if (!match) {
    return { success: false, message: '管理员账号或密码错误' };
  }
  return { success: true, username };
}

async function isAdminToken(token) {
  if (!token) return false;
  const username = verifyAdminToken(token);   // 同步 HMAC 校验，不用 await
  return !!username && await isAdminUsername(username);
}

module.exports = {
  verifyAdminAccount,
  isAdminToken
};
```

**这个方案里的三个要点：**

1. **删掉了模块加载期的 `adminDb.getAdminPassword()` 调用和那个 `process.exit(1)` 检查。**
   启动期的强校验挪到 `server.js` 的启动流程里去做（见下面第 2 点）。
2. **`comparePassword` 里 `adminDb.setAdminPassword(hashed)` 要加 `await`，
   所以 `comparePassword` 也要变成 `async function`**，
   对应 `verifyAdminAccount` 里改成 `const match = await comparePassword(...)`。
   （上面代码为了展示清晰没加，**你改的时候一定要加**：
   `async function comparePassword(...)` + `await adminDb.setAdminPassword(hashed);` + `const match = await comparePassword(...)`）
3. **`isAccountPassword` 这个变量在旧代码里赋值后从未被使用**，保持原样即可，**不要顺手删**（超出本次范围）。

**在 `server.js` 里补一个启动期校验**（替代被删掉的 `process.exit(1)`），
加在第 496 行 `initConnection().then(async () => {` 回调的最开头、`initVectorTables()` 之前：

```js
initConnection().then(async () => {
  // 启动期强校验：管理员密码必须能从环境变量或数据库取到，否则拒绝启动（替代原 admin.service.js 模块加载期的 process.exit(1)）
  try {
    const adminPwd = process.env.ADMIN_PASSWORD || await adminDb.getAdminPassword();
    if (!adminPwd) {
      console.error('[FATAL] ADMIN_PASSWORD not configured. Set it in .env or database.');
      process.exit(1);
    }
  } catch (e) {
    console.error('[FATAL] 管理员密码校验失败:', e.message);
    process.exit(1);
  }
  // 自动建向量表 + HNSW 索引（若已存在则跳过）
  try { await initVectorTables(); } catch(e) { console.warn('向量表初始化失败（可忽略）：', e.message); }
  server.listen(PORT, () => { ... });
})
```

> `server.js` 第 11 行已经 `const adminDb = require('./db/admin.js');`，可以直接用，不需要新增 require。

### 5.5 【重点】`checkAdminAuth` 变异步 → 23 处调用点

因为 `isAdminToken` 变异步了，`server.js` 第 39-42 行的 `checkAdminAuth` 也必须变异步：

```js
// 改前
function checkAdminAuth(req) {
  const token = getAdminTokenFromRequest(req);
  return adminService.isAdminToken(token);
}
// 改后
async function checkAdminAuth(req) {
  const token = getAdminTokenFromRequest(req);
  return await adminService.isAdminToken(token);
}
```

`checkAdminAuth` 是**作为参数传给各个 route handler** 的，所以这 23 处调用点全部要加 `await`：

| 文件 | 行号 |
|---|---|
| `server.js` | 206、323 |
| `routes\admin-custom-fields.js` | 26、53 |
| `routes\contact-unlock.js` | 75、84、105、125、138、207 |
| `routes\reports.js` | 87、97、115 |
| `routes\upload.js` | 184、194、213、244、266 |
| `routes\users.js` | 100、193、291、301、316 |

> ⚠️ **别被 `findstr` 的行数吓到，也别改错地方。** 在 `backend\` 下跑
> `findstr /s /n /c:"checkAdminAuth" *.js` 会返回 **67 行**，但里面只有 **23 行**是真正的函数调用。
> 剩下的 44 行分两类，**绝对不能加 `await`**：
> - **1 行**是定义本身：`server.js:39` `function checkAdminAuth(req) {`（这行只加 `async`，不加 `await`）
> - **43 行**是"把 `checkAdminAuth` 当值传递"：要么是 `server.js` 里 `handler(req, res, checkAdminAuth, ...)`
>   这种**实参传参**，要么是 `routes\*.js` 里 `function xxx(req, res, checkAdminAuth, pathname) {` 这种**形参名声明**
>   （例如 `routes\users.js:273`、`routes\admin-custom-fields.js:25`）。
>
> **区分方法只有一条**：标识符后面**紧跟左括号** `checkAdminAuth(` 的才是调用；
> 后面是逗号、右括号、或什么符号都没有的，都是传参/声明，原样不动。
> 上表 23 个行号已逐条实测核对，可以直接照改。

改法统一是：
```js
// 改前
if (!checkAdminAuth(req)) { sendJson(res, 401, {...}); return; }
// 改后
if (!await checkAdminAuth(req)) { sendJson(res, 401, {...}); return; }
```
> `!await x` 是合法的 JS（`await` 优先级高于 `!`），但**为了可读性建议写成 `if (!(await checkAdminAuth(req)))`**。

另外还有 **2 处直接调 `adminService.isAdminToken`**（不走 `checkAdminAuth`）：
- `routes\upload.js:27` `const isAdmin = adminService.isAdminToken(token);`
- `routes\users.js:27` `const isAdmin = adminService.isAdminToken(token);`

这两处都在各自的 `getAuthInfo` 类辅助函数里。**这两个辅助函数也要变成 `async`**，
它们的调用方（同文件内的 handler）也要跟着加 `await`。请务必用 `findstr` 把这两个函数的所有调用点找出来：
```cmd
cd /d E:\website\2.my-two-website\backend
findstr /n /c:"getAuthInfo" routes\users.js
findstr /n /c:"isAdminToken" routes\upload.js
```
然后打开 `routes\upload.js` 第 21-30 行看那个函数叫什么名字，同样 `findstr` 出它的所有调用点。

---

### 阶段 4：改第 4 层 `routes\*.js`（10 个文件）

顺序建议：`vector.js`（几乎不用改，先热身）→ `ratings.js` → `reports.js` → `admin-custom-fields.js`
→ `user-custom-fields.js` → `auth.js` → `contact-unlock.js` → `upload.js` → `payment.js` → `users.js`（最大，最后）

**改法**：handler 签名加 `async`；内部调用 `xxxService.*` / `xxxDb.*` / `checkAdminAuth(...)` 前加 `await`。

**关于 `readBodyWithLimit(req).then(body => {...})` 这种既有写法（`auth.js`、`contact-unlock.js`、`reports.js`、`upload.js`、`payment.js`、`users.js` 里大量存在）：**

**推荐保留 `.then()` 结构，只把回调改成 async**，这样 diff 最小、最不容易改错：

```js
// 改前（routes\contact-unlock.js:91-100）
readBodyWithLimit(req).then(body => {
  try {
    const data = JSON.parse(body);
    paymentsDb.approveContactUnlockRequest(id, data.admin_note || '');
    adminDb.logAdminAction('approve_contact_unlock', String(id), { note: data.admin_note || '' });
    sendJson(res, 200, { success: true, message: '已通过审核' });
  } catch (e) { sendJson(res, 500, { success: false, message: e.message }); }
}).catch(e => {
  sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
});

// 改后：只在 .then( 的回调前加 async，并在两个 db 调用前加 await
readBodyWithLimit(req).then(async body => {
  try {
    const data = JSON.parse(body);
    await paymentsDb.approveContactUnlockRequest(id, data.admin_note || '');
    await adminDb.logAdminAction('approve_contact_unlock', String(id), { note: data.admin_note || '' });
    sendJson(res, 200, { success: true, message: '已通过审核' });
  } catch (e) { sendJson(res, 500, { success: false, message: e.message }); }
}).catch(e => {
  sendJson(res, 413, { success: false, message: e.message || '请求体过大' });
});
```

> **这样写是安全的**：`.then(async body => {...})` 里抛出的错会被后面的 `.catch()` 接住；
> 而且外层 handler 本身**不一定需要变成 async**（如果它只做 `return readBodyWithLimit(...).then(...)`）。
> 但为了让 `server.js` 的 `await` 真正等到响应写完，**建议 handler 还是加 `async` 并 `return await`**：
> ```js
> async function approveUnlockRequest(req, res, checkAdminAuth, readBodyWithLimit, pathname) {
>   if (!(await checkAdminAuth(req))) { sendJson(res, 401, {...}); return; }
>   ...
>   return await readBodyWithLimit(req).then(async body => { ... }).catch(e => { ... });
> }
> ```

**`routes\upload.js` 第 248、270 行的 inline require**：
```js
// 改前
const database = require('../db/index').getDb();
const row = database.prepare('SELECT ...').get(id);
// 改后
const database = require('../db/index').getDb();
const row = await database.prepare('SELECT ...').get(id);
```
（`require` 和 `getDb()` 不用 await，只有 `.get()` 要）

**`routes\contact-unlock.js` 第 182-185、198-201 行同理。**

**`routes\auth.js:75`**：
```js
// 改前
const userId = authService.getCurrentUser(token)?.id;
// 改后
const userId = (await authService.getCurrentUser(token))?.id;
```
注意**括号不能少**，否则 `await` 会作用在 `?.id` 之后。

**每个文件改完的验证门**：
```cmd
cd /d E:\website\2.my-two-website\backend
node -e "require('./routes/contact-unlock.js'); console.log('OK')"
```

全部改完提交：
```cmd
cd /d E:\website\2.my-two-website
git add backend/routes
git commit -m "refactor(routes): 路由层适配异步数据库访问"
```

---

### 阶段 5：改第 5 层 `server.js`

1. **第 39-42 行**：`checkAdminAuth` 改 async（见第 5.5 节）
2. **所有 handler 分发点加 `await`**。用这条命令把全部分发点列出来，逐个改：
   ```cmd
   cd /d E:\website\2.my-two-website\backend
   findstr /n /c:"Routes." server.js
   ```
   改法：`userRoutes.getUsers(req, res, null, parsedUrl); return;` → `await userRoutes.getUsers(req, res, null, parsedUrl); return;`
   > 涉及的变量名有：`uploadRoutes`、`contactUnlockRoutes`、`authRoutes`、`userRoutes`、
   > `userCustomFieldsRoutes`、`ratingRoutes`、`reportRoutes`、`paymentRoutes`、`adminCustomFieldsRoutes`。
   > **第 264 行 `await handleVectorRequest(req, res)` 已经有 await，不要重复加。**
3. **第 206、323 行**：`if (!checkAdminAuth(req))` → `if (!(await checkAdminAuth(req)))`
4. **第 327、364、434、438、451、455 行**：inline db 调用加 `await`
5. **第 496-512 行**：`initConnection().then(() => {` → `.then(async () => {`，
   并按第 5.4 节末尾插入管理员密码启动校验 + `await initVectorTables()`
6. **第 519-523 行 `uncaughtException`**：见下面

**关于 `closeDb()`（第 6.5 节陷阱）**：

`closeDb()` 现在是 async 的，但它被调用的三个地方都是**同步上下文**：
```js
process.on('uncaughtException', (error) => {       // 第 519 行，同步回调
  console.error('[Uncaught Exception]', error);
  try { dbIndex.closeDb(); } catch(e) {}           // ← 现在返回 Promise，try/catch 抓不到异步错误
  process.exit(1);                                  // ← 立刻退出，closeDb 根本没机会跑完
});
```
`SIGINT`（第 526 行）和 `SIGTERM`（第 537 行）里的 `server.close(() => { ... })` 回调同理。

**处理方式（保持最简，不要过度设计）**：
```js
process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
  // closeDb 现在是异步的；进程即将退出，这里不等待、只吞掉可能的 rejection
  dbIndex.closeDb().catch(() => {});
  process.exit(1);
});
```
`SIGINT` / `SIGTERM` 里改成：
```js
server.close(() => {
  dbIndex.closeDb().catch(() => {}).then(() => {
    console.log('[Server] 已关闭');
    process.exit(0);
  });
});
```
（后面那个 `setTimeout(() => process.exit(1), 10000)` 强制退出兜底保持不动）

改完提交：
```cmd
cd /d E:\website\2.my-two-website
git add backend/server.js
git commit -m "refactor(server): 路由分发点补 await，启动期补管理员密码校验"
```

---

### 阶段 6：删掉 `deasync` 依赖 + 首次启动

```cmd
cd /d E:\website\2.my-two-website\backend
npm uninstall deasync
findstr /s /i /c:"deasync" *.js
findstr /n /c:"deasync" package.json
```

**验证门 6a**：两条 `findstr` 都**必须无输出**（`package-lock.json` 里可能还有残留记录，
`npm uninstall` 会自动更新它，不用管）。

然后本地直接起服务（不走 Docker，方便看报错）：

```cmd
cd /d E:\website\2.my-two-website\backend
node server.js
```

> 前提：`postgres` 容器在跑（`docker ps` 确认），且 `backend\.env` 里 `PG_HOST` 指向容器。
> **注意**：`.env` 里写的是 `PG_HOST=postgres`（Docker 网络内的容器名），
> 在宿主机上直接 `node server.js` 会连不上。有两个选择：
> - **选择 A（推荐，最省事）**：直接用 Docker 起，见下面的 `docker compose` 命令
> - **选择 B**：临时用环境变量覆盖后启动（**不要改 .env 文件**）：
>   ```cmd
>   set PG_HOST=localhost&& set PG_PORT=5433&& node server.js
>   ```
>   （`&&` 前不能有空格，否则空格会被算进变量值；测完记得关掉这个 cmd 窗口，别让 `set` 污染环境）

用 Docker 起（**注意：compose 文件在 `E:\website\` 根目录，不在站2 目录里，所以要先 cd 上去**）：
```cmd
cd /d E:\website
docker compose up -d --build jzxr
docker logs --tail 60 jzxr-local
```
> `docker compose` 用**服务名** `jzxr`；`docker logs` / `docker exec` 用**容器名** `jzxr-local`。
> 两者不一样，见第 1.4 节的对照表。如果命令报 "no such service" 或 "No such container"，
> 先跑 `docker ps --format "{{.Names}}\t{{.Image}}\t{{.Ports}}"` 核对实际名字，把输出粘给我。

**验证门 6b（关键）**：日志里必须看到那个启动横幅：
```
╔══════════════════════════════════════════╗
║     精准匹配 - 后端服务已启动            ║
╠══════════════════════════════════════════╣
║  API地址: http://localhost:8080           ║
╚══════════════════════════════════════════╝
```
并且**不能有** `数据库连接失败`、`[FATAL]`、`[Unhandled Rejection]`、`向量表初始化失败`。

> ⚠️ **但是：服务能启动 ≠ 改造成功。** 漏掉 `await` 完全不影响启动。
> 真正的验证在阶段 7，**阶段 7 不做完，这个任务就不算完成。**

---

### 阶段 7：全接口回归验证（**最重要的阶段，不许跳过**）

见第 7 节。

---

### 阶段 8：收尾

1. **删掉过期注释**：`services\admin.service.js` 里那条
   `// 注意：必须用同步bcrypt，因为deasync DB层与async/await冲突会导致死锁`
   ——deasync 已经没了，这条注释现在是误导。（如果你按第 5.4 节整体替换了该文件，这条应该已经没了）
2. **更新文档**（用户要求：部署/依赖变更后同轮更新对应中文 md）：
   - `README.md` / `CLAUDE.md` 里如果提到 deasync 或同步数据库访问，要改
   - 检查命令：
     ```cmd
     cd /d E:\website\2.my-two-website
     findstr /s /i /n /c:"deasync" *.md
     ```
3. **Docker 镜像重建验证**（只重建站2 后端，**不要**连带重建站1/站3）：
   ```cmd
   cd /d E:\website
   docker compose up -d --build jzxr
   docker ps --format "{{.Names}}\t{{.Status}}\t{{.Ports}}"
   docker logs --tail 40 jzxr-local
   ```
   去掉 deasync 之后后端镜像构建应该**变快**（少编译一个原生模块）。
   > 前端没动，所以 `jzxr-web` 不需要重建。**绝对不要**跑不带服务名的 `docker compose up -d --build`，
   > 那会把 `twym`（站1）和 `style-ai`（站3）一起重建，耗时且可能打断正在用的服务。
4. **提交**：
   ```cmd
   cd /d E:\website\2.my-two-website
   git status
   git add -A
   git commit -m "chore: 移除 deasync 依赖并同步文档"
   git log --oneline -12
   ```
5. **不要 `git push`。** 推送由用户自己做。

---

## 6. 高危陷阱清单（每一条都会导致"不报错但功能是坏的"）

### 6.1 漏 `await` = 静默 bug（**头号风险**）

漏掉 `await` **不会抛错、不会打日志、不会让服务崩溃**。表现是：

| 症状 | 说明 |
|---|---|
| JSON 响应里出现 `{}` | Promise 被 `JSON.stringify` 序列化成空对象。例如 `{"success":true,"data":{}}` |
| 字段变成 `null` / `undefined` | `const user = userDb.getUserById(id)` 拿到 Promise，`user.name` → `undefined` |
| `TypeError: xxx.then is not a function` 或 `xxx is not iterable` | 把 Promise 当数组/对象用了 |
| `TypeError: Cannot read properties of undefined` | 对 Promise 取属性 |
| 写入操作"成功了"但数据库里没数据 | `stmt.run(...)` 没 await，Promise 还没执行完请求就返回了 |
| 管理员登录返回 400，但服务启动正常 | 见第 6.2 节 |
| 接口返回 500 "服务器内部错误" | 被 `server.js` 第 481 行的兜底 catch 接住了，去看 `docker logs jzxr` |

**排查手段**：任何接口返回可疑的空数据，第一件事是看后端日志：
```cmd
docker logs --tail 100 jzxr
```

**自查规则（改每个文件时反复默念）**：
> 凡是调用了「`db\` 目录下任何模块的任何导出函数」、「`services\` 目录下任何模块的任何导出函数（`captcha.service` / `sms.service` 除外）」、
> 「`stmt.get/all/run/exec`」、「`db.exec`」、「`db.transaction`」、「`checkAdminAuth`」、「`isAdminToken`」的地方，
> **前面必须有 `await`，或者整行是 `return xxx(...)` 且所在函数是 `async`。**

### 6.2 模块加载期（require 时）不能查库

CommonJS 顶层不能 `await`。全项目已排查出**一处**：`services\admin.service.js` 第 11 行。
详见第 5.4 节，**必须按那里的方案改**。

改完之后请再自己扫一遍，确认没有第二处：
```cmd
cd /d E:\website\2.my-two-website\backend
findstr /s /n /c:"Db.get" /c:"Db.set" /c:"Db.add" /c:"Db.getAll" *.js
```
逐条看命中的行**是否在某个 `function` 内部**。如果在文件顶层（缩进为 0，且不在任何函数里），就是同类问题，要报给我。

### 6.3 `pg` 的 simple query vs extended query（多语句 SQL 会炸）

`db\vector.js:8` 和 `db\vector.js:24` 的 `db.exec(...)` 传的是**一次包含多条语句的 SQL**
（`CREATE TABLE ...; CREATE INDEX ...; CREATE INDEX ...;`）。

PostgreSQL 的 **extended query 协议（带参数绑定）不允许一次发多条语句**，会报：
`cannot insert multiple commands into a prepared statement`

node-pg 的规则是：**只要传了 values 数组（哪怕是空数组 `[]`），就可能走 extended 协议。**

所以第 4.2 节的 `runQuery` 里那句判断**不是可选的优化，是必需的**：
```js
if (!params || params.length === 0) return executor.query(sql);   // 只传 sql → simple query → 多语句 OK
return executor.query(sql, params);                                // 有参数 → extended query
```

**如果你自作主张把它简化成 `return executor.query(sql, params || [])`，向量表会建不出来，
启动日志里会出现 `向量表初始化失败（可忽略）：cannot insert multiple commands...`。**
虽然那条日志写着"可忽略"，但向量匹配功能（`/api/vector/*`）会全废。**看到这条日志就是出问题了，不许忽略。**

### 6.4 事务里的语句必须绑定同一条连接

连接池模式下，`getDb()` 每次取到的可能是**不同的连接**。
如果事务回调内部用外层的 `database.prepare(...)`，那些语句会跑到别的连接上，
**BEGIN/COMMIT 对它们无效** —— 结果是"事务"名存实亡：部分成功、部分失败、无法回滚。

**全项目只有一个事务**：`db\users.js:181 batchSaveUsers`。
必须严格按**阶段 2 的 (h) 唯一的事务（`db\users.js:181 batchSaveUsers`）**的写法改：回调签名 `async (tx) => {...}`，内部**所有** `prepare` 都从 `tx` 上取。

改完这个函数后，**必须专门测试批量保存接口**（`POST /api/users/batch`，见第 7 节），
并且要测"故意让其中一条失败"的场景，确认整批回滚（数据库里一条都没多）。

### 6.5 `closeDb()` 在同步上下文里被调用

`server.js` 的 `uncaughtException` / `SIGINT` / `SIGTERM` 三个处理器都是同步回调，
里面 `dbIndex.closeDb()` 现在返回 Promise。按第 5 节阶段 5 第 6 点处理（`.catch(() => {})`）。

**不改的后果**：进程退出时打印一条 `UnhandledPromiseRejection`，或者 `pool.end()` 根本没执行完就 `process.exit()`
（后者其实无害，pg 连接会被操作系统回收，但日志会脏）。

### 6.6 `dbRowToJson` / `jsonToDbRow` / `encrypt` / `decrypt` 必须保持同步

`db\users.js` 里大量使用 `.map(dbRowToJson)`、`.filter(...)`、`jsonToDbRow(jsonRow)`。
这几个函数只做**内存里的字段名转换 + 同步 AES 加解密**，不碰数据库。

**如果你手贱给它们加了 `async`**，`.map(dbRowToJson)` 会返回一个 **Promise 数组**，
`JSON.stringify` 之后变成 `[{},{},{},...]`，整个用户列表接口全废，而且**不报错**。

同理不能动的：`db\index.js` 的 `hashPasswordSync`、`verifyPasswordSync`、`encrypt`、`decrypt`、
`generateToken`、`verifyToken`、`generateAdminToken`、`verifyAdminToken`。

### 6.7 `.env` 是机密，且不在 git 里

`backend\.env` 含数据库密码、`TOKEN_SECRET`、`ENCRYPTION_KEY`。
- **不要** `git add backend/.env`
- **不要** `type backend\.env` 把内容打印到对话里
- **不要**修改它（本次改造不需要动任何环境变量）
- 需要看有哪些键名时用：`findstr /r /c:"^[A-Z_]*=" backend\.env`（**但这也会带出值，谨慎使用**）

### 6.8 Windows 行尾符（CRLF / LF）

这个仓库的 `.js` 文件是 **LF** 行尾。如果你的编辑器保存成了 CRLF，
`git diff` 会显示**整个文件每一行都被改了**，把真实的改动淹没，代码审查完全失效。

**每改完一个文件，提交前必须检查**：
```cmd
cd /d E:\website\2.my-two-website
git diff --stat
git diff --numstat backend/db/admin.js
```
`--numstat` 输出两列数字（新增行数 / 删除行数）。**如果你只加了几个 `await`，
但数字显示比如 `95  94`（几乎整个文件），说明行尾被改成 CRLF 了**，必须修回来。

修复办法（cmd 下最可靠的方式是用 Node 脚本，不要找 `tr` / `dos2unix`，Windows 上没有）：
```cmd
cd /d E:\website\2.my-two-website\backend
node -e "const f='db/admin.js',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'))"
git diff --numstat backend/db/admin.js
```
（把 `db/admin.js` 换成实际文件；相对路径是相对 `backend\` 目录）

**建议**：改代码前先确认编辑器设置成 LF。或者干脆每改完一个文件就跑一次上面那条 `node -e`，无害。

### 6.9 不要做的事

- ❌ 不要"顺手"把 `.then()` 链改写成 `async/await` 风格（除非该函数本来就要改）——会放大 diff，增加改错概率
- ❌ 不要"顺手"修任何已知的其他问题（性能、索引、N+1 查询等）——那些是别的任务
- ❌ 不要改 SQL 语句本身
- ❌ 不要改任何接口路径、请求/响应格式、状态码
- ❌ 不要改前端 `app\` 里的任何文件（本次是纯后端改造，前端无感知）
- ❌ 不要 `git push`
- ❌ 不要 `git rebase` / `git reset --hard` / `git checkout .` / `git clean`
- ❌ 不要删除或重建 Docker volume（`postgres` 的数据卷里有真实数据）
- ❌ 不要 `docker compose down -v`（`-v` 会删数据卷 = 删库）

---

## 7. 全接口回归验证方案（阶段 7 的具体内容）

**核心原则：服务能启动什么都证明不了。必须逐个接口打一遍，看返回的 JSON 对不对。**

### 7.1 准备工作

Windows 10/11 自带 `curl.exe`，在 cmd 里可以直接用 `curl`。

**JSON 请求体建议写进文件再用 `-d @文件名`**，避免 cmd 里转义双引号的麻烦：

```cmd
cd /d E:\website\2.my-two-website
mkdir tmp_test 2>nul
```

> cmd 的 `echo` 会在 `>` 前多写一个空格，所以写 JSON 文件时**重定向符号要紧挨着内容**：
> ```cmd
> echo {"phone":"13900000001","password":"Test123456","nickname":"回归测试号"}> tmp_test\reg.json
> ```
> 或者更稳妥：让 Kimi 用编辑器直接创建这些 json 文件（**推荐**，避免 echo 的编码和空格问题）。
> 注意文件要存成 **UTF-8 无 BOM**，否则后端 `JSON.parse` 会失败。

### 7.2 第一组：无需登录的公开接口

| # | 命令 | 期望 |
|---|---|---|
| 1 | `curl -s http://localhost:8080/api/users` | `{"success":true,...}` 且 **`data` 是数组，不是 `{}`** |
| 2 | `curl -s "http://localhost:8080/api/users?page=1&limit=5"` | 同上，最多 5 条 |
| 3 | `curl -s "http://localhost:8080/api/users/search?city=%E5%8C%97%E4%BA%AC"` | `success:true`，有 `data`/`count` |
| 4 | `curl -s http://localhost:8080/api/users/all-custom-fields` | `{"success":true,"data":...}` |
| 5 | `curl -s http://localhost:8080/api/field-mappings` | `{"success":true,"data":[...]}`，**`data` 非空数组** |
| 6 | `curl -s -i http://localhost:8080/api/field-mappings` | 响应头里有 `ETag`。**记下这个 ETag 值** |
| 7 | `curl -s -i -H "If-None-Match: <上一步的ETag>" http://localhost:8080/api/field-mappings` | **HTTP 304**（这条专门验证 `getCacheVersion` 的 await 有没有漏） |
| 8 | `curl -s http://localhost:8080/api/field-mappings/labels` | `{"success":true,"data":{...}}`，**`data` 是非空对象**（验证 `getFieldLabelMap`） |
| 9 | `curl -s http://localhost:8080/api/custom-fields` | `success:true`（验证 `getAllCustomFilters`） |
| 10 | `curl -s http://localhost:8080/api/auth/captcha` | `{"success":true,"data":{...}}`（**纯内存，应该照常工作**，用来确认服务基本健康） |
| 11 | `curl -s http://localhost:8080/wechat-qr.png -o tmp_test\w.png` 然后 `dir tmp_test\w.png` | 文件 > 0 字节（静态文件服务未受影响） |
| 12 | `curl -s -i http://localhost:8080/admin` | HTTP 200，返回 HTML |
| 13 | `curl -s -i http://localhost:8080/admin/main` | HTTP 200，返回 HTML |
| 14 | `curl -s -i http://localhost:8080/api/不存在的接口` | **HTTP 404** `Not Found`（验证分发链末尾没被改坏） |

> **第 7 条（ETag → 304）和第 8 条（labels）特别容易暴露漏 await**，务必测。
> 漏 await 时 `getCacheVersion()` 返回 Promise，`String(Promise)` = `"[object Promise]"`，
> ETag 会变成这个字符串，304 永远不命中，或者 labels 返回 `{}`。

### 7.3 第二组：注册 + 用户登录（拿 user token）

`routes\auth.js` 的注册接口**验证码校验已被注释掉**（第 24-28 行），所以可以直接注册：

```cmd
cd /d E:\website\2.my-two-website
echo {"phone":"13900000001","password":"Test123456","nickname":"回归测试号"}> tmp_test\reg.json
curl -s -X POST http://localhost:8080/api/auth/register -H "Content-Type: application/json" -d @tmp_test\reg.json
```
期望：`{"success":true,"token":"...."}`。**把 token 复制出来**，后面要用。
如果返回"该手机号已注册"，换一个手机号再试。

```cmd
echo {"phone":"13900000001","password":"Test123456"}> tmp_test\login.json
curl -s -X POST http://localhost:8080/api/auth/login -H "Content-Type: application/json" -d @tmp_test\login.json
```
期望：`{"success":true,"token":"...."}`
> 这条同时验证了 `auth.service.js` 的 `login` → `authDb.verifyAuthUser` → `verifyPasswordSync` 整条链。
> **如果返回 401 但密码确认没错，八成是 `verifyAuthUser` 漏了 await**（拿到 Promise，`Promise.password` 是 undefined）。

设个变量省得重复粘贴（cmd 里 `set` 后面**不要**加引号，`&&` 前不要留空格）：
```cmd
set UTOKEN=粘贴上面拿到的token
```

用 user token 测：

| # | 命令 | 期望 |
|---|---|---|
| 15 | `curl -s http://localhost:8080/api/users/my -H "Authorization: Bearer %UTOKEN%"` | `{"success":true,...}`，**能看到刚注册的 nickname** |
| 16 | `curl -s http://localhost:8080/api/users/my-deposit -H "Authorization: Bearer %UTOKEN%"` | `success:true`（可能是 `data:null`，正常，因为没交过押金） |
| 17 | `curl -s -X PUT http://localhost:8080/api/users/my -H "Authorization: Bearer %UTOKEN%" -H "Content-Type: application/json" -d "{\"data\":{\"city\":\"北京\"}}"` | `success:true` |
| 18 | 重复第 15 条 | **city 应该变成"北京"**（验证写入真的落库了，不是"返回成功但没写"） |
| 19 | `curl -s "http://localhost:8080/api/users/1/ratings"` | `success:true`（公开接口，验证 `getRatingsForUser` + `getAverageRating`） |
| 20 | `curl -s -X POST http://localhost:8080/api/ratings -H "Authorization: Bearer %UTOKEN%" -H "Content-Type: application/json" -d "{\"rated_id\":\"1\",\"rating\":5,\"comment\":\"回归测试评价\"}"` | `success:true` 或有业务提示（如"不能评价自己"）——**只要不是 500 就说明链路通了** |
| 21 | 重复第 19 条 | 如果第 20 条成功，这里应该能看到新评价 |
| 22 | `curl -s -X POST http://localhost:8080/api/reports -H "Authorization: Bearer %UTOKEN%" -H "Content-Type: application/json" -d "{\"reported_id\":\"1\",\"report_type\":\"其他\",\"description\":\"回归测试举报\"}"` | 同上，非 500 即可 |
| 23 | `curl -s "http://localhost:8080/api/users/1/check-unlock" -H "Authorization: Bearer %UTOKEN%"` | `{"success":true,"unlocked":false,...}` 或 `unlocked:true` + `contact`。**不能是 `{}`** |
| 24 | `curl -s http://localhost:8080/api/vector/stats -H "Authorization: Bearer %UTOKEN%"` | `{"success":true,"data":{"total_vectors":<数字>,...}}`。**`total_vectors` 必须是数字，不能是 `{}` 或缺失**（专门验证 `vector.service.getStats` 改成 async 后 `routes\vector.js:45` 的 await 有没有加上） |
| 25 | `curl -s -X POST http://localhost:8080/api/auth/change-password -H "Authorization: Bearer %UTOKEN%" -H "Content-Type: application/json" -d "{\"oldPassword\":\"Test123456\",\"newPassword\":\"Test123456\"}"` | 非 500。**注意这条会真的改密码**，测完记得用新密码登录一次确认 |

### 7.4 第三组：管理员接口（拿 admin token）—— **重灾区，必须全测**

`tmp_test\adminlogin.json` **验证门 0c 阶段已经建好了，当时特意没删就是留给这里用的**（见第 516 行）。
直接复用，**不要重新生成**：

```cmd
cd /d E:\website\2.my-two-website
dir tmp_test\adminlogin.json
curl -s -X POST http://localhost:8080/api/admin/login -H "Content-Type: application/json" -d @tmp_test\adminlogin.json
```

期望：`{"success":true,"token":"...","username":"admin"}`

> ⚠️ **绝对不要用 `echo {"username":...,"password":"真实密码"}> tmp_test\adminlogin.json` 这种方式重建文件。**
> 那样做会把管理员密码敲进命令行、永久留在 cmd 历史里，而且你为了让我/Kimi 看到命令
> 就会把密码粘进对话 —— 三重泄露。文件真的不存在时，**用记事本建**：
> ```cmd
> notepad tmp_test\adminlogin.json
> ```
> 内容写 `{"username":"admin","password":"你的真实密码"}`，存成 **UTF-8 无 BOM**，
> 然后**只把 curl 那条命令的输出粘进对话，不要把密码粘进来**。

> **这是第 5.4 节那个坑的照妖镜。** 如果这里返回 400 / `{"success":false,"message":"登录失败"}`，
> 同时 `docker logs jzxr` 里有 `TypeError: storedPassword.startsWith is not a function`，
> 说明 `admin.service.js` 没按第 5.4 节改对。**这是本次改造最可能翻车的地方。**
>
> **测完立刻删掉这个含明文密码的临时文件**：`del tmp_test\adminlogin.json`

```cmd
set ATOKEN=粘贴上面拿到的admin token
```

| # | 命令 | 期望 |
|---|---|---|
| 26 | `curl -s http://localhost:8080/api/admin/stats -H "Authorization: Bearer %ATOKEN%"` | `{"success":true,"stats":{...}}`，**`stats` 是有内容的对象**（验证 `server.js:327` 的 `await userDb.getUserStats()`） |
| 27 | `curl -s http://localhost:8080/api/users/pending -H "Authorization: Bearer %ATOKEN%"` | `success:true` + 数组（验证 `getPendingUsers` 的 try/catch + await） |
| 28 | `curl -s http://localhost:8080/api/admin/deposits -H "Authorization: Bearer %ATOKEN%"` | `success:true` + 数组 |
| 29 | `curl -s http://localhost:8080/api/admin/unlock-contact-requests -H "Authorization: Bearer %ATOKEN%"` | `success:true` + 数组 |
| 30 | `curl -s http://localhost:8080/api/admin/unlock-records -H "Authorization: Bearer %ATOKEN%"` | `success:true` + 数组 |
| 31 | `curl -s http://localhost:8080/api/reports -H "Authorization: Bearer %ATOKEN%"` | `success:true` + 数组，**应该能看到第 22 条提交的举报** |
| 32 | `curl -s -X POST http://localhost:8080/api/admin/custom-fields -H "Authorization: Bearer %ATOKEN%" -H "Content-Type: application/json" -d "{\"field_key\":\"回归测试字段\",\"field_label\":\"回归测试\",\"field_type\":\"text\"}"` | `success:true`，**且返回的对象里要有 `id`**（专门验证 `addCustomFilter` 的 `info.lastInsertRowid` 链路） |
| 33 | 重复第 9 条 `curl -s http://localhost:8080/api/custom-fields` | **应该能看到刚加的"回归测试字段"** |
| 34 | `curl -s -X DELETE http://localhost:8080/api/admin/custom-fields/<第32条返回的id> -H "Authorization: Bearer %ATOKEN%"` | `success:true`（验证 `deleteCustomFilter` 的 `info.changes > 0`） |
| 35 | 重复第 9 条 | **"回归测试字段"应该消失了**（验证 DELETE 真的执行了） |
| 36 | `curl -s -X POST http://localhost:8080/api/users/1/approve -H "Authorization: Bearer %ATOKEN%"` | `success:true` |
| 37 | `curl -s -X PUT http://localhost:8080/api/users/1 -H "Authorization: Bearer %ATOKEN%" -H "Content-Type: application/json" -d "{\"data\":{\"city\":\"上海\"}}"` | `success:true`，然后 `curl -s http://localhost:8080/api/users` 确认 city 变了 |
| 38 | `curl -s -X POST http://localhost:8080/api/users/1/unlock-contact -H "Authorization: Bearer %ATOKEN%" -H "Content-Type: application/json" -d "{\"viewer_id\":\"<你的测试用户id>\"}"` | `success:true`（验证 `unlockContact` + `logAdminAction`） |
| 39 | `curl -s -i http://localhost:8080/api/admin/stats` （**不带 token**） | **HTTP 401** `需要管理员权限` ← **这条极其重要，见下方说明** |
| 40 | `curl -s -i http://localhost:8080/api/admin/deposits -H "Authorization: Bearer 假的token"` | **HTTP 401**，不能是 200 |

> ⚠️ **第 39、40 条是安全回归测试，绝对不能跳过。**
> `checkAdminAuth` 改成 async 之后，如果某个调用点漏了 `await`，
> `if (!(await checkAdminAuth(req)))` 会变成 `if (!Promise)` ——
> **而 `!Promise` 恒等于 `false`（Promise 是 truthy）**，
> 于是**鉴权判断永远通过，任何人都能访问管理员接口**。
> 这是本次改造**最危险的一种失败模式**：功能全正常、无报错、无日志，但后台彻底裸奔。
> **必须用"不带 token"和"带假 token"两种方式，把所有管理员接口都试一遍，确认全部返回 401。**
>
> 需要这样测的管理员接口全清单（每个都要测"不带 token"和"带假 token"两种）：
> ```
> GET    /api/admin/stats
> GET    /api/users/pending
> PUT    /api/users/:id
> POST   /api/users/:id/approve
> POST   /api/users/:id/reject
> POST   /api/users/:id/unlock-contact
> POST   /api/users/batch
> GET    /api/reports
> PUT    /api/reports/:id/status
> DELETE /api/reports/:id
> GET    /api/admin/deposits
> PUT    /api/admin/deposits/:id/approve
> PUT    /api/admin/deposits/:id/reject
> GET    /api/admin/deposits/proof/:id
> DELETE /api/admin/deposits/:id
> GET    /api/admin/unlock-contact-requests
> PUT    /api/admin/unlock-contact-requests/:id/approve
> PUT    /api/admin/unlock-contact-requests/:id/reject
> DELETE /api/admin/unlock-contact-requests/:id
> GET    /api/admin/unlock-records
> POST   /api/admin/custom-fields
> DELETE /api/admin/custom-fields/:id
> GET    /api/admin/m        ← 这个是页面，未登录应该返回登录页 HTML 而不是管理页
> ```
> 批量测法（cmd 里写个 for 循环）：
> ```cmd
> for %u in (stats) do @curl -s -o nul -w "%{http_code} /api/admin/%u\n" http://localhost:8080/api/admin/%u
> ```
> 期望输出 `401`。**如果输出 `200`，立刻停下来报告，这是严重安全问题。**

### 7.5 第四组：批量保存 + 事务回滚（**唯一的 transaction，必须专门测**）

`POST /api/users/batch` 走的是 `db\users.js:batchSaveUsers`，全项目唯一的事务。

**正向测试**（准备一个含 2 条记录的 JSON 文件 `tmp_test\batch.json`，用编辑器创建，UTF-8 无 BOM）：
```json
[
  { "data": { "name": "批量测试A", "gender": "女", "age": "28", "city": "广州", "contact": "13800000001" } },
  { "data": { "name": "批量测试B", "gender": "男", "age": "30", "city": "深圳", "contact": "13800000002" } }
]
```
```cmd
curl -s -X POST http://localhost:8080/api/users/batch -H "Authorization: Bearer %ATOKEN%" -H "Content-Type: application/json" -d @tmp_test\batch.json
curl -s "http://localhost:8080/api/users/search?name=%E6%89%B9%E9%87%8F%E6%B5%8B%E8%AF%95"
```
期望：**两条都能搜到**。如果只进去一条或一条都没进去，说明事务连接绑定有问题（第 6.4 节）。

**特别验证 `contact` 字段的加解密**（这条链路同时经过 `jsonToDbRow`→`encrypt` 和 `dbRowToJson`→`decrypt`）：
```cmd
curl -s -X POST http://localhost:8080/api/users/1/unlock-contact -H "Authorization: Bearer %ATOKEN%" -H "Content-Type: application/json" -d "{\"viewer_id\":\"<测试用户id>\"}"
curl -s "http://localhost:8080/api/users/<批量测试A的id>/check-unlock" -H "Authorization: Bearer %UTOKEN%"
```
期望：返回的 `contact` 是**明文 `13800000001`**，不是一串 hex 密文、不是 `null`、不是 `{}`。

**回滚测试（可选但强烈推荐）**：故意提交一批里含一条非法数据的 JSON（比如某条缺必填字段导致 SQL 报错），
然后查数据库确认**整批都没有写入**：
```cmd
docker exec postgres psql -U postgres -d match_db -c "SELECT COUNT(*) FROM users WHERE name LIKE '批量测试%';"
```

**清理测试数据**：
```cmd
docker exec postgres psql -U postgres -d match_db -c "DELETE FROM users WHERE name LIKE '批量测试%';"
docker exec postgres psql -U postgres -d match_db -c "DELETE FROM auth_users WHERE phone = '13900000001';"
```
> ⚠️ 执行 `DELETE` 前先跑一遍 `SELECT` 确认命中的行数和内容，**确认没有误删真实数据**。
> 把 `SELECT` 的结果粘给我看一眼再删。

### 7.6 第五组：文件上传（multipart，走的是另一套 body 解析）

上传接口用 `parseMultipart` 而不是 `readBodyWithLimit`，改动方式不同，要单独测。

准备一张小图片 `tmp_test\t.png`（随便找一张 png 复制过来改名），然后：
```cmd
curl -s -X POST http://localhost:8080/api/upload/avatar -H "Authorization: Bearer %UTOKEN%" -F "avatar=@tmp_test\t.png"
```
期望：`success:true` 且返回一个 `/uploads/...` 或 `/avatars/...` 路径。
把返回的路径拼到 URL 上再 GET 一次，确认图片能取回来：
```cmd
curl -s -i http://localhost:8080<返回的路径>
```
期望：HTTP 200 + `Content-Type: image/png`。

```cmd
curl -s -X POST http://localhost:8080/api/deposit/upload-proof -H "Authorization: Bearer %UTOKEN%" -F "proof=@tmp_test\t.png" -F "amount=999"
curl -s http://localhost:8080/api/admin/deposits -H "Authorization: Bearer %ATOKEN%"
```
期望：第一条 `success:true`；第二条的列表里能看到刚提交的押金记录。
然后测审核：
```cmd
curl -s -X PUT http://localhost:8080/api/admin/deposits/<id>/approve -H "Authorization: Bearer %ATOKEN%" -H "Content-Type: application/json" -d "{\"admin_note\":\"回归测试通过\"}"
curl -s http://localhost:8080/api/users/my-deposit -H "Authorization: Bearer %UTOKEN%"
```
期望：状态变成已通过；用户的 `deposit`（押金）字段应该相应增加。

### 7.7 第六组：向量接口

```cmd
curl -s http://localhost:8080/api/vector/stats -H "Authorization: Bearer %UTOKEN%"
curl -s -X POST "http://localhost:8080/api/vector/generate/<你自己的用户id>" -H "Authorization: Bearer %UTOKEN%"
curl -s "http://localhost:8080/api/vector/similar/<你自己的用户id>?limit=5" -H "Authorization: Bearer %UTOKEN%"
curl -s "http://localhost:8080/api/vector/match/<你自己的用户id>?limit=5" -H "Authorization: Bearer %UTOKEN%"
curl -s -X POST http://localhost:8080/api/vector/batch -H "Authorization: Bearer %UTOKEN%" -H "Content-Type: application/json" -d "{\"limit\":5}"
```
期望：全部 `success:true`。
- `generate` 会调用 OpenAI 生成 embedding；**如果没配 API Key，会走 `generateMockEmbedding` 兜底**，也应该返回 success。
- `similar` / `match` 返回的数组里每项应该有 `similarity` 或 `mutual_score` **数值**（不是 `{}`）。
- 如果报 `relation "user_vectors" does not exist` → **向量表没建出来**，回头看第 6.3 节（多语句 SQL 陷阱）和启动日志里的"向量表初始化失败"。

### 7.8 第七组：前端联调（最真实的验证）

后端接口全绿之后，打开浏览器实际用一遍：

```cmd
docker ps --format "{{.Names}}\t{{.Ports}}"
```
找到 `jzxr-web` 暴露的端口，浏览器打开，然后**至少走通这几条用户路径**：

1. 首页用户列表能正常显示（有头像、有昵称、有城市，不是一片空白或 `[object Object]`）
2. 搜索/筛选能用（选城市、选年龄区间、点自定义筛选字段）
3. 注册一个新账号 → 登录 → 编辑自己的资料 → 保存 → 刷新页面确认资料还在
4. 上传头像 → 头像能显示出来
5. 点开某个用户详情 → 评价列表能加载 → 提交一条评价 → 评价出现
6. 点"查看联系方式" → 走解锁流程（应该提示需要付费/上传凭证）
7. 打开 `/admin` → 管理员登录 → 后台各标签页都能加载出数据（用户管理、待审核、押金审核、举报管理、解锁申请、自定义字段、统计）
8. 后台里做一次"通过审核"操作，确认列表状态变了

**打开浏览器开发者工具（F12）→ Console 和 Network 面板**：
- Console 里**不能有红色报错**
- Network 里所有 `/api/*` 请求的状态码应该是 200/304（除了故意测的 401/404）
- **逐个点开响应体，确认 `data` 字段是有内容的数组/对象，不是 `{}` 或 `null`**

同时开一个 cmd 窗口实时盯后端日志：
```cmd
docker logs -f jzxr
```
> 按 `Ctrl+C` 退出跟踪（这只是退出 `docker logs`，不会停容器）。
> 整个前端联调过程中，日志里**不应该出现** `[Unhandled Rejection]`、`[Server] uncaught error`、
> `TypeError`、`is not a function`、`Cannot read properties of undefined`。
> **出现任何一条，立刻停下来把日志粘给我。**

### 7.9 验证记录表（请填完再宣布完成）

改完之后，请把这张表填好粘给我。**没填完不算完成。**

```
接口编号  路径                                    期望    实际    通过
1        GET  /api/users                         数组
7        GET  /api/field-mappings (带ETag)        304
8        GET  /api/field-mappings/labels          非空对象
15       GET  /api/users/my                       有nickname
18       GET  /api/users/my (改city后)             city=北京
24       GET  /api/vector/stats                   数字
26       GET  /api/admin/stats                    非空stats
32       POST /api/admin/custom-fields            含id
35       GET  /api/custom-fields (删后)            字段消失
39       GET  /api/admin/stats (无token)           401 ★
40       GET  /api/admin/deposits (假token)        401 ★
批量      POST /api/users/batch                    2条都入库
contact  GET  /api/users/:id/check-unlock          明文手机号
上传      POST /api/upload/avatar                  图片可取回
前端      浏览器8条路径                              全部正常
日志      docker logs jzxr                          无异常
```

---

## 8. 回滚方案

每个阶段都单独提交了，所以可以精确回滚到任意阶段：

```cmd
cd /d E:\website\2.my-two-website
git log --oneline -15
```

- **回滚到改造前**（放弃全部工作，回到 `refactor/cleanup-and-style-fixes` 的状态）：
  ```cmd
  git switch refactor/cleanup-and-style-fixes
  ```
  （新分支 `refactor/deasync-to-pg-pool` 上的提交都还在，随时可以切回去，**不会丢**）

- **回滚某个具体提交**（保留其他改动）：
  ```cmd
  git revert <commit-id>
  ```

- **容器回滚到改造前的镜像**（注意 git 和 docker compose 的工作目录不同，要分两步 cd）：
  ```cmd
  cd /d E:\website\2.my-two-website
  git switch refactor/cleanup-and-style-fixes
  cd /d E:\website
  docker compose up -d --build jzxr
  docker logs --tail 40 jzxr-local
  ```

- **数据库回滚**（本次改造不动数据库结构和数据，理论上用不到；万一测试数据污染了）：
  ```cmd
  docker exec postgres-local pg_dump -U postgres match_db > E:\website\2.my-two-website\data\backup_current.sql
  docker exec -i postgres-local psql -U postgres -d match_db < E:\website\2.my-two-website\data\backup_before_deasync.sql
  ```
  > ⚠️ 第二条会**覆盖**现有数据。所以第一条（先存一份当前状态）必须先跑。
  > 而且**要先跟我确认**，不要自己决定恢复。

---

## 9. 完成标准（全部满足才算做完）

1. ✅ `findstr /s /i /c:"deasync" backend\*.js` 无输出；`backend\package.json` 里没有 `deasync`
2. ✅ `db\index.js` 用的是 `pg.Pool`（`max: 10`），没有任何 `deasync` 残留
3. ✅ `db\`、`services\`、`routes\`、`server.js` 四层里，**所有** db/service 调用点前都有 `await`（或 `return`）
4. ✅ `db\users.js:batchSaveUsers` 的事务回调用的是绑定连接的 `tx`，不是外层 `database`
5. ✅ `services\admin.service.js` 模块顶层**没有**任何数据库调用
6. ✅ `dbRowToJson` / `jsonToDbRow` / `encrypt` / `decrypt` / `verifyToken` / `generateToken` /
   `verifyAdminToken` / `generateAdminToken` / `hashPasswordSync` / `verifyPasswordSync` **仍是同步函数**
7. ✅ `docker compose up -d --build` 成功，`docker logs jzxr` 显示启动横幅，**无 FATAL、无向量表初始化失败**
8. ✅ 第 7.9 节的验证记录表**全部通过**，特别是第 39、40 条（**无 token / 假 token 必须 401**）
9. ✅ 浏览器实际走通第 7.8 节的 8 条用户路径，F12 Console 无报错，Network 无异常状态码
10. ✅ `docker logs -f jzxr` 在联调期间无 `[Unhandled Rejection]` / `TypeError` / `uncaught error`
11. ✅ `git diff --stat refactor/cleanup-and-style-fixes..HEAD` 里**只有 backend 目录下的文件**，
    没有前端文件、没有 `.env`、没有无关的格式化改动
12. ✅ 每个阶段都有独立的中文 commit，`git log --oneline` 清晰可读
13. ✅ 测试数据已清理（`批量测试%`、`13900000001`、`tmp_test\` 目录）
14. ✅ **没有 `git push`**（由用户自己做）

---

## 10. 给 Kimi 的第一句话（用户可以照抄）

> ⚠️ 先说清楚：**Kimi 读不到你电脑上的文件**，它没法自己执行 `type`。
> 所以第一步是**你把这份文档交给它**，两种方式任选：
>
> **方式 A（推荐，最省事）**：在 Kimi 对话框里点附件/上传，把
> `E:\website\2.my-two-website\docs\deasync重构交接说明.md`
> 直接拖进去。Kimi 支持长文档，97KB 一次能吃完。
>
> **方式 B（上传不了就用这个）**：用记事本打开该文件，按节**分 3 段**粘给 Kimi：
> - 第 1 段：第 0 节 ~ 第 4 节（背景 + 范围普查 + 新 `db\index.js` 代码）
> - 第 2 段：第 5 节 ~ 第 6 节（阶段 0-8 执行步骤 + 高危陷阱）
> - 第 3 段：第 7 节 ~ 第 10 节（接口回归 + 回滚 + 完成标准）
>
> 每段粘完说一句"还没完，先别动手"，三段都粘完再让它开始。

**文档交过去之后，把下面这段照抄给 Kimi：**

> 我要你帮我做一个 Node.js 后端的异步化改造，完整说明书就是我刚给你的这份
> `deasync重构交接说明.md`。请你先把它完整读一遍，读完后跟我复述三件事：
> ①这个改造的核心目标是什么；②架构分几层、级联规则是什么；
> ③你认为最危险的三个陷阱分别是什么。
> 复述正确之后，我们从"阶段 0"开始，你一次只给我一个阶段的命令，
> 我在 cmd 里执行完把输出粘给你，你判断通过了才给下一阶段。
> 注意：我用的是 **Windows cmd**，不是 Git Bash 也不是 PowerShell，
> 不要给我 bash 语法（`$()`、heredoc、`grep`、`sed`、`ls` 都不许出现）。全程用中文。

> **为什么要有"复述三件事"这道门**：这份改造最大的风险是**静默失效**（漏一个 `await`
> 不报错、只是功能是坏的）。如果 Kimi 连"五层级联"和"最危险的陷阱"都没抓准，
> 后面它给出的命令一定漏东西 —— 这时候不要迁就，让它重读，或者直接换我来做。

在 cmd 里确认文件没被截断（核对交给 Kimi 的是完整的那份）：

```cmd
cd /d E:\website\2.my-two-website\docs
dir deasync重构交接说明.md
findstr /c:"文中所有行号、函数名、调用点数量均为实测值" deasync重构交接说明.md
findstr /b /c:"## " deasync重构交接说明.md
```

**验证门**（三条都要过）：
1. `dir` 显示的字节数在 **98,000 以上**。
   > 别卡死具体数字 —— 这段核对命令本身就写在文档里，文档每修订一次字节数就会变。
2. 第二条 `findstr` **必须有输出**。这句话是全文的最后一行，能搜到就说明尾部完整、没被截断。
3. 第三条 `findstr` 应列出 **11 行** `## ` 开头的标题（第 0 节到第 10 节）。少了哪一节，就说明那段没交过去。

任何一条不过，先别让 Kimi 开工。

---

*本文档由上一位助手在完整读取 `backend\server.js`（546 行）、`backend\db\index.js`、
`backend\db\users.js`、`backend\db\admin.js`、`backend\db\field-mappings.js`、`backend\db\vector.js`、
`backend\routes\vector.js`、`backend\routes\auth.js`、`backend\routes\contact-unlock.js`、
`backend\services\admin.service.js` 并实测 grep 统计后编写。
文中所有行号、函数名、调用点数量均为实测值，非推测。*
