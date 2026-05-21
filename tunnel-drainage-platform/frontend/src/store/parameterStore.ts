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

// 单洞参数结构 (25个参数)
export interface SingleTubeParams extends AdvancedParams {
  tunnel_type: 'single';
  K: number; h: number; p_mm: number; Kg: number; K1: number; K2: number;
  cn_condition: string; land_use: string; grades: number;
  r: number; r1: number; r2: number; rg: number; c: number; aspect_ratio: number;
  start_chainage: number; end_chainage: number; // 分区里程
  concrete_grade: string; rebar_type: string; Ag: number;
  beta2: number;  P_crit: number;
  I_long: number; double_side: boolean;
}

// 双洞参数结构 (27个参数)
export interface DoubleTubeParams extends AdvancedParams {
  tunnel_type: 'double';
  K: number; h: number; ha: number; p_mm: number; Kg: number; K1: number; K2: number;
  cn_condition: string; land_use: string; grades: number; 
  r: number; r1: number; r2: number; rg: number; c: number; aspect_ratio: number;
  start_chainage: number; end_chainage: number; // 分区里程
  concrete_grade: string; rebar_type: string; Ag: number;
  D_spacing: number; beta2: number; P_crit: number;
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

    // 单洞状态机初始化
    singleParams: {
      tunnel_type: 'single',
      K: 0, h: 0, p_mm: 0, Kg: 0, K1: 0, K2: 0,
      cn_condition: '灌溉良好', land_use: '林地', grades: 3,
      r: 0, r1: 0, r2: 0, rg: 0, c: 0, aspect_ratio: 0.7,
      start_chainage: 0, end_chainage: 0,
      concrete_grade: 'C30', rebar_type: 'HRB400', Ag: 0,
      beta2: 1.0, P_crit: 0.0,
      I_long: 0.02, double_side: true,
      ...defaultAdvancedSettings
    } as SingleTubeParams,

    // 双洞状态机初始化
    doubleParams: {
      tunnel_type: 'double',
      K: 0, h: 0, ha: 0, p_mm: 0, Kg: 0, K1: 0, K2: 0,
      cn_condition: '灌溉良好', land_use: '林地', grades: 3,
      r: 0, r1: 0, r2: 0, rg: 0, c: 0,
      start_chainage: 0, end_chainage: 0,
      concrete_grade: 'C30', rebar_type: 'HRB400', Ag: 0,
      D_spacing: 0, beta2: 1.0,  P_crit: 0.0,
      I_long: 0.02, double_side: true,
      ...defaultAdvancedSettings
    } as DoubleTubeParams
  }),

  getters: {
    // 获取当前计算所需的完整负荷数据
    currentPayload: (state) => {
      return state.activeTunnelType === 'single' ? state.singleParams : state.doubleParams;
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