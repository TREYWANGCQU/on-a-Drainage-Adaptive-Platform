// tunnel-drainage-platform\frontend\src\components\three\TunnelGenerator.ts
import * as THREE from 'three';
import { polarToCartesian, calculateNormalQuaternion } from '@/utils/math';
import liningVert from '@/assets/shaders/lining.vert?raw';
import liningFrag from '@/assets/shaders/lining.frag?raw';

// 修改后：严格匹配后端 Snapshot 输出类型
export enum TunnelType {
  SINGLE = 'single', // 单洞隧道
  DOUBLE = 'double'  // 双洞隧道
}

export class TunnelGenerator {
  public mesh: THREE.InstancedMesh;
  public groundMesh: THREE.Mesh;
  private readonly L_max: number;      // 最大里程纵深
  private readonly delta_l_min: number; // 最小排布间距 (单位长度1m)
  private readonly c_ring: number = 1;  // 隧道主体单环实例数恒定为1

  constructor(
    type: TunnelType,
    start_chainage: number,
    end_chainage: number,
    r: number,
    aspect_ratio: number = 1.0,
    D_spacing: number = 30.0,
    r1: number = 5.5,
    r2: number = 6.5,
    rg: number = 8.0,
    c: number = 50.0,
    delta_l_min: number = 1.0
  ) {
    // 从 store 传入的空间里程推导纵深 L_max
    this.L_max =Math.abs(end_chainage - start_chainage);
    this.delta_l_min = delta_l_min;

    // 构建带有多层解算拓扑的二维截面，并执行拉伸
    const geometry = this.createHorseshoeBase(type, r, rg, D_spacing, aspect_ratio);

    //const material = new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide });// 替换为自定义着色器材质，支持基于半径和间距的动态纹理映射
    // 材质挂载与 Uniform 参数暴露
    const material = new THREE.ShaderMaterial({
      vertexShader: liningVert,
      fragmentShader: liningFrag,
      side: THREE.DoubleSide,
      glslVersion: THREE.GLSL3, // 新增：强制采用 GLSL 3.00 ES 规范编译
      uniforms: {
        r: { value: r },
        r1: { value: r1 },
        r2: { value: r2 },
        rg: { value: rg },
        // 新增：动态传入真实的双洞间距，若是单洞则传 0
        spacing: { value: type === TunnelType.DOUBLE ? D_spacing : 0.0 },
        aspect: { value: aspect_ratio } // 新增：传入长宽比参数，支持非等比例隧道截面纹理适配
      }
    });
    // 极值计算：N_max = ceil(L_max / delta_l_min) * C_ring
    // 规避运行时高频内存垃圾回收(GC)，一次性向 GPU 申请最大连续显存空间 BufferAttribute
    const nMax = Math.ceil(this.L_max / this.delta_l_min) * this.c_ring;
    this.mesh = new THREE.InstancedMesh(geometry, material, nMax);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // 动态控制初始化渲染实例数为 0，避免冗余网格绘制
    this.mesh.count = 0;
    // 地表平面生成与埋深推演
    geometry.computeBoundingBox();
    const Y_crown = geometry.boundingBox ? geometry.boundingBox.max.y : (1.05 * r);
    const Y_ground = Y_crown + c;

    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x88cc88, side: THREE.DoubleSide });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    // 矫正地表朝向并定位到目标埋深
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.y = Y_ground;
  }
  /**
     * 构建单/双洞组合基准几何体
     */
  private createHorseshoeBase(type: TunnelType, r: number, rg: number, spacing: number, aspect_ratio: number): THREE.BufferGeometry {
    const shapes: THREE.Shape[] = [];

    // 根据隧道类型动态推演二维组合面域
    if (type === TunnelType.DOUBLE) {
      shapes.push(this.createHorseshoeShape(r, rg, -spacing / 2, aspect_ratio));
      shapes.push(this.createHorseshoeShape(r, rg, spacing / 2, aspect_ratio));
    } else {
      shapes.push(this.createHorseshoeShape(r, rg, 0, aspect_ratio));
    }

    // 约束条件：Three.js 默认的 curveSegments (12) 会导致大半径曲面（仰拱和边墙）产生严重锯齿，且使水沟精确交点悬空
    // 实现方式：将曲线离散段数提升至 64
    // 影响范围：显著提升马蹄形内/外轮廓平滑度，确保排水沟直角结构与仰拱弧面的几何相交精确闭合
    const settings = { depth: 1, bevelEnabled: false, curveSegments: 64 };
    const geometry = new THREE.ExtrudeGeometry(shapes, settings);
    
   

    return geometry;
  }
  /**
   * 细部截面拓扑生成核心：引入 offsetX 支持空间横向偏移解算
   */
  private createHorseshoeShape(r: number, rg: number, offsetX: number, aspect_ratio: number): THREE.Shape {
    const shape = new THREE.Shape();

    // 闭包函数：同步生成外轮廓与内开挖面，规避数学运算误差
    const buildPath = (target_r: number, isHole: boolean): THREE.Path | THREE.Shape => {
      const path = isHole ? new THREE.Path() : shape;
      // 基于内部净空 r 构建同心基准拓扑，保证所有衬砌层圆心重合与等厚边界
      const R1_base = 1.05 * r;
      const R2_base = 0.65 * r;
      const R3_base = 1.80 * r;

      const dx = R1_base - R2_base;
      const dy = Math.sqrt(Math.pow(R3_base - R2_base, 2) - Math.pow(dx, 2));

      // 解除原代码 0.1*radius 的钳位截断，支持平坦型隧道（高宽比 < 1.0）
      const w = 2.1 * r;
      const h = w * aspect_ratio;
      const H_side = Math.max(0.0, h - R1_base + dy - R3_base); 
      const invertCenterY = -H_side + dy;

      // 根据目标层级执行无缩放等厚向外偏移
      const t = target_r - r;
      const R1 = R1_base + t;
      const R2 = R2_base + t;
      const R3 = R3_base + t;

      // 仰拱与边墙过渡圆弧切线角度解算
      let aLeft = Math.atan2(-dy, -dx);
      if (aLeft < 0) aLeft += Math.PI * 2;
      let aRight = Math.atan2(-dy, dx);
      if (aRight < 0) aRight += Math.PI * 2;

      if (isHole) {
        // 内轮廓：顺时针绘制 Hole
        path.moveTo(R1 + offsetX, 0);
        if (H_side > 0) path.lineTo(R1 + offsetX, -H_side);
        path.absarc(dx + offsetX, -H_side, R2, Math.PI * 2, aRight, true);
        
        // [修复] 动态水沟直接在此处作为内轮廓的延续段生成
        const r_threshold = 5.0;
        // 注：此处 r 提取自外部作用域，判别该主参数是否达到触发阈值
        if (r > r_threshold) {
          const ditchW = 0.6;
          const ditchH = 0.8;
          const halfW = ditchW / 2;
          
          /// 回填层路面交点解算，确保水沟位于仰拱回填层内
          const dy_road = R3 - ditchH;
          const halfRoadW = Math.sqrt(Math.max(0, R3 * R3 - dy_road * dy_road));
          
          let aRoadRight = Math.atan2(-dy_road, halfRoadW);
          if (aRoadRight < 0) aRoadRight += Math.PI * 2;
          let aRoadLeft = Math.atan2(-dy_road, -halfRoadW);
          if (aRoadLeft < 0) aRoadLeft += Math.PI * 2;
          
          // 绘制右侧仰拱弧段至回填路面交点
          path.absarc(offsetX, invertCenterY, R3, aRight, aRoadRight, true);
          
          // 绘制平坦路面与下凹水沟（水沟底部严密贴合二衬上沿弧面）
          const roadY = invertCenterY - dy_road;
          const ditchBottomY = invertCenterY - Math.sqrt(R3 * R3 - halfW * halfW); 
          
          path.lineTo(offsetX + halfW, roadY);
          path.lineTo(offsetX + halfW, ditchBottomY);
          path.lineTo(offsetX - halfW, ditchBottomY);
          path.lineTo(offsetX - halfW, roadY);
          path.lineTo(offsetX - halfRoadW, roadY);
          
          // 绘制左侧仰拱弧段
          path.absarc(offsetX, invertCenterY, R3, aRoadLeft, aLeft, true);
        } else {
          // 无水沟时，直接补全仰拱弧面
          path.absarc(offsetX, invertCenterY, R3, aRight, aLeft, true);
        }
        
        path.absarc(-dx + offsetX, -H_side, R2, aLeft, Math.PI, true);
        if (H_side > 0) path.lineTo(-R1 + offsetX, 0);
        path.absarc(offsetX, 0, R1, Math.PI, 0, true);
      } else {
        // 外轮廓：逆时针绘制 Shape
        path.moveTo(R1 + offsetX, 0);
        path.absarc(offsetX, 0, R1, 0, Math.PI, false);
        if (H_side > 0) path.lineTo(-R1 + offsetX, -H_side);
        path.absarc(-dx + offsetX, -H_side, R2, Math.PI, aLeft, false);
        path.absarc(offsetX, invertCenterY, R3, aLeft, aRight, false);
        path.absarc(dx + offsetX, -H_side, R2, aRight, Math.PI * 2, false);
        if (H_side > 0) path.lineTo(R1 + offsetX, 0);
      }
      return path;
    };

    // 1. 生成衬砌注浆圈最外侧轮廓
    buildPath(rg, false);

    // 2. 生成隧道内侧开挖孔洞
    const holePath = buildPath(r, true) as THREE.Path;
    shape.holes.push(holePath);

    

    return shape;

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
   */
  public updateInstanceData(
    nCurrent: number,
    spacingZ: number,
    scaleFactor: number,
    radius: number,
    angleDegrees: number,
    stateColors?: THREE.Color[]
  ): void {
    this.updateCount(nCurrent);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor);
    
    for (let i = 0; i < nCurrent; i++) {
      const z = -i * spacingZ;
      
      position.set(0, 0, z);

      const quaternion = new THREE.Quaternion(); 

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