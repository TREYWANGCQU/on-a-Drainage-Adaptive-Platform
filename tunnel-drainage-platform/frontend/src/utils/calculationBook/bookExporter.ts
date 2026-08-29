// tunnel-drainage-platform/frontend/src/utils/calculationBook/bookExporter.ts

import jsPDF from 'jspdf';
import type { CalculationBookData } from './bookDataModel';
import { generateCalculationBook } from './bookGenerator';

/**
 * 获取完整的打印与 A4 渲染样式表
 */
function getPrintStyles(): string {
  return `
    @page {
      size: A4 portrait;
      margin: 18mm 14mm 18mm 14mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #1f2937;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif;
      font-size: 10pt;
      line-height: 1.5;
    }
    .calculation-report-sheet {
      width: 100% !important;
      max-width: 100% !important;
      padding: 0 !important;
      margin: 0 !important;
      box-shadow: none !important;
    }
    .chapter-block {
      margin-bottom: 20px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .chapter-1 {
      page-break-before: avoid;
    }
    .section-block {
      margin-top: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .three-line-table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .formula-box, .formula-box-mini, .fem-results-card, .pipe-calc-card, .judge-box, .safe-cert-box {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .signature-block {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .font-mono {
      font-family: 'Consolas', 'Courier New', monospace;
    }
    /* KaTeX 渲染优化 */
    .katex {
      font-size: 1.05em;
      text-rendering: auto;
    }
    .katex-display {
      margin: 0.4em 0;
    }
  `;
}

/**
 * 收集当前文档中的所有样式（包含外部注入与 Vite 编译的 CSS）
 */
function collectAllStyles(): string {
  let styles = '';
  // 遍历父页面所有 style 与 link 节点
  const styleElements = document.querySelectorAll('style, link[rel="stylesheet"]');
  styleElements.forEach((el) => {
    styles += el.outerHTML + '\n';
  });
  return styles;
}

/**
 * 高保真矢量 A4 打印与 PDF 保存管线 (window.print iframe)
 */
export async function printCalculationBook(
  bookData: CalculationBookData,
  containerEl?: HTMLElement
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // 1. 创建隔离的隐藏 iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        throw new Error('无法初始化打印宿主 IFrame 容器');
      }

      // 2. 提取或生成 HTML 树
      let htmlContent = '';
      if (containerEl) {
        htmlContent = containerEl.outerHTML;
      } else {
        throw new Error('缺少母版 DOM 节点进行矢量克隆');
      }

      const allParentStyles = collectAllStyles();
      const printStyles = getPrintStyles();

      // 3. 构建完整的 iframe 内容
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
          <meta charset="UTF-8">
          <title>${bookData.meta.documentTitle} - ${bookData.meta.reportCode}</title>
          ${allParentStyles}
          <style>${printStyles}</style>
        </head>
        <body>
          ${htmlContent}
        </body>
        </html>
      `);
      doc.close();

      // 4. 等待资源与字体加载完毕后唤起系统打印/另存为PDF
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
              resolve();
            }, 1000);
          } catch (err) {
            document.body.removeChild(iframe);
            reject(err);
          }
        }, 300);
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 快捷离线直下 PDF (jspdf 基础矢量管道)
 */
export async function downloadPdfDirect(
  bookData: CalculationBookData,
  containerEl: HTMLElement
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const fileName = `${bookData.meta.documentTitle}_DK${bookData.meta.startChainage.toFixed(0)}-${bookData.meta.endChainage.toFixed(0)}.pdf`;

  await doc.html(containerEl, {
    callback: (pdf) => {
      pdf.save(fileName);
    },
    x: 0,
    y: 0,
    width: 210,
    windowWidth: 794 // 210mm at 96 DPI
  });
}

/**
 * 顶层导出路由分发
 */
export async function exportSnapshotCalculationBook(
  snap: any,
  mode: 'print' | 'pdf' = 'print',
  containerEl?: HTMLElement
): Promise<void> {
  const bookData = generateCalculationBook(snap);
  if (mode === 'print' && containerEl) {
    await printCalculationBook(bookData, containerEl);
  } else if (mode === 'pdf' && containerEl) {
    await downloadPdfDirect(bookData, containerEl);
  } else {
    // 若未传入 DOM 容器，通过临时动态渲染挂载
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'fixed';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '-9999px';
    document.body.appendChild(tempContainer);
    
    // 降级使用基础打印
    if (containerEl) {
      await printCalculationBook(bookData, containerEl);
    }
    document.body.removeChild(tempContainer);
  }
}
