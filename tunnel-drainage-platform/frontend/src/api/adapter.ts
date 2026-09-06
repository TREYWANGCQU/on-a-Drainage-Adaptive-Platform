// frontend/src/api/adapter.ts

/**
 * 前端 API 动态适配器
 * 区分桌面独立容器 (Tauri 伴生回环端口) 与 Web 服务器模式 (Nginx 相对路径 / 环境变量)
 */
export function resolveApiBaseUrl(): string {
  // 1. 优先检查桌面端注入的动态回环基准地址 (由 Tauri 宿主进程动态分配与注入)
  if (typeof window !== 'undefined') {
    const desktopBase = (window as any).__DESKTOP_API_BASE__;
    if (desktopBase && typeof desktopBase === 'string') {
      return desktopBase.replace(/\/+$/, '');
    }

    // 2. 检查 Tauri 容器特征标识
    if ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__) {
      // 若尚未注入，使用默认回环基准兜底
      return 'http://127.0.0.1:18000/api/v1';
    }
  }

  // 3. Web 协作模式：若显式配置了完整 HTTP 环境变量则使用环境变量
  const envBase = import.meta.env.VITE_API_BASE_URL;
  if (envBase && typeof envBase === 'string' && envBase.startsWith('http')) {
    return envBase.replace(/\/+$/, '');
  }

  // 4. Web 协作模式默认：使用同源相对路径，交由 Nginx 执行反向代理与长时超时控制
  return '/api/v1';
}
