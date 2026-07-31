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
  public mesh: THREE.InstancedMesh;
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

    // 构建带有多层解算拓扑的二维截面，并执行拉伸
    const geometry = this.createHorseshoeBase(type, r, r2, D_spacing, aspect_ratio);

    // 材质挂载与 Uniform 参数暴露
    const material = new THREE.ShaderMaterial({
      vertexShader: liningVert,
      fragmentShader: liningFrag,
      side: THREE.DoubleSide,
      clipping: true,
      glslVersion: THREE.GLSL3,
      transparent: true,
      uniforms: {
        r: { value: r },
        r1: { value: r1 },
        r2: { value: r2 },
        rg: { value: rg },
        spacing: { value: type === TunnelType.DOUBLE ? D_spacing : 0.0 },
        aspect: { value: aspect_ratio },
        totalLength: { value: this.L_max },
        uBaseColor: { value: new THREE.Color(0x1e2e40) },
        uFresnelColor: { value: new THREE.Color(0x00f3ff) },
        uOpacity: { value: 0.35 },
        uFresnelPower: { value: 3.0 },
        uShowGrid: { value: 1.0 }
      }
    });

    const nMax = Math.ceil(this.L_max / this.delta_l_min) * this.c_ring;
    this.mesh = new THREE.InstancedMesh(geometry, material, nMax);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;

    // 创建独立 PBR 沥青路面与防渗混凝土水沟槽 Mesh
    this.createInternalRoadAndDitchGeometry(type, r, aspect_ratio, D_spacing, nMax);

    // 地表平面生成与埋深推演
    geometry.computeBoundingBox();
    const Y_crown = geometry.boundingBox ? geometry.boundingBox.max.y : (1.05 * r);
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
      // 1. 路面 Shape (顶部切割三沟凹槽，底部沿 R3 弧线相切)
      const roadShape = new THREE.Shape();
      roadShape.moveTo(-halfRoadW + ox, roadY);
      
      // 右侧沟槽凹槽 (x: sideRightXInner -> sideRightX)
      roadShape.lineTo(sideRightXInner + ox, roadY);
      roadShape.lineTo(sideRightXInner + ox, yBot_side);
      roadShape.lineTo(sideRightX + ox, yBot_side);
      roadShape.lineTo(sideRightX + ox, roadY);

      // 中央沟槽凹槽 (x: centralLeftX -> centralRightX)
      roadShape.lineTo(centralRightX + ox, roadY);
      roadShape.lineTo(centralRightX + ox, yBot_central);
      roadShape.lineTo(centralLeftX + ox, yBot_central);
      roadShape.lineTo(centralLeftX + ox, roadY);

      // 左侧沟槽凹槽 (x: sideLeftX -> sideLeftXInner)
      roadShape.lineTo(sideLeftXInner + ox, roadY);
      roadShape.lineTo(sideLeftXInner + ox, yBot_side);
      roadShape.lineTo(sideLeftX + ox, yBot_side);
      roadShape.lineTo(sideLeftX + ox, roadY);

      // 底部沿仰拱圆弧切合
      const steps = 16;
      for (let i = steps; i >= 0; i--) {
        const x = -halfRoadW + (i / steps) * (2 * halfRoadW);
        const y = invertCenterY - Math.sqrt(Math.max(0, R3_base * R3_base - x * x));
        roadShape.lineTo(x + ox, y);
      }
      roadShapes.push(roadShape);

      // 2. 独立三沟 Shape 构造 (构造内嵌 Hole 路径的 U 型空心槽，彻底消除与路面的 Z-Fighting 填充重叠) (WBS 3)
      const createUShape = (xMin: number, xMax: number, yTop: number, yBot: number, wallThickness: number = 0.05) => {
        const s = new THREE.Shape();
        // 外壁 (顺时针)
        s.moveTo(xMin + ox, yTop);
        s.lineTo(xMax + ox, yTop);
        s.lineTo(xMax + ox, yBot);
        s.lineTo(xMin + ox, yBot);
        s.closePath();

        // 内壁 Hole 扣除水流腔体 (逆时针方向，遵循 Non-Zero Winding 规则)
        const hole = new THREE.Path();
        const t = Math.min(wallThickness, (xMax - xMin) / 3);
        hole.moveTo(xMin + t + ox, yTop);
        hole.lineTo(xMin + t + ox, yBot + t);
        hole.lineTo(xMax - t + ox, yBot + t);
        hole.lineTo(xMax - t + ox, yTop);
        s.holes.push(hole);

        return s;
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

    // 沥青路面材质升级：高透透视与 Depth-Test 渲染顺序解耦 (WBS 2.2)
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.6,
      metalness: 0.1,
      transparent: true,
      opacity: 0.55,
      depthWrite: true,
      side: THREE.FrontSide
    });

    // 排水沟材质升级：三层内壁冰蓝自发光与高对比度着色 (WBS 2.1)
    const ditchMat = new THREE.MeshStandardMaterial({
      color: 0x0e3a5a,
      emissive: new THREE.Color(0x00f3ff),
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.2,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });

    this.roadMesh = new THREE.InstancedMesh(roadGeo, roadMat, nMax);
    this.roadMesh.frustumCulled = false;
    this.roadMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.roadMesh.count = 0;
    this.roadMesh.renderOrder = 20; // 保证在水沟及管网后绘制，避免深度裁切 (Reviewer Warning Fixed)

    this.ditchMesh = new THREE.InstancedMesh(ditchGeo, ditchMat, nMax);
    this.ditchMesh.frustumCulled = false;
    this.ditchMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ditchMesh.count = 0;
    this.ditchMesh.renderOrder = 10;

    // U 型水沟顶沿 3D 悬浮发光轮廓线 (WBS 2.3)
    const edgesGeo = new THREE.EdgesGeometry(ditchGeo, 15);
    const ditchEdgeMat = new THREE.LineBasicMaterial({
      color: 0x00f3ff,
      linewidth: 2,
      transparent: true,
      opacity: 0.95
    });
    this.ditchEdgeMesh = new THREE.InstancedMesh(edgesGeo, ditchEdgeMat, nMax);
    this.ditchEdgeMesh.frustumCulled = false;
    this.ditchEdgeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ditchEdgeMesh.count = 0;
    this.ditchEdgeMesh.renderOrder = 15;
  }

  /**
   * 构建单/双洞组合基准几何体 (解耦路面 Shader, 恢复纯净二衬)
   */
  private createHorseshoeBase(type: TunnelType, r: number, r2: number, spacing: number, aspect_ratio: number): THREE.BufferGeometry {
    const shapes: THREE.Shape[] = [];

    if (type === TunnelType.DOUBLE) {
      shapes.push(buildHorseshoeShape(r, r2, r, -spacing / 2, aspect_ratio));
      shapes.push(buildHorseshoeShape(r, r2, r, spacing / 2, aspect_ratio));
    } else {
      shapes.push(buildHorseshoeShape(r, r2, r, 0, aspect_ratio));
    }

    const settings = { depth: 1.0, bevelEnabled: false, curveSegments: 64 };
    let geometry: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shapes, settings);
    geometry = removeExtrudeEndCaps(geometry);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * 获取所有子网格对象 (用于 Viewer3D 注册与显隐控制)
   */
  public getMeshes(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [this.mesh];
    if (this.roadMesh) meshes.push(this.roadMesh);
    if (this.ditchMesh) meshes.push(this.ditchMesh);
    if (this.ditchEdgeMesh) meshes.push(this.ditchEdgeMesh);
    return meshes;
  }

  /**
   * 动态切换双视觉范式 (Light Studio 影棚风 vs Dark Cyber 赛博暗夜风)
   */
  public setVisualParadigm(mode: 'studio' | 'cyber'): void {
    const mat = this.mesh.material as THREE.ShaderMaterial;
    if (mat && mat.uniforms) {
      if (mode === 'studio') {
        mat.uniforms.uBaseColor.value.setHex(0xd0d5dd);
        mat.uniforms.uFresnelColor.value.setHex(0xffffff);
        mat.uniforms.uOpacity.value = 0.15; // 极高透明影棚玻璃
        mat.uniforms.uFresnelPower.value = 5.0;
        mat.uniforms.uShowGrid.value = 0.0;
      } else {
        mat.uniforms.uBaseColor.value.setHex(0x1e2e40);
        mat.uniforms.uFresnelColor.value.setHex(0x00f3ff);
        mat.uniforms.uOpacity.value = 0.35;
        mat.uniforms.uFresnelPower.value = 3.0;
        mat.uniforms.uShowGrid.value = 1.0;
      }
      mat.needsUpdate = true;
    }

    if (this.roadMesh) {
      const roadMat = this.roadMesh.material as THREE.MeshStandardMaterial;
      if (mode === 'studio') {
        roadMat.color.setHex(0x334155);
        roadMat.opacity = 0.65;
        roadMat.roughness = 0.85;
      } else {
        roadMat.color.setHex(0x0f172a);
        roadMat.opacity = 0.55;
        roadMat.roughness = 0.6;
      }
      roadMat.needsUpdate = true;
    }

    if (this.ditchMesh) {
      const ditchMat = this.ditchMesh.material as THREE.MeshStandardMaterial;
      if (mode === 'studio') {
        ditchMat.color.setHex(0x0284c7);
        ditchMat.emissive.setHex(0x0284c7);
        ditchMat.emissiveIntensity = 0.4;
        ditchMat.roughness = 0.5;
      } else {
        ditchMat.color.setHex(0x0e3a5a);
        ditchMat.emissive.setHex(0x00f3ff);
        ditchMat.emissiveIntensity = 0.6;
        ditchMat.roughness = 0.3;
      }
      ditchMat.needsUpdate = true;
    }

    if (this.ditchEdgeMesh) {
      const edgeMat = this.ditchEdgeMesh.material as THREE.LineBasicMaterial;
      if (mode === 'studio') {
        edgeMat.color.setHex(0x0284c7);
        edgeMat.opacity = 0.7;
      } else {
        edgeMat.color.setHex(0x00f3ff);
        edgeMat.opacity = 0.95;
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
      const z = -i * spacingZ;

      position.set(0, 0, z);

      const quaternion = new THREE.Quaternion();

      matrix.compose(position, quaternion, scale);

      this.mesh.setMatrixAt(i, matrix);
      if (this.roadMesh) this.roadMesh.setMatrixAt(i, matrix);
      if (this.ditchMesh) this.ditchMesh.setMatrixAt(i, matrix);
      if (this.ditchEdgeMesh) this.ditchEdgeMesh.setMatrixAt(i, matrix);

      if (stateColors && stateColors[i]) {
        this.mesh.setColorAt(i, stateColors[i]);
      }
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.roadMesh) this.roadMesh.instanceMatrix.needsUpdate = true;
    if (this.ditchMesh) this.ditchMesh.instanceMatrix.needsUpdate = true;
    if (this.ditchEdgeMesh) this.ditchEdgeMesh.instanceMatrix.needsUpdate = true;

    if (stateColors) {
      if (this.mesh.instanceColor === null) {
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.mesh.count * 3), 3);
      }
      this.mesh.instanceColor.needsUpdate = true;
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
 * 包含内部路面/排水沟槽切口的衬砌 Shape 构建函数
 */
function createHorseshoeLiningShape(r: number, r2: number, offsetX: number, aspect_ratio: number): THREE.Shape {
  const shape = new THREE.Shape();

  const buildPath = (target_r: number, isHole: boolean): THREE.Path | THREE.Shape => {
    const path = isHole ? new THREE.Path() : shape;
    const R1_base = 1.05 * r;
    const R2_base = 0.65 * r;
    const R3_base = 1.80 * r;

    const dx = R1_base - R2_base;
    const dy = Math.sqrt(Math.pow(R3_base - R2_base, 2) - Math.pow(dx, 2));

    const w = 2.1 * r;
    const h = w * aspect_ratio;
    const H_side = Math.max(0.0, h - R1_base + dy - R3_base);
    const invertCenterY = -H_side + dy;

    const t = target_r - r;
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

      const ditchW = 0.6;
      const ditchH = 0.8;
      const halfW = ditchW / 2;

      const dy_road = R3 - ditchH;
      const halfRoadW = Math.sqrt(Math.max(0, R3 * R3 - dy_road * dy_road));
      const roadY = invertCenterY - dy_road;
      const sideW = 0.3;

      const halfSideW = halfRoadW - sideW;
      const r3Y_at_side = invertCenterY - Math.sqrt(R3 * R3 - halfSideW * halfSideW);

      let aSideInnerRight = Math.atan2(r3Y_at_side - invertCenterY, halfSideW);
      if (aSideInnerRight < 0) aSideInnerRight += Math.PI * 2;

      path.absarc(offsetX, invertCenterY, R3, aRight, aSideInnerRight, true);
      path.lineTo(offsetX + halfSideW, roadY);

      const r_threshold = 5.0;
      if (r > r_threshold) {
        const ditchBottomY = invertCenterY - Math.sqrt(R3 * R3 - halfW * halfW);
        path.lineTo(offsetX + halfW, roadY);
        path.lineTo(offsetX + halfW, ditchBottomY);
        path.lineTo(offsetX - halfW, ditchBottomY);
        path.lineTo(offsetX - halfW, roadY);
      }

      path.lineTo(offsetX - halfSideW, roadY);
      path.lineTo(offsetX - halfSideW, r3Y_at_side);

      let aSideInnerLeft = Math.atan2(r3Y_at_side - invertCenterY, -halfSideW);
      if (aSideInnerLeft < 0) aSideInnerLeft += Math.PI * 2;

      path.absarc(offsetX, invertCenterY, R3, aSideInnerLeft, aLeft, true);
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

  buildPath(r2, false);
  const holePath = buildPath(r, true) as THREE.Path;
  shape.holes.push(holePath);

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