# 精准匹配 - 同频交友平台

基于 Web 的标签找人平台.给一个人贴很多标签,按特定标签筛选,相当于线上 Excel 表格.

**线上演示**:<https://sparklove.cn>

![微光亦是永恒匹配页](docs/images/home.png)

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 7 + Tailwind CSS |
| 后端 | Node.js + Express 4(10-30 起；此前是手写的原生 `http` 分发器) + multer + express-rate-limit |
| 数据库 | PostgreSQL + pg 连接池（全异步）+ pgvector(向量搜索扩展) |
| 部署 | Docker Compose + Caddy 单轨。**线上与本机都已跑在这一轨上**（2026-10-14 现量：服务器 Debian 12、`docker compose ps` 里 caddy/jzxr/jzxr-web/postgres 全 running、宿主机没有 nginx/pm2/node 命令）。旧栈 Alibaba Cloud Linux + Nginx + PM2 已作废，要回看走 Git 历史 |

## 目录结构

```
sparklove-matching/
├── app/                    # 前端(React + Vite)
│   ├── src/
│   │   ├── components/     # 公共组件(15 个；10-14 现量 `ls app/src/components/*.tsx`＝15)
│   │   ├── pages/          # 页面组件(11 个)
│   │   ├── services/       # 业务服务层
│   │   └── api/            # API 请求配置
│   └── vite.config.ts
│
├── backend/                # 后端(Express + 三层架构)
│   ├── config/             # 环境变量 → 常量的唯一取值处
│   ├── db/                 # 数据访问层(含 vector.js 向量模块)
│   ├── middleware/         # HTTP 中间件(安全头/日志/CORS/鉴权/限流/请求体/上传/错误)
│   ├── routes/             # API 路由层(13 个 router + index.js 装配表)
│   ├── services/           # 业务逻辑层(含 vector.service.js)
│   ├── test/               # 后端单测(96 条,全都不连库)
│   ├── admin/              # 管理后台 HTML 模板
│   ├── uploads/            # 用户上传文件(运行时创建)
│   ├── app.js              # createApp():中间件顺序 + 路由装配
│   └── server.js           # 进程入口(listen / 启动校验 / 优雅退出)
│
└── data/                   # 仅存 3 个 SQL 文件(种子/结构脚本)
                            # 数据库实际数据不在仓库：线上与本机都是 compose 里的 postgres 容器，
                            # 数据在 Docker 命名卷(compose 名 pgdata → Docker 实际名 www_pgdata)
```

## 快速启动

```bash
# 后端(终端1,国内用户推荐用镜像源加速)
cd E:\website\sparklove-matching\backend
npm install --registry=https://registry.npmmirror.com
npm start
# -> http://localhost:8080

# 前端(终端2)
cd E:\website\sparklove-matching\app
npm install --registry=https://registry.npmmirror.com
npm run dev
# -> http://localhost:4000/      （根路径；旧的 /jzxr 前缀已废除，见 docs/部署运维.md 故障排查表）
```

## 访问地址

| 环境 | 地址 |
|------|------|
| 本地前端 | http://localhost:4000/（根路径，没有 `/jzxr` 前缀） |
| 本地后端 | http://localhost:8080/api |
| 管理后台 | http://localhost:8080/admin |
| 生产环境 | https://sparklove.cn/ |

> 管理后台：`https://sparklove.cn/admin`（由前端容器转发到后端，与站点同源，不额外开端口）。

## 核心功能

- 用户注册/登录(手机号 + 密码)
- 资料发布(40+ 字段)
- 关键词搜索 + 多条件筛选（⚠️ 条件筛选只在当前页 20 条里筛，不是全库筛；见 docs/项目总览.md §9）
- 多条件 AND 匹配（同上，口径一致）
- 向量相似匹配(pgvector,mock/openai 双模式)（⏳ 代码齐但线上没启用：`EMBEDDING_PROVIDER=mock`、`user_vectors` 0 行）
- 双向匹配推荐(用户画像 ↔ 择偶要求)（⏳ 接口有、前端无入口）
- 评价体系（线上 0 条）
- 举报系统（线上 0 条）
- 认证费机制（29.9 一次性、不退，交过才进搜索列表）+ 查看联系方式按次 9.9；3 次包 25.9、5 次包 39.9 已写好、暂未上架
  - 注：当前线上 99 条资料的 29.9 是「后台代录时直接写进 `users.deposit` 字段」，不是真的交了钱；`deposits` 表里只有测试的 1 条 ¥0.01。口径来源见 VISION.md「由后台代录，已缴认证费口径记 29.9」。
- 联系方式加密解锁
- 管理后台(用户管理、审核、统计)
- 收款标价后台可改(认证费、查看联系方式单次与两个次数包，不用改代码也不用重新部署)

> 上面这张表说明「代码里有这条功能」，不代表「线上跑过」。每条在线上的真实状态见 [docs/项目总览.md](docs/项目总览.md) §9 的「线上现状」列，测量过程见 [docs/运维记录.md](docs/运维记录.md) §2.32。

## 文档

| 文档 | 内容 |
|------|------|
| [项目总览](docs/项目总览.md) | 项目入口,技术栈,快速启动 |
| [架构与API](docs/架构与API.md) | 三层架构,数据库 Schema,API 接口 |
| [部署运维](docs/部署运维.md) | 服务器配置、部署流程（单轨 Docker Compose + Caddy 单轨，§7 流程 / §11 服务清单） |
| [运维记录](docs/运维记录.md) | 改进报告,修复记录,测试指南 |

## 环境要求

- Node.js >= 18.0.0(推荐 v20.20.2)
- npm >= 10.0.0
- PostgreSQL 18 + pgvector 扩展

## License

Private
