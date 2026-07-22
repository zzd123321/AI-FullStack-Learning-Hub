# AI Learning Hub

一个独立于现有 VitePress 学习站的学习成长管理平台。本目录是该项目的唯一工作边界；现有仓库中的 `docs/`、`examples/` 与根目录 `package.json` 均不属于本项目，也不会被改造。

## 当前状态

目前已完成 M0 工程基线、注册登录/JWT/角色权限与本地管理员自动创建；正在实现步骤 5 的内容目录（学习路线、课程、Markdown 知识点）。未部署或发布。

## 目录约定

```text
Project/ai-learning-hub/
├── docs/                   # 产品、设计和逐步实现手册
├── web/                    # 未来：Vue 3 + TypeScript 前端
├── server/                 # 未来：Java 21 + Spring Boot 后端
├── infra/                  # 未来：本地环境与部署说明
└── contracts/              # 未来：OpenAPI 接口契约
```

应用目录已在对应学习步骤中创建；后续功能仍只在本目录内实现，避免与 VitePress 站点混合。

## 从哪里开始

先阅读 [设计总目录](docs/README.md)，再按 [逐步实现手册](docs/09-逐步实现手册.md) 执行。每一步都有学习目标、要完成的事情、验证方式和停止点；遇到需要影响产品范围或复杂度的选择，会先征求确认。

## 本地验证

```bash
cd Project/ai-learning-hub
cp infra/.env.example infra/.env
docker compose --env-file infra/.env -f infra/compose.yaml up -d
(cd server && mvn test)
(cd server && set -a; . ../infra/.env; set +a; DB_PASSWORD="$MYSQL_PASSWORD" mvn spring-boot:run)
(cd web && npm install && npm run dev)
```

浏览器打开 `http://localhost:5174` 后，前端会经 Vite 的同域代理请求 API。详细步骤和学习说明见 [逐步实现手册](docs/09-逐步实现手册.md) 与各步骤实现记录。
