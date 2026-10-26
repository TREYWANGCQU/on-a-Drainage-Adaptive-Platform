// frontend/src/utils/downloadHelper.ts

import { h } from 'vue';
import { ElNotification, ElButton, ElMessage } from 'element-plus';

/**
 * 探测当前前端是否运行于 Tauri 独立桌面环境
 */
export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
}

/**
 * 调起系统下载文件夹（在桌面单机模式下调起 Windows 资源管理器）
 */
export async function openDownloadsFolder(): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const targetPath = await invoke<string>('open_downloads_folder');
      ElMessage.success(`已打开系统下载目录: ${targetPath}`);
    } catch (err: any) {
      console.error('调起下载目录失败:', err);
      ElMessage.warning(`无法自动调起资源管理器: ${err?.message || err}，请手动前往 Downloads 目录`);
    }
  } else {
    ElMessage.info('当前运行于浏览器端，文件已保存至浏览器默认“下载”目录');
  }
}

/**
 * 统一弹出包含落盘路径感知与桌面端“打开下载文件夹”直达按钮的通知卡片
 */
export function notifyDownloadComplete(filename: string, fileTypeDesc: string = '产物文件'): void {
  const isDesktop = isTauriEnvironment();

  ElNotification({
    title: `${fileTypeDesc}导出成功`,
    type: 'success',
    duration: 6000,
    message: h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          paddingTop: '4px'
        }
      },
      [
        h(
          'div',
          {
            style: {
              fontSize: '13px',
              lineHeight: '1.5',
              color: 'var(--el-text-color-regular)'
            }
          },
          [
            h('span', '文件 '),
            h(
              'code',
              {
                style: {
                  color: 'var(--el-color-primary)',
                  fontWeight: '600',
                  wordBreak: 'break-all',
                  backgroundColor: 'var(--el-fill-color-light)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '12px'
                }
              },
              filename
            ),
            h('span', ' 已保存至系统【下载】文件夹 (Downloads)。')
          ]
        ),
        isDesktop
          ? h(
              ElButton,
              {
                type: 'primary',
                size: 'small',
                plain: true,
                style: {
                  alignSelf: 'flex-start',
                  marginTop: '4px',
                  fontSize: '12px',
                  borderRadius: '6px'
                },
                onClick: (e: MouseEvent) => {
                  e.stopPropagation();
                  openDownloadsFolder();
                }
              },
              () => '📂 打开所在文件夹'
            )
          : null
      ]
    )
  });
}

/**
 * 触发标准的浏览器 Blob 二进制对象下载，并统一挂载落盘路径感知通知
 */
export function triggerBrowserBlobDownload(
  blob: Blob,
  filename: string,
  fileTypeDesc: string = '工程产物'
): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, 400);

  // 统一触发落盘路径感知通知卡片
  notifyDownloadComplete(filename, fileTypeDesc);
}
