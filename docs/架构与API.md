# 精准匹配 - 架构与 API

---

## 1. 整体目录结构（详细）

```
2.my-two-website/
├── app/                          # 前端应用（React + Vite）
│   ├── public/                   # 静态资源（不参与打包）
│   ├── src/                      # 业务源代码
│   │   ├── api/config.ts         # API 请求配置
│   │   ├── components/           # 公共组件（13 个）
│   │   │   ├── ContactPayModal.tsx      # 联系方式支付弹窗
│   │   │   ├── DeleteConfirmModal.tsx   # 删除确认弹窗
│   │   │   ├── ErrorBoundary.tsx       # 错误边界
│   │   │   ├── ImagePreview.tsx         # 图片预览
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
│   │   ├── services/             # 业务服务层
│   │   └── utils/                # 工具函数
│   ├── index.html                # 入口 HTML
│   ├── package.json
│   ├── vite.config.ts            # Vite 构建配置
│   ├── .prettierrc
│   └── .env.*                    # 环境变量
│
├── backend/                      # 后端应用（三层架构）
│   ├── admin/                    # 管理后台 HTML 模板（4 个文件）
│   │   ├── login.html            # 管理员登录页面
│   │   ├── m-login.html          # 手机版登录页面
│   │   ├── m.html                # 手机版管理主页
│   │   └── main.html             # 桌面版管理主页
│   ├── db/                       # 数据访问层（9 个文件）
│   ├── routes/                   # API 路由层（10 个文件）
│   ├── services/                 # 业务逻辑层（8 个文件）
│   ├── middleware/              # 中间件（安全.js / 日志.js）
│   ├── utils/                    # 通用工具（config.js / cookie工具.js / extractId.js / multipart.js / sendJson.js）
│   ├── uploads/                  # 用户上传文件目录（compose 挂载到容器内 /uploads）
│   │   ├── avatars/              # 用户头像
│   │   ├── deposits/             # 保证金凭证
│   │   ├── contact-unlock/       # 联系方式解锁凭证（运行时创建）
│   │   └── reports/              # 举报凭证
│   ├── server.js                 # 服务器入口
│   └── package.json
│
├── data/                        # 数据库 SQL（种子 / 导出 / 序列重置）；运行数据不在此（线上=服务器 PG 数据目录，容器方案=命名卷 `pgdata`）
│   ├── match_db_pg15.sql        # ⚠️ 整个 data/ 被 .gitignore:20 排除，三个 SQL 均**不在 Git 里**（实测 `git ls-files data/` 为空）→ 服务器上必须单独 scp，否则 compose 挂的是缺失的 bind 源
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
| routes | `routes/` | 解析 HTTP 请求、鉴权、返回 JSON 响应 | 不直接写 SQL、不写加密逻辑 |
| services | `services/` | 业务规则 / 参数校验 / 状态流转 / 权限判定 | 不写 HTTP 响应、不直接操作数据库 |
| db | `db/` | 纯 SQL 操作 / 数据读写 / Token 工具 / 加密工具 | 不含业务规则、不写 HTTP 逻辑 |
| 入口 | `server.js` | HTTP 服务启动 / 路由注册 / 全局中间件 | 不写具体业务 |

### 2.1 后端目录详细说明

```
backend/
├── admin/                          # 管理后台 HTML 模板
│   ├── login.html                  # 管理员登录页面
│   ├── m-login.html                # 手机版登录页面
│   ├── m.html                      # 手机版管理主页
│   └── main.html                   # 桌面版管理主页
│
├── db/                             # 数据访问层（纯 SQL，9 个文件）
│   ├── index.js                    # DB 连接 / Token / 加密 / 密码哈希
│   ├── users.js                    # 用户表：CRUD / 搜索 / 统计 / 审核
│   ├── auth.js                     # 账号注册 / 密码校验 / 密码修改
│   ├── reports.js                  # 举报：新增 / 列表 / 状态更新 / 删除
│   ├── ratings.js                  # 评价：新增 / 列表 / 平均分
│   ├── payments.js                 # 支付/保证金/解锁：订单 / 保证金 / 解锁请求
│   ├── admin.js                    # 管理员：日志 / 自定义筛选字段
│   ├── vector.js                   # 向量数据库：向量 CRUD / 相似搜索 / 双向匹配
│   └── field-mappings.js           # 字段映射工具
│
├── routes/                         # API 路由层（10 个文件）
│   ├── users.js                    # 用户相关 API
│   ├── auth.js                     # 认证登录 API
│   ├── reports.js                  # 举报 API
│   ├── ratings.js                  # 评价 API
│   ├── payment.js                  # 支付 API
│   ├── upload.js                   # 上传 API
│   ├── vector.js                   # 向量搜索 API
│   ├── admin-custom-fields.js      # 管理员自定义字段 API
│   ├── user-custom-fields.js       # 用户自定义字段 API
│   └── contact-unlock.js           # 联系方式解锁 API
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
└── server.js                       # 服务器入口：注册路由 / 全局中间件
```

---

## 3. 前端模块详解

### 3.1 路由配置（App.tsx）

| 路径 | 页面 |
|------|------|
| `/` | 首页（用户列表、筛选、匹配） |
| `/post` | 发布个人资料（需登录，`RequireAuth` 守卫） |
| `/deposit` | 保证金缴纳页面 |
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

export const API_ENDPOINTS = {
  users: '/users',
  userById: (id: string) => `/users/${encodeURIComponent(id)}`,
  myUser: '/users/my',
  userSearch: '/users/search',
  pendingUsers: '/users/pending',
  ratings: '/ratings',
  reports: '/reports',
  unlockContact: (id: string) => `/users/${encodeURIComponent(id)}/unlock-contact`,
  checkUnlock: (id: string) => `/users/${encodeURIComponent(id)}/check-unlock`,
} as const;
```

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

数据库：PostgreSQL 18 + pgvector v0.8.2
数据位置：PostgreSQL 跑在 `postgres` 容器内，数据在 Docker 命名卷 `pgdata`（容器挂 `/var/lib/postgresql`）。仓库 `data/` 只存 SQL 种子/导出文件、不含运行数据；但这些 SQL **不在 Git 里**（`data/` 被整目录 ignore），换机器或上服务器必须手工拷贝。

### 4.1 核心业务数据表

| 表名 | 用途 |
|------|------|
| `auth_users` | 用户认证信息（手机号、密码哈希） |
| `users` | 用户资料（姓名、年龄、联系方式等 40+ 字段） |
| `user_ratings` | 用户评价 |
| `user_reports` | 用户举报 |
| `contact_unlocks` | 联系方式解锁记录 |
| `deposits` | 保证金记录 |
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

说明：数据库已从 SQLite 迁移至 PostgreSQL，运行数据不在仓库 `data/` 内（线上在服务器 PG 数据目录，容器方案在 Docker 命名卷 `pgdata`，见 §4），原 `database.js` 已被拆分到 `db/` 目录，不再使用单一大文件。

---

## 5. API 接口一览

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
| GET | `/api/users` | 获取用户列表 | 可选 |
| POST | `/api/users` | 添加用户 | Token |
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

### 5.3 上传接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/upload/avatar` | 上传头像 | Token |
| POST | `/api/deposit/upload-proof` | 上传保证金凭证 | Token |
| GET | `/api/users/my-deposit` | 我的保证金状态 | Token |

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
| GET | `/api/admin/deposits` | 保证金列表 | 管理员 |
| PUT | `/api/admin/deposits/:id/approve` | 审核通过保证金 | 管理员 |
| PUT | `/api/admin/deposits/:id/reject` | 拒绝保证金 | 管理员 |
| GET | `/api/admin/deposits/proof/:id` | 读取保证金凭证图片 | 管理员 |
| DELETE | `/api/admin/deposits/:id` | 删除保证金记录 | 管理员 |
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
> `/api/vector/batch` 额外要求管理员令牌（`server.js` 把 `checkAdminAuth` 传进来），因为它一次最多跑 `limit`（默认 100）个用户的付费向量。
> 现状：前端没有任何页面调用 `/api/vector/*`，`user_vectors` 表里有向量的行数为 0（唯一一行的两个向量列都是 NULL）。这套匹配引擎已实现但还没接到产品上，启用前先配 `EMBEDDING_API_KEY`，否则 `generateEmbedding` 直接抛错。

**向量搜索参数说明：**
- `type`：搜索类型，`profile`（资料相似）或 `expectation`（要求相似），默认 `profile`
- `limit`：返回结果数量，默认 10
- 相似度范围：0~1，值越大越相似

### 5.8 支付接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/payment/create` | 创建支付订单。微信返回 `codeUrl`（前端本地生成二维码），支付宝返回 `payUrl`（跳转） | Token |
| GET | `/api/payment/status` | 查询订单状态 | Token |
| GET | `/api/payment/mock-pay` | 模拟支付，生产环境返回 404 | Token |
| POST | `/api/payment/notify-wechat` | 微信支付 v3 回调 | 无 Token，AES-256-GCM 解密即认证来源 |
| POST | `/api/payment/notify-alipay` | 支付宝支付回调 | 无 Token，校验支付宝公钥签名 |
| POST | `/api/payments/view-contact` | 已停用，恒返回 501（改走手动上传凭证） | - |
| GET | `/api/payment/config` | 公开标价 `{deposit_amount, contact_unlock_amount, platform_fee, emotional_damage, delete_refund}`（元），前端展示金额用，不含任何写权限。后三项是「一笔保证金怎么分」，只给保证金规则页展示，不参与下单金额计算 | 否 |
| GET | `/api/admin/payment-price` | 后台读标价：每项给当前值、分值、环境变量兜底值、来源（`db`/`env`）与最后改动时间 | 管理员 |
| PUT | `/api/admin/payment-price` | 后台改标价，写进 `admin_settings`（按分存整数）。只影响之后新建的订单，已下单的金额不变。先把本轮提交的每一项都校验完，再校验「平台运营费＋感情损失费＋删除可退 = 保证金」，两项都过了才落库；对不上则整笔不写并回 400 说明 | 管理员 |

回调侧的三条硬约定（改代码前先读）：

- 金额与身份只认逐笔比对：下单时请求体里的 `amount` 被忽略，一律取服务端标价（`backend/utils/pricing.js` 读 `admin_settings`，后台「价格设置」没写过的项才退回 `DEPOSIT_AMOUNT` / `CONTACT_UNLOCK_AMOUNT`）；入账前还要把通知的 `amount.total`（分）与订单应收、通知的 `appid`/`mchid` 与 `backend/.env` 的配置、`trade_state` 与 `SUCCESS` 三项同时对齐，缺任何一个都能被"付一分钱解锁保证金"、或被同一把 APIv3 密钥下别的应用发来的通知绕过。这几项判定是纯函数，写在 `backend/utils/payment-verify.js`，单测在 `app/src/utils/payment-verify.test.ts`（`cd app && npx vitest run`）。
- 微信 v3 靠 HTTP 状态码决定是否重推，失败分两类回：暂时处理不了的（解密失败、订单暂时查不到、本站支付键没配齐）回 500——回 2xx 等于告诉微信"已送达"，那一次没落库就是永久丢单，且全程无报错；而重推多少次也不会变好的伪通知（金额不符、appid/mchid 不符、交易状态非 SUCCESS、非支付成功事件）回 204 空响应收口，否则会被按退避策略重推约一天，把重推队列和日志刷满。
- 回调地址只能填 `https://sparklove.cn/api/payment/notify-wechat` 与 `.../notify-alipay`，**不能带 `/jzxr` 前缀**。带前缀会被前端单页应用兜底成 200 的 index.html，症状与上一条相同：钱扣了、保证金不解锁、全程零报错。

开通支付需要在 `backend/.env` 填的键（模板见 `.env.example`）：
`WECHAT_APP_ID`、`WECHAT_MCH_ID`、`WECHAT_API_V3_KEY`、`WECHAT_MERCHANT_SERIAL_NO`、`WECHAT_MERCHANT_PRIVATE_KEY`、`WECHAT_NOTIFY_URL`、
`ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY`、`ALIPAY_NOTIFY_URL`、`ALIPAY_RETURN_URL`。
某个渠道的键没填全则该渠道不可用；`payment_orders.channel_txn_id`（渠道流水号，对账用）由服务启动时自动补列。
`DEPOSIT_AMOUNT`、`CONTACT_UNLOCK_AMOUNT` 只是「后台从没改过这个价」时的兜底默认值：日常改价在后台「价格设置」页（桌面 `/admin/`、手机 `/admin/m`）做，写进 `admin_settings` 后即刻生效，不用改代码、不用重新部署。保证金拆分三档（`platform_fee` / `emotional_damage` / `delete_refund`）**没有** 对应的 `.env` 键，兜底值写死在 `backend/utils/pricing.js` 的 `ITEMS`（9.9 / 10 / 10），要改就走后台。保证金规则页（`app/src/pages/DepositPage.tsx`）展示的五个数字全部来自 `GET /api/payment/config`，「甲方无过错时退还多少」由 `保证金 - 平台运营费` 算出，前端不再硬编码。

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

> 该组路由在 `server.js` 中按前缀整体转交给 `handleUserCustomFields`，方法不匹配返回 405。
> `all-custom-fields` 不在那条前缀里，由 `server.js` 内联处理：只按调用方给的 `user_ids` 下发，不再整表导出（2026-09-21 收紧）。

### 5.12 路由分发方式

路由不是 Express 的 `app.use(router)`，而是 `server.js` 内手写的 pathname 分发器（正则 + 前缀判断），末尾统一 404。
分发器内部只匹配 `/api/xxx`。后端曾有一条剥 `/jzxr` 前缀的兼容分支，已删除（线上前端从不用带前缀的地址，删除不影响任何现有请求）。
管理员接口统一走 `checkAdminAuth(req)`（只认 `Authorization: Bearer <token>`）。

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
- **速率限制**：全局已关闭，登录限制 100 次/5 分钟（每 IP）

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
const activityService = require('../services/activity.service');
function handle(req, res) { /* ... res.end(JSON.stringify(result)); */ }
module.exports = { handle };
```

### 7.4 注册路由

在 `server.js` 中注册新路由即可。

---

## 8. 核心功能保护规则

以下三个功能是经过重点调试的核心功能，除非用户明确要求，否则不要修改其逻辑、行为或相关文件：

### 8.1 搜索（按昵称/姓名/ID）

- 位置：`app/src/components/SearchPanel.tsx` 顶部搜索框区域
- 逻辑：`app/src/pages/Home.tsx` 中 `handleSearch` / `handleResetSearch` 及 `filteredRows` 内的关键词搜索部分
- 说明：关键词模糊/精确匹配，前端过滤

### 8.2 多条件筛选（字段 + 值）

- 位置：`app/src/components/SearchPanel.tsx` 中条件行列表区域
- 逻辑：`app/src/pages/Home.tsx` 中 `filteredRows`（目的筛选部分）
- 说明：用户添加多个字段条件后，通过目的/字段进行筛选

### 8.3 多条件匹配

- 位置：`app/src/components/SearchPanel.tsx` 中"开始匹配"按钮
- 逻辑：`app/src/pages/Home.tsx` 中 `results` 计算逻辑
- 服务：`app/src/services/match.service.ts`
- 说明：点击"开始匹配"后，根据所有活跃条件进行 AND 匹配，只显示满足全部条件的结果

### 8.4 通用约束

- 不要修改上述核心功能的算法、返回值结构或交互行为
- 可以在此基础上增加不干扰现有逻辑的辅助功能，但必须经过用户确认
- 如果用户报告上述功能有 bug，先定位问题再最小化修复，不要重构
