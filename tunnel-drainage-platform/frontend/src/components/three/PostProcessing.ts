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

    // 2. 解算 24 单元最不利点的 3D 角度与物理坐标 (0 ~ 360 度，24 均分)
    const angleDegree = (controlIdx / 24) * 360 - 90; // 从顶部开始
    const polar = polarToCartesian(tunnelRadius * 1.05, angleDegree);
    const L = Math.abs(
      (snapshot?.input_parameter?.end_chainage ?? snapshot?.params?.end_chainage ?? snapshot?.end_chainage ?? 50) -
      (snapshot?.input_parameter?.start_chainage ?? snapshot?.params?.start_chainage ?? snapshot?.start_chainage ?? 0)
    );
    const zPos = zPosition - (controlIdx / 24) * L;
    const probePos = new THREE.Vector3(polar.x, polar.y, zPos);

    // 3. 构建 3D 高亮光环与锚线
    const ringGeo = new THREE.TorusGeometry(0.6, 0.08, 16, 32);
    const isCritical = minK <= tolSafetyFactor;
    const ringMat = new THREE.MeshBasicMaterial({
      color: isCritical ? 0xff0000 : 0x00ff88,
      wireframe: true
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.copy(probePos);
    this.probeGroup.add(ringMesh);

    // 指示红点/绿点
    const sphereGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: isCritical ? 0xff0000 : 0x00ff88,
      emissive: isCritical ? 0x990000 : 0x006633,
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
