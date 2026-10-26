<!-- frontend/src/views/ParameterDatabase.vue -->
<template>
  <div class="db-container" :class="{ 'theme-tech-blue': themeStore.isTechBlue }">
    <!-- 1. 顶部全局工具栏与双模态切换 -->
    <div class="header-toolbar">
      <div class="title-section">
        <el-radio-group v-model="activeView" size="default" class="view-mode-toggle" @change="handleViewModeChange">
          <el-radio-button label="cards">🏛️ 工程分组卡片视图</el-radio-button>
          <el-radio-button label="flat">📋 全量数字资产明细</el-radio-button>
        </el-radio-group>
      </div>

      <div class="filter-group">
        <el-input 
          v-model="searchQuery" 
          :placeholder="activeView === 'cards' ? '检索工程组名/描述...' : '检索分段工程命名...'" 
          style="width: 240px" 
          clearable 
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-select v-model="filterClass" placeholder="全部工程分类" clearable style="width: 150px" @change="handleSearch">
          <el-option label="公路" value="公路" />
          <el-option label="铁路" value="铁路" />
          <el-option label="城市道路" value="城市道路" />
          <el-option label="城市轨道" value="城市轨道" />
          <el-option label="水工" value="水工" />
          <el-option label="综合管廊" value="综合管廊" />
          <el-option label="其他" value="其他" />
        </el-select>
        <el-button type="primary" @click="handleSearch" icon="Search">查询</el-button>

        <!-- 扁平视图专享批量操作 -->
        <template v-if="activeView === 'flat'">
          <el-button 
            type="success" 
            :disabled="selectedRows.length === 0" 
            @click="batchLoadFlatRowsToWorkspace('replace')"
          >
            批量载入工作台 ({{ selectedRows.length }})
          </el-button>
          <el-button
            type="warning"
            plain
            :disabled="selectedRows.length === 0"
            @click="batchAddFlatToBenchmark"
          >
            +加入对标 ({{ selectedRows.length }})
          </el-button>
          <el-button 
            type="warning" 
            @click="openBenchmarkCompare" 
            :disabled="cartStore.count < 2"
          >
            对标分析 (暂存篮 {{ cartStore.count }})
          </el-button>
        </template>
      </div>
    </div>

    <!-- 2. 工程分组卡片视图 (Project Cards Grid) -->
    <div v-if="activeView === 'cards'" class="cards-view-wrap" v-loading="isLoading">
      <template v-if="projectGroups.length > 0">
        <div class="project-cards-grid">
          <div 
            v-for="grp in projectGroups" 
            :key="grp.id" 
            class="project-card"
          >
            <!-- 封面展示区 -->
            <div class="card-cover-wrap">
              <img 
                v-if="grp.cover_image_url" 
                :src="resolveCoverUrl(grp.cover_image_url)" 
                alt="工程封面" 
                class="cover-image" 
              />
              <div v-else class="cover-placeholder">
                <svg viewBox="0 0 200 100" class="tunnel-vector-svg">
                  <path d="M 20 85 A 80 80 0 0 1 180 85 Z" fill="rgba(64, 158, 255, 0.12)" stroke="var(--el-color-primary)" stroke-width="2" stroke-dasharray="4 2" />
                  <path d="M 45 85 A 55 55 0 0 1 155 85 Z" fill="rgba(64, 158, 255, 0.08)" stroke="var(--el-color-primary-light-3)" stroke-width="2" />
                  <line x1="10" y1="85" x2="190" y2="85" stroke="var(--el-border-color-darker)" stroke-width="3" />
                  <circle cx="100" cy="50" r="4" fill="var(--el-color-primary)" />
                  <text x="100" y="70" text-anchor="middle" font-size="12" fill="var(--el-text-color-regular)">3D 隧道数字孪生</text>
                </svg>
              </div>

              <!-- 覆盖微标 -->
              <div class="cover-badge-top-left">
                <el-tag :type="getTagType(grp.tunnel_type)" effect="dark" class="category-tag">
                  {{ grp.tunnel_type }}
                </el-tag>
              </div>
              <div class="cover-badge-top-right">
                <span class="count-capsule">{{ grp.segment_count }} 段</span>
              </div>
            </div>

            <!-- 卡片核心信息区 -->
            <div class="card-body">
              <h3 class="group-title" :title="grp.group_name">{{ grp.group_name }}</h3>
              
              <div class="chainage-span-row">
                <span class="span-icon">📏</span>
                <span class="span-text">
                  桩号: {{ formatStationStr(grp.start_chainage) }} ~ {{ formatStationStr(grp.end_chainage) }}
                </span>
                <span class="span-length">
                  [{{ ((grp.end_chainage - grp.start_chainage) / 1000).toFixed(2) }} km]
                </span>
              </div>

              <div class="description-box" :title="grp.description || '暂无工程地质描述'">
                {{ grp.description || '暂无地质特征及工程概况描述' }}
              </div>

              <!-- 状态微标秒级直读 -->
              <div class="stats-badge-row">
                <span class="mini-stat-pill pill-done">
                  已算: {{ grp.calculated_count }}段 
                  <span class="pct-text">({{ Math.round((grp.calculated_count / (grp.segment_count || 1)) * 100) }}%)</span>
                </span>
                <span class="mini-stat-pill pill-pending">
                  待算: {{ Math.max(0, grp.segment_count - grp.calculated_count) }}段
                </span>
                <span 
                  class="mini-stat-pill" 
                  :class="grp.warning_count > 0 ? 'pill-warning' : 'pill-safe'"
                >
                  预警: {{ grp.warning_count }}段
                </span>
              </div>

              <div class="card-time-row">
                更新时间: {{ new Date(grp.updated_at).toLocaleString() }}
              </div>
            </div>

            <!-- 卡片底部操作栏 -->
            <div class="card-footer">
              <el-button 
                type="primary" 
                size="small" 
                class="card-act-btn"
                @click="loadEntireGroupToWorkspace(grp)"
              >
                整组载入工作台
              </el-button>
              
              <el-button 
                size="small" 
                plain 
                class="card-act-btn"
                @click="openGroupDrawer(grp)"
              >
                管理分段
              </el-button>

              <el-dropdown trigger="click" @command="(cmd: any) => handleGroupActionCommand(grp, cmd)">
                <el-button size="small" plain class="more-icon-btn">
                  ···
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="edit">✏️ 编辑工程组信息</el-dropdown-item>
                    <el-dropdown-item command="upload_cover">🖼️ 上传封面图片</el-dropdown-item>
                    <el-dropdown-item command="screenshot_cover">📸 捕获当前3D视口为封面</el-dropdown-item>
                    <el-dropdown-item command="delete" divided class="text-danger">🗑️ 删除整个工程组</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>

        <!-- 卡片流服务端分页栏 -->
        <div class="cards-pagination-wrap" v-if="cardsTotal > 0">
          <el-pagination
            v-model:current-page="cardsCurrentPage"
            v-model:page-size="cardsPageSize"
            :page-sizes="[8, 12, 16, 24]"
            :total="cardsTotal"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="handleCardsSizeChange"
            @current-change="handleCardsPageChange"
          />
        </div>
      </template>
      <el-empty v-else description="暂无符合条件的工程组，请在快照侧边栏执行“批量入库”" />
    </div>

    <!-- 3. 扁平全量台账明细视图 (Flat Table View) -->
    <div v-else class="flat-table-wrap">
      <el-table 
        :data="dbData" 
        v-loading="isLoading" 
        border 
        stripe 
        @selection-change="handleSelectionChange"
        class="flat-detail-table"
        height="100%"
        style="width: 100%;"
      >
        <el-table-column type="selection" width="50" align="center" />
        <el-table-column prop="id" label="ID" width="75" align="center">
          <template #default="scope">
            <span class="id-capsule">#{{ scope.row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column label="归属工程组" width="160" show-overflow-tooltip>
          <template #default="scope">
            <span class="group-name-cell">{{ scope.row.group_name || '默认未分组' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="project_name" label="分段工程命名" min-width="200" show-overflow-tooltip />
        <el-table-column prop="tunnel_type" label="工程分类" width="110" align="center">
          <template #default="scope">
            <el-tag :type="getTagType(scope.row.tunnel_type)" effect="dark">{{ scope.row.tunnel_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="里程区间" width="170" align="center">
          <template #default="scope">
            <span class="chainage-mono">
              {{ formatStationStr(scope.row.start_chainage) }} ~ {{ formatStationStr(scope.row.end_chainage) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="计算状态 / 安全系数" width="165" align="center">
          <template #default="scope">
            <template v-if="scope.row.has_results">
              <el-tag type="success" effect="dark" size="small">已算</el-tag>
              <span 
                v-if="scope.row.safety_factor !== null && scope.row.safety_factor !== undefined" 
                class="fs-badge" 
                :class="scope.row.safety_factor < 1.2 ? 'fs-danger' : 'fs-normal'"
              >
                Fs={{ Number(scope.row.safety_factor).toFixed(2) }}
              </span>
            </template>
            <el-tag v-else type="info" effect="plain" size="small">待算</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="入库时间" width="170" align="center">
          <template #default="scope">
            <span class="timestamp-mono">{{ new Date(scope.row.created_at).toLocaleString() }}</span>
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="220" fixed="right" align="center">
          <template #default="scope">
            <el-button size="small" type="primary" link @click="loadSingleToWorkspace(scope.row)">
              载入工作台
            </el-button>
            <el-button 
              size="small" 
              :type="cartStore.isPinned(scope.row.id) ? 'success' : 'warning'" 
              link 
              @click="toggleBenchmarkItem(scope.row)"
            >
              {{ cartStore.isPinned(scope.row.id) ? '已在对标' : '+对标' }}
            </el-button>
            <el-button size="small" type="danger" link @click="deleteFlatRecord(scope.row.id)">
              移除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 扁平台账分页栏 -->
      <div class="flat-pagination-wrap" v-if="flatTotal > 0">
        <el-pagination
          v-model:current-page="flatCurrentPage"
          v-model:page-size="flatPageSize"
          :page-sizes="[20, 50, 100]"
          :total="flatTotal"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleFlatSizeChange"
          @current-change="handleFlatPageChange"
        />
      </div>
    </div>

    <!-- 4. 工程分段明细下钻抽屉 (Drilldown Drawer) -->
    <el-drawer 
      v-model="drawerVisible" 
      :title="`📁 [${currentActiveGroup?.group_name}] 分区计算资产明细 (${drawerTotal} 区段)`" 
      size="75%" 
      append-to-body
      destroy-on-close
    >
      <div class="drawer-inner-container">
        <!-- 抽屉顶部简报与过滤工具栏 -->
        <div class="drawer-header-info">
          <div class="drawer-info-left">
            <el-tag :type="getTagType(currentActiveGroup?.tunnel_type || '')" effect="dark">
              {{ currentActiveGroup?.tunnel_type }}
            </el-tag>
            <span class="drawer-span-badge">
              📏 全线里程: {{ formatStationStr(currentActiveGroup?.start_chainage || 0) }} ~ {{ formatStationStr(currentActiveGroup?.end_chainage || 0) }}
            </span>
            <span class="drawer-desc-badge">
              {{ currentActiveGroup?.description || '暂无描述' }}
            </span>
          </div>

          <div class="drawer-filter-tools">
            <el-input
              v-model="drawerSearchQuery"
              placeholder="搜索组内分段..."
              clearable
              size="small"
              style="width: 170px;"
              @keyup.enter="fetchDrawerSegments"
              @clear="fetchDrawerSegments"
            />
            <el-radio-group v-model="drawerStatusFilter" size="small" @change="handleDrawerFilterChange">
              <el-radio-button label="all">全部</el-radio-button>
              <el-radio-button label="done">已算</el-radio-button>
              <el-radio-button label="pending">待算</el-radio-button>
              <el-radio-button label="warning">预警</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <!-- 分段明细表格 -->
        <el-table 
          :data="drawerSegments" 
          v-loading="isDrawerLoading" 
          border 
          stripe 
          size="small"
          @selection-change="handleDrawerSelectionChange"
          style="width: 100%; flex: 1;"
        >
          <el-table-column type="selection" width="50" align="center" />
          <el-table-column prop="id" label="ID" width="70" align="center" />
          <el-table-column prop="project_name" label="分段工程命名" min-width="190" show-overflow-tooltip />
          <el-table-column label="里程区间" width="160" align="center">
            <template #default="scope">
              {{ formatStationStr(scope.row.start_chainage) }} ~ {{ formatStationStr(scope.row.end_chainage) }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90" align="center">
            <template #default="scope">
              <el-tag :type="scope.row.has_results ? 'success' : 'warning'" size="small">
                {{ scope.row.has_results ? '已算' : '待算' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="安全系数 Fs" width="110" align="center">
            <template #default="scope">
              <span 
                v-if="scope.row.safety_factor !== null && scope.row.safety_factor !== undefined"
                class="fs-badge"
                :class="scope.row.safety_factor < 1.2 ? 'fs-danger' : 'fs-normal'"
              >
                Fs={{ Number(scope.row.safety_factor).toFixed(2) }}
              </span>
              <span v-else class="text-secondary">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="入库时间" width="160" align="center">
            <template #default="scope">
              {{ new Date(scope.row.created_at).toLocaleString() }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="190" align="center" fixed="right">
            <template #default="scope">
              <el-button size="small" type="primary" plain @click="loadSingleToWorkspace(scope.row)">
                载入
              </el-button>
              <el-button 
                size="small" 
                :type="cartStore.isPinned(scope.row.id) ? 'success' : 'warning'" 
                plain 
                @click="toggleBenchmarkItem(scope.row)"
              >
                {{ cartStore.isPinned(scope.row.id) ? '已在对标' : '+对标' }}
              </el-button>
              <el-button size="small" type="danger" link @click="deleteDrawerRecord(scope.row.id)">
                移除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 抽屉分页工具条 -->
        <div class="drawer-pagination-wrap" v-if="drawerTotal > 0">
          <el-pagination
            v-model:current-page="drawerCurrentPage"
            v-model:page-size="drawerPageSize"
            :page-sizes="[20, 50, 100]"
            :total="drawerTotal"
            layout="total, sizes, prev, pager, next"
            size="small"
            @size-change="fetchDrawerSegments"
            @current-change="fetchDrawerSegments"
          />
        </div>

        <!-- 抽屉吸底批量导回工作台工具栏 -->
        <div class="drawer-bottom-bar">
          <div class="drawer-bar-left">
            <span class="selection-indicator">
              已选 <b>{{ selectedDrawerRows.length }}</b> / {{ drawerTotal }} 项分段
            </span>
            <el-radio-group v-model="restoreMode" size="small" class="restore-mode-toggle">
              <el-radio-button label="replace">覆盖当前工作区</el-radio-button>
              <el-radio-button label="append">追加合并至工作区</el-radio-button>
            </el-radio-group>
          </div>
          <div class="drawer-bar-right">
            <el-button 
              type="warning" 
              plain
              :disabled="selectedDrawerRows.length === 0" 
              @click="batchAddDrawerToBenchmark"
            >
              +加入对标 ({{ selectedDrawerRows.length }})
            </el-button>
            <el-button 
              type="primary" 
              :disabled="selectedDrawerRows.length === 0" 
              @click="batchLoadDrawerRowsToWorkspace"
            >
              🚀 批量载入工作台 (已选 {{ selectedDrawerRows.length }} 项)
            </el-button>
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- 5. 编辑工程组信息弹窗 -->
    <el-dialog v-model="editGroupModalVisible" title="✏️ 编辑工程组信息" width="460px" destroy-on-close>
      <el-form :model="editGroupForm" label-width="95px" size="default">
        <el-form-item label="工程组名" required>
          <el-input v-model="editGroupForm.groupName" placeholder="如: 晏家隧道工程" />
        </el-form-item>
        <el-form-item label="工程分类" required>
          <el-select v-model="editGroupForm.tunnelType" style="width: 100%">
            <el-option label="公路" value="公路" />
            <el-option label="铁路" value="铁路" />
            <el-option label="城市道路" value="城市道路" />
            <el-option label="城市轨道" value="城市轨道" />
            <el-option label="水工" value="水工" />
            <el-option label="综合管廊" value="综合管廊" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="工程描述">
          <el-input 
            v-model="editGroupForm.description" 
            type="textarea" 
            :rows="3" 
            placeholder="记录工程地质水文特点、围岩类型与施工段落概况..." 
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editGroupModalVisible = false">取消</el-button>
        <el-button type="primary" :loading="isSavingGroup" @click="submitEditGroup">保存修改</el-button>
      </template>
    </el-dialog>

    <!-- 6. 隐藏的文件上传 Input -->
    <input 
      type="file" 
      ref="coverFileInputRef" 
      style="display: none" 
      accept="image/png,image/jpeg,image/webp" 
      @change="handleCoverFileSelected" 
    />

    <!-- 7. 全局对标暂存浮动坞 -->
    <BenchmarkFloatingDock @start-compare="openBenchmarkCompare" />

    <!-- 8. 参数多维对标分析抽屉 (保全历史分析能力与全集并集聚合) -->
    <el-drawer v-model="compareDrawerVisible" :title="`📊 工程参数多维对标分析 (${detailedCompareRows.length}项对比)`" size="85%" append-to-body>
      <div class="compare-toolbar">
        <el-tag type="info" effect="plain" class="compare-info-tag">
          💡 已对标 <strong>{{ detailedCompareRows.length }}</strong> 项工程（红色高亮表示参数在工程间存在差异，表头已聚合全选定项键名全集）
        </el-tag>
        <div class="compare-toolbar-actions">
          <el-button type="primary" size="small" plain @click="exportBenchmarkCSV">
            📥 导出对标 CSV 报告
          </el-button>
          <el-button type="danger" size="small" plain @click="cartStore.clearCart">
            清空暂存篮
          </el-button>
        </div>
      </div>

      <el-table :data="compareKeys" border size="small" stripe style="width: 100%; height: calc(100vh - 180px);">
        <el-table-column label="参数名称 (标识/单位)" width="220" fixed="left">
          <template #default="scope">
            <div class="param-name-cell">
              <span class="param-label">{{ getParamMeta(scope.row.key).label }}</span>
              <span class="param-code">({{ scope.row.key }})</span>
              <el-tag v-if="getParamMeta(scope.row.key).unit !== '-'" size="small" type="info" class="unit-tag">
                {{ getParamMeta(scope.row.key).unit }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="参数注释说明" min-width="240" fixed="left" show-overflow-tooltip>
          <template #default="scope">
            <span class="param-comment">{{ getParamMeta(scope.row.key).comment }}</span>
          </template>
        </el-table-column>
        <el-table-column 
          v-for="row in detailedCompareRows" 
          :key="row.id" 
          :label="row.project_name" 
          align="center" 
          min-width="170"
        >
          <template #header>
            <div class="compare-col-header">
              <span class="col-header-name" :title="row.project_name">{{ row.project_name }}</span>
              <el-tag size="small" effect="plain" class="col-header-tag">
                {{ row.tunnel_type || '公路' }}
              </el-tag>
            </div>
          </template>
          <template #default="scope">
            <span :class="{'diff-highlight': isDifferent(scope.row.key)}">
              {{ formatParamValue(scope.row.key, parseJSON(row.parameters_json)[scope.row.key]) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSnapshotStore } from '@/store/snapshotStore';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useBenchmarkCartStore, BenchmarkItemMeta } from '@/store/benchmarkCartStore';
import BenchmarkFloatingDock from '@/components/database/BenchmarkFloatingDock.vue';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import apiClient from '@/api/index';

const emit = defineEmits(['close']);
const snapshotStore = useSnapshotStore();
const authStore = useAuthStore();
const themeStore = useThemeStore();
const cartStore = useBenchmarkCartStore();

// 视口与基础检索状态
const activeView = ref<'cards' | 'flat'>('cards');
const searchQuery = ref('');
const filterClass = ref('');
const isLoading = ref(false);

// 卡片视图服务端分页状态
const projectGroups = ref<any[]>([]);
const cardsCurrentPage = ref(1);
const cardsPageSize = ref(12);
const cardsTotal = ref(0);

// 扁平列表服务端分页状态
const dbData = ref<any[]>([]);
const flatCurrentPage = ref(1);
const flatPageSize = ref(50);
const flatTotal = ref(0);
const selectedRows = ref<any[]>([]);

// 下钻抽屉状态
const drawerVisible = ref(false);
const isDrawerLoading = ref(false);
const currentActiveGroup = ref<any | null>(null);
const drawerSegments = ref<any[]>([]);
const selectedDrawerRows = ref<any[]>([]);
const drawerCurrentPage = ref(1);
const drawerPageSize = ref(50);
const drawerTotal = ref(0);
const drawerSearchQuery = ref('');
const drawerStatusFilter = ref<'all' | 'done' | 'pending' | 'warning'>('all');
const restoreMode = ref<'replace' | 'append'>('replace');

// 编辑工程组弹窗状态
const editGroupModalVisible = ref(false);
const isSavingGroup = ref(false);
const editGroupTargetId = ref<number | null>(null);
const editGroupForm = ref({
  groupName: '',
  tunnelType: '公路',
  description: ''
});

// 封面上传状态
const coverFileInputRef = ref<HTMLInputElement | null>(null);
const currentCoverTargetGroupId = ref<number | null>(null);

// 对标抽屉状态与水合详情数据
const compareDrawerVisible = ref(false);
const detailedCompareRows = ref<any[]>([]);

// 里程桩号格式化算法
const formatStationStr = (length_m: number): string => {
  const km = Math.floor(length_m / 1000);
  const m = Math.round(length_m % 1000);
  return `K${km}+${String(m).padStart(3, '0')}`;
};

// 提取封面相对或完整 URL
const resolveCoverUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const baseUrl = apiClient.defaults.baseURL || '';
  const origin = baseUrl.replace(/\/api\/v1\/?$/, '');
  return `${origin}${url}`;
};

// ==========================================
// 数据检索与加载管线 (服务端强分页)
// ==========================================

const fetchCardsData = async () => {
  isLoading.value = true;
  try {
    const res: any = await apiClient.get('/database/projects', {
      params: {
        page: cardsCurrentPage.value,
        page_size: cardsPageSize.value,
        search: searchQuery.value.trim() || undefined,
        tunnel_type: filterClass.value || undefined
      }
    });
    if (res && res.items) {
      projectGroups.value = res.items;
      cardsTotal.value = res.total;
    } else if (Array.isArray(res)) {
      projectGroups.value = res;
      cardsTotal.value = res.length;
    } else {
      projectGroups.value = [];
      cardsTotal.value = 0;
    }
  } catch (error) {
    ElMessage.error('获取工程分组数据失败');
  } finally {
    isLoading.value = false;
  }
};

const fetchFlatData = async () => {
  isLoading.value = true;
  try {
    const res: any = await apiClient.get('/database/parameters', {
      params: {
        page: flatCurrentPage.value,
        page_size: flatPageSize.value,
        search: searchQuery.value.trim() || undefined,
        tunnel_type: filterClass.value || undefined
      }
    });
    if (res && res.items) {
      dbData.value = res.items;
      flatTotal.value = res.total;
    } else if (Array.isArray(res)) {
      dbData.value = res;
      flatTotal.value = res.length;
    } else {
      dbData.value = [];
      flatTotal.value = 0;
    }
  } catch (error) {
    ElMessage.error('获取全量分段数据失败');
  } finally {
    isLoading.value = false;
  }
};

const fetchData = () => {
  if (activeView.value === 'cards') {
    fetchCardsData();
  } else {
    fetchFlatData();
  }
};

const handleSearch = () => {
  if (activeView.value === 'cards') {
    cardsCurrentPage.value = 1;
    fetchCardsData();
  } else {
    flatCurrentPage.value = 1;
    fetchFlatData();
  }
};

const handleViewModeChange = () => {
  fetchData();
};

const handleCardsPageChange = (p: number) => {
  cardsCurrentPage.value = p;
  fetchCardsData();
};

const handleCardsSizeChange = (s: number) => {
  cardsPageSize.value = s;
  cardsCurrentPage.value = 1;
  fetchCardsData();
};

const handleFlatPageChange = (p: number) => {
  flatCurrentPage.value = p;
  fetchFlatData();
};

const handleFlatSizeChange = (s: number) => {
  flatPageSize.value = s;
  flatCurrentPage.value = 1;
  fetchFlatData();
};

onMounted(() => {
  fetchData();
});

// ==========================================
// 按需水合管线 (Hydration Bridge)
// ==========================================

const hydrateParametersByIds = async (ids: number[]): Promise<any[]> => {
  if (!ids || ids.length === 0) return [];
  try {
    const res: any = await apiClient.post('/database/parameters/batch-details', { ids });
    return res || [];
  } catch (err: any) {
    ElMessage.error('按需水合分段大字段失败: ' + (err.message || err));
    throw err;
  }
};

const performRestore = (records: any[], mode: 'replace' | 'append') => {
  if (!records || records.length === 0) return;
  snapshotStore.restoreSnapshotsFromDatabase(records, { mode });

  let doneCount = 0;
  let pendingCount = 0;
  records.forEach(r => {
    if (r.results_json) doneCount++;
    else pendingCount++;
  });

  ElNotification({
    title: '工作台载入成功',
    message: `已将 ${records.length} 项分段载入快照库 (已算成果 ${doneCount} 项，待算纯参数 ${pendingCount} 项)，首段已同步至表单，3D 视口已重构`,
    type: 'success',
    duration: 4500
  });

  emit('close'); // 关闭台账模态框
};

// 卡片一键整组水合载入
const loadEntireGroupToWorkspace = async (group: any) => {
  try {
    const res: any = await apiClient.get(`/database/projects/${group.id}/parameters`, {
      params: { full: true }
    });
    if (!res || res.length === 0) {
      ElMessage.warning(`工程组 [${group.group_name}] 名下暂无可载入分段`);
      return;
    }
    performRestore(res, 'replace');
  } catch (err: any) {
    ElMessage.error('拉取工程分段明细失败: ' + (err.message || err));
  }
};

// 单段水合载入工作台
const loadSingleToWorkspace = async (row: any) => {
  try {
    const fullRecords = await hydrateParametersByIds([row.id]);
    if (fullRecords.length > 0) {
      performRestore(fullRecords, 'append');
    }
  } catch (e) {}
};

// 扁平列表批量水合载入
const batchLoadFlatRowsToWorkspace = async (mode: 'replace' | 'append' = 'replace') => {
  if (selectedRows.value.length === 0) return;
  try {
    const ids = selectedRows.value.map(r => r.id);
    const fullRecords = await hydrateParametersByIds(ids);
    performRestore(fullRecords, mode);
  } catch (e) {}
};

// 抽屉批量水合载入
const batchLoadDrawerRowsToWorkspace = async () => {
  if (selectedDrawerRows.value.length === 0) return;
  try {
    const ids = selectedDrawerRows.value.map(r => r.id);
    const fullRecords = await hydrateParametersByIds(ids);
    performRestore(fullRecords, restoreMode.value);
  } catch (e) {}
};

// ==========================================
// 跨组对标暂存篮联动机制
// ==========================================

const toBenchmarkItem = (row: any): BenchmarkItemMeta => {
  return {
    id: row.id,
    group_id: row.group_id ?? (currentActiveGroup.value?.id || null),
    group_name: row.group_name || currentActiveGroup.value?.group_name || '默认未分组',
    project_name: row.project_name,
    tunnel_type: row.tunnel_type,
    start_chainage: row.start_chainage,
    end_chainage: row.end_chainage,
    safety_factor: row.safety_factor ?? null
  };
};

const toggleBenchmarkItem = (row: any) => {
  if (cartStore.isPinned(row.id)) {
    cartStore.removeItem(row.id);
    ElMessage.info(`已将 [${row.project_name}] 移出对标暂存篮`);
  } else {
    cartStore.addItem(toBenchmarkItem(row));
  }
};

const batchAddFlatToBenchmark = () => {
  if (selectedRows.value.length === 0) return;
  let added = 0;
  selectedRows.value.forEach(row => {
    if (!cartStore.isPinned(row.id) && cartStore.count < 8) {
      cartStore.addItem(toBenchmarkItem(row));
      added++;
    }
  });
  if (added > 0) {
    ElMessage.success(`已批量加入 ${added} 项分段至对标暂存篮`);
  }
};

const batchAddDrawerToBenchmark = () => {
  if (selectedDrawerRows.value.length === 0) return;
  let added = 0;
  selectedDrawerRows.value.forEach(row => {
    if (!cartStore.isPinned(row.id) && cartStore.count < 8) {
      cartStore.addItem(toBenchmarkItem(row));
      added++;
    }
  });
  if (added > 0) {
    ElMessage.success(`已批量加入 ${added} 项分段至对标暂存篮`);
  }
};

const openBenchmarkCompare = async () => {
  if (cartStore.count < 2) {
    ElMessage.warning('请至少选取 2 项分段进行对标分析');
    return;
  }
  try {
    const ids = cartStore.cartItems.map(item => item.id);
    const fullRecords = await hydrateParametersByIds(ids);
    detailedCompareRows.value = fullRecords;
    compareDrawerVisible.value = true;
  } catch (err: any) {
    ElMessage.error('装载对标详细参数失败: ' + (err.message || err));
  }
};

// ==========================================
// 下钻抽屉控制 (支持组内分页与状态筛选)
// ==========================================

const fetchDrawerSegments = async () => {
  if (!currentActiveGroup.value) return;
  isDrawerLoading.value = true;
  try {
    const res: any = await apiClient.get(`/database/projects/${currentActiveGroup.value.id}/parameters`, {
      params: {
        page: drawerCurrentPage.value,
        page_size: drawerPageSize.value,
        search: drawerSearchQuery.value.trim() || undefined,
        status_filter: drawerStatusFilter.value
      }
    });
    if (res && res.items) {
      drawerSegments.value = res.items;
      drawerTotal.value = res.total;
    } else if (Array.isArray(res)) {
      drawerSegments.value = res;
      drawerTotal.value = res.length;
    } else {
      drawerSegments.value = [];
      drawerTotal.value = 0;
    }
  } catch (err: any) {
    ElMessage.error('获取分段明细失败');
    drawerSegments.value = [];
    drawerTotal.value = 0;
  } finally {
    isDrawerLoading.value = false;
  }
};

const openGroupDrawer = async (group: any) => {
  currentActiveGroup.value = group;
  drawerVisible.value = true;
  selectedDrawerRows.value = [];
  drawerCurrentPage.value = 1;
  drawerSearchQuery.value = '';
  drawerStatusFilter.value = 'all';
  await fetchDrawerSegments();
};

const handleDrawerFilterChange = () => {
  drawerCurrentPage.value = 1;
  fetchDrawerSegments();
};

const handleDrawerSelectionChange = (val: any[]) => {
  selectedDrawerRows.value = val;
};

const handleSelectionChange = (val: any[]) => {
  selectedRows.value = val;
};

// ==========================================
// 工程组管理：编辑、封面上传与删除
// ==========================================
const handleGroupActionCommand = (group: any, cmd: string) => {
  if (cmd === 'edit') {
    editGroupTargetId.value = group.id;
    editGroupForm.value = {
      groupName: group.group_name,
      tunnelType: group.tunnel_type,
      description: group.description || ''
    };
    editGroupModalVisible.value = true;
  } else if (cmd === 'upload_cover') {
    currentCoverTargetGroupId.value = group.id;
    coverFileInputRef.value?.click();
  } else if (cmd === 'screenshot_cover') {
    captureViewportCover(group);
  } else if (cmd === 'delete') {
    confirmDeleteGroup(group);
  }
};

const submitEditGroup = async () => {
  if (!editGroupForm.value.groupName.trim()) {
    ElMessage.warning('工程组名不能为空');
    return;
  }
  isSavingGroup.value = true;
  try {
    await apiClient.put(`/database/projects/${editGroupTargetId.value}`, {
      group_name: editGroupForm.value.groupName.trim(),
      tunnel_type: editGroupForm.value.tunnelType,
      description: editGroupForm.value.description
    });
    ElMessage.success('工程组信息更新成功');
    editGroupModalVisible.value = false;
    fetchCardsData();
  } catch (err: any) {
    const detail = err.response?.data?.detail || err.message || '未知错误';
    ElMessage.error('更新失败: ' + detail);
  } finally {
    isSavingGroup.value = false;
  }
};

const handleCoverFileSelected = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || !currentCoverTargetGroupId.value) return;

  if (file.size > 5 * 1024 * 1024) {
    ElMessage.warning('封面图片不能超过 5MB');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    await apiClient.post(`/database/projects/${currentCoverTargetGroupId.value}/cover`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    ElMessage.success('封面图片上传成功');
    fetchCardsData();
  } catch (err: any) {
    ElMessage.error('上传封面失败: ' + (err.message || err));
  } finally {
    target.value = '';
    currentCoverTargetGroupId.value = null;
  }
};

const captureViewportCover = async (group: any) => {
  const canvas = document.querySelector('.viewer-container canvas') as HTMLCanvasElement;
  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    ElMessage.warning('未找到有效的 3D 视口画布，请确保 3D 视口处于可见状态');
    return;
  }

  try {
    const base64Data = canvas.toDataURL('image/png');
    if (!base64Data || base64Data === 'data:,' || base64Data.length < 100) {
      ElMessage.warning('提取 3D 视口画面数据失败，画面数据为空');
      return;
    }
    await apiClient.post(`/database/projects/${group.id}/cover-base64`, {
      image_base64: base64Data
    });
    ElMessage.success(`已将当前 3D 视口画面设置为 [${group.group_name}] 的封面图`);
    fetchCardsData();
  } catch (err: any) {
    ElMessage.error('设置封面失败: ' + (err.message || err));
  }
};

const confirmDeleteGroup = (group: any) => {
  authStore.wrapActionWithAuth(() => {
    ElMessageBox.confirm(
      `确定要彻底删除工程组 [${group.group_name}] 吗？该操作将级联清空名下全部 ${group.segment_count} 个分段资产及封面图片，数据不可恢复！`,
      '⚠️ 危险：级联删除工程组',
      {
        confirmButtonText: '确定彻底删除',
        cancelButtonText: '取消',
        type: 'error',
        confirmButtonClass: 'el-button--danger'
      }
    ).then(async () => {
      try {
        await apiClient.delete(`/database/projects/${group.id}`);
        ElMessage.success(`已成功删除工程组 [${group.group_name}]`);
        fetchCardsData();
      } catch (err: any) {
        ElMessage.error('删除工程组失败: ' + (err.message || err));
      }
    }).catch(() => {});
  }, `级联删除工程组 [${group.group_name}]`);
};

const deleteFlatRecord = async (id: number) => {
  authStore.wrapActionWithAuth(async () => {
    try {
      await ElMessageBox.confirm('数据删除后不可恢复，是否继续？', '风险提示', { type: 'warning' });
      await apiClient.delete(`/database/parameters/${id}`);
      ElMessage.success('清理成功');
      fetchFlatData();
    } catch (e) { }
  }, '删除分段记录');
};

const deleteDrawerRecord = async (id: number) => {
  authStore.wrapActionWithAuth(async () => {
    try {
      await ElMessageBox.confirm('数据删除后不可恢复，是否继续？', '风险提示', { type: 'warning' });
      await apiClient.delete(`/database/parameters/${id}`);
      ElMessage.success('分段已移除');
      fetchDrawerSegments();
      fetchCardsData();
    } catch (e) { }
  }, '删除分段记录');
};

// ==========================================
// 参数对标分析辅助字典与逻辑 (全选定项键名全集并集 Key Union)
// ==========================================
interface ParamMeta {
  label: string;
  unit: string;
  comment: string;
}

const PARAM_META_DICT: Record<string, ParamMeta> = {
  // --- 1. 里程与工程类型 ---
  start_chainage: { label: '分区起点里程', unit: 'm', comment: '隧道工程计算分段起点里程桩号' },
  end_chainage: { label: '分区终点里程', unit: 'm', comment: '隧道工程计算分段终点里程桩号' },
  tunnel_type: { label: '隧道洞型', unit: '-', comment: '单洞(single)或双洞(double)计算拓扑' },

  // --- 2. 水文地质与环境特征 ---
  k_r: { label: '围岩渗透系数', unit: 'm/d', comment: '围岩天然地层水理渗透传导能力' },
  H: { label: '初始地下水头', unit: 'm', comment: '隧道轴线上方初始承压地下水头高度' },
  p_mm: { label: '年降雨量', unit: 'mm', comment: '地表降水补给年降雨量' },
  grades: { label: '围岩级别', unit: '级', comment: '国标围岩工程地质分级(1~6级)' },
  cn_condition: { label: '灌溉入渗条件', unit: '-', comment: 'SCS-CN 水文土壤地表下渗特征' },
  land_use: { label: '地表用地类型', unit: '-', comment: '地表植被与用地水文径流特征' },
  gamma: { label: '地下水重度', unit: 'kN/m³', comment: '计算水力静压容重常数' },

  // --- 3. 几何断面与空间尺度 ---
  h_1: { label: '隧道中心埋深', unit: 'm', comment: '隧道中心轴线垂直地表埋深' },
  r_0: { label: '二衬内半径(r_0)', unit: 'm', comment: '二衬内轮廓净空半径' },
  r_s: { label: '二衬外半径(r_s)', unit: 'm', comment: '二次衬砌外轮廓等效半径' },
  r_p: { label: '初支外半径(r_p)', unit: 'm', comment: '喷锚初期支护外等效半径' },
  r_g: { label: '注浆圈外半径(r_g)', unit: 'm', comment: '注浆止水加固圈外边界半径' },
  aspect_ratio: { label: '断面高宽比(扁平比)', unit: '-', comment: '隧道断面竖向与横向尺度比(h/w)' },
  D_spacing: { label: '双洞轴线间距', unit: 'm', comment: '双洞隧道平行中心线法向间距' },

  // --- 4. 支护结构与力学材料 ---
  k_g: { label: '注浆圈渗透系数', unit: 'm/d', comment: '围岩注浆堵水加固圈渗透系数' },
  k_p: { label: '初支渗透系数', unit: 'm/d', comment: '初期支护混凝土渗透系数' },
  k_s: { label: '二衬渗透系数', unit: 'm/d', comment: '二次衬砌抗渗混凝土渗透系数' },
  concrete_grade: { label: '二衬混凝土标号', unit: '-', comment: '二次衬砌混凝土强度等级(如C35)' },
  Ag: { label: '单侧截面配筋面积', unit: 'mm²', comment: '延米二衬截面受拉/受压主筋设计面积' },
  as_mm: { label: '主筋保护层厚度', unit: 'mm', comment: '受拉主筋受力边缘至外缘保护层厚度' },
  tol_safety_factor: { label: '设计容许安全系数', unit: '-', comment: '衬砌抗裂抗弯极限状态控制安全系数阈值 [K]' },

  // --- 5. 排水管网与水力坡降 ---
  I_long: { label: '纵向排水坡降', unit: '-', comment: '纵向集水明沟/盲管水力坡降' },
  I_ring: { label: '环向盲管水力坡降', unit: '-', comment: '环向排水盲管环向引流坡度' },
  I_lat: { label: '横向排水管坡降', unit: '-', comment: '横向引水汇流管水力坡降' },
  n_long: { label: '纵向排水管曼宁糙率', unit: '-', comment: '纵向排水主管管壁粗糙度' },
  n_ring: { label: '环向盲管曼宁糙率', unit: '-', comment: '环向波纹打孔管壁粗糙度' },
  n_lat: { label: '横向排水管曼宁糙率', unit: '-', comment: '横向引水管壁粗糙度' },
  d_ring_default: { label: '环向盲管公称内径', unit: 'm', comment: '环向排水盲管公称内径' },
  d_long_default: { label: '纵向管默认内径', unit: 'm', comment: '纵向集水主管道基准内径' },
  d_lat_default: { label: '横向管默认内径', unit: 'm', comment: '横向导水连通管内径' },
  S_code_max: { label: '规范最大盲管间距', unit: 'm', comment: '行业标准允许的最大布设间距上限' },
  S_min: { label: '工程最小施工间距', unit: 'm', comment: '现场工法限制的盲管最小布设间距' },
  has_central_ditch: { label: '中央排水沟设置', unit: '-', comment: '是否设置中央水沟(三沟式与双侧沟拓扑)' }
};

const getParamMeta = (key: string): ParamMeta => {
  return PARAM_META_DICT[key] || { label: key, unit: '-', comment: '工程自定义扩展参数' };
};

const formatParamValue = (key: string, val: any): string => {
  if (val === undefined || val === null || val === '') return '-';
  if (key === 'tunnel_type') {
    return val === 'single' ? '单洞' : val === 'double' ? '双洞' : String(val);
  }
  if (key === 'has_central_ditch') {
    return val === true || val === 'true' ? '设置(三沟式)' : '不设置(双侧沟)';
  }
  return String(val);
};

// 全选定项键名全集并集 (Key Union)，按专业规范顺序排列
const compareKeys = computed(() => {
  if (detailedCompareRows.value.length === 0) return [];
  const allKeys = new Set<string>();
  
  detailedCompareRows.value.forEach(row => {
    const params = typeof row.parameters_json === 'string' 
      ? parseJSON(row.parameters_json) 
      : (row.parameters_json || {});
    Object.keys(params).forEach(k => allKeys.add(k));
  });

  const deprecatedKeys = new Set([
    'beta2', 'ha', 'rebar_type', 'double_side', 'P_crit', 
    'c', 'K', 'h', 'r', 'r1', 'r2', 'rg', 'K1', 'K2', 'Kg'
  ]);

  const standardKeyOrder = Object.keys(PARAM_META_DICT);
  const keyOrderMap = new Map(standardKeyOrder.map((k, idx) => [k, idx]));

  return Array.from(allKeys)
    .filter(k => !deprecatedKeys.has(k))
    .sort((a, b) => {
      const orderA = keyOrderMap.has(a) ? (keyOrderMap.get(a) as number) : 9999;
      const orderB = keyOrderMap.has(b) ? (keyOrderMap.get(b) as number) : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    })
    .map(key => ({ key }));
});

const parseJSON = (jsonStr: string) => {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return {};
  }
};

const isDifferent = (key: string) => {
  if (detailedCompareRows.value.length < 2) return false;
  const firstParams = parseJSON(detailedCompareRows.value[0].parameters_json);
  const firstVal = firstParams[key];
  return detailedCompareRows.value.some(row => {
    const rowParams = parseJSON(row.parameters_json);
    return rowParams[key] !== firstVal;
  });
};

// 导出对标 CSV 报告
const exportBenchmarkCSV = () => {
  if (detailedCompareRows.value.length === 0 || compareKeys.value.length === 0) {
    ElMessage.warning('暂无可导出的对标数据');
    return;
  }

  const headers = ['参数代码', '参数名称', '单位', '注释说明'];
  detailedCompareRows.value.forEach(row => {
    headers.push(`"${row.project_name.replace(/"/g, '""')}"`);
  });

  const csvRows: string[] = [headers.join(',')];

  compareKeys.value.forEach(({ key }) => {
    const meta = getParamMeta(key);
    const rowCells = [
      `"${key}"`,
      `"${meta.label.replace(/"/g, '""')}"`,
      `"${meta.unit}"`,
      `"${meta.comment.replace(/"/g, '""')}"`
    ];

    detailedCompareRows.value.forEach(row => {
      const params = parseJSON(row.parameters_json);
      const val = formatParamValue(key, params[key]);
      rowCells.push(`"${String(val).replace(/"/g, '""')}"`);
    });

    csvRows.push(rowCells.join(','));
  });

  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `隧道工程参数多维对标报告_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  ElMessage.success('对标分析 CSV 报告已成功导出');
};

const getTagType = (type: string) => {
  const map: Record<string, string> = { '公路': 'success', '铁路': 'primary', '城市道路': 'warning', '城市轨道': 'info' };
  return map[type] || 'default';
};
</script>

<style scoped>
/* 容器全屏环境与底色 */
.db-container {
  background-color: var(--el-bg-color-page);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  background: var(--el-bg-color-overlay);
  border-bottom: 1px solid var(--el-border-color-light);
  flex-wrap: wrap;
  gap: 12px;
}

.title-section {
  display: flex;
  align-items: center;
  gap: 20px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* 卡片流视口与弹性响应式网格 */
.cards-view-wrap {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.project-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.project-card {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.project-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  border-color: var(--el-color-primary-light-5);
}

.card-cover-wrap {
  position: relative;
  height: 140px;
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.08) 0%, rgba(103, 194, 58, 0.08) 100%);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tunnel-vector-svg {
  width: 160px;
  height: 80px;
}

.cover-badge-top-left {
  position: absolute;
  top: 10px;
  left: 10px;
}

.category-tag {
  font-size: 12px;
  font-weight: 600;
}

.cover-badge-top-right {
  position: absolute;
  top: 10px;
  right: 10px;
}

.count-capsule {
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 12px;
  backdrop-filter: blur(4px);
  font-weight: 500;
}

.card-body {
  padding: 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chainage-span-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-color-primary);
  font-weight: 500;
}

.span-length {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.description-box {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
  height: 36px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stats-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.mini-stat-pill {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}

.pill-done {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
  border: 1px solid var(--el-color-success-light-5);
}

.pill-pending {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
  border: 1px solid var(--el-color-warning-light-5);
}

.pill-safe {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  border: 1px solid var(--el-border-color-lighter);
}

.pill-warning {
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  border: 1px solid var(--el-color-danger-light-5);
}

.pct-text {
  font-size: 12px;
  opacity: 0.85;
}

.card-time-row {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-top: auto;
  padding-top: 6px;
}

.card-footer {
  padding: 10px 16px;
  background: var(--el-fill-color-light);
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-act-btn {
  font-size: 12px;
}

.more-icon-btn {
  font-size: 14px;
  font-weight: bold;
  padding: 0 8px;
}

.cards-pagination-wrap {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 4px 0;
}

/* 扁平表格视口：自适应弹性伸缩与滚动封装 */
.flat-table-wrap {
  flex: 1;
  padding: 16px 20px;
  overflow: hidden;
  height: 0;
  display: flex;
  flex-direction: column;
}

.flat-pagination-wrap {
  padding: 12px 0 0 0;
  display: flex;
  justify-content: flex-end;
}

/* 扁平全量台账表格排版与等宽数字对齐 (字阶 >= 12px 门禁) */
.id-capsule {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 600;
  font-size: 12px;
  color: var(--el-color-primary);
}

.group-name-cell {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.chainage-mono,
.timestamp-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.2px;
}

.fs-badge {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  margin-left: 6px;
  padding: 1px 5px;
  border-radius: 3px;
}

.fs-normal {
  color: #68d391;
  background-color: rgba(104, 211, 145, 0.12);
}

.fs-danger {
  color: #f56565;
  background-color: rgba(245, 101, 101, 0.15);
}

/* 科技蓝主题下的表格专属质感与防穿透适配 */
.theme-tech-blue :deep(.flat-detail-table) {
  --el-fill-color-lighter: #14243b !important;
  --el-table-border-color: #1a365d !important;
  --el-table-header-bg-color: #132238 !important;
  --el-table-header-text-color: #90cdf4 !important;
  --el-table-tr-bg-color: #0f1c2e !important;
  --el-table-row-hover-bg-color: #1a2f4c !important;
  --el-table-text-color: #e2e8f0 !important;
  background-color: #0f1c2e !important;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #1a365d;
}

.theme-tech-blue :deep(.flat-detail-table .el-table__row td.el-table__cell) {
  background-color: #0f1c2e !important;
  color: #e2e8f0;
}

.theme-tech-blue :deep(.flat-detail-table .el-table__row--striped td.el-table__cell) {
  background-color: #14243b !important;
  color: #e2e8f0;
}

.theme-tech-blue :deep(.flat-detail-table .el-table__row:hover > td.el-table__cell) {
  background-color: #1a2f4c !important;
}

.theme-tech-blue :deep(.flat-detail-table .el-table__fixed-right),
.theme-tech-blue :deep(.flat-detail-table .el-table__fixed-right-patch),
.theme-tech-blue :deep(.flat-detail-table .el-table-fixed-column--right) {
  background-color: #0f1c2e !important;
}

.theme-tech-blue :deep(.flat-detail-table .el-table__cell) {
  padding: 8px 0;
}

/* 下钻抽屉样式 */
.drawer-inner-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.drawer-header-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-wrap: wrap;
  gap: 12px;
}

.drawer-info-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.drawer-filter-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drawer-span-badge {
  color: var(--el-color-primary);
  font-weight: 500;
  font-size: 13px;
}

.drawer-desc-badge {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  max-width: 320px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.drawer-pagination-wrap {
  padding: 10px 0 4px 0;
  display: flex;
  justify-content: flex-end;
}

.drawer-bottom-bar {
  margin-top: auto;
  padding-top: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--el-border-color-light);
}

.drawer-bar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.drawer-bar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.selection-indicator {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.selection-indicator b {
  color: var(--el-color-primary);
}

/* 参数对标分析辅助样式 (字阶 >= 12px 门禁验证) */
.compare-toolbar {
  margin-bottom: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.compare-info-tag {
  font-size: 13px;
  padding: 8px 12px;
  height: auto;
  line-height: 1.5;
}

.compare-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.compare-col-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.col-header-name {
  font-weight: 600;
  font-size: 13px;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-header-tag {
  font-size: 12px;
  height: 20px;
  line-height: 18px;
}

.diff-highlight {
  color: #f56c6c;
  font-weight: bold;
  background-color: var(--el-color-danger-light-9);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.param-name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.param-label {
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-size: 13px;
}

.param-code {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.unit-tag {
  font-size: 12px;
  padding: 0 4px;
  height: 20px;
  line-height: 18px;
}

.param-comment {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
}

.text-danger {
  color: var(--el-color-danger) !important;
}

.text-secondary {
  color: var(--el-text-color-secondary);
}
</style>
