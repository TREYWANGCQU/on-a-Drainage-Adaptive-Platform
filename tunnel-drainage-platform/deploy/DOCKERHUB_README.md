# 隧道工程多维协同智能排水自适应平台 (Tunnel Drainage Platform)

> 工业级多维协同智能排水自适应设计、水动力参数多段拓扑计算与 Typst 高保真工程计算书导出平台服务器版容器镜像。

## 架构支持 (Supported Architectures)
- `linux/amd64` (标准 Linux x86_64 云服务器 / 物理服务器)
- `linux/arm64` (Apple Silicon / AWS Graviton / 华为鲲鹏 ARM64 服务器)

## 快速启动 (Quick Start with Docker Compose)

创建 `docker-compose.yml` 文件：

```yaml
version: '3.8'

services:
  frontend:
    image: reaticle/tunnel-drainage-frontend:latest
    container_name: tunnel-frontend
    restart: always
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - tunnel-net

  backend:
    image: reaticle/tunnel-drainage-backend:latest
    container_name: tunnel-backend
    restart: always
    environment:
      - PYTHONUNBUFFERED=1
      - APP_ENV=production
      - SERVER_PORT=8000
      - CORS_ORIGINS=*
    ports:
      - "8000:8000"
    volumes:
      - tunnel-data:/app/data
      - tunnel-logs:/app/logs
    networks:
      - tunnel-net

networks:
  tunnel-net:
    driver: bridge

volumes:
  tunnel-data:
  tunnel-logs:
```

一键启动服务：
```bash
docker compose up -d
```
启动后访问 `http://<服务器IP>` 即可进入 3D 可视化交互与计算控制面板。

## 环境变量配置说明 (Environment Variables)

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `APP_ENV` | `production` | 运行环境模式 (`production` / `development`) |
| `SERVER_PORT` | `8000` | 后端 FastAPI 监听端口 |
| `CORS_ORIGINS` | `*` | 跨域允许来源列表，逗号分隔 |
| `TYPST_FONT_DIR` | `/usr/share/fonts` | Typst 计算书渲染字体挂载目录 |

## 维护与支持
如遇工程计算书排版、网络拓扑解算或 3D 渲染问题，请查阅官方 GitHub 知识库与 Issue 跟踪面板。
