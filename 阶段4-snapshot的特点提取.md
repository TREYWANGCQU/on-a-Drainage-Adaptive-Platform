## Snapshot 快照数据特征与读取规范

### 1. 空间拼装与序列解析 (Spatial Assembly & Sequence Parsing)

* **目标文件路径**：
* `frontend/src/store/snapshotStore.ts` (数据供应)
* `frontend/src/components/three/Viewer3D.vue` (渲染调度)


* **约束条件**：3D 多分区网格（Mesh）的拼接需严格遵循真实里程坐标，保障空间连续性与相对位置精准。
* **实现方式**：在 `Viewer3D.vue` 中调用 `getSequenceDataFor3D(sequenceId)` 提取已按升序排列的指令集。通过 `start_chainage` 确定该段网格的 Z 轴基准绝对偏移量（Offset Z），通过 `end_chainage - start_chainage` 的差值设定单段模型的挤出深度（Extrude Depth / Length）。
* **影响范围**：决定 3D 场景中各隧道分段的全局相对坐标对齐方式、边界融合逻辑及整体隧道长度的正确性。

### 2. 三维几何形态参数映射 (3D Geometry Mapping)

* **目标文件路径**：
* `frontend/src/components/three/TunnelGenerator.ts` (主洞体与截面生成)
* `frontend/src/components/three/Reinforcement.ts` (附属结构生成)


* **约束条件**：隧道物理结构（包含多层衬砌、注浆圈、双洞相对位姿）需与参数字典严格保持 1:1 的几何映射关系。
* **实现方式**：
* **主洞体推演 (`TunnelGenerator.ts`)**：读取 `tunnel_type` 判定洞型；提取等效内径 `r`，结合基准参数推演截面高度（`h = r * aspect_ratio`，默认比例 0.7）；初支/二衬几何厚度基于 `t = r1 - r` 构建。若判定为双洞模式（`double`），基于 `D_spacing` 对副洞施加 X 轴平移矩阵。
* **外围加固圈 (`Reinforcement.ts`)**：优先读取 `rg` 参数生成标准注浆圈。若存在临界计算结果，读取 `results.critical_state.tg_crit` 构建临界注浆圈几何体厚度。


* **影响范围**：直接改变 3D 剖面挤出（ExtrudeGeometry）的内外轮廓生成方程、顶点法线计算以及双线隧道的轴侧间距。

### 3. 计算结果与状态机驱动 (Calculation Results & State-Driven)

* **目标文件路径**：
* `frontend/src/components/three/PostProcessing.ts` (状态与材质着色)
* `frontend/src/components/three/DrainagePipeGenerator.ts` (管网布局)
* `frontend/src/components/three/Environment.ts` (水环境表现)


* **约束条件**：3D 视觉表达与附属设施的分布，需动态反映后端计算引擎返回的物理验证状态（安全预警、水量、建议管径等）。
* **实现方式**：
* **安全系数云图 (`PostProcessing.ts`)**：解析快照属性树，若存在 `results.critical_state` 即判定为原始状态不达标（安全系数 `< 2.0`），触发危险色系（红色警告）着色；否则读取 `original_state` 的系数进行正常色阶映射。
* **管网阵列排布 (`DrainagePipeGenerator.ts`)**：优先从 `critical_state`（降级至 `original_state`）读取 `ring_spacing_recommend` 与 `ring_diam_recommend`，将参数注入 InstancedMesh 的位姿矩阵运算中，动态调整环向排水盲管的阵列密度与管道半径。
* **渗漏特效 (`Environment.ts`)**：提取渗漏量 `Q` 变量，作为地下水头高度跟随与水流模拟着色器（Shaders）中粒子运动速率的控制阈值。


* **影响范围**：决定后期处理管道的安全色谱渲染、材质系统的动态纹理速率，以及排水管件等大批量实例网格的最终生成数量。

### 4. 数据向下兼容与异常降级 (Backward Compatibility & Fallback)

* **目标文件路径**：
* `frontend/src/components/three/Viewer3D.vue` (入口拦截)
* `frontend/src/store/parameterStore.ts` (默认值兜底)


* **约束条件**：需防御脏数据、缺省计算结果或旧版本快照字段对 3D 渲染主循环（Render Loop）造成的崩溃性破坏。
* **实现方式**：
* **里程与参数读取链路**：执行强制降级规范，即 `snap.results?.input_parameter?.[key] ?? snap.params?.[key] ?? snap[key] ?? 默认参数`，保证取值必有闭环。
* **状态机前置过滤**：渲染该快照对应的网格前，检查 `snap.status` 是否为 `'done'` 且 `snap.results` 非空。若为 `'pending'`（待计算状态），则拦截物理参数解析流，强制将对应网格降级为线框模式（Wireframe）或默认灰色基础材质。


* **影响范围**：隔离因部分区间未执行一键计算而产生的数据空窗期，确保 Three.js 场景构建上下文的鲁棒性。