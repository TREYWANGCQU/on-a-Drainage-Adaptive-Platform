为保障在 Continue 插件中进行 3D 渲染模块代码生成时，不出现上下文遗忘、逻辑截断（如输出 `// ...现有代码...`）或偏离工程基准，需采取“分层解耦、依赖注入、约束前置”的 Prompt 设计策略。

以下基于《阶段4-工程方案》，梳理出的 Continue 插件 Step-by-Step Prompt 设计指南及标准模板库。

---

### 总体 Prompt 设计策略与 Continue 交互规范

1. **利用上下文组装（Context Providers）**：在输入框中精准使用 `@Files` 或 `@Codebase` 引入上游依赖文件，避免全局检索导致 token 污染。
2. **遵守单文件生成原则（Single File Generation）**：每个 Prompt 只要求 LLM 集中生成或修改 **1 个目标文件**，切忌让其一次性输出整个 Three.js 架构。
3. **闭环输出约束（No Truncation Constraint）**：在每一个 Prompt 尾部硬性声明输出格式规范，禁止局部省略。

---

### Step-by-Step 代码生成拆解路径与 Prompt 模板

按照“数据流驱动”的工程逻辑，建议分 5 个批次进行代码生成：

#### 批次一：状态总线与拦截机制注入 (State & Store)

**目标文件**：`tunnel-drainage-platform/frontend/src/store/snapshotStore.ts` / `ParameterForm.vue`

**Continue Prompt ：**

```markdown
@frontend/src/store/parameterStore.ts 
@frontend/src/store/snapshotStore.ts
@frontend/src/components/ui/ParameterForm.vue

执行任务：
依据[阶段4-工程方案]中的【三、数据交换与控制逻辑】，完善前端状态机的数据总线通信与脏数据拦截机制。

约束条件与实现方式：
1. 【表单拦截】：在 `ParameterForm.vue` 中，针对所有输入控件（如 `<el-input>`, `<el-slider>`）绑定的 `onChange` 或 `onUpdate:modelValue` 事件，触发 `parameterStore.updateParam` 逻辑。
2. 【脏状态更新】：在 `parameterStore.ts` 的 `updateParam` action 中，注入拦截逻辑：一旦数值发生人为修改，同步将 `isDirty` 置为 `true`，并主动销毁 `currentResults` 缓存（设为 null）。
3. 【空间序列供给】：在 `snapshotStore.ts` 中实现 `getSequenceDataFor3D(sequenceId: string)` 方法，负责提取聚合序列，并强制执行 `sort((a, b) => a.start_chainage - b.start_chainage)` 以升序返回包含完整里程与参数结果的快照序列，供 3D 引擎消费。

输出与格式严格要求（Cheat Sheet 规则）：
1. 【反截断】：禁止使用 `// ...现有代码...` 或 `// implement logic here`。你必须输出这三个文件的完整内容（从 import 到文件结束）。
2. 【最小化修改】：绝不允许修改 `parameterStore.ts` 中已定义的 38/40 个隧道参数及默认高级参数结构。
3. 【工程化注释】：在拦截点（Dirty Flag 触发处）与序列供给处（sort 逻辑处）添加简短的工程化注释，指明“影响范围：切断三维视觉映射链路 / 影响范围：提供空间连续性拼装”。
4. 在代码块头部标明目标文件路径（如 `// frontend/src/store/parameterStore.ts`）。

```

#### 批次二：底层数学库与几何轮廓生成 (Math & Geometry)

**目标文件**：`tunnel-drainage-platform/frontend/src/utils/math.ts` / `tunnel-drainage-platform/frontend/src/components/three/TunnelGenerator.ts` (几何部分)

**Continue Prompt 示例：**

```markdown
@tunnel-drainage-platform/frontend/src/components/three/TunnelGenerator.ts 

执行任务：开发 TunnelGenerator.ts 中的“基准几何体构建”功能。

约束条件：
1. 接收参数 `r`（等效内半径）。
2. 马蹄形比例解算：上部圆拱 R1 = 1.05r，侧墙过渡 R2 = 0.65r，仰拱 R3 = 1.8r。利用 THREE.Shape 的 absarc 与 lineTo 闭合外轮廓。
3. 中心水沟判定：若 r > 5.0m，实例化 THREE.Path (宽 0.6m, 深 0.8m) 作为矩形孔洞，推入 Shape.holes 进行布尔扣减。若 r <= 5.0m 则保持空。
4. 最终通过 THREE.ExtrudeGeometry 沿 Z 轴拉伸 1 个单位长度。

输出要求：
输出完整的 TunnelGenerator.ts 几何体生成函数块，禁止使用省略号跳过任何逻辑分支。采用 TypeScript 强类型定义。

```

#### 批次三：显存分配与实例化矩阵推演 (InstancedMesh Pipeline)

**目标文件**：`tunnel-drainage-platform/frontend/src/components/three/TunnelGenerator.ts` / `Reinforcement.ts`

**Continue Prompt 示例：**

```markdown
@tunnel-drainage-platform/frontend/src/components/three/TunnelGenerator.ts 
@tunnel-drainage-platform/frontend/src/utils/math.ts

执行任务：在 TunnelGenerator.ts 中实现基于显存预分配的 InstancedMesh 矩阵更新逻辑。

约束条件：
1. 极值计算：按公式 N_max = ceil((end_chainage - start_chainage) / min_spacing) * C_ring 申请显存空间，实例化 THREE.InstancedMesh。
2. 矩阵推演：遍历 N_current，调用 math.ts 求解仿射变换矩阵 M = T * R * S。
3. 数据读取降级：严格执行 snap.results?.critical_state?.ring_spacing_recommend ?? original_state ?? 默认值 的降级链路。
4. 脏标记挂载：矩阵遍历结束后，硬性执行 `mesh.instanceMatrix.needsUpdate = true`，不可遗漏。

输出要求：
提供 TunnelGenerator.ts 中实例化与矩阵覆写的完整类/函数代码。逻辑结构采用：获取参数 -> 预分配 -> 循环推演 -> 提交脏标记。

```

#### 批次四：三维画布根节点接管与降级挂载 (Canvas & Render Loop)

**目标文件**：`tunnel-drainage-platform/frontend/src/components/three/Viewer3D.vue`

**Continue Prompt 示例：**

```markdown
@tunnel-drainage-platform/frontend/src/components/three/Viewer3D.vue
@tunnel-drainage-platform/frontend/src/store/snapshotStore.ts

执行任务：构建 Viewer3D.vue 根节点渲染循环与单向数据流监听。

约束条件：
1. 初始化 WebGLRenderer，开启 antialias 与 logarithmicDepthBuffer，设置 devicePixelRatio。
2. 监听 snapshotStore 的 activeSnapshot。提取数据时调用 Vue 的 toRaw() 阻断 Proxy。
3. 状态前置校验：校验 snap.status === 'done'。若为 'pending'，拦截物理参数解析流，对该网格强制设置 material.wireframe = true（线框模式降级）。
4. 防抖节流：利用 requestAnimationFrame 合并滑块拖拽产生的高频状态变更。

输出要求：
输出 Viewer3D.vue 的完整 <script setup lang="ts"> 部分，禁止截断。确保生命周期管理严密，onBeforeUnmount 中需释放 WebGL 资源。

```

#### 批次五：附加视觉表现与 GPU 着色器 (Shaders & Post-Processing)

**目标文件**：`tunnel-drainage-platform/frontend/src/components/three/PostProcessing.ts` / `Environment.ts`

**Continue Prompt 示例：**

```markdown
@tunnel-drainage-platform/frontend/src/components/three/PostProcessing.ts

执行任务：实现基于 EffectComposer 的后期处理管道及安全系数云图着色。

约束条件：
1. 云图着色：判断 results.critical_state 存在与否。提取主应力数据，生成 RGB 数组并注入 BufferGeometry 的 color 属性。
2. 脏标记拦截：若 parameterStore.isDirty === true，挂起（Suspend）云图着色器更新队列，触发 DOM 层预警横幅。
3. 空间拾取：实例化 THREE.Raycaster 与 BVH。配置选中实体的 OutlinePass 轮廓描边（光晕替代材质替换）。
4. SSAO：添加屏幕空间环境光遮蔽 Pass 增强工程管网深度阴影。

输出要求：
输出 PostProcessing.ts 完整代码。代码需具备高内聚性，提供独立的初始化、更新与销毁对外接口。

```

---

### 保障代码完备性的防御性 Prompt 技巧（Cheat Sheet）

在 Continue 的对话框或系统提示词（System Prompt）中，常驻以下指令以避免 LLM 偷懒：

1. **反截断声明**：`"Do not use comments like '// implement logic here' or '// existing code'. Output the entire file content from import statements to the final closing bracket."`
2. **强制路径指定**：在涉及代码生成时，要求 LLM `在代码块头部标明目标文件路径（如 // tunnel-drainage-platform/frontend/src/utils/math.ts）`，以方便使用 Continue 的 `Cmd+Shift+Enter` (一键应用至文件) 功能。
3. **接口契约验证**：在生成 A 文件依赖 B 文件的方法时，Prompt 中需声明 `"严格对齐 @B.ts 中暴露的 interface 定义，若发现属性缺失，按降级规范处理，不擅自扩展字段。"`