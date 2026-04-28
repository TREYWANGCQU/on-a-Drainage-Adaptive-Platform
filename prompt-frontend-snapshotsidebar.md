最小化修改完善[Dashboard.vue]、[execelIO.ts]、[SnapshotSidebar.vue],实现：
- 参数的批量上传，给出示例excel模板 ，参考[parameterStore.ts]
- 保留[SnapshotSidebar.vue]序列库卡片<main-metrics>的主要计算结果，增加一个状态指示器（如：🟢 已计算、🟡 待计算、🔴 计算失败）
- 支持一键将序列库未计算的快速计算,并同步更新序列库卡片<main-metrics>
- 每个序列库卡可以下载计算结果

# Dashboard.vue
```vue
<template>
  <div class="dashboard-layout">
    <header class="toolbar">
      <div class="title">隧道工程多维协同智能排水自适应平台</div>
      <div class="actions">
        <CaseSelector />
        <el-button type="primary" icon="Upload" @click="handleBatchUpload">多分区 Excel 批量导入</el-button>
        <el-button type="success" icon="VideoPlay" @click="executeCalculation">执行云计算</el-button>
      </div>
    </header>

    <main class="main-content">
      <aside class="left-panel" :class="{ 'is-collapsed': isLeftCollapsed }">
        <ParameterForm v-show="!isLeftCollapsed" />
      </aside>

      <section class="center-panel" ref="centerPanelRef">
        <el-button class="collapse-btn left" @click="isLeftCollapsed = !isLeftCollapsed">
         
        </el-button>
        
        <el-button type="primary" class="fullscreen-btn" icon="FullScreen" @click="toggleFullscreen">
         
          全局放大
        </el-button>

        <el-button class="collapse-btn right" @click="isRightCollapsed = !isRightCollapsed">
         
        </el-button>

        <div class="placeholder-3d">
          <p>WebGL 3D 渲染画布区</p>
          <small>依赖 parameterStore.currentPayload 实时驱动</small>
        </div>
      </section>

      <aside class="right-panel" :class="{ 'is-collapsed': isRightCollapsed }">
        <SnapshotSidebar v-show="!isRightCollapsed" />
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref} from 'vue';

import CaseSelector from '@/components/ui/CaseSelector.vue';
import ParameterForm from '@/components/ui/ParameterForm.vue';
import SnapshotSidebar from '@/components/ui/SnapshotSidebar.vue';
import { useSnapshotStore } from '@/store/snapshotStore';
import { useParameterStore } from '@/store/parameterStore'; // 引入参数 Store
import { calculateDrainage } from '@/api/index'; // 引入计算接口
import { ElMessage } from 'element-plus';

// 新增：布局控制状态与 DOM 引用
const isLeftCollapsed = ref(false);
const isRightCollapsed = ref(false);
const centerPanelRef = ref<HTMLElement | null>(null);

// 新增：3D区域全局放大逻辑 (利用原生 Web Fullscreen API)
const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    centerPanelRef.value?.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
};

const snapshotStore = useSnapshotStore();
const parameterStore = useParameterStore(); // 实例化参数 Store

onMounted(() => {
  // 页面初始化时挂载本地持久化的快照与序列数据
  snapshotStore.loadFromLocal();
});

const executeCalculation = async () => {
  // TODO: 对接 api/index.ts 封装的 Axios Axios 实例发起 POST 请求
  try {
    ElMessage.info('计算指令已发送，等待计算引擎回传数据...');
    
    // 提取当前表单参数
    const payload = parameterStore.currentPayload;
    
    // 发起 POST 请求对接 uvicorn
    const result = await calculateDrainage(payload);
    //console.log('API result:', JSON.stringify(result, null, 2));  // debug输出内容
    // 收到返回值后存档并驱动 3D 渲染
    //snapshotStore.createSnapshot(result);
    snapshotStore.createSnapshot('执行云计算生成节点', result);
    ElMessage.success('计算完成，空间坐标已更新');
  } catch (error) {
    // 网络或业务异常已在 axios 拦截器中抛出 UI 提示，此处捕获以防止 Promise 报错漏报
    console.error('引擎调度异常:', error);
  }
};

const handleBatchUpload = () => {
  // TODO: 调用 excelIO.ts 触发模板上传解析与 snapshotStore.buildSequence
  ElMessage.info('唤起跨分区模板读取逻辑...');
};
</script>

<style scoped>
.dashboard-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}
.toolbar {
  height: 60px;
  background-color: #ffffff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.toolbar .title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}
.toolbar .actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.left-panel {
  width: 550px;
  padding: 20px;
  overflow-y: auto;
  border-right: 1px solid #dcdfe6;
  background: #ffffff;
}
.center-panel {
  flex: 1;
  position: relative;
  background: #2a2a2a; /* 模拟深色 3D 背景 */
}
.placeholder-3d {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #909399;
  text-align: center;
}
.right-panel {
  width: 420px;
  overflow-y: hidden;
}
.left-panel, .right-panel {
  transition: width 0.3s ease, padding 0.3s ease;
}

.is-collapsed {
  width: 0 !important;
  padding: 0 !important;
  border: none !important;
}

.collapse-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  padding: 8px;
}

.collapse-btn.left {
  left: 0;
  border-radius: 0 4px 4px 0;
}

.collapse-btn.right {
  right: 0;
  border-radius: 4px 0 0 4px;
}

.fullscreen-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
}
</style>
```
# excelIO.ts

```ts
// 文件路径: tunnel-drainage-platform\frontend\src\utils\excelIO.ts

import * as XLSX from 'xlsx';
import { useParameterStore } from '../store/parameterStore';
import { useSnapshotStore } from '../store/snapshotStore';

/**
 * 字段映射字典，维护中文表头与 Store 内部状态键的对应关系。
 * 包含跨分区定义的核心字段（起点里程、终点里程）。
 */
const fieldMapping: Record<string, string> = {
  '起点里程': 'start_chainage',
  '终点里程': 'end_chainage',
  '隧道类型': 'tunnel_type',
  '水位等级': 'water_level',
  '渗透系数K': 'K',
  '水头高度h': 'h',
  '降雨量p_mm': 'p_mm',
  '地表径流CN条件': 'cn_condition',
  '土地利用类型': 'land_use',
  '围岩等级': 'grades',
  '等效半径r': 'r',
  '混凝土标号': 'concrete_grade',
  '钢筋类型': 'rebar_type',
  '双洞间距D_spacing': 'D_spacing',
  '中隔墙水头ha': 'ha'
};

// 逆向映射字典（导出时使用）
const reverseFieldMapping: Record<string, string> = Object.fromEntries(
  Object.entries(fieldMapping).map(([key, value]) => [value, key])
);

/**
 * 生成并下载包含标准表头和数据有效性提示的空 Excel 模板
 * @param tunnelType 当前隧道洞型 ('single' | 'double')
 */
export const downloadTemplate = (tunnelType: 'single' | 'double'): void => {
  const store = useParameterStore();
  // 提取对应洞型的默认参数键值，过滤生成所需表头
  const defaultParams = tunnelType === 'single' ? store.singleParams : store.doubleParams;
  const englishKeys = Object.keys(defaultParams);
  
  // 构建中文表头行
  const headers = englishKeys.map(key => reverseFieldMapping[key] || key);
  
  // 构建提示信息行（第二行通常作为填报说明）
  const tipsRow = englishKeys.map(key => {
    if (key === 'start_chainage' || key === 'end_chainage') return '填入数值(如: 1000)';
    if (key === 'tunnel_type') return tunnelType;
    if (key === 'water_level') return 'low 或 high';
    return '请参阅规范填入标准值';
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, tipsRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '导入模板');
  
  XLSX.writeFile(wb, `隧道排水参数导入模板_${tunnelType}.xlsx`);
};

/**
 * 将当前状态机数据导出为 .xlsx 归档
 */
export const exportCurrentData = (): void => {
  const store = useParameterStore();
  const payload = store.currentPayload;
  
  const headers = Object.keys(payload).map(key => reverseFieldMapping[key] || key);
  const dataRow = Object.values(payload);
  
  const ws = XLSX.utils.aoa_to_sheet([headers, dataRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '当前参数存档');
  
  XLSX.writeFile(wb, `隧道排水参数_${payload.start_chainage}-${payload.end_chainage}.xlsx`);
};

/**
 * 拦截 <el-upload> 文件读取，解析二进制 Excel 为 JSON 字典，并自动切片生成快照序列
 * @param file 用户上传的文件对象
 * @param sequenceName 聚合序列名称
 */
export const parseUploadFile = (file: File, sequenceName: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 解析为二维数组，跳过第二行提示说明
        const rawJson: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (rawJson.length <= 2) {
          throw new Error('未检测到有效数据行');
        }

        const headers = rawJson[0];
        const dataRows = rawJson.slice(2);
        
        const snapshotStore = useSnapshotStore();
        const parameterStore = useParameterStore();
        const snapshots = [];

        // 按里程区段自动进行数据切片，依次生成对应的状态字典
        for (const row of dataRows) {
          if (row.length === 0) continue;
          
          const paramsDict: Record<string, any> = {};
          headers.forEach((header: string, index: number) => {
            const engKey = fieldMapping[header] || header;
            paramsDict[engKey] = row[index];
          });

          // 保留原始默认值，用 Excel 数据进行覆写
          const tunnelType = paramsDict['tunnel_type'] || parameterStore.activeTunnelType;
          const baseParams = tunnelType === 'single' 
            ? parameterStore.singleParams 
            : parameterStore.doubleParams;
            
          const mergedParams = { ...baseParams, ...paramsDict };

          // 封装快照对象
          snapshots.push({
            id: `snap_imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            remark: `Excel批量导入: ${mergedParams.start_chainage}-${mergedParams.end_chainage}`,
            start_chainage: Number(mergedParams.start_chainage),
            end_chainage: Number(mergedParams.end_chainage),
            params: mergedParams,
          });
        }

        // 批量封装为快照序列推送到 snapshotStore 存档，支撑 3D 组合拼装
        if (snapshots.length > 0) {
          snapshotStore.buildSequence(sequenceName, snapshots);
          
          // 默认将第一条数据应用到当前表单
          parameterStore.overrideAll(snapshots[0].params, snapshots[0].params.tunnel_type);
        }
        
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('文件读取异常'));
    reader.readAsArrayBuffer(file);
  });
};
```
# SnapshotSide.vue
```vue
<template>
  <div class="snapshot-sidebar">
    <div class="header">
      <h4>工况快照与序列库</h4>
      <el-button type="primary" size="small" @click="handleSaveSnapshot">保存当前快照</el-button>
    </div>

    <el-divider>散列快照 (单体区间)</el-divider>
    <div class="snapshot-list">
      <template v-if="snapshots.length > 0">
        <el-card v-for="snap in snapshots" :key="snap.id" class="snapshot-item" shadow="hover">
          <!-- 可点击区域：仅信息和摘要部分 -->
          <div @click="restoreSnapshot(snap.id)" style="cursor:pointer">
            <div class="snap-info">
              <span class="snap-remark">
                {{ (snap.remark && typeof snap.remark === 'string') ? snap.remark : '系统计算生成快照' }}
              </span>
              <span class="snap-chainage">
                K{{ getChainage(snap, 'start') }} ~ K{{ getChainage(snap, 'end') }}
              </span>
            </div>

            <div class="results-summary" v-if="snap.results">
              <div class="main-metrics">
                <span class="metric-item">原始状态最终水头: <b>{{ snap.results.original_state?.waterHead?.toFixed(2) }}m</b></span>
                <span class="metric-item">原始状态安全系数: <b :class="getFsClass(snap.results.original_state?.safety_factor)">{{
                  snap.results.original_state?.safety_factor?.toFixed(2) }}</b></span>
              </div>
              <div class="res-grid">
                <div class="res-cell">
                  <span class="lbl">环向间距建议设计值</span>
                  <span class="val">{{ getRec(snap, 'ring_spacing_recommend')?.toFixed(2) || '-' }} m</span>
                </div>
                <div class="res-cell">
                  <span class="lbl">环向孔径议设计值</span>
                  <span class="val">{{ (getRec(snap, 'ring_diam_recommend') * 1000).toFixed(0) || '-' }} mm</span>
                </div>
                <div class="res-cell">
                  <span class="lbl">渗漏量 Q</span>
                  <span class="val">{{ getRec(snap, 'Q')?.toFixed(2) || '-' }} m³/d</span>
                </div>
                <div class="res-cell">
                  <span class="lbl">计算状态</span>
                  <span class="val-tag">{{ snap.results.critical_state ? '需降压' : '安全' }}</span>
                </div>
              </div>
               <div class="main-metric critical-metrics" v-if="snap.results.critical_state">
                  <span class="metric-item">临界状态最终水头: <b class="text-danger">{{ snap.results.critical_state?.final_waterHead?.toFixed(2) }}m</b></span>
  <span class="metric-item">临界状态安全系数: <b :class="getFsClass(snap.results.critical_state?.final_safety_factor)">{{
    snap.results.critical_state?.final_safety_factor?.toFixed(2) }}</b></span>
               
              </div>
              <div class="res-grid critical-rec-grid" v-if="snap.results.critical_state">
                <div class="res-cell">
                  <span class="lbl">临界环向间距建议设计值</span>
                  <span class="val">{{ getRec(snap, 'ring_spacing_recommend')?.toFixed(2) || '-' }} m</span>
                </div>
                <div class="res-cell">
                  <span class="lbl">临界环向孔径议设计值</span>
                  <span class="val">{{ (getRec(snap, 'ring_diam_recommend') * 1000).toFixed(0) || '-' }} mm</span>
                </div>
                <div class="res-cell">
                  <span class="lbl">临界渗漏量 Q</span>
                  <span class="val">{{ getRec(snap, 'Q')?.toFixed(2) || '-' }} m³/d</span>
                </div>
                
              </div>
            </div>
          </div>

          <!-- 底栏：独立于点击区域之外，按钮事件不再有冒泡竞争 -->
          <div class="snap-meta">
            <span class="time">{{ formatTime(snap.timestamp) }}</span>
            <div class="actions-btn">
              <el-button type="primary" link :icon="Download" :disabled="!snap.results?.original_state"
                @click="handleDownloadRaw(snap)">结果</el-button>
              <el-button type="danger" link @click="handleDeleteSnapshot(snap.id)">删除</el-button>
            </div>
          </div>
        </el-card>
      </template>
      <el-empty v-else description="暂无散列快照" :image-size="60" />
    </div>

    <el-divider>批量导入序列 (全段组装)</el-divider>
    <div class="sequence-list">
      <template v-if="sequences.length > 0">
        <el-collapse accordion>
          <el-collapse-item v-for="seq in sequences" :key="seq.sequenceId"
            :title="`${seq.sequenceName} (${seq.snapshots.length} 个分段)`">
            <el-button size="small" type="success" plain class="w-100">
              载入3D全段模型
            </el-button>
          </el-collapse-item>
        </el-collapse>
      </template>
      <el-empty v-else description="暂无批量导入序列" :image-size="60" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSnapshotStore } from '@/store/snapshotStore';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download } from '@element-plus/icons-vue'; // 新增引入 Download 图标

const snapshotStore = useSnapshotStore();
const snapshots = computed(() => snapshotStore.snapshots);
const sequences = computed(() => snapshotStore.sequences);

// 辅助函数：安全获取里程
const getChainage = (snap: any, type: 'start' | 'end') => {
  const key = type === 'start' ? 'start_chainage' : 'end_chainage';
  // 修正：从根节点读取基础快照记录，防回退失败
  return snap.results?.input_parameter?.[key] ?? snap[key] ?? '0';
};

// 辅助函数：获取推荐值（在临界状态和原始状态间切换）
const getRec = (snap: any, key: string) => {
  if (!snap.results) return null;
  return snap.results.critical_state?.[key] ?? snap.results.original_state?.[key];
};

// 辅助函数：根据安全系数返回颜色类名
const getFsClass = (fs: number) => {
  return fs < 2.0 ? 'text-danger' : 'text-success'; // 假设 2.0 为容许值
};


// 下载原始计算结果为 JSON
const handleDownloadRaw = (snap: any) => {
  // 修正：增加数据空层级拦截，防止点击穿透
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
  document.body.appendChild(link);  // ✅ 挂载到 DOM 以支持 Firefox 等浏览器，不然无法触发下载
  link.click();
  document.body.removeChild(link);  // ✅ 立即清理 URL 对象，释放内存
  URL.revokeObjectURL(url);
  ElMessage.success('原始计算数据已准备下载');
};
const handleSaveSnapshot = () => {
  ElMessageBox.prompt('请输入该工况快照的备注说明', '保存快照', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
  }).then(({ value }) => {
    // 调用 Store 行动，当前设计已在 Store 内部封装了深拷贝逻辑与结果绑定
    snapshotStore.createSnapshot(value);
    ElMessage.success('工况参数快照保存成功');
  }).catch(() => { });
};

const restoreSnapshot = (id: string) => {
  snapshotStore.applySnapshot(id);
  ElMessage.info('已回溯至选定快照工况，参数已覆盖');
};

const formatTime = (ts: number) => {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
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
  padding: 16px;
  height: 100%;
  border-left: 1px solid #dcdfe6;
  background: #f5f7fa;
  overflow-y: auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.snapshot-list,
.sequence-list {
  min-height: 140px;
  margin-bottom: 24px;
}

:deep(.el-divider__text) {
  color: #606266;
  font-weight: bold;
  background-color: #f5f7fa;
  /* 与侧边栏背景色保持一致，避免文字背景突兀 */
  text-align: center;
  /* 确保多行文本居中对齐 */
  line-height: 1.4;
  /* 调整多行间距 */
  white-space: normal;
  /* 覆盖默认的 nowrap，允许优雅换行 */
  max-width: 85%;
  /* 预留两侧横线空间，防止文字顶满 */
}

.snapshot-item {
  margin-bottom: 10px;
  cursor: pointer;
  transition: all 0.3s;
}

.snapshot-item:hover {
  border-color: #409eff;
}

.snap-info {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 8px;
  font-weight: bold;
}

/* 新增：结果摘要网格样式 */
.results-summary {
  background: #fdfdfd;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 10px;
}

.res-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.res-cell {
  display: flex;
  flex-direction: column;
}

.res-cell .lbl {
  font-size: 10px;
  color: #909399;
}

.res-cell .val {
  font-size: 12px;
  color: #409eff;
  font-weight: bold;
}

.snap-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #909399;
}

.actions-btn {
  display: flex;
  align-items: center;
  gap: 4px;
}

:deep(.el-divider__text) {
  color: #606266;
  font-weight: bold;
  background-color: #f5f7fa;
  text-align: center;
  line-height: 1.4;
  white-space: normal;
  max-width: 85%;
}

.w-100 {
  width: 100%;
  margin-top: 8px;
}

.main-metrics {
  display: flex;
  justify-content: space-between;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px dashed #ebeef5;
  font-size: 11px;
  color: #606266;
}

.val-tag {
  font-size: 11px;
  color: #909399;
  font-style: italic;
}

.text-danger {
  color: #f56c6c;
}

.critical-rec-grid {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #fde2e2;
}
.critical-metrics {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed #fde2e2;
}
.critical-rec-grid .val {
  color: #f56c6c;
}

.text-success {
  color: #67c23a;
}
</style>
```
# parameterStore.ts
```ts
import { defineStore } from 'pinia';
import { S } from 'vue-router/dist/router-CWoNjPRp.mjs';

// --- 类型定义 ---
// 提取 13 个高级设置默认参数作为公共基础接口
interface AdvancedParams {
  as_mm: number;
  gamma: number;
  n_long: number;
  n_ring: number;
  I_ring: number;
  n_lat: number;
  I_lat: number;
  S_code_max: number;
  S_min: number;
  d_ring_default: number;
  d_long_default: number;
  d_lat_default: number;
  tol_safety_factor: number;
}

// 单洞参数结构 (25个参数)
export interface SingleTubeParams extends AdvancedParams {
  tunnel_type: 'single';
  K: number; h: number; p_mm: number; Kg: number; K1: number; K2: number;
  cn_condition: string; land_use: string; grades: number;
  r: number; r1: number; r2: number; rg: number; c: number; aspect_ratio: number;
  start_chainage: number; end_chainage: number; // 分区里程
  concrete_grade: string; rebar_type: string; Ag: number;
  beta2: number;  P_crit: number;
  I_long: number; double_side: boolean;
}

// 双洞参数结构 (27个参数)
export interface DoubleTubeParams extends AdvancedParams {
  tunnel_type: 'double';
  K: number; h: number; ha: number; p_mm: number; Kg: number; K1: number; K2: number;
  cn_condition: string; land_use: string; grades: number; 
  r: number; r1: number; r2: number; rg: number; c: number; aspect_ratio:number;
  start_chainage: number; end_chainage: number; // 分区里程
  concrete_grade: string; rebar_type: string; Ag: number;
  D_spacing: number; beta2: number; P_crit: number;
  I_long: number; double_side: boolean;
}

// 统一的默认高级参数对象（规范推荐值/经验值）
const defaultAdvancedSettings = {
  as_mm: 50.0,
  gamma: 10.0,
  n_long: 0.012,
  n_ring: 0.012,
  I_ring: 0.73,
  n_lat: 0.012,
  I_lat: 0.01,
  S_code_max: 10.0,
  S_min: 3.0,
  d_ring_default: 0.050,
  d_long_default: 0.100,
  d_lat_default: 0.080,
  tol_safety_factor: 2.0
};

export const useParameterStore = defineStore('parameter', {
  state: () => ({
    // 当前激活的隧道类型
    activeTunnelType: 'single' as 'single' | 'double',
    
    // 单洞状态机初始化
    singleParams: {
      tunnel_type: 'single',
      K: 0, h: 0, p_mm: 0, Kg: 0, K1: 0, K2: 0,
      cn_condition: '灌溉良好', land_use: '林地', grades: 3,
      r: 0, r1: 0, r2: 0, rg: 0, c: 0, aspect_ratio: 0.7,
      start_chainage: 0, end_chainage: 0,
      concrete_grade: 'C30', rebar_type: 'HRB400', Ag: 0,
      beta2: 1.0, P_crit: 0.0,
      I_long: 0.02, double_side: true,
      ...defaultAdvancedSettings
    } as SingleTubeParams,

    // 双洞状态机初始化
    doubleParams: {
      tunnel_type: 'double',
      K: 0, h: 0, ha: 0, p_mm: 0, Kg: 0, K1: 0, K2: 0,
      cn_condition: '灌溉良好', land_use: '林地', grades: 3,
      r: 0, r1: 0, r2: 0, rg: 0, c: 0,
      start_chainage: 0, end_chainage: 0,
      concrete_grade: 'C30', rebar_type: 'HRB400', Ag: 0,
      D_spacing: 0, beta2: 1.0,  P_crit: 0.0,
      I_long: 0.02, double_side: true,
      ...defaultAdvancedSettings
    } as DoubleTubeParams
  }),

  getters: {
    // 获取当前计算所需的完整负荷数据
    currentPayload: (state) => {
      return state.activeTunnelType === 'single' ? state.singleParams : state.doubleParams;
    }
  },

  actions: {
    // 单字段更新，支持表单双向绑定与精确修改
    updateParam<K extends keyof SingleTubeParams | keyof DoubleTubeParams>(key: K, value: any) {
      if (this.activeTunnelType === 'single') {
        (this.singleParams as any)[key] = value;
      } else {
        (this.doubleParams as any)[key] = value;
      }
    },

    // 全量覆写，适用于案例库加载、快照回溯与 Excel 批量导入映射
    overrideAll(data: any, type: 'single' | 'double' = 'single') {
      this.activeTunnelType = type;
      if (type === 'single') {
        this.singleParams = { ...this.singleParams, ...data };
      } else {
        this.doubleParams = { ...this.doubleParams, ...data };
      }
    },

    // 切换当前洞型
    switchTunnelType(type: 'single' | 'double') {
      this.activeTunnelType = type;
    }
  }
});
```