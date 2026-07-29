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
    label: '基准单洞标准工况',
    value: 'benchmark_single',
    data: {
      tunnel_type: 'single',
      k_r: 0.15, H: 120.0, p_mm: 1000.0, k_g: 0.00864, k_p: 0.00864, k_s: 0.000864,
      cn_condition: '灌溉良好', land_use: '居住地', grades: 4,
      r_0: 7.95, r_s: 8.35, r_p: 8.57, r_g: 8.57, h_1: 130.0, aspect_ratio: 0.7,
      start_chainage: 0, end_chainage: 47,
      concrete_grade: 'C35', Ag: 1000.0,
      I_long: 0.02
    }
  },
  {
    label: '基准双洞双线工况',
    value: 'benchmark_double',
    data: {
      tunnel_type: 'double',
      k_r: 0.15, H: 120.0, p_mm: 1000.0, k_g: 0.00864, k_p: 0.00864, k_s: 0.000864,
      cn_condition: '灌溉良好', land_use: '居住地', grades: 4,
      r_0: 7.95, r_s: 8.35, r_p: 8.57, r_g: 8.57, h_1: 130.0, aspect_ratio: 0.7,
      start_chainage: 0, end_chainage: 47,
      concrete_grade: 'C35', Ag: 1000.0,
      D_spacing: 40.0,
      I_long: 0.02
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