<!-- doc/wiki_staging/Release-Notes-v1.1.0.md -->
> [!NOTE]
> **工程状态提示**：本文档由主仓库过程技术记录自动归档生成（原始文件名：`docs/releases/Release-Notes-v1.1.0.md`）。若需查验最新架构基准与使用手册，请查阅系统主文档。

# Release Notes - v1.1.0 (2026-10-26)

## 📌 版本概述 (Overview)
`v1.1.0` 是隧道工程多维协同智能排水自适应平台的重大里程碑升级。本版本全面深化了 **3D 数字化孪生视口交互**（多级图层树、分段独占聚焦模式、结构最不利应力探针），实现了 **A3 施工图纸高保真矢量化实时预览** 与导出几何一致性对齐，上线了保障关键工程参数安全的 **轻量一次性认证防护体系 (OTP)**，并正式建立了覆盖 Tauri 桌面端跨平台安装包与 GitHub Wiki 自动化的 **全自动 CI/CD 交付矩阵**。

---

## 🚀 核心特性与功能增强 (Key Features & Enhancements)

### 1. 3D 多维数字孪生深化与图层树联动 (3D Digital Twin & Layer Management)
- **多级联动图层树**：支持对隧道衬砌（二衬/初支/路面水沟槽）、防水设计加固圈（初始注浆圈 $r_g$ 与设计临界注浆圈 $t_{g,crit}$）、排水管网及参数标注、水文粒子与流线进行树形分级控制，支持半选（Indeterminate）状态联动与总控操作。
- **独占聚焦排他模式 (Exclusive Focus Mode)**：支持按标段、施工段在三维视口中进行单段聚焦高亮，非焦点段自适应半透弱化并降低 GPU 算力负荷，彻底解决多环段大场景在视口中的空间遮挡与视线干扰问题。
- **关键受力探针诊断体系 (Critical Stress Probe)**：集成环向偏心受压最大应力与弯矩极值探针标注，支持视口自适应截面标注放大镜，实时透视结构安全性指标。

### 2. A3 施工图设计图纸矢量化实时预览 (Vector Blueprint Preview)
- **施工蓝图高精度矢量预览**：新增 `BlueprintPreviewModal` 交互组件，支持对隧道横纵断面、防排水管网拓扑与几何参数进行无级平滑缩放、漫游与视口复位。
- **所见即所得导出一致性**：彻底打通前端 Canvas/SVG 几何渲染管线与后端工程出图内核，确保屏幕预览图纸与导出的 A3 规范施工图（PDF/CAD）保持一致。

### 3. 工况快照中枢与科技蓝侧边栏 (Snapshot Central & Industrial Sidebar)
- **科技蓝工业质感重构**：全面重构 `SnapshotSidebar`，采用深色毛玻璃、发光状态指示与紧凑卡片排版。
- **全生命周期工况管理**：支持工况快速抓取、快照标签自定义、多方案横向差异比对与一键回放还原。

---

## 🔒 安全加固与敏感防护 (Security Architecture)
- **轻量一次性动态认证网关 (OTP Protection)**：
  - 新增 `AuthDialog` 与 `authStore` 前后端协同鉴权机制。
  - 对“覆盖已有关键工况”、“全局重置排水计算参数”等高风险操作强制触发一次性动态凭证拦截，杜绝误触与未授权篡改。
- **工程资产纯净化与环境防护**：
  - 全面剔除历史提交中残留的 Python `*.pycache` 等二进制垃圾资产。
  - 完善全栈 `.gitignore` 与 `.gitattributes`，确保存储库体积精简与跨平台文本换行符一致性。

---

## 🐳 基础设施、容器与自动化构建 (Infrastructure & Delivery)
- **GitHub Actions 桌面端全自动发版流水线**：
  - 新增 `.github/workflows/release-desktop.yml`，实现基于 Git Tag 自动触发 Tauri 桌面应用（MSI 安装包与 Portable 便携版）的编译打包与签名，并在 GitHub Release 自动发布。
- **Wiki 知识库全自动编目流水线**：
  - 新增 `.github/workflows/sync-wiki.yml`，支持从 `doc/wiki_staging/` 自动清洗并同步更新项目 GitHub Wiki 知识库。
- **Docker 生产级服务化部署套件**：
  - 新增 `build-server.ps1`、`deploy-docker.ps1` 与 `docker-compose.prod.yml`，规范环境变量与镜像分发。

---

## 🎨 UI 与工程人体工效学规范 (Design & Typography)
- **字阶生理底线合规**：全面排查并重构全站样式，消除了非标小于 12px 的过小文字（如 10px、11px），全量提升至 `font-size >= 12px` 并优化字距行高，保障工程人员在现场高分辨率屏幕下的阅读舒适度。
- **三维场景视觉去杂**：前端主动隐匿隔离大面积地表土层遮挡物，确保视线聚焦于地下隧道衬砌与水流场微观动力学演变。

---

## ⚠️ 升级指南与兼容性说明 (Migration & Breaking Changes)
- **完全平滑升级**：本版本完全向后兼容 `v1.0.0` 数据库与计算模型，无破坏性数据模型变更。
- **敏感操作须知**：在执行工况覆盖与批量参数重置时，界面将弹出动态认证窗口，输入指定安全口令后即可无感继续执行。

---

## 📚 关联发布资产与发布命令

### GitHub CLI 一键发布命令：
```bash
# 1. 提交当前修改并打上语义化标签
git add .
git commit -m "chore(release): bump version to v1.1.0"
git tag -a v1.1.0 -m "Release v1.1.0: 3D Digital Twin, Vector Blueprints & CI/CD Pipeline"
git push origin master --tags

# 2. 通过 GitHub CLI 创建 Release 并附带发布说明
gh release create v1.1.0 ./docs/releases/Release-Notes-v1.1.0.md -R TREYWANGCQU/on-a-Drainage-Adaptive-Platform --title "v1.1.0 - 3D数字孪生深化、施工图矢量化与CI/CD交付体系"
```
