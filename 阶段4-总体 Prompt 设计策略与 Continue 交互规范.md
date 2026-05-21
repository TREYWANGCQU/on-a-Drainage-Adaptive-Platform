

### 关于多批次重复操作同一目标文件的技术说明

在依托 Continue 插件进行三维渲染模块代码生成时，设计多个批次重复修改同一个目标文件（如 `TunnelGenerator.ts`），其工程化考量主要包含以下三个维度：

1. **规避 LLM 输出窗口截断与“偷懒”行为**
`TunnelGenerator.ts` 承载了截面几何解算、Shader 材质注入、显存预分配以及 `InstancedMesh` 矩阵遍历等多项复杂逻辑，单文件完整代码通常达数百行。若在单次 Prompt 中要求生成全部功能，极易触发 LLM 的 Token 输出极限，导致其使用 `// ...现有代码...` 或 `// 保持原有逻辑不变` 进行局部省略。分批次要求输出完整文件，可确保每一核心功能段均获得充分的 Token 预算。
2. **控制上下文依赖规模（Separation of Concerns）**
不同功能开发所需的外部上下文（Context Providers）存在差异。批次二构建基础几何体时，仅需依赖数学计算库与截面尺寸规范；而批次三处理实例化矩阵更新时，则需深度引入前端状态总线（`snapshotStore.ts`）的计算结果与降级读取链路。分批次操作允许在每次交互中精准使用 `@Files` 注入最相关的依赖，避免无关上下文造成的 Token 污染与逻辑混淆。
3. **维护增量代码的契约对齐**
分步注入有利于逐步确立内部接口契约。例如，批次二首先在 `TunnelGenerator.ts` 中确立了通过着色器暴露 `uniform` 变量进行分层挤出的材质结构，批次三则在此材质结构基础上追加 `InstancedMesh` 的动态矩阵覆写。后一批次在已知前一批次确立的代码结构下进行增量重构，能有效避免因多变量并发生成导致的方法签名或空间拓扑失配。

---

# 阶段4-总体 Prompt 设计策略与 Continue 交互规范

为保障在 Continue 插件中进行 3D 渲染模块代码生成时，不出现上下文遗忘、逻辑截断或偏离工程基准，采取“分层解耦、依赖注入、约束前置”的 Prompt 设计策略。

以下基于《阶段4-工程方案》，梳理出 Continue 插件 Step-by-Step Prompt 设计指南及标准模板库。

### 总体 Prompt 设计策略与 Continue 交互规范

1. **利用上下文组装（Context Providers）**：在输入框中精准使用 `@Files` 引入上游依赖文件，严控 Token 规模，防止全局检索引发干扰。
2. **遵守单文件生成原则（Single File Generation）**：每个 Prompt 要求 LLM 集中更新 **1 个目标文件**的完整内容，通过分批次演进逐步扩展其内部逻辑。
3. **闭环输出约束（No Truncation Constraint）**：在每一个 Prompt 尾部硬性声明输出格式规范，禁止局部省略。

---

### Step-by-Step 代码生成拆解路径与 Prompt 模板

按照“数据流驱动”与“显存预分配”的工程逻辑，分 5 个批次进行代码生成：

#### 批次一：状态总线与拦截机制注入 (State & Store)

**目标文件**：`tunnel-drainage-platform/frontend/src/store/snapshotStore.ts`、`parameterStore.ts`、`ParameterForm.vue`

**Continue Prompt：**

```markdown
@frontend/src/store/parameterStore.ts 
@frontend/src/store/snapshotStore.ts
@frontend/src/components/ui/ParameterForm.vue

执行任务：
依据[阶段4-工程方案]中的【三、数据交换与双向绑定控制逻辑机制】，完善前端状态机的数据总线通信与脏数据拦截机制。

约束条件与实现方式：
1. 【表单拦截】：在 `ParameterForm.vue` 中，针对所有输入控件（如 `<el-input>`, `<el-slider>`）绑定的 `onChange` 或 `onUpdate:modelValue` 事件，触发 `parameterStore.updateParam` 逻辑。
2. 【脏状态更新】：在 `parameterStore.ts` 的 `updateParam` action 中，注入拦截逻辑：一旦数值发生人为修改，同步将 `isDirty` 置为 `true`，并销毁 `currentComputedResult` 缓存（设为 null）。
3. 【空间序列供给】：在 `snapshotStore.ts` 中实现 `getSequenceDataFor3D(sequenceId: string)` 方法，负责提取聚合序列，并强制执行 `sort((a, b) => a.start_chainage - b.start_chainage)` 以升序返回包含完整里程与参数结果的快照序列，保障多分区网格空间拼接的里程连续性。

输出与格式严格要求（Cheat Sheet 规则）：
1. 【反截断】：禁止使用 `// ...现有代码...` 或 `// implement logic here`。你必须输出这三个文件的完整内容（从 import 到文件结束）。
2. 【最小化修改】：绝不允许修改 `parameterStore.ts` 中已定义的隧道参数及默认高级参数结构。
3. 【工程化注释】：在拦截点（Dirty Flag 触发处）与序列供给处（sort 逻辑处）添加简短的工程化注释，指明“影响范围：切断陈旧结果与空间几何的视觉映射链路”。
4. 在代码块头部标明目标文件路径（如 `// frontend/src/store/parameterStore.ts`）。

```

#### 批次二：底层数学库与几何轮廓生成 (Math & Geometry)

**目标文件**：`tunnel-drainage-platform/frontend/src/utils/math.ts`、`tunnel-drainage-platform/frontend/src/components/three/TunnelGenerator.ts`

**Continue Prompt：**

```markdown
@tunnel-drainage-platform/frontend/src/components/three/TunnelGenerator.ts
@tunnel-drainage-platform/frontend/src/utils/math.ts

执行任务：
修改完善 `TunnelGenerator.ts` 与 `math.ts` 中的基准几何体构建与多层衬砌空间拓扑拆解逻辑。

约束条件与实现方式：
1. 【数学截面解算】：在 `TunnelGenerator.ts` 中解析等效内半径 `r` 与高宽比 `aspect_ratio`。计算马蹄形三心圆拱转换系数：上半圆拱半径 R1 = 1.05r，侧墙过渡圆弧半径 R2 = 0.65r，仰拱半径 R3 = 1.8r。利用 `THREE.Shape` 闭合生成二维轮廓。调整垂直向控制点高度，使开挖断面总高度 h 与总宽度 w 满足 h = w * aspect_ratio。
2. 【双洞空间排布】：读取 `tunnel_type` 参数。若判定为 `TunnelType.DOUBLE`，则利用双洞中心距 `D_spacing` 参数，分别对左线全路径施加 -D_spacing / 2 的 X 轴平移，对右线全路径施加 +D_spacing / 2 的 X 轴平移。
3. 【动态开沟判定】：设定水沟触发阈值为 5.0 米。当 r > 5.0 米时，在仰拱底面局部坐标中心叠加一个宽 0.6 米、深 0.8 米的 `THREE.Path` 矩形路径并推入 `Shape.holes` 数组；若 r <= 5.0 米则跳过，保持 `Shape.holes` 为空。
4. 【多层衬砌拉伸与材质注入】：通过 `THREE.ExtrudeGeometry` 沿 Z 轴拉伸 1 个标准单位长度，应用 `geometry.rotateZ(Math.PI / 2)` 矫正局部轴向。配置 `THREE.ShaderMaterial` 关联自定义着色器文件（目标路径：`frontend/src/assets/shaders/lining.vert` 与 `lining.frag`），将 r（内半径）、r1（二衬外半径）、r2（初支外半径）、rg（注浆圈外半径）作为 uniform 变量暴露，供顶点着色器执行分层偏置挤出。
5. 【埋深定位】：提取隧道埋深参数 c。在世界坐标系中，以当前分区隧道拱顶的 Y 轴坐标为基准，计算地面基准线高度 Y_ground = Y_crown + c，精确定位代表地表面的 `PlaneGeometry`。

输出与格式严格要求：
1. 【反截断】：禁止使用省略号或跳过任何逻辑分支，输出完整的 `TunnelGenerator.ts` 与 `math.ts` 几何体生成及材质配置代码。
2. 采用 TypeScript 强类型定义，在代码块头部标明目标文件路径。

```

#### 批次三：显存分配与实例化矩阵推演 (InstancedMesh Pipeline)

**目标文件**：`tunnel-drainage-platform/frontend/src/components/three/TunnelGenerator.ts`、`DrainagePipeGenerator.ts`、`Reinforcement.ts`

**Continue Prompt：**

```markdown
@tunnel-drainage-platform/frontend/src/components/three/TunnelGenerator.ts
@tunnel-drainage-platform/frontend/src/components/three/DrainagePipeGenerator.ts
@tunnel-drainage-platform/frontend/src/components/three/Reinforcement.ts
@tunnel-drainage-platform/frontend/src/utils/math.ts

执行任务：
实现基于显存预分配的 `InstancedMesh` 实例化构件（衬砌、排水管、锚杆、超前导管）矩阵更新逻辑。

约束条件与实现方式：
1. 【极值计算与预分配】：读取分区起点里程（start_chainage）与终点里程（end_chainage），计算设计纵深里程 L_max = end_chainage - start_chainage。结合最小排布间距（delta_l_min），按公式 N_max = ceil(L_max / delta_l_min) * C_ring 申请连续显存空间，实例化 `THREE.InstancedMesh`，并调用 `mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)`。
2. 【降级链路读取】：遍历活跃实例时，解析控制字段优先从 `results.critical_state` 读取 `ring_spacing_recommend` 与 `ring_diam_recommend`，缺失时按 `snap.results?.input_parameter?.[key] ?? snap.params?.[key] ?? snap[key]` 链路降级读取 `original_state` 或默认值。
3. 【空间仿射变换】：利用 `math.ts` 求解当前实例的世界坐标平移向量 T、通过计算曲面法向量并转换为四元数求取旋转矩阵 R（规避万向节死锁）、以及缩放因子 S，构建 4x4 仿射变换矩阵 M = T * R * S，通过 `mesh.setMatrixAt(i, M)` 写入。
4. 【辅助构件纯规则驱动】：在 `Reinforcement.ts` 中，锚杆和超前导管完全继承后端传入的环向间距（bolt_pitch_x）、纵向排距（bolt_pitch_z）、锚杆长度（bolt_length）、导管外插角（conduit_angle）执行矩阵推演。锚杆在拱顶特定角度扇区内阵列生成；超前导管在分区起点断面外轮廓沿 Z 轴施加基于外插角的旋转矩阵。
5. 【脏标记提交】：矩阵遍历结束后，执行 `mesh.instanceMatrix.needsUpdate = true` 以便将数据批量传输至 GPU VRAM，通过动态控制 `mesh.count = n_current` 物理丢弃冗余实例。

输出与格式严格要求：
1. 输出完整的类或函数更新体，杜绝使用省略号。代码结构遵循：获取参数 -> 预分配校验 -> 降级链解析 -> 循环矩阵推演 -> 提交脏标记。

```

#### 批次四：三维画布根节点接管与降级挂载 (Canvas & Render Loop)

**目标文件**：`tunnel-drainage-platform/frontend/src/components/three/Viewer3D.vue`、`Environment.ts`

**Continue Prompt：**

```markdown
@tunnel-drainage-platform/frontend/src/components/three/Viewer3D.vue
@tunnel-drainage-platform/frontend/src/components/three/Environment.ts
@tunnel-drainage-platform/frontend/src/store/snapshotStore.ts

执行任务：
构建 `Viewer3D.vue` 根节点渲染循环、多图层管理、基础交互工具链与水文环境随动系统。

约束条件与实现方式：
1. 【渲染器初始化】：在 `onMounted` 中初始化 `WebGLRenderer`，开启 `antialias: true` 与 `logarithmicDepthBuffer: true`（防止隧道深长结构的 Z-Fighting），调用 `setPixelRatio` 处理高分屏。
2. 【数据监听与线框降级】：监听 `snapshotStore` 的数据变化，调用 `getSequenceDataFor3D`。前置校验 `snap.status === 'done'`，若为 'pending'（待计算状态），拦截物理参数解析流，对该网格强制设置 `material.wireframe = true` 进行线框模式降级。利用 `requestAnimationFrame` 合并高频状态变更。
3. 【多图层显示/隐藏控制】：利用 `Object3D.layers` 标量掩码机制分配通道（Layer 0: 环境地形, Layer 1: 二衬, Layer 2: 初支, Layer 3: 注浆圈, Layer 4: 锚杆, Layer 5: 超前导管）。UI 层的 Toggle 切换通过 `camera.layers.toggle(layerIndex)` 实现。
4. 【交互工具链实现】：
   - 【视点复位】：通过硬编码默认镜头状态向量 P_default 与目标观察点 T_default，利用插值函数在 500ms 内平滑过渡，随后激活控制器更新。
   - 【截面剖切】：配置 `renderer.localClippingEnabled = true`，实例化三个标准剖切平面 `THREE.Plane` 挂载至全局材质，通过 UI 滑块修改 `plane.constant`。
   - 【空间测距】：利用 `Raycaster` 射线检测实体网格获取两次点击的交点坐标，计算绝对欧氏距离，通过 `CSS2DRenderer` 在线段中心挂载 HTML 文本标签。
5. 【水位平面参数建模】：在 `Environment.ts` 中创建大型 `THREE.PlaneGeometry`，垂直向 Y 轴坐标直接绑定地下水头标高参数。在片段着色器中引入时间变量 `uTime` 滚动的噪点纹理，并利用 Alpha 混合来实现淹没区域的视觉警示。

输出与格式严格要求：
1. 输出 `Viewer3D.vue` 的完整 `<script setup lang="ts">` 部分与 `Environment.ts` 的完整逻辑，确保在 `onBeforeUnmount` 中释放 WebGL 资源。

```

#### 批次五：附加视觉表现与 GPU 着色器 (Shaders & Post-Processing)

**目标文件**：`tunnel-drainage-platform/frontend/src/components/three/PostProcessing.ts`、`frontend/src/assets/shaders/`（相关着色器文件）

**Continue Prompt：**

```markdown
@tunnel-drainage-platform/frontend/src/components/three/PostProcessing.ts
@tunnel-drainage-platform/frontend/src/store/parameterStore.ts

执行任务：
实现基于 `EffectComposer` 的后期处理管道、屏幕空间环境光遮蔽（SSAO）及安全系数云图拾取探针系统。

约束条件与实现方式：
1. 【安全系数云图着色器】：系统解析快照属性树。若检测到 `results.critical_state` 且 `safety_factor < 2.0`，触发红色警报色系映射；若仅存在 `original_state`，执行正常色阶映射。生成的 RGB 顶点颜色直接注入几何体。
2. 【着色器脏标记拦截】：在自定义着色器逻辑中，引入 `parameterStore.isDirty` 状态管控。一旦侦测到脏标记（值为 true），立即挂起（Suspend）云图着色器更新队列，冻结视觉呈现。
3. 【空间拾取探针】：实例化 `THREE.Raycaster` 并利用 BVH（Bounding Volume Hierarchy）加速包围盒进行射线求交检测。选中有效实体时，从数据缓冲中提取当前顶点的具体标量应力值，驱动 DOM 层面的 HTML 浮动标签（Tooltip）跟随。
4. 【后期处理管线层叠】：在渲染器基础上封装 `EffectComposer`。引入 `SSAO` Pass（屏幕空间环境光遮蔽），分析深度缓冲动态生成接触阴影。启用轮廓描边着色器（Outline Pass），当选中特定排水管段或锚杆时，将索引加入选中列表使其边缘发光，替代材质替换。

输出与格式严格要求：
1. 输出 `PostProcessing.ts` 完整代码及对应的着色器修改逻辑。代码需具备独立的初始化、更新（update）与资源销毁（dispose）对外接口。

```

---

### 保障代码完备性的防御性 Prompt 技巧（Cheat Sheet）

在 Continue 的对话框或系统提示词（System Prompt）中，常驻以下指令以避免代码丢失：

1. **反截断声明**：`"Do not use comments like '// implement logic here' or '// existing code'. Output the entire file content from import statements to the final closing bracket."`
2. **强制路径指定**：`"在生成或修改代码时，必须在代码块第一行以注释形式明确标明目标文件的绝对或相对物理路径（如 // frontend/src/components/three/TunnelGenerator.ts），严禁省略。"`
3. **接口契约验证**：`"涉及跨文件调用（如 TunnelGenerator 调用 math.ts 中的矩阵变换方程）时，必须严格核对依赖文件暴露的 interface 与函数签名，若发生参数缺失，必须执行链式降级链路处理，严禁擅自改动依赖文件的既有结构。"`