// tunnel-drainage-platform/frontend/src/components/three/Reinforcement.ts
import * as THREE from 'three';
import { polarToCartesian, calculateNormalQuaternion } from '@/utils/math';
import { buildHorseshoeShape } from './TunnelGenerator';

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
  /** 隧道类型，对应 tunnel_type */
  tunnel_type?: 'single' | 'double';
  /** 双洞间距 (m)，对应 D_spacing */
  D_spacing?: number;
}

export class ReinforcementManager {
  public groutingMesh: THREE.InstancedMesh;
  public criticalGroutingMesh?: THREE.InstancedMesh; // 临界注浆圈（双状态对比）
  private readonly nMaxGrouting: number;

  /**
   * 构造函数 - 初始化注浆圈实例网格
   */
  constructor(groutingConfig: GroutingConfig | any, optionalGroutingConfig?: GroutingConfig) {
    const config: GroutingConfig = optionalGroutingConfig || groutingConfig;

    // ========== 注浆圈初始化（支持原始+临界双状态） ==========
    const L_grouting = config.end_chainage - config.start_chainage;
    // 注浆圈：沿纵向分段，每段一个环状体（双洞模式容量翻倍）
    const segmentsGrouting = Math.max(1, Math.ceil(L_grouting / 5.0)); // 每5m一段
    this.nMaxGrouting = segmentsGrouting * 2;

    // 原始注浆圈（半透明青色），构建封闭马蹄形环状截面
    const r_base = config.r2 ? config.r2 / 1.18 : 5.5;
    const shapeInitial = buildHorseshoeShape(r_base, config.rg || (config.r2 + 1.5), config.r2 || 6.5, 0, 0.7);
    const groutingGeom = new THREE.ExtrudeGeometry(shapeInitial, { depth: 1.0, bevelEnabled: false, curveSegments: 32 });

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
    this.groutingMesh.frustumCulled = false;
    this.groutingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.groutingMesh.count = 0;

    // 临界注浆圈常驻初始化（支持动态解算结果注入与显隐切换）
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
    this.criticalGroutingMesh.frustumCulled = false;
    this.criticalGroutingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.criticalGroutingMesh.count = 0;
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
      tg_original > 0 ? 0x00ffff : 0x888888,
      0.25,
      config.tunnel_type,
      config.D_spacing
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
        hasCritical ? 0.35 : 0.1,
        config.tunnel_type,
        config.D_spacing
      );
    }
  }

  /**
   * 内部：更新注浆圈环状体实例（支持双洞平移阵列）
   */
  private updateGroutingRing(
    mesh: THREE.InstancedMesh,
    segments: number,
    segmentLength: number,
    _startZ: number,
    rInner: number,
    rOuter: number,
    _color: number,
    opacity: number = 0.25,
    tunnelType: 'single' | 'double' = 'single',
    D_spacing: number = 30.0
  ): void {
    const isDouble = tunnelType === 'double';
    const totalInstances = isDouble ? segments * 2 : segments;
    mesh.count = Math.min(totalInstances, mesh.instanceMatrix.count);

    if (rOuter > rInner) {
      const r_base = rInner ? rInner / 1.18 : 5.5;
      const horseshoeShape = buildHorseshoeShape(r_base, rOuter, rInner, 0, 0.7);
      const newGeom = new THREE.ExtrudeGeometry(horseshoeShape, { depth: 1.0, bevelEnabled: false, curveSegments: 32 });
      if (mesh.geometry) mesh.geometry.dispose();
      mesh.geometry = newGeom;
    }

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, segmentLength);
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));

    let idx = 0;
    for (let i = 0; i < segments; i++) {
      const z = -(i * segmentLength + segmentLength / 2);
      const xOffsets = isDouble ? [-D_spacing / 2, D_spacing / 2] : [0];

      for (const xOff of xOffsets) {
        if (idx >= mesh.count) break;
        position.set(xOff, 0, z);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(idx, matrix);
        idx++;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    
    // 更新材质透明度
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m: any) => {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.opacity = opacity;
        }
      });
    } else if (mesh.material instanceof THREE.MeshStandardMaterial) {
      mesh.material.opacity = opacity;
    }
  }

  /**
   * 更新超前小导管实例矩阵


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
  public updateFromSnapshot(snapshot: any): void {
    if (!snapshot) return;
    const params = snapshot.input_parameter ?? snapshot.params ?? {};
    const critical = snapshot.critical_state ?? {};

    // 构建注浆圈配置（强制降级规范）
    const groutingConfig: GroutingConfig = {
      rg: params.rg ?? snapshot.rg ?? 8.0,
      r2: params.r2 ?? snapshot.r2 ?? 6.5,
      rg_crit: critical.rg_crit,
      tg_crit: critical.tg_crit,
      start_chainage: params.start_chainage ?? snapshot.start_chainage ?? 0,
      end_chainage: params.end_chainage ?? snapshot.end_chainage ?? 50,
      tunnel_type: params.tunnel_type ?? snapshot.tunnel_type ?? 'single',
      D_spacing: params.D_spacing ?? snapshot.D_spacing
    };

    this.updateGroutingFromSnapshot(groutingConfig);
  }

  /**
   * 获取所有网格对象
   */
  public getMeshes(): THREE.InstancedMesh[] {
    const meshes: THREE.InstancedMesh[] = [
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
    // 支持双洞模式下的容量预留 (ringCount * bolts_per_ring * 2)
    const nMax = ringCount * config.bolts_per_ring * 2;

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
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
  }

  public updateFromSnapshot(snapshot: any, stateColors?: THREE.Color[]): void {
    if (!snapshot) return;
    const params = snapshot.input_parameter ?? snapshot.params ?? {};

    // 更新配置（降级取值）
    this.config.tunnel_radius = params.r ?? this.config.tunnel_radius;
    this.config.start_chainage = params.start_chainage ?? this.config.start_chainage;
    this.config.end_chainage = params.end_chainage ?? this.config.end_chainage;
    this.config.tunnel_type = params.tunnel_type ?? snapshot.tunnel_type ?? this.config.tunnel_type ?? 'single';
    this.config.D_spacing = params.D_spacing ?? snapshot.D_spacing ?? this.config.D_spacing ?? 30.0;

    // 重新计算并更新
    this.updateSystemData(
      Math.ceil((this.config.end_chainage - this.config.start_chainage) / this.config.spacing_z),
      this.config.bolts_per_ring,
      this.config.spacing_z,
      this.config.tunnel_radius,
      this.config.start_angle,
      this.config.end_angle,
      this.config.length_scale ?? 1.0,
      stateColors,
      this.config.tunnel_type,
      this.config.D_spacing
    );
  }

  /**
   * 系统锚杆 (环向排布) 空间位姿自动解算（支持双洞平移）
   */
  public updateSystemData(
    ringCount: number,
    boltsPerRing: number,
    spacingZ: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    scaleFactor: number = 1.0,
    stateColors?: THREE.Color[],
    tunnelType: 'single' | 'double' = 'single',
    D_spacing: number = 30.0
  ): void {
    const isDouble = tunnelType === 'double';
    const perRingTotal = isDouble ? boltsPerRing * 2 : boltsPerRing;
    const nCurrent = ringCount * perRingTotal;
    this.mesh.count = Math.min(nCurrent, this.mesh.instanceMatrix.count);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, scaleFactor);

    const angleStep = boltsPerRing > 1 ? (endAngle - startAngle) / (boltsPerRing - 1) : 0;
    const xOffsets = isDouble ? [-D_spacing / 2, D_spacing / 2] : [0];

    let globalIdx = 0;
    for (let ringIdx = 0; ringIdx < ringCount; ringIdx++) {
      const z = -(ringIdx * spacingZ);

      for (const xOff of xOffsets) {
        const center = { x: xOff, y: 0, z: z };

        for (let boltIdx = 0; boltIdx < boltsPerRing; boltIdx++) {
          if (globalIdx >= this.mesh.instanceMatrix.count) break;

          const currentAngle = startAngle + boltIdx * angleStep;
          const polarCoords = polarToCartesian(radius, currentAngle);

          position.set(polarCoords.x + xOff, polarCoords.y, z);
          const quaternion = calculateNormalQuaternion(position, center);

          matrix.compose(position, quaternion, scale);
          this.mesh.setMatrixAt(globalIdx, matrix);

          if (stateColors && stateColors[globalIdx]) {
            this.mesh.setColorAt(globalIdx, stateColors[globalIdx]);
          }
          globalIdx++;
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


