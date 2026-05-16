#!/bin/sh
set -e

NEZHA_HOST="${NEZHA_HOST:-host.docker.internal}"
NEZHA_PORT="${NEZHA_PORT:-8008}"

export NEZHA_HOST NEZHA_PORT
export NEZHA_HTTP_BASE="http://${NEZHA_HOST}:${NEZHA_PORT}"
export NEZHA_WS_URL="ws://${NEZHA_HOST}:${NEZHA_PORT}/api/v1/ws/server"
export LUMINA_HOME_API_HOST="127.0.0.1"
export LUMINA_HOME_API_PORT="18080"

sed -e "s|\${NEZHA_HOST}|${NEZHA_HOST}|g" \
    -e "s|\${NEZHA_PORT}|${NEZHA_PORT}|g" \
    /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

mkdir -p /var/log/nginx /run/nginx

exec "$@"
