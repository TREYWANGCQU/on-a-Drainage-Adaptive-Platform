<template>
  <div class="snapshot-sidebar">
    <div class="header">
      <h4>工况快照与序列库</h4>
      <div class="header-actions">
        <el-button type="warning" size="small" plain @click="handleRefresh3D">🔄 刷新3D区</el-button>
        <el-button type="success" size="small" plain @click="quickCalculatePending">⚡ 一键计算</el-button>
        <el-button type="primary" size="small" @click="handleSaveSnapshot">保存当前快照</el-button>
      </div>
    </div>

    <el-divider>散列快照</el-divider>
    <div class="snapshot-list">
      <template v-if="snapshots.length > 0">
        <el-card v-for="snap in snapshots" :key="snap.id" class="snapshot-item" shadow="hover">
          
          <div @click="restoreSnapshot(snap.id)" style="cursor:pointer">
            <div class="snap-info">
              <div class="title-with-status">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <el-checkbox v-model="snap.selectedFor3D" @click.stop />
                <span class="snap-remark">
                  {{ (snap.remark && typeof snap.remark === 'string') ? snap.remark : '系统计算生成快照' }}
                </span>
                </div>
                <el-tag :type="getStatusTag(snap)" size="small" effect="light">
                  {{ snap.status === 'done' || snap.results ? '🟢 已计算' : snap.status === 'error' ? '🔴 失败' : '🟡 待计算' }}
                </el-tag>
              </div>
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
                  <span class="val">{{ getOrigMetric(snap, 'ring_spacing_recommend')?.toFixed(2) || '-' }} m</span>
                </div>
                <div class="res-cell">
                  <span class="lbl">环向孔径建议设计值</span>
                  <span class="val">{{ getOrigMetric(snap, 'ring_diam_recommend') != null ? (getOrigMetric(snap, 'ring_diam_recommend') * 1000).toFixed(0) : '-' }} mm</span>
                </div>
                <div class="res-cell">
                  <span class="lbl">横向管径建议设计值</span>
                  <span class="val">{{ getOrigMetric(snap, 'lateral_diam_recommend') != null ? (getOrigMetric(snap, 'lateral_diam_recommend') * 1000).toFixed(0) : '-' }} mm</span>
                </div>
                <div class="res-cell">
                  <span class="lbl">分区总涌水量 Q</span>
                  <span class="val">{{ (getOrigMetric(snap, 'Q') ?? snap.results.original_state?.q_drain)?.toFixed(2) || '-' }} m³/d</span>
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
                  <span class="val">{{ getCritMetric(snap, 'ring_spacing_recommend')?.toFixed(2) || '-' }} m</span>
                </div>
                <div class="res-cell">
                  <span class="lbl">临界环向孔径建议设计值</span>
                  <span class="val">{{ getCritMetric(snap, 'ring_diam_recommend') != null ? (getCritMetric(snap, 'ring_diam_recommend') * 1000).toFixed(0) : '-' }} mm</span>
                </div>
                <div class="res-cell">
                  <span class="lbl">临界横向管径建议设计值</span>
                  <span class="val">{{ getCritMetric(snap, 'lateral_diam_recommend') != null ? (getCritMetric(snap, 'lateral_diam_recommend') * 1000).toFixed(0) : '-' }} mm</span>
                </div>
                <div class="res-cell">
                  <span class="lbl">分区总涌水量 Q</span>
                  <span class="val">{{ (getCritMetric(snap, 'Q') ?? snap.results.critical_state?.final_Q)?.toFixed(2) || '-' }} m³/d</span>
                </div>
              </div>
            </div>
            
            <div class="results-summary pending-box" v-else>
              <span style="color: #909399; font-size: 12px;">待接入引擎计算...</span>
            </div>

          </div>

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
      <el-empty v-else description="暂无记录，请计算或导入" :image-size="60" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSnapshotStore } from '@/store/snapshotStore';
import { calculateDrainage } from '@/api/index'; // 引入计算接口
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import { useParameterStore } from '@/store/parameterStore'; // [新增引入]


const snapshotStore = useSnapshotStore();
const parameterStore = useParameterStore(); // [新增实例化]
const snapshots = computed(() => snapshotStore.snapshots);

// 安全获取里程：增加对 snap.params 的向下兼容读取，修复导入无显示的 Bug
const getChainage = (snap: any, type: 'start' | 'end') => {
  const key = type === 'start' ? 'start_chainage' : 'end_chainage';
  return snap.results?.input_parameter?.[key] ?? snap.params?.[key] ?? snap[key] ?? '0';
};



// 提取原始状态指标
const getOrigMetric = (snap: any, key: string) => {
  if (!snap.results) return null;
  const orig = snap.results.original_state;
  return orig?.[key] ?? snap.results?.input_parameter?.[key] ?? null;
};

// 提取临界状态指标
const getCritMetric = (snap: any, key: string) => {
  if (!snap.results || !snap.results.critical_state) return null;
  const crit = snap.results.critical_state;
  return crit?.[key] ?? null;
};

const getFsClass = (fs: number) => {
  return fs < 2.0 ? 'text-danger' : 'text-success';
};

// 状态标签色彩映射
const getStatusTag = (snap: any) => {
  if (snap.status === 'done' || snap.results) return 'success';
  if (snap.status === 'error') return 'danger';
  return 'warning';
};

// 全局一键调度：遍历提取未计算的快照执行请求
const quickCalculatePending = async () => {
  const pendingSnaps = snapshots.value.filter((s: any) => !s.results || s.status === 'pending');
  if (pendingSnaps.length === 0) {
    ElMessage.success('序列库中暂无需要计算的工况');
    return;
  }

  ElMessage.info(`开始执行并发计算，共调度 ${pendingSnaps.length} 个区间...`);
  
  for (const snap of pendingSnaps) {
    try {
      // 提取被封装在 params 字典中的计算荷载
      const payload = snap.params || {}; 
      const res = await calculateDrainage(payload);
      
      // 更新状态机与结果映射，直接驱动视图更新
      snap.results = res;
      snap.status = 'done';
    } catch (error) {
      console.error(`区间 ${snap.remark} 计算中断:`, error);
      snap.status = 'error';
    }
  }
  
  // 批量计算结束后执行一次持久化落盘
  snapshotStore.saveToLocal();
  ElMessage.success('全序列调度执行完毕');
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

// 下发3D区状态重组及刷新变动通知
const handleRefresh3D = () => {
  parameterStore.isDirty = false;
  snapshotStore.refresh3DTrigger = (snapshotStore.refresh3DTrigger || 0) + 1;
  ElMessage.success('3D 空间隧道计算结果已重新装配');
};

const restoreSnapshot = (id: string) => {
  // 调用快照库恢复逻辑
  snapshotStore.applySnapshot(id);
  
  // 调整脏数据判别：加载历史参数或导入未计算快照时不触发脏数据拦截，将状态重置为干净(false)
  const snap = snapshots.value.find((s: any) => s.id === id);
  parameterStore.isDirty = false; 
  if (!snap || !snap.results) {
     
     ElMessage.warning('已加载历史参数，但该参数缺乏计算成果，请执行云计算');
  } else {
     ElMessage.info('已回溯至选定快照工况，参数与空间结果已同步覆盖');
  }
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
  border-left: 1px solid var(--sys-border); /* [修改] */
  background: var(--sys-bg-panel); /* [修改] */
  overflow-y: auto;
}

.header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 16px;
}

.header h4 {
  margin: 0;
  font-size: 15px;
  color: var(--el-text-color-primary);
}

.header-actions {
  display: flex;
  width: 100%;
  gap: 6px;
  justify-content: space-between;
}

.header-actions .el-button {
  flex: 1;
  margin-left: 0 !important;
  padding: 8px 4px;
  font-size: 11px;
}

.snapshot-list {
  min-height: 140px;
  margin-bottom: 24px;
}
:deep(.el-divider__text) {
  color:var(--el-text-color-regular);
  font-weight: bold;
  background-color: var(--sys-bg-panel);
  text-align: center;
  line-height: 1.4;
  white-space: normal;
  max-width: 85%;
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
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
  font-weight: bold;
}

.title-with-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.snap-chainage {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.results-summary {
  background: var(--el-fill-color-light);
  border: 1px solid var(--sys-border);
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 10px;
}

.pending-box {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px;
  background: var(--el-fill-color-blank);
  border-style: dashed;
  border-color: var(--sys-border);
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
  color: var(--el-text-color-secondary);
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
  color: var(--el-text-color-secondary);
}

.actions-btn {
  display: flex;
  align-items: center;
  gap: 4px;
}

.main-metrics {
  display: flex;
  justify-content: space-between;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px dashed var(--sys-border);
  font-size: 11px;
  color: var(--el-text-color-regular);
}

.val-tag {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-style: italic;
}

.text-danger {
  color: #f56c6c;
}

.text-success {
  color: #67c23a;
}

.critical-rec-grid {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--el-border-color-light);
}

.critical-metrics {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed var(--el-border-color-light);
}

.critical-rec-grid .val {
  color: #f56c6c;
}
</style>