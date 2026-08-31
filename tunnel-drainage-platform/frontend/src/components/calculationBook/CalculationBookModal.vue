<!-- frontend/src/components/calculationBook/CalculationBookModal.vue -->
<template>
  <el-dialog
    v-model="visible"
    title="《隧道防排水优化设计计算书》A4 标准工程报告预览与导出"
    fullscreen
    destroy-on-close
    class="calc-book-dialog"
    :before-close="handleClose"
  >
    <!-- 顶部工具控制栏 -->
    <div class="modal-toolbar">
      <div class="toolbar-left">
        <span class="toolbar-label">📑 目录导航：</span>
        <el-radio-group v-model="activeChapter" size="small" @change="scrollToChapter">
          <el-radio-button label="chapter-1">1.依据</el-radio-button>
          <el-radio-button label="chapter-2">2.参数</el-radio-button>
          <el-radio-button label="chapter-3">3.渗流水力</el-radio-button>
          <el-radio-button label="chapter-4">4.结构验算</el-radio-button>
          <el-radio-button label="chapter-5">5.优化设计</el-radio-button>
          <el-radio-button label="chapter-6">6.结论建议</el-radio-button>
        </el-radio-group>
      </div>

      <div class="toolbar-center">
        <span class="toolbar-label">🔍 缩放：</span>
        <el-button-group size="small">
          <el-button :disabled="zoomScale <= 0.5" @click="adjustZoom(-0.1)">-</el-button>
          <el-button class="zoom-display">{{ Math.round(zoomScale * 100) }}%</el-button>
          <el-button :disabled="zoomScale >= 2.0" @click="adjustZoom(0.1)">+</el-button>
          <el-button @click="resetZoom">100%</el-button>
        </el-button-group>
      </div>

      <div class="toolbar-right">
        <el-button 
          type="primary" 
          size="small" 
          icon="Download" 
          :loading="isExporting"
          @click="handleExportVectorPDF"
        >
          📥 导出 A4 矢量 PDF (Typst 引擎)
        </el-button>
        <el-button size="small" @click="handleClose">关闭</el-button>
      </div>
    </div>

    <!-- 纸张预览主视口 -->
    <div class="preview-viewport" ref="viewportRef">
      <div 
        class="paper-canvas" 
        :style="{ transform: `scale(${zoomScale})`, transformOrigin: 'top center' }"
      >
        <CalculationReportView 
          v-if="bookData" 
          ref="reportViewRef" 
          :bookData="bookData" 
        />
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { ElMessage, ElNotification } from 'element-plus';
import type { Snapshot } from '../../store/snapshotStore';
import type { CalculationBookData } from '../../utils/calculationBook/bookDataModel';
import { generateCalculationBook } from '../../utils/calculationBook/bookGenerator';
import { exportCalculationBookPdf } from '../../utils/calculationBook/bookExporter';
import CalculationReportView from './CalculationReportView.vue';

const props = defineProps<{
  modelValue: boolean;
  snapshot: Snapshot | any;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val)
});

const reportViewRef = ref<any>(null);
const viewportRef = ref<HTMLElement | null>(null);

const activeChapter = ref<string>('chapter-1');
const zoomScale = ref<number>(1.0);
const isExporting = ref<boolean>(false);

const bookData = computed<CalculationBookData | null>(() => {
  if (!props.snapshot) return null;
  return generateCalculationBook(props.snapshot);
});

const adjustZoom = (delta: number) => {
  zoomScale.value = Math.max(0.5, Math.min(2.0, Number((zoomScale.value + delta).toFixed(2))));
};

const resetZoom = () => {
  zoomScale.value = 1.0;
};

const scrollToChapter = (chId: any) => {
  nextTick(() => {
    const el = document.getElementById(chId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
};

const handleExportVectorPDF = async () => {
  if (!bookData.value) {
    ElMessage.warning('计算书数据尚未就绪');
    return;
  }
  try {
    isExporting.value = true;
    ElMessage.info('正在调用 Typst 编译引擎生成高保真 A4 矢量 PDF...');
    const filename = await exportCalculationBookPdf(bookData.value);
    ElNotification({
      title: '导出成功',
      message: `已通过 Typst 引擎成功编译并下载: ${filename}`,
      type: 'success',
      duration: 3500
    });
  } catch (err: any) {
    console.error('导出矢量 PDF 失败:', err);
    ElMessage.error(`导出失败: ${err.message || err}`);
  } finally {
    isExporting.value = false;
  }
};

const handleClose = () => {
  visible.value = false;
};
</script>

<style scoped>
.modal-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background-color: #0f172a;
  color: #ffffff;
  border-bottom: 1px solid #1e293b;
  flex-wrap: wrap;
  gap: 12px;
}
.toolbar-left, .toolbar-center, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar-label {
  font-size: 8.5pt;
  color: #94a3b8;
}
.zoom-display {
  font-family: 'Consolas', monospace;
  font-size: 8.5pt;
  min-width: 50px;
}
.preview-viewport {
  height: calc(100vh - 125px);
  overflow-y: auto;
  overflow-x: auto;
  background-color: #334155;
  padding: 24px 0 48px 0;
  display: flex;
  justify-content: center;
}
.paper-canvas {
  transition: transform 0.15s ease-out;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  border-radius: 2px;
}
:deep(.el-dialog__header) {
  padding: 12px 18px;
  margin-right: 0;
  background: #1e293b;
  color: #ffffff;
  border-bottom: 1px solid #334155;
}
:deep(.el-dialog__title) {
  color: #f8fafc;
  font-size: 11pt;
  font-weight: 700;
}
:deep(.el-dialog__headerbtn .el-dialog__close) {
  color: #94a3b8;
}
:deep(.el-dialog__body) {
  padding: 0;
  background: #334155;
  overflow: hidden;
}
</style>
