<!-- frontend/src/components/calculationBook/CalculationReportView.vue -->
<template>
  <div class="calculation-report-document" ref="reportSheetRef">
    <!-- 第 1 页：封面、设计依据与基础参数 -->
    <div class="report-page" id="page-1">
      <div class="page-running-header">
        <span class="project-tag">{{ bookData.meta.projectName }}</span>
        <span class="report-code font-mono">{{ bookData.meta.reportCode }}</span>
      </div>

      <div class="page-content">
        <!-- 封面主标题 -->
        <div class="report-cover-header">
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

        <!-- 第 1 章与第 2 章 -->
        <Chapter1Basis id="chapter-1" :data="bookData.chapter1" />
        <Chapter2Params id="chapter-2" :data="bookData.chapter2" />
      </div>

      <div class="page-running-footer">
        <span class="footer-left">{{ bookData.meta.projectName }} · {{ bookData.meta.documentTitle }}</span>
        <span class="footer-center font-mono">生成日期：{{ bookData.meta.generatedDate }}</span>
        <span class="footer-right font-mono">第 1 页 · 共 4 页</span>
      </div>
    </div>

    <!-- 第 2 页：原始渗流水力计算 -->
    <div class="report-page" id="page-2">
      <div class="page-running-header">
        <span class="project-tag">{{ bookData.meta.projectName }}</span>
        <span class="report-code font-mono">{{ bookData.meta.reportCode }} · 渗流水力篇</span>
      </div>

      <div class="page-content">
        <Chapter3Seepage id="chapter-3" :data="bookData.chapter3" />
      </div>

      <div class="page-running-footer">
        <span class="footer-left">{{ bookData.meta.projectName }} · {{ bookData.meta.documentTitle }}</span>
        <span class="footer-center font-mono">生成日期：{{ bookData.meta.generatedDate }}</span>
        <span class="footer-right font-mono">第 2 页 · 共 4 页</span>
      </div>
    </div>

    <!-- 第 3 页：结构受力验算与防排水优化设计 -->
    <div class="report-page" id="page-3">
      <div class="page-running-header">
        <span class="project-tag">{{ bookData.meta.projectName }}</span>
        <span class="report-code font-mono">{{ bookData.meta.reportCode }} · 结构与优化篇</span>
      </div>

      <div class="page-content">
        <Chapter4Mech id="chapter-4" :data="bookData.chapter4" />
        <Chapter5Optimize id="chapter-5" :data="bookData.chapter5" />
      </div>

      <div class="page-running-footer">
        <span class="footer-left">{{ bookData.meta.projectName }} · {{ bookData.meta.documentTitle }}</span>
        <span class="footer-center font-mono">生成日期：{{ bookData.meta.generatedDate }}</span>
        <span class="footer-right font-mono">第 3 页 · 共 4 页</span>
      </div>
    </div>

    <!-- 第 4 页：最终设计结论与工程会签 -->
    <div class="report-page" id="page-4">
      <div class="page-running-header">
        <span class="project-tag">{{ bookData.meta.projectName }}</span>
        <span class="report-code font-mono">{{ bookData.meta.reportCode }} · 设计结论篇</span>
      </div>

      <div class="page-content">
        <Chapter6Conclusion id="chapter-6" :data="bookData.chapter6" :meta="bookData.meta" />
      </div>

      <div class="page-running-footer">
        <span class="footer-left">{{ bookData.meta.projectName }} · {{ bookData.meta.documentTitle }}</span>
        <span class="footer-center font-mono">生成日期：{{ bookData.meta.generatedDate }}</span>
        <span class="footer-right font-mono">第 4 页 · 共 4 页</span>
      </div>
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
/* 文档根容器 */
.calculation-report-document {
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: transparent;
}

/* A4 单页排版母版视图 (210mm 宽标准纸张，自适应内容高度且保证页脚常驻) */
.report-page {
  width: 210mm;
  min-height: 297mm;
  height: auto;
  padding: 12mm 15mm 10mm 15mm;
  margin: 0 auto;
  background: #ffffff;
  color: #1f2937;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.18);
  border-radius: 2px;
  overflow: visible;
}

.page-content {
  flex: 1;
}

/* 页眉 */
.page-running-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 6px;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 12px;
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

/* 页脚 */
.page-running-footer {
  margin-top: 14px;
  padding-top: 6px;
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

/* 封面主标题栏 */
.report-cover-header {
  margin-bottom: 16px;
  padding-bottom: 8px;
}
.main-doc-title {
  font-size: 18pt;
  font-weight: 800;
  color: #0f172a;
  text-align: center;
  margin: 6px 0 6px 0;
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
  margin-top: 10px;
  border-radius: 1.5px;
}

.font-mono {
  font-family: 'Consolas', 'Courier New', monospace;
}
</style>
