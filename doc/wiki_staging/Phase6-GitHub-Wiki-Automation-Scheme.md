<!-- 阶段6-GitHub-Wiki知识库体系化构建与自动化同步方案.md -->
# 阶段6-GitHub-Wiki知识库体系化构建与自动化同步方案

> **文档版本**：v2.0.0 (Curator-Integrated & Clean Root Architecture)  
> **文档状态**：Production Architecture & Operational Baseline (Approved with `/wiki-curator`)  
> **所属阶段**：阶段 6 - 工程化交付、知识沉淀与 CI/CD 体系建设  
> **适用范围**：隧道工程多维协同智能排水自适应平台全过程文档体系与 GitHub Wiki 知识库  
> **前置凭据基准**：`WIKI_SYNC_TOKEN` 已由开发者在仓库 GitHub Secrets 中完成配置并确认可用

---

## 1. 现状解构、痛点与演进目标 (Evolution & Problem Statement)

### 1.1 资产盘点与根目录污染现状
当前仓库根目录下积累了 **50+** 份关键文件，其中平铺的过程技术文档多达 **49 篇 Markdown + 3 篇 PDF 资产**：
- **阶段 0（顶层架构与规划）**：工程总体技术架构、开发计划、技术架构 PDF（3篇）。
- **阶段 1（环境、依赖与算法基准）**：Python 依赖排查、虚拟环境指南、前端初始化、参数全系统对齐、计算引擎对比校验、排水管网 3D 标注方案及临时草稿等（7篇）。
- **阶段 2（后端服务与测试）**：后端单元测试与 Debug 详细工程方案（1篇）。
- **阶段 3（数据底座与台账流转）**：数据库专项定义、脏数据标定治理、前端台账式表单流转（3篇）。
- **阶段 4（3D可视化、空间拓扑与专题攻坚）**：
  - 核心总体方案与核算：总体方案、多维协同看板、模型解算核算报告、模型对应关系修复、Agent 实现指南、Snapshot 特征标准（7篇）。
  - 9 大专项攻坚方案：中间排水沟自适应建模、Typst 计算书导出、快照 CAD 施工图自动生成、最不利受力探针随动、自适应顶栏检索、管网诊断等（9篇）。
  - 12 次微观迭代排查记录：从第 1 次至第 12 次迭代的零碎问题诊断与材质修复草稿（共 16 篇）。
- **阶段 6（工程交付与流水线）**：双模式交付架构、GitHub 自动发布流水线、DockerHub 镜像构建方案（3篇）。
- **全局系统手册与 Prompt 资产**：系统双模式部署与使用说明书、计算书 Prompt 工程资产（2篇）。

### 1.2 核心痛点与工程治理矛盾
1. **根目录平铺污染严重（Clean Workspace 诉求）**：
   - 近 50 篇历史过程文档堆积在项目根目录，造成工程入口极度混乱，协作者难以快速定位源码与核心规范。
   - 必须实施**零污染治理**：将全部原始过程文档归拢迁移至结构化的 `docs/stages/` 目录体系中，保持根目录仅保留标准工程文件（`README.md`、`CHANGELOG.md` 等）。
2. **纯自动化 vs 过程杂音（Garbage In, Garbage Out）**：
   - 原始文档中包含大量特定日期的微观调试记录（如阶段 4 的 12 次迭代），若 1:1 无脑推送到 Wiki，将严重降低公共知识库的信噪比。
3. **旧流水线在 CI 编译的缺陷（CI Fragility & Opacity）**：
   - 旧版方案设计由 GitHub Actions 在云端容器临时安装 Python 依赖并动态编译。这种方式存在三项硬伤：
     - **不可见性**：开发者在本地看不到将要发布的 Wiki 实际内容与排版差异；
     - **脆弱性**：CI 容器因 Python 环境或依赖安装偶发超时导致同步中断；
     - **权限越界**：GitHub 默认的 `GITHUB_TOKEN` 严禁跨库向 `.wiki.git` 执行 Push 操作（报 403 Forbidden）。

### 1.3 演进目标：全面迁移采用 `/wiki-curator` 规范
全面引入工程化通用智能编目技能 `/wiki-curator`，确立**「文档源结构化治理 + 本地智能编目 + 受控暂存区 (doc/wiki_staging/) + GitHub Actions 极速发布」**的终局架构：
- **凭据基准确定**：基于用户已配置的 `WIKI_SYNC_TOKEN`（具备 `repo` 权限），彻底打通跨仓库安全推送。
- **根目录彻底净化**：建立 `docs/stages/` 模块化目录树，全量迁移原始平铺文档，更新元数据调度清单。
- **双轨受控同步**：在本地完成编译与差异预览，CI 仅承担 30 秒无状态镜像同步，杜绝云端不确定性。

---

## 2. 根目录原始开发文档全量迁移与拓扑重构方案

### 2.1 目标目录拓扑设计
将根目录下全部 49 篇 Markdown 及相关资源迁移归位，形成清晰、严谨的工程文档目录树：

```
d:/offices/Github/隧道工程多维协同智能排水自适应平台/
├── .github/
│   └── workflows/
│       ├── wiki-sync.yml               # [已就绪] GitHub Wiki 持续同步流水线
│       └── release-desktop.yml         # 桌面端与大版本发布流水线
├── .gitattributes                      # 换行符保护：doc/wiki_staging/*.md text eol=lf
├── CHANGELOG.md                        # 工程变更日志
├── README.md                           # 仓库核心说明
├── doc/
│   └── wiki_staging/                   # [受控暂存区] 编译后即将发布至 Wiki 的扁平 Markdown 镜像
│       ├── Home.md                     # Wiki 门户主页
│       ├── _Sidebar.md                 # Wiki 多级折叠侧边栏
│       ├── _Footer.md                  # Wiki 页脚声明
│       └── *.md                        # 扁平命名的 Wiki 知识词条
├── docs/                               # 原始开发与工程文档根目录 ($DocsRoot)
│   ├── wiki-manifest.yml               # 知识库编排控制清单 (SSOT 调度规则)
│   ├── wiki/                           # [局部人工精修区] 高质量覆写文档 (如 12次迭代复盘)
│   │   └── Phase4-Evolution-Summary.md
│   ├── manuals/                        # 系统交付与用户手册
│   │   └── 系统双模式部署与使用说明书.md
│   ├── prompts/                        # 计算书与参数 Prompt 工程资产
│   │   └── prompt-calculate.md
│   ├── ref_assets/                     # 历史参考架构与批注 PDF 资产
│   │   ├── 技术架构v1.pdf
│   │   ├── 阶段0-工程总体技术架构.pdf
│   │   └── 阶段4-snapshot的特点提取（批注）.pdf
│   └── stages/                         # [核心迁移区] 按工程研发阶段归档的全量原始过程文档
│       ├── stage0-planning/            # 阶段 0：顶层设计与规划 (2篇)
│       ├── stage1-algorithm/           # 阶段 1：算法核心、环境与参数基准 (6篇)
│       ├── stage2-backend/             # 阶段 2：后端测试与调试 (1篇)
│       ├── stage3-database/            # 阶段 3：数据库定义与台账流转 (3篇)
│       ├── stage4-3d-visual/           # 阶段 4：3D 可视化与空间协同体系
│       │   ├── core/                   # 总体方案、看板、核算报告与 Agent 规范 (6篇)
│       │   ├── topics/                 # 9 大专项攻坚架构方案 (9篇)
│       │   └── iterations/             # 12 次微观迭代排查记录归档 (16篇原始草稿)
│       └── stage6-delivery/            # 阶段 6：工程交付与流水线 (4篇)
├── scripts/
│   ├── build-wiki-staging.ps1          # 本地暂存区构建脚本
│   └── wiki/
│       ├── build-wiki.py               # Wiki 编译转换核心引擎 (支持 YAML 清单解析与链接重写)
│       └── sync-local-wiki.py          # 本地灾备直推工具
└── tunnel-drainage-platform/           # 平台主程序工程源码
```

### 2.2 根目录原始文档迁移与治理映射矩阵
下表明确了每一篇根目录文件的**原路径**、**迁移目标路径**、**Wiki 词条 Slug** 以及**治理分级 (Tier 1~4)**：

| 序号 | 根目录原始文件 | 迁移后目标路径 | Wiki Slug | 治理等级 | 状态声明 |
| :---: | :--- | :--- | :--- | :---: | :---: |
| 1 | `阶段0-工程总体技术架构.md` | `docs/stages/stage0-planning/阶段0-工程总体技术架构.md` | `Phase0-System-Architecture` | Tier 1 | Curated |
| 2 | `阶段0-工程开发计划.md` | `docs/stages/stage0-planning/阶段0-工程开发计划.md` | `Phase0-Development-Plan` | Tier 2 | Verified |
| 3 | `阶段1-输入参数全系统更新与对齐方案.md` | `docs/stages/stage1-algorithm/阶段1-输入参数全系统更新与对齐方案.md` | `Phase1-Input-Parameters-Alignment` | Tier 1 | Curated |
| 4 | `阶段1-计算引擎对比校验方案.md` | `docs/stages/stage1-algorithm/阶段1-计算引擎对比校验方案.md` | `Phase1-Engine-Verification` | Tier 1 | Verified |
| 5 | `阶段1-排水管网3D标注与推荐管径对齐方案.md` | `docs/stages/stage1-algorithm/阶段1-排水管网3D标注与推荐管径对齐方案.md` | `Phase1-Drainage-Annotation-Alignment` | Tier 2 | Verified |
| 6 | `【阶段1-】排水管网3D标注与推荐管径对齐方案.md` | `docs/stages/stage1-algorithm/【阶段1-】排水管网3D标注与推荐管径对齐方案.md` | - (标记 ignore) | Tier 4 | Deprecated 重复草案 |
| 7 | `阶段1-python依赖的排查.md` | `docs/stages/stage1-algorithm/阶段1-python依赖的排查.md` | `Phase1-Python-Environment-Setup` | Tier 3 | Verified |
| 8 | `阶段1-python的虚拟开发环境.md` | `docs/stages/stage1-algorithm/阶段1-python的虚拟开发环境.md` | `Phase1-Python-Venv-Guide` | Tier 3 | Verified |
| 9 | `阶段1-前端初始化说明.md` | `docs/stages/stage1-algorithm/阶段1-前端初始化说明.md` | `Phase1-Frontend-Initialization` | Tier 3 | Verified |
| 10 | `阶段2-后端测试与 Debug 详细工程方案.md` | `docs/stages/stage2-backend/阶段2-后端测试与 Debug 详细工程方案.md` | `Phase2-Backend-Testing-Debug` | Tier 1 | Curated |
| 11 | `阶段3-数据库专项定义与调试.md` | `docs/stages/stage3-database/阶段3-数据库专项定义与调试.md` | `Phase3-Database-Specification` | Tier 2 | Verified |
| 12 | `阶段3-前端台账式表单与数据流转落地开发配置方案.md` | `docs/stages/stage3-database/阶段3-前端台账式表单与数据流转落地开发配置方案.md` | `Phase3-Form-DataFlow-Architecture` | Tier 1 | Curated |
| 13 | `阶段3-关于“脏数据”的标注.md` | `docs/stages/stage3-database/阶段3-关于“脏数据”的标注.md` | `Phase3-Data-Sanitization-Rules` | Tier 2 | Verified |
| 14 | `阶段4-3D可视化交互工程方案.md` | `docs/stages/stage4-3d-visual/core/阶段4-3D可视化交互工程方案.md` | `Phase4-3D-Visualization-Overview` | Tier 1 | Curated |
| 15 | `阶段4-3D多维协同与对比看板优化更新方案.md` | `docs/stages/stage4-3d-visual/core/阶段4-3D多维协同与对比看板优化更新方案.md` | `Phase4-Multi-Dimension-Dashboard` | Tier 2 | Curated |
| 16 | `阶段4-3D模型解算与可视化对应关系核算报告.md` | `docs/stages/stage4-3d-visual/core/阶段4-3D模型解算与可视化对应关系核算报告.md` | `Phase4-3D-Model-Verification-Report` | Tier 2 | Verified |
| 17 | `阶段4-3D模型解算与可视化对应关系修复方案.md` | `docs/stages/stage4-3d-visual/core/阶段4-3D模型解算与可视化对应关系修复方案.md` | `Phase4-3D-Model-Fix-Plan` | Tier 3 | Verified |
| 18 | `阶段4-3D模型渲染条纹与旋转消失问题分析方案.md` | `docs/stages/stage4-3d-visual/core/阶段4-3D模型渲染条纹与旋转消失问题分析方案.md` | `Phase4-3D-Render-Troubleshooting` | Tier 3 | Verified |
| 19 | `阶段4-Agent编码实现与验证步骤指南.md` | `docs/stages/stage4-3d-visual/core/阶段4-Agent编码实现与验证步骤指南.md` | `Phase4-Agent-Implementation-Guide` | Tier 2 | Verified |
| 20 | `阶段4-snapshot的特点提取.md` | `docs/stages/stage4-3d-visual/core/阶段4-snapshot的特点提取.md` | `Phase4-Snapshot-Feature-Extraction` | Tier 2 | Verified |
| 21 | `阶段4-专题-中间排水沟自适应几何建模与参数联动架构方案.md` | `docs/stages/stage4-3d-visual/topics/阶段4-专题-中间排水沟自适应几何建模与参数联动架构方案.md` | `Phase4-Topic-Central-Ditch-Modeling` | Tier 1 | Curated |
| 22 | `阶段4-专题-基于Typst编译引擎的计算书批量导出与ZIP打包架构方案.md` | `docs/stages/stage4-3d-visual/topics/阶段4-专题-基于Typst编译引擎的计算书批量导出与ZIP打包架构方案.md` | `Phase4-Topic-Typst-Calculation-Export` | Tier 1 | Curated |
| 23 | `阶段4-专题-快照防排水优化设计计算书A4-PDF参数化生成与导出架构方案.md` | `docs/stages/stage4-3d-visual/topics/阶段4-专题-快照防排水优化设计计算书A4-PDF参数化生成与导出架构方案.md` | `Phase4-Topic-Snapshot-PDF-Generation` | Tier 2 | Verified |
| 24 | `阶段4-专题-快照卡片施工设计图自动生成与导出工程方案.md` | `docs/stages/stage4-3d-visual/topics/阶段4-专题-快照卡片施工设计图自动生成与导出工程方案.md` | `Phase4-Topic-Snapshot-CAD-Generation` | Tier 1 | Curated |
| 25 | `阶段4-专题-3D多计算段选区折叠交互与最不利受力探针随动架构方案.md` | `docs/stages/stage4-3d-visual/topics/阶段4-专题-3D多计算段选区折叠交互与最不利受力探针随动架构方案.md` | `Phase4-Topic-Critical-Stress-Probe` | Tier 1 | Curated |
| 26 | `阶段4-专题-自适应顶栏与百级快照侧边栏检索折叠架构方案.md` | `docs/stages/stage4-3d-visual/topics/阶段4-专题-自适应顶栏与百级快照侧边栏检索折叠架构方案.md` | `Phase4-Topic-Header-Sidebar-Retriever` | Tier 2 | Verified |
| 27 | `阶段4-专题-排水管网3D模型专项问题诊断与完善方案.md` | `docs/stages/stage4-3d-visual/topics/阶段4-专题-排水管网3D模型专项问题诊断与完善方案.md` | `Phase4-Topic-Drainage-Network-Diagnosis` | Tier 2 | Verified |
| 28 | `阶段4-专题-路面与排水沟几何修复方案.md` | `docs/stages/stage4-3d-visual/topics/阶段4-专题-路面与排水沟几何修复方案.md` | `Phase4-Topic-Pavement-Ditch-Repair` | Tier 3 | Verified |
| 29 | `阶段4-专题-最不利探针与结构受力表达问题诊断与修复方案.md` | `docs/stages/stage4-3d-visual/topics/阶段4-专题-最不利探针与结构受力表达问题诊断与修复方案.md` | `Phase4-Topic-Stress-Probe-Diagnosis` | Tier 3 | Verified |
| 30~45 | 阶段4 第1~12次微观迭代排查记录 (共16篇原始草稿) | `docs/stages/stage4-3d-visual/iterations/阶段4-第[1~12]次-*.md` | `Phase4-Evolution-Summary` *(人工精修合并版)* | Tier 1 (精修) / Tier 4 (原始) | Curated (优先采用 `docs/wiki/Phase4-Evolution-Summary.md` 覆写发布) |
| 46 | `阶段6-服务器与桌面独立GUI双模式交付系统架构方案.md` | `docs/stages/stage6-delivery/阶段6-服务器与桌面独立GUI双模式交付系统架构方案.md` | `Phase6-Dual-Mode-Delivery-Architecture` | Tier 1 | Curated |
| 47 | `阶段6-GitHub自动发布与大版本CI-CD流水线方案.md` | `docs/stages/stage6-delivery/阶段6-GitHub自动发布与大版本CI-CD流水线方案.md` | `Phase6-GitHub-Release-Pipeline` | Tier 1 | Curated |
| 48 | `阶段6-Docker服务器版镜像构建与DockerHub发布方案.md` | `docs/stages/stage6-delivery/阶段6-Docker服务器版镜像构建与DockerHub发布方案.md` | `Phase6-Docker-Build-Delivery` | Tier 2 | Verified |
| 49 | `阶段6-GitHub-Wiki知识库体系化构建与自动化同步方案.md` | `docs/stages/stage6-delivery/阶段6-GitHub-Wiki知识库体系化构建与自动化同步方案.md` | `Phase6-GitHub-Wiki-Automation-Scheme` | Tier 1 | Curated 本方案 |
| 50 | `系统双模式部署与使用说明书.md` | `docs/manuals/系统双模式部署与使用说明书.md` | `Manual-System-Deployment-Guide` | Tier 1 | Curated 核心门户词条 |
| 51 | `prompt-calculate.md` | `docs/prompts/prompt-calculate.md` | `Prompt-Calculation-Asset` | Tier 2 | Verified |
| 52~54 | 3 篇历史架构与批注 PDF (`技术架构v1.pdf` 等) | `docs/ref_assets/*.pdf` | - (二进制资产) | 外部资产 | 通过 GitHub Blob 绝对链接引用 |

---

## 3. 基于 `/wiki-curator` 的核心执行状态机与系统拓扑

### 3.1 自适应执行状态机架构
本方案严格遵循 `/wiki-curator` 4 步状态机推进，形成闭环：

```mermaid
flowchart TD
    START([触发 /wiki-curator]) --> S1{检查 1: 文档源确定?}
    S1 -->|已锁定| S1_SET[文档源根目录: docs/<br/>全量原始文档归位至 docs/stages/**]
    S1_SET --> S2{检查 2: 前置脚手架完整?<br/>CI + 暂存区 + 换行配置}
    
    S2 -- 缺失项 --> S2_FIX[自动补齐:<br/>.github/workflows/wiki-sync.yml<br/>.gitattributes 与 doc/wiki_staging/]
    S2 -- 已就绪 --> S3{检查 3: Wiki 远端与 Token 确认?}
    
    S3 -->|已完成配置| S3_CONFIRM[确认 WIKI_SYNC_TOKEN 已注入 Secrets<br/>确认 远端 repo.wiki.git 已初始化]
    S3_CONFIRM --> S4[执行状态 4: 常规 Wiki 智能更新闭环]
    
    subgraph S4_Detail["Step 4: 智能编译与极速发布闭环"]
        S4_1[扫描 docs/ 全量文档 & 解析 wiki-manifest.yml] --> S4_2{覆写检查: docs/wiki/*.md 是否存在?}
        S4_2 -- 命中精修版 --> S4_USE_CURATED[采用高质量精修 Markdown]
        S4_2 -- 未命中 --> S4_USE_RAW[清洗原始文档 + 注入状态声明徽章]
        S4_USE_CURATED --> S4_3[语法标准化: [[Title|Slug]] & 图床 CDN 化]
        S4_USE_RAW --> S4_3
        S4_3 --> S4_4[合成 Home.md / _Sidebar.md / _Footer.md]
        S4_4 --> S4_5[写入受控暂存区 doc/wiki_staging/]
        S4_5 --> S4_6[本地 git diff 审查]
        S4_6 -->|git push master| S4_7[GitHub Actions: 30秒无状态镜像部署]
    end
    
    S4 --> S4_Detail
    S4_7 --> DONE([Wiki 页面实时上线])
```

### 3.2 关键前置凭据状态核验 (Step 3 审计)
- **Token 配置状态**：用户已于 GitHub 仓库 **Settings** -> **Secrets and variables** -> **Actions** 中添加名为 **`WIKI_SYNC_TOKEN`** 的 Secret。
- **权限范围说明**：该 Token 为 Personal Access Token (Classic)，具备 `repo` 完整权限（含代码读写与 Wiki 仓库提交权限）。
- **作用边界**：在 GitHub Actions 流水线中，通过 `https://x-access-token:${{ secrets.WIKI_SYNC_TOKEN }}@github.com/${{ github.repository }}.wiki.git` 安全克隆并推送，彻底规避 `GITHUB_TOKEN` 的 403 权限拒绝。

---

## 4. 人机协同治理与局部精修覆写机制

为彻底兼顾“海量历史推演档案的完整性”与“对外展示的高信噪比”，确立三维治理机制：

### 4.1 四级文档治理策略 (Tier 1 ~ Tier 4)
- **Tier 1 (Curated Core - 人工精修核心)**：
  - 核心架构、使用说明书、关键专项方案、迭代演进全景复盘。
  - 放置于 `docs/wiki/` 目录中。编译引擎优先采用精修版本覆写，排版精炼，直指终局结论。
- **Tier 2 (Verified Standard - 规范验证归档)**：
  - 具备独立参考价值的标准设计书、核算报告、数据库规范。
  - 由自动化清洗输出，格式规范，链接完整。
- **Tier 3 (Raw Details - 原始过程留痕)**：
  - 包含特定日期局部 Bug 排查、依赖调试记录的原始技术文档。
  - 自动转译，并在页面顶部自动注入状态提示：
    ```markdown
    > [!NOTE]
    > **工程状态提示**：本文档由主仓库过程技术记录自动归档生成（原始文件：`docs/stages/...`）。若需查验最新架构基准与使用手册，请查阅系统主文档。
    ```
- **Tier 4 (Deprecated / Redundant - 冗余或废弃草稿)**：
  - 历史重复草稿（如 `【阶段1-】...`）或已完全被合并的 12 次微观迭代排查碎片。
  - 在 `docs/wiki-manifest.yml` 中配置 `status: ignore`，不生成独立词条，保持知识库检索纯净。

### 4.2 阶段 4 的 12 次微观迭代合并归纳样例
针对原阶段 4 极其繁杂的 16 篇零碎排查草稿，实施“**局部覆写**”治理：
- **原始记录存储**：存入 `docs/stages/stage4-3d-visual/iterations/` 作为溯源仓库，不直接暴露为 16 个碎词条。
- **精修覆写文件**：在 `docs/wiki/Phase4-Evolution-Summary.md` 编写《12次微观迭代演进全景复盘 (人工精修合并版)》。
- **清单调度声明**：
  ```yaml
  - source: "docs/wiki/Phase4-Evolution-Summary.md"
    override: true
    wiki_title: "12次微观迭代演进全景复盘 (人工精修合并版)"
    slug: "Phase4-Evolution-Summary"
    tier: 1
    status: "curated"
    original_references:
      - "docs/stages/stage4-3d-visual/iterations/阶段4-第一次-3D材质灯光美化与微观局部放大方案.md"
      - "docs/stages/stage4-3d-visual/iterations/阶段4-第十二次-排水管径倍数放大会显与一键还原控件方案.md"
  ```

---

## 5. 编译引擎、受控暂存区与 CI/CD 规约

### 5.1 边界契约矩阵 (Boundary Contract Matrix)

| 边界维度 | 涉及组件/系统 | 刚性物理约束 | 契约实现机制 |
| :--- | :--- | :--- | :--- |
| **Wiki 存储拓扑约束** | GitHub Wiki 远端仓库 (`.wiki.git`) | **绝对不支持子目录**，所有 Markdown 文件必须平铺在根目录。 | 转换引擎依据 `slug` 将 `docs/stages/**/xxx.md` 扁平映射为 `doc/wiki_staging/<Slug>.md`。 |
| **Wiki 页面跳转规范** | Gollum Markdown 引擎 | 跨页面跳转必须遵循 `[[Title\|Slug]]` 语法，禁止使用带 `.md` 的相对路径。 | 正则链接重写模块依据 `source_to_slug` 映射表全局替换 `[Title](path/to/file.md)` $\rightarrow$ `[[Title\|Slug]]`。 |
| **CI 推送权限约束** | GitHub Actions | 默认 `GITHUB_TOKEN` 无同名 Wiki 仓库写入权限（直接报 403）。 | 流水线显式注入具备 `repo` 权限的 `secrets.WIKI_SYNC_TOKEN` 环境变量。 |
| **跨平台换行符约束** | Windows 本地 vs Ubuntu Runner | Windows 生成的 CRLF 会导致 Git 产生虚假的全量行变动。 | 在 `.gitattributes` 中固化声明：`doc/wiki_staging/*.md text eol=lf`。 |
| **代码与资源跳转约束** | 本地代码与图片 | Wiki 无法直接访问主库物理文件。 | 相对图片链接自动转化为 GitHub Raw CDN 路径：`https://raw.githubusercontent.com/.../main/docs/...`。 |

### 5.2 受控暂存区与 GitHub Actions 工作流实现
流水线监听受控暂存区 `doc/wiki_staging/**` 变更，无 Python 环境依赖，秒级完成镜像推送：

```yaml
# .github/workflows/wiki-sync.yml
name: "GitHub Wiki Sync Pipeline"

on:
  push:
    branches:
      - main
    paths:
      - 'doc/wiki_staging/**'
      - '.github/workflows/wiki-sync.yml'
  workflow_dispatch:

concurrency:
  group: wiki-sync
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  sync-wiki:
    name: "Deploy Controlled Staging to Wiki"
    runs-on: ubuntu-latest
    steps:
      - name: "Checkout Main Repository"
        uses: actions/checkout@v4
        with:
          path: main-repo

      - name: "Checkout Wiki Target Repository"
        uses: actions/checkout@v4
        with:
          repository: ${{ github.repository }}.wiki
          token: ${{ secrets.WIKI_SYNC_TOKEN || secrets.GITHUB_TOKEN }}
          path: wiki-repo

      - name: "Mirror Sync Staging into Wiki Workspace"
        run: |
          echo "=== 正在将 doc/wiki_staging 同步至 Wiki 目标工作区 ==="
          # 清除除 .git 之外的所有旧文件，保持 100% 精确镜像
          find wiki-repo -maxdepth 1 -not -name '.git' -not -name '.' -exec rm -rf {} +
          cp -r main-repo/doc/wiki_staging/* wiki-repo/
          ls -la wiki-repo/

      - name: "Commit and Deploy to Wiki"
        working-directory: wiki-repo
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

          if [ -z "$(git status --porcelain)" ]; then
            echo ">>> Wiki 没有任何变动，跳过提交。"
            exit 0
          fi

          echo ">>> 检测到暂存区内容变动，正在提交至 Wiki 仓库..."
          git add .
          git commit -m "docs(wiki): automated sync from main repo commit ${{ github.sha }}"
          git push origin main || git push origin master
          echo "=== GitHub Wiki 知识库已成功发布并上线! ==="
```

---

## 6. 工作分解结构 (WBS 2.0.0) 与落地实施路线

```
WBS Wiki 体系化构建与根目录文档迁移工程 (v2.0.0)
│
├── 1. 根目录原始文档物理迁移与目录重构 (Physical Migration)
│   ├── 1.1 创建 docs/stages/ 各阶段分类子目录 (stage0 ~ stage6)
│   ├── 1.2 创建 docs/manuals/, docs/prompts/, docs/ref_assets/ 归档目录
│   ├── 1.3 执行 git mv 将 49 篇 Markdown 及 3 篇 PDF 移入目标子目录
│   ├── 1.4 清理/标记冗余草案【阶段1-】排水管网3D标注与推荐管径对齐方案.md
│   └── 1.5 验证仓库根目录洁净度 (确认仅剩 README, CHANGELOG 等核心文件)
│
├── 2. 元数据调度清单升级 (Manifest Remapping)
│   ├── 2.1 全面更新 docs/wiki-manifest.yml 中所有 page.source 路径为 docs/stages/...
│   ├── 2.2 校验 30+ 篇 Wiki 词条 slug 命名的一致性与唯一性
│   └── 2.3 固化 docs/wiki/Phase4-Evolution-Summary.md 局部精修覆写配置
│
├── 3. 脚手架与编译转换引擎适配 (Scaffolding & Compiler Update)
│   ├── 3.1 创建受控暂存目录 doc/wiki_staging/
│   ├── 3.2 配置 .gitattributes 固化换行符 (doc/wiki_staging/*.md text eol=lf)
│   ├── 3.3 更新 scripts/wiki/build-wiki.py 支持向 doc/wiki_staging/ 输出
│   ├── 3.4 编写/适配 scripts/build-wiki-staging.ps1 便捷构建脚本
│   └── 3.5 更新 .github/workflows/wiki-sync.yml 监听 doc/wiki_staging/** 变更
│
└── 4. 首次全量编译、暂存审查与发布验证 (Verification & Quality Gate)
    ├── 4.1 本地执行编译脚本，生成全量 doc/wiki_staging/ 文件
    ├── 4.2 审查 Home.md 聚合门户与 _Sidebar.md 折叠侧边栏渲染排版
    ├── 4.3 执行 Git Diff 审查暂存区文件，确认无 CRLF 污染及破坏性变更
    ├── 4.4 提交并 Push 至 main 分支，触发 GitHub Actions 流水线
    └── 4.5 访问 GitHub Wiki 网页端，验证全网词条连通性与排版保真度
```

---

## 7. 验收准则与质量门禁矩阵 (Acceptance Criteria 2.0.0)

| 门禁维度 | 验收指标 (Metric) | 测量方法与合格判据 | 责任人 |
| :--- | :--- | :--- | :---: |
| **根目录洁净度** | **100% 零平铺污染** | 根目录下无任何散乱阶段技术 Markdown 或中间过程 PDF，所有文档完整归档在 `docs/` 下。 | Architecture |
| **暂存区透明度** | **100% 可审计** | 任何推送到远端 Wiki 的变动均在 `doc/wiki_staging/` 形成明文 Git 记录，支持本地事前 review。 | Reviewer |
| **换行符规范性** | **0 脏变动 (Zero Dirty CRLF)** | `.gitattributes` 规则生效，Windows 与 Linux CI 之间零由于换行符导致的虚假提交。 | DevOps |
| **凭据与发布时效** | **发布耗时 ≤ 30 秒** | 推送 `doc/wiki_staging/` 变更后，GitHub Actions 借助 `WIKI_SYNC_TOKEN` 在 30 秒内完成部署。 | DevOps |
| **超链接连通率** | **100% 连通 (0 坏链)** | 词条间相互跳转正确重写为 `[[Title\|Slug]]` 语法，代码仓外部引用直达 GitHub Blob。 | QA |
| **人机协同保真度** | **人工精修 100% 保护** | 提交至 `docs/wiki/` 的人工精修文档（如微观迭代复盘）在任何自动化构建中绝不被草案覆盖。 | Curator |

---

## 8. 运维与协同操作指南 (Operational Playbook)

### 8.1 日常文档编写与 Wiki 同步标准流程
当协作者在 `docs/stages/` 新增或修改了技术方案后，严格按以下两步完成发布：

```powershell
# 第一步：在本地运行转码构建脚本，更新受控暂存区
pwsh -ExecutionPolicy Bypass -File scripts/build-wiki-staging.ps1
# 或执行 Python 转换引擎：
# python scripts/wiki/build-wiki.py --manifest docs/wiki-manifest.yml --output doc/wiki_staging

# 第二步：审查本地 Git Diff，确认无误后提交推送至 main
git add doc/wiki_staging/ docs/
git commit -m "docs(wiki): update knowledge base staging"
git push origin main
```

> [!NOTE]
> 代码推送至 `main` 分支后，GitHub Actions 流水线将全自动感知 `doc/wiki_staging/**` 的变更，并在半分钟内完成 GitHub Wiki 线上更新。
