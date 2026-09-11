<!-- 阶段4-snapshot的特点提取.md -->

# Snapshot 快照数据特征与 3D 可视化读取规范

本文档依据后端核心计算引擎（`tunnel-drainage-platform/backend/app/services/drainage_engine.py`）的最新解算契约与数据结构，全面提炼前端快照（Snapshot）在 3D 几何渲染、状态机控制、数据绑定与分屏比对视图（`CompareView.vue`）中的物理映射与读取规范。

---

## 1. 空间拼装与序列解析 (Spatial Assembly & Sequence Parsing)

* **目标文件路径**：
  * `frontend/src/store/snapshotStore.ts` (数据供应与状态树管理)
  * `frontend/src/components/three/Viewer3D.vue` (渲染调度与画布挂载)

* **约束条件**：3D 多分区网格（Mesh）的拼接需严格遵循真实工程里程坐标，保障空间连续性、拓扑边界对齐与相对位置精准。
* **实现方式**：在 `Viewer3D.vue` 中调用 `snapshotStore.getSequenceDataFor3D(sequenceId)` 提取已按起点里程升序排列的快照指令集。通过 `start_chainage` 确定该段网格在全局 3D 场景中的 Z 轴绝对基准偏移量（Offset Z = `start_chainage`），通过 `end_chainage - start_chainage` 的差值设定单段模型的几何拉伸深度（Extrude Depth / Length）。
* **影响范围**：决定 3D 场景中各隧道分段的全局相对坐标对齐方式、分区边界无缝拼接逻辑及总体隧道物理长度的正确表达。

---

## 2. 三维几何形态参数映射 (3D Geometry Mapping)

* **目标文件路径**：
  * `frontend/src/components/three/TunnelGenerator.ts` (主洞体马蹄形截面、双洞平移与开沟拓扑)
  * `frontend/src/components/three/Reinforcement.ts` (常规/临界注浆圈、锚杆及小导管阵列)
  * `frontend/src/components/three/Viewer3D.vue` (空间坐标对齐与图层控制)

* **约束条件**：隧道物理结构（包含多层衬砌、注浆圈、双洞轴线平移、水沟开挖）需与 `input_parameter` 字典严格保持 1:1 的几何物理映射。
* **实现方式**：
  * **主洞体与双洞推演 (`TunnelGenerator.ts`)**：读取 `tunnel_type` 判定单/双洞模式；提取内半径 $r_0$ (`r`)、二衬外半径 $r_s$ (`r1`)，结合断面高宽比 `aspect_ratio`（默认 0.7/1.0）推演截面总宽 $w = r_1 + r$ 与总高 $h = w \times aspect\_ratio$。衬砌厚度满足 $t_{lining} = r_1 - r$（二衬）与 $t_{primary} = r_2 - r_1$（初支），交由 WebGL 着色器（Shader）偏置挤出。当 `tunnel_type == "double"` 时，以轴线中心距 `D_spacing` 对左右线分别施加 $-D\_spacing/2$ 与 $+D\_spacing/2$ 的 X 轴平移矩阵。当 $r > 5.0\text{m}$ 时，在仰拱底部自动相减开挖 0.6m×0.8m 的中心排水沟。
  * **注浆加固体建模 (`Reinforcement.ts`)**：读取 `rg` 生成初始标准注浆圈网格（厚度 $t_g = r_g - r_2$）。当解析到后端返回 `results.critical_state` 临界解时，提取 `tg_crit`（$t_{g\_crit} = \max(0.0, r_{g\_crit} - r_2)$）构建临界加固注浆圈实体。

* **输入参数几何字典映射表（AI 模型防遗忘映射）**：

| 核心参数字段 | 物理含义与规范名称 (`drainage_engine.py`) | 后端隐式计算/映射逻辑 | 前端 3D 空间建模与位姿驱动应用逻辑 |
| --- | --- | --- | --- |
| `tunnel_type` | 隧道类型标识 (`"single"` / `"double"`) | `parHc.tunnel_type = data.tunnel_type` | 决定 3D 渲染画布是否激活双线隧道。若为 `"double"`，激活右线克隆并应用平移矩阵。 |
| `r` | 隧道开挖内半径 $r_0$ (m) | `parHc.r_0 = data.r`, `parMc.ww = r1 + r` | 驱动 `TunnelGenerator.ts` 中马蹄形三心圆拱内轮廓 Shape 的起始扫描半径。 |
| `r1` | 二次衬砌外半径 $r_s$ (m) | `parHc.r_s = data.r1`, `parMc.tt = r1 - r` | 定义二次衬砌实体网格的外边界轮廓线，二衬厚度 $t_{lining} = r_1 - r$。 |
| `r2` | 初期支护外半径 $r_p$ (m) | `parHc.r_p = data.r2`, 初支厚度 $t_{primary} = r_2 - r_1$ | 作为初期支护与外围注浆圈交界面的几何边界，同时用于计算注浆厚度 $t_g = r_g - r_2$。 |
| `rg` | 初始注浆圈外半径 $r_g$ (m) | `parHc.r_g = data.rg` | 传递至 `Reinforcement.ts`，作为标准（加固前）注浆圈实体网格的几何外圈半径。 |
| `aspect_ratio` | 截面高宽比 ($h/w$)，默认 0.7 | `parMc.hh = ww * aspect_ratio` | 配合宽度 $w=r_1+r$ 控制 3D 截面在 Y 轴向的拉伸比例，决定拱顶与仰拱的几何边界。 |
| `c` / `depth` | 隧道埋深 (m) | `depth = getattr(data, 'c', getattr(data, 'depth', 50.0))` | 传递给 `Environment.ts`，定位地表 `PlaneGeometry` 高程 $Y_{ground} = Y_{crown} + c$。 |
| `ha` | 双洞低水位水头 (m) | 当 `tunnel_type=="double"` 且 `ha>0` 时 `parHc.h_1 = ha` | 双洞工况下驱动左右线水文边界与降深深度的差异化表达。 |
| `D_spacing` | 双洞轴线中心距 (m) | `parHc.D_spacing = data.D_spacing` | 当 `tunnel_type=="double"` 时，作为左右线主副洞网格在 X 轴向的相对平移步进矩阵。 |
| `start_chainage` | 分区起点里程 (m) | `parHc.start_chainage = data.start_chainage` | 转换为 3D 隧道网格在全局场景中的 Z 轴绝对偏移量（Offset Z = `start_chainage`）。 |
| `end_chainage` | 分区终点里程 (m) | `parHc.end_chainage = data.end_chainage` | 差值 `end_chainage - start_chainage` 作为 `ExtrudeGeometry` 的纵向拉伸深度（Depth）。 |
| `d_ring_default` / `d_long_default` / `d_lat_default` | 环向/纵向/横向盲管默认管径 (m) | 映射至 `parHc.d_ring0`, `d_long0`, `d_lat0` | 驱动 `DrainagePipeGenerator.ts` 中 `InstancedMesh` 基础管件单体的预分配物理尺寸。 |

---

## 3. 计算结果与状态机驱动 (Calculation Results & State-Driven)

* **目标文件路径**：
  * `frontend/src/components/three/PostProcessing.ts` (基于全环 24 单元受力与 $K_{list}$ 的云图着色与 3D 探针)
  * `frontend/src/components/three/DrainagePipeGenerator.ts` (盲管阵列与推荐间距动态调整)
  * `frontend/src/components/three/Environment.ts` (水文平面随动与渗漏量 $Q$ 粒子场)
  * `frontend/src/views/CompareView.vue` (双视图分屏联动与标量看板比对)

* **双分支结构解算与状态机响应**：
  引擎根据全环最小安全系数 $nowK$ 与容许安全系数门槛值 `tol_safety_factor`（如 2.0）的比对关系，输出两种形态的快照字典：
  1. **结构安全分支（$nowK > tol\_safety\_factor$）**：
     - 后端仅返回 `input_parameter`、`original_state` 及 `echart_data`（含 `lining_res_original`），不生成 `critical_state` 字典。
     - 前端标记 `hasCriticalState = false`。云图按安全色阶（绿/蓝）渲染，CompareView 画布提示结构安全无须加固。
  2. **结构超限加固分支（$nowK \le tol\_safety\_factor$）**：
     - 后端经过水头步进迭代计算出 `final_waterHead`、`final_safety_factor`，反算临界注浆半径 `rg_crit` 与厚度 `tg_crit`，输出 `critical_state` 与 `echart_data.lining_res_critical`。
     - 前端标记 `hasCriticalState = true`。CompareView 双视图分别挂载 `original_state`（左侧红区预警，原始注浆厚度 $t_g$）与 `critical_state`（右侧安全加固，注浆厚度自动提升为 $t_{g\_crit}$，管网刷新为推荐间距与管径）。

* **解算结果字典映射表（AI 模型防遗忘映射）**：

| 数据节点路径 | 核心变量字段 | 物理含义与数据源 (`drainage_engine.py`) | 前端 3D 渲染与对比视图 (`CompareView.vue`) 应用逻辑 |
| --- | --- | --- | --- |
| `original_state` / `critical_state` | `waterHead` / `final_waterHead` | 原始/临界地下水头高度 (m) | 传递至 `Environment.ts`，驱动 3D 水位面几何体的 Y 轴标高，可视化水位降深。 |
| `original_state` / `critical_state` | `safety_factor` / `final_safety_factor` | 衬砌全环最小安全系数 | 传入 `PostProcessing.ts` 状态机。若低于 `tol_safety_factor` (2.0) 则映射红区警告。 |
| `original_state` / `critical_state` | `control_idx` / `final_control_idx` | 全环最不利受力单元索引 (0~23) | 精确定位 3D 衬砌网格中受力最大的顶点区间，在三维空间高亮挂载 3D 探针与 Tooltip。 |
| `original_state` / `critical_state` | `control_M` / `final_control_M` | 最不利单元控制弯矩 (kN·m) | 传递给 `CompareView.vue` 二维图表与标量看板，实现多维结构弯矩定量比对。 |
| `original_state` / `critical_state` | `control_N` / `final_control_N` | 最不利单元控制轴力 (kN) | 配合弯矩值在前端复核轴力-弯矩包络线，评估衬砌截面承载能力。 |
| `original_state` / `critical_state` | `q` / `Q` | 渗漏量 ($m^3/(d\cdot m)$) / 总渗漏量 ($m^3/d$) | 注入 `Environment.ts` 粒子着色器，总渗漏量 $Q$ 越大，动水流线粒子的运动动画速率越快。 |
| `original_state` / `critical_state` | `P` / `P_crown` / `P_invert` | 综合/拱顶/仰拱外水压力 (kPa) | 驱动 3D 场景中的外水压力矢量箭头分布，并展示拱顶与仰拱水头差异。 |
| `original_state` / `critical_state` | `ring_diam_recommend` / `ring_spacing_recommend` | 推荐环向管径 (m) / 推荐环向管间距 (m) | 优先提取自 `critical_state`（降级至 `original_state`），直接注入 `DrainagePipeGenerator.ts` 改变 InstancedMesh 缩放与间距矩阵。 |
| `critical_state` | `num_iterations` | 容许水头步进迭代次数 (0~1000) | 标识后端从 $H_q$ 搜索临界水头时的收敛步数，充入诊断面板。 |
| `critical_state` | `P_crit_input` | 临界水头对应的临界外水压力 (kPa) | 映射至对比看板，作为该衬砌结构在不加固情况下的极限外水承载门槛。 |
| `critical_state` | `rg_crit` | 临界状态注浆圈外半径 (m) | 定义 3D 场景中极限安全状态下外围加固区域的物理边界半径。 |
| `critical_state` | `tg_crit` | 临界状态注浆圈物理厚度 (m) | 后端公式 $\max(0.0, r_{g\_crit} - r_2)$。直接作为 `Reinforcement.ts` 临界注浆网格的拉伸深度（Extrude Depth）。 |
| `echart_data` | `Hq` | 拱顶坍塌荷载高度 (m) | `mc.calculate_Hq` 解算得出的坍塌水头高度，作为结构荷载与水压计算分界线。 |
| `echart_data` | `lining_res_original` / `lining_res_critical` | 原始/临界状态 24 单元力学全量数组 | 包含全环 $N_{elem}, M_{elem}, K_{list}$ 数组，直接注入着色器 `lining.vert` 驱动 3D 衬砌表面顶点的逐点色阶动态映射。 |

---

## 4. 数据向下兼容与异常降级 (Backward Compatibility & Fallback)

* **目标文件路径**：
  * `frontend/src/components/three/Viewer3D.vue` (入口数据拦截与线框模式降级)
  * `frontend/src/store/snapshotStore.ts` (链式取值与默认参数兜底)

* **约束条件**：防御脏数据、未计算状态（pending）、缺省字段或历史快照对 3D 渲染主循环（Render Loop）造成的崩溃性破坏。
* **实现方式**：
  * **多级取值降级链**：前端提取快照字段时，必须严格执行链式降级规范：
    `snap.results?.critical_state?.[key] ?? snap.results?.original_state?.[key] ?? snap.results?.input_parameter?.[key] ?? snap.params?.[key] ?? snap[key] ?? 默认默认值`
  * **状态机前置过滤**：在挂载 3D 实体前校验 `snap.status === 'done'` 且 `snap.results` 非空。若为 `'pending'`（待计算状态），强制将对应网格拦截并降级为线框模式（Wireframe）或灰色基础材质，且在画布顶层展示预警横幅。
* **影响范围**：切断局部数据空窗期对 WebGL 渲染上下文的破坏，保证 Three.js 场景构建在任何极端异常状态下均具备极高的鲁棒性。