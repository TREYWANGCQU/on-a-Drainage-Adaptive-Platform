// tunnel-drainage-platform/frontend/src/utils/calculationBook/bookExporter.ts

import type { CalculationBookData } from './bookDataModel';
import { generateCalculationBook } from './bookGenerator';

/**
 * 获取完整的打印与 A4 渲染样式表 (严格支持 CSS Paged Media 与全量矢量多页输出)
 */
function getPrintStyles(): string {
  return `
    @page {
      size: A4 portrait;
      margin: 14mm 15mm 14mm 15mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      width: 100% !important;
      height: auto !important;
      min-height: 100% !important;
      max-height: none !important;
      overflow: visible !important;
      position: static !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #1f2937 !important;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif;
      font-size: 9.5pt;
      line-height: 1.5;
    }
    .calculation-report-sheet {
      width: 100% !important;
      max-width: 100% !important;
      min-height: auto !important;
      padding: 0 !important;
      margin: 0 !important;
      box-shadow: none !important;
      display: block !important;
    }
    .chapters-flow {
      display: block !important;
      gap: 0 !important;
    }
    .chapter-block {
      margin-bottom: 14px;
      page-break-inside: auto;
      break-inside: auto;
    }
    .section-block {
      margin-top: 10px;
      page-break-inside: auto;
      break-inside: auto;
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
    .report-cover-header {
      page-break-after: avoid;
      break-after: avoid;
    }
    .font-mono {
      font-family: 'Consolas', 'Courier New', monospace;
    }
    /* KaTeX 渲染优化与公式自适应跨行 */
    .katex {
      font-size: 1.0em;
      text-rendering: auto;
    }
    .katex-display {
      margin: 0.3em 0;
      max-width: 100%;
      overflow-x: visible;
    }
    .formula-box {
      flex-wrap: wrap;
    }
  `;
}

/**
 * 收集当前文档中的所有样式（包含外部注入与 Vite 编译的 CSS）
 */
function collectAllStyles(): string {
  let styles = '';
  const styleElements = document.querySelectorAll('style, link[rel="stylesheet"]');
  styleElements.forEach((el) => {
    styles += el.outerHTML + '\n';
  });
  return styles;
}

/**
 * 高保真 A4 矢量 PDF 导出管线 (100% 纯矢量文字/公式，完全消除图片模糊与乱码)
 */
export async function printCalculationBook(
  bookData: CalculationBookData,
  containerEl?: HTMLElement
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
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
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
        throw new Error('无法初始化打印宿主 IFrame 容器');
      }

      let htmlContent = '';
      if (containerEl) {
        htmlContent = containerEl.outerHTML;
      } else {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
        throw new Error('缺少母版 DOM 节点进行矢量克隆');
      }

      const allParentStyles = collectAllStyles();
      const printStyles = getPrintStyles();

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

      const doPrint = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
              resolve();
            }, 1000);
          } catch (err) {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
            reject(err);
          }
        }, 250);
      };

      // 等待字体及样式全部就绪
      if (iframe.contentWindow?.document?.fonts) {
        iframe.contentWindow.document.fonts.ready.then(doPrint).catch(doPrint);
      } else {
        setTimeout(doPrint, 350);
      }
    } catch (err) {
      reject(err);
    }
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
  if (containerEl) {
    await printCalculationBook(bookData, containerEl);
  }
}
