// frontend/src/api/calculationBookApi.ts

import axios from 'axios';
import type { CalculationBookData } from '../utils/calculationBook/bookDataModel';
import type { Snapshot } from '../store/snapshotStore';

import { resolveApiBaseUrl } from './adapter';
import { triggerBrowserBlobDownload as baseTriggerBlobDownload } from '@/utils/downloadHelper';

const getBaseUrl = () => resolveApiBaseUrl();

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
 * 触发浏览器本地直接下载 Blob 二进制产物，并统一向用户反馈落盘路径与直达交互
 */
export function triggerBrowserBlobDownload(
  blob: Blob,
  filename: string,
  fileTypeDesc?: string
): void {
  let desc = fileTypeDesc;
  if (!desc) {
    if (filename.endsWith('.pdf')) {
      desc = filename.includes('施工图') ? '施工图(PDF)' : '计算书(PDF)';
    } else if (filename.endsWith('.png')) {
      desc = '施工图(PNG)';
    } else if (filename.endsWith('.zip')) {
      desc = filename.includes('施工图') ? '施工图归档包(ZIP)' : '计算书归档包(ZIP)';
    } else {
      desc = '工程成果文件';
    }
  }

  baseTriggerBlobDownload(blob, filename, desc);
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
    `${getBaseUrl()}/calculation-books/export-pdf`,
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
    `${getBaseUrl()}/calculation-books/batch-export`,
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
