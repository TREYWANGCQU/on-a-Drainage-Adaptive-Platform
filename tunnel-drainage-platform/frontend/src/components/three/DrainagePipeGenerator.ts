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

  private config: DrainagePipeConfig;

  constructor(config: DrainagePipeConfig) {
    this.config = config;
    
    // 环向管：沿隧道圆周布置，间距由 ringSpacing 控制
    const ringCount = this.calculateRingCount();
    this.ringMesh = this.createInstancedMesh(config.ringDiam, 1.0, ringCount, 0x4aa8ff);
    
    // 纵向管：沿隧道轴向布置，双侧或单侧
    const longCount = this.calculateLongCount();
    this.longMesh = this.createInstancedMesh(config.longDiam, config.endChainage - config.startChainage, longCount, 0x2ecc71);
    
    // 横向连接管：连接左右纵向管或通向中心排水沟
    const latCount = this.calculateLatCount();
    this.latMesh = this.createInstancedMesh(config.latDiam, config.tunnelRadius * 0.5, latCount, 0xe74c3c);

    // 双洞模式：创建副洞实例
    if (config.tunnelType === 'double') {
      this.leftRingMesh = this.createInstancedMesh(config.ringDiam, 1.0, ringCount, 0x4aa8ff);
      this.leftLongMesh = this.createInstancedMesh(config.longDiam, config.endChainage - config.startChainage, longCount, 0x2ecc71);
    }
  }

  /**
   * 创建实例化网格
   */
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
  private calculateRingCount(): number {
    const length = Math.abs(this.config.endChainage - this.config.startChainage);
    return Math.max(1, Math.ceil(length / this.config.ringSpacing));
  }

  /**
   * 计算纵向管数量：双侧排水为2，单侧为1
   */
  private calculateLongCount(): number {
    return this.config.doubleSide ? 2 : 1;
  }

  /**
   * 计算横向连接管数量
   */
  private calculateLatCount(): number {
    // 横向管间距约为环向管间距的2倍
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
    // 优先读取临界状态推荐值，降级至原始状态，最后从 input_parameter / params 提取默认值
    const state = snapshot.critical_state ?? snapshot.original_state ?? {};
    const params = snapshot.input_parameter ?? snapshot.params ?? {};
    
    // 动态更新配置（支持计算结果驱动的管网重构）
    this.config.ringDiam = state.ring_diam_recommend ?? params.d_ring_default ?? this.config.ringDiam;
    this.config.ringSpacing = state.ring_spacing_recommend ?? this.config.ringSpacing;
    this.config.longDiam = params.d_long_default ?? this.config.longDiam;
    this.config.latDiam = params.d_lat_default ?? this.config.latDiam;
    this.config.doubleSide = params.double_side ?? this.config.doubleSide;
    
    if (this.config.tunnelType === 'double') {
      this.config.dSpacing = params.D_spacing ?? this.config.dSpacing;
    }

    // 重新计算并更新实例
    this.updateRingPipes();
    this.updateLongPipes();
    this.updateLatPipes();

    if (this.config.tunnelType === 'double') {
      this.updateLeftRingPipes();
      this.updateLeftLongPipes();
    }
  }

  /**
   * 更新环向排水盲管阵列
   * 沿隧道纵向按 ringSpacing 间距布置，位于隧道底部两侧
   */
  private updateRingPipes(): void {
    const count = this.calculateRingCount();
    this.ringMesh.count = Math.min(count, this.ringMesh.instanceMatrix.count);
    
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const length = Math.PI * this.config.tunnelRadius * 0.3; // 底部120度弧长

    for (let i = 0; i < count; i++) {
      const z = -(i * this.config.ringSpacing);
      // 右侧环向管位置（底部偏右）
      const angle = -45; // 底部右侧45度
      const polar = polarToCartesian(this.config.tunnelRadius, angle);
      
      position.set(polar.x, polar.y, z);
      
      // 环向管沿隧道截面圆周切线方向
      const center = new THREE.Vector3(0, 0, z);
      
      const quaternion = calculateNormalQuaternion(position, center);
      // 调整朝向使管道沿环向
      const ringQuaternion = quaternion.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
      );

      matrix.compose(position, ringQuaternion, new THREE.Vector3(1, length, 1));
      this.ringMesh.setMatrixAt(i, matrix);
    }

    this.ringMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 更新纵向排水管
   * 沿隧道全长布置，位于底部两侧
   */
  private updateLongPipes(): void {
    const count = this.calculateLongCount();
    this.longMesh.count = Math.min(count, this.longMesh.instanceMatrix.count);
    
    const matrix = new THREE.Matrix4();
    const length = Math.abs(this.config.endChainage - this.config.startChainage);
    const scale = new THREE.Vector3(1, length, 1);

    for (let i = 0; i < count; i++) {
      // 双侧排水：左右各一根；单侧：仅右侧
      const side = this.config.doubleSide ? (i === 0 ? 1 : -1) : 1;
      const angle = side * 45; // 底部两侧45度
      
      const polar = polarToCartesian(this.config.tunnelRadius, angle);
      const position = new THREE.Vector3(polar.x, polar.y, -length / 2);
      
      // 纵向沿Z轴
      const quaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), 
        Math.PI / 2
      );

      matrix.compose(position, quaternion, scale);
      this.longMesh.setMatrixAt(i, matrix);
    }

    this.longMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 更新横向连接管
   * 连接纵向管至中心排水沟或左右纵向管之间
   */
  private updateLatPipes(): void {
    const count = this.calculateLatCount();
    this.latMesh.count = Math.min(count, this.latMesh.instanceMatrix.count);
    
    const matrix = new THREE.Matrix4();
    
    for (let i = 0; i < count; i++) {
      const z = -(i * this.config.ringSpacing * 2);
      
      // 从隧道侧壁通向中心
      const startAngle = this.config.doubleSide ? -45 : 0;
      const endAngle = this.config.doubleSide ? 45 : 0;
      
      const startPolar = polarToCartesian(this.config.tunnelRadius, startAngle);
      const endPolar = polarToCartesian(this.config.tunnelRadius * 0.3, endAngle);
      
      const startPos = new THREE.Vector3(startPolar.x, startPolar.y, z);
      const endPos = new THREE.Vector3(endPolar.x, endPolar.y, z);
      
      const midPos = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
      const length = startPos.distanceTo(endPos);
      
      const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction
      );

      matrix.compose(midPos, quaternion, new THREE.Vector3(1, length, 1));
      this.latMesh.setMatrixAt(i, matrix);
    }

    this.latMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 双洞副洞环向管更新
   */
  private updateLeftRingPipes(): void {
    if (!this.leftRingMesh || this.config.tunnelType !== 'double') return;
    
    const count = this.calculateRingCount();
    this.leftRingMesh.count = Math.min(count, this.leftRingMesh.instanceMatrix.count);
    
    const offsetX = -(this.config.dSpacing ?? 0);
    const matrix = new THREE.Matrix4();
    const length = Math.PI * this.config.tunnelRadius * 0.3;

    for (let i = 0; i < count; i++) {
      const z = -(i * this.config.ringSpacing);
      const angle = -45;
      const polar = polarToCartesian(this.config.tunnelRadius, angle);
      
      const position = new THREE.Vector3(polar.x + offsetX, polar.y, z);
      const center = new THREE.Vector3(offsetX, 0, z);
      
      const quaternion = calculateNormalQuaternion(position, center);
      const ringQuaternion = quaternion.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
      );

      matrix.compose(position, ringQuaternion, new THREE.Vector3(1, length, 1));
      this.leftRingMesh.setMatrixAt(i, matrix);
    }

    this.leftRingMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 双洞副洞纵向管更新
   */
  private updateLeftLongPipes(): void {
    if (!this.leftLongMesh || this.config.tunnelType !== 'double') return;
    
    const count = this.calculateLongCount();
    this.leftLongMesh.count = Math.min(count, this.leftLongMesh.instanceMatrix.count);
    
    const offsetX = -(this.config.dSpacing ?? 0);
    const matrix = new THREE.Matrix4();
    const length = Math.abs(this.config.endChainage - this.config.startChainage);

    for (let i = 0; i < count; i++) {
      const side = this.config.doubleSide ? (i === 0 ? 1 : -1) : 1;
      const angle = side * 45;
      
      const polar = polarToCartesian(this.config.tunnelRadius, angle);
      const position = new THREE.Vector3(polar.x + offsetX, polar.y, -length / 2);
      
      const quaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), 
        Math.PI / 2
      );

      matrix.compose(position, quaternion, new THREE.Vector3(1, length, 1));
      this.leftLongMesh.setMatrixAt(i, matrix);
    }

    this.leftLongMesh.instanceMatrix.needsUpdate = true;
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
    
    return meshes;
  }

  /**
   * 更新可视化状态（用于安全系数预警着色）
   */
  public updateStateColors(stateColors: THREE.Color[]): void {
    // 根据结构安全状态动态调整管道颜色
    const meshes = [this.ringMesh, this.longMesh, this.latMesh];
    
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
    this.ringMesh.geometry.dispose();
    (this.ringMesh.material as THREE.Material).dispose();
    
    this.longMesh.geometry.dispose();
    (this.longMesh.material as THREE.Material).dispose();
    
    this.latMesh.geometry.dispose();
    (this.latMesh.material as THREE.Material).dispose();
    
    if (this.leftRingMesh) {
      this.leftRingMesh.geometry.dispose();
      (this.leftRingMesh.material as THREE.Material).dispose();
    }
    
    if (this.leftLongMesh) {
      this.leftLongMesh.geometry.dispose();
      (this.leftLongMesh.material as THREE.Material).dispose();
    }
  }
}
