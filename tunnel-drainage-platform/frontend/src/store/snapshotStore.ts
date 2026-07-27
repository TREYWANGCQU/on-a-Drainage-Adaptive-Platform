// frontend/src/store/snapshotStore.ts
import { defineStore } from 'pinia';
import { useParameterStore } from './parameterStore';

// --- 类型定义 ---
// 单个快照数据结构
export interface Snapshot {
  id: string;
  timestamp: number;
  remark: string;
  start_chainage: number; // 核心索引：分区起点
  end_chainage: number;   // 核心索引：分区终点
  params: any;            // 保存当时的 parameterStore.currentPayload
  results?: any;          // 保存计算返回结果（如间距、孔径、安全系数）
  status?: 'pending' | 'done' | 'error'; // 计算状态
  hasCriticalState?: boolean;           // 是否包含临界超限加固解
  selectedFor3D?: boolean;              // 3D 渲染勾选状态
}

// 下游几何构建管线标准接口规范
export interface ITunnelParams {
  id: string;
  start_chainage: number;
  end_chainage: number;
  params: any;
  results?: any;
  status?: 'pending' | 'done' | 'error';
  hasCriticalState?: boolean;
}

// 多分区快照序列结构（支撑 3D 组合拼装）
export interface SnapshotSequence {
  sequenceId: string;
  sequenceName: string;
  snapshots: Snapshot[]; // 包含该序列下的全部里程分段快照
}

/**
 * 严格遵循 阶段4-snapshot的特点提取.md 的多级链式降级提取函数
 */
export function extractSnapshotValue<T = any>(
  snap: Snapshot | any,
  key: string,
  defaultValue: T
): T {
  if (!snap) return defaultValue;
  const val = snap.results?.critical_state?.[key]
    ?? snap.results?.original_state?.[key]
    ?? snap.results?.input_parameter?.[key]
    ?? snap.params?.[key]
    ?? snap[key];
  return (val !== undefined && val !== null) ? val : defaultValue;
}

/**
 * 判断快照是否包含有效临界加固解
 */
export function checkHasCriticalState(snap: Snapshot | any): boolean {
  if (!snap || !snap.results) return false;
  return Boolean(snap.results.critical_state && Object.keys(snap.results.critical_state).length > 0);
}

const STORAGE_KEY = 'tunnel_drainage_snapshots';
const SEQUENCE_KEY = 'tunnel_drainage_sequences';

export const useSnapshotStore = defineStore('snapshot', {
  state: () => ({
    snapshots: [] as Snapshot[],           // 散列快照池
    sequences: [] as SnapshotSequence[],   // 聚合序列池（针对多分区）
    refresh3DTrigger: 0                    // 手动刷新 3D 触发因子
  }),

  actions: {
    // 触发 3D 重新绘制
    trigger3DRefresh() {
      this.refresh3DTrigger++;
    },

    // ==========================================
    // 基础 CRUD 操作与本地持久化
    // ==========================================
    
    // 初始化时从本地存储加载
    loadFromLocal() {
      const localSnapshots = localStorage.getItem(STORAGE_KEY);
      const localSequences = localStorage.getItem(SEQUENCE_KEY);
      if (localSnapshots) this.snapshots = JSON.parse(localSnapshots);
      if (localSequences) this.sequences = JSON.parse(localSequences);
    },

    // 同步写入本地存储
    saveToLocal() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshots));
      localStorage.setItem(SEQUENCE_KEY, JSON.stringify(this.sequences));
    },

    // 捕获当前参数状态，生成独立快照
    createSnapshot(remark: string, results?: any) {
      const paramStore = useParameterStore();
      const currentData = JSON.parse(JSON.stringify(paramStore.currentPayload)); // 深拷贝解耦
      
      const hasCritical = results && Boolean(results.critical_state && Object.keys(results.critical_state).length > 0);

      const newSnapshot: Snapshot = {
        id: `snap_${Date.now()}`,
        timestamp: Date.now(),
        remark,
        start_chainage: currentData.start_chainage,
        end_chainage: currentData.end_chainage,
        params: currentData,
        results,
        status: results ? 'done' : 'pending',
        hasCriticalState: hasCritical,
        selectedFor3D: true
      };
      
      this.snapshots.push(newSnapshot);
      this.saveToLocal();
      this.trigger3DRefresh();
      return newSnapshot;
    },

    // 删除单体快照
    deleteSnapshot(id: string) {
      this.snapshots = this.snapshots.filter(s => s.id !== id);
      this.saveToLocal();
      this.trigger3DRefresh();
    },

    // 应用快照至当前表单
    applySnapshot(id: string) {
      const target = this.snapshots.find(s => s.id === id);
      if (target) {
        const paramStore = useParameterStore();
        paramStore.overrideAll(target.params, target.params.tunnel_type, target.results);
      }
    },

    // ==========================================
    // 多分区快照序列管理 (支撑 3D 成果拼接)
    // ==========================================

    // 构建或更新快照序列（适用于 Excel 批量导入后聚合生成）
    buildSequence(sequenceName: string, snapshotList: Snapshot[]) {
      // 按照里程起点进行排序，确保 3D 组装时的空间连续性
      const sortedSnapshots = [...snapshotList].sort((a, b) => a.start_chainage - b.start_chainage);
      
      const newSequence: SnapshotSequence = {
        sequenceId: `seq_${Date.now()}`,
        sequenceName,
        snapshots: sortedSnapshots
      };

      this.sequences.push(newSequence);
      // 同时将列表中的快照推入基础快照池
      sortedSnapshots.forEach(snap => {
        if (!this.snapshots.some(s => s.id === snap.id)) {
          snap.selectedFor3D = true;
          this.snapshots.push(snap);
        }
      });
      
      this.saveToLocal();
      this.trigger3DRefresh();
      return newSequence;
    },

    // 提取聚合序列数据供 3D 画布批量渲染
    getSequenceDataFor3D(sequenceId: string) {
      const targetSequence = this.sequences.find(seq => seq.sequenceId === sequenceId);
      if (!targetSequence) return null;
      
      // 影响范围：提供空间连续性拼装
      return [...targetSequence.snapshots]
        .sort((a, b) => a.start_chainage - b.start_chainage)
        .map(snap => ({
          id: snap.id,
          start_chainage: snap.start_chainage,
          end_chainage: snap.end_chainage,
          params: snap.params,
          results: snap.results,
          status: snap.status ?? (snap.results ? 'done' : 'pending'),
          hasCriticalState: checkHasCriticalState(snap)
        }));
    }
  }
});