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
    label: '标准双洞喀斯特',
    value: 'karst_double_high',
    data: {
      tunnel_type: 'double',
      K: 0.15, h: 29, ha: 0.0, p_mm: 1025.2, Kg: 0.00864, K1: 0.00864, K2: 0.000864,
      cn_condition: '灌溉良好', land_use: '居住地', grades: 5,
      r: 7.95, r1: 8.35, r2: 8.57, rg: 10.57, c: 32, aspect_ratio: 0.7,
      start_chainage: 0, end_chainage: 47,
      concrete_grade: 'C40', rebar_type: 'HRB400', Ag: 0.0011,
      D_spacing: 43.0, P_crit: 500.0,
      I_long: 0.02, double_side: true
    }
  },
  {
    label: '标准单洞城市',
    value: 'urban_single_low',
    data: {
      tunnel_type: 'single',
      K: 0.15, h: 29, p_mm: 1025.2, Kg: 0.00864, K1: 0.00864, K2: 0.000864,
      cn_condition: '灌溉良好', land_use: '居住地', grades: 4,
      r: 7.95, r1: 8.35, r2: 8.57, rg: 10.57, c: 30, aspect_ratio: 0.7,
      start_chainage: 0, end_chainage: 47,
      concrete_grade: 'C35', rebar_type: 'HRB400', Ag: 0.002,
      P_crit: 500.0,
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