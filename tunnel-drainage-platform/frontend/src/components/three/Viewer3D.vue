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
    
    <!-- 图层隐显控制 Floating Toolbar -->
    <div class="layer-panel glass-card">
      <div class="panel-header" @click="isLayerPanelOpen = !isLayerPanelOpen">
        <span class="panel-title">图层显隐控制</span>
        <span class="collapse-icon">{{ isLayerPanelOpen ? '▲' : '▼' }}</span>
      </div>
      <div v-if="isLayerPanelOpen" class="panel-body layer-body">
        <label class="layer-item">
          <input type="checkbox" v-model="layerVisibility.lining" @change="updateLayerVisibility" />
          <span class="layer-color-dot lining-dot"></span>
          <span class="layer-label">隧道衬砌</span>
        </label>
        <label class="layer-item">
          <input type="checkbox" v-model="layerVisibility.initialGrouting" @change="updateLayerVisibility" />
          <span class="layer-color-dot initial-grouting-dot"></span>
          <span class="layer-label">初始注浆圈 (rg)</span>
        </label>
        <label class="layer-item">
          <input type="checkbox" v-model="layerVisibility.criticalGrouting" @change="updateLayerVisibility" />
          <span class="layer-color-dot critical-grouting-dot"></span>
          <span class="layer-label">临界注浆加固圈 (tg_crit)</span>
        </label>
        <label class="layer-item">
          <input type="checkbox" v-model="layerVisibility.pipes" @change="updateLayerVisibility" />
          <span class="layer-color-dot pipes-dot"></span>
          <span class="layer-label">排水管网</span>
        </label>
        <label class="layer-item">
          <input type="checkbox" v-model="layerVisibility.environment" @change="updateLayerVisibility" />
          <span class="layer-color-dot env-dot"></span>
          <span class="layer-label">水文环境</span>
        </label>
        <label class="layer-item sub-layer-item">
          <input type="checkbox" v-model="layerVisibility.waterParticles" @change="updateLayerVisibility" />
          <span class="layer-color-dot particle-dot"></span>
          <span class="layer-label">└ 地下水粒子特效</span>
        </label>
        <label class="layer-item">
          <input type="checkbox" v-model="layerVisibility.probe" @change="updateLayerVisibility" />
          <span class="layer-color-dot probe-dot"></span>
          <span class="layer-label">最不利探针</span>
        </label>
      </div>
    </div>
    
    <!-- 受力表达模式切换器 (K | M | N | 综合受力) -->
    <div v-if="layerVisibility.probe" class="force-mode-panel glass-card">
      <div class="panel-header">
        <span class="panel-title">受力表达模式</span>
      </div>
      <div class="btn-group force-btn-group">
        <button 
          :class="{ active: currentForceMode === 'K' }" 
          @click="setForceMode('K')"
          title="安全系数 K 云图"
        >
          安全系数 K
        </button>
        <button 
          :class="{ active: currentForceMode === 'M' }" 
          @click="setForceMode('M')"
          title="弯矩包络图 M"
        >
          弯矩图 M
        </button>
        <button 
          :class="{ active: currentForceMode === 'N' }" 
          @click="setForceMode('N')"
          title="轴向压力图 N"
        >
          轴力图 N
        </button>
        <button 
          :class="{ active: currentForceMode === 'COMBINED' }" 
          @click="setForceMode('COMBINED')"
          title="综合受力包络"
        >
          综合受力
        </button>
      </div>
    </div>
    
    <!-- 顶层 Overlay 标量看板/探针悬浮框 -->
    <div v-if="probeInfo && showOverlay" class="probe-tooltip glass-card">
      <div class="tooltip-header">
        <span class="pulse-dot" :class="{ danger: probeInfo.isCritical }"></span>
        <span class="title">最不利受力单元 #{{ probeInfo.controlIdx }} ({{ probeInfo.chainageText }})</span>
      </div>
      <div class="tooltip-body">
        <div class="metric-row">
          <span class="label">最小安全系数 K:</span>
          <span class="value" :class="{ danger: probeInfo.isCritical }">{{ probeInfo.minK.toFixed(2) }}</span>
        </div>
        <div class="metric-row">
          <span class="label">控制轴力 N:</span>
          <span class="value">{{ (Math.abs(probeInfo.controlN) > 5000 ? probeInfo.controlN / 1000 : probeInfo.controlN).toFixed(1) }} kN</span>
        </div>
        <div class="metric-row">
          <span class="label">控制弯矩 M:</span>
          <span class="value">{{ (Math.abs(probeInfo.controlM) > 5000 ? probeInfo.controlM / 1000 : probeInfo.controlM).toFixed(1) }} kN·m</span>
        </div>
      </div>
    </div>

    <!-- 标准视角与交互测距 Toolbar -->
    <div class="toolbar-panel glass-card">
      <div class="toolbar-section">
        <span class="section-title">标准视角</span>
        <div class="view-btn-grid">
          <button class="tool-btn" @click="switchToStandardView('front')" title="正视图">正视 F</button>
          <button class="tool-btn" @click="switchToStandardView('left')" title="左视图">左视 L</button>
          <button class="tool-btn" @click="switchToStandardView('right')" title="右视图">右视 R</button>
          <button class="tool-btn" @click="switchToStandardView('top')" title="俯视图">俯视 T</button>
          <button class="tool-btn" @click="switchToStandardView('bottom')" title="仰视图">仰视 B</button>
          <button class="tool-btn" @click="switchToStandardView('perspective')" title="透视图">透视 P</button>
        </div>
      </div>
      <div class="toolbar-divider"></div>
      <div class="toolbar-section">
        <span class="section-title">交互工具</span>
        <div class="action-btn-row">
          <button 
            class="tool-btn measure-btn" 
            :class="{ active: isMeasuring }" 
            @click="toggleMeasurementMode"
          >
            📏 {{ isMeasuring ? '测距中...' : '距离量测' }}
          </button>
          <button class="tool-btn clear-btn" @click="clearMeasurements" title="清除所有测距标注">
            🗑 清除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch, toRaw } from 'vue';
import * as THREE from 'three';
import { useSnapshotStore, extractSnapshotValue, Snapshot } from '@/store/snapshotStore';
import { useParameterStore } from '@/store/parameterStore';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { TunnelGenerator, TunnelType } from './TunnelGenerator';
import { ReinforcementManager } from './Reinforcement';
import { DrainagePipeGenerator } from './DrainagePipeGenerator';
import { Environment } from './Environment';
import { StressProbeManager, ForceDisplayMode } from './PostProcessing';

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

// 追踪已挂载对象与组件实例
let activeMeshes: THREE.Object3D[] = [];
let envInstance: Environment | null = null;
let probeManager: StressProbeManager | null = null;

let tGenInstance: TunnelGenerator | null = null;
let rManagerInstance: ReinforcementManager | null = null;
let pipeGenInstance: DrainagePipeGenerator | null = null;

// 图层显隐控制状态
const isLayerPanelOpen = ref(true);
const layerVisibility = reactive({
  lining: true,
  initialGrouting: true,
  criticalGrouting: true,
  pipes: true,
  environment: true,
  waterParticles: true,
  probe: true
});

const updateLayerVisibility = () => {
  if (tGenInstance?.mesh) {
    tGenInstance.mesh.visible = layerVisibility.lining;
  }

  if (rManagerInstance) {
    if (rManagerInstance.groutingMesh) rManagerInstance.groutingMesh.visible = layerVisibility.initialGrouting;
    if (rManagerInstance.criticalGroutingMesh) rManagerInstance.criticalGroutingMesh.visible = layerVisibility.criticalGrouting;
  }

  if (pipeGenInstance) {
    pipeGenInstance.getMeshes().forEach(mesh => {
      mesh.visible = layerVisibility.pipes;
    });
  }

  if (envInstance) {
    if (envInstance.waterPlane) envInstance.waterPlane.visible = layerVisibility.environment;
    if (envInstance.groundPlane) envInstance.groundPlane.visible = layerVisibility.environment;
    if (envInstance.flowLines) envInstance.flowLines.visible = layerVisibility.environment;
    if (envInstance.depthIndicator) envInstance.depthIndicator.visible = layerVisibility.environment;
    if (envInstance.waterParticles) {
      envInstance.waterParticles.visible = layerVisibility.environment && layerVisibility.waterParticles;
    }
  }

  if (probeManager) {
    probeManager.probeGroup.visible = layerVisibility.probe;
    probeManager.diagramGroup.visible = layerVisibility.probe;
  }

  scheduleRender();
};

// 受力表达模式状态与切换器
const currentForceMode = ref<ForceDisplayMode>('K');

const setForceMode = (mode: ForceDisplayMode) => {
  currentForceMode.value = mode;
  if (probeManager) {
    probeManager.setForceMode(mode);
    scheduleRender();
  }
};

// 最不利点浮窗信息
const probeInfo = ref<{
  controlIdx: number;
  controlM: number;
  controlN: number;
  minK: number;
  isCritical: boolean;
  chainageText: string;
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
  scene.add(measureGroup);
  scheduleRender();
};

// 交互测距与标准视角控制状态
const isMeasuring = ref(false);
const measurePoints = ref<THREE.Vector3[]>([]);
const measureGroup = new THREE.Group();
const raycaster = new THREE.Raycaster();
const mouseVec = new THREE.Vector2();
let cameraAnimFrameId: number | null = null;

/**
 * 切换标准工程视角 (0.8s 平滑动画过渡)
 */
const switchToStandardView = (viewKey: string) => {
  if (!camera || !controls) return;
  if (cameraAnimFrameId !== null) cancelAnimationFrame(cameraAnimFrameId);

  const L = maxChainageLength.value || 50;
  const startZ = startChainageVal.value || 0;
  const targetZ = -startZ - L / 2;
  const targetLookAt = new THREE.Vector3(0, 0, targetZ);
  const R = 6.0;

  let targetPos = new THREE.Vector3();

  switch (viewKey) {
    case 'front':
      targetPos.set(0, 0, 35);
      break;
    case 'left':
      targetPos.set(-R * 6, 0, targetZ);
      break;
    case 'right':
      targetPos.set(R * 6, 0, targetZ);
      break;
    case 'top':
      targetPos.set(0, R * 6, targetZ);
      break;
    case 'bottom':
      targetPos.set(0, -R * 6, targetZ);
      break;
    case 'perspective':
    default:
      targetPos.set(R * 4, R * 3, 20);
      break;
  }

  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const startTime = performance.now();
  const durationMs = 800;

  const animateStep = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(1.0, elapsed / durationMs);
    const ease = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    camera.position.lerpVectors(startPos, targetPos, ease);
    controls.target.lerpVectors(startTarget, targetLookAt, ease);
    controls.update();
    scheduleRender();

    if (progress < 1.0) {
      cameraAnimFrameId = requestAnimationFrame(animateStep);
    } else {
      cameraAnimFrameId = null;
    }
  };

  cameraAnimFrameId = requestAnimationFrame(animateStep);
};

/**
 * 切换距离量测模式
 */
const toggleMeasurementMode = () => {
  isMeasuring.value = !isMeasuring.value;
  if (!isMeasuring.value) {
    measurePoints.value = [];
  }
};

/**
 * 清除所有量测标注与虚线
 */
const clearMeasurements = () => {
  measurePoints.value = [];
  while (measureGroup.children.length > 0) {
    const child = measureGroup.children[0];
    measureGroup.remove(child);
    if ((child as any).geometry) (child as any).geometry.dispose();
    if ((child as any).material) {
      if (Array.isArray((child as any).material)) {
        (child as any).material.forEach((m: any) => m.dispose());
      } else {
        (child as any).material.dispose();
      }
    }
  }
  scheduleRender();
};

/**
 * Canvas 点击事件处理器 (3D 交互拾取测距)
 */
const handleCanvasClick = (event: MouseEvent) => {
  if (!isMeasuring.value || !canvasRef.value || !camera || !scene) return;

  const rect = canvasRef.value.getBoundingClientRect();
  mouseVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouseVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouseVec, camera);
  const intersects = raycaster.intersectObjects(activeMeshes, true);

  if (intersects.length > 0) {
    const point = intersects[0].point;
    measurePoints.value.push(point);

    // 点选标记球
    const sphereGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.copy(point);
    measureGroup.add(sphere);

    if (measurePoints.value.length === 2) {
      const p1 = measurePoints.value[0];
      const p2 = measurePoints.value[1];
      const dist = p1.distanceTo(p2);

      // 1. 虚线连接
      const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0xffea00,
        dashSize: 0.3,
        gapSize: 0.15,
        linewidth: 2
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      measureGroup.add(line);

      // 2. 中点 Sprite 距离标签
      const midPoint = p1.clone().add(p2).multiplyScalar(0.5);
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        if (typeof (ctx as any).roundRect === 'function') {
          (ctx as any).roundRect(10, 8, 236, 48, 8);
        } else {
          ctx.rect(10, 8, 236, 48);
        }
        ctx.fill();
        ctx.strokeStyle = '#ffea00';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.font = 'bold 22px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`L = ${dist.toFixed(2)} m`, 128, 32);
      }
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(4.0, 1.0, 1);
      sprite.position.copy(midPoint).add(new THREE.Vector3(0, 0.5, 0));
      measureGroup.add(sprite);

      measurePoints.value = [];
    }

    scheduleRender();
  }
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
    tGenInstance = tGen;

    // 2. 加固注浆圈 (去除超前小导管)
    const rManager = new ReinforcementManager({
      rg,
      r2,
      rg_crit: props.mode === 'original' ? undefined : rawData.results?.critical_state?.rg_crit,
      tg_crit: props.mode === 'original' ? undefined : rawData.results?.critical_state?.tg_crit,
      start_chainage,
      end_chainage,
      tunnel_type,
      D_spacing
    });
    rManager.updateFromSnapshot(rawData);
    rManager.getMeshes().forEach(mesh => {
      mesh.position.z = -start_chainage;
      mesh.frustumCulled = false;
      scene.add(mesh);
      activeMeshes.push(mesh);
    });
    rManagerInstance = rManager;

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
      outerRadius: r2,
      dSpacing: D_spacing
    });
    pipeGen.updateFromSnapshot(rawData);
    pipeGen.getMeshes().forEach(mesh => {
      mesh.position.z = -start_chainage;
      mesh.frustumCulled = false;
      scene.add(mesh);
      activeMeshes.push(mesh);
    });
    pipeGenInstance = pipeGen;

    // 4. 水文环境建模随动 (注入 activeMeshes 支持 3D 剖切分析)
    envInstance = new Environment(scene, {
      startChainage: start_chainage,
      endChainage: end_chainage,
      tunnelRadius: r,
      burialDepth: c,
      dSpacing: D_spacing,
      tunnelType: tunnel_type
    });
    envInstance.updateFromSnapshot(rawData);
    envInstance.getMeshes().forEach(mesh => {
      activeMeshes.push(mesh);
    });

    // 5. 受力云图与探针挂载
    if (probeManager) {
      const targetViewMode = props.mode === 'all' ? 'original' : props.mode;
      const probeRes = probeManager.updateFromSnapshot(rawData, r, -start_chainage, 2.0, targetViewMode);
      probeManager.setForceMode(currentForceMode.value);
      probeInfo.value = {
        controlIdx: probeRes.controlIdx,
        controlM: probeRes.controlM,
        controlN: probeRes.controlN,
        minK: probeRes.minK,
        isCritical: probeRes.minK <= 2.0,
        chainageText: probeRes.chainageText
      };
    }
  });

  updateClipping();
  updateLayerVisibility();
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
  canvasRef.value?.addEventListener('click', handleCanvasClick);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  canvasRef.value?.removeEventListener('click', handleCanvasClick);
  if (cameraAnimFrameId !== null) cancelAnimationFrame(cameraAnimFrameId);
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
  top: 56px;
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
  top: 46px;
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
  margin-bottom: 8px;
}

.panel-title {
  font-weight: 600;
  color: #ffffff;
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
  gap: 8px;
}

.control-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.inline-row {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.control-label {
  font-size: 12px;
  color: #a0aec0;
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

/* 图层控制面板样式 */
.layer-panel {
  position: absolute;
  top: 190px;
  left: 16px;
  padding: 12px 16px;
  color: #e0e6ed;
  font-size: 13px;
  z-index: 10;
  min-width: 220px;
}

.collapse-icon {
  font-size: 10px;
  color: #8c9ba5;
  cursor: pointer;
}

.layer-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.layer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  user-select: none;
}

.layer-item input[type="checkbox"] {
  accent-color: #00ff88;
  cursor: pointer;
}

.layer-color-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.lining-dot { background-color: #808080; }
.initial-grouting-dot { background-color: #00ffff; }
.critical-grouting-dot { background-color: #ff6600; }
.pipes-dot { background-color: #2ecc71; }
.env-dot { background-color: #1a5276; }
.particle-dot { background-color: #38bdf8; }
.probe-dot { background-color: #00ff88; }

.sub-layer-item {
  margin-left: 14px;
  font-size: 11px;
  opacity: 0.9;
}

/* 标准视角与测距工具 Toolbar */
.toolbar-panel {
  position: absolute;
  bottom: 16px;
  right: 16px;
  padding: 10px 14px;
  color: #e0e6ed;
  font-size: 12px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 220px;
}

.toolbar-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: #8c9ba5;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.view-btn-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.action-btn-row {
  display: flex;
  gap: 6px;
}

.tool-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #d1d5db;
  border-radius: 4px;
  padding: 5px 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  background: rgba(0, 229, 255, 0.2);
  border-color: #00e5ff;
  color: #ffffff;
}

.tool-btn.active {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
  font-weight: 600;
}

.measure-btn.active {
  background: #d97706;
  border-color: #f59e0b;
}

.clear-btn:hover {
  background: rgba(239, 68, 68, 0.3);
  border-color: #ef4444;
}

.toolbar-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
}

/* 受力表达模式面板样式 */
.force-mode-panel {
  position: absolute;
  top: 420px;
  left: 16px;
  padding: 10px 14px;
  color: #e0e6ed;
  font-size: 12px;
  z-index: 10;
  min-width: 220px;
}

.force-btn-group {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin-top: 6px;
}

.force-btn-group button {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cfd8dc;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.force-btn-group button:hover {
  background: rgba(0, 229, 255, 0.2);
  border-color: #00e5ff;
  color: #ffffff;
}

.force-btn-group button.active {
  background: #1e88e5;
  color: #ffffff;
  border-color: #42a5f5;
  box-shadow: 0 0 10px rgba(30, 136, 229, 0.6);
}
</style>