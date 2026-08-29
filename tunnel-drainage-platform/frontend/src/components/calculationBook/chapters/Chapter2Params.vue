<!-- frontend/src/components/calculationBook/chapters/Chapter2Params.vue -->
<template>
  <div class="chapter-block chapter-2">
    <div class="chapter-header">
      <h2 class="chapter-title"><span class="ch-num">第 2 章</span> 基础计算参数清单</h2>
      <div class="ch-line"></div>
    </div>

    <!-- 2.1 几何参数 -->
    <div class="section-block">
      <h3 class="section-title">2.1 隧道断面与空间几何参数</h3>
      <div class="table-container">
        <table class="three-line-table">
          <thead>
            <tr>
              <th style="width: 200px;">参数名称</th>
              <th style="width: 100px;">符号</th>
              <th style="width: 110px;" class="text-right">数值</th>
              <th style="width: 80px;">单位</th>
              <th>工程说明与备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in data.geometryParams" :key="item.name">
              <td class="font-bold">{{ item.name }}</td>
              <td class="latex-cell" v-html="renderSym(item.symbol)"></td>
              <td class="text-right font-mono font-bold">{{ item.value }}</td>
              <td>{{ item.unit }}</td>
              <td class="text-muted">{{ item.remark }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 2.2 水文地质参数 -->
    <div class="section-block">
      <h3 class="section-title">2.2 水文地质与渗透力学参数</h3>
      <div class="table-container">
        <table class="three-line-table">
          <thead>
            <tr>
              <th style="width: 200px;">参数名称</th>
              <th style="width: 100px;">符号</th>
              <th style="width: 110px;" class="text-right">数值</th>
              <th style="width: 80px;">单位</th>
              <th>工程说明与备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in data.hydrogeologyParams" :key="item.name">
              <td class="font-bold">{{ item.name }}</td>
              <td class="latex-cell" v-html="renderSym(item.symbol)"></td>
              <td class="text-right font-mono font-bold">{{ item.value }}</td>
              <td>{{ item.unit }}</td>
              <td class="text-muted">{{ item.remark }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 2.3 结构与材料参数 -->
    <div class="section-block">
      <h3 class="section-title">2.3 衬砌结构与材料力学参数</h3>
      <div class="table-container">
        <table class="three-line-table">
          <thead>
            <tr>
              <th style="width: 200px;">参数名称</th>
              <th style="width: 100px;">符号</th>
              <th style="width: 110px;" class="text-right">数值</th>
              <th style="width: 80px;">单位</th>
              <th>工程说明与备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in data.structuralParams" :key="item.name">
              <td class="font-bold">{{ item.name }}</td>
              <td class="latex-cell" v-html="renderSym(item.symbol)"></td>
              <td class="text-right font-mono font-bold">{{ item.value }}</td>
              <td>{{ item.unit }}</td>
              <td class="text-muted">{{ item.remark }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Chapter2Data } from '../../../utils/calculationBook/bookDataModel';
import { renderInline } from '../../../utils/calculationBook/formulaTemplates';

defineProps<{
  data: Chapter2Data;
}>();

const renderSym = (sym: string) => {
  if (!sym || sym === '-') return '-';
  return renderInline(sym);
};
</script>

<style scoped>
.chapter-block {
  margin-bottom: 4px;
}
.chapter-header {
  margin-bottom: 6px;
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
  font-size: 10pt;
  font-weight: 600;
  color: #1e40af;
  margin: 0 0 3px 0;
}
.table-container {
  margin: 2px 0 6px 0;
}
.three-line-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8pt;
}
.three-line-table th {
  border-top: 1.5pt solid #1f2937;
  border-bottom: 0.75pt solid #4b5563;
  padding: 2.5px 5px;
  text-align: left;
  background-color: #f8fafc;
  color: #0f172a;
  font-weight: 600;
}
.three-line-table td {
  padding: 2px 5px;
  border-bottom: 0.5pt solid #e2e8f0;
  color: #1f2937;
}
.three-line-table tbody tr:last-child td {
  border-bottom: 1.5pt solid #1f2937;
}
.text-right {
  text-align: right;
}
.text-muted {
  color: #64748b;
  font-size: 7.5pt;
}
.font-mono {
  font-family: 'Consolas', 'Courier New', monospace;
}
.font-bold {
  font-weight: 600;
}
.latex-cell {
  font-size: 8.5pt;
}
</style>
