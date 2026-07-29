<!-- frontend/src/views/ParameterDatabase.vue -->
<!-- 注意：此文件现在作为子组件被 Dashboard 调用 -->
<template>
  <div class="db-container">
    <div class="header-toolbar">
      <h2>隧道工程参数台账管理中心</h2>
      <div class="filter-group">
        <el-input v-model="searchQuery" placeholder="检索工程命名..." style="width: 240px" clearable />
        <el-select v-model="filterClass" placeholder="全部工程分类" clearable style="width: 150px">
          <!-- ...保持原有选项不变... -->
          <el-option label="城市道路" value="城市道路" />
          <el-option label="城市轨道" value="城市轨道" />
          <el-option label="公路" value="公路" />
          <el-option label="铁路" value="铁路" />
          <el-option label="水工" value="水工" />
          <el-option label="综合管廊" value="综合管廊" />
          <el-option label="其他" value="其他" />
        </el-select>
        <el-button type="primary" @click="fetchData" icon="Search">查询</el-button>
        <el-button type="warning" @click="openCompare" :disabled="selectedRows.length < 2">
          对标分析 (需勾选≥2项)
        </el-button>
      </div>
    </div>

    <!-- 数据表格台账 -->
    <el-table 
      :data="filteredData" 
      v-loading="isLoading" 
      border 
      stripe 
      @selection-change="handleSelectionChange"
      style="width: 100%; height: calc(100vh - 200px);"
    >
      <!-- ...保持原有表格列不变... -->
      <el-table-column type="selection" width="50" align="center" />
      <el-table-column prop="id" label="资产ID" width="80" align="center" />
      <el-table-column prop="project_name" label="工程命名" min-width="200" show-overflow-tooltip />
      <el-table-column prop="tunnel_type" label="工程分类" width="120" align="center">
        <template #default="scope">
          <el-tag :type="getTagType(scope.row.tunnel_type)" effect="dark">{{ scope.row.tunnel_type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="计算类型" width="100" align="center">
        <template #default="scope">
          {{ parseJSON(scope.row.parameters_json).tunnel_type === 'single' ? '单洞' : '双洞' }}
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="入库时间" width="180" align="center">
        <template #default="scope">
          {{ new Date(scope.row.created_at).toLocaleString() }}
        </template>
      </el-table-column>
      
      <el-table-column label="操作" width="220" fixed="right" align="center">
        <template #default="scope">
          <el-button size="small" type="primary" plain @click="loadToWorkspace(scope.row)">
            载入工作台
          </el-button>
          <el-button size="small" type="danger" link @click="deleteRecord(scope.row.id)">
            移除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 参数对标分析抽屉 -->
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
import { useParameterStore } from '@/store/parameterStore';
import { ElMessage, ElMessageBox } from 'element-plus';
import apiClient from '@/api/index'; // [修改] 引入已封装的 axios 实例

// [新增] 声明抛出事件，用于关闭父组件弹窗
const emit = defineEmits(['close']);
const paramStore = useParameterStore();

// ...保持原有 ref 状态不变...
const dbData = ref<any[]>([]);
const isLoading = ref(false);
const searchQuery = ref('');
const filterClass = ref('');
const selectedRows = ref<any[]>([]);
const compareDrawerVisible = ref(false);

interface ParamMeta {
  label: string;
  unit: string;
  comment: string;
}

// 各参数项元数据及简单注释说明字典（覆盖全部 39 项工程及水力学参数）
const PARAM_META_DICT: Record<string, ParamMeta> = {
  // 1. 定位与隧道标识
  start_chainage: { label: '分区起点里程', unit: 'm', comment: '隧道工程计算分段的起点里程桩号' },
  end_chainage: { label: '分区终点里程', unit: 'm', comment: '隧道工程计算分段的终点里程桩号' },
  tunnel_type: { label: '隧道类型', unit: '-', comment: '区分单洞(single)或双洞(double)隧道水力与结构计算模式' },

  // 2. 水文与地质参数
  K: { label: '岩体渗透系数', unit: 'm/d', comment: '围岩天然地层水理渗透传导能力，决定地下水渗流补给速率' },
  k_r: { label: '围岩渗透系数', unit: 'm/d', comment: '标准别名(k_r)，围岩天然地层水理渗透传导能力' },
  h: { label: '初始地下水头', unit: 'm', comment: '隧道轴线上方未受开挖扰动的初始水头高度' },
  H: { label: '初始地下水头(H)', unit: 'm', comment: '标准别名(H)，初始地下水头高度' },
  ha: { label: '下边界水头', unit: 'm', comment: '双洞结构下方含水层边界水头（双洞模式特有，单洞模式下取0）' },
  p_mm: { label: '年降雨量', unit: 'mm', comment: '工程所在区域地表降水补给水文指标' },
  cn_condition: { label: '灌溉条件', unit: '-', comment: '地表农业灌溉水补给条件（SCS-CN查表依据：灌溉良好/灌溉较差）' },
  land_use: { label: '土地利用类型', unit: '-', comment: '地表覆盖类型及生态环境敏感度划分（SCS-CN查表依据）' },
  grades: { label: '围岩等级', unit: '级', comment: '按国标划分的围岩质量与岩体完整性等级（Ⅰ~Ⅵ级，如4代表Ⅳ级）' },
  gamma: { label: '水的重度', unit: 'kN/m³', comment: '地下水介质物理容重常数（标准物理常数，默认10.0 kN/m³）' },

  // 3. 防排水与衬砌渗透系数
  Kg: { label: '注浆圈渗透系数', unit: 'm/d', comment: '围岩注浆加固止水圈防渗隔水性能' },
  k_g: { label: '注浆圈渗透系数', unit: 'm/d', comment: '标准别名(k_g)，注浆加固止水圈渗透参数' },
  K1: { label: '初期支护渗透系数', unit: 'm/d', comment: '喷射混凝土初支结构的渗透传导系数' },
  k_p: { label: '初支渗透系数', unit: 'm/d', comment: '标准别名(k_p)，喷射混凝土初支渗透参数' },
  K2: { label: '二次衬砌渗透系数', unit: 'm/d', comment: '模筑混凝土二衬结构的防渗抗渗能力' },
  k_s: { label: '二衬渗透系数', unit: 'm/d', comment: '标准别名(k_s)，模筑混凝土二衬渗透参数' },

  // 4. 断面结构与几何尺寸参数
  r: { label: '隧道等效内半径', unit: 'm', comment: '隧道内部开挖净空截面的等效圆半径' },
  r_0: { label: '二衬内半径(r_0)', unit: 'm', comment: '标准别名(r_0)，二衬内边界半径' },
  r1: { label: '二衬外半径', unit: 'm', comment: '二次衬砌外轮廓与初支交界面的等效半径' },
  r_s: { label: '二衬外半径(r_s)', unit: 'm', comment: '标准别名(r_s)，二衬外边界半径' },
  r2: { label: '初支外半径', unit: 'm', comment: '初期支护外轮廓与注浆圈交界面的等效半径' },
  r_p: { label: '初支外半径(r_p)', unit: 'm', comment: '标准别名(r_p)，初支外边界半径' },
  rg: { label: '注浆圈外半径', unit: 'm', comment: '注浆加固止水圈外边界的等效半径' },
  r_g: { label: '注浆圈外半径(r_g)', unit: 'm', comment: '标准别名(r_g)，注浆加固圈外边界半径' },
  c: { label: '隧道埋深', unit: 'm', comment: '隧道轴线距离地表垂直深度' },
  h_1: { label: '隧道中心埋深(h_1)', unit: 'm', comment: '标准别名(h_1)，隧道中心垂直埋深' },
  aspect_ratio: { label: '隧道高宽比', unit: '-', comment: '隧道断面高度与宽度之比例系数 (仅3D视口建模使用)' },
  D_spacing: { label: '双洞中心间距', unit: 'm', comment: '双洞隧道两洞心轴线间的水平距离（双洞特有，单洞模式下取0）' },

  // 5. 材料与结构配筋参数
  concrete_grade: { label: '混凝土标号', unit: '-', comment: '二次衬砌混凝土抗压强度等级（如C35、C40）' },
  rebar_type: { label: '钢筋类型', unit: '-', comment: '衬砌结构主筋材料屈服强度等级（物理引擎统一HRB400）' },
  Ag: { label: '配筋面积', unit: 'mm²', comment: '衬砌截面单位长度主筋截面积' },
  as_mm: { label: '钢筋保护层厚度', unit: 'mm', comment: '衬砌主筋外侧混凝土保护层厚度（默认50mm）' },
  P_crit: { label: '临界控制水压力', unit: 'kPa', comment: '衬砌结构所能安全承载的最大水压力上限' },
  tol_safety_factor: { label: '容许安全系数', unit: '-', comment: '衬砌结构承载能力极限状态安全储备指标（默认2.0）' },

  // 6. 排水管网与水力学参数 (曼宁粗糙度、坡降与管径)
  I_long: { label: '纵向管水力坡降', unit: '-', comment: '隧道纵向排水主管沿程水力坡降率' },
  n_long: { label: '纵向管曼宁粗糙度', unit: '-', comment: '纵向排水主管管内壁曼宁粗糙系数（决定纵向水流阻力与排泄流速，默认0.012）' },
  d_long_default: { label: '纵向管默认内径', unit: 'm', comment: '纵向排水主管标准管径设计值（默认0.10m即100mm）' },
  n_ring: { label: '环向管曼宁粗糙度', unit: '-', comment: '环向排水盲管管内壁曼宁粗糙系数（决定环向集水引流效率，默认0.012）' },
  I_ring: { label: '环向管水力坡降', unit: '-', comment: '环向排水盲管环向沿程水力坡降率（默认0.73）' },
  d_ring_default: { label: '环向管默认内径', unit: 'm', comment: '环向排水盲管标准管径设计值（默认0.05m即50mm）' },
  n_lat: { label: '横向管曼宁粗糙度', unit: '-', comment: '横向排水引水管内壁曼宁粗糙系数（决定横向泄水能力，默认0.012）' },
  I_lat: { label: '横向管水力坡降', unit: '-', comment: '横向排水引水管沿程水力坡降率（默认0.01）' },
  d_lat_default: { label: '横向管默认内径', unit: 'm', comment: '横向排水引水管标准管径设计值（默认0.08m即80mm）' },
  S_code_max: { label: '规范最大盲管间距', unit: 'm', comment: '工程规范规定的环向盲管最大允许安装间距上限（默认10m）' },
  S_min: { label: '工程最小盲管间距', unit: 'm', comment: '施工工艺限制的盲管最小安装间距下限（默认3m）' },
  double_side: { label: '是否双侧排水', unit: '-', comment: '排水系统配置（双侧排水 / 单侧排水）' }
};

const getParamMeta = (key: string): ParamMeta => {
  return PARAM_META_DICT[key] || { label: key, unit: '-', comment: '工程自定义扩展参数' };
};

const formatParamValue = (key: string, val: any): string => {
  if (val === undefined || val === null || val === '') return '-';
  if (key === 'tunnel_type') {
    return val === 'single' ? '单洞' : val === 'double' ? '双洞' : String(val);
  }
  if (key === 'double_side') {
    return val ? '双侧排水' : '单侧排水';
  }
  return String(val);
};

const compareKeys = computed(() => {
  if (selectedRows.value.length === 0) return [];
  // 提取第一个勾选项的所有 Key 作为基准目录，并清洗废弃字段
  const baseParams = parseJSON(selectedRows.value[0].parameters_json);
  return Object.keys(baseParams)
    .filter(key => key !== 'beta2')
    .map(key => ({ key }));
});

const fetchData = async () => {
  isLoading.value = true;
  try {
    // [修改] 使用 apiClient，剥离重复的前缀，直接接收拦截器返回的 data 数组
    const res: any = await apiClient.get('/database/parameters');
    dbData.value = res || []; 
  } catch (error) {
    ElMessage.error('数据库通讯失败');
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => { fetchData(); });

const filteredData = computed(() => {
  return dbData.value.filter(item => {
    const matchName = item.project_name.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchClass = filterClass.value ? item.tunnel_type === filterClass.value : true;
    return matchName && matchClass;
  });
});

const handleSelectionChange = (val: any[]) => { selectedRows.value = val; };

// [修改] 载入参数后，触发 close 事件关闭弹窗，而不是跳转路由
const loadToWorkspace = (row: any) => {
  const parsedParams = parseJSON(row.parameters_json);
  const parsedResults = row.results_json ? parseJSON(row.results_json) : null;
  paramStore.overrideAll(parsedParams, parsedParams.tunnel_type, parsedResults);
  ElMessage.success(`已将 [${row.project_name}] 载入当前计算引擎`);
  emit('close'); // 通知 Dashboard 关闭弹窗
};

const deleteRecord = async (id: number) => {
  try {
    await ElMessageBox.confirm('数据删除后不可恢复，是否继续？', '风险提示', { type: 'warning' });
    // [修改] 使用 apiClient，剥离重复的前缀
    await apiClient.delete(`/database/parameters/${id}`);
    ElMessage.success('清理成功');
    fetchData();
  } catch (e) { /* 取消操作 */ }
};

const openCompare = () => { compareDrawerVisible.value = true; };
const parseJSON = (jsonStr: string) => { try { return JSON.parse(jsonStr); } catch (e) { return {}; } };
const isDifferent = (key: string) => {
  if (selectedRows.value.length < 2) return false;
  const firstVal = parseJSON(selectedRows.value[0].parameters_json)[key];
  return selectedRows.value.some(row => parseJSON(row.parameters_json)[key] !== firstVal);
};
const getTagType = (type: string) => {
  const map: Record<string, string> = { '城市道路': 'primary', '公路': 'success', '水工': 'info', '综合管廊': 'warning' };
  return map[type] || 'default';
};
</script>

<style scoped>
/* 移除多余的边距，适配弹窗环境 */
.db-container {
  background-color: var(--el-bg-color-page);
  height: 100%;
}

/* [新增] 穿透重写 el-table 的内部独立变量，消除末行与底部的白块 */
:deep(.el-table) {
  --el-table-bg-color: var(--el-bg-color-page);
  --el-table-tr-bg-color: var(--el-bg-color-page);
  --el-table-header-bg-color: var(--el-bg-color-overlay);
  --el-table-row-hover-bg-color: var(--el-border-color-lighter); /* 优化悬浮对比度 */
  --el-table-border-color: var(--el-border-color-light);
  --el-table-text-color: var(--el-text-color-primary); /* 修复文字可能偏暗的问题 */
  --el-table-header-text-color: var(--el-text-color-regular);
  --el-table-stripe-bg-color: var(--el-bg-color-overlay); /* [关键] 修复 stripe 斑马纹的白块 */
  background-color: var(--el-bg-color-page) !important;
}

/* [新增] 强制提高权重，解决末行留白、斑马纹、Hover的顽固背景色 */
:deep(.el-table__empty-block) {
  background-color: var(--el-bg-color-page) !important;
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background-color: var(--el-table-stripe-bg-color) !important;
}

:deep(.el-table tbody tr:hover > td.el-table__cell) {
  background-color: var(--el-table-row-hover-bg-color) !important;
}

/* 修复 Element Plus 表格底部原生的一像素白线伪元素 */
:deep(.el-table__inner-wrapper::before) {
  background-color: var(--el-border-color-light);
}

.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}
.header-toolbar h2 {
  margin: 0;
  font-size: 18px;
  color: var(--el-text-color-primary);
}
.filter-group { display: flex; gap: 12px; }
.diff-highlight {
  color: #f56c6c;
  font-weight: bold;
  background-color: var(--el-color-danger-light-9);
  padding: 2px 6px;
  border-radius: 4px;
}

.compare-toolbar {
  margin-bottom: 12px;
}
.compare-info-tag {
  font-size: 13px;
  padding: 8px 12px;
  height: auto;
  line-height: 1.5;
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
}
.param-code {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}
.unit-tag {
  font-size: 11px;
  padding: 0 4px;
  height: 18px;
  line-height: 16px;
}
.param-comment {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
}
</style>