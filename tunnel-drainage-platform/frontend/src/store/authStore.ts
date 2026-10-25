// tunnel-drainage-platform/frontend/src/store/authStore.ts

import { defineStore } from 'pinia';
import axios from 'axios';
import { resolveApiBaseUrl } from '../api/adapter';

export interface AuthStatusResponse {
  auth_required: boolean;
  auth_mode: 'server' | 'desktop' | 'disabled';
  session_timeout_minutes: number;
  has_custom_secret: boolean;
}

export interface VerifySuccessData {
  token: string;
  expires_at: number; // 秒级时间戳
  expires_in_seconds: number;
  auth_mode: string;
}

const STORAGE_KEY_TOKEN = 'platform_operator_token';
const STORAGE_KEY_EXPIRES = 'platform_operator_expires_at';

export const useAuthStore = defineStore('authStore', {
  state: () => {
    // 优先读取持久化（localStorage/sessionStorage）
    const storedToken = sessionStorage.getItem(STORAGE_KEY_TOKEN) || localStorage.getItem(STORAGE_KEY_TOKEN);
    const storedExp = sessionStorage.getItem(STORAGE_KEY_EXPIRES) || localStorage.getItem(STORAGE_KEY_EXPIRES);
    const expiresAt = storedExp ? parseInt(storedExp, 10) : null;

    return {
      token: storedToken || null,
      expiresAt: expiresAt || null,
      authRequired: true,
      authMode: 'server' as 'server' | 'desktop' | 'disabled',
      hasCustomSecret: false,
      sessionTimeoutMinutes: 120,

      // 弹窗状态与挂起动作
      isDialogVisible: false,
      pendingActionName: '敏感操作',
      pendingActionCallback: null as (() => any) | null,
      pendingActionReject: null as ((err: any) => void) | null,

      // 参数表单软锁机制：默认锁定，防止误触，载入历史成果免密放行
      isFormUnlocked: false,
    };
  },

  getters: {
    /**
     * 当前是否持有效凭证
     */
    isAuthorized(state): boolean {
      if (!state.authRequired || state.authMode === 'disabled') {
        return true;
      }
      if (!state.token || !state.expiresAt) {
        return false;
      }
      const nowSeconds = Math.floor(Date.now() / 1000);
      return state.expiresAt > nowSeconds;
    },

    /**
     * 剩余授权有效分钟数
     */
    remainingMinutes(state): number {
      if (!state.expiresAt) return 0;
      const nowSeconds = Math.floor(Date.now() / 1000);
      const diff = state.expiresAt - nowSeconds;
      return diff > 0 ? Math.ceil(diff / 60) : 0;
    }
  },

  actions: {
    /**
     * 初始化时从后端感知部署环境与鉴权策略
     */
    async initAuth() {
      // 检查现有 Token 是否过期，过期则自动清理
      if (this.expiresAt) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (this.expiresAt <= nowSeconds) {
          this.clearAuth();
        }
      }

      try {
        const baseUrl = resolveApiBaseUrl();
        const res = await axios.get<AuthStatusResponse>(`${baseUrl}/auth/status`, { timeout: 5000 });
        if (res.data) {
          this.authRequired = res.data.auth_required;
          this.authMode = res.data.auth_mode;
          this.hasCustomSecret = res.data.has_custom_secret;
          this.sessionTimeoutMinutes = res.data.session_timeout_minutes || 120;
        }
      } catch (err) {
        // 网络异常时维持安全保守策略 (authRequired = true)
        console.warn('获取后端鉴权策略失败，采用默认保守模式:', err);
      }
    },

    /**
     * 设置会话令牌并持久化
     */
    setSessionToken(token: string, expiresAt: number, rememberMe: boolean = false) {
      this.token = token;
      this.expiresAt = expiresAt;

      if (rememberMe) {
        localStorage.setItem(STORAGE_KEY_TOKEN, token);
        localStorage.setItem(STORAGE_KEY_EXPIRES, expiresAt.toString());
        sessionStorage.removeItem(STORAGE_KEY_TOKEN);
        sessionStorage.removeItem(STORAGE_KEY_EXPIRES);
      } else {
        sessionStorage.setItem(STORAGE_KEY_TOKEN, token);
        sessionStorage.setItem(STORAGE_KEY_EXPIRES, expiresAt.toString());
        localStorage.removeItem(STORAGE_KEY_TOKEN);
        localStorage.removeItem(STORAGE_KEY_EXPIRES);
      }
    },

    /**
     * 主动锁定或清理凭证
     */
    clearAuth() {
      this.token = null;
      this.expiresAt = null;
      this.isFormUnlocked = false;
      sessionStorage.removeItem(STORAGE_KEY_TOKEN);
      sessionStorage.removeItem(STORAGE_KEY_EXPIRES);
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_EXPIRES);
    },

    /**
     * 提交密码完成核验
     */
    async verifyPassword(password: string, rememberMe: boolean = false): Promise<VerifySuccessData> {
      const baseUrl = resolveApiBaseUrl();
      const res = await axios.post(`${baseUrl}/auth/verify`, {
        password,
        remember_me: rememberMe
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      const data: VerifySuccessData = res.data?.data;
      if (data && data.token) {
        this.setSessionToken(data.token, data.expires_at, rememberMe);
        this.isDialogVisible = false;

        // 若存在挂起的待执行操作，自动恢复并调用
        if (this.pendingActionCallback) {
          const cb = this.pendingActionCallback;
          this.pendingActionCallback = null;
          this.pendingActionReject = null;
          try {
            await cb();
          } catch (e) {
            console.error('执行挂起操作发生异常:', e);
          }
        }
        return data;
      }
      throw new Error('未收到有效的认证令牌');
    },

    /**
     * 包装敏感操作：未授权时拦截弹窗，已授权或认证成功后自动无缝调用
     */
    async wrapActionWithAuth<T>(actionFn: () => Promise<T> | T, actionName: string = '敏感操作'): Promise<T | void> {
      if (this.isAuthorized) {
        return await actionFn();
      }

      return new Promise((resolve, reject) => {
        this.pendingActionName = actionName;
        this.pendingActionCallback = async () => {
          try {
            const res = await actionFn();
            resolve(res);
          } catch (err) {
            reject(err);
          }
        };
        this.pendingActionReject = reject;
        this.isDialogVisible = true;
      });
    },

    /**
     * 用户取消认证弹窗
     */
    cancelAuth() {
      this.isDialogVisible = false;
      if (this.pendingActionReject) {
        this.pendingActionReject(new Error('用户取消了操作认证'));
      }
      this.pendingActionCallback = null;
      this.pendingActionReject = null;
    },

    /**
     * 解锁表单
     */
    requestFormUnlock() {
      if (this.isFormUnlocked) return;
      this.wrapActionWithAuth(() => {
        this.isFormUnlocked = true;
      }, '解锁参数表单');
    },

    /**
     * 重新锁定表单
     */
    lockForm() {
      this.isFormUnlocked = false;
    }
  }
});
