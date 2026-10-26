// frontend/src/store/benchmarkCartStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';

export interface BenchmarkItemMeta {
  id: number;
  group_id: number | null;
  group_name: string;
  project_name: string;
  tunnel_type: string;
  start_chainage: number;
  end_chainage: number;
  safety_factor: number | null;
}

export const useBenchmarkCartStore = defineStore('benchmarkCart', () => {
  const MAX_CAPACITY = 8; // 对标分析最多容纳 8 根柱/列对比，避免横向过度挤压
  const cartItems = ref<BenchmarkItemMeta[]>([]);

  // 本地存储持久化恢复
  const initFromStorage = () => {
    const raw = localStorage.getItem('TUNNEL_BENCHMARK_CART');
    if (raw) {
      try {
        cartItems.value = JSON.parse(raw);
      } catch (e) {
        cartItems.value = [];
      }
    }
  };

  const syncToStorage = () => {
    localStorage.setItem('TUNNEL_BENCHMARK_CART', JSON.stringify(cartItems.value));
  };

  const isPinned = computed(() => {
    return (id: number) => cartItems.value.some(item => item.id === id);
  });

  const count = computed(() => cartItems.value.length);

  const addItem = (item: BenchmarkItemMeta) => {
    if (isPinned.value(item.id)) {
      ElMessage.info('该工程分段已在对标暂存篮中');
      return;
    }
    if (cartItems.value.length >= MAX_CAPACITY) {
      ElMessage.warning(`对标暂存篮已满 (上限 ${MAX_CAPACITY} 项)，请先移除非必要对比段`);
      return;
    }
    cartItems.value.push(item);
    syncToStorage();
    ElMessage.success(`已将 [${item.project_name}] 加入对标暂存篮`);
  };

  const removeItem = (id: number) => {
    cartItems.value = cartItems.value.filter(item => item.id !== id);
    syncToStorage();
  };

  const clearCart = () => {
    cartItems.value = [];
    syncToStorage();
  };

  // 初始化即刻执行
  initFromStorage();

  return {
    cartItems,
    count,
    isPinned,
    addItem,
    removeItem,
    clearCart,
    initFromStorage
  };
});
