<!-- frontend/src/components/calculationBook/chapters/Chapter1Basis.vue -->
<template>
  <div class="chapter-block chapter-1">
    <div class="chapter-header">
      <h2 class="chapter-title"><span class="ch-num">第 1 章</span> 设计依据与计算理论</h2>
      <div class="ch-line"></div>
    </div>

    <div class="section-block">
      <h3 class="section-title">1.1 执行规范与标准</h3>
      <p class="section-desc">
        本设计计算书严格遵循国家及交通运输部现行工程技术标准与设计规范，作为结构安全性验算与水力防排水设计的法定准则：
      </p>
      <div class="table-container">
        <table class="three-line-table">
          <thead>
            <tr>
              <th style="width: 80px;">序号</th>
              <th style="width: 220px;">规范标准编号</th>
              <th>标准全称</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(spec, idx) in data.specifications" :key="spec.code">
              <td class="text-center">{{ idx + 1 }}</td>
              <td class="font-mono font-bold text-primary">{{ spec.code }}</td>
              <td>{{ spec.name }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="section-block">
      <h3 class="section-title">1.2 核心计算模型与理论依据</h3>
      <p class="section-desc">
        本平台采用多学科耦合分析方法，将地表水文入渗、深部渗流场演化与衬砌结构受力行为有机结合：
      </p>
      
      <div class="theory-grid">
        <div class="theory-card" v-for="(item, idx) in data.theories" :key="idx">
          <div class="theory-title">
            <span class="theory-idx">1.2.{{ idx + 1 }}</span>
            <span class="theory-name">{{ item.title }}</span>
          </div>
          <div class="theory-body">{{ item.description }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Chapter1Data } from '../../../utils/calculationBook/bookDataModel';

defineProps<{
  data: Chapter1Data;
}>();
</script>

<style scoped>
.chapter-block {
  margin-bottom: 8px;
}
.chapter-header {
  margin-bottom: 8px;
}
.chapter-title {
  font-size: 13pt;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 4px 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.ch-num {
  color: #2563eb;
}
.ch-line {
  height: 2px;
  background: linear-gradient(90deg, #2563eb 0%, #93c5fd 60%, transparent 100%);
  border-radius: 1px;
}
.section-block {
  margin-top: 6px;
}
.section-title {
  font-size: 10.5pt;
  font-weight: 600;
  color: #1e40af;
  margin: 0 0 4px 0;
}
.section-desc {
  font-size: 8.5pt;
  line-height: 1.4;
  color: #374151;
  margin: 0 0 4px 0;
  text-align: justify;
}
.table-container {
  margin: 4px 0;
}
.three-line-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8.5pt;
}
.three-line-table th {
  border-top: 1.5pt solid #1f2937;
  border-bottom: 0.75pt solid #4b5563;
  padding: 3px 6px;
  text-align: left;
  background-color: #f8fafc;
  color: #0f172a;
  font-weight: 600;
}
.three-line-table td {
  padding: 3px 6px;
  border-bottom: 0.5pt solid #e2e8f0;
  color: #1f2937;
}
.three-line-table tbody tr:last-child td {
  border-bottom: 1.5pt solid #1f2937;
}
.text-center {
  text-align: center;
}
.text-primary {
  color: #1d4ed8;
}
.font-mono {
  font-family: 'Consolas', 'Courier New', monospace;
}
.font-bold {
  font-weight: 600;
}
.theory-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.theory-card {
  border-left: 2.5px solid #3b82f6;
  background-color: #f8fafc;
  padding: 4px 8px;
  border-radius: 0 3px 3px 0;
}
.theory-title {
  font-size: 8.5pt;
  font-weight: 600;
  color: #1e3a8a;
  margin-bottom: 2px;
}
.theory-idx {
  margin-right: 4px;
  color: #2563eb;
}
.theory-body {
  font-size: 8pt;
  line-height: 1.35;
  color: #475569;
}
</style>
