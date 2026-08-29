<!-- frontend/src/components/calculationBook/CalculationReportView.vue -->
<template>
  <div class="calculation-report-sheet" ref="reportSheetRef">
    <!-- 封面与工程标题栏 -->
    <div class="report-cover-header">
      <div class="header-top-meta">
        <span class="project-tag">{{ bookData.meta.projectName }}</span>
        <span class="report-code font-mono">{{ bookData.meta.reportCode }}</span>
      </div>
      
      <h1 class="main-doc-title">{{ bookData.meta.documentTitle }}</h1>
      <div class="sub-doc-title">
        <span>工程区段：{{ bookData.meta.tunnelName }}</span>
        <span class="divider">|</span>
        <span>计算里程：DK{{ bookData.meta.startChainage.toFixed(0) }} ~ DK{{ bookData.meta.endChainage.toFixed(0) }} (L = {{ bookData.meta.partitionLength.toFixed(1) }}m)</span>
        <span class="divider">|</span>
        <span>工况备注：{{ bookData.meta.snapshotRemark }}</span>
      </div>
      <div class="title-bottom-bar"></div>
    </div>

    <!-- 6 大核心章节按序装配 -->
    <div class="chapters-container">
      <Chapter1Basis id="chapter-1" :data="bookData.chapter1" />
      <Chapter2Params id="chapter-2" :data="bookData.chapter2" />
      <Chapter3Seepage id="chapter-3" :data="bookData.chapter3" />
      <Chapter4Mech id="chapter-4" :data="bookData.chapter4" />
      <Chapter5Optimize id="chapter-5" :data="bookData.chapter5" />
      <Chapter6Conclusion id="chapter-6" :data="bookData.chapter6" :meta="bookData.meta" />
    </div>

    <!-- 打印专用页脚（CSS Paged Media 配合） -->
    <div class="report-print-footer">
      <span>{{ bookData.meta.projectName }} · {{ bookData.meta.documentTitle }}</span>
      <span class="print-time font-mono">生成时间：{{ bookData.meta.generatedDate }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { CalculationBookData } from '../../utils/calculationBook/bookDataModel';
import Chapter1Basis from './chapters/Chapter1Basis.vue';
import Chapter2Params from './chapters/Chapter2Params.vue';
import Chapter3Seepage from './chapters/Chapter3Seepage.vue';
import Chapter4Mech from './chapters/Chapter4Mech.vue';
import Chapter5Optimize from './chapters/Chapter5Optimize.vue';
import Chapter6Conclusion from './chapters/Chapter6Conclusion.vue';

defineProps<{
  bookData: CalculationBookData;
}>();

const reportSheetRef = ref<HTMLElement | null>(null);

defineExpose({
  reportSheetRef
});
</script>

<style scoped>
/* A4 纸张排版母版视图 */
.calculation-report-sheet {
  width: 210mm;
  min-height: 297mm;
  padding: 20mm 16mm;
  margin: 0 auto;
  background: #ffffff;
  color: #1f2937;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  box-sizing: border-box;
  position: relative;
}

/* 顶部标题栏 */
.report-cover-header {
  margin-bottom: 24px;
  padding-bottom: 12px;
}
.header-top-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.project-tag {
  font-size: 9.5pt;
  font-weight: 600;
  color: #2563eb;
  background: #eff6ff;
  padding: 2px 8px;
  border-radius: 4px;
}
.report-code {
  font-size: 9pt;
  color: #64748b;
  font-weight: 600;
}
.main-doc-title {
  font-size: 20pt;
  font-weight: 800;
  color: #0f172a;
  text-align: center;
  margin: 12px 0 8px 0;
  letter-spacing: 1px;
}
.sub-doc-title {
  font-size: 9.5pt;
  color: #475569;
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.divider {
  color: #cbd5e1;
}
.title-bottom-bar {
  height: 3px;
  background: linear-gradient(90deg, #1e40af 0%, #3b82f6 50%, #93c5fd 100%);
  margin-top: 14px;
  border-radius: 1.5px;
}

.chapters-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.report-print-footer {
  margin-top: 30px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  font-size: 8pt;
  color: #94a3b8;
}

.font-mono {
  font-family: 'Consolas', 'Courier New', monospace;
}
</style>
