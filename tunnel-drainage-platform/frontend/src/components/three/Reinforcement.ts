// tunnel-drainage-platform/frontend/src/components/three/Reinforcement.ts
import * as THREE from 'three';
import { polarToCartesian, calculateNormalQuaternion } from '@/utils/math';

/**
 * 注浆圈配置接口 - 严格遵循阶段4-snapshot字段映射
 */
export interface GroutingConfig {
  /** 原始注浆圈外半径 (m)，对应 rg */
  rg: number;
  /** 初期支护外半径 (m)，对应 r2 */
  r2: number;
  /** 临界注浆圈外半径 (m)，对应 critical_state.rg_crit */
  rg_crit?: number;
  /** 临界注浆圈厚度 (m)，对应 critical_state.tg_crit = max(0.0, rg_crit - r2) */
  tg_crit?: number;
  /** 分区起点里程 (m)，对应 start_chainage */
  start_chainage: number;
  /** 分区终点里程 (m)，对应 end_chainage */
  end_chainage: number;
  /** 隧道类型，对应 tunnel_type */
  tunnel_type: 'single' | 'double';
  /** 双洞间距 (m)，对应 D_spacing，双洞模式下有效 */
  D_spacing?: number;
}

/**
 * 超前小导管配置接口
 */
export interface AdvancePipeConfig {
  /** 外插角 (度) */
  outer_angle: number;
  /** 环向间距 (m) */
  circumferential_spacing: number;
  /** 单环数量 */
  per_ring: number;
  /** 纵向排布间距 (m) */
  longitudinal_spacing: number;
  /** 分区起点里程 */
  start_chainage: number;
  /** 分区终点里程 */
  end_chainage: number;
  /** 隧道等效内半径 (m)，对应 r */
  tunnel_radius: number;
}

/**
 * 系统锚杆配置接口
 */
export interface RockBoltConfig {
  /** 单环锚杆数 */
  bolts_per_ring: number;
  /** 纵向排布间距 (m) */
  spacing_z: number;
  /** 布设起始角度 (度) */
  start_angle: number;
  /** 布设终止角度 (度) */
  end_angle: number;
  /** 锚杆长度缩放因子 */
  length_scale?: number;
  /** 分区起点里程 */
  start_chainage: number;
  /** 分区终点里程 */
  end_chainage: number;
  /** 隧道等效内半径 (m)，对应 r */
  tunnel_radius: number;
}

export class ReinforcementManager {
  public advancePipeMesh: THREE.InstancedMesh;
  public groutingMesh: THREE.InstancedMesh;
  public criticalGroutingMesh?: THREE.InstancedMesh; // 临界注浆圈（双状态对比）
  private readonly nMaxAdvance: number;
  private readonly nMaxGrouting: number;

  /**
   * 构造函数 - 初始化超前小导管与注浆圈实例网格
   */
  constructor(advanceConfig: AdvancePipeConfig, groutingConfig: GroutingConfig) {
    // ========== 1. 超前小导管初始化 ==========
    const L_advance = advanceConfig.end_chainage - advanceConfig.start_chainage;
    const ringsAdvance = Math.ceil(L_advance / advanceConfig.longitudinal_spacing);
    this.nMaxAdvance = ringsAdvance * advanceConfig.per_ring;

    const advancePipeGeom = new THREE.CylinderGeometry(0.04, 0.04, 4.0, 8);
    advancePipeGeom.translate(0, 2.0, 0);
    advancePipeGeom.rotateX(Math.PI / 2);
    const advanceMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffaa00, 
      roughness: 0.6,
      transparent: true,
      opacity: 0.9
    });
    this.advancePipeMesh = new THREE.InstancedMesh(
      advancePipeGeom, 
      advanceMaterial, 
      this.nMaxAdvance
    );
    this.advancePipeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.advancePipeMesh.count = 0;

    // ========== 2. 注浆圈初始化（支持原始+临界双状态） ==========
    const L_grouting = groutingConfig.end_chainage - groutingConfig.start_chainage;
    // 注浆圈：沿纵向分段，每段一个环状体
    const segmentsGrouting = Math.max(1, Math.ceil(L_grouting / 5.0)); // 每5m一段
    this.nMaxGrouting = segmentsGrouting;

    // 原始注浆圈（半透明青色）
    const groutingGeom = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
    const groutingMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide
    });
    this.groutingMesh = new THREE.InstancedMesh(
      groutingGeom,
      groutingMaterial,
      this.nMaxGrouting
    );
    this.groutingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.groutingMesh.count = 0;

    // 临界注浆圈（若存在临界状态，半透明橙色高亮）
    if (groutingConfig.rg_crit !== undefined && groutingConfig.tg_crit !== undefined && groutingConfig.tg_crit > 0) {
      const criticalMaterial = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        roughness: 0.3,
        metalness: 0.1,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide
      });
      this.criticalGroutingMesh = new THREE.InstancedMesh(
        groutingGeom.clone(),
        criticalMaterial,
        this.nMaxGrouting
      );
      this.criticalGroutingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.criticalGroutingMesh.count = 0;
    }
  }

  /**
   * 更新注浆圈几何数据 - 严格遵循字段映射规范
   * 原始注浆圈：基于 rg 与 r2 计算厚度 tg = rg - r2
   * 临界注浆圈：基于 rg_crit 与 r2 计算厚度 tg_crit（若存在）
   */
  public updateGroutingFromSnapshot(config: GroutingConfig): void {
    const length = config.end_chainage - config.start_chainage;
    const segments = Math.max(1, Math.ceil(length / 5.0));
    const segmentLength = length / segments;

    // ========== 原始注浆圈 ==========
    const tg_original = Math.max(0, config.rg - config.r2);
    const r_inner = config.r2;
    const r_outer = config.rg;

    this.updateGroutingRing(
      this.groutingMesh,
      segments,
      segmentLength,
      config.start_chainage,
      r_inner,
      r_outer,
      tg_original > 0 ? 0x00ffff : 0x888888
    );

    // ========== 临界注浆圈（双状态对比） ==========
    if (this.criticalGroutingMesh && config.rg_crit !== undefined && config.tg_crit !== undefined) {
      const hasCritical = config.tg_crit > 0;
      this.updateGroutingRing(
        this.criticalGroutingMesh,
        segments,
        segmentLength,
        config.start_chainage,
        config.r2,
        hasCritical ? config.rg_crit : config.r2,
        hasCritical ? 0xff6600 : 0x888888,
        hasCritical ? 0.35 : 0.1
      );
    }

    // 双洞模式：副洞注浆圈（X轴平移 D_spacing）
    if (config.tunnel_type === 'double' && config.D_spacing) {
      // 注：实际实现中需在主洞基础上克隆并平移
      // 此处标记为需要外部调用方处理双洞位姿
    }
  }

  /**
   * 内部：更新注浆圈环状体实例
   */
  private updateGroutingRing(
    mesh: THREE.InstancedMesh,
    segments: number,
    segmentLength: number,
    startZ: number,
    rInner: number,
    rOuter: number,
    color: number,
    opacity: number = 0.25
  ): void {
    mesh.count = Math.min(segments, mesh.instanceMatrix.count);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));

    for (let i = 0; i < mesh.count; i++) {
      const z = startZ + i * segmentLength + segmentLength / 2;
      position.set(0, 0, z);

      // 环状体：X/Y方向为内外径，Z方向为段长
      const thickness = rOuter - rInner;
      const avgRadius = (rInner + rOuter) / 2;
      
      // 缩放：生成空心圆柱效果
      // 使用缩放将单位圆柱变换为注浆圈形状
      scale.set(rOuter, rOuter, segmentLength);

      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    
    // 更新材质透明度
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.opacity = opacity;
        }
      });
    } else if (mesh.material instanceof THREE.MeshStandardMaterial) {
      mesh.material.opacity = opacity;
    }
  }

  /**
   * 泛型矩阵与状态更新：支持环向矩阵布设的解算注入
   */
  public updateSystemInstances(
    targetMesh: THREE.InstancedMesh,
    ringCount: number,
    perRingAmount: number,
    transformCallback: (globalIdx: number, ringIdx: number, itemIdx: number) => THREE.Matrix4,
    stateColors?: THREE.Color[]
  ): void {
    const nCurrent = ringCount * perRingAmount;
    targetMesh.count = Math.min(nCurrent, targetMesh.instanceMatrix.count);

    for (let i = 0; i < ringCount; i++) {
      for (let j = 0; j < perRingAmount; j++) {
        const globalIdx = i * perRingAmount + j;
        if (globalIdx >= targetMesh.instanceMatrix.count) break;

        const matrix = transformCallback(globalIdx, i, j);
        targetMesh.setMatrixAt(globalIdx, matrix);

        if (stateColors && stateColors[globalIdx]) {
          targetMesh.setColorAt(globalIdx, stateColors[globalIdx]);
        }
      }
    }

    targetMesh.instanceMatrix.needsUpdate = true;
    if (stateColors) {
      if (targetMesh.instanceColor === null) {
        targetMesh.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(targetMesh.count * 3), 3
        );
      }
      targetMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * 从快照数据完整更新所有加固构件
   */
  public updateFromSnapshot(snapshot: {
    input_parameter?: {
      rg?: number;
      r2?: number;
      r?: number;
      start_chainage?: number;
      end_chainage?: number;
      tunnel_type?: 'single' | 'double';
      D_spacing?: number;
    };
    critical_state?: {
      rg_crit?: number;
      tg_crit?: number;
    };
    original_state?: {
      // 原始状态可能也有rg相关，但优先用input_parameter
    };
  }): void {
    const params = snapshot.input_parameter;
    if (!params) return;

    // 构建注浆圈配置（强制降级规范）
    const groutingConfig: GroutingConfig = {
      rg: params.rg ?? 0,
      r2: params.r2 ?? 0,
      rg_crit: snapshot.critical_state?.rg_crit,
      tg_crit: snapshot.critical_state?.tg_crit,
      start_chainage: params.start_chainage ?? 0,
      end_chainage: params.end_chainage ?? 0,
      tunnel_type: params.tunnel_type ?? 'single',
      D_spacing: params.D_spacing
    };

    this.updateGroutingFromSnapshot(groutingConfig);
  }

  /**
   * 获取所有网格对象
   */
  public getMeshes(): THREE.InstancedMesh[] {
    const meshes: THREE.InstancedMesh[] = [
      this.advancePipeMesh,
      this.groutingMesh
    ];
    if (this.criticalGroutingMesh) {
      meshes.push(this.criticalGroutingMesh);
    }
    return meshes;
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    this.advancePipeMesh.geometry.dispose();
    (this.advancePipeMesh.material as THREE.Material).dispose();
    
    this.groutingMesh.geometry.dispose();
    (this.groutingMesh.material as THREE.Material).dispose();
    
    if (this.criticalGroutingMesh) {
      this.criticalGroutingMesh.geometry.dispose();
      (this.criticalGroutingMesh.material as THREE.Material).dispose();
    }
  }
}

/**
 * 系统锚杆生成器 - 支持从快照数据驱动
 */
export class RockBoltGenerator {
  public mesh: THREE.InstancedMesh;
  private config: RockBoltConfig;

  constructor(config: RockBoltConfig) {
    this.config = config;
    
    const L_max = config.end_chainage - config.start_chainage;
    const ringCount = Math.ceil(L_max / config.spacing_z);
    const nMax = ringCount * config.bolts_per_ring;

    const boltRadius = 0.025; // 25mm锚杆
    const boltLength = 3.0 * (config.length_scale ?? 1.0);
    
    const geometry = new THREE.CylinderGeometry(boltRadius, boltRadius, boltLength, 8);
    geometry.translate(0, boltLength / 2, 0);
    geometry.rotateX(Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({ 
      color: 0x8a8a8a, 
      roughness: 0.8 
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, nMax);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
  }

  /**
   * 从快照更新锚杆数据
   */
  public updateFromSnapshot(snapshot: {
    input_parameter?: {
      r?: number;
      start_chainage?: number;
      end_chainage?: number;
    };
    critical_state?: {
      // 锚杆应力状态可用于着色
    };
  }, stateColors?: THREE.Color[]): void {
    const params = snapshot.input_parameter;
    if (!params) return;

    // 更新配置（降级取值）
    this.config.tunnel_radius = params.r ?? this.config.tunnel_radius;
    this.config.start_chainage = params.start_chainage ?? this.config.start_chainage;
    this.config.end_chainage = params.end_chainage ?? this.config.end_chainage;

    // 重新计算并更新
    this.updateSystemData(
      Math.ceil((this.config.end_chainage - this.config.start_chainage) / this.config.spacing_z),
      this.config.bolts_per_ring,
      this.config.spacing_z,
      this.config.tunnel_radius,
      this.config.start_angle,
      this.config.end_angle,
      this.config.length_scale ?? 1.0,
      stateColors
    );
  }

  /**
   * 系统锚杆 (环向排布) 空间位姿自动解算
   */
  public updateSystemData(
    ringCount: number,
    boltsPerRing: number,
    spacingZ: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    scaleFactor: number = 1.0,
    stateColors?: THREE.Color[]
  ): void {
    const nCurrent = ringCount * boltsPerRing;
    this.mesh.count = Math.min(nCurrent, this.mesh.instanceMatrix.count);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, scaleFactor);

    const angleStep = boltsPerRing > 1 ? (endAngle - startAngle) / (boltsPerRing - 1) : 0;

    for (let ringIdx = 0; ringIdx < ringCount; ringIdx++) {
      const z = this.config.start_chainage + ringIdx * spacingZ;
      const center = { x: 0, y: 0, z: z };

      for (let boltIdx = 0; boltIdx < boltsPerRing; boltIdx++) {
        const globalIdx = ringIdx * boltsPerRing + boltIdx;
        if (globalIdx >= this.mesh.instanceMatrix.count) break;

        const currentAngle = startAngle + boltIdx * angleStep;
        const polarCoords = polarToCartesian(radius, currentAngle);

        position.set(polarCoords.x, polarCoords.y, z);
        const quaternion = calculateNormalQuaternion(position, center);

        matrix.compose(position, quaternion, scale);
        this.mesh.setMatrixAt(globalIdx, matrix);

        if (stateColors && stateColors[globalIdx]) {
          this.mesh.setColorAt(globalIdx, stateColors[globalIdx]);
        }
      }
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (stateColors) {
      if (this.mesh.instanceColor === null) {
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(this.mesh.count * 3), 3
        );
      }
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * 简化更新接口（兼容旧版）
   */
  public updateInstanceData(
    nCurrent: number,
    spacingZ: number,
    scaleFactor: number,
    radius: number,
    angleDegrees: number,
    stateColors?: THREE.Color[]
  ): void {
    this.updateSystemData(
      nCurrent,
      1,
      spacingZ,
      radius,
      angleDegrees,
      angleDegrees,
      scaleFactor,
      stateColors
    );
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}


