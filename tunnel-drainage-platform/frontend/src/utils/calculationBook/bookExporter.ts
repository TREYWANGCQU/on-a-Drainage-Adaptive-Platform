// tunnel-drainage-platform/frontend/src/utils/calculationBook/bookExporter.ts

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { CalculationBookData } from './bookDataModel';
import { generateCalculationBook } from './bookGenerator';

/**
 * 获取完整的打印与 A4 渲染样式表 (严格支持 CSS Paged Media 与精确分页)
 */
function getPrintStyles(): string {
  return `
    @page {
      size: A4 portrait;
      margin: 0;
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
    .calculation-report-document {
      display: block !important;
      gap: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    .report-page {
      width: 210mm !important;
      height: 297mm !important;
      min-height: 297mm !important;
      max-height: 297mm !important;
      padding: 14mm 16mm 12mm 16mm !important;
      margin: 0 !important;
      box-shadow: none !important;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
    }
    .report-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .chapter-block {
      margin-bottom: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .section-block {
      margin-top: 8px;
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
    /* KaTeX 渲染优化与公式自适应跨行 */
    .katex {
      font-size: 1.0em;
      text-rendering: auto;
    }
    .katex-display {
      margin: 0.25em 0;
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
 * 高保真矢量 A4 打印与 PDF 保存管线 (window.print iframe)
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
        throw new Error('无法初始化打印宿主 IFrame 容器');
      }

      let htmlContent = '';
      if (containerEl) {
        htmlContent = containerEl.outerHTML;
      } else {
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
 * 快捷离线直下 PDF (按 A4 真实页面逐页精确渲染，杜绝乱码与生硬分页截断)
 */
export async function downloadPdfDirect(
  bookData: CalculationBookData,
  containerEl: HTMLElement
): Promise<void> {
  // 1. 初始化 ISO A4 纵向 PDF (210mm x 297mm)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  // 2. 提取所有标准 A4 页面容器
  const pageElements = Array.from(containerEl.querySelectorAll<HTMLElement>('.report-page'));
  const targets = pageElements.length > 0 ? pageElements : [containerEl];

  for (let i = 0; i < targets.length; i++) {
    const pageEl = targets[i];
    
    // 使用 2 倍采样率生成页面高清 Canvas
    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 794 // 210mm at 96 DPI
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.96);

    if (i > 0) {
      pdf.addPage();
    }

    const pdfWidth = 210;
    const pdfHeight = 297;
    const imgAspect = canvas.height / canvas.width;
    const targetAspect = pdfHeight / pdfWidth; // 1.4142857

    // 严谨等比拟合，杜绝任何纵向或横向拉伸变形
    if (Math.abs(imgAspect - targetAspect) < 0.02) {
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
    } else {
      const renderedHeight = pdfWidth * imgAspect;
      if (renderedHeight <= pdfHeight) {
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, renderedHeight, undefined, 'FAST');
      } else {
        const scale = pdfHeight / renderedHeight;
        const scaledWidth = pdfWidth * scale;
        const offsetX = (pdfWidth - scaledWidth) / 2;
        pdf.addImage(imgData, 'JPEG', offsetX, 0, scaledWidth, pdfHeight, undefined, 'FAST');
      }
    }
  }

  const fileName = `${bookData.meta.documentTitle}_DK${bookData.meta.startChainage.toFixed(0)}-${bookData.meta.endChainage.toFixed(0)}_A4.pdf`;
  pdf.save(fileName);
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
  }
}
