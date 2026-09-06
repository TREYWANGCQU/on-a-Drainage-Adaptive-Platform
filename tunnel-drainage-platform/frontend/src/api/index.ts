// 文件路径: tunnel-drainage-platform\frontend\src\api\index.ts

import axios from 'axios';
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';

import { resolveApiBaseUrl } from './adapter';

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

/**
 * 请求拦截器：组装 Bearer Token 鉴权头
 * 适用于向第三方综合管廊平台或协同系统输出 API 时的身份核验
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * 响应拦截器：统一处理 HTTP 异常
 * 将底层网络错误或业务逻辑异常转化为可视化的 UI 提示
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // 直接返回业务数据报文
    return response.data;
  },
  (error) => {
    const errorMsg = error.response?.data?.detail || error.message || '计算服务响应异常';
    ElMessage.error(`数据交互失败: ${errorMsg}`);
    return Promise.reject(error);
  }
);

/**
 * 定义计算契约接口
 * @param payload 完整的工程水文与地质参数组合 (SingleTubeParams | DoubleTubeParams)
 * @returns 包含间距、孔径等优化布置结果的 Promise
 * * 注：UI 层级在“开始计算”按钮绑定防抖 (lodash.debounce) 点击事件后，
 * 提取 useParameterStore().currentPayload 作为入参调用此函数。
 * 收到返回值后，通过 useSnapshotStore().createSnapshot() 存档并推送至 3D 渲染模块。
 */
export const calculateDrainage = async (payload: Record<string, any>): Promise<any> => {
  return apiClient.post('/calculate/drainage', payload);
};

export default apiClient;