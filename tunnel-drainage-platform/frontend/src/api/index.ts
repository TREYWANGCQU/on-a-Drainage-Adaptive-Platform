// 文件路径: tunnel-drainage-platform\frontend\src\api\index.ts

import axios from 'axios';
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';

import { resolveApiBaseUrl } from './adapter';
import { useAuthStore } from '../store/authStore';

/**
 * 实例化 Axios 并配置基础参数
 * baseURL 由 resolveApiBaseUrl 动态计算 (桌面端回环 / Web端反向代理)
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 30000,
  headers: {
    'accept': 'application/json',
    'Content-Type': 'application/json',
  },
});

// 在每次请求前动态复核最新 baseURL，防止桌面端异步握手注入完成后仍使用旧基准地址
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const dynamicBase = resolveApiBaseUrl();
  if (dynamicBase && (!config.baseURL || config.baseURL.includes('localhost:8000') || config.baseURL === '/api/v1')) {
    config.baseURL = dynamicBase;
  }
  return config;
});

const STORAGE_KEY_TOKEN = 'platform_operator_token';

let isReauthenticating = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
  config: InternalAxiosRequestConfig;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      if (prom.config.headers && token) {
        prom.config.headers['X-Operator-Token'] = token;
        prom.config.headers['Authorization'] = `Bearer ${token}`;
      }
      prom.resolve(apiClient(prom.config));
    }
  });
  failedQueue = [];
};

/**
 * 请求拦截器：组装 X-Operator-Token / Bearer Token 鉴权头
 * 适用于平台敏感写操作、高耗算力有限元计算及第三方管廊系统集成
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const opToken = sessionStorage.getItem(STORAGE_KEY_TOKEN) || localStorage.getItem(STORAGE_KEY_TOKEN);
    if (opToken && config.headers) {
      config.headers['X-Operator-Token'] = opToken;
      config.headers['Authorization'] = `Bearer ${opToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * 响应拦截器：统一处理 HTTP 异常
 * 内置 Single-Flight 并发互斥门禁，当凭证失效或收到 401 时激活操作认证弹窗并排队重发
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // 直接返回业务数据报文
    return response.data;
  },
  async (error) => {
    // 若请求是被 AbortController 主动取消，静默放行
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean });
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/verify') || originalRequest?.url?.includes('/auth/status');

    // 捕获 401 且非认证端点自身，激活 Single-Flight 重验门禁
    if (error.response && error.response.status === 401 && !isAuthEndpoint && originalRequest) {
      if (!originalRequest._retry) {
        originalRequest._retry = true;

        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject, config: originalRequest });

          if (!isReauthenticating) {
            isReauthenticating = true;
            try {
              const authStore = useAuthStore();
              authStore.wrapActionWithAuth(
                () => {
                  const newToken = authStore.token;
                  isReauthenticating = false;
                  processQueue(null, newToken);
                },
                '会话已超时，请重新认证'
              ).catch((authErr) => {
                isReauthenticating = false;
                processQueue(authErr, null);
              });
            } catch (err) {
              isReauthenticating = false;
              processQueue(err, null);
            }
          }
        });
      }
    }

    const errorMsg = error.response?.data?.detail || error.message || '计算服务响应异常';
    ElMessage.error(`数据交互失败: ${errorMsg}`);
    return Promise.reject(error);
  }
);

/**
 * 定义计算契约接口
 * @param payload 完整的工程水文与地质参数组合 (SingleTubeParams | DoubleTubeParams)
 * @param options 可选配置项，支持自定义超时 (默认 120s) 与 AbortSignal 取消信号
 * @returns 包含间距、孔径等优化布置结果的 Promise
 * 
 * 注：UI 层级在“开始计算”按钮绑定防抖 (lodash.debounce) 点击事件后，
 * 提取 useParameterStore().currentPayload 作为入参调用此函数。
 * 收到返回值后，通过 useSnapshotStore().createSnapshot() 存档并推送至 3D 渲染模块。
 */
export const calculateDrainage = async (
  payload: Record<string, any>,
  options?: { timeout?: number; signal?: AbortSignal }
): Promise<any> => {
  return apiClient.post('/calculate/drainage', payload, {
    timeout: options?.timeout ?? 120000,
    signal: options?.signal,
  });
};

export default apiClient;