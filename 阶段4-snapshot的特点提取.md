## Snapshot 快照数据特征与读取规范

### 1. 空间拼装与序列解析 (Spatial Assembly & Sequence Parsing)

* **目标文件路径**：
* `frontend/src/store/snapshotStore.ts` (数据供应)
* `frontend/src/components/three/Viewer3D.vue` (渲染调度)


* **约束条件**：3D 多分区网格（Mesh）的拼接需严格遵循真实里程坐标，保障空间连续性与相对位置精准。
* **实现方式**：在 `Viewer3D.vue` 中调用 `getSequenceDataFor3D(sequenceId)` 提取已按升序排列的指令集。通过 `start_chainage` 确定该段网格的 Z 轴基准绝对偏移量（Offset Z），通过 `end_chainage - start_chainage` 的差值设定单段模型的挤出深度（Extrude Depth / Length）。
* **影响范围**：决定 3D 场景中各隧道分段的全局相对坐标对齐方式、边界融合逻辑及整体隧道长度的正确性。

根据最小化修改原则与工程化表达规范，以下为您补充【2. 三维几何形态参数映射】部分的参数解析规范。该版本严格提炼自 Schemas.py 中的输入参数模型与 drainage_engine.py 的隐式几何转换逻辑，为 AI 模型建立明确的几何参数防遗忘映射体系。

---

### 2. 三维几何形态参数映射 (3D Geometry Mapping)

* **目标文件路径**：
    * frontend/src/components/three/TunnelGenerator.ts (主洞体与截面生成)
    * frontend/src/components/three/Reinforcement.ts (附属结构生成)
    * frontend/src/components/three/Viewer3D.vue (空间坐标对齐)


* **约束条件**：隧道物理结构（包含多层衬砌、注浆圈、双洞相对位姿）需与参数字典严格保持 1:1 的几何映射关系。
* **实现方式**：
    * **主洞体推演 (TunnelGenerator.ts)**：读取 tunnel_type 判定洞型；提取等效内径 r，结合基准参数推演截面高度（h = r * aspect_ratio，默认比例 0.7）；初支/二衬几何厚度基于 t = r1 - r 构建。若判定为双洞模式（double），基于 D_spacing 对副洞施加 X 轴平移矩阵。
    * **外围加固圈 (Reinforcement.ts)**：优先读取 rg 参数生成标准注浆圈。若存在临界计算结果，读取 results.critical_state.tg_crit 构建临界注浆圈几何体厚度。


    * **影响范围**：直接改变 3D 剖面挤出（ExtrudeGeometry）的内外轮廓生成方程、顶点法线计算以及双线隧道的轴侧间距。
    * **新增：几何输入参数解析规范（AI 模型防遗忘映射表）**：
为保障 3D 模型在多分区生成、分屏对比视图中的空间几何连续性与尺寸一致性，对输入参数的几何字段建立如下强映射规范：

| 核心参数字段 | 物理含义与数据规范 (Schemas) | 隐式转换关系 (Backend) | 前端 3D 空间建模与位姿驱动应用逻辑 (Frontend) |
| --- | --- | --- | --- |
| tunnel_type | 隧道类型标识 ("single" / "double") | is_double = (type == "double") | 决定 3D 渲染画布是否激活双线隧道实例。若为 double，则触发副洞（Right Tube）的克隆与矩阵平移。 |
| r | 隧道等效内半径 (m) | 隐式定义隧道宽度 w = r | 驱动 TunnelGenerator.ts 中马蹄形内轮廓线（Shape）的起始扫描半径，为 3D 挤出实体提供基础内径。 |
| aspect_ratio | 隧道高宽比 (h/w)，默认 0.7 | 隐式推演隧道高度 h = r * aspect_ratio | 配合内径 r 共同控制 3D 截面在 Y 轴向的拉伸比例，决定隧道拱顶与仰拱的几何边界。 |
| r1 | 二次衬砌外半径 (m) | 参与计算结构总厚度 t = r1 - r | 在 3D 拓扑中定义二次衬砌实体网格的外边界轮廓线。 |
| r2 | 初期支护外半径 (m) | 决定临界厚度基准：tg_crit = rg_crit - r2 | 在 3D 空间中作为初期支护与外围注浆圈交界面的几何半径线。 |
| rg | 原始注浆圈外半径 (m) | 对应原始工况注浆边界 | 传递至 Reinforcement.ts，作为标准（加固前）注浆圈实体网格的几何外圈半径。 |
| c | 隧道埋深 (m) | 内部对齐变量 depth = c | 传递给 Environment.ts，定义地下水位面、地形开挖面与隧道中心线在 3D 全局 Y 轴上的相对高程距离。 |
| start_chainage | 分区起点里程 (m) | 纵向空间定位基准面 | 转换为该分区 3D 隧道网格在全局场景中的 Z 轴绝对偏移量（Offset Z = start_chainage）。 |
| end_chainage | 分区终点里程 (m) | 与起点里程共同约束空间跨度 | 差值 end_chainage - start_chainage 作为 ExtrudeGeometry 的横截面拉伸深度（Depth），决定单段 3D 模型的物理长度。 |
| D_spacing | 双洞中心距 (m) | 双线模型平移权值 | 当 tunnel_type == "double" 时，该值作为副洞网格相对于主洞在 3D 场景全局 X 轴上的左/右平移矩阵参数。 |

---

### 3. 计算结果与状态机驱动 (Calculation Results & State-Driven)

* **目标文件路径**：
    * frontend/src/components/three/PostProcessing.ts (状态与材质着色)
    * frontend/src/components/three/DrainagePipeGenerator.ts (管网布局)
    * frontend/src/components/three/Environment.ts (水环境表现)
    * frontend/src/views/CompareView.vue (新增：3D 分屏对比数据流)


* **约束条件**：3D 视觉表达与附属设施的分布，需动态反映后端计算引擎返回的物理验证状态（安全预警、水量、建议管径等）。
* **实现方式**：
    * **安全系数云图 (PostProcessing.ts)**：解析快照属性树，若存在 results.critical_state 即判定为原始状态不达标（安全系数小于 2.0），触发危险色系（红色警告）着色；否则读取 original_state 的系数进行正常色阶映射。
    * **管网阵列排布 (DrainagePipeGenerator.ts)**：优先从 critical_state（降级至 original_state）读取 ring_spacing_recommend 与 ring_diam_recommend，将参数注入 InstancedMesh 的位姿矩阵运算中，动态调整环向排水盲管的阵列密度与管道半径。
    * **渗漏特效 (Environment.ts)**：提取渗漏量 Q 变量，作为地下水头高度跟随与水流模拟着色器（Shaders）中粒子运动速率的控制阈值。


    * **影响范围**：决定后期处理管道的安全色谱渲染、材质系统的动态纹理速率，以及排水管件等大批量实例网格的最终生成数量。
    * **计算结果结构化数据解析规范（AI 模型防遗忘映射表）**：
为保障 3D 场景、图表渲染及分屏对比视图 (CompareView.vue) 在调度快照数据时的准确性，对后端返回的 results 内部字段建立如下强映射规范：

| 数据节点路径 | 核心变量字段 | 物理含义与数据源 (Backend) | 前端 3D 渲染与对比视图应用逻辑 (Frontend) |
| --- | --- | --- | --- |
| original_state / critical_state | waterHead / final_waterHead | 原始/临界地下水头高度 (m) | 传递至 Environment.ts，驱动 3D 水位面几何体的垂直高度，用于直观比对两种工况下的水位线降深。 |
| original_state / critical_state | safety_factor / final_safety_factor | 衬砌全环最不利点安全系数 | 传入 PostProcessing.ts 作为状态机判定阈值。小于 tol_safety_factor (2.0) 时映射红色警告，用于对比视图的色彩高亮。 |
| original_state / critical_state | control_M / final_control_M | 最不利受力点的控制弯矩 (kN·m) | 传递给 CompareView.vue 的二维图表组件，用于结构承载力极限状态的多维曲线定量对比。 |
| original_state / critical_state | control_N / final_control_N | 最不利受力点的控制轴力 (kN) | 配合弯矩值，在前端复核力学包络线状态，评估各分区衬砌结构的绝对受力负荷。 |
| original_state / critical_state | control_idx / final_control_idx | 最不利受力点在全环的单元索引 | 精确定位 3D 衬砌网格中受力最大或发生破坏的顶点区间，用于在三维空间中挂载标注标签。 |
| original_state / critical_state | q / Q | 渗漏量 (m³/(d·m)) / 总渗漏量 (m³/d) | 作为粒子着色器的速率控制参数，总渗漏量 Q 越大，Environment.ts 中动水流线粒子的运动动画越快。 |
| original_state / critical_state | P / P_crown / P_invert | 综合/拱顶/仰拱外水压力 (kPa) | 用于动态生成 3D 场景中的荷载矢量箭头，直观展示不同工况下全环水压力的空间分布。 |
| original_state / critical_state | ring_diam_recommend / ring_spacing_recommend | 推荐环向管径 (m) / 推荐环向管间距 (m) | 直接注入 DrainagePipeGenerator.ts 阵列算法，改变实例网格的缩放系数与排布间距。 |
| critical_state | P_crit_input | 结构恰好达到容许安全系数时的临界外水压力 (kPa) | 映射到对比看板，作为该分区隧道衬砌结构在不加固情况下的极限外水承载力指标。 |
| critical_state | rg_crit | 临界状态下的注浆圈外半径 (m) | 定义 3D 场景中极限安全状态下加固区域的实体外边界半径约束。 |
| critical_state | tg_crit | 临界状态下的注浆圈几何体厚度 (m) | 计算公式为 max(0.0, rg_crit - par.r2)。直接作为 Reinforcement.ts 渲染网格的挤出厚度参数（Extrude Depth），生成临界注浆圈实体。 |
| echart_data | lining_res_original / lining_res_critical | 原始/临界状态全环力学解算全量数据 | 包含全环各单元的内力数组，用于绘制 Echarts 完整内力图，并支持 3D 云图顶点的逐点色阶动态映射。 |







### 4. 数据向下兼容与异常降级 (Backward Compatibility & Fallback)

* **目标文件路径**：
* `frontend/src/components/three/Viewer3D.vue` (入口拦截)
* `frontend/src/store/parameterStore.ts` (默认值兜底)


* **约束条件**：需防御脏数据、缺省计算结果或旧版本快照字段对 3D 渲染主循环（Render Loop）造成的崩溃性破坏。
* **实现方式**：
* **里程与参数读取链路**：执行强制降级规范，即 `snap.results?.input_parameter?.[key] ?? snap.params?.[key] ?? snap[key] ?? 默认参数`，保证取值必有闭环。
* **状态机前置过滤**：渲染该快照对应的网格前，检查 `snap.status` 是否为 `'done'` 且 `snap.results` 非空。若为 `'pending'`（待计算状态），则拦截物理参数解析流，强制将对应网格降级为线框模式（Wireframe）或默认灰色基础材质。


* **影响范围**：隔离因部分区间未执行一键计算而产生的数据空窗期，确保 Three.js 场景构建上下文的鲁棒性。