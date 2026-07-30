<!-- frontend/src/views/CompareView.vue -->
<template>
  <div class="compare-view-container">
    <!-- 顶部标题与控制栏 -->
    <header class="compare-header glass-card">
      <div class="header-left">
        <el-icon class="icon"><Files /></el-icon>
        <h2>3D 多维双视角对比看板</h2>
        
      </div>

      <div class="header-center">
        <el-select
          v-model="selectedSnapshotId"
          placeholder="选择对比快照工况"
          size="default"
          style="width: 280px"
          @change="handleSnapshotSelect"
        >
          <el-option
            v-for="snap in snapshots"
            :key="snap.id"
            :label="`${snap.remark || snap.id} [${snap.start_chainage}-${snap.end_chainage}m]`"
            :value="snap.id"
          />
        </el-select>
      </div>

      <div class="header-right">
        <el-switch
          v-model="syncCameraEnabled"
          active-text="同频视角同步"
          inactive-text="独立视角"
          size="default"
        />
        <el-button type="primary" plain size="small" @click="resetCameras">
          重置镜头视角
        </el-button>
      </div>
    </header>

    <!-- 顶部定量标量比对看板 -->
    <div class="metrics-banner glass-card" v-if="activeSnapshot">
      <div class="metric-card">
        <div class="metric-title">全环最小安全系数 K</div>
        <div class="metric-comparison">
          <div class="side orig">
            <span class="tag">原始超限</span>
            <span class="val" :class="{ danger: origMetrics.minK <= 2.0 }">{{ origMetrics.minK.toFixed(2) }}</span>
          </div>
          <div class="arrow">➔</div>
          <div class="side crit">
            <span class="tag">临界加固</span>
            <span class="val success">{{ critMetrics.minKStr }}</span>
          </div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-title">地下水头高度 H (m)</div>
        <div class="metric-comparison">
          <div class="side orig">
            <span class="tag">原始水头</span>
            <span class="val">{{ origMetrics.waterHead.toFixed(1) }}</span>
          </div>
          <div class="arrow">➔</div>
          <div class="side crit">
            <span class="tag">临界水头</span>
            <span class="val highlight">{{ critMetrics.waterHeadStr }}</span>
          </div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-title">注浆加固厚度 tg (m)</div>
        <div class="metric-comparison">
          <div class="side orig">
            <span class="tag">标准注浆</span>
            <span class="val">{{ origMetrics.tg.toFixed(2) }}</span>
          </div>
          <div class="arrow">➔</div>
          <div class="side crit">
            <span class="tag">临界注浆</span>
            <span class="val highlight">{{ critMetrics.tgStr }}</span>
          </div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-title">推荐环向盲管间距 (m)</div>
        <div class="metric-comparison">
          <div class="side orig">
            <span class="tag">设计间距</span>
            <span class="val">{{ origMetrics.ringSpacing.toFixed(1) }}</span>
          </div>
          <div class="arrow">➔</div>
          <div class="side crit">
            <span class="tag">自适应推荐</span>
            <span class="val success">{{ critMetrics.ringSpacingStr }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 左右双 3D 画布对比区 -->
    <div class="split-viewport">
      <!-- 左屏：原始状态（超限预警区） -->
      <div class="viewport-pane left-pane glass-card">
        <div class="pane-badge danger-badge">
          <span>原始解算态 (超限红区)</span>
          <span v-if="!hasCriticalState" class="sub-tip">已达安全标准</span>
        </div>
        <Viewer3D
          ref="leftViewerRef"
          mode="original"
          :snapshot-override="activeSnapshot"
          @camera-change="onLeftCameraChange"
        />
      </div>

      <!-- 右屏：临界加固状态（安全自适应区） -->
      <div class="viewport-pane right-pane glass-card">
        <div class="pane-badge success-badge">
          <span>临界加固态 (自适应安全区)</span>
          <span v-if="hasCriticalState" class="sub-tip">已执行水头降深 & 注浆增厚</span>
          <span v-else class="sub-tip">工况安全，无需增厚加固</span>
        </div>
        <div v-if="!hasCriticalState" class="empty-critical-overlay">
          <div class="empty-card">
            <div class="empty-icon">🛡️</div>
            <div class="empty-title">当前工况结构安全储备充足</div>
            <div class="empty-desc">原始状态最小安全系数 K ≥ 2.0，无需执行水头降深与注浆增厚</div>
          </div>
        </div>
        <Viewer3D
          ref="rightViewerRef"
          mode="critical"
          :snapshot-override="activeSnapshot"
          @camera-change="onRightCameraChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSnapshotStore, Snapshot } from '@/store/snapshotStore';
import { useParameterStore } from '@/store/parameterStore';
import Viewer3D from '@/components/three/Viewer3D.vue';
import { Files } from '@element-plus/icons-vue';

const snapshotStore = useSnapshotStore();
const parameterStore = useParameterStore();

const leftViewerRef = ref<InstanceType<typeof Viewer3D> | null>(null);
const rightViewerRef = ref<InstanceType<typeof Viewer3D> | null>(null);

const selectedSnapshotId = ref<string>('');
const syncCameraEnabled = ref<boolean>(true);
let isSyncingCamera = false;

const snapshots = computed(() => snapshotStore.snapshots);

const activeSnapshot = computed<Snapshot | null>(() => {
  if (selectedSnapshotId.value) {
    const target = snapshotStore.snapshots.find(s => s.id === selectedSnapshotId.value);
    if (target) return target;
  }
  // 缺省情况下返回当前实时计算工况对象
  return {
    id: 'live_compare',
    timestamp: Date.now(),
    remark: '当前实时计算工况',
    start_chainage: parameterStore.currentPayload.start_chainage || 0,
    end_chainage: parameterStore.currentPayload.end_chainage || 50,
    params: parameterStore.currentPayload,
    results: parameterStore.currentResults
  };
});

// 判断是否存在临界加固解
const hasCriticalState = computed(() => {
  const snap = activeSnapshot.value;
  if (!snap || !snap.results) return false;
  return !!snap.results.critical_state && Object.keys(snap.results.critical_state).length > 0;
});

// 计算左右定量指标
const origMetrics = computed(() => {
  const snap = activeSnapshot.value;
  const orig = snap?.results?.original_state ?? {};
  const params = snap?.params ?? {};
  return {
    minK: orig.safety_factor ?? 2.0,
    waterHead: orig.waterHead ?? params.H ?? params.h ?? 30.0,
    tg: Math.max(0, (params.r_g ?? params.rg ?? 8.57) - (params.r_p ?? params.r2 ?? 8.57)),
    ringSpacing: orig.ring_spacing_recommend ?? 5.0
  };
});

const critMetrics = computed(() => {
  const snap = activeSnapshot.value;
  const crit = snap?.results?.critical_state;
  const params = snap?.params ?? {};
  if (!crit || Object.keys(crit).length === 0) {
    return {
      hasCrit: false,
      minKStr: '≥ 2.0 (已达标)',
      waterHeadStr: '--',
      tgStr: '--',
      ringSpacingStr: '--'
    };
  }
  return {
    hasCrit: true,
    minKStr: (crit.final_safety_factor ?? crit.safety_factor ?? 2.5).toFixed(2),
    waterHeadStr: (crit.final_waterHead ?? crit.waterHead ?? params.H ?? params.h ?? 30.0).toFixed(1),
    tgStr: (crit.tg_crit ?? Math.max(0, (params.r_g ?? params.rg ?? 8.57) - (params.r_p ?? params.r2 ?? 8.57))).toFixed(2),
    ringSpacingStr: (crit.ring_spacing_recommend ?? 3.0).toFixed(1)
  };
});

const handleSnapshotSelect = (id: string) => {
  selectedSnapshotId.value = id;
};

// 双视角镜头同步
const onLeftCameraChange = (state: { position: number[]; target: number[] }) => {
  if (!syncCameraEnabled.value || isSyncingCamera) return;
  isSyncingCamera = true;
  rightViewerRef.value?.setCameraState(state);
  isSyncingCamera = false;
};

const onRightCameraChange = (state: { position: number[]; target: number[] }) => {
  if (!syncCameraEnabled.value || isSyncingCamera) return;
  isSyncingCamera = true;
  leftViewerRef.value?.setCameraState(state);
  isSyncingCamera = false;
};

const resetCameras = () => {
  const defaultState = { position: [0, 25, 60], target: [0, 0, -20] };
  leftViewerRef.value?.setCameraState(defaultState);
  rightViewerRef.value?.setCameraState(defaultState);
};

onMounted(() => {
  snapshotStore.loadFromLocal();
  if (snapshotStore.snapshots.length > 0) {
    selectedSnapshotId.value = snapshotStore.snapshots[snapshotStore.snapshots.length - 1].id;
  }
});
</script>

<style scoped>
.compare-view-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #0f1218;
  color: #e0e6ed;
  box-sizing: border-box;
  padding: 12px;
  gap: 12px;
}

.glass-card {
  background: rgba(23, 28, 38, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.compare-header {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-left .icon {
  font-size: 20px;
  color: #409eff;
}

.header-left h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: #ffffff;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.metrics-banner {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding: 12px 16px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-title {
  font-size: 12px;
  color: #8c9ba5;
}

.metric-comparison {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(0, 0, 0, 0.3);
  padding: 6px 12px;
  border-radius: 6px;
}

.side {
  display: flex;
  flex-direction: column;
}

.side .tag {
  font-size: 10px;
  color: #6c7a89;
}

.side .val {
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 16px;
  font-weight: 700;
  color: #e0e6ed;
}

.side .val.danger { color: #ff4d4f; }
.side .val.success { color: #52c41a; }
.side .val.highlight { color: #1890ff; }

.arrow {
  color: #434d59;
  font-size: 14px;
}

.split-viewport {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  min-height: 0;
}

.viewport-pane {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.pane-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.danger-badge {
  background: rgba(255, 77, 79, 0.2);
  border: 1px solid rgba(255, 77, 79, 0.4);
  color: #ff7875;
}

.success-badge {
  background: rgba(82, 196, 26, 0.2);
  border: 1px solid rgba(82, 196, 26, 0.4);
  color: #95de64;
}

.sub-tip {
  font-size: 10px;
  opacity: 0.8;
  font-weight: normal;
}

.empty-critical-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 18, 24, 0.75);
  backdrop-filter: blur(4px);
  z-index: 20;
  display: flex;
  justify-content: center;
  align-items: center;
}

.empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  background: rgba(23, 28, 38, 0.9);
  border: 1px solid rgba(82, 196, 26, 0.4);
  border-radius: 12px;
  padding: 32px 48px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  text-align: center;
}

.empty-icon {
  font-size: 48px;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: #52c41a;
}

.empty-desc {
  font-size: 13px;
  color: #8c9ba5;
}
</style>
