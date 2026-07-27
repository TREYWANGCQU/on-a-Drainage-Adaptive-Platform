<!-- 阶段4-3D可视化交互工程方案.md -->

# 【阶段4-工程方案】：3D 可视化映射与交互开发深化设计 (第 3-4 周)

## 一、 总体工程架构与设计基准

此阶段任务为确立前端状态机、UI 交互与底层 WebGL 渲染管线的物理映射关系。系统采用“数据驱动显存缓冲（Data-Driven Buffer）”的原生架构，替代传统 DOM 驱动下的“销毁-重建”渲染模式。系统依据单一数据源（Single Source of Truth）原则，严格对接后端解算引擎（`tunnel-drainage-platform/backend/app/services/drainage_engine.py`），将水力-结构耦合计算输出的快照字典精确分发至对应的 3D 渲染着色器与几何体缓冲中。

### 1.1 核心文件物理拓扑定位

为保障代码库的长期可维护性与职责单一原则，三维模块的文件层级结构作如下硬性规定，各项建模参数与逻辑严格归口：

* **三维画布根节点**：`frontend/src/components/three/Viewer3D.vue`。负责 Vue 响应式生命周期与 Three.js 渲染管线的桥接、Layer 图层显隐控制与脏数据挂起。
* **分屏对比视图**：`frontend/src/views/CompareView.vue`。负责原始工况（`original_state`）与临界加固工况（`critical_state`）多维快照数据的并行渲染调度、双视图相机同频同步以及受力性能图表比对。
* **隧道主体与管网建模**：`frontend/src/components/three/TunnelGenerator.ts`。归集衬砌几何体生成、马蹄形三心圆拱算法、双洞中心线平移与中心排水沟拓扑开挖。
* **排水管网阵列矩阵**：`frontend/src/components/three/DrainagePipeGenerator.ts`。负责环向、纵向、横向排水管的基础单体构建与 InstancedMesh 仿射变换矩阵推演（动态映射推荐管间距与管径）。
* **支护体系建模**：`frontend/src/components/three/Reinforcement.ts`。负责常规注浆圈（$t_g = r_g - r_2$）、临界注浆圈（$t_{g\_crit} = r_{g\_crit} - r_2$）、系统锚杆及超前小导管等控制参数的几何体生成与空间位姿解算。
* **水文环境建模**：`frontend/src/components/three/Environment.ts`。专职处理 3D 水位面（`waterHead` / `final_waterHead`）表达、渗漏量 $Q$ 驱动的动水流线粒子场生成及地下水头高度的随动逻辑。
* **数据交换与状态拦截**：`frontend/src/store/parameterStore.ts` 联合 `snapshotStore.ts`。负责前端表单状态机管理、脏数据拦截（Dirty Flag）机制的精准触发，以及执行 `drainage_engine.py` 解算结果向下游渲染器的单向数据流分发。
* **视觉后处理与探针**：`frontend/src/components/three/PostProcessing.ts`。接管基于全环 24 单元应力与安全系数 $K_{list}$ 的云图着色、最不利点（`control_idx` / `final_control_idx`）空间拾取探针、边缘泛光（Outline Pass）及屏幕空间环境光遮蔽（SSAO）。
* **底层数学库**：`frontend/src/utils/math.ts`。处理 4x4 仿射变换矩阵构建、法向量推导、四元数转动及复杂截面曲线方程。
* **底层渲染着色器**：`frontend/src/assets/shaders/`。集中管理初支、二衬及围岩应力云图的自定义顶点着色器（`lining.vert`）与片元着色器（`lining.frag`），通过 WebGL 原生 Shader 提升复杂标量场的渲染效率。

### 1.2 后端解算引擎 (`drainage_engine.py`) 数据契约与 3D 物理映射

前端三维渲染管线的数据输入严格对应 `drainage_engine.py` 中 `run_calculation(data)` 函数的返回数据结构。引擎根据全环最小安全系数 $nowK$ 与容许安全系数 $tol\_safety\_factor$ 的比对关系，输出单/双分支快照字典：

#### 1. 入参字典 (`input_parameter`) 映射
* $r_0$ (`r`)：隧道开挖内半径（m）
* $r_s$ (`r1`)：二衬外半径（m），衍生二衬厚度 $t_{lining} = r_1 - r$
* $r_p$ (`r2`)：初支外半径（m），衍生初支厚度 $t_{primary} = r_2 - r_1$
* $r_g$ (`rg`)：初始注浆圈外半径（m），衍生初始注浆厚度 $t_g = r_g - r_2$
* $c$ (`c` / `depth`)：隧道埋深（m）
* $ha$ (`ha`)：双洞低水位水头（m）
* `D_spacing`：双洞轴线中心距（m）
* `tunnel_type`：单洞 `"single"` 或双洞 `"double"`
* `aspect_ratio`：断面高宽比 $h/w$（默认 1.0/0.7）
* `d_ring_default`, `d_long_default`, `d_lat_default`：盲管默认基础管径（m）

#### 2. 状态字典 (`original_state` 与 `critical_state`) 物理字段映射
* `waterHead` / `final_waterHead`：原始/临界地下水头高度（m），驱动 3D 地下水位平面 $Y$ 轴高度。
* `safety_factor` / `final_safety_factor`：全环最小安全系数，驱动结构危险度判定与云图色阶（当 $safety\_factor \le tol\_safety\_factor$ 时触发红区预警）。
* `control_idx` / `final_control_idx`：全环最不利受力单元索引（0~23），驱动三维空间 3D 探针高亮标注。
* `control_N`, `control_M` / `final_control_N`, `final_control_M`：最不利单元轴力（kN）与弯矩（kN·m），驱动 CompareView 标量看板。
* `rg_crit` / `tg_crit`：临界注浆外半径与临界注浆厚度（m），驱动 `Reinforcement.ts` 动态加固几何体拉伸（$t_{g\_crit} = \max(0.0, r_{g\_crit} - r_2)$）。
* `ring_spacing_recommend` / `ring_diam_recommend`：推荐环向盲管间距与管径，驱动 `DrainagePipeGenerator.ts` 的 InstancedMesh 阵列步进与缩放矩阵。
* `Q` / `q`：总渗漏量（$m^3/d$）与分段渗漏标量，驱动 `Environment.ts` 动水流线粒子速度。

#### 3. 水力-结构耦合图表字典 (`echart_data`) 映射
* `Hq`：拱顶垮塌荷载高度（m），作为结构地层荷载基准。
* `lining_res_original` / `lining_res_critical`：包含 24 单元全环轴力数组 $N_{elem}$、弯矩数组 $M_{elem}$ 及安全系数数组 $K_{list}$，直接注入 `lining.vert` / `lining.frag` 驱动顶点色阶动态映射。

---

## 二、 Three.js 参数动态建模与控制详细规程

本规程详述如何将前端接收到的工程参数（如间距、孔径、厚度等）无损、低延迟地转化为三维空间中的几何实体，所有操作均需在显存预分配的框架下执行。

### 步骤一：状态隔离与渲染上下文接管

**文件位置：** 主要在 `frontend/src/components/three/Viewer3D.vue` 与 `frontend/src/store/snapshotStore.ts` 中执行。

1. **画布初始化与硬件加速声明**：在 Vue 的 `onMounted` 生命周期钩子中，实例化 `WebGLRenderer`。配置开启抗锯齿（`antialias: true`），并根据客户端设备像素比调用 `setPixelRatio(window.devicePixelRatio)` 以防止高分屏模糊。配置渲染器支持对数深度缓冲（`logarithmicDepthBuffer: true`），以解决隧道细长结构带来的 Z-Fighting（深度冲突）问题。
2. **数据单向监听、解包与双分支降级处理**：
* 约束条件：需保证多分区网格空间拼接的里程连续性，并兼容待计算（pending）或旧版本缺省快照字段，防止渲染循环崩溃。
* 实现方式：在 `Viewer3D.vue` 中调用 `snapshotStore.getSequenceDataFor3D(sequenceId)` 获取升序排列的指令集。通过 `start_chainage` 确定 Z 轴基准偏移（Offset Z = `start_chainage`），`end_chainage - start_chainage` 设定挤出深度（Extrude Depth）。提取参数时，严格执行链式降级读取规范（`snap.results?.critical_state?.[key] ?? snap.results?.original_state?.[key] ?? snap.results?.input_parameter?.[key] ?? snap.params?.[key] ?? snap[key]`）。同时前置校验 `snap.status === 'done'`，若为待计算状态，拦截物理参数解析，强制采用线框模式（Wireframe）挂载。
* 影响范围：决定 3D 场景分段模型的坐标系对齐方式，隔离因局部数据空窗期对 WebGL 上下文造成的破坏。
3. **防抖节流下发管道**：构建微秒级节流阀。当用户连续拖拽滑块调整参数时，利用 `requestAnimationFrame` 将多次状态变更合并为单次渲染调用。提取后的裸数据被打包为标准接口对象（如 `ITunnelParams`），下发至底层 `TunnelGenerator.ts` 与 `Reinforcement.ts` 中。

### 步骤二：预分配显存与基准几何体建立

**文件位置：** 主导逻辑位于 `frontend/src/components/three/TunnelGenerator.ts`、`frontend/src/components/three/DrainagePipeGenerator.ts` 及 `frontend/src/components/three/Reinforcement.ts`。

基于前端不宜进行高频内存垃圾回收（GC）的原则，所有工程构件（衬砌、锚杆、超前导管、排水管件）统一采用实例化网格（`InstancedMesh`）技术。

#### 1. 极值计算与显存申请

在工程加载之初，系统通过 `snapshotStore.ts` 读取当前快照的分区起点里程（`start_chainage`）与终点里程（`end_chainage`），据此计算当前区段的设计纵深里程 $L_{max} = end\_chainage - start\_chainage$。结合系统支持的最小环向/纵向排布间距（$\Delta l_{min}$），推算各构件的最大可能数量。以排水管为例，其最大实例数 $N_{max}$ 计算公式为：

$$N_{max} = \left\lceil \frac{L_{max}}{\Delta l_{min}} \right\rceil \times C_{ring}$$

其中 $C_{ring}$ 为单环最大布管数量。通过该上限值一次性向 GPU 申请连续显存空间。

#### 2. 基准几何体（计算单元）构建

* **约束条件**：外部物理参数（`r`, `aspect_ratio`, `r1`, `r2`, `rg`, `c`, `D_spacing`）仅提供等效一维标量，缺乏标准马蹄形截面的空间拓扑细节；初支、二衬与注浆圈存在分层厚度差异，且双洞模式下需保证横向轴线间距的绝对精确。
* **实现方式**：
1. **几何比例与高宽比（`aspect_ratio`）解算**：在 `TunnelGenerator.ts` 中解析等效内半径 `r` 与高宽比 `aspect_ratio`。依据工程经验设定马蹄形三心圆拱转换系数，推导细部初始控制半径：上半圆拱半径 $R_1 = 1.05r$，侧墙过渡圆弧半径 $R_2 = 0.65r$，仰拱半径 $R_3 = 1.8r$。通过引入 `aspect_ratio`（默认 0.7/1.0），对二维截面坐标的 $Y$ 轴施加非均匀缩放矩阵，或直接调整垂直向控制点高度，使最终开挖断面的总高度 $h$ 与总宽度 $w$（$w = r_1 + r$）严格满足 $h = w \times aspect\_ratio$ 的设计约束。
2. **双洞间距（`D_spacing`）空间排布**：读取 `tunnel_type` 参数。若判定为双洞模式（`"double"`），则实例化两个独立的 `THREE.Shape`。利用 `D_spacing`（双洞中心距）参数，分别对左线全路径施加 $-D\_spacing / 2$ 的 $X$ 轴平移，对右线全路径施加 $+D\_spacing / 2$ 的 $X$ 轴平移，确保拉伸前的二维双洞基准面绝对对齐。同时解析 `ha`（低水位水头），若 $ha > 0$，则将左线与右线水文边界降深进行异步差异化着色。
3. **截面轮廓构建与动态开沟**：使用 `THREE.Shape` 依次调用 `absarc` 与 `lineTo` 闭合生成二维轮廓。设定水沟触发阈值 $r_{threshold} = 5.0$ 米。当 $r > 5.0$ 米时，在仰拱底面局部坐标中心叠加一个宽 0.6 米、深 0.8 米的 `THREE.Path` 矩形路径并推入 `Shape.holes` 数组，通过二维拓扑相减预留中心深埋水沟空间；若 $r \le 5.0$ 米则跳过，保持 `Shape.holes` 为空。空间关系应为（由下至上）: 围岩/底部初支 $\to$ 二衬仰拱混凝土（结构承重） $\to$ 中心排水沟。
4. **多层衬砌空间拓扑拆解与 Shader 预留**：几何体统一采用基础内半径 `r` 经 `THREE.ExtrudeGeometry` 沿 $Z$ 轴拉伸 1 个标准单位长度，并应用 `geometry.rotateZ(Math.PI / 2)` 矫正局部轴向。衬砌的分层物理厚度交由 WebGL 硬件加速实现：
* 通过 `THREE.ShaderMaterial` 关联自定义着色器文件（目标路径：`frontend/src/assets/shaders/lining.vert` 与 `lining.frag`）。
* 将 `r`（内半径）、`r1`（二衬外半径，对应物理厚度 $t = r1 - r$）、`r2`（初支外半径，对应物理厚度 $t_{primary} = r2 - r1$）作为 uniform 变量及顶点属性注入着色器。
* 在顶点着色器（Vertex Shader）中，根据顶点原始法向量和半径边界条件执行分层偏置挤出，在 GPU 内高效生成二衬（区域：$r \to r_1$）、初支（区域：$r_1 \to r_2$）独立实体厚度。
5. **埋深（`c`）空间定位**：提取隧道埋深参数 `c`（内部对齐变量 `depth = c`）。在世界坐标系中，以当前分区隧道拱顶（Crown）的 $Y$ 轴坐标为基准，向上推导地面基准线高度 $Y_{ground} = Y_{crown} + c$，用于精确定位场景中代表地表面的 `PlaneGeometry` 及引出三维空间埋深标注线。
6. **辅助构件（锚杆、超前导管）生成规则**：在 `Reinforcement.ts` 中建立纯规则驱动阵列。其位姿完全继承后端传入的控制字段（环向间距 `bolt_pitch_x`、纵向排距 `bolt_pitch_z`、锚杆长度 `bolt_length`、导管外插角 `conduit_angle`）。锚杆基于围岩接触面法向量在拱顶特定角度扇区内通过矩阵乘法阵列生成；超前导管则在分区起点断面外轮廓沿 $Z$ 轴推进方向施加基于 `conduit_angle` 的旋转矩阵，实现斜向外发散的管线实例集群。
7. **外围加固圈与临界注浆体建模（`Reinforcement.ts`）**：优先读取 `rg` 参数生成标准注浆圈几何体（厚度 $t_g = r_g - r_2$）。当检测到后端返回 `results.critical_state` 临界解时，直接提取后端已算得的 `tg_crit`（或通过 $t_{g\_crit} = \max(0.0, r_{g\_crit} - r_2)$ 校验），动态构建临界注浆圈几何体厚度，作为 `ExtrudeGeometry` 的挤出深度参数，生成临界注浆圈实体网格。
8. **排水盲管管件参数化生成（`DrainagePipeGenerator.ts`）**：读取入参中的默认管径（`d_ring_default`, `d_long_default`, `d_lat_default`），调用 `THREE.CylinderGeometry` 建立环向、纵向与横向排水盲管的基础单体网格底座，并配置独立材质通道以备后续高密度阵列复用。

* **影响范围**：实现了多层衬砌、中心水沟及双洞横向互联在单一几何体底座上的解耦表达，消除了高密管线与复杂断面在 CPU 侧的三角化（Triangulation）计算开销，直接决定了下游实例化矩阵更新的坐标系映射基准。

#### 3. 实例化对象生成

利用上述构建完成的基准几何体，结合对应的 ShaderMaterial 材质，正式实例化网格对象：

```typescript
// frontend/src/components/three/TunnelGenerator.ts
this.mesh = new THREE.InstancedMesh(geometry, material, nMax);
this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
this.mesh.count = 0; // 动态控制初始渲染实例数为 0，避免冗余网格绘制
```

该操作在 GPU 显存中开辟出连续的矩阵存储空间。运行时仅需通过 `mesh.count = nCurrent` 即可物理丢弃冗余实例，保障大场景下的帧率稳定。

### 步骤三：仿射变换与矩阵更新逻辑

**文件位置：** 核心计算回路位于 `frontend/src/components/three/TunnelGenerator.ts`、`frontend/src/components/three/DrainagePipeGenerator.ts` 与 `frontend/src/utils/math.ts`。

当用户调整了配置参数或由后端推回新的解算结果时，触发此步骤。

1. **活跃实例遍历**：初始化一个针对 $N_{current}$ 的 for 循环。对于每一个实例索引 $i$，计算其在三维空间中的世界坐标。
2. **空间矩阵推演**：利用 `math.ts` 提供的辅助计算工具，求解当前实例的空间状态方程。构建一个 $4 \times 4$ 的仿射变换矩阵 $M$。

$$ M = T(t_x, t_y, t_z) \cdot R(\theta_x, \theta_y, \theta_z) \cdot S(s_x, s_y, s_z) $$

* **平移向量 (Translate)**：根据当前索引推算其所处的里程数（Z轴坐标），结合极坐标系下的角度推算 X、Y 坐标。
* **旋转四元数 (Rotate)**：为保证排水管或锚杆垂直于隧道壁，需计算该点在曲面上的法向量。利用向量叉乘求取法线方向，并将其转换为四元数（Quaternion）以规避万向节死锁。
* **缩放因子 (Scale)**：在 `DrainagePipeGenerator.ts` 阵列算法中，优先从 `results.critical_state`（缺省时降级至 `original_state`）读取推荐环向管间距（`ring_spacing_recommend`）与推荐环向管径（`ring_diam_recommend`）。将管径动态映射为仿射矩阵的 $X, Y$ 轴缩放权值，将管间距映射为 $Z$ 轴向平移步进，动态刷新环向排水盲管的全局阵列密度与物理半径。
3. **矩阵覆写注入**：将计算所得的变换矩阵通过 `mesh.setMatrixAt(i, M)` 接口，直接覆盖显存缓冲中的历史数据。

### 步骤四：显式脏标记提交与渲染挂载

**文件位置：** 操作于 `frontend/src/components/three/TunnelGenerator.ts` 及各构件生成类中。

1. **触发管线重绘**：在上述循环体结束、所有构件的空间矩阵参数更新完毕后，系统调用单条指令：
```typescript
// frontend/src/components/three/TunnelGenerator.ts
mesh.instanceMatrix.needsUpdate = true;
```
此操作作为脏标记（Dirty Flag），通知 WebGL 在下一帧绘制前，将主存中的 Float32Array 数组批量传输至 GPU 的 VRAM 中。
2. **色彩与状态挂载**：若当前参数调整涉及应力状态或安全系数的变化，系统同步更新颜色缓冲。调用 `mesh.setColorAt(i, new THREE.Color(r, g, b))`，并随后执行 `mesh.instanceColor.needsUpdate = true`。

### 步骤五：顶点着色器动态形变映射与水位表达

**文件位置：** 核心逻辑分布于 `frontend/src/assets/shaders/`、`frontend/src/components/three/Environment.ts` 以及通过 `onBeforeCompile` 注入的材质钩子中。

针对标准矩阵变换无法处理的非线性几何变形或地下水头高度的动态开挖呈现，引入 GLSL 着色器编程。

1. **Uniforms 参数暴露**：在实例化网格的材质编译前阶段，拦截着色器代码，将前端 UI 传入的“水平收敛率”、“竖向沉降量”作为 uniform 变量暴露给显卡。
2. **3D 水位平面参数建模（`Environment.ts`）**：
* **几何体生成**：在 `Environment.ts` 中创建一个横跨整个场景边界框的大型 `THREE.PlaneGeometry`，作为地下水位的可视基准面。其纵向（Z轴）覆盖隧道的起始至终止里程。
* **坐标绑定与水头降深**：水位面的垂直向（Y轴）坐标直接绑定后端返回的原始地下水头高度 `waterHead` 或临界地下水头高度 `final_waterHead`，实现水位随重算结果的精确随动，用于直观比对两种工况下的水头降深与拱顶坍塌水头 $H_q$。
* **渗漏量粒子场控制**：在水面材质的片段着色器中，引入由时间变量 `uTime` 滚动的噪点纹理模拟水波纹。同时提取总渗漏量 $Q$（或分段标量 $q$）作为控制阈值注入粒子流场着色器——总渗漏量 $Q$ 越大，动水流线粒子的空间运动动画速率越快。
3. **GPU 顶点偏移解算**：对于隧道管片受压变形的呈现，在 Vertex Shader 中编写偏移算法。读取管片顶点的原始坐标与世界中心轴的距离向量，依据注入的 uniform 变形参数库，利用 GPU 的并行计算能力实时更新顶点新位置。此举将极大降低 CPU 在处理多达数十万个顶点时的计算负荷。

---

## 三、 数据交换与双向绑定控制逻辑机制

为实现“计算参数-后端求解-前端可视化”的闭环，需构建严密的交换控制流。

**文件位置重点管控：**

* 交换控制器：`frontend/src/store/snapshotStore.ts`
* 界面控制流与分屏协同：`frontend/src/views/CompareView.vue`
* 输入输出拦截器：`frontend/src/components/ui/ParameterForm.vue`

1. **表单状态与脏数据拦截 (Dirty Data Interception)**：
* 约束条件：用户对任意输入参数进行修改后，触发当前 3D 画布中已映射的“安全系数云图”与“管网排布密度”失效判定。
* 实现方式：在 `ParameterForm.vue` 的 `onChange` 事件中同步将 `parameterStore.isDirty` 标识置为 `true` 并销毁结果缓存。`Viewer3D.vue` 订阅该状态，激活 CSS 滤镜冻结图表，并在画布顶层覆盖预警横幅。
* 影响范围：从数据总线层面切断陈旧结果与空间几何的视觉映射链路，全程无需销毁显存缓冲。
2. **数据清洗与重新计算调度**：触发脏数据拦截后，用户的下一次计算指令将启动有效性清洗（如拦截管径负值或非法区间）。清洗后的数据构造为 JSON 载荷，通过 Axios POST 请求发往后端 FastAPI 引擎调用 `drainage_engine.run_calculation` 进行重算。
3. **结果状态回填与双分支结构挂载**：后端求解完毕后返回标准结果载荷。`snapshotStore.ts` 接收该响应负载并刷新 `currentComputedResult` 状态树：
* **结构安全分支（`nowK > tol_safety_factor`）**：响应载荷仅包含 `original_state` 与 `echart_data.lining_res_original`。`snapshotStore` 标记 `hasCriticalState = false`。
* **结构超限加固分支（`nowK <= tol_safety_factor`）**：响应载荷同时包含 `original_state` 与 `critical_state`。`snapshotStore` 标记 `hasCriticalState = true`，并挂载 `final_waterHead`、`rg_crit`、`tg_crit` 及 `lining_res_critical`。
4. **反应式级联触发**：`Viewer3D.vue` 监听状态树更替后触发重绘流程。三维场景中的排水管网排布密度与孔径，优先从 `results.critical_state` 读取 `ring_spacing_recommend` 与 `ring_diam_recommend`，缺失时降级读取 `original_state`，实现数据向视觉的物理级映射。
5. **分屏对比联动控制机制（`CompareView.vue`）**：
* 实现方式：`CompareView.vue` 通过双路并行渲染上下文同时挂载两个 `Viewer3D.vue` 实例。当后端返回双分支数据时，主画布挂载 `original_state`（原始超限状态），副画布挂载 `critical_state`（临界加固状态）。通过为主画布与副画布绑定统一的相机控制权，实时同步双视角矩阵（Camera Matrix），实现视角旋转、缩放的无延迟同频联动。若当前结果为安全工况，副画布自动展示“结构安全提示”或同步渲染标准对比标尺。
* 标量对比看板：提取快照中的核心弯矩（`control_M` / `final_control_M`）、轴力（`control_N` / `final_control_N`）、外水压力（`P` / `P_crit_input`）及最小安全系数（`safety_factor` / `final_safety_factor`）充入图表看板，实现结构应力与加固边界的同屏多维量化比对。

---

## 四、 其他附加 3D 模型与场景表现控制

为达到工程级数字孪生平台的专业视觉标准，需补充环境遮蔽与标量场可视化。

### 1. 虚拟应力探针与安全系数云图

**文件位置：** `frontend/src/components/three/PostProcessing.ts`

* **安全系数云图（Heatmap）**：系统解析快照属性树，读取 `original_state.safety_factor` 或 `critical_state.final_safety_factor`。若检测到安全系数低于容许门槛值 $tol\_safety\_factor$（如 2.0），触发危险色系（红色警告）着色；否则按正常安全色阶（绿/蓝）映射。全量数据数组 `lining_res_original.K_list` 与 `lining_res_critical.K_list` 挂载至渲染管线，驱动 3D 衬砌表面 24 个控制顶点的逐点色阶动态映射。该过程受 `parameterStore.isDirty` 管控，侦测到脏标记即挂起（Suspend）着色器更新队列。
* **空间拾取探针与不利点定位**：解算结果中的全环最不利受力点索引（`control_idx` / `final_control_idx`）被传递至拓扑检索函数。系统精确定位对应 3D 衬砌网格的顶点区间，并在三维空间挂载高亮 3D 探针标注标签。同时实例化 `THREE.Raycaster` 拦截鼠标点击，利用 BVH（Bounding Volume Hierarchy）加速包围盒检测求交。当触碰有效网格时，提取具体位置的轴力 $N$ 与弯矩 $M$ 标量并驱动 HTML 浮动标签（Tooltip）跟随显示。

### 2. 后期处理管道（Post-Processing Pipeline）

**文件位置：** `frontend/src/components/three/PostProcessing.ts`

* 在 `WebGLRenderer` 基础之上封装 `EffectComposer`。
* **SSAO 层叠注入**：引入屏幕空间环境光遮蔽（SSAO Pass）。由于隧道场景内部光源复杂且结构遮挡严重（如管网与壁面接缝），SSAO 能通过分析深度缓冲动态生成接触阴影，使结构体具备真实的工程厚重感。
* **Outline 交互提示**：启用轮廓描边着色器（Outline Pass）。当通过射线拾取（Raycaster）选中特定的排水管段或锚杆时，将该实例化网格的索引加入 Outline Pass 的选中列表，使其边缘散发特定颜色的光晕，替代传统的网格变色或材质替换方案，降低状态管理的复杂度。

---

## 五、视图控制、多图层管理与交互工具链定义

**文件位置**：`frontend/src/components/three/Viewer3D.vue`

### 多图层显示/隐藏控制机制

#### 实现方式

利用 Three.js 的 `Object3D.layers` 标量掩码机制，为不同工程构件分配独立的渲染图层通道（Layers 0 ~ 5）：

* Layer 0: 通用环境与地形开挖面
* Layer 1: 二衬主体网格（由半径 $r$ 与 $r_1$ 约束，厚度 $t = r_1 - r$）
* Layer 2: 初支结构网格（由半径 $r_1$ 与 $r_2$ 约束，厚度 $t_{primary} = r_2 - r_1$）
* Layer 3: 注浆圈几何体（普通状态读取 $r_g$，厚度 $t_g = r_g - r_2$；临界状态读取 $r_{g\_crit}$，厚度 $t_{g\_crit} = r_{g\_crit} - r_2$）
* Layer 4: 系统锚杆与超前小导管实例集群
* Layer 5: 环向/纵向/横向排水盲管管网网格

#### 影响范围

前端 UI 层的配置面板（Toggle Switch）通过改变 `camera.layers.toggle(layerIndex)` 动态控制可见性，实现单次调用控制百万级实例化顶点的显示或隐藏，避免重复移出/移入场景造成的 CPU 耗时。

### 基础交互工具链实现规范

#### 镜头变换与视点复位

* 约束条件：集成 `OrbitControls` 控制器支持场景旋转与缩放，需提供一键恢复出厂视角的确定性状态。
* 实现方式：硬编码默认镜头状态向量 $P_{default}(x, y, z)$ 与目标观察点 $T_{default}(x, y, z)$。触发复位时，关闭控制器更新，利用 TWEEN 库或原生插值函数在 500ms 内平滑过渡 `camera.position` 与 `controls.target`，随后激活 `controls.update()`。

#### 全空间任意截面剖切（Clipping）

* 实现方式：配置 `renderer.localClippingEnabled = true`。实例化三个标准剖切平面 `THREE.Plane`（对应 X、Y、Z 三轴法线）。将平面对象挂载至全局材质的 `clippingPlanes` 属性中。通过 UI 滑块动态修改平面的常数项 `plane.constant`，实现隧道纵向（轴向里程切分）、横向（径向剖面查看）的动态推进剖切查看。

#### 空间工程测距（Distance Measurement）

* 实现方式：激活交互状态后，开启鼠标点击事件拦截。利用 Raycaster 射线检测实体网格获取精确交点坐标 $V_1(x_1, y_1, z_1)$。二次点击获取 $V_2(x_2, y_2, z_2)$。调用 `V1.distanceTo(V2)` 求解两点间绝对欧氏距离。在 $V_1$ 与 $V_2$ 之间动态构建一条 Line 几何体，并通过 `CSS2DRenderer` 在线段中心点挂载 HTML 文本标签，实时输出形如 “L = 4.25m” 的测量结果。

本工程方案通过严格规划文件职能边界与底层显存调度机制，将确保在高密度参数化隧道模型场景下，系统仍能维持稳定流畅的工业级渲染与交互表现。