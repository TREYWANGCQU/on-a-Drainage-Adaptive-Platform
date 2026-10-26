> [!NOTE]
> **工程状态提示**：本文档由主仓库过程技术记录自动归档生成（原始文件名：`CHANGELOG.md`）。若需查验最新架构基准与使用手册，请查阅系统主文档。

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-26

### Added
- **3D 多维数字孪生深化与图层树联动 (3D Digital Twin & Layer Management)**：
  - 引入图层树分级联动控制体系，实现二衬/初支/路面水沟槽、注浆加固圈（初始注浆与设计临界注浆）、排水管网标注及水文环境粒子的多级树形受控与半选联动。
  - 新增分段独占聚焦排他模式（Exclusive Focus Mode），支持高亮目标施工段并自适应弱化非焦点段，显著降低大场景 GPU 算力负荷与视觉干扰。
  - 引入三心圆结构环向最大主应力与弯矩极值探针（Critical Stress Probe）诊断体系与自适应标注放大镜。
- **A3 施工图设计图纸实时矢量化预览 (Vector Blueprint Preview)**：
  - 新增 `BlueprintPreviewModal` 矢量图纸预览组件，支持横/纵断面、排水盲沟与水力暗管参数标注在前端画布中高精度矢量缩放与漫游。
  - 实现图纸预览与后端 PDF/CAD 几何生成逻辑的一致性对齐，杜绝图纸导出偏差。
- **轻量一次性认证与敏感操作防护网关 (One-Time Authentication & Security Gateway)**：
  - 新增 `AuthDialog` 与 `authStore` 前后端安全协同组件，对敏感工况覆盖、关键参数重置等高危操作实施一次性动态凭证（OTP）校验与拦截。
- **工况快照中枢与科技蓝侧边栏 (Snapshot Central & Industrial Sidebar)**：
  - 重构 `SnapshotSidebar`，采用工业科技蓝深色毛玻璃交互规范，支持多工况快照实时比对、历史工况回放与持久化。
- **多工况批量调度引擎与智能监控看板 (Batch Scheduler & Dashboard)**：
  - 新增 `batchScheduler` 异步批量调度器，联动综合看板与数字资产库，支持百级工况并行解算与状态监控。
- **桌面端全自动 CI/CD 与知识库流水线 (Desktop CI/CD & Wiki Automation)**：
  - 新增 `.github/workflows/release-desktop.yml`，打通 GitHub Tag 驱动的 Tauri 桌面端全自动构建、MSI 企业安装包生成与 SHA-256 签名清单生成。
  - 新增 `.github/workflows/sync-wiki.yml`，实现开发文档与 GitHub Wiki 的全自动双向同步编目。
  - 完善 Docker 服务器版本地与生产构建脚本（`build-server.ps1`, `deploy-docker.ps1`）。

### Changed
- 全面重构前端字阶体系，严格落实 `font-size >= 12px` 生理底线标准，消除微小字体造成的视觉模糊与疲劳。
- 前端三维视口优化：隔离隐藏地面/地表遮挡物，确保隧道衬砌、管网与加固圈构造始终处于清晰视线内。

### Security
- 敏感计算参数接口增加二次身份校验网关，杜绝未授权批量覆写。
- 清除历史跟踪的 Python `__pycache__` 二进制垃圾文件，建立严格的 `.gitignore` 与安全发布基线。

## [1.0.0] - 2026-09-06

### Added
- **双模式系统交付架构 (Dual-Mode Delivery Architecture)**：
  - **服务器协作模式 (Server/Web)**：基于 Docker/Nginx 反向代理容器化拓扑，支持工程指挥部及多终端并发协同解算。
  - **桌面独立 GUI 模式 (Desktop Standalone GUI)**：基于 Tauri 2.0 原生轻量容器封装，内嵌 PyInstaller 自包含后端 Sidecar 与轻量 SQLite。实现**零 Python、零 Node.js、零数据库安装、完全离线断网可用**。
- **水动力-结构力学耦合计算内核 (Hydro-Mechanical Solver Engine)**：
  - SCS-CN 水文降雨产流与渗流达西流动模型解算。
  - 衬砌结构 24 单元偏心受压极限状态解算与最不利受力探针。
  - 临界注浆加固圈厚度自适应优化搜索算法。
- **3D 多维数字孪生与工程协同看板 (3D Digital Twin & Visualization)**：
  - 基于 Three.js 的三心圆隧道衬砌、排水盲沟与水力管网拓扑装配渲染。
  - 衬砌偏心受压环向应力伪彩云图、自适应剖切面交互与两通/三通标注放大镜。
- **工程级交付物自动生成引擎 (Engineering Deliverables Engine)**：
  - **Typst 纯矢量工程计算书**：集成 Typst 科技排版引擎，支持 A4 高保真公式、表格渲染与多标段计算书批量 ZIP 归档。
  - **A3 数字化施工设计蓝图**：一键直出满足铁道工程行业规范的参数化矢量施工设计图。
- **系统稳健性与生命周期守护 (Process Lifecycle & Reliability)**：
  - Win32 Job Object 硬件级父子进程绑定，彻底杜绝孤儿进程占用后台资源。
  - 动态回环端口探测协议（18000~18999 范围自适应抢占），彻底免疫端口冲突。
- **CI/CD 自动化发版流水线 (Automated Release Pipeline)**：
  - GitHub Actions 自动化构建 AMD64 MSI 企业安装包与 Portable 绿色免安装包。
  - 自动化版本门禁、CHANGELOG 摘要截取与 SHA-256 安全散列清单生成。

### Changed
- 统一前端通信适配层 `adapter.ts`，自适应感知 Web 环境与桌面本地回环动态端口。
- 重构全系统发布物料目录拓扑，解耦开发工程源码与发布分发制品。

### Security
- 本地 Sidecar 通信引入随机会话口令（UUID4），杜绝本地未授权进程跨端口非法调用。
- 发布资产全量附带 SHA-256 校验和防篡改清单。
