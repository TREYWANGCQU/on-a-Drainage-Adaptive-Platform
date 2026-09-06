# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
