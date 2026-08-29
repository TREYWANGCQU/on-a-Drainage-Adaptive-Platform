<!-- frontend/src/components/calculationBook/CalculationReportView.vue -->
<template>
  <div class="calculation-report-sheet" ref="reportSheetRef">
    <!-- 顶部封面与工程标题栏 -->
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

    <!-- 6 大核心章节连续排布，保持自然紧凑与逻辑连贯 -->
    <div class="chapters-flow">
      <Chapter1Basis id="chapter-1" :data="bookData.chapter1" />
      <Chapter2Params id="chapter-2" :data="bookData.chapter2" />
      <Chapter3Seepage id="chapter-3" :data="bookData.chapter3" />
      <Chapter4Mech id="chapter-4" :data="bookData.chapter4" />
      <Chapter5Optimize id="chapter-5" :data="bookData.chapter5" />
      <Chapter6Conclusion id="chapter-6" :data="bookData.chapter6" :meta="bookData.meta" />
    </div>

    <!-- 底部工程校核页脚 -->
    <div class="report-document-footer">
      <span class="footer-left">{{ bookData.meta.projectName }} · {{ bookData.meta.documentTitle }}</span>
      <span class="footer-center font-mono">生成日期：{{ bookData.meta.generatedDate }}</span>
      <span class="footer-right font-mono">{{ bookData.meta.reportCode }}</span>
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
/* A4 标准纵向文档视图 (210mm 宽，连续流动排版) */
.calculation-report-sheet {
  width: 210mm;
  min-height: 297mm;
  padding: 16mm 16mm 14mm 16mm;
  margin: 0 auto;
  background: #ffffff;
  color: #1f2937;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif;
  box-sizing: border-box;
  position: relative;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  border-radius: 2px;
}

/* 顶部封面主标题栏 */
.report-cover-header {
  margin-bottom: 18px;
  padding-bottom: 10px;
}
.header-top-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.project-tag {
  font-size: 8.5pt;
  font-weight: 600;
  color: #2563eb;
  background: #eff6ff;
  padding: 1px 6px;
  border-radius: 3px;
}
.report-code {
  font-size: 8.5pt;
  color: #64748b;
  font-weight: 600;
}
.main-doc-title {
  font-size: 19pt;
  font-weight: 800;
  color: #0f172a;
  text-align: center;
  margin: 8px 0 6px 0;
  letter-spacing: 1px;
}
.sub-doc-title {
  font-size: 9pt;
  color: #475569;
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.divider {
  color: #cbd5e1;
}
.title-bottom-bar {
  height: 2.5px;
  background: linear-gradient(90deg, #1e40af 0%, #3b82f6 50%, #93c5fd 100%);
  margin-top: 12px;
  border-radius: 1.5px;
}

/* 章节连续流动容器 */
.chapters-flow {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 底部文档页脚 */
.report-document-footer {
  margin-top: 24px;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 8pt;
  color: #94a3b8;
}
.footer-left {
  flex: 1;
  text-align: left;
}
.footer-center {
  flex: 1;
  text-align: center;
}
.footer-right {
  flex: 1;
  text-align: right;
  font-weight: 600;
  color: #64748b;
}

.font-mono {
  font-family: 'Consolas', 'Courier New', monospace;
}
</style>
