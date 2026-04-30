import * as THREE from 'three';
import { polarToCartesian, calculateNormalQuaternion } from '@/utils/math';
export enum TunnelType {
  HORSESHOE = 'horseshoe', // 晏家隧道-马蹄形
  CIRCULAR = 'circular'    // 盾构隧道-圆形
}

export class TunnelGenerator {
  public mesh: THREE.InstancedMesh;
  private readonly L_max: number;      // 最大里程纵深
  private readonly delta_l_min: number; // 最小排布间距 (单位长度1m)
  
  constructor(type: TunnelType, L_max: number, delta_l_min: number = 1.0) {
    this.L_max = L_max;
    this.delta_l_min = delta_l_min;
    
    const geometry = type === TunnelType.HORSESHOE 
      ? this.createHorseshoeBase() 
      : this.createCircularBase();
      
    const material = new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide });
    
    // 极值计算与显存申请: N_max = ceil(L_max / delta_l_min)
    const nMax = Math.ceil(this.L_max / this.delta_l_min);
    this.mesh = new THREE.InstancedMesh(geometry, material, nMax);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; // 初始渲染量为0
  }

  /**
   * 构建马蹄形基准几何体 (晏家隧道案例)
   */
  private createHorseshoeBase(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const R1 = 7.9;      // 拱顶半径
    const R2 = 5.2;      // 隧道脚半径
    const maxWidth = 15.7; 
    const halfW = maxWidth / 2;

    // 简化分段函数逻辑构建截面轮廓
    shape.moveTo(-halfW, -2); // 起点
    shape.absarc(0, 0, R1, Math.PI, 0, false); // 上部拱顶
    shape.quadraticCurveTo(halfW, 0, halfW, -2); // 侧墙过渡
    shape.absarc(halfW - R2, -4, R2, 0, -Math.PI / 2, true); // 底部右转角
    
    // 中心水沟扣减区域 (预留布尔路径)
    const ditchPath = new THREE.Path();
    ditchPath.moveTo(-0.5, -5);
    ditchPath.lineTo(0.5, -5);
    ditchPath.lineTo(0.5, -4);
    ditchPath.lineTo(-0.5, -4);
    ditchPath.closePath();
    shape.holes.push(ditchPath);

    // 沿Z轴拉伸1个单位长度
    const settings = { depth: 1, bevelEnabled: false };
    return new THREE.ExtrudeGeometry(shape, settings);
  }

  /**
   * 构建圆形基准几何体 (盾构隧道)
   */
  private createCircularBase(): THREE.BufferGeometry {
    const radius = 6; // 外径12米 -> 半径6米
    // 使用圆柱体旋转90度或直接用TubeGeometry，这里采用Cylinder简化
    const geometry = new THREE.CylinderGeometry(radius, radius, 1, 64, 1, true);
    geometry.rotateX(Math.PI / 2);
    return geometry;
  }

  /**
   * 动态更新渲染实例数量
   */
  public updateCount(nCurrent: number): void {
    this.mesh.count = Math.min(nCurrent, this.mesh.instanceMatrix.count);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 响应参数调整：动态推演空间矩阵并同步状态颜色
   * 当调整“排布间距”、“衬砌厚度”或后端推送新应力状态时触发。
   * 
   * @param nCurrent 当前活跃实例数量
   * @param spacingZ Z轴排布间距
   * @param scaleFactor 缩放因子
   * @param radius 截面极坐标半径
   * @param angleDegrees 截面极坐标角度
   * @param stateColors (可选) 依据应力或安全系数推演的颜色数组
   */
  public updateInstanceData(
    nCurrent: number,
    spacingZ: number,
    scaleFactor: number,
    radius: number,
    angleDegrees: number,
    stateColors?: THREE.Color[]
  ): void {
    // 确保渲染数量与传入数据同步
    this.updateCount(nCurrent);

    // 提前实例化，避免在循环中频繁分配内存
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor);

    // 1. 活跃实例遍历
    for (let i = 0; i < nCurrent; i++) {
      // --- 空间矩阵推演 ---
      const z = -i * spacingZ; 
      const polarCoords = polarToCartesian(radius, angleDegrees);
      position.set(polarCoords.x, polarCoords.y, z);

      // 计算表面法向量并转换为四元数
      const center = { x: 0, y: 0, z: z };
      const quaternion = calculateNormalQuaternion(position, center);

      matrix.compose(position, quaternion, scale);
      
      // 覆写显存缓冲中的历史数据
      this.mesh.setMatrixAt(i, matrix);

      // --- 色彩与状态挂载 ---
      if (stateColors && stateColors[i]) {
        this.mesh.setColorAt(i, stateColors[i]);
      }
    }

    // 2. 触发管线重绘 (Dirty Flag)
    this.mesh.instanceMatrix.needsUpdate = true;
    
    // 若更新了颜色属性，同步提交颜色缓冲的脏标记
    if (stateColors) {
      if (this.mesh.instanceColor === null) {
        // 若之前未分配颜色缓冲，需初始化以防内存越界
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.mesh.count * 3), 3);
      }
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

}