# Lumina for Nezha

Lumina 现已迁移为面向 [哪吒监控（Nezha）](https://github.com/nezhahq/nezha) 的前台主题版本，首页继续强调流畅度与卡片化信息密度，详情页保留高信息密度的状态展示风格。

![Lumina Preview](./preview-readme.png)

## 截图

白日模式首页截图：

![nL9GD3QcqtLla7kWrqaAXj8Xfg0f9pPA.webp](https://cdn.nodeimage.com/i/nL9GD3QcqtLla7kWrqaAXj8Xfg0f9pPA.webp)

夜间模式首页截图：

![pCDfjaqYE9gYxP0VJeAnX1zdFugqDiLD.webp](https://cdn.nodeimage.com/i/pCDfjaqYE9gYxP0VJeAnX1zdFugqDiLD.webp)

管理面截图：

![UQa2pV5jv1UPlJXLHoPia3QQO7Xn6jAS.webp](https://cdn.nodeimage.com/i/UQa2pV5jv1UPlJXLHoPia3QQO7Xn6jAS.webp)

## 特性

- 首页节点数据改为直接消费哪吒 `/api/v1/ws/server` 实时流。
- 首页延迟概览改为映射哪吒服务监控数据，不再依赖旧版 Ping 任务绑定逻辑。
- 详情页负载历史改为读取哪吒 `metrics` 接口，支持实时、1 天、7 天、30 天展示。
- 详情页 Ping 图表改为读取哪吒 `service` 历史接口。
- 前台不再内置主题管理面板，后台入口统一跳转到 `/dashboard/`。

## 当前限制

- 本仓库只实现哪吒前台主题接入，不修改哪吒后端。
- 旧版前端主题管理页已停用，仓库内相关逻辑已移除。
- 若需调整节点、服务监控、登录等配置，请前往哪吒后台 `/dashboard/`。

## 安装

1. 安装并启动哪吒面板与 Agent。
2. 将本仓库作为前端工程构建：

```bash
npm install
npm run build
```

3. 将 `dist/` 部署到你的哪吒前端静态资源环境，或通过反向代理与哪吒后端 `/api/v1/*` 联通。

## 开发

要求：

- Node.js 22+
- npm

安装依赖：

```bash
npm install
```

本地开发：

```bash
npm run dev
```

构建：

```bash
npm run build
```

打包产物：

```bash
npm run package
```

## 参考

- [哪吒开发接口文档](https://nezha.wiki/developer/api.html)
- [哪吒监控仓库](https://github.com/nezhahq/nezha)
- [Mochi 主题](https://github.com/svnmoe/komari-web-mochi)
- [PurCarte 主题](https://github.com/Montia37/komari-theme-purcarte)
