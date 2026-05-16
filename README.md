# Lumina for Nezha

Lumina 是面向 [哪吒监控（Nezha）](https://github.com/nezhahq/nezha) 的前台主题，强调流畅动效与卡片化信息密度。

## 截图

白日模式：

![Light](https://cdn.nodeimage.com/i/nL9GD3QcqtLla7kWrqaAXj8Xfg0f9pPA.webp)

夜间模式：

![Dark](https://cdn.nodeimage.com/i/pCDfjaqYE9gYxP0VJeAnX1zdFugqDiLD.webp)

## 特性

- 首页节点数据直接消费哪吒 WebSocket 实时流，无轮询开销
- 首页延迟概览映射哪吒服务监控数据
- 详情页负载历史读取 metrics 接口，支持实时 / 1 天 / 7 天 / 30 天
- 详情页 Ping 图表读取 service 历史接口
- 深色/浅色主题自动跟随系统，支持手动切换

## 安装

### 方式一：主题商店（推荐）

在哪吒面板后台的主题设置中搜索 `Lumina` 并安装。

### 方式二：手动构建

```bash
npm install
npm run build
```

将 `dist/` 部署到哪吒前端静态资源目录，或通过反向代理与哪吒后端 `/api/v1/*` 联通。

## 开发

要求 Node.js 22+。

```bash
npm install
npm run dev
```

## 参考

- [哪吒开发接口文档](https://nezha.wiki/developer/api.html)
- [哪吒监控仓库](https://github.com/nezhahq/nezha)
