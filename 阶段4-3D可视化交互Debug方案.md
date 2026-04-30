### 阶段四：关键 Debug 指南

针对 WebGL 渲染与快照序列数据联调时常见的工程异常，制定以下排查与修复基准：

* **Debug 1：`InstancedMesh` 几何或位置更新失效**
  * **现象：** 在 `[SnapshotSidebar]` 切换参数差异较大的快照后，3D 界面中的管网或锚杆位置未发生变化。
  * **修复：** 检查 `TunnelGenerator.ts` 的更新逻辑。重算实例化矩阵后，显式调用 `instanceMatrix.needsUpdate = true`；若涉及应力状态导致颜色变更，同步调用 `instanceColor.needsUpdate = true`。
* **Debug 2：射线拾取 (Raycaster) 坐标系偏移**
  * **现象：** 鼠标悬停 3D 模型时，Tooltip 弹窗位置错乱或拾取目标不准。
  * **修复：** 检查 `Viewer3D.vue` 所在 DOM 容器是否受侧边栏宽度变化影响。计算标准化设备坐标 (NDC) 时，采用容器自身的 `getBoundingClientRect()` 尺寸进行换算，舍弃全局的 `window.innerWidth/innerHeight`。
* **Debug 3：多快照拼接处的 Z-Fighting (深度冲突)**
  * **现象：** 组装多个里程分区快照时，相邻断面接缝处的材质出现剧烈闪烁。
  * **修复：** 审查边界里程坐标的开闭区间逻辑，防止网格重叠。在半透明材质或注浆圈材质中设置 `polygonOffset: true` 并赋予合理的 `polygonOffsetFactor` 调节深度层级。
* **Debug 4：前端参数高频下发导致后端进程阻塞**
  * **现象：** 在 3D 场景内高频拖拽构件尺寸滑块时，请求堆积导致浏览器内存攀升与卡顿。
  * **修复：** 核查 Pinia 状态机的通信策略。向“交互模式”专属路由发起长轮询或推流前，在 Axios 请求层串联防抖函数 (Debounce，如 200ms)，并通过 `AbortController` 及时阻断或丢弃已过期的中间态计算请求。