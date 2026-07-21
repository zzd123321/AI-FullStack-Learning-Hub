# AI 全栈学习站

面向前端开发者的中文全栈与 AI 学习知识库。项目使用 VitePress、Vue 3、TypeScript 和 Markdown 构建。

## 本地运行

环境要求：Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

开发服务器启动后，按照终端显示的本地地址打开站点。

## 构建与预览

```bash
npm run build
npm run preview
```

## 部署到 GitHub Pages

1. 在 GitHub 创建仓库，并把当前项目推送到 `main` 分支。
2. 打开仓库的 **Settings → Pages**。
3. 在 **Build and deployment** 中把 Source 设为 **GitHub Actions**。
4. 再次推送代码，或在 Actions 页面手动运行部署工作流。

项目在 GitHub Actions 中会自动根据仓库名计算站点基础路径，因此既支持普通项目仓库，也支持 `<username>.github.io` 仓库。

## 内容约定

- 文档默认使用中文，专业术语首次出现时附带英文名称。
- 文件名使用小写英文和连字符。
- 每篇学习文档包含学习目标、可运行示例、原理分析、总结和官方参考资料。
- 涉及版本变化的内容需要注明适用版本和更新时间。
- 新增页面后同步更新导航、侧边栏和前后置知识链接。

## 当前进度

- [x] 站点首页与中文导航
- [x] 学习路线首页
- [x] 本地全文搜索
- [x] 前端开发：TypeScript、Vue 3、React、浏览器、工程化与架构专题
- [x] 后端开发：Java、Spring Boot、Python、FastAPI 与后端架构专题
- [x] 数据库：SQL、索引、事务、Redis 与数据库设计主线
- [x] 人工智能基础：AI 概念与机器学习所需数学基础
- [x] 大模型应用：请求链路、Prompt、工具调用、检索、RAG、评估与 Agent
- [ ] 大模型应用：MCP 客户端、服务端与安全边界
- [ ] 大模型应用：安全、成本、可观测性与部署

## 当前课程

下一步进入 [大模型应用开发：MCP 的客户端、服务端与安全边界](docs/ai-application/)。专题首页保留已完成课程导航，并会承接后续的安全、成本、可观测性和部署内容。
