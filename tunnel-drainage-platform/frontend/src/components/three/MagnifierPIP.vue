<!-- tunnel-drainage-platform/frontend/src/components/three/MagnifierPIP.vue -->
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
      <div class="pip-badge">
        Layer 1: Micro Details - {{ getBadgeTitle }}
      </div>
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
          <span class="pip-metric-label">连接与滤层</span>
          <span class="pip-metric-value">{{ getFabricLabel }}</span>
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
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';

export interface PipeDataProps {
  name?: string;
  pipeCategory?: 'ring' | 'longitudinal' | 'lateral' | 'three_way';
  nodeType?: 'standard' | 'three-way';
  diameter?: number;
  spacing?: number;
  permeability?: string;
  flowRate?: string;
  status?: string;
  isAnnotation?: boolean;
}

const props = withDefaults(defineProps<{
  active: boolean;
  pipeData?: PipeDataProps | null;
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
let branchStream: THREE.LineSegments | null = null;

const getBadgeTitle = computed(() => {
  if (props.pipeData?.nodeType === 'three-way' || props.pipeData?.pipeCategory === 'three_way') {
    return '环向-纵向三通节点';
  }
  return props.pipeData?.name || '标准打孔管';
});

const getFabricLabel = computed(() => {
  const cat = props.pipeData?.pipeCategory;
  if (cat === 'three_way') return 'T型铸铁汇流包壳';
  if (cat === 'longitudinal') return '集水沉渣槽包覆';
  return '400g/m² 无纺包覆';
});

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
  camera.position.set(0.65, 0.55, 0.85);
  camera.lookAt(0, 0, 0);

  // 灯光配置
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0x38bdf8, 2.8);
  dirLight.position.set(2, 3, 4);
  scene.add(dirLight);

  const pointLight = new THREE.PointLight(0x00f3ff, 3.5, 5);
  pointLight.position.set(-1, -1, 1);
  scene.add(pointLight);

  rebuildPIPScene();
  startAnimation();
};

/**
 * 销毁上一轮 3D 网格、材质与几何体，按当前 nodeType 重新构建 3D 微观模型
 */
const rebuildPIPScene = () => {
  if (!scene) return;

  if (pipeMesh) {
    scene.remove(pipeMesh);
    pipeMesh.traverse((child) => {
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else mat.dispose();
      }
    });
    pipeMesh = null;
    waterStream = null;
    branchStream = null;
  }

  const cat = props.pipeData?.pipeCategory;
  const nodeType = props.pipeData?.nodeType;

  if (nodeType === 'three-way' || cat === 'three_way') {
    pipeMesh = createThreeWayNodeGroup();
  } else {
    pipeMesh = createMicroPipeGroup();
  }

  if (pipeMesh) {
    scene.add(pipeMesh);
  }
};

/**
 * 1. 标准打孔直管微观模型 (透水槽口 + 无纺土工布包覆网格)
 */
const createMicroPipeGroup = (): THREE.Group => {
  const group = new THREE.Group();

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

  // 打孔槽结构
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

  // 无纺土工布包裹网格
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

  // 主管直通水流粒子
  waterStream = createStreamLineSegments(pipeRadius - 0.01, 120, 1.0);
  group.add(waterStream);

  return group;
};

/**
 * 2. 环向盲管与纵向排水管三通连接节点微观模型
 * 主管：纵向主排水管 (沿 X 轴卧铺)
 * 支管：环向盲管下落段 (沿 Y 轴自上方垂直/倾斜汇入)
 */
const createThreeWayNodeGroup = (): THREE.Group => {
  const group = new THREE.Group();

  const mainRadius = 0.075;   // 纵向主排水管 (Φ150mm)
  const branchRadius = 0.06;  // 环向盲管 (Φ100mm)

  // 1. 纵向主排水管 (沿 X 轴)
  const mainPipeGeo = new THREE.CylinderGeometry(mainRadius, mainRadius, 0.9, 24);
  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    metalness: 0.85,
    roughness: 0.18,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  });
  const mainPipe = new THREE.Mesh(mainPipeGeo, pipeMat);
  mainPipe.rotation.z = Math.PI / 2;
  group.add(mainPipe);

  // 2. 环向盲管弧形下落段 (沿 Y 轴自顶部垂直汇入)
  const branchPipeGeo = new THREE.CylinderGeometry(branchRadius, branchRadius, 0.45, 24);
  const branchPipe = new THREE.Mesh(branchPipeGeo, pipeMat);
  branchPipe.position.set(0, 0.225, 0);
  group.add(branchPipe);

  // 3. T 型三通铸铁强化包壳与凸缘套箍 (琥珀金 PBR 金属质感)
  const collarGeo = new THREE.SphereGeometry(0.092, 20, 20);
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.92,
    roughness: 0.12,
    emissive: new THREE.Color(0x1a1000)
  });
  const collar = new THREE.Mesh(collarGeo, collarMat);
  group.add(collar);

  // 4. 纵向主管直通水流 (沿 X 轴)
  waterStream = createStreamLineSegments(mainRadius - 0.01, 100, 0.9);
  group.add(waterStream);

  // 5. 环向盲管汇入水流 (沿 Y 轴自上方指向 0 汇入)
  branchStream = createVerticalBranchStreamSegments(branchRadius - 0.008, 50);
  group.add(branchStream);

  return group;
};

/**
 * 辅助函数：创建沿 X 轴的主管直通水流线段
 */
const createStreamLineSegments = (maxR: number, count: number, length: number): THREE.LineSegments => {
  const points: number[] = [];
  const colors: number[] = [];

  for (let i = 0; i < count; i++) {
    const x1 = (Math.random() - 0.5) * length;
    const rPos = Math.random() * maxR;
    const angle = Math.random() * Math.PI * 2;
    const y1 = Math.cos(angle) * rPos;
    const z1 = Math.sin(angle) * rPos;

    const x2 = x1 + 0.08;
    const y2 = y1;
    const z2 = z1;

    points.push(x1, y1, z1, x2, y2, z2);
    colors.push(0.0, 0.85, 1.0, 0.9, 1.0, 1.0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    linewidth: 2
  });

  return new THREE.LineSegments(geo, mat);
};

/**
 * 辅助函数：创建沿 Y 轴自上方指向交汇点 0 的环向盲管水流线段
 */
const createVerticalBranchStreamSegments = (maxR: number, count: number): THREE.LineSegments => {
  const points: number[] = [];
  const colors: number[] = [];

  for (let i = 0; i < count; i++) {
    const y1 = 0.05 + Math.random() * 0.38;
    const rPos = Math.random() * maxR;
    const angle = Math.random() * Math.PI * 2;
    const x1 = Math.cos(angle) * rPos;
    const z1 = Math.sin(angle) * rPos;

    const y2 = y1 - 0.06;
    const x2 = x1;
    const z2 = z1;

    points.push(x1, y1, z1, x2, y2, z2);
    colors.push(0.96, 0.62, 0.04, 1.0, 0.9, 1.0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    linewidth: 2
  });

  return new THREE.LineSegments(geo, mat);
};

const startAnimation = () => {
  if (animFrameId !== null) return;
  let clock = new THREE.Clock();

  const loop = () => {
    animFrameId = requestAnimationFrame(loop);
    const dt = clock.getDelta();

    if (pipeMesh) {
      pipeMesh.rotation.y += dt * 0.35;
    }

    // 1. 更新纵向主管水流 (沿 X 轴流动)
    if (waterStream) {
      const positions = waterStream.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 6) {
        positions[i] += dt * 0.45;
        positions[i + 3] += dt * 0.45;
        if (positions[i] > 0.45) {
          positions[i] = -0.45;
          positions[i + 3] = -0.37;
        }
      }
      waterStream.geometry.attributes.position.needsUpdate = true;
    }

    // 2. 更新环向盲管水流 (沿 Y 轴自上方指向 0 汇入)
    if (branchStream) {
      const bPositions = branchStream.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < bPositions.length; i += 6) {
        bPositions[i + 1] -= dt * 0.4;
        bPositions[i + 4] -= dt * 0.4;
        if (bPositions[i + 1] < 0.02) {
          bPositions[i + 1] = 0.42;
          bPositions[i + 4] = 0.36;
        }
      }
      branchStream.geometry.attributes.position.needsUpdate = true;
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

/**
 * 彻底释放 WebGLRenderer 与 GPU 上下文句柄
 */
const disposePIPRenderer = () => {
  stopAnimation();
  if (scene && pipeMesh) {
    scene.remove(pipeMesh);
    pipeMesh.traverse((child) => {
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else mat.dispose();
      }
    });
    pipeMesh = null;
    waterStream = null;
    branchStream = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  scene = null;
  camera = null;
};

watch([() => props.active, () => props.pipeData], ([newActive, _newPipeData]) => {
  if (newActive) {
    if (!renderer) {
      setTimeout(() => initPIPRenderer(), 50);
    } else {
      rebuildPIPScene();
      startAnimation();
    }
  } else {
    disposePIPRenderer();
  }
}, { deep: true });

onMounted(() => {
  if (props.active) {
    initPIPRenderer();
  }
});

onBeforeUnmount(() => {
  disposePIPRenderer();
});
</script>

<style scoped>
.pip-magnifier-container {
  position: absolute;
  bottom: 24px;
  right: 260px;
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
