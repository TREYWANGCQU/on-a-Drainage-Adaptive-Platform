<!-- 阶段0-工程总体技术架构.md -->

# 【阶段0-工程方案】：工程总体技术架构设计书

### 一、 总体系统架构

隧道工程多维协同智能排水自适应平台采用现代前后端深度分离、计算模型与表现层解耦的工业级软件架构，支持高性能 Web 端协同与跨平台轻量级桌面端交付。

* **前端交互与 3D 渲染层 (Web & Visual)**：基于 Vue 3.5 + TypeScript 5.6 构建，采用 Vite 6 高速构建工具链。
  - **2D 工业级交互组件**：选用 Element Plus 2.13，针对 38/40 维重载工程参数表单进行分级渐进披露与响应式数据绑定；集成 KaTeX 0.18 实现工程公式即时渲染。
  - **3D 数字化孪生引擎**：选用 Three.js 0.184，基于参数化几何构造算法实时生成马蹄形三心圆断面、初支/二衬衬砌、注浆加固圈及空间立体防排水管网；利用自定义 GLSL 顶点/片元着色器实现全环 24 单元安全系数及应力云图映射；集成双视口画中画（PIP）局部放大镜与三轴动态剖切机制。
* **桌面端容器层 (Desktop Runtime)**：采用 Tauri 2.0 框架（`@tauri-apps/api: ^2.10.1`, `@tauri-apps/cli: ^2`）。依托 Rust 底层运行时封装 Webview，具备内存开销极低（相比 Electron 降低 80% 以上）、打包体积精简、跨平台系统级 API 安全调用的特性。
* **后端计算与编译服务层 (Backend Engine)**：采用 Python 3.10+ FastAPI 框架。
  - **数值计算内核**：以纯 Python 科学计算栈（NumPy, Pandas）解算 SCS-CN 水文降雨产流、非恒定渗流折减理论及偏心受压结构力学模型，自动导出 OpenAPI (Swagger) 规范接口。
  - **现代排版编译引擎**：集成 Typst 0.11+ 编译引擎，替代臃肿易错的传统 LaTeX 与 Office 自动化组件，在服务端实现毫秒级纯矢量 A4 工程计算书实时排版编译与多快照流式 ZIP 归档。
* **A3 数字化施工图绘制引擎 (Blueprint Generator)**：依托自主研发的 `blueprintGenerator.ts` 与 jsPDF，严格遵循《建筑制图标准》(GB/T 50104-2010) 与《房屋建筑制图统一标准》(GB/T 50001)，在客户端毫秒级动态绘制 4200×2970 标定像素的标准 A3 横向工程蓝图，支持多标准工程比例尺（1:50~1:200）与高分辨率 PNG/矢量 PDF 导出。

---

### 二、 核心模块技术实现

#### 1. API 接口与双分支自适应数据契约
* **标准化 RESTful 路由划分**：
  - **排水计算主接口**：`POST /api/v1/calculate/drainage`。接收几何尺寸、水头埋深、注浆围岩、降雨量及衬砌配筋等参数字典，触发全环水力-结构协同解算。
  - **参数数据库接口**：`GET/POST/PUT/DELETE /api/v1/database/parameters`。管理预置典型示范工程基准与用户自定义参数模板。
  - **计算书排版接口**：`POST /api/v1/calculation-books/export-pdf` 与 `POST /api/v1/calculation-books/batch-export`。分别负责单份 A4 计算书 PDF 编译与多工况快照 ZIP 压缩归档。
* **双分支计算引擎与优化搜索 (`drainage_engine.py` & `optimizedDesign.py`)**：
  - **4 典型工况判断**：根据隧道洞型（单洞 `single` / 双洞 `double`）及水头比值判定准则（$r_0/H \ge 0.062$）自动划分为：`single_low`, `single_high`, `double_low`, `double_high`。
  - **水文与渗流解算 (`hydrocalc.py`)**：根据 SCS-CN 模型推求设计降雨产流量，结合透水衬砌边界反演衬砌背后动水压力分布与渗漏涌水量 $q, Q$。
  - **结构力学解算 (`mechcalc.py`)**：结合拱顶坍塌荷载高度 $H_q$ 与折减外水压力，求解 24 单元全环轴力 $N_{elem}$、弯矩 $M_{elem}$，依据《铁路隧道设计规范》判定大/小偏心受压承载力破坏状态，求出各单元安全系数 $K$ 及全环最小安全系数 $nowK$。
  - **自适应数据契约**：
    1. **安全分支 ($nowK > tol\_safety\_factor$)**：输出 `input_parameter`、`original_state` 及供 ECharts/Three.js 渲染的力学响应数据 `echart_data`。
    2. **超限加固搜索分支 ($nowK \le tol\_safety\_factor$)**：引擎自动触发自适应步进优化算法，以 $0.05\text{m}$ 步长搜索极限容许水头 `final_waterHead`，反算出临界注浆加固半径 $r_{g\_crit}$ 与有效加固厚度 $t_{g\_crit} = \max(0.0, r_{g\_crit} - r_2)$，并优化推荐排水管径及环向间距，同时输出原始态与临界态（`original_state` & `critical_state`）。

#### 2. 参数输入台账与响应式状态机
针对 38 维（单洞）与 40 维（双洞）高密度工程参数，构建清晰分层的数据交互体系：
* **分区分级渐进式面板 (`ParameterForm.vue`)**：
  - **核心基础区**：显式展示内净空半径 $r$、二衬半径 $r_1$、初支外径 $r_2$、双洞间距 $D_{spacing}$、设计水头 $H$、埋深 $depth$ 及纵向分区长度 $L$。
  - **复选交互区**：控制仰拱中心水沟设置、初支排水暗沟设置及双洞协同参数。
  - **高级默认折叠区**：预设围岩抗力系数 $K_s$、容重、透水系数等经验参数，支持一键重置为规范基准。
* **Pinia 全局状态网络**：
  - `parameterStore.ts`：维护当前输入态，配置深度响应式监听器；一旦用户修改任意参数立即置位 `isDirty = true`，并在 3D 画布及结果侧栏覆盖黄色警示条纹，冻结过时力学云图与结论，防止非一致性误判。
  - `snapshotStore.ts`：实现“工况快照”序列台账管理（CRUD），支持多快照独立参数与计算解算字典的持久化存储、并发批量解算以及状态感知（🟢已计算、🟡待计算、🔴错误、⚠️加固超限）。
  - `themeStore.ts`：实现“明亮白”与“科技蓝”工业双主题秒级热切换，联动 2D 组件色彩变量及 3D 画布清屏色/环境光温。
* **批量数据 IO (`excelIO.ts`)**：提供标准 Excel 工程模板下载，支持长里程多标段多断面参数批量解析导入，系统自动解包生成连续里程快照流水线。
* **参数数据库台账 (`ParameterDatabase.vue`)**：提供市政、公路、铁路工程标签检索，支持当前表单参数“另存为工程模版”并持久化保存至后端 SQLite 数据库。

#### 3. 3D 空间数字化孪生与交互表现 (`components/three/`)
* **参数化几何构造生成器 (`TunnelGenerator.ts`)**：
  - 基于解析几何算法实时构建马蹄形三心圆截面曲线，根据 $r, r_1, r_2, aspect\_ratio$ 动态推导圆弧切点与控制点。
  - 二衬与初支圈层通过几何放样及法向偏移挤出；当内径 $r > 5.0\text{m}$ 或用户勾选时，采用 CSG 布尔运算相减自动在仰拱底部开挖沉降中心排水沟槽。
* **自适应立体排水管网阵列 (`DrainagePipeGenerator.ts`)**：
  - 动态读取优化解算后的推荐环向管径 `ring_diam` 与纵向间距 `ring_spacing`。
  - 使用 `THREE.InstancedMesh` 实例化阵列技术沿衬砌外缘环向空间矩阵投影生成环向盲管、纵向集水盲管及侧向排水暗管，单 Draw Call 承载数千根管网构件渲染，帧率稳定在 60 FPS。
* **注浆加固圈与超前支护 (`Reinforcement.ts`)**：
  - 生成常规半透明多孔介质注浆加固区（厚度 $t_g = r_g - r_2$）；在超限状态下动态叠加坡度更密实的临界加固环（厚度 $t_{g\_crit}$）。
  - 矩阵阵列生成系统化砂浆锚杆与超前小导管，并施加沿洞轴线法向的外插角偏转矩阵。
* **动水环境场与水头随动 (`Environment.ts`)**：
  - 3D 地下水位参考面标高动态响应 $h_0$ / `final_waterHead`；地下水渗流由基于 GPU 粒子着色器的动态流线场表达，粒子流速与密度直接挂钩于瞬时涌水量 $Q$。
* **高级工程交互与渲染管道 (`Viewer3D.vue` & `PostProcessing.ts`)**：
  - **图层隔离管理**：严格配置 Three.js Layers 0~5 通道（环境、二衬、初支、注浆圈、锚杆支护、立体排水管系），支持秒级无重绘显隐。
  - **三轴动态剖切**：利用 WebGL `clippingPlanes` 提供 X/Y/Z 轴滑块剖切，支持断面内部钢筋保护层与盲管接头细节透视。
  - **24 单元应力云图与探针**：将 24 单元的受力弯矩/轴力及安全系数向量注入自定义 GLSL 着色器（`lining.vert`/`lining.frag`），在三维衬砌外表面进行平滑渐变热力图渲染；利用 `Raycaster` 自动定位全环最小安全系数控制点（`control_idx`），在三维空间锚定动态标注探针。
  - **画中画放大镜 (`MagnifierPIP.vue`)**：支持副视口局部放大，聚焦局部衬砌配筋、排水孔口或最不利单元破坏区域。
  - **多方案同屏联动对比 (`CompareView.vue`)**：双 WebGL 视口同步挂载原始设计（超限红区）与临界优化方案（加固绿区），双相机变换矩阵实时同频绑定。
  - **长里程空间拼装**：根据快照各分区的起止桩号（`start_chainage` ~ `end_chainage`），沿 Z 轴线自动无缝组装多工况三维隧道模型。

#### 4. 自动化工程计算书编制子系统 (`calculationBook`)
* **前后端协同计算书架构**：
  - 前端数据模型装配层 (`bookDataModel.ts` & `bookGenerator.ts`)：深度聚合快照参数、水文涌水量、全环 24 单元内力数组、极限破坏承载力与优化建议。
  - 前端交互式报告查看器 (`CalculationBookModal.vue` & `CalculationReportView.vue`)：采用模块化组件构建 6 大规范章节：
    1. `Chapter1Basis.vue`：工程概况与设计依据规范标准；
    2. `Chapter2Params.vue`：几何断层、水文气象与围岩支护材料参数表；
    3. `Chapter3Seepage.vue`：SCS-CN 暴雨产流与地下水渗流涌水量计算分析；
    4. `Chapter4Mech.vue`：破损阶段法 24 单元全环受力验算与最不利安全系数分布；
    5. `Chapter5Optimize.vue`：容许水头反演、注浆加固圈增厚与排水管网自适应推荐；
    6. `Chapter6Conclusion.vue`：最终工程设计结论、达标评价与施工监控建议。
* **Typst 毫秒级矢量编译排版引擎 (`typst_exporter.py` & `calculation_book.typ`)**：
  - 后端直接集成 Rust 编写的 Typst 原生编译器，根据预设的企业级高保真模板（遵循国家科技报告规范格式、红头标题、标准三线表、矢量公式），毫秒级编译生成 100% 纯矢量、高精度、文字可复制选中的 A4 计算书 PDF。
  - 支持多线程并发批量编译，并在内存流中直接打包为 `.zip` 压缩归档文件，杜绝磁盘残留临时文件。

#### 5. A3 数字化标准施工图绘制引擎 (`blueprintGenerator.ts`)
* **国家工程制图规范严格对齐**：
  - 遵循《房屋建筑制图统一标准》(GB/T 50001-2017) 与《建筑制图标准》(GB/T 50104-2010)，在客户端 Canvas 上建立 4200×2970 标定像素（对应 A3 图幅 420mm × 297mm，基准分辨率 10 px/mm）的高精度绘图坐标系。
* **工程标准模数比例尺体系**：
  - 内置支持 5 组国家标准工程比例尺：`1:50` (200 px/m)、`1:75` (133.33 px/m)、`1:100` (100 px/m)、`1:150` (66.67 px/m)、`1:200` (50 px/m) 以及智能自适应比例尺。
  - 动态绘制国家标准交替黑白模数比例尺条（含 0, 1m, 2m, 5m, 10m 等标准刻度分段）。
* **全要素施工详图自动化排版**：
  - **工程图签栏 (Title Block)**：自动绘制标准右下角工程图签，包含工程名称、图名（如“暗挖单洞隧道防排水系统及衬砌构造详图”）、桩号区间（如“DK12+450 ~ DK12+850”）、比例尺、设计阶段、工况状态及时间戳。
  - **三心圆衬砌断面大样图**：绘制内净空边界、二衬厚度、初支厚度、注浆加固区范围线；开挖仰拱中心排水沟大样及垫层构造。
  - **防排水构件与标注**：标注环向排水盲管（含推荐管径与间距）、纵向集水暗管、侧沟引水暗管；标注开挖总宽、总高、净空圆心及设计地下水位标高线。
  - **参数与结果明细表**：自动排版工程设计指标清单、荷载参数、最小安全系数判别及超限加固量。
* **多格式输出**：一键生成超清 PNG 施工设计图，或通过 jsPDF 封装输出 1:1 矢量 A3 施工蓝图 PDF。

---

### 三、 最新工程文件目录架构

系统 Monorepo 单体工程目录结构如下：

```text
tunnel-drainage-platform/
├── backend/                              # Python FastAPI 后端服务
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   │       └── endpoints/
│   │   │           ├── calculate.py      # POST /api/v1/calculate/drainage 计算主路由
│   │   │           ├── database.py       # CRUD /api/v1/database/parameters 参数数据库路由
│   │   │           └── calculation_book.py # POST /api/v1/calculation-books Typst 导出路由
│   │   ├── core/
│   │   │   └── config.py                 # 全局配置 (CORS, 环境变量, 项目常量)
│   │   ├── db/
│   │   │   ├── session.py                # SQLAlchemy + aiosqlite 异步数据库引擎与会话工厂
│   │   │   └── init_db.py                # 物理建表与示点工程初始基准数据预置注入
│   │   ├── models/
│   │   │   ├── schemas.py                # Pydantic 数据验证契约 (单/双洞 38/40 维参数)
│   │   │   └── domain.py                 # SQLAlchemy ORM 物理实体模型 (TunnelParameter)
│   │   ├── services/
│   │   │   ├── hydrocalc.py              # 水力与渗流计算核心 (SCS-CN暴雨降雨、Darcy折减渗流)
│   │   │   ├── mechcalc.py               # 结构力学计算核心 (24单元破损阶段法内力与安全系数求解)
│   │   │   ├── drainage_engine.py        # 业务解算调度入口 (4工况判别、双分支数据组装)
│   │   │   ├── optimizedDesign.py        # 智能防排水耦合自适应搜索核心 (容许水头与临界注浆反演)
│   │   │   └── typst_exporter.py         # Typst 模板渲染、多线程编译与 ZIP 流式打包引擎
│   │   └── templates/
│   │       └── typst/
│   │           └── calculation_book.typ  # 高保真标准工程计算书 Typst 排版模板
│   ├── tunnel_params.db                  # 本地持久化 SQLite 数据库文件
│   ├── requirements.txt                  # 后端依赖配置清单
│   └── main.py                           # FastAPI 应用入口与生命周期管理
│
├── frontend/                             # Vue 3.5 + TypeScript + Three.js 前端应用
│   ├── src/
│   │   ├── api/
│   │   │   └── index.ts                  # Axios 统一封装与拦截器 (对接计算、数据库与导出接口)
│   │   ├── assets/
│   │   │   └── shaders/                  # 自定义 WebGL 着色器源码
│   │   │       ├── lining.vert           # 顶点着色器 (网格偏置挤出与全环力学标量插值)
│   │   │       └── lining.frag           # 片元着色器 (应力与安全系数平滑色谱映射)
│   │   ├── components/
│   │   │   ├── ui/                       # 2D 交互界面组件
│   │   │   │   ├── ParameterForm.vue     # 38/40 维分区分级参数表单 (带脏数据监测)
│   │   │   │   ├── SnapshotSidebar.vue   # 工况快照侧边栏 (台账管理、批量计算、蓝图/计算书呼出)
│   │   │   │   └── CaseSelector.vue      # 典型工程标段案例快速注入下拉组件
│   │   │   ├── three/                    # 3D 渲染与交互核心构件
│   │   │   │   ├── Viewer3D.vue          # 3D 主视口容器 (图层控制、剖切滑块、多快照装配)
│   │   │   │   ├── TunnelGenerator.ts    # 三心圆马蹄形截面放样与仰拱水沟布尔开挖
│   │   │   │   ├── DrainagePipeGenerator.ts # InstancedMesh 空间立体排水管网自适应阵列
│   │   │   │   ├── Reinforcement.ts      # 常规/临界注浆加固区、系统锚杆与超前小导管几何
│   │   │   │   ├── Environment.ts        # 地下水动力场、水位面标高随动与渗流粒子系统
│   │   │   │   ├── PostProcessing.ts     # 后期渲染管道 (24单元热力云图映射与最不利应力探针)
│   │   │   │   └── MagnifierPIP.vue      # 双视口画中画 (PIP) 局部构件细节放大镜
│   │   │   └── calculationBook/          # 计算书交互式多章节报表组件
│   │   │       ├── CalculationBookModal.vue   # 计算书全屏模态预览弹窗
│   │   │       ├── CalculationReportView.vue  # 计算书排版与打印视图容器
│   │   │       └── chapters/                  # 6 大规范章节
│   │   │           ├── Chapter1Basis.vue      # 第 1 章：设计依据与工程规范
│   │   │           ├── Chapter2Params.vue     # 第 2 章：计算输入参数明细表
│   │   │           ├── Chapter3Seepage.vue    # 第 3 章：水文渗流与产水量分析
│   │   │           ├── Chapter4Mech.vue       # 第 4 章：全环结构力学承载力验算
│   │   │           ├── Chapter5Optimize.vue   # 第 5 章：智能自适应加固优化设计
│   │   │           └── Chapter6Conclusion.vue # 第 6 章：综合评价结论与施工建议
│   │   ├── store/
│   │   │   ├── parameterStore.ts         # Pinia 表单输入状态机 (参数响应与 isDirty 拦截)
│   │   │   ├── snapshotStore.ts          # Pinia 快照序列台账状态机 (双分支解算结果与状态流转)
│   │   │   └── themeStore.ts             # Pinia 全局主题管理器 (明亮白与科技蓝双向联动)
│   │   ├── utils/
│   │   │   ├── blueprintGenerator.ts     # A3 数字化施工图绘制核心 (GB/T 50104 标准比例尺与图签)
│   │   │   ├── excelIO.ts                # 跨标段里程 Excel 模板解析、批量导入与序列生成
│   │   │   ├── math.ts                   # 空间仿射变换矩阵、三心圆几何公式与曲率计算
│   │   │   └── calculationBook/          # 计算书数据处理与公式模型
│   │   │       ├── bookDataModel.ts      # 规范化计算书完整数据契约接口
│   │   │       ├── bookGenerator.ts      # 快照数据到计算书数据模型的清洗与转换管道
│   │   │       ├── formulaTemplates.ts   # 标准工程计算公式 KaTeX 模板字典
│   │   │       └── bookExporter.ts       # Typst PDF 与多快照 ZIP 导出 API 调用封装
│   │   ├── views/
│   │   │   ├── Dashboard.vue             # 主控台工作空间 (三栏弹性伸缩布局)
│   │   │   ├── ParameterDatabase.vue     # 独立的工程参数台账数据库管理界面
│   │   │   └── CompareView.vue           # 原始方案 vs 加固方案双视口同频联动对比视图
│   │   ├── App.vue                       # 前端顶层挂载入口
│   │   └── main.ts                       # 前端入口文件 (Pinia, Router, Element Plus, KaTeX CSS)
│   ├── src-tauri/                        # Tauri 2.0 桌面端配置与构建管线
│   │   ├── Cargo.toml                    # Rust 依赖声明
│   │   ├── tauri.conf.json               # Tauri 2.0 窗体、安全策略与构建配置
│   │   ├── build.rs                      # 构建扩展脚本
│   │   └── src/main.rs                   # Rust 主进程入口
│   ├── package.json                      # 前端依赖配置清单
│   └── vite.config.ts                    # Vite 6 构建配置与别名映射
│
└── desktop/                              # 跨平台桌面端集成工程容器
    └── src-tauri/                        # 桌面端打包配置文件备忘与主构建配置同步
```

---

### 四、 关键技术特性与架构保障机制

1. **水力-结构双向全环耦合自适应优化**：
   - 彻底打破传统工程“先水力定管径、再力学验衬砌”的割裂模式，由 `drainage_engine.py` 串联 `hydrocalc.py` 与 `mechcalc.py`，并在安全系数不满足时由 `optimizedDesign.py` 进行非线性迭代搜索，自动生成安全经济的临界水头与注浆厚度组合。
2. **前后端解耦的现代科技排版引擎 (Typst Pipeline)**：
   - 抛弃易导致依赖地狱的 LaTeX 与无结构的富文本渲染，以后端 Typst 模板引擎为核心，前端提供高清晰交互体验（KaTeX 0.18 + Vue 响应式卡片），导出时秒级生成完全符合国家工程报告规范的纯矢量 PDF。
3. **严格对齐国标的数字化 A3 施工蓝图直出**：
   - 自主研发的 `blueprintGenerator.ts` 将 3D 参数模型投影解构为符合 GB/T 50104-2010 标准的工程图纸，标定 4200×2970 画布分辨率与 1:50~1:200 模数比例尺，实现“计算即出图”。
4. **单 Draw Call 级高性能三维工程渲染**：
   - 通过 Three.js `InstancedMesh`、GPU 着色器顶点位移、Layers 分层通道与双视口同频相机控制，在普通 PC 浏览器及 Tauri 桌面端上均能保持 60 FPS 的工业级交互流畅度。