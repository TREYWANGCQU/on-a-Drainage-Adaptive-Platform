#!/usr/bin/env bash
# tunnel-drainage-platform/deploy/server/deploy.sh
# 生产服务器一键初始化与拉取启动脚本

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "=========================================================="
echo " [Tunnel Drainage Platform] 启动生产服务部署 (Docker Compose)"
echo "=========================================================="

if [ -f .env.production ] && [ ! -f .env ]; then
    echo "-> 载入生产环境变量模板 (.env.production -> .env)"
    cp .env.production .env
fi

echo "-> 拉取最新发布的多架构镜像..."
docker compose -f docker-compose.prod.yml pull

echo "-> 启动后台容器服务集群..."
docker compose -f docker-compose.prod.yml up -d

echo "-> 检查容器运行状态..."
docker compose -f docker-compose.prod.yml ps

echo "=========================================================="
echo " [OK] 生产服务已成功启动！"
echo " 访问 http://<宿主IP>:80 即可进入平台交互面板。"
echo "=========================================================="
