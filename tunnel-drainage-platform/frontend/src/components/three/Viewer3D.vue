<!-- frontend/src/components/three/Viewer3D.vue -->
<template>
  <div class="viewer-container" ref="containerRef">
    <canvas ref="canvasRef"></canvas>

    <!-- 左侧控制面板自适应流动栈容器 -->
    <div class="left-controls-stack">
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
          <div class="layer-action-header">
            <label class="layer-item select-all-item">
              <input 
                ref="selectAllCheckboxRef"
                type="checkbox" 
                :checked="isAllLayersVisible" 
                @change="toggleAllLayersVisibility" 
              />
              <span class="layer-label select-all-title">全选</span>
            </label>
            <div class="quick-btn-group">
              
            </div>
          </div>
          <div class="layer-divider"></div>
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

          <!-- 排水管网图层组 (支持折叠) -->
          <div class="layer-group-header">
            <label class="layer-item">
              <input type="checkbox" v-model="layerVisibility.pipes" @change="updateLayerVisibility" />
              <span class="layer-color-dot pipes-dot"></span>
              <span class="layer-label">排水管网</span>
            </label>
            <span 
              class="group-toggle-btn" 
              @click.stop="isPipesGroupOpen = !isPipesGroupOpen"
              :title="isPipesGroupOpen ? '折叠子图层' : '展开子图层'"
            >
              {{ isPipesGroupOpen ? '▼' : '▶' }}
            </span>
          </div>
          <div v-if="isPipesGroupOpen" class="sub-layer-container">
            <label class="layer-item sub-layer-item">
              <input type="checkbox" v-model="layerVisibility.pipeAnnotations" @change="updateLayerVisibility" />
              <span class="layer-color-dot annotation-dot"></span>
              <span class="layer-label">└ 排水管网参数标注</span>
            </label>
          </div>

          <!-- 水文环境图层组 (支持折叠) -->
          <div class="layer-group-header">
            <label class="layer-item">
              <input type="checkbox" v-model="layerVisibility.environment" @change="updateLayerVisibility" />
              <span class="layer-color-dot env-dot"></span>
              <span class="layer-label">水文环境</span>
            </label>
            <span 
              class="group-toggle-btn" 
              @click.stop="isEnvGroupOpen = !isEnvGroupOpen"
              :title="isEnvGroupOpen ? '折叠子图层' : '展开子图层'"
            >
              {{ isEnvGroupOpen ? '▼' : '▶' }}
            </span>
          </div>
          <div v-if="isEnvGroupOpen" class="sub-layer-container">
            <label class="layer-item sub-layer-item">
              <input type="checkbox" v-model="layerVisibility.ground" @change="updateLayerVisibility" />
              <span class="layer-color-dot ground-dot"></span>
              <span class="layer-label">└ 地面/地表</span>
            </label>
            <label class="layer-item sub-layer-item">
              <input type="checkbox" v-model="layerVisibility.flowLines" @change="updateLayerVisibility" />
              <span class="layer-color-dot flowline-dot"></span>
              <span class="layer-label">└ 地下水流线</span>
            </label>
            <label class="layer-item sub-layer-item inline-between">
              <div class="left-group">
                <input type="checkbox" v-model="layerVisibility.waterParticles" @change="updateLayerVisibility" />
                <span class="layer-color-dot particle-dot"></span>
                <span class="layer-label">└ 地下水粒子特效</span>
              </div>
              <button 
                v-if="layerVisibility.environment && layerVisibility.waterParticles"
                class="mini-anim-btn" 
                :class="{ paused: !isWaterParticleAnimated }"
                @click.stop="toggleWaterParticleAnimation"
                :title="isWaterParticleAnimated ? '暂停粒子流动' : '启动粒子流动'"
              >
                {{ isWaterParticleAnimated ? '⏸ 动态' : '▶ 冻结' }}
              </button>
            </label>
          </div>

          <label class="layer-item">
            <input type="checkbox" v-model="layerVisibility.probe" @change="updateLayerVisibility" />
            <span class="layer-color-dot probe-dot"></span>
            <span class="layer-label">最不利探针</span>
          </label>
        </div>
      </div>
      
      <!-- 受力表达模式切换器 (K | M | N | 综合受力) 及 可折叠数值图例 -->
      <div v-if="layerVisibility.probe" class="force-mode-panel glass-card">
        <div class="panel-header" @click="isLegendPanelCollapsed = !isLegendPanelCollapsed" style="cursor: pointer;">
          <span class="panel-title">受力表达模式</span>
          <span class="collapse-icon">{{ isLegendPanelCollapsed ? '▼' : '▲' }}</span>
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

        <!-- 数值图例面板 (可折叠打开) -->
        <div v-if="!isLegendPanelCollapsed" class="legend-container">
          <!-- 1. 安全系数 K 图例 -->
          <div v-if="currentForceMode === 'K'" class="legend-section">
            <div class="legend-bar-wrapper">
              <div class="color-bar k-gradient-bar"></div>
              <div class="legend-ticks-row">
                <span class="tick danger">&lt;1.0 危险</span>
                <span class="tick warning">1.0-2.0 预警</span>
                <span class="tick safe">&ge;2.0 安全</span>
              </div>
            </div>
            <div class="legend-range-row">
              <span>最小 K: <strong :class="{ danger: probeInfo?.isCritical }">{{ probeInfo?.minK ? probeInfo.minK.toFixed(2) : '2.00' }}</strong></span>
              <span>截面范围: {{ probeRanges.minK.toFixed(2) }} ~ {{ probeRanges.maxK.toFixed(2) }}</span>
            </div>
          </div>

          <!-- 2. 弯矩图 M 图例 -->
          <div v-if="currentForceMode === 'M'" class="legend-section">
            <div class="legend-bar-wrapper">
              <div class="color-bar m-gradient-bar"></div>
              <div class="legend-scale-row">
                <span>{{ probeRanges.minM.toFixed(1) }}</span>
                <span>{{ ((probeRanges.minM + probeRanges.maxM) / 2).toFixed(1) }}</span>
                <span>{{ probeRanges.maxM.toFixed(1) }} kN·m</span>
              </div>
            </div>
          </div>

          <!-- 3. 轴力图 N 图例 -->
          <div v-if="currentForceMode === 'N'" class="legend-section">
            <div class="legend-bar-wrapper">
              <div class="color-bar n-gradient-bar"></div>
              <div class="legend-scale-row">
                <span>{{ probeRanges.minN.toFixed(1) }}</span>
                <span>{{ ((probeRanges.minN + probeRanges.maxN) / 2).toFixed(1) }}</span>
                <span>{{ probeRanges.maxN.toFixed(1) }} kN</span>
              </div>
            </div>
          </div>

          <!-- 4. 综合受力 COMBINED 图例 -->
          <div v-if="currentForceMode === 'COMBINED'" class="legend-section">
            <div class="legend-bar-wrapper">
              <div class="color-bar combined-gradient-bar"></div>
              <div class="legend-ticks-row">
                <span class="tick safe">低应力</span>
                <span class="tick warning">中等包络</span>
                <span class="tick danger">控制峰值</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 顶层 Overlay 标量看板/探针悬浮框 (默认折叠: isProbeTooltipCollapsed=true) -->
    <div v-if="probeInfo && showOverlay" class="probe-tooltip glass-card" :class="{ collapsed: isProbeTooltipCollapsed }">
      <div class="tooltip-header" @click="isProbeTooltipCollapsed = !isProbeTooltipCollapsed" style="cursor: pointer;">
        <span class="pulse-dot" :class="{ danger: probeInfo.isCritical }"></span>
        <span class="title">最不利受力单元 #{{ probeInfo.controlIdx }} ({{ probeInfo.chainageText }}) <small style="font-size: 11px; opacity: 0.85; margin-left: 4px;">{{ probeInfo.stateTag }}</small></span>
        <span class="collapse-icon">{{ isProbeTooltipCollapsed ? '▲' : '▼' }}</span>
      </div>
      <div v-if="!isProbeTooltipCollapsed" class="tooltip-body">
        <div v-if="props.mode === 'all'" class="state-tab-row">
          <button 
            class="probe-tab-btn" 
            :class="{ active: currentProbeStateTab === 'original' }" 
            @click.stop="currentProbeStateTab = 'original'; renderSceneData()"
          >
            原始超限态
          </button>
          <button 
            class="probe-tab-btn" 
            :class="{ active: currentProbeStateTab === 'critical' }" 
            @click.stop="currentProbeStateTab = 'critical'; renderSceneData()"
          >
            临界加固态
          </button>
        </div>
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

    <!-- 微观防排水结构放大镜 (PIP Magnifier Window) -->
    <MagnifierPIP 
      :active="isPipActive" 
      :pipe-data="pipPipeData" 
      @close="isPipActive = false" 
    />

    <!-- 标准视角与交互测距 Toolbar -->
    <div class="toolbar-panel glass-card">
      <div class="toolbar-section">
        <span class="section-title">视觉美学范式</span>
        <div class="projection-btn-row">
          <button 
            class="tool-btn proj-btn" 
            :class="{ active: visualParadigm === 'cyber' }" 
            @click="switchVisualParadigm('cyber')"
            title="赛博暗夜风 (数字孪生工程看板)"
          >
            🌙 赛博暗夜
          </button>
          <button 
            class="tool-btn proj-btn" 
            :class="{ active: visualParadigm === 'studio' }" 
            @click="switchVisualParadigm('studio')"
            title="高亮影棚风 (100% 对齐附图透视跑车质感)"
          >
            ☀️ 高亮影棚
          </button>
        </div>
      </div>
      <div class="toolbar-divider"></div>
      <div class="toolbar-section">
        <span class="section-title">相机投影模式</span>
        <div class="projection-btn-row">
          <button 
            class="tool-btn proj-btn" 
            :class="{ active: cameraMode === 'perspective' }" 
            @click="setCameraProjectionMode('perspective')"
            title="透视投影 (3D 真实透视)"
          >
            📷 透视 3D
          </button>
          <button 
            class="tool-btn proj-btn" 
            :class="{ active: cameraMode === 'orthographic' }" 
            @click="setCameraProjectionMode('orthographic')"
            title="正交/等轴投影 (工程无变形测绘)"
          >
            📐 正交/等轴
          </button>
        </div>
      </div>
      <div class="toolbar-divider"></div>
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
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, toRaw } from 'vue';
import * as THREE from 'three';
import { useSnapshotStore, extractSnapshotValue, Snapshot } from '@/store/snapshotStore';
import { useParameterStore } from '@/store/parameterStore';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { TunnelGenerator, TunnelType } from './TunnelGenerator';
import { ReinforcementManager } from './Reinforcement';
import { DrainagePipeGenerator } from './DrainagePipeGenerator';
import { Environment } from './Environment';
import { StressProbeManager, ForceDisplayMode } from './PostProcessing';
import MagnifierPIP from './MagnifierPIP.vue';

// 视觉美学范式控制 (Light Studio 影棚风 vs Dark Cyber 赛博暗夜风)
const visualParadigm = ref<'cyber' | 'studio'>('cyber');
const isPipActive = ref(false);
const pipPipeData = ref<any>(null);

const switchVisualParadigm = (mode: 'cyber' | 'studio') => {
  visualParadigm.value = mode;
  if (scene) {
    scene.background = new THREE.Color(mode === 'studio' ? 0xf3f4f6 : 0x030712);
  }
  tGenInstances.forEach(tg => tg.setVisualParadigm(mode));
  rManagerInstances.forEach(rm => rm.setVisualParadigm(mode));
  pipeGenInstances.forEach(pg => pg.setVisualParadigm(mode));
  scheduleRender();
};

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
let perspectiveCamera: THREE.PerspectiveCamera;
let orthographicCamera: THREE.OrthographicCamera;
let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
let activeCamera: THREE.Camera;
let controls: OrbitControls;

// 相机投影模式状态
const cameraMode = ref<'perspective' | 'orthographic'>('perspective');

// 粒子动态控制状态 (默认冻结)
const isWaterParticleAnimated = ref(false);
let particleAnimFrameId: number | null = null;

const updateParticleAnimationLoop = () => {
  const shouldAnimate = isWaterParticleAnimated.value && 
                        layerVisibility.environment && 
                        layerVisibility.waterParticles && 
                        envInstances.length > 0;

  if (shouldAnimate) {
    if (particleAnimFrameId === null) {
      const animLoop = () => {
        if (!isWaterParticleAnimated.value || 
            !layerVisibility.environment || 
            !layerVisibility.waterParticles || 
            envInstances.length === 0) {
          particleAnimFrameId = null;
          return;
        }
        envInstances.forEach(env => env.update(0.016));
        if (renderer && scene && camera) {
          renderer.render(scene, camera);
        }
        particleAnimFrameId = requestAnimationFrame(animLoop);
      };
      particleAnimFrameId = requestAnimationFrame(animLoop);
    }
  } else {
    if (particleAnimFrameId !== null) {
      cancelAnimationFrame(particleAnimFrameId);
      particleAnimFrameId = null;
    }
  }
};

const toggleWaterParticleAnimation = () => {
  isWaterParticleAnimated.value = !isWaterParticleAnimated.value;
  envInstances.forEach(env => env.setAnimationEnabled(isWaterParticleAnimated.value));
  updateParticleAnimationLoop();
  scheduleRender();
};

// 追踪已挂载对象与组件实例 (升级为 List 数组管理，解耦多快照组装单例覆盖)
let activeMeshes: THREE.Object3D[] = [];
let probeManager: StressProbeManager | null = null;

let tGenInstances: TunnelGenerator[] = [];
let rManagerInstances: ReinforcementManager[] = [];
let pipeGenInstances: DrainagePipeGenerator[] = [];
let envInstances: Environment[] = [];

// 探针在 mode === 'all' 下的解算态选择 (原始超限态 | 临界加固态)
const currentProbeStateTab = ref<'original' | 'critical'>('original');

// 图层显隐控制状态
const isLayerPanelOpen = ref(true);
const isPipesGroupOpen = ref(true);
const isEnvGroupOpen = ref(true);
const layerVisibility = reactive({
  lining: true,
  initialGrouting: true,
  criticalGrouting: true,
  pipes: true,
  pipeAnnotations: true,
  environment: true,
  ground: true,
  flowLines: true,
  waterParticles: true,
  probe: true
});

const updateLayerVisibility = () => {
  // 1. 衬砌 (含二衬、内部路面板与水沟槽)
  tGenInstances.forEach(tGen => {
    const meshes = tGen.getMeshes();
    meshes.forEach(m => {
      m.visible = layerVisibility.lining;
    });
  });

  // 2. 注浆加固圈（支持原始与临界）
  rManagerInstances.forEach(rManager => {
    if (rManager.groutingMesh) {
      rManager.groutingMesh.visible = layerVisibility.initialGrouting;
    }
    if (rManager.criticalGroutingMesh) {
      rManager.criticalGroutingMesh.visible = 
        props.mode !== 'original' && layerVisibility.criticalGrouting;
    }
  });

  // 3. 排水管网与标注
  pipeGenInstances.forEach(pipeGen => {
    pipeGen.getMeshes().forEach(mesh => {
      mesh.visible = layerVisibility.pipes;
    });
    if (pipeGen.annotationGroup) {
      pipeGen.annotationGroup.visible = layerVisibility.pipes && layerVisibility.pipeAnnotations;
    }
  });

  // 4. 水文环境及其子图层 (地面、地下水流线、地下水粒子特效)
  const envVisible = layerVisibility.environment;
  envInstances.forEach(env => {
    if (env.waterPlane) env.waterPlane.visible = envVisible;
    if (env.depthIndicator) env.depthIndicator.visible = envVisible;
    if (env.groundPlane) env.groundPlane.visible = envVisible && layerVisibility.ground;
    if (env.flowLines) env.flowLines.visible = envVisible && layerVisibility.flowLines;
    if (env.waterParticles) {
      env.waterParticles.visible = envVisible && layerVisibility.waterParticles;
    }
  });

  // 5. 探针与受力图例
  if (probeManager) {
    probeManager.probeGroup.visible = layerVisibility.probe;
    probeManager.diagramGroup.visible = layerVisibility.probe;
  }

  updateParticleAnimationLoop();
  scheduleRender();
};

// 全选/全不选 计算属性与控制函数
const isAllLayersVisible = computed(() => {
  const keys = Object.keys(layerVisibility) as (keyof typeof layerVisibility)[];
  return keys.every(key => layerVisibility[key]);
});

const isSomeLayersVisible = computed(() => {
  const keys = Object.keys(layerVisibility) as (keyof typeof layerVisibility)[];
  return keys.some(key => layerVisibility[key]);
});

const selectAllCheckboxRef = ref<HTMLInputElement | null>(null);

watch([isAllLayersVisible, isSomeLayersVisible, isLayerPanelOpen], () => {
  if (selectAllCheckboxRef.value) {
    selectAllCheckboxRef.value.indeterminate = isSomeLayersVisible.value && !isAllLayersVisible.value;
  }
}, { flush: 'post' });

const setAllLayersVisibility = (visible: boolean) => {
  const keys = Object.keys(layerVisibility) as (keyof typeof layerVisibility)[];
  keys.forEach(key => {
    layerVisibility[key] = visible;
  });
  updateLayerVisibility();
};

const toggleAllLayersVisibility = (e: Event) => {
  const target = e.target as HTMLInputElement;
  setAllLayersVisibility(target.checked);
};

// 受力表达模式状态与切换器
const currentForceMode = ref<ForceDisplayMode>('K');

// 【最不利受力单元】看板折叠状态 (默认折叠: true)
const isProbeTooltipCollapsed = ref(true);

// 数值图例面板折叠状态 (默认展开: false)
const isLegendPanelCollapsed = ref(false);

// 截面受力范围 (用于数值图例)
const probeRanges = ref<{
  minK: number;
  maxK: number;
  minM: number;
  maxM: number;
  minN: number;
  maxN: number;
}>({ minK: 1.0, maxK: 5.0, minM: 0, maxM: 100, minN: -1000, maxN: 5000 });

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
  stateTag: string;
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
  const aspect = width / height;

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
  renderer.toneMapping = THREE.ACESFilmicToneMapping; // ACESFilmic 色调映射，防止高亮荧光线条爆光
  renderer.toneMappingExposure = 1.1;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1d24);

  // 1. 初始化透视相机
  perspectiveCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000);
  perspectiveCamera.position.set(0, 25, 60);

  // 2. 初始化正交相机
  const initD = perspectiveCamera.position.distanceTo(new THREE.Vector3(0, 0, -20));
  const halfH = initD * Math.tan((45 * Math.PI) / 360);
  const halfW = halfH * aspect;
  orthographicCamera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 10000);
  orthographicCamera.position.copy(perspectiveCamera.position);

  activeCamera = cameraMode.value === 'orthographic' ? orthographicCamera : perspectiveCamera;
  camera = activeCamera as any;

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

  // PMREMGenerator 动态生成 3 点影棚柔光 HDRI 光照贴图，赋予金属与玻璃逼真反射
  try {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0xf3f4f6);
    const studioLight1 = new THREE.DirectionalLight(0xffffff, 3.0);
    studioLight1.position.set(10, 20, 15);
    envScene.add(studioLight1);
    const studioLight2 = new THREE.DirectionalLight(0x38bdf8, 1.5);
    studioLight2.position.set(-10, 10, -10);
    envScene.add(studioLight2);
    const studioLight3 = new THREE.DirectionalLight(0xffb800, 1.0);
    studioLight3.position.set(0, -10, 10);
    envScene.add(studioLight3);

    const envTarget = pmremGenerator.fromScene(envScene);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();
  } catch (e) {
    console.warn('PMREM Studio Environment generation fallback:', e);
  }

  probeManager = new StressProbeManager(scene);
  scene.add(measureGroup);
  scheduleRender();
};

/**
 * 悬停 Raycasting 检测，实现 3D 悬浮卡片与管网 Hover 光标 pointer 提示
 */
const handleCanvasPointerMove = (event: MouseEvent) => {
  if (!canvasRef.value || !camera) return;

  const rect = canvasRef.value.getBoundingClientRect();
  mouseVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouseVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouseVec, camera);
  const intersects = raycaster.intersectObjects(activeMeshes, true);

  if (intersects.length > 0) {
    const hit = intersects[0].object;
    if (hit && hit.userData && (hit.userData.pipeCategory || hit.userData.name)) {
      canvasRef.value.style.cursor = 'pointer';
      return;
    }
  }
  if (!isMeasuring.value) {
    canvasRef.value.style.cursor = 'default';
  }
};

/**
 * 键盘按键监听 (ESC 退出 PIP 画中画)
 */
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && isPipActive.value) {
    isPipActive.value = false;
  }
};

/**
 * 切换透视 (Perspective) 与 正交/等轴 (Orthographic) 投影相机
 */
const setCameraProjectionMode = (mode: 'perspective' | 'orthographic') => {
  if (cameraMode.value === mode || !controls || !containerRef.value) return;

  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;
  const aspect = width / height;

  const currentPos = camera.position.clone();
  const currentTarget = controls.target.clone();
  const distance = currentPos.distanceTo(currentTarget);

  if (mode === 'orthographic') {
    // 透视 -> 正交：根据观察距离精准算定 Frustum 视锥范围
    const halfH = distance * Math.tan((perspectiveCamera.fov * Math.PI) / 360);
    const halfW = halfH * aspect;

    orthographicCamera.left = -halfW;
    orthographicCamera.right = halfW;
    orthographicCamera.top = halfH;
    orthographicCamera.bottom = -halfH;
    orthographicCamera.position.copy(currentPos);
    orthographicCamera.quaternion.copy(perspectiveCamera.quaternion);
    orthographicCamera.updateProjectionMatrix();

    activeCamera = orthographicCamera;
    camera = orthographicCamera as any;
  } else {
    // 正交 -> 透视
    perspectiveCamera.aspect = aspect;
    perspectiveCamera.position.copy(currentPos);
    perspectiveCamera.quaternion.copy(orthographicCamera.quaternion);
    perspectiveCamera.updateProjectionMatrix();

    activeCamera = perspectiveCamera;
    camera = perspectiveCamera as any;
  }

  cameraMode.value = mode;
  controls.object = camera;
  controls.update();
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

    if (camera instanceof THREE.OrthographicCamera && perspectiveCamera && containerRef.value) {
      const distance = camera.position.distanceTo(controls.target);
      const aspect = containerRef.value.clientWidth / containerRef.value.clientHeight;
      const halfH = distance * Math.tan((perspectiveCamera.fov * Math.PI) / 360);
      const halfW = halfH * aspect;
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
    }

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
 * Canvas 点击事件处理器 (3D 交互拾取测距 & 排水管线 PIP 局部放大)
 */
const handleCanvasClick = (event: MouseEvent) => {
  if (!canvasRef.value || !camera || !scene) return;

  const rect = canvasRef.value.getBoundingClientRect();
  mouseVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouseVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouseVec, camera);
  const intersects = raycaster.intersectObjects(activeMeshes, true);

  if (isMeasuring.value) {
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
    }

    scheduleRender();
    return;
  }

  // 非测距模式：检测是否点击了排水管网或 3D 悬浮文字卡片，激活 PIP 微观局部放大镜
  if (intersects.length > 0) {
    const hit = intersects[0].object;
    if (hit && hit.userData && (hit.userData.pipeCategory || hit.userData.name)) {
      pipPipeData.value = { ...hit.userData };
      isPipActive.value = true;
      return;
    }
  }

  // 点击 3D 画布空白区域，自动平滑收起 PIP 画中画镜头
  if (isPipActive.value) {
    isPipActive.value = false;
  }
};

const scheduleRender = () => {
  if (isRendering) return;
  isRendering = true;

  if (renderFrameId !== null) {
    cancelAnimationFrame(renderFrameId);
  }

  renderFrameId = requestAnimationFrame(() => {
    envInstances.forEach(env => env.update(0.016));
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
  
  envInstances.forEach(env => env.dispose());
  envInstances = [];

  tGenInstances.forEach(tGen => {
    tGen.getMeshes().forEach(mesh => {
      if ((mesh as any).geometry) (mesh as any).geometry.dispose();
      if ((mesh as any).material) {
        if (Array.isArray((mesh as any).material)) (mesh as any).material.forEach((m: any) => m.dispose());
        else ((mesh as any).material as any).dispose();
      }
    });
  });
  tGenInstances = [];

  rManagerInstances.forEach(rm => rm.dispose());
  rManagerInstances = [];

  pipeGenInstances.forEach(pg => pg.dispose());
  pipeGenInstances = [];

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
    const r = extractSnapshotValue(rawData, 'r_0', extractSnapshotValue(rawData, 'r', 7.95));
    const r1 = extractSnapshotValue(rawData, 'r_s', extractSnapshotValue(rawData, 'r1', 8.35));
    const r2 = extractSnapshotValue(rawData, 'r_p', extractSnapshotValue(rawData, 'r2', 8.57));
    const rg = extractSnapshotValue(rawData, 'r_g', extractSnapshotValue(rawData, 'rg', 8.57));
    const c = extractSnapshotValue(rawData, 'h_1', extractSnapshotValue(rawData, 'c', 130.0));
    const tunnel_type = extractSnapshotValue<string>(rawData, 'tunnel_type', 'single') as 'single' | 'double';
    const aspect_ratio = extractSnapshotValue(rawData, 'aspect_ratio', 0.7);
    const D_spacing = extractSnapshotValue(rawData, 'D_spacing', 30.0);

    maxChainageLength.value = Math.abs(end_chainage - start_chainage);
    startChainageVal.value = start_chainage;

    const tType = tunnel_type === 'double' ? TunnelType.DOUBLE : TunnelType.SINGLE;

    // 1. 隧道主洞体与路面水沟生成
    const tGen = new TunnelGenerator(tType, start_chainage, end_chainage, r, aspect_ratio, D_spacing, r1, r2, rg, c);
    tGen.setVisualParadigm(visualParadigm.value);
    tGen.getMeshes().forEach(mesh => {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
    });

    const spacingZ = 1.0;
    const nCurrent = Math.ceil((end_chainage - start_chainage) / spacingZ);
    if (nCurrent > 0) {
      tGen.updateInstanceData(nCurrent, spacingZ, 1.0, r, 0);
    }
    tGen.getMeshes().forEach(mesh => {
      mesh.position.z = -start_chainage;
      scene.add(mesh);
      activeMeshes.push(mesh);
    });
    tGenInstances.push(tGen);

    // 2. 加固注浆圈
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
    rManager.setVisualParadigm(visualParadigm.value);
    rManager.updateFromSnapshot(rawData);
    rManager.getMeshes().forEach(mesh => {
      mesh.position.z = -start_chainage;
      mesh.frustumCulled = false;
      scene.add(mesh);
      activeMeshes.push(mesh);
    });
    rManagerInstances.push(rManager);

    // 3. 排水管网生成器
    const pipeGen = new DrainagePipeGenerator({
      ringDiam: extractSnapshotValue(rawData, 'ring_diam_recommend', 0.05),
      ringSpacing: extractSnapshotValue(rawData, 'ring_spacing_recommend', 10.0),
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
    pipeGen.setVisualParadigm(visualParadigm.value);
    pipeGen.updateFromSnapshot(rawData, props.mode);
    pipeGen.getMeshes().forEach(mesh => {
      mesh.position.z = -start_chainage;
      mesh.frustumCulled = false;
      scene.add(mesh);
      activeMeshes.push(mesh);
    });
    if (pipeGen.annotationGroup) {
      scene.add(pipeGen.annotationGroup);
      activeMeshes.push(pipeGen.annotationGroup);
    }
    pipeGenInstances.push(pipeGen);

    // 4. 水文环境建模随动 (注入 activeMeshes 支持 3D 剖切分析)
    const envInstance = new Environment(scene, {
      startChainage: start_chainage,
      endChainage: end_chainage,
      tunnelRadius: r,
      burialDepth: c,
      dSpacing: D_spacing,
      tunnelType: tunnel_type
    });
    envInstance.setAnimationEnabled(isWaterParticleAnimated.value);
    envInstance.updateFromSnapshot(rawData);
    envInstance.getMeshes().forEach(mesh => {
      activeMeshes.push(mesh);
    });
    envInstances.push(envInstance);

    // 5. 受力云图与探针挂载
    if (probeManager) {
      const targetViewMode = props.mode === 'all' ? currentProbeStateTab.value : props.mode;
      const probeRes = probeManager.updateFromSnapshot(rawData, r, -start_chainage, 2.0, targetViewMode);
      probeManager.setForceMode(currentForceMode.value);
      probeInfo.value = {
        controlIdx: probeRes.controlIdx,
        controlM: probeRes.controlM,
        controlN: probeRes.controlN,
        minK: probeRes.minK,
        isCritical: probeRes.minK <= 2.0,
        chainageText: probeRes.chainageText,
        stateTag: targetViewMode === 'original' ? '[原始超限态]' : '[临界加固态]'
      };
      if (probeRes.ranges) {
        probeRanges.value = probeRes.ranges;
      }
    }
  });

  // 同步当前视觉美学范式模式 (Studio vs Cyber)
  switchVisualParadigm(visualParadigm.value);

  updateClipping();
  updateLayerVisibility();
  scheduleRender();
};

watch(
  [() => snapshotStore.refresh3DTrigger, () => props.mode, () => props.snapshotOverride],
  () => renderSceneData()
);

let resizeObserver: ResizeObserver | null = null;

const handleResize = () => {
  if (!containerRef.value || !camera || !renderer) return;
  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;
  if (width <= 0 || height <= 0) return;
  const aspect = width / height;

  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  } else if (camera instanceof THREE.OrthographicCamera && perspectiveCamera) {
    const distance = camera.position.distanceTo(controls ? controls.target : new THREE.Vector3(0, 0, -20));
    const halfH = distance * Math.tan((perspectiveCamera.fov * Math.PI) / 360);
    const halfW = halfH * aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }
  renderer.setSize(width, height);
  scheduleRender();
};

onMounted(() => {
  initWebGL();
  renderSceneData();
  window.addEventListener('resize', handleResize);
  canvasRef.value?.addEventListener('click', handleCanvasClick);

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.value);
  }
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  window.removeEventListener('resize', handleResize);
  canvasRef.value?.removeEventListener('click', handleCanvasClick);
  if (cameraAnimFrameId !== null) cancelAnimationFrame(cameraAnimFrameId);
  if (renderFrameId !== null) cancelAnimationFrame(renderFrameId);
  if (particleAnimFrameId !== null) cancelAnimationFrame(particleAnimFrameId);
  envInstances.forEach(env => env.dispose());
  envInstances = [];
  pipeGenInstances.forEach(pg => pg.dispose());
  pipeGenInstances = [];
  rManagerInstances.forEach(rm => rm.dispose());
  rManagerInstances = [];
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

/* 左侧控制面板自适应流动栈容器 */
.left-controls-stack {
  position: absolute;
  top: 48px;
  left: 16px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(100% - 64px);
  overflow-y: auto;
  pointer-events: none;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.left-controls-stack > .glass-card {
  pointer-events: auto;
  position: static;
}

/* 3D 剖切控制面板样式 */
.clipping-panel {
  padding: 12px 16px;
  color: #e0e6ed;
  font-size: 13px;
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
  padding: 12px 16px;
  color: #e0e6ed;
  font-size: 13px;
  min-width: 220px;
}

.layer-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.group-toggle-btn {
  font-size: 10px;
  color: #8c9ba5;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  transition: all 0.2s ease;
  user-select: none;
}

.group-toggle-btn:hover {
  color: #00ff88;
  background: rgba(255, 255, 255, 0.08);
}

.sub-layer-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
  margin-bottom: 2px;
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

.layer-action-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 2px;
}

.select-all-item {
  font-weight: 600;
}

.select-all-title {
  font-weight: 600;
  color: #00ff88;
}

.quick-btn-group {
  display: flex;
  gap: 4px;
}

.layer-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cfd8dc;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.layer-btn:hover {
  background: rgba(0, 255, 136, 0.2);
  border-color: #00ff88;
  color: #ffffff;
}

.layer-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.12);
  margin: 2px 0 4px 0;
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
.annotation-dot { background-color: #38bdf8; }
.probe-dot { background-color: #00ff88; }

.inline-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.left-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mini-anim-btn {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mini-anim-btn:hover {
  background: rgba(56, 189, 248, 0.3);
  color: #ffffff;
}

.mini-anim-btn.paused {
  background: rgba(245, 158, 11, 0.2);
  border-color: rgba(245, 158, 11, 0.5);
  color: #f59e0b;
}

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

.projection-btn-row {
  display: flex;
  gap: 6px;
}

.proj-btn {
  flex: 1;
  text-align: center;
}

/* 受力表达模式面板样式 */
.force-mode-panel {
  padding: 10px 14px;
  color: #e0e6ed;
  font-size: 12px;
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

/* 数值图例与折叠面板扩展样式 */
.legend-container {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.legend-bar-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.color-bar {
  height: 8px;
  border-radius: 4px;
  width: 100%;
}

.k-gradient-bar {
  background: linear-gradient(to right, #ff4d4f 0%, #ff4d4f 33%, #faad14 33%, #faad14 66%, #52c41a 66%, #52c41a 100%);
}

.m-gradient-bar {
  background: linear-gradient(to right, #1890ff, #faad14, #ff5533);
}

.n-gradient-bar {
  background: linear-gradient(to right, #0050b3, #13c2c2, #fa8c16, #f5222d);
}

.combined-gradient-bar {
  background: linear-gradient(to right, #00aaff, #38ef7d, #f12711);
}

.legend-ticks-row, .legend-scale-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: #a0aec0;
}

.legend-ticks-row .tick.danger { color: #ff4d4f; }
.legend-ticks-row .tick.warning { color: #faad14; }
.legend-ticks-row .tick.safe { color: #52c41a; }

.legend-range-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #cbd5e1;
  margin-top: 2px;
}

.probe-tooltip.collapsed {
  padding: 8px 12px;
}

.state-tab-row {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
}

.probe-tab-btn {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cfd8dc;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.probe-tab-btn:hover {
  background: rgba(0, 229, 255, 0.2);
  border-color: #00e5ff;
  color: #ffffff;
}

.probe-tab-btn.active {
  background: #1e88e5;
  color: #ffffff;
  border-color: #42a5f5;
}
</style>