import * as THREE from 'three';
import { polarToCartesian, calculateNormalQuaternion } from '@/utils/math'; // 新增依赖

export class ReinforcementManager {
  // 补充遗漏：超前小导管与注浆圈的渲染实例
  public advancePipeMesh: THREE.InstancedMesh;
  public groutingMesh: THREE.InstancedMesh;
  private readonly nMax: number;

  /**
   * @param L_max 最大设计纵深里程
   * @param delta_l_min 最小纵向间距
   * @param c_ring 单环最大布设数量
   */
  constructor(L_max: number, delta_l_min: number, c_ring: number) {
    this.nMax = Math.ceil(L_max / delta_l_min) * c_ring;

    // 1. 初始化超前小导管 (外径较小、长细比大、且通常带有仰角/外插角)
    const advancePipeGeom = new THREE.CylinderGeometry(0.04, 0.04, 4.0, 8);
    advancePipeGeom.translate(0, 2.0, 0); 
    advancePipeGeom.rotateX(Math.PI / 2); 
    const advanceMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.6 });
    this.advancePipeMesh = new THREE.InstancedMesh(advancePipeGeom, advanceMaterial, this.nMax);
    this.advancePipeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.advancePipeMesh.count = 0;

    // 2. 初始化注浆圈 (用于模拟岩体加固范围，采用较大半径的半透明材质)
    const groutingGeom = new THREE.CylinderGeometry(0.6, 0.6, 1.0, 16); 
    groutingGeom.translate(0, 0.5, 0);
    groutingGeom.rotateX(Math.PI / 2);
    const groutingMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff88, transparent: true, opacity: 0.3 });
    this.groutingMesh = new THREE.InstancedMesh(groutingGeom, groutingMaterial, this.nMax);
    this.groutingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.groutingMesh.count = 0;
  }

  /**
   * 泛型矩阵与状态更新：支持环向矩阵布设的解算注入
   * @param targetMesh 指定更新的目标构件 (如 advancePipeMesh 或 groutingMesh)
   */
  public updateSystemInstances(
    targetMesh: THREE.InstancedMesh,
    ringCount: number, 
    perRingAmount: number, 
    transformCallback: (globalIdx: number, ringIdx: number, itemIdx: number) => THREE.Matrix4,
    stateColors?: THREE.Color[]
  ): void {
    const nCurrent = ringCount * perRingAmount;
    targetMesh.count = Math.min(nCurrent, this.nMax);

    for (let i = 0; i < ringCount; i++) {
      for (let j = 0; j < perRingAmount; j++) {
        const globalIdx = i * perRingAmount + j;
        if (globalIdx >= this.nMax) break;
        
        const matrix = transformCallback(globalIdx, i, j);
        targetMesh.setMatrixAt(globalIdx, matrix);

        // 色彩与状态挂载
        if (stateColors && stateColors[globalIdx]) {
          targetMesh.setColorAt(globalIdx, stateColors[globalIdx]);
        }
      }
    }
    
    // 触发管线重绘
    targetMesh.instanceMatrix.needsUpdate = true;
    if (stateColors) {
      if (targetMesh.instanceColor === null) {
        targetMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(targetMesh.count * 3), 3);
      }
      targetMesh.instanceColor.needsUpdate = true;
    }
  }
}

export class RockBoltGenerator {
  public mesh: THREE.InstancedMesh;

  constructor(nMax: number) {
    // 构建锚杆基准几何体
    const boltRadius = 0.05; 
    const boltLength = 3.0;
    const geometry = new THREE.CylinderGeometry(boltRadius, boltRadius, boltLength, 8);
    // 锚点对齐岩壁表面
    geometry.translate(0, boltLength / 2, 0); 
    geometry.rotateX(Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.8 });
    
    this.mesh = new THREE.InstancedMesh(geometry, material, nMax);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
  }

  public updateInstanceData(
    nCurrent: number,
    spacingZ: number,
    scaleFactor: number, // 控制锚杆长度缩放
    radius: number,
    angleDegrees: number,
    stateColors?: THREE.Color[] // 接入锚杆轴力或剪切应力预警颜色
  ): void {
    this.mesh.count = Math.min(nCurrent, this.mesh.instanceMatrix.count);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, scaleFactor); // 针对圆柱体长度(Z向拉伸)应用缩放

    // 活跃实例遍历
    for (let i = 0; i < nCurrent; i++) {
      const z = -i * spacingZ;
      const polarCoords = polarToCartesian(radius, angleDegrees);
      position.set(polarCoords.x, polarCoords.y, z);

      const center = { x: 0, y: 0, z: z };
      const quaternion = calculateNormalQuaternion(position, center);

      matrix.compose(position, quaternion, scale);
      this.mesh.setMatrixAt(i, matrix);

      // 色彩与状态挂载
      if (stateColors && stateColors[i]) {
        this.mesh.setColorAt(i, stateColors[i]);
      }
    }

    // 触发管线重绘
    this.mesh.instanceMatrix.needsUpdate = true;
    if (stateColors) {
      if (this.mesh.instanceColor === null) {
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.mesh.count * 3), 3);
      }
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
  /**
   * 补充遗漏：系统锚杆 (环向排布) 空间位姿自动解算
   * 自动根据起止角度和平分数量，计算每一环的放射状矩阵。
   */
  public updateSystemData(
    ringCount: number,          // 纵向总环数
    boltsPerRing: number,       // 单环锚杆数
    spacingZ: number,           // 纵向排布间距
    radius: number,             // 隧道等效半径
    startAngle: number,         // 布设起始极角
    endAngle: number,           // 布设终止极角
    scaleFactor: number = 1.0,  // 长度缩放因子
    stateColors?: THREE.Color[]
  ): void {
    const nCurrent = ringCount * boltsPerRing;
    this.mesh.count = Math.min(nCurrent, this.mesh.instanceMatrix.count);
    
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, scaleFactor);
    
    // 角度步长 (防除0处理)
    const angleStep = boltsPerRing > 1 ? (endAngle - startAngle) / (boltsPerRing - 1) : 0;

    for (let ringIdx = 0; ringIdx < ringCount; ringIdx++) {
      const z = -ringIdx * spacingZ;
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

        // 状态色彩挂载
        if (stateColors && stateColors[globalIdx]) {
          this.mesh.setColorAt(globalIdx, stateColors[globalIdx]);
        }
      }
    }

    // 触发管线重绘与颜色脏标记
    this.mesh.instanceMatrix.needsUpdate = true;
    if (stateColors) {
      if (this.mesh.instanceColor === null) {
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.mesh.count * 3), 3);
      }
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}