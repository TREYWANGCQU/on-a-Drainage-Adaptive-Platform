#!/usr/bin/env bash
# tunnel-drainage-platform/deploy/server/update.sh
# 生产服务器一键平滑升级脚本

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

TARGET_VERSION="${1:-latest}"

echo "=========================================================="
echo " [Tunnel Drainage Platform] 开始平滑升级服务至: ${TARGET_VERSION}"
echo "=========================================================="

export APP_VERSION="${TARGET_VERSION}"

echo "-> 拉取目标版本镜像..."
docker compose -f docker-compose.prod.yml pull

echo "-> 滚动重建并更新容器..."
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "-> 验证服务健康状态..."
docker compose -f docker-compose.prod.yml ps

echo "=========================================================="
echo " [OK] 服务升级至 ${TARGET_VERSION} 完成！"
echo "=========================================================="
