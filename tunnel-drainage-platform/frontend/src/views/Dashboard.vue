<template>
  <div class="dashboard-layout">
    <header class="toolbar">
      <div class="title">隧道工程多维协同智能排水自适应平台</div>
      <div class="actions">
        <CaseSelector />
        <el-button-group>
          <el-button type="primary" icon="Download" @click="downloadTemplate()">下载隧道参数模板</el-button>
          <el-button type="primary" icon="Upload" @click="triggerUpload">批量导入 Excel</el-button>
        </el-button-group>
        <input type="file" ref="fileInput" v-show="false" accept=".xlsx,.xls" @change="handleFileChange" />
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
import { ElMessage, ElMessageBox } from 'element-plus';
import { downloadTemplate, parseUploadFile } from '@/utils/excelIO'; // 确保路径对应实际项目



// 修改部分: setup 内部追加以下状态和方法
const fileInput = ref<HTMLInputElement | null>(null);

// 下载对应当前洞型的模板
const triggerUpload = () => fileInput.value?.click();

// 触发文件上传
const handleFileChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  
  const { value: name } = await ElMessageBox.prompt('请输入导入序列名称', '批量导入', { defaultValue: '新导入序列' });
  try {
    await parseUploadFile(file, name);
    ElMessage.success('导入成功，请在右侧序列库查看并执行计算');
  } catch (err) {
    ElMessage.error('解析失败: ' + err);
  } finally {
    if (fileInput.value) fileInput.value.value = '';
  }
};



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
    //console.log('API result:', JSON.stringify(result, null, 2));  // debug输出内容
    // 收到返回值后存档并驱动 3D 渲染
    //snapshotStore.createSnapshot(result);
    snapshotStore.createSnapshot('执行云计算生成节点', result);
    ElMessage.success('计算完成，空间坐标已更新');
  } catch (error) {
    // 网络或业务异常已在 axios 拦截器中抛出 UI 提示，此处捕获以防止 Promise 报错漏报
    console.error('引擎调度异常:', error);
  }
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