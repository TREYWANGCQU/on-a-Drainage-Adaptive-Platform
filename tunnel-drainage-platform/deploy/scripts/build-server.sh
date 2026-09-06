#!/usr/bin/env bash
# tunnel-drainage-platform/deploy/scripts/build-server.sh
# 服务器模式一键构建与离线镜像交付打包脚本

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy/server"
RELEASE_DIR="${ROOT_DIR}/release/server"

echo "=========================================================="
echo " [Server Mode] 启动服务器协作模式 Docker 镜像编译与发布流水线"
echo " 工作根目录: ${ROOT_DIR}"
echo "=========================================================="

mkdir -p "${RELEASE_DIR}"

cd "${DEPLOY_DIR}"

echo "[Step 1/4] 构建 Docker 镜像 (Frontend Nginx & Backend Worker)..."
docker compose build

echo "[Step 2/4] 导出离线镜像归档压缩包..."
ARCHIVE_NAME="tunnel-drainage-server-v1.0.0-docker.tar.gz"
docker save tunnel-drainage-backend:v1.0.0 tunnel-drainage-frontend:v1.0.0 | gzip > "${RELEASE_DIR}/${ARCHIVE_NAME}"

echo "[Step 3/4] 拷贝生产启动编排与配置资产..."
cp "${DEPLOY_DIR}/docker-compose.yml" "${RELEASE_DIR}/"
cp "${DEPLOY_DIR}/.env.example" "${RELEASE_DIR}/.env.production"
mkdir -p "${RELEASE_DIR}/nginx"
cp "${DEPLOY_DIR}/nginx/nginx.conf" "${RELEASE_DIR}/nginx/"

echo "[Step 4/4] 生成 SHA-256 安全校验清单..."
cd "${RELEASE_DIR}"
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum * > SHA256SUMS.txt
elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 * > SHA256SUMS.txt
fi

echo "=========================================================="
echo " [Server Mode] 服务器模式交付物料已成功发布至:"
echo " -> ${RELEASE_DIR}"
echo "=========================================================="
