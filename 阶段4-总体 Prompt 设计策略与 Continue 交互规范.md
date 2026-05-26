
# 阶段4-总体 Prompt 设计策略与 Continue 交互规范

## 一、 策略制定背景与核心原则

在【阶段4】的开发中，前端需要围绕 Three.js 实例化网格（InstancedMesh）、自定义 Shader、WebGL 渲染管线及多维分屏对比视图进行高密度的代码编写。为规避大模型在长上下文（Long Context）生成中对物理标量字段产生“空间泛化遗忘”，或由于缺乏精确约束导致生成失焦、产生 AI 幻觉，特制定本 Prompt 设计策略与 Continue 交互规范。

本规范确立了三个核心交互原则：

* **单一事实源约束（Single Source of Truth）**：所有涉及前端几何建模与状态驱动的代码生成，其底层上下文必须显式挂载【Snapshot 快照数据特征与读取规范】。
* **分维度渐进式修改（Dimensional Modification）**：严格依循文件维度的职责划分，不进行跨文件的混合大面积重写，遵循最小化修改（Minimal Modification）原则。
* **约束—实现—影响工程闭环（Constraint-Implementation-Impact）**：编写或重构任意 3D 组件时，Prompt 输入必须按照结构化三要素进行输入限制。

---

## 二、 Continue 交互上下文收集规范

在开发工具（如 Continue 扩展）中进行多文件协同或者局部重构时，需要建立统一的上下文导入路径，从而为模型提供精准的数据结构参考。

### 2.1 上下文引用拓扑

在 Continue 的 Chat 框或 config.json 自定义 Prompt 模板中，执行文件级上下文关联时，必须按需引入以下三层文件的代码快照：

```text
[数据字典层] -> app/models/schemas.py (参数边界) & services/drainage_engine.py (计算输出)
     │
[状态管理层] -> store/snapshotStore.ts (成果数据组装) & store/parameterStore.ts (响应式状态)
     │
[渲染执行层] -> components/three/ (Viewer3D.vue / TunnelGenerator.ts / CompareView.vue 等)

```

### 2.2 显式引用指令规范

在使用 Continue 编辑器交互时，禁止使用模糊的代称（如“帮我写下排水管网的生成”）。应使用 @ 符号精准指定目标文件及数据规范，基准交互范式如下：

> “请基于 @drainage_engine.py 的计算返回结构和 @schemas.py 的高级参数定义，对 @DrainagePipeGenerator.ts 中的实例化网格更新逻辑进行修改。要求严格遵循 @Snapshot 快照数据特征与读取规范 中的字段映射字典。”

---

## 三、 结构化快照数据防遗忘 Prompt 框架

为解决长对话中 AI 遗忘特定物理变量的共性问题，设计此结构化 Prompt 锚定框架。在要求 Continue 修改或生成渲染层核心逻辑时，必须在 Prompt 前置注入该强映射表格。

### 3.1 几何参数输入防遗忘锚定

当要求 Continue 生成或优化隧道结构建模组件（TunnelGenerator.ts、Reinforcement.ts）时，需强制注入以下约束流：

```markdown
请在内存解算与几何拓扑中锁定以下 1:1 输入物理映射：
1. tunnel_type: 字符串常量类型 ("single" / "double")。为 "double" 时激活双线克隆。
2. r: 隧道等效内半径 (m)。隐式转换为基准宽度 w = r。
3. aspect_ratio: 高宽比，默认值 0.7。隐式推演截面总高 h = r * aspect_ratio。
4. r1 & r2: 二衬外半径与初支外半径 (m)。二衬物理厚度定义为 t = r1 - r。
5. rg: 原始注浆圈外半径 (m)。作为标准工况注浆体边界。
6. c: 隧道埋深 (m)。隐式对齐变量 depth = c，用以约束世界坐标系 Y 轴的地形高程。
7. start_chainage & end_chainage: 分区起点/终点里程 (m)。
   - 网格在场景中的轴向绝对偏移量 Offset Z = start_chainage。
   - ExtrudeGeometry 挤出拉伸深度 Depth = end_chainage - start_chainage。
8. D_spacing: 双洞中心距 (m)。若为双洞，副洞网格应用基于 X 轴的平移矩阵。

```

### 3.2 计算结果与状态机驱动防遗忘锚定

当要求 Continue 修改或生成状态表现、着色、管线阵列组件（PostProcessing.ts、DrainagePipeGenerator.ts、Environment.ts、CompareView.vue）时，需强制注入以下约束流：

```markdown
请在编写渲染状态机与分屏对比逻辑时，锁定以下解算输出映射：
1. results.original_state / critical_state.waterHead & final_waterHead: 
   - 驱动 Environment.ts 中的 THREE.PlaneGeometry 水位面垂直高度（Y 轴）。
2. results.original_state / critical_state.safety_factor & final_safety_factor:
   - 传递给 PostProcessing.ts 作为着色材质阈值。若小于 tol_safety_factor (2.0) 触发危险色系（红色警告），否则映射正常色阶。
3. results.original_state / critical_state.control_M & final_control_M:
   - 控制弯矩 (kN·m)，传递至 CompareView.vue 驱动多维性能曲线图表进行同步比对。
4. results.original_state / critical_state.control_N & final_control_N:
   - 控制轴力 (kN)，用以在前端进行力学包络线安全状态评估。
5. results.original_state / critical_state.control_idx & final_control_idx:
   - 最不利点单元索引，用于在 3D 衬砌表面精确定位并挂载 HTML 空间标注标签。
6. results.original_state / critical_state.q & Q:
   - 渗漏量与总渗漏量。通过 uniform 变量注入水流模拟着色器，控制动水流线粒子的运动动画速率。
7. results.original_state / critical_state.ring_diam_recommend & ring_spacing_recommend:
   - 推荐环向管径与管间距。直接注入 DrainagePipeGenerator.ts，作为 InstancedMesh 仿射变换矩阵中 Scale (X,Y) 与 Translate (Z) 的更新步进参数。
8. results.critical_state.P_crit_input: 
   - 容许加固界限下的临界外水压力 (kPa)，作为对比看板的极限承载力标量。
9. results.critical_state.rg_crit & tg_crit:
   - 临界注浆半径与几何体厚度（tg_crit = max(0.0, rg_crit - r2)）。作为 Reinforcement.ts 挤出生成临界注浆圈实体的几何厚度参数。

```

---

## 四、 多文件协同修改与代码 Diff 生成规范

使用 Continue 自动生成代码或执行重构命令时，必须遵守以下工程化表达与输出规程：

### 4.1 最小化修改与上下文留白原则

* **严禁全文重写**：针对已有的前端 TS/Vue 文件，必须指示模型采用代码 Diff 格式输出，仅体现变动的行、新增的方法或被复写的逻辑块。
* **保留原句结构与体系**：除非用户明确提出架构重构，否则生成的三维实体拉伸、矩阵变换公式、几何 Shape 的控制点拓扑顺序不得擅自重命名字段或打乱其执行链条。

### 4.2 确定的文件路径声明

在 Continue 生成的任意代码块（Code Blocks）上方，必须明确指出目标文件路径、具体作用位置及修改范围。如果涉及分屏比对与几何体、后处理协同，必须按文件维度分别输出，严禁揉杂在一起。

```markdown
示例：
#### 文件路径：`frontend/src/components/three/Reinforcement.ts`
作用位置：`generateCriticalGroutingRing` 方法内部
修改范围：解析临界注浆圈几何体厚度 tg_crit，执行 Extrude 建模

```typescript
// 代码实现...

```



---

## 五、 Continue 典型开发场景指令集示例

以下为在 Continue 中进行实际编码交互时，可直接复用的高级配置场景 Prompt 模板。

### 场景 5.1：分屏对比视图组件开发 (CompareView.vue)

```markdown
# 任务目标
请为项目编写/完善 `frontend/src/views/CompareView.vue` 视图组件。该组件负责并行挂载双路 3D 渲染上下文，用以实现隧道原始受受力工况与临界安全加固工况的直观数字孪生对比。

# 上下文依赖
- @frontend/src/components/three/Viewer3D.vue
- @frontend/src/store/snapshotStore.ts

# 工程约束条件 -> 实现方式 -> 影响范围
- **约束条件**：分屏视图中的左/右两侧 3D 场景在拖拽、旋转或缩放时必须保持完全步调一致，避免产生视觉位差。
- **实现方式**：在组件内实例化两个 `Viewer3D.vue` 节点，分别注入 `snap.results.original_state` 与 `snap.results.critical_state`。通过暴露的相机钩子，捕获主场景 Cameron 的矩阵变化，并实时执行 `secondaryCamera.position.copy(primaryCamera.position)` 与 `secondaryControls.target.copy(primaryControls.target)`。
- **影响范围**：保障多维快照成果数据在双路 WebGL 上下文中的无延迟同频联动，并驱动多维图表同步渲染弯矩（control_M / final_control_M）与轴力（control_N / final_control_N）。

# 输出规范
请以最小化修改原则提供完整的模板文件结构，并附加关键位置的工程化简短注释。

```

### 场景 5.2：管网阵列动态刷新逻辑开发 (DrainagePipeGenerator.ts)

```markdown
# 任务目标
请重构 `frontend/src/components/three/DrainagePipeGenerator.ts` 中的 `updatePipeInstances` 核心变换矩阵更新回路。

# 上下文依赖
- @frontend/src/utils/math.ts
- @Snapshot 快照数据特征与读取规范

# 工程约束条件 -> 实现方式 -> 影响范围
- **约束条件**：排水管网排布密度必须动态跟随计算引擎返回的物理验证状态，且在高频拖拽参数滑块时保证帧率稳定。
- **实现方式**：
  1. 放弃销毁重建网格。基于 `InstancedMesh` 的连续显存，进入 `for` 循环遍历活跃实例。
  2. 优先从 `results.critical_state`（缺失时链式降级至 `original_state`）读取 `ring_spacing_recommend` 与 `ring_diam_recommend`。
  3. 利用 `math.ts` 的法线变换算法，通过 $M = T \cdot R \cdot S$ 仿射公式，将推荐管径映射为 `Scale (X, Y)` 缩放权值，推荐管间距作为横向里程 `Translate Z` 的平移步进。
  4. 覆写显存数据：`mesh.setMatrixAt(i, M)` 并显式激活脏标记声明 `mesh.instanceMatrix.needsUpdate = true`。
- **影响范围**：切断了传统 CPU 侧三角化计算开销，直接决定了大批量实例网格的最终生成坐标系与渲染性能。

# 输出规范
仅输出受影响的代码修改片段（Code Diff），并在涉及仿射矩阵乘法位置添加具体变量源（如 ring_spacing_recommend）的来源批注。

```

### 保障代码完备性的防御性 Prompt 技巧（Cheat Sheet）

在 Continue 的对话框或系统提示词（System Prompt）中，常驻以下指令以避免代码丢失：

1. **反截断声明**：`"Do not use comments like '// implement logic here' or '// existing code'. Output the entire file content from import statements to the final closing bracket."`
2. **强制路径指定**：`"在生成或修改代码时，必须在代码块第一行以注释形式明确标明目标文件的绝对或相对物理路径（如 // frontend/src/components/three/TunnelGenerator.ts），严禁省略。"`
3. **接口契约验证**：`"涉及跨文件调用（如 TunnelGenerator 调用 math.ts 中的矩阵变换方程）时，必须严格核对依赖文件暴露的 interface 与函数签名，若发生参数缺失，必须执行链式降级链路处理，严禁擅自改动依赖文件的既有结构。"`