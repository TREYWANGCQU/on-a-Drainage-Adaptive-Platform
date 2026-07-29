// 文件路径: tunnel-drainage-platform\frontend\src\utils\excelIO.ts

import * as XLSX from 'xlsx';
import { useParameterStore } from '../store/parameterStore';
import { useSnapshotStore } from '../store/snapshotStore';

/**
 * 字段映射字典，维护中文表头与 Store 内部状态键的对应关系。
 * 包含跨分区定义的核心字段,包含所有业务参数。
 */
const fieldMapping: Record<string, string> = {
  '起点里程': 'start_chainage',
  '终点里程': 'end_chainage',
  '隧道类型': 'tunnel_type',
  '围岩渗透系数(m/d)': 'k_r',
  '初始地下水头(m)': 'H',
  '年降雨量(mm)': 'p_mm',
  '注浆圈渗透系数(m/d)': 'k_g',
  '初支渗透系数(m/d)': 'k_p',
  '二衬渗透系数(m/d)': 'k_s',
  '灌溉条件': 'cn_condition',
  '土地利用类型': 'land_use',
  '围岩等级': 'grades',
  '二衬内半径(m)': 'r_0',
  '二衬外半径(m)': 'r_s',
  '初支外半径(m)': 'r_p',
  '注浆圈外半径(m)': 'r_g',
  '隧道中心埋深(m)': 'h_1',
  '隧道高宽比(3D专用)': 'aspect_ratio',
  '混凝土标号': 'concrete_grade',
  '配筋面积(mm²)': 'Ag',
  '双洞间距(m)': 'D_spacing',
  '纵向排水管水力坡降': 'I_long',
  '钢筋保护层厚度(mm)': 'as_mm',
  '水的重度(kN/m³)': 'gamma',
  '纵向管曼宁粗糙度': 'n_long',
  '环向管曼宁粗糙度': 'n_ring',
  '环向管水力坡降': 'I_ring',
  '横向管曼宁粗糙度': 'n_lat',
  '横向管水力坡降': 'I_lat',
  '规范最大盲管间距(m)': 'S_code_max',
  '工程最小盲管间距(m)': 'S_min',
  '环向管默认内径(m)': 'd_ring_default',
  '纵向管默认内径(m)': 'd_long_default',
  '横向管默认内径(m)': 'd_lat_default',
  '容许安全系数': 'tol_safety_factor',

  // 兼容历史 Excel 表头解析
  '渗透系数(m/d)K': 'k_r',
  '水头高度(m)h': 'H',
  '年降雨量(mm)p_mm': 'p_mm',
  '注浆圈渗透系数(m/d)Kg': 'k_g',
  '初期支护渗透系数(m/d)K1': 'k_p',
  '二次衬砌渗透系数 (m/d)K2': 'k_s',
  '隧道等效内半径 (m)r': 'r_0',
  '二衬外半径r1 (m)': 'r_s',
  '初支外半径r2 (m)': 'r_p',
  '注浆圈外半径rg (m)': 'r_g',
  '隧道中心埋深h_1 (m)': 'h_1',
  '隧道高宽比 h/w': 'aspect_ratio',
  '配筋面积Ag (mm²)': 'Ag',
  '双洞间距 (m)，单洞设计时输入0': 'D_spacing'
};

// 逆向映射字典（导出时使用，排除兼容别名表头）
const standardExportKeys = [
  'start_chainage', 'end_chainage', 'tunnel_type', 'k_r', 'H', 'p_mm',
  'k_g', 'k_p', 'k_s', 'cn_condition', 'land_use', 'grades',
  'r_0', 'r_s', 'r_p', 'r_g', 'h_1', 'aspect_ratio', 'concrete_grade', 'Ag',
  'D_spacing', 'I_long', 'as_mm', 'gamma', 'n_long', 'n_ring', 'I_ring',
  'n_lat', 'I_lat', 'S_code_max', 'S_min', 'd_ring_default', 'd_long_default',
  'd_lat_default', 'tol_safety_factor'
];

const reverseFieldMapping = Object.fromEntries(
  standardExportKeys.map(key => {
    const zh = Object.keys(fieldMapping).find(k => fieldMapping[k] === key);
    return [key, zh || key];
  })
);

/**
 * 生成并下载包含标准表头和数据有效性提示的空 Excel 模板
 * 根据 Pydantic Schema 模型自动匹配对应的默认字段与占位数据
 */
export const downloadTemplate = () => {
  const headers = standardExportKeys.map(k => reverseFieldMapping[k] || k);
  const exampleRow = standardExportKeys.map(key => {
    // 标识与字符型参数
    if (key === 'tunnel_type') return 'single'; // 可选值：'single' 或 'double'
    if (key === 'cn_condition') return '灌溉良好';
    if (key === 'land_use') return '居住地';
    if (key === 'concrete_grade') return 'C35';

    // 里程与围岩
    if (key === 'start_chainage') return 0.0;
    if (key === 'end_chainage') return 47.0;
    if (key === 'grades') return 4;

    // Schema 中硬编码的默认参数
    if (key === 'aspect_ratio') return 0.7;
    if (key === 'I_long') return 0.02;
    if (key === 'D_spacing') return 40.0;

    // 水文、结构与高级防呆参数占位符 (防止计算引擎因 0 溢出)
    const placeholders: Record<string, number> = {
      'k_r': 0.15, 'H': 120.0, 'p_mm': 1000.0,
      'k_g': 0.00864, 'k_p': 0.00864, 'k_s': 0.000864,
      'r_0': 7.95, 'r_s': 8.35, 'r_p': 8.57, 'r_g': 8.57,
      'h_1': 130.0, 'Ag': 1000.0, 'as_mm': 50.0, 'gamma': 10.0,
      'n_long': 0.012, 'n_ring': 0.012, 'I_ring': 0.73,
      'n_lat': 0.012, 'I_lat': 0.01, 'S_code_max': 10.0, 'S_min': 3.0,
      'd_ring_default': 0.05, 'd_long_default': 0.10, 'd_lat_default': 0.08,
      'tol_safety_factor': 2.0
    };

    return placeholders[key] ?? 0.0;
  });
  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '导入模板');
  XLSX.writeFile(wb, `隧道参数导入模板.xlsx`);
};

/**
 * 将当前状态机数据导出为 .xlsx 归档
 */
export const exportCurrentData = (): void => {
  const store = useParameterStore();
  const payload = store.currentPayload;

  const headers = Object.keys(payload).map(key => reverseFieldMapping[key] || key);
  const dataRow = Object.values(payload);

  const ws = XLSX.utils.aoa_to_sheet([headers, dataRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '当前参数存档');

  XLSX.writeFile(wb, `隧道排水参数_${payload.start_chainage}-${payload.end_chainage}.xlsx`);
};

/**
 * 拦截 <el-upload> 文件读取，解析二进制 Excel 为 JSON 字典，并自动切片生成快照序列
 * @param file 用户上传的文件对象
 * @param sequenceName 聚合序列名称
 */
export const parseUploadFile = (file: File, sequenceName: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'array' });
        const data: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        const snapshotStore = useSnapshotStore();
        const snapshots = data.map(row => {
          const params: any = {};
          Object.keys(row).forEach(key => { if (fieldMapping[key]) params[fieldMapping[key]] = row[key]; });
          return {
            id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            remark: `Excel导入: ${params.start_chainage || 0}-${params.end_chainage || 0}`,
            start_chainage: Number(params.start_chainage || 0),
            end_chainage: Number(params.end_chainage || 0),
            status: 'pending' as const, // 🟢 初始状态：待计算
            params: { ...useParameterStore().currentPayload, ...params },
            results: null
          };
        });

        if (snapshots.length > 0) snapshotStore.buildSequence(sequenceName, snapshots);
        resolve();
      } catch (err) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });
};
/**
 * 分段下载单个计算快照的结果为独立 Excel
 * 支持由外部 UI (如 SnapshotSidebar.vue) 调用
 * @param snapshot 单个快照对象，需包含 params 与 result
 */
export const exportSnapshotResult = (snapshot: any): void => {
  if (!snapshot || !snapshot.result) {
    throw new Error('该分段尚无计算结果，请先执行计算');
  }

  const deprecatedKeys = new Set([
    'beta2', 'ha', 'rebar_type', 'double_side', 'P_crit', 'c',
    'K', 'h', 'r', 'r1', 'r2', 'rg', 'K1', 'K2', 'Kg'
  ]);
  const cleanParams = Object.fromEntries(
    Object.entries(snapshot.params || {}).filter(([k]) => !deprecatedKeys.has(k))
  );

  // 展平快照数据结构，便于二维表格展示
  const exportData = {
    '快照ID': snapshot.id,
    '起点里程': snapshot.start_chainage,
    '终点里程': snapshot.end_chainage,
    '记录备注': snapshot.remark,
    ...cleanParams, // 展开所有有效输入参数
    ...(snapshot.result || snapshot.results)  // 展开所有输出结果
  };

  // 映射回中文表头
  const translatedData: Record<string, any> = {};
  for (const [key, val] of Object.entries(exportData)) {
    const zhKey = reverseFieldMapping[key] || key; // 若无映射则保持原样
    translatedData[zhKey] = val;
  }

  const ws = XLSX.utils.json_to_sheet([translatedData]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `里程${snapshot.start_chainage}-${snapshot.end_chainage}`);

  XLSX.writeFile(wb, `分段计算结果_${snapshot.start_chainage}-${snapshot.end_chainage}.xlsx`);
};