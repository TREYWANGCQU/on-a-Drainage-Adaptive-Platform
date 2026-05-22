<!-- frontend/src/components/three/Viewer3D.vue -->
<template>
  <div class="viewer-container" ref="containerRef">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, toRaw, computed } from 'vue';
import * as THREE from 'three';
import { useSnapshotStore, ITunnelParams } from '@/store/snapshotStore';

// 引入轨道控制器以支持场景旋转、缩放、平移
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// 引入底层实例生成器
import { TunnelGenerator, TunnelType } from './TunnelGenerator';
import { ReinforcementManager, RockBoltGenerator } from './Reinforcement';

// DOM 引用
const containerRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

// Three.js 核心上下文
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls; // 控制器实例句柄

// 追踪当前场景中已挂载的流水分段网格实例，便于刷新时统一清理
let activeMeshes: THREE.Object3D[] = [];

// 状态库绑定
const snapshotStore = useSnapshotStore();


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
  camera.position.set(0, 30, 80);

   // --- 解决问题：挂载交互控制键 ---
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, -50); 
  // 核心约束：监听操纵变更按需触发重绘，规避高功耗死循环渲染
  controls.addEventListener('change', scheduleRender);

  // 补充基础光源配置 (支持 MeshStandardMaterial 光照模型)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(20, 40, 20);
  scene.add(dirLight);
  // 注：几何体实例推迟至具有实际数据参数时懒加载

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


  // rAF微秒级节流：合并滑块拖拽等高频状态变更，限制底层渲染器调用频次

  renderFrameId = requestAnimationFrame(() => {
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
    isRendering = false;
  });
};
// 核心重构：遍历所有勾选的快照节点，提取各自的起止里程和断面参数进行纵向拼装
const renderSelectedSnapshots = () => {
  if (!scene) return;

  // 1. 卸载并清理历史渲染管道实例
  activeMeshes.forEach(mesh => scene.remove(mesh));
  activeMeshes = [];

  // 2. 筛选勾选状态的工况进行空间组装出图
  const selected = snapshotStore.snapshots.filter((s: any) => s.selectedFor3D);
  

  selected.forEach((snap: any) => {
    const rawData = toRaw(snap);
    if (!rawData) return;
    // 兼容性降级提取：优先匹配快照根节点里程，其次提取内部参数副本
    const start_chainage = Number(rawData.start_chainage ?? rawData.params?.start_chainage ?? 0);
    const end_chainage = Number(rawData.end_chainage ?? rawData.params?.end_chainage ?? 0);
    const params = rawData.params;
    if (!params) return;
    const { r, r1, r2, rg, c, tunnel_type, aspect_ratio = 1.0, D_spacing = 30.0 } = params;
    const tType = tunnel_type === 'double' ? TunnelType.DOUBLE : TunnelType.SINGLE;

    // 分段建立独立的几何构建管线
    const tGen = new TunnelGenerator(tType, start_chainage, end_chainage, r, aspect_ratio, D_spacing, r1, r2, rg, c);
    const rManager = new ReinforcementManager(start_chainage, end_chainage, 1.0, 1);
    const rBoltGen = new RockBoltGenerator(start_chainage, end_chainage, 1.0, 1);

    const spacingZ = 1.0;
    const nCurrent = Math.ceil((end_chainage - start_chainage) / spacingZ);
    if (nCurrent > 0) {
      tGen.updateInstanceData(nCurrent, spacingZ, 1.0, r, 0);
    }
    // 依据实际起点里程，沿 Z 轴负方向进行轴向空间定位偏置，实现全线多区间纵向顺序组装
    tGen.mesh.position.z = -start_chainage;
    rManager.advancePipeMesh.position.z = -start_chainage;
    rBoltGen.mesh.position.z = -start_chainage;

    scene.add(tGen.mesh, rManager.advancePipeMesh, rBoltGen.mesh);
    activeMeshes.push(tGen.mesh, rManager.advancePipeMesh, rBoltGen.mesh);
  });


  scheduleRender();
};

// ==========================================
// 2. 数据单向监听与解包
// ==========================================
watch(
 () => snapshotStore.refresh3DTrigger, // 侦听手动刷新触发信号
 () => {
   renderSelectedSnapshots();
 }
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
  renderSelectedSnapshots(); // 初始挂载时自动装配一次
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