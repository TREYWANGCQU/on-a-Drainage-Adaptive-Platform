// frontend/src/utils/batchScheduler.ts

import { ref, computed } from 'vue';
import type { Snapshot } from '@/store/snapshotStore';
import { useSnapshotStore } from '@/store/snapshotStore';
import { calculateDrainage } from '@/api/index';
import axios from 'axios';

/**
 * 节流工具函数（零外部依赖，带尾部延迟调用）
 */
function createThrottle<T extends (...args: any[]) => any>(fn: T, delayMs: number): T {
  let timer: any = null;
  let lastArgs: any[] | null = null;
  return function (this: any, ...args: any[]) {
    if (timer) {
      lastArgs = args;
      return;
    }
    fn.apply(this, args);
    timer = setTimeout(() => {
      timer = null;
      if (lastArgs) {
        fn.apply(this, lastArgs);
        lastArgs = null;
      }
    }, delayMs);
  } as T;
}

/**
 * 工况复杂度轻量级先验启发式分级
 * O(1) 轻量级准则：若设计水头远小于拱顶埋深且围岩等级较好(I~III级)，大概率属于无需临界迭代的快速安全工况
 */
export function estimateSegmentComplexity(params: any): 'fast' | 'iterative' {
  if (!params) return 'fast';
  const gradeStr = String(params.grades ?? '');
  const isGoodRock = ['1', '2', '3', 'I', 'II', 'III', '一', '二', '三'].some(g => gradeStr.includes(g));
  const waterHead = Number(params.H ?? params.h ?? 0);
  const depth = Math.max(1, Number(params.h_1 ?? params.ha ?? params.depth ?? 100));
  const waterDepthRatio = waterHead / depth;

  if (isGoodRock && waterDepthRatio < 0.3) {
    return 'fast';
  }
  return 'iterative';
}

/**
 * 基于双通道 EWMA 与低通平滑滤波的动态剩余时间预估器
 */
export class AdaptiveEtaPredictor {
  private avgFastMs: number = 25.0;     // 快速工况加权平均耗时（默认基准 25ms）
  private avgIterMs: number = 180.0;    // 迭代工况加权平均耗时（默认基准 180ms）
  private readonly alpha: number = 0.2; // EWMA 平滑更新权重
  private lastSmoothedSeconds: number | null = null;
  private lastSampleTime: number = Date.now();
  private completedSamples: number = 0;
  private startTime: number = Date.now();

  public reset(): void {
    this.avgFastMs = 25.0;
    this.avgIterMs = 180.0;
    this.lastSmoothedSeconds = null;
    this.lastSampleTime = Date.now();
    this.completedSamples = 0;
    this.startTime = Date.now();
  }

  /**
   * 记录一次真实计算返回的耗时样本
   */
  public recordSample(type: 'fast' | 'iterative', durationMs: number): void {
    if (durationMs <= 0 || !isFinite(durationMs)) return;
    if (type === 'fast') {
      this.avgFastMs = this.alpha * durationMs + (1 - this.alpha) * this.avgFastMs;
    } else {
      this.avgIterMs = this.alpha * durationMs + (1 - this.alpha) * this.avgIterMs;
    }
    this.completedSamples++;
    this.lastSampleTime = Date.now();
  }

  /**
   * 计算当前剩余时间文本与处理速度
   */
  public predictEtaText(
    remainingFastCount: number,
    remainingIterCount: number,
    concurrency: number
  ): { etaText: string; speedText: string } {
    const totalRemaining = remainingFastCount + remainingIterCount;
    if (totalRemaining <= 0) {
      return { etaText: '即将完成', speedText: this.calcSpeedText() };
    }

    const c = Math.max(1, concurrency);
    const overhead = 1.08; // RTT 与序列化系数
    const rawTotalMs = (remainingFastCount * this.avgFastMs + remainingIterCount * this.avgIterMs) / c * overhead;
    const rawSeconds = Math.max(0.5, rawTotalMs / 1000);

    let displaySeconds = rawSeconds;
    if (this.lastSmoothedSeconds !== null) {
      const delta = rawSeconds - this.lastSmoothedSeconds;
      // 非对称平滑滤波：下降步长最大 1.5s，上升步长最大 3.0s
      const clampedDelta = Math.max(-1.5, Math.min(3.0, delta));
      displaySeconds = Math.max(0.5, this.lastSmoothedSeconds + clampedDelta);
    }
    this.lastSmoothedSeconds = displaySeconds;

    return {
      etaText: this.formatSeconds(displaySeconds),
      speedText: this.calcSpeedText()
    };
  }

  private calcSpeedText(): string {
    const elapsedSec = (Date.now() - this.startTime) / 1000;
    if (elapsedSec < 0.8 || this.completedSamples === 0) {
      return '测速中...';
    }
    const speed = this.completedSamples / elapsedSec;
    if (speed >= 10) {
      return `${Math.round(speed)} 段/秒`;
    }
    return `${speed.toFixed(1)} 段/秒`;
  }

  private formatSeconds(totalSeconds: number): string {
    const sec = Math.round(totalSeconds);
    if (sec <= 1) return '约 1 秒';
    if (sec < 60) return `约 ${sec} 秒`;
    const mins = Math.floor(sec / 60);
    const remSec = sec % 60;
    if (remSec === 0) return `约 ${mins} 分钟`;
    return `约 ${mins} 分 ${remSec} 秒`;
  }
}

/**
 * 批处理任务调度引擎（支持暂停、继续、中断、重试及状态机联动）
 */
export class BatchScheduler {
  // 响应式状态暴露
  public isRunning = ref<boolean>(false);
  public isPaused = ref<boolean>(false);
  public totalTasks = ref<number>(0);
  public completedCount = ref<number>(0);
  public failedCount = ref<number>(0);
  public calculatingCount = ref<number>(0);
  public pausedCount = ref<number>(0);
  public progressPercent = ref<number>(0);
  public etaText = ref<string>('等待开始');
  public speedText = ref<string>('-');
  public statusText = ref<string>('就绪');

  // 内部工作队列与状态机控制
  private concurrency: number = 3;
  private pendingQueue: Snapshot[] = [];
  private inFlightControllers = new Map<string, AbortController>();
  private pauseRequested: boolean = false;
  private cancelRequested: boolean = false;
  private etaPredictor = new AdaptiveEtaPredictor();

  // 节流落盘器 (500ms 间隔)
  private throttledSave = createThrottle(() => {
    const store = useSnapshotStore();
    store.saveToLocal();
  }, 500);

  constructor(concurrency: number = 3) {
    this.concurrency = concurrency;
  }

  /**
   * 启动批处理任务
   * @param targetSnapshots 待处理快照集合（若未传入则默认拉取 store 中所有未完成项）
   * @param onlyFailed 是否仅重试失败项
   */
  public async start(targetSnapshots?: Snapshot[], onlyFailed: boolean = false): Promise<void> {
    const store = useSnapshotStore();
    let taskList: Snapshot[];

    if (targetSnapshots && targetSnapshots.length > 0) {
      taskList = targetSnapshots;
    } else {
      taskList = store.snapshots;
    }

    if (onlyFailed) {
      taskList = taskList.filter(s => s.status === 'error');
    } else {
      // 提取 pending、paused 或没有 results 的工况，已计算 (done) 的物理锁死跳过
      taskList = taskList.filter(s => s.status === 'pending' || s.status === 'paused' || (!s.results && s.status !== 'done'));
    }

    if (taskList.length === 0) {
      this.statusText.value = '没有待计算的工况';
      return;
    }

    // 重置控制器状态
    this.isRunning.value = true;
    this.isPaused.value = false;
    this.pauseRequested = false;
    this.cancelRequested = false;
    this.inFlightControllers.clear();
    this.etaPredictor.reset();

    this.pendingQueue = [...taskList];
    this.totalTasks.value = taskList.length;
    this.completedCount.value = 0;
    this.failedCount.value = 0;
    this.calculatingCount.value = 0;
    this.pausedCount.value = 0;
    this.progressPercent.value = 0;
    this.statusText.value = `正在并发计算中 (并发度: ${this.concurrency})...`;

    // 预分类剩余工况复杂度
    this.updateEtaDisplay();

    // 启动工作协程池
    const workerPromises: Promise<void>[] = [];
    const actualConcurrency = Math.min(this.concurrency, this.pendingQueue.length);

    for (let i = 0; i < actualConcurrency; i++) {
      workerPromises.push(this.runWorker(i + 1));
    }

    await Promise.all(workerPromises);

    // 运行收尾处理
    this.isRunning.value = false;
    this.calculatingCount.value = 0;

    if (this.cancelRequested) {
      this.statusText.value = '计算已终止';
      this.etaText.value = '已停止';
    } else if (this.isPaused.value) {
      this.statusText.value = '计算已暂停 (已保留全部已算结果)';
      this.etaText.value = '已暂停';
    } else {
      this.statusText.value = this.failedCount.value > 0
        ? `计算完成，成功 ${this.completedCount.value} 项，失败 ${this.failedCount.value} 项`
        : `全部计算完毕，成功完成 ${this.completedCount.value} 个工况！`;
      this.etaText.value = '已完成';
      this.progressPercent.value = 100;
    }

    // 强制同步刷盘并通知 3D 视口装配
    store.saveToLocal();
    store.trigger3DRefresh();
  }

  /**
   * 临时暂停计算：取消正在传输的 HTTP 请求并保留已算数据
   */
  public pause(): void {
    if (!this.isRunning.value || this.isPaused.value) return;
    this.pauseRequested = true;
    this.isPaused.value = true;
    this.statusText.value = '正在暂停任务...';

    // 取消所有当前正在执行的网络连接
    this.inFlightControllers.forEach((controller, snapId) => {
      controller.abort();
      const store = useSnapshotStore();
      const target = store.snapshots.find(s => s.id === snapId);
      if (target && target.status === 'calculating') {
        target.status = 'paused';
      }
    });
    this.inFlightControllers.clear();

    const store = useSnapshotStore();
    store.saveToLocal();
  }

  /**
   * 继续计算：从暂停断点处无缝接续
   */
  public resume(): void {
    if (this.isRunning.value && !this.isPaused.value) return;
    this.start();
  }

  /**
   * 彻底终止任务
   */
  public cancel(): void {
    if (!this.isRunning.value) return;
    this.cancelRequested = true;
    this.pauseRequested = false;
    this.statusText.value = '正在终止任务...';

    this.inFlightControllers.forEach((controller, snapId) => {
      controller.abort();
      const store = useSnapshotStore();
      const target = store.snapshots.find(s => s.id === snapId);
      if (target && target.status === 'calculating') {
        target.status = 'pending';
      }
    });
    this.inFlightControllers.clear();

    const store = useSnapshotStore();
    store.saveToLocal();
  }

  /**
   * 仅重试计算失败的工况
   */
  public retryFailed(): void {
    this.start(undefined, true);
  }

  /**
   * 单个工作协程循环
   */
  private async runWorker(workerId: number): Promise<void> {
    const store = useSnapshotStore();

    while (this.pendingQueue.length > 0) {
      if (this.pauseRequested || this.cancelRequested) {
        break;
      }

      const snap = this.pendingQueue.shift();
      if (!snap) break;

      // 若快照已在其他通道完成，严格跳过
      if (snap.status === 'done' && snap.results) {
        continue;
      }

      const controller = new AbortController();
      this.inFlightControllers.set(snap.id, controller);
      snap.status = 'calculating';
      this.calculatingCount.value = this.inFlightControllers.size;

      const compType = estimateSegmentComplexity(snap.params);
      const t0 = performance.now();

      try {
        const payload = snap.params || {};
        const res = await calculateDrainage(payload, {
          timeout: 120000,
          signal: controller.signal
        });

        // 成功响应：单段即刻内存落盘，物理锁死
        snap.results = res;
        snap.status = 'done';
        snap.hasCriticalState = Boolean(res?.critical_state && Object.keys(res.critical_state).length > 0);
        this.completedCount.value++;

        const duration = (res && typeof res.duration_ms === 'number') ? res.duration_ms : (performance.now() - t0);
        this.etaPredictor.recordSample(compType, duration);

        // 触发轻量级节流刷盘
        this.throttledSave();
      } catch (err: any) {
        if (axios.isCancel(err) || err.name === 'CanceledError' || err.name === 'AbortError') {
          // 用户主动触发暂停或终止
          if (this.pauseRequested) {
            snap.status = 'paused';
            this.pausedCount.value++;
          } else {
            snap.status = 'pending';
          }
        } else {
          console.error(`分段 ${snap.remark || snap.id} 计算异常:`, err);
          snap.status = 'error';
          this.failedCount.value++;
        }
      } finally {
        this.inFlightControllers.delete(snap.id);
        this.calculatingCount.value = this.inFlightControllers.size;
        this.updateProgress();
        this.updateEtaDisplay();
      }
    }
  }

  private updateProgress(): void {
    const finished = this.completedCount.value + this.failedCount.value;
    const total = Math.max(1, this.totalTasks.value);
    this.progressPercent.value = Math.min(100, Math.round((finished / total) * 100));
  }

  private updateEtaDisplay(): void {
    let fastCount = 0;
    let iterCount = 0;

    for (const snap of this.pendingQueue) {
      if (estimateSegmentComplexity(snap.params) === 'fast') {
        fastCount++;
      } else {
        iterCount++;
      }
    }

    const { etaText, speedText } = this.etaPredictor.predictEtaText(
      fastCount,
      iterCount,
      this.concurrency
    );
    this.etaText.value = etaText;
    this.speedText.value = speedText;
  }
}

// 导出全局单例，供 SnapshotSidebar 与全局各模块共享调度状态
export const globalBatchScheduler = new BatchScheduler(3);
