<!-- frontend/src/components/three/Viewer3D.vue -->
<template>
  <div class="viewer-container" ref="containerRef">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, toRaw, computed } from 'vue';
import * as THREE from 'three';
import { useSnapshotStore } from '@/store/snapshotStore';

// 引入底层实例生成器（依据文件路径结构推断）
import { TunnelGenerator } from './TunnelGenerator';
import { Reinforcement } from './Reinforcement';

// DOM 引用
const containerRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

// Three.js 核心上下文
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;

// 几何构建管线实例
let tunnelGen: TunnelGenerator | null = null;
let reinforcementGen: Reinforcement | null = null;

// 状态库绑定
const snapshotStore = useSnapshotStore();

// 提取当前激活的计算快照（此处以散列快照池中最新的计算节点作为 activeSnapshot）
const activeSnapshot = computed(() => {
  const length = snapshotStore.snapshots.length;
  return length > 0 ? snapshotStore.snapshots[length - 1] : null;
});

// 节流阀控制状态
let renderFrameId: number | null = null;
let isRendering = false;

// ==========================================
// 1. 画布初始化与硬件加速声明
// ==========================================
const initWebGL = () => {
  if (!canvasRef.value || !containerRef.value) return;

  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,                 // 开启硬件抗锯齿
    logarithmicDepthBuffer: true,    // 开启对数深度缓冲，解决长距离隧道 Z-Fighting
    alpha: true
  });

  // 适配高分屏设备像素比
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);

  // 场景与相机基础分配
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
  camera.position.set(0, 10, 50);

  // 实例化底层几何拼装器
  tunnelGen = new TunnelGenerator(scene);
  reinforcementGen = new Reinforcement(scene);

  scheduleRender();
};

// ==========================================
// 3. 防抖节流下发管道
// ==========================================
const scheduleRender = () => {
  if (isRendering) return;
  isRendering = true;

  if (renderFrameId !== null) {
    cancelAnimationFrame(renderFrameId);
  }

  // 采用 requestAnimationFrame 将高频状态变更收束为单次渲染调用
  renderFrameId = requestAnimationFrame(() => {
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
    isRendering = false;
  });
};

const dispatchToPipeline = (rawData: any) => {
  if (!rawData || !tunnelGen || !reinforcementGen) return;
  
  // 将裸数据打包下发至底层网格生成器
  tunnelGen.update(rawData.params, rawData.results);
  reinforcementGen.update(rawData.params, rawData.results);
  
  // 触发脏标记后调度渲染
  scheduleRender();
};

// ==========================================
// 2. 数据单向监听与解包
// ==========================================
watch(
  activeSnapshot,
  (newSnap) => {
    if (newSnap) {
      // 阻断 Vue Proxy 响应式系统对 Three.js 大体量对象的性能干涉，提取纯 JS 对象
      const rawSnapshot = toRaw(newSnap);
      dispatchToPipeline(rawSnapshot);
    }
  },
  { deep: true }
);

// 窗口尺寸动态自适应
const handleResize = () => {
  if (!containerRef.value || !camera || !renderer) return;
  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  scheduleRender();
};

onMounted(() => {
  initWebGL();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  if (renderFrameId !== null) {
    cancelAnimationFrame(renderFrameId);
  }
  renderer?.dispose();
});
</script>

<style scoped>
.viewer-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  background-color: #2a2a2a; /* 继承外层深色背景基调 */
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>