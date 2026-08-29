// frontend/src/utils/blueprintGenerator.ts
import { jsPDF } from 'jspdf';
import { type Snapshot } from '@/store/snapshotStore';

/**
 * 标准施工设计图参数模型
 */
export interface BlueprintParams {
  // 基础信息
  id: string;
  remark: string;
  timestamp: number;
  startChainage: number;
  endChainage: number;
  chainageText: string;
  isCritical: boolean;
  statusText: string;

  // 几何构造参数
  tunnelType: 'single' | 'double';
  r: number;             // 净空内半径 (m)
  r1: number;            // 二衬外半径 (m)
  r2: number;            // 初支外半径 (m)
  aspectRatio: number;   // 高宽比
  dSpacing: number;      // 双洞中心间距 (m)
  hasCentralDitch: boolean;

  // 排水推荐参数
  ringDiam: number;      // 环向管径 (m)
  ringSpacing: number;   // 环向间距 (m)
  latDiam: number;       // 横向管径 (m)
  longDiam: number;      // 纵向管径 (m)
  waterHead?: number;    // 设计水头 (m)
  safetyFactor?: number; // 安全系数
  qDrain?: number;       // 涌水量 (m3/d)
}

/**
 * 格式化桩号为工程标准 DK0+000 字符串
 */
export function formatEngineeringChainage(chainageVal: number | string): string {
  const num = typeof chainageVal === 'number' ? chainageVal : parseFloat(String(chainageVal)) || 0;
  const km = Math.floor(num / 1000);
  const m = Math.floor(num % 1000);
  const mStr = String(m).padStart(3, '0');
  return `DK${km}+${mStr}`;
}

/**
 * 稳健解构 Snapshot 对象为规范化的 BlueprintParams 模型
 */
export function extractBlueprintParams(snap: Snapshot | any): BlueprintParams {
  const p = snap.params || {};
  const res = snap.results || {};
  const orig = res.original_state || {};
  const crit = res.critical_state || {};
  const inputParam = res.input_parameter || {};

  const isCritical = Boolean(crit && crit.final_safety_factor !== undefined);
  const activeState = isCritical ? crit : orig;

  // 里程提取
  const sChain = Number(inputParam.start_chainage ?? p.start_chainage ?? snap.start_chainage ?? 0);
  const eChain = Number(inputParam.end_chainage ?? p.end_chainage ?? snap.end_chainage ?? 47);

  // 几何参数提取 (默认 r=5.0, r1=5.5, r2=6.5)
  const r = Number(inputParam.r ?? p.r ?? 5.0);
  const r1 = Number(inputParam.r1 ?? p.r1 ?? (r + 0.5));
  const r2 = Number(inputParam.r2 ?? p.r2 ?? (r1 + 1.0));
  const aspectRatio = Number(inputParam.aspect_ratio ?? p.aspect_ratio ?? 0.70);
  const dSpacing = Number(inputParam.D_spacing ?? p.D_spacing ?? 30.0);
  const tunnelType = (inputParam.tunnel_type ?? p.tunnel_type ?? (snap.type === 'double' ? 'double' : 'single')) === 'double' ? 'double' : 'single';
  const hasCentralDitch = (p.has_central_ditch !== undefined) ? Boolean(p.has_central_ditch) : true;

  // 排水推荐参数提取
  const ringDiam = Number(activeState.ring_diam_recommend ?? orig.ring_diam_recommend ?? p.ring_diam ?? 0.05);
  const ringSpacing = Number(activeState.ring_spacing_recommend ?? orig.ring_spacing_recommend ?? p.ring_spacing ?? 10.0);
  const latDiam = Number(activeState.lateral_diam_recommend ?? orig.lateral_diam_recommend ?? p.d_lat_default ?? 0.10);
  const longDiam = Number(activeState.long_diam_recommend ?? orig.long_diam_recommend ?? p.d_long_default ?? 0.10);

  const waterHead = activeState.final_waterHead ?? orig.waterHead ?? activeState.waterHead;
  const safetyFactor = activeState.final_safety_factor ?? orig.safety_factor ?? activeState.safety_factor;
  const qDrain = activeState.final_Q ?? orig.q_drain ?? orig.Q;

  const startStr = formatEngineeringChainage(sChain);
  const endStr = formatEngineeringChainage(eChain);
  const chainageText = `${startStr} ~ ${endStr}`;
  const statusText = isCritical ? '临界加固工况 🔴' : '原始计算工况 🟢';

  return {
    id: snap.id || 'snap_000',
    remark: snap.remark || '工况设计快照',
    timestamp: snap.timestamp || Date.now(),
    startChainage: sChain,
    endChainage: eChain,
    chainageText,
    isCritical,
    statusText,
    tunnelType,
    r,
    r1,
    r2,
    aspectRatio,
    dSpacing,
    hasCentralDitch,
    ringDiam,
    ringSpacing,
    latDiam,
    longDiam,
    waterHead,
    safetyFactor,
    qDrain
  };
}

/**
 * 2D 截面几何计算辅助接口 (与 3D DrainagePipeGenerator.ts / TunnelGenerator.ts 100% 对齐)
 */
interface HorseshoeProfile2D {
  R1: number;
  R2: number;
  R3: number;
  dx: number;
  dy: number;
  H_side: number;
  invertCenterY: number;
  roadY: number;
  halfRoadW: number;
  sideDitchX: number;
  sideDitchXInner: number;
  sideDitchBottomY: number;
  centralLeftX: number;
  centralRightX: number;
  centralBottomY: number;
  xLongFoot: number;
  yLongFoot: number;
  r1: number;
  r2: number;
}

/**
 * 精确计算三心圆马蹄形及水沟管网的 2D 几何参数 (数学世界坐标系，单位：米)
 */
function computeHorseshoeProfile2D(
  r: number,
  r1: number,
  r2: number,
  aspectRatio: number,
  hasCentralDitch: boolean
): HorseshoeProfile2D {
  const R1_base = 1.05 * r;
  const R2_base = 0.65 * r;
  const R3_base = 1.80 * r;

  const dx = R1_base - R2_base;
  const dy = Math.sqrt(Math.max(0, Math.pow(R3_base - R2_base, 2) - Math.pow(dx, 2)));

  const w = 2.1 * r;
  const h = w * aspectRatio;
  const H_side = Math.max(0.0, h - R1_base + dy - R3_base);
  const invertCenterY = -H_side + dy;

  // 沥青路面与仰拱水沟
  const ditchH = 0.8;
  const dy_road = R3_base - ditchH;
  const roadY = invertCenterY - dy_road;
  const halfRoadW = Math.sqrt(Math.max(0, R3_base * R3_base - dy_road * dy_road));

  const yBot_side_nominal = roadY - 0.3;
  const max_x_lining = Math.sqrt(Math.max(0, R3_base * R3_base - Math.pow(invertCenterY - yBot_side_nominal, 2)));
  const sideDitchX = max_x_lining - 0.05;
  const sideDitchXInner = max_x_lining - 0.45;

  const yLiningAtDitch = invertCenterY - Math.sqrt(Math.max(0, R3_base * R3_base - sideDitchX * sideDitchX));
  const sideDitchBottomY = Math.max(roadY - 0.3, yLiningAtDitch + 0.05);

  const centralLeftX = -0.35;
  const centralRightX = 0.35;
  const centralBottomY = invertCenterY - R3_base + 0.05;

  // 拱脚纵向排水管坐标 (二衬外壁与初支内壁交界面 r1)
  const t_r1 = Math.max(0, r1 - r);
  const R2_r1 = R2_base + t_r1;
  const cosFoot = dx / (R3_base - R2_base);
  const sinFoot = dy / (R3_base - R2_base);

  let yLongFoot: number;
  if (hasCentralDitch) {
    yLongFoot = -H_side - R2_r1 * sinFoot;
  } else {
    // 双侧沟模式：汇流口位于侧沟底上方 0.2m，按 3% 坡度反推
    const yOutletSide = sideDitchBottomY + 0.20;
    const dxSide = Math.max(0, (R3_base + t_r1) * cosFoot - sideDitchX);
    yLongFoot = yOutletSide + 0.03 * dxSide;
  }
  const xLongFoot = dx + Math.sqrt(Math.max(0, R2_r1 * R2_r1 - Math.pow(yLongFoot + H_side, 2)));

  return {
    R1: R1_base,
    R2: R2_base,
    R3: R3_base,
    dx,
    dy,
    H_side,
    invertCenterY,
    roadY,
    halfRoadW,
    sideDitchX,
    sideDitchXInner,
    sideDitchBottomY,
    centralLeftX,
    centralRightX,
    centralBottomY,
    xLongFoot,
    yLongFoot,
    r1,
    r2
  };
}

/**
 * 绘制三心圆马蹄形闭合实体单层轮廓 (Canvas 2D 屏幕坐标系，严密处理 Y 轴翻转与相切圆弧)
 */
function traceHorseshoeSingleRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  r: number,
  t: number,
  H_side: number,
  invertCenterY: number
) {
  const R1 = 1.05 * r + t;
  const R2 = 0.65 * r + t;
  const R3 = 1.80 * r + t;
  const dx = (1.05 * r) - (0.65 * r);
  const dy = Math.sqrt(Math.max(0, Math.pow((1.80 * r) - (0.65 * r), 2) - Math.pow(dx, 2)));

  const wx2px = (wx: number) => cx + wx * scale;
  const wy2py = (wy: number) => cy - wy * scale; // 屏幕 Y 向下

  // 相切角
  const aRight = Math.atan2(dy, dx);   // 拱脚圆弧切角
  const aLeft = Math.atan2(dy, -dx);

  // 1. 拱顶大圆弧 (从左往右，在 Canvas 屏幕坐标系上为逆时针从 PI 到 0)
  ctx.arc(wx2px(0), wy2py(0), R1 * scale, Math.PI, 0, true);

  // 2. 右侧直墙段 (若 H_side > 0，向下延伸)
  if (H_side > 0) {
    ctx.lineTo(wx2px(R1), wy2py(-H_side));
  }

  // 3. 右拱脚圆弧 (圆心 (dx, -H_side), 半径 R2, 从 0 顺时针转至 aRight)
  ctx.arc(wx2px(dx), wy2py(-H_side), R2 * scale, 0, aRight, false);

  // 4. 仰拱底大圆弧 (圆心 (0, invertCenterY), 半径 R3, 底部下凸，顺时针经过最低点)
  const aInvertRight = Math.atan2((invertCenterY - (-H_side + dy * 0)), dx); // 近似相切
  const aInvertLeft = Math.PI - aInvertRight;
  // 直接以拱脚终点向仰拱底过渡
  ctx.arc(wx2px(0), wy2py(invertCenterY), R3 * scale, Math.PI / 2 - Math.atan2(dx, dy), Math.PI / 2 + Math.atan2(dx, dy), false);

  // 5. 左拱脚圆弧 (圆心 (-dx, -H_side), 半径 R2, 顺时针转至 PI)
  ctx.arc(wx2px(-dx), wy2py(-H_side), R2 * scale, Math.PI - aRight, Math.PI, false);

  // 6. 左侧直墙段 (向上闭合至拱顶起点)
  if (H_side > 0) {
    ctx.lineTo(wx2px(-R1), wy2py(0));
  }

  ctx.closePath();
}

/**
 * 绘制 270° 贴合二衬背水面的马蹄形环向盲管曲线 (与 3D HorseshoeArcCurve 100% 同步)
 */
function traceHorseshoeRingPipe(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  r: number,
  r1: number,
  p2d: HorseshoeProfile2D
) {
  const t = Math.max(0, r1 - r);
  const R1 = p2d.R1 + t;
  const R2 = p2d.R2 + t;
  const dx = p2d.dx;
  const H_side = p2d.H_side;

  const wx2px = (wx: number) => cx + wx * scale;
  const wy2py = (wy: number) => cy - wy * scale;

  // 拱脚纵向管收口极角
  const sinVal = Math.max(-1.0, Math.min(0.0, (p2d.yLongFoot + H_side) / R2));
  const asinVal = Math.asin(sinVal); // [-PI/2, 0]

  ctx.beginPath();

  // 1. 从左拱脚纵向管位置起步，沿左拱脚圆弧向上
  const aLeftStart = Math.PI - asinVal;
  // 屏幕坐标系下：数学负 Y 为屏幕下方，绘制左侧圆弧逆时针向 PI 运行
  ctx.arc(wx2px(-dx), wy2py(-H_side), R2 * scale, aLeftStart, Math.PI, true);

  // 2. 左直墙段向上 (若 H_side > 0)
  if (H_side > 0) {
    ctx.lineTo(wx2px(-R1), wy2py(0));
  }

  // 3. 拱顶大圆弧 (从 PI 逆时针到 0，屏幕向上凸)
  ctx.arc(wx2px(0), wy2py(0), R1 * scale, Math.PI, 0, true);

  // 4. 右直墙段向下 (若 H_side > 0)
  if (H_side > 0) {
    ctx.lineTo(wx2px(R1), wy2py(-H_side));
  }

  // 5. 右拱脚圆弧向下 (从 0 顺时针运行至 asinVal，收口于右拱脚纵向管)
  ctx.arc(wx2px(dx), wy2py(-H_side), R2 * scale, 0, -asinVal, false);

  ctx.stroke();
}

/**
 * 绘制引出标注折线与文本 (CAD 级超高清字号、线宽与自动避让)
 */
function drawCallout(
  ctx: CanvasRenderingContext2D,
  targetX: number,
  targetY: number,
  kneeX: number,
  kneeY: number,
  horizontalLen: number,
  titleText: string,
  subText: string,
  alignRight: boolean = false
) {
  ctx.save();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#0F172A';
  ctx.fillStyle = '#0F172A';

  // 目标点实心定位圆点 (增大至 6px)
  ctx.beginPath();
  ctx.arc(targetX, targetY, 6.0, 0, Math.PI * 2);
  ctx.fill();

  // 折线引出线
  const endX = kneeX + (alignRight ? -horizontalLen : horizontalLen);
  ctx.beginPath();
  ctx.moveTo(targetX, targetY);
  ctx.lineTo(kneeX, kneeY);
  ctx.lineTo(endX, kneeY);
  ctx.stroke();

  // 文本标注 (大幅提升字号以满足 A3 打印辨识度)
  ctx.font = 'bold 26px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textAlign = alignRight ? 'right' : 'left';
  ctx.textBaseline = 'bottom';
  const textPad = 12;
  const textX = alignRight ? kneeX - textPad : kneeX + textPad;
  ctx.fillText(titleText, textX, kneeY - 8);

  if (subText) {
    ctx.font = '22px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillStyle = '#334155';
    ctx.textBaseline = 'top';
    ctx.fillText(subText, textX, kneeY + 8);
  }

  ctx.restore();
}

/**
 * A3 施工设计图生成器主类
 */
export class ConstructionBlueprintGenerator {
  private params: BlueprintParams;
  private canvasWidth = 4200;  // 对应 A3 420mm @ 10px/mm (254 DPI)
  private canvasHeight = 2970; // 对应 A3 297mm @ 10px/mm

  constructor(snap: Snapshot | any) {
    this.params = extractBlueprintParams(snap);
  }

  /**
   * 执行完整的参数化 A3 施工设计图绘制并返回离屏 Canvas
   */
  public renderToCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('无法创建 Canvas 2D 绘图上下文');

    // 1. 底色填充（纯净白底工程图纸）
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    // 2. 绘制标准 A3 内外图框与装订边
    this.drawA3Frame(ctx);

    // 3. 绘制右下角工程标题栏 (Title Block) 与设计信息
    this.drawTitleBlock(ctx);

    // 4. 绘制左下角工程设计说明与图例
    this.drawDesignNotesAndLegend(ctx);

    // 5. 绘制隧道主体横断面结构与排水系统 (自适应视口排布)
    this.drawTunnelSectionAndDrainage(ctx);

    return canvas;
  }

  /**
   * 绘制标准 A3 内外工程图框（左侧装订边 25mm，上下右 10mm）
   */
  private drawA3Frame(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // 1. 外边框 (距图纸物理边缘 5mm = 50px)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4.0;
    ctx.strokeRect(50, 50, this.canvasWidth - 100, this.canvasHeight - 100);

    // 2. 内图框 (左装订边 25mm = 250px，上/下/右 10mm = 100px)
    const innerLeft = 250;
    const innerTop = 100;
    const innerWidth = this.canvasWidth - 250 - 100;   // 3850px (385mm)
    const innerHeight = this.canvasHeight - 100 - 100; // 2770px (277mm)

    ctx.lineWidth = 8.0; // 内框加粗工程线
    ctx.strokeRect(innerLeft, innerTop, innerWidth, innerHeight);

    // 3. 图纸对准中心十字标
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = '#64748B';
    const drawCross = (x: number, y: number) => {
      ctx.beginPath();
      ctx.moveTo(x - 30, y);
      ctx.lineTo(x + 30, y);
      ctx.moveTo(x, y - 30);
      ctx.lineTo(x, y + 30);
      ctx.stroke();
    };
    drawCross(this.canvasWidth / 2, 75);
    drawCross(this.canvasWidth / 2, this.canvasHeight - 75);
    drawCross(175, this.canvasHeight / 2);
    drawCross(this.canvasWidth - 75, this.canvasHeight / 2);

    ctx.restore();
  }

  /**
   * 绘制标准工程标题栏 (Title Block & Engineering Signatures)
   */
  private drawTitleBlock(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    const tbWidth = 1800; // 180mm
    const tbHeight = 560; // 56mm
    const tbX = this.canvasWidth - 100 - tbWidth;  // 贴合内图框右下角 (2300px)
    const tbY = this.canvasHeight - 100 - tbHeight; // 2310px

    // 标题栏背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(tbX, tbY, tbWidth, tbHeight);

    // 外边框
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6.0;
    ctx.strokeRect(tbX, tbY, tbWidth, tbHeight);

    // 内部格线
    ctx.lineWidth = 3.0;

    // 水平分割线
    const rowH = tbHeight / 5; // 5行, 每行 112px
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(tbX, tbY + i * rowH);
      ctx.lineTo(tbX + tbWidth, tbY + i * rowH);
      ctx.stroke();
    }

    // 垂直分割列线
    ctx.beginPath();
    ctx.moveTo(tbX + 500, tbY);
    ctx.lineTo(tbX + 500, tbY + rowH * 3);

    ctx.moveTo(tbX + 1150, tbY);
    ctx.lineTo(tbX + 1150, tbY + rowH * 3);

    ctx.moveTo(tbX + 1450, tbY);
    ctx.lineTo(tbX + 1450, tbY + rowH * 3);

    // 会签栏竖线 (第4行、第5行)
    const colW = tbWidth / 5;
    for (let i = 1; i < 5; i++) {
      ctx.moveTo(tbX + i * colW, tbY + rowH * 3);
      ctx.lineTo(tbX + i * colW, tbY + tbHeight);
    }
    ctx.stroke();

    // 填写文字内容
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 行 1: 平台项目与图纸名称
    ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
    ctx.fillText('隧道工程多维协同智能排水自适应平台 (V4.0)', tbX + tbWidth / 2, tbY + rowH * 0.45);
    ctx.font = 'bold 32px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#0369A1';
    ctx.fillText('隧道衬砌结构与防排水系统横断面施工设计图', tbX + tbWidth / 2, tbY + rowH * 1.5);

    // 行 3: 里程、工况状态、比例与图号
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.fillText(`工程里程: ${this.params.chainageText}`, tbX + 250, tbY + rowH * 2.5);

    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = this.params.isCritical ? '#DC2626' : '#16A34A';
    ctx.fillText(`工况: ${this.params.statusText}`, tbX + 825, tbY + rowH * 2.5);

    ctx.fillStyle = '#0F172A';
    ctx.font = '20px "Microsoft YaHei", sans-serif';
    const isDouble = this.params.tunnelType === 'double';
    const scaleStr = isDouble ? '1:100' : '1:50';
    ctx.fillText(`比例: ${scaleStr}`, tbX + 1300, tbY + rowH * 2.5);
    ctx.fillText(`图号: SPS-${this.params.id.slice(0, 8).toUpperCase()}`, tbX + 1625, tbY + rowH * 2.5);

    // 行 4 & 5: 工程审核与会签栏
    const signLabels = ['设 计', '校 核', '审 核', '审 定', '出图日期'];
    const signNames = ['智能自适应引擎', '协同计算平台', '结构安全网关', '总工程师', new Date(this.params.timestamp).toISOString().split('T')[0]];

    signLabels.forEach((label, idx) => {
      ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(label, tbX + idx * colW + colW / 2, tbY + rowH * 3.4);

      ctx.font = '20px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#0F172A';
      ctx.fillText(signNames[idx], tbX + idx * colW + colW / 2, tbY + rowH * 4.4);
    });

    // 右下角版权归属微标
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'right';
    ctx.fillText('智能排水协同研发团队 版权所有 © 2026', tbX + tbWidth - 15, tbY + tbHeight - 10);

    ctx.restore();
  }

  /**
   * 绘制左下角工程设计说明与图例 (Design Notes & Legend)
   */
  private drawDesignNotesAndLegend(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    const boxX = 280;
    const boxY = this.canvasHeight - 100 - 560; // 2310px
    const boxW = 1200;
    const boxH = 540;

    // 底色
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // 标题
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('施工设计说明与技术要求 (Notes & Requirements)', boxX + 25, boxY + 38);

    // 说明条目
    const notes = [
      '1. 本图尺寸除标高与管径以毫米(mm)为单位外，其余几何尺寸、轴线间距及里程桩号均以米(m)为单位。',
      '2. 隧道截面采用标准三心圆马蹄形复合衬砌，二衬与初支间铺设防水板，并设环向打孔波纹排水盲管。',
      `3. 环向盲管沿拱顶及拱腰通长环向敷设，下端汇入左右拱脚墙背纵向排水管，纵向排水管全线贯通。`,
      `4. 拱脚纵向管引出的横向排水支管以 3% 下倾汇流坡度穿透二衬接入${this.params.hasCentralDitch ? '中央深排水沟槽' : '双侧边沟'}。`,
      `5. 本工况参数经自适应反演计算生成：设计涌水量 Q=${(this.params.qDrain ?? 0).toFixed(1)} m³/d，计算水头 H=${(this.params.waterHead ?? 0).toFixed(2)} m，安全系数 Fs=${(this.params.safetyFactor ?? 0).toFixed(2)}。`
    ];

    ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#334155';
    let textY = boxY + 80;
    notes.forEach((n) => {
      ctx.fillText(n, boxX + 25, textY);
      textY += 34;
    });

    // 图例条目 (Legend)
    const legY = boxY + 280;
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.fillText('图例说明 (Legend)', boxX + 25, legY);

    const drawLegendItem = (x: number, y: number, color: string, isDashed: boolean, label: string) => {
      ctx.save();
      ctx.lineWidth = 4.0;
      ctx.strokeStyle = color;
      if (isDashed) ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 55, y);
      ctx.stroke();

      ctx.font = '18px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#1E293B';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 68, y);
      ctx.restore();
    };

    drawLegendItem(boxX + 30, legY + 45, '#2563EB', true, `环向盲管 (Φ${Math.round(this.params.ringDiam * 1000)}mm, 间距${this.params.ringSpacing.toFixed(1)}m)`);
    drawLegendItem(boxX + 500, legY + 45, '#D97706', false, `纵向盲管 (DN${Math.round(this.params.longDiam * 1000)}mm 拱脚全线贯通)`);
    drawLegendItem(boxX + 30, legY + 90, '#EAB308', false, `横向排水管 (DN${Math.round(this.params.latDiam * 1000)}mm, 3%坡度)`);
    drawLegendItem(boxX + 500, legY + 90, '#475569', true, '隧道轴线 / 中线基准 (CL)');

    ctx.restore();
  }

  /**
   * 绘制自适应比例尺条 (Scale Bar)
   */
  private drawScaleBar(ctx: CanvasRenderingContext2D, x: number, y: number, scalePxPerMeter: number, isDouble: boolean): void {
    ctx.save();

    const meterUnits = isDouble ? [0, 5, 10, 20] : [0, 1, 2, 5];
    const barHeight = 22;

    ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // 刻度文字与黑白相间矩形
    let curX = x;
    meterUnits.forEach((m, idx) => {
      ctx.fillText(`${m}m`, curX, y - 6);
      if (idx < meterUnits.length - 1) {
        const nextM = meterUnits[idx + 1];
        const segW = (nextM - m) * scalePxPerMeter;
        ctx.fillStyle = idx % 2 === 0 ? '#0F172A' : '#FFFFFF';
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 2.5;
        ctx.fillRect(curX, y, segW, barHeight);
        ctx.strokeRect(curX, y, segW, barHeight);
        curX += segW;
      }
    });

    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
    ctx.fillText(`比例尺 (Scale ${isDouble ? '1:100' : '1:50'})`, x, y + barHeight + 26);

    ctx.restore();
  }

  /**
   * 绘制隧道主体横断面与自适应排水系统 (核心矢量制图流水线与视口严格拟合)
   */
  private drawTunnelSectionAndDrainage(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    const isDouble = this.params.tunnelType === 'double';
    const { r, r1, r2, aspectRatio, dSpacing, hasCentralDitch } = this.params;

    // 1. 2D 几何截面推导
    const p2d = computeHorseshoeProfile2D(r, r1, r2, aspectRatio, hasCentralDitch);

    // 2. 动态自适应视口比例尺计算 (严格拟合图框与避让底部栏位)
    // 物理世界包络尺寸 (米)
    const totalWorldWidth = isDouble ? (dSpacing + 2 * (1.05 * r2) + 6.0) : (2 * (1.05 * r2) + 6.0);
    const totalWorldHeight = (1.05 * r2 + 1.5) + (Math.abs(p2d.invertCenterY) + 1.80 * r2 + 1.5);

    // 图框内有效绘图安全区域：宽度 3500px，高度 1850px (顶部保留 150px，底部在 2150px 前结束，绝不压盖标题栏与设计说明)
    const availWidth = 3500;
    const availHeight = 1850;
    const computedScale = Math.min(availWidth / totalWorldWidth, availHeight / totalWorldHeight);

    // 规范化比例尺，单洞上限约 115 px/m (约 1:50 适配)，双洞约 65 px/m (约 1:100 适配)
    const scale = isDouble ? Math.min(68, computedScale) : Math.min(115, computedScale);

    // 绘图中心坐标
    const centerX = 250 + (this.canvasWidth - 250 - 100) / 2; // 2175px
    // 垂直中心根据拱顶与仰拱高度比进行黄金分割定位
    const topExtentPx = (1.05 * r2 + 1.2) * scale;
    const centerY = 160 + topExtentPx + (availHeight - totalWorldHeight * scale) * 0.25;

    // 主洞/副洞中心 X 偏移
    const offsets = isDouble ? [- (dSpacing / 2) * scale, (dSpacing / 2) * scale] : [0];

    // 3. 绘制每个洞体的初支、二衬与排水管网
    offsets.forEach((ox, tubeIdx) => {
      const tubeCenterX = centerX + ox;
      const isRightOrSingle = tubeIdx === offsets.length - 1;
      const tubeLabel = isDouble ? (tubeIdx === 0 ? '副洞 (Left Tube)' : '主洞 (Right Tube)') : '单洞隧道 (Single Tube)';

      // ----------------------------------------------------
      // A. 初支喷射混凝土区域填充 (r1 到 r2)
      // ----------------------------------------------------
      ctx.save();
      ctx.fillStyle = '#F1F5F9';
      ctx.beginPath();
      traceHorseshoeSingleRing(ctx, tubeCenterX, centerY, scale, r, r2 - r, p2d.H_side, p2d.invertCenterY);
      ctx.fill();

      // 初支外轮廓实线
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.restore();

      // ----------------------------------------------------
      // B. 二衬现浇混凝土区域填充 (r 到 r1)
      // ----------------------------------------------------
      ctx.save();
      ctx.fillStyle = '#E2E8F0';
      ctx.beginPath();
      traceHorseshoeSingleRing(ctx, tubeCenterX, centerY, scale, r, r1 - r, p2d.H_side, p2d.invertCenterY);
      ctx.fill();

      // 二衬与初支交界面 (背水面接触线，防水板与环向盲管敷设面)
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();

      // ----------------------------------------------------
      // C. 隧道内净空挖空 (r 内部)
      // ----------------------------------------------------
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      traceHorseshoeSingleRing(ctx, tubeCenterX, centerY, scale, r, 0, p2d.H_side, p2d.invertCenterY);
      ctx.fill();

      // 二衬内壁轮廓实线 (工程深黑粗实线)
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 5.0;
      ctx.stroke();
      ctx.restore();

      // ----------------------------------------------------
      // D. 仰拱填充层、沥青路面层与排水水沟凹槽
      // ----------------------------------------------------
      ctx.save();
      const wx2px = (wx: number) => tubeCenterX + wx * scale;
      const wy2py = (wy: number) => centerY - wy * scale;

      // 仰拱回填层
      ctx.fillStyle = '#CBD5E1';
      ctx.beginPath();
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const x = -p2d.halfRoadW + (i / steps) * (2 * p2d.halfRoadW);
        const y = p2d.invertCenterY - Math.sqrt(Math.max(0, p2d.R3 * p2d.R3 - x * x));
        if (i === 0) ctx.moveTo(wx2px(x), wy2py(y));
        else ctx.lineTo(wx2px(x), wy2py(y));
      }
      ctx.lineTo(wx2px(p2d.halfRoadW), wy2py(p2d.roadY));
      ctx.lineTo(wx2px(-p2d.halfRoadW), wy2py(p2d.roadY));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 沥青路面面层线
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(wx2px(-p2d.halfRoadW), wy2py(p2d.roadY));
      ctx.lineTo(wx2px(p2d.halfRoadW), wy2py(p2d.roadY));
      ctx.stroke();

      // 左右侧边排水沟槽 (U型槽口)
      const drawDitchU = (xOuter: number, xInner: number, yBot: number) => {
        const minX = Math.min(wx2px(xOuter), wx2px(xInner));
        const wPx = Math.abs(wx2px(xOuter) - wx2px(xInner));
        const topPy = wy2py(p2d.roadY);
        const hPx = Math.abs(wy2py(yBot) - wy2py(p2d.roadY));

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(minX, topPy, wPx, hPx);
        ctx.strokeStyle = '#0284C7';
        ctx.lineWidth = 3.5;
        ctx.strokeRect(minX, topPy, wPx, hPx);
      };

      // 绘制左侧边沟与右侧边沟
      drawDitchU(-p2d.sideDitchX, -p2d.sideDitchXInner, p2d.sideDitchBottomY);
      drawDitchU(p2d.sideDitchXInner, p2d.sideDitchX, p2d.sideDitchBottomY);

      // 绘制中央深排水沟
      if (hasCentralDitch) {
        drawDitchU(p2d.centralLeftX, p2d.centralRightX, p2d.centralBottomY);
      }

      ctx.restore();

      // ----------------------------------------------------
      // E. 自适应防排水管网 (高对比工程色，与 3D 几何完全一致)
      // ----------------------------------------------------
      ctx.save();
      // 1. 环向打孔盲管 (沿二衬背水面 270° 马蹄形复合曲线敷设，精准收口于拱脚纵向管)
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 4.5;
      ctx.setLineDash([12, 6]);
      traceHorseshoeRingPipe(ctx, tubeCenterX, centerY, scale, r, r1, p2d);
      ctx.setLineDash([]); // 恢复实线

      // 2. 左右拱脚纵向排水管 (实心双层圆截面，带十字中心线)
      const drawLongitudinalPipe = (x: number, y: number) => {
        const px = wx2px(x);
        const py = wy2py(y);
        const pipeRadiusPx = Math.max(10, (this.params.longDiam / 2) * scale * 2.8); // 适度视觉放大以清晰表达

        // 外层保护包布
        ctx.fillStyle = '#FEF3C7';
        ctx.strokeStyle = '#D97706';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(px, py, pipeRadiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 内部通水孔径
        ctx.fillStyle = '#D97706';
        ctx.beginPath();
        ctx.arc(px, py, pipeRadiusPx * 0.55, 0, Math.PI * 2);
        ctx.fill();

        // 中心十字线
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(px - pipeRadiusPx, py);
        ctx.lineTo(px + pipeRadiusPx, py);
        ctx.moveTo(px, py - pipeRadiusPx);
        ctx.lineTo(px, py + pipeRadiusPx);
        ctx.stroke();
      };

      drawLongitudinalPipe(-p2d.xLongFoot, p2d.yLongFoot);
      drawLongitudinalPipe(p2d.xLongFoot, p2d.yLongFoot);

      // 3. 穿衬横向排水管 (3% 坡度引向水沟)
      ctx.strokeStyle = '#EAB308';
      ctx.lineWidth = 4.5;
      if (hasCentralDitch) {
        // 引向中央深水沟两侧
        ctx.beginPath();
        ctx.moveTo(wx2px(-p2d.xLongFoot), wy2py(p2d.yLongFoot));
        ctx.lineTo(wx2px(p2d.centralLeftX), wy2py(p2d.yLongFoot - 0.03 * (p2d.xLongFoot - Math.abs(p2d.centralLeftX))));
        ctx.moveTo(wx2px(p2d.xLongFoot), wy2py(p2d.yLongFoot));
        ctx.lineTo(wx2px(p2d.centralRightX), wy2py(p2d.yLongFoot - 0.03 * (p2d.xLongFoot - Math.abs(p2d.centralRightX))));
        ctx.stroke();
      } else {
        // 引向同侧边沟
        ctx.beginPath();
        ctx.moveTo(wx2px(-p2d.xLongFoot), wy2py(p2d.yLongFoot));
        ctx.lineTo(wx2px(-p2d.sideDitchX), wy2py(p2d.sideDitchBottomY + 0.2));
        ctx.moveTo(wx2px(p2d.xLongFoot), wy2py(p2d.yLongFoot));
        ctx.lineTo(wx2px(p2d.sideDitchX), wy2py(p2d.sideDitchBottomY + 0.2));
        ctx.stroke();
      }
      ctx.restore();

      // ----------------------------------------------------
      // F. 隧道轴线中线与洞名标识 (严格限制上下伸出长度，杜绝穿框)
      // ----------------------------------------------------
      ctx.save();
      // 中线细点划线 (上下仅伸出 1.2m)
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([16, 6, 4, 6]);
      const clTopY = centerY - (1.05 * r2 + 1.2) * scale;
      const clBottomY = centerY + (Math.abs(p2d.invertCenterY) + 1.80 * r2 + 0.8) * scale;

      ctx.beginPath();
      ctx.moveTo(tubeCenterX, clTopY);
      ctx.lineTo(tubeCenterX, clBottomY);
      ctx.stroke();

      // 轴线符号 CL 与洞名 (升级字号)
      ctx.setLineDash([]);
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ℭ', tubeCenterX, clTopY - 14);
      ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
      ctx.fillText(tubeLabel, tubeCenterX, clBottomY + 36);

      ctx.restore();

      // ----------------------------------------------------
      // G. CAD 级折线引出标注系统 (仅在主洞或单洞展示完整标注，避免重叠)
      // ----------------------------------------------------
      if (isRightOrSingle) {
        const t1 = r1 - r;
        const R1_ext = 1.05 * r + t1;

        // 1. 环向盲管引出标注 (拱腰 45° 位置)
        const crownAngle = Math.PI / 4;
        const calloutTargetX = tubeCenterX + Math.cos(crownAngle) * R1_ext * scale;
        const calloutTargetY = centerY - Math.sin(crownAngle) * R1_ext * scale;
        drawCallout(
          ctx,
          calloutTargetX,
          calloutTargetY,
          calloutTargetX + 220,
          calloutTargetY - 160,
          360,
          `Φ${Math.round(this.params.ringDiam * 1000)} 打孔波纹管 (环向盲管)`,
          `纵向间距: ${this.params.ringSpacing.toFixed(1)} m`,
          false
        );

        // 2. 拱脚纵向管引出标注
        const longTargetX = wx2px(p2d.xLongFoot);
        const longTargetY = wy2py(p2d.yLongFoot);
        drawCallout(
          ctx,
          longTargetX,
          longTargetY,
          longTargetX + 200,
          longTargetY + 90,
          360,
          `HDPE DN${Math.round(this.params.longDiam * 1000)} 墙背纵向排水管`,
          `全线贯通敷设 (拱脚二衬与初支交界)`,
          false
        );

        // 3. 横向支管引出标注
        const latMidX = wx2px((p2d.xLongFoot + (hasCentralDitch ? p2d.centralRightX : p2d.sideDitchX)) / 2);
        const latMidY = wy2py(p2d.yLongFoot - 0.05);
        drawCallout(
          ctx,
          latMidX,
          latMidY,
          latMidX + 160,
          latMidY + 180,
          360,
          `横向排水支管 DN${Math.round(this.params.latDiam * 1000)}`,
          `3% 汇流坡度 (纵向间距: 20.0m)`,
          false
        );

        // 4. 初支与二衬厚度标注 (左拱腰引出)
        const liningTargetX = tubeCenterX - R1_ext * scale;
        const liningTargetY = centerY;
        drawCallout(
          ctx,
          liningTargetX,
          liningTargetY,
          liningTargetX - 200,
          liningTargetY - 140,
          360,
          `复合式衬砌断面 (内净空 R=${r.toFixed(1)}m)`,
          `初支厚度: ${Math.round((r2 - r1) * 100)}cm | 二衬厚度: ${Math.round((r1 - r) * 100)}cm`,
          true
        );
      }
    });

    // 4. 双洞中心间距尺寸标注线 (仅双洞模式)
    if (isDouble && offsets.length >= 2) {
      const leftAxisX = centerX + offsets[0];
      const rightAxisX = centerX + offsets[1];
      const dimY = centerY - (1.05 * r2 + 0.8) * scale;

      ctx.save();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 3.0;

      // 尺寸界线
      ctx.beginPath();
      ctx.moveTo(leftAxisX, dimY - 45);
      ctx.lineTo(leftAxisX, dimY + 45);
      ctx.moveTo(rightAxisX, dimY - 45);
      ctx.lineTo(rightAxisX, dimY + 45);

      // 尺寸线
      ctx.moveTo(leftAxisX, dimY);
      ctx.lineTo(rightAxisX, dimY);
      ctx.stroke();

      // 左右箭头
      const arrowSize = 16;
      ctx.fillStyle = '#0F172A';
      const drawArrow = (x: number, dir: 1 | -1) => {
        ctx.beginPath();
        ctx.moveTo(x, dimY);
        ctx.lineTo(x + dir * arrowSize * 2, dimY - arrowSize * 0.5);
        ctx.lineTo(x + dir * arrowSize * 2, dimY + arrowSize * 0.5);
        ctx.closePath();
        ctx.fill();
      };
      drawArrow(leftAxisX, 1);
      drawArrow(rightAxisX, -1);

      // 间距标注文本 (升级字号)
      ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`隧道轴线中心间距 D = ${dSpacing.toFixed(2)} m`, (leftAxisX + rightAxisX) / 2, dimY - 10);

      ctx.restore();
    }

    // 5. 绘制比例尺条 (位于左图框内，设计说明上方)
    this.drawScaleBar(ctx, 280, this.canvasHeight - 100 - 640, scale, isDouble);

    ctx.restore();
  }

  /**
   * 生成标准 A3 Landscape 矢量 PDF 文件并触发浏览器/桌面端极速下载
   */
  public async exportPDF(): Promise<void> {
    const canvas = this.renderToCanvas();
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    // 创建 ISO A3 Landscape PDF (420mm x 297mm)
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a3',
      compress: true
    });

    pdf.addImage(imgData, 'JPEG', 0, 0, 420, 297, undefined, 'FAST');

    const fileName = `施工设计图_${this.params.chainageText.replace(/\s+/g, '')}_${this.params.isCritical ? '临界加固' : '原始工况'}_A3.pdf`;
    pdf.save(fileName);
  }

  /**
   * 生成超高清 PNG 图片文件并触发下载
   */
  public async exportPNG(): Promise<void> {
    const canvas = this.renderToCanvas();
    const fileName = `施工设计图_${this.params.chainageText.replace(/\s+/g, '')}_${this.params.isCritical ? '临界加固' : '原始工况'}_A3.png`;

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        resolve();
      }, 'image/png');
    });
  }
}

/**
 * 快捷导出快照施工图函数
 */
export async function exportSnapshotBlueprint(snap: Snapshot | any, format: 'pdf' | 'png' = 'pdf'): Promise<void> {
  const generator = new ConstructionBlueprintGenerator(snap);
  if (format === 'pdf') {
    await generator.exportPDF();
  } else {
    await generator.exportPNG();
  }
}
