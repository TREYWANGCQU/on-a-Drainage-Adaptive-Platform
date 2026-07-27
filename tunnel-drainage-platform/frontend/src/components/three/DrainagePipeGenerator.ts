// tunnel-drainage-platform/frontend/src/components/three/DrainagePipeGenerator.ts
import * as THREE from 'three';
import { polarToCartesian, calculateNormalQuaternion } from '@/utils/math';

/**
 * 排水管生成器 - 基于后端计算结果动态渲染环向/纵向排水管网
 * 
 * 字段映射规范（遵循阶段4-snapshot特点提取.md）：
 * - ring_diam_recommend / ring_spacing_recommend: 来自 original_state 或 critical_state
 * - d_ring_default / d_long_default: 来自 input_parameter 默认高级参数兜底
 * - double_side: 来自 input_parameter，控制双侧排水
 * - tunnel_type: 来自 input_parameter，控制双洞实例化
 * - start_chainage / end_chainage: 来自 input_parameter，控制管网纵向跨度
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
  /** 双洞间距 (m)，对应 D_spacing，双洞模式下有效 */
  dSpacing?: number;
}

export class DrainagePipeGenerator {
  public ringMesh: THREE.InstancedMesh;      // 环向排水盲管
  public longMesh: THREE.InstancedMesh;      // 纵向排水管
  public latMesh: THREE.InstancedMesh;       // 横向连接管
  public leftRingMesh?: THREE.InstancedMesh; // 双洞副洞环向管
  public leftLongMesh?: THREE.InstancedMesh; // 双洞副洞纵向管
  public leftLatMesh?: THREE.InstancedMesh;  // 双洞副洞横向管

  private config: DrainagePipeConfig;

  constructor(config: DrainagePipeConfig) {
    this.config = config;
    
    // 环向管：沿隧道圆周布置，间距由 ringSpacing 控制
    const ringCount = this.calculateRingCount();
    this.ringMesh = this.createInstancedMesh(config.ringDiam, 1.0, ringCount, 0x4aa8ff);
    
    // 纵向管：沿隧道水沟布置，侧边沟+中心水沟
    const longCount = this.calculateLongCount();
    this.longMesh = this.createInstancedMesh(config.longDiam, config.endChainage - config.startChainage, longCount, 0x2ecc71);
    
    // 横向连接管：连接侧边沟与中心排水沟
    const latCount = this.calculateLatCount() * (config.doubleSide ? 2 : 1);
    this.latMesh = this.createInstancedMesh(config.latDiam, config.tunnelRadius * 0.5, latCount, 0xe74c3c);

    // 双洞模式：创建副洞实例
    if (config.tunnelType === 'double') {
      this.leftRingMesh = this.createInstancedMesh(config.ringDiam, 1.0, ringCount, 0x4aa8ff);
      this.leftLongMesh = this.createInstancedMesh(config.longDiam, config.endChainage - config.startChainage, longCount, 0x2ecc71);
      this.leftLatMesh = this.createInstancedMesh(config.latDiam, config.tunnelRadius * 0.5, latCount, 0xe74c3c);
    }
  }

  /**
   * 解算马蹄形衬砌底部水沟与路面物理几何参数
   */
  private getDitchGeometry() {
    const r = this.config.tunnelRadius;
    const aspect_ratio = 0.7; // 缺省高宽比
    const R3_base = 1.80 * r;
    const dx = 0.4 * r;
    const dy = Math.sqrt(Math.max(0, Math.pow(R3_base - 0.65 * r, 2) - Math.pow(dx, 2)));
    const w = 2.1 * r;
    const h = w * aspect_ratio;
    const H_side = Math.max(0.0, h - 1.05 * r + dy - R3_base);
    const invertCenterY = -H_side + dy;

    const ditchH = 0.8;
    const dy_road = R3_base - ditchH;
    const halfRoadW = Math.sqrt(Math.max(0, R3_base * R3_base - dy_road * dy_road));
    const roadY = invertCenterY - dy_road;
    const sideW = 0.3; // 侧边沟宽度
    const sideDitchX = Math.max(0.5, halfRoadW - sideW / 2);

    const ditchW = 0.6;
    const halfW = ditchW / 2;
    const ditchBottomY = invertCenterY - Math.sqrt(Math.max(0, R3_base * R3_base - halfW * halfW));

    return { sideDitchX, roadY, ditchBottomY };
  }

  /**
   * 创建实例化网格 - 使用未二次旋转/平移的 1.0 长度标准圆柱几何体
   */
  private createInstancedMesh(
    radius: number, 
    _length: number, 
    count: number, 
    color: number
  ): THREE.InstancedMesh {
    const geometry = new THREE.CylinderGeometry(radius, radius, 1.0, 12);

    const material = new THREE.MeshStandardMaterial({ 
      color,
      roughness: 0.4,
      metalness: 0.3
    });

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * 计算环向管数量：基于里程跨度与推荐间距
   */
  /**
   * 计算环向管数量：基于里程跨度与推荐间距，若双侧排水则左右各一根（数量翻倍）
   */
  private calculateRingCount(): number {
    const length = Math.abs(this.config.endChainage - this.config.startChainage);
    const baseRings = Math.max(1, Math.ceil(length / this.config.ringSpacing));
    return this.config.doubleSide ? baseRings * 2 : baseRings;
  }

  /**
   * 计算纵向管数量：双侧排水为3(左侧+右侧+中心)，单侧为2(右侧+中心)
   */
  private calculateLongCount(): number {
    return this.config.doubleSide ? 3 : 2;
  }

  /**
   * 计算横向连接管数量
   */
  private calculateLatCount(): number {
    const length = Math.abs(this.config.endChainage - this.config.startChainage);
    const latSpacing = this.config.ringSpacing * 2;
    return Math.max(1, Math.ceil(length / latSpacing));
  }

  /**
   * 更新所有排水管实例数据
   * 基于快照计算结果动态调整位姿与可视化状态
   */
  public updateFromSnapshot(snapshot: any): void {
    if (!snapshot) return;
    const state = snapshot.critical_state ?? snapshot.original_state ?? {};
    const params = snapshot.input_parameter ?? snapshot.params ?? {};
    
    this.config.ringDiam = state.ring_diam_recommend ?? params.d_ring_default ?? this.config.ringDiam;
    this.config.ringSpacing = state.ring_spacing_recommend ?? this.config.ringSpacing;
    this.config.longDiam = params.d_long_default ?? this.config.longDiam;
    this.config.latDiam = params.d_lat_default ?? this.config.latDiam;
    this.config.doubleSide = params.double_side ?? this.config.doubleSide;
    
    if (this.config.tunnelType === 'double') {
      this.config.dSpacing = params.D_spacing ?? this.config.dSpacing;
    }

    const isDouble = this.config.tunnelType === 'double';
    const mainXOffset = isDouble ? (this.config.dSpacing ?? 30.0) / 2 : 0;
    const subXOffset = isDouble ? -(this.config.dSpacing ?? 30.0) / 2 : 0;

    // 重新计算并更新主洞与副洞实例
    this.updateRingPipes(mainXOffset, this.ringMesh);
    this.updateLongPipes(mainXOffset, this.longMesh);
    this.updateLatPipes(mainXOffset, this.latMesh);

    if (isDouble) {
      if (this.leftRingMesh) this.updateRingPipes(subXOffset, this.leftRingMesh);
      if (this.leftLongMesh) this.updateLongPipes(subXOffset, this.leftLongMesh);
      if (this.leftLatMesh) this.updateLatPipes(subXOffset, this.leftLatMesh);
    }
  }

  /**
   * 更新环向排水盲管阵列（左右双侧对称生成）
   */
  private updateRingPipes(xOffset: number = 0, targetMesh: THREE.InstancedMesh = this.ringMesh): void {
    const lengthVal = Math.abs(this.config.endChainage - this.config.startChainage);
    const baseRings = Math.max(1, Math.ceil(lengthVal / this.config.ringSpacing));
    const isDoubleSide = this.config.doubleSide;
    const totalCount = isDoubleSide ? baseRings * 2 : baseRings;
    targetMesh.count = Math.min(totalCount, targetMesh.instanceMatrix.count);
    
    const matrix = new THREE.Matrix4();
    const { sideDitchX, roadY } = this.getDitchGeometry();
    const pipeLength = Math.PI * this.config.tunnelRadius * 0.25;

    let idx = 0;
    for (let i = 0; i < baseRings; i++) {
      const z = -(i * this.config.ringSpacing);

      // 右侧环向盲管
      if (idx < targetMesh.count) {
        const posRight = new THREE.Vector3(xOffset + sideDitchX, roadY + 0.2, z);
        const centerRight = new THREE.Vector3(xOffset, 0, z);
        const quatRight = calculateNormalQuaternion(posRight, centerRight);
        const ringQuatRight = quatRight.clone().multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
        );
        matrix.compose(posRight, ringQuatRight, new THREE.Vector3(1, pipeLength, 1));
        targetMesh.setMatrixAt(idx, matrix);
        idx++;
      }

      // 左侧环向盲管（双侧排水模式下生成对称镜像）
      if (isDoubleSide && idx < targetMesh.count) {
        const posLeft = new THREE.Vector3(xOffset - sideDitchX, roadY + 0.2, z);
        const centerLeft = new THREE.Vector3(xOffset, 0, z);
        const quatLeft = calculateNormalQuaternion(posLeft, centerLeft);
        const ringQuatLeft = quatLeft.clone().multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2)
        );
        matrix.compose(posLeft, ringQuatLeft, new THREE.Vector3(1, pipeLength, 1));
        targetMesh.setMatrixAt(idx, matrix);
        idx++;
      }
    }

    targetMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 更新纵向排水管
   * 精准卧于左右侧边沟与中心水沟槽底
   */
  private updateLongPipes(xOffset: number = 0, targetMesh: THREE.InstancedMesh = this.longMesh): void {
    const count = this.calculateLongCount();
    targetMesh.count = Math.min(count, targetMesh.instanceMatrix.count);
    
    const matrix = new THREE.Matrix4();
    const length = Math.abs(this.config.endChainage - this.config.startChainage);
    const scale = new THREE.Vector3(1, length, 1);
    const { sideDitchX, roadY, ditchBottomY } = this.getDitchGeometry();
    const longRadius = this.config.longDiam / 2;

    const quaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0), 
      Math.PI / 2
    );

    // 0: 右侧边沟管
    if (targetMesh.count > 0) {
      const posRight = new THREE.Vector3(xOffset + sideDitchX, roadY + longRadius, -length / 2);
      matrix.compose(posRight, quaternion, scale);
      targetMesh.setMatrixAt(0, matrix);
    }

    // 1: 左侧边沟管
    if (this.config.doubleSide && targetMesh.count > 1) {
      const posLeft = new THREE.Vector3(xOffset - sideDitchX, roadY + longRadius, -length / 2);
      matrix.compose(posLeft, quaternion, scale);
      targetMesh.setMatrixAt(1, matrix);
    }

    // 2: 中心水沟管
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
   * 沿路面水平平铺延伸，连接侧边沟与中心水沟
   */
  private updateLatPipes(xOffset: number = 0, targetMesh: THREE.InstancedMesh = this.latMesh): void {
    const count = this.calculateLatCount();
    const isDoubleSide = this.config.doubleSide;
    const totalPipes = isDoubleSide ? count * 2 : count;
    targetMesh.count = Math.min(totalPipes, targetMesh.instanceMatrix.count);
    
    const matrix = new THREE.Matrix4();
    const { sideDitchX, roadY } = this.getDitchGeometry();
    const latRadius = this.config.latDiam / 2;
    const pipeLength = sideDitchX;
    const scale = new THREE.Vector3(1, pipeLength, 1);

    const qRight = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
    const qLeft = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

    let idx = 0;
    for (let i = 0; i < count; i++) {
      const z = -(i * this.config.ringSpacing * 2);
      
      // 右侧边沟 -> 中心水沟
      if (idx < targetMesh.count) {
        const midPosRight = new THREE.Vector3(xOffset + sideDitchX / 2, roadY + latRadius, z);
        matrix.compose(midPosRight, qRight, scale);
        targetMesh.setMatrixAt(idx, matrix);
        idx++;
      }

      // 左侧边沟 -> 中心水沟
      if (isDoubleSide && idx < targetMesh.count) {
        const midPosLeft = new THREE.Vector3(xOffset - sideDitchX / 2, roadY + latRadius, z);
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
    
    return meshes;
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
   * 释放资源
   */
  public dispose(): void {
    const meshes = this.getMeshes();
    meshes.forEach(mesh => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
  }
}
