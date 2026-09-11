<!-- 系统双模式部署与使用说明书.md -->

# 隧道工程多维协同智能排水自适应平台：系统双模式部署与使用说明书

> **文档标识**：OPS-MANUAL-PHASE6  
> **适用版本**：v1.0.0+  
> **编制依据**：[[阶段6-服务器与桌面独立GUI双模式交付系统架构方案.md|Phase6-Dual-Mode-Delivery-Architecture]]  
> **适用受众**：工程现场技术人员、设计院协同设计工程师、DevOps 运维工程师、系统集成实施团队  

---

## 一、 系统架构与交付模式概述

“隧道工程多维协同智能排水自适应平台”基于“**一套核心，双轨交付 (Unified Core, Dual Deployment)**”设计原则，实现水动力-结构力学耦合解算内核、3D WebGL 数字孪生渲染器、A3 数字化施工蓝图引擎与 Typst 纯矢量科技排版计算书编译器的 100% 同构复用。平台向用户交付两种物理形态：

| 交付形态 | 目标场景 | 架构特征 | 环境依赖 | 交付物规格 |
| :--- | :--- | :--- | :--- | :--- |
| **桌面独立 GUI 模式**<br>*(Standalone Desktop)* | 施工现场、野外勘测、弱网/完全断网环境、涉密单机作业 | Tauri 2.0 原生宿主 + 本地伴生 FastAPI Sidecar 引擎 + 本地内嵌 Typst 编译器 | 零环境依赖，用户无需安装 Python、Node.js、Rust 或数据库 | Windows 安装向导 (`.exe`)、MSI 安装包 (`.msi`)、绿色便携包 (`.zip`) |
| **服务器协作模式**<br>*(Server / Web)* | 工程指挥部、设计院局域网协同、跨地域多终端远程接入 | 现代 B-S 拓扑：Vue 3.5 SPA + Nginx 动静分离 + FastAPI 多 Worker 集群 + 共享存储 | 服务器宿主支持 Docker 24.0+，客户端仅需现代 Web 浏览器 | Docker Compose 编排套件、标准化镜像归档 (`.tar.gz`) |

---

## 二、 模式一：桌面独立 GUI 模式使用指南

### 2.1 运行环境要求
* **操作系统**：Windows 10 x64 (版本 1809 以上) 或 Windows 11 x64。
* **硬件配置**：
  * CPU：Intel Core i3 / AMD Ryzen 3 以上架构；
  * 内存：$\ge 4\,\text{GB}$（应用空闲内存占用 $\le 180\,\text{MB}$）；
  * 磁盘空间：$\ge 500\,\text{MB}$ 剩余空间；
  * 显卡：支持 DirectX 11 / OpenGL 3.3（支持 WebGL 2.0 硬件加速）。
* **组件依赖**：
  * **Microsoft Edge WebView2 运行时**：Windows 11 及更新后的 Windows 10 系统已默认内置。如离线老旧操作系统缺失，安装向导将自动引导补丁安装。
  * **外部开发环境**：**完全无需**预装 Python、Node.js 或 VS Code 等开发工具。

### 2.2 安装与便携运行方式

#### 方式 A：安装向导版 (`.exe` - 推荐现场技术人员使用)
1. 从发布目录 `release/desktop/` 获取 `TunnelDrainagePlatform-v1.0.0-x64-Setup.exe`；
2. 双击安装程序，依据向导选择安装路径（默认推荐 `C:\Program Files\TunnelDrainagePlatform`）；
3. 安装完成后勾选“运行 隧道工程多维协同智能排水自适应平台”并点击“完成”；
4. 系统将在桌面与开始菜单自动生成快捷方式。

#### 方式 B：企业批量分发版 (`.msi` - 适用于统一运维静默分发)
适用于局域网域控或组策略统一静默下发：
```powershell
# 以管理员权限执行静默安装
msiexec /i TunnelDrainagePlatform-v1.0.0-x64.msi /quiet /norestart
```

#### 方式 C：绿色免安装便携版 (`.zip` - 适用于 U 盘现场即插即用)
1. 解压 `TunnelDrainagePlatform-v1.0.0-x64-Portable.zip` 至任意具有写入权限的本地盘符（如 `D:\Tools\TunnelPlatform\`）；
2. 双击解压目录内的 `TunnelDrainagePlatform.exe` 即可直接启动。

### 2.3 桌面模式运行时机制与数据安全

#### 1. 动态端口与握手安全协议
桌面端启动时，Tauri 2.0 宿主进程会在 `18000~18999` 临时端口范围内执行空闲探测，自动抢占绑定未被占用的端口（例如 `18234`），并生成随机鉴权凭据拉起本地 Sidecar 子进程，彻底免疫传统写死 `8000` 端口被第三方软件占用导致的启动溃败。

#### 2. 用户数据与存储拓扑隔离
桌面应用严禁向只读安装程序目录写文件，用户数据统一受控落地于宿主操作系统专属应用数据目录：
* **核心参数数据库**：`%APPDATA%\TunnelDrainagePlatform\tunnel_params.db`（首次启动自动创建，重装软件不丢失历史数据）；
* **运行与调试日志**：`%APPDATA%\TunnelDrainagePlatform\logs\backend.log`（单文件 10MB 自动轮转，防止磁盘写满）。

#### 3. 进程生命周期与防僵尸安全机制
* 宿主采用 Windows `Win32 Job Object` 将子进程句柄强行绑定（`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`）；
* 当用户点击主窗口右上角红叉、或通过系统任务管理器终止主进程时，伴生 Python 引擎及 Typst 编译子进程由 Windows 内核保证在 1 秒内同步销毁，不残留任何后台孤儿进程。

### 2.4 离线计算与成果导出操作
1. **参数设定与校核**：在左侧参数配置面板输入“水文气象”、“几何尺寸”、“围岩参数”及“防排水管网参数”；
2. **多工况水动力-力学解算**：点击“执行全工况多维解算”，系统将在本地 Sidecar 内毫秒级完成 SCS-CN 水文分支、24单元偏心受压及自适应临界厚度搜索，并在右侧 3D 视口呈现衬砌变形应力云图与三心圆装配剖面；
3. **施工蓝图导出**：进入“施工设计蓝图”模块，点击“导出 A3 数字化蓝图 (PDF/DWG)”，调出系统原生文件对话框，选择任意本地盘符落盘保存；
4. **Typst 科技计算书直出**：点击“导出工程计算书 (PDF)”，本地内置的 Typst 引擎以矢量级高保真渲染，即刻输出规范的工程计算书。

---

## 三、 模式二：服务器模式 (Server / Web) 部署与运维指南

### 3.1 基础设施与运行依赖
* **宿主操作系统**：Linux x86_64（Ubuntu 22.04 LTS、Rocky Linux 9、Debian 12 等）；
* **基础运行时**：
  * Docker Engine $\ge 24.0$；
  * Docker Compose $\ge v2.20$；
* **开放网络端口**：
  * HTTP 端口：`80`（支持通过 Nginx 自动重定向至 443）；
  * HTTPS 端口：`443`（需挂载有效 SSL 证书）；
  * 后端接口：仅绑定于 Docker 内部网桥，严禁直接向公网暴露 `8000` 原始端口。

### 3.2 部署目录拓扑与文件配置

标准化部署源码与编排配置统一归纳于 `tunnel-drainage-platform/deploy/server/`：

```
tunnel-drainage-platform/deploy/server/
├── docker-compose.yml          # 多容器标准服务编排
├── Dockerfile.backend          # 后端 FastAPI + Typst 环境镜像构建描述
├── Dockerfile.frontend         # 前端 Vue 3.5 + Vite 构建与 Nginx 镜像描述
├── nginx/
│   └── nginx.conf              # 动静分离、大包缓冲与长时导出反向代理配置
└── .env.example                # 生产环境系统级变量配置模板
```

#### 1. 核心编排文件 (`docker-compose.yml`) 规范
```yaml
# tunnel-drainage-platform/deploy/server/docker-compose.yml
version: "3.8"

services:
  nginx:
    build:
      context: ../../
      dockerfile: deploy/server/Dockerfile.frontend
    container_name: tunnel_nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - backend
    networks:
      - tunnel_net

  backend:
    build:
      context: ../../
      dockerfile: deploy/server/Dockerfile.backend
    container_name: tunnel_backend
    restart: always
    environment:
      - APP_ENV=production
      - DB_PATH=/app/data/tunnel_params.db
      - LOG_LEVEL=info
      - TYPST_PATH=/usr/local/bin/typst
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

#### 2. Nginx 反向代理配置 (`nginx/nginx.conf`) 关键参数
```nginx
# tunnel-drainage-platform/deploy/server/nginx/nginx.conf
user  nginx;
worker_processes  auto;

events {
    worker_connections  1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    sendfile        on;
    keepalive_timeout  65;

    # 启用 Gzip 压缩，优化 3D 静态网格与模型资源加载
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    upstream backend_cluster {
        server backend:8000;
        keepalive 32;
    }

    server {
        listen       80;
        server_name  _;

        # 静态前端 SPA 路由
        location / {
            root   /usr/share/nginx/html;
            index  index.html index.htm;
            try_files $uri $uri/ /index.html;
        }

        # 后端 API 反向代理与长时计算防断开配置
        location /api/ {
            proxy_pass http://backend_cluster;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

            # 批量工程计算书及长里程大表单导出的防超时设置
            proxy_read_timeout 300s;
            proxy_connect_timeout 60s;
            client_max_body_size 50M;
        }
    }
}
```

### 3.3 一键启动与更新命令
```bash
# 1. 进入服务器部署目录
cd tunnel-drainage-platform/deploy/server

# 2. 复制并编辑生产环境变量
cp .env.example .env.production

# 3. 构建容器镜像并启动服务
docker compose up -d --build

# 4. 检查容器集群健康状态
docker compose ps

# 5. 查看后端计算引擎与 Nginx 访问日志
docker compose logs -f backend
docker compose logs -f nginx
```

---

## 四、 标准构建与发布流水线指南 (Build Pipeline Guide)

> **研发与运维须知**：为确保版本库健康，严禁将未打包的原始安装文件或 Docker 镜像直接签入 Git。构建产物统一流转至 `tunnel-drainage-platform/release/` 目录。

### 4.1 目录组织与物料流转契约
```
[源码层 (Git)]                        [构建中间层 (Git 忽略)]                [发布交付层 (Git 忽略)]
backend/ ────────(PyInstaller)───────> backend/dist/*.exe ──────┐
                                                                 ▼
frontend/ ───────(Vite build)────────> frontend/dist/ ─────────> frontend/src-tauri/binaries/
                                                                 │
                                                       (cargo tauri build)
                                                                 │
                                                                 ▼
                                                  release/desktop/TunnelDrainagePlatform-Setup.exe
```

### 4.2 桌面端构建步骤 (Build Desktop)
在具有 Rust、Node.js 及 Python 环境的 Windows 构建工作站上执行：
```powershell
# 1. 构建独立后端二进制 Sidecar
cd tunnel-drainage-platform/backend
pyinstaller packaging/sidecar.spec --distpath dist --workpath build -y

# 2. 拷贝二进制物料至 Tauri External Binaries 目录
Copy-Item dist\tunnel-backend-sidecar.exe ..\frontend\src-tauri\binaries\

# 3. 构建 Tauri 最终可执行安装包
cd ..\frontend
npm run build
npm run tauri build

# 4. 将输出物料归集至标准化发布目录并计算安全哈希
Move-Item src-tauri\target\release\bundle\nsis\*.exe ..\release\desktop\
Get-FileHash ..\release\desktop\*.exe -Algorithm SHA256 > ..\release\desktop\SHA256SUMS.txt
```

### 4.3 服务器模式离线交付包导出 (Build Server Offline Package)
在具有 Docker 环境的 Linux 构建机上执行：
```bash
# 1. 进入构建目录构建镜像
cd tunnel-drainage-platform/deploy/server
docker compose build

# 2. 导出离线镜像压缩包
docker save tunnel_drainage_backend tunnel_drainage_nginx | gzip > ../../release/server/tunnel-drainage-server-v1.0.0-docker.tar.gz

# 3. 归集编排脚本与校验文件
cp docker-compose.yml ../../release/server/
cp .env.example ../../release/server/.env.production
sha256sum ../../release/server/* > ../../release/server/SHA256SUMS.txt
```

---

## 五、 版本控制与安全防线规程 (Git Defense Gate)

为防范高容量构建物料意外穿透造成代码库永久性体积膨胀，项目根目录及各子工程已强制落地 `.gitignore` 过滤准则：

```gitignore
# 编译输出与中间缓存
**/dist/
**/build/
**/target/
**/.pytest_cache/

# 桌面 Sidecar 外部二进制桥接目录（仅保留追踪标记 .gitkeep）
**/src-tauri/binaries/*
!**/src-tauri/binaries/.gitkeep
*.spec

# 发布交付根目录与巨型安装物料
release/
**/release/
dist-desktop/
dist-docker/
*.exe
*.msi
*.tar.gz
*.zip
```

---

## 六、 常见问题与应急排查 (Troubleshooting)

| 故障现象 | 潜在根因 | 应急处置方案 |
| :--- | :--- | :--- |
| **桌面端启动无响应或报错找不到 WebView2** | 宿主系统为老旧 Windows 10 LTSC / 离线定制版精简系统，缺失核心组件 | 从微软官网或随分发包提供的 `MicrosoftEdgeWebview2Setup.exe` 下载 Evergreen 引导安装器，双击完成补丁安装。 |
| **桌面端报错“后端计算引擎连接失败”** | 某些高安全等级杀毒软件拦截了本地回环子进程的拉起 | 1. 检查安全软件隔离区，将 `tunnel-backend-sidecar.exe` 加入信任白名单；<br>2. 打开 `%APPDATA%\TunnelDrainagePlatform\logs\backend.log` 查验报错栈。 |
| **桌面端关闭后，任务管理器中仍可见 Python 进程** | 非正常强退或系统休眠导致 Job Object 钩子脱落 | 再次启动桌面程序，内置的“单实例互斥与孤儿清理机制”将自动排查历史遗留僵尸 PID 并执行强制回收。 |
| **服务器端大标段 Excel 批量导入报 HTTP 413 / 504** | Nginx 默认请求体限制或超时阈值偏低 | 检查 `deploy/server/nginx/nginx.conf` 中 `client_max_body_size 50M;` 与 `proxy_read_timeout 300s;` 是否生效，并执行 `docker compose exec nginx nginx -s reload`。 |
| **服务器端 Typst 计算书导出中文乱码或方框** | Linux Docker 基础镜像缺失中文字体 (思源黑体/宋体) | 确保 `Dockerfile.backend` 中包含 `apt-get install -y fonts-noto-cjk fonts-wqy-zenhei` 字体安装指令。 |
