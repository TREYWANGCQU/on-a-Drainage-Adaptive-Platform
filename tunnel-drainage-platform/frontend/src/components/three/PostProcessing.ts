// frontend/src/components/three/PostProcessing.ts
import * as THREE from 'three';
import { polarToCartesian } from '@/utils/math';

export interface MechanicsData {
  K_list?: number[];
  N_list?: number[];
  M_list?: number[];
  control_idx?: number;
  control_M?: number;
  control_N?: number;
  safety_factor?: number;
}

export class StressProbeManager {
  public probeGroup: THREE.Group;
  public elementColors: THREE.Color[];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.probeGroup = new THREE.Group();
    this.elementColors = new Array(24).fill(0).map(() => new THREE.Color(0x00aaff));
    this.scene.add(this.probeGroup);
  }

  /**
   * 将 24 单元的 K_list (安全系数) 转化为 RGB 色阶数组
   * K <= 2.0 映射为红色警告区；K >= 5.0 映射为安全绿/蓝色
   */
  public generateColorSpectrum(K_list: number[], tolSafetyFactor: number = 2.0): THREE.Color[] {
    const colors: THREE.Color[] = [];
    const count = K_list && K_list.length > 0 ? K_list.length : 24;

    for (let i = 0; i < count; i++) {
      const k = K_list ? K_list[i] : 5.0;
      const color = new THREE.Color();

      if (k <= tolSafetyFactor) {
        // 超限红区警告：红色到橙红
        const ratio = Math.max(0, (k - 1.0) / (tolSafetyFactor - 1.0 || 1.0));
        color.setHSL(0.0 + ratio * 0.08, 1.0, 0.5); 
      } else {
        // 安全区间：黄绿 -> 亮绿 -> 浅蓝
        const ratio = Math.min(1.0, (k - tolSafetyFactor) / 5.0);
        color.setHSL(0.25 + ratio * 0.35, 0.85, 0.5);
      }
      colors.push(color);
    }

    this.elementColors = colors;
    return colors;
  }

  /**
   * 基于快照提取最不利单元 control_idx 并挂载 3D 探针标注
   */
  public updateFromSnapshot(
    snapshot: any,
    tunnelRadius: number = 5.5,
    zPosition: number = 0,
    tolSafetyFactor: number = 2.0
  ): {
    colors: THREE.Color[];
    controlIdx: number;
    controlM: number;
    controlN: number;
    minK: number;
  } {
    // 清理旧探针
    while (this.probeGroup.children.length > 0) {
      const child = this.probeGroup.children[0];
      this.probeGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }

    const state = snapshot?.critical_state ?? snapshot?.original_state ?? {};
    const echart = snapshot?.results?.echart_data ?? snapshot?.echart_data ?? {};
    const liningRes = snapshot?.critical_state
      ? (echart.lining_res_critical ?? {})
      : (echart.lining_res_original ?? {});

    const K_list: number[] = liningRes.K_list ?? state.K_list ?? new Array(24).fill(3.5);
    const controlIdx = state.final_control_idx ?? state.control_idx ?? 0;
    const controlM = state.final_control_M ?? state.control_M ?? 0;
    const controlN = state.final_control_N ?? state.control_N ?? 0;
    const minK = state.final_safety_factor ?? state.safety_factor ?? 2.5;

    // 1. 生成 24 单元色阶
    const colors = this.generateColorSpectrum(K_list, tolSafetyFactor);

    // 2. 解算 24 单元最不利点的 3D 角度与物理坐标 (0 ~ 23 单元)
    // controlIdx = 0 对应拱顶 (90 度)，沿截面周向顺时针分布
    const angleDegree = 90 - (controlIdx / 24) * 360;
    const rad = (angleDegree * Math.PI) / 180;

    const aspect_ratio = snapshot?.input_parameter?.aspect_ratio ?? snapshot?.params?.aspect_ratio ?? 0.7;
    const r2 = snapshot?.input_parameter?.r2 ?? snapshot?.params?.r2 ?? (tunnelRadius * 1.18);

    const R1_base = 1.05 * tunnelRadius;
    const R2_base = 0.65 * tunnelRadius;
    const R3_base = 1.80 * tunnelRadius;
    const t = Math.max(0, r2 - tunnelRadius);
    const R1 = (R1_base + t) * 1.02; // 稍许外扩贴合衬砌外缘
    const R2 = (R2_base + t) * 1.02;
    const R3 = (R3_base + t) * 1.02;

    const dx = R1_base - R2_base;
    const dy = Math.sqrt(Math.max(0, Math.pow(R3_base - R2_base, 2) - Math.pow(dx, 2)));
    const w = 2.1 * tunnelRadius;
    const h = w * aspect_ratio;
    const H_side = Math.max(0.0, h - R1_base + dy - R3_base);
    const invertCenterY = -H_side + dy;

    let probeX = 0;
    let probeY = 0;

    if (rad >= 0 && rad <= Math.PI) {
      // 拱顶区域 (Y >= 0)
      probeX = R1 * Math.cos(rad);
      probeY = R1 * Math.sin(rad);
    } else if (Math.sin(rad) < -0.6) {
      // 仰拱底端区域
      probeX = R3 * Math.cos(rad);
      probeY = invertCenterY + R3 * Math.sin(rad);
    } else if (Math.cos(rad) > 0) {
      // 右边墙区域
      probeX = dx + R2 * Math.cos(rad);
      probeY = -H_side + R2 * Math.sin(rad);
    } else {
      // 左边墙区域
      probeX = -dx + R2 * Math.cos(rad);
      probeY = -H_side + R2 * Math.sin(rad);
    }

    const L = Math.abs(
      (snapshot?.input_parameter?.end_chainage ?? snapshot?.params?.end_chainage ?? snapshot?.end_chainage ?? 50) -
      (snapshot?.input_parameter?.start_chainage ?? snapshot?.params?.start_chainage ?? snapshot?.start_chainage ?? 0)
    );
    // Z 轴纵向居中定位，避免将周向单元索引 controlIdx 误用为 Z 轴里程
    const zPos = zPosition - L / 2;
    const probePos = new THREE.Vector3(probeX, probeY, zPos);

    // 3. 构建 24 单元色阶环 (围绕截面 24 个衬砌单元周向分布)
    const computeHorseshoePoint = (deg: number): THREE.Vector3 => {
      const r = (deg * Math.PI) / 180;
      let px = 0;
      let py = 0;
      if (r >= 0 && r <= Math.PI) {
        px = R1 * Math.cos(r);
        py = R1 * Math.sin(r);
      } else if (Math.sin(r) < -0.6) {
        px = R3 * Math.cos(r);
        py = invertCenterY + R3 * Math.sin(r);
      } else if (Math.cos(r) > 0) {
        px = dx + R2 * Math.cos(r);
        py = -H_side + R2 * Math.sin(r);
      } else {
        px = -dx + R2 * Math.cos(r);
        py = -H_side + R2 * Math.sin(r);
      }
      return new THREE.Vector3(px, py, zPos);
    };

    for (let i = 0; i < 24; i++) {
      const deg1 = 90 - (i / 24) * 360;
      const deg2 = 90 - ((i + 1) / 24) * 360;
      const p1 = computeHorseshoePoint(deg1);
      const p2 = computeHorseshoePoint(deg2);

      const segVec = p2.clone().sub(p1);
      const segLen = segVec.length();
      if (segLen > 0.001) {
        const segCenter = p1.clone().add(p2).multiplyScalar(0.5);
        const segGeo = new THREE.CylinderGeometry(0.12, 0.12, segLen, 8);
        const segMat = new THREE.MeshStandardMaterial({
          color: colors[i],
          emissive: colors[i].clone().multiplyScalar(0.35),
          roughness: 0.3
        });
        const segMesh = new THREE.Mesh(segGeo, segMat);
        segMesh.position.copy(segCenter);

        const up = new THREE.Vector3(0, 1, 0);
        const dir = segVec.clone().normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
        segMesh.quaternion.copy(quat);

        this.probeGroup.add(segMesh);
      }
    }

    // 4. 构建 3D 最不利探针高亮光环与球体 (同步 24 单元精准 HSL 色彩)
    const isCritical = minK <= tolSafetyFactor;
    const activeColor = colors[controlIdx] || (isCritical ? new THREE.Color(0xff0000) : new THREE.Color(0x00ff88));
    const ringGeo = new THREE.TorusGeometry(0.6, 0.08, 16, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: activeColor,
      wireframe: true
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.copy(probePos);
    this.probeGroup.add(ringMesh);

    // 指示高亮点
    const sphereGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: activeColor,
      emissive: activeColor.clone().multiplyScalar(0.5),
      roughness: 0.2
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    sphereMesh.position.copy(probePos);
    this.probeGroup.add(sphereMesh);

    return {
      colors,
      controlIdx,
      controlM,
      controlN,
      minK
    };
  }

  public dispose(): void {
    this.scene.remove(this.probeGroup);
  }
}
