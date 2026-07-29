// frontend/src/store/parameterStore.ts
import { defineStore } from 'pinia';

// --- 类型定义 ---
// 提取 13 个高级设置默认参数作为公共基础接口
interface AdvancedParams {
  as_mm: number;
  gamma: number;
  n_long: number;
  n_ring: number;
  I_ring: number;
  n_lat: number;
  I_lat: number;
  S_code_max: number;
  S_min: number;
  d_ring_default: number;
  d_long_default: number;
  d_lat_default: number;
  tol_safety_factor: number;
}

// 单洞参数结构 (24个核心/复选参数 + 13个高级参数)
export interface SingleTubeParams extends AdvancedParams {
  tunnel_type: 'single';
  K: number; h: number; p_mm: number; Kg: number; K1: number; K2: number;
  cn_condition: string; land_use: string; grades: number;
  r: number; r1: number; r2: number; rg: number; c: number; aspect_ratio: number;
  start_chainage: number; end_chainage: number; // 分区里程
  concrete_grade: string; rebar_type: string; Ag: number;
  P_crit: number;
  I_long: number; double_side: boolean;
}

// 双洞参数结构 (26个核心/复选参数 + 13个高级参数)
export interface DoubleTubeParams extends AdvancedParams {
  tunnel_type: 'double';
  K: number; h: number; ha: number; p_mm: number; Kg: number; K1: number; K2: number;
  cn_condition: string; land_use: string; grades: number; 
  r: number; r1: number; r2: number; rg: number; c: number; aspect_ratio: number;
  start_chainage: number; end_chainage: number; // 分区里程
  concrete_grade: string; rebar_type: string; Ag: number;
  D_spacing: number; P_crit: number;
  I_long: number; double_side: boolean;
}

// 统一的默认高级参数对象（规范推荐值/经验值）
const defaultAdvancedSettings = {
  as_mm: 50.0,
  gamma: 10.0,
  n_long: 0.012,
  n_ring: 0.012,
  I_ring: 0.73,
  n_lat: 0.012,
  I_lat: 0.01,
  S_code_max: 10.0,
  S_min: 3.0,
  d_ring_default: 0.050,
  d_long_default: 0.100,
  d_lat_default: 0.080,
  tol_safety_factor: 2.0
};

export const useParameterStore = defineStore('parameter', {
  state: () => ({
    // 当前激活的隧道类型
    activeTunnelType: 'single' as 'single' | 'double',
    
    // 脏数据标记与结果容器
    isDirty: false,
    currentResults: null as any | null,

    // 单洞状态机初始化 (包含规范推荐默认物理数值)
    singleParams: {
      tunnel_type: 'single',
      K: 0.15, h: 120.0, p_mm: 1000.0, Kg: 0.00864, K1: 0.00864, K2: 0.000864,
      cn_condition: '灌溉良好', land_use: '居住地', grades: 4,
      r: 7.95, r1: 8.35, r2: 8.57, rg: 8.57, c: 130.0, aspect_ratio: 0.7,
      start_chainage: 0, end_chainage: 47,
      concrete_grade: 'C35', rebar_type: 'HRB400', Ag: 1000.0,
      P_crit: 500.0,
      I_long: 0.02, double_side: true,
      ...defaultAdvancedSettings
    } as SingleTubeParams,

    // 双洞状态机初始化
    doubleParams: {
      tunnel_type: 'double',
      K: 0.15, h: 120.0, ha: 0.0, p_mm: 1000.0, Kg: 0.00864, K1: 0.00864, K2: 0.000864,
      cn_condition: '灌溉良好', land_use: '居住地', grades: 4,
      r: 7.95, r1: 8.35, r2: 8.57, rg: 8.57, c: 130.0, aspect_ratio: 0.7,
      start_chainage: 0, end_chainage: 47,
      concrete_grade: 'C35', rebar_type: 'HRB400', Ag: 1000.0,
      D_spacing: 40.0, P_crit: 500.0,
      I_long: 0.02, double_side: true,
      ...defaultAdvancedSettings
    } as DoubleTubeParams
  }),

  getters: {
    // 获取当前计算所需的完整负荷数据
    currentPayload: (state) => {
      return state.activeTunnelType === 'single' ? state.singleParams : state.doubleParams;
    },
    // 是否存在临界超限加固解
    hasCriticalState: (state) => {
      return Boolean(state.currentResults?.critical_state && Object.keys(state.currentResults.critical_state).length > 0);
    },
    // 原始状态计算结果
    originalState: (state) => {
      return state.currentResults?.original_state ?? null;
    },
    // 临界状态计算结果
    criticalState: (state) => {
      return state.currentResults?.critical_state ?? null;
    }
  },

  actions: {
    // 单字段更新，支持表单双向绑定与精确修改
    updateParam<K extends keyof SingleTubeParams | keyof DoubleTubeParams>(key: K, value: any) {
      if (this.activeTunnelType === 'single') {
        (this.singleParams as any)[key] = value;
      } else {
        (this.doubleParams as any)[key] = value;
      }
      
      // 影响范围：切断三维视觉映射链路
      this.isDirty = true;
      this.currentResults = null;
    },

    // 扩展第三个参数 results，用于快照回溯时同步恢复计算结果
    overrideAll(data: any, type: 'single' | 'double' = 'single', results: any = null) {
      this.activeTunnelType = type;
      if (type === 'single') {
        this.singleParams = { ...this.singleParams, ...data };
      } else {
        this.doubleParams = { ...this.doubleParams, ...data };
      }
      
      // 全量覆写视作加载干净的历史状态
      this.currentResults = results;
      this.isDirty = false;
    },

    switchTunnelType(type: 'single' | 'double') {
      this.activeTunnelType = type;
      
      // 影响范围：切断三维视觉映射链路
      this.isDirty = true;
      this.currentResults = null;
    },
    
    // 接收后端最新计算结果，清除脏标记
    setCalculatedResults(results: any) {
      this.currentResults = results;
      this.isDirty = false;
    }
  }
});