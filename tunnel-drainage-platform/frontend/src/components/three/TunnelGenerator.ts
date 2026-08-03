// tunnel-drainage-platform\frontend\src\components\three\TunnelGenerator.ts
import * as THREE from 'three';
import liningVert from '@/assets/shaders/lining.vert?raw';
import liningFrag from '@/assets/shaders/lining.frag?raw';

// 修改后：严格匹配后端 Snapshot 输出类型
export enum TunnelType {
  SINGLE = 'single', // 单洞隧道
  DOUBLE = 'double'  // 双洞隧道
}

export class TunnelGenerator {
  public mesh: THREE.InstancedMesh;         // 隧道二衬 (Secondary Lining) Mesh
  public primaryMesh?: THREE.InstancedMesh; // 隧道初支 (Primary Support) Mesh
  public roadMesh?: THREE.InstancedMesh;
  public ditchMesh?: THREE.InstancedMesh;
  public ditchEdgeMesh?: THREE.InstancedMesh;
  public groundMesh: THREE.Mesh;
  private readonly L_max: number;      // 最大里程纵深
  private readonly delta_l_min: number; // 最小排布间距 (单位长度1m)
  private readonly c_ring: number = 1;  // 隧道主体单环实例数恒定为1

  constructor(
    type: TunnelType,
    start_chainage: number,
    end_chainage: number,
    r: number,
    aspect_ratio: number = 1.0,
    D_spacing: number = 30.0,
    r1: number = 5.5,
    r2: number = 6.5,
    rg: number = 8.0,
    c: number = 50.0,
    delta_l_min: number = 1.0
  ) {
    // 从 store 传入的空间里程推导纵深 L_max
    this.L_max = Math.abs(end_chainage - start_chainage);
    this.delta_l_min = delta_l_min;

    // 构建二衬 (r -> r1 - eps) 与 初支 (r1 - eps -> r2) 拓扑无缝衔接几何体，彻底消除洞口端面 2mm 缝隙与侧壁 Z-fighting
    const eps = 0.0005;
    const secondaryGeometry = this.createHorseshoeBase(type, r, r1 - eps, r, D_spacing, aspect_ratio);
    const primaryGeometry = this.createHorseshoeBase(type, r, r2, r1 - eps, D_spacing, aspect_ratio);

    // 材质挂影与 Uniform 参数暴露 (磨砂珍珠水晶包覆外壳)
    const uniformsBase = {
      r: { value: r },
      r1: { value: r1 },
      r2: { value: r2 },
      rg: { value: rg },
      spacing: { value: type === TunnelType.DOUBLE ? D_spacing : 0.0 },
      aspect: { value: aspect_ratio },
      totalLength: { value: this.L_max },
      uBaseColor: { value: new THREE.Color(0x1e293b) },
      uFresnelColor: { value: new THREE.Color(0x38bdf8) },
      uOpacity: { value: 0.22 },
      uFresnelPower: { value: 3.5 },
      uShowGrid: { value: 1.0 },
      uLayerType: { value: 0.0 }
    };

    const secondaryMaterial = new THREE.ShaderMaterial({
      vertexShader: liningVert,
      fragmentShader: liningFrag,
      side: THREE.FrontSide,
      clipping: true,
      glslVersion: THREE.GLSL3,
      transparent: true,
      uniforms: THREE.UniformsUtils.clone(uniformsBase)
    });
    secondaryMaterial.uniforms.uLayerType.value = 0.0;

    const primaryMaterial = new THREE.ShaderMaterial({
      vertexShader: liningVert,
      fragmentShader: liningFrag,
      side: THREE.FrontSide,
      clipping: true,
      glslVersion: THREE.GLSL3,
      transparent: true,
      uniforms: THREE.UniformsUtils.clone(uniformsBase)
    });
    primaryMaterial.uniforms.uLayerType.value = 1.0;

    const nMax = Math.ceil(this.L_max / this.delta_l_min) * this.c_ring;

    // 二衬 Mesh
    this.mesh = new THREE.InstancedMesh(secondaryGeometry, secondaryMaterial, nMax);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;

    // 初支 Mesh
    this.primaryMesh = new THREE.InstancedMesh(primaryGeometry, primaryMaterial, nMax);
    this.primaryMesh.frustumCulled = false;
    this.primaryMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.primaryMesh.count = 0;
    this.primaryMesh.renderOrder = 1;

    // 创建独立 PBR 沥青路面与防渗混凝土水沟槽 Mesh
    this.createInternalRoadAndDitchGeometry(type, r, aspect_ratio, D_spacing, nMax);

    // 地表平面生成与埋深推演
    secondaryGeometry.computeBoundingBox();
    const Y_crown = secondaryGeometry.boundingBox ? secondaryGeometry.boundingBox.max.y : (1.05 * r);
    const Y_ground = Y_crown + c;

    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x88cc88, side: THREE.DoubleSide });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.y = Y_ground;
  }

  /**
   * 构建精确贴合仰拱内壁、带三沟凹槽切割与双洞偏移的路面与三沟组合几何体
   */
  private createInternalRoadAndDitchGeometry(
    type: TunnelType,
    r: number,
    aspect_ratio: number,
    spacing: number,
    nMax: number
  ): void {
    const R3_base = 1.80 * r;
    const ditchH = 0.8;
    const dy_road = R3_base - ditchH;
    const halfRoadW = Math.sqrt(Math.max(0, R3_base * R3_base - dy_road * dy_road));

    const w = 2.1 * r;
    const h = w * aspect_ratio;
    const R1_base = 1.05 * r;
    const R2_base = 0.65 * r;
    const dx_offset = R1_base - R2_base;
    const dy_offset = Math.sqrt(Math.max(0, Math.pow(R3_base - R2_base, 2) - Math.pow(dx_offset, 2)));
    const H_side = Math.max(0.0, h - R1_base + dy_offset - R3_base);
    const invertCenterY = -H_side + dy_offset;
    const roadY = invertCenterY - dy_road;

    // 根据侧边沟底高程计算二衬仰拱在水沟底部的物理安全极值边界 max_x_lining (WBS 1)
    const yBot_side = roadY - 0.3;
    const max_x_lining = Math.sqrt(Math.max(0, R3_base * R3_base - Math.pow(invertCenterY - yBot_side, 2)));

    // 计算三沟与路面挖槽的具体 X 坐标分布 (严格控制在二衬极值内侧)
    const sideLeftX = -max_x_lining + 0.05;
    const sideLeftXInner = -max_x_lining + 0.45;
    const sideRightXInner = max_x_lining - 0.45;
    const sideRightX = max_x_lining - 0.05;

    const centralLeftX = -0.35;
    const centralRightX = 0.35;
    // 中心排水沟底标高向下延展至仰拱底部上方 5cm 处 (WBS 2)
    const yBot_central = invertCenterY - R3_base + 0.05;

    // 根据单/双洞确定 X 轴偏移数组
    const offsets = type === TunnelType.DOUBLE ? [-spacing / 2, spacing / 2] : [0];
    const roadShapes: THREE.Shape[] = [];
    const ditchShapes: THREE.Shape[] = [];

    offsets.forEach(ox => {
      // 1. 路面 Shape：顶点采样拓扑解耦 (底沿弧线采样与顶沿细分槽口节点)
      // 顶沿按 X 轴倒序细分采样 (与底沿 16 节点一一对应)，彻底消除跨越 9.8m 的大对角线剖分三角形；
      // 在水沟区间下沉 0.05m 避开水沟内腔，暴露 ditchMesh 100% 敞口 U 型槽，解决水沟被遮挡问题。
      const roadShape = new THREE.Shape();
      const steps = 16;

      // A. 底沿仰拱圆弧 (CCW 动向：从 -halfRoadW 到 +halfRoadW)
      for (let i = 0; i <= steps; i++) {
        const x = -halfRoadW + (i / steps) * (2 * halfRoadW);
        const y = invertCenterY - Math.sqrt(Math.max(0, R3_base * R3_base - x * x));
        if (i === 0) {
          roadShape.moveTo(x + ox, y);
        } else {
          roadShape.lineTo(x + ox, y);
        }
      }

      // B. 顶沿路面 (从 +halfRoadW 倒序扫描回 -halfRoadW)：精准插入水沟外壁 keypoints 并在水沟区间向下沉降至外底高程，彻底释放通水槽腔
      const addDitchNotch = (xMax: number, xMin: number, yBot: number) => {
        roadShape.lineTo(xMax + ox, roadY);
        roadShape.lineTo(xMax + ox, yBot);
        roadShape.lineTo(xMin + ox, yBot);
        roadShape.lineTo(xMin + ox, roadY);
      };

      roadShape.lineTo(halfRoadW + ox, roadY);
      addDitchNotch(sideRightX, sideRightXInner, yBot_side);
      addDitchNotch(centralRightX, centralLeftX, yBot_central);
      addDitchNotch(sideLeftXInner, sideLeftX, yBot_side);
      roadShape.lineTo(-halfRoadW + ox, roadY);

      roadShape.closePath();
      roadShapes.push(roadShape);

      // 2. 排水沟 Shapes 构造: 单圈 8 顶点 CCW 凹多边形 U 型槽 (createUShape)
      // 单圈 8 顶点 CCW 顺序多边形构建 100% 敞口防渗 U 型防渗水沟，自适应嵌套在路面下方，消除拼装缝隙与重叠
      const delta_x = 0.008;
      const delta_y = 0.005;

      const createUShape = (xMin: number, xMax: number, yTop: number, yBot: number, wallThickness: number = 0.05): THREE.Shape => {
        const safeXMin = xMin + delta_x;
        const safeXMax = xMax - delta_x;
        const safeYBot = yBot + delta_y;
        const t = Math.min(wallThickness, (safeXMax - safeXMin) / 3);

        const uShape = new THREE.Shape();
        // V1 (左外顶) -> V2 (左外底) -> V3 (右外底) -> V4 (右外顶) -> V5 (右内顶) -> V6 (右内底) -> V7 (左内底) -> V8 (左内顶)
        uShape.moveTo(safeXMin + ox, yTop);
        uShape.lineTo(safeXMin + ox, safeYBot);
        uShape.lineTo(safeXMax + ox, safeYBot);
        uShape.lineTo(safeXMax + ox, yTop);
        uShape.lineTo(safeXMax - t + ox, yTop);
        uShape.lineTo(safeXMax - t + ox, safeYBot + t);
        uShape.lineTo(safeXMin + t + ox, safeYBot + t);
        uShape.lineTo(safeXMin + t + ox, yTop);
        uShape.closePath();
        return uShape;
      };

      ditchShapes.push(createUShape(centralLeftX, centralRightX, roadY, yBot_central, 0.05)); // 中央深水沟
      ditchShapes.push(createUShape(sideLeftX, sideLeftXInner, roadY, yBot_side, 0.05)); // 左侧沟槽
      ditchShapes.push(createUShape(sideRightXInner, sideRightX, roadY, yBot_side, 0.05)); // 右侧沟槽
    });

    // 1.0m 精确拉伸，消除 1m 实例衔接隙缝 (WBS 1.4)
    const extrudeSettings = { depth: 1.0, bevelEnabled: false };
    let roadGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(roadShapes, extrudeSettings);
    let ditchGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(ditchShapes, extrudeSettings);

    // 剔除前后封顶面，消除纵向排布时的横向梯子条纹与水沟内部封闭隔板 (WBS 1.4)
    roadGeo = removeExtrudeEndCaps(roadGeo);
    ditchGeo = removeExtrudeEndCaps(ditchGeo);

    // 关键修正：转换为非索引 BufferGeometry 并重新计算独立面法线
    // 彻底消除 90° 平滑法线插值导致的片元对角线色差（根除小三角形与路面大三角形条纹）
    roadGeo = roadGeo.toNonIndexed();
    roadGeo.computeVertexNormals();

    ditchGeo = ditchGeo.toNonIndexed();
    ditchGeo.computeVertexNormals();

    // 沥青路面材质升级：开启深度写入防止底层面片透视干涉，呈现平整路面 (WBS 2.2 / WBS 4)
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.50,
      metalness: 0.20,
      transparent: true,
      opacity: 0.55,
      depthWrite: true,
      side: THREE.FrontSide
    });

    // 排水沟材质升级：自发光彻底归零与 PBR 物理漫反射参数调整 (WBS 4.1.1 & WBS 4.2.4)
    const ditchMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a5a,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
      roughness: 0.50,
      metalness: 0.20,
      transparent: true,
      opacity: 0.65,
      depthWrite: true,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    this.roadMesh = new THREE.InstancedMesh(roadGeo, roadMat, nMax);
    this.roadMesh.frustumCulled = false;
    this.roadMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.roadMesh.count = 0;
    this.roadMesh.renderOrder = 10; // 路面位于底层

    this.ditchMesh = new THREE.InstancedMesh(ditchGeo, ditchMat, nMax);
    this.ditchMesh.frustumCulled = false;
    this.ditchMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ditchMesh.count = 0;
    this.ditchMesh.renderOrder = 12; // 水沟位于路面之上绘制，突出 3D 敞口槽体

    // 排水沟发光轮廓线去化 (彻底消除侧壁对角斜向发光线与杂条纹，保持纯净 PBR 水晶/防渗混凝土槽体)
    this.ditchEdgeMesh = undefined;
  }

  /**
   * 构建单/双洞组合基准几何体 (解耦路面 Shader, 恢复纯净二衬与初支)
   */
  private createHorseshoeBase(
    type: TunnelType,
    r: number,
    targetR: number,
    holeR: number,
    spacing: number,
    aspect_ratio: number
  ): THREE.BufferGeometry {
    const shapes: THREE.Shape[] = [];

    if (type === TunnelType.DOUBLE) {
      shapes.push(buildHorseshoeShape(r, targetR, holeR, -spacing / 2, aspect_ratio));
      shapes.push(buildHorseshoeShape(r, targetR, holeR, spacing / 2, aspect_ratio));
    } else {
      shapes.push(buildHorseshoeShape(r, targetR, holeR, 0, aspect_ratio));
    }

    const settings = { depth: 1.0, bevelEnabled: false, curveSegments: 64 };
    let geometry: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shapes, settings);
    geometry = processHorseshoeLiningGeometry(geometry);

    return geometry;
  }

  /**
   * 获取所有子网格对象 (用于 Viewer3D 注册与显隐控制)
   */
  public getMeshes(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [this.mesh];
    if (this.primaryMesh) meshes.push(this.primaryMesh);
    if (this.roadMesh) meshes.push(this.roadMesh);
    if (this.ditchMesh) meshes.push(this.ditchMesh);
    if (this.ditchEdgeMesh) meshes.push(this.ditchEdgeMesh);
    return meshes;
  }

  /**
   * 动态切换双视觉范式 (Light Studio 影棚风 vs Dark Cyber 赛博暗夜风)
   */
  public setVisualParadigm(mode: 'studio' | 'cyber'): void {
    [this.mesh, this.primaryMesh].forEach(meshObj => {
      if (!meshObj) return;
      const mat = meshObj.material as THREE.ShaderMaterial;
      if (mat && mat.uniforms) {
        if (mode === 'studio') {
          mat.uniforms.uBaseColor.value.setHex(0x1e293b);
          mat.uniforms.uFresnelColor.value.setHex(0x38bdf8);
          mat.uniforms.uOpacity.value = 0.22; // 珍珠水晶玻璃 (Opacity <= 0.25)
          mat.uniforms.uFresnelPower.value = 3.5;
          mat.uniforms.uShowGrid.value = 0.0;
        } else {
          mat.uniforms.uBaseColor.value.setHex(0x1e293b);
          mat.uniforms.uFresnelColor.value.setHex(0x38bdf8);
          mat.uniforms.uOpacity.value = 0.22;
          mat.uniforms.uFresnelPower.value = 3.5;
          mat.uniforms.uShowGrid.value = 1.0;
        }
        mat.needsUpdate = true;
      }
    });

    if (this.roadMesh) {
      const roadMat = this.roadMesh.material as THREE.MeshStandardMaterial;
      if (mode === 'studio') {
        roadMat.color.setHex(0x0f172a);
        roadMat.opacity = 0.55;
        roadMat.roughness = 0.50;
        roadMat.metalness = 0.20;
      } else {
        roadMat.color.setHex(0x0f172a);
        roadMat.opacity = 0.55;
        roadMat.roughness = 0.60;
      }
      roadMat.needsUpdate = true;
    }

    if (this.ditchMesh) {
      const ditchMat = this.ditchMesh.material as THREE.MeshStandardMaterial;
      ditchMat.color.setHex(0x1e3a5a);
      ditchMat.emissive.setHex(0x000000);
      ditchMat.emissiveIntensity = 0.0;
      ditchMat.opacity = 0.65;
      ditchMat.roughness = mode === 'studio' ? 0.50 : 0.40;
      ditchMat.metalness = 0.20;
      ditchMat.needsUpdate = true;
    }

    if (this.ditchEdgeMesh) {
      const edgeMat = this.ditchEdgeMesh.material as THREE.LineBasicMaterial;
      if (mode === 'studio') {
        edgeMat.color.setHex(0x38bdf8);
        edgeMat.opacity = 0.45;
      } else {
        edgeMat.color.setHex(0x00f3ff);
        edgeMat.opacity = 0.45;
      }
      edgeMat.needsUpdate = true;
    }
  }

  /**
   * 动态更新渲染实例数量
   */
  public updateCount(nCurrent: number): void {
    this.mesh.count = Math.min(nCurrent, this.mesh.instanceMatrix.count);
    this.mesh.instanceMatrix.needsUpdate = true;

    if (this.primaryMesh) {
      this.primaryMesh.count = Math.min(nCurrent, this.primaryMesh.instanceMatrix.count);
      this.primaryMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.roadMesh) {
      this.roadMesh.count = Math.min(nCurrent, this.roadMesh.instanceMatrix.count);
      this.roadMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.ditchMesh) {
      this.ditchMesh.count = Math.min(nCurrent, this.ditchMesh.instanceMatrix.count);
      this.ditchMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.ditchEdgeMesh) {
      this.ditchEdgeMesh.count = Math.min(nCurrent, this.ditchEdgeMesh.instanceMatrix.count);
      this.ditchEdgeMesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * 响应参数调整：动态推演空间矩阵并同步状态颜色
   */
  public updateInstanceData(
    nCurrent: number,
    spacingZ: number,
    scaleFactor: number,
    _radius: number,
    _angleDegrees: number,
    stateColors?: THREE.Color[]
  ): void {
    this.updateCount(nCurrent);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor);

    for (let i = 0; i < nCurrent; i++) {
      const z = -(i * spacingZ + spacingZ);

      position.set(0, 0, z);

      const quaternion = new THREE.Quaternion();

      matrix.compose(position, quaternion, scale);

      this.mesh.setMatrixAt(i, matrix);
      if (this.primaryMesh) this.primaryMesh.setMatrixAt(i, matrix);
      if (this.roadMesh) this.roadMesh.setMatrixAt(i, matrix);
      if (this.ditchMesh) this.ditchMesh.setMatrixAt(i, matrix);
      if (this.ditchEdgeMesh) this.ditchEdgeMesh.setMatrixAt(i, matrix);

      if (stateColors && stateColors[i]) {
        this.mesh.setColorAt(i, stateColors[i]);
        if (this.primaryMesh) this.primaryMesh.setColorAt(i, stateColors[i]);
      }
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.primaryMesh) this.primaryMesh.instanceMatrix.needsUpdate = true;
    if (this.roadMesh) this.roadMesh.instanceMatrix.needsUpdate = true;
    if (this.ditchMesh) this.ditchMesh.instanceMatrix.needsUpdate = true;
    if (this.ditchEdgeMesh) this.ditchEdgeMesh.instanceMatrix.needsUpdate = true;

    if (stateColors) {
      [this.mesh, this.primaryMesh].forEach(meshObj => {
        if (!meshObj) return;
        if (meshObj.instanceColor === null) {
          meshObj.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(meshObj.count * 3), 3);
        }
        meshObj.instanceColor.needsUpdate = true;
      });
    }
  }
}

/**
 * 独立导出的马蹄形 Shape 构建工具函数
 * @param r 基准内净空半径
 * @param target_r 目标外轮廓半径 (例如 r2, rg)
 * @param hole_r 可选 Hole 挖孔半径 (例如注浆圈内径 r2)
 * @param offsetX 空间横向 X 偏移
 * @param aspect_ratio 高宽比
 */
export function buildHorseshoeShape(
  r: number,
  target_r: number,
  hole_r?: number,
  offsetX: number = 0,
  aspect_ratio: number = 0.7
): THREE.Shape {
  const shape = new THREE.Shape();

  const buildOuterPath = (targetRadius: number, isHole: boolean): THREE.Path | THREE.Shape => {
    const path = isHole ? new THREE.Path() : shape;

    const R1_base = 1.05 * r;
    const R2_base = 0.65 * r;
    const R3_base = 1.80 * r;

    const dx = R1_base - R2_base;
    const dy = Math.sqrt(Math.max(0, Math.pow(R3_base - R2_base, 2) - Math.pow(dx, 2)));

    const w = 2.1 * r;
    const h = w * aspect_ratio;
    const H_side = Math.max(0.0, h - R1_base + dy - R3_base);
    const invertCenterY = -H_side + dy;

    const t = targetRadius - r;
    const R1 = R1_base + t;
    const R2 = R2_base + t;
    const R3 = R3_base + t;

    let aLeft = Math.atan2(-dy, -dx);
    if (aLeft < 0) aLeft += Math.PI * 2;
    let aRight = Math.atan2(-dy, dx);
    if (aRight < 0) aRight += Math.PI * 2;

    if (isHole) {
      path.moveTo(R1 + offsetX, 0);
      if (H_side > 0) path.lineTo(R1 + offsetX, -H_side);
      path.absarc(dx + offsetX, -H_side, R2, Math.PI * 2, aRight, true);
      path.absarc(offsetX, invertCenterY, R3, aRight, aLeft, true);
      path.absarc(-dx + offsetX, -H_side, R2, aLeft, Math.PI, true);
      if (H_side > 0) path.lineTo(-R1 + offsetX, 0);
      path.absarc(offsetX, 0, R1, Math.PI, 0, true);
    } else {
      path.moveTo(R1 + offsetX, 0);
      path.absarc(offsetX, 0, R1, 0, Math.PI, false);
      if (H_side > 0) path.lineTo(-R1 + offsetX, -H_side);
      path.absarc(-dx + offsetX, -H_side, R2, Math.PI, aLeft, false);
      path.absarc(offsetX, invertCenterY, R3, aLeft, aRight, false);
      path.absarc(dx + offsetX, -H_side, R2, aRight, Math.PI * 2, false);
      if (H_side > 0) path.lineTo(R1 + offsetX, 0);
    }
    return path;
  };

  buildOuterPath(target_r, false);

  if (hole_r !== undefined && hole_r > 0) {
    const holePath = buildOuterPath(hole_r, true) as THREE.Path;
    shape.holes.push(holePath);
  }

  return shape;
}

/**
 * 剔除 ExtrudeGeometry 产生的 Front Cap 和 Back Cap 三角形面片
 * 消除 InstancedMesh 纵向排布时产生的切片端面黑条纹与水沟封闭挡板
 */
export function removeExtrudeEndCaps(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  // 1. 必须彻底清除 ExtrudeGeometry 预设的 Group 规则，防止 WebGLRenderer 依据旧 Group 偏移进行强制绘制
  geometry.clearGroups();

  const posAttr = geometry.getAttribute('position');
  const indexAttr = geometry.getIndex();
  if (!posAttr || !indexAttr) return geometry;

  const indices = indexAttr.array;
  const pos = posAttr.array;
  const newIndices: number[] = [];

  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];

    const za = pos[a * 3 + 2];
    const zb = pos[b * 3 + 2];
    const zc = pos[c * 3 + 2];

    // 如果三角形的 3 个顶点 Z 坐标高度一致 (dz < 1e-4)，说明该面片完全位于截面端面 (Front Cap 或 Back Cap)，直接剔除！
    if (Math.abs(za - zb) < 1e-4 && Math.abs(zb - zc) < 1e-4) {
      continue;
    }
    newIndices.push(a, b, c);
  }

  geometry.setIndex(newIndices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 过滤线框几何体，精准剔除面片三角剖分产生的斜向对角线 (Triangulation Diagonal Edges)
 */
export function filterParallelEdges(edgesGeo: THREE.EdgesGeometry): THREE.BufferGeometry {
  const posAttr = edgesGeo.attributes.position;
  const filteredPos: number[] = [];
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const dir = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i += 2) {
    p1.fromBufferAttribute(posAttr, i);
    p2.fromBufferAttribute(posAttr, i + 1);
    dir.subVectors(p2, p1).normalize();

    // 绝对对角线判别：若线段同时具备 Z 轴分量 (|dir.z| > 1e-3) 与 XY 平面分量 (|dir.x| > 1e-3 || |dir.y| > 1e-3)，则必为面片剖分对角线，直接剔除！
    const hasZ = Math.abs(dir.z) > 1e-3;
    const hasXY = Math.abs(dir.x) > 1e-3 || Math.abs(dir.y) > 1e-3;
    const isDiagonal = hasZ && hasXY;

    if (!isDiagonal) {
      filteredPos.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }

  const cleanGeo = new THREE.BufferGeometry();
  cleanGeo.setAttribute('position', new THREE.Float32BufferAttribute(filteredPos, 3));
  return cleanGeo;
}

/**
  * 解耦侧壁与端面法线，精确防止 45° 倾斜色差条纹，同时完美保留洞口 Native Cap
  */
export function processHorseshoeLiningGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.clearGroups();
  // 转换为非索引 BufferGeometry，隔绝侧壁与端面顶点法线平滑干涉
  const nonIndexedGeo = geometry.toNonIndexed();
  nonIndexedGeo.computeVertexNormals();

  const normAttr = nonIndexedGeo.getAttribute('normal');
  if (!normAttr) return nonIndexedGeo;

  const normals = normAttr.array as Float32Array;
  for (let i = 0; i < normAttr.count; i++) {
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];

    // 如果 nz 绝对值 >= 0.5，说明是端面 Cap 三角形，法线严格收敛至 ±Z 轴 (0, 0, ±1)
    if (Math.abs(nz) >= 0.5) {
      normals[i * 3] = 0;
      normals[i * 3 + 1] = 0;
      normals[i * 3 + 2] = nz > 0 ? 1 : -1;
    } else {
      // 如果是侧壁筒体三角形，法线严格纠偏至 XY 平面 (nz = 0)，彻底消除纵向 1m 实例衔接处的 45° 色差条纹！
      const len = Math.sqrt(nx * nx + ny * ny);
      if (len > 1e-6) {
        normals[i * 3] = nx / len;
        normals[i * 3 + 1] = ny / len;
        normals[i * 3 + 2] = 0;
      } else {
        normals[i * 3 + 2] = 0;
      }
    }
  }

  normAttr.needsUpdate = true;
  return nonIndexedGeo;
}