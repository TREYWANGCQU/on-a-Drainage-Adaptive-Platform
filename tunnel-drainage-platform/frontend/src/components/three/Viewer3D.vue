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

// 几何构建管线实例
let tunnelGen: TunnelGenerator | null = null;
let reinforcementManager: ReinforcementManager | null = null;
let rockBoltGen: RockBoltGenerator | null = null;

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

const dispatchToPipeline = (rawData: ITunnelParams) => {
  if (!rawData || !scene) return;

  const { start_chainage, end_chainage, params } = rawData;
  // 修改后：补充解包双洞间距参数 D_spacing，设定缺省安全值
  const { r, r1, r2, rg,c,tunnel_type,aspect_ratio = 1.0, D_spacing = 30.0 } = params;

  // 懒加载实例化与场景挂载：确保一次性传入所需的空间里程极值参数
  if (!tunnelGen) {
    // 修改后：严格匹配新版状态映射，并透传间距参数
    const tType = tunnel_type === 'double' ? TunnelType.DOUBLE : TunnelType.SINGLE;
    tunnelGen = new TunnelGenerator(tType, start_chainage, end_chainage, r, aspect_ratio, D_spacing, r1, r2, rg,c);
    
    reinforcementManager = new ReinforcementManager(start_chainage, end_chainage, 1.0, 1);
    rockBoltGen = new RockBoltGenerator(start_chainage, end_chainage, 1.0, 1);

    // 将生成的 InstancedMesh 挂载至渲染管线
    scene.add(tunnelGen.mesh);
    scene.add(reinforcementManager.advancePipeMesh);
    scene.add(rockBoltGen.mesh);
  }

  // 映射解算参数下发动态更新指令
  if (tunnelGen) {
    const spacingZ = 1.0;
    const nCurrent = Math.ceil((end_chainage - start_chainage) / spacingZ);
    // 按实际工程参数映射调度底层位置推演
    tunnelGen.updateInstanceData(nCurrent, spacingZ, 1.0, r, 0);
  }

  scheduleRender();
};

// ==========================================
// 2. 数据单向监听与解包
// ==========================================
watch(
  activeSnapshot,
  (newSnap) => {
    if (newSnap) {
      // toRaw剥离：解除 Vue Proxy 响应式代理，规避大体量数据高频深度监听引发的性能损耗
      const rawSnapshot = toRaw(newSnap) as ITunnelParams;
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