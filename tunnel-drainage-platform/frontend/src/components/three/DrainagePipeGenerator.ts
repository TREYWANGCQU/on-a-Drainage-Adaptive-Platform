// tunnel-drainage-platform/frontend/src/components/three/DrainagePipeGenerator.ts
import * as THREE from 'three';
import { calculateNormalQuaternion, HorseshoeArcCurve } from '@/utils/math';

/**
 * 排水管生成器 - 基于后端计算结果动态渲染环向/纵向/横向排水管网
 * 
 * 遵循《阶段4-排水管网3D模型专项问题诊断与完善方案.md》：
 * 1. 环向盲管：贴合衬砌背水面的 270° 马蹄形拱形半环，下落终止于两侧水沟底。
 * 2. 纵向排水管：精准卧于两侧边沟槽底与中心水沟槽底。
 * 3. 横向连接管：由两侧边沟底向中心水沟底呈 3% 横坡下倾连通。
 * 4. 数据驱动预警：绑定 q_drain 涌水量，实现正常(天蓝)/富水预警(琥珀黄)/堵塞(警示红)预警着色及加密。
 */
export interface DrainagePipeConfig {
  /** 环向排水管推荐内径 (m)，对应 ring_diam_recommend */
  ringDiam: number;
  /** 环向排水管推荐间距 (m)，对应 ring_spacing_recommend */
  ringSpacing: number;
  /** 纵向排水管默认内径 (m)，对应 d_long_default */
  longDiam: number;
  /** 横向排水管默认内径 (m)，对应 d_lat_default */
  latDiam: number;
  /** 是否双侧排水，对应 double_side */
  doubleSide: boolean;
  /** 隧道类型，对应 tunnel_type */
  tunnelType: 'single' | 'double';
  /** 分区起点里程 (m)，对应 start_chainage */
  startChainage: number;
  /** 分区终点里程 (m)，对应 end_chainage */
  endChainage: number;
  /** 隧道等效内半径 (m)，对应 r，用于定位管位 */
  tunnelRadius: number;
  /** 衬砌外轮廓半径 (m)，对应 r2，初支背水面交界面 */
  outerRadius?: number;
  /** 双洞间距 (m)，对应 D_spacing，双洞模式下有效 */
  dSpacing?: number;
}

export class DrainagePipeGenerator {
  public ringMesh: THREE.InstancedMesh;        // 主洞环向排水盲管 (270°马蹄拱形半环)
  // public radialMesh?: THREE.InstancedMesh;   // (已注销) 径向打孔排水管
  public longMesh: THREE.InstancedMesh;        // 主洞纵向排水管 (槽底卧铺)
  public latMesh: THREE.InstancedMesh;         // 主洞横向连接管 (倾斜重力自流)

  public leftRingMesh?: THREE.InstancedMesh;   // 双洞副洞环向管
  // public leftRadialMesh?: THREE.InstancedMesh; // (已注销) 双洞副洞径向管
  public leftLongMesh?: THREE.InstancedMesh;   // 双洞副洞纵向管
  public leftLatMesh?: THREE.InstancedMesh;    // 双洞副洞横向管

  public annotationGroup: THREE.Group;        // 排水管网参数标注图层组

  private config: DrainagePipeConfig;
  private horseshoeCurve: HorseshoeArcCurve;

  constructor(config: DrainagePipeConfig) {
    this.config = config;
    this.annotationGroup = new THREE.Group();
    this.annotationGroup.name = 'DrainagePipeAnnotations';
    this.annotationGroup.renderOrder = 999;
    const r2 = config.outerRadius ?? (config.tunnelRadius + 1.0);
    this.horseshoeCurve = new HorseshoeArcCurve(config.tunnelRadius, r2, 0.7);

    // 1. 环向盲管：使用 HorseshoeArcCurve 导出的 TubeGeometry 270° 马蹄形半环 (黄铜金 #F59E0B)
    const ringCount = this.calculateRingCount();
    this.ringMesh = this.createRingInstancedMesh(config.ringDiam, ringCount, 0xf59e0b);

    // 2. 径向打孔排水管：已根据要求注销代码
    // const radialPerRing = 7;
    // const radialCount = ringCount * radialPerRing;
    // this.radialMesh = this.createRadialInstancedMesh(radialCount, 0x3498db);

    // 3. 纵向排水管：侧边沟槽底 + 中心水沟槽底 (深金 #D97706)
    const longCount = this.calculateLongCount();
    this.longMesh = this.createCylinderInstancedMesh(config.longDiam / 2, 1.0, longCount, 0xd97706, 0.95, 0.12);

    // 4. 横向连接管：连接侧沟槽底与中心沟槽底 (亮金 #EAB308)
    const latCount = this.calculateLatCount() * (config.doubleSide ? 2 : 1);
    this.latMesh = this.createCylinderInstancedMesh(config.latDiam / 2, 1.0, latCount, 0xeab308, 0.90, 0.18);

    // 双洞模式：创建副洞实例
    if (config.tunnelType === 'double') {
      this.leftRingMesh = this.createRingInstancedMesh(config.ringDiam, ringCount, 0xf59e0b);
      // this.leftRadialMesh = this.createRadialInstancedMesh(radialCount, 0x3498db);
      this.leftLongMesh = this.createCylinderInstancedMesh(config.longDiam / 2, 1.0, longCount, 0xd97706, 0.95, 0.12);
      this.leftLatMesh = this.createCylinderInstancedMesh(config.latDiam / 2, 1.0, latCount, 0xeab308, 0.90, 0.18);
    }
  }

  /**
   * 解算马蹄形衬砌底部水沟与路面物理几何参数 (与 TunnelGenerator.ts 100% 精确对齐)
   */
  private getDitchGeometry() {
    const r = this.config.tunnelRadius;
    const aspect_ratio = 0.7;
    const R1_base = 1.05 * r;
    const R2_base = 0.65 * r;
    const R3_base = 1.80 * r;

    const dx_offset = R1_base - R2_base;
    const dy_offset = Math.sqrt(Math.max(0, Math.pow(R3_base - R2_base, 2) - Math.pow(dx_offset, 2)));

    const w = 2.1 * r;
    const h = w * aspect_ratio;
    const H_side = Math.max(0.0, h - R1_base + dy_offset - R3_base);
    const invertCenterY = -H_side + dy_offset;

    const ditchH = 0.8;
    const dy_road = R3_base - ditchH;
    const roadY = invertCenterY - dy_road;

    const yBot_side = roadY - 0.3;
    const max_x_lining = Math.sqrt(Math.max(0, R3_base * R3_base - Math.pow(invertCenterY - yBot_side, 2)));
    const sideDitchX = max_x_lining - 0.25;
    const sideDitchBottomY = yBot_side;

    const yBot_central = invertCenterY - R3_base + 0.05;
    const ditchBottomY = yBot_central;

    return { sideDitchX, roadY, sideDitchBottomY, ditchBottomY };
  }

  /**
   * 创建 270° 马蹄拱形半环 实例化网格 (抛光黄铜 PBR 材质)
   */
  private createRingInstancedMesh(radius: number, count: number, color: number): THREE.InstancedMesh {
    // 关键修正：入参 radius 为管径 (Diameter)，需除以 2 转换为物理半径
    const pipeRadius = Math.max(0.01, radius / 2.0);
    const tubeGeometry = new THREE.TubeGeometry(this.horseshoeCurve, 64, pipeRadius, 8, false);
    
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.15,
      metalness: 0.92,
      emissive: new THREE.Color(0x000000),
      clippingPlanes: []
    });

    const mesh = new THREE.InstancedMesh(tubeGeometry, material, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 50;
    mesh.userData = { pipeCategory: 'ring', name: '环向排水盲管', diameter: Math.round(radius * 1000), spacing: this.config.ringSpacing };
    return mesh;
  }

  /**
   * (已注销) 创建径向打孔排水管 实例化网格
   */
  /*
  private createRadialInstancedMesh(count: number, color: number): THREE.InstancedMesh {
    const geometry = new THREE.CylinderGeometry(0.025, 0.025, 4.0, 8);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0.2,
      clippingPlanes: []
    });

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { pipeCategory: 'radial', name: '径向管', diameter: 50, length: 4.0 };
    return mesh;
  }
  */

  /**
   * 创建标准圆柱 实例化网格 (纵向/横向管)
   */
  private createCylinderInstancedMesh(
    radius: number, 
    length: number, 
    count: number, 
    color: number, 
    metalness: number = 0.92, 
    roughness: number = 0.15
  ): THREE.InstancedMesh {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 12);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive: new THREE.Color(0x000000),
      clippingPlanes: []
    });

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 50;
    mesh.userData = { pipeCategory: 'ditch', name: '排水连通管', diameter: Math.round(radius * 2000) };
    return mesh;
  }

  /**
   * 切换管道双模式质感 (影棚抛光黄金 PBR vs 赛博暗夜微光)
   */
  public setVisualParadigm(mode: 'studio' | 'cyber'): void {
    const meshes = this.getMeshes();
    meshes.forEach(mesh => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat) return;
      if (mode === 'studio') {
        mat.metalness = 0.95;
        mat.roughness = 0.12;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0.0;
      } else {
        mat.metalness = 0.85;
        mat.roughness = 0.20;
        mat.emissive.setHex(0x221500);
        mat.emissiveIntensity = 0.15;
      }
      mat.needsUpdate = true;
    });
  }

  private calculateRingCount(): number {
    const length = Math.abs(this.config.endChainage - this.config.startChainage);
    const spacing = Math.max(1.0, this.config.ringSpacing);
    const baseRings = Math.max(1, Math.ceil(length / spacing));
    return baseRings * 2; // 预留双倍显存容量支持加密
  }

  private calculateLongCount(): number {
    return this.config.doubleSide ? 3 : 2;
  }

  private calculateLatCount(): number {
    const length = Math.abs(this.config.endChainage - this.config.startChainage);
    const latSpacing = Math.max(2.0, this.config.ringSpacing * 2);
    return Math.max(1, Math.ceil(length / latSpacing));
  }

  /**
   * 更新所有排水管实例数据 (数据驱动与预警联动)
   */
  public updateFromSnapshot(snapshot: any, viewMode: 'original' | 'critical' | 'all' = 'original'): void {
    if (!snapshot) return;

    const critState = snapshot.critical_state ?? snapshot.results?.critical_state;
    const hasCrit = critState && Object.keys(critState).length > 0;

    let targetState: any = {};
    let isCriticalEmpty = false;
    let activeStateTag: 'original' | 'critical' | 'critical_empty' = 'original';

    if (viewMode === 'original') {
      targetState = snapshot.original_state ?? snapshot.results?.original_state ?? {};
      activeStateTag = 'original';
    } else {
      // viewMode === 'critical' 或 'all'：优先表达【临界状态】，若无临界状态则自动降级为【原始状态】
      if (hasCrit) {
        targetState = critState;
        activeStateTag = 'critical';
      } else {
        targetState = snapshot.original_state ?? snapshot.results?.original_state ?? {};
        if (viewMode === 'critical') {
          isCriticalEmpty = true;
          activeStateTag = 'critical_empty';
        } else {
          activeStateTag = 'original';
        }
      }
    }

    const params = snapshot.input_parameter ?? snapshot.params ?? {};
    const qDrain = targetState.q_drain ?? targetState.q ?? snapshot.results?.q_drain ?? params.q_drain ?? 0.8;
    
    this.config.ringDiam = targetState.ring_diam_recommend ?? targetState.d_ring ?? params.d_ring_default ?? this.config.ringDiam;
    const baseSpacing = targetState.ring_spacing_recommend ?? targetState.S_ring ?? params.S_code_max ?? this.config.ringSpacing;
    this.config.ringSpacing = baseSpacing;

    this.config.longDiam = targetState.long_diam_recommend ?? targetState.d_long ?? params.d_long_default ?? this.config.longDiam;
    this.config.latDiam = targetState.lateral_diam_recommend ?? targetState.d_lat ?? params.d_lat_default ?? this.config.latDiam;
    this.config.doubleSide = params.double_side ?? this.config.doubleSide;

    if (this.config.tunnelType === 'double') {
      this.config.dSpacing = params.D_spacing ?? this.config.dSpacing;
    }

    // 预警着色逻辑
    let stateColor = 0xf59e0b; // 正常工况：黄铜金 (#F59E0B)
    if (qDrain > 3.0) {
      stateColor = 0xe74c3c; // 堵塞过载：警示红
    } else if (qDrain > 1.0) {
      stateColor = 0xf39c12; // 富水预警：琥珀黄
    }

    (this.ringMesh.material as THREE.MeshStandardMaterial).color.setHex(stateColor);
    if (this.leftRingMesh) {
      (this.leftRingMesh.material as THREE.MeshStandardMaterial).color.setHex(stateColor);
    }

    const isDouble = this.config.tunnelType === 'double';
    const mainXOffset = isDouble ? (this.config.dSpacing ?? 30.0) / 2 : 0;
    const subXOffset = isDouble ? -(this.config.dSpacing ?? 30.0) / 2 : 0;

    // 刷新各管网图层实例
    this.updateRingPipes(mainXOffset, this.ringMesh);
    // if (this.radialMesh) this.updateRadialPipes(mainXOffset, this.radialMesh); // (已注销)
    this.updateLongPipes(mainXOffset, this.longMesh);
    this.updateLatPipes(mainXOffset, this.latMesh);

    if (isDouble) {
      if (this.leftRingMesh) this.updateRingPipes(subXOffset, this.leftRingMesh);
      // if (this.leftRadialMesh) this.updateRadialPipes(subXOffset, this.leftRadialMesh); // (已注销)
      if (this.leftLongMesh) this.updateLongPipes(subXOffset, this.leftLongMesh);
      if (this.leftLatMesh) this.updateLatPipes(subXOffset, this.leftLatMesh);
    }

    // 刷新排水管网数值参数标注 (传入活跃状态标签)
    this.updateAnnotations(snapshot, activeStateTag);
  }

  /**
   * 更新环向排水盲管 (270° 马蹄形拱形半环)
   */
  private updateRingPipes(xOffset: number = 0, targetMesh: THREE.InstancedMesh = this.ringMesh): void {
    const lengthVal = Math.abs(this.config.endChainage - this.config.startChainage);
    const count = Math.max(1, Math.ceil(lengthVal / this.config.ringSpacing));
    targetMesh.count = Math.min(count, targetMesh.instanceMatrix.count);

    const matrix = new THREE.Matrix4();
    for (let i = 0; i < targetMesh.count; i++) {
      const z = -(i * this.config.ringSpacing);
      matrix.setPosition(xOffset, 0, z);
      targetMesh.setMatrixAt(i, matrix);
    }

    targetMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * (已注销) 更新径向打孔排水管图层
   */
  /*
  private updateRadialPipes(xOffset: number = 0, targetMesh: THREE.InstancedMesh = this.radialMesh): void {
    targetMesh.visible = false;
    const lengthVal = Math.abs(this.config.endChainage - this.config.startChainage);
    const ringCount = Math.max(1, Math.ceil(lengthVal / this.config.ringSpacing));
    const sampledPoints = this.horseshoeCurve.sampledPoints;
    const sampledNormals = this.horseshoeCurve.sampledNormals;

    // 选择 7 个分布角度的索引
    const sampleIndices = [4, 12, 20, 32, 44, 52, 60].filter(idx => idx < sampledPoints.length);
    const radialsPerRing = sampleIndices.length;
    const totalRadials = ringCount * radialsPerRing;
    targetMesh.count = Math.min(totalRadials, targetMesh.instanceMatrix.count);

    const matrix = new THREE.Matrix4();
    const radialLen = 4.0;

    let idx = 0;
    for (let i = 0; i < ringCount; i++) {
      const z = -(i * this.config.ringSpacing);

      for (const sampleIdx of sampleIndices) {
        if (idx >= targetMesh.count) break;

        const pt = sampledPoints[sampleIdx];
        const normal = sampledNormals[sampleIdx];

        // 径向管中点坐标：自拱面向围岩深部延伸 2.0m
        const centerPos = new THREE.Vector3(
          xOffset + pt.x + normal.x * (radialLen / 2),
          pt.y + normal.y * (radialLen / 2),
          z
        );

        // 顺法向旋转四元数
        const targetPos = new THREE.Vector3(
          xOffset + pt.x + normal.x * radialLen,
          pt.y + normal.y * radialLen,
          z
        );
        const quat = calculateNormalQuaternion(targetPos, new THREE.Vector3(xOffset + pt.x, pt.y, z));

        matrix.compose(centerPos, quat, new THREE.Vector3(1, 1, 1));
        targetMesh.setMatrixAt(idx, matrix);
        idx++;
      }
    }

    targetMesh.instanceMatrix.needsUpdate = true;
  }
  */

  /**
   * 更新纵向排水管
   * 侧边管精准沉入 sideDitchBottomY (roadY - 0.4)
   * 中心管精准沉入 ditchBottomY
   */
  private updateLongPipes(xOffset: number = 0, targetMesh: THREE.InstancedMesh = this.longMesh): void {
    const count = this.calculateLongCount();
    targetMesh.count = Math.min(count, targetMesh.instanceMatrix.count);

    const matrix = new THREE.Matrix4();
    const length = Math.abs(this.config.endChainage - this.config.startChainage);
    const scale = new THREE.Vector3(1, length, 1);
    const { sideDitchX, sideDitchBottomY, ditchBottomY } = this.getDitchGeometry();
    const longRadius = this.config.longDiam / 2;

    const quaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI / 2
    );

    // 0: 右侧边沟管 (沉入侧边沟槽底)
    if (targetMesh.count > 0) {
      const posRight = new THREE.Vector3(xOffset + sideDitchX, sideDitchBottomY + longRadius, -length / 2);
      matrix.compose(posRight, quaternion, scale);
      targetMesh.setMatrixAt(0, matrix);
    }

    // 1: 左侧边沟管 (若双侧排水，沉入侧边沟槽底)
    if (this.config.doubleSide && targetMesh.count > 1) {
      const posLeft = new THREE.Vector3(xOffset - sideDitchX, sideDitchBottomY + longRadius, -length / 2);
      matrix.compose(posLeft, quaternion, scale);
      targetMesh.setMatrixAt(1, matrix);
    }

    // 2: 中心水沟管 (沉入中心水沟槽底)
    const centerIdx = this.config.doubleSide ? 2 : 1;
    if (targetMesh.count > centerIdx) {
      const posCenter = new THREE.Vector3(xOffset, ditchBottomY + longRadius, -length / 2);
      matrix.compose(posCenter, quaternion, scale);
      targetMesh.setMatrixAt(centerIdx, matrix);
    }

    targetMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 更新横向连接管
   * 具备 3% 横向下倾坡度：由 (sideDitchX, sideDitchBottomY) 倾斜下泄至 (0, ditchBottomY)
   */
  private updateLatPipes(xOffset: number = 0, targetMesh: THREE.InstancedMesh = this.latMesh): void {
    const count = this.calculateLatCount();
    const isDoubleSide = this.config.doubleSide;
    const totalPipes = isDoubleSide ? count * 2 : count;
    targetMesh.count = Math.min(totalPipes, targetMesh.instanceMatrix.count);

    const matrix = new THREE.Matrix4();
    const { sideDitchX, sideDitchBottomY, ditchBottomY } = this.getDitchGeometry();
    const latRadius = this.config.latDiam / 2;

    // 单根横向管矢量计算 (侧沟底 -> 中心沟底)
    const dy = ditchBottomY - sideDitchBottomY; // 负值，代表下倾
    const pipeLength = Math.sqrt(sideDitchX * sideDitchX + dy * dy);
    const scale = new THREE.Vector3(1, pipeLength, 1);

    // 右侧倾斜 Quaternion (从 (sideDitchX, sideDitchBottomY) 倾斜指向量 (0, ditchBottomY))
    const dirRight = new THREE.Vector3(-sideDitchX, dy, 0).normalize();
    const qRight = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirRight);

    // 左侧倾斜 Quaternion (从 (-sideDitchX, sideDitchBottomY) 倾斜指向量 (0, ditchBottomY))
    const dirLeft = new THREE.Vector3(sideDitchX, dy, 0).normalize();
    const qLeft = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirLeft);

    let idx = 0;
    for (let i = 0; i < count; i++) {
      const z = -(i * this.config.ringSpacing * 2);

      // 右侧边沟 -> 中心水沟
      if (idx < targetMesh.count) {
        const midPosRight = new THREE.Vector3(
          xOffset + sideDitchX / 2,
          (sideDitchBottomY + ditchBottomY) / 2 + latRadius,
          z
        );
        matrix.compose(midPosRight, qRight, scale);
        targetMesh.setMatrixAt(idx, matrix);
        idx++;
      }

      // 左侧边沟 -> 中心水沟 (双侧排水)
      if (isDoubleSide && idx < targetMesh.count) {
        const midPosLeft = new THREE.Vector3(
          xOffset - sideDitchX / 2,
          (sideDitchBottomY + ditchBottomY) / 2 + latRadius,
          z
        );
        matrix.compose(midPosLeft, qLeft, scale);
        targetMesh.setMatrixAt(idx, matrix);
        idx++;
      }
    }

    targetMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 获取所有网格对象用于场景添加
   */
  public getMeshes(): THREE.InstancedMesh[] {
    const meshes: THREE.InstancedMesh[] = [
      this.ringMesh,
      // this.radialMesh, // (已注销：已在三维模型中彻底移除径向打孔排水管)
      this.longMesh,
      this.latMesh
    ];

    if (this.leftRingMesh) meshes.push(this.leftRingMesh);
    // if (this.leftRadialMesh) meshes.push(this.leftRadialMesh); // (已注销)
    if (this.leftLongMesh) meshes.push(this.leftLongMesh);
    if (this.leftLatMesh) meshes.push(this.leftLatMesh);

    return meshes.filter(Boolean);
  }

  /**
   * 更新可视化状态（用于安全系数预警着色）
   */
  public updateStateColors(stateColors: THREE.Color[]): void {
    const meshes = this.getMeshes();
    meshes.forEach(mesh => {
      for (let i = 0; i < mesh.count && i < stateColors.length; i++) {
        mesh.setColorAt(i, stateColors[i]);
      }
      if (mesh.instanceColor === null) {
        mesh.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(mesh.count * 3), 3
        );
      }
      mesh.instanceColor.needsUpdate = true;
    });
  }

  /**
   * 创建高性能 Canvas Texture Sprite 标注 (含动态字号防溢出自适应)
   */
  private createTextSprite(text: string, color = '#38bdf8'): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const canvasWidth = 512;
    const canvasHeight = 128;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d')!;

    // 动态字号自适应计算，防长文本超出边框
    let fontSize = 34;
    ctx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
    let textWidth = ctx.measureText(text).width;
    const maxAllowedWidth = 460; // 边框内最大有效文本宽度

    if (textWidth > maxAllowedWidth) {
      fontSize = Math.max(18, Math.floor(fontSize * (maxAllowedWidth / textWidth)));
      ctx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
    }

    // 背景圆角框
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    const margin = 8;
    const boxW = canvasWidth - margin * 2;
    const boxH = canvasHeight - margin * 2;

    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(margin, margin, boxW, boxH, 12);
    } else {
      ctx.rect(margin, margin, boxW, boxH);
    }
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.stroke();

    // 绘制文本
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvasWidth / 2, canvasHeight / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.renderOrder = 999;
    sprite.scale.set(6.0, 1.5, 1.0);
    return sprite;
  }

  /**
   * 依据快照数据动态更新管网标注 (支持原始/临界状态优先区分与空值降级)
   */
  public updateAnnotations(_snapshot: any, activeStateTag: 'original' | 'critical' | 'critical_empty' = 'original'): void {
    // 清空现有标注
    while (this.annotationGroup.children.length > 0) {
      const child = this.annotationGroup.children[0] as THREE.Sprite;
      this.annotationGroup.remove(child);
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    }

    const ditchGeo = this.getDitchGeometry();
    const isDouble = this.config.tunnelType === 'double';
    const mainXOffset = isDouble ? (this.config.dSpacing ?? 30.0) / 2 : 0;
    const r2 = this.config.outerRadius ?? (this.config.tunnelRadius + 1.0);
    const length = Math.abs(this.config.endChainage - this.config.startChainage);

    // 构造状态区分前缀文本与颜色
    let prefix = '[原始] ';
    let labelColor = '#38bdf8';
    if (activeStateTag === 'critical') {
      prefix = '[临界] ';
      labelColor = '#ff9900';
    } else if (activeStateTag === 'critical_empty') {
      prefix = '[临界: 安全储备足够无需加固] ';
      labelColor = '#00ff88';
    }

    // 1. 环向盲管标注
    const ringDiamMm = Math.round(this.config.ringDiam * 1000);
    const ringSpacingM = this.config.ringSpacing.toFixed(1);
    const ringText = `${prefix}环向盲管: Φ${ringDiamMm}mm @ ${ringSpacingM}m 🔍`;
    const ringSprite = this.createTextSprite(ringText, labelColor);
    ringSprite.position.set(mainXOffset, r2 + 0.6, -this.config.startChainage);
    ringSprite.userData = {
      pipeCategory: 'ring',
      name: '环向排水盲管',
      diameter: ringDiamMm,
      spacing: parseFloat(ringSpacingM),
      permeability: '1.2×10⁻² cm/s',
      flowRate: '0.15 L/s',
      status: '自流通畅'
    };
    this.annotationGroup.add(ringSprite);

    // 2. 纵向排水管标注
    const longDiamMm = Math.round(this.config.longDiam * 1000);
    const longText = `${prefix}纵向排水管: Φ${longDiamMm}mm 🔍`;
    const longSprite = this.createTextSprite(longText, '#2ecc71');
    longSprite.position.set(mainXOffset + ditchGeo.sideDitchX, ditchGeo.sideDitchBottomY + 0.5, -this.config.startChainage - length * 0.4);
    longSprite.userData = {
      pipeCategory: 'longitudinal',
      name: '纵向主排水管',
      diameter: longDiamMm,
      spacing: 50.0,
      permeability: '2.5×10⁻² cm/s',
      flowRate: '0.45 L/s',
      status: '主干自流'
    };
    this.annotationGroup.add(longSprite);

    // 3. 横向排水管标注
    const latDiamMm = Math.round(this.config.latDiam * 1000);
    const latText = `${prefix}横向排水管: Φ${latDiamMm}mm 🔍`;
    const latSprite = this.createTextSprite(latText, '#e74c3c');
    latSprite.position.set(mainXOffset + ditchGeo.sideDitchX / 2, (ditchGeo.sideDitchBottomY + ditchGeo.ditchBottomY) / 2 + 0.5, -this.config.startChainage - length * 0.2);
    latSprite.userData = {
      pipeCategory: 'lateral',
      name: '横向连通排水管',
      diameter: latDiamMm,
      spacing: parseFloat(ringSpacingM) * 2,
      permeability: '1.8×10⁻² cm/s',
      flowRate: '0.28 L/s',
      status: '倾斜自流 (3%)'
    };
    this.annotationGroup.add(latSprite);

    // 4. 径向管文本标注已移除
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    const meshes = this.getMeshes();
    meshes.forEach(mesh => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });

    while (this.annotationGroup.children.length > 0) {
      const child = this.annotationGroup.children[0] as THREE.Sprite;
      this.annotationGroup.remove(child);
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    }
  }
}
