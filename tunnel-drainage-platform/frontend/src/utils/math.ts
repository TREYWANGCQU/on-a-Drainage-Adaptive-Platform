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
