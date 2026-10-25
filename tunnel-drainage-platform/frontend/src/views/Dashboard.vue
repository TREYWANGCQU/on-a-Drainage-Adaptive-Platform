<!-- frontend/src/views/Dashboard.vue -->
<template>
  <div class="dashboard-layout" :class="{ 'theme-tech-blue': themeStore.isTechBlue }">
    <header class="toolbar">
      <!-- 品牌与标题区 -->
      <div class="brand-box">
        <span class="brand-logo">🚇</span>
        <div class="title title-full">隧道工程多维协同智能排水自适应平台</div>
        <div class="title title-short">智能排水自适应平台</div>
      </div>

      <div class="actions">
        <!-- 1. 核心视图模式切换 -->
        <div class="view-controls">
          <el-radio-group v-model="focusMode" size="small" @change="handleFocusMode" class="focus-switch">
            <el-radio-button value="all">协同</el-radio-button>
            <el-radio-button value="input">输入</el-radio-button>
            <el-radio-button value="3d">三维全景</el-radio-button>
            <el-radio-button value="result">结果</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 2. 宽屏直列模式 (>= 1550px) -->
        <div class="wide-tools">
          <el-button type="primary" color="#4f46e5" icon="Coin" @click="dbDialogVisible = true" class="db-btn" size="default">
            参数数据库
          </el-button>
          <el-button type="warning" color="#e6a23c" icon="Files" @click="compareDialogVisible = true" class="compare-btn" size="default">
            双视角对比
          </el-button>
          <el-button-group class="io-btn-group">
            <el-button type="primary" icon="Download" @click="downloadTemplate()">下载模板</el-button>
            <el-button type="primary" icon="Upload" @click="triggerUpload">批量导入</el-button>
          </el-button-group>
        </div>

        <!-- 3. 中窄屏收纳工具箱 (< 1550px) -->
        <div class="compact-tools">
          <el-dropdown trigger="click">
            <el-button type="primary" plain icon="Tools">
              工程工具箱<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item icon="Coin" @click="dbDialogVisible = true">参数台账库</el-dropdown-item>
                <el-dropdown-item icon="Files" @click="compareDialogVisible = true">3D 双视角对比</el-dropdown-item>
                <el-dropdown-item icon="Download" divided @click="downloadTemplate()">下载隧道参数模板</el-dropdown-item>
                <el-dropdown-item icon="Upload" @click="triggerUpload">批量导入 Excel</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        
        <!-- 4. 典型案例选择器 -->
        <CaseSelector />

        <!-- 5. 主题切换 -->
        <el-switch 
          :model-value="themeStore.isTechBlue" 
          inline-prompt 
          active-text="科技蓝" 
          inactive-text="明亮白" 
          @change="themeStore.toggleTheme" 
          class="theme-switch"
        />

        <!-- 5.5 平台权限与操作员鉴权状态微标胶囊 -->
        <div 
          class="auth-status-capsule" 
          :class="{ 'is-auth': authStore.isAuthorized, 'is-guest': !authStore.isAuthorized }"
          @click="handleAuthCapsuleClick"
        >
          <span class="auth-icon">{{ authStore.isAuthorized ? '🔓' : '🔒' }}</span>
          <span class="auth-status-text">
            {{ authStore.isAuthorized ? `${authStore.remainingMinutes} min` : '阅览' }}
          </span>
          <el-tooltip v-if="authStore.isAuthorized && authStore.authRequired" content="主动锁定会话" placement="bottom">
            <el-button link size="small" class="lock-now-btn" @click.stop="handleManualLock">
              锁定
            </el-button>
          </el-tooltip>
        </div>

        <!-- 6. 核心云计算主按钮：通过 is-dot 徽标非侵入式提示待计算状态 -->
        <el-badge :is-dot="parameterStore.isDirty" class="calc-badge">
          <el-button 
            type="success" 
            icon="VideoPlay" 
            @click="executeCalculation" 
            class="calc-btn"
            :class="{ 'calc-pulse-btn': parameterStore.isDirty }"
          >
            {{ parameterStore.isDirty ? '更新并重新计算' : '执行云计算' }}
          </el-button>
        </el-badge>

        <input type="file" ref="fileInput" v-show="false" accept=".xlsx,.xls" @change="handleFileChange" />
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

        <el-button class="collapse-btn left" :icon="isLeftCollapsed ? 'ArrowRight' : 'ArrowLeft'"
          @click="isLeftCollapsed = !isLeftCollapsed">
        </el-button>

        <el-button type="primary" class="fullscreen-btn" icon="FullScreen" @click="toggleFullscreen">
          全局放大
        </el-button>

        <el-button class="collapse-btn right" :icon="isRightCollapsed ? 'ArrowLeft' : 'ArrowRight'"
          @click="isRightCollapsed = !isRightCollapsed">
        </el-button>

        <!-- 3D 渲染画布组件：保持独立常驻交互，不再受表单局部修改干扰 -->
        <Viewer3D />


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
    <el-dialog v-model="compareDialogVisible" title="3D 双视角对比" fullscreen destroy-on-close class="compare-dialog">
      <CompareView />
    </el-dialog>
    <!-- 全局轻量操作安全认证弹窗 -->
    <AuthDialog />
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
import AuthDialog from '@/components/ui/AuthDialog.vue';
import { useSnapshotStore } from '@/store/snapshotStore';
import { useParameterStore } from '@/store/parameterStore'; // 引入参数 Store
import { useThemeStore } from '@/store/themeStore'; // 引入主题 Store
import { useAuthStore } from '@/store/authStore'; // 引入安全认证 Store
import { calculateDrainage } from '@/api/index'; // 引入计算接口
import { ElMessage, ElMessageBox } from 'element-plus';
import { downloadTemplate, parseUploadFile } from '@/utils/excelIO'; // 确保路径对应实际项目

const router = useRouter();
const themeStore = useThemeStore();
const snapshotStore = useSnapshotStore();
const parameterStore = useParameterStore(); // 实例化参数 Store
const authStore = useAuthStore(); // 实例化认证 Store

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
const triggerUpload = () => {
  authStore.wrapActionWithAuth(() => {
    fileInput.value?.click();
  }, '批量导入 Excel');
};

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

const handleAuthCapsuleClick = () => {
  if (!authStore.isAuthorized) {
    authStore.wrapActionWithAuth(() => {
      ElMessage.success('身份认证成功，已激活当前会话全量操作权限');
    }, '身份认证');
  }
};

const handleManualLock = () => {
  authStore.clearAuth();
  ElMessage.info('已主动锁定会话，敏感操作需重新验证');
};

onMounted(() => {
  // 页面初始化时感知后端认证环境并挂载本地持久化快照
  authStore.initAuth();
  snapshotStore.loadFromLocal();
});

const executeCalculation = () => {
  authStore.wrapActionWithAuth(async () => {
    try {
      ElMessage.info('计算指令已发送，等待计算引擎回传数据...');

      // 提取当前表单参数
      const payload = parameterStore.currentPayload;

      // 发起 POST 请求对接 uvicorn
      const result = await calculateDrainage(payload);

      // 将最新结果推入状态机，消除脏数据屏蔽层
      parameterStore.setCalculatedResults(result);

      snapshotStore.createSnapshot('执行云计算生成节点', result);
      ElMessage.success('计算完成，空间坐标已更新');
    } catch (error) {
      console.error('引擎调度异常:', error);
    }
  }, '执行云计算');
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

/* [新增] 3D 双视角对比全屏弹窗无缝布局适配 */
:deep(.compare-dialog.el-dialog) {
  display: flex;
  flex-direction: column;
  margin: 0 !important;
}

:deep(.compare-dialog .el-dialog__body) {
  flex: 1;
  padding: 0 !important;
  overflow: hidden !important;
  height: 0;
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
/* ------------------------------------------
   Toolbar 响应式布局与防挤压规则
   ------------------------------------------ */
.toolbar {
  height: 60px;
  background-color: var(--sys-bg-toolbar);
  border-bottom: 1px solid var(--sys-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  box-shadow: 0 2px 4px var(--sys-shadow);
  transition: all 0.3s ease;
  overflow-x: auto;
  overflow-y: hidden;
}

.brand-box {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-right: 12px;
}

.brand-logo {
  font-size: 20px;
}

.toolbar .title {
  font-size: 17px;
  font-weight: 600;
  color: var(--sys-text-main);
  white-space: nowrap;
}

.title-short {
  display: none;
}

.toolbar .actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-shrink: 0;
}

.view-controls {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.focus-switch {
  box-shadow: 0 2px 4px var(--sys-shadow);
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

:deep(.focus-switch .el-radio-button__inner) {
  white-space: nowrap !important;
  padding: 8px 12px;
}

.wide-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.compact-tools {
  display: none;
  flex-shrink: 0;
}

.db-btn {
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.4);
  transition: all 0.3s ease;
  white-space: nowrap;
}

.db-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.6);
}

.compare-btn {
  white-space: nowrap;
}

.io-btn-group {
  white-space: nowrap;
}

.calc-btn {
  font-weight: bold;
  white-space: nowrap;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(103, 194, 58, 0.4);
}

.theme-switch {
  flex-shrink: 0;
}

/* 响应式断点 1: < 1550px 切换为工具箱收折模式 */
@media (max-width: 1550px) {
  .wide-tools {
    display: none;
  }
  .compact-tools {
    display: flex;
    align-items: center;
  }
}

/* 响应式断点 2: < 1250px 标题切换为短标题 */
@media (max-width: 1250px) {
  .title-full {
    display: none;
  }
  .title-short {
    display: inline-block;
  }
  .toolbar {
    padding: 0 10px;
  }
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

/* 云计算按钮脏数据待算轻量微标与微光效 */
.calc-badge {
  display: inline-flex;
  align-items: center;
}

.calc-badge :deep(.el-badge__content.is-dot) {
  top: 6px;
  right: 6px;
  background-color: #f59e0b; /* 琥珀黄预警微标 */
}

.calc-pulse-btn {
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.45);
  border-color: #f59e0b !important;
  transition: all 0.3s ease;
}

/* 权限指示微标胶囊 (满足 font-size >= 12px) */
.auth-status-capsule {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 16px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
  transition: all 0.25s ease;
  line-height: 1;
}

.auth-status-capsule.is-guest {
  background: rgba(148, 163, 184, 0.15);
  border: 1px solid rgba(148, 163, 184, 0.35);
  color: var(--el-text-color-regular, #64748b);
}

.auth-status-capsule.is-guest:hover {
  background: rgba(148, 163, 184, 0.25);
  border-color: rgba(100, 116, 139, 0.5);
  color: #2563eb;
}

.auth-status-capsule.is-auth {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #059669;
}

.auth-icon {
  font-size: 13px;
  line-height: 1;
}

.auth-status-text {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.2px;
}

.lock-now-btn {
  font-size: 12px !important;
  color: #dc2626 !important;
  padding: 0 2px !important;
  margin-left: 2px !important;
  height: auto !important;
}

.lock-now-btn:hover {
  color: #b91c1c !important;
  text-decoration: underline;
}

</style>