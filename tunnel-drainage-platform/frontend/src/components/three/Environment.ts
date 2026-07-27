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
  
  // 着色器代码
  private readonly waterVertexShader = `
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
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;
  
  private readonly waterFragmentShader = `
    uniform float uTime;
    uniform float uOpacity;
    uniform vec3 uColorDeep;
    uniform vec3 uColorShallow;
    
    varying vec2 vUv;
    varying float vElevation;
    
    void main() {
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
      gl_PointSize = aSize * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
  
  private readonly particleFragmentShader = `
    varying float vAlpha;
    
    void main() {
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
      uOpacity: { value: 0.6 },
      uColorDeep: { value: new THREE.Color(0x1a5276) },
      uColorShallow: { value: new THREE.Color(0x85c1e9) }
    };
    
    const material = new THREE.ShaderMaterial({
      vertexShader: this.waterVertexShader,
      fragmentShader: this.waterFragmentShader,
      uniforms: this.particleUniforms,
      transparent: true,
      side: THREE.DoubleSide
    });
    
    this.waterPlane = new THREE.Mesh(geometry, material);
    this.waterPlane.rotation.x = -Math.PI / 2;
    this.waterPlane.position.z = -this.config.startChainage - length / 2;
    
    this.scene.add(this.waterPlane);
  }

  /**
   * 初始化地面基准面
   * 基于埋深 c 定义地面高程：Y_ground = Y_crown + c
   */
  private initGroundPlane(): void {
    const length = Math.abs(this.config.endChainage - this.config.startChainage);
    const width = this.config.tunnelType === 'double'
      ? (this.config.dSpacing || 0) + this.config.tunnelRadius * 10
      : this.config.tunnelRadius * 10;
    
    const geometry = new THREE.PlaneGeometry(width, length);
    
    // 创建地形纹理
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    // 绘制简单地形纹理
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, '#5d4e37');
    gradient.addColorStop(0.3, '#6b5b4f');
    gradient.addColorStop(0.7, '#7a6a5c');
    gradient.addColorStop(1, '#5d4e37');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    
    // 添加噪点模拟地表
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(width / 10, length / 10);
    
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0.1
    });
    
    this.groundPlane = new THREE.Mesh(geometry, material);
    this.groundPlane.rotation.x = -Math.PI / 2;
    
    // 地面高程 = 隧道中心Y + 埋深（假设隧道中心Y=0）
    // 实际应根据隧道拱顶位置计算
    const tunnelHeight = this.config.tunnelRadius * 1.4; // 近似拱顶高度
    this.groundPlane.position.y = tunnelHeight + this.config.burialDepth;
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
    const spreadX = this.config.tunnelType === 'double'
      ? (this.config.dSpacing || 0) + this.config.tunnelRadius * 4
      : this.config.tunnelRadius * 4;
    
    for (let i = 0; i < particleCount; i++) {
      // 360° 围绕隧道的极坐标分布
      const theta = Math.random() * Math.PI * 2;
      const rDist = this.config.tunnelRadius * 1.5 + Math.random() * this.config.tunnelRadius * 3.5;
      
      positions[i * 3] = rDist * Math.cos(theta);
      positions[i * 3 + 1] = rDist * Math.sin(theta);
      positions[i * 3 + 2] = -this.config.startChainage - Math.random() * length;
      
      sizes[i] = Math.random() * 3 + 1;
      phases[i] = Math.random() * Math.PI * 2;
      
      // 径向向隧道中心 (0, 0, Z) 的渗透速度矢量
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
   * 初始化流线可视化 (360° 辐射向隧道中心轴线收敛)
   */
  private initFlowLines(): void {
    const lineCount = 60;
    const pointsPerLine = 20;
    const geometry = new THREE.BufferGeometry();
    
    const positions: number[] = [];
    const colors: number[] = [];
    
    const length = Math.abs(this.config.endChainage - this.config.startChainage);
    
    for (let i = 0; i < lineCount; i++) {
      const theta = (i / lineCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
      const rOuter = this.config.tunnelRadius * 3.5;
      const rInner = this.config.tunnelRadius * 1.1;
      const startZ = -this.config.startChainage - Math.random() * length;
      
      for (let j = 0; j < pointsPerLine - 1; j++) {
        const t1 = j / (pointsPerLine - 1);
        const t2 = (j + 1) / (pointsPerLine - 1);
        
        const r1 = rOuter * (1 - t1) + rInner * t1;
        const r2 = rOuter * (1 - t2) + rInner * t2;
        
        const x1 = r1 * Math.cos(theta);
        const y1 = r1 * Math.sin(theta);
        const z1 = startZ - t1 * 2;
        
        const x2 = r2 * Math.cos(theta);
        const y2 = r2 * Math.sin(theta);
        const z2 = startZ - t2 * 2;
        
        positions.push(x1, y1, z1, x2, y2, z2);
        
        // 颜色从浅蓝到深蓝
        const intensity1 = 1 - t1 * 0.5;
        const intensity2 = 1 - t2 * 0.5;
        colors.push(0.3 * intensity1, 0.6 * intensity1, 1.0 * intensity1);
        colors.push(0.3 * intensity2, 0.6 * intensity2, 1.0 * intensity2);
      }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      linewidth: 1
    });
    
    this.flowLines = new THREE.LineSegments(geometry, material);
    this.scene.add(this.flowLines);
  }

  /**
   * 初始化埋深指示器
   */
  private initDepthIndicator(): void {
    this.depthIndicator = new THREE.Group();
    
    // 埋深标注线
    const tunnelHeight = this.config.tunnelRadius * 1.4;
    const groundY = tunnelHeight + this.config.burialDepth;
    
    const points = [
      new THREE.Vector3(this.config.tunnelRadius * 2, tunnelHeight, -this.config.startChainage),
      new THREE.Vector3(this.config.tunnelRadius * 2, groundY, -this.config.startChainage)
    ];
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: 0xffffff,
      dashSize: 0.5,
      gapSize: 0.3,
      opacity: 0.6,
      transparent: true
    });
    
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    this.depthIndicator.add(line);
    
    // 埋深数值标签（使用Sprite实现）
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText(`埋深: ${this.config.burialDepth.toFixed(1)}m`, 128, 40);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(10, 2.5, 1);
    sprite.position.set(this.config.tunnelRadius * 2, (tunnelHeight + groundY) / 2, -this.config.startChainage);
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

    const waterHead = state.final_waterHead ?? state.waterHead ?? params.h ?? (this.config.burialDepth * 0.6);
    const leakageQ = state.Q ?? state.q ?? 0;
    const burialDepth = params.c ?? params.depth ?? this.config.burialDepth;

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

    // 更新水位面高度与地面高度
    if (this.waterPlane) {
      this.waterPlane.position.y = waterHead;
    }
    if (this.groundPlane) {
      const tunnelHeight = this.config.tunnelRadius * 1.4;
      this.groundPlane.position.y = tunnelHeight + burialDepth;
    }
  }

  /**
   * 动画帧驱动，水流波纹与粒子流动
   */
  public update(_delta: number = 0.016): void {
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