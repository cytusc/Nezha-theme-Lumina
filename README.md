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

前提：服务器已安装 Docker 且哪吒 Dashboard 正在运行。

```bash
curl -fsSL https://raw.githubusercontent.com/cytusc/Nezha-theme-Lumina/main/deploy.sh | bash
```

脚本会自动探测本机哪吒服务端口，交互式配置后拉取镜像并启动容器。

部署完成后容器监听 `127.0.0.1:3000`（可通过 `.env` 中 `LUMINA_PORT` 修改），Caddy/Nginx 只需反向代理到该端口即可。

Caddy 示例：

```caddyfile
your.domain {
    @grpc path /proto.NezhaService/*
    reverse_proxy @grpc 127.0.0.1:8008 {
        transport http { versions h2c }
    }
    reverse_proxy 127.0.0.1:3000
}
```

容器内包含：
- Lumina 前端静态文件
- lumina-api 数据聚合服务
- nginx 反向代理（自动转发 `/api`、`/dashboard` 到哪吒后端）

环境变量（`.env`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NEZHA_HOST` | `host.docker.internal` | 哪吒 Dashboard 地址 |
| `NEZHA_PORT` | `8008` | 哪吒 Dashboard 端口 |
| `LUMINA_PORT` | `3000` | 容器对外映射端口 |
| `LUMINA_DASHBOARD_USERNAME` | 空 | 哪吒管理员用户名（可选，用于拉取完整数据） |
| `LUMINA_DASHBOARD_PASSWORD` | 空 | 哪吒管理员密码 |

常用命令：

```bash
cd /opt/lumina && docker compose up -d      # 启动
cd /opt/lumina && docker compose down       # 停止
cd /opt/lumina && docker compose logs -f    # 查看日志
```

## 开发

要求 Node.js 22+。

```bash
npm install
npm run dev
```

## 项目结构

```
├── src/                  # 前端源码 (React + TypeScript)
├── docker/               # Docker 运行时配置
│   ├── nginx.conf.template   # nginx 路由模板
│   ├── supervisord.conf      # 进程管理
│   ├── lumina_home_api.py    # 数据聚合后端
│   └── entrypoint.sh         # 容器入口脚本
├── Dockerfile            # 多阶段构建 (Node 编译 + Alpine 运行时)
├── docker-compose.yml    # 一键部署编排
└── deploy.sh             # 交互式部署脚本
```

## 参考

- [哪吒开发接口文档](https://nezha.wiki/developer/api.html)
- [哪吒监控仓库](https://github.com/nezhahq/nezha)
