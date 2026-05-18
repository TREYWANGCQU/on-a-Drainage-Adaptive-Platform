import * as THREE from 'three';
import { polarToCartesian, calculateNormalQuaternion } from '@/utils/math';
// 修改后：严格匹配后端 Snapshot 输出类型
export enum TunnelType {
  SINGLE = 'single', // 单洞隧道
  DOUBLE = 'double'  // 双洞隧道
}

export class TunnelGenerator {
  public mesh: THREE.InstancedMesh;
  private readonly L_max: number;      // 最大里程纵深
  private readonly delta_l_min: number; // 最小排布间距 (单位长度1m)
  private readonly c_ring: number = 1;  // 隧道主体单环实例数恒定为1

  constructor(type: TunnelType, start_chainage: number, end_chainage: number, r: number, D_spacing: number = 30.0, delta_l_min: number = 1.0) {
    // 从 store 传入的空间里程推导纵深 L_max
    this.L_max = end_chainage - start_chainage;
    this.delta_l_min = delta_l_min;

    const geometry = this.createHorseshoeBase(type, r, D_spacing);

    const material = new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide });

    // 极值计算：N_max = ceil(L_max / delta_l_min) * C_ring
    // 规避运行时高频内存垃圾回收(GC)，一次性向 GPU 申请最大连续显存空间 BufferAttribute
    const nMax = Math.ceil(this.L_max / this.delta_l_min) * this.c_ring;
    this.mesh = new THREE.InstancedMesh(geometry, material, nMax);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // 动态控制初始化渲染实例数为 0，避免冗余网格绘制
    this.mesh.count = 0;
  }
  /**
     * 构建单/双洞组合基准几何体
     */
  private createHorseshoeBase(type: TunnelType, r: number, spacing: number): THREE.BufferGeometry {
    const shapes: THREE.Shape[] = [];

    // 根据隧道类型动态推演二维组合面域
    if (type === TunnelType.DOUBLE) {
      shapes.push(this.createHorseshoeShape(r, -spacing / 2)); // 左线
      shapes.push(this.createHorseshoeShape(r, spacing / 2));  // 右线
    } else {
      shapes.push(this.createHorseshoeShape(r, 0)); // 单线居中
    }

    const settings = { depth: 1, bevelEnabled: false };
    return new THREE.ExtrudeGeometry(shapes, settings);
  }
  /**
   * 细部截面拓扑生成核心：引入 offsetX 支持空间横向偏移解算
   */
  private createHorseshoeShape(r: number, offsetX: number): THREE.Shape {
    const shape = new THREE.Shape();

    const R1 = 1.05 * r;
    const R2 = 0.65 * r;
    const R3 = 1.80 * r;

    const H_side = r * 0.5;
    const invertCenterY = -H_side - R2 + R3;

    // 所有局部坐标挂载 offsetX 水平偏移量
    shape.moveTo(R1 + offsetX, 0);
    shape.absarc(offsetX, 0, R1, 0, Math.PI, false);
    shape.lineTo(-R1 + offsetX, -H_side);
    shape.absarc(-R1 + R2 + offsetX, -H_side, R2, Math.PI, Math.PI * 1.5, false);
    shape.absarc(offsetX, invertCenterY, R3, Math.PI * 1.25, Math.PI * 1.75, true);
    shape.absarc(R1 - R2 + offsetX, -H_side, R2, -Math.PI / 2, 0, false);
    shape.lineTo(R1 + offsetX, 0);

    const r_threshold = 5.0;
    if (r > r_threshold) {
      const ditchPath = new THREE.Path();
      const w = 0.6;
      const h = 0.8;
      const bottomY = -H_side - R2;

      // 同步应用 offsetX 进行水沟二维布尔扣减
      ditchPath.moveTo(-w / 2 + offsetX, bottomY);
      ditchPath.lineTo(w / 2 + offsetX, bottomY);
      ditchPath.lineTo(w / 2 + offsetX, bottomY + h);
      ditchPath.lineTo(-w / 2 + offsetX, bottomY + h);
      ditchPath.closePath();

      shape.holes.push(ditchPath);
    }

    return shape;
  }
  /**
   * 动态更新渲染实例数量
   */
  public updateCount(nCurrent: number): void {
    // mesh.count 动态赋值：使冗余实例在顶点着色器管线中被直接丢弃，降低 Overdraw 开销
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