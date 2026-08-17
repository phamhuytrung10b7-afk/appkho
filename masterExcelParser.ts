import * as XLSX from 'xlsx';
import { getPartGroupConfig, PartGroupColorConfig } from './partGroupColors';

export interface MasterKittingTag {
  id: string;
  stt: string; // Số e.g. "Số 1", "Số 9"
  partCode: string; // Mã linh kiện
  partName: string; // Tên linh kiện
  standardQty: number; // Số lượng tiêu chuẩn (Định mức)
  unit: string; // ĐVT e.g. "cái/bộ"
  groupName: string; // Nhóm linh kiện e.g. "Nhóm điện"
  ccdcSpec: string; // Quy cách CCDC e.g. "Thùng SB026 610x420x385 mm"
  supplier?: string;
  mfgFrequency?: string; // Tần suất e.g. "1h / 1 lần"
  groupConfig: PartGroupColorConfig;
  qrPayload: string; // Format: [Mã_Linh_Kiện]|[Số_Lượng_Định_Mức]|[Mã_Nhóm]
  printedCount?: number;
}

export interface MasterExcelParseResult {
  tags: MasterKittingTag[];
  totalRows: number;
}

/**
 * Sample Master Data pre-loaded matching Image 1 and Image 2
 */
export const SAMPLE_MASTER_TAGS: MasterKittingTag[] = [
  {
    id: 'master-sample-0',
    stt: 'Số 9',
    partCode: '02-33-07-SHB3336-0000',
    partName: 'Cụm đánh lửa 3336-V2 (0.80)',
    standardQty: 100,
    unit: 'cái/bộ',
    groupName: 'Nhóm điện',
    ccdcSpec: 'Thùng SB026 610x420x385 mm',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm điện'),
    qrPayload: '02-33-07-SHB3336-0000|100|DIEN',
  },
  {
    id: 'master-sample-1',
    stt: 'Số 1',
    partCode: '04-29-05-SHA76210KL-0001',
    partName: 'Cụm Ống silicon đường xả (200mm)',
    standardQty: 500,
    unit: 'cái/bộ',
    groupName: 'Nhóm cao su, silicon',
    ccdcSpec: 'Thùng SB026 610x420x385 mm',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm cao su, silicon'),
    qrPayload: '04-29-05-SHA76210KL-0001|500|CAO_SU',
  },
  {
    id: 'master-sample-2',
    stt: 'Số 2',
    partCode: '04-29-05-SHA76210KL-0000',
    partName: 'Cụm Ống silicon đường xả (320mm)',
    standardQty: 500,
    unit: 'cái/bộ',
    groupName: 'Nhóm cao su, silicon',
    ccdcSpec: 'Thùng SB026 610x420x385 mm',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm cao su, silicon'),
    qrPayload: '04-29-05-SHA76210KL-0000|500|CAO_SU',
  },
  {
    id: 'master-sample-3',
    stt: 'Số 3',
    partCode: '04-28-05-SHA8891KL-0000',
    partName: 'Nút cao su giảm chấn',
    standardQty: 1000,
    unit: 'cái/bộ',
    groupName: 'Nhóm cao su, silicon',
    ccdcSpec: 'KHAY A005 205x135x90 mm',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm cao su, silicon'),
    qrPayload: '04-28-05-SHA8891KL-0000|1000|CAO_SU',
  },
  {
    id: 'master-sample-4',
    stt: 'Số 4',
    partCode: '04-29-05-SHA76213CK-0000',
    partName: 'Ống Silicon 5x8',
    standardQty: 500,
    unit: 'm',
    groupName: 'Nhóm cao su, silicon',
    ccdcSpec: 'KHAY A008 355x210x170 mm',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm cao su, silicon'),
    qrPayload: '04-29-05-SHA76213CK-0000|500|CAO_SU',
  },
  {
    id: 'master-sample-5',
    stt: 'Số 5',
    partCode: '04-29-09-SHA76214CKNK-0000',
    partName: 'Đai ốc M5 liền long đen, inox',
    standardQty: 1000,
    unit: 'cái/bộ',
    groupName: 'Nhóm vít/bulong các loại',
    ccdcSpec: 'KHAY A005 205x135x90 mm',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm vít/bulong các loại'),
    qrPayload: '04-29-09-SHA76214CKNK-0000|1000|VIT_BULONG',
  },
  {
    id: 'master-sample-6',
    stt: 'Số 6',
    partCode: '04-29-09-SHA76210KL-0000',
    partName: 'Đai ốc M8',
    standardQty: 2000,
    unit: 'cái/bộ',
    groupName: 'Nhóm vít/bulong các loại',
    ccdcSpec: 'KHAY A008 355x210x170 mm',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm vít/bulong các loại'),
    qrPayload: '04-29-09-SHA76210KL-0000|2000|VIT_BULONG',
  },
  {
    id: 'master-sample-7',
    stt: 'Số 7',
    partCode: '04-29-09-SHA76210KL-0003',
    partName: 'Long đen hoa khế M4',
    standardQty: 2000,
    unit: 'cái/bộ',
    groupName: 'Nhóm vít/bulong các loại',
    ccdcSpec: 'KHAY A005 205x135x90 mm',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm vít/bulong các loại'),
    qrPayload: '04-29-09-SHA76210KL-0003|2000|VIT_BULONG',
  },
  {
    id: 'master-sample-8',
    stt: 'Số 8',
    partCode: '04-29-09-SHA76214CKNK-0001',
    partName: 'Bulong M5x16, inox, mũ Ø8.3',
    standardQty: 1000,
    unit: 'cái/bộ',
    groupName: 'Nhóm vít/bulong các loại',
    ccdcSpec: 'KHAY A005 205x135x90 mm',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm vít/bulong các loại'),
    qrPayload: '04-29-09-SHA76214CKNK-0001|1000|VIT_BULONG',
  },
  {
    id: 'master-sample-9',
    stt: 'Số 9',
    partCode: '04-28-09-SHA88512KV-0000',
    partName: 'Ecu rút M4',
    standardQty: 2000,
    unit: 'cái/bộ',
    groupName: 'Nhóm vít/bulong các loại',
    ccdcSpec: 'KHAY A0717 258x156x123 mm',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm vít/bulong các loại'),
    qrPayload: '04-28-09-SHA88512KV-0000|2000|VIT_BULONG',
  },
];

/**
 * Parse Excel file for Master Data (Image 2 format)
 */
export function parseMasterExcel(fileData: ArrayBuffer | Uint8Array): MasterExcelParseResult {
  const workbook = XLSX.read(fileData, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (!rows || rows.length === 0) {
    return { tags: [], totalRows: 0 };
  }

  // Find header row containing "Mã linh kiện" or "Tên linh kiện"
  let headerIndex = -1;
  let sttCol = 0;
  let nameCol = 1;
  let qtyCol = 2;
  let codeCol = 3;
  let groupCol = 4;
  let ccdcCol = 5;

  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row)) continue;

    for (let c = 0; c < row.length; c++) {
      const text = String(row[c] || '').toLowerCase().trim();
      if (text.includes('mã linh kiện') || text.includes('mã vt') || text === 'mã') {
        codeCol = c;
        headerIndex = r;
      }
      if (text.includes('tên linh kiện') || text.includes('tên vt') || text === 'tên') {
        nameCol = c;
      }
      if (text.includes('quy cách ccdc') || text.includes('ccdc') || text.includes('khay')) {
        ccdcCol = c;
      } else if (text.includes('quy cách') || text.includes('định mức') || text.includes('số lượng') || text === 'sl') {
        qtyCol = c;
      }
      if (text.includes('nhóm') || text.includes('nhóm linh kiện')) {
        groupCol = c;
      }
      if (text.includes('stt') || text.includes('số')) {
        sttCol = c;
      }
    }

    if (headerIndex !== -1) break;
  }

  if (headerIndex === -1) headerIndex = 0;

  const tags: MasterKittingTag[] = [];

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rawStt = row[sttCol] !== undefined && row[sttCol] !== null ? String(row[sttCol]).trim() : '';
    const rawName = String(row[nameCol] || '').trim();
    const rawCode = String(row[codeCol] || '').trim();
    
    // Parse Qty: if empty or missing, keep 0
    let rawQty = 0;
    if (row[qtyCol] !== undefined && row[qtyCol] !== null && String(row[qtyCol]).trim() !== '') {
      const parsed = parseFloat(String(row[qtyCol]).replace(/[^0-9.]/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        rawQty = parsed;
      }
    }

    const rawGroup = row[groupCol] !== undefined && row[groupCol] !== null ? String(row[groupCol]).trim() : '';
    const rawCcdc = row[ccdcCol] !== undefined && row[ccdcCol] !== null ? String(row[ccdcCol]).trim() : '';

    if (!rawCode && !rawName) continue;
    if (rawCode.toLowerCase().includes('mã') || rawName.toLowerCase().includes('tên')) continue;

    const groupConfig = getPartGroupConfig(rawGroup);
    // Standard format: [Mã_Linh_Kiện]|[Số_Lượng_Định_Mức]|[Mã_Nhóm]
    const qrPayload = `${rawCode}|${rawQty > 0 ? rawQty : ''}|${groupConfig.id}`;

    tags.push({
      id: `master-${rawCode}-${r}-${Math.random().toString(36).substring(2, 6)}`,
      stt: rawStt ? (rawStt.startsWith('Số') ? rawStt : `Số ${rawStt}`) : '',
      partCode: rawCode,
      partName: rawName,
      standardQty: rawQty,
      unit: 'cái/bộ',
      groupName: rawGroup || groupConfig.name,
      ccdcSpec: rawCcdc,
      supplier: 'SUNHOUSE NMBD',
      mfgFrequency: '1h / 1 lần',
      groupConfig,
      qrPayload,
    });
  }

  return {
    tags,
    totalRows: tags.length,
  };
}
