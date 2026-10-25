<!-- frontend/src/views/ParameterDatabase.vue -->
<template>
  <div class="db-container">
    <!-- 1. 顶部全局工具栏与双模态切换 -->
    <div class="header-toolbar">
      <div class="title-section">
        <h2>隧道工程参数台账管理中心</h2>
        <el-radio-group v-model="activeView" size="default" class="view-mode-toggle">
          <el-radio-button label="cards">🏛️ 工程分组卡片视图</el-radio-button>
          <el-radio-button label="flat">📋 扁平全量台账明细</el-radio-button>
        </el-radio-group>
      </div>

      <div class="filter-group">
        <el-input 
          v-model="searchQuery" 
          :placeholder="activeView === 'cards' ? '检索工程组名/描述...' : '检索分段工程命名...'" 
          style="width: 240px" 
          clearable 
        />
        <el-select v-model="filterClass" placeholder="全部工程分类" clearable style="width: 150px">
          <el-option label="公路" value="公路" />
          <el-option label="铁路" value="铁路" />
          <el-option label="城市道路" value="城市道路" />
          <el-option label="城市轨道" value="城市轨道" />
          <el-option label="水工" value="水工" />
          <el-option label="综合管廊" value="综合管廊" />
          <el-option label="其他" value="其他" />
        </el-select>
        <el-button type="primary" @click="fetchData" icon="Search">查询</el-button>

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
            @click="openCompare" 
            :disabled="selectedRows.length < 2"
          >
            对标分析 (需≥2项)
          </el-button>
        </template>
      </div>
    </div>

    <!-- 2. 工程分组卡片视图 (Project Cards Grid) -->
    <div v-if="activeView === 'cards'" class="cards-view-wrap" v-loading="isLoading">
      <template v-if="filteredGroups.length > 0">
        <div class="project-cards-grid">
          <div 
            v-for="grp in filteredGroups" 
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
      </template>
      <el-empty v-else description="暂无符合条件的工程组，请在快照侧边栏执行“批量入库”" />
    </div>

    <!-- 3. 扁平全量台账明细视图 (Flat Table View) -->
    <div v-else class="flat-table-wrap">
      <el-table 
        :data="filteredFlatData" 
        v-loading="isLoading" 
        border 
        stripe 
        @selection-change="handleSelectionChange"
        style="width: 100%; height: calc(100vh - 200px);"
      >
        <el-table-column type="selection" width="50" align="center" />
        <el-table-column prop="id" label="ID" width="70" align="center" />
        <el-table-column label="归属工程组" width="160" show-overflow-tooltip>
          <template #default="scope">
            {{ getGroupNameById(scope.row.group_id) }}
          </template>
        </el-table-column>
        <el-table-column prop="project_name" label="分段工程命名" min-width="200" show-overflow-tooltip />
        <el-table-column prop="tunnel_type" label="工程分类" width="110" align="center">
          <template #default="scope">
            <el-tag :type="getTagType(scope.row.tunnel_type)" effect="dark">{{ scope.row.tunnel_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="里程区间" width="160" align="center">
          <template #default="scope">
            {{ formatStationStr(scope.row.start_chainage) }} ~ {{ formatStationStr(scope.row.end_chainage) }}
          </template>
        </el-table-column>
        <el-table-column label="计算状态" width="100" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.results_json ? 'success' : 'warning'" size="small">
              {{ scope.row.results_json ? '已算 (done)' : '待算 (pending)' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="入库时间" width="170" align="center">
          <template #default="scope">
            {{ new Date(scope.row.created_at).toLocaleString() }}
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="180" fixed="right" align="center">
          <template #default="scope">
            <el-button size="small" type="primary" plain @click="loadSingleToWorkspace(scope.row)">
              载入工作台
            </el-button>
            <el-button size="small" type="danger" link @click="deleteFlatRecord(scope.row.id)">
              移除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 4. 工程分段明细下钻抽屉 (Drilldown Drawer) -->
    <el-drawer 
      v-model="drawerVisible" 
      :title="`📁 [${currentActiveGroup?.group_name}] 分段计算资产明细 (${drawerSegments.length} 段)`" 
      size="75%" 
      append-to-body
      destroy-on-close
    >
      <div class="drawer-inner-container">
        <!-- 抽屉顶部简报 -->
        <div class="drawer-header-info">
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

        <!-- 分段明细表格 -->
        <el-table 
          :data="drawerSegments" 
          v-loading="isDrawerLoading" 
          border 
          stripe 
          size="small"
          @selection-change="handleDrawerSelectionChange"
          style="width: 100%; height: calc(100vh - 260px);"
        >
          <el-table-column type="selection" width="50" align="center" />
          <el-table-column prop="id" label="ID" width="70" align="center" />
          <el-table-column prop="project_name" label="分段工程命名" min-width="190" show-overflow-tooltip />
          <el-table-column label="里程区间" width="160" align="center">
            <template #default="scope">
              {{ formatStationStr(scope.row.start_chainage) }} ~ {{ formatStationStr(scope.row.end_chainage) }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="scope">
              <el-tag :type="scope.row.results_json ? 'success' : 'warning'" size="small">
                {{ scope.row.results_json ? '已算' : '待算' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="安全系数 Fs" width="110" align="center">
            <template #default="scope">
              <span v-if="scope.row.results_json">
                {{ extractFsFromRow(scope.row) != null ? extractFsFromRow(scope.row)?.toFixed(2) : '-' }}
              </span>
              <span v-else class="text-secondary">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="入库时间" width="160" align="center">
            <template #default="scope">
              {{ new Date(scope.row.created_at).toLocaleString() }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" align="center" fixed="right">
            <template #default="scope">
              <el-button size="small" type="primary" plain @click="loadSingleToWorkspace(scope.row)">
                载入
              </el-button>
              <el-button size="small" type="danger" link @click="deleteDrawerRecord(scope.row.id)">
                移除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 抽屉吸底批量导回工作台工具栏 -->
        <div class="drawer-bottom-bar">
          <div class="drawer-bar-left">
            <span class="selection-indicator">
              已选 <b>{{ selectedDrawerRows.length }}</b> / {{ drawerSegments.length }} 项分段
            </span>
            <el-radio-group v-model="restoreMode" size="small" class="restore-mode-toggle">
              <el-radio-button label="replace">覆盖当前工作区</el-radio-button>
              <el-radio-button label="append">追加合并至工作区</el-radio-button>
            </el-radio-group>
          </div>
          <div class="drawer-bar-right">
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

    <!-- 7. 参数对标分析抽屉 (保全历史分析能力) -->
    <el-drawer v-model="compareDrawerVisible" title="📊 工程参数多维对标分析" size="80%" append-to-body>
      <div class="compare-toolbar">
        <el-tag type="info" effect="plain" class="compare-info-tag">
          💡 已选中 <strong>{{ selectedRows.length }}</strong> 项工程进行多维参数对比（红色高亮表示参数在工程间存在差异）
        </el-tag>
      </div>
      <el-table :data="compareKeys" border size="small" stripe style="width: 100%;">
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
        <el-table-column label="简单注释说明" min-width="260" fixed="left" show-overflow-tooltip>
          <template #default="scope">
            <span class="param-comment">{{ getParamMeta(scope.row.key).comment }}</span>
          </template>
        </el-table-column>
        <el-table-column v-for="row in selectedRows" :key="row.id" :label="row.project_name" align="center" min-width="160">
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
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import apiClient from '@/api/index';

const emit = defineEmits(['close']);
const snapshotStore = useSnapshotStore();
const authStore = useAuthStore();

// 视口与基础检索状态
const activeView = ref<'cards' | 'flat'>('cards');
const searchQuery = ref('');
const filterClass = ref('');
const isLoading = ref(false);

// 工程组列表与扁平分段列表
const projectGroups = ref<any[]>([]);
const dbData = ref<any[]>([]);
const selectedRows = ref<any[]>([]);

// 下钻抽屉状态
const drawerVisible = ref(false);
const isDrawerLoading = ref(false);
const currentActiveGroup = ref<any | null>(null);
const drawerSegments = ref<any[]>([]);
const selectedDrawerRows = ref<any[]>([]);
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

// 对标抽屉状态
const compareDrawerVisible = ref(false);

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
  // 剥离 /api/v1 路径
  const origin = baseUrl.replace(/\/api\/v1\/?$/, '');
  return `${origin}${url}`;
};

// 过滤后的工程组列表
const filteredGroups = computed(() => {
  return projectGroups.value.filter(grp => {
    const matchName = grp.group_name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (grp.description && grp.description.toLowerCase().includes(searchQuery.value.toLowerCase()));
    const matchClass = filterClass.value ? grp.tunnel_type === filterClass.value : true;
    return matchName && matchClass;
  });
});

// 过滤后的扁平台账列表
const filteredFlatData = computed(() => {
  return dbData.value.filter(item => {
    const matchName = item.project_name.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchClass = filterClass.value ? item.tunnel_type === filterClass.value : true;
    return matchName && matchClass;
  });
});

const getGroupNameById = (groupId: number | null): string => {
  if (!groupId) return '默认未分组';
  const matched = projectGroups.value.find(g => g.id === groupId);
  return matched ? matched.group_name : `组#${groupId}`;
};

// ==========================================
// 数据检索与加载
// ==========================================
const fetchData = async () => {
  isLoading.value = true;
  try {
    const [groupsRes, paramsRes]: any = await Promise.all([
      apiClient.get('/database/projects'),
      apiClient.get('/database/parameters')
    ]);
    projectGroups.value = groupsRes || [];
    dbData.value = paramsRes || [];
  } catch (error) {
    ElMessage.error('获取参数数据库数据失败');
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchData();
});

// ==========================================
// 统一收敛的快照双态自适应恢复管线
// ==========================================
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

// 卡片一键整组载入
const loadEntireGroupToWorkspace = async (group: any) => {
  try {
    const res: any = await apiClient.get(`/database/projects/${group.id}/parameters`);
    if (!res || res.length === 0) {
      ElMessage.warning(`工程组 [${group.group_name}] 名下暂无可载入分段`);
      return;
    }
    performRestore(res, 'replace');
  } catch (err: any) {
    ElMessage.error('拉取工程分段明细失败: ' + (err.message || err));
  }
};

// 单段载入工作台
const loadSingleToWorkspace = (row: any) => {
  performRestore([row], 'append');
};

// 扁平列表批量载入
const batchLoadFlatRowsToWorkspace = (mode: 'replace' | 'append' = 'replace') => {
  if (selectedRows.value.length === 0) return;
  performRestore(selectedRows.value, mode);
};

// 抽屉批量载入
const batchLoadDrawerRowsToWorkspace = () => {
  if (selectedDrawerRows.value.length === 0) return;
  performRestore(selectedDrawerRows.value, restoreMode.value);
};

// ==========================================
// 下钻抽屉控制
// ==========================================
const openGroupDrawer = async (group: any) => {
  currentActiveGroup.value = group;
  drawerVisible.value = true;
  isDrawerLoading.value = true;
  selectedDrawerRows.value = [];
  try {
    const res: any = await apiClient.get(`/database/projects/${group.id}/parameters`);
    drawerSegments.value = res || [];
  } catch (err: any) {
    ElMessage.error('获取分段明细失败');
    drawerSegments.value = [];
  } finally {
    isDrawerLoading.value = false;
  }
};

const handleDrawerSelectionChange = (val: any[]) => {
  selectedDrawerRows.value = val;
};

const handleSelectionChange = (val: any[]) => {
  selectedRows.value = val;
};

const extractFsFromRow = (row: any): number | null => {
  if (!row.results_json) return null;
  const res = parseJSON(row.results_json);
  return res.original_state?.safety_factor ?? res.critical_state?.final_safety_factor ?? null;
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
    fetchData();
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
    fetchData();
  } catch (err: any) {
    ElMessage.error('上传封面失败: ' + (err.message || err));
  } finally {
    target.value = '';
    currentCoverTargetGroupId.value = null;
  }
};

const captureViewportCover = async (group: any) => {
  // 精准查找当前工作台的 3D Three.js canvas 画布
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
    fetchData();
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
        fetchData();
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
      fetchData();
    } catch (e) { }
  }, '删除分段记录');
};

const deleteDrawerRecord = async (id: number) => {
  authStore.wrapActionWithAuth(async () => {
    try {
      await apiClient.delete(`/database/parameters/${id}`);
      ElMessage.success('分段已移除');
      if (currentActiveGroup.value) {
        openGroupDrawer(currentActiveGroup.value);
      }
      fetchData();
    } catch (e) { }
  }, '删除分段记录');
};

// ==========================================
// 参数对标分析辅助字典与逻辑 (保全历史)
// ==========================================
interface ParamMeta {
  label: string;
  unit: string;
  comment: string;
}

const PARAM_META_DICT: Record<string, ParamMeta> = {
  start_chainage: { label: '分区起点里程', unit: 'm', comment: '隧道工程计算分段的起点里程桩号' },
  end_chainage: { label: '分区终点里程', unit: 'm', comment: '隧道工程计算分段的终点里程桩号' },
  tunnel_type: { label: '隧道类型', unit: '-', comment: '区分单洞(single)或双洞(double)水力与结构计算模式' },
  k_r: { label: '围岩渗透系数', unit: 'm/d', comment: '围岩天然地层水理渗透传导能力' },
  H: { label: '初始地下水头', unit: 'm', comment: '隧道轴线上方初始水头高度' },
  p_mm: { label: '年降雨量', unit: 'mm', comment: '地表降水补给水文指标' },
  r_0: { label: '二衬内半径(r_0)', unit: 'm', comment: '二衬内边界半径' },
  r_s: { label: '二衬外半径(r_s)', unit: 'm', comment: '二次衬砌外轮廓等效半径' },
  r_p: { label: '初支外半径(r_p)', unit: 'm', comment: '喷锚初期支护外等效半径' },
  r_g: { label: '注浆圈外半径(r_g)', unit: 'm', comment: '注浆加固止水圈外边界半径' },
  h_1: { label: '隧道中心埋深', unit: 'm', comment: '隧道中心轴线垂直埋深' },
  concrete_grade: { label: '混凝土标号', unit: '-', comment: '二次衬砌混凝土强度等级' }
};

const getParamMeta = (key: string): ParamMeta => {
  return PARAM_META_DICT[key] || { label: key, unit: '-', comment: '工程自定义扩展参数' };
};

const formatParamValue = (key: string, val: any): string => {
  if (val === undefined || val === null || val === '') return '-';
  if (key === 'tunnel_type') {
    return val === 'single' ? '单洞' : val === 'double' ? '双洞' : String(val);
  }
  return String(val);
};

const compareKeys = computed(() => {
  if (selectedRows.value.length === 0) return [];
  const baseParams = parseJSON(selectedRows.value[0].parameters_json);
  const deprecatedKeys = new Set(['beta2', 'ha', 'rebar_type', 'double_side', 'P_crit', 'c', 'K', 'h', 'r', 'r1', 'r2', 'rg', 'K1', 'K2', 'Kg']);
  return Object.keys(baseParams).filter(k => !deprecatedKeys.has(k)).map(key => ({ key }));
});

const openCompare = () => { compareDrawerVisible.value = true; };
const parseJSON = (jsonStr: string) => { try { return JSON.parse(jsonStr); } catch (e) { return {}; } };
const isDifferent = (key: string) => {
  if (selectedRows.value.length < 2) return false;
  const firstVal = parseJSON(selectedRows.value[0].parameters_json)[key];
  return selectedRows.value.some(row => {
    const rowVal = parseJSON(row.parameters_json)[key];
    return rowVal !== firstVal;
  });
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

.title-section h2 {
  margin: 0;
  font-size: 18px;
  color: var(--el-text-color-primary);
  font-weight: 600;
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
}

.project-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
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

/* 扁平表格视口 */
.flat-table-wrap {
  flex: 1;
  padding: 16px 20px;
  overflow: hidden;
}

/* 下钻抽屉样式 */
.drawer-inner-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.drawer-header-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-light);
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.drawer-span-badge {
  color: var(--el-color-primary);
  font-weight: 500;
  font-size: 13px;
}

.drawer-desc-badge {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  max-width: 400px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.selection-indicator {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.selection-indicator b {
  color: var(--el-color-primary);
}

/* 参数对标分析辅助样式 (字阶 >= 12px 门禁验证) */
.compare-toolbar { margin-bottom: 12px; }
.compare-info-tag { font-size: 13px; padding: 8px 12px; height: auto; line-height: 1.5; }
.diff-highlight {
  color: #f56c6c;
  font-weight: bold;
  background-color: var(--el-color-danger-light-9);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}
.param-name-cell { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.param-label { font-weight: 600; color: var(--el-text-color-primary); font-size: 13px; }
.param-code { font-size: 12px; color: var(--el-text-color-secondary); font-family: monospace; }
.unit-tag { font-size: 12px; padding: 0 4px; height: 20px; line-height: 18px; }
.param-comment { font-size: 12px; color: var(--el-text-color-regular); line-height: 1.4; }
.text-danger { color: var(--el-color-danger) !important; }
.text-secondary { color: var(--el-text-color-secondary); }
</style>