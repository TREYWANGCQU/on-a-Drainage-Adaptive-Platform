<!-- 阶段4-第六次-排水沟发光去化与HDRI光影响应更新方案.md -->
# 阶段4-第六次-排水沟发光去化与HDRI光影响应更新方案 (v6.7 修正版)

---
**版本**: v6.7 (解耦重构版)  
**定位**: 隧道防排水自适应平台 - 排水沟发光归零、3-Box 凸拓扑解耦大/小三角形根除与 HDRI IBL 物理光影响应方案  
**依据**: 基于 `/verifier` 独立核验与图形学 Earcut 算法归因诊断。彻底纠正先前 8 顶点凹多边形 `createUShape` 引发 Earcut 凹角盲目切分产生大三角形的盲区，采用 **3 块 4 顶点凸矩形盒 (3-Box Composite)** 组合拓扑，配合顶点法线归一化与 Z-Buffer 禁写，实现几何与材质的解耦重塑。  
---

## 1. Objectives (方案目标)

针对 WebGL 3D 视图中排水沟发光刺眼、8 顶点凹角跨越大三角形复活、侧面 Quad 偏导数小三角形及 HDRI 光影失真问题，制定以下解耦更新目标：

1. **排水沟自发光归零 (Emissive Removal & Paradigm Sync)**
   - 修改 [TunnelGenerator.ts](file:///d:/offices/Github/隧道工程多维协同智能排水自适应平台/tunnel-drainage-platform/frontend/src/components/three/TunnelGenerator.ts) 中 `ditchMat` 材质参数，将发光色及强度完全归零 (`emissive: 0x000000`, `emissiveIntensity: 0.0`)。
   - 同步修改 `setVisualParadigm()` 范式切换函数，确保从 `studio` (影棚) 切换至 `cyber` (暗夜) 范式时，自发光始终保持归零状态。

2. **3-Box 凸拓扑根除大三角形 (Big Triangle Elimination)**
   - **废弃 8 顶点凹 Shape**：彻底废弃单条凹多边形 `createUShape` 方案，规避 Three.js `ExtrudeGeometry` 底层 `Earcut` 算法在凹角（敞口空气区）寻找耳顶点时跨越 `V0` 与 `V5` 产生大三角形的死穴。
   - **采用 3 块 4 顶点凸矩形盒 (3-Box Composite)**：将单条 U 沟拆分为 3 块独立的 4 顶点凸矩形（左侧壁 Box、槽底 Box、右侧壁 Box）。4 顶点凸矩形的 Earcut 三角剖分在数学上具有确定性（恒为 2 个三角形），**100% 免疫大三角形**。

3. **法线平滑与 Z-Buffer 禁写根除小三角形 (Small Triangle Elimination)**
   - **片元色差小三角形**：对拉伸后的 3-Box 几何体显式调用 `geometry.computeVertexNormals()`，强制法线沿 X/Y 轴正交归一化，消除 Quad 侧面对角线片元插值色差。
   - **深度争用小三角形**：设置 `depthWrite: false` (半透明禁写 Z 缓冲) 与 `side: THREE.FrontSide` (仅渲染朝外正面)，彻底消除正面与背面三角面片自遮挡及 1m 节段 Z-Fighting 碎块。

4. **柔化轮廓线条与释放 HDRI 物理反射 (HDRI IBL Highlight Activation)**
   - 将 `ditchEdgeMat` 3D 轮廓线条透明度由 `0.95` 降低至 `0.45`，消除边界刺眼感。
   - 在消除自发光干涉与深度争用后，使 `Viewer3D.vue` 加载的 HDRI 影棚贴图能够通过 PBR 物理材质正常呈现高光弧拉丝与环境漫反射。

---

## 2. Constraints (工程约束)

1. **几何与材质彻底解耦**：将“发光归零”与“3-Box 几何拓扑重构”分为两个独立 WBS 步骤，严禁混合更改导致死锁。
2. **凸多边形严密性**：三沟构造的 3 块 Box 必须保持物理缩进容差 $\delta_x = 0.008\text{m}, \delta_y = 0.005\text{m}$，消除底板与侧壁接触面的 Alpha 双重混合阴影。
3. **渲染性能与零报错**：维持 60 FPS 渲染帧率，TypeScript 编译通过（0 errors）。

---

## 3. Architecture & Root Cause Analysis (架构与三角形伪影根本原因诊断)

```
+-----------------------------------------------------------------------------------+
|               三角形伪影根本原因与 3-Box 凸拓扑解耦对比                              |
+-----------------------------------------------------------------------------------+
| [旧方案死穴] 8 顶点凹 Shape createUShape 盲目凹角切分                              |
|   └── Earcut 算法把凹角多边形的顶沿 V0(左) 与 V5(右) 当做外轮廓连线，直接生成         |
|       跨越敞口空气腔的 V0-V2-V5 耳切三角形 ───> 导致【大三角形】重新产生。         |
|                                                                                   |
| [v6.7 修正] 3 块 4 顶点凸矩形盒 (3-Box Composite Geometry)                         |
|   ├── 左侧壁 Box (4 顶点凸多边形 ──> 确定性 2 三角形)                             |
|   ├── 槽底   Box (4 顶点凸多边形 ──> 确定性 2 三角形)                             |
|   └── 右侧壁 Box (4 顶点凸多边形 ──> 确定性 2 三角形)                             |
|   └── 结论: 凸多边形没有凹角，Earcut 切分结果 100% 确定 ───> 【100% 免疫大三角形】。  |
+-----------------------------------------------------------------------------------+
| [小三角形修复] computeVertexNormals + depthWrite: false                           |
|   └── 显式计算平滑顶点法线，消解侧面 Quad 对角线色差；                               |
|   └── 半透明水槽禁写 Z 缓冲区 (depthWrite: false)，消解自遮挡与 Z-Fighting 碎块。    |
+-----------------------------------------------------------------------------------+
```

### 材质参数变化矩阵 (Material Specification)

| 材质对象 | 属性 (Property) | 更新前 (Before) | 更新后 (v6.7 After) | 设计意图 |
| :--- | :--- | :--- | :--- | :--- |
| **ditchMat** | `color` | `0x0e3a5a` | `0x1e3a5a` | 调整深邃沉浸槽体基色 |
| **ditchMat** | `emissive` | `0x00f3ff` | `0x000000` | **自发光彻底归零** |
| **ditchMat** | `emissiveIntensity` | `0.6` | `0.0` | **归零自发光强度** |
| **ditchMat (setVisualParadigm)** | `emissive` | `0x0284c7 / 0x00f3ff` | `0x000000` | **范式切换中维持自发光归零** |
| **ditchMat (setVisualParadigm)** | `emissiveIntensity` | `0.4 / 0.6` | `0.0` | **范式切换中归零强度** |
| **ditchMat** | `roughness` | `0.15` | `0.4` | 柔和水槽质感，匹配 PBR 光照 |
| **ditchMat** | `metalness` | `0.9` | `0.2` | 调低镜面度，吸收 HDRI 漫反射 |
| **ditchMat** | `depthWrite` | `true` | `false` | **半透明禁写 Z 缓冲，消解小三角形** |
| **ditchMat** | `side` | `DoubleSide` | `FrontSide` | 仅渲染朝外正面，避免正面/背面混色 |
| **ditchEdgeMat** | `opacity` | `0.95` | `0.45` | **柔化 3D 轮廓线条** |

---

## 4. Work Breakdown Structure (工作分解结构 WBS)

```
WBS 4.0 排水沟发光去化、3-Box 凸拓扑解耦与 HDRI 物理光影响应
 ├── 阶段 4.1：材质自发光归零 (安全、无拓扑风险)
 │    ├── 4.1.1 归零 ditchMat 的 emissive (0x000000) 与 emissiveIntensity (0.0)
 │    ├── 4.1.2 同步更新 setVisualParadigm()，确保 studio/cyber 动态切换时均归零发光
 │    └── 4.1.3 柔化 ditchEdgeMat 轮廓线透明度至 0.45
 ├── 阶段 4.2：3-Box 凸拓扑几何重构 (解耦根除大/小三角形)
 │    ├── 4.2.1 彻底废弃 8 顶点凹 Shape，编写 createDitchBoxShapes 3-Box 拆分函数
 │    ├── 4.2.2 保持 δx = 0.008m, δy = 0.005m 物理缩进容差，彻底消除 Contact Alpha 叠加
 │    ├── 4.2.3 对 Extrude 后的 3-Box 几何体应用 computeVertexNormals() 归一化法线
 │    ├── 4.2.4 设置 ditchMat 的 depthWrite: false 与 side: FrontSide 消除 Z-Buffer 自遮挡
 │    └── 4.2.5 应用 removeExtrudeEndCaps 剔除 1m 节段前后端面 Cap
 └── 阶段 4.3：运行期质量回归与 HDRI 验证
      ├── 4.3.1 验证 Studio 影棚下 HDRI 镜面高光与 Cyber 暗夜下沉浸质感
      └── 4.3.2 确认大三角形与小三角形 100% 消失，剖切与显隐控制无异常
```

---

## 5. Implementation Code Spec (实施代码规范)

### 5.1 阶段 4.1 材质去发光代码规范
在 [TunnelGenerator.ts](file:///d:/offices/Github/隧道工程多维协同智能排水自适应平台/tunnel-drainage-platform/frontend/src/components/three/TunnelGenerator.ts) 中定位 `ditchMat` 构造与 `setVisualParadigm`：

```typescript
// 1. 排水沟材质定义 (WBS 4.1.1)
const ditchMat = new THREE.MeshStandardMaterial({
  color: 0x1e3a5a,
  emissive: new THREE.Color(0x000000),
  emissiveIntensity: 0.0,
  roughness: 0.4,
  metalness: 0.2,
  transparent: true,
  opacity: 0.75,
  depthWrite: false,
  side: THREE.FrontSide
});

// 2. 范式切换同步归零 (WBS 4.1.2)
if (this.ditchMesh) {
  const ditchMat = this.ditchMesh.material as THREE.MeshStandardMaterial;
  ditchMat.color.setHex(mode === 'studio' ? 0x0284c7 : 0x1e3a5a);
  ditchMat.emissive.setHex(0x000000);
  ditchMat.emissiveIntensity = 0.0;
  ditchMat.roughness = mode === 'studio' ? 0.5 : 0.4;
  ditchMat.needsUpdate = true;
}
```

### 5.2 阶段 4.2 3-Box 凸拓扑拆分规范
在 [TunnelGenerator.ts](file:///d:/offices/Github/隧道工程多维协同智能排水自适应平台/tunnel-drainage-platform/frontend/src/components/three/TunnelGenerator.ts) 中采用 3 块 4 顶点凸矩形 Box：

```typescript
// 3 块 4 顶点凸矩形盒构造 (100% 免疫 Earcut 凹角切分大三角形) (WBS 4.2.1)
const createDitchBoxShapes = (xMin: number, xMax: number, yTop: number, yBot: number, wallThickness: number = 0.05) => {
  const safeXMin = xMin + delta_x;
  const safeXMax = xMax - delta_x;
  const safeYBot = yBot + delta_y;
  const t = Math.min(wallThickness, (safeXMax - safeXMin) / 3);

  const shapes: THREE.Shape[] = [];

  // 左侧壁 4 顶点凸矩形
  const leftWall = new THREE.Shape();
  leftWall.moveTo(safeXMin + ox, yTop);
  leftWall.lineTo(safeXMin + t + ox, yTop);
  leftWall.lineTo(safeXMin + t + ox, safeYBot + t);
  leftWall.lineTo(safeXMin + ox, safeYBot + t);
  leftWall.closePath();

  // 槽底 4 顶点凸矩形
  const bottom = new THREE.Shape();
  bottom.moveTo(safeXMin + ox, safeYBot + t);
  bottom.lineTo(safeXMax + ox, safeYBot + t);
  bottom.lineTo(safeXMax + ox, safeYBot);
  bottom.lineTo(safeXMin + ox, safeYBot);
  bottom.closePath();

  // 右侧壁 4 顶点凸矩形
  const rightWall = new THREE.Shape();
  rightWall.moveTo(safeXMax - t + ox, yTop);
  rightWall.lineTo(safeXMax + ox, yTop);
  rightWall.lineTo(safeXMax + ox, safeYBot + t);
  rightWall.lineTo(safeXMax - t + ox, safeYBot + t);
  rightWall.closePath();

  shapes.push(leftWall, bottom, rightWall);
  return shapes;
};
```

---

## 6. Acceptance Criteria (验收标准)

1. **自发光彻底消除**：3D 视口中排水沟不再有任何青色/蓝色荧光高亮发光。
2. **大三角形 100% 根除**：沟槽上方空中无任何跨越式的封闭三角盖板面片。
3. **小三角形 100% 根除**：沟槽内壁平整光滑，斜向对角线交替明暗色差与 1m 节段 Z-Fighting 碎块彻底消失。
4. **HDRI 物理反射正常**：在影棚/暗夜范式下，水槽表面正常呈现 HDRI 环境光的物理反射与吸收。
5. **功能回归通过**：剖切、显隐控制、放大镜交互正常，TypeScript 编译通过（0 errors）。
