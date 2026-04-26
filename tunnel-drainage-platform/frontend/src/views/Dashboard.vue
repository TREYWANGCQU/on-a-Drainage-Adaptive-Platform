<template>
  <div class="dashboard-layout">
    <header class="toolbar">
      <div class="title">隧道智能排水计算与 3D 验证工作台</div>
      <div class="actions">
        <CaseSelector />
        <el-button type="primary" icon="Upload" @click="handleBatchUpload">多分区 Excel 批量导入</el-button>
        <el-button type="success" icon="VideoPlay" @click="executeCalculation">执行云计算</el-button>
      </div>
    </header>

    <main class="main-content">
      <aside class="left-panel">
        <ParameterForm />
      </aside>

      <section class="center-panel">
        <div class="placeholder-3d">
          <p>WebGL 3D 渲染画布区</p>
          <small>依赖 parameterStore.currentPayload 实时驱动</small>
        </div>
      </section>

      <aside class="right-panel">
        <SnapshotSidebar />
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import CaseSelector from '@/components/ui/CaseSelector.vue';
import ParameterForm from '@/components/ui/ParameterForm.vue';
import SnapshotSidebar from '@/components/ui/SnapshotSidebar.vue';
import { useSnapshotStore } from '@/store/snapshotStore';
import { ElMessage } from 'element-plus';

const snapshotStore = useSnapshotStore();

onMounted(() => {
  // 页面初始化时挂载本地持久化的快照与序列数据
  snapshotStore.loadFromLocal();
});

const executeCalculation = async () => {
  // TODO: 对接 api/index.ts 封装的 Axios Axios 实例发起 POST 请求
  ElMessage.success('计算指令已发送，等待后端引擎回传管网空间坐标...');
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
  width: 400px;
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
  width: 320px;
  overflow-y: hidden;
}
</style>