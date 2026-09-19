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
│   │   │   ├── DetailModal.tsx         # 详情弹窗
│   │   │   ├── ErrorBoundary.tsx       # 错误边界
│   │   │   ├── ImagePreview.tsx         # 图片预览
│   │   │   ├── RatingModal.tsx         # 评价弹窗
│   │   │   ├── ReportModal.tsx         # 举报弹窗
│   │   │   ├── SearchPanel.tsx         # 搜索面板
│   │   │   ├── SliderCaptcha.tsx       # 滑动验证码
│   │   │   ├── TabBar.tsx             # 底部导航栏
│   │   │   ├── UserCard.tsx           # 用户卡片
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
│   ├── __tests__/                # 单元测试
│   │   ├── auth.test.js          # 认证测试
│   │   └── csrf.test.js          # CSRF 测试
│   ├── db/                       # 数据访问层（8 个文件）
│   ├── routes/                   # API 路由层（6 个文件）
│   ├── services/                 # 业务逻辑层（8 个文件）
│   ├── middleware/              # 中间件
│   ├── server.js                 # 服务器入口
│   ├── package.json
│   └── .prettierrc
│
├── data/                        # 数据库
│   └── pg_data/                # PostgreSQL 数据目录
│
├── uploads/                      # 用户上传文件目录
│   ├── avatars/                  # 用户头像
│   ├── deposits/                 # 保证金凭证
│   ├── contact-unlock/           # 联系方式解锁凭证
│   └── reports/                  # 举报凭证
│
├── nginx-config.conf             # Nginx HTTPS/压缩配置
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
├── services/                       # 业务逻辑层（10 个文件）
│   ├── user.service.js             # 用户业务：数据脱敏 / 验证 / 审核流转
│   ├── auth.service.js             # 认证业务：注册 / 登录 / Token 生成
│   ├── reports.service.js          # 举报业务：提交验证 / 状态管理
│   ├── ratings.service.js          # 评价业务：去重 / 分数范围校验
│   ├── payments.service.js         # 支付业务：订单生成 / 保证金审核
│   ├── admin.service.js            # 管理员业务：日志 / 备份 / 字段管理
│   ├── captcha.service.js          # 滑动验证码服务
│   ├── csrf.service.js             # CSRF 防护服务
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
| `/post` | 发布个人资料 |
| `/deposit` | 保证金缴纳页面 |
| `/qr` | 二维码分享页面 |
| `/login` | 登录/注册页面 |
| `/profile` | 个人资料管理 |
| `/circles` | 圈子页面 |
| `/circle/:circleKey/:tag` | 圈子详情 |

### 3.2 API 配置层（`src/api/config.ts`）

```typescript
export const API_BASE_URL = ENV_BASE_URL || '/jzxr/api';

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
| UserCard | 用户卡片展示 |
| DetailModal | 用户详情弹窗 |
| RatingModal | 评价弹窗 |
| ReportModal | 举报弹窗 |
| ImagePreview | 图片预览 |
| SearchPanel | 搜索面板 |
| ErrorBoundary | 错误边界 |
| SliderCaptcha | 滑动验证码 |
| ContactPayModal | 联系方式支付弹窗 |
| DeleteConfirmModal | 删除确认弹窗 |
| UserDetailModal | 用户详情弹窗 |
| UserList | 用户列表 |

### 3.4 Vite 配置（`vite.config.ts`）

```typescript
base: env.VITE_BASE_URL || '/jzxr'
server: {
  port: 4000,
  proxy: {
    '/jzxr/api':   { target: 'http://localhost:8080', rewrite: path => path.replace(/^\/jzxr/, '') },
    '/jzxr/admin': { target: 'http://localhost:8080', rewrite: path => path.replace(/^\/jzxr/, '') },
  }
}
```

---

## 4. 数据库 Schema

数据库：PostgreSQL 18 + pgvector v0.8.2
数据目录：`data/pg_data/`

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
| `messages` | 平台内消息（预留表，暂未使用） |
| `admin_settings` | 管理设置 |
| `admin_logs` | 管理员操作日志 |

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
| `deleteUserVector()` | 删除用户向量 |
| `getVectorStats()` | 获取向量统计信息 |

说明：数据库已从 SQLite 迁移至 PostgreSQL，数据目录位于 `data/pg_data/`，原 `database.js` 已被拆分到 `db/` 目录，不再使用单一大文件。

---

## 5. API 接口一览

### 5.1 认证接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/auth/register` | 用户注册 | 否 |
| POST | `/api/auth/login` | 用户登录 | 否 |
| POST | `/api/admin/login` | 管理员登录 | 否 |

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
| GET | `/api/users/search` | 搜索用户（`contact` 参数仅管理员生效，匿名传入返回空） | 可选 |
| GET | `/api/users/:id/check-unlock` | 检查解锁状态 | Token |

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
| PUT | `/api/admin/deposits/approve` | 审核通过保证金 | 管理员 |
| PUT | `/api/admin/deposits/reject` | 拒绝保证金 | 管理员 |
| GET | `/api/admin/unlock-records` | 解锁记录 | 管理员 |

### 5.7 向量搜索接口

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/vector/stats` | 向量统计信息 | 否 |
| POST | `/api/vector/generate/:userId` | 生成并存储用户向量 | Token |
| GET | `/api/vector/similar/:userId` | 相似用户搜索 | Token |
| GET | `/api/vector/match/:userId` | 双向匹配推荐 | Token |
| POST | `/api/vector/batch` | 批量生成向量 | 管理员 |

**向量搜索参数说明：**
- `type`：搜索类型，`profile`（资料相似）或 `expectation`（要求相似），默认 `profile`
- `limit`：返回结果数量，默认 10
- 相似度范围：0~1，值越大越相似

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
