<!-- frontend/src/components/ui/SnapshotSidebar.vue -->
<template>
  <div class="snapshot-sidebar">
    <!-- 1. 顶部操作与全局动作 -->
    <div class="header">
      <div class="header-title-bar">
        <h4>工况快照与序列库</h4>
        <div class="header-btns">
          <el-button type="warning" size="small" plain @click="handleRefresh3D">🔄 刷新3D</el-button>
          <el-button 
            type="success" 
            size="small" 
            plain 
            :loading="isBatchCalculating"
            @click="isBatchCalculating ? cancelBatchCalculation() : quickCalculatePending()"
          >
            {{ isBatchCalculating ? '⏹ 停止计算' : '⚡ 批量计算' }}
          </el-button>
          <el-button type="primary" size="small" @click="handleSaveSnapshot">保存快照</el-button>
        </div>
      </div>

      <!-- 2. 统计指示栏（Badges）与一键快速过滤 -->
      <div class="stats-bar">
        <span 
          class="stat-badge" 
          :class="{ active: filterStatus === 'all' && filterRisk === 'all' }" 
          @click="resetFilter"
        >
          📊 总计: {{ totalCount }}
        </span>
        <span 
          class="stat-badge badge-success" 
          :class="{ active: filterStatus === 'done' }" 
          @click="toggleStatusFilter('done')"
        >
          🟢 已算: {{ doneCount }}
        </span>
        <span 
          class="stat-badge badge-warning" 
          :class="{ active: filterStatus === 'pending' }" 
          @click="toggleStatusFilter('pending')"
        >
          🟡 待算: {{ pendingCount }}
        </span>
        <span 
          class="stat-badge badge-danger" 
          :class="{ active: filterRisk === 'risk' }" 
          @click="toggleRiskFilter('risk')"
        >
          🔴 预警: {{ riskCount }}
        </span>
        <span class="stat-badge badge-3d" title="当前参与 3D 空间拼装的区间数">
          🧊 3D: {{ selected3DCount }}/{{ totalCount }}
        </span>
      </div>

      <!-- 批量计算进度指示条 -->
      <div class="batch-progress-box" v-if="isBatchCalculating">
        <div class="progress-info">
          <span>正在并发调度计算中 ({{ calcCurrentIndex }}/{{ calcTotalTasks }})...</span>
          <span>{{ calcProgress }}%</span>
        </div>
        <el-progress :percentage="calcProgress" :status="calcProgress === 100 ? 'success' : ''" :stroke-width="6" :show-text="false" />
      </div>

      <!-- 3. 复合搜索与过滤工具栏 -->
      <div class="filter-toolbar">
        <el-input 
          v-model="searchKeyword" 
          placeholder="搜索桩号(如150/K1)或工况备注" 
          prefix-icon="Search" 
          size="small" 
          clearable 
          class="search-input"
        />

        <div class="filter-controls-row">
          <el-select v-model="filterStatus" placeholder="计算状态" size="small" class="filter-select">
            <el-option label="全部状态" value="all" />
            <el-option label="🟢 已计算" value="done" />
            <el-option label="🟡 待计算" value="pending" />
            <el-option label="🔴 失败" value="error" />
          </el-select>

          <el-select v-model="filterRisk" placeholder="安全风险" size="small" class="filter-select">
            <el-option label="全部风险" value="all" />
            <el-option label="🔴 临界预警 (Fs<2.0)" value="risk" />
            <el-option label="🟢 结构安全 (Fs≥2.0)" value="safe" />
          </el-select>

          <!-- 一键全量折叠/展开开关 -->
          <el-button 
            size="small" 
            :icon="isAllCollapsed ? 'Expand' : 'Fold'" 
            @click="toggleAllCollapse"
            class="collapse-all-btn"
          >
            {{ isAllCollapsed ? '全展开' : '全折叠' }}
          </el-button>

          <!-- 批量 3D 勾选控制菜单 -->
          <el-dropdown trigger="click" @command="handle3DDropdownCommand">
            <el-button size="small" icon="Checked" class="more-3d-btn">
              3D勾选<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="select_filtered">勾选当前筛选结果</el-dropdown-item>
                <el-dropdown-item command="unselect_filtered">取消筛选结果勾选</el-dropdown-item>
                <el-dropdown-item command="select_all" divided>全选全线所有工况</el-dropdown-item>
                <el-dropdown-item command="clear_all">清空所有 3D 勾选</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>

    <!-- 4. 快照卡片列表（支持手风琴双态折叠与分页） -->
    <div class="snapshot-list" ref="snapshotListRef">
      <template v-if="filteredSnapshots.length > 0">
        <el-card 
          v-for="snap in pagedSnapshots" 
          :key="snap.id" 
          class="snapshot-item" 
          :class="{ 'is-risk': isRiskSnapshot(snap), 'is-active': selectedSnapshotId === snap.id }"
          shadow="hover"
        >
          <!-- 4.1 紧凑顶栏（常驻，高度仅约 40px，点击空白处回溯工况） -->
          <div class="compact-header" @click="restoreSnapshot(snap.id)">
            <div class="compact-left">
              <el-checkbox 
                v-model="snap.selectedFor3D" 
                @click.stop 
                class="snap-checkbox"
              />
              <span class="snap-chainage-badge">
                K{{ getChainage(snap, 'start') }} ~ K{{ getChainage(snap, 'end') }}
              </span>
              <span class="snap-remark-text" :title="getSnapRemark(snap)">
                {{ getSnapRemark(snap) }}
              </span>
            </div>

            <div class="compact-right" @click.stop>
              <!-- 安全系数微标 -->
              <span 
                class="fs-badge" 
                :class="getFsClass(getSnapshotFs(snap))" 
                v-if="getSnapshotFs(snap) != null"
                title="安全系数 Fs"
              >
                Fs: {{ getSnapshotFs(snap)?.toFixed(2) }}
              </span>

              <!-- 状态标签 -->
              <el-tag :type="getStatusTag(snap)" size="small" effect="light" class="status-tag">
                {{ snap.status === 'done' || snap.results ? '已算' : snap.status === 'error' ? '失败' : '待算' }}
              </el-tag>

              <!-- 手风琴展开/收起切换按钮 -->
              <el-button 
                link 
                size="small" 
                :icon="isCardExpanded(snap.id) ? 'ArrowUp' : 'ArrowDown'" 
                @click="toggleCardCollapse(snap.id)" 
                class="expand-toggle-btn"
                title="展开/收起详细指标"
              />

              <!-- 快捷删除 -->
              <el-button 
                link 
                type="danger" 
                size="small" 
                icon="Delete" 
                @click="handleDeleteSnapshot(snap.id)"
                class="delete-btn" 
              />
            </div>
          </div>

          <!-- 4.2 深度展开态（详细指标网格与临界加固矩阵） -->
          <div class="expanded-drawer" v-show="isCardExpanded(snap.id)">
            <div class="results-summary" v-if="snap.results">
              <div class="main-metrics">
                <span class="metric-item">原始状态水头: <b>{{ snap.results.original_state?.waterHead?.toFixed(2) }}m</b></span>
                <span class="metric-item">安全系数: <b :class="getFsClass(snap.results.original_state?.safety_factor)">{{
                  snap.results.original_state?.safety_factor?.toFixed(2) }}</b></span>
              </div>
              <div class="res-grid">
                <div class="res-cell">
                  <span class="lbl">环向间距设计值</span>
                  <span class="val">{{ getOrigMetric(snap, 'ring_spacing_recommend')?.toFixed(2) || '-' }} m</span>
                </div>
                <div class="res-cell">
                  <span class="lbl">环向孔径设计值</span>
                  <span class="val">{{ getOrigMetric(snap, 'ring_diam_recommend') != null ? (getOrigMetric(snap, 'ring_diam_recommend') * 1000).toFixed(0) : '-' }} mm</span>
                </div>
                <div class="res-cell">
                  <span class="lbl">横向管径设计值</span>
                  <span class="val">{{ getOrigMetric(snap, 'lateral_diam_recommend') != null ? (getOrigMetric(snap, 'lateral_diam_recommend') * 1000).toFixed(0) : '-' }} mm</span>
                </div>
                <div class="res-cell">
                  <span class="lbl">分区总涌水量 Q</span>
                  <span class="val">{{ (getOrigMetric(snap, 'Q') ?? snap.results.original_state?.q_drain)?.toFixed(2) || '-' }} m³/d</span>
                </div>
              </div>

              <!-- 临界超限加固指标 -->
              <div class="critical-section" v-if="snap.results.critical_state">
                <div class="main-metrics critical-metrics">
                  <span class="metric-item">临界加固水头: <b class="text-danger">{{ snap.results.critical_state?.final_waterHead?.toFixed(2) }}m</b></span>
                  <span class="metric-item">临界安全系数: <b :class="getFsClass(snap.results.critical_state?.final_safety_factor)">{{
                    snap.results.critical_state?.final_safety_factor?.toFixed(2) }}</b></span>
                </div>
                <div class="res-grid critical-rec-grid">
                  <div class="res-cell">
                    <span class="lbl">临界环向间距</span>
                    <span class="val">{{ getCritMetric(snap, 'ring_spacing_recommend')?.toFixed(2) || '-' }} m</span>
                  </div>
                  <div class="res-cell">
                    <span class="lbl">临界环向孔径</span>
                    <span class="val">{{ getCritMetric(snap, 'ring_diam_recommend') != null ? (getCritMetric(snap, 'ring_diam_recommend') * 1000).toFixed(0) : '-' }} mm</span>
                  </div>
                  <div class="res-cell">
                    <span class="lbl">临界横向管径</span>
                    <span class="val">{{ getCritMetric(snap, 'lateral_diam_recommend') != null ? (getCritMetric(snap, 'lateral_diam_recommend') * 1000).toFixed(0) : '-' }} mm</span>
                  </div>
                  <div class="res-cell">
                    <span class="lbl">临界总涌水量 Q</span>
                    <span class="val">{{ (getCritMetric(snap, 'Q') ?? snap.results.critical_state?.final_Q)?.toFixed(2) || '-' }} m³/d</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="results-summary pending-box" v-else>
              <span style="color: #909399; font-size: 12px;">待接入引擎计算...</span>
            </div>

            <!-- 卡片底部元信息与功能按钮 -->
            <div class="snap-meta">
              <span class="time">{{ formatTime(snap.timestamp) }}</span>
              <div class="actions-btn">
                <el-button 
                  type="primary" 
                  link 
                  icon="Download" 
                  :disabled="!snap.results?.original_state"
                  @click.stop="handleDownloadRaw(snap)"
                >
                  结果JSON
                </el-button>
                <el-button 
                  type="success" 
                  link 
                  icon="Refresh" 
                  @click.stop="recalculateSingle(snap)"
                >
                  单段重算
                </el-button>
              </div>
            </div>
          </div>
        </el-card>

        <!-- 5. 百级数据分页器 -->
        <div class="pagination-container" v-if="filteredSnapshots.length > pageSize">
          <el-pagination
            v-model:current-page="currentPage"
            :page-size="pageSize"
            :total="filteredSnapshots.length"
            layout="prev, pager, next"
            small
            background
            class="compact-pagination"
          />
        </div>
      </template>

      <!-- 空数据状态提示 -->
      <el-empty 
        v-else 
        :description="snapshots.length === 0 ? '暂无快照记录，请计算或导入' : '未找到符合筛选条件的工况快照'" 
        :image-size="60" 
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSnapshotStore, type Snapshot } from '@/store/snapshotStore';
import { calculateDrainage } from '@/api/index'; // 引入计算接口
import { ElMessage, ElMessageBox } from 'element-plus';
import { useParameterStore } from '@/store/parameterStore';

const snapshotStore = useSnapshotStore();
const parameterStore = useParameterStore();
const snapshots = computed(() => snapshotStore.snapshots);

// ==========================================
// 1. 过滤与检索状态机
// ==========================================
const searchKeyword = ref('');
const filterStatus = ref<'all' | 'done' | 'pending' | 'error'>('all');
const filterRisk = ref<'all' | 'risk' | 'safe'>('all');
const selectedSnapshotId = ref<string | null>(null);

// 统计指示器
const totalCount = computed(() => snapshots.value.length);
const doneCount = computed(() => snapshots.value.filter(s => s.status === 'done' || s.results).length);
const pendingCount = computed(() => snapshots.value.filter(s => !s.results && s.status !== 'error').length);
const riskCount = computed(() => snapshots.value.filter(s => {
  const fs = getSnapshotFs(s);
  return fs != null && fs < 2.0;
}).length);
const selected3DCount = computed(() => snapshots.value.filter(s => s.selectedFor3D).length);

// 快捷切换过滤
const resetFilter = () => {
  filterStatus.value = 'all';
  filterRisk.value = 'all';
  searchKeyword.value = '';
};

const toggleStatusFilter = (status: 'done' | 'pending' | 'error') => {
  filterStatus.value = filterStatus.value === status ? 'all' : status;
};

const toggleRiskFilter = (risk: 'risk' | 'safe') => {
  filterRisk.value = filterRisk.value === risk ? 'all' : risk;
};

// 提取安全系数 Fs
function getSnapshotFs(snap: any): number | null {
  if (!snap.results) return null;
  return snap.results.original_state?.safety_factor ?? snap.results.critical_state?.final_safety_factor ?? null;
}

function isRiskSnapshot(snap: any): boolean {
  const fs = getSnapshotFs(snap);
  return fs != null && fs < 2.0;
}

// 核心多维复合过滤管道
const filteredSnapshots = computed(() => {
  return snapshots.value.filter((snap: any) => {
    // 1. 状态匹配
    if (filterStatus.value === 'done' && !(snap.status === 'done' || snap.results)) return false;
    if (filterStatus.value === 'pending' && (snap.results || snap.status === 'error')) return false;
    if (filterStatus.value === 'error' && snap.status !== 'error') return false;

    // 2. 风险匹配
    if (filterRisk.value !== 'all') {
      const fs = getSnapshotFs(snap);
      if (filterRisk.value === 'risk' && (fs == null || fs >= 2.0)) return false;
      if (filterRisk.value === 'safe' && (fs == null || fs < 2.0)) return false;
    }

    // 3. 关键字/桩号搜索匹配
    if (searchKeyword.value.trim()) {
      const kw = searchKeyword.value.trim().toLowerCase();
      const remark = String(snap.remark || '').toLowerCase();
      const startChain = String(getChainage(snap, 'start'));
      const endChain = String(getChainage(snap, 'end'));
      const chainText = `k${startChain}~k${endChain}`.toLowerCase();

      // 数字纯数值桩号区间模糊匹配
      const kwNum = parseFloat(kw.replace(/[^\d.]/g, ''));
      let matchNumber = false;
      if (!isNaN(kwNum)) {
        const sNum = parseFloat(startChain);
        const eNum = parseFloat(endChain);
        if (!isNaN(sNum) && !isNaN(eNum)) {
          matchNumber = kwNum >= sNum && kwNum <= eNum;
        }
      }

      const matchText = remark.includes(kw) || chainText.includes(kw) || startChain.includes(kw) || endChain.includes(kw);
      if (!matchText && !matchNumber) return false;
    }

    return true;
  });
});

// ==========================================
// 2. 分页控制
// ==========================================
const currentPage = ref(1);
const pageSize = ref(15);

// 过滤条件变动时自动重置至第一页
watch([searchKeyword, filterStatus, filterRisk], () => {
  currentPage.value = 1;
});

const pagedSnapshots = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredSnapshots.value.slice(start, start + pageSize.value);
});

// ==========================================
// 3. 手风琴折叠状态机
// ==========================================
const isAllCollapsed = ref(true); // 默认全量折叠紧凑态
const collapsedMap = ref<Record<string, boolean>>({});

const isCardExpanded = (id: string) => {
  if (collapsedMap.value[id] !== undefined) {
    return collapsedMap.value[id];
  }
  return !isAllCollapsed.value;
};

const toggleCardCollapse = (id: string) => {
  const current = isCardExpanded(id);
  collapsedMap.value[id] = !current;
};

const toggleAllCollapse = () => {
  isAllCollapsed.value = !isAllCollapsed.value;
  collapsedMap.value = {}; // 清空个别覆盖
};

// ==========================================
// 4. 批量 3D 勾选控制
// ==========================================
const handle3DDropdownCommand = (cmd: string) => {
  if (cmd === 'select_filtered') {
    filteredSnapshots.value.forEach((s: any) => s.selectedFor3D = true);
    ElMessage.success(`已勾选当前筛选的 ${filteredSnapshots.value.length} 个工况用于 3D 拼装`);
  } else if (cmd === 'unselect_filtered') {
    filteredSnapshots.value.forEach((s: any) => s.selectedFor3D = false);
    ElMessage.info(`已取消当前筛选的 ${filteredSnapshots.value.length} 个工况 3D 勾选`);
  } else if (cmd === 'select_all') {
    snapshots.value.forEach((s: any) => s.selectedFor3D = true);
    ElMessage.success(`已全选全线 ${snapshots.value.length} 个工况用于 3D 拼装`);
  } else if (cmd === 'clear_all') {
    snapshots.value.forEach((s: any) => s.selectedFor3D = false);
    ElMessage.info('已清空全部 3D 渲染勾选');
  }
  snapshotStore.saveToLocal();
};

// ==========================================
// 5. 批量计算进度与并发控制
// ==========================================
const isBatchCalculating = ref(false);
const calcProgress = ref(0);
const calcCurrentIndex = ref(0);
const calcTotalTasks = ref(0);
let cancelBatchRequested = false;

const cancelBatchCalculation = () => {
  cancelBatchRequested = true;
  ElMessage.warning('正在终止批量计算任务...');
};

const quickCalculatePending = async () => {
  const pendingSnaps = snapshots.value.filter((s: any) => !s.results || s.status === 'pending');
  if (pendingSnaps.length === 0) {
    ElMessage.success('序列库中暂无需要计算的工况');
    return;
  }

  isBatchCalculating.value = true;
  cancelBatchRequested = false;
  calcTotalTasks.value = pendingSnaps.length;
  calcCurrentIndex.value = 0;
  calcProgress.value = 0;

  ElMessage.info(`开始执行并发批量计算，共 ${pendingSnaps.length} 个工况区间...`);

  // 并发池调度（限制并发度为 3）
  const CONCURRENCY = 3;
  let cursor = 0;

  const executeWorker = async () => {
    while (cursor < pendingSnaps.length && !cancelBatchRequested) {
      const snap = pendingSnaps[cursor++];
      try {
        const payload = snap.params || {};
        const res = await calculateDrainage(payload);
        snap.results = res;
        snap.status = 'done';
      } catch (err) {
        console.error(`区间 ${snap.remark} 计算失败:`, err);
        snap.status = 'error';
      } finally {
        calcCurrentIndex.value++;
        calcProgress.value = Math.round((calcCurrentIndex.value / calcTotalTasks.value) * 100);
      }
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, pendingSnaps.length) }, () => executeWorker());
  await Promise.all(workers);

  isBatchCalculating.value = false;
  snapshotStore.saveToLocal();

  if (cancelBatchRequested) {
    ElMessage.info(`批量计算已终止，已完成 ${calcCurrentIndex.value}/${calcTotalTasks.value} 项`);
  } else {
    ElMessage.success(`全序列计算完毕，成功完成 ${calcCurrentIndex.value} 个工况`);
  }
};

// 单段重新计算
const recalculateSingle = async (snap: any) => {
  try {
    ElMessage.info(`开始重新计算区间 ${snap.remark}...`);
    const payload = snap.params || {};
    const res = await calculateDrainage(payload);
    snap.results = res;
    snap.status = 'done';
    snapshotStore.saveToLocal();
    ElMessage.success(`区间 ${snap.remark} 重算完成`);
  } catch (err) {
    ElMessage.error(`重算失败: ${err}`);
    snap.status = 'error';
  }
};

// ==========================================
// 6. 辅助工具与指标提取
// ==========================================
const getChainage = (snap: any, type: 'start' | 'end') => {
  const key = type === 'start' ? 'start_chainage' : 'end_chainage';
  return snap.results?.input_parameter?.[key] ?? snap.params?.[key] ?? snap[key] ?? '0';
};

const getSnapRemark = (snap: any) => {
  return (snap.remark && typeof snap.remark === 'string') ? snap.remark : '计算快照工况';
};

const getOrigMetric = (snap: any, key: string) => {
  if (!snap.results) return null;
  const orig = snap.results.original_state;
  return orig?.[key] ?? snap.results?.input_parameter?.[key] ?? null;
};

const getCritMetric = (snap: any, key: string) => {
  if (!snap.results || !snap.results.critical_state) return null;
  const crit = snap.results.critical_state;
  return crit?.[key] ?? null;
};

const getFsClass = (fs: number | null) => {
  if (fs == null) return '';
  return fs < 2.0 ? 'text-danger' : 'text-success';
};

const getStatusTag = (snap: any) => {
  if (snap.status === 'done' || snap.results) return 'success';
  if (snap.status === 'error') return 'danger';
  return 'warning';
};

const handleRefresh3D = () => {
  parameterStore.isDirty = false;
  snapshotStore.refresh3DTrigger = (snapshotStore.refresh3DTrigger || 0) + 1;
  ElMessage.success('3D 空间隧道计算结果已重新装配');
};

const restoreSnapshot = (id: string) => {
  selectedSnapshotId.value = id;
  snapshotStore.applySnapshot(id);
  parameterStore.isDirty = false; 
  const snap = snapshots.value.find((s: any) => s.id === id);
  if (!snap || !snap.results) {
    ElMessage.warning('已加载历史参数，但该工况暂无计算成果，请执行云计算');
  } else {
    ElMessage.info('已回溯至选定工况，参数与三维结果已同步');
  }
};

const formatTime = (ts: number) => {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
};

const handleDownloadRaw = (snap: any) => {
  if (!snap.results || !snap.results.original_state) {
    ElMessage.warning('无有效计算数据可供下载');
    return;
  }
  const dataStr = JSON.stringify(snap.results, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Result_${snap.remark || 'Export'}_${snap.id.slice(0, 5)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  ElMessage.success('原始计算数据已准备下载');
};

const handleSaveSnapshot = () => {
  ElMessageBox.prompt('请输入该工况快照的备注说明', '保存快照', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
  }).then(({ value }) => {
    snapshotStore.createSnapshot(value);
    ElMessage.success('工况参数快照保存成功');
  }).catch(() => { });
};

const handleDeleteSnapshot = (id: string) => {
  ElMessageBox.confirm('确定要删除该工况快照吗？', '删除确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    snapshotStore.deleteSnapshot(id);
    ElMessage.success('快照已删除');
  }).catch(() => { });
};
</script>

<style scoped>
.snapshot-sidebar {
  padding: 12px;
  height: 100%;
  border-left: 1px solid var(--sys-border);
  background: var(--sys-bg-panel);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.header-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-title-bar h4 {
  margin: 0;
  font-size: 14px;
  font-weight: bold;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.header-btns {
  display: flex;
  gap: 4px;
}

.header-btns .el-button {
  padding: 5px 8px;
  font-size: 11px;
}

/* 统计指示栏 */
.stats-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 6px 8px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  border: 1px solid var(--sys-border);
}

.stat-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-regular);
  transition: all 0.2s ease;
  user-select: none;
}

.stat-badge:hover {
  border-color: #409eff;
  color: #409eff;
}

.stat-badge.active {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}

.badge-success.active {
  background: #67c23a;
  border-color: #67c23a;
}

.badge-warning.active {
  background: #e6a23c;
  border-color: #e6a23c;
}

.badge-danger.active {
  background: #f56c6c;
  border-color: #f56c6c;
}

.badge-3d {
  background: rgba(79, 70, 229, 0.1);
  color: #4f46e5;
  border-color: rgba(79, 70, 229, 0.3);
  cursor: default;
}

.batch-progress-box {
  background: var(--el-fill-color-lighter);
  padding: 6px 8px;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--el-text-color-regular);
}

/* 过滤工具栏 */
.filter-toolbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-controls-row {
  display: flex;
  gap: 5px;
  align-items: center;
}

.filter-select {
  flex: 1;
}

.collapse-all-btn, .more-3d-btn {
  padding: 5px 6px;
  font-size: 11px;
  flex-shrink: 0;
}

/* 列表容器 */
.snapshot-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 2px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.snapshot-item {
  border-radius: 6px;
  transition: all 0.2s;
  border: 1px solid var(--sys-border);
}

:deep(.snapshot-item .el-card__body) {
  padding: 6px 10px;
}

.snapshot-item:hover {
  border-color: #409eff;
}

.snapshot-item.is-risk {
  border-left: 3px solid #f56c6c;
}

.snapshot-item.is-active {
  border-color: #409eff;
  box-shadow: 0 0 6px rgba(64, 158, 255, 0.3);
}

/* 紧凑顶栏 */
.compact-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  cursor: pointer;
}

.compact-left {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  flex: 1;
}

.snap-checkbox {
  margin-right: 2px;
}

.snap-chainage-badge {
  font-size: 11px;
  font-weight: bold;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-light);
  padding: 2px 4px;
  border-radius: 3px;
  white-space: nowrap;
}

.snap-remark-text {
  font-size: 12px;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.fs-badge {
  font-size: 11px;
  font-weight: bold;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--el-fill-color);
}

.status-tag {
  font-size: 10px;
  padding: 0 4px;
  height: 20px;
  line-height: 20px;
}

.expand-toggle-btn, .delete-btn {
  padding: 2px 4px;
  margin-left: 0 !important;
}

/* 深度展开态 */
.expanded-drawer {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--sys-border);
}

.results-summary {
  background: var(--el-fill-color-light);
  border: 1px solid var(--sys-border);
  border-radius: 4px;
  padding: 6px 8px;
  margin-bottom: 6px;
}

.pending-box {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px;
  background: var(--el-fill-color-blank);
  border-style: dashed;
  border-color: var(--sys-border);
}

.main-metrics {
  display: flex;
  justify-content: space-between;
  padding-bottom: 4px;
  margin-bottom: 6px;
  border-bottom: 1px dashed var(--sys-border);
  font-size: 11px;
  color: var(--el-text-color-regular);
}

.res-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 8px;
}

.res-cell {
  display: flex;
  flex-direction: column;
}

.res-cell .lbl {
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.res-cell .val {
  font-size: 11px;
  color: #409eff;
  font-weight: bold;
}

.critical-section {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--el-border-color-light);
}

.critical-metrics {
  margin-bottom: 4px;
}

.critical-rec-grid .val {
  color: #f56c6c;
}

.text-danger {
  color: #f56c6c;
}

.text-success {
  color: #67c23a;
}

.snap-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  padding-top: 4px;
}

.actions-btn {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pagination-container {
  display: flex;
  justify-content: center;
  padding-top: 8px;
  flex-shrink: 0;
}
</style>