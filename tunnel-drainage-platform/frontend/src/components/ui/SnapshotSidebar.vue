<template>
  <div class="snapshot-sidebar">
    <div class="header">
      <h4>工况快照与序列库</h4>
      <el-button type="primary" size="small" @click="handleSaveSnapshot">保存当前快照</el-button>
    </div>

    <el-divider>散列快照 (单体区间)</el-divider>
    <div class="snapshot-list">
      <el-card 
        v-for="snap in snapshots" 
        :key="snap.id" 
        class="snapshot-item"
        shadow="hover"
        @click="restoreSnapshot(snap.id)"
      >
        <div class="snap-info">
          <span class="snap-remark">{{ snap.remark || '未命名工况' }}</span>
          <span class="snap-chainage">K{{ snap.start_chainage }} ~ K{{ snap.end_chainage }}</span>
        </div>
        <div class="snap-meta">
          <span class="time">{{ formatTime(snap.timestamp) }}</span>
          <el-tag size="small" v-if="snap.results?.safety_factor" type="success">
            F.S: {{ snap.results.safety_factor }}
          </el-tag>
        </div>
      </el-card>
    </div>

    <el-divider>批量导入序列 (全段组装)</el-divider>
    <div class="sequence-list">
      <el-collapse accordion>
        <el-collapse-item 
          v-for="seq in sequences" 
          :key="seq.sequenceId" 
          :title="`${seq.sequenceName} (${seq.snapshots.length} 个分段)`"
        >
          <el-button size="small" type="success" plain class="w-100">
            载入3D全段模型
          </el-button>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSnapshotStore } from '@/store/snapshotStore';
import { ElMessage, ElMessageBox } from 'element-plus';

const snapshotStore = useSnapshotStore();
const snapshots = computed(() => snapshotStore.snapshots);
const sequences = computed(() => snapshotStore.sequences);

const handleSaveSnapshot = () => {
  ElMessageBox.prompt('请输入该工况快照的备注说明', '保存快照', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
  }).then(({ value }) => {
    // 调用 Store 行动，当前设计已在 Store 内部封装了深拷贝逻辑与结果绑定
    snapshotStore.createSnapshot(value);
    ElMessage.success('工况参数快照保存成功');
  }).catch(() => {});
};

const restoreSnapshot = (id: string) => {
  snapshotStore.applySnapshot(id);
  ElMessage.info('已回溯至选定快照工况，参数已覆盖');
};

const formatTime = (ts: number) => {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
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
.snap-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #909399;
}
.w-100 { width: 100%; margin-top: 8px; }
</style>