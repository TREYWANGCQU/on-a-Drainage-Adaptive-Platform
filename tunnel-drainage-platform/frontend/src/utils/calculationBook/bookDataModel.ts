// tunnel-drainage-platform/frontend/src/utils/calculationBook/bookDataModel.ts

/**
 * 《隧道防排水优化设计计算书》标准数据模型与类型定义
 * 严格对应 6 大核心章节与工程质检要求
 */

export type TunnelType = 'single' | 'double';
export type WaterLevelCase = 'high' | 'low';
export type SafetyState = 'safe' | 'critical'; // safe: K >= 2.0 (达标), critical: K < 2.0 (超限需注浆)

/**
 * 项目与报告元数据
 */
export interface CalculationBookMeta {
  projectName: string;
  tunnelName: string;
  documentTitle: string;
  reportCode: string;
  snapshotId: string;
  snapshotRemark: string;
  startChainage: number;
  endChainage: number;
  partitionLength: number;
  generatedDate: string;
  designer: string;
  reviewer: string;
  approver: string;
}

/**
 * 第 1 章：设计依据
 */
export interface Chapter1Data {
  specifications: Array<{
    code: string;
    name: string;
  }>;
  theories: Array<{
    title: string;
    description: string;
  }>;
}

/**
 * 第 2 章：基础计算参数
 */
export interface Chapter2Data {
  geometryParams: Array<{
    name: string;
    symbol: string;
    value: number | string;
    unit: string;
    remark: string;
  }>;
  hydrogeologyParams: Array<{
    name: string;
    symbol: string;
    value: number | string;
    unit: string;
    remark: string;
  }>;
  structuralParams: Array<{
    name: string;
    symbol: string;
    value: number | string;
    unit: string;
    remark: string;
  }>;
}

/**
 * 第 3 章：原始状态渗流水力计算
 */
export interface Chapter3Data {
  waterLevelCase: WaterLevelCase;
  tunnelType: TunnelType;
  ratio_r0_H: number;
  threshold_r0_H: number;
  caseDescription: string;
  
  // SCS-CN 降雨入渗模型
  cn: number;
  p_annual: number;
  S_retention: number;
  Ia_initialLoss: number;
  hs_runoff: number;
  h0_effectiveWaterHead: number;

  // 渗流影响半径
  beta1: number;
  R_inf: number;
  isDoubleTube: boolean;
  D_spacing?: number;
  phi_deg?: number;
  phi_rad?: number;
  R_map?: number;
  R_effective: number;

  // 多层圆筒渗流
  rs_r0_ln: number;
  sum_resistance: number;
  P_waterPressure: number; // kPa
  q_unitDischarge: number; // m³/(d·m)
  Q_totalDischarge: number; // m³/d

  // 低水位工况特有（若触发）
  h1_depth?: number;
  R_conf?: number;
  beta_seepage?: number;
  P_crown?: number;
  P_invert?: number;

  summaryTable: Array<{
    metric: string;
    symbol: string;
    value: number | string;
    unit: string;
  }>;
}

/**
 * 第 4 章：原始状态衬砌结构安全验算
 */
export interface Chapter4Data {
  rockGrade: string;
  liningOuterWidth: number; // B = 2*rs (m)
  Hq_archHeight: number;    // m
  isDeepTunnel: boolean;
  gamma_s_effective: number; // kN/m³ (浮重度)
  p_earthPressure: number;  // kPa
  
  // 梁-弹簧最不利截面控制内力
  criticalSection: string;
  axialForce_N: number;     // kN (受压为正)
  bendingMoment_M: number;  // kN·m

  // JTG 3370.1-2018 附录 N 偏心受压验算
  liningThickness_h: number; // mm
  sectionWidth_b: number;    // mm
  as_cover: number;          // mm
  h0_section: number;        // mm (截面有效高度)
  Rw_concrete: number;       // MPa
  Rg_rebar: number;          // MPa
  Ag_rebarArea: number;      // mm²/m
  xi_b: number;
  Nb_limitAxial: number;     // kN
  isLargeEccentricity: boolean;
  compressed_x: number;      // mm
  isRebarYielded: boolean;
  eccentricity_e: number;    // mm
  Mu_limitMoment: number;    // kN·m
  actualSafetyFactor_K: number;
  allowableSafetyFactor: number;
  isSafe: boolean;
}

/**
 * 第 5 章：防排水优化设计
 */
export interface Chapter5Data {
  safetyState: SafetyState;
  
  // 超限分支专用字段
  targetSafetyFactor: number;
  criticalWaterHead_h_crit?: number;     // m
  criticalWaterPressure_P_crit?: number; // kPa
  ln_rg_crit?: number;
  C0_constant?: number;
  rg_crit?: number;                      // m
  tg_crit?: number;                      // m
  q_opt_unitDischarge?: number;          // m³/(d·m)
  Q_opt_totalDischarge?: number;         // m³/d
  P_opt_waterPressure?: number;          // kPa
  verificationErrorPercent?: number;     // %

  // 达标分支专用字段
  safeStatement?: string;

  // 排水系统自适应水力计算（曼宁公式）
  manning_n: number;
  
  // 环向盲管
  ringPipeDiam_mm: number;
  ringPipeSpacing_m: number;
  ringPipeSlope: number;
  ringPipeSideFlow: number;       // m³/d
  ringPipeCapacity: number;       // m³/d
  ringPipePassed: boolean;

  // 纵向主盲管
  longPipeDiam_mm: number;
  longPipeSlope: number;
  longPipeFlow: number;           // m³/d
  longPipeCapacity: number;       // m³/d
  longPipePassed: boolean;

  // 横向排水支管
  latPipeDiam_mm: number;
  latPipeSlope: number;
  latPipeFlow: number;           // m³/d
  latPipeCapacity: number;       // m³/d
  latPipePassed: boolean;
}

/**
 * 第 6 章：最终设计结论
 */
export interface Chapter6Data {
  groutingSchemeTable: Array<{
    item: string;
    value: string;
    unit: string;
    remark: string;
  }>;
  drainageSchemeTable: Array<{
    facility: string;
    spec: string;
    designParam: string;
    capacityMargin: string;
  }>;
  benefitComparisonTable: Array<{
    indicator: string;
    beforeValue: string;
    afterValue: string;
    changeRate: string;
    evaluation: string;
  }>;
  conclusions: string[];
}

/**
 * 完整《计算书》数据包顶层实体
 */
export interface CalculationBookData {
  meta: CalculationBookMeta;
  chapter1: Chapter1Data;
  chapter2: Chapter2Data;
  chapter3: Chapter3Data;
  chapter4: Chapter4Data;
  chapter5: Chapter5Data;
  chapter6: Chapter6Data;
}
