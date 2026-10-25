<!-- tunnel-drainage-platform/frontend/src/components/ui/AuthDialog.vue -->
<template>
  <el-dialog
    v-model="authStore.isDialogVisible"
    :title="dialogTitle"
    width="440px"
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    @close="handleClose"
    class="auth-dialog-custom"
  >
    <div class="auth-dialog-body" :class="{ shake: isShaking }">
      <!-- 锁徽标与视觉指示 -->
      <div class="shield-badge">
        <div class="shield-glow"></div>
        <span class="shield-icon">🛡️</span>
      </div>

      <div class="auth-header-desc">
        <h4 class="auth-op-target">
          正在请求授权：<span class="action-highlight">{{ authStore.pendingActionName }}</span>
        </h4>
        <p class="auth-hint-text">
          为防止非授权数据篡改与算力资源过载，请输入平台操作员密码以激活本次会话权限。
        </p>
        <p v-if="!authStore.hasCustomSecret" class="default-pwd-badge">
          💡 系统出厂默认口令：<code>chongqing123456</code>
        </p>
      </div>

      <!-- 错误反馈提示条 -->
      <transition name="fade">
        <div v-if="errorMessage" class="error-alert-box">
          <span class="err-icon">⚠️</span>
          <span class="err-text">{{ errorMessage }}</span>
        </div>
      </transition>

      <!-- 密码输入表单 -->
      <div class="auth-input-group">
        <el-input
          ref="passwordInputRef"
          v-model="password"
          type="password"
          placeholder="请输入操作员密码"
          show-password
          clearable
          size="large"
          @keyup.enter="handleConfirm"
          :disabled="isSubmitting"
        >
          <template #prefix>
            <span class="input-key-icon">🔑</span>
          </template>
        </el-input>
      </div>

      <!-- 记住我选择框 -->
      <div class="auth-options-row">
        <el-checkbox v-model="rememberMe" size="default">
          <span class="checkbox-label">在此设备上保持授权 24 小时</span>
        </el-checkbox>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose" :disabled="isSubmitting" size="default">
          取消
        </el-button>
        <el-button
          type="primary"
          @click="handleConfirm"
          :loading="isSubmitting"
          size="default"
          class="auth-confirm-btn"
        >
          确认授权
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useAuthStore } from '../../store/authStore';
import { ElMessage } from 'element-plus';

const authStore = useAuthStore();

const dialogTitle = ref('操作安全验证');
const password = ref('');
const rememberMe = ref(false);
const isSubmitting = ref(false);
const errorMessage = ref('');
const isShaking = ref(false);
const passwordInputRef = ref<any>(null);

// 监听弹窗打开，聚焦输入框并重置状态
watch(
  () => authStore.isDialogVisible,
  (visible) => {
    if (visible) {
      password.value = '';
      errorMessage.value = '';
      isSubmitting.value = false;
      isShaking.value = false;
      nextTick(() => {
        if (passwordInputRef.value) {
          passwordInputRef.value.focus();
        }
      });
    }
  }
);

const triggerShake = () => {
  isShaking.value = true;
  setTimeout(() => {
    isShaking.value = false;
  }, 500);
};

const handleConfirm = async () => {
  if (!password.value || !password.value.trim()) {
    errorMessage.value = '请输入操作员密码';
    triggerShake();
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    await authStore.verifyPassword(password.value.trim(), rememberMe.value);
    ElMessage.success({
      message: `【${authStore.pendingActionName}】授权成功，操作已恢复执行`,
      duration: 3000
    });
  } catch (err: any) {
    const detail = err.response?.data?.detail || err.message || '密码验证失败';
    errorMessage.value = detail;
    triggerShake();
  } finally {
    isSubmitting.value = false;
  }
};

const handleClose = () => {
  authStore.cancelAuth();
};
</script>

<style scoped>
.auth-dialog-custom :deep(.el-dialog__header) {
  margin-right: 0;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.auth-dialog-custom :deep(.el-dialog__title) {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary, #1e293b);
}

.auth-dialog-body {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: transform 0.2s ease-in-out;
}

.shake {
  animation: authShake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}

@keyframes authShake {
  10%, 90% { transform: translate3d(-2px, 0, 0); }
  20%, 80% { transform: translate3d(4px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-6px, 0, 0); }
  40%, 60% { transform: translate3d(6px, 0, 0); }
}

.shield-badge {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.15), rgba(9, 92, 227, 0.25));
  border: 1px solid rgba(64, 158, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}

.shield-glow {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(64, 158, 255, 0.35) 0%, transparent 70%);
  z-index: 0;
  animation: pulseGlow 2.5s infinite;
}

@keyframes pulseGlow {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.08); }
}

.shield-icon {
  font-size: 26px;
  position: relative;
  z-index: 1;
}

.auth-header-desc {
  text-align: center;
  margin-bottom: 16px;
  width: 100%;
}

.auth-op-target {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary, #0f172a);
  margin: 0 0 8px 0;
}

.action-highlight {
  color: #2563eb;
  background: rgba(37, 99, 235, 0.08);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(37, 99, 235, 0.2);
}

.auth-hint-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-regular, #64748b);
  margin: 0 0 8px 0;
}

.default-pwd-badge {
  font-size: 12px;
  color: #0284c7;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 4px;
  padding: 4px 10px;
  display: inline-block;
  margin: 4px 0 0 0;
}

.default-pwd-badge code {
  font-family: monospace;
  font-weight: 600;
  color: #0369a1;
}

.error-alert-box {
  width: 100%;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  box-sizing: border-box;
}

.err-icon {
  font-size: 14px;
}

.err-text {
  flex: 1;
  line-height: 1.4;
}

.auth-input-group {
  width: 100%;
  margin-bottom: 12px;
}

.input-key-icon {
  font-size: 14px;
  margin-right: 4px;
}

.auth-options-row {
  width: 100%;
  display: flex;
  justify-content: flex-start;
  margin-bottom: 8px;
}

.checkbox-label {
  font-size: 12px;
  color: var(--el-text-color-regular, #64748b);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 8px;
}

.auth-confirm-btn {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  border: none;
  font-weight: 500;
}

.auth-confirm-btn:hover {
  background: linear-gradient(135deg, #1d4ed8, #1e40af);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
