# 精准匹配 - 架构与 API

---

## 1. 整体目录结构（详细）

```
2.my-two-website/
├── app/                          # 前端应用（React + Vite）
│   ├── public/                   # 静态资源（不参与打包）
│   ├── src/                      # 业务源代码
│   │   ├── api/config.ts         # API 请求配置
│   │   ├── components/           # 公共组件（15 个组件 + 1 个测试文件，2026-10-13 现量）
│   │   │   ├── BirthdayPicker.tsx       # 年/月/日三列生日选择器
│   │   │   ├── ContactPayModal.tsx      # 联系方式支付弹窗
│   │   │   ├── DeleteConfirmModal.tsx   # 删除确认弹窗
│   │   │   ├── ErrorBoundary.tsx       # 错误边界
│   │   │   ├── ImagePreview.tsx         # 图片预览
│   │   │   ├── PayQrPanel.tsx           # 收款二维码面板（微信/支付宝）
│   │   │   ├── RatingModal.tsx         # 评价弹窗
│   │   │   ├── ReportModal.tsx         # 举报弹窗
│   │   │   ├── RequireAuth.tsx         # 路由守卫（未登录时跳转登录页）
│   │   │   ├── SearchPanel.tsx         # 搜索面板
│   │   │   ├── ShareButton.tsx         # 分享按钮
│   │   │   ├── TabBar.tsx             # 底部导航栏
│   │   │   ├── Toast.tsx              # 全局轻提示
│   │   │   ├── UserDetailModal.tsx    # 用户详情弹窗
│   │   │   └── UserList.tsx           # 用户列表
│   │   ├── data/                 # 数据类型与常量
│   │   ├── pages/                # 页面组件（11 个）
│   │   ├── services/             # 业务服务层（7 个文件＝4 个模块 draft.service / field-mapping.service / match.service / user.service ＋ 3 个 .test.ts）
│   │   └── utils/                # 工具函数（18 个文件＝11 个模块＋7 个 .test.ts；圈子分组口径在 circles.ts，圈子列表页与详情页共用）
│   ├── index.html                # 入口 HTML
│   ├── package.json
│   ├── vite.config.ts            # Vite 构建配置
│   ├── .prettierrc
│   └── .env.*                    # 环境变量
│
├── backend/                      # 后端应用（Express + 三层架构；10-30 由原生 http 整体换成 Express）
│   ├── admin/                    # 管理后台 HTML 模板（4 个文件）
│   │   ├── login.html            # 管理员登录页面
│   │   ├── m-login.html          # 手机版登录页面
│   │   ├── m.html                # 手机版管理主页
│   │   └── main.html             # 桌面版管理主页
│   ├── config/index.js           # 环境变量 → 常量的唯一取值处（上限/端口/来源白名单都在这）
│   ├── db/                       # 数据访问层（9 个文件，本轮一行未动）
│   ├── middleware/               # HTTP 中间件（10 个文件：安全头/日志/Cookie 桥接/CORS/请求体/限流/鉴权/管理员/上传/错误）
│   ├── routes/                   # API 路由层（14 个文件 = 13 个 router + index.js 装配表）
│   ├── services/                 # 业务逻辑层（8 个文件，本轮一行未动）
│   ├── test/                     # 后端单测（13 个文件 = 10 个用例文件 + helpers 2 + fixtures 1；全都不连库，见 §2.3）
│   ├── utils/                    # 零依赖纯函数（8 个文件：cookie工具.js / extractId.js / file-validation.js / payment-verify.js / pricing.js / profile-derive.js / searchParam.js / uploadedFiles.js）
│   ├── uploads/                  # 用户上传文件目录（compose 挂载到容器内 /uploads）
│   │   ├── avatars/              # 用户头像
│   │   ├── deposits/             # 认证费凭证
│   │   ├── contact-unlock/       # 联系方式解锁凭证（运行时创建）
│   │   └── reports/              # 举报凭证
│   ├── app.js                    # `createApp()`：四个 `app.set` + 一个 `app.disable` + 中间件按序装载 + 路由装配（不 listen、不连库，测试起的就是它）
│   ├── server.js                 # 进程入口：拿 createApp() 的结果 listen，再加优雅退出
│   ├── eslint.config.mjs         # 后端 lint（flat config，口径与站3 同源）
│   ├── .prettierrc.json          # 后端格式（与前端 app/.prettierrc 同一组参数）
│   ├── .prettierignore           # 本轮没排的版记在里面的注释上
│   └── package.json
│
├── data/                        # 数据库 SQL（种子 / 导出 / 序列重置）；运行数据不在此（线上与本机都是 postgres 容器，数据在命名卷：compose 名 `pgdata` → Docker 实际名 `www_pgdata`）
│   ├── match_db_pg15.sql        # ⚠️ `data/*` 被 .gitignore:20 整目录排除、**:21 只放行 `reset_sequences.sql`** ⇒ 三个 SQL 里**只有那一个进 Git**（10-14 现量 `git ls-files data/` 回一行 `data/reset_sequences.sql`，**不是空**）。另外两份（pg15 dump、server_seed）仓库里没有，上服务器必须单独 scp，否则 compose 挂的是缺失的 bind 源
│   ├── match_db_server_seed.sql
│   └── reset_sequences.sql
│
├── Dockerfile                    # 后端镜像
├── Dockerfile.frontend           # 前端镜像（多阶段：vite build → 静态服务）
├── frontend-server.mjs           # 前端容器运行时（零依赖静态服务 + 反向代理）
├── .gitignore
└── .vscode/settings.json
```

---

## 2. 后端三层架构

```
API 路由层 (routes/)  ->  业务逻辑层 (services/)  ->  数据访问层 (db/)
      |                         |                          |
  只解析 HTTP 请求         只处理业务规则              只执行 SQL 操作
  权限检查 / 返回 JSON    参数校验 / 状态流转         数据读写
```

各层职责边界：

| 层级 | 目录 | 做什么 | 不做什么 |
|------|------|--------|----------|
| routes | `routes/` | 解析 HTTP 请求、鉴权、限流、返回 JSON 响应 | 不直接写 SQL、不写加密逻辑 |
| middleware | `middleware/` | 跨路由的横切事：安全头 / 日志 / CORS / 请求体 / 限流 / 鉴权桥接 / 错误 | 不写业务规则、不碰数据库 |
| services | `services/` | 业务规则 / 参数校验 / 状态流转 / 权限判定 | 不写 HTTP 响应、不直接操作数据库 |
| db | `db/` | 纯 SQL 操作 / 数据读写 / Token 工具 / 加密工具 | 不含业务规则、不写 HTTP 逻辑 |
| config | `config/index.js` | 环境变量 → 常量的唯一取值处（模块加载时取一次） | 不读请求、不碰数据库 |
| 装配 | `app.js` | `createApp()`：四个 `app.set` + 一个 `app.disable`、中间件按序装载、路由装配 | 不 listen、不连库、不写具体业务 |
| 入口 | `server.js` | 进程级：拿 `createApp()` 的结果 listen、启动横幅、优雅退出 | 不写中间件、不写具体业务 |

拆成 `app.js` + `server.js` 两个文件是有原因的：测试要用 supertest 起一个不占端口的实例，
一个进程里跑几份互不打架；如果装配和 listen 混在 server.js 里，require 它就把端口占了。

### 2.1 后端目录详细说明

```
backend/
├── admin/                          # 管理后台 HTML 模板
│   ├── login.html                  # 管理员登录页面
│   ├── m-login.html                # 手机版登录页面
│   ├── m.html                      # 手机版管理主页
│   └── main.html                   # 桌面版管理主页
│
├── config/
│   └── index.js                    # 上限/端口/来源白名单等常量的唯一取值处（含 BODY_HARD_LIMIT 不得低于最宽路由的自检）
│
├── db/                             # 数据访问层（纯 SQL，9 个文件）
│   ├── index.js                    # DB 连接 / Token / 加密 / 密码哈希
│   ├── users.js                    # 用户表：CRUD / 搜索 / 统计 / 审核
│   ├── auth.js                     # 账号注册 / 密码校验 / 密码修改
│   ├── reports.js                  # 举报：新增 / 列表 / 状态更新 / 删除
│   ├── ratings.js                  # 评价：新增 / 列表 / 平均分
│   ├── payments.js                 # 支付/认证费/解锁：订单 / 认证费 / 解锁请求
│   ├── admin.js                    # 管理员：日志 / 自定义筛选字段
│   ├── vector.js                   # 向量数据库：向量 CRUD / 相似搜索 / 双向匹配
│   └── field-mappings.js           # 字段映射工具
│
├── middleware/                     # HTTP 中间件（10 个文件）
│   ├── security.js                 # 六个安全头（含 /api 的 nostore）
│   ├── request-logger.js           # 一行请求日志 + 访客 IP 走 req.ip（= XFF 末项，替掉旧 utils/clientIp.js）
│   ├── auth.js                     # cookieAuthBridge（Cookie→Bearer 桥接）/ bearerToken / requireToken / requireBearer
│   ├── admin-auth.js               # requireAdmin（管理员令牌 + 白名单账号双闸）
│   ├── cors.js                     # 来源白名单 + 预检
│   ├── body.js                     # 全局 text 解析（multipart 让给 multer）+ 空体归一 + 超限判定
│   ├── rate-limit.js               # 六个限流桶（注册 IP／注册手机号／登录／验证码／短信／写操作）
│   ├── upload.js                   # multer 封装（五种上传各自的字段名与大小上限）
│   ├── async-handler.js            # 把 async 路由的 reject 送进 errorHandler，替掉旧那圈手写 try/catch
│   └── error-handler.js            # notFound（旧那句 text/plain "Not Found"）+ 统一 500
│
├── routes/                         # API 路由层（14 个文件 = 13 个 router + 装配表）
│   ├── index.js                    # 装配表：STATIC_ROUTERS(2) + API_ROUTERS(11)，顺序承重
│   ├── pages.js                    # 后台 HTML 四条（每条并列写「带尾斜杠/不带」两种）+ /admin/* 静态兜底
│   ├── files.js                    # 收款码 / 头像 / uploads 静态读盘（越界 403、读不到 404）
│   ├── upload.js                   # /api/upload/avatar、/api/deposit/upload-proof
│   ├── deposits.js                 # /api/admin/deposits*、/api/users/my-deposit
│   ├── vector.js                   # /api/vector/*（整族前置一道闸）
│   ├── contact-unlock.js           # /api/unlock-contact/*、后台审核与手动解锁
│   ├── payment.js                  # /api/payment/*、/api/payments/*、价格设置、两条回调
│   ├── auth.js                     # /api/auth/*、/api/admin/login
│   ├── custom-fields.js            # 自定义字段一整族（旧的 admin-custom-fields.js + user-custom-fields.js 两个文件并到这里）
│   ├── users.js                    # /api/users*、/api/circles/members、/api/admin/stats
│   ├── ratings.js                  # /api/ratings、/api/users/:id/ratings
│   ├── reports.js                  # /api/reports*
│   └── field-mappings.js           # /api/field-mappings*（自带 ETag 协商缓存）
│
├── services/                       # 业务逻辑层（8 个文件）
│   ├── user.service.js             # 用户业务：数据脱敏 / 验证 / 审核流转
│   ├── auth.service.js             # 认证业务：注册 / 登录 / Token 生成
│   ├── reports.service.js          # 举报业务：提交验证 / 状态管理
│   ├── ratings.service.js          # 评价业务：去重 / 分数范围校验
│   ├── admin.service.js            # 管理员业务：日志 / 备份 / 字段管理
│   ├── captcha.service.js          # 滑动验证码服务
│   ├── sms.service.js              # 短信验证预留服务
│   └── vector.service.js           # 向量业务：文本向量化 / 相似搜索 / 双向匹配
│
├── test/                           # 后端单测（13 个文件，全都不连库；口径见 §2.3）
│   ├── app-wiring.test.js          # 安全头矩阵 / CORS / 四个 app.set 的效果
│   ├── static-and-pages.test.js    # 收款码 / 头像 / uploads / 后台页
│   ├── route-parity.test.js        # 入口总数 76、尾斜杠、方法白名单
│   ├── auth-gates.test.js          # 未登录/令牌无效/需要管理员那一族文案 + Cookie 桥接
│   ├── body-limit.test.js          # 请求体上限与三种坏 JSON 文案
│   ├── rate-limit.test.js          # 六个桶的阈值、429 文案、互不串桶
│   ├── utils.test.js               # 上传校验/文件名/搜索参数/脱敏等纯函数
│   ├── payment-gates.test.js       # 回调入账三道闸（状态→身份→金额）
│   ├── profile-derive.test.js      # 生日/星座/婚况/兴趣标签派生
│   ├── config.test.js              # env → 常量（每档开一个子进程量）
│   ├── helpers/env.js              # 钉 NODE_ENV=test + 静音请求日志
│   ├── helpers/tokens.js           # 造用户/管理员/伪造令牌
│   └── fixtures/config-probe.js    # 子进程配置探针
│
├── app.js                          # createApp()：框架开关 + 中间件顺序 + 路由装配
├── server.js                       # 进程入口：listen + 启动横幅 + 优雅退出
└── eslint.config.mjs               # 后端 lint 规则
```

### 2.2 中间件装载顺序（承重，别按字母重排）

`app.js` 里的顺序就是旧 `server.js` 从上往下那几行：

```
securityHeaders → requestLogger → cookieAuthBridge → cors → textBody → normalizeEmptyBody
→ STATIC_ROUTERS(2) → API_ROUTERS(11) → notFound → errorHandler
```

三条理由（原文写在 `app.js` 头部注释里，改顺序前先读那段）：安全头必须最前，否则 404 和预检会少那六个头；
日志必须在桥接之前，否则日志里"有没有带令牌"这一列变成"浏览器有没有 cookie"；
CORS 必须在读体之前，因为预检请求历史上从不读体。

四个 `app.set` 也各有现量：`trust proxy: 1`（限流按访客 IP 分桶，取 1 不是 true）、
`query parser: 'simple'`（旧的是 querystring 口径）、`strict routing`（尾斜杠是另一条路由，
且必须每个子路由器自己 `express.Router({ strict: true })`，app 级那句管不到子路由器）、
`etag: false`（旧 JSON 响应没有 ETag）。

### 2.3 后端测试与门禁

| 门禁 | 命令 | 跑什么 | 不跑什么 |
|------|------|--------|----------|
| 格式 | `cd backend && npm run format:check` | 本轮改动过的 46 个文件（现量：`prettier --write .` 处理 46 行，`--check .` RC=0） | `db/`、`services/`、`admin/` 与 5 个旧 utils（记在 `.prettierignore` 的注释里，本轮不背这个 diff） |
| lint | `cd backend && npm run lint` | `eslint .`（0 error；warning 34 条都是未动过的旧文件里的未用变量） | `node_modules`、`uploads`、`admin`、`data` |
| 单测 | `cd backend && npm test` | 96 条用例，2.3 秒 | 任何需要真数据库的分支 |

单测的取舍写在 `test/` 各文件头部：**只断言在 `getPool()` 之前就短路返回的路径**——鉴权门、静态读盘、
路由形状、请求体上限、限流计数、纯函数、以及用子进程量的配置。需要连库才能验的那部分不在这 96 条里，
它的替代证据是本机容器的 126 条契约基线（改前/改后各跑一次逐字段对差，三趟差报告逐字节相同，见 `docs/运维记录.md` §2.35）。
CI 的 Backend job 就是这三条命令，没有 Build 这一步（后端没有编译产物）；
`npm ci --omit=dev` 的镜像里跑不了这些用例，所以 `.dockerignore` 把 `backend/test` 挡在镜像外。

---

## 3. 前端模块详解

### 3.1 路由配置（App.tsx）

| 路径 | 页面 |
|------|------|
| `/` | 首页（用户列表、筛选、匹配） |
| `/post` | 发布个人资料（需登录，`RequireAuth` 守卫） |
| `/deposit` | 诚意认证费缴纳页面（一次性服务费，不退） |
| `/qr` | 二维码分享页面 |
| `/login` | 登录/注册页面 |
| `/profile` | 个人资料管理（需登录） |
| `/my-posts` | 我发布的资料列表（需登录） |
| `/settings` | 账号设置（含修改密码） |
| `/circles` | 圈子页面 |
| `/circle/:circleKey/:tag` | 圈子详情 |
| `/anti-fraud` | 防诈指南页 |
| `*` | 404 兜底页（未注册路径显示提示，避免卡在 LoadingFallback） |

### 3.2 API 配置层（`src/api/config.ts`）

```typescript
const ENV_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const DEFAULT_DEV_BASE_URL = 'http://localhost:8080/api';   // 开发模式直连后端，绕开 Vite proxy + SSE 连接复用
const DEFAULT_PROD_BASE_URL = '/api';                  // 生产默认同源相对路径
export const API_BASE_URL = ENV_BASE_URL || (import.meta.env.DEV ? DEFAULT_DEV_BASE_URL : DEFAULT_PROD_BASE_URL);

// 这份是「接口台账」，不是请求封装：页面里几乎都是直接拼 `${API_BASE_URL}/xxx`。
// 2026-10-13 现量：18 项里只有 users 有 1 处调用（syncRowsFromServer）。
export const API_ENDPOINTS = {
  users: '/users',
  myUser: '/users/my',
  userSearch: '/users/search',
  pendingUsers: '/users/pending',
  approveUser: (id: string) => `/users/${encodeURIComponent(id)}/approve`,
  rejectUser: (id: string) => `/users/${encodeURIComponent(id)}/reject`,
  batchUsers: '/users/batch',
  register: '/auth/register',
  login: '/auth/login',
  logout: '/auth/logout',
  adminLogin: '/admin/login',
  adminStats: '/admin/stats',
  ratings: '/ratings',
  reports: '/reports',
  unlockContact: (id: string) => `/users/${encodeURIComponent(id)}/unlock-contact`,
  checkUnlock: (id: string) => `/users/${encodeURIComponent(id)}/check-unlock`,
  fieldMappings: '/field-mappings',
  fieldLabels: '/field-mappings/labels',
} as const;
```

> 2026-10-13 删掉了原来这里抄着的一项 `userById: (id) => \`/users/${id}\``——后端**没有这条 GET 路由**（实测 `GET /api/users/1` → **404**，而 `PUT`/`DELETE` 同一地址 → **401**，说明路由表里只有改与删）。照着它发请求只会拿 404，所以台账里不能留它。

### 3.3 核心组件

| 组件 | 说明 |
|------|------|
| TabBar | 底部导航栏 |
| RequireAuth | 路由守卫，未登录时跳转登录页 |
| Toast | 全局轻提示（ToastProvider） |
| ShareButton | 分享按钮 |
| UserList | 用户列表 |
| UserDetailModal | 用户详情弹窗 |
| RatingModal | 评价弹窗 |
| ReportModal | 举报弹窗 |
| ImagePreview | 图片预览 |
| SearchPanel | 搜索面板 |
| ErrorBoundary | 错误边界 |
| ContactPayModal | 联系方式支付弹窗 |
| DeleteConfirmModal | 删除确认弹窗 |

### 3.4 Vite 配置（`vite.config.ts`）

```typescript
base: (env.VITE_BASE_PATH || '/').replace(/\/+$/, '') + '/'
server: {
  port: 4000,
  proxy: {
    '/api':   { target: 'http://localhost:8080' },
    '/admin': { target: 'http://localhost:8080' },
  }
}
```

---

## 4. 数据库 Schema

数据库：PostgreSQL 18.6 ＋ pgvector 扩展 0.8.6（2026-10-14 线上现量：`select version()` 回 18.6，`pg_extension` 回 `vector@0.8.6`；旧文档写的 v0.8.2 是编译安装年代的值，随旧栈作废）
数据位置：PostgreSQL 跑在 `postgres` 容器内（镜像 `pgvector/pgvector:pg18`），数据在 Docker 命名卷——compose 文件里写 `pgdata`，Docker 实际卷名带项目前缀 = `www_pgdata`（容器挂 `/var/lib/postgresql`）。仓库 `data/` 只存 SQL 种子/导出文件、不含运行数据；但这些 SQL **不在 Git 里**（`data/` 被整目录 ignore），换机器或上服务器必须手工拷贝。

### 4.1 核心业务数据表

| 表名 | 用途 |
|------|------|
| `auth_users` | 用户认证信息（手机号、密码哈希） |
| `users` | 用户资料（姓名、年龄、联系方式等 40+ 字段） |
| `user_ratings` | 用户评价 |
| `user_reports` | 用户举报 |
| `contact_unlocks` | 联系方式解锁记录（`method='pack'` 的行是次数包扣掉的次数） |
| `deposits` | 认证费记录（表名沿用 deposits，钱不退） |
| `payment_orders` | 支付订单 |
| `user_custom_fields` | 用户自定义字段（EAV 键值表） |
| `field_mappings` | 字段中文标签与类型映射（前端动态取字段定义） |
| `custom_filters` | 管理员配置的自定义筛选字段 |
| `"数据库映射表"` | 表/列名与中文说明的映射（导入导出用） |
| `admin_settings` | 管理设置 |
| `admin_logs` | 管理员操作日志 |

全库共 14 张表（上表 13 张 + §4.2 的 `user_vectors`）。

### 4.2 向量数据表（pgvector）

**表名：`user_vectors`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | SERIAL PRIMARY KEY | 主键 |
| `user_id` | VARCHAR(50) NOT NULL UNIQUE | 用户ID（关联 users 表） |
| `profile_vector` | vector(1536) | 用户资料向量 |
| `expectation_vector` | vector(1536) | 择偶要求向量 |
| `profile_text` | TEXT | 用于生成向量的用户资料文本 |
| `expectation_text` | TEXT | 用于生成向量的择偶要求文本 |
| `model` | VARCHAR(100) | 向量模型名称（默认 text-embedding-ada-002） |
| `created_at` | BIGINT NOT NULL | 创建时间戳 |
| `updated_at` | BIGINT NOT NULL | 更新时间戳 |

**索引：**
- `idx_user_vectors_profile`：HNSW 索引，`profile_vector vector_cosine_ops`
- `idx_user_vectors_expectation`：HNSW 索引，`expectation_vector vector_cosine_ops`

**技术说明：**
- 向量维度：1536 维（OpenAI text-embedding-ada-002）
- 索引类型：HNSW（Hierarchical Navigable Small World）- 近似最近邻搜索
- 距离度量：余弦相似度（cosine similarity）
- 相似度计算：`1 - (vector_a <=> vector_b)`，值越大越相似（范围 0~1）

### 4.3 向量数据库操作模块（`db/vector.js`）

| 函数 | 说明 |
|------|------|
| `initVectorTables()` | 初始化向量表和索引 |
| `upsertUserVector()` | 插入或更新用户向量 |
| `findSimilarUsersByProfile()` | 按资料向量找相似用户 |
| `findSimilarUsersByExpectation()` | 按择偶要求向量找相似用户 |
| `findMutualMatchUsers()` | 双向匹配（我的要求 vs 对方资料 + 对方要求 vs 我的资料） |
| `getUserVector()` | 获取用户向量 |
| `getVectorStats()` | 获取向量统计信息 |

说明：数据库已从 SQLite 迁移至 PostgreSQL，运行数据不在仓库 `data/` 内（线上与本机都在 `postgres` 容器的 Docker 命名卷里，见 §4），原 `database.js` 已被拆分到 `db/` 目录，不再使用单一大文件。

---

## 5. API 接口一览

> **这张表说明"接口存在、契约是什么"，不说明"这条业务在线上跑过"。** 逐条业务链路 2026-10-14 的线上现状（哪条通、哪条零数据、哪条根本跑不了、哪条靠代录）写在 `docs/项目总览.md` §9 的「线上现状」列，取证数字在 `docs/运维记录.md` §2.32。一句话摘要：线上只有**资料读取/搜索/圈子/条件筛选**这几条天天在跑，`ratings`、`reports`、`contact_unlocks`、`user_custom_fields`、`custom_filters`、`user_vectors` 六张表**全 0 行**，`deposits` 只 1 行（站长 ¥0.01 的测试单）。

### 5.1 认证接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/auth/register` | 用户注册 | 否 |
| POST | `/api/auth/login` | 用户登录 | 否 |
| POST | `/api/auth/change-password` | 修改密码 | Token |
| GET | `/api/auth/captcha` | 获取滑动验证码 | 否 |
| POST | `/api/auth/captcha/verify` | 校验滑动验证码 | 否 |
| POST | `/api/auth/sms/register-code` | 发送注册短信验证码（预留） | 否 |
| POST | `/api/auth/sms/verify-register-code` | 校验注册短信验证码（预留） | 否 |
| POST | `/api/admin/login` | 管理员登录 | 否 |

`/api/auth/register` 的"该手机号已注册"（400）依赖数据库唯一约束，不靠代码查重：`auth_users.phone` 上有一个部分唯一索引
`auth_users_phone_uniq`（排除 NULL 与空串），由服务启动时 `ensurePhoneUniqueIndex()` 幂等创建。
在此之前注册链路没有任何查重，同一个手机号可以注册出两个账号，而登录用的 `WHERE phone = $1` 只取一行，
命中哪个账号变成不确定。若表里已存在重复手机号，启动时索引建不起来——只在日志告警一次，不阻断启动，
需要先人工合并重复账号再重启服务（本机与服务器已实测均无重复手机号）。

### 5.2 用户接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/users` | 获取用户列表（非管理员只见已认证资料，见下方认证门） | 可选 |
| POST | `/api/users` | 添加用户（未缴认证费回 403 `need_certification`；管理员代录不受门） | Token |
| POST | `/api/users/batch` | 批量导入 | 管理员 |
| GET | `/api/users/my` | 获取我的资料 | Token |
| PUT | `/api/users/my` | 更新我的资料 | Token |
| DELETE | `/api/users/my` | 删除我的资料 | Token |
| GET | `/api/users/pending` | 待审核用户 | 管理员 |
| POST | `/api/users/:id/approve` | 审核通过 | 管理员 |
| POST | `/api/users/:id/reject` | 审核拒绝 | 管理员 |
| PUT | `/api/users/:id` | 编辑用户资料 | 管理员 |
| DELETE | `/api/users/:id` | 删除用户 | Token（本人或管理员） |
| POST | `/api/users/:id/unlock-contact` | 管理员解锁联系方式 | 管理员 |
| GET | `/api/users/search` | 搜索用户（`contact` 参数仅管理员生效，匿名传入返回空） | 可选 |
| GET | `/api/users/:id/check-unlock` | 检查解锁状态 | Token |

> 非管理员（含匿名）拿到的用户对象由 `services/user.service.js` 的 `maskUserData` 统一出口脱敏：
> `data.contact` 打码、顶层 `deposit` 不下发；管理端返回原值。
>
> **认证门**（`db/users.js` 的 `CERTIFIED_SQL`，一处定义、三处生效：`/api/users` 列表与搜索、`/api/circles/members`）：
> 访客侧只返回「本行 `deposit > 0`（线下/后台代收）」或「所属账号在 `deposits` 里有 `approved` 记录（线上下单）」的资料行，
> `total` 用同一判据计数，不会和 `data` 条数打架；管理员端与 `/api/users/batch` 导入不过这个门。
> 未过门的账号调发布/首次填写（`POST /api/users`、`PUT /api/users/my`）直接 403 `need_certification`，资料根本不入库。
>
> **派生字段**（`utils/profile-derive.js`，只在 `db/users.js` 的 `jsonToDbRow()` 里生效 —— 这是 `addUser`／`updateUser`／`batchSaveUsers`
> 三条写路径唯一的共同闸门）：`age`←`birthday` 周岁、`zodiac`←出生年月的月+日、`marriage`←`relationship_status`、`interestTags`=`hobbies`∪`sport`。
> 这四项在表单里已被隐藏（前端 `app/src/utils/form-fields.ts` 的 `FORM_HIDDEN_KEYS`）但**字段定义与库列都保留**，因为 `age` 列正被首页年龄区间筛选
> （`CAST(age AS INTEGER)`）与匹配向量文本读取，删列会把这些功能一起掏空。算不出来（缺来源）时**不覆盖**，保留提交上来的原值，
> 免得老用户没填出生年月就把已有的年龄抹成空。**唯一例外是 `age`/`zodiac`**：提交里带了 `birthday` 这个键（表单下拉一定会带）就按它整体重算，
> 只选到年月时 `zodiac` 会被抹空，不留和生日对不上的旧星座；没带 `birthday` 的提交（后台代录、批量导入）仍走上面那条「算得出才覆盖」。
> 详见运维记录 §2.16、§2.19。

### 5.3 上传接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/upload/avatar` | 上传头像 | Token |
| POST | `/api/deposit/upload-proof` | 上传认证费凭证 | Token |
| GET | `/api/users/my-deposit` | 我的认证费状态 | Token |

> **文件名与回收口径**（`backend/utils/uploadedFiles.js`）：落盘名一律 `buildUploadName(prefix, ext)` 生成（`<prefix>_<毫秒时间戳>_<6位随机>`），不再用可猜的定名。`deleteUploadedFile(publicPath)` 只删**解析后仍在 `UPLOADS_ROOT` 内且确实存在**的单个文件：`/uploads` 根、其子目录、`../` 越界、`/app/.env` 这类其他前缀、`data:` 内联图、空值一律回 `false` 且不动盘；文件本来就不在也回 `false`（不用 `rmSync({force})`，`force` 会把"什么都没删掉"报成成功）。保证金凭证、举报凭证、联系方式解锁凭证、用户（含头像）四条删除路径都走它 ⇒ 删行必连带删文件，`/uploads/*` 匿名可下的东西不会留在盘上。容器内 `UPLOADS_ROOT` 由 `__dirname` 推到 `/uploads`，**这套断言只能进容器跑**，在本机路径下算出来的根不是同一个。

### 5.4 评价接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/ratings` | 添加评价 | Token |
| GET | `/api/users/:id/ratings` | 获取评价 | 可选 |

### 5.5 举报接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/reports` | 添加举报 | Token |
| GET | `/api/reports` | 举报列表 | 管理员 |
| PUT | `/api/reports/:id/status` | 更新状态 | 管理员 |
| DELETE | `/api/reports/:id` | 删除举报 | 管理员 |

### 5.6 管理员接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/admin/stats` | 统计数据 | 管理员 |
| GET | `/api/admin/deposits` | 认证费记录列表 | 管理员 |
| PUT | `/api/admin/deposits/:id/approve` | 审核通过认证费凭证 | 管理员 |
| PUT | `/api/admin/deposits/:id/reject` | 驳回认证费凭证 | 管理员 |
| GET | `/api/admin/deposits/proof/:id` | 读取认证费凭证图片 | 管理员 |
| DELETE | `/api/admin/deposits/:id` | 删除认证费记录 | 管理员 |
| GET | `/api/admin/unlock-records` | 解锁记录 | 管理员 |

### 5.7 向量搜索接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/vector/stats` | 向量统计信息 | Token |
| POST | `/api/vector/generate/:userId` | 生成并存储用户向量 | Token |
| GET | `/api/vector/similar/:userId` | 相似用户搜索 | Token |
| GET | `/api/vector/match/:userId` | 双向匹配推荐 | Token |
| POST | `/api/vector/batch` | 批量生成向量 | 管理员 Token |

> 注意：`routes/vector.js` 在处理任何分支前统一 `requireAuth`，所有 `/api/vector/*` 未登录一律 401。
> `/api/vector/batch` 额外要求管理员令牌（`routes/vector.js:118` 在那条分支上挂了 `requireAdmin({status:403, message:'仅管理员可批量生成向量'})`），因为它一次最多跑 `limit`（默认 100）个用户的付费向量。
> 现状（2026-10-14 两边分别现量）：前端没有任何页面调用 `/api/vector/*`；**线上** `user_vectors` **0 行**，**本机** 1 行但两个向量列都是 NULL。这套匹配引擎已实现但还没接到产品上（取证见 `docs/运维记录.md` §2.32）。
> ⚠️ 比"没接上"更要紧的一条：**线上容器现在 `EMBEDDING_PROVIDER=mock`**，而 `generateEmbedding` 在 mock 分支**不抛错**（`services/vector.service.js:42-44` 直接回 `generateMockEmbedding(text)`，`75-89` 行是"字符串哈希→伪随机→归一化"，跟资料语义无关）。所以"启用前先配 `EMBEDDING_API_KEY` 否则直接抛错"这句只在 `PROVIDER != mock` 时成立；今天真去点 `POST /api/vector/batch`，它会把 99 行假向量写进库、接口一路回 200，之后 `/api/vector/similar` 返回的是噪声排序。启用顺序：改 `PROVIDER` 与真 key → 单个用户 `generate` → 抽一行看相似度是否讲得通 → 才谈 batch。

**向量搜索参数说明：**
- `type`：搜索类型，`profile`（资料相似）或 `expectation`（要求相似），默认 `profile`
- `limit`：返回结果数量，默认 10
- 相似度范围：0~1，值越大越相似

### 5.8 支付接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/payment/create` | 创建支付订单。微信返回 `codeUrl`（前端本地生成二维码），支付宝返回 `payUrl`（跳转） | Token |
| GET | `/api/payment/status` | 查询订单状态 | Token |
| GET | `/api/payment/mock-pay` | 模拟支付（点一下就把订单标成已付），默认 404；只有 `ALLOW_MOCK_PAY=1` 且非 production 时才可用，本机调试专用 | Token |
| POST | `/api/payment/notify-wechat` | 微信支付 v3 回调 | 无 Token，AES-256-GCM 解密即认证来源 |
| POST | `/api/payment/notify-alipay` | 支付宝支付回调 | 无 Token，校验支付宝公钥签名 |
| POST | `/api/payments/view-contact` | 查看某人的联系方式。用途写死成 `contact_unlock`，不接受前端传 purpose。手里还有次数包余额时先扣次数、直接回 `{unlocked:true, via:'credit', remaining}` 且不再收银台；余额不足才下单，返回体与 `/api/payment/create` 同形 | Token |
| GET | `/api/payments/contact-credits` | 还剩几次查看次数：`{granted, spent, available}`。不落库存计数列——`granted` 是已付订单 `payment_orders.credits` 之和，`spent` 是 `contact_unlocks` 里 `method='pack'` 且 `status='unlocked'` 的条数 | Token |
| GET | `/api/payment/config` | 公开标价 `{deposit_amount, contact_unlock_amount, contact_pack_3_amount, contact_pack_5_amount}`（元），前端展示金额用，不含任何写权限。四项都是一次性服务费、支付后不予退还，各自独立，没有「几档之和等于另一档」的约束。响应顶层另并列 `alipay_online` / `wechat_online` 两个只读布尔（取自 `isPaymentConfigured()`，密钥配齐才为 `true`）——本站没有 `/api/health`，接没接通就看这两个数，前端多出的字段会自然忽略 | 否 |
| GET | `/api/admin/payment-price` | 后台读标价：每项给当前值、分值、环境变量兜底值、来源（`db`/`env`）与最后改动时间 | 管理员 |
| PUT | `/api/admin/payment-price` | 后台改标价，写进 `admin_settings`（按分存整数）。只影响之后新建的订单，已下单的金额不变。先把本轮提交的每一项都校验完（最多两位小数、0.01 ～ 99999.99 元），全部通过才逐项落库，避免留下写了一半的状态 | 管理员 |

回调侧的四条硬约定（改代码前先读）：

- 金额与身份只认逐笔比对：下单时请求体里的 `amount` 被忽略，一律取服务端标价（`backend/utils/pricing.js` 读 `admin_settings`，后台「价格设置」没写过的项才退回 `DEPOSIT_AMOUNT` / `CONTACT_UNLOCK_AMOUNT`）；入账前还要把通知的 `amount.total`（分）与订单应收、通知的 `appid`/`mchid` 与 `backend/.env` 的配置、`trade_state` 与 `SUCCESS` 三项同时对齐，缺任何一个都能被"付一分钱把认证费标成已付"、或被同一把 APIv3 密钥下别的应用发来的通知绕过。这几项判定是纯函数，写在 `backend/utils/payment-verify.js`，单测在 `app/src/utils/payment-verify.test.ts`（`cd app && npx vitest run`）。
- 微信 v3 靠 HTTP 状态码决定是否重推，失败分两类回：暂时处理不了的（解密失败、订单暂时查不到、本站支付键没配齐）回 500——回 2xx 等于告诉微信"已送达"，那一次没落库就是永久丢单，且全程无报错；而重推多少次也不会变好的伪通知（金额不符、appid/mchid 不符、交易状态非 SUCCESS、非支付成功事件）回 204 空响应收口，否则会被按退避策略重推约一天，把重推队列和日志刷满。
- 回调地址只能填 `https://sparklove.cn/api/payment/notify-wechat` 与 `.../notify-alipay`，**不能带 `/jzxr` 前缀**。带前缀会被前端单页应用兜底成 200 的 index.html，症状与上一条相同：钱扣了、订单不落账、全程零报错。
- 支付宝通知是 `application/x-www-form-urlencoded`，**空格的线格式是 `+` 不是 `%20`**（微信是 JSON，没有这一坑）。解码顺序必须是"先把 `+` 换成空格、再 percent-decode"，直接 `decodeURIComponent` 会把 `+` 原样留在值里；而 `gmt_payment`、`notify_time` 这类字段永远带空格，于是待签串和支付宝签的那一份对不上——**每一笔通知都验不过**，站内还一条错误都不露。解码要写成独立函数（`routes/payment.js` 的 `decodeFormBody`），非法百分号转义按不可信处理、回 `fail` 让支付宝重推。兜底查单（`queryAlipayOrder`）只在"金额与订单逐笔相符 + 状态属终态白名单 `TRADE_SUCCESS`/`TRADE_FINISHED` + `updatePaymentOrder` 真的把这行从 pending 翻过来"三个条件同时成立时才发货，缺一不发。

开通支付需要在 `backend/.env` 填的键（模板见 `.env.example`）：
`WECHAT_APP_ID`、`WECHAT_MCH_ID`、`WECHAT_API_V3_KEY`、`WECHAT_MERCHANT_SERIAL_NO`、`WECHAT_MERCHANT_PRIVATE_KEY`、`WECHAT_NOTIFY_URL`、
`ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY`、`ALIPAY_NOTIFY_URL`、`ALIPAY_RETURN_URL`。
某个渠道的键没填全则该渠道不可用；`payment_orders.channel_txn_id`（渠道流水号，对账用）由服务启动时自动补列。
`DEPOSIT_AMOUNT`、`CONTACT_UNLOCK_AMOUNT` 只是「后台从没改过这个价」时的兜底默认值：日常改价在后台「价格设置」页（桌面 `/admin/`、手机 `/admin/m`）做，写进 `admin_settings` 后即刻生效，不用改代码、不用重新部署。收费只有这四项，都是一次性服务费、支付后不退，所以 `backend/utils/pricing.js` 的 `ITEMS` 里只有「收多少」，没有「怎么分」。两个次数包在 `ITEMS` 里多带一个 `credits`（3／5），下单那一刻抄进 `payment_orders.credits`：余额只由这列推导，之后改价、改包容量都不会动到已购用户的次数。**买包的钱绝不是认证费**——`applyOrderEffect` 对 `contact_pack_*` 直接 return，省掉这一句会把没交认证费的人标成已认证、当场进搜索列表。诚意认证费页（`app/src/pages/DepositPage.tsx`）展示的金额来自 `GET /api/payment/config`，前端不再硬编码。

### 5.9 联系方式解锁申请接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/unlock-contact/submit` | 提交解锁申请（上传凭证） | Token |
| GET | `/api/admin/unlock-contact-requests` | 解锁申请列表 | 管理员 |
| PUT | `/api/admin/unlock-contact-requests/:id/approve` | 通过解锁申请 | 管理员 |
| PUT | `/api/admin/unlock-contact-requests/:id/reject` | 拒绝解锁申请 | 管理员 |
| DELETE | `/api/admin/unlock-contact-requests/:id` | 删除解锁申请 | 管理员 |

### 5.10 字段映射与自定义筛选字段接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/field-mappings` | 全部字段定义（支持 ETag / 304） | 否 |
| GET | `/api/field-mappings/labels` | 字段中文标签映射（支持 ETag / 304） | 否 |
| GET | `/api/custom-fields` | 自定义筛选字段列表 | 否 |
| POST | `/api/admin/custom-fields` | 新增自定义筛选字段 | 管理员 |
| DELETE | `/api/admin/custom-fields/:id` | 删除自定义筛选字段 | 管理员 |

### 5.11 用户自定义字段接口（EAV）

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/users/custom-fields` | 我的自定义字段 | Token |
| POST | `/api/users/custom-fields` | 写入 / 更新我的某个自定义字段 | Token |
| DELETE | `/api/users/custom-fields/:fieldKey` | 删除我的某个自定义字段 | Token |
| GET | `/api/users/all-custom-fields?user_ids=a,b,c` | 按 `user_ids` 批量取自定义字段（首页卡片合并显示用）；单次最多 100 个 id，不带参数即空结果 | 否 |

> 这一族四条路径由 `routes/custom-fields.js` 里的一条 `router.all()` 接（旧的 `admin-custom-fields.js` + `user-custom-fields.js` 两个文件在 10-30 并入这一个），方法不匹配返回 405 `不支持的请求方法`。
> `all-custom-fields` 不在那条前缀里，单独一条 GET：只按调用方给的 `user_ids` 下发，不再整表导出（2026-09-21 收紧）。

### 5.12 路由分发方式

10-30 起是 Express 的 `app.use(router)`：路由按 `routes/index.js` 那张装配表装载，
`STATIC_ROUTERS`（2 条）在前、`API_ROUTERS`（11 条）在后，谁都没接住时由 `middleware/error-handler.js` 的 `notFound` 回旧那句 `text/plain` 的 `Not Found`。
数组顺序=命中顺序，`/api/users/custom-fields` 与 `/api/users/my` 必须早于 `/api/users/:id`，理由写在 `routes/index.js` 头部。
本站开了 `strict routing`，所以 `/api/users/`（带尾斜杠）仍然是另一条路由、仍然回 404；
这一句必须由每个子路由器自己写 `express.Router({ strict: true })`，app 级那句管不到子路由器。
后端曾有一条剥 `/jzxr` 前缀的兼容分支，已删除（线上前端从不用带前缀的地址，删除不影响任何现有请求）。
管理员接口统一走 `requireAdmin`（只认 `Authorization: Bearer <token>`；Cookie 只给用户侧接口做桥接）。

---

## 6. 安全机制

- **Bearer Token**：用户认证使用 HMAC-SHA256 签名，有效期 7 天
- **密码存储**：bcrypt 哈希（已升级，原 SHA256 兼容）
- **联系方式加密**：AES-256-CBC
- **加密密钥**：从环境变量读取，避免硬编码
- **输入验证**：
  - ID 格式验证（正则: `^[a-zA-Z0-9_-]+$`）
  - SQL 注入防护（参数化查询）
  - XSS 防护（字符串清理）
  - 路径遍历防护
  - 文件类型验证（扩展名 + 魔数）
  - **头像引用写闸**（`db/users.js` 的 `normalizeAvatarRef()`，读写两侧都过）：`data:` 内联图、超过 512 字符、空值一律存 `''` ⇒ 一次 `POST /api/users` 塞进 300KB base64、把列表接口变成几十 MB 这条路堵掉
- **速率限制**（`middleware/rate-limit.js`，除注册手机号那一桶外全部按 IP 分桶；`app.set('trust proxy', 1)` 之后 `req.ip` 等于 X-Forwarded-For 的最后一项 = Caddy 追加的真访客 IP）：

  | 入口 | 额度 | 窗口 |
  |------|------|------|
  | `POST /api/auth/captcha/verify` | 10 次 | 1 分钟（验证成功会签发放行注册的 token，比别的写入口更紧） |
  | `POST /api/auth/sms/register-code` | 60 次 | 1 分钟（服务层原来只按手机号做 60 秒防重，换个号就绕过） |
  | `POST /api/auth/sms/verify-register-code` | 60 次 | 1 分钟（6 位数字码，只闸发送不闸校验等于留下另一半） |
  | `POST/PUT/DELETE /api/users/custom-fields` | 60 次 | 1 分钟（`GET` 不拦，读接口不写库） |
  | `POST /api/auth/login`、`POST /api/admin/login` | 100 次 | 5 分钟 |
  | `POST /api/auth/register` | 按 IP 30 次 | 10 分钟 |
  | `POST /api/auth/register` | 按手机号 10 次 | 1 小时 |

  上表这七档现在**各用各的桶**（10-30 起：`middleware/rate-limit.js` 里每一档是一个独立的 `rateLimit()` 实例，express-rate-limit 的内存桶跟着实例走）。旧写法是滑块、短信发送、短信校验、自定义字段四处共用一张手写的 `rateLimitMap`（`git show 6cf49e6:backend/server.js` 的 333/340/345/397 行；`6cf49e6` 是 Express 那一笔之前的最后一笔，HEAD 里已经没有那段 if 链），只各自拿不同的上限去比 ⇒ 一个 IP 先打满 `custom-fields`，紧接着的短信发送也会 429；这条已经改掉，`backend/test/rate-limit.test.js` 里「一档耗尽不牵连另一档」那句就是钉它的。
  `custom-fields` 的 GET 免拦现在写在 `makeLimiter({ skip: req => req.method === 'GET' })` 里（先前是路由文件里包了一层内联函数，结构检查看不见那个 limiter，才改成 skip 的）。
  还有一处口径差别要知道：旧写法在 handler 内部先判限流再读请求体，现在请求体由全局 body 解析先读过 ⇒ 「又超限又被限流」的那条请求回 413 而不是 429。
  "全局限流"仍是对读接口关闭的，上表这些是逐条显式挂上的写入口。重启容器（`docker restart jzxr-local`）清桶这件事不变：内存桶不落盘。

---

## 7. 新增模块扩展指南

如需新增一个功能模块（例如：活动 activity），按以下模板创建：

### 7.1 `db/activity.js` - 只写 SQL

```js
const { getDb } = require('./index');
function getAll() { return getDb().prepare('SELECT * FROM activities').all(); }
function add(data) { /* ... */ }
module.exports = { getAll, add };
```

### 7.2 `services/activity.service.js` - 只写业务

```js
const activityDb = require('../db/activity');
function create(data) { /* 校验 / 脱敏 / 调用 db */ return activityDb.add(data); }
module.exports = { create };
```

### 7.3 `routes/activity.js` - 只写 HTTP

```js
const express = require('express');
const activityService = require('../services/activity.service');
const { requireToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/async-handler');
const { defaultBodyLimit } = require('../middleware/body');

// strict 这一句是必须的：app.js 里那句 app.set('strict routing') 只管 app 自己的路由器
const router = express.Router({ strict: true });

router.get('/api/activities', asyncHandler(async (req, res) => {
  res.json(await activityService.list(req.query));
}));

router.post(
  '/api/activities',
  requireToken(),          // 未登录回哪句、令牌无效回哪句，都在这个闸的参数里写死
  defaultBodyLimit(),      // 5MB 那条：超限回 413 +「请求体过大，最大允许5MB」
  asyncHandler(async (req, res) => {
    const result = await activityService.create(JSON.parse(req.body));
    res.status(result.success ? 200 : 400).json(result);
  }),
);

module.exports = router;
```

三条约定：`asyncHandler` 必须包（否则 async 里 reject 会漏成未处理拒绝，进程直接退）；
鉴权闸挂在路由上而不是在 handler 里手写 `if (!token)`；文案与状态码按旧契约给（`docs/API接口文档` 那份对差过的口径）。

### 7.4 注册路由

在 `routes/index.js` 的 `API_ROUTERS` 数组里加一项，位置按"路径重叠时谁先命中"来定，不要按字母插。
新增文件记得同时补 `backend/test/route-parity.test.js` 那句入口总数（10-30 现量 76）——这条断言就是为了让"加了一条没人记账的接口"当场变红。

---

## 8. 核心功能保护规则

以下三个功能是经过重点调试的核心功能，除非用户明确要求，否则不要修改其逻辑、行为或相关文件：

> ⚠️ 2026-10-13 全面审计这一轮**动过**这三处（代码里那几个 `[AGENT-DO-NOT-MODIFY]` 块）。起因不是风格，是三条自相矛盾：①「搜索」按钮会把用户刚填好的筛选条件清空、还会把清空结果写回 localStorage（刷新也找不回）；②条件填着但没点「开始匹配」时，界面上挂着条件、列表却完全没按条件筛；③多选下拉产出的是 `健身,登山` 这种逗号串，而匹配函数拿整串去 `includes`，等于要求资料格子里原样出现这六个字才算命中——可首页提示语偏偏写着「多项选择可用逗号分隔」。改后行为以本节为准，取证数字在 `docs/运维记录.md` §2.28。

### 8.1 搜索（按昵称/姓名/ID）

- 位置：`app/src/components/SearchPanel.tsx` 顶部搜索框区域
- 逻辑：`app/src/pages/Home.tsx` 中 `handleSearch` / `handleResetSearch` 及 `filteredRows` 内的关键词搜索部分
- 说明：关键词模糊/精确匹配，前端过滤。`handleSearch` 只管换一批行与关键词，**不碰筛选条件**；要清空条件请用「重置」或面板里的「清空」。

### 8.2 多条件筛选（字段 + 值）

- 位置：`app/src/components/SearchPanel.tsx` 中条件行列表区域
- 逻辑：`app/src/pages/Home.tsx` 中 `filteredRows`（目的筛选部分）
- 说明：用户添加多个字段条件后，通过目的/字段进行筛选

### 8.3 多条件匹配

- 位置：`app/src/components/SearchPanel.tsx` 中"开始匹配"按钮
- 逻辑：`app/src/pages/Home.tsx` 中 `results` 计算逻辑（`hasSearched || hasActiveConditions`）
- 服务：`app/src/services/match.service.ts`
- 说明：**只要条件行里"字段 + 值"都填上了就即时生效**（沿用原有 300ms 防抖），不必非点「开始匹配」；点「开始匹配」＝立刻生效。同一行内多个逗号分隔的值按**或**算（`健身,登山` ＝ 爱练任一就算命中），不同条件行之间按**且**算；`age` 行的 `25-30`、`>25` 写法优先于逗号规则。⚠️ 匹配仍然只在**当前页那 20 行**里做（服务端筛选没做，这是既有边界，见 §2.28 未验到）。

### 8.4 通用约束

- 不要修改上述核心功能的算法、返回值结构或交互行为
- 可以在此基础上增加不干扰现有逻辑的辅助功能，但必须经过用户确认
- 如果用户报告上述功能有 bug，先定位问题再最小化修复，不要重构
