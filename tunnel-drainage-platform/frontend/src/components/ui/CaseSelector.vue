<template>
  <div class="case-selector">
    <span class="label">典型工程案例快速预设：</span>
    <el-select 
      v-model="selectedCase" 
      placeholder="请选择典型工况案例" 
      @change="handleCaseChange"
      style="width: 240px;"
    >
      <el-option
        v-for="item in caseOptions"
        :key="item.value"
        :label="item.label"
        :value="item.value"
      />
    </el-select>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useParameterStore } from '@/store/parameterStore';

const paramStore = useParameterStore();
const selectedCase = ref('');

// 封装案例库源数据 (可后续扩展至 JSON 文件或后端接口)
const caseOptions = [
  {
    label: '标准岩溶发育区双洞',
    value: 'karst_double_high',
    data: {
      tunnel_type: 'double',
      K: 0.5, h: 60, ha: 0.0, p_mm: 1200, Kg: 0.05, K1: 0.005, K2: 0.0001,
      cn_condition: '灌溉较差', land_use: '林地', grades: 5,
      r: 5.5, r1: 5.8, r2: 6.3, rg: 10.0, c: 150, aspect_ratio: 0.7,
      start_chainage: 1000, end_chainage: 2000,
      concrete_grade: 'C35', rebar_type: 'HRB400', Ag: 0.002,
      D_spacing: 30.0, beta2: 1.0, P_crit: 0.0,
      I_long: 0.02, double_side: true
    }
  },
  {
    label: '高水压富水断层单洞',
    value: 'fault_single_high',
    data: {
      tunnel_type: 'single',
      K: 1.2, h: 80, p_mm: 1500, Kg: 0.1, K1: 0.01, K2: 0.0005,
      cn_condition: '灌溉良好', land_use: '农业用地', grades: 6,
      r: 5.0, r1: 5.3, r2: 5.8, rg: 9.0, c: 200, aspect_ratio: 0.7,
      start_chainage: 500, end_chainage: 1500,
      concrete_grade: 'C40', rebar_type: 'HRB500', Ag: 0.0025,
      beta2: 0.8, P_crit: 0.0,
      I_long: 0.03, double_side: true
    }
  },
  {
    label: '浅埋城市微承压单洞',
    value: 'urban_single_low',
    data: {
      tunnel_type: 'single',
      K: 0.1, h: 15, p_mm: 800, Kg: 0.02, K1: 0.002, K2: 0.0001,
      cn_condition: '灌溉较差', land_use: '居住地', grades: 4,
      r: 6.0, r1: 6.3, r2: 6.8, rg: 8.0, c: 30, aspect_ratio: 0.7,
      start_chainage: 0, end_chainage: 800,
      concrete_grade: 'C30', rebar_type: 'HRB400', Ag: 0.0015,
      beta2: 1.0, P_crit: 0.0,
      I_long: 0.015, double_side: false
    }
  },
  {
    label: '深埋山区常规双洞',
    value: 'mountain_double_low',
    data: {
      tunnel_type: 'double',
      K: 0.2, h: 25, ha: 5.0, p_mm: 1000, Kg: 0.03, K1: 0.003, K2: 0.0002,
      cn_condition: '灌溉良好', land_use: '工业用地', grades: 3, CN: 80.0,
      r: 5.5, r1: 5.8, r2: 6.3, rg: 8.5, c: 80, aspect_ratio: 0.7,
      start_chainage: 3000, end_chainage: 4500,
      concrete_grade: 'C35', rebar_type: 'HRB400', Ag: 0.0018,
      D_spacing: 25.0, beta2: 1.0, P_crit: 0.0,
      I_long: 0.02, double_side: true
    }
  }
];

const handleCaseChange = (val: string) => {
  const targetCase = caseOptions.find(c => c.value === val);
  if (targetCase && targetCase.data) {
    // 触发 store 全量覆写，瞬间完成 38/40 个参数的自动赋值
    paramStore.overrideAll(targetCase.data, targetCase.data.tunnel_type as 'single' | 'double');
  }
};
</script>

<style scoped>
.case-selector {
  display: flex;
  align-items: center;
  
}
.label {
  font-size: 14px;
  color: var(--el-text-color-regular);
  font-weight: bold;
}
</style>