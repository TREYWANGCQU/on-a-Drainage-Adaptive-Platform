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
  '渗透系数(m/d)K': 'K',
  '水头高度(m)h': 'h',
  '降雨量(mm)p_mm': 'p_mm',
  '注浆圈渗透系数(m/d)Kg': 'Kg',
  '初期支护渗透系数(m/d)K1': 'K1',
  '二次衬砌渗透系数 (m/d)K2': 'K2',
  '双线低水位 (m)ha，双洞低水位特有参数': 'ha', //双洞低水位特有参数，单洞设计时输入0
  '灌溉条件': 'cn_condition',
  '土地利用类型': 'land_use',
  '围岩等级': 'grades',
  '隧道等效内半径 (m)r': 'r',
  '初支外半径r1 (m)': 'r1',
  '二衬外半径r2 (m)': 'r2',
  '注浆圈外半径rg (m)': 'rg',
  '隧道埋深c (m)': 'c',
  '隧道高宽比 h/w': 'aspect_ratio',
  '混凝土标号': 'concrete_grade',
  '钢筋类型': 'rebar_type',
  '配筋面积Ag (m²)': 'Ag',
  '双洞间距 (m)，单洞设计时输入0': 'D_spacing',// 双洞特有参数，单洞设计时输入0
  '纵向排水管水力坡降': 'I_long',
  '是否双侧排水': 'double_side',
  '设计涌水量折减系数': 'beta2',
  // 可根据需要继续添加其他参数映射
};

// 逆向映射字典（导出时使用）

const reverseFieldMapping = Object.fromEntries(Object.entries(fieldMapping).map(([k, v]) => [v, k]));

/**
 * 生成并下载包含标准表头和数据有效性提示的空 Excel 模板
 * 根据 Pydantic Schema 模型自动匹配对应的默认字段与占位数据
 */
export const downloadTemplate = () => {
  const headers = Object.keys(fieldMapping);
 // 建立参考值映射，对齐 schemas.py 定义与常规工程取值
  const exampleRow = headers.map(h => {
    const key = fieldMapping[h];
    
    // 标识与字符型参数
    if (key === 'tunnel_type') return 'single'; // 可选值：'single' 或 'double'
    if (key === 'cn_condition') return '灌溉良好';
    if (key === 'land_use') return '林地';
    if (key === 'concrete_grade') return 'C30';
    if (key === 'rebar_type') return 'HRB400';
    if (key === 'double_side') return true; // Schema布尔值
    
    // 里程与围岩
    if (key === 'start_chainage') return 1000.0;
    if (key === 'end_chainage') return 1200.0;
    if (key === 'grades') return 4;
    
    // Schema 中硬编码的默认参数
    if (key === 'aspect_ratio') return 0.7;
    if (key === 'beta2') return 1.0;
    if (key === 'I_long') return 0.02;
    if (key === 'D_spacing') return  0.0;
    if (key === 'ha') return 0.0;
    
    // 其它需要防呆的水文与几何参数占位符 (防止计算引擎因 0 溢出)
    const placeholders: Record<string, number> = {
      'K': 0.1, 'h': 30.0, 'p_mm': 1200.0, 
      'Kg': 0.005, 'K1': 0.05, 'K2': 0.0001,
      'r': 5.0, 'r1': 5.3, 'r2': 5.8, 'rg': 8.0, 
      'c': 50.0, 'Ag': 0.002
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
          Object.keys(row).forEach(key => { if(fieldMapping[key]) params[fieldMapping[key]] = row[key]; });
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
  
  // 展平快照数据结构，便于二维表格展示
  const exportData = {
    '快照ID': snapshot.id,
    '起点里程': snapshot.start_chainage,
    '终点里程': snapshot.end_chainage,
    '记录备注': snapshot.remark,
    ...snapshot.params, // 展开所有输入参数
    ...snapshot.result  // 展开所有输出结果
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