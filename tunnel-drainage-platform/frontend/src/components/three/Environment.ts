// tunnel-drainage-platform/frontend/src/components/three/Environment.ts
import * as THREE from 'three';

/**
 * 水文环境建模模块 - 3D水位面、动水流线与地下水头可视化
 * 
 * 字段映射规范（遵循阶段4-snapshot特点提取.md）：
 * - waterHead / final_waterHead: 来自 original_state / critical_state，驱动水位面Y轴高度
 * - c (埋深): 来自 input_parameter，定义地面基准线与隧道相对高程
 * - q / Q (渗漏量): 来自 original_state / critical_state，控制粒子动画速率
 * - Hq: 来自 echart_data，作为水位计算参考基准
 * - grades (围岩级别): 来自 input_parameter，影响渗透系数可视化
 */

export interface WaterEnvironmentConfig {
  /** 分区起点里程 (m)，对应 start_chainage */
  startChainage: number;
  /** 分区终点里程 (m)，对应 end_chainage */
  endChainage: number;
  /** 隧道等效内半径 (m)，对应 r，用于确定场景边界 */
  tunnelRadius: number;
  /** 隧道埋深 (m)，对应 c，定义地面高程 */
  burialDepth: number;
  /** 双洞间距 (m)，对应 D_spacing，双洞模式下扩展场景宽度 */
  dSpacing?: number;
  /** 隧道类型，对应 tunnel_type */
  tunnelType: 'single' | 'double';
}

export interface WaterStateData {
  /** 当前地下水头高度 (m)，对应 waterHead 或 final_waterHead */
  waterHead: number;
  /** 总渗漏量 (m³/d)，对应 Q */
  totalLeakage: number;
  /** 分段渗漏量 (m³/(d·m))，对应 q */
  unitLeakage: number;
  /** 围岩级别 (1-6)，对应 grades */
  rockGrade: number;
  /** 拱顶竖向围岩压力计算高度 (m)，对应 Hq */
  Hq?: number;
}

export class Environment {
  public waterPlane!: THREE.Mesh;
  public groundPlane!: THREE.Mesh;
  public waterParticles!: THREE.Points;
  public flowLines!: THREE.LineSegments;
  public depthIndicator!: THREE.Group;
  
  private scene: THREE.Scene;
  private config: WaterEnvironmentConfig;
  private currentState: WaterStateData;
  
  // 动画相关
  private particleUniforms!: { [key: string]: THREE.IUniform };
  private flowUniforms!: { [key: string]: THREE.IUniform };
  private clock: THREE.Clock;
  private isAnimated: boolean = false; // 粒子流动与水面波纹动画使能标志 (默认冻结)
  
  // 着色器代码
  private readonly waterVertexShader = `
    #include <common>
    #include <clipping_planes_pars_vertex>
    uniform float uTime;
    uniform float uWaterHead;
    uniform float uSpeed;
    
    varying vec2 vUv;
    varying float vElevation;
    
    void main() {
      vUv = uv;
      
      // 基础位置
      vec3 pos = position;
      
      // 基于水头的垂直定位
      pos.y = uWaterHead;
      
      // 叠加动态波纹
      float wave1 = sin(pos.x * 2.0 + uTime * uSpeed) * 0.15;
      float wave2 = sin(pos.z * 1.5 + uTime * uSpeed * 0.8) * 0.1;
      float wave3 = sin((pos.x + pos.z) * 1.0 + uTime * uSpeed * 1.2) * 0.08;
      
      pos.y += wave1 + wave2 + wave3;
      vElevation = pos.y - uWaterHead;
      
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      #include <clipping_planes_vertex>
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
  
  private readonly waterFragmentShader = `
    #include <common>
    #include <clipping_planes_pars_fragment>
    uniform float uTime;
    uniform float uOpacity;
    uniform vec3 uColorDeep;
    uniform vec3 uColorShallow;
    
    varying vec2 vUv;
    varying float vElevation;
    
    void main() {
      #include <clipping_planes_fragment>
      // 基于高度的颜色混合
      float mixFactor = smoothstep(-0.3, 0.3, vElevation);
      vec3 color = mix(uColorDeep, uColorShallow, mixFactor);
      
      // 添加水面反光效果
      float specular = pow(max(0.0, sin(vUv.x * 20.0 + uTime) * sin(vUv.y * 20.0 + uTime)), 20.0);
      color += vec3(specular * 0.3);
      
      gl_FragColor = vec4(color, uOpacity);
    }
  `;
  
  private readonly particleVertexShader = `
    #include <common>
    #include <clipping_planes_pars_vertex>
    uniform float uTime;
    uniform float uSpeed;
    uniform float uWaterHead;
    
    attribute float aSize;
    attribute float aPhase;
    attribute vec3 aVelocity;
    
    varying float vAlpha;
    
    void main() {
      // 粒子随时间流动
      vec3 pos = position;
      float timeOffset = uTime * uSpeed + aPhase;
      
      // 垂直方向波动
      pos.y = uWaterHead - mod(timeOffset * 2.0, 5.0); // 向下流动
      
      // 水平扩散
      pos.x += sin(timeOffset + aPhase * 2.0) * 0.5;
      pos.z += cos(timeOffset + aPhase * 3.0) * 0.3;
      
      // 透明度随深度衰减
      vAlpha = smoothstep(uWaterHead - 5.0, uWaterHead, pos.y) * 
               smoothstep(uWaterHead - 10.0, uWaterHead - 5.0, pos.y);
      
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      #include <clipping_planes_vertex>
      gl_PointSize = aSize * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
  
  private readonly particleFragmentShader = `
    #include <common>
    #include <clipping_planes_pars_fragment>
    varying float vAlpha;
    
    void main() {
      #include <clipping_planes_fragment>
      // 圆形粒子
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = length(coord);
      if (dist > 0.5) discard;
      
      // 径向渐变
      float glow = 1.0 - smoothstep(0.0, 0.5, dist);
      vec3 color = vec3(0.3, 0.6, 1.0) * glow;
      
      gl_FragColor = vec4(color, vAlpha * glow);
    }
  `;

  constructor(scene: THREE.Scene, config: WaterEnvironmentConfig) {
    this.scene = scene;
    this.config = config;
    this.clock = new THREE.Clock();
    
    // 初始化默认状态
    this.currentState = {
      waterHead: config.burialDepth * 0.6, // 默认水位为埋深的60%
      totalLeakage: 0,
      unitLeakage: 0,
      rockGrade: 4,
      Hq: config.burialDepth * 0.5
    };
    
    this.initWaterPlane();
    this.initGroundPlane();
    this.initWaterParticles();
    this.initFlowLines();
    this.initDepthIndicator();
  }

  /**
   * 获取所有水文环境 3D 网格对象 (用于剖切与显隐控制)
   */
  public getMeshes(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];
    if (this.waterPlane) meshes.push(this.waterPlane);
    if (this.groundPlane) meshes.push(this.groundPlane);
    if (this.waterParticles) meshes.push(this.waterParticles);
    if (this.flowLines) meshes.push(this.flowLines);
    return meshes;
  }

  /**
   * 初始化动态水位面
   * 基于 waterHead / final_waterHead 驱动Y轴高度
   */
  private initWaterPlane(): void {
    const length = this.config.endChainage - this.config.startChainage;
    const width = this.config.tunnelType === 'double' 
      ? (this.config.dSpacing || 0) + this.config.tunnelRadius * 6
      : this.config.tunnelRadius * 6;
    
    const geometry = new THREE.PlaneGeometry(width, length, 64, 64);
    
    this.particleUniforms = {
      uTime: { value: 0 },
      uSpeed: { value: 1.0 },
      uWaterHead: { value: this.currentState.waterHead },
      uOpacity: { value: 0.25 }, // 全息网格水面透明度设为 0.25
      uColorDeep: { value: new THREE.Color(0x004488) },
      uColorShallow: { value: new THREE.Color(0x00ffff) }
    };
    
    const material = new THREE.ShaderMaterial({
      vertexShader: this.waterVertexShader,
      fragmentShader: this.waterFragmentShader,
      uniforms: this.particleUniforms,
      transparent: true,
      clipping: true,
      side: THREE.DoubleSide
    });
    
    this.waterPlane = new THREE.Mesh(geometry, material);
    this.waterPlane.rotation.x = -Math.PI / 2;
    this.waterPlane.position.z = -this.config.startChainage - length / 2;
    
    this.scene.add(this.waterPlane);
  }

  /**
   * 解算对数景深高程压缩 (Equation 2.3)
   * Y_render = Y_crown + h0 * ln(1.0 + (Y_real - Y_crown) / h0)
   */
  public getCompressedGroundY(realDepth: number, tunnelCrownY: number = this.config.tunnelRadius * 1.4): number {
    const h0 = 15.0; // 基准缩放系数 15.0m
    if (realDepth <= 30.0) {
      return tunnelCrownY + realDepth;
    }
    return tunnelCrownY + h0 * Math.log(1.0 + realDepth / h0);
  }

  /**
   * 初始化地面基准面 (结合对数景深高程压缩)
   */
  private initGroundPlane(): void {
    const length = Math.abs(this.config.endChainage - this.config.startChainage);
    const width = this.config.tunnelType === 'double'
      ? (this.config.dSpacing || 0) + this.config.tunnelRadius * 10
      : this.config.tunnelRadius * 10;
    
    const geometry = new THREE.PlaneGeometry(width, length);
    
    // 创建全息质感地表纹理
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, '#1e293b');
    gradient.addColorStop(0.5, '#334155');
    gradient.addColorStop(1, '#1e293b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    
    // 全息网格线条
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i, 512);
      ctx.moveTo(0, i); ctx.lineTo(512, i);
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(width / 10, length / 10);
    
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.6,
      metalness: 0.3,
      transparent: true,
      opacity: 0.85
    });
    
    this.groundPlane = new THREE.Mesh(geometry, material);
    this.groundPlane.rotation.x = -Math.PI / 2;
    
    const tunnelCrownY = this.config.tunnelRadius * 1.4;
    this.groundPlane.position.y = this.getCompressedGroundY(this.config.burialDepth, tunnelCrownY);
    this.groundPlane.position.z = -this.config.startChainage - length / 2;
    
    this.scene.add(this.groundPlane);
  }

  /**
   * 初始化水流粒子系统
   * 基于 Q (totalLeakage) 控制动画速率
   */
  private initWaterParticles(): void {
    const particleCount = 2000;
    const geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const phases = new Float32Array(particleCount);
    const velocities = new Float32Array(particleCount * 3);
    
    const length = Math.abs(this.config.endChainage - this.config.startChainage);
    const isDouble = this.config.tunnelType === 'double';
    const xOffsets = isDouble ? [-(this.config.dSpacing || 30) / 2, (this.config.dSpacing || 30) / 2] : [0];
    
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const rDist = this.config.tunnelRadius * 1.5 + Math.random() * this.config.tunnelRadius * 3.5;
      const xCenter = xOffsets[i % xOffsets.length];
      
      positions[i * 3] = xCenter + rDist * Math.cos(theta);
      positions[i * 3 + 1] = rDist * Math.sin(theta);
      positions[i * 3 + 2] = -this.config.startChainage - Math.random() * length;
      
      sizes[i] = Math.random() * 3 + 1;
      phases[i] = Math.random() * Math.PI * 2;
      
      const speed = Math.random() * 1.2 + 0.4;
      velocities[i * 3] = -Math.cos(theta) * speed;
      velocities[i * 3 + 1] = -Math.sin(theta) * speed;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
    
    this.flowUniforms = {
      uTime: { value: 0 },
      uSpeed: { value: this.calculateFlowSpeed(this.currentState.totalLeakage) },
      uWaterHead: { value: this.currentState.waterHead }
    };
    
    const material = new THREE.ShaderMaterial({
      vertexShader: this.particleVertexShader,
      fragmentShader: this.particleFragmentShader,
      uniforms: this.flowUniforms,
      transparent: true,
      clipping: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    
    this.waterParticles = new THREE.Points(geometry, material);
    this.scene.add(this.waterParticles);
  }

  /**
   * 计算流速系数
   * 基于总渗漏量 Q 动态调整：Q越大，流速越快
   */
  private calculateFlowSpeed(leakageQ: number): number {
    const baseSpeed = 0.5;
    const speedFactor = Math.min(leakageQ / 100, 5.0);
    return baseSpeed + speedFactor;
  }

  /**
   * 初始化基于达西渗流势场的收敛流线 (Convergent Streamlines)
   */
  private initFlowLines(): void {
    const lineCount = 36;
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    
    const length = Math.abs(this.config.endChainage - this.config.startChainage);
    const isDouble = this.config.tunnelType === 'double';
    const xOffsets = isDouble ? [-(this.config.dSpacing || 30) / 2, (this.config.dSpacing || 30) / 2] : [0];
    
    for (let i = 0; i < lineCount; i++) {
      const xCenter = xOffsets[i % xOffsets.length];
      const angle = (i / (lineCount - 1)) * Math.PI; // 0 到 Math.PI，对称覆盖拱顶与双侧墙
      const startX = xCenter + Math.cos(angle) * (this.config.tunnelRadius * 4.0);
      const startY = this.currentState.waterHead;
      const targetX = xCenter + Math.cos(angle) * (this.config.tunnelRadius + 0.1);
      const targetY = Math.sin(angle) * (this.config.tunnelRadius + 0.1);
      const zSegment = -this.config.startChainage - (i / lineCount) * length;
      
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(startX, startY, zSegment),
        new THREE.Vector3((startX + targetX) * 0.5, (startY + targetY) * 0.5 + 2.0, zSegment),
        new THREE.Vector3(targetX, targetY, zSegment)
      );
      
      const curvePoints = curve.getPoints(20);
      for (let j = 0; j < curvePoints.length - 1; j++) {
        const pt1 = curvePoints[j];
        const pt2 = curvePoints[j + 1];
        positions.push(pt1.x, pt1.y, pt1.z, pt2.x, pt2.y, pt2.z);
        
        const t1 = j / curvePoints.length;
        const t2 = (j + 1) / curvePoints.length;
        
        // 渐变色彩由深蓝到亮青
        colors.push(0.0, 0.2 + 0.75 * t1, 0.6 + 0.4 * t1);
        colors.push(0.0, 0.2 + 0.75 * t2, 0.6 + 0.4 * t2);
      }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    
    this.flowLines = new THREE.LineSegments(geometry, material);
    this.scene.add(this.flowLines);
  }

  /**
   * 初始化埋深指示器 (含深埋折断线与空间压缩指示)
   */
  private initDepthIndicator(): void {
    this.depthIndicator = new THREE.Group();
    
    const tunnelCrownY = this.config.tunnelRadius * 1.4;
    const groundY = this.getCompressedGroundY(this.config.burialDepth, tunnelCrownY);
    const isCompressed = this.config.burialDepth > 30.0;
    
    const points = [
      new THREE.Vector3(this.config.tunnelRadius * 2, tunnelCrownY, -this.config.startChainage),
      new THREE.Vector3(this.config.tunnelRadius * 2, groundY, -this.config.startChainage)
    ];
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.5,
      gapSize: 0.3,
      opacity: 0.8,
      transparent: true
    });
    
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    this.depthIndicator.add(line);
    
    // 埋深数值标签
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(8, 8, 368, 64);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 368, 64);

    ctx.font = 'bold 22px "Segoe UI", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const depthText = isCompressed
      ? `埋深 c = ${this.config.burialDepth.toFixed(1)}m (对数景深压缩)`
      : `埋深 c = ${this.config.burialDepth.toFixed(1)}m`;
    ctx.fillText(depthText, 192, 40);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(9.0, 2.0, 1);
    sprite.position.set(this.config.tunnelRadius * 2, (tunnelCrownY + groundY) / 2, -this.config.startChainage);
    this.depthIndicator.add(sprite);
    
    this.scene.add(this.depthIndicator);
  }

  /**
   * 基于快照数据动态更新水文随动与水位平面
   */
  public updateFromSnapshot(snapshot: any): void {
    if (!snapshot) return;
    const state = snapshot.critical_state ?? snapshot.original_state ?? {};
    const params = snapshot.input_parameter ?? snapshot.params ?? {};

    const waterHead = state.final_waterHead ?? state.waterHead ?? params.H ?? params.h ?? (this.config.burialDepth * 0.6);
    const leakageQ = state.Q ?? state.q ?? 0;
    const burialDepth = params.h_1 ?? params.c ?? params.depth ?? this.config.burialDepth;

    this.currentState.waterHead = waterHead;
    this.currentState.totalLeakage = leakageQ;
    this.config.burialDepth = burialDepth;

    // 更新 Shader Uniforms
    if (this.particleUniforms && this.particleUniforms.uWaterHead) {
      this.particleUniforms.uWaterHead.value = waterHead;
    }
    if (this.flowUniforms) {
      if (this.flowUniforms.uWaterHead) this.flowUniforms.uWaterHead.value = waterHead;
      if (this.flowUniforms.uSpeed) this.flowUniforms.uSpeed.value = this.calculateFlowSpeed(leakageQ);
    }

    // 更新水位面高度与地面高度 (包含对数景深压缩)
    if (this.waterPlane) {
      this.waterPlane.position.y = waterHead;
    }
    if (this.groundPlane) {
      const tunnelCrownY = this.config.tunnelRadius * 1.4;
      this.groundPlane.position.y = this.getCompressedGroundY(burialDepth, tunnelCrownY);
    }
  }

  /**
   * 设置动态流速开关
   */
  public setAnimationEnabled(enabled: boolean): void {
    this.isAnimated = enabled;
  }

  /**
   * 动画帧驱动，水流波纹与粒子流动
   */
  public update(_delta: number = 0.016): void {
    // 当动画处于暂停状态时，跳过 uTime 递增
    if (!this.isAnimated) return;

    const elapsedTime = this.clock.getElapsedTime();
    if (this.particleUniforms && this.particleUniforms.uTime) {
      this.particleUniforms.uTime.value = elapsedTime;
    }
    if (this.flowUniforms && this.flowUniforms.uTime) {
      this.flowUniforms.uTime.value = elapsedTime;
    }
  }

  /**
   * 释放水文环境 3D 资源
   */
  public dispose(): void {
    if (this.waterPlane) {
      this.scene.remove(this.waterPlane);
      this.waterPlane.geometry.dispose();
      (this.waterPlane.material as THREE.Material).dispose();
    }
    if (this.groundPlane) {
      this.scene.remove(this.groundPlane);
      this.groundPlane.geometry.dispose();
      (this.groundPlane.material as THREE.Material).dispose();
    }
    if (this.waterParticles) {
      this.scene.remove(this.waterParticles);
      this.waterParticles.geometry.dispose();
      (this.waterParticles.material as THREE.Material).dispose();
    }
    if (this.flowLines) {
      this.scene.remove(this.flowLines);
      this.flowLines.geometry.dispose();
      (this.flowLines.material as THREE.Material).dispose();
    }
    if (this.depthIndicator) {
      this.scene.remove(this.depthIndicator);
    }
  }
}