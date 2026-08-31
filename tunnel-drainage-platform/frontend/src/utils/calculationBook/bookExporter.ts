// frontend/src/utils/calculationBook/bookExporter.ts

import type { CalculationBookData } from './bookDataModel';
import { generateCalculationBook } from './bookGenerator';
import { 
  downloadCalculationBookPdf, 
  batchDownloadCalculationBooksZip 
} from '../../api/calculationBookApi';

/**
 * 基于后端 Typst 编译引擎导出高保真 A4 矢量 PDF
 * （全面移除 window.print() 弹窗与浏览器沙箱限制，实现一键极速静默生成与直接下载）
 */
export async function exportCalculationBookPdf(
  bookDataOrSnapshot: CalculationBookData | any
): Promise<string> {
  return await downloadCalculationBookPdf(bookDataOrSnapshot);
}

/**
 * 批量导出快照计算书为标准 ZIP 压缩包
 */
export async function exportBatchCalculationBooksZip(
  snapshots: any[],
  projectName: string = '隧道防排水工程'
): Promise<string> {
  return await batchDownloadCalculationBooksZip(snapshots, projectName);
}

/**
 * 兼容旧版调用的分发函数：
 * 统一路由至 Typst 引擎的真实矢量 PDF / ZIP 导出
 */
export async function exportSnapshotCalculationBook(
  snap: any,
  mode: 'pdf' | 'batch' = 'pdf'
): Promise<string> {
  if (Array.isArray(snap)) {
    return await exportBatchCalculationBooksZip(snap);
  }
  const bookData = snap.meta && snap.chapter1 ? snap : generateCalculationBook(snap);
  return await exportCalculationBookPdf(bookData);
}
