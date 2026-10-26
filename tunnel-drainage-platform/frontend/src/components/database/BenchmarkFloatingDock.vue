<!-- frontend/src/components/database/BenchmarkFloatingDock.vue -->
<template>
  <transition name="dock-slide">
    <div v-if="cartStore.count > 0" class="floating-benchmark-dock">
      <div class="dock-badge-title">
        <span class="dock-icon">📊</span>
        <span>对标暂存篮</span>
        <el-tag size="small" type="primary" effect="dark" class="dock-count-tag">
          {{ cartStore.count }}/8
        </el-tag>
      </div>

      <div class="dock-chips-group">
        <el-tag
          v-for="item in cartStore.cartItems"
          :key="item.id"
          closable
          effect="plain"
          size="default"
          class="dock-chip"
          @close="cartStore.removeItem(item.id)"
        >
          <span class="chip-group-prefix" v-if="item.group_name">[{{ item.group_name }}]</span>
          <span class="chip-name" :title="item.project_name">{{ item.project_name }}</span>
        </el-tag>
      </div>

      <div class="dock-actions">
        <el-button size="small" link type="info" @click="cartStore.clearCart" class="dock-btn-clear">
          清空
        </el-button>
        <el-button
          type="primary"
          size="small"
          round
          :disabled="cartStore.count < 2"
          @click="emit('start-compare')"
          class="dock-btn-compare"
        >
          🚀 开始对标 ({{ cartStore.count }})
        </el-button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useBenchmarkCartStore } from '@/store/benchmarkCartStore';

const emit = defineEmits<{
  (e: 'start-compare'): void;
}>();

const cartStore = useBenchmarkCartStore();
</script>

<style scoped>
.floating-benchmark-dock {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 22px;
  background: var(--el-bg-color-overlay, #ffffff);
  border: 1px solid var(--el-border-color-light, #dcdfe6);
  border-radius: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(12px);
}

.dock-badge-title {
  font-size: 13px; /* >= 12px 生理底线 */
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.dock-icon {
  font-size: 16px;
}

.dock-count-tag {
  font-size: 12px;
  font-weight: 700;
  padding: 0 6px;
}

.dock-chips-group {
  display: flex;
  gap: 8px;
  max-width: 520px;
  overflow-x: auto;
  padding: 2px 0;
  align-items: center;
}

/* 隐藏滚动条但保留滚动功能 */
.dock-chips-group::-webkit-scrollbar {
  height: 4px;
}
.dock-chips-group::-webkit-scrollbar-thumb {
  background: var(--el-border-color-darker);
  border-radius: 4px;
}

.dock-chip {
  font-size: 12px; /* >= 12px 生理底线 */
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-group-prefix {
  font-weight: 600;
  color: var(--el-color-primary);
  font-size: 12px;
}

.chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.dock-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}

.dock-btn-clear {
  font-size: 12px;
}

.dock-btn-compare {
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
}

/* 动画过渡 */
.dock-slide-enter-active,
.dock-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.dock-slide-enter-from,
.dock-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, 30px);
}
</style>
