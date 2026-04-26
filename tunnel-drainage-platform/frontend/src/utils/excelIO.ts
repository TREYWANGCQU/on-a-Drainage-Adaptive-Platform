// 文件路径: tunnel-drainage-platform\frontend\src\utils\excelIO.ts

import * as XLSX from 'xlsx';
import { useParameterStore } from '../store/parameterStore';
import { useSnapshotStore } from '../store/snapshotStore';

/**
 * 字段映射字典，维护中文表头与 Store 内部状态键的对应关系。
 * 包含跨分区定义的核心字段（起点里程、终点里程）。
 */
const fieldMapping: Record<string, string> = {
  '起点里程': 'start_chainage',
  '终点里程': 'end_chainage',
  '隧道类型': 'tunnel_type',
  '水位等级': 'water_level',
  '渗透系数K': 'K',
  '水头高度h': 'h',
  '降雨量p_mm': 'p_mm',
  '地表径流CN条件': 'cn_condition',
  '土地利用类型': 'land_use',
  '围岩等级': 'grades',
  '等效半径r': 'r',
  '混凝土标号': 'concrete_grade',
  '钢筋类型': 'rebar_type',
  '临界水头Pcrown_crit': 'Pcrown_crit',
  // 双洞特有参数
  '双洞间距D_spacing': 'D_spacing',
  '中隔墙水头ha': 'ha'
};

// 逆向映射字典（导出时使用）
const reverseFieldMapping: Record<string, string> = Object.fromEntries(
  Object.entries(fieldMapping).map(([key, value]) => [value, key])
);

/**
 * 生成并下载包含标准表头和数据有效性提示的空 Excel 模板
 * @param tunnelType 当前隧道洞型 ('single' | 'double')
 */
export const downloadTemplate = (tunnelType: 'single' | 'double'): void => {
  const store = useParameterStore();
  // 提取对应洞型的默认参数键值，过滤生成所需表头
  const defaultParams = tunnelType === 'single' ? store.singleParams : store.doubleParams;
  const englishKeys = Object.keys(defaultParams);
  
  // 构建中文表头行
  const headers = englishKeys.map(key => reverseFieldMapping[key] || key);
  
  // 构建提示信息行（第二行通常作为填报说明）
  const tipsRow = englishKeys.map(key => {
    if (key === 'start_chainage' || key === 'end_chainage') return '填入数值(如: 1000)';
    if (key === 'tunnel_type') return tunnelType;
    if (key === 'water_level') return 'low 或 high';
    return '请参阅规范填入标准值';
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, tipsRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '导入模板');
  
  XLSX.writeFile(wb, `隧道排水参数导入模板_${tunnelType}.xlsx`);
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
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 解析为二维数组，跳过第二行提示说明
        const rawJson: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (rawJson.length <= 2) {
          throw new Error('未检测到有效数据行');
        }

        const headers = rawJson[0];
        const dataRows = rawJson.slice(2);
        
        const snapshotStore = useSnapshotStore();
        const parameterStore = useParameterStore();
        const snapshots = [];

        // 按里程区段自动进行数据切片，依次生成对应的状态字典
        for (const row of dataRows) {
          if (row.length === 0) continue;
          
          const paramsDict: Record<string, any> = {};
          headers.forEach((header: string, index: number) => {
            const engKey = fieldMapping[header] || header;
            paramsDict[engKey] = row[index];
          });

          // 保留原始默认值，用 Excel 数据进行覆写
          const tunnelType = paramsDict['tunnel_type'] || parameterStore.activeTunnelType;
          const baseParams = tunnelType === 'single' 
            ? parameterStore.singleParams 
            : parameterStore.doubleParams;
            
          const mergedParams = { ...baseParams, ...paramsDict };

          // 封装快照对象
          snapshots.push({
            id: `snap_imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            remark: `Excel批量导入: ${mergedParams.start_chainage}-${mergedParams.end_chainage}`,
            start_chainage: Number(mergedParams.start_chainage),
            end_chainage: Number(mergedParams.end_chainage),
            params: mergedParams,
          });
        }

        // 批量封装为快照序列推送到 snapshotStore 存档，支撑 3D 组合拼装
        if (snapshots.length > 0) {
          snapshotStore.buildSequence(sequenceName, snapshots);
          
          // 默认将第一条数据应用到当前表单
          parameterStore.overrideAll(snapshots[0].params, snapshots[0].params.tunnel_type);
        }
        
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('文件读取异常'));
    reader.readAsArrayBuffer(file);
  });
};