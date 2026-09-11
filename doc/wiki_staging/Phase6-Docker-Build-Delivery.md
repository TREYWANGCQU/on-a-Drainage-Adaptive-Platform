> [!NOTE]
> **工程状态提示**：本文档由主仓库过程技术记录自动归档生成（原始文件名：`docs/stages/stage6-delivery/阶段6-Docker服务器版镜像构建与DockerHub发布方案.md`）。若需查验最新架构基准与使用手册，请查阅系统主文档。

<!-- 阶段6-Docker服务器版镜像构建与DockerHub发布方案.md -->

# 【阶段6-系统方案】：Docker 服务器版镜像构建与 Docker Hub 发布方案

> **系统分析与评审声明 (System Analyst & Reviewer Mandate)**：  
> 本方案严格依据 [[阶段6-服务器与桌面独立GUI双模式交付系统架构方案.md|Phase6-Dual-Mode-Delivery-Architecture]] 及实际物理开发环境约束编制。  
> 明确区分 **Windows 核心开发机（本地 IDE / 源码根基）**、**iMac 26 构建工作站（通过局域网 SSH 接入、具备高速无阻碍国际互联网络、运行 Docker Buildx 交叉编译引擎）**、**Docker Hub（中心化 OCI 制品托管库）** 及 **Linux 生产部署服务器（零代码、零编译依赖、轻量 Compose 编排）** 四层物理拓扑边界，输出确定性架构设计、边界契约矩阵、端到端数据流拓扑、WBS 分工及工业级验收指标。

---

## 一、 Objectives (目标体系)

### 1.1 核心建设目标
1. **异构工作站协同构建拓扑 (Windows Local + iMac Remote via SSH)**：
   - 本地主机（Windows 11 / 开发 IDE 主工作区）通过 SSH 隧道协议无缝调度局域网内的 iMac 26 工作站（`reaticle@192.168.120.11`）；
   - 消除开发者在多台物理机之间来回切换屏幕、拷贝文件的摩擦，支持在 Windows 终端一键下发远程编译与发布指令。
2. **充分发挥 iMac 26 国际网络与算力优势**：
   - 利用 iMac 26 直连公网的高速无污染网络通道，高速拉取 Docker Hub 官方底座镜像（`python:3.11-slim`, `node:20-alpine`, `nginx:1.25-alpine`）、Debian/Alpine 官方软件包及 NPM/PyPI 原生依赖；
   - 彻底规避国内网络环境下构建 Docker 容器时频繁出现的连接超时、镜像源损坏、GPG 签名验证失败及中途断联问题。
3. **Docker Buildx 多架构交叉编译 (Multi-Arch Cross-Compilation)**：
   - 解决 macOS Darwin（Apple Silicon ARM64）与目标生产服务器（主流 Linux x86_64 / amd64，兼顾云原生 aarch64）的指令集差异；
   - 强制启用 Docker Buildx 并关联 QEMU / Apple Rosetta 虚拟化引擎，编译并输出标准 OCI 多架构清单索引（Manifest List），杜绝生产端运行时 `exec format error`。
4. **编译期全依赖固化与零代码生产交付 (Self-Contained & Zero-Source)**：
   - 在构建镜像时，通过多阶段提取官方 `ghcr.io/typst/typst:latest` 自动适配目标架构的 Typst 编译二进制，并在 Linux 容器内固化 CJK 开源中文字体（Noto Sans CJK / 文泉驿微米黑），消除字符方块；
   - 镜像全量托管于 Docker Hub，生产目标服务器无需安装 Python、Node.js、Rust、Typst 或拉取 Git 源码，仅需 50KB 以内的生产编排物料即可秒级拉起服务。

### 1.2 系统量化指标
- **网络构建成功率**：在 iMac 26 执行多架构拉取与编译，网络依赖下载失败率 $0\%$。
- **交叉编译有效性**：产出镜像在 Linux x86_64（Intel/AMD）与 Linux ARM64（Graviton/Ampere）双平台均可正常启动且通过全链路健康检查。
- **镜像体积控制指标**：
  - 前端静态反代镜像（`tunnel-drainage-frontend`）：$\le 45\,\text{MB}$；
  - 后端计算与排版镜像（`tunnel-drainage-backend`）：$\le 650\,\text{MB}$（含 Python 数值计算依赖、CJK 字体与 Typst 编译器）。
- **远程发布与上线时延**：
  - Windows 端触发远程 SSH 构建并全量推送到 Docker Hub 全程时延 $\le 6\,\text{min}$（增量缓存构建 $\le 90\,\text{s}$）；
  - 目标服务器拉取镜像并完成双容器冷启动就绪时延 $\le 45\,\text{s}$。

---

## 二、 Constraints & Boundary Contract Matrix (约束条件与边界契约矩阵)

### 2.1 事实、判断与推测分离准则 (Fact, Judgment and Speculation)
- **事实 (Fact)**：
  - 本地主开发机运行 Windows 操作系统，代码仓库位于 `d:\offices\Github\隧道工程多维协同智能排水自适应平台`；
  - 局域网内存在一台运行 macOS 的开发机 iMac 26，具备优质国际网络环境，可通过 SSH 协议（`ssh reaticle@192.168.120.11`）正常接入并执行终端指令；
  - 平台生产部署现有文件集中在 `tunnel-drainage-platform/deploy/server/`，包含 `Dockerfile.frontend`、`Dockerfile.backend` 与 `docker-compose.yml`；
  - 现存 `Dockerfile.backend` 仅配置了中文字体，尚未集成 Linux 容器内部的 `typst` 可执行程序安装步骤。
  - iMac 26 上运行开源容器引擎 Colima (基于 Lima 轻量虚拟机)，作为 Docker Daemon 运行时后端与多架构构建载体。
- **判断 (Judgment)**：
  - Windows 主机不直接运行大型 Linux 容器的多架构交叉编译（避免 WSL2 资源竞争与网络受限），将编译负载彻底卸载到 iMac 26 是最高效且稳定的架构选型；
  - iMac 26 是 ARM64 架构宿主，如果直接使用默认 `docker build`，产物将为 ARM64 单架构镜像，推送到 Docker Hub 后被 x86_64 服务器拉取会立即引发崩溃。必须使用 `docker buildx build --platform linux/amd64,linux/arm64`；
  - Windows 到 iMac 26 的工程代码流转应支持双轨模式：优先利用 GitHub 远程仓库同步（利用 iMac 极速拉取），亦可支持基于 SSH/Rsync 的本地增量快照同步。
- **推测 (Speculation)**：
  - 开发者拥有 Docker Hub 个人或组织账号，并能生成专属 Personal Access Token (PAT) 供自动化登录。

### 2.2 跨平台运行时与边界契约矩阵 (Boundary Contract Matrix)

| 维度 / 契约要素 | 本地开发主控机 (Windows Host) | 远程构建工作站 (iMac 26 Build Node) | 制品中心 (Docker Hub Registry) | 目标生产服务器 (Target Linux Host) | 规范与强制标准 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **物理角色与系统** | Windows 11 x64 (主工程库) | macOS Darwin (Apple Silicon / Intel) | 托管云端 OCI 存储 | Linux x86_64 (Ubuntu / Rocky) | POSIX / Win32 / RFC 4251 (SSH) |
| **通信传输信道** | 本地局域网 SSH (Port 22) 直连 iMac | 国际公网 HTTPS (Port 443) 直连 Docker Hub | HTTPS (Port 443) 镜像层传输 | HTTPS (Port 443) 拉取镜像 | RFC 8446 (TLS 1.3) / SSHv2 |
| **构建驱动引擎** | 本地仅需 OpenSSH Client | Docker Desktop with Buildx 插件 | OCI Distribution API v2 | Docker Engine $\ge 24.0$ | OCI Image Specification v1.0.2 |
| **目标构建平台** | 无容器编译负载 | `--platform linux/amd64,linux/arm64` | Multi-Arch Manifest List 维护 | 匹配宿主原生架构层执行 | OCI Image Index Specification |
| **Typst 引擎装配** | Windows 本地开发使用 `typst.exe` | 从 `ghcr.io/typst/typst:latest` 提取多架构 ELF | 镜像内固化为 `/usr/local/bin/typst` | 容器内无感知调用，标准 I/O | Linux ELF Executable ABI |
| **鉴权模型** | SSH Key (公私钥对免密互信) | `docker login` (Docker Hub Token) | Token-Based Bearer Auth | `docker login` (可选私有仓) | OAuth 2.0 / Bearer Tokens |
| **生产配置交付** | 输出纯生产编排文件模板 | 无需向生产机直接发送镜像 | 负责高速分发 Layers | 本地仅保留 `docker-compose.prod.yml` | Docker Compose Spec |

---

## 三、 Architecture (系统架构与物理拓扑)

### 3.1 总体四层物理拓扑架构

```
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|                               【层级一：Windows 11 本地开发主控台】                                  |
|   - 路径: d:\offices\Github\隧道工程多维协同智能排水自适应平台                                       |
|   - 职责: 编写业务代码、Git 版本提交、通过 SSH 管道触发远程构建                                       |
|                                                                                                  |
|   [Windows PowerShell / Git Bash]                                                                |
|       │                                                                                          |
|       │  1. 提交并推送到 GitHub (git push origin main)                                             |
|       │  2. 执行远程发布脚本: ssh reaticle@192.168.120.11 "cd ~/build-tunnel && ./build.sh v1.0.0" |
|       ▼ (SSH 局域网互信隧道: 192.168.120.11:22)                                                  |
+───────┼──────────────────────────────────────────────────────────────────────────────────────────+
        │
        ▼
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|                               【层级二：iMac 26 远程构建工作站】                                     |
|   - 宿主系统: macOS Darwin (国际网络直连通道，无 GFW 限制)                                          |
|   - 构建引擎: Docker Buildx (基于 BuildKit 多平台交叉编译驱动)                                      |
|                                                                                                  |
|   [构建工作目录: ~/build-tunnel/tunnel-drainage-platform]                                        |
|   ├── Git 检出目标发布 Tag (或通过 SSH 接收 Windows 本地差异补丁)                                  |
|   ├── 自动化 Docker Hub 登录巡检 (PAT 鉴权)                                                       |
|   │                                                                                              |
|   ├── [前端多阶段流水线]                                  [后端多阶段流水线]                     |
|   │   Stage 1: node:20-alpine (npm ci & build)            Stage 1: ghcr.io/typst/typst (提取二进制)
|   │   Stage 2: 注入 nginx:1.25-alpine 静态目录            Stage 2: python:3.11-slim (装字体/依赖)|
|   │                                                                                              |
|   └── 并发执行交叉编译与多架构 Manifest 生成:                                                      |
|       docker buildx build --platform linux/amd64,linux/arm64                                     |
|                           -t <DOCKERHUB_USER>/tunnel-drainage-frontend:v1.0.0                    |
|                           -t <DOCKERHUB_USER>/tunnel-drainage-backend:v1.0.0                     |
|                           --push .                                                               |
+───────────────────────────────────────────────┬──────────────────────────────────────────────────+
                                                │
                                                │ (HTTPS Push / 极速上行链路)
                                                ▼
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|                               【层级三：Docker Hub 中心化镜像仓库】                                  |
|                                                                                                  |
|   Repository: <DOCKERHUB_USER>/tunnel-drainage-frontend                                          |
|   ├── Tags: :v1.0.0 (Manifest List: linux/amd64 + linux/arm64), :latest                          |
|                                                                                                  |
|   Repository: <DOCKERHUB_USER>/tunnel-drainage-backend                                           |
|   ├── Tags: :v1.0.0 (Manifest List: linux/amd64 + linux/arm64), :latest                          |
+───────────────────────────────────────────────┬──────────────────────────────────────────────────+
                                                │
                                                │ (HTTPS Pull / 生产极速直连下载)
                                                ▼
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|                               【层级四：Linux 生产目标服务器】                                       |
|   - 宿主: Linux x86_64 或 ARM64 云主机 / 现场工控服务器                                           |
|   - 特性: 零源码部署，无需 Python / Node.js 编译环境                                              |
|                                                                                                  |
|   [生产交付轻量目录: /opt/tunnel-drainage-server/]                                               |
|   ├── docker-compose.prod.yml (配置直接拉取 Docker Hub 镜像)                                     |
|   ├── .env.production (环境变量与端口映射)                                                        |
|   └── nginx/nginx.conf (可选，外部反代与证书配置)                                                 |
|                                                                                                  |
|   执行指令: docker compose -f docker-compose.prod.yml pull && docker compose up -d              |
+──────────────────────────────────────────────────────────────────────────────────────────────────+
```

### 3.2 模块解构与跨架构 Dockerfile 硬化方案

#### 3.2.1 后端 Dockerfile (`deploy/server/Dockerfile.backend`) 硬化规范
为消除在 iMac 上交叉编译时 Typst 缺失及平台不匹配问题，采用“多阶段官方镜像二进制提取”方案：

```dockerfile
# tunnel-drainage-platform/deploy/server/Dockerfile.backend
# 1. 第一阶段：从官方 Typst 多架构镜像提取对应平台的纯静态二进制
FROM ghcr.io/typst/typst:latest AS typst-provider

# 2. 第二阶段：主业务与数值计算环境
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    DB_PATH=/app/data/tunnel_params.db \
    LOG_DIR=/app/logs \
    TYPST_PATH=/usr/local/bin/typst

# 拷贝官方已编译匹配宿主指令集的 Typst 二进制
COPY --from=typst-provider /bin/typst /usr/local/bin/typst

# 安装中文字体库、curl 与基础运行时支撑
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    fonts-noto-cjk \
    fonts-wqy-zenhei \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 科学计算栈依赖
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 拷贝后端源码及模板资产
COPY backend/ /app/

# 建立持久化数据目录与日志挂载点
RUN mkdir -p /app/data /app/logs

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

#### 3.2.2 前端 Dockerfile (`deploy/server/Dockerfile.frontend`) 多阶段瘦身规范
在 iMac 良好网络环境下执行标准多阶段打包：

```dockerfile
# tunnel-drainage-platform/deploy/server/Dockerfile.frontend
# ---- Stage 1: 生产静态资产编译 ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Nginx 生产反向代理运行时 ----
FROM nginx:1.25-alpine

RUN rm -rf /usr/share/nginx/html/*

COPY --from=builder /app/dist /usr/share/nginx/html
COPY deploy/server/nginx/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
```

### 3.3 Docker Hub 制品空间与标签命名规约

- **镜像命名格式**：
  - 前端：`<DOCKERHUB_NAMESPACE>/tunnel-drainage-frontend:<TAG>`
  - 后端：`<DOCKERHUB_NAMESPACE>/tunnel-drainage-backend:<TAG>`
- **标签打标矩阵 (Tagging Matrix)**：
  1. `v1.0.0`：**正式 SemVer 版本标签**（基于多架构 Manifest List 封装，生产环境推荐锁定此标签）；
  2. `v1.0` / `v1`：**大版本浮动标签**（跟随次版本或补丁版本更新滚动）；
  3. `latest`：**最新稳定主干标签**（每次正式发布自动同步覆盖）；
  4. `sha-<commit_id>`：**代码指纹追踪标签**（用于审计与灰度追踪）。

### 3.4 生产目标服务器轻量部署编排 (`docker-compose.prod.yml`)

生产机不再包含 `build:` 逻辑，杜绝源码泄漏：

```yaml
# deploy/server/docker-compose.prod.yml
version: "3.8"

services:
  nginx:
    image: ${DOCKER_REGISTRY_NAMESPACE}/tunnel-drainage-frontend:${APP_VERSION:-v1.0.0}
    container_name: tunnel_nginx
    restart: always
    ports:
      - "${HTTP_PORT:-80}:80"
      - "${HTTPS_PORT:-443}:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - backend
    networks:
      - tunnel_net

  backend:
    image: ${DOCKER_REGISTRY_NAMESPACE}/tunnel-drainage-backend:${APP_VERSION:-v1.0.0}
    container_name: tunnel_backend
    restart: always
    environment:
      - APP_ENV=production
      - DB_PATH=/app/data/tunnel_params.db
      - LOG_DIR=/app/logs
      - LOG_LEVEL=${LOG_LEVEL:-info}
    volumes:
      - tunnel_data:/app/data
      - tunnel_logs:/app/logs
    networks:
      - tunnel_net

volumes:
  tunnel_data:
    driver: local
  tunnel_logs:
    driver: local

networks:
  tunnel_net:
    driver: bridge
```

---

## 四、 Data Flow Modeling (自动化流转与发布数据流)

```
[Windows 开发机] 
  │  1. git push origin main
  │  2. 执行本地调度脚本: ./deploy/scripts/trigger-imac-release.ps1 -Version "v1.0.0"
  ▼
[SSH 管道: ssh reaticle@192.168.120.11]
  │
  ▼
[iMac 26 构建节点]
  │  3. 激活工作空间 ~/workspace/tunnel-drainage-platform
  │  4. git fetch --tags && git checkout v1.0.0
  │  5. 检查 docker buildx 实例: tunnel-builder (driver: docker-container)
  │  6. 校验 Docker Hub 凭据 (docker login --username $DOCKER_USER --password-stdin)
  │
  ├─ 7. 并发构建多平台前端镜像:
  │     docker buildx build --platform linux/amd64,linux/arm64 \
  │       -f deploy/server/Dockerfile.frontend \
  │       -t $DOCKER_USER/tunnel-drainage-frontend:v1.0.0 \
  │       -t $DOCKER_USER/tunnel-drainage-frontend:latest \
  │       --push .
  │
  ├─ 8. 并发构建多平台后端镜像:
  │     docker buildx build --platform linux/amd64,linux/arm64 \
  │       -f deploy/server/Dockerfile.backend \
  │       -t $DOCKER_USER/tunnel-drainage-backend:v1.0.0 \
  │       -t $DOCKER_USER/tunnel-drainage-backend:latest \
  │       --push .
  │
  └─ 9. 将生产轻量包 (docker-compose.prod.yml + .env.example) 归集打包为:
        tunnel-server-deploy-pack-v1.0.0.tar.gz
        │
        ▼ (回传 SHA256 及成功信号)
[Windows 控制台打印发布完成摘要与制品指纹]
        │
        ▼
[生产部署人员登录 Linux 生产机]
  │ 10. 仅需获取轻量部署包 (解压后仅含 compose 与 env)
  │ 11. docker compose -f docker-compose.prod.yml pull
  │ 12. docker compose -f docker-compose.prod.yml up -d
  └─> 服务秒级就绪上线
```

---

## 五、 Work Breakdown Structure (工作分解结构 WBS)

```
阶段6：Docker 服务器版发布工程 (Windows + iMac SSH + Docker Hub)
├── WP1: 镜像构建定义与多架构硬化 (Dockerfile Hardening)
│   ├── Task 1.1: 重写 deploy/server/Dockerfile.backend (集成 ghcr.io/typst/typst 多阶段提取)
│   ├── Task 1.2: 固化 Linux CJK 字体并校验容器中文字体渲染缓存
│   ├── Task 1.3: 优化 deploy/server/Dockerfile.frontend (Nginx 生产多阶段与 gzip 压制)
│   └── Task 1.4: 完善根目录与部署目录 .dockerignore (排除 node_modules, .git, venv)
│
├── WP2: iMac 26 远程构建环境与 SSH 互信链路建设 (iMac Environment & SSH)
│   ├── Task 2.1: 配置 Windows 到 iMac 26 (`reaticle@192.168.120.11`) SSH Key 免密互信
│   ├── Task 2.2: 在 iMac 26 安装/配置 Docker Buildx 并创建多架构构建器 (tunnel-builder)
│   ├── Task 2.3: 配置 iMac 26 上的 Docker Hub CLI 登录凭据 (PAT 安全存储)
│   └── Task 2.4: 编写 iMac 端专用自动化构建推送脚本 (build-and-push-dockerhub.sh)
│
├── WP3: Windows 端一键远程触发流水线研发 (Windows Remote Orchestrator)
│   ├── Task 3.1: 编写 Windows PowerShell 控制调度脚本 (deploy-docker.ps1，支持配置同步与一键多架构构建推送)
│   ├── Task 3.2: 脚本集成前置检查 (本地 Git 状态、SSH 连通性测试与配置合法性校验)
│   ├── Task 3.3: 实现远端构建日志流式实时回显与异常中断捕获
│   └── Task 3.4: 自动拉取并记录 Docker Hub 镜像唯一摘要 (Image Digest / SHA256)
│
├── WP4: 生产端轻量部署套件与发布物料工程化 (Target Server Delivery Pack)
│   ├── Task 4.1: 编写生产专用 docker-compose.prod.yml (纯 Docker Hub 远程引用)
│   ├── Task 4.2: 编写生产环境变量配置基准 .env.production
│   ├── Task 4.3: 编写目标服务器一键启动与升级脚本 (deploy.sh / update.sh)
│   └── Task 4.4: 制定版本回退与镜像 Tag 锁定规程
│
└── WP5: 跨架构验证与端到端系统验收 (E2E Verification & QA Gate)
    ├── Task 5.1: 在真实 Linux x86_64 服务器拉取镜像验证架构有效性 (免除 exec format error)
    ├── Task 5.2: 验证计算引擎与 Typst 计算书导出在 Docker 容器内部的无乱码执行
    ├── Task 5.3: 镜像安全审计 (扫描凭据泄漏、镜像分层最小化验证)
    └── Task 5.4: 编写《Docker 服务器版发布与跨平台部署操作手册》
```

---

## 六、 Acceptance Criteria (验收指标矩阵)

| 序号 | 验证维度 | 检验项与测试场景 | 预期判定指标 (Pass / Fail) |
| :---: | :--- | :--- | :--- |
| **AC-1** | **SSH 远程调度连通性** | 在 Windows 终端执行 `.\tunnel-drainage-platform\deploy\scripts\deploy-docker.ps1 -Action All -Version "v1.0.0"`。 | **Pass**: 成功通过 SSH 唤醒 iMac 26，流式回显构建过程，无网络阻断，配置同步与发布一键完成。 |
| **AC-2** | **国际网络构建免干扰** | 监控 iMac 26 在构建阶段拉取 Python/Node/Typst 基础镜像及依赖的过程。 | **Pass**: 全程直连官方 Registry，无任何超时重试，构建耗时在量化指标范围内。 |
| **AC-3** | **多架构 Manifest 完整性** | 在 Docker Hub 网页端或使用 `docker buildx imagetools inspect <IMAGE>` 检查。 | **Pass**: 镜像标签包含 `linux/amd64` 与 `linux/arm64` 两个子平台条目，支持跨 CPU 指令集协商。 |
| **AC-4** | **目标机跨平台无损运行** | 在纯净 Linux x86_64 生产宿主机执行 `docker compose -f docker-compose.prod.yml up -d`。 | **Pass**: 容器成功启动，`docker logs` 无 `exec format error`，HTTP 80 端口与 API 8000 端口正常响应。 |
| **AC-5** | **Typst 容器内中文字体** | 在部署后的 Linux 容器环境中，调用计算书导出接口生成工程计算书 PDF。 | **Pass**: 成功输出 PDF，中文标题、工程水动力公式及参数表格排版严整，无任何乱码与方框。 |
| **AC-6** | **生产服务器零源码合规** | 检查生产服务器上的交付目录内容。 | **Pass**: 仅包含 `docker-compose.prod.yml`、`.env.production` 与证书配置文件，绝对无 Python/Vue 业务源代码。 |

---

## 七、 实操脚本规程与执行指南 (Operational Playbook)

### 7.1 Docker Hub 访问凭据 (PAT) 申请与鉴权配置指引
为保证 Windows/iMac 工作站与 Docker Hub 之间的高安全性交互，杜绝使用账号原始密码，必须使用 Docker Hub 提供的 Personal Access Token (PAT) 进行隔离认证。

#### 1. 申请 Docker Hub Personal Access Token 步骤
1. 打开浏览器登录 [Docker Hub 官网](https://hub.docker.com/)。
2. 点击右上角个人头像（Profile Avatar），在下拉菜单中选择 **Account Settings**（账户设置）。
3. 在左侧导航栏点击 **Security**（安全设置），找到 **Personal access tokens** 面板。
4. 点击 **New Access Token**（新建访问令牌）按钮：
   - **Access Token Description**（令牌描述）：填写具有明确标识的名称，例如 `imac26-build-worker` 或 `tunnel-platform-builder`；
   - **Access permissions**（访问权限）：选择 **Read, Write, Delete**（必须具备 `Write` 权限才能向仓库推送镜像；如需在发布时清理旧测试标签，则保留 `Delete`）；
   - **Expiration date**（有效期）：根据企业安全策略选择，建议设置为 `1 year` 或 `No expiration`（内部受控设备专用）。
5. 点击 **Generate** 生成令牌。
6. **重要**：立即复制生成的 Token 字符串（形式通常为 `dckr_pat_xxxx...`），该值在关闭弹窗后将无法再次查看。

#### 2. 在 iMac 26 构建机上安全登录 Docker Hub
通过 SSH 连接到 iMac 26，使用标准输入（stdin）传入 Token，避免将敏感凭据直接暴露在终端命令历史记录（`.zsh_history`）中：
```bash
# 在 iMac 26 终端中执行（或通过 SSH 发送）
# 将 <YOUR_PAT_TOKEN> 替换为刚复制的 Personal Access Token
export DOCKER_USER="<YOUR_DOCKERHUB_USERNAME>"
export DOCKER_PAT="<YOUR_PAT_TOKEN>"

echo "$DOCKER_PAT" | docker login -u "$DOCKER_USER" --password-stdin
```
登录成功后将显示 `Login Succeeded`，凭证将被安全加密保存在 iMac 本地的 `~/.docker/config.json` 中，后续单次或脚本构建均无需再次手动输入密码。

---

### 7.2 iMac 26 构建工作站初始化规程 (Colima 容器环境)
iMac 26 使用轻量级开源容器引擎 **Colima** (基于 Lima 虚拟机) 提供 Docker Daemon。
通过 Windows SSH 登录到 iMac 26 执行：
```bash
# 1. 验证 Colima 状态并以公共 DNS 重启/启动 (规避局域网路由器 DNS 污染)
colima status || colima start 


# 2. 验证 Colima 内部网络与域名解析
colima ssh -- nslookup registry-1.docker.io

# 3. 验证 Docker 客户端与 Buildx 插件可用性
docker --version
docker compose version
docker buildx version

# 4. 创建并激活支持跨平台多架构的 buildx 容器构建驱动器
# 注意：使用 docker-container 驱动器才支持同时输出 amd64 和 arm64 的多架构镜像并直接 push
docker buildx create --name tunnel-builder \
  --driver docker-container \
  --driver-opt network=host \
  --bootstrap --use

# 5. 检查构建器状态与支持的跨架构指令集列表 (包含 linux/amd64 与 linux/arm64)
docker buildx inspect tunnel-builder
```

---

### 7.3 Windows 本地发布与配置同步一键脚本 (`deploy-docker.ps1`)
为摆脱脆弱复杂的云端 CI/CD 自动发布逻辑，赋予开发者充分的掌控力，在 Windows 本地开发机创建通用的 PowerShell 控制脚本 `deploy-docker.ps1`。该脚本支持**一键同步构建配置**、**一键触发远程多架构构建并推送**以及**单次人工定向维护**。

#### 1. 脚本源码定义 (`tunnel-drainage-platform/deploy/scripts/deploy-docker.ps1`)
在 Windows 开发机创建并维护该脚本：
```powershell
# tunnel-drainage-platform/deploy/scripts/deploy-docker.ps1
# Windows 本地主控：Docker 服务器版配置同步与远程多架构一键发布脚本

[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [ValidateSet("SyncConfig", "BuildPush", "All", "Status")]
    [string]$Action = "All",

    [Parameter(Mandatory = $false)]
    [string]$Version = "v1.0.0",

    [Parameter(Mandatory = $false)]
    [string]$DockerUser = "reaticle",

    [Parameter(Mandatory = $false)]
    [string]$RemoteHost = "reaticle@192.168.120.11",

    [Parameter(Mandatory = $false)]
    [string]$RemoteDir = "~/projects/tunnel-drainage-platform"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [Docker Hub 发布控制台] 目标版本: $Version | 操作: $Action" -ForegroundColor Cyan
Write-Host " 本地工程路径: $ProjectRoot" -ForegroundColor Cyan
Write-Host " 远端构建节点: $RemoteHost ($RemoteDir)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. 检查 SSH 互信连接
function Check-SSHConnection {
    Write-Host "[1/4] 正在检测 SSH 远端工作站连通性..." -ForegroundColor Yellow
    ssh -o ConnectTimeout=5 $RemoteHost "echo '[OK] SSH 链路握手成功，构建节点就绪。'"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "无法通过 SSH 连接到 iMac 构建机 ($RemoteHost)，请检查局域网连接或公钥配置。"
    }
}

# 2. 一键同步 Docker 构建配置与最新脚本到远端
function Sync-DockerConfig {
    Write-Host "[2/4] 正在同步本地 Dockerfile、Nginx 与构建配置至远端..." -ForegroundColor Yellow
    # 确保远端目标目录存在
    ssh $RemoteHost "mkdir -p $RemoteDir/deploy/server/nginx $RemoteDir/deploy/scripts"
    
    # 同步 server 目录下的编排与 Dockerfile
    scp -r "$ProjectRoot\deploy\server\*" "$($RemoteHost):$RemoteDir/deploy/server/"
    # 同步构建运行脚本
    scp "$ProjectRoot\deploy\scripts\build-server.sh" "$($RemoteHost):$RemoteDir/deploy/scripts/"
    Write-Host "[OK] 构建配置同步完成！" -ForegroundColor Green
}

# 3. 触发远端执行 Buildx 多架构交叉编译并直推 Docker Hub
function Invoke-RemoteBuildPush {
    Write-Host "[3/4] 触发 iMac 执行 Docker Buildx 多架构编译并推送到 Docker Hub..." -ForegroundColor Yellow
    
    $RemoteBuildCommand = @"
bash -c '
set -euo pipefail
cd $RemoteDir
echo "=== 检查并激活 Buildx 构建器 ==="
docker buildx use tunnel-builder 2>/dev/null || docker buildx create --name tunnel-builder --driver docker-container --bootstrap --use

echo "=== [1/2] 构建并推送后端多架构镜像 ($DockerUser/tunnel-drainage-backend:$Version) ==="
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f deploy/server/Dockerfile.backend \
  -t $DockerUser/tunnel-drainage-backend:$Version \
  -t $DockerUser/tunnel-drainage-backend:latest \
  --push .

echo "=== [2/2] 构建并推送前端多架构镜像 ($DockerUser/tunnel-drainage-frontend:$Version) ==="
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f deploy/server/Dockerfile.frontend \
  -t $DockerUser/tunnel-drainage-frontend:$Version \
  -t $DockerUser/tunnel-drainage-frontend:latest \
  --push .

echo "=== 验证 Docker Hub Manifest 清单 ==="
docker buildx imagetools inspect $DockerUser/tunnel-drainage-backend:$Version
'
"@
    ssh $RemoteHost $RemoteBuildCommand
    if ($LASTEXITCODE -ne 0) {
        Write-Error "远端多架构编译或推送到 Docker Hub 失败，请检查 Docker Hub 登录凭证或网络状态。"
    }
    Write-Host "[OK] 镜像构建与多架构推送成功！" -ForegroundColor Green
}

# 4. 执行状态核查
function Show-Status {
    Write-Host "[4/4] 正在拉取 Docker Hub 远程 Manifest 状态..." -ForegroundColor Yellow
    ssh $RemoteHost "docker buildx imagetools inspect $DockerUser/tunnel-drainage-backend:$Version"
}

# 路由分发
Check-SSHConnection

switch ($Action) {
    "SyncConfig" {
        Sync-DockerConfig
    }
    "BuildPush" {
        Invoke-RemoteBuildPush
    }
    "All" {
        Sync-DockerConfig
        Invoke-RemoteBuildPush
        Show-Status
    }
    "Status" {
        Show-Status
    }
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " 操作顺利完成！镜像已发布至 Docker Hub: $DockerUser" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
```

#### 2. Windows 命令行调用示例
- **场景 A：日常只修改了 Dockerfile 或 Nginx 配置，仅需更新配置到构建机**：
  ```powershell
  .\tunnel-drainage-platform\deploy\scripts\deploy-docker.ps1 -Action SyncConfig
  ```
- **场景 B：发布正式版本镜像（全量同步并发布多架构镜像）**：
  ```powershell
  .\tunnel-drainage-platform\deploy\scripts\deploy-docker.ps1 -Action All -Version "v1.0.0" -DockerUser "<YOUR_DOCKERHUB_USERNAME>"
  ```
- **场景 C：仅触发远程重新编译推送（配置未变）**：
  ```powershell
  .\tunnel-drainage-platform\deploy\scripts\deploy-docker.ps1 -Action BuildPush -Version "v1.0.1"
  ```

---

### 7.4 单次人工独立构建与上传规程 (Manual Runbook)
当遇到突发单模块修补、网络离线调试或排查特定架构缺陷时，开发者可直接通过 SSH 在 iMac 26 终端手动执行单次构建与推送。

#### 1. 仅单独构建并上传后端镜像 (Backend Only)
```bash
# 登录 iMac 并进入项目目录
cd ~/projects/tunnel-drainage-platform

# 执行 Backend 多架构编译与推送
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f deploy/server/Dockerfile.backend \
  -t <YOUR_DOCKERHUB_USERNAME>/tunnel-drainage-backend:v1.0.0 \
  -t <YOUR_DOCKERHUB_USERNAME>/tunnel-drainage-backend:latest \
  --push .

# 检查 Manifest 确保 amd64/arm64 均被推送
docker buildx imagetools inspect <YOUR_DOCKERHUB_USERNAME>/tunnel-drainage-backend:v1.0.0
```

#### 2. 仅单独构建并上传前端镜像 (Frontend Only)
```bash
# 执行 Frontend 多架构编译与推送
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f deploy/server/Dockerfile.frontend \
  -t <YOUR_DOCKERHUB_USERNAME>/tunnel-drainage-frontend:v1.0.0 \
  -t <YOUR_DOCKERHUB_USERNAME>/tunnel-drainage-frontend:latest \
  --push .

# 检查 Manifest
docker buildx imagetools inspect <YOUR_DOCKERHUB_USERNAME>/tunnel-drainage-frontend:v1.0.0
```

---

### 7.5 Docker Hub 官方仓库说明文档维护指引 (Repository README)
为了让使用该镜像的现场工程人员、运维技术人员能够清晰了解镜像作用、版本更新履历及极简部署方案，必须在 Docker Hub 仓库主页维护标准化的说明文档。

#### 1. Docker Hub 网页端维护方法
1. 登录 [Docker Hub](https://hub.docker.com/)，在 **Repositories** 列表中点击对应的仓库（例如 `tunnel-drainage-backend` 或 `tunnel-drainage-frontend`）。
2. 点击页面上方的 **Repository Details** 或 **Description** 旁边的编辑图标（Edit）。
3. **Short Description**（简短描述，限100字符）：
   - 后端填入：`Tunnel Drainage Platform - High-Performance Computational & Typst Export Service (Multi-Arch)`
   - 前端填入：`Tunnel Drainage Platform - Web 3D Collaborative Dashboard Nginx Service (Multi-Arch)`
4. **Overview**（全量详细说明文档，支持标准 Markdown 语法）：
   - 将下方标准文档模板复制并粘贴到编辑区域中；
   - 点击 **Update** 保存。

#### 2. Docker Hub 官方仓库说明文档推荐模板 (Markdown)
以下为供复制维护至 Docker Hub Overview 的标准文案：

````markdown
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
````

---

### 7.6 生产服务器极简拉取与上线验证指令
在目标 Linux 生产服务器执行：
```bash
# 1. 创建部署目录并放置编排文件
mkdir -p /opt/tunnel-drainage-server
cd /opt/tunnel-drainage-server

# 2. 写入配置并一键拉取启动 (自动拉取匹配本宿主 CPU 架构的镜像)
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 3. 检查容器运行状态与健康日志
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail=50
```
