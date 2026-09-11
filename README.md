<!-- README.md -->

# 隧道工程多维协同智能排水自适应平台

<p align="center">
  <strong>面向复杂特长水工隧道的自适应防排水数值计算、3D 数字孪生与数字化交付平台</strong>
</p>

<p align="center">
  <a href="https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/releases/tag/v1.0.0"><img src="https://img.shields.io/badge/Release-v1.0.0-blue.svg?style=flat-square" alt="Version"></a>
  <a href="https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/wiki"><img src="https://img.shields.io/badge/Wiki-Knowledge%20Base-success.svg?style=flat-square" alt="Wiki Knowledge Base"></a>
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/Backend-FastAPI%20%7C%20Python%203.10+-3776AB.svg?style=flat-square" alt="Backend"></a>
  <a href="https://vuejs.org/"><img src="https://img.shields.io/badge/Frontend-Vue%203.5%20%7C%20TypeScript-4FC08D.svg?style=flat-square" alt="Frontend"></a>
  <a href="https://tauri.app/"><img src="https://img.shields.io/badge/Desktop-Tauri%202.0-FFC131.svg?style=flat-square" alt="Desktop"></a>
  <a href="https://typst.app/"><img src="https://img.shields.io/badge/DocEngine-Typst%200.11+-239DAD.svg?style=flat-square" alt="Typst"></a>
</p>

---

## 目录

- [一、 项目定位与工程挑战](#一-项目定位与工程挑战)
- [二、 系统架构与双轨交付拓扑](#二-系统架构与双轨交付拓扑)
- [三、 核心引擎与微观能力矩阵](#三-核心引擎与微观能力矩阵)
- [四、 快速上手与部署指引](#四-快速上手与部署指引)
- [五、 知识库体系与文档全景导航](#五-知识库体系与文档全景导航)
- [六、 质量门禁与工程演进路径](#六-质量门禁与工程演进路径)

---

## 一、 项目定位与工程挑战

在富水破碎带、高外水压力等复杂地质条件下的特长隧道施工与运营过程中，地下水排放系统的合理性直接决定了结构安全与工程造价。传统工程实践中存在三类割裂现象：

1. **水动力解算与结构力学校验脱节**：渗流场达西流速计算与支护衬砌偏心受压校核依赖不同专业软件，参数传递容易产生断层；
2. **空间拓扑表达局限于离散图纸**：环向盲沟、纵向盲沟、中间排水沟与横向引水管的空间碰撞难以通过传统 2D CAD 及时发现；
3. **现场实施环境受限**：野外勘测与洞内施工常处于无网络或涉密单机状态，而常规 Web 数字化系统依赖外部网络与复杂服务端环境，难以直接部署到工区便携电脑。

本平台遵循**“解算内核标准化、空间呈现三维化、交付形态双轨化”**的建设目标，将水动力学公式推演、衬砌 24 单元偏心受压极限状态验算、Three.js 数字孪生装配、Typst 纯矢量工程计算书直出与 A3 参数化施工蓝图生成聚合为一体化工具链。

---

## 二、 系统架构与双轨交付拓扑

平台采用前后端分离与模块化装配规范，通过统一数据契约保障业务逻辑与渲染表现解耦。系统提供两种交付形态，覆盖从野外单兵作业到指挥中心协同的完整场景：

```
                                    +-----------------------------------------+
                                    |     统一前端表现层 (Vue 3.5 + Three.js)    |
                                    +-----------------------------------------+
                                                         |
                                    +-----------------------------------------+
                                    |  网络适配层 (Unified Transport Adapter)   |
                                    +-----------------------------------------+
                                           /                           \
                                          /                             \
                [分支 A: 桌面独立 GUI 模式]                               [分支 B: 服务器协作模式]
                                        /                                 \
            +------------------------------------+             +------------------------------------+
            | Tauri 2.0 原生轻量容器 (Windows x64)|             | 容器编排层 (Docker Compose + Nginx)|
            |  - Win32 Job Object 进程生命周期守护 |             |  - 动静分离与 SSL 反向代理         |
            |  - 18000~18999 回环动态端口安全探测 |             |  - 多 Worker 高并发进程池          |
            +------------------------------------+             +------------------------------------+
                            |                                                    |
            +------------------------------------+             +------------------------------------+
            | 本地嵌入式 Sidecar 引擎             |             | 集中式后端服务集群                  |
            |  - PyInstaller 自包含二进制运行时   |             |  - FastAPI (Python 3.10+)          |
            |  - 本地 SQLite (WAL 高并发模式)    |             |  - 共享挂载存储与持久化数据库      |
            |  - 本地内嵌 Typst 0.11+ 编译器     |             |  - 集中式 Typst 矢量排版容器       |
            +------------------------------------+             +------------------------------------+
```

### 2.1 交付模式机制对比

| 评价维度 | 桌面独立 GUI 模式 (*Standalone Desktop*) | 服务器协作模式 (*Server / Web*) |
| :--- | :--- | :--- |
| **典型应用场景** | 施工洞口现场、野外勘探勘测、离线涉密作业、单兵便携电脑 | 局域网协同设计、指挥中心监控大屏、跨工区多终端远程接入 |
| **宿主容器框架** | Tauri 2.0 (Rust 原生内核 + 系统内置 WebView2) | Docker 24.0+ 容器集群 + Nginx 动静分离 |
| **外部运行依赖** | **零依赖**：免装 Python、免装 Node.js、免装数据库环境 | 宿主机支持 Docker Engine 与 Docker Compose，客户端仅需现代浏览器 |
| **端口与网络安全** | 动态抢占 `18000~18999` 闲置端口，基于 UUID4 随机会话口令鉴权 | 映射标准外网服务端口（默认 `80/443` 或自定义 `8080`），支持网络防火墙隔离 |
| **进程守护机制** | Win32 Job Object 硬件级绑定，主窗口退出触发子进程强制级联销毁 | Docker 守护进程管理与 `--restart unless-stopped` 自动健康复位 |
| **分发资产形态** | `.exe` 安装向导、`.msi` 企业静默包、`.zip` 绿色免安装包 | `docker-compose.yml` 编排包、标准镜像压缩归档 (`.tar.gz`) |

---

## 三、 核心引擎与微观能力矩阵

### 3.1 水动力与围岩力学解算内核
- **降雨与渗流解算**：集成 SCS-CN 水文降雨产流模型与达西稳定渗流理论，解算不同降雨重现期下洞身围岩裂隙涌水量；
- **24 单元极限状态校核**：依据铁道隧道设计规范，对衬砌全环 24 个控制截面执行轴力、弯矩、偏心距及抗裂抗剪极限承载力推演；
- **最不利受力探针追踪**：计算引擎自适应扫描全环应力极值点，自动捕获偏心距最大截面并高亮显示；
- **自适应注浆圈反演**：依据容许地下水排放限值与排水盲沟过流能力，反向求解临界注浆加固圈厚度与渗透系数控制指标。

### 3.2 3D 数字孪生与空间装配看板
- **参数化三心圆几何建模**：基于 Three.js 实现根据开挖跨度、拱高、曲率半径等参数实时构建隧道内轮廓与初支/二衬实体；
- **全要素管网拓扑协同**：空间装配环向盲沟、纵向排水管、沉砂井、横向导水管及路基中央排水沟，支持连通性高亮排查；
- **力学伪彩云图投射**：将 24 单元受力推演数据映射至 3D 几何网格表面，支持轴力、弯矩与安全系数伪彩色阶切变；
- **自由剖切与微观标注**：提供三维截面交互式剖切滑块，并配置关键节点两通/三通管件放大镜功能。

### 3.3 工程级交付物自动编译引擎
- **Typst 纯矢量工程计算书**：集成 Typst 科技排版引擎，将解算参数、推导公式、校核表格编译为印刷级 A4 PDF，支持多标段批量 ZIP 打包；
- **A3 数字化施工设计蓝图**：生成严格符合工程出图标准的尺寸标注图、衬砌横断面配筋示意图与排水沟纵坡剖面图；
- **快照台账与版本对比**：支持全工况输入参数与计算结果一键存照，并提供不同设计方案间的横向对比矩阵。

---

## 四、 快速上手与部署指引

### 4.1 方案 A：桌面独立客户端（推荐现场直接使用）

1. 前往项目 [GitHub Releases](https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/releases) 页面获取对应安装包；
2. 依据实际运行需求选择安装形式：
   - **安装向导版**：下载 `TunnelDrainagePlatform-v1.0.0-x64-Setup.exe`，按提示选择安装目录后完成启动；
   - **企业静默安装**：使用管理员权限执行 `msiexec /i TunnelDrainagePlatform-v1.0.0-x64.msi /quiet /norestart`；
   - **绿色便携版**：解压 `TunnelDrainagePlatform-v1.0.0-x64-Portable.zip` 至本地任意可写盘符，双击 `TunnelDrainagePlatform.exe` 即可运行；
3. 客户端启动时将自动分配本地回环端口并拉起后台解算引擎，无需手动干预。

### 4.2 方案 B：Docker 服务器版协同部署（推荐工区网络与指挥部使用）

```bash
# 1. 克隆代码仓库
git clone https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform.git
cd on-a-Drainage-Adaptive-Platform/tunnel-drainage-platform/deploy

# 2. 启动 Docker Compose 容器编排套件
docker compose up -d

# 3. 检查服务运行状态
docker compose ps
```
服务启动完成后，访问 `http://<服务器IP>:8080` 即可接入 Web 操作终端，API 接口文档自动发布于 `http://<服务器IP>:8000/docs`。

详细部署说明、环境检查清单与离线故障排查，请参阅：
- [系统双模式部署与使用说明书 (本地 Markdown)](docs/manuals/系统双模式部署与使用说明书.md)
- [系统双模式部署与使用说明书 (在线 Wiki)](https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/wiki/Manual-System-Deployment-Guide)

---

## 五、 知识库体系与文档全景导航

为确保工程事实一致性（Single Source of Truth），本项目建立了**阶段技术方案**、**运维手册**与 **GitHub Wiki 在线知识库**三位一体的文档治理体系。所有 Wiki 词条均由 GitHub Actions 流水线自动化同步发布。

### 5.1 核心阶段与专题知识索引

| 阶段划分 / 专业领域 | 核心专题内容 | 本地源码仓库相对路径 | GitHub Wiki 在线直达 |
| :--- | :--- | :--- | :--- |
| **全局部署与操作规范** | 桌面端与服务器端安装部署、端口机制、网络拓扑与故障排查手册 | [查看手册文档](docs/manuals/系统双模式部署与使用说明书.md) | [Manual-System-Deployment-Guide](https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/wiki/Manual-System-Deployment-Guide) |
| **阶段 0：顶层设计与规划** | 总体技术架构设计、模块边界划分、开发计划与里程碑基线 | [查看架构方案](docs/stages/stage0-planning/阶段0-工程总体技术架构.md)<br>[查看开发计划](docs/stages/stage0-planning/阶段0-工程开发计划.md) | [Phase0-System-Architecture](https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/wiki/Phase0-System-Architecture)<br>[Phase0-Development-Plan](https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/wiki/Phase0-Development-Plan) |
| **阶段 1：算法核心与基准** | 水动力计算引擎对比校验方案、输入参数全系统规范化对齐方案 | [查看校验方案](docs/stages/stage1-algorithm/阶段1-计算引擎对比校验方案.md)<br>[查看对齐方案](docs/stages/stage1-algorithm/阶段1-输入参数全系统更新与对齐方案.md) | [Phase1-Engine-Verification](https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/wiki/Phase1-Engine-Verification)<br>[Phase1-Input-Parameters-Alignment](https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/wiki/Phase1-Input-Parameters-Alignment) |
| **阶段 4：3D 可视化交互** | Three.js 场景渲染方案、3D 多维协同与对比看板设计规范 | [查看交互方案](docs/stages/stage4-3d-visual/core/阶段4-3D可视化交互工程方案.md)<br>[查看看板方案](docs/stages/stage4-3d-visual/core/阶段4-3D多维协同与对比看板优化方案.md) | [Phase4-3D-Visualization-Overview](https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/wiki/Phase4-3D-Visualization-Overview)<br>[Phase4-Multi-Dimension-Dashboard](https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/wiki/Phase4-Multi-Dimension-Dashboard) |
| **阶段 6：工程交付与流水线** | 双模式交付架构、GitHub Actions CI/CD 自动发版与 Wiki 自动化同步体系 | [查看交付架构](docs/stages/stage6-delivery/阶段6-服务器与桌面独立GUI双模式交付系统架构方案.md)<br>[查看流水线方案](docs/stages/stage6-delivery/阶段6-GitHub自动发布与大版本CI-CD流水线方案.md)<br>[查看Wiki同步方案](docs/stages/stage6-delivery/阶段6-GitHub-Wiki知识库体系化构建与自动化同步方案.md) | [Phase6-Dual-Mode-Delivery-Architecture](https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/wiki/Phase6-Dual-Mode-Delivery-Architecture)<br>[Phase6-GitHub-Release-Pipeline](https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/wiki/Phase6-GitHub-Release-Pipeline)<br>[Phase6-GitHub-Wiki-Automation-Scheme](https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/wiki/Phase6-GitHub-Wiki-Automation-Scheme) |
| **工程变更审计** | 平台版本发布记录、特性变更历史与安全补丁审计 | [查看变更日志](CHANGELOG.md) | [CHANGELOG 词条](https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/wiki/CHANGELOG) |

> 完整知识库包含 36 篇经审查的技术词条，建议直接访问 [GitHub Wiki 知识库主页](https://github.com/TREYWANGCQU/on-a-Drainage-Adaptive-Platform/wiki) 查阅侧边栏结构化大纲。

---

## 六、 质量门禁与工程演进路径

### 6.1 持续集成与交付验证（CI/CD）
平台配置了完整的 GitHub Actions 持续集成流水线，任何向 `main` 分支的提交与版本 Tag 均触发自动化门禁：
- **代码规范检查**：TypeScript 强类型推导校验与 Python 代码静态检查；
- **发布制品构建**：多架构桌面端安装包（Setup `.exe` / `.msi` / Portable `.zip`）自动编译签名；
- **数据完整性校验**：发布物料全量生成 SHA-256 散列值清单，防止分发过程文件损坏；
- **Wiki 知识库镜像**：监测 `doc/wiki_staging/` 变更，自动清洗并无缝部署至 Wiki 仓库。

### 6.2 下一步工程演进目标
1. **地质水文多场动态耦合**：引入三维非稳态渗流场与围岩时效流变模型，实现涌水演化过程的时间序列推演；
2. **边缘物联网智能自适应联动**：研发与洞内水泵阀门 PLC 控制系统对接的边缘网关驱动，实现从“被动校核设计”向“现场实时动态排水调控”拓展；
3. **国产操作系统适配**：基于现有 Tauri 2.0 基础，推进在统信 UOS 与银河麒麟 Linux 平台的二进制编译打包认证。

---

## 许可证与致谢

- 本项目遵循开源与学术研究协作规范。
