# Lumina for Nezha

[![Docker Image](https://github.com/cytusc/Nezha-theme-Lumina/actions/workflows/docker.yml/badge.svg)](https://github.com/cytusc/Nezha-theme-Lumina/actions/workflows/docker.yml)

Lumina 是面向 [哪吒监控（Nezha）](https://github.com/nezhahq/nezha) 的前台主题，强调流畅动效与卡片化信息密度。

## 截图

| 白日模式 | 夜间模式 |
|:---:|:---:|
| ![Light](https://cdn.nodeimage.com/i/nL9GD3QcqtLla7kWrqaAXj8Xfg0f9pPA.webp) | ![Dark](https://cdn.nodeimage.com/i/pCDfjaqYE9gYxP0VJeAnX1zdFugqDiLD.webp) |

## 特性

- 实时数据：首页通过 WebSocket 直连哪吒数据流，零轮询
- 延迟监控：首页延迟概览映射哪吒服务监控数据
- 负载历史：详情页支持实时 / 1 天 / 7 天 / 30 天切换
- Ping 图表：详情页读取 service 历史接口
- 主题切换：深色/浅色自动跟随系统，支持手动切换
- 管理后台：一键跳转哪吒原生 Dashboard

## 一键部署

前提：服务器已安装 Docker，哪吒 Dashboard 正在运行。

```bash
curl -fsSL https://raw.githubusercontent.com/cytusc/Nezha-theme-Lumina/main/deploy.sh | bash
```

脚本自动完成：
1. 探测本机哪吒服务端口
2. 从 ghcr.io 拉取预构建镜像
3. 启动容器并输出访问地址

部署完成后直接通过 `http://服务器IP:3000` 访问。

## 配置

部署后配置文件位于 `/opt/nezha/lumina/.env`：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NEZHA_PORT` | `8008` | 哪吒 Dashboard 端口 |
| `LUMINA_PORT` | `3000` | Lumina 对外端口 |
| `LUMINA_DASHBOARD_USERNAME` | 空 | 哪吒管理员用户名（可选） |
| `LUMINA_DASHBOARD_PASSWORD` | 空 | 哪吒管理员密码（可选） |

修改后执行 `cd /opt/nezha/lumina && docker compose up -d` 生效。

## 反向代理（可选）

如需绑定域名，将流量转发到 Lumina 端口即可。

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

## 管理命令

```bash
cd /opt/nezha/lumina
docker compose up -d        # 启动
docker compose down         # 停止
docker compose pull && docker compose up -d  # 更新
docker compose logs -f      # 查看日志
```

## 开发

要求 Node.js 22+。

```bash
npm install
npm run dev
```

## 参考

- Fork 自 [stqfdyr/komari-theme-Lumina](https://github.com/stqfdyr/komari-theme-Lumina)
- [哪吒开发接口文档](https://nezha.wiki/developer/api.html)
- [哪吒监控仓库](https://github.com/nezhahq/nezha)
