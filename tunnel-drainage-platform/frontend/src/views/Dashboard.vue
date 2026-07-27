<template>
  <div class="dashboard-layout" :class="{ 'theme-tech-blue': themeStore.isTechBlue }">
    <header class="toolbar">
      <div class="title">隧道工程多维协同智能排水自适应平台</div>
      <div class="actions">
        <!-- [新增] 视图控制与主题切换 -->
        <div class="view-controls">
          <!-- 1. [新增] 视窗一键聚焦切换 -->
          <el-radio-group v-model="focusMode" size="small" @change="handleFocusMode" class="focus-switch">
            <el-radio-button value="all">协同</el-radio-button>
            <el-radio-button value="input">输入</el-radio-button>
            <el-radio-button value="3d">三维全景</el-radio-button>
            <el-radio-button value="result">结果</el-radio-button>
          </el-radio-group>
          
          <!-- 2. [美化] 重新设计的参数数据库与双视角对比入口 -->
          <el-button type="primary" color="#4f46e5" icon="Coin" @click="dbDialogVisible = true" class="db-btn">
            参数数据库
          </el-button>
          <el-button type="warning" color="#e6a23c" icon="Files" @click="compareDialogVisible = true" class="compare-btn">
            双视角对比
          </el-button>
        </div>
        
        <!-- 修改 2: 将 v-model 改为单向的 :model-value -->
        <el-switch 
          :model-value="themeStore.isTechBlue" 
          inline-prompt 
          active-text="科技蓝" 
          inactive-text="明亮白" 
          @change="themeStore.toggleTheme" 
        />
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
      <!-- 左侧输入区：应用动态宽度 -->
      <aside class="left-panel" :class="{ 'is-collapsed': isLeftCollapsed }"
        :style="{ width: isLeftCollapsed ? '0px' : leftWidth + 'px' }">
        <ParameterForm v-show="!isLeftCollapsed" />
      </aside>
      <!-- [新增] 左侧拉伸调整手柄 -->
      <div class="resizer resizer-left" v-show="!isLeftCollapsed" @mousedown="startDragLeft"></div>
      <section class="center-panel" ref="centerPanelRef">

        <!-- [新增] 脏数据拦截遮罩层，覆盖在 3D 画布顶部 -->
        <div v-if="parameterStore.isDirty" class="dirty-data-mask">
          <el-alert title="输入参数已变更，空间模型与计算结果已失效" description="请点击右上角【执行云计算】获取最新多维协同结果" type="warning"
            show-icon 
            :closable="false" 
          />
        </div>
        <el-button class="collapse-btn left" :icon="isLeftCollapsed ? 'ArrowRight' : 'ArrowLeft'"
          @click="isLeftCollapsed = !isLeftCollapsed">
        </el-button>

        <el-button type="primary" class="fullscreen-btn" icon="FullScreen" @click="toggleFullscreen">
          全局放大
        </el-button>

        <el-button class="collapse-btn right" :icon="isRightCollapsed ? 'ArrowLeft' : 'ArrowRight'"
          @click="isRightCollapsed = !isRightCollapsed">
        </el-button>

        
        <!-- 移除原 placeholder-3d 标签块，挂载真实的三维画布组件 -->
        <!-- <div class="placeholder-3d">
          <p>WebGL 3D 渲染画布区</p>
          <small>依赖 parameterStore.currentPayload 实时驱动</small> 
          </div> -->
          
        <Viewer3D :class="{ 'is-blurred': parameterStore.isDirty }" />


      </section>

     <!-- [新增] 右侧拉伸调整手柄 -->
      <div class="resizer resizer-right" v-show="!isRightCollapsed" @mousedown="startDragRight"></div>

      <!-- 右侧结果区：应用动态宽度 -->
      <aside class="right-panel" :class="{ 'is-collapsed': isRightCollapsed }" :style="{ width: isRightCollapsed ? '0px' : rightWidth + 'px' }">
        <SnapshotSidebar v-show="!isRightCollapsed" />
      </aside>
    </main>
    <!-- [新增插入] 独立的系统计算输入参数数据库弹窗与双视角对比弹窗 -->
    <el-dialog v-model="dbDialogVisible" title="参数台账库" fullscreen destroy-on-close>
      <ParameterDatabase @close="dbDialogVisible = false" />
    </el-dialog>
    <el-dialog v-model="compareDialogVisible" title="3D 双视角对比" fullscreen destroy-on-close>
      <CompareView />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';

// 新增引入 Viewer3D
import Viewer3D from '@/components/three/Viewer3D.vue';
import { watch } from 'vue'; // 新增引入 watch
import { useRouter } from 'vue-router';
import CaseSelector from '@/components/ui/CaseSelector.vue';
import ParameterForm from '@/components/ui/ParameterForm.vue';
import SnapshotSidebar from '@/components/ui/SnapshotSidebar.vue';
import ParameterDatabase from '@/views/ParameterDatabase.vue';
import CompareView from '@/views/CompareView.vue';
import { useSnapshotStore } from '@/store/snapshotStore';
import { useParameterStore } from '@/store/parameterStore'; // 引入参数 Store
import { useThemeStore } from '@/store/themeStore'; // 引入主题 Store
import { calculateDrainage } from '@/api/index'; // 引入计算接口
import { ElMessage, ElMessageBox } from 'element-plus';
import { downloadTemplate, parseUploadFile } from '@/utils/excelIO'; // 确保路径对应实际项目

const router = useRouter();
const themeStore = useThemeStore();
const snapshotStore = useSnapshotStore();
const parameterStore = useParameterStore(); // 实例化参数 Store

// [新增] 弹窗控制状态
const dbDialogVisible = ref(false);
const compareDialogVisible = ref(false);

const isTechBlueRef = computed(() => themeStore.isTechBlue);

watch(isTechBlueRef, (isDark) => {
  if (isDark) {
    document.documentElement.classList.add('dark', 'theme-tech-blue');
  } else {
    document.documentElement.classList.remove('dark', 'theme-tech-blue');
  }
}, { immediate: true });

// 修改部分: setup 内部追加以下状态和方法
const fileInput = ref<HTMLInputElement | null>(null);

// 下载对应当前洞型的模板
const triggerUpload = () => fileInput.value?.click();

// 触发文件上传
const handleFileChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const { value: name } = await ElMessageBox.prompt('请输入导入序列名称', '批量导入', { inputValue: '新导入序列' });
  try {
    await parseUploadFile(file, name);
    ElMessage.success('导入成功，请在右侧序列库查看并执行计算');
  } catch (err) {
    ElMessage.error('解析失败: ' + err);
  } finally {
    if (fileInput.value) fileInput.value.value = '';
  }
};






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

    // [新增] 将最新结果推入状态机，消除脏数据屏蔽层
    parameterStore.setCalculatedResults(result);

    snapshotStore.createSnapshot('执行云计算生成节点', result);
    ElMessage.success('计算完成，空间坐标已更新');
  } catch (error) {
    // 网络或业务异常已在 axios 拦截器中抛出 UI 提示，此处捕获以防止 Promise 报错漏报
    console.error('引擎调度异常:', error);
  }
};

// ==========================================
// [新增] 弹性布局控制与拖拽逻辑 (SplitPane)
// ==========================================
const isLeftCollapsed = ref(false);
const isRightCollapsed = ref(false);
const centerPanelRef = ref<HTMLElement | null>(null);

// ==========================================
// [新增] 一键聚焦切换逻辑
// ==========================================
const focusMode = ref('all');

const handleFocusMode = (mode: string) => {
  if (mode === 'all') {
    isLeftCollapsed.value = false;
    isRightCollapsed.value = false;
  } else if (mode === 'input') {
    isLeftCollapsed.value = false;
    isRightCollapsed.value = true;
  } else if (mode === '3d') {
    isLeftCollapsed.value = true;
    isRightCollapsed.value = true;
  } else if (mode === 'result') {
    isLeftCollapsed.value = true;
    isRightCollapsed.value = false;
  }
};

// 监听手动点击箭头折叠面板时的状态，反向同步给顶部按钮
watch([isLeftCollapsed, isRightCollapsed], ([leftCol, rightCol]) => {
  if (!leftCol && !rightCol) focusMode.value = 'all';
  else if (!leftCol && rightCol) focusMode.value = 'input';
  else if (leftCol && rightCol) focusMode.value = '3d';
  else if (leftCol && !rightCol) focusMode.value = 'result';
});

const leftWidth = ref(550); // 默认 550px
const rightWidth = ref(420); // 默认 420px

let isDraggingLeft = false;
let isDraggingRight = false;
let startX = 0;
let startWidth = 0;

const startDragLeft = (e: MouseEvent) => {
  isDraggingLeft = true;
  startX = e.clientX;
  startWidth = leftWidth.value;
  document.addEventListener('mousemove', onDragLeft);
  document.addEventListener('mouseup', stopDrag);
  document.body.style.cursor = 'col-resize';
};

const onDragLeft = (e: MouseEvent) => {
  if (!isDraggingLeft) return;
  const newWidth = startWidth + (e.clientX - startX);
  // 限制拖拽边界：最小300px，最大800px
  if (newWidth > 300 && newWidth < 800) leftWidth.value = newWidth;
};

const startDragRight = (e: MouseEvent) => {
  isDraggingRight = true;
  startX = e.clientX;
  startWidth = rightWidth.value;
  document.addEventListener('mousemove', onDragRight);
  document.addEventListener('mouseup', stopDrag);
  document.body.style.cursor = 'col-resize';
};

const onDragRight = (e: MouseEvent) => {
  if (!isDraggingRight) return;
  // 右侧拉伸方向与鼠标运动相反
  const newWidth = startWidth - (e.clientX - startX); 
  if (newWidth > 300 && newWidth < 600) rightWidth.value = newWidth;
};

const stopDrag = () => {
  isDraggingLeft = false;
  isDraggingRight = false;
  document.removeEventListener('mousemove', onDragLeft);
  document.removeEventListener('mousemove', onDragRight);
  document.removeEventListener('mouseup', stopDrag);
  document.body.style.cursor = 'default';
};

const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    centerPanelRef.value?.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
};

onMounted(() => {
  snapshotStore.loadFromLocal();
});


</script>
<style>
:root {
  --sys-bg-toolbar: #ffffff;
  --sys-bg-panel: #ffffff;
  --sys-bg-3d: #2a2a2a;
  --sys-text-main: #303133;
  --sys-border: #dcdfe6;
  --sys-shadow: rgba(0, 0, 0, 0.05);
}
:root.theme-tech-blue {
  --sys-bg-toolbar: #0f1c2e;
  --sys-bg-panel: #162436;
  --sys-bg-3d: #08101a;
  --sys-text-main: #e2e8f0;
  --sys-border: #1e3a5f;
  --sys-shadow: rgba(0, 0, 0, 0.5);
  
  /* 同步覆盖 Element Plus 的默认底色变量 */
  --el-bg-color: #162436;
  --el-bg-color-overlay: #0f1c2e;
  --el-bg-color-page: #0b1421; /* [新增] 页面底色 */
  --el-text-color-primary: #e2e8f0;
  --el-text-color-regular: #a0aec0;
  --el-text-color-secondary: #718096; /* [新增] 次要文本色 */
  --el-border-color: #1e3a5f;
  --el-border-color-light: #2c5282;
  --el-border-color-lighter: #1a365d; /* [新增] 浅边框色 */
  --el-fill-color-blank: #0f1c2e;
  --el-fill-color-light: #1a2a40; /* [新增] 悬浮/斑马纹背景 */
  --el-fill-color: #23354e; /* [新增] 基础填充色 */
}
</style>


<style scoped>
:deep(.el-switch:not(.is-checked) .el-switch__core .el-switch__inner-wrapper),
:deep(.el-switch:not(.is-checked) .el-switch__core .el-switch__inner) {
  color: #606266 !important; /* 强制覆盖底层继承的纯白，增加与浅灰背景的对比度 */
  font-weight: bold;
}
:deep(.el-switch.is-checked .el-switch__core) {
  color: #ffffff; /* 科技蓝模式下：采用纯白文字 */
}
:deep(.el-switch__core .el-switch__inner) {
  color: inherit; /* 强制文本容器继承父级 core 设定的颜色 */
}

/* [修正] 图标同步：优先利用 Element Plus 内置变量重置 */
:deep(.el-button) {
  --el-button-icon-color: inherit; 
}
:deep(.el-button .el-icon),
:deep(.el-button .el-icon svg) {
  color: inherit;
  fill: currentColor;
}

/* ==========================================
   [核心] CSS 变量化主题定义
   ========================================== */
.dashboard-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--sys-bg-panel);
  color: var(--sys-text-main);
  transition: background-color 0.3s, color 0.3s;
}


/* ------------------------------------------
   替换原先写死的色彩值为 var() 
   ------------------------------------------ */
.toolbar {
  height: 60px;
  background-color: var(--sys-bg-toolbar);
  border-bottom: 1px solid var(--sys-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 2px 4px var(--sys-shadow);
  transition: all 0.3s ease;
}

.toolbar .title {
  font-size: 18px;
  font-weight: 600;
  color: var(--sys-text-main);
}

.toolbar .actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.view-controls {
  display: flex;
  align-items: center;
  margin-right: 15px;
}

.focus-switch {
  margin-right: 12px;
  box-shadow: 0 2px 4px var(--sys-shadow);
  border-radius: 4px;
}

.db-btn {
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.4);
  transition: all 0.3s ease;
}

.db-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.6);
}
.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 面板使用动态内联 style 宽度，这里移除固定 width */
.left-panel, .right-panel {
  padding: 20px;
  overflow-y: auto;
  background: var(--sys-bg-panel);
  transition: padding 0.3s ease; /* 宽度由Vue控制，此处只平滑内边距 */
}

.left-panel {
  border-right: 1px solid var(--sys-border);
}

.right-panel {
  border-left: 1px solid var(--sys-border);
}

.center-panel {
  flex: 1;
  position: relative;
  background: var(--sys-bg-3d); /* 3D背景切换 */
  overflow: hidden;
}

/* [新增] 拖拽手柄样式 */
.resizer {
  width: 6px;
  background-color: var(--sys-border);
  cursor: col-resize;
  z-index: 5;
  transition: background-color 0.2s;
}

.resizer:hover, .resizer:active {
  background-color: #409eff; /* 拖拽时蓝色高亮 */
}

.is-collapsed {
  padding: 0 !important;
  border: none !important;
}

.collapse-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  height: 60px;
  width: 18px;
  padding: 0;
  background-color: var(--sys-bg-panel); /* 同步主题色 */
  border: 1px solid var(--sys-border);
  color: var(--sys-text-main);
  box-shadow: 0 2px 8px var(--sys-shadow);
  transition: all 0.2s ease-in-out;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.85;
}

.collapse-btn:hover {
  background-color: var(--sys-bg-panel);
  color: #409eff;
  border-color: #409eff;
  width: 22px;
  opacity: 1;
}

.collapse-btn.left {
  left: 0;
  border-left: none;
  border-radius: 0 6px 6px 0;
}

.collapse-btn.right {
  right: 0;
  border-right: none;
  border-radius: 6px 0 0 6px;
}

.fullscreen-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
}

.dirty-data-mask {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  z-index: 99;
  box-shadow: 0 4px 12px var(--sys-shadow);
  border-radius: 4px;
}

.is-blurred {
  filter: blur(3px) grayscale(40%);
  pointer-events: none;
  opacity: 0.6;
  transition: all 0.3s ease-in-out;
}


</style>