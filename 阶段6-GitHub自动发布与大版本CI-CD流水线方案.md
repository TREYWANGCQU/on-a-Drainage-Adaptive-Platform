<!-- 阶段6-GitHub自动发布与大版本CI-CD流水线方案.md -->

# 【阶段6-实施方案】：GitHub 自动发布与大版本 CI/CD 流水线架构方案

> **系统分析师声明 (System Analyst Mandate)**：  
> 本方案严格依据《阶段6-服务器与桌面独立GUI双模式交付系统架构方案》及系统分析与需求解构规范，面向“隧道工程多维协同智能排水自适应平台”桌面独立 GUI 交付包的云端持续集成与自动化发布需求。方案围绕“如何确定大版本”、“GitHub CI 自动发布 amd64 MSI 与 Portable 免安装包”、“全自动提取更新摘要”以及“结构化注入运行环境条件说明”四大核心诉求，输出确定性的判定逻辑、边界契约矩阵、CI 流水线拓扑、WBS 分工及验收指标矩阵。

---

## 一、 Objectives (目标体系)

### 1.1 核心交付目标
1. **大版本严密判定机制 (Deterministic Major Version Detection)**：
   - 建立多维度判别模型，精准界定工程大版本（Major Milestone Release），将破坏性重构、计算内核升级与重大功能里程碑自动映射至发版流程；
   - 提供基于 Git Tag 语义正则、代码配置单点真值（Single Source of Truth, SSOT）与变更日志（Changelog）联动的三重门禁锁，彻底阻断日常提交、功能分支与微小补丁（Patch）误触全量构建。
2. **GitHub Actions 自动化编译与双轨发版 (Automated CI/CD Dual-Packaging)**：
   - 触发大版本发布时，云端 Windows 虚拟化 Runner 自动并行调度 Python 后端自包含冻结与 Tauri 2.0 原生编译；
   - 自动生成并归集两大 Windows 交付资产：
     - **AMD64 MSI 企业安装包**（`TunnelDrainagePlatform-vX.Y.Z-x64.msi`）：支持企业域控静默分发与组策略部署；
     - **AMD64 Portable 绿色便携包**（`TunnelDrainagePlatform-vX.Y.Z-x64-Portable.zip`）：单机免安装、解压即用、零环境依赖。
   - 自动计算 NIST FIPS 180-4 标准 SHA-256 散列清单（`SHA256SUMS.txt`），提供工程级防篡改证据链。
3. **动态发布说明与运行条件自动合成 (Synthesized Release Body)**：
   - 从 `CHANGELOG.md` 中毫秒级定位截取当前大版本的更新日志块，辅以 Git Commit 变更追踪；
   - 自动化组装《运行条件与系统需求说明书》（OS 兼容性、WebView2 状态、硬件规格、本地回环免提权契约）；
   - 自动注入《分发物料选型建议》，形成工业级 GitHub Release 公告。

### 1.2 系统量化指标
- **误触发率**：非大版本 Tag 或未对齐版本号的构建触发拦截率 $100\%$；
- **发版幂等性**：同一 Git Tag 触发构建在同构环境下产出的安装包具备严格的依赖与逻辑幂等性；
- **全流程自动化耗时**：端到端云端构建时长控制在 $\le 18\,\text{min}$（包含 Python 依赖还原、PyInstaller 冻结、Cargo 依赖缓存与 Tauri/WiX 构建）；
- **包体自包含校验**：产物在全新纯净 Windows 10/11 x64 环境下双击运行成功率 $100\%$。

---

## 二、 Constraints & Boundary Contract Matrix (约束条件与边界契约矩阵)

### 2.1 事实、判断与推测分离准则 (Fact, Judgment and Speculation)
- **事实 (Fact)**：
  - 项目根目录包含前端（`tunnel-drainage-platform/frontend`）与后端（`tunnel-drainage-platform/backend`）代码。
  - 桌面宿主已采用 Tauri 2.0，后端已具备 `packaging/sidecar.spec` PyInstaller 规格定义，本地已有 `deploy/scripts/build-desktop.ps1` 脚本。
  - GitHub-hosted runner `windows-latest`（Windows Server 2022）已预装 Python 3.10+、Node.js 20+、Rust stable 工具链以及 WiX Toolset 3.11。
- **判断 (Judgment)**：
  - 云端 Runner 与本地开发机环境存在物理路径与环境差异（例如 `python.exe` 相对路径、WiX 环境变量、Cargo 依赖网络拉取），CI 流水线必须具备确定性的环境探测与错误自愈逻辑。
  - 便携版（Portable）不仅是一个简单的可执行文件，必须严格打包前端 Tauri 宿主、后端 `tunnel-backend-sidecar.exe`、内嵌的 `typst.exe` 及必要资源，确保用户解压后开箱即用。
- **推测 (Speculation)**：
  - 隧道工程野外一线可能存在大量使用内部离线电脑的用户，GitHub Releases 是他们获取正式交付物的唯一外部权威源，因此 Release Description 必须自带完整自解说的操作与配置要求。

### 2.2 跨平台运行时与边界契约矩阵 (Boundary Contract Matrix)

| 维度 / 契约要素 | 云端构建虚拟环境 (GitHub CI Runner) | 现场目标宿主 (Target Host / Win32) | 强制标准 / RFC 依据 |
| :--- | :--- | :--- | :--- |
| **操作系统规格** | Windows Server 2022 (GitHub `windows-latest`) | Windows 10 (1809+) / Windows 11 (x64) | Win32 API / NT 内核契约 |
| **构建权限模型** | GitHub Actions Runner 管理员权限 | 现场操作员标准受限用户 (Standard User) | Windows UAC / 最小特权安全模型 |
| **MSI 打包引擎** | WiX Toolset v3.11 / v4.0 (集成于 Tauri Bundle) | Windows Installer 5.0+ (`msiexec.exe`) | Microsoft MSI Database Schema |
| **绿色便携封装** | PowerShell `Compress-Archive` (Deflate 压缩) | Windows 原生资源管理器 / 7-Zip / WinRAR | RFC 1951 (DEFLATE Stream) |
| **版本命名规约** | SemVer 2.0.0 正则模式匹配 (`vX.Y.Z`) | 语义版本号映射 (`Major.Minor.Patch.0`) | SemVer 2.0.0 / PE Header Version |
| **CI 权限边界** | `GITHUB_TOKEN` 配置 `contents: write` | 只读下载与运行，无源码仓库访问权 | GitHub REST API v3 / OAuth2 Scopes |
| **完整性校验** | SHA-256 算法生成 `SHA256SUMS.txt` | `CertUtil -hashfile <file> SHA256` 校验 | NIST FIPS 180-4 / RFC 3174 |

---

## 三、 Architecture (系统架构解构)

### 3.1 “大版本”科学界定模型与多维判定拓扑 (Major Version Decision Topology)

工程软件不同于快速迭代的互联网应用，大版本（Major Version）代表着核心算法、架构拓扑或工程契约的重大跃升。

```
                              [Git Tag Push 事件触发 (v*)]
                                           │
                                           ▼
             +-----------------------------------------------------------+
             | Gate 1: 语义命名模式拦截 (Semantic Tag Regex Check)        |
             |   - 纯大版本 (Strict Major): ^v[0-9]+\.0\.0$               |
             |   - 业务里程碑大版本 (Milestone): ^v[0-9]+\.[0-9]+\.0$     |
             |   - 排除任何补丁与预发后缀 (-alpha, -beta, -rc, .1~99)     |
             +-----------------------------┬-----------------------------+
                                           │ Pass (符合大版本命名特征)
                                           ▼
             +-----------------------------------------------------------+
             | Gate 2: 代码资产真值单点锁验 (SSOT Version Integrity)     |
             |   - 读取 frontend/src-tauri/tauri.conf.json -> version    |
             |   - 读取 frontend/package.json -> version                 |
             |   - 检验: TagVersion == TauriVersion == PackageVersion    |
             +-----------------------------┬-----------------------------+
                                           │ Pass (工程配置完全对齐)
                                           ▼
             +-----------------------------------------------------------+
             | Gate 3: 变更日志规范性门禁 (Changelog Completeness Gate)  |
             |   - 扫描 CHANGELOG.md 中是否存在 ## [X.Y.Z] 标题          |
             |   - 检查是否包含 [破坏性改动/重构/新功能] 章节            |
             |   - 提取该章节文本 -> 导出为 CI 输出环境变量 RELEASE_BODY  |
             +-----------------------------┬-----------------------------+
                                           │ Pass (文档与工程完备)
                                           ▼
                        [判定成功: is_major_release = true]
                                           │
                                           ▼
                          [启动全面并行编译与双包发版 Job]
```

#### 3.1.1 大版本的具体判定维度
1. **维度一：数值计算与物理力学内核跃迁（核心判据）**：
   - 水动力学模型迭代（如从单断面达西渗流拓展为三心圆全环渗流场矩阵耦合）；
   - 衬砌偏心受压 24 单元几何拓扑与极限状态方程接口发生变更；
   - 数据库台账 Schema 发生破坏性变迁（需要执行破坏性迁移或重建）。
2. **维度二：交付架构与运行时拓扑变迁**：
   - 从纯网页（Web）交付跃迁为双模式（服务器 + Tauri 2.0 桌面自包含独立端）；
   - 进程生命周期机制重构（如 Win32 Job Object 引入与守护契约变更）。
3. **维度三：版本号数学语义（SemVer 2.0）**：
   - 格式为 `vX.Y.Z`：
     - **Strict Major（严格大版本）**：`Z == 0` 且 `Y == 0`（例如 `v1.0.0`, `v2.0.0`），代表跨代升级；
     - **Milestone Release（关键里程碑大版本）**：`Z == 0`（例如 `v1.1.0`, `v1.2.0`），代表新增重大工程模块（如新增施工蓝图直出引擎、批量计算书导出引擎），此时同样具备完整发布的资格；
     - **非大版本（拒绝自动发布正式 Release）**：`Z > 0`（如 `v1.0.1`，仅代码修补）或带预发标签（如 `v1.0.0-rc.1`）。

---

### 3.2 GitHub Actions 自动化发布流水线拓扑 (Pipeline Topology)

流水线采用两阶段解耦设计：**Phase 1 门禁过滤与决策 (Gatekeeper)** + **Phase 2 深度集成构建与发布 (Builder & Publisher)**。

```
+---------------------------------------------------------------------------------------------------------+
|                                     GitHub Actions Workflow: release-desktop                            |
+---------------------------------------------------------------------------------------------------------+
                                                     │
                                                     ▼
+---------------------------------------------------------------------------------------------------------+
| Stage 1: gatekeeper (运行环境: ubuntu-latest / windows-latest, 耗时 < 30s)                              |
|   1. 提取当前触发 Tag (GITHUB_REF_NAME)                                                                 |
|   2. 运行 Python 门禁脚本判定是否满足大版本规则 (is_major)                                              |
|   3. 提取 CHANGELOG.md 中对应大版本的 Release Notes 文本                                                |
|   4. 若非大版本或校验失败: 打印拦截告警, 优雅终止后续 Job (exit code 0 / skip downstream)              |
+----------------------------------------------------+----------------------------------------------------+
                                                     │ (is_major == 'true')
                                                     ▼
+---------------------------------------------------------------------------------------------------------+
| Stage 2: build-desktop-release (运行环境: windows-latest, 耗时 ~15min)                                   |
|   [环境初始化与缓存预热]                                                                                 |
|     - actions/checkout@v4                                                                               |
|     - actions/setup-python@v5 (Python 3.10, pip cache)                                                  |
|     - actions/setup-node@v4 (Node 20, npm cache)                                                        |
|     - dtolnay/rust-toolchain@stable (Rust MSVC, cargo cache: ~/.cargo/registry & target)               |
|     - 验证预装环境: WiX Toolset 3.11 路径配置                                                           |
|                                                                                                         |
|   [Step 1: 编译与固化后端 Python Sidecar]                                                               |
|     - cd tunnel-drainage-platform/backend                                                               |
|     - pip install -r requirements.txt pyinstaller                                                       |
|     - pyinstaller packaging/sidecar.spec --distpath dist --workpath build -y                             |
|     - 输出: backend/dist/tunnel-backend-sidecar.exe                                                     |
|                                                                                                         |
|   [Step 2: 注入外部二进制与 Typst 依赖至 Tauri 桥接目录]                                                 |
|     - Copy 至 frontend/src-tauri/binaries/tunnel-backend-sidecar.exe                                     |
|     - Copy 至 frontend/src-tauri/binaries/tunnel-backend-sidecar-x86_64-pc-windows-msvc.exe             |
|     - 验证内嵌 typst.exe 放置就绪                                                                       |
|                                                                                                         |
|   [Step 3: 构建前端 SPA 静态生产资产]                                                                   |
|     - cd tunnel-drainage-platform/frontend                                                              |
|     - npm ci && npm run build -> 输出: frontend/dist/                                                   |
|                                                                                                         |
|   [Step 4: 编译 Tauri 原生 MSI 企业安装包]                                                              |
|     - npx tauri build --bundles msi                                                                     |
|     - 产物提取: frontend/src-tauri/target/release/bundle/msi/*.msi                                       |
|     - 重命名规范化: TunnelDrainagePlatform-vX.Y.Z-x64.msi                                               |
|                                                                                                         |
|   [Step 5: 组装绿色免安装便携版 (Portable Zip)]                                                         |
|     - 提取 release 二进制: frontend/src-tauri/target/release/TunnelDrainagePlatform.exe                  |
|     - 归集目录: TunnelDrainagePlatform-Portable/                                                        |
|         ├── TunnelDrainagePlatform.exe (前端宿主)                                                        |
|         ├── tunnel-backend-sidecar.exe (自包含后端引擎)                                                  |
|         └── README_PORTABLE.txt (便携版使用指引)                                                        |
|     - Compress-Archive -> TunnelDrainagePlatform-vX.Y.Z-x64-Portable.zip                                |
|                                                                                                         |
|   [Step 6: 安全散列生成]                                                                                |
|     - Get-FileHash -Algorithm SHA256 *.msi, *.zip -> SHA256SUMS.txt                                     |
|                                                                                                         |
|   [Step 7: 动态组装 Release Description Markdown]                                                       |
|     - Header (大版本发布贺词与标识)                                                                     |
|     - [Changelog 摘要] (从 Gatekeeper 继承的更新内容)                                                    |
|     - [运行条件与系统需求说明] (静态工业级环境矩阵)                                                     |
|     - [交付物料选型与安装指导] (MSI vs Portable 差异对比)                                               |
|     - [SHA-256 安全散列表]                                                                              |
|                                                                                                         |
|   [Step 8: 自动发布至 GitHub Releases]                                                                  |
|     - softprops/action-gh-release@v2                                                                     |
|     - 挂载物料: *.msi, *.zip, SHA256SUMS.txt                                                            |
|     - Tag: GITHUB_REF_NAME                                                                              |
|     - Prerelease: false (正式发布)                                                                      |
+---------------------------------------------------------------------------------------------------------+
```

---

### 3.3 自动生成的 Release Description 结构化规范 (Release Body Specification)

每次大版本自动发布时，GitHub Release 正文由 CI 脚本自动渲染合成，必须包含以下五大标准模块：

```markdown
# 🚀 隧道工程多维协同智能排水自适应平台 - {{ VERSION }} 正式发布

本版本为平台里程碑式大版本更新，正式交付“服务器与桌面独立 GUI 双模式”之桌面自包含发行包。

---

## 📋 本次大版本核心更新摘要 (Release Changelog)
{{ EXTRACTED_CHANGELOG_CONTENT }}

---

## 💻 运行条件与系统环境需求说明 (System Prerequisites)

为确保桌面独立 GUI 模式在工程现场稳定运行，请核实目标计算机满足以下基准配置：

| 维度 / 项目 | 最低运行需求 (Minimum) | 推荐工程配置 (Recommended) | 现场运维说明 |
| :--- | :--- | :--- | :--- |
| **操作系统** | Windows 10 x64 (版本 1809+) | Windows 11 x64 (最新稳定版) | 不支持 32 位系统；支持离线单机运行 |
| **Web 渲染引擎** | Microsoft Edge WebView2 Evergreen | Microsoft Edge WebView2 Evergreen | Win11 已内置；Win10 如精简版缺失需补装 |
| **处理器 (CPU)** | 双核 2.0 GHz (x86_64 / amd64) | 4核 3.0 GHz 及以上 (Intel / AMD) | 用于水动力与力学偏心受压数值解算 |
| **系统内存 (RAM)**| 4 GB 物理内存 | 8 GB 或以上 | 空闲内存占用 ≤ 180MB，复杂计算峰值 ~500MB |
| **图形显示 (GPU)**| 支持 WebGL 2.0 / DirectX 11 | 独立显卡 (GTX 1050 / Iris Xe 及以上) | 驱动需正常，用于长里程 3D 孪生及云图渲染 |
| **磁盘存储空间** | 剩余空间 ≥ 1 GB | 剩余空间 ≥ 5 GB (SSD) | 包括程序主体 (~150MB) 与工程本地缓存 |
| **网络与端口条件**| **完全离线单机可用** | **无需任何外部互联网连接** | 需放行本地回环（127.0.0.1）动态端口监听 |
| **用户特权级别** | 标准用户 (Standard User) | 标准用户 (无需 UAC 管理员提权) | 便携版与 MSI 均默认安装至用户安全目录 |

> **特别声明**：本平台已实现 **零外部 Python 环境依赖**、**零数据库配置**、**零 Node.js/Rust 依赖**。程序内置轻量自包含数值解算引擎与 Typst 科技排版编译器，双击即可投入生产。

---

## 📦 交付安装物料说明与选型指南

本版本提供两种形态的 Windows 交付介质，用户可根据场景自由选择：

1. **企业安装包 (`TunnelDrainagePlatform-{{ VERSION }}-x64.msi`)** 【推荐日常使用】：
   - **特点**：标准 Windows Installer 包，自动创建桌面及开始菜单快捷方式，支持 Windows 控制面板一键无损卸载；
   - **适用场景**：设计院工程师个人 PC、项目部办公电脑、IT 集中下发与组策略批量部署。
2. **绿色便携免安装版 (`TunnelDrainagePlatform-{{ VERSION }}-x64-Portable.zip`)** 【应急与单机便携】：
   - **特点**：解压至任意目录即可双击 `TunnelDrainagePlatform.exe` 启动，无需安装，不向注册表写入全局项；
   - **适用场景**：隧道施工现场野外勘测笔记本、涉密专用工控机、U 盘即插即用作业。

---

## 🔒 文件完整性安全校验 (SHA-256 Checksums)

为防止现场下载过程中文件损坏或网络篡改，请在 PowerShell 中执行 `Get-FileHash <文件名> -Algorithm SHA256` 核对哈希值：

```
{{ SHA256_TABLE_CONTENT }}
```
```

---

## 四、 Data Flow Modeling (构建与发布数据流拓扑)

```
[开发者在主分支完成里程碑开发并更新 CHANGELOG.md]
                 │
                 │ 1. 打标推送: git tag v1.0.0 && git push origin v1.0.0
                 ▼
[GitHub 接收 Ref Push] ──> 唤醒 Actions 监听器 (`.github/workflows/release-desktop.yml`)
                                 │
                                 ▼
                     [Job 1: gatekeeper 容器]
                                 │
                     ┌───────────┴──────────────────────────────┐
                     │ 2. 执行版本检测与文本抽取脚本              │
                     │    scripts/ci/check-major-release.py     │
                     └───────────┬──────────────────────────────┘
                                 │ (判定结果)
        ┌────────────────────────┴────────────────────────┐
        ▼                                                 ▼
[不满足大版本条件 (is_major=false)]             [满足大版本条件 (is_major=true)]
        │                                                 │
        ├─> 输出拦截日志, 阻断发版                         │ 3. 传递环境变量:
        └─> Workflow 优雅退出 (No-Op)                      │    - RELEASE_VERSION="1.0.0"
                                                          │    - RELEASE_BODY_PATH="notes.md"
                                                          ▼
                                            [Job 2: build-desktop-release (Win2022)]
                                                          │
                                                          ├─ 4. PyInstaller 固化后端 Sidecar
                                                          ├─ 5. Vite 生产打包前端静态资源
                                                          ├─ 6. Tauri CLI 编译 MSI 安装包
                                                          ├─ 7. 组装 Portable Zip 归档
                                                          ├─ 8. 生成 SHA256SUMS.txt
                                                          │
                                                          ▼
                                            [Job 3: 自动化 Release 上传]
                                                          │
                                                          ├─ 9. 调用 GitHub Release API 创建 v1.0.0
                                                          ├─ 10. 挂载 *.msi, *.zip, SHA256SUMS.txt
                                                          └─ 11. 渲染填充结构化 Release Description
                                                          ▼
                                            [用户收到权威 GitHub Release 通知]
```

---

## 五、 Work Breakdown Structure (工作分解结构 WBS)

按照系统工程方法论，将“大版本自动发布流水线”分解为 4 大工作包 (Work Packages, WP) 与 12 项精细化任务：

```
GitHub 自动发布与大版本 CI/CD 流水线落地工程
├── WP1: 大版本判定算法与自动化门禁工具链开发
│   ├── Task 1.1: 编制大版本判定与 CHANGELOG 提取核心脚本 (`check-major-release.py`)
│   ├── Task 1.2: 确立 SemVer 严格正则模式与项目元数据（`tauri.conf.json`, `package.json`）强校验规则
│   └── Task 1.3: 设计非大版本优雅熔断与日志告警反馈机制
│
├── WP2: 云端 Windows 虚拟化打包环境适配
│   ├── Task 2.1: 梳理 GitHub Runner (`windows-latest`) 环境与 WiX Toolset / Rust 预装契约
│   ├── Task 2.2: 优化 Python 后端 PyInstaller 云端构建耗时（配置 pip cache 与 spec 依赖收敛）
│   └── Task 2.3: 固化 Windows 平台 target-triple 二进制命名规则 (`-x86_64-pc-windows-msvc.exe`)
│
├── WP3: GitHub Actions 流水线工作流编排 (`.github/workflows/release-desktop.yml`)
│   ├── Task 3.1: 编排 Gatekeeper 与 Builder 阶段依赖与环境传递 (`needs: gatekeeper`)
│   ├── Task 3.2: 编排 MSI 生成与 Portable 压缩打包自动化脚本
│   ├── Task 3.3: 编排 SHA-256 自动化校验和计算与清单持久化
│   └── Task 3.4: 集成 `softprops/action-gh-release`，实现动态 Release Notes 与运行条件模板拼接
│
└── WP4: 容灾、回滚与工程验收测试
    ├── Task 4.1: 在测试仓库或模拟分支中进行 Tag 拦截测试（测试 `v1.0.1` 拦截与 `v1.0.0` 放行）
    ├── Task 4.2: 云端构建产物下载与干净虚拟机（Win10/11）免依赖安装回归验证
    └── Task 4.3: 完善《工程发布与版本维护规范指南》文档
```

---

## 六、 Acceptance Criteria (验收指标矩阵)

| 序号 | 验证维度 | 检验项与测试场景 | 预期判定指标 (Pass / Fail) |
| :---: | :--- | :--- | :--- |
| **AC-1** | **大版本准入与拦截** | 1. 推送补丁 Tag `v1.0.1`；<br>2. 推送预发 Tag `v1.0.0-rc.1`；<br>3. 推送大版本 Tag `v1.0.0`。 | **Pass**：场景 1 与 2 在 Gatekeeper 阶段被成功识别为非大版本并安全阻断，不触发昂贵构建；场景 3 成功通过门禁并触发完整发布流。 |
| **AC-2** | **版本真实源一致性** | 推送 Tag `v2.0.0`，但 `tauri.conf.json` 中仍为 `"version": "1.0.0"`。 | **Pass**：门禁脚本立即报错并终止流水线，明确提示版本号不匹配，杜绝“版本漂移包”产生。 |
| **AC-3** | **MSI 交付包完备性** | 从自动发布的 GitHub Release 下载 `.msi` 包并在无开发环境的 Windows 10/11 虚拟机中安装。 | **Pass**：正常弹出安装向导，安装后桌面生成有效快捷方式，双击流畅运行，通过任务管理器确认进程树正常，无环境缺失报错。 |
| **AC-4** | **Portable 免安装即用** | 从 Release 下载 `.zip` 便携包，解压至非系统盘（如 `D:\Tools\`），拔掉网线后直接双击主程序。 | **Pass**：无需任何安装步骤，正常拉起前端 UI 与后端计算 Sidecar，计算、3D 查看、Typst 计算书导出均 100% 成功。 |
| **AC-5** | **校验和防篡改** | 下载 Release 中的所有安装包与 `SHA256SUMS.txt`，在本地运行哈希校验命令。 | **Pass**：本地计算得出的散列值与 `SHA256SUMS.txt` 及 Release 页面展示的哈希值 100% 匹配。 |
| **AC-6** | **发布摘要与运行条件** | 检查生成的 GitHub Release 页面正文。 | **Pass**：自动准确提取包含当前版本更新细节，且完整渲染《运行条件与系统需求说明书》与《物料选型指南》，无乱码或空占位符。 |

---

## 七、 实施参考清单与配置蓝图 (Implementation Blueprints)

为支持后续 Builder 阶段的无缝实施，本方案提供关键组件的精确配置蓝图：

### 7.1 大版本检测与摘要提取脚本蓝图 (`scripts/ci/check-major-release.py`)
```python
# scripts/ci/check-major-release.py
import os
import re
import json
import sys
from pathlib import Path

# 强制重构 Windows 控制台标准输出为 UTF-8，防止 cp1252 编码异常
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def main():
    tag = os.environ.get("GITHUB_REF_NAME", "")
    print(f"[CI Gatekeeper] 当前触发 Tag: '{tag}'")

    # 1. 正则判定大版本 (Strict Major: vX.0.0 或 Milestone: vX.Y.0)
    major_pattern = r"^v([0-9]+)\.([0-9]+)\.0$"
    match = re.match(major_pattern, tag)
    if not match:
        print(f"[CI Gatekeeper] Tag '{tag}' 不符合大版本/里程碑发布命名规约 (^v[0-9]+\\.[0-9]+\\.0$)。")
        print(">> 阻断自动发布流水线（非大版本），避免非必要云端构建。")
        set_output("is_major", "false")
        sys.exit(0)

    version_number = tag.lstrip("v")
    print(f"[CI Gatekeeper] 匹配成功，大版本号: {version_number}")

    # 2. SSOT 版本强一致性双锁校验
    root = Path(__file__).resolve().parent.parent.parent
    tauri_conf = root / "tunnel-drainage-platform" / "frontend" / "src-tauri" / "tauri.conf.json"
    if tauri_conf.exists():
        with open(tauri_conf, "r", encoding="utf-8") as f:
            data = json.load(f)
            conf_ver = data.get("version", "")
            if conf_ver != version_number:
                print(f"[ERROR] tauri.conf.json 版本号 ({conf_ver}) 与 Tag 版本 ({version_number}) 不一致！")
                sys.exit(1)
            print(f"[CI Gatekeeper] tauri.conf.json 版本核验通过: {conf_ver}")

    package_json = root / "tunnel-drainage-platform" / "frontend" / "package.json"
    if package_json.exists():
        with open(package_json, "r", encoding="utf-8") as f:
            pkg_data = json.load(f)
            pkg_ver = pkg_data.get("version", "")
            if pkg_ver != version_number:
                print(f"[ERROR] package.json 版本号 ({pkg_ver}) 与 Tag 版本 ({version_number}) 不一致！")
                sys.exit(1)
            print(f"[CI Gatekeeper] package.json 版本核验通过: {pkg_ver}")

    # 3. 提取 CHANGELOG.md 对应版本说明
    changelog_file = root / "CHANGELOG.md"
    extracted_notes = ""
    if changelog_file.exists():
        with open(changelog_file, "r", encoding="utf-8") as f:
            lines = f.readlines()
        in_target_version = False
        notes_lines = []
        for line in lines:
            if re.match(rf"^##\s*\[?v?{re.escape(version_number)}\]?", line):
                in_target_version = True
                continue
            elif in_target_version and line.startswith("## "):
                break
            if in_target_version:
                notes_lines.append(line)
        extracted_notes = "".join(notes_lines).strip()

    if not extracted_notes:
        extracted_notes = f"## 隧道工程自适应平台 {tag} 里程碑版本正式发布。\n\n详见工程提交历史与技术文档。"

    # 将提取的更新说明写入临时文件供后续步骤读取
    notes_path = root / "release_notes.md"
    with open(notes_path, "w", encoding="utf-8") as f:
        f.write(extracted_notes)

    set_output("is_major", "true")
    set_output("version", version_number)
    print(f"[CI Gatekeeper] 门禁通过！准备流转至深度构建流程。")

def set_output(name, value):
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as f:
            f.write(f"{name}={value}\n")
    else:
        print(f"[OUTPUT] {name}={value}")

if __name__ == "__main__":
    main()
```

### 7.2 GitHub Actions 核心流程定义蓝图 (`.github/workflows/release-desktop.yml`)
```yaml
# .github/workflows/release-desktop.yml
name: 桌面独立 GUI 自动化发版流水线 (Desktop Release)

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

env:
  PYTHONIOENCODING: utf-8
  PYTHONUTF8: "1"

jobs:
  gatekeeper:
    name: 验证大版本门禁与提取更新摘要
    runs-on: windows-latest
    outputs:
      is_major: ${{ steps.check.outputs.is_major }}
      version: ${{ steps.check.outputs.version }}
    steps:
      - name: 检出源码
        uses: actions/checkout@v4

      - name: 初始化 Python 环境
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'

      - name: 执行大版本判定门禁
        id: check
        run: python scripts/ci/check-major-release.py

      - name: 暂存 Release Notes 物料
        if: steps.check.outputs.is_major == 'true'
        uses: actions/upload-artifact@v4
        with:
          name: release-notes
          path: release_notes.md
          retention-days: 1

  build-desktop-release:
    name: 构建 Windows x64 MSI 与 Portable 交付包
    needs: gatekeeper
    if: needs.gatekeeper.outputs.is_major == 'true'
    runs-on: windows-latest

    steps:
      - name: 检出源码
        uses: actions/checkout@v4

      - name: 下载 Release Notes 资产
        uses: actions/download-artifact@v4
        with:
          name: release-notes

      - name: 配置 Python 环境与缓存
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'
          cache: 'pip'
          cache-dependency-path: 'tunnel-drainage-platform/backend/requirements.txt'

      - name: 配置 Node.js 环境与缓存
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: 'tunnel-drainage-platform/frontend/package-lock.json'

      - name: 配置 Rust 稳定版工具链
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: x86_64-pc-windows-msvc

      - name: 配置 Rust Cargo 缓存
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/bin/
            ~/.cargo/registry/index/
            ~/.cargo/registry/cache/
            ~/.cargo/git/db/
            tunnel-drainage-platform/frontend/src-tauri/target/
          key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
          restore-keys: |
            ${{ runner.os }}-cargo-

      - name: 编译自包含 Python 后端 Sidecar
        shell: pwsh
        run: |
          cd tunnel-drainage-platform/backend
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install pyinstaller
          pyinstaller packaging/sidecar.spec --distpath dist --workpath build -y

      - name: 注入 Sidecar 二进制至 Tauri 桥接目录
        shell: pwsh
        run: |
          $Sidecar = "tunnel-drainage-platform/backend/dist/tunnel-backend-sidecar.exe"
          $TargetDir = "tunnel-drainage-platform/frontend/src-tauri/binaries"
          if (!(Test-Path $TargetDir)) { New-Item -ItemType Directory -Path $TargetDir -Force }
          Copy-Item $Sidecar (Join-Path $TargetDir "tunnel-backend-sidecar.exe") -Force
          Copy-Item $Sidecar (Join-Path $TargetDir "tunnel-backend-sidecar-x86_64-pc-windows-msvc.exe") -Force

      - name: 构建前端 SPA 静态生产资产
        shell: pwsh
        run: |
          cd tunnel-drainage-platform/frontend
          npm ci
          npm run build

      - name: 执行 Tauri 2.0 原生构建 (MSI Bundle)
        shell: pwsh
        run: |
          cd tunnel-drainage-platform/frontend
          npx tauri build --bundles msi

      - name: 归集发布物料与制作绿色便携版
        shell: pwsh
        run: |
          $Version = "${{ needs.gatekeeper.outputs.version }}"
          $OutDir = "dist-release"
          New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
          
          # 1. 归集 MSI
          $MsiFiles = Get-ChildItem -Path "tunnel-drainage-platform/frontend/src-tauri/target/release/bundle/msi" -Filter "*.msi" -Recurse
          if ($MsiFiles -and $MsiFiles.Count -gt 0) {
              $FinalMsi = "$OutDir/TunnelDrainagePlatform-v$Version-x64.msi"
              Copy-Item $MsiFiles[0].FullName $FinalMsi -Force
              Write-Host "已成功归集 MSI: $FinalMsi"
          } else {
              throw "未在 bundle/msi 目录中检测到构建出的 MSI 安装包！"
          }
          
          # 2. 组装 Portable 版 (容错兼容 Cargo 下划线与 PascalCase 命名)
          $PortableDir = "$OutDir/TunnelDrainagePlatform-Portable"
          New-Item -ItemType Directory -Path $PortableDir -Force | Out-Null
          
          $TargetReleaseBin = "tunnel-drainage-platform/frontend/src-tauri/target/release/tunnel_drainage_platform.exe"
          if (!(Test-Path $TargetReleaseBin)) {
              $TargetReleaseBin = "tunnel-drainage-platform/frontend/src-tauri/target/release/TunnelDrainagePlatform.exe"
          }
          if (!(Test-Path $TargetReleaseBin)) {
              throw "未在 target/release 中找到编译出的桌面端二进制！"
          }
          
          Copy-Item $TargetReleaseBin "$PortableDir/TunnelDrainagePlatform.exe" -Force
          Copy-Item "tunnel-drainage-platform/backend/dist/tunnel-backend-sidecar.exe" "$PortableDir/tunnel-backend-sidecar.exe" -Force
          
          $FinalZip = "$OutDir/TunnelDrainagePlatform-v$Version-x64-Portable.zip"
          Compress-Archive -Path "$PortableDir/*" -DestinationPath $FinalZip -Force
          Remove-Item $PortableDir -Recurse -Force

          # 3. 计算 SHA256SUMS.txt
          $Hashes = @()
          Get-ChildItem -Path $OutDir -File | ForEach-Object {
              $h = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
              $Hashes += "$h  $($_.Name)"
          }
          $Hashes | Out-File -FilePath "$OutDir/SHA256SUMS.txt" -Encoding utf8

      - name: 组装动态 Release 公告文案
        shell: pwsh
        run: |
          $Notes = Get-Content -Path "release_notes.md" -Raw -Encoding utf8
          $Sums = Get-Content -Path "dist-release/SHA256SUMS.txt" -Raw -Encoding utf8
          $Version = "${{ needs.gatekeeper.outputs.version }}"
          
          $BodyLines = @(
              "# 🚀 隧道工程多维协同智能排水自适应平台 - v$Version 正式发布",
              "",
              "本版本为平台里程碑式大版本更新，正式交付桌面自包含独立发行包。",
              "",
              "---",
              "",
              "## 📋 本次大版本核心更新摘要",
              $Notes,
              "",
              "---",
              "",
              "## 💻 运行条件与系统需求说明",
              "- **操作系统**：Windows 10 x64 (版本 1809+) 或 Windows 11 x64（不支持 32 位系统）",
              "- **Web 引擎**：Microsoft Edge WebView2 Evergreen 运行时（Win11 自带，Win10 需确保存在）",
              "- **硬件规格**：建议 4 核 CPU，8GB 内存，具备基础 WebGL 2.0 图形渲染能力",
              "- **网络要求**：**完全断网单机可用**（仅需本地回环 127.0.0.1 通信，无外部联网需求）",
              "- **依赖免除**：**无需配置 Python、Node.js 或数据库**，双击即启动",
              "",
              "---",
              "",
              "## 📦 交付物料选型与安装指导",
              "- **``TunnelDrainagePlatform-v$Version-x64.msi``**：Windows 标准安装包，适合设计院办公 PC 与企业集中静默部署。",
              "- **``TunnelDrainagePlatform-v$Version-x64-Portable.zip``**：绿色便携版，解压即用，适合野外勘测与工控单机。",
              "",
              "---",
              "",
              "## 🔒 安全散列校验和 (SHA-256)",
              "````",
              $Sums,
              "````"
          )
          $BodyLines -join "`n" | Out-File -FilePath "FINAL_RELEASE_BODY.md" -Encoding utf8

      - name: 发布至 GitHub Releases
        uses: softprops/action-gh-release@v2
        with:
          body_path: FINAL_RELEASE_BODY.md
          files: |
            dist-release/*.msi
            dist-release/*.zip
            dist-release/SHA256SUMS.txt
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 八、 后续迭代发版标准操作手册 (Developer Operation Guide / SOP)

在后续的产品迭代与功能演进中，若需要触发 GitHub Actions 自动化编译并发布全新的 Windows 桌面交付包（MSI 与 Portable），开发者只需遵循以下标准化操作步骤：

### 8.1 发版极简四步操作流 (The 4-Step Release Flow)

```
[步骤 1: 确定大版本号] ──> [步骤 2: 对齐版本元数据] ──> [步骤 3: 编写更新日志] ──> [步骤 4: 推送 Git Tag]
      (vX.Y.0)               (tauri & package)           (CHANGELOG.md)         (触发自动构建发版)
```

---

### 8.2 详细实操操作规范 (Step-by-Step Execution)

#### 步骤一：确认版本类型与版本号
- 平台 CI 门禁设置了**大版本/功能里程碑拦截锁**，仅放行末位为 `0` 的版本：
  - **跨代大版本 (Major)**：`v2.0.0`, `v3.0.0`（包含架构重构、计算内核升级或破坏性改动）；
  - **关键功能里程碑 (Milestone)**：`v1.1.0`, `v1.2.0`（包含重大新功能交付，如新增图表模块、新标准计算规范）；
  - **注意**：形如 `v1.0.1`（小修补丁）或 `v1.1.0-beta`（预发布）将被 Gatekeeper 自动识别并安全熔断，**不会**触发耗时的打包流水线。

#### 步骤二：同步修改代码库两处版本元数据 (SSOT 双锁)
在提交代码前，必须确保前端工程与桌面配置的版本号严格对齐至目标版本（假设本次发布 `v1.1.0`）：
1. 修改 `tunnel-drainage-platform/frontend/src-tauri/tauri.conf.json`：
   ```json
   "version": "1.1.0"
   ```
2. 修改 `tunnel-drainage-platform/frontend/package.json`：
   ```json
   "version": "1.1.0"
   ```
3. *(推荐协同修改)* `tunnel-drainage-platform/frontend/src-tauri/Cargo.toml`：
   ```toml
   version = "1.1.0"
   ```

#### 步骤三：在 `CHANGELOG.md` 中记录本次版本更新摘要
在根目录 [CHANGELOG.md](file:///d:/offices/Github/隧道工程多维协同智能排水自适应平台/CHANGELOG.md) 的顶部追加当前版本的更新日志块（**CI 门禁会自动提取此段落并注入至 GitHub Release 页面正文**）：
```markdown
## [1.1.0] - 2026-10-01

### Added
- 新增长里程多工况自动批量求解加速模块。
- 3D 衬砌应力探针增加主应力矢量动态切向指示器。

### Changed
- 优化了数值解算内存池分配，单断面计算耗时降低 20%。

### Fixed
- 修复了极端大偏心受压工况下截面开裂验算偶发死锁问题。
```

#### 步骤四：提交代码并推送 Git Tag 触发自动发版
在本地终端（PowerShell 或 Git Bash）中依次执行以下命令：

```powershell
# 1. 提交元数据与更新日志修改至主分支
git add .
git commit -m "chore(release): bump version to v1.1.0 and update changelog"
git push origin main

# 2. 本地创建符合语义规范的大版本 Git Tag
git tag v1.1.0

# 3. 将 Tag 推送到远程 GitHub 仓库 (此操作将立即唤醒 GitHub CI 流水线)
git push origin v1.1.0
```

---

### 8.3 云端发版生命周期与状态观测

当推送 Tag 成功后，无需人工介入，GitHub 将按以下生命周期自动运转：

1. **观察流水线状态**：
   - 打开 GitHub 仓库页面，点击顶部 **Actions** 选项卡；
   - 可以看到正在运行的流水线：`桌面独立 GUI 自动化发版流水线 (Desktop Release)`；
2. **Phase 1: Gatekeeper 阶段（耗时 ~20秒）**：
   - 自动运行 `scripts/ci/check-major-release.py`；
   - 检查通过后打印 `[CI Gatekeeper] 门禁全部放行 (PASS)！`，流转至构建阶段；
3. **Phase 2: Build & Release 阶段（耗时 ~15分钟）**：
   - Windows 虚拟化 Runner 自动安装 Python、Node 与 Rust 依赖；
   - PyInstaller 固化后端 Sidecar；
   - Tauri 编译生成企业级 `TunnelDrainagePlatform-v1.1.0-x64.msi`；
   - PowerShell 压缩组装绿色便携版 `TunnelDrainagePlatform-v1.1.0-x64-Portable.zip`；
   - 计算 SHA-256 哈希清单；
4. **发版成果验收**：
   - 构建成功后，访问 GitHub 仓库的 **Releases** 页面；
   - 自动生成标有 `Latest` 的正式 Release：
     - 正文自动包含您在 `CHANGELOG.md` 编写的更新摘要；
     - 正文自动附带完整的《运行条件与系统需求说明》；
     - 附件列表自动挂载 `.msi` 安装包、`.zip` 便携包以及 `SHA256SUMS.txt` 校验清单。

---

### 8.4 异常排查与常见问题速查 (Troubleshooting)

| 异常现象 | 核心诱因 | 解决方案 |
| :--- | :--- | :--- |
| **推送了 Tag 但 Actions 列表没有触发工作流** | 1. Tag 格式未以 `v` 开头（如打成了 `1.1.0`）；<br>2. 仅在本地打 Tag 未执行 `git push origin <tag>`。 | 重新打标带有 `v` 前缀的 Tag（如 `git tag v1.1.0`）并显式推送到远程。 |
| **Gatekeeper 门禁报红色错误退出** | 1. `tauri.conf.json` 或 `package.json` 中的 `version` 与 Tag 不一致；<br>2. 推送的是小修补丁（如 `v1.1.1`，被自动熔断拦截）。 | 1. 检查各配置文件的 `version` 字段，确保与 Tag 一致；<br>2. 如需发大版本，确保版本号末位为 `0`。 |
| **Release 页面正文显示“采用兜底发布声明”** | `CHANGELOG.md` 中缺少对应版本的一级/二级标题匹配项。 | 检查 `CHANGELOG.md`，确保标题格式为 `## [1.1.0]` 或 `## 1.1.0`。 |
| **误打 Tag 需要撤销重发** | 本地或远程 Tag 打错需要清理重建。 | 运行以下命令撤销远程与本地 Tag：<br>`git tag -d v1.1.0`<br>`git push origin :refs/tags/v1.1.0` |

