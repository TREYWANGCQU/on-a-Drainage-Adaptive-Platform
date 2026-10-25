<!-- frontend/src/components/ui/BlueprintPreviewModal.vue -->
<template>
  <el-dialog
    v-model="visible"
    fullscreen
    destroy-on-close
    :show-close="false"
    class="blueprint-preview-dialog"
    :before-close="handleClose"
    @opened="handleOpened"
  >
    <!-- 顶部工程控制与操作工具栏 -->
    <template #header>
      <div class="blueprint-header-bar">
        <!-- 左侧：图纸属性与工程参数标签 -->
        <div class="header-left">
          <div class="header-title-box">
            <span class="blueprint-icon">📐</span>
            <span class="blueprint-title">施工图在线工程预览</span>
          </div>

          <div class="header-tags" v-if="blueprintParams">
            <el-tag
              :type="blueprintParams.isCritical ? 'danger' : 'success'"
              effect="dark"
              class="param-tag"
            >
              {{ blueprintParams.chainageText }}
              <span class="tag-divider">|</span>
              {{ blueprintParams.tunnelType === 'double' ? '双洞隧道' : '单洞隧道' }}
              <span class="tag-divider">|</span>
              {{ blueprintParams.isCritical ? '临界加固' : '原始工况' }}
            </el-tag>

            <!-- 只读工程比例尺徽标 (严格保持导出一致性) -->
            <el-tag type="info" effect="plain" class="scale-badge">
              <span class="scale-dot"></span>
              比例尺: {{ currentScaleLabel }} 
            </el-tag>
          </div>
        </div>

        <!-- 中间：跨工况快照翻页与视口平移缩放控制器 -->
        <div class="header-center">
          <!-- 跨快照快速翻页 (仅当快照列表 > 1 时激活) -->
          <div class="pagination-box" v-if="snapshotList && snapshotList.length > 1">
            <el-button
              size="small"
              :disabled="currentIndex <= 0"
              @click="handlePrevSnapshot"
              class="nav-btn"
              title="上一工况 (快捷键 ←)"
            >
              ◀ 上一工况
            </el-button>
            <span class="page-counter">{{ currentIndex + 1 }} / {{ snapshotList.length }}</span>
            <el-button
              size="small"
              :disabled="currentIndex >= snapshotList.length - 1"
              @click="handleNextSnapshot"
              class="nav-btn"
              title="下一工况 (快捷键 →)"
            >
              下一工况 ▶
            </el-button>
          </div>

          <!-- 视口平移缩放工具组 -->
          <div class="zoom-controls">
            <el-button-group size="small">
              <el-button
                :disabled="zoomScale <= 0.2"
                @click="zoomStep(-0.15)"
                title="缩小 (快捷键 滚轮向下)"
              >
                -
              </el-button>
              <el-button class="zoom-percent-display" @click="resetToOriginal">
                {{ Math.round(zoomScale * 100) }}%
              </el-button>
              <el-button
                :disabled="zoomScale >= 3.0"
                @click="zoomStep(0.15)"
                title="放大 (快捷键 滚轮向上)"
              >
                +
              </el-button>
            </el-button-group>

            <el-button
              size="small"
              class="view-action-btn"
              @click="fitToWindow"
              title="自适应窗口居中显示"
            >
              适应窗口
            </el-button>
            <el-button
              size="small"
              class="view-action-btn"
              @click="resetToOriginal"
              title="以 100% 原始像素显示"
            >
              1:1 像素
            </el-button>
          </div>
        </div>

        <!-- 右侧：快捷导出与关闭出口 -->
        <div class="header-right">
          <el-button
            type="primary"
            size="small"
            :loading="isExportingPdf"
            @click="handleExportPdf"
            class="export-btn export-pdf"
          >
            📥 导出 A3 PDF
          </el-button>
          <el-button
            type="success"
            size="small"
            :loading="isExportingPng"
            @click="handleExportPng"
            class="export-btn export-png"
          >
            🖼️ 导出高清 PNG
          </el-button>
          <el-button
            size="small"
            class="close-btn"
            @click="handleClose"
            title="关闭窗口 (Esc)"
          >
            ✕ 关闭
          </el-button>
        </div>
      </div>
    </template>

    <!-- 蓝图工程工作台视口容器 -->
    <div
      class="blueprint-viewport"
      ref="viewportRef"
      :class="{ 'is-panning': isDragging }"
      @wheel.prevent="handleWheel"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
    >
      <!-- 高精度平移与缩放画布承载层 -->
      <div
        class="blueprint-stage"
        :style="{
          transform: `translate(${translateX}px, ${translateY}px) scale(${zoomScale})`,
          transformOrigin: '0 0'
        }"
      >
        <canvas
          ref="canvasRef"
          width="4200"
          height="2970"
          class="master-blueprint-canvas"
        ></canvas>
      </div>

      <!-- 渲染状态加载遮罩 -->
      <div class="viewport-mask" v-if="isRendering">
        <div class="loading-spinner"></div>
        <div class="loading-text">正在精准重绘 A3 施工设计图矢量母版...</div>
      </div>

      <!-- 视口操作引导悬浮条 (左下角) -->
      <div class="viewport-hud-hint">
        <span class="hud-item">🖱️ 按住鼠标左键/中键平移拖拽</span>
        <span class="hud-divider">|</span>
        <span class="hud-item">🔍 滚轮以指针为锚点缩放 (20%~300%)</span>
        <span class="hud-divider">|</span>
        <span class="hud-item">⌨️ 方向键 ← / → 切换工况快照</span>
      </div>

      <!-- 缩放倍率悬浮胶囊 (右下角) -->
      <div class="viewport-zoom-badge" @click="fitToWindow" title="点击一键适应视口">
        缩放比例: {{ Math.round(zoomScale * 100) }}% ({{ zoomScale.toFixed(2) }}x)
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import type { Snapshot } from '@/store/snapshotStore';
import {
  ConstructionBlueprintGenerator,
  type BlueprintParams
} from '@/utils/blueprintGenerator';

const props = defineProps<{
  modelValue: boolean;
  snapshot: Snapshot | any;
  snapshotList?: (Snapshot | any)[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'change-snapshot', snap: Snapshot | any): void;
}>();

// 对话框显隐状态
const visible = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val)
});

// DOM 节点引用
const viewportRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

// 渲染引擎实例与参数缓存
let currentGenerator: ConstructionBlueprintGenerator | null = null;
const blueprintParams = ref<BlueprintParams | null>(null);
const currentScaleLabel = ref<string>('1:100');
const isRendering = ref<boolean>(false);
const isExportingPdf = ref<boolean>(false);
const isExportingPng = ref<boolean>(false);

// 视口变换参数 (Zoom & Pan 状态模型)
const zoomScale = ref<number>(0.25);
const translateX = ref<number>(0);
const translateY = ref<number>(0);

// 拖拽状态模型
const isDragging = ref<boolean>(false);
const dragStartX = ref<number>(0);
const dragStartY = ref<number>(0);
const originTx = ref<number>(0);
const originTy = ref<number>(0);

// 快照列表索引计算
const currentIndex = computed(() => {
  if (!props.snapshotList || props.snapshotList.length === 0 || !props.snapshot) return 0;
  const idx = props.snapshotList.findIndex((s) => s.id === props.snapshot.id);
  return idx >= 0 ? idx : 0;
});

/**
 * 适应窗口计算算法 (Fit to Window)
 */
const fitToWindow = () => {
  if (!viewportRef.value) return;
  const vpRect = viewportRef.value.getBoundingClientRect();
  if (vpRect.width <= 0 || vpRect.height <= 0) {
    requestAnimationFrame(() => fitToWindow());
    return;
  }
  const availW = Math.max(300, vpRect.width - 40);
  const availH = Math.max(200, vpRect.height - 40);

  // A3 母版标准尺寸 4200 x 2970
  const fitS = Math.min(availW / 4200, availH / 2970);
  zoomScale.value = Math.max(0.15, Math.min(1.0, fitS));

  // 居中偏移量推导
  translateX.value = Math.round((vpRect.width - 4200 * zoomScale.value) / 2);
  translateY.value = Math.round((vpRect.height - 2970 * zoomScale.value) / 2);
};

/**
 * 重置为 100% 原始像素
 */
const resetToOriginal = () => {
  if (!viewportRef.value) return;
  const vpRect = viewportRef.value.getBoundingClientRect();
  zoomScale.value = 1.0;
  translateX.value = Math.round((vpRect.width - 4200) / 2);
  translateY.value = Math.round((vpRect.height - 2970) / 2);
};

/**
 * 步进缩放控制
 */
const zoomStep = (delta: number) => {
  if (!viewportRef.value) return;
  const vpRect = viewportRef.value.getBoundingClientRect();
  const cx = vpRect.width / 2;
  const cy = vpRect.height / 2;
  const oldS = zoomScale.value;
  const newS = Math.max(0.2, Math.min(3.0, oldS + delta));
  if (Math.abs(newS - oldS) < 0.001) return;

  // 以视口中心为缩放锚点
  translateX.value = cx - (cx - translateX.value) * (newS / oldS);
  translateY.value = cy - (cy - translateY.value) * (newS / oldS);
  zoomScale.value = newS;
};

/**
 * 滚轮缩放事件处理 (基于鼠标悬停点绝对静止算法 Zoom Towards Pointer)
 */
const handleWheel = (e: WheelEvent) => {
  if (!viewportRef.value) return;
  const vpRect = viewportRef.value.getBoundingClientRect();
  const px = e.clientX - vpRect.left;
  const py = e.clientY - vpRect.top;

  const oldS = zoomScale.value;
  // 向上滚动放大，向下滚动缩小
  const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
  const newS = Math.max(0.15, Math.min(3.0, oldS * zoomFactor));
  if (Math.abs(newS - oldS) < 0.001) return;

  // 严密数学推导：t2 = p - (p - t1) * (s2 / s1)
  translateX.value = px - (px - translateX.value) * (newS / oldS);
  translateY.value = py - (py - translateY.value) * (newS / oldS);
  zoomScale.value = newS;
};

/**
 * 拖拽平移事件 (Pan)
 */
const handleMouseDown = (e: MouseEvent) => {
  // 允许鼠标左键(0)或中键(1)拖拽
  if (e.button !== 0 && e.button !== 1) return;
  isDragging.value = true;
  dragStartX.value = e.clientX;
  dragStartY.value = e.clientY;
  originTx.value = translateX.value;
  originTy.value = translateY.value;
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;
  const dx = e.clientX - dragStartX.value;
  const dy = e.clientY - dragStartY.value;
  translateX.value = originTx.value + dx;
  translateY.value = originTy.value + dy;
};

const handleMouseUp = () => {
  isDragging.value = false;
};

/**
 * 核心制图与渲染流程
 */
const renderCurrentSnapshot = async () => {
  if (!props.snapshot) return;
  await nextTick();
  if (!canvasRef.value) {
    await nextTick();
    if (!canvasRef.value) return;
  }
  isRendering.value = true;

  try {
    // 销毁上一个生成器实例
    if (currentGenerator) {
      currentGenerator.destroy();
      currentGenerator = null;
    }

    // 实例化新生成器并提取参数
    currentGenerator = new ConstructionBlueprintGenerator(props.snapshot);
    blueprintParams.value = currentGenerator.blueprintParams;
    currentScaleLabel.value = currentGenerator.scaleConfig.label;

    // 直接在 DOM Canvas 上进行高精度矢量绘制，避免多重中间位图内存拷贝
    currentGenerator.renderToCanvas(canvasRef.value);
  } catch (err: any) {
    console.error('渲染施工设计图母版失败:', err);
    ElMessage.error(`施工设计图渲染失败: ${err.message || err}`);
  } finally {
    isRendering.value = false;
  }
};

/**
 * 弹窗完全打开且过渡动画结束时的生命周期回调 (真实物理尺寸锚点)
 */
const handleOpened = async () => {
  await nextTick();
  await renderCurrentSnapshot();
  fitToWindow();
};

/**
 * 跨快照翻页
 */
const handlePrevSnapshot = () => {
  if (!props.snapshotList || currentIndex.value <= 0) return;
  const prevSnap = props.snapshotList[currentIndex.value - 1];
  emit('change-snapshot', prevSnap);
};

const handleNextSnapshot = () => {
  if (!props.snapshotList || currentIndex.value >= props.snapshotList.length - 1) return;
  const nextSnap = props.snapshotList[currentIndex.value + 1];
  emit('change-snapshot', nextSnap);
};

/**
 * 快捷导出操作
 */
const handleExportPdf = async () => {
  if (!props.snapshot) return;
  try {
    isExportingPdf.value = true;
    const generator = new ConstructionBlueprintGenerator(props.snapshot);
    await generator.exportPDF();
    generator.destroy();
    ElMessage.success('A3 施工设计图已成功导出 (PDF)');
  } catch (err: any) {
    console.error('导出 PDF 施工图失败:', err);
    ElMessage.error(`导出 PDF 失败: ${err.message || err}`);
  } finally {
    isExportingPdf.value = false;
  }
};

const handleExportPng = async () => {
  if (!props.snapshot) return;
  try {
    isExportingPng.value = true;
    const generator = new ConstructionBlueprintGenerator(props.snapshot);
    await generator.exportPNG();
    generator.destroy();
    ElMessage.success('高清施工设计图已成功导出 (PNG)');
  } catch (err: any) {
    console.error('导出 PNG 施工图失败:', err);
    ElMessage.error(`导出 PNG 失败: ${err.message || err}`);
  } finally {
    isExportingPng.value = false;
  }
};

const handleClose = () => {
  visible.value = false;
  if (currentGenerator) {
    currentGenerator.destroy();
    currentGenerator = null;
  }
};

/**
 * 键盘快捷键监听
 */
const handleKeyDown = (e: KeyboardEvent) => {
  if (!visible.value) return;
  if (e.key === 'ArrowLeft') {
    handlePrevSnapshot();
  } else if (e.key === 'ArrowRight') {
    handleNextSnapshot();
  } else if (e.key === 'Escape') {
    handleClose();
  }
};

// 监听工况与弹窗状态变化
watch(
  () => props.snapshot,
  () => {
    if (visible.value) {
      nextTick(() => {
        renderCurrentSnapshot();
      });
    }
  },
  { deep: true }
);

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      nextTick(() => {
        renderCurrentSnapshot();
        fitToWindow();
      });
    } else {
      if (currentGenerator) {
        currentGenerator.destroy();
        currentGenerator = null;
      }
    }
  }
);

const handleResize = () => {
  if (visible.value) {
    fitToWindow();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('resize', handleResize);
  if (currentGenerator) {
    currentGenerator.destroy();
    currentGenerator = null;
  }
});
</script>

<style scoped>
/* 全局字阶生理底线合规：全部字体 >= 12px */
.blueprint-preview-dialog :deep(.el-dialog__header) {
  padding: 0;
  margin: 0;
}

.blueprint-preview-dialog :deep(.el-dialog__body) {
  padding: 0;
  margin: 0;
  height: calc(100vh - 58px);
  overflow: hidden;
  background-color: #0b1120;
}

/* 顶部工具栏深色极客蓝图风格 */
.blueprint-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 58px;
  padding: 0 20px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border-bottom: 1px solid #334155;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  user-select: none;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-title-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.blueprint-icon {
  font-size: 20px;
}

.blueprint-title {
  font-size: 15px;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: 0.5px;
}

.header-tags {
  display: flex;
  align-items: center;
  gap: 10px;
}

.param-tag {
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
}

.tag-divider {
  margin: 0 4px;
  opacity: 0.5;
}

.scale-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #38bdf8;
  background: rgba(14, 165, 233, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 4px;
}

.scale-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 6px #38bdf8;
}

/* 工具栏中间控制组 */
.header-center {
  display: flex;
  align-items: center;
  gap: 16px;
}

.pagination-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(15, 23, 42, 0.6);
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid #334155;
}

.nav-btn {
  background: #1e293b;
  border-color: #475569;
  color: #e2e8f0;
  font-size: 12px;
}

.nav-btn:hover:not(:disabled) {
  background: #334155;
  color: #38bdf8;
  border-color: #38bdf8;
}

.page-counter {
  font-size: 13px;
  font-weight: 700;
  color: #cbd5e1;
  font-family: monospace;
  padding: 0 4px;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-percent-display {
  font-family: monospace;
  font-weight: 700;
  min-width: 58px;
  color: #38bdf8 !important;
  background: #0f172a !important;
  border-color: #334155 !important;
  font-size: 12px;
}

.view-action-btn {
  background: #1e293b;
  border-color: #475569;
  color: #e2e8f0;
  font-size: 12px;
}

.view-action-btn:hover {
  background: #334155;
  color: #38bdf8;
  border-color: #38bdf8;
}

/* 右侧导出与关闭动作 */
.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.export-btn {
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
}

.export-pdf {
  background: #0284c7;
  border-color: #0369a1;
}

.export-pdf:hover {
  background: #0369a1;
}

.export-png {
  background: #059669;
  border-color: #047857;
}

.export-png:hover {
  background: #047857;
}

.close-btn {
  background: transparent;
  border: 1px solid #475569;
  color: #94a3b8;
  font-size: 12px;
}

.close-btn:hover {
  background: #dc2626;
  border-color: #dc2626;
  color: #ffffff;
}

/* 蓝图工作台主视口 (显式约束绝对计算高度，防御父容器 height: auto 塌陷) */
.blueprint-viewport {
  position: relative;
  width: 100%;
  height: calc(100vh - 58px);
  min-height: calc(100vh - 58px);
  overflow: hidden;
  background-color: #0b1120;
  background-image:
    radial-gradient(#1e293b 1px, transparent 1px),
    linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 24px 24px, 120px 120px, 120px 120px;
  cursor: grab;
}

.blueprint-viewport.is-panning {
  cursor: grabbing;
}

/* 画布舞台层 */
.blueprint-stage {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}

.master-blueprint-canvas {
  display: block;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 0 1px #334155;
  background-color: #ffffff;
}

/* 加载中遮罩 */
.viewport-mask {
  position: absolute;
  inset: 0;
  background: rgba(11, 17, 32, 0.75);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  backdrop-filter: blur(4px);
  z-index: 50;
}

.loading-spinner {
  width: 44px;
  height: 44px;
  border: 3px solid rgba(56, 189, 248, 0.2);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-text {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
  letter-spacing: 0.5px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 视口底部操作指示条 (HUD) */
.viewport-hud-hint {
  position: absolute;
  bottom: 16px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(51, 65, 85, 0.7);
  border-radius: 20px;
  backdrop-filter: blur(8px);
  pointer-events: none;
  z-index: 20;
}

.hud-item {
  font-size: 12px;
  color: #94a3b8;
}

.hud-divider {
  color: #475569;
  font-size: 12px;
}

/* 缩放倍率悬浮胶囊 */
.viewport-zoom-badge {
  position: absolute;
  bottom: 16px;
  right: 20px;
  padding: 6px 14px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  font-family: monospace;
  color: #38bdf8;
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 20;
}

.viewport-zoom-badge:hover {
  background: rgba(2, 132, 199, 0.25);
  border-color: #38bdf8;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.3);
}
</style>

<!-- 穿透 Teleport 到 body 的全屏施工图模态框样式重置 -->
<style>
.blueprint-preview-dialog.el-dialog {
  padding: 0 !important;
  background-color: #0b1120 !important;
  overflow: hidden !important;
}
.blueprint-preview-dialog .el-dialog__header {
  padding: 0 !important;
  margin: 0 !important;
  border-bottom: none !important;
}
.blueprint-preview-dialog .el-dialog__body {
  padding: 0 !important;
  margin: 0 !important;
  height: calc(100vh - 58px) !important;
  max-height: calc(100vh - 58px) !important;
  overflow: hidden !important;
  background-color: #0b1120 !important;
}
</style>
