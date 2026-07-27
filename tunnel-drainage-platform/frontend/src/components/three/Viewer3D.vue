<!-- frontend/src/components/three/Viewer3D.vue -->
<template>
  <div class="viewer-container" ref="containerRef">
    <canvas ref="canvasRef"></canvas>

    <!-- 剖切交互控制面板 -->
    <div class="clipping-panel glass-card">
      <div class="panel-header">
        <span class="panel-title">3D 剖切分析</span>
        <label class="switch-toggle">
          <input type="checkbox" v-model="isClippingEnabled" @change="updateClipping" />
          <span class="switch-slider"></span>
        </label>
      </div>
      <div v-if="isClippingEnabled" class="panel-body">
        <div class="control-row">
          <span class="control-label">轴向:</span>
          <div class="btn-group">
            <button 
              v-for="axis in (['z', 'x', 'y'] as const)" 
              :key="axis"
              class="axis-btn"
              :class="{ active: clippingAxis === axis }"
              @click="clippingAxis = axis; updateClipping()"
            >
              {{ axis.toUpperCase() }}
            </button>
          </div>
        </div>
        <div class="control-row">
          <span class="control-label">位置: {{ clippingOffset.toFixed(1) }}m</span>
          <input 
            type="range" 
            :min="clippingAxis === 'z' ? 0 : -30" 
            :max="clippingAxis === 'z' ? maxChainageLength : 30" 
            step="0.5" 
            v-model.number="clippingOffset"
            @input="updateClipping"
            class="range-slider"
          />
        </div>
        <div class="control-row inline-row">
          <span class="control-label">反向剖切:</span>
          <input type="checkbox" v-model="isClippingInverted" @change="updateClipping" />
        </div>
      </div>
    </div>
    
    <!-- 顶层 Overlay 标量看板/探针悬浮框 -->
    <div v-if="probeInfo && showOverlay" class="probe-tooltip glass-card">
      <div class="tooltip-header">
        <span class="pulse-dot" :class="{ danger: probeInfo.isCritical }"></span>
        <span class="title">最不利受力单元 #{{ probeInfo.controlIdx }}</span>
      </div>
      <div class="tooltip-body">
        <div class="metric-row">
          <span class="label">最小安全系数 K:</span>
          <span class="value" :class="{ danger: probeInfo.isCritical }">{{ probeInfo.minK.toFixed(2) }}</span>
        </div>
        <div class="metric-row">
          <span class="label">控制轴力 N:</span>
          <span class="value">{{ probeInfo.controlN.toFixed(1) }} kN</span>
        </div>
        <div class="metric-row">
          <span class="label">控制弯矩 M:</span>
          <span class="value">{{ probeInfo.controlM.toFixed(1) }} kN·m</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, toRaw } from 'vue';
import * as THREE from 'three';
import { useSnapshotStore, extractSnapshotValue, Snapshot } from '@/store/snapshotStore';
import { useParameterStore } from '@/store/parameterStore';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { TunnelGenerator, TunnelType } from './TunnelGenerator';
import { ReinforcementManager, RockBoltGenerator } from './Reinforcement';
import { DrainagePipeGenerator } from './DrainagePipeGenerator';
import { Environment } from './Environment';
import { StressProbeManager } from './PostProcessing';

const props = withDefaults(defineProps<{
  mode?: 'all' | 'original' | 'critical';
  snapshotOverride?: Snapshot | null;
  showOverlay?: boolean;
}>(), {
  mode: 'all',
  snapshotOverride: null,
  showOverlay: true
});

const emit = defineEmits<{
  (e: 'cameraChange', cameraState: { position: number[]; target: number[] }): void;
}>();

// DOM 引用
const containerRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

// Three.js 核心上下文
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;

// 追踪已挂载对象
let activeMeshes: THREE.Object3D[] = [];
let envInstance: Environment | null = null;
let probeManager: StressProbeManager | null = null;

// 最不利点浮窗信息
const probeInfo = ref<{
  controlIdx: number;
  controlM: number;
  controlN: number;
  minK: number;
  isCritical: boolean;
} | null>(null);

// 剖切分析交互状态
const isClippingEnabled = ref(false);
const clippingAxis = ref<'x' | 'y' | 'z'>('z');
const clippingOffset = ref(25);
const isClippingInverted = ref(false);
const maxChainageLength = ref(50);
const startChainageVal = ref(0);

const clippingPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 25);

const updateClipping = () => {
  if (!isClippingEnabled.value) {
    applyClippingPlanes([]);
    return;
  }

  let normal = new THREE.Vector3(0, 0, -1);
  let constant = 0;

  if (clippingAxis.value === 'x') {
    normal = new THREE.Vector3(isClippingInverted.value ? -1 : 1, 0, 0);
    constant = isClippingInverted.value ? clippingOffset.value : -clippingOffset.value;
  } else if (clippingAxis.value === 'y') {
    normal = new THREE.Vector3(0, isClippingInverted.value ? -1 : 1, 0);
    constant = isClippingInverted.value ? clippingOffset.value : -clippingOffset.value;
  } else {
    // Z轴：沿隧道纵向切割（世界坐标下隧道起始于 -startChainage，延伸至 -endChainage）
    const zCut = -(startChainageVal.value + clippingOffset.value);
    normal = new THREE.Vector3(0, 0, isClippingInverted.value ? 1 : -1);
    constant = isClippingInverted.value ? -zCut : zCut;
  }

  clippingPlane.set(normal, constant);
  applyClippingPlanes([clippingPlane]);
  scheduleRender();
};

const applyClippingPlanes = (planes: THREE.Plane[]) => {
  activeMeshes.forEach(mesh => {
    if (mesh instanceof THREE.Mesh || mesh instanceof THREE.InstancedMesh) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => {
          m.clippingPlanes = planes;
          m.needsUpdate = true;
        });
      } else if (mesh.material) {
        mesh.material.clippingPlanes = planes;
        mesh.material.needsUpdate = true;
      }
    }
  });
};

// 状态库绑定
const snapshotStore = useSnapshotStore();
const parameterStore = useParameterStore();

// 节流阀控制状态
let renderFrameId: number | null = null;
let isRendering = false;

// 初始化 WebGL 画布
const initWebGL = () => {
  if (!canvasRef.value || !containerRef.value) return;

  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
    logarithmicDepthBuffer: true,
    alpha: true
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.localClippingEnabled = true; // 使能局部剖切平面剔除

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1d24);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
  camera.position.set(0, 25, 60);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, -20);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  controls.addEventListener('change', () => {
    emit('cameraChange', {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z]
    });
    scheduleRender();
  });

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(30, 60, 40);
  dirLight.castShadow = true;
  dirLight.shadow.bias = 0.0001;
  dirLight.shadow.normalBias = 0.05;
  scene.add(dirLight);

  probeManager = new StressProbeManager(scene);
  scheduleRender();
};

const scheduleRender = () => {
  if (isRendering) return;
  isRendering = true;

  if (renderFrameId !== null) {
    cancelAnimationFrame(renderFrameId);
  }

  renderFrameId = requestAnimationFrame(() => {
    if (envInstance) envInstance.update(0.016);
    if (controls) controls.update();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
    isRendering = false;
  });
};

// 矩阵同步接口：供分屏 CompareView 双视角联动
const setCameraState = (state: { position: number[]; target: number[] }) => {
  if (!camera || !controls) return;
  camera.position.set(state.position[0], state.position[1], state.position[2]);
  controls.target.set(state.target[0], state.target[1], state.target[2]);
  controls.update();
  scheduleRender();
};

defineExpose({ setCameraState });

// 渲染主逻辑
const renderSceneData = () => {
  if (!scene) return;

  // 清理上一轮实体
  activeMeshes.forEach(mesh => scene.remove(mesh));
  activeMeshes = [];
  if (envInstance) {
    envInstance.dispose();
    envInstance = null;
  }

  // 决定数据源快照列表
  let snapshotsToRender: Snapshot[] = [];
  if (props.snapshotOverride) {
    snapshotsToRender = [props.snapshotOverride];
  } else {
    snapshotsToRender = snapshotStore.snapshots.filter((s: any) => s.selectedFor3D);
    if (snapshotsToRender.length === 0) {
      // 兜底使用 parameterStore 当前表单构建
      const currentParam = parameterStore.currentPayload;
      snapshotsToRender = [{
        id: 'live_current',
        timestamp: Date.now(),
        remark: '当前实时工况',
        start_chainage: currentParam.start_chainage || 0,
        end_chainage: currentParam.end_chainage || 50,
        params: currentParam,
        results: parameterStore.currentResults
      }];
    }
  }

  snapshotsToRender.forEach((snap: Snapshot) => {
    const rawData = toRaw(snap);
    if (!rawData) return;

    const start_chainage = extractSnapshotValue(rawData, 'start_chainage', 0);
    const end_chainage = extractSnapshotValue(rawData, 'end_chainage', 50);
    const r = extractSnapshotValue(rawData, 'r', 5.5);
    const r1 = extractSnapshotValue(rawData, 'r1', 6.0);
    const r2 = extractSnapshotValue(rawData, 'r2', 6.5);
    const rg = extractSnapshotValue(rawData, 'rg', 8.0);
    const c = extractSnapshotValue(rawData, 'c', 50.0);
    const tunnel_type = extractSnapshotValue<string>(rawData, 'tunnel_type', 'single') as 'single' | 'double';
    const aspect_ratio = extractSnapshotValue(rawData, 'aspect_ratio', 0.7);
    const D_spacing = extractSnapshotValue(rawData, 'D_spacing', 30.0);

    maxChainageLength.value = Math.abs(end_chainage - start_chainage);
    startChainageVal.value = start_chainage;

    const tType = tunnel_type === 'double' ? TunnelType.DOUBLE : TunnelType.SINGLE;

    // 1. 隧道主洞体生成
    const tGen = new TunnelGenerator(tType, start_chainage, end_chainage, r, aspect_ratio, D_spacing, r1, r2, rg, c);
    tGen.mesh.castShadow = false;
    tGen.mesh.receiveShadow = false;
    tGen.mesh.frustumCulled = false;

    const spacingZ = 1.0;
    const nCurrent = Math.ceil((end_chainage - start_chainage) / spacingZ);
    if (nCurrent > 0) {
      tGen.updateInstanceData(nCurrent, spacingZ, 1.0, r, 0);
    }
    tGen.mesh.position.z = -start_chainage;
    scene.add(tGen.mesh);
    activeMeshes.push(tGen.mesh);

    // 2. 加固注浆圈与锚杆
    const rManager = new ReinforcementManager(
      {
        outer_angle: 5,
        circumferential_spacing: 0.4,
        per_ring: 30,
        longitudinal_spacing: 2.0,
        start_chainage,
        end_chainage,
        tunnel_radius: r
      },
      {
        rg,
        r2,
        rg_crit: props.mode === 'original' ? undefined : rawData.results?.critical_state?.rg_crit,
        tg_crit: props.mode === 'original' ? undefined : rawData.results?.critical_state?.tg_crit,
        start_chainage,
        end_chainage,
        tunnel_type,
        D_spacing
      }
    );
    rManager.updateFromSnapshot(rawData);
    rManager.getMeshes().forEach(mesh => {
      mesh.position.z = -start_chainage;
      mesh.frustumCulled = false;
      scene.add(mesh);
      activeMeshes.push(mesh);
    });

    const rBoltGen = new RockBoltGenerator({
      bolts_per_ring: 12,
      spacing_z: 1.0,
      start_angle: -Math.PI / 4,
      end_angle: Math.PI + Math.PI / 4,
      start_chainage,
      end_chainage,
      tunnel_radius: r
    });
    rBoltGen.updateFromSnapshot(rawData);
    rBoltGen.mesh.position.z = -start_chainage;
    rBoltGen.mesh.frustumCulled = false;
    scene.add(rBoltGen.mesh);
    activeMeshes.push(rBoltGen.mesh);

    // 3. 排水管网生成器
    const pipeGen = new DrainagePipeGenerator({
      ringDiam: extractSnapshotValue(rawData, 'ring_diam_recommend', 0.05),
      ringSpacing: extractSnapshotValue(rawData, 'ring_spacing_recommend', 5.0),
      longDiam: extractSnapshotValue(rawData, 'd_long_default', 0.1),
      latDiam: extractSnapshotValue(rawData, 'd_lat_default', 0.08),
      doubleSide: extractSnapshotValue(rawData, 'double_side', true),
      tunnelType: tunnel_type,
      startChainage: start_chainage,
      endChainage: end_chainage,
      tunnelRadius: r,
      dSpacing: D_spacing
    });
    pipeGen.updateFromSnapshot(rawData);
    pipeGen.getMeshes().forEach(mesh => {
      mesh.position.z = -start_chainage;
      mesh.frustumCulled = false;
      scene.add(mesh);
      activeMeshes.push(mesh);
    });

    // 4. 水文环境建模随动
    envInstance = new Environment(scene, {
      startChainage: start_chainage,
      endChainage: end_chainage,
      tunnelRadius: r,
      burialDepth: c,
      dSpacing: D_spacing,
      tunnelType: tunnel_type
    });
    envInstance.updateFromSnapshot(rawData);

    // 5. 受力云图与探针挂载
    if (probeManager) {
      const probeRes = probeManager.updateFromSnapshot(rawData, r, -start_chainage, 2.0);
      probeInfo.value = {
        controlIdx: probeRes.controlIdx,
        controlM: probeRes.controlM,
        controlN: probeRes.controlN,
        minK: probeRes.minK,
        isCritical: probeRes.minK <= 2.0
      };
    }
  });

  updateClipping();
  scheduleRender();
};

watch(
  [() => snapshotStore.refresh3DTrigger, () => props.mode, () => props.snapshotOverride],
  () => renderSceneData()
);

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
  renderSceneData();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  if (renderFrameId !== null) cancelAnimationFrame(renderFrameId);
  if (envInstance) envInstance.dispose();
  if (probeManager) probeManager.dispose();
  renderer?.dispose();
});
</script>

<style scoped>
.viewer-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  background-color: #1a1d24;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.glass-card {
  background: rgba(20, 24, 33, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.probe-tooltip {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 12px 16px;
  color: #e0e6ed;
  font-size: 13px;
  z-index: 10;
  min-width: 200px;
}

.tooltip-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #00ff88;
  box-shadow: 0 0 8px #00ff88;
}

.pulse-dot.danger {
  background-color: #ff3366;
  box-shadow: 0 0 8px #ff3366;
}

.tooltip-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label {
  color: #8c9ba5;
}

.value {
  font-family: 'Monaco', 'Consolas', monospace;
  font-weight: 600;
  color: #64b5f6;
}

.value.danger {
  color: #ff5252;
}

/* 3D 剖切控制面板样式 */
.clipping-panel {
  position: absolute;
  top: 16px;
  left: 16px;
  padding: 12px 16px;
  color: #e0e6ed;
  font-size: 13px;
  z-index: 10;
  min-width: 220px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-title {
  color: #64b5f6;
}

.switch-toggle {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
}

.switch-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #3a4250;
  transition: .3s;
  border-radius: 20px;
}

.switch-slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .3s;
  border-radius: 50%;
}

input:checked + .switch-slider {
  background-color: #00ff88;
}

input:checked + .switch-slider:before {
  transform: translateX(16px);
}

.panel-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.control-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-row.inline-row {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.control-label {
  color: #8c9ba5;
  font-size: 12px;
}

.btn-group {
  display: flex;
  gap: 4px;
}

.axis-btn {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cfd8dc;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.axis-btn.active {
  background: #1e88e5;
  color: #ffffff;
  border-color: #42a5f5;
  box-shadow: 0 0 8px rgba(30, 136, 229, 0.5);
}

.range-slider {
  width: 100%;
  accent-color: #64b5f6;
  cursor: pointer;
}
</style>