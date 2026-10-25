# 阶段4-专题-施工设计图在线预览与ZIP压缩包批量下载架构方案

## 一、 Objectives (目标定义与痛点剖析)

### 1.1 业务背景与用户核心痛点
在“隧道工程多维协同智能排水自适应平台”阶段 4（3D 可视化与工况快照工程出图体系）中，已实现了标准 A3 横断面防排水施工图（$420\,\text{mm} \times 297\,\text{mm}$，横向）的纯前端参数化矢量生成（`blueprintGenerator.ts`）。但在实际工程落地与用户体验验证中，暴露出两大显著痛点：

1. **痛点 1：缺乏在线交互预览能力，处于“盲抽盲下”状态**
   - 当前快照卡片（`SnapshotSidebar.vue`）仅提供“导出 A3 矢量施工图 (PDF)”与“导出高清设计图 (PNG)”按钮，点击即直接触发浏览器写盘。
   - 用户无法在下载前直观核验不同工况下的洞身拓扑形态（单双洞）、水沟凹槽布局（三沟/双侧沟）、环向/纵向/横向盲管引出标注参数，亦无法提前检查双洞间距打断折断线效果、图纸说明及标题栏签署内容。
   - 相比已具备完整交互视口的计算书体系（`CalculationBookModal.vue`），施工图模块存在明显的交互能力不对齐。

2. **痛点 2：批量下载触发多文件并发弹窗，无法交付标准化归档包**
   - 当前在侧边栏选中 $N$ 个工况并执行“批量下载施工图 (A3 PDF/PNG)”时，采用 JavaScript 循环延时串行调用 `exportSnapshotBlueprint` 的方式。
   - 该方式在导出 $10 \sim 50$ 份快照时，会向浏览器连续发射 $10 \sim 50$ 次独立的文件下载触发事件（`pdf.save()` 或 `<a>` 标签模拟点击）。
   - 触发浏览器底层的防恶意多文件弹窗拦截（“该网站正尝试下载多个文件，是否允许？”），严重阻塞用户操作，导致下载漏件；且下载目录散落大量独立文件，不符合工程竣工归档与协同分发标准。

### 1.2 建设目标与核心交付物
1. **构建专业级施工图在线工程预览视口（`BlueprintPreviewModal.vue`）**：
   - 提供全屏/大视口工程图纸深色工作台模式（Slate/Navy Blue 蓝图底色）；
   - 支持高保真双重渲染模式（Canvas 2D 毫秒级重绘 + 平滑平移缩放视口）；
   - 集成鼠标滚轮缩放（$20\% \sim 300\%$）、按住鼠标中键/左键平移（Pan）、一键适应屏幕（Fit Window）与 1:1 实际尺寸查看；
   - **坚持 WYSIWYG（所见即所出）绝对导出一致性原则**：图纸以制图引擎自适应推导的最佳工程比例尺（如 $1:100$ 或 $1:150$）作为唯一母版真值，视口顶栏展示只读比例尺徽标（如 `📐 图纸比例: 1:100`）；不进行破坏性几何重算伸缩，全面依靠视口平移缩放（Pan & Zoom，支持 $20\% \sim 300\%$）与一键适应窗口进行微观构造细节核验，确保预览所见与最终导出的 PDF/PNG 在双洞间距打断效果、图面构图居中、图框标签、说明及签名栏上保持 $100\%$ 像素级一致；
   - 支持多工况快照横向无缝翻页（上一个 / 下一个快照），免去频繁开闭弹窗的繁琐操作；
   - 视口内置“📥 导出 A3 PDF”与“🖼️ 导出高清 PNG”直达出口。

2. **构建纯前端零 I/O 损耗的施工图 ZIP 压缩包批量归档打包管线**：
   - 引入标准轻量级纯客户端压缩库（`JSZip`），实现无需后端微服务介入、零网络上行/下行 I/O 消耗的纯前端内存级多文档流式压缩；
   - 批量导出 PDF 时，在内存中直接捕获各快照生成的 jsPDF 二进制 ArrayBuffer/Blob；
   - 批量导出 PNG 时，利用离屏 Canvas 原生异步转换 Blob 并注入压缩包；
   - 规范化打包结构，注入工程索引清单（`00_施工图纸清单与参数汇总.txt` / `.json`）；
   - 全程驱动侧边栏全局进度条（`batchExportProgress` 与 `batchExportStatusText`），任务完成后一键触发**单一 ZIP 压缩文件直接落盘**（如 `【批量施工图】隧道工程防排水横断面设计图_共N份_20261025.zip`），彻底根治多弹窗拦截与散乱落盘问题。

---

## 二、 Constraints & Boundary Matrix (边界约束与技术契约)

### 2.1 物理与协议硬约束
1. **浏览器沙箱与多文件下载拦截约束**：
   - 现代浏览器（Chrome / Edge / Firefox）对连续未直接由用户物理点击驱动的下载行为具备严格的防注入拦截机制（Safe Browsing / Multiple Downloads Policy）。纯前端单次用户点击触发单一 ZIP Blob 下载（`triggerBrowserBlobDownload`）是唯一 $100\%$ 免疫拦截的标准物理路径。
2. **纯前端架构与离线/Tauri 桌面端无侵入约束**：
   - 严格遵循阶段 4 既定原则，施工图生成引擎纯依赖前端 TypeScript + Canvas 2D + jsPDF，严禁将 4200×2970 大图回传 Python 后端进行打包（避免单次批量产生数十兆甚至上百兆不必要的内网 HTTP 上行与内存尖峰）。
   - 引入的 ZIP 压缩管线必须支持纯客户端脱机运行，与 Tauri 2.x 离线桌面端环境无缝自适应兼容。
3. **Canvas 显存与垃圾回收硬约束**：
   - 单张 A3 画布分辨率为 $4200 \times 2970\,\text{px}$，单张 32 位 RGBA 像素内存约为 $4200 \times 2970 \times 4 \approx 47.6\,\text{MB}$。
   - 在进行 $50 \sim 100$ 段快照批量打包时，必须采用**串行流水线 + 即时销毁 Canvas + 逐段 GC 释放**策略，严禁并发驻留全部 Canvas 实例，确保内存峰值稳定在 $\le 120\,\text{MB}$，坚决杜绝浏览器 OOM 崩溃。
4. **UI 字阶生理底线合规**：
   - 预览弹窗及其工具栏、浮动面板、缩放比控制器等所有 UI 控件，严格遵守全局规范 $\text{font-size} \ge 12\text{px}$（禁止出现 9px/10px/11px 等缩微字号）。

### 2.2 边界契约矩阵 (Boundary Contract Matrix)

| 交互模块 | 边界端点 / 协议契约 | 输入规范 | 输出规范 | 异常防御与兜底契约 |
| :--- | :--- | :--- | :--- | :--- |
| **单图在线预览** | `BlueprintPreviewModal.vue` | 当前选定工况快照 `snapshot: Snapshot`，可选 `snapshotList: Snapshot[]` | 高清 Canvas 2D 交互视图，支持鼠标缩放平移 | 若快照未完成水力计算，给出提示并允许以基准几何预览；若画布创建失败回退至错误提示插槽 |
| **图纸导出一致性对齐契约 (WYSIWYG)** | `generator.renderToCanvas()` | 当前快照 `Snapshot` | 像素级母版 Canvas（$4200 \times 2970\,\text{px}$） | 严格冻结由几何与图框包络自适应推导的标准模数比例尺，禁止在视口人为破坏性篡改比例；预览视口以母版 Canvas 作为单一真相源，确保双洞打断、图框、说明与标题栏完全一致 |
| **单图直接导出** | `generator.exportPDF() / exportPNG()` | `snap` 对象与输出目标类型 | 触发单个规范命名的 `.pdf` 或 `.png` 文件下载 | 复用现有成熟封装 |
| **批量多图打包** | `exportBatchBlueprintsZip(snapshots, format, options)` | 快照数组 `Snapshot[]`、格式 `'pdf' \| 'png'`、进度回调函数 | 标准 `application/zip` 二进制 Blob，单一触发器落盘 | 逐段 try-catch 防御；若个别快照渲染异常则记录日志并跳过，确保压缩包整体成功交付 |

---

## 三、 Architecture & System Decomposition (架构设计与模块解构)

### 3.1 总体架构与数据流模型

```mermaid
flowchart TB
    subgraph UI_Layer [快照管理与控制交互层 (SnapshotSidebar.vue)]
        CardCapsule[快照卡片底部: 施工图功能胶囊]
        BatchMenu[顶栏批量导出下拉菜单 / 快捷操作条]
        PreviewTrigger["点击胶囊 / 菜单: 👁️ 预览 A3 施工设计图"]
        BatchPdfTrigger["菜单: 📑 批量下载选中施工图 (A3 PDF)"]
        BatchPngTrigger["菜单: 🖼️ 批量下载选中施工图 (PNG)"]
        BatchAllTrigger["菜单: ⚡ 一键导出当前筛选全部施工图"]
        
        CardCapsule --> PreviewTrigger
        BatchMenu --> BatchPdfTrigger
        BatchMenu --> BatchPngTrigger
        BatchMenu --> BatchAllTrigger
    end

    subgraph Preview_Layer [施工图在线工程预览系统 (BlueprintPreviewModal.vue)]
        ModalDialog[全屏工程图纸交互视口 Dialog]
        ToolBar[控制栏: 比例尺状态徽标 (只读) | 缩放 20%~300% | 适应窗口 / 1:1 | 翻页控制器]
        PanZoomViewport[交互视口: 鼠标滚轮缩放 + 拖拽平移 Pan]
        RenderCanvas[高分辨率 Canvas 渲染节点]
        ModalExportActions[弹窗内快捷导出: 📥 导出 PDF | 🖼️ 导出 PNG]

        PreviewTrigger --> ModalDialog
        ModalDialog --> ToolBar
        ModalDialog --> PanZoomViewport --> RenderCanvas
        ModalDialog --> ModalExportActions
    end

    subgraph Generator_Core [A3 矢量参数化制图引擎 (@/utils/blueprintGenerator.ts)]
        ParamExtractor[extractBlueprintParams 几何与水力参数归一化]
        ProfileComputer[computeHorseshoeProfile2D 三心圆多段复合弧推导]
        ScaleEngine[determineScaleConfig 自适应最佳工程比例尺]
        CanvasPipeline[renderToCanvas A3母版绘图流水线 4200x2970]
        PdfPipeline[generatePdfBlob 纯内存 ArrayBuffer/Blob 封装]
        PngPipeline[generatePngBlob 纯内存异步 Blob 封装]

        RenderCanvas -.-> CanvasPipeline
        CanvasPipeline --- ParamExtractor
        CanvasPipeline --- ProfileComputer
        CanvasPipeline --- ScaleEngine
        ModalExportActions --> PdfPipeline
        ModalExportActions --> PngPipeline
    end

    subgraph Batch_Zip_Pipeline [纯前端流式 ZIP 打包引擎 (exportBatchBlueprintsZip)]
        ZipInstance[实例化 JSZip 内存容器]
        SerialQueue[流水线调度器: 单段逐次生成 + 显存即时释放]
        ManifestGen[生成 00_施工图纸清单与参数汇总.txt]
        ProgressBridge[双向联动 batchExportProgress 进度反馈]
        ZipCompiler[zip.generateAsync 内存压缩打包]
        SingleDownloader[triggerBrowserBlobDownload 单文件安全落盘]

        BatchPdfTrigger --> SerialQueue
        BatchPngTrigger --> SerialQueue
        BatchAllTrigger --> SerialQueue
        
        SerialQueue --> CanvasPipeline
        SerialQueue --> PdfPipeline
        SerialQueue --> PngPipeline
        SerialQueue --> ZipInstance
        SerialQueue --> ProgressBridge
        ManifestGen --> ZipInstance
        ZipInstance --> ZipCompiler --> SingleDownloader
    end
```

---

### 3.2 施工图在线预览系统架构 (`BlueprintPreviewModal.vue`)

#### 1. 视口交互模型与坐标变换
预览视口由**外层视口裁剪容器（Viewport Container）**与**内层平移缩放画布层（Canvas Layer）**构成：
- **变换状态模型**：
  $$\mathbf{Transform} = \{ \text{scale}: s, \text{translateX}: t_x, \text{translateY}: t_y \}$$
- **滚轮缩放锚点保持算法（Zoom Towards Pointer）**：
  设视口容器内鼠标当前几何坐标为 $(p_x, p_y)$，缩放倍率变化前为 $s_1$，变化后为 $s_2$：
  $$t_{x2} = p_x - (p_x - t_{x1}) \times \frac{s_2}{s_1}$$
  $$t_{y2} = p_y - (p_y - t_{y1}) \times \frac{s_2}{s_1}$$
  确保在鼠标滚轮缩放时，鼠标指针所指的工程图纸细节（如拱脚盲管、标题栏）在视口物理位置保持绝对静止，不发生位移漂移。
- **拖拽平移（Pan）**：
  支持按下鼠标左键或中键拖动，平滑更新 $(t_x, t_y)$；鼠标样式在 `grab` 与 `grabbing` 间自适应平滑切换。
- **适应窗口（Fit to Window）**：
  计算图纸宽高比（$4200:2970 \approx 1.414$）与当前视口可用尺寸（$\text{availWidth}, \text{availHeight}$），取：
  $$s_{\text{fit}} = \min\left(\frac{\text{availWidth} - 40}{4200}, \frac{\text{availHeight} - 40}{2970}\right)$$
  并将画布居中置于视口中央。

#### 2. 导出一致性防护（WYSIWYG）与视口显示控制器
在工程施工图体系中，A3 图幅（$4200 \times 2970\,\text{px}$）的工程比例尺属于受力计算与规范排版的刚性契约，不可随意人为伸缩。若允许在预览视口随意切换比例尺（例如将双洞大间距工况强制切为 $1:50$），所需绘图像素高达 $7330\,\text{px}$，将严重穿出 $3800\,\text{px}$ 的安全绘图区，切断标题栏与说明区，彻底破坏图纸完整性与严肃性。

因此，在线工程预览视口贯彻**“严格保持导出一致性（所见即所出，WYSIWYG）”**准则：
- **母版 Canvas 单一真实源（Single Source of Truth）**：
  预览视口直接挂载 `ConstructionBlueprintGenerator.renderToCanvas()` 输出的完整母版 Canvas（或通过高保真离屏映射呈现）。母版内自动生成的双洞中心间距打断折断线（$D > 18\,\text{m}$）、中线基准、左下角施工说明与图例、右下角标题栏会签信息，均与最终导出文件保持绝对一致。
- **只读比例尺徽标展示**：
  顶部工具栏仅提供只读的工程比例尺状态标签（如 `el-tag` 标注 `📐 标准出图比例: 1:100` 或 `1:150`），向工程师明确当前图纸采用的标准模数，杜绝人为误切破坏布局。
- **微观细节核验手段**：
  通过视口无损平移与无级缩放（`20% ~ 300%`）、`[适应窗口 (Fit)]` 及 `[100% 原始像素]` 控制器完成。工程师放大至 $200\% \sim 300\%$ 即可清晰核验拱脚纵向排水管通水孔、横向支管 3% 坡度、说明文字等微观构造，完全无需且不应通过改变图纸绘图比例尺来放大细节。

#### 3. 跨快照快速翻页联动
弹窗顶部栏具备：
`[◀ 上一工况]` `[当前工况 #02 DK0+047~DK0+094 (2/15)]` `[下一工况 ▶]`，
通过监听键盘快捷键（$\leftarrow / \rightarrow$ 方向键）或按钮点击快速切换，无损复用视口当前的缩放与平移参数，实现高速连续看图。

---

### 3.3 纯前端批量 ZIP 打包引擎解构

#### 1. 核心导出接口拓展（`blueprintGenerator.ts`）
为解耦“生成二进制数据”与“触发浏览器单文件下载”，重构并扩充生成引擎方法：

```typescript
export class ConstructionBlueprintGenerator {
  // 1. 保留现有单一下载方法 (向下兼容)
  public async exportPDF(): Promise<void>;
  public async exportPNG(): Promise<void>;

  // 2. 新增纯内存二进制导出方法 (为 ZIP 打包器提供纯粹输入)
  public async generatePDFBlob(): Promise<{ blob: Blob; filename: string }>;
  public async generatePNGBlob(): Promise<{ blob: Blob; filename: string }>;
}
```

#### 2. ZIP 批量封装流水线契约
在 `blueprintGenerator.ts` 中导出独立纯函数 `exportBatchBlueprintsZip`：

```typescript
export interface BatchExportProgressInfo {
  current: number;
  total: number;
  currentSnap: any;
  statusText: string;
  percent: number;
}

/**
 * 纯前端批量打包工况施工图为单一 ZIP 压缩包
 */
export async function exportBatchBlueprintsZip(
  snapshots: any[],
  format: 'pdf' | 'png' = 'pdf',
  projectName: string = '隧道工程',
  onProgress?: (info: BatchExportProgressInfo) => void
): Promise<string> {
  const zip = new JSZip();
  const folderName = `【施工图纸】${projectName}_A3${format.toUpperCase()}`;
  const zipFolder = zip.folder(folderName) || zip;
  
  // 1. 逐段串行生成，严格释放显存
  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const generator = new ConstructionBlueprintGenerator(snap);
    
    if (format === 'pdf') {
      const { blob, filename } = await generator.generatePDFBlob();
      zipFolder.file(filename, blob);
    } else {
      const { blob, filename } = await generator.generatePNGBlob();
      zipFolder.file(filename, blob);
    }
    
    // 释放 Canvas 引用，触发下一周期垃圾回收
    generator.destroy();
    
    onProgress?.({
      current: i + 1,
      total: snapshots.length,
      currentSnap: snap,
      statusText: `正在打包 (${i + 1}/${snapshots.length}): ${snap.remark || snap.id}`,
      percent: Math.round(((i + 1) / snapshots.length) * 85)
    });

    // 释放主线程微任务循环，保证 UI 进度条平滑渲染
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  // 2. 注入工程索引清单 00_施工图纸清单与参数汇总.txt
  const manifestContent = generateBatchManifest(snapshots, format, projectName);
  zipFolder.file('00_施工图纸清单与参数汇总.txt', manifestContent);

  // 3. 内存压缩与单一落盘
  onProgress?.({
    current: snapshots.length,
    total: snapshots.length,
    currentSnap: null,
    statusText: '正在压缩封装 ZIP 归档包...',
    percent: 92
  });

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const zipFilename = `【批量施工图】${projectName}_${format.toUpperCase()}_共${snapshots.length}段_${formatDateTimestamp(Date.now())}.zip`;
  triggerBrowserBlobDownload(zipBlob, zipFilename);
  
  return zipFilename;
}
```

#### 3. 显存回收与性能保护策略（GC Defense）
- **单实例生命周期隔离**：每次循环创建独立的 `ConstructionBlueprintGenerator` 实例，在获取 `Blob` 之后，显式将 `canvas.width = 0; canvas.height = 0;` 并断开上下文引用，防止 V8 引擎将大分辨率 Bitmap 滞留在内存堆中。
- **进度事件异步切片**：每张图处理完毕后切让微任务（`setTimeout(20ms)`），既能确保 Vue 响应式数据平滑驱动进度条和百分比，又给垃圾回收器（Garbage Collector）留出充足的内存整理窗口。

---

## 四、 Work Breakdown Structure (工作分解结构 WBS)

```
阶段4-施工图在线预览与ZIP压缩包批量下载方案
├── Phase 1: 基础设施与依赖集成
│   ├── 1.1 安装与验证 JSZip 依赖 (npm install jszip, 确认与 Vite 6 兼容)
│   ├── 1.2 复用 triggerBrowserBlobDownload 纯前端二进制下载基座 (@/api/calculationBookApi)
│   └── 1.3 确立工程清单规范文件模板 (00_施工图纸清单与参数汇总.txt)
│
├── Phase 2: 施工图生成内核改造 (@/utils/blueprintGenerator.ts)
│   ├── 2.1 提取 generatePDFBlob 方法 (使用 pdf.output('blob')，不产生文件弹窗)
│   ├── 2.2 提取 generatePNGBlob 方法 (使用 canvas.toBlob() 异步封装)
│   ├── 2.3 规范化文件名生成逻辑 (规范编号、里程区间、工况状态标示)
│   ├── 2.4 显式显存清理方法 destroy() (清空宽高校验防止内存泄漏)
│   └── 2.5 实现 exportBatchBlueprintsZip 批量聚合打包函数
│
├── Phase 3: 施工图在线工程预览组件研发 (BlueprintPreviewModal.vue)
│   ├── 3.1 搭建深色工程蓝图全屏模态框 (ElDialog + 蓝图 Slate/Navy 底色)
│   ├── 3.2 研发高精度视口控制台 (鼠标平移 Pan + 滚轮缩放 20%~300% 锚点保持)
│   ├── 3.3 工具栏控制器集成 (自适应窗口、100% 原始尺寸、比例尺状态只读徽标、缩放比控制器)
│   ├── 3.4 跨工况快照横向翻页导航 (键盘 ←/→ 快捷键与上下工况切换)
│   ├── 3.5 弹窗内快捷导出操作 (直接调用 generatePDFBlob / generatePNGBlob)
│   └── 3.6 全面贯彻字阶底线 (font-size >= 12px) 与移动端/高分屏自适应
│
├── Phase 4: 快照侧边栏深度集成与链路打通 (SnapshotSidebar.vue)
│   ├── 4.1 挂载 BlueprintPreviewModal 状态与全局引用 (previewVisible, currentPreviewSnap)
│   ├── 4.2 卡片底部胶囊按钮升级:
│   │   ├── 点击“施工图”主体直接弹出在线预览模态框
│   │   └── 下拉菜单扩充: 👁️ 预览 A3 施工设计图 | 📑 导出 A3 PDF | 🖼️ 导出高清 PNG
│   ├── 4.3 卡片窄屏/移动端 More 菜单扩充: 👁️ 预览 A3 施工图
│   └── 4.4 顶栏批量导出核心重构 (batchDownloadBlueprints):
│       ├── 彻底移除多轮循环单个弹窗下载的旧逻辑
│       └── 全面接入 exportBatchBlueprintsZip 统一 ZIP 打包输出
│
└── Phase 5: 综合联调与极端场景防御测试
    ├── 5.1 单段预览流畅度测试 (高分屏 4K/2K 缩放无撕裂、文字清晰)
    ├── 5.2 导出一致性与母版对齐验证 (预览画面与导出的 PDF/PNG 在双洞打断、图框、说明、标题栏等位置上 100% 一致)
    ├── 5.3 批量 50 段大体量工况打包压力测试 (内存占用峰值与单 ZIP 包完整性)
    └── 5.4 纯脱机与 Tauri 桌面端运行环境验证
```

---

## 五、 Acceptance Criteria & Test Plan (验收标准与测试计划)

### 5.1 质量门禁与验收指标

| 验收编号 | 验收项 | 验收标准 | 验证手段 |
| :--- | :--- | :--- | :--- |
| **AC-01** | **施工图在线预览视口** | 点击任一快照卡片的“施工图”胶囊按钮或下拉菜单中的“👁️ 预览 A3 施工设计图”，$200\,\text{ms}$ 内拉起预览视口，清晰呈现完整 A3 施工图图框、横断面轮廓与标注引线。 | 在快照侧栏点击多个工况的施工图预览，检查弹窗响应速度与图面完整性。 |
| **AC-02** | **视口平移缩放交互** | 鼠标滚轮在任意位置缩放，视口以鼠标指针为中心平滑缩放（范围 $20\% \sim 300\%$），无画面抖动与位置漂移；按住鼠标左键可自如平移拖动画布；点击“适应窗口”可自动以最佳比例居中显示。 | 滚轮缩放并拖动图纸，放大至 $300\%$ 检查拱腰波纹管与标注细节。 |
| **AC-03** | **导出一致性与要素完整性 (WYSIWYG)** | 预览视口呈现的母版画面与导出的 A3 PDF/PNG 保持 $100\%$ 像素级一致；双洞间距打断折断线（$D > 18\,\text{m}$）、轴线符号、左下角施工说明与图例、右下角标题栏与比例尺条排版稳固，无穿框、截断与标注重叠；工具栏清晰展示只读比例尺徽标。 | 在预览弹窗中核验图面所有关键要素，点击导出 PDF 并比对文件内容，确认图面布局与要素完全相同。 |
| **AC-04** | **多工况跨段快速翻页** | 预览弹窗支持通过顶部“上一段 / 下一段”按钮或键盘方向键快速切换快照，切换后图面立即更新至对应工况桩号与参数，不闪退、不报错。 | 连续点击“下一段”切换 5 个不同工况。 |
| **AC-05** | **批量下载单一 ZIP 打包交付** | 勾选 5 个以上工况快照，点击“批量下载选中施工图 (A3 PDF)”或“(PNG)”，**全程仅触发 1 次浏览器文件保存事件**，下载产物为标准 ZIP 压缩包；压缩包内包含对应数量的独立图纸与一份 `00_施工图纸清单与参数汇总.txt`。 | 勾选 10 个工况触发批量导出，检查下载栏是否仅有单个 `.zip` 文件，解压检查图纸数量与完整性。 |
| **AC-06** | **全局进度与防呆反馈** | 批量打包期间，侧边栏展示清晰的进度百分比与当前处理工况名称；任务完成弹出标准 ElNotification 提示；未勾选有效工况时给出友好拦截。 | 观察导出全过程的进度条流转与完成通知。 |
| **AC-07** | **字阶生理底线合规** | 预览组件所有 UI 字体、控制按钮、比例尺文本严格遵守 $\ge 12\text{px}$ 规范，无任何侵蚀或微缩硬编码。 | 检查 CSS 样式表中的字号定义。 |
