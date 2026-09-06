<!-- 阶段6-服务器与桌面独立GUI双模式交付系统架构方案.md -->

# 【阶段6-系统方案】：服务器与桌面独立GUI双模式交付系统架构方案

> **系统分析师声明 (System Analyst Mandate)**：  
> 本方案严格遵循系统分析与需求解构规范，针对“隧道工程多维协同智能排水自适应平台”阶段六的收敛交付目标，制定两套并行的物理交付与运行时拓扑：**服务器模式 (Server Mode / Web B-S 架构)** 与 **桌面独立 GUI 模式 (Desktop Standalone GUI Mode / 本地单机 C-S 闭环架构)**。本方案明确业务领域核心与宿主容器物理边界的隔离准则，输出确定性的架构拓扑、边界契约矩阵、数据流拓扑、WBS 分工及工业级验收指标。

---

## 一、 Objectives (目标体系)

### 1.1 核心建设目标
1. **一套核心，双轨交付 (Unified Core, Dual Deployment)**：
   - 保持水动力-结构力学耦合计算内核 (`backend/app/services/`)、3D 数字孪生渲染器 (`frontend/src/components/three/`)、Typst 纯矢量科技排版编译器 (`calculation_book.typ`) 及 A3 数字化施工蓝图直出引擎 (`blueprintGenerator.ts`) **100% 同构复用**，严禁因宿主环境分歧产生业务逻辑分叉。
2. **服务器模式 (Server / Web 模式 - 协作协同态)**：
   - 面向工程指挥部、设计院协同设计及远程多终端访问场景。
   - 采用标准 B-S 拓扑，支持 Nginx 反向代理、容器化隔离部署、多用户并发计算隔离、共享参数模板库管理及基于浏览器的免安装即时计算。
3. **桌面独立 GUI 模式 (Desktop Standalone GUI 模式 - 单机离线态)**：
   - 面向隧道施工前线、野外勘测无网络/弱网环境及保密机房单机作业场景。
   - 采用 Tauri 2.0 原生跨平台轻量容器，封装前后端完整运行时，实现 **零外部 Python 环境依赖**、**零数据库安装**、**完全断网离线可用** 的自包含可执行包 (`.exe` / `.msi`)。

### 1.2 系统量化指标
- **桌面模式自包含性**：分发包内嵌独立后端引擎与编译器，双击即启动，用户主机无需预装 Python、Node.js 或 Rust。
- **桌面进程生命周期安全性**：主窗口关闭或意外终止时，子进程 (Sidecar Backend) 100% 自动安全回收，严禁残留僵尸/孤儿进程占用系统资源与网络端口。
- **端口冲突免疫机制**：桌面模式采用动态端口探测与安全随机分配协议，彻底免疫传统固定 8000 端口被占用的启动溃败。
- **冷启动与资源占用**：
  - 桌面独立端内存空闲占用 $\le 180\,\text{MB}$（相比传统 Electron 降低 70% 以上）；
  - 桌面冷启动渲染呈现 $\le 2.5\,\text{s}$，本地后端服务就绪 $\le 1.8\,\text{s}$。
- **并发与响应时延**：
  - 服务器模式单核 Worker 支持 $\ge 50\,\text{QPS}$ 瞬时计算请求，单工况水动力-结构力学全环耦合求解时延 $\le 450\,\text{ms}$。

---

## 二、 Constraints & Boundary Contract Matrix (约束条件与边界契约矩阵)

### 2.1 事实、判断与推测分离准则 (Fact, Judgment and Speculation)
- **事实 (Fact)**：
  - 代码库当前后端采用 FastAPI + Uvicorn (`port=8000`)，数据库采用本地 SQLite (`aiosqlite`)，Typst 依赖系统 PATH 中的可执行程序。
  - 前端基于 Vue 3.5 + Vite 6 构建，Axios 请求通过 `import.meta.env.VITE_API_BASE_URL` 静态绑定至 `http://localhost:8000/api/v1`。
  - 桌面端已初始化 Tauri 2.0 (`frontend/src-tauri`) 骨架，但当前缺少自动拉起与守护 Python 后端的 Sidecar 管道。
- **判断 (Judgment)**：
  - 直接要求工程现场施工人员自行配置 Python 虚拟环境与 Uvicorn 命令行属于严重的可用性缺陷；必须在桌面模式将 Python 后端及其依赖完整固化为自包含二进制进程或内置嵌入式运行时。
  - 服务器模式需要对外提供统一域名/反向代理路由，不能依赖前端硬编码的 `localhost:8000`。
- **推测 (Speculation)**：
  - 施工现场 Windows 操作系统可能覆盖 Windows 10 (1809+) 及 Windows 11，且部分内网涉密终端可能未预装或禁用了 Microsoft Edge WebView2 Evergreen 运行时，打包策略需包含固定版本 (Fixed Version) 引导机制。

### 2.2 跨平台运行时与边界契约矩阵 (Boundary Contract Matrix)

| 维度 / 契约要素 | 服务器模式 (Server Mode / Web) | 桌面独立 GUI 模式 (Desktop Standalone GUI) | 强制标准 / RFC 依据 |
| :--- | :--- | :--- | :--- |
| **宿主操作系统** | Linux (Ubuntu 22.04 LTS / Rocky Linux 9) 或 Windows Server | Windows 10/11 x64 (现场 PC / 工控笔记本) | POSIX / Win32 API 规范 |
| **前端运行宿主** | 现代标准 Web 浏览器 (Chrome 100+, Edge, Firefox, Safari) | Tauri 2.0 Webview 容器 (Windows WebView2) | W3C HTML5 / ECMAScript 2022 |
| **后端运行时物理态** | 常驻系统服务 (Systemd / Docker 容器 / Gunicorn 多进程) | 本地伴生独立子进程 (Tauri Sidecar Process) | OS 进程模型与 IPC 通信 |
| **通信传输信道** | 外部网络 TCP/IP 协议栈，经 Nginx 反向代理与 SSL 卸载 | 本地回环网络 (Local Loopback `127.0.0.1:DynamicPort`) | RFC 7230 (HTTP/1.1), RFC 6455 (WS) |
| **端口分配协议** | 静态端口映射（对外 80/443，后端内网集群 8000+） | 动态探测空闲端口（范围 `18000~18999`），启动前抢占绑定 | IANA 临时端口分配标准 |
| **跨域与安全策略** | 标准 CORS 白名单 (`Access-Control-Allow-Origin`) | 禁用外部跨域，仅放行 `tauri://localhost` 与动态回环接口 | W3C CORS 规范 / Tauri Security CSP |
| **持久化存储边界** | 集中式数据库或挂载网络存储卷 (`/data/tunnel_params.db`) | 用户宿主系统应用数据目录 (`%APPDATA%/TunnelPlatform/`) | XDG Base Directory / Windows SHGetKnownFolderPath |
| **Typst 编译引擎集成**| 容器内 Linux x86_64 原生 Typst 二进制 (`/usr/local/bin/typst`)| 分发包内嵌 Windows `typst.exe`，由后端或 Tauri 管道相对路径解析 | CLI 进程标准输入输出与退出码契约 |
| **进程销毁生命周期** | 服务管理器 (Systemd / K8s Pod Lifecycle) 优雅启停 | Tauri `RunEvent::Exit` / `CloseRequested` 信号强制杀树 (Kill Tree) | Win32 `TerminateProcess` / Job Object |

---

## 三、 Architecture (系统架构解构)

### 3.1 总体双模式物理拓扑架构

```
+--------------------------------------------------------------------------------------------------+
|                            隧道工程多维协同智能排水自适应平台 (核心业务同构体系)                            |
|  [水动力-力学双分支计算内核]    [3D三心圆孪生/应力云图]    [A3数字化蓝图引擎]    [Typst矢量工程计算书]   |
+--------------------------------------------------------------------------------------------------+
                                  ▲                                          ▲
                                  │                                          │
       【模式 A：服务器协作模式 (Server/Web)】       │       【模式 B：桌面独立 GUI 模式 (Standalone)】
                                  │                                          │
+─────────────────────────────────┴─────────+     +──────────────────────────┴─────────────────────+
| [客户端] 终端浏览器 (PC/移动端)            |     | [自包含客户端] 单一可执行安装包 (.exe / .msi)     |
|   - Vue 3.5 SPA 静态资源                   |     | +--------------------------------------------+ |
|   - Three.js WebGL 2.0 画布               |     | | [宿主] Tauri 2.0 Native 容器 (Rust 进程)    | |
|   - 动态 API 相对路径探针 (/api/v1)        |     | |   - WebView2 UI 表现层 (Vue 3.5 + Three.js) | |
|                  │                        |     | |   - 进程守护器 (Process Watchdog / JobObj)   | |
|                  ▼ (HTTPS / WSS)          |     | |   - 端口扫描探测器 (Port Probe: 18000-18999) | |
| [网关层] Nginx 反向代理集群                |     | +----------------------┬---------------------+ |
|   - 静态资源缓存与 gzip/brotli 压缩       |     |                        │ (本地回环 HTTP + Token) |
|   - 路径分发: /api -> Uvicorn 服务集群    |     |                        ▼                        |
|                  │                        |     | +--------------------------------------------+ |
|                  ▼ (Reverse Proxy)        |     | | [伴生子进程] 嵌入式后端引擎 (Sidecar Engine)| |
| [服务端] 计算引擎集群 (FastAPI Worker)    |     | |   - 独立固化 Python 运行时 (PyInstaller打包)| |
|   - 集中式 SQLite / PostgreSQL 参数台账   |     | |   - 内存级 SQLite 实例 (%APPDATA% 持久化)   | |
|   - Linux 原生 Typst 编译集群 (多线程池)  |     | |   - 本地内嵌 typst.exe 矢量编译器            | |
+───────────────────────────────────────────+     | +--------------------------------------------+ |
                                                  +------------------------------------------------+
```

### 3.2 模式 A：服务器模式 (Server Mode / Web) 架构设计

#### 3.2.1 前端环境感知与动态网关寻址
- 前端代码在生产编译（`npm run build`）后，摒弃静态写死在 `.env` 中的 `http://localhost:8000`。
- 构建通信适配层 `src/api/adapter.ts`，基于浏览器运行环境自动判定当前通信基准地址：
  ```typescript
  // frontend/src/api/adapter.ts
  export function resolveApiBaseUrl(): string {
    // 桌面独立容器模式标识 (由 Tauri 注入或端口广播)
    if (window.__TAURI_INTERNALS__ || (window as any).__DESKTOP_API_BASE__) {
      return (window as any).__DESKTOP_API_BASE__;
    }
    // Web 模式：优先使用环境变量覆盖；若无则自适应当前源地址的相对 API 前缀
    const envBase = import.meta.env.VITE_API_BASE_URL;
    if (envBase && envBase.startsWith('http')) {
      return envBase;
    }
    // 默认通过 Nginx 同源相对路径反向代理，杜绝跨域预检与端口显式暴露
    return '/api/v1';
  }
  ```

#### 3.2.2 生产级反向代理与服务拓扑 (Nginx Contract)
- Nginx 统一承载 80/443 流量，实施动静分离与安全隔离：
  - `/` -> 代理前端静态资源包 (`dist/`)，开启 HTML `no-cache` 与静态哈希资源 `max-age=31536000` 缓存；
  - `/api/` -> 代理后端 Uvicorn 集群 (`http://127.0.0.1:8000`)，配置缓冲区与大包上传（支持 Excel 多标段长里程表单）限制；
  - 针对大批量计算书流式下载 (`/api/v1/calculation-books/batch-export`)，配置 `proxy_read_timeout 300s`，禁止代理层提前断开连接。

### 3.3 模式 B：桌面独立 GUI 模式 (Desktop Standalone GUI) 架构设计

#### 3.3.1 自包含 Sidecar 伴生进程与守护模型
桌面模式的核心矛盾是：**既要维持 Python 高性能数值计算与 Typst 编译链路，又要向终端用户提供“双击可运行、无控制台黑框、无需配置开发环境”的纯粹 GUI 体验**。

```
+---------------------------------------------------------------------------------------+
| Tauri 主进程 (Rust Runtime)                                                            |
|                                                                                       |
|  1. [生命周期入口] ──> 2. [探测空闲端口] ──> 3. [生成随机会话 Token] ──> 4. [拉起 Sidecar]|
|                                                                          │            |
|  8. [窗口关闭/退出]                                                        ▼            |
|       │         5. [心跳探针轮询] <── (GET /health?token=xxx) ── [FastAPI Sidecar]     |
|       ▼                                                                  │            |
|  [安全清理管道]                                                            │            |
|  Windows Job Object / 杀进程树 (Kill Tree) ──────────────────────────────► [子进程终止] |
+---------------------------------------------------------------------------------------+
```

1. **后端二进制固化 (PyInstaller / Nuitka 方案)**：
   - 利用 PyInstaller 将 `backend` 核心脚本打包为自包含单目录（Onedir）或单文件（Onefile）可执行程序 `tunnel-backend-sidecar.exe`。
   - 依赖项（NumPy, Pandas, FastAPI, Uvicorn, SQLite 驱动）全部固化打包，内置轻量 Python 解释器。
   - 分发结构中同步携带 Windows 原生 `typst.exe`，存放在 `sidecar/bin/` 目录下，并通过相对环境变量 `PATH` 注入。
2. **安全端口探测与动态握手协议 (Dynamic Port Probing & Handshake)**：
   - 严禁硬编码固定端口，防止与其他本地软件冲突。
   - Tauri 启动前，在 Rust 端执行 TCP 绑定探测，在 `18000~18999` 范围内寻找首个可用未占用端口 `ALLOCATED_PORT`。
   - 生成一次性安全鉴权口令 `SESSION_SECRET`（UUID4），通过环境变量或命令行参数传递给 Sidecar 进程：
     ```bash
     tunnel-backend-sidecar.exe --port=18423 --secret=f9c2a801-... --db-dir="%APPDATA%/TunnelPlatform"
     ```
3. **Rust 进程级监视器与子进程生命周期绑定 (Guard & Job Object)**：
   - **Win32 Job Object 硬件级绑定**：Tauri Rust 宿主创建 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` 限制的 Windows 作业对象，将 Sidecar 句柄分配至该 Job。一旦父进程（Tauri）发生任何崩溃、用户任务管理器强杀或断电式关闭，Windows 操作系统内核将自动保证子进程被同时清除，彻底杜绝孤儿进程。
   - **双向心跳自毁机制 (Suicide Watchdog)**：
     - 后端 Sidecar 启动后挂载后台线程，每隔 5 秒检查一次父进程 PID 是否存活；若父进程异常消失，Sidecar 自行调用 `os._exit(0)` 退出。

#### 3.3.2 桌面端独立存储与文件系统拓扑
桌面模式下，用户数据不得写入只读的安装程序目录（如 `C:\Program Files`），必须严格隔离至用户专属数据目录：
- **参数数据库**：自动定向至 `%APPDATA%\TunnelDrainagePlatform\tunnel_params.db`；若数据库文件不存在，启动时自动从内置基准模板执行无损初始化建表。
- **本地日志输出**：定向至 `%APPDATA%\TunnelDrainagePlatform\logs\backend.log`，单文件上限 10MB，轮转归档，免除日志膨胀。
- **导出文件交互**：集成 Tauri 2.0 原生 `tauri-plugin-dialog` 与 `tauri-plugin-fs`，施工图与计算书由系统原生“另存为”文件对话框引导用户保存至桌面或任意指定盘符。

---

## 四、 Data Flow Modeling (双模式数据流拓扑)

### 4.1 服务器模式 (Web) 数据流图

```
[用户浏览器]
     │
     │  1. 页面访问 (HTTP GET /)
     ▼
[Nginx 静态服务] ──(返回 Vue 3.5 / Three.js 资源包)──> [用户浏览器执行渲染]
     │
     │  2. 开始计算 (POST /api/v1/calculate/drainage)
     ▼
[Nginx 反向代理] ──(反代 HTTP)──> [FastAPI 集群 (Worker)]
                                        │
                                        ├─> [hydrocalc.py] (SCS-CN 水文解算)
                                        ├─> [mechcalc.py] (24单元偏心受压解算)
                                        └─> [optimizedDesign.py] (自适应临界搜索)
                                        │
     ┌──────────────────────────────────┘ (返回双分支解算 JSON)
     ▼
[用户浏览器] ──> 更新 Pinia 状态机 ──> 重绘 3D 衬砌云图/管网 ──> 触发施工蓝图/计算书
     │
     │  3. 导出工程计算书 (POST /api/v1/calculation-books/export-pdf)
     ▼
[FastAPI 集群] ──> 唤醒内存 Typst 编译器 ──(流式返回 PDF 二进制流)──> [浏览器原生保存]
```

### 4.2 桌面独立 GUI 模式数据流图

```
[用户双击桌面快捷方式]
     │
     ▼
[Tauri 2.0 Rust 主进程]
     │
     ├─ 1. 扫描可用本地端口 (e.g. 18234)
     ├─ 2. 挂载 Win32 Job Object 守护管道
     ├─ 3. 拉起 Sidecar 子进程: tunnel-backend-sidecar.exe --port 18234
     ├─ 4. 轮询健康探针: GET http://127.0.0.1:18234/health 直至 HTTP 200 Ready
     ├─ 5. 注入全局变量: window.__DESKTOP_API_BASE__ = "http://127.0.0.1:18234/api/v1"
     ▼
[WebView2 表现层加载前端页面]
     │
     │  6. 交互计算 (POST http://127.0.0.1:18234/api/v1/calculate/drainage)
     ▼
[本地 Sidecar 后端] ──> 读写本地 SQLite (%APPDATA%/tunnel_params.db)
     │                ──> 调用本地内置 typst.exe 编译计算书
     ▼ (本地回环零网络延迟响应)
[WebView2 表现层] ──> 3D 渲染与即时刷新
     │
     │  7. 用户点击导出蓝图 / 计算书
     ▼
[Tauri Native Dialog API] ──> 弹出原生 Windows 文件保存选择框 ──> 无损落盘至本地文件系统
```

---

## 五、 Work Breakdown Structure (工作分解结构 WBS)

本阶段工作按照“双轨分离、模块解耦、流水线集成”分解为 5 大工作包 (WP)：

```
阶段六：双模式融合部署与全平台交付
├── WP1: 核心通信与环境自适应感知层重构
│   ├── Task 1.1: 前端 API 动态适配器开发 (区分 Web / Tauri 动态回环注入)
│   ├── Task 1.2: 后端 CORS 与鉴权口令自适应配置 (支持本地随机 Token 与局域网白名单)
│   └── Task 1.3: 本地持久化路径动态注入重构 (支持环境变量覆盖 DB 存储路径)
│
├── WP2: 服务器模式 (Web) 打包与容器化流水线
│   ├── Task 2.1: 前端生产静态资产编译与 Nginx 部署模板编写
│   ├── Task 2.2: 后端生产服务多进程配置 (Gunicorn + Uvicorn Worker)
│   ├── Task 2.3: Linux x86_64 Typst 运行时依赖镜像与多线程安全校验
│   └── Task 2.4: Dockerfile & docker-compose 一键交付编排工程化
│
├── WP3: 桌面独立 GUI (Desktop) Sidecar 进程守护管线
│   ├── Task 3.1: Python 后端独立二进制固化封装工程 (PyInstaller Spec 编制)
│   ├── Task 3.2: Tauri 2.0 Rust 端口探测器与动态进程启动器开发
│   ├── Task 3.3: Win32 Job Object 父子进程生命周期硬件绑定与防孤儿治理
│   └── Task 3.4: 桌面模式原生文件对话框 (Dialog/FS Plugin) 桥接集成
│
├── WP4: 跨端性能专项调优与长里程大体量压测
│   ├── Task 4.1: 长里程（>10 断面）InstancedMesh 显存泄漏排查与 WebGL 上下文保活
│   ├── Task 4.2: 桌面端 WebView2 内存占用压制与 GPU 硬件加速兼容性调优
│   └── Task 4.3: 计算书 Typst 批量编译并发线程池调优与内存回收
│
└── WP5: 全流程全模式端到端交付与验收回归
    ├── Task 5.1: 服务器 Web 模式全功能（计算->3D->台账->蓝图->计算书）联调测试
    ├── Task 5.2: 桌面纯单机无网环境全流程回归验证
    ├── Task 5.3: Windows 桌面独立安装包 (.msi/.exe) 签名与集成构建打包
    └── Task 5.4: 编写《系统双模式部署与安装维护手册》
```

---

## 六、 Acceptance Criteria (验收指标矩阵)

| 序号 | 验证维度 | 检验项与测试场景 | 预期判定指标 (Pass / Fail) |
| :---: | :--- | :--- | :--- |
| **AC-1** | **桌面免依赖性** | 在干净无 Python、无 Node.js、无 Rust 的 Windows 10/11 虚拟机中运行安装包。 | **Pass**: 顺利完成安装，桌面快捷方式一键启动，正常呈现 3D 界面并成功计算，无任何环境缺失报错。 |
| **AC-2** | **断网单机运行** | 拔掉物理网线并关闭 Wi-Fi（完全断网），操作参数输入、4工况计算、3D剖切、A3蓝图导出与Typst计算书导出。 | **Pass**: 所有功能运行正常，不向外网发起任何阻断性网络请求，计算书和蓝图正常生成并保存至本地。 |
| **AC-3** | **端口冲突免疫** | 人为占用 `8000` 与 `8080` 端口（例如启动其他占用软件），随后启动桌面端应用。 | **Pass**: Tauri 自动在 `18000~18999` 范围内寻找可用未占用端口并成功拉起后端，无端口冲突弹窗与溃败。 |
| **AC-4** | **孤儿进程清理** | 打开桌面端正常计算后，通过“任务管理器”强行杀死 Tauri 主进程，或点击窗口右上角红叉退出。 | **Pass**: 伴生 Python Sidecar 进程及 typst 子进程在 1 秒内完全从任务管理器中消失，无后台暗中残留。 |
| **AC-5** | **长里程性能** | 导入含 15 个断面的长里程 Excel 工程数据，启动批量解算并在 3D 画布中连续全选装配展示。 | **Pass**: 3D 画布交互旋转/缩放帧率稳定 $\ge 50\,\text{FPS}$，无 WebGL Context Lost，内存平稳无持续上升。 |
| **AC-6** | **Web 服务并发** | 服务器模式下，通过并发工具模拟 20 个客户端同时发起计算与 Typst 计算书导出请求。 | **Pass**: HTTP 响应成功率 100%，无死锁、无临时文件写冲突，服务无崩溃或拒绝服务。 |
| **AC-7** | **业务同构性** | 同一套典型工程参数（如标段 DK12+450），在服务器 Web 端与桌面单机端分别解算导出蓝图与计算书。 | **Pass**: 两个模式导出的数值结论、最小安全系数、临界注浆厚度、Typst PDF 校验和与蓝图完全一致。 |

---

## 七、 目录组织与发布交付体系规划 (Directory & Release Taxonomy)

原初步方案中将部署源码放在 `dist-docker/` 以及在根目录零散输出 `dist-desktop/` 的做法存在**职责混淆**（将 IaC 部署源码混同于构建产物）与**目录污染**风险。本方案对全系统工程目录、构建中间缓存及最终发布分发物料进行严格的三层解耦治理。

### 7.1 三层物理目录架构设计

```
tunnel-drainage-platform/
│
├── [第一层：工程源码与构建部署配置 (Tracked by Git)]
│   ├── frontend/
│   │   ├── src/                         # 前端业务源码 (Vue 3.5 + Three.js)
│   │   └── src-tauri/                   # Tauri 2.0 宿主源码 (Rust、tauri.conf.json、capabilities)
│   ├── backend/
│   │   ├── app/                         # 后端计算内核 (FastAPI, hydrocalc, mechcalc)
│   │   └── packaging/                   # 桌面后端打包工程源码
│   │       ├── sidecar.spec             # PyInstaller 规格定义文件
│   │       └── hooks/                   # 动态依赖注入 Hook
│   ├── deploy/                          # 【规范化】生产部署与容器化编排源码 (替代混乱的 dist-docker)
│   │   ├── server/                      # 服务器 Web 模式部署源码
│   │   │   ├── docker-compose.yml       # 多容器编排基准
│   │   │   ├── Dockerfile.backend       # 后端计算集群镜像构建配置
│   │   │   ├── Dockerfile.frontend      # 前端 Nginx 静态镜像构建配置
│   │   │   ├── nginx/
│   │   │   │   └── nginx.conf           # 动静分离与反向代理标准配置
│   │   │   └── .env.example             # 生产环境变量模板
│   │   └── scripts/                     # 跨平台一键自动化构建流水线脚本
│   │       ├── build-desktop.ps1        # Windows 桌面端一键编译打包脚本
│   │       └── build-server.sh          # Linux 服务器模式一键构建导出脚本
│   │
├── [第二层：构建缓存与中间物料 (Ignored by Git)]
│   ├── frontend/dist/                   # 前端 Vite 生产构建输出
│   ├── frontend/src-tauri/target/       # Rust Cargo 编译缓存与 Tauri Bundle 原始输出
│   ├── frontend/src-tauri/binaries/     # 存放由后端打包出的 external binary 桥接中间件
│   └── backend/build/ & backend/dist/   # PyInstaller 临时编译缓存与中间产物
│
└── [第三层：最终交付发行物料库 (Release Deliverables - Ignored by Git)]
    └── release/                         # 【统一发布目录】（项目根或工程根，与业务源码严格隔离）
        ├── desktop/                     # 桌面独立 GUI 模式发行包
        │   ├── TunnelDrainagePlatform-v1.0.0-x64-Setup.exe  # 推荐：NSIS 现代安装向导
        │   ├── TunnelDrainagePlatform-v1.0.0-x64.msi        # 企业级静默分发安装包
        │   ├── TunnelDrainagePlatform-v1.0.0-x64-Portable.zip # 免安装即用绿色便携版
        │   └── SHA256SUMS.txt                               # 桌面二进制安全完整性校验和
        └── server/                      # 服务器协作模式交付包
            ├── tunnel-drainage-server-v1.0.0-docker.tar.gz  # 离线环境 Docker 镜像集成归档
            ├── docker-compose.yml                           # 开箱即用启动编排
            ├── .env.production                              # 生产运行配置
            └── SHA256SUMS.txt                               # 服务器镜像与编排完整性校验和
```

### 7.2 双模式构建物料流转拓扑 (Build Pipeline Flow)

```
【桌面独立 GUI 模式流转流水线】
backend/ ──(PyInstaller + packaging/sidecar.spec)──> backend/dist/tunnel-backend-sidecar.exe
                                                                 │ (自动复制注入)
                                                                 ▼
frontend/ ──(npm run build)──> frontend/dist/ ──> frontend/src-tauri/binaries/
                                                                 │
                                                       (cargo tauri build)
                                                                 │
                                                                 ▼
                                                  src-tauri/target/release/bundle/
                                                                 │ (标准化归集与哈希校验)
                                                                 ▼
                                            release/desktop/TunnelDrainagePlatform-Setup.exe

【服务器 Web 模式流转流水线】
frontend/ ──(npm run build)──> frontend/dist/ ──(COPY into Nginx Image)──┐
backend/  ──(Poetry / Pip)  ──(COPY into Python Worker Image)───────────┼─> docker save
deploy/server/ ─────────────────────────────────────────────────────────┘      │
                                                                               ▼
                                            release/server/tunnel-drainage-server-v1.0.0.tar.gz
```

### 7.3 版本控制防污染门禁 (Git Defense Gate)

针对最终发布目录与中间构建物料，必须在根目录 `.gitignore` 与 `tunnel-drainage-platform/.gitignore` 中严格落地以下规则，严禁数百兆的安装包与镜像意外穿透提交流入 Git 仓库：

```gitignore
# -------------------------------------------------------------
# 构建中间产物与编译缓存
# -------------------------------------------------------------
**/dist/
**/build/
**/target/
**/.pytest_cache/

# -------------------------------------------------------------
# 桌面端 Tauri 与 PyInstaller 中间态二进制
# -------------------------------------------------------------
**/src-tauri/binaries/*
!**/src-tauri/binaries/.gitkeep
*.spec

# -------------------------------------------------------------
# 最终交付发布目录与巨型安装物料
# -------------------------------------------------------------
release/
dist-desktop/
dist-docker/
*.exe
*.msi
*.tar.gz
*.zip
```

### 7.4 最终交付物清单与对齐基准 (Deliverables Index)

1. **工程源码与构建部署工程交付**：
   - `tunnel-drainage-platform/frontend/src-tauri/`：Tauri 2.0 桌面配置、Rust 动态端口扫描探测器与 Win32 Job Object 守护代码。
   - `tunnel-drainage-platform/backend/packaging/`：后端自包含固化打包配置 (`sidecar.spec`) 与 Typst 编译二进制集成映射。
   - `tunnel-drainage-platform/deploy/server/`：标准化服务器容器编排配置（`docker-compose.yml`, `Dockerfile.*`, `nginx/nginx.conf`）。
   - `tunnel-drainage-platform/deploy/scripts/`：跨平台一键发布流水线脚本（`build-desktop.ps1`, `build-server.sh`）。
2. **最终二进制发行物料（归集于 `release/` 目录）**：
   - `release/desktop/`：Windows 独立安装向导包 (`.exe`)、企业部署包 (`.msi`) 与安全校验和。
   - `release/server/`：一键离线部署压缩包与环境配置文件。
3. **架构与操作文档交付**：
   - `阶段6-服务器与桌面独立GUI双模式交付系统架构方案.md` (系统架构与设计基准)。
   - `系统双模式部署与使用说明书.md` (面向工程一线用户与系统运维人员的操作手册)。

