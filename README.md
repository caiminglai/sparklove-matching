# 精准匹配 - 相亲平台

基于 Web 的相亲匹配平台.给一个人贴很多标签,按特定标签筛选,相当于线上 Excel 表格.

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 7 + Tailwind CSS |
| 后端 | Node.js 原生 HTTP 服务器(非 Express) |
| 数据库 | PostgreSQL + pg 连接池（全异步）+ pgvector(向量搜索扩展) |
| 部署 | Docker Compose + Caddy 单轨（本机已整站验证；服务器将重装为 Debian + Docker 后走同一份 compose，旧栈 Nginx + PM2 已作废） |

## 目录结构

```
2.my-two-website/
├── app/                    # 前端(React + Vite)
│   ├── src/
│   │   ├── components/     # 公共组件(13 个)
│   │   ├── pages/          # 页面组件(11 个)
│   │   ├── services/       # 业务服务层
│   │   └── api/            # API 请求配置
│   └── vite.config.ts
│
├── backend/                # 后端(三层架构)
│   ├── db/                 # 数据访问层(含 vector.js 向量模块)
│   ├── routes/             # API 路由层(含 vector.js 向量路由)
│   ├── services/           # 业务逻辑层(含 vector.service.js)
│   ├── admin/              # 管理后台 HTML 模板
│   ├── uploads/            # 用户上传文件(运行时创建)
│   └── server.js           # 服务器入口
│
└── data/                   # 仅存 3 个 SQL 文件(种子/结构脚本)
                            # 数据库实际数据不在仓库：线上=服务器自建 PG 目录，容器方案=命名卷 pgdata
```

## 快速启动

```bash
# 后端(终端1,国内用户推荐用镜像源加速)
cd E:\website\2.my-two-website\backend
npm install --registry=https://registry.npmmirror.com
npm start
# -> http://localhost:8080

# 前端(终端2)
cd E:\website\2.my-two-website\app
npm install --registry=https://registry.npmmirror.com
npm run dev
# -> http://localhost:4000/jzxr
```

## 访问地址

| 环境 | 地址 |
|------|------|
| 本地前端 | http://localhost:4000/jzxr |
| 本地后端 | http://localhost:8080/api |
| 管理后台 | http://localhost:8080/admin |
| 生产环境 | https://sparklove.cn/ |

> 管理后台：`https://sparklove.cn/admin`（由前端容器转发到后端，与站点同源，不额外开端口）。

## 核心功能

- 用户注册/登录(手机号 + 密码)
- 资料发布(40+ 字段)
- 关键词搜索 + 多条件筛选
- 多条件 AND 匹配
- 向量相似匹配(pgvector,mock/openai 双模式)
- 双向匹配推荐(用户画像 ↔ 择偶要求)
- 评价体系
- 举报系统
- 保证金机制
- 联系方式加密解锁
- 管理后台(用户管理、审核、统计)
- 收款标价后台可改(保证金、联系方式解锁，不用改代码也不用重新部署)

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
