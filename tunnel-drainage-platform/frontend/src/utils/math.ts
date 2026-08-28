// 文件路径: tunnel-drainage-platform\frontend\src\utils\math.ts

import * as THREE from 'three';
/**
 * 前端辅助计算工具类。
 * 提供用于 3D 几何生成、参数化排布以及空间数据处理的数学方法。
 */

/**
 * 极坐标转直角坐标。
 * 基于极坐标计算，利用 sin 和 cos 函数自动定位锚杆或注浆圈的起点与终点。
 * @param radius 半径（如隧道等效半径或外扩半径）
 * @param angleDegrees 角度（以度为单位）
 * @param centerX 圆心 X 坐标 (默认 0)
 * @param centerY 圆心 Y 坐标 (默认 0)
 * @returns 包含 x 和 y 坐标的对象
 */
export const polarToCartesian = (
  radius: number, 
  angleDegrees: number, 
  centerX: number = 0, 
  centerY: number = 0
): { x: number; y: number } => {
  const angleRadians = degreesToRadians(angleDegrees);
  return {
    x: centerX + radius * Math.cos(angleRadians),
    y: centerY + radius * Math.sin(angleRadians)
  };
};

/**
 * 角度转弧度。
 * 支撑 Three.js 内部矩阵变换和旋转体系计算。
 * @param degrees 角度值
 * @returns 弧度值
 */
export const degreesToRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

/**
 * 线性插值计算。
 * 适用于安全系数云图 (Safety Factor Heatmap) 顶点颜色的平滑过渡计算，
 * 以及不同里程断面间的数据平滑过渡。
 * @param v0 起点数值
 * @param v1 终点数值
 * @param t 权重因子 (0.0 到 1.0)
 * @returns 插值结果
 */
export const lerp = (v0: number, v1: number, t: number): number => {
  return v0 + t * (v1 - v0);
};

/**
 * 计算三维空间两点间距离。
 * 适用于动水压力流线生成时判定粒子存活范围或碰撞检测。
 * @param p1 点 1 坐标 {x, y, z}
 * @param p2 点 2 坐标 {x, y, z}
 * @returns 欧几里得距离
 */
export const distance3D = (
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number }
): number => {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/**
 * 根据起始和终止里程，计算分区空间长度。
 * @param startChainage 起点里程标
 * @param endChainage 终点里程标
 * @returns 绝对长度值
 */
export const calculatePartitionLength = (startChainage: number, endChainage: number): number => {
  return Math.abs(endChainage - startChainage);
};

/**
 * 限制数值在指定范围内 (Clamp)。
 * 适用于限制拖拽滑块时的极端参数，避免传入后端或 Three.js 造成几何体崩溃。
 * @param val 当前数值
 * @param min 最小值
 * @param max 最大值
 * @returns 钳制后的数值
 */
export const clamp = (val: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, val));
};

/**
 * 计算曲面法向量并转换为旋转四元数。
 * 利用目标点和参考中心推算表面法线方向，并转换为四元数以规避万向节死锁。
 * @param pointOnSurface 表面点三维坐标
 * @param center 参考中心点三维坐标
 * @param defaultDirection 几何体的默认朝向（默认 Y 轴向上）
 * @returns THREE.Quaternion 旋转四元数
 */
export const calculateNormalQuaternion = (
  pointOnSurface: { x: number; y: number; z: number },
  center: { x: number; y: number; z: number },
  defaultDirection: THREE.Vector3 = new THREE.Vector3(0, 1, 0)
): THREE.Quaternion => {
  // 计算方向向量
  const dir = new THREE.Vector3(
    pointOnSurface.x - center.x,
    pointOnSurface.y - center.y,
    pointOnSurface.z - center.z
  );
// 规避零向量坍缩，发生重合时维持初始朝向
  if (dir.lengthSq() === 0) return new THREE.Quaternion();
  const normal = dir.normalize();
  // 从默认方向旋转至法线方向
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(defaultDirection, normal);
  return quaternion;
};

/**
 * 270° 马蹄形拱形半环三维曲线
 * 离散化构建贴合二衬背水面/初支内壁 (r1) 的拱形半环，用于生成环向排水盲管 TubeGeometry
 */
export class HorseshoeArcCurve extends THREE.Curve<THREE.Vector3> {
  private points: THREE.Vector3[] = [];
  public sampledNormals: THREE.Vector3[] = [];
  public sampledPoints: THREE.Vector3[] = [];

  constructor(
    r: number, 
    r_interface: number = 8.35,
    aspect_ratio: number = 0.7,
    yLongFoot?: number
  ) {
    super();
    this.buildPoints(r, r_interface, aspect_ratio, yLongFoot);
  }

  private buildPoints(r: number, r_interface: number, aspect_ratio: number, yLongFoot?: number): void {
    const R1_base = 1.05 * r;
    const R2_base = 0.65 * r;
    const R3_base = 1.80 * r;

    const dx = R1_base - R2_base;
    const dy = Math.sqrt(Math.max(0, Math.pow(R3_base - R2_base, 2) - Math.pow(dx, 2)));

    const w = 2.1 * r;
    const h = w * aspect_ratio;
    const H_side = Math.max(0.0, h - R1_base + dy - R3_base);

    // 衬砌背水面（二衬外壁/初支内壁交界面 r1）外廓半径：t = r_interface - r
    const t = Math.max(0, r_interface - r);
    const R1 = R1_base + t;
    const R2 = R2_base + t;

    // 极角推导：若传入 yLongFoot，则根据目标高程动态解算收口角度；否则使用默认相切角 aLeft / aRight
    let aLeft = Math.atan2(-dy, -dx);
    if (aLeft < 0) aLeft += Math.PI * 2;
    let aRight = Math.atan2(-dy, dx);
    if (aRight < 0) aRight += Math.PI * 2;

    if (yLongFoot !== undefined && R2 > 0) {
      const sinVal = Math.max(-1.0, Math.min(0.0, (yLongFoot + H_side) / R2));
      const asinVal = Math.asin(sinVal); // 负角区间 [-PI/2, 0]
      aLeft = Math.PI - asinVal;        // 第三象限区间 [PI, 3*PI/2]
      aRight = Math.PI * 2 + asinVal;   // 第四象限区间 [3*PI/2, 2*PI]
    }

    const points: THREE.Vector3[] = [];
    const normals: THREE.Vector3[] = [];

    // 1. 左侧墙下半段圆弧 (从左墙脚 aLeft 逆时针至 180° / PI，精确收口于拱脚纵向管)
    const leftSteps = 16;
    for (let i = 0; i <= leftSteps; i++) {
      const angle = aLeft + (Math.PI - aLeft) * (i / leftSteps);
      const px = -dx + R2 * Math.cos(angle);
      const py = -H_side + R2 * Math.sin(angle);
      points.push(new THREE.Vector3(px, py, 0));
      normals.push(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).normalize());
    }

    // 2. 左侧直墙段 (若 H_side > 0，从 -H_side 垂直向上至 0)
    if (H_side > 0) {
      const wallSteps = 8;
      for (let i = 1; i <= wallSteps; i++) {
        const y = -H_side + H_side * (i / wallSteps);
        points.push(new THREE.Vector3(-R1, y, 0));
        normals.push(new THREE.Vector3(-1, 0, 0));
      }
    }

    // 3. 拱顶大圆弧段 (从 180° / PI 顺时针至 0°)
    const vaultSteps = 32;
    for (let i = 0; i <= vaultSteps; i++) {
      const angle = Math.PI - Math.PI * (i / vaultSteps);
      const px = R1 * Math.cos(angle);
      const py = R1 * Math.sin(angle);
      points.push(new THREE.Vector3(px, py, 0));
      normals.push(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).normalize());
    }

    // 4. 右侧直墙段 (若 H_side > 0，从 0 垂直向下至 -H_side)
    if (H_side > 0) {
      const wallSteps = 8;
      for (let i = 1; i <= wallSteps; i++) {
        const y = -H_side * (i / wallSteps);
        points.push(new THREE.Vector3(R1, y, 0));
        normals.push(new THREE.Vector3(1, 0, 0));
      }
    }

    // 5. 右侧墙下半段圆弧 (从 0° / 2*PI 顺时针至 aRight ~315°，精确收口于拱脚纵向管)
    const rightSteps = 16;
    for (let i = 1; i <= rightSteps; i++) {
      const angle = Math.PI * 2 + (aRight - Math.PI * 2) * (i / rightSteps);
      const px = dx + R2 * Math.cos(angle);
      const py = -H_side + R2 * Math.sin(angle);
      points.push(new THREE.Vector3(px, py, 0));
      normals.push(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).normalize());
    }

    this.points = points;
    this.sampledPoints = points;
    this.sampledNormals = normals;
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const clampedT = Math.max(0, Math.min(1, t));
    const index = clampedT * (this.points.length - 1);
    const low = Math.floor(index);
    const high = Math.ceil(index);
    const frac = index - low;

    if (low === high || high >= this.points.length) {
      return target.copy(this.points[Math.min(low, this.points.length - 1)]);
    }

    const p0 = this.points[low];
    const p1 = this.points[high];
    return target.set(
      p0.x + (p1.x - p0.x) * frac,
      p0.y + (p1.y - p0.y) * frac,
      p0.z + (p1.z - p0.z) * frac
    );
  }
}

