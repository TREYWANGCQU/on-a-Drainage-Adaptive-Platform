<!-- frontend/src/components/ui/SnapshotSidebar.vue -->
<template>
  <div class="snapshot-sidebar">
    <!-- 1. 顶部操作与全局动作 -->
    <div class="header">
      <div class="header-title-bar">
        <div class="title-with-badge">
          <h4>工况快照与序列库</h4>
          <span class="count-pill">{{ totalCount }}</span>
        </div>
        <div class="header-btns">
          <el-button 
            type="warning" 
            size="small" 
            plain 
            class="header-btn" 
            @click="handleRefresh3D"
            title="重新将已勾选工况装配至 3D 空间隧道"
          >
            <el-icon><Refresh /></el-icon> 刷新3D
          </el-button>
          <el-button 
            type="success" 
            size="small" 
            plain 
            class="header-btn"
            :loading="isBatchCalculating"
            @click="isBatchCalculating ? cancelBatchCalculation() : quickCalculatePending()"
          >
            <el-icon v-if="!isBatchCalculating"><Opportunity /></el-icon>
            {{ isBatchCalculating ? '停止计算' : '批量计算' }}
          </el-button>
          <el-button 
            type="primary" 
            size="small" 
            class="header-btn"
            @click="handleSaveSnapshot"
          >
            <el-icon><Plus /></el-icon> 保存快照
          </el-button>
        </div>
      </div>

      <!-- 2. 统计指示栏（Badges）与一键快速过滤 -->
      <div class="stats-bar">
        <div 
          class="stat-chip" 
          :class="{ active: filterStatus === 'all' && filterRisk === 'all' }" 
          @click="resetFilter"
        >
          <span class="chip-dot dot-all"></span>
          <span class="chip-label">总计</span>
          <span class="chip-num">{{ totalCount }}</span>
        </div>
        <div 
          class="stat-chip chip-success" 
          :class="{ active: filterStatus === 'done' }" 
          @click="toggleStatusFilter('done')"
        >
          <span class="chip-dot dot-success"></span>
          <span class="chip-label">已算</span>
          <span class="chip-num">{{ doneCount }}</span>
        </div>
        <div 
          class="stat-chip chip-warning" 
          :class="{ active: filterStatus === 'pending' }" 
          @click="toggleStatusFilter('pending')"
        >
          <span class="chip-dot dot-warning"></span>
          <span class="chip-label">待算</span>
          <span class="chip-num">{{ pendingCount }}</span>
        </div>
        <div 
          class="stat-chip chip-danger" 
          :class="{ active: filterRisk === 'risk' }" 
          @click="toggleRiskFilter('risk')"
        >
          <span class="chip-dot dot-danger"></span>
          <span class="chip-label">预警</span>
          <span class="chip-num">{{ riskCount }}</span>
        </div>
        <div class="stat-chip chip-3d" title="当前参与 3D 空间拼装的区间数">
          <span class="chip-dot dot-3d"></span>
          <span class="chip-label">3D已选</span>
          <span class="chip-num">{{ selected3DCount }}/{{ totalCount }}</span>
        </div>
      </div>

      <!-- 批量计算进度指示条 -->
      <div class="batch-progress-box" v-if="isBatchCalculating">
        <div class="progress-info">
          <span><el-icon class="is-loading"><Loading /></el-icon> 正在并发调度计算中 ({{ calcCurrentIndex }}/{{ calcTotalTasks }})...</span>
          <span class="progress-val">{{ calcProgress }}%</span>
        </div>
        <el-progress :percentage="calcProgress" :status="calcProgress === 100 ? 'success' : ''" :stroke-width="5" :show-text="false" />
      </div>

      <!-- 批量导出进度指示条 -->
      <div class="batch-export-box" v-if="isBatchExporting">
        <div class="progress-info">
          <span><el-icon class="is-loading"><Loading /></el-icon> {{ batchExportStatusText }}</span>
          <span class="progress-val">{{ batchExportProgress }}%</span>
        </div>
        <el-progress :percentage="batchExportProgress" status="warning" :stroke-width="5" :show-text="false" />
      </div>

      <!-- 3. 复合搜索与过滤工具栏 -->
      <div class="filter-toolbar">
        <el-input 
          v-model="searchKeyword" 
          placeholder="搜索桩号(如150/K1)或工况备注..." 
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
            :icon="isAllExpanded ? 'Fold' : 'Expand'" 
            @click="toggleAllCollapse"
            class="action-icon-btn"
            :title="isAllExpanded ? '一键折叠全部' : '一键展开全部'"
          >
            {{ isAllExpanded ? '全折叠' : '全展开' }}
          </el-button>

          <!-- 3D 勾选控制菜单 -->
          <el-dropdown trigger="click" @command="handle3DDropdownCommand">
            <el-button size="small" class="action-icon-btn">
              <el-icon><Checked /></el-icon> 3D勾选<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="select_filtered">勾选当前筛选结果 ({{ filteredSnapshots.length }})</el-dropdown-item>
                <el-dropdown-item command="unselect_filtered">取消筛选结果勾选</el-dropdown-item>
                <el-dropdown-item command="select_all" divided>全选全线所有工况 ({{ snapshots.length }})</el-dropdown-item>
                <el-dropdown-item command="clear_all">清空所有 3D 勾选</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- 批量导出功能菜单 -->
          <el-dropdown trigger="click" @command="handleBatchExportCommand">
            <el-button type="primary" plain size="small" class="action-icon-btn batch-export-btn">
              <el-icon><Download /></el-icon> 批量下载<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="export_blueprints_pdf">
                  📑 批量下载选中施工图 (A3 PDF)
                </el-dropdown-item>
                <el-dropdown-item command="export_blueprints_png">
                  🖼️ 批量下载选中施工图 (PNG)
                </el-dropdown-item>
                <el-dropdown-item command="export_calc_books" divided>
                  📚 批量导出选中计算书 (A4 报告)
                </el-dropdown-item>
                <el-dropdown-item command="export_json_raw">
                  💾 批量导出选中计算结果 (JSON)
                </el-dropdown-item>
                <el-dropdown-item command="export_all_filtered_blueprints" divided>
                  ⚡ 一键导出当前筛选全部施工图 (PDF)
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <!-- 4. 选中卡片快捷批量操作栏 (当有选中项时自动高亮提示) -->
      <div class="selected-batch-bar" v-if="selectedCount > 0">
        <div class="batch-bar-left">
          <span class="batch-count-tag">
            <el-icon><CircleCheckFilled /></el-icon>
            已选中 <b>{{ selectedCount }}</b> 个工况
          </span>
          <el-button link type="info" size="small" class="batch-clear-btn" @click="clearSelectedCards">清空</el-button>
        </div>
        <div class="batch-bar-actions">
          <el-button 
            type="warning" 
            size="small" 
            class="batch-quick-btn" 
            :loading="isBatchExporting"
            @click="batchDownloadBlueprints('pdf')"
            title="一键批量下载选中工况的标准 A3 施工设计图 (PDF)"
          >
            <el-icon><PictureFilled /></el-icon> 施工图(A3)
          </el-button>
          <el-button 
            type="primary" 
            size="small" 
            class="batch-quick-btn"
            @click="batchExportCalcBooks"
            title="一键批量导出选中工况的 A4 标准计算书"
          >
            <el-icon><DocumentCopy /></el-icon> 计算书(A4)
          </el-button>
        </div>
      </div>
    </div>

    <!-- 5. 快照卡片列表（支持手风琴双态折叠与分页） -->
    <div class="snapshot-list" ref="snapshotListRef">
      <template v-if="filteredSnapshots.length > 0">
        <div 
          v-for="snap in pagedSnapshots" 
          :key="snap.id" 
          class="snapshot-card" 
          :class="{ 
            'is-risk': isRiskSnapshot(snap), 
            'is-active': selectedSnapshotId === snap.id,
            'is-expanded': isCardExpanded(snap.id),
            'is-checked': snap.selectedFor3D
          }"
        >
          <!-- 5.1 紧凑顶栏（折叠态：高度均衡，视觉层次清晰，点击整行支持切换折叠与回溯工况） -->
          <div class="card-compact-header" @click="handleCardHeaderClick(snap.id)">
            <!-- 状态色带/左指示条 -->
            <div class="card-status-stripe" :class="getCardStripeClass(snap)"></div>

            <div class="compact-left">
              <el-checkbox 
                v-model="snap.selectedFor3D" 
                @click.stop="handleCheckboxChange" 
                class="snap-checkbox"
                title="勾选用于批量导出或 3D 空间装配"
              />
              <div class="chainage-capsule">
                <span class="chainage-icon">📏</span>
                <span class="chainage-text">K{{ getChainage(snap, 'start') }} ~ K{{ getChainage(snap, 'end') }}</span>
              </div>
              <span class="snap-remark-text" :title="getSnapRemark(snap)">
                {{ getSnapRemark(snap) }}
              </span>
            </div>

            <div class="compact-right" @click.stop>
              <!-- 安全系数微标 -->
              <div 
                class="fs-pill" 
                :class="getFsClass(getSnapshotFs(snap))" 
                v-if="getSnapshotFs(snap) != null"
                :title="`安全系数 Fs = ${getSnapshotFs(snap)?.toFixed(2)} (${isRiskSnapshot(snap) ? '临界预警' : '结构安全'})`"
              >
                <span class="fs-dot"></span>
                <span class="fs-num">Fs {{ getSnapshotFs(snap)?.toFixed(2) }}</span>
              </div>

              <!-- 状态标签 -->
              <span class="status-chip" :class="getStatusChipClass(snap)">
                {{ snap.status === 'done' || snap.results ? '已算' : snap.status === 'error' ? '失败' : '待算' }}
              </span>

              <!-- 快速操作图标按钮组 -->
              <div class="compact-quick-actions">
                <!-- 快捷导出施工图 -->
                <el-dropdown trigger="click" @command="(cmd: any) => handleExportBlueprint(snap, cmd)">
                  <button 
                    type="button"
                    class="icon-action-btn blueprint-btn" 
                    title="导出标准 A3 施工设计图 (PDF/PNG)"
                    @click.stop
                  >
                    <el-icon><PictureFilled /></el-icon>
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="pdf">📑 导出 A3 矢量施工图 (PDF)</el-dropdown-item>
                      <el-dropdown-item command="png">🖼️ 导出高清设计图 (PNG)</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>

                <!-- 快捷计算书预览与导出 -->
                <button 
                  type="button"
                  class="icon-action-btn book-btn" 
                  title="A4 标准防排水设计计算书 (预览并下载 PDF)"
                  @click.stop="handleOpenCalcBook(snap)"
                >
                  <el-icon><Notebook /></el-icon>
                </button>

                <!-- 手风琴展开/收起切换按钮 -->
                <button 
                  type="button"
                  class="icon-action-btn expand-btn" 
                  :class="{ 'expanded': isCardExpanded(snap.id) }"
                  @click.stop="toggleCardExpand(snap.id)" 
                  :title="isCardExpanded(snap.id) ? '收起详细指标' : '展开详细指标'"
                >
                  <el-icon><ArrowDown /></el-icon>
                </button>

                <!-- 快捷删除 -->
                <button 
                  type="button"
                  class="icon-action-btn delete-btn" 
                  @click.stop="handleDeleteSnapshot(snap.id)"
                  title="删除此工况快照"
                >
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
            </div>
          </div>

          <!-- 5.2 深度展开态（详细指标网格与现代化操作胶囊） -->
          <div class="card-expanded-body" v-show="isCardExpanded(snap.id)">
            <div class="results-dashboard" v-if="snap.results">
              <!-- 顶部核心水力安全指标双卡 -->
              <div class="headline-metrics-row">
                <div class="headline-card head-water">
                  <div class="headline-label">💧 原始设计水头</div>
                  <div class="headline-val">{{ snap.results.original_state?.waterHead?.toFixed(2) ?? '-' }} <span class="unit">m</span></div>
                </div>
                <div class="headline-card head-fs" :class="isRiskSnapshot(snap) ? 'is-danger' : 'is-safe'">
                  <div class="headline-label">🛡️ 原始安全系数</div>
                  <div class="headline-val">{{ snap.results.original_state?.safety_factor?.toFixed(2) ?? '-' }}</div>
                </div>
              </div>

              <!-- 4 宫格推荐设计参数卡片 -->
              <div class="metrics-grid">
                <div class="metric-tile">
                  <span class="m-label">环向管间距</span>
                  <div class="m-val">{{ getOrigMetric(snap, 'ring_spacing_recommend')?.toFixed(2) || '-' }} <span class="m-unit">m</span></div>
                </div>
                <div class="metric-tile">
                  <span class="m-label">环向管孔径</span>
                  <div class="m-val">{{ getOrigMetric(snap, 'ring_diam_recommend') != null ? (getOrigMetric(snap, 'ring_diam_recommend') * 1000).toFixed(0) : '-' }} <span class="m-unit">mm</span></div>
                </div>
                <div class="metric-tile">
                  <span class="m-label">横向导水管径</span>
                  <div class="m-val">{{ getOrigMetric(snap, 'lateral_diam_recommend') != null ? (getOrigMetric(snap, 'lateral_diam_recommend') * 1000).toFixed(0) : '-' }} <span class="m-unit">mm</span></div>
                </div>
                <div class="metric-tile">
                  <span class="m-label">分区总涌水量 Q</span>
                  <div class="m-val">{{ (getOrigMetric(snap, 'Q') ?? snap.results.original_state?.q_drain)?.toFixed(2) || '-' }} <span class="m-unit">m³/d</span></div>
                </div>
              </div>

              <!-- 临界超限加固指标卡片（如有） -->
              <div class="critical-reinforce-panel" v-if="snap.results.critical_state">
                <div class="critical-header">
                  <span class="critical-title">⚡ 临界工况加固设计参数</span>
                  <span class="critical-fs-tag">
                    临界 Fs: <b>{{ snap.results.critical_state?.final_safety_factor?.toFixed(2) ?? '-' }}</b>
                  </span>
                </div>
                <div class="metrics-grid critical-grid">
                  <div class="metric-tile crit-tile">
                    <span class="m-label">加固水头</span>
                    <div class="m-val text-crit">{{ snap.results.critical_state?.final_waterHead?.toFixed(2) }} <span class="m-unit">m</span></div>
                  </div>
                  <div class="metric-tile crit-tile">
                    <span class="m-label">临界环向间距</span>
                    <div class="m-val text-crit">{{ getCritMetric(snap, 'ring_spacing_recommend')?.toFixed(2) || '-' }} <span class="m-unit">m</span></div>
                  </div>
                  <div class="metric-tile crit-tile">
                    <span class="m-label">临界环向孔径</span>
                    <div class="m-val text-crit">{{ getCritMetric(snap, 'ring_diam_recommend') != null ? (getCritMetric(snap, 'ring_diam_recommend') * 1000).toFixed(0) : '-' }} <span class="m-unit">mm</span></div>
                  </div>
                  <div class="metric-tile crit-tile">
                    <span class="m-label">临界排涌量 Q</span>
                    <div class="m-val text-crit">{{ (getCritMetric(snap, 'Q') ?? snap.results.critical_state?.final_Q)?.toFixed(2) || '-' }} <span class="m-unit">m³/d</span></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="results-dashboard pending-dashboard" v-else>
              <el-icon class="pending-icon"><InfoFilled /></el-icon>
              <span>该工况尚未执行计算引擎，请点击右下角重算或批量计算</span>
            </div>

            <!-- 卡片底部元信息与精美胶囊动作按钮栏 -->
            <div class="card-bottom-bar">
              <div class="time-meta">
                <el-icon><Clock /></el-icon>
                <span>{{ formatTime(snap.timestamp) }}</span>
              </div>

              <!-- 展开态功能胶囊按钮组 -->
              <div class="action-capsules-group">
                <!-- 1. 施工图 -->
                <el-dropdown trigger="click" @command="(cmd: any) => handleExportBlueprint(snap, cmd)">
                  <button 
                    type="button"
                    class="capsule-btn capsule-blueprint" 
                    :disabled="exportingId === snap.id"
                    title="导出标准 A3 施工设计图纸"
                  >
                    <el-icon v-if="exportingId !== snap.id"><PictureFilled /></el-icon>
                    <el-icon v-else class="is-loading"><Loading /></el-icon>
                    <span>施工图</span>
                    <el-icon class="arrow-tiny"><ArrowDown /></el-icon>
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="pdf">📑 导出 A3 矢量施工图 (PDF)</el-dropdown-item>
                      <el-dropdown-item command="png">🖼️ 导出高清设计图 (PNG)</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>

                <!-- 2. 计算书 -->
                <button 
                  type="button"
                  class="capsule-btn capsule-book" 
                  title="查看与导出 A4 标准工程计算书"
                  @click.stop="handleOpenCalcBook(snap)"
                >
                  <el-icon><DocumentCopy /></el-icon>
                  <span>计算书</span>
                </button>

                <!-- 3. 结果JSON -->
                <button 
                  type="button"
                  class="capsule-btn capsule-json" 
                  :disabled="!snap.results?.original_state"
                  title="下载原始计算 JSON 结构体"
                  @click.stop="handleDownloadRaw(snap)"
                >
                  <el-icon><Download /></el-icon>
                  <span>JSON</span>
                </button>

                <!-- 4. 单段重算 -->
                <button 
                  type="button"
                  class="capsule-btn capsule-recalc" 
                  :disabled="isRecalculatingSingle === snap.id"
                  title="重新计算当前工况参数"
                  @click.stop="recalculateSingle(snap)"
                >
                  <el-icon :class="{ 'is-loading': isRecalculatingSingle === snap.id }"><Refresh /></el-icon>
                  <span>重算</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 6. 百级数据分页器 -->
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
      <div class="empty-wrap" v-else>
        <el-empty 
          :description="snapshots.length === 0 ? '暂无快照记录，请先在左侧输入参数并保存' : '未找到符合筛选条件的工况快照'" 
          :image-size="70" 
        />
      </div>
    </div>

    <!-- 7. 计算书 A4 预览与导出模态框 -->
    <CalculationBookModal
      v-model="showCalcBookModal"
      :snapshot="currentCalcBookSnap"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSnapshotStore, type Snapshot } from '@/store/snapshotStore';
import { calculateDrainage } from '@/api/index';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import { 
  Refresh, 
  Download, 
  Search, 
  Checked, 
  Fold, 
  Expand, 
  Delete, 
  ArrowDown, 
  Loading,
  Opportunity,
  Plus,
  CircleCheckFilled,
  PictureFilled,
  DocumentCopy,
  InfoFilled,
  Clock,
  Notebook
} from '@element-plus/icons-vue';
import { useParameterStore } from '@/store/parameterStore';
import { exportSnapshotBlueprint } from '@/utils/blueprintGenerator';
import CalculationBookModal from '../calculationBook/CalculationBookModal.vue';

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
const selectedCount = computed(() => snapshots.value.filter(s => s.selectedFor3D).length);

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
// 3. 单卡片折叠与全量折叠状态机
// ==========================================
const expandedMap = ref<Record<string, boolean>>({});

// 是否处于全展开状态
const isAllExpanded = computed(() => {
  if (filteredSnapshots.value.length === 0) return false;
  return filteredSnapshots.value.every((s: any) => Boolean(expandedMap.value[s.id]));
});

// 判断单卡片是否展开
const isCardExpanded = (id: string): boolean => {
  return Boolean(expandedMap.value[id]);
};

// 单卡片切换展开/折叠
const toggleCardExpand = (id: string) => {
  expandedMap.value = {
    ...expandedMap.value,
    [id]: !expandedMap.value[id]
  };
};

// 点击卡片头部：同时触发回溯与切换展开并同步 3D 聚焦段
const handleCardHeaderClick = (id: string) => {
  snapshotStore.setActiveSegment(id);
  restoreSnapshot(id);
  toggleCardExpand(id);
};

// 监听 3D 视图发起的活动分段切换，同步侧边栏选中态
watch(
  () => snapshotStore.activeSegmentId,
  (newId) => {
    if (newId && newId !== selectedSnapshotId.value) {
      selectedSnapshotId.value = newId;
    }
  }
);

// 全量展开/折叠切换
const toggleAllCollapse = () => {
  const targetState = !isAllExpanded.value;
  const nextMap: Record<string, boolean> = { ...expandedMap.value };
  filteredSnapshots.value.forEach((s: any) => {
    nextMap[s.id] = targetState;
  });
  expandedMap.value = nextMap;
};

// 清空所有卡片选中
const clearSelectedCards = () => {
  snapshots.value.forEach((s: any) => s.selectedFor3D = false);
  snapshotStore.saveToLocal();
  ElMessage.info('已清空所选工况卡片');
};

// ==========================================
// 4. 批量 3D 勾选控制
// ==========================================
const handleCheckboxChange = () => {
  snapshotStore.saveToLocal();
};

const handle3DDropdownCommand = (cmd: string) => {
  if (cmd === 'select_filtered') {
    filteredSnapshots.value.forEach((s: any) => s.selectedFor3D = true);
    ElMessage.success(`已勾选当前筛选的 ${filteredSnapshots.value.length} 个工况`);
  } else if (cmd === 'unselect_filtered') {
    filteredSnapshots.value.forEach((s: any) => s.selectedFor3D = false);
    ElMessage.info(`已取消当前筛选工况勾选`);
  } else if (cmd === 'select_all') {
    snapshots.value.forEach((s: any) => s.selectedFor3D = true);
    ElMessage.success(`已全选所有 ${snapshots.value.length} 个工况`);
  } else if (cmd === 'clear_all') {
    snapshots.value.forEach((s: any) => s.selectedFor3D = false);
    ElMessage.info('已清空全部工况勾选');
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

const isRecalculatingSingle = ref<string | null>(null);

// 单段重新计算
const recalculateSingle = async (snap: any) => {
  try {
    isRecalculatingSingle.value = snap.id;
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
  } finally {
    isRecalculatingSingle.value = null;
  }
};

// ==========================================
// 6. 批量下载施工图与计算书功能
// ==========================================
const isBatchExporting = ref(false);
const batchExportProgress = ref(0);
const batchExportStatusText = ref('');

// 批量下载选中施工图 (PDF / PNG)
const batchDownloadBlueprints = async (format: 'pdf' | 'png' = 'pdf', targetSnaps?: any[]) => {
  const selected = targetSnaps || snapshots.value.filter((s: any) => s.selectedFor3D);
  if (selected.length === 0) {
    ElMessage.warning('请先勾选需要导出施工图的工况卡片');
    return;
  }

  isBatchExporting.value = true;
  batchExportProgress.value = 0;
  let successCount = 0;
  let failCount = 0;

  try {
    for (let i = 0; i < selected.length; i++) {
      const snap = selected[i];
      batchExportStatusText.value = `正在生成 A3 施工图 (${i + 1}/${selected.length}): ${getSnapRemark(snap)}...`;
      batchExportProgress.value = Math.round(((i + 1) / selected.length) * 100);

      try {
        await exportSnapshotBlueprint(snap, format);
        successCount++;
        // 间隔 250ms 释放事件循环并避免多文件并发触发浏览器弹窗阻塞
        await new Promise(r => setTimeout(r, 250));
      } catch (e) {
        console.error(`导出快照 ${snap.id} 施工图失败:`, e);
        failCount++;
      }
    }

    if (failCount === 0) {
      ElNotification({
        title: '批量导出成功',
        message: `已成功导出 ${successCount} 份 A3 标准施工设计图 (${format.toUpperCase()})`,
        type: 'success',
        duration: 3500
      });
    } else {
      ElNotification({
        title: '批量导出完成',
        message: `成功导出 ${successCount} 份，失败 ${failCount} 份`,
        type: 'warning',
        duration: 4000
      });
    }
  } finally {
    isBatchExporting.value = false;
    batchExportProgress.value = 0;
    batchExportStatusText.value = '';
  }
};

// 批量导出计算书
const batchExportCalcBooks = () => {
  const selected = snapshots.value.filter((s: any) => s.selectedFor3D);
  if (selected.length === 0) {
    ElMessage.warning('请先勾选需要查看/导出计算书的工况卡片');
    return;
  }

  const validSnaps = selected.filter((s: any) => s.results || s.status === 'done');
  if (validSnaps.length === 0) {
    ElMessage.warning('所选工况均尚未完成计算，请先执行计算');
    return;
  }

  if (validSnaps.length === 1) {
    handleOpenCalcBook(validSnaps[0]);
    return;
  }

  // 多选工况：提示并优先打开第一个工况，支持用户一键切换
  currentCalcBookSnap.value = validSnaps[0];
  showCalcBookModal.value = true;
  ElNotification({
    title: '计算书报告预览',
    message: `已载入选中的第 1/${validSnaps.length} 个工况计算书。可通过顶部导航导出 A4 矢量 PDF。`,
    type: 'info',
    duration: 4000
  });
};

// 批量导出全部选中 JSON
const batchDownloadRawJson = () => {
  const selected = snapshots.value.filter((s: any) => s.selectedFor3D && s.results);
  if (selected.length === 0) {
    ElMessage.warning('请先勾选包含有效计算成果的工况卡片');
    return;
  }

  const bundleData = selected.map((s: any) => ({
    id: s.id,
    remark: s.remark,
    start_chainage: getChainage(s, 'start'),
    end_chainage: getChainage(s, 'end'),
    params: s.params,
    results: s.results,
    timestamp: s.timestamp
  }));

  const dataStr = JSON.stringify(bundleData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Batch_Drainage_Results_${selected.length}Segments_${Date.now().toString().slice(-6)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  ElMessage.success(`已打包下载 ${selected.length} 个工况的完整计算结果 JSON`);
};

// 处理批量菜单命令
const handleBatchExportCommand = (cmd: string) => {
  if (cmd === 'export_blueprints_pdf') {
    batchDownloadBlueprints('pdf');
  } else if (cmd === 'export_blueprints_png') {
    batchDownloadBlueprints('png');
  } else if (cmd === 'export_calc_books') {
    batchExportCalcBooks();
  } else if (cmd === 'export_json_raw') {
    batchDownloadRawJson();
  } else if (cmd === 'export_all_filtered_blueprints') {
    if (filteredSnapshots.value.length === 0) {
      ElMessage.warning('当前筛选结果为空');
      return;
    }
    batchDownloadBlueprints('pdf', filteredSnapshots.value);
  }
};

// ==========================================
// 7. 辅助工具与指标提取
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
  return fs < 2.0 ? 'fs-danger' : 'fs-safe';
};

const getCardStripeClass = (snap: any) => {
  if (snap.status === 'error') return 'stripe-error';
  const fs = getSnapshotFs(snap);
  if (fs != null && fs < 2.0) return 'stripe-risk';
  if (snap.status === 'done' || snap.results) return 'stripe-done';
  return 'stripe-pending';
};

const getStatusChipClass = (snap: any) => {
  if (snap.status === 'error') return 'chip-tag-error';
  if (snap.status === 'done' || snap.results) return 'chip-tag-done';
  return 'chip-tag-pending';
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
  return new Date(ts).toLocaleString('zh-CN', { 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  });
};

const exportingId = ref<string | null>(null);

// 计算书预览模态框控制
const showCalcBookModal = ref(false);
const currentCalcBookSnap = ref<any>(null);

const handleOpenCalcBook = (snap: any) => {
  if (!snap.results && snap.status !== 'done') {
    ElMessage.warning('该工况尚未完成计算，请先执行计算后再查看计算书');
    return;
  }
  currentCalcBookSnap.value = snap;
  showCalcBookModal.value = true;
};

const handleExportBlueprint = async (snap: any, format: 'pdf' | 'png' = 'pdf') => {
  try {
    exportingId.value = snap.id;
    ElMessage.info(`正在生成 ${format.toUpperCase()} 标准 A3 施工设计图，请稍候...`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await exportSnapshotBlueprint(snap, format);
    ElMessage.success(`施工设计图已成功导出 (${format.toUpperCase()})`);
  } catch (err: any) {
    console.error('导出施工设计图失败:', err);
    ElMessage.error(`导出施工图失败: ${err.message || err}`);
  } finally {
    exportingId.value = null;
  }
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
    inputPlaceholder: '例如：DK100~DK200 富水断层注浆段'
  }).then(({ value }) => {
    snapshotStore.createSnapshot(value);
    ElMessage.success('工况参数快照保存成功');
  }).catch(() => { });
};

const handleDeleteSnapshot = (id: string) => {
  ElMessageBox.confirm('确定要删除该工况快照吗？删除后不可恢复。', '删除工况确认', {
    confirmButtonText: '确定删除',
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
  padding: 10px 12px;
  height: 100%;
  border-left: 1px solid var(--sys-border, #e2e8f0);
  background: var(--sys-bg-panel, #ffffff);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.header-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title-with-badge {
  display: flex;
  align-items: center;
  gap: 6px;
}

.title-with-badge h4 {
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1e293b);
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.count-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(64, 158, 255, 0.12);
  color: #409eff;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
}

.header-btns {
  display: flex;
  gap: 5px;
}

.header-btn {
  padding: 4px 8px;
  font-size: 11.5px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

/* 统计指示栏 */
.stats-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 5px 6px;
  background: var(--el-fill-color-light, #f8fafc);
  border-radius: 6px;
  border: 1px solid var(--sys-border, #e2e8f0);
}

.stat-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
  background: var(--el-bg-color, #ffffff);
  border: 1px solid var(--el-border-color-lighter, #e2e8f0);
  color: var(--el-text-color-regular, #64748b);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.stat-chip:hover {
  border-color: #409eff;
  color: #409eff;
  transform: translateY(-1px);
}

.stat-chip.active {
  background: #409eff;
  color: #ffffff;
  border-color: #409eff;
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.35);
}

.stat-chip.active .chip-dot {
  background: #ffffff !important;
}

.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-all { background: #94a3b8; }
.dot-success { background: #10b981; }
.dot-warning { background: #f59e0b; }
.dot-danger { background: #ef4444; }
.dot-3d { background: #6366f1; }

.chip-success.active {
  background: #10b981;
  border-color: #10b981;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.35);
}

.chip-warning.active {
  background: #f59e0b;
  border-color: #f59e0b;
  box-shadow: 0 2px 6px rgba(245, 158, 11, 0.35);
}

.chip-danger.active {
  background: #ef4444;
  border-color: #ef4444;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.35);
}

.chip-3d {
  background: rgba(99, 102, 241, 0.08);
  color: #6366f1;
  border-color: rgba(99, 102, 241, 0.2);
  cursor: default;
}

.chip-num {
  font-weight: 700;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
}

/* 进度提示条 */
.batch-progress-box, .batch-export-box {
  background: var(--el-fill-color-lighter, #f1f5f9);
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--sys-border, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--el-text-color-regular, #475569);
}

.progress-val {
  font-weight: 700;
  color: #409eff;
  font-family: 'JetBrains Mono', monospace;
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
  flex-wrap: wrap;
}

.filter-select {
  flex: 1;
  min-width: 90px;
}

.action-icon-btn {
  padding: 5px 7px;
  font-size: 11.5px;
  flex-shrink: 0;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.batch-export-btn {
  background: rgba(64, 158, 255, 0.08);
}

/* 4. 选中卡片快捷批量操作条 */
.selected-batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.12), rgba(99, 102, 241, 0.1));
  border: 1px solid rgba(64, 158, 255, 0.3);
  animation: fadeInBatch 0.25s ease-out;
}

@keyframes fadeInBatch {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.batch-bar-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.batch-count-tag {
  font-size: 11.5px;
  color: #1e293b;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.batch-count-tag .el-icon {
  color: #409eff;
}

.batch-clear-btn {
  font-size: 11px;
  padding: 0 4px;
}

.batch-bar-actions {
  display: flex;
  gap: 5px;
}

.batch-quick-btn {
  padding: 3px 8px;
  font-size: 11px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-weight: 600;
}

/* 5. 快照卡片列表 */
.snapshot-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 2px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.snapshot-card {
  position: relative;
  background: var(--el-bg-color-overlay, #ffffff);
  border: 1px solid var(--el-border-color-light, #e2e8f0);
  border-radius: 8px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.snapshot-card:hover {
  border-color: #93c5fd;
  box-shadow: 0 3px 10px rgba(64, 158, 255, 0.12);
  transform: translateY(-1px);
}

.snapshot-card.is-checked {
  background: rgba(64, 158, 255, 0.02);
  border-color: #bfdbfe;
}

.snapshot-card.is-active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.snapshot-card.is-risk {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(254, 242, 242, 0.3);
}

/* 状态色带/指示条 */
.card-status-stripe {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 3.5px;
  border-top-left-radius: 8px;
  border-bottom-left-radius: 8px;
  transition: background 0.2s;
}

.stripe-done { background: #10b981; }
.stripe-pending { background: #f59e0b; }
.stripe-risk { background: linear-gradient(180deg, #ef4444, #f97316); }
.stripe-error { background: #dc2626; }

/* 5.1 紧凑顶栏 */
.card-compact-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  padding: 6px 10px 6px 12px;
  cursor: pointer;
  user-select: none;
  gap: 8px;
}

.compact-left {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  flex: 1;
}

.snap-checkbox {
  margin-right: 1px;
}

.chainage-capsule {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 700;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  color: #1e3a8a;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(99, 102, 241, 0.06));
  border: 1px solid rgba(59, 130, 246, 0.25);
  padding: 1.5px 6px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.chainage-icon {
  font-size: 10px;
}

.snap-remark-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-regular, #334155);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-right {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

/* 安全系数微标 */
.fs-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10.5px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  padding: 1.5px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.fs-pill .fs-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.fs-safe {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.fs-safe .fs-dot { background: #10b981; }

.fs-danger {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.3);
  animation: pulseRisk 2s infinite ease-in-out;
}

@keyframes pulseRisk {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.2); }
  50% { box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2); }
}

.fs-danger .fs-dot { background: #ef4444; }

/* 状态 Chip */
.status-chip {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  line-height: 1.4;
  white-space: nowrap;
}

.chip-tag-done {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.chip-tag-pending {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.chip-tag-error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* 紧凑顶栏快速动作按钮 */
.compact-quick-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.icon-action-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--el-text-color-secondary, #94a3b8);
  transition: all 0.15s ease;
  font-size: 13px;
  padding: 0;
}

.icon-action-btn:hover {
  background: var(--el-fill-color, #f1f5f9);
  color: var(--el-text-color-primary, #1e293b);
  transform: scale(1.08);
}

.blueprint-btn:hover {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
}

.book-btn:hover {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
}

.expand-btn {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.expand-btn.expanded {
  transform: rotate(180deg);
  color: #3b82f6;
}

.delete-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}

/* 5.2 深度展开态 */
.card-expanded-body {
  padding: 0 10px 10px 12px;
  border-top: 1px dashed var(--el-border-color-lighter, #e2e8f0);
  animation: fadeInBody 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes fadeInBody {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.results-dashboard {
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.pending-dashboard {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 10px;
  font-size: 11.5px;
  color: #94a3b8;
  background: var(--el-fill-color-lighter, #f8fafc);
  border-radius: 6px;
  border: 1px dashed var(--sys-border, #e2e8f0);
  margin-top: 8px;
}

.pending-icon {
  font-size: 14px;
  color: #f59e0b;
}

/* 顶部水头与安全系数双卡片 */
.headline-metrics-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.headline-card {
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid var(--sys-border, #e2e8f0);
  background: var(--el-fill-color-light, #f8fafc);
}

.headline-card.head-water {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.06), rgba(6, 182, 212, 0.04));
  border-color: rgba(59, 130, 246, 0.2);
}

.headline-card.head-fs.is-safe {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(5, 150, 105, 0.04));
  border-color: rgba(16, 185, 129, 0.25);
}

.headline-card.head-fs.is-danger {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(249, 115, 22, 0.05));
  border-color: rgba(239, 68, 68, 0.3);
}

.headline-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--el-text-color-secondary, #64748b);
  margin-bottom: 2px;
}

.headline-val {
  font-size: 14px;
  font-weight: 800;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  color: #1e293b;
}

.head-fs.is-safe .headline-val { color: #059669; }
.head-fs.is-danger .headline-val { color: #dc2626; }

.headline-val .unit {
  font-size: 10.5px;
  font-weight: 500;
  color: #64748b;
}

/* 4 宫格指标 */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 5px;
}

.metric-tile {
  background: var(--el-fill-color-light, #f8fafc);
  border: 1px solid var(--sys-border, #e2e8f0);
  border-radius: 5px;
  padding: 4px 7px;
  display: flex;
  flex-direction: column;
}

.m-label {
  font-size: 9.5px;
  color: var(--el-text-color-secondary, #64748b);
}

.m-val {
  font-size: 12px;
  font-weight: 700;
  color: #2563eb;
  font-family: 'JetBrains Mono', monospace;
  margin-top: 1px;
}

.m-unit {
  font-size: 9.5px;
  font-weight: normal;
  color: #94a3b8;
}

/* 临界加固面板 */
.critical-reinforce-panel {
  margin-top: 2px;
  padding: 6px 8px;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.05), rgba(249, 115, 22, 0.05));
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-left: 3px solid #ef4444;
}

.critical-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
}

.critical-title {
  font-size: 10.5px;
  font-weight: 700;
  color: #dc2626;
}

.critical-fs-tag {
  font-size: 10px;
  color: #dc2626;
  font-family: 'JetBrains Mono', monospace;
}

.crit-tile {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(239, 68, 68, 0.15);
}

.text-crit {
  color: #dc2626 !important;
}

/* 卡片底部操作栏 */
.card-bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  margin-top: 6px;
  border-top: 1px solid var(--el-border-color-lighter, #f1f5f9);
  flex-wrap: wrap;
  gap: 6px;
}

.time-meta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10.5px;
  color: #94a3b8;
  font-family: 'JetBrains Mono', monospace;
}

/* 展开态精美胶囊动作按钮 */
.action-capsules-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.capsule-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 5px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  user-select: none;
}

.capsule-btn:hover {
  transform: translateY(-1px);
}

.capsule-btn:active {
  transform: translateY(0);
}

.capsule-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.capsule-btn .arrow-tiny {
  font-size: 9px;
  margin-left: -1px;
}

/* 1. 施工图：琥珀金微质感 */
.capsule-blueprint {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.08));
  color: #d97706;
  border-color: rgba(245, 158, 11, 0.3);
}

.capsule-blueprint:hover {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #ffffff;
  border-color: #d97706;
  box-shadow: 0 2px 6px rgba(217, 119, 6, 0.3);
}

/* 2. 计算书：科技蓝微质感 */
.capsule-book {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(37, 99, 235, 0.08));
  color: #2563eb;
  border-color: rgba(59, 130, 246, 0.3);
}

.capsule-book:hover {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);
}

/* 3. 结果JSON：石墨灰微质感 */
.capsule-json {
  background: var(--el-fill-color-light, #f1f5f9);
  color: var(--el-text-color-regular, #475569);
  border-color: var(--el-border-color-light, #e2e8f0);
}

.capsule-json:hover:not(:disabled) {
  background: #475569;
  color: #ffffff;
  border-color: #475569;
  box-shadow: 0 2px 6px rgba(71, 85, 105, 0.25);
}

/* 4. 单段重算：祖母绿微质感 */
.capsule-recalc {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.08));
  color: #059669;
  border-color: rgba(16, 185, 129, 0.3);
}

.capsule-recalc:hover:not(:disabled) {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #ffffff;
  border-color: #059669;
  box-shadow: 0 2px 6px rgba(5, 150, 105, 0.3);
}

/* 分页 */
.pagination-container {
  display: flex;
  justify-content: center;
  padding-top: 6px;
  flex-shrink: 0;
}

.empty-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}
</style>