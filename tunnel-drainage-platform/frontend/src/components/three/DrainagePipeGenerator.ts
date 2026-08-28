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
  /** 二衬外轮廓/初支内轮廓半径 (m)，对应 r1，背水面交界面 */
  outerRadius?: number;
  /** 双洞间距 (m)，对应 D_spacing，双洞模式下有效 */
  dSpacing?: number;
  /** 是否设置中央深排水沟 (默认 true) */
  hasCentralDitch?: boolean;
}

export class DrainagePipeGenerator {
  public ringMesh: THREE.InstancedMesh;        // 主洞环向排水盲管 (270°马蹄拱形半环)
  // public radialMesh?: THREE.InstancedMesh;   // (已注销) 径向打孔排水管
  public longMesh: THREE.InstancedMesh;        // 主洞纵向排水管 (拱脚交界面)
  public latMesh: THREE.InstancedMesh;         // 主洞横向连接管 (穿衬 3% 下倾汇流)

  public leftRingMesh?: THREE.InstancedMesh;   // 双洞副洞环向管
  // public leftRadialMesh?: THREE.InstancedMesh; // (已注销) 双洞副洞径向管
  public leftLongMesh?: THREE.InstancedMesh;   // 双洞副洞纵向管
  public leftLatMesh?: THREE.InstancedMesh;    // 双洞副洞横向管

  public annotationGroup: THREE.Group;        // 排水管网参数标注图层组

  private config: DrainagePipeConfig;
  private horseshoeCurve: HorseshoeArcCurve;
  private scaleFactor: number = 1.0;          // 排水管径放大倍率 (默认 1.0x 物理真实管径)

  constructor(config: DrainagePipeConfig) {
    this.config = { ...config, hasCentralDitch: config.hasCentralDitch !== undefined ? config.hasCentralDitch : true };
    this.annotationGroup = new THREE.Group();
    this.annotationGroup.name = 'DrainagePipeAnnotations';
    this.annotationGroup.renderOrder = 999;
    const r1 = config.outerRadius ?? (config.tunnelRadius + 0.4);
    const ditchGeo = this.getDitchGeometry();
    this.horseshoeCurve = new HorseshoeArcCurve(config.tunnelRadius, r1, 0.7, ditchGeo.yLongFoot);

    // 1. 环向盲管：使用 HorseshoeArcCurve 导出的 TubeGeometry 270° 马蹄形半环 (黄铜金 #F59E0B)
    const ringCount = this.calculateRingCount();
    this.ringMesh = this.createRingInstancedMesh(config.ringDiam, ringCount, 0xf59e0b);

    // 2. 纵向排水管：左右拱脚二衬外/初支内交界面共 2 根 (深金 #D97706)
    const longCount = this.calculateLongCount();
    this.longMesh = this.createCylinderInstancedMesh(config.longDiam / 2, 1.0, longCount, 0xd97706, 0.95, 0.12);

    // 3. 横向排水管：穿透二衬以 3% 坡度自拱脚引向水沟 (亮金 #EAB308)
    const latCount = this.calculateLatCount() * 2;
    this.latMesh = this.createCylinderInstancedMesh(config.latDiam / 2, 1.0, latCount, 0xeab308, 0.90, 0.18);

    // 双洞模式：创建副洞实例
    if (config.tunnelType === 'double') {
      this.leftRingMesh = this.createRingInstancedMesh(config.ringDiam, ringCount, 0xf59e0b);
      this.leftRingMesh.geometry.dispose(); // 销毁二度实例默认几何体，共享主洞 Geometry 节约显存
      this.leftRingMesh.geometry = this.ringMesh.geometry;
      this.leftLongMesh = this.createCylinderInstancedMesh(config.longDiam / 2, 1.0, longCount, 0xd97706, 0.95, 0.12);
      this.leftLatMesh = this.createCylinderInstancedMesh(config.latDiam / 2, 1.0, latCount, 0xeab308, 0.90, 0.18);
    }
  }

  /**
   * 设置排水管径放大倍率，重构 3D 几何体与缩放矩阵
   */
  public setPipeScaleFactor(scale: number): void {
    const validScale = Math.max(1.0, scale);
    this.scaleFactor = validScale;

    // 1. 重载环向管 TubeGeometry
    this.refreshRingGeometry();

    // 2. 重新更新纵向与横向管 Instance 矩阵 Scaling
    const isDouble = this.config.tunnelType === 'double';
    const mainXOffset = isDouble ? (this.config.dSpacing ?? 30.0) / 2 : 0;
    const subXOffset = isDouble ? -(this.config.dSpacing ?? 30.0) / 2 : 0;

    this.updateLongPipes(mainXOffset, this.longMesh);
    this.updateLatPipes(mainXOffset, this.latMesh);

    if (isDouble) {
      if (this.leftLongMesh) this.updateLongPipes(subXOffset, this.leftLongMesh);
      if (this.leftLatMesh) this.updateLatPipes(subXOffset, this.leftLatMesh);
    }
  }

  /**
   * 安全刷新环向管 TubeGeometry (支持双洞共享指针回收保护，并依据纵向管标高动态收口)
   */
  private refreshRingGeometry(): void {
    const r1 = this.config.outerRadius ?? (this.config.tunnelRadius + 0.4);
    const ditchGeo = this.getDitchGeometry();
    this.horseshoeCurve = new HorseshoeArcCurve(this.config.tunnelRadius, r1, 0.7, ditchGeo.yLongFoot);
    const pipeRadius = Math.max(0.01, (this.config.ringDiam / 2.0) * this.scaleFactor);
    const newTubeGeo = new THREE.TubeGeometry(this.horseshoeCurve, 64, pipeRadius, 8, false);

    if (this.ringMesh.geometry) {
      this.ringMesh.geometry.dispose();
    }
    this.ringMesh.geometry = newTubeGeo;

    if (this.leftRingMesh) {
      this.leftRingMesh.geometry = newTubeGeo;
    }
  }

  /**
   * 解算马蹄形衬砌拱脚、水沟与管网空间几何参数 (与 TunnelGenerator.ts 100% 精确对齐)
   */
  private getDitchGeometry() {
    const r = this.config.tunnelRadius;
    const r1 = this.config.outerRadius ?? (r + 0.4);
    const t = Math.max(0, r1 - r);
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

    const cosFoot = dx_offset / (R3_base - R2_base);
    const sinFoot = dy_offset / (R3_base - R2_base);

    const hasCentral = this.config.hasCentralDitch !== false;

    // 侧沟槽底标高与防穿模边界
    const yBot_side = roadY - 0.3;
    const max_x_lining = Math.sqrt(Math.max(0, R3_base * R3_base - Math.pow(invertCenterY - yBot_side, 2)));
    const sideDitchX = max_x_lining - 0.05;
    const sideDitchBottomY = yBot_side;

    // 拱脚纵向管基准坐标（二衬外、初支内交界面 r1）
    const R2 = R2_base + t;
    const nominalXLongFoot = (R3_base + t) * cosFoot;
    const nominalYLongFoot = -H_side - (R2_base + t) * sinFoot;

    // 双侧沟模式下：侧沟壁厚 0.05m (内底 yBot_side + 0.05m)，出水口汇流位设为 yBot_side + 0.20m
    // 依 3% 坡度自侧沟出水口反推拱脚纵向管标高，确保横向管全程 3% 坡度自流且低点精确位于沟底上方侧壁
    const yOutletSide = yBot_side + 0.2;
    const dxSide = Math.max(0, nominalXLongFoot - sideDitchX);
    const yLongFootDual = yOutletSide + 0.03 * dxSide;

    const yLongFoot = hasCentral ? nominalYLongFoot : yLongFootDual;
    // 关键修正：xLongFoot 必须根据目标 yLongFoot 在侧墙圆弧 (dx, -H_side, R2) 上严密解算，确保与环向盲管末端 100% 同步！
    const xLongFoot = dx_offset + Math.sqrt(Math.max(0, R2 * R2 - Math.pow(yLongFoot + H_side, 2)));

    const yBot_central = invertCenterY - R3_base + 0.05;
    const ditchBottomY = yBot_central;

    return {
      xLongFoot,
      yLongFoot,
      sideDitchX,
      roadY,
      sideDitchBottomY,
      ditchBottomY,
      invertCenterY,
      R3_base,
      r1
    };
  }

  /**
   * 创建 270° 马蹄拱形半环 实例化网格 (抛光黄铜 PBR 材质)
   */
  private createRingInstancedMesh(radius: number, count: number, color: number): THREE.InstancedMesh {
    // 入参 radius 为管径 (Diameter)，需除以 2 转换为物理半径，并乘上 scaleFactor
    const pipeRadius = Math.max(0.01, (radius / 2.0) * this.scaleFactor);
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
    return 2; // 拱脚纵向排水管固定为左右各 1 根 (二衬外、初支内)
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
    this.config.hasCentralDitch = snapshot.has_central_ditch ?? snapshot.params?.has_central_ditch ?? params.has_central_ditch ?? this.config.hasCentralDitch ?? true;

    if (this.config.tunnelType === 'double') {
      this.config.dSpacing = params.D_spacing ?? this.config.dSpacing;
    }

    // 预塑并刷新环向盲管 TubeGeometry (继承用户选定的 scaleFactor)
    this.refreshRingGeometry();

    // 预警着色逻辑
    let stateColor = 0xf59e0b; // 正常工况：黄铜金 (#F59E0B)
    if (qDrain > 3.0) {
      stateColor = 0xe74c3c; // 堵塞过载：警示红
      if (isCriticalEmpty) {
        stateColor = 0x00ff88;
      }
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
    this.updateLongPipes(mainXOffset, this.longMesh);
    this.updateLatPipes(mainXOffset, this.latMesh);

    if (isDouble) {
      if (this.leftRingMesh) this.updateRingPipes(subXOffset, this.leftRingMesh);
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
   * 更新拱脚纵向排水管 (共 2 根，敷设于左右拱脚二衬外/初支内交界面)
   */
  private updateLongPipes(xOffset: number = 0, targetMesh: THREE.InstancedMesh = this.longMesh): void {
    const count = this.calculateLongCount();
    targetMesh.count = Math.min(count, targetMesh.instanceMatrix.count);

    const matrix = new THREE.Matrix4();
    const length = Math.abs(this.config.endChainage - this.config.startChainage);
    // 局部 Scaling 矩阵: [S_scale, L_length, S_scale] 保持长度不变，横截面直径动态放缩
    const scale = new THREE.Vector3(this.scaleFactor, length, this.scaleFactor);
    const { xLongFoot, yLongFoot } = this.getDitchGeometry();

    const quaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI / 2
    );

    // 0: 右侧拱脚纵向管 (二衬外初支内拱脚)
    if (targetMesh.count > 0) {
      const posRight = new THREE.Vector3(xOffset + xLongFoot, yLongFoot, -length / 2);
      matrix.compose(posRight, quaternion, scale);
      targetMesh.setMatrixAt(0, matrix);
    }

    // 1: 左侧拱脚纵向管 (二衬外初支内拱脚)
    if (targetMesh.count > 1) {
      const posLeft = new THREE.Vector3(xOffset - xLongFoot, yLongFoot, -length / 2);
      matrix.compose(posLeft, quaternion, scale);
      targetMesh.setMatrixAt(1, matrix);
    }

    targetMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 更新穿衬横向排水管 (严禁取消，固定 3% 坡度自拱脚纵向管穿透二衬汇流)
   * 1. 三沟模式: 左右拱脚向中央深水沟侧壁 (X = ±0.35m) 汇流
   * 2. 双侧沟模式: 左右拱脚向侧边水沟外壁 (X = ±sideDitchX) 汇流
   */
  private updateLatPipes(xOffset: number = 0, targetMesh: THREE.InstancedMesh = this.latMesh): void {
    const count = this.calculateLatCount();
    const totalPipes = count * 2; // 左右各一根横向管
    targetMesh.count = Math.min(totalPipes, targetMesh.instanceMatrix.count);

    const matrix = new THREE.Matrix4();
    const { xLongFoot, yLongFoot, sideDitchX } = this.getDitchGeometry();
    const hasCentral = this.config.hasCentralDitch !== false;
    const kSlope = 0.03; // 固定 3% 下倾坡度

    // 确定横向管出水口 X 目标绝对值 (三沟模式汇入中央深水沟侧壁，双侧沟模式汇入侧水沟外壁)
    const xOutletAbs = hasCentral ? 0.35 : sideDitchX;
    const dxAbs = Math.abs(xLongFoot - xOutletAbs);
    const dy = -kSlope * dxAbs; // 负值代表下坡

    const pipeLength = Math.sqrt(dxAbs * dxAbs + dy * dy);
    const scale = new THREE.Vector3(this.scaleFactor, pipeLength, this.scaleFactor);

    // 右侧倾斜 Quaternion (从 (xLongFoot, yLongFoot) 指向 (xOutletAbs, yLongFoot + dy))
    const dirRight = new THREE.Vector3(-dxAbs, dy, 0).normalize();
    const qRight = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirRight);

    // 左侧倾斜 Quaternion (从 (-xLongFoot, yLongFoot) 指向 (-xOutletAbs, yLongFoot + dy))
    const dirLeft = new THREE.Vector3(dxAbs, dy, 0).normalize();
    const qLeft = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirLeft);

    let idx = 0;
    for (let i = 0; i < count; i++) {
      const z = -(i * this.config.ringSpacing * 2);

      // 右侧横向管：右拱脚 -> 水沟侧壁
      if (idx < targetMesh.count) {
        const midPosRight = new THREE.Vector3(
          xOffset + (xLongFoot + xOutletAbs) / 2,
          yLongFoot + dy / 2,
          z
        );
        matrix.compose(midPosRight, qRight, scale);
        targetMesh.setMatrixAt(idx, matrix);
        idx++;
      }

      // 左侧横向管：左拱脚 -> 水沟侧壁
      if (idx < targetMesh.count) {
        const midPosLeft = new THREE.Vector3(
          xOffset - (xLongFoot + xOutletAbs) / 2,
          yLongFoot + dy / 2,
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
      this.longMesh,
      this.latMesh
    ];

    if (this.leftRingMesh) meshes.push(this.leftRingMesh);
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
    sprite.userData = { isAnnotation: true };
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
    const rInterface = this.config.outerRadius ?? (this.config.tunnelRadius + 0.4);
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
    ringSprite.position.set(mainXOffset, rInterface + 0.6, -this.config.startChainage);
    ringSprite.userData = {
      isAnnotation: true,
      pipeCategory: 'ring',
      nodeType: 'standard',
      name: '环向排水盲管',
      diameter: ringDiamMm,
      spacing: parseFloat(ringSpacingM),
      permeability: '1.2×10⁻² cm/s',
      flowRate: '0.15 L/s',
      status: '自流通畅'
    };
    this.annotationGroup.add(ringSprite);

    // 2. 纵向排水管标注 (拱脚管位)
    const longDiamMm = Math.round(this.config.longDiam * 1000);
    const longText = `${prefix}拱脚纵向排水管: Φ${longDiamMm}mm 🔍`;
    const longSprite = this.createTextSprite(longText, '#2ecc71');
    longSprite.position.set(mainXOffset + ditchGeo.xLongFoot, ditchGeo.yLongFoot + 0.5, -this.config.startChainage - length * 0.4);
    longSprite.userData = {
      isAnnotation: true,
      pipeCategory: 'longitudinal',
      nodeType: 'standard',
      name: '拱脚纵向主排水管',
      diameter: longDiamMm,
      spacing: 50.0,
      permeability: '2.5×10⁻² cm/s',
      flowRate: '0.45 L/s',
      status: '主干自流'
    };
    this.annotationGroup.add(longSprite);

    // 3. 横向排水管标注
    const latDiamMm = Math.round(this.config.latDiam * 1000);
    const latText = `${prefix}穿衬横向排水管 (3%坡度): Φ${latDiamMm}mm 🔍`;
    const latSprite = this.createTextSprite(latText, '#e74c3c');
    const xOutlet = this.config.hasCentralDitch !== false ? 0.35 : ditchGeo.sideDitchX;
    const midX = (ditchGeo.xLongFoot + xOutlet) / 2;
    const midY = ditchGeo.yLongFoot - 0.03 * Math.abs(ditchGeo.xLongFoot - xOutlet) / 2 + 0.5;
    latSprite.position.set(mainXOffset + midX, midY, -this.config.startChainage - length * 0.2);
    latSprite.userData = {
      isAnnotation: true,
      pipeCategory: 'lateral',
      nodeType: 'standard',
      name: '穿衬横向排水管',
      diameter: latDiamMm,
      spacing: parseFloat(ringSpacingM) * 2,
      permeability: '1.8×10⁻² cm/s',
      flowRate: '0.28 L/s',
      status: '倾斜自流 (3%)'
    };
    this.annotationGroup.add(latSprite);

    // 4. 环向盲管与纵向排水管三通连接节点标注
    const threeWayText = `${prefix}拱脚三通连接节点: 环向盲管-纵向排水管 🔍`;
    const threeWaySprite = this.createTextSprite(threeWayText, '#a855f7');
    threeWaySprite.position.set(
      mainXOffset + ditchGeo.xLongFoot,
      ditchGeo.yLongFoot + 0.4,
      -this.config.startChainage - length * 0.25
    );
    threeWaySprite.userData = {
      isAnnotation: true,
      pipeCategory: 'three_way',
      nodeType: 'three-way',
      name: '环向盲管与纵向排水管三通节点',
      diameter: 100,
      spacing: parseFloat(ringSpacingM),
      permeability: '三向汇排 3.5×10⁻² cm/s',
      flowRate: '0.60 L/s',
      status: '高效汇排'
    };
    this.annotationGroup.add(threeWaySprite);
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    const meshes = this.getMeshes();
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    meshes.forEach(mesh => {
      if (mesh.geometry && !disposedGeometries.has(mesh.geometry)) {
        mesh.geometry.dispose();
        disposedGeometries.add(mesh.geometry);
      }
      if (mesh.material) {
        (mesh.material as THREE.Material).dispose();
      }
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
