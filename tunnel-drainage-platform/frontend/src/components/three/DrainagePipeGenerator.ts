// 构建排水管基准几何体 (圆柱体)
import * as THREE from 'three';
import { polarToCartesian, calculateNormalQuaternion } from '@/utils/math';

export class DrainagePipeGenerator {
  public mesh: THREE.InstancedMesh;

  constructor(nMax: number) {
    // 构建排水管基准几何体 (圆柱体)
    const radius = 0.1; // 默认内径
    const length = 1.0;
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 12);
    // 将原点调整至管口底部，便于沿法线方向向外延伸
    geometry.translate(0, length / 2, 0); 
    // 默认圆柱朝沿 Y 轴，通过旋转使其对齐 Z 轴或指定方向以匹配 calculateNormalQuaternion 默认向量
    geometry.rotateX(Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({ color: 0x4aa8ff });
    
    this.mesh = new THREE.InstancedMesh(geometry, material, nMax);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
  }

  public updateInstanceData(
    nCurrent: number,
    spacingZ: number,
    scaleFactor: number,
    radius: number,
    angleDegrees: number,
    stateColors?: THREE.Color[]
  ): void {
    this.mesh.count = Math.min(nCurrent, this.mesh.instanceMatrix.count);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor);

    for (let i = 0; i < nCurrent; i++) {
      const z = -i * spacingZ;
      const polarCoords = polarToCartesian(radius, angleDegrees);
      position.set(polarCoords.x, polarCoords.y, z);

      const center = { x: 0, y: 0, z: z };
      const quaternion = calculateNormalQuaternion(position, center);

      matrix.compose(position, quaternion, scale);
      this.mesh.setMatrixAt(i, matrix);

      if (stateColors && stateColors[i]) {
        this.mesh.setColorAt(i, stateColors[i]);
      }
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (stateColors) {
      if (this.mesh.instanceColor === null) {
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.mesh.count * 3), 3);
      }
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}