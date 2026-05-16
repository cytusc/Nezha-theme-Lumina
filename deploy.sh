#!/bin/bash
set -e

REPO_URL="https://github.com/cytusc/Nezha-theme-Lumina"
INSTALL_DIR="/opt/lumina"
ENV_FILE="$INSTALL_DIR/.env"
COMPOSE_FILE="$INSTALL_DIR/docker-compose.yml"
IMAGE_NAME="ghcr.io/cytusc/lumina-theme:latest"

echo "=== Lumina for Nezha · Docker 一键部署 ==="
echo ""

command -v docker >/dev/null 2>&1 || { echo "[!] 未检测到 Docker，请先安装: https://docs.docker.com/engine/install/"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "[!] 未检测到 Docker Compose V2，请升级 Docker"; exit 1; }

detect_nezha_port() {
    for port in 8008 8080 80; do
        if curl -sf --max-time 3 "http://127.0.0.1:$port/api/v1/setting" > /dev/null 2>&1; then
            echo "$port"
            return 0
        fi
    done
    return 1
}

mkdir -p "$INSTALL_DIR"

if [ -f "$ENV_FILE" ]; then
    echo "[*] 发现已有配置 $ENV_FILE，加载中..."
    set -a; source "$ENV_FILE"; set +a
else
    echo "[*] 正在探测本机哪吒服务端口..."
    DETECTED_PORT=$(detect_nezha_port) || true

    if [ -n "$DETECTED_PORT" ]; then
        echo "[+] 探测到哪吒服务运行在端口: $DETECTED_PORT"
        NEZHA_PORT="$DETECTED_PORT"
    else
        echo "[-] 未自动探测到哪吒服务"
        NEZHA_PORT="8008"
        if [ -t 0 ]; then
            read -p "    请输入哪吒 Dashboard 端口 [默认 8008]: " INPUT_PORT </dev/tty
            NEZHA_PORT="${INPUT_PORT:-8008}"
        fi
    fi

    NEZHA_HOST="host.docker.internal"
    LUMINA_PORT="3000"

    if [ -t 0 ]; then
        read -p "[?] Lumina 对外端口 [默认 3000]: " INPUT_PORT </dev/tty
        LUMINA_PORT="${INPUT_PORT:-3000}"
    fi

    cat > "$ENV_FILE" <<EOF
NEZHA_HOST=$NEZHA_HOST
NEZHA_PORT=$NEZHA_PORT
LUMINA_PORT=$LUMINA_PORT
LUMINA_DASHBOARD_USERNAME=
LUMINA_DASHBOARD_PASSWORD=
EOF
    chmod 600 "$ENV_FILE"
    echo "[+] 配置已保存到 $ENV_FILE"
fi

LUMINA_PORT="${LUMINA_PORT:-3000}"

cat > "$COMPOSE_FILE" <<EOF
services:
  lumina:
    image: $IMAGE_NAME
    container_name: lumina-theme
    restart: unless-stopped
    ports:
      - "0.0.0.0:${LUMINA_PORT}:80"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    env_file:
      - .env
EOF

echo ""
if docker image inspect "$IMAGE_NAME" > /dev/null 2>&1; then
    echo "[*] 本地已有镜像，跳过拉取"
else
    echo "[*] 拉取镜像..."
    if docker pull "$IMAGE_NAME" 2>/dev/null; then
        echo "[+] 镜像拉取成功"
    else
        echo "[*] 远程镜像不可用，从源码构建（首次约 2-3 分钟）..."
        TMPDIR=$(mktemp -d)
        curl -fsSL "$REPO_URL/archive/refs/heads/main.tar.gz" -o "$TMPDIR/source.tar.gz" || { echo "[!] 下载源码失败"; exit 1; }
        tar -xzf "$TMPDIR/source.tar.gz" -C "$TMPDIR" --strip-components=1
        docker build -t "$IMAGE_NAME" "$TMPDIR"
        rm -rf "$TMPDIR"
        echo "[+] 镜像构建完成"
    fi
fi

echo "[*] 启动容器..."
cd "$INSTALL_DIR"
docker compose up -d

echo ""
echo "=== 部署完成 ==="
echo ""
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'YOUR_IP')
echo "  Lumina 前端:    http://${SERVER_IP}:${LUMINA_PORT}"
echo "  哪吒管理后台:  http://${SERVER_IP}:${LUMINA_PORT}/dashboard/"
echo ""
echo "  如有域名，反向代理指向 127.0.0.1:${LUMINA_PORT} 即可"
echo ""
echo "  管理命令:"
echo "    cd $INSTALL_DIR && docker compose logs -f    # 查看日志"
echo "    cd $INSTALL_DIR && docker compose restart    # 重启"
echo "    cd $INSTALL_DIR && docker compose down       # 停止"
echo ""
