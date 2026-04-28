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