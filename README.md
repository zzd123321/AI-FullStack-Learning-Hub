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
- 每篇学习文档包含学习目标、示例、练习、总结和官方参考资料。
- 涉及版本变化的内容需要注明适用版本和更新时间。
- 新增页面后同步更新导航、侧边栏和前后置知识链接。

## 当前进度

- [x] 站点首页与中文导航
- [x] 学习路线首页
- [x] 本地全文搜索
- [x] 第一篇 TypeScript 学习文档
- [ ] Vue 3 学习模块
- [ ] Java 基础模块
- [ ] 数据库基础模块
- [ ] AI 应用开发模块
