// frontend/src/components/three/PostProcessing.ts
import * as THREE from 'three';

export type ForceDisplayMode = 'K' | 'M' | 'N' | 'COMBINED';

export interface SectionNodeGeometry {
  index: number;
  angleDeg: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

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
  public probeGroup: THREE.Group;       // 探针高亮、引线与指示标组
  public diagramGroup: THREE.Group;     // 弯矩/轴力/安全系数受力多边形组
  public elementColors: THREE.Color[];
  
  private kGroup: THREE.Group | null = null;
  private mGroup: THREE.Group | null = null;
  private nGroup: THREE.Group | null = null;

  private scene: THREE.Scene;
  private forceMode: ForceDisplayMode = 'K';
  private cachedNodes: SectionNodeGeometry[] = [];
  private cachedMechanics: MechanicsData = {};

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.probeGroup = new THREE.Group();
    this.diagramGroup = new THREE.Group();
    this.elementColors = new Array(24).fill(0).map(() => new THREE.Color(0x00aaff));
    
    this.scene.add(this.probeGroup);
    this.scene.add(this.diagramGroup);
  }

  /**
   * 1. 求解 C1 连续的马蹄形衬砌 24 单元中心坐标与单位外法向量
   * 基于标准三心圆+切线平滑连接极坐标参数化方程，消除 5 点钟与 7 点钟拱脚处的尖角刺畸变
   */
  public computeContinuousSectionNodes(
    tunnelRadius: number = 5.5,
    aspectRatio: number = 0.7,
    r2: number = 6.5,
    zPos: number = 0
  ): SectionNodeGeometry[] {
    const R1_base = 1.05 * tunnelRadius;
    const R2_base = 0.65 * tunnelRadius;
    const R3_base = 1.80 * tunnelRadius;

    const t = Math.max(0, r2 - tunnelRadius);
    const R1 = R1_base + t * 0.5; // 衬砌中心线半径
    const R2 = R2_base + t * 0.5;
    const R3 = R3_base + t * 0.5;

    const dx = R1_base - R2_base;
    const dy = Math.sqrt(Math.max(0, Math.pow(R3_base - R2_base, 2) - Math.pow(dx, 2)));

    const w = 2.1 * tunnelRadius;
    const h = w * aspectRatio;
    const H_side = Math.max(0.0, h - R1_base + dy - R3_base);
    const invertCenterY = -H_side + dy;

    let aLeft = Math.atan2(-dy, -dx);
    if (aLeft < 0) aLeft += Math.PI * 2;
    let aRight = Math.atan2(-dy, dx);
    if (aRight < 0) aRight += Math.PI * 2;

    const nodes: SectionNodeGeometry[] = [];

    for (let i = 0; i < 24; i++) {
      const angleDeg = 90 - (i / 24) * 360;
      let phi = (angleDeg * Math.PI) / 180;
      while (phi < 0) phi += Math.PI * 2;
      while (phi >= Math.PI * 2) phi -= Math.PI * 2;

      let px = 0;
      let py = 0;
      let nx = Math.cos(phi);
      let ny = Math.sin(phi);

      if (phi >= 0 && phi <= Math.PI) {
        // 拱顶大圆弧段 (0 ~ 180°)
        px = R1 * Math.cos(phi);
        py = R1 * Math.sin(phi);
        nx = Math.cos(phi);
        ny = Math.sin(phi);
      } else if (phi > Math.PI && phi < aLeft) {
        // 左边墙 / 圆弧段
        px = -dx + R2 * Math.cos(phi);
        py = -H_side + R2 * Math.sin(phi);
        nx = Math.cos(phi);
        ny = Math.sin(phi);
      } else if (phi >= aLeft && phi <= aRight) {
        // 仰拱圆弧段
        px = R3 * Math.cos(phi);
        py = invertCenterY + R3 * Math.sin(phi);
        nx = Math.cos(phi);
        ny = Math.sin(phi);
      } else {
        // 右边墙 / 圆弧段
        px = dx + R2 * Math.cos(phi);
        py = -H_side + R2 * Math.sin(phi);
        nx = Math.cos(phi);
        ny = Math.sin(phi);
      }

      const pos = new THREE.Vector3(px, py, zPos);
      const norm = new THREE.Vector3(nx, ny, 0).normalize();

      nodes.push({
        index: i,
        angleDeg,
        position: pos,
        normal: norm
      });
    }

    this.cachedNodes = nodes;
    return nodes;
  }

  /**
   * 2. 将 24 单元的 K_list 转化为 RGB 色阶数组
   */
  public generateColorSpectrum(K_list: number[], tolSafetyFactor: number = 2.0): THREE.Color[] {
    const colors: THREE.Color[] = [];
    const count = K_list && K_list.length > 0 ? K_list.length : 24;

    for (let i = 0; i < count; i++) {
      const k = K_list ? K_list[i] : 5.0;
      const color = new THREE.Color();

      if (k <= tolSafetyFactor) {
        const ratio = Math.max(0, (k - 1.0) / (tolSafetyFactor - 1.0 || 1.0));
        color.setHSL(0.0 + ratio * 0.08, 1.0, 0.5); 
      } else {
        const ratio = Math.min(1.0, (k - tolSafetyFactor) / 5.0);
        color.setHSL(0.25 + ratio * 0.35, 0.85, 0.5);
      }
      colors.push(color);
    }

    this.elementColors = colors;
    return colors;
  }

  /**
   * 3. 构建安全系数 K 色彩云图管道
   */
  public buildSafetyFactorRing(
    nodes: SectionNodeGeometry[],
    colors: THREE.Color[]
  ): THREE.Group {
    const group = new THREE.Group();
    const count = nodes.length;

    for (let i = 0; i < count; i++) {
      const n1 = nodes[i];
      const n2 = nodes[(i + 1) % count];

      const segVec = n2.position.clone().sub(n1.position);
      const segLen = segVec.length();

      if (segLen > 0.001) {
        const segCenter = n1.position.clone().add(n2.position).multiplyScalar(0.5);
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
        segMesh.userData = { elementIdx: i };

        group.add(segMesh);
      }
    }

    return group;
  }

  /**
   * 4. 构建弯矩图 M (Bending Moment Polygon Mesh & Outline)
   * 内侧受拉 (M > 0)：向内偏移；外侧受拉 (M < 0)：向外偏移
   * 顶点公式: Q_i^M = P_i - s_M * M_i * n_i
   */
  public buildMomentDiagramMesh(
    nodes: SectionNodeGeometry[],
    M_list: number[],
    scaleMFactor: number = 0.05
  ): THREE.Group {
    const group = new THREE.Group();
    const count = nodes.length;

    let maxM = 0;
    for (let i = 0; i < count; i++) {
      const val = Math.abs(M_list[i] || 0);
      if (val > maxM) maxM = val;
    }
    const sM = maxM > 0 ? Math.min(scaleMFactor, 1.5 / maxM) : scaleMFactor;

    const baselinePoints: THREE.Vector3[] = [];
    const outerPoints: THREE.Vector3[] = [];
    const quadPositions: number[] = [];
    const quadColors: number[] = [];

    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      const M_val = M_list[i] || 0;
      const offsetVec = n.normal.clone().multiplyScalar(-sM * M_val);
      const Q = n.position.clone().add(offsetVec);

      baselinePoints.push(n.position.clone());
      outerPoints.push(Q);
    }

    baselinePoints.push(baselinePoints[0].clone());
    outerPoints.push(outerPoints[0].clone());

    // 4.1 衬砌基线 (白色虚线)
    const baselineGeo = new THREE.BufferGeometry().setFromPoints(baselinePoints);
    const baselineMat = new THREE.LineDashedMaterial({
      color: 0xffffff,
      dashSize: 0.2,
      gapSize: 0.1,
      opacity: 0.6,
      transparent: true
    });
    const baselineLine = new THREE.Line(baselineGeo, baselineMat);
    baselineLine.computeLineDistances();
    group.add(baselineLine);

    // 4.2 弯矩外包络轮廓线 (亮红/橙色实线)
    const outerGeo = new THREE.BufferGeometry().setFromPoints(outerPoints);
    const outerMat = new THREE.LineBasicMaterial({ color: 0xff5533, linewidth: 2 });
    const outerLine = new THREE.Line(outerGeo, outerMat);
    group.add(outerLine);

    // 4.3 弯矩填充多边形 (Ribbon Mesh)
    for (let i = 0; i < count; i++) {
      const P1 = baselinePoints[i];
      const Q1 = outerPoints[i];
      const P2 = baselinePoints[i + 1];
      const Q2 = outerPoints[i + 1];

      const M1 = M_list[i] || 0;
      const M2 = M_list[(i + 1) % count] || 0;

      quadPositions.push(
        P1.x, P1.y, P1.z,  Q1.x, Q1.y, Q1.z,  Q2.x, Q2.y, Q2.z,
        P1.x, P1.y, P1.z,  Q2.x, Q2.y, Q2.z,  P2.x, P2.y, P2.z
      );

      const c1 = M1 > 0 ? new THREE.Color(0xff4433) : new THREE.Color(0x00aaff);
      const c2 = M2 > 0 ? new THREE.Color(0xff4433) : new THREE.Color(0x00aaff);

      quadColors.push(
        c1.r, c1.g, c1.b,  c1.r, c1.g, c1.b,  c2.r, c2.g, c2.b,
        c1.r, c1.g, c1.b,  c2.r, c2.g, c2.b,  c2.r, c2.g, c2.b
      );
    }

    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(quadPositions, 3));
    ribbonGeo.setAttribute('color', new THREE.Float32BufferAttribute(quadColors, 3));
    ribbonGeo.computeVertexNormals();

    const ribbonMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55
    });
    const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    group.add(ribbonMesh);

    return group;
  }

  /**
   * 5. 构建轴力图 N (Axial Force Band & Radial Vector Spikes)
   * 顶点公式: Q_i^N = P_i + s_N * |N_i| * n_i
   */
  public buildAxialDiagramMesh(
    nodes: SectionNodeGeometry[],
    N_list: number[],
    scaleNFactor: number = 0.002
  ): THREE.Group {
    const group = new THREE.Group();
    const count = nodes.length;

    let maxN = 0;
    for (let i = 0; i < count; i++) {
      const val = Math.abs(N_list[i] || 0);
      if (val > maxN) maxN = val;
    }
    const sN = maxN > 0 ? Math.min(scaleNFactor, 1.2 / maxN) : scaleNFactor;

    const baselinePoints: THREE.Vector3[] = [];
    const outerPoints: THREE.Vector3[] = [];
    const quadPositions: number[] = [];
    const quadColors: number[] = [];

    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      const N_abs = Math.abs(N_list[i] || 0);
      const offsetVec = n.normal.clone().multiplyScalar(sN * N_abs);
      const Q = n.position.clone().add(offsetVec);

      baselinePoints.push(n.position.clone());
      outerPoints.push(Q);

      // 法向矢量针 (Radial Vector Spikes)
      if (N_abs > 0) {
        const height = Math.max(0.12, sN * N_abs);
        const cylGeo = new THREE.CylinderGeometry(0.04, 0.04, height, 8);
        const intensity = maxN > 0 ? N_abs / maxN : 0.5;
        const cylColor = new THREE.Color().setHSL(0.55 - intensity * 0.35, 0.9, 0.5);

        const cylMat = new THREE.MeshStandardMaterial({
          color: cylColor,
          roughness: 0.3
        });
        const cylMesh = new THREE.Mesh(cylGeo, cylMat);
        const midPoint = n.position.clone().add(Q).multiplyScalar(0.5);
        cylMesh.position.copy(midPoint);

        const up = new THREE.Vector3(0, 1, 0);
        const dir = n.normal.clone();
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
        cylMesh.quaternion.copy(quat);

        group.add(cylMesh);
      }
    }

    baselinePoints.push(baselinePoints[0].clone());
    outerPoints.push(outerPoints[0].clone());

    // 轴向法向扩展带状 Mesh
    for (let i = 0; i < count; i++) {
      const P1 = baselinePoints[i];
      const Q1 = outerPoints[i];
      const P2 = baselinePoints[i + 1];
      const Q2 = outerPoints[i + 1];

      const N1_abs = Math.abs(N_list[i] || 0);
      const N2_abs = Math.abs(N_list[(i + 1) % count] || 0);

      quadPositions.push(
        P1.x, P1.y, P1.z,  Q1.x, Q1.y, Q1.z,  Q2.x, Q2.y, Q2.z,
        P1.x, P1.y, P1.z,  Q2.x, Q2.y, Q2.z,  P2.x, P2.y, P2.z
      );

      const int1 = maxN > 0 ? N1_abs / maxN : 0.5;
      const int2 = maxN > 0 ? N2_abs / maxN : 0.5;
      const c1 = new THREE.Color().setHSL(0.55 - int1 * 0.35, 0.85, 0.5);
      const c2 = new THREE.Color().setHSL(0.55 - int2 * 0.35, 0.85, 0.5);

      quadColors.push(
        c1.r, c1.g, c1.b,  c1.r, c1.g, c1.b,  c2.r, c2.g, c2.b,
        c1.r, c1.g, c1.b,  c2.r, c2.g, c2.b,  c2.r, c2.g, c2.b
      );
    }

    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(quadPositions, 3));
    ribbonGeo.setAttribute('color', new THREE.Float32BufferAttribute(quadColors, 3));
    ribbonGeo.computeVertexNormals();

    const ribbonMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5
    });
    const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    group.add(ribbonMesh);

    return group;
  }

  /**
   * 6. 受力模式动态切换控制
   */
  public setForceMode(mode: ForceDisplayMode): void {
    this.forceMode = mode;
    this.updateVisibilityByMode();
  }

  public getForceMode(): ForceDisplayMode {
    return this.forceMode;
  }

  private updateVisibilityByMode(): void {
    if (this.kGroup) this.kGroup.visible = this.forceMode === 'K' || this.forceMode === 'COMBINED';
    if (this.mGroup) this.mGroup.visible = this.forceMode === 'M' || this.forceMode === 'COMBINED';
    if (this.nGroup) this.nGroup.visible = this.forceMode === 'N' || this.forceMode === 'COMBINED';
  }

  /**
   * 7. 基于快照更新受力表达与最不利探针挂载
   */
  public updateFromSnapshot(
    snapshot: any,
    tunnelRadius: number = 5.5,
    zPosition: number = 0,
    tolSafetyFactor: number = 2.0,
    viewMode: 'original' | 'critical' = 'original'
  ): {
    colors: THREE.Color[];
    controlIdx: number;
    controlM: number;
    controlN: number;
    minK: number;
    nodes: SectionNodeGeometry[];
    chainageText: string;
    ranges: {
      minK: number;
      maxK: number;
      minM: number;
      maxM: number;
      minN: number;
      maxN: number;
    };
  } {
    // 7.1 清理旧图层组
    this.disposeGroup(this.probeGroup);
    this.disposeGroup(this.diagramGroup);

    // 1. 严格依据 viewMode 选取状态字段
    const isCriticalMode = viewMode === 'critical' && (snapshot?.results?.critical_state || snapshot?.critical_state);
    const state = isCriticalMode 
      ? (snapshot?.results?.critical_state ?? snapshot?.critical_state) 
      : (snapshot?.results?.original_state ?? snapshot?.original_state ?? {});
    const echart = snapshot?.results?.echart_data ?? snapshot?.echart_data ?? {};
    const liningRes = isCriticalMode ? (echart.lining_res_critical ?? {}) : (echart.lining_res_original ?? {});

    // 2. 100 节点到 24 单元重采样与索引映射
    const rawIdx = state.control_idx ?? state.final_control_idx ?? 0;
    const rawKList: number[] = liningRes.K_list ?? state.K_list ?? echart.K_list ?? new Array(100).fill(3.5);
    const rawMList: number[] = liningRes.M_elem ?? liningRes.M_list ?? state.M_list ?? state.M_elem ?? echart.M_elem ?? new Array(100).fill(0);
    const rawNList: number[] = liningRes.N_elem ?? liningRes.N_list ?? state.N_list ?? state.N_elem ?? echart.N_elem ?? new Array(100).fill(0);

    const K_24: number[] = [];
    const M_24: number[] = [];
    const N_24: number[] = [];

    if (rawKList.length >= 24) {
      for (let i = 0; i < 24; i++) {
        const start = Math.floor((i / 24) * rawKList.length);
        const end = Math.floor(((i + 1) / 24) * rawKList.length);
        const chunkK = rawKList.slice(start, Math.max(start + 1, end));
        const chunkM = rawMList.slice(start, Math.max(start + 1, end));
        const chunkN = rawNList.slice(start, Math.max(start + 1, end));

        K_24.push(Math.min(...chunkK));
        M_24.push(chunkM[0] || 0);
        N_24.push(chunkN[0] || 0);
      }
    } else {
      for (let i = 0; i < 24; i++) {
        K_24.push(rawKList[i % rawKList.length] ?? 3.5);
        M_24.push(rawMList[i % rawMList.length] ?? 0);
        N_24.push(rawNList[i % rawNList.length] ?? 0);
      }
    }

    // 精准映射 24 单元索引
    const controlIdx24 = rawKList.length > 0
      ? Math.min(23, Math.floor((rawIdx / rawKList.length) * 24))
      : 0;
    const minK = K_24[controlIdx24] ?? (state.final_safety_factor ?? state.safety_factor ?? 2.5);

    // 3. 构建精准控制里程与字符串解算
    const startChain = snapshot?.input_parameter?.start_chainage ?? snapshot?.params?.start_chainage ?? snapshot?.start_chainage ?? 0;
    const endChain = snapshot?.input_parameter?.end_chainage ?? snapshot?.params?.end_chainage ?? snapshot?.end_chainage ?? 50;

    const controlChainageOffset = snapshot?.critical_state?.control_chainage
      ?? snapshot?.original_state?.control_chainage
      ?? snapshot?.control_chainage
      ?? (startChain + (endChain - startChain) / 2);

    const km = Math.floor(controlChainageOffset / 1000);
    const m = controlChainageOffset % 1000;
    const chainageText = `DK${km}+${m.toFixed(1).padStart(5, '0')}`;

    this.cachedMechanics = {
      K_list: K_24,
      M_list: M_24,
      N_list: N_24,
      control_idx: controlIdx24,
      control_M: state.control_M ?? state.final_control_M ?? 0,
      control_N: state.control_N ?? state.final_control_N ?? 0,
      safety_factor: minK
    };

    const aspect_ratio = snapshot?.input_parameter?.aspect_ratio ?? snapshot?.params?.aspect_ratio ?? 0.7;
    const r2 = snapshot?.input_parameter?.r_p ?? snapshot?.params?.r_p ?? snapshot?.input_parameter?.r2 ?? snapshot?.params?.r2 ?? (tunnelRadius * 1.18);

    const zPos = -controlChainageOffset;

    const tunnelType = snapshot?.input_parameter?.tunnel_type ?? snapshot?.params?.tunnel_type ?? snapshot?.tunnel_type ?? 'single';
    const D_spacing = snapshot?.input_parameter?.D_spacing ?? snapshot?.params?.D_spacing ?? snapshot?.D_spacing ?? 30.0;
    const isDouble = tunnelType === 'double';
    const xOffsets = isDouble ? [-D_spacing / 2, D_spacing / 2] : [0];

    const baseNodes = this.computeContinuousSectionNodes(tunnelRadius, aspect_ratio, r2, zPos);
    const colors = this.generateColorSpectrum(K_24, tolSafetyFactor);

    this.kGroup = new THREE.Group();
    this.mGroup = new THREE.Group();
    this.nGroup = new THREE.Group();

    for (const xOff of xOffsets) {
      const nodes = baseNodes.map(n => ({
        ...n,
        position: n.position.clone().add(new THREE.Vector3(xOff, 0, 0))
      }));

      const subKGroup = this.buildSafetyFactorRing(nodes, colors);
      const subMGroup = this.buildMomentDiagramMesh(nodes, M_24);
      const subNGroup = this.buildAxialDiagramMesh(nodes, N_24);

      this.kGroup.add(subKGroup);
      this.mGroup.add(subMGroup);
      this.nGroup.add(subNGroup);

      // 构建 3D 最不利探针
      const controlNode = nodes[controlIdx24] || nodes[0];
      const P_control = controlNode.position.clone();
      const norm_control = controlNode.normal.clone();

      const leaderOffset = 1.8;
      const probePos = P_control.clone().add(norm_control.clone().multiplyScalar(leaderOffset));

      const isCritical = minK <= tolSafetyFactor;
      const activeColor = colors[controlIdx24] || (isCritical ? new THREE.Color(0xff0000) : new THREE.Color(0x00ff88));

      const leaderGeo = new THREE.BufferGeometry().setFromPoints([P_control, probePos]);
      const leaderMat = new THREE.LineDashedMaterial({
        color: activeColor,
        dashSize: 0.2,
        gapSize: 0.1,
        linewidth: 2
      });
      const leaderLine = new THREE.Line(leaderGeo, leaderMat);
      leaderLine.computeLineDistances();
      this.probeGroup.add(leaderLine);

      const baseDotGeo = new THREE.SphereGeometry(0.12, 12, 12);
      const baseDotMat = new THREE.MeshBasicMaterial({ color: activeColor });
      const baseDot = new THREE.Mesh(baseDotGeo, baseDotMat);
      baseDot.position.copy(P_control);
      this.probeGroup.add(baseDot);

      const ringGeo = new THREE.TorusGeometry(0.6, 0.08, 16, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: activeColor,
        wireframe: true
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(probePos);

      const defaultUp = new THREE.Vector3(0, 0, 1);
      ringMesh.quaternion.setFromUnitVectors(defaultUp, norm_control);
      this.probeGroup.add(ringMesh);

      const sphereGeo = new THREE.SphereGeometry(0.25, 16, 16);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: activeColor,
        emissive: activeColor.clone().multiplyScalar(0.5),
        roughness: 0.2
      });
      const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
      sphereMesh.position.copy(probePos);
      this.probeGroup.add(sphereMesh);
    }

    this.diagramGroup.add(this.kGroup);
    this.diagramGroup.add(this.mGroup);
    this.diagramGroup.add(this.nGroup);

    this.updateVisibilityByMode();

    const rawMVal = state.control_M ?? state.final_control_M ?? (M_24[controlIdx24] ? M_24[controlIdx24] / 1000.0 : 0);
    const rawNVal = state.control_N ?? state.final_control_N ?? (N_24[controlIdx24] ? N_24[controlIdx24] / 1000.0 : 0);

    const minKVal = K_24.length > 0 ? Math.min(...K_24) : minK;
    const maxKVal = K_24.length > 0 ? Math.max(...K_24) : minK;

    const M_converted = M_24.map(v => Math.abs(v) > 5000 ? v / 1000 : v);
    const minMVal = M_converted.length > 0 ? Math.min(...M_converted) : 0;
    const maxMVal = M_converted.length > 0 ? Math.max(...M_converted) : 0;

    const N_converted = N_24.map(v => Math.abs(v) > 5000 ? v / 1000 : v);
    const minNVal = N_converted.length > 0 ? Math.min(...N_converted) : 0;
    const maxNVal = N_converted.length > 0 ? Math.max(...N_converted) : 0;

    return {
      colors,
      controlIdx: controlIdx24,
      controlM: rawMVal,
      controlN: rawNVal,
      minK,
      nodes: baseNodes,
      chainageText,
      ranges: {
        minK: minKVal,
        maxK: maxKVal,
        minM: minMVal,
        maxM: maxMVal,
        minN: minNVal,
        maxN: maxNVal
      }
    };
  }

  private disposeGroup(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Group) {
        this.disposeGroup(child);
      } else if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    }
  }

  public dispose(): void {
    this.disposeGroup(this.probeGroup);
    this.disposeGroup(this.diagramGroup);
    this.scene.remove(this.probeGroup);
    this.scene.remove(this.diagramGroup);
  }
}
