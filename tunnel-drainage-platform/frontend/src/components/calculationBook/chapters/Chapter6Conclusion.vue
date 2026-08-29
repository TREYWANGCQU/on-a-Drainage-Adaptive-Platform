<!-- frontend/src/components/calculationBook/chapters/Chapter6Conclusion.vue -->
<template>
  <div class="chapter-block chapter-6">
    <div class="chapter-header">
      <h2 class="chapter-title"><span class="ch-num">第 6 章</span> 最终设计结论与工程建议</h2>
      <div class="ch-line"></div>
    </div>

    <!-- 6.1 注浆堵水方案 -->
    <div class="section-block">
      <h3 class="section-title">6.1 注浆堵水与围岩加固设计方案</h3>
      <div class="table-container">
        <table class="three-line-table">
          <thead>
            <tr>
              <th style="width: 220px;">设计控制项</th>
              <th style="width: 140px;" class="text-right">数值/要求</th>
              <th style="width: 100px;">计量单位</th>
              <th>工程实施说明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data.groutingSchemeTable" :key="row.item">
              <td class="font-bold">{{ row.item }}</td>
              <td class="text-right font-mono font-bold text-primary">{{ row.value }}</td>
              <td>{{ row.unit }}</td>
              <td class="text-muted">{{ row.remark }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 6.2 排水系统工程实施方案 -->
    <div class="section-block">
      <h3 class="section-title">6.2 排水系统工程实施方案</h3>
      <div class="table-container">
        <table class="three-line-table">
          <thead>
            <tr>
              <th style="width: 200px;">排水设施名称</th>
              <th style="width: 180px;">推荐规格型号</th>
              <th style="width: 220px;">设计布置参数</th>
              <th>水力过流安全裕度</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data.drainageSchemeTable" :key="row.facility">
              <td class="font-bold">{{ row.facility }}</td>
              <td class="font-mono">{{ row.spec }}</td>
              <td>{{ row.designParam }}</td>
              <td class="text-success font-bold">{{ row.capacityMargin }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 6.3 优化前后效益对比 -->
    <div class="section-block">
      <h3 class="section-title">6.3 优化设计前后工程效益对比评价</h3>
      <div class="table-container">
        <table class="three-line-table">
          <thead>
            <tr>
              <th style="width: 180px;">核心评价指标</th>
              <th style="width: 130px;" class="text-right">优化前状态</th>
              <th style="width: 130px;" class="text-right">优化后状态</th>
              <th style="width: 110px;" class="text-center">变动幅度</th>
              <th>综合工程评价</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data.benefitComparisonTable" :key="row.indicator">
              <td class="font-bold">{{ row.indicator }}</td>
              <td class="text-right font-mono text-muted">{{ row.beforeValue }}</td>
              <td class="text-right font-mono font-bold text-primary">{{ row.afterValue }}</td>
              <td class="text-center font-bold text-success">{{ row.changeRate }}</td>
              <td class="font-bold">{{ row.evaluation }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 6.4 最终设计结论清单 -->
    <div class="section-block">
      <h3 class="section-title">6.4 最终设计结论与施工建议</h3>
      <div class="conclusion-list">
        <div class="conclusion-item" v-for="(item, idx) in data.conclusions" :key="idx">
          <p class="conclusion-text">{{ item }}</p>
        </div>
      </div>
    </div>

    <!-- 6.5 工程责任与会签栏 -->
    <div class="signature-block">
      <div class="sig-title">【工程设计与校审签署】</div>
      <div class="sig-grid">
        <div class="sig-item">
          <span class="sig-label">设计人：</span>
          <span class="sig-line">{{ meta.designer }}</span>
        </div>
        <div class="sig-item">
          <span class="sig-label">校核人：</span>
          <span class="sig-line">{{ meta.reviewer }}</span>
        </div>
        <div class="sig-item">
          <span class="sig-label">审核人：</span>
          <span class="sig-line">{{ meta.approver }}</span>
        </div>
        <div class="sig-item">
          <span class="sig-label">签署日期：</span>
          <span class="sig-line">{{ meta.generatedDate }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Chapter6Data, CalculationBookMeta } from '../../../utils/calculationBook/bookDataModel';

defineProps<{
  data: Chapter6Data;
  meta: CalculationBookMeta;
}>();
</script>

<style scoped>
.chapter-block {
  margin-bottom: 24px;
}
.chapter-header {
  margin-bottom: 16px;
}
.chapter-title {
  font-size: 16pt;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 6px 0;
  display: flex;
  align-items: center;
  gap: 8px;
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
  margin-top: 14px;
  page-break-inside: avoid;
}
.section-title {
  font-size: 12pt;
  font-weight: 600;
  color: #1e40af;
  margin: 0 0 8px 0;
}
.table-container {
  margin: 8px 0;
}
.three-line-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}
.three-line-table th {
  border-top: 1.5pt solid #1f2937;
  border-bottom: 0.75pt solid #4b5563;
  padding: 5px 8px;
  text-align: left;
  background-color: #f8fafc;
  color: #0f172a;
  font-weight: 600;
}
.three-line-table td {
  padding: 5px 8px;
  border-bottom: 0.5pt solid #e2e8f0;
  color: #1f2937;
}
.three-line-table tbody tr:last-child td {
  border-bottom: 1.5pt solid #1f2937;
}
.text-right {
  text-align: right;
}
.text-center {
  text-align: center;
}
.text-primary {
  color: #1d4ed8;
}
.text-success {
  color: #15803d;
}
.text-muted {
  color: #64748b;
  font-size: 8.5pt;
}
.font-mono {
  font-family: 'Consolas', 'Courier New', monospace;
}
.font-bold {
  font-weight: 600;
}
.conclusion-list {
  background: #f8fafc;
  border-left: 3.5px solid #2563eb;
  padding: 10px 14px;
  border-radius: 0 6px 6px 0;
  margin: 10px 0;
}
.conclusion-item {
  margin-bottom: 6px;
}
.conclusion-item:last-child {
  margin-bottom: 0;
}
.conclusion-text {
  font-size: 9.5pt;
  line-height: 1.6;
  color: #1e293b;
  margin: 0;
  text-align: justify;
}
.signature-block {
  margin-top: 24px;
  border: 1px dashed #cbd5e1;
  background: #ffffff;
  padding: 14px 18px;
  border-radius: 6px;
  page-break-inside: avoid;
}
.sig-title {
  font-size: 10pt;
  font-weight: 700;
  color: #334155;
  margin-bottom: 12px;
  text-align: center;
}
.sig-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.sig-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sig-label {
  font-size: 8.5pt;
  color: #64748b;
}
.sig-line {
  font-size: 9.5pt;
  font-weight: 600;
  color: #0f172a;
  border-bottom: 1px solid #94a3b8;
  padding-bottom: 2px;
}
</style>
