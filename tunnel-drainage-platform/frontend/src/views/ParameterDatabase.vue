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
    <el-drawer v-model="compareDrawerVisible" title="工程参数多维对标分析" size="70%" append-to-body>
      <!-- ...保持原有对比抽屉代码不变... -->
      <el-table :data="compareKeys" border size="small">
        <el-table-column prop="key" label="参数项 / 工程" width="150" fixed="left" />
        <el-table-column v-for="row in selectedRows" :key="row.id" :label="row.project_name" align="center">
          <template #default="scope">
            <span :class="{'diff-highlight': isDifferent(scope.row.key)}">
              {{ parseJSON(row.parameters_json)[scope.row.key] ?? '-' }}
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

const compareKeys = computed(() => {
  if (selectedRows.value.length === 0) return [];
  // 提取第一个勾选项的所有 Key 作为基准目录
  const baseParams = parseJSON(selectedRows.value[0].parameters_json);
  return Object.keys(baseParams).map(key => ({ key }));
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
  paramStore.overrideAll(parsedParams, parsedParams.tunnel_type);
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
</style>