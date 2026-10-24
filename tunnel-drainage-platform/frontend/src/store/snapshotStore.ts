// frontend/src/store/snapshotStore.ts
import { defineStore } from 'pinia';
import { useParameterStore } from './parameterStore';
import apiClient from '@/api/index';

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
  status?: 'pending' | 'calculating' | 'paused' | 'done' | 'error'; // 扩展 5 态计算生命周期
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
  status?: 'pending' | 'calculating' | 'paused' | 'done' | 'error';
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
    refresh3DTrigger: 0,                   // 手动刷新 3D 触发因子
    activeSegmentId: null as string | null // 当前 3D 视口聚焦与受力分析选中的活动分段 ID
  }),

  getters: {
    activeSnapshot(state): Snapshot | null {
      if (!state.activeSegmentId) return null;
      return state.snapshots.find(s => s.id === state.activeSegmentId) || null;
    }
  },

  actions: {
    // 触发 3D 重新绘制
    trigger3DRefresh() {
      this.refresh3DTrigger++;
    },

    // 设置当前活动计算段
    setActiveSegment(id: string | null) {
      this.activeSegmentId = id;
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

    // 同步写入本地存储（带 QuotaExceededError 溢出降级防御）
    saveToLocal() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshots));
        localStorage.setItem(SEQUENCE_KEY, JSON.stringify(this.sequences));
      } catch (err: any) {
        if (err.name === 'QuotaExceededError' || err.code === 22 || err.number === -2147024882) {
          console.warn('LocalStorage 存储配额超限，启用轻量化脱敏持久化模式...');
          try {
            // 降级策略：剥离非当前活动快照中庞大的 echart_data 绘图节点数组，保留全部工程关键状态标量
            const lightweightSnapshots = this.snapshots.map(s => {
              if (!s.results) return s;
              const copy = JSON.parse(JSON.stringify(s));
              if (copy.id !== this.activeSegmentId && copy.results.echart_data) {
                delete copy.results.echart_data;
              }
              return copy;
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweightSnapshots));
            localStorage.setItem(SEQUENCE_KEY, JSON.stringify(this.sequences));
          } catch (e) {
            console.error('脱敏持久化依然超限:', e);
          }
        } else {
          console.error('LocalStorage 写入异常:', err);
        }
      }
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
      if (this.activeSegmentId === id) {
        this.activeSegmentId = null;
      }
      this.saveToLocal();
      this.trigger3DRefresh();
    },

    // 批量删除快照
    batchDeleteSnapshots(ids: string[]) {
      if (!ids || ids.length === 0) return;
      const idSet = new Set(ids);
      this.snapshots = this.snapshots.filter(s => !idSet.has(s.id));
      if (this.activeSegmentId && idSet.has(this.activeSegmentId)) {
        this.activeSegmentId = null;
      }
      this.saveToLocal();
      this.trigger3DRefresh();
    },

    // 一键清空全量快照
    clearAllSnapshots() {
      this.snapshots = [];
      this.sequences = [];
      this.activeSegmentId = null;
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
    },

    /**
     * 从数据库记录批量反序列化并自适应还原快照池
     * 关键要求：
     * 1. 自动识别纯计算参数（results_json 为空）与带成果工况，分别赋予 'pending' 与 'done'；
     * 2. 还原后自动激活首个分段同步至表单，实现视口与配置即时响应；
     * 3. 触发 3D 重新组装渲染。
     */
    restoreSnapshotsFromDatabase(dbRecords: any[], options: { mode: 'replace' | 'append' } = { mode: 'replace' }) {
      if (!dbRecords || dbRecords.length === 0) return;

      const restoredSnapshots: Snapshot[] = dbRecords.map(rec => {
        const parsedParams = typeof rec.parameters_json === 'string' 
          ? JSON.parse(rec.parameters_json) 
          : rec.parameters_json;
        const parsedResults = rec.results_json 
          ? (typeof rec.results_json === 'string' ? JSON.parse(rec.results_json) : rec.results_json) 
          : null;
        
        // 核心判定：是否包含有效的水力学或临界加固计算成果
        const hasResults = Boolean(parsedResults && (parsedResults.original_state || parsedResults.critical_state));

        return {
          id: `snap_db_${rec.id}`,
          timestamp: new Date(rec.created_at).getTime(),
          remark: rec.project_name,
          start_chainage: rec.start_chainage ?? parsedParams.start_chainage ?? 0.0,
          end_chainage: rec.end_chainage ?? parsedParams.end_chainage ?? 0.0,
          params: parsedParams,
          results: parsedResults, // 🟢 保真注入计算成果字典（纯参数则为 null）
          status: hasResults ? 'done' : 'pending', // 🟢 有成果赋 'done'，纯参数赋 'pending'
          hasCriticalState: checkHasCriticalState({ results: parsedResults }),
          selectedFor3D: true // 默认选中参与 3D 全线组装
        };
      });

      if (options.mode === 'replace') {
        this.snapshots = restoredSnapshots;
      } else {
        // 追加合并模式（按 ID/桩号排重）
        const existingIds = new Set(this.snapshots.map(s => s.id));
        restoredSnapshots.forEach(s => {
          if (!existingIds.has(s.id)) this.snapshots.push(s);
        });
      }

      // 联动激活：将载入集合中的首个分段设为当前活动工况，并同步回主表单
      if (restoredSnapshots.length > 0) {
        const firstSnap = restoredSnapshots[0];
        this.setActiveSegment(firstSnap.id);
        const paramStore = useParameterStore();
        paramStore.overrideAll(firstSnap.params, firstSnap.params.tunnel_type, firstSnap.results);
      }

      this.saveToLocal();
      this.trigger3DRefresh(); // 立即触发 3D 空间隧道瞬时组装重构
    },

    /**
     * 将快照批量打包持久化入库至后端数据库
     */
    async batchArchiveToDatabase(groupInfo: {
      groupName: string;
      engineeringCategory: "公路" | "铁路" | "城市道路" | "城市轨道" | "水工" | "综合管廊" | "其他";
      description?: string;
      namingPattern?: "standard_station" | "metric_range" | "indexed_station";
      conflictMode?: "append" | "overwrite" | "create_new";
      stripCharts?: boolean;
    }, targetSnapshots: Snapshot[]) {
      if (!targetSnapshots || targetSnapshots.length === 0) {
        throw new Error('没有待入库的快照分段');
      }

      const payload = {
        group_name: groupInfo.groupName,
        engineering_category: groupInfo.engineeringCategory,
        description: groupInfo.description || '',
        naming_pattern: groupInfo.namingPattern || 'standard_station',
        conflict_mode: groupInfo.conflictMode || 'overwrite',
        segments: targetSnapshots.map(s => {
          let cleanResults = null;
          if (s.results) {
            cleanResults = JSON.parse(JSON.stringify(s.results));
            if (groupInfo.stripCharts && cleanResults.echart_data) {
              delete cleanResults.echart_data;
            }
          }
          return {
            remark: s.remark,
            start_chainage: s.start_chainage,
            end_chainage: s.end_chainage,
            parameters_json: s.params,
            results_json: cleanResults
          };
        })
      };

      const res: any = await apiClient.post('/database/parameters/batch', payload);
      return res;
    }
  }
});