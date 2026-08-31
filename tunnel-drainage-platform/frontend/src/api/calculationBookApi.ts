// frontend/src/api/calculationBookApi.ts

import axios from 'axios';
import type { CalculationBookData } from '../utils/calculationBook/bookDataModel';
import type { Snapshot } from '../store/snapshotStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

/**
 * 辅助函数：从 Content-Disposition 响应头提取安全的文件名
 */
function extractFilename(dispositionHeader?: string, defaultName: string = 'export.pdf'): string {
  if (!dispositionHeader) return defaultName;
  
  // 匹配 filename*=UTF-8''... 规范
  const utf8Match = dispositionHeader.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  
  // 匹配标准 filename="..."
  const standardMatch = dispositionHeader.match(/filename="?([^";]+)"?/i);
  if (standardMatch && standardMatch[1]) {
    return decodeURIComponent(standardMatch[1]);
  }
  
  return defaultName;
}

/**
 * 触发浏览器本地直接下载 Blob 二进制产物
 */
export function triggerBrowserBlobDownload(blob: Blob, filename: string): void {
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
  }, 300);
}

/**
 * 请求后端 Typst 编译引擎导出单份高保真 A4 矢量 PDF
 */
export async function downloadCalculationBookPdf(
  payload: CalculationBookData | Snapshot | any
): Promise<string> {
  const token = localStorage.getItem('access_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await axios.post(
    `${BASE_URL}/calculation-books/export-pdf`,
    payload,
    {
      responseType: 'blob',
      headers
    }
  );

  const disposition = response.headers['content-disposition'];
  const filename = extractFilename(disposition, '【计算书】隧道防排水优化设计计算书.pdf');
  
  const blob = new Blob([response.data], { type: 'application/pdf' });
  triggerBrowserBlobDownload(blob, filename);
  return filename;
}

/**
 * 请求后端 Typst 引擎批量并发编译多工况快照并打包下载 ZIP 压缩包
 */
export async function batchDownloadCalculationBooksZip(
  snapshots: Array<Snapshot | any>,
  projectName: string = '隧道工程'
): Promise<string> {
  if (!snapshots || snapshots.length === 0) {
    throw new Error('批量导出快照列表不能为空');
  }

  const token = localStorage.getItem('access_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const payload = {
    snapshots,
    project_name: projectName,
    max_workers: 4
  };

  const response = await axios.post(
    `${BASE_URL}/calculation-books/batch-export`,
    payload,
    {
      responseType: 'blob',
      headers
    }
  );

  const disposition = response.headers['content-disposition'];
  const filename = extractFilename(
    disposition, 
    `【批量计算书】${projectName}_共${snapshots.length}份.zip`
  );
  
  const blob = new Blob([response.data], { type: 'application/zip' });
  triggerBrowserBlobDownload(blob, filename);
  return filename;
}
