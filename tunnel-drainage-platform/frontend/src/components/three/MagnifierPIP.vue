<template>
  <div v-if="active" class="pip-magnifier-container glass-card">
    <div class="pip-header">
      <div class="pip-title-group">
        <span class="pip-icon">🔍</span>
        <span class="pip-title">微观防排水结构放大镜 (8.0x)</span>
      </div>
      <button class="pip-close-btn" @click="emit('close')" title="关闭放大镜头 (ESC / 点击空白区)">✕</button>
    </div>
    
    <!-- PIP 画中画 3D 渲染视图容器 -->
    <div class="pip-viewport" ref="viewportRef">
      <canvas ref="pipCanvasRef"></canvas>
      <div class="pip-badge">Layer 1: Micro Details</div>
    </div>
    
    <div class="pip-footer">
      <div class="pip-metric-grid">
        <div class="pip-metric-item">
          <span class="pip-metric-label">构件名称</span>
          <span class="pip-metric-value highlight">{{ pipeData?.name || '环向盲管' }}</span>
        </div>
        <div class="pip-metric-item">
          <span class="pip-metric-label">管径 (d)</span>
          <span class="pip-metric-value">Φ{{ pipeData?.diameter || 100 }} mm</span>
        </div>
        <div class="pip-metric-item">
          <span class="pip-metric-label">排布间距 (L_sp)</span>
          <span class="pip-metric-value">{{ pipeData?.spacing ? pipeData.spacing + ' m' : '4.0 m' }}</span>
        </div>
        <div class="pip-metric-item">
          <span class="pip-metric-label">透水土工布</span>
          <span class="pip-metric-value">{{ pipeData?.pipeCategory === 'longitudinal' ? '集水沉渣槽包覆' : '400g/m² 无纺包覆' }}</span>
        </div>
        <div class="pip-metric-item">
          <span class="pip-metric-label">滤层渗透系数</span>
          <span class="pip-metric-value">{{ pipeData?.permeability || '1.2×10⁻² cm/s' }}</span>
        </div>
        <div class="pip-metric-item">
          <span class="pip-metric-label">排水分流状态</span>
          <span class="pip-metric-value status-good">{{ pipeData?.status || '自流通畅' }} ({{ pipeData?.flowRate || '0.15 L/s' }})</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';

const props = withDefaults(defineProps<{
  active: boolean;
  pipeData?: {
    name?: string;
    pipeCategory?: 'ring' | 'longitudinal' | 'lateral';
    diameter?: number;
    spacing?: number;
    permeability?: string;
    flowRate?: string;
    status?: string;
  } | null;
}>(), {
  active: false,
  pipeData: null
});

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const viewportRef = ref<HTMLElement | null>(null);
const pipCanvasRef = ref<HTMLCanvasElement | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let animFrameId: number | null = null;

let pipeMesh: THREE.Group | null = null;
let waterStream: THREE.LineSegments | null = null;

const initPIPRenderer = () => {
  if (!pipCanvasRef.value || !viewportRef.value) return;

  const w = viewportRef.value.clientWidth || 320;
  const h = viewportRef.value.clientHeight || 200;

  renderer = new THREE.WebGLRenderer({
    canvas: pipCanvasRef.value,
    antialias: true,
    alpha: true
  });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060e1a);

  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
  camera.position.set(0.6, 0.5, 0.8);
  camera.lookAt(0, 0, 0);

  // 灯光配置
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0x38bdf8, 2.5);
  dirLight.position.set(2, 3, 4);
  scene.add(dirLight);

  const pointLight = new THREE.PointLight(0x00f3ff, 3.0, 5);
  pointLight.position.set(-1, -1, 1);
  scene.add(pointLight);

  // 构建微观管道模型 (含透水打孔 + 土工布包裹网格)
  pipeMesh = createMicroPipeGroup();
  scene.add(pipeMesh);

  startAnimation();
};

const createMicroPipeGroup = (): THREE.Group => {
  const group = new THREE.Group();

  // 1. 排水管主体 (外径 d=0.1m, 厚度 5mm)
  const pipeRadius = 0.08;
  const pipeGeo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, 1.2, 32, 1, true);
  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x00c8ff,
    metalness: 0.8,
    roughness: 0.2,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide
  });
  const outerPipe = new THREE.Mesh(pipeGeo, pipeMat);
  outerPipe.rotation.z = Math.PI / 2;
  group.add(outerPipe);

  // 2. 打孔槽结构 (Perforated Slots)
  const slotCount = 24;
  const slotGeo = new THREE.BoxGeometry(0.04, 0.008, 0.015);
  const slotMat = new THREE.MeshBasicMaterial({ color: 0x030712 });

  for (let i = 0; i < slotCount; i++) {
    const slot = new THREE.Mesh(slotGeo, slotMat);
    const angle = (i / slotCount) * Math.PI * 2;
    const zPos = (i % 6 - 2.5) * 0.18;
    slot.position.set(zPos, Math.cos(angle) * pipeRadius, Math.sin(angle) * pipeRadius);
    slot.rotation.x = angle;
    group.add(slot);
  }

  // 3. 无纺土工布无隐身外包覆层 (Geotextile Filter Fabric Wireframe)
  const fabricGeo = new THREE.CylinderGeometry(pipeRadius + 0.006, pipeRadius + 0.006, 1.22, 16, 8, true);
  const fabricMat = new THREE.MeshBasicMaterial({
    color: 0xffb800,
    wireframe: true,
    transparent: true,
    opacity: 0.35
  });
  const fabricMesh = new THREE.Mesh(fabricGeo, fabricMat);
  fabricMesh.rotation.z = Math.PI / 2;
  group.add(fabricMesh);

  // 4. 管内微观水流束 (Intra-pipe Water Stream Particles)
  const streamPoints: number[] = [];
  const streamColors: number[] = [];
  for (let i = 0; i < 120; i++) {
    const x1 = (Math.random() - 0.5) * 1.0;
    const rPos = Math.random() * (pipeRadius - 0.01);
    const angle = Math.random() * Math.PI * 2;
    const y1 = Math.cos(angle) * rPos;
    const z1 = Math.sin(angle) * rPos;

    const x2 = x1 + 0.08;
    const y2 = y1;
    const z2 = z1;

    streamPoints.push(x1, y1, z1, x2, y2, z2);
    streamColors.push(0.0, 0.8, 1.0, 1.0, 1.0, 1.0);
  }

  const streamGeo = new THREE.BufferGeometry();
  streamGeo.setAttribute('position', new THREE.Float32BufferAttribute(streamPoints, 3));
  streamGeo.setAttribute('color', new THREE.Float32BufferAttribute(streamColors, 3));

  const streamMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    linewidth: 2
  });

  waterStream = new THREE.LineSegments(streamGeo, streamMat);
  group.add(waterStream);

  return group;
};

const startAnimation = () => {
  if (animFrameId !== null) return;
  let clock = new THREE.Clock();

  const loop = () => {
    animFrameId = requestAnimationFrame(loop);
    const dt = clock.getDelta();

    if (pipeMesh) {
      pipeMesh.rotation.x += dt * 0.3;
    }

    if (waterStream) {
      const positions = waterStream.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 6) {
        positions[i] += dt * 0.4;
        positions[i + 3] += dt * 0.4;
        if (positions[i] > 0.5) {
          positions[i] = -0.5;
          positions[i + 3] = -0.42;
        }
      }
      waterStream.geometry.attributes.position.needsUpdate = true;
    }

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  };
  loop();
};

const stopAnimation = () => {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
};

watch(() => props.active, (newVal) => {
  if (newVal) {
    setTimeout(() => {
      initPIPRenderer();
    }, 100);
  } else {
    stopAnimation();
  }
});

onMounted(() => {
  if (props.active) {
    initPIPRenderer();
  }
});

onBeforeUnmount(() => {
  stopAnimation();
  if (renderer) {
    renderer.dispose();
  }
});
</script>

<style scoped>
.pip-magnifier-container {
  position: absolute;
  bottom: 24px;
  right: 24px;
  width: 360px;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  overflow: hidden;
  z-index: 100;
  display: flex;
  flex-direction: column;
  animation: pipSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes pipSlideIn {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.pip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(30, 41, 59, 0.7);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.pip-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pip-icon {
  font-size: 14px;
}

.pip-title {
  font-size: 13px;
  font-weight: 700;
  color: #38bdf8;
  letter-spacing: 0.5px;
}

.pip-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.2s;
}

.pip-close-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.pip-viewport {
  position: relative;
  width: 100%;
  height: 190px;
  background: #030712;
}

.pip-viewport canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.pip-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  font-size: 10px;
  font-weight: 600;
  color: #38bdf8;
  background: rgba(15, 23, 42, 0.75);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.pip-footer {
  padding: 12px;
  background: rgba(15, 23, 42, 0.95);
}

.pip-metric-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}

.pip-metric-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pip-metric-label {
  font-size: 10px;
  color: #64748b;
}

.pip-metric-value {
  font-size: 12px;
  font-weight: 600;
  color: #f1f5f9;
}

.pip-metric-value.highlight {
  color: #38bdf8;
}

.pip-metric-value.status-good {
  color: #4ade80;
}
</style>
