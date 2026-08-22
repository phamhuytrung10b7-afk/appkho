import * as XLSX from 'xlsx';
import { getPartGroupConfig, PartGroupColorConfig } from './partGroupColors';

export interface MasterKittingTag {
  id: string;
  stt: string; // Số e.g. "Số 1", "Số 9"
  partCode: string; // Mã linh kiện
  partName: string; // Tên linh kiện
  standardQty: number; // Số lượng tiêu chuẩn (Định mức)
  unit: string; // ĐVT e.g. "cái/bộ"
  groupName: string; // Nhóm linh kiện e.g. "Nhóm điện", "Nhóm cao su, silicon", "Nhóm vít/bulong các loại"
  ccdcSpec: string; // Quy cách CCDC e.g. "KHAY A005 205x135x90 mm"
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
 * Sample Master Data pre-loaded matching Image 1 and Image 2 from Factory Standard
 */
export const SAMPLE_MASTER_TAGS: MasterKittingTag[] = [
  {
    id: 'master-sample-1',
    stt: 'Số 1',
    partCode: '04-29-05-SHA76210KL-0001',
    partName: 'Cụm Ống silicon đường xả (200mm)',
    standardQty: 0,
    unit: 'cái/bộ',
    groupName: 'Nhóm cao su, silicon',
    ccdcSpec: '0',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm cao su, silicon'),
    qrPayload: '04-29-05-SHA76210KL-0001||CAO_SU',
  },
  {
    id: 'master-sample-2',
    stt: 'Số 2',
    partCode: '04-29-05-SHA76210KL-0000',
    partName: 'Cụm Ống silicon đường xả (320mm)',
    standardQty: 0,
    unit: 'cái/bộ',
    groupName: 'Nhóm cao su, silicon',
    ccdcSpec: '0',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm cao su, silicon'),
    qrPayload: '04-29-05-SHA76210KL-0000||CAO_SU',
  },
  {
    id: 'master-sample-3',
    stt: 'Số 3',
    partCode: '04-28-05-SHA8891KL-0000',
    partName: 'Nút cao su giảm chấn',
    standardQty: 0,
    unit: 'cái/bộ',
    groupName: 'Nhóm cao su, silicon',
    ccdcSpec: '0',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm cao su, silicon'),
    qrPayload: '04-28-05-SHA8891KL-0000||CAO_SU',
  },
  {
    id: 'master-sample-4',
    stt: 'Số 4',
    partCode: '04-29-05-SHA76213CK-0000',
    partName: 'Ống Silicon 5x8',
    standardQty: 0,
    unit: 'm',
    groupName: 'Nhóm cao su, silicon',
    ccdcSpec: '0',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm cao su, silicon'),
    qrPayload: '04-29-05-SHA76213CK-0000||CAO_SU',
  },
  {
    id: 'master-sample-5',
    stt: 'Số 5',
    partCode: '04-29-05-SHR76210CK-0005',
    partName: 'Ống silicon đầu vào,ra -Nóng',
    standardQty: 0,
    unit: 'cái/bộ',
    groupName: 'Nhóm cao su, silicon',
    ccdcSpec: '0',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm cao su, silicon'),
    qrPayload: '04-29-05-SHR76210CK-0005||CAO_SU',
  },
  {
    id: 'master-sample-6',
    stt: 'Số 6',
    partCode: '04-29-05-SHR76210CK-0002',
    partName: 'Ống silicon thẳng đầu vào,ra',
    standardQty: 0,
    unit: 'cái/bộ',
    groupName: 'Nhóm cao su, silicon',
    ccdcSpec: '0',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm cao su, silicon'),
    qrPayload: '04-29-05-SHR76210CK-0002||CAO_SU',
  },
  {
    id: 'master-sample-7',
    stt: 'Số 7',
    partCode: '04-29-05-SHR76210CKNK-0002',
    partName: 'Gioăng chống tràn gỉ nước RO nóng lạnh phi 6-2.5',
    standardQty: 0,
    unit: 'cái/bộ',
    groupName: 'Nhóm cao su, silicon',
    ccdcSpec: '0',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm cao su, silicon'),
    qrPayload: '04-29-05-SHR76210CKNK-0002||CAO_SU',
  },
  {
    id: 'master-sample-8',
    stt: 'Số 1',
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
    id: 'master-sample-9',
    stt: 'Số 2',
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
    id: 'master-sample-10',
    stt: 'Số 3',
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
    id: 'master-sample-11',
    stt: 'Số 4',
    partCode: '04-29-09-SHA76210KL-0001',
    partName: 'Long đen đệm D6.4x12',
    standardQty: 2000,
    unit: 'cái/bộ',
    groupName: 'Nhóm vít/bulong các loại',
    ccdcSpec: 'KHAY A005 205x135x90 mm',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm vít/bulong các loại'),
    qrPayload: '04-29-09-SHA76210KL-0001|2000|VIT_BULONG',
  },
  {
    id: 'master-sample-12',
    stt: 'Số 5',
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
    id: 'master-sample-13',
    stt: 'Số 6',
    partCode: '04-29-09-SHA76213CK-0000',
    partName: 'Vít bulong M4x8, Inox, mũ dù Ø 8.5',
    standardQty: 2000,
    unit: 'cái/bộ',
    groupName: 'Nhóm vít/bulong các loại',
    ccdcSpec: 'KHAY A005 205x135x90 mm',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm vít/bulong các loại'),
    qrPayload: '04-29-09-SHA76213CK-0000|2000|VIT_BULONG',
  },
  {
    id: 'master-sample-14',
    stt: 'Số 7',
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
  {
    id: 'master-sample-15',
    stt: 'Số 8',
    partCode: '04-29-09-SHR76210CKNK-0000',
    partName: 'Vít bulong M4x8, vàng, mũ Ø6.5, vát',
    standardQty: 2000,
    unit: 'cái/bộ',
    groupName: 'Nhóm vít/bulong các loại',
    ccdcSpec: 'KHAY A005 205x135x90 mm',
    supplier: 'SUNHOUSE NMBD',
    mfgFrequency: '1h / 1 lần',
    groupConfig: getPartGroupConfig('Nhóm vít/bulong các loại'),
    qrPayload: '04-29-09-SHR76210CKNK-0000|2000|VIT_BULONG',
  },
];

/**
 * Parse Excel file for Master Data (Image 2 format) with resilient multi-tier header and column recognition
 */
export function parseMasterExcel(fileData: ArrayBuffer | Uint8Array): MasterExcelParseResult {
  const workbook = XLSX.read(fileData, { type: 'array' });
  
  // Find the most suitable worksheet (prefer sheet with most data rows)
  let bestSheetName = workbook.SheetNames[0];
  let maxRowCount = 0;

  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const r: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (r && r.length > maxRowCount) {
      maxRowCount = r.length;
      bestSheetName = name;
    }
  }

  const worksheet = workbook.Sheets[bestSheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (!rows || rows.length === 0) {
    return { tags: [], totalRows: 0 };
  }

  // 1. Scan rows 0 to 20 to find the best header row
  let bestHeaderRow = 0;
  let bestHeaderScore = -1;
  let detectedCols = {
    sttCol: 0,
    nameCol: 1,
    qtyCol: 2,
    codeCol: 3,
    groupCol: 4,
    ccdcCol: 5,
    unitCol: -1,
  };

  const cleanStr = (v: any) =>
    String(v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\s\-_/\\,]+/g, ' ')
      .trim();

  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row) || row.length < 2) continue;

    let score = 0;
    let tempCols = {
      sttCol: -1,
      nameCol: -1,
      qtyCol: -1,
      codeCol: -1,
      groupCol: -1,
      ccdcCol: -1,
      unitCol: -1,
    };

    for (let c = 0; c < row.length; c++) {
      const cellText = cleanStr(row[c]);
      if (!cellText) continue;

      // Group Column check (e.g. "nhom linh kien", "nhom lk", "nhom vt", "nhom vat tu", "chung loai", "phan loai", "nhom")
      if (
        cellText.includes('nhom linh kien') ||
        cellText.includes('nhom lk') ||
        cellText.includes('nhom vt') ||
        cellText.includes('nhom vat tu') ||
        cellText.includes('chung loai') ||
        cellText.includes('loai linh kien') ||
        cellText.includes('phan loai nhom') ||
        cellText === 'nhom' ||
        cellText.startsWith('nhom ') ||
        cellText.includes('group') ||
        cellText.includes('category')
      ) {
        tempCols.groupCol = c;
        score += 5;
      }
      // Part Code Column check
      else if (
        cellText.includes('ma linh kien') ||
        cellText.includes('ma lk') ||
        cellText.includes('ma vt') ||
        cellText.includes('ma vat tu') ||
        cellText.includes('ma hang') ||
        cellText.includes('part code') ||
        cellText.includes('item code') ||
        cellText.includes('part no') ||
        cellText === 'ma' ||
        cellText === 'code'
      ) {
        tempCols.codeCol = c;
        score += 5;
      }
      // Part Name Column check
      else if (
        cellText.includes('ten linh kien') ||
        cellText.includes('ten lk') ||
        cellText.includes('ten vt') ||
        cellText.includes('ten vat tu') ||
        cellText.includes('ten hang') ||
        cellText.includes('part name') ||
        cellText.includes('description') ||
        cellText === 'ten' ||
        cellText === 'name'
      ) {
        tempCols.nameCol = c;
        score += 5;
      }
      // CCDC Spec Column check
      else if (
        cellText.includes('quy cach ccdc') ||
        cellText.includes('ccdc') ||
        cellText.includes('loai khay') ||
        cellText.includes('khay') ||
        cellText.includes('thung')
      ) {
        tempCols.ccdcCol = c;
        score += 4;
      }
      // Qty / Standard Spec Column check
      else if (
        cellText.includes('dinh muc') ||
        cellText.includes('so luong') ||
        cellText.includes('quy cach') ||
        cellText.includes('sl dinh muc') ||
        cellText === 'sl' ||
        cellText === 'qty'
      ) {
        tempCols.qtyCol = c;
        score += 3;
      }
      // STT Column check
      else if (
        cellText.includes('stt') ||
        cellText.includes('so tt') ||
        cellText.includes('so thu tu') ||
        cellText === 'so' ||
        cellText === 'no' ||
        cellText === '#'
      ) {
        tempCols.sttCol = c;
        score += 2;
      }
      // Unit Column check
      else if (
        cellText.includes('dvt') ||
        cellText.includes('don vi tinh') ||
        cellText.includes('don vi') ||
        cellText === 'unit'
      ) {
        tempCols.unitCol = c;
        score += 2;
      }
    }

    if (score > bestHeaderScore && (tempCols.codeCol !== -1 || tempCols.nameCol !== -1 || tempCols.groupCol !== -1)) {
      bestHeaderScore = score;
      bestHeaderRow = r;
      detectedCols = {
        sttCol: tempCols.sttCol !== -1 ? tempCols.sttCol : 0,
        nameCol: tempCols.nameCol !== -1 ? tempCols.nameCol : 1,
        qtyCol: tempCols.qtyCol !== -1 ? tempCols.qtyCol : 2,
        codeCol: tempCols.codeCol !== -1 ? tempCols.codeCol : 3,
        groupCol: tempCols.groupCol !== -1 ? tempCols.groupCol : 4,
        ccdcCol: tempCols.ccdcCol !== -1 ? tempCols.ccdcCol : 5,
        unitCol: tempCols.unitCol,
      };
    }
  }

  // 2. Data scanning fallback for group column if not explicitly named in header
  if (detectedCols.groupCol === -1 || detectedCols.groupCol === detectedCols.nameCol || detectedCols.groupCol === detectedCols.codeCol) {
    // Look at first 10 data rows to find which column contains group names like "Nhóm cao su", "Nhóm vít", "Nhóm điện"...
    const colGroupCount: Record<number, number> = {};
    for (let r = bestHeaderRow + 1; r < Math.min(rows.length, bestHeaderRow + 15); r++) {
      const row = rows[r];
      if (!row || !Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const val = cleanStr(row[c]);
        if (
          val.includes('nhom cao su') ||
          val.includes('nhom vit') ||
          val.includes('nhom dien') ||
          val.includes('nhom dong goi') ||
          val.includes('nhom kim loai') ||
          val.includes('nhom mach') ||
          val.includes('nhom nhua') ||
          val.includes('nhom thuy tinh') ||
          val.includes('cao su') ||
          val.includes('bulong')
        ) {
          colGroupCount[c] = (colGroupCount[c] || 0) + 1;
        }
      }
    }
    let maxGCount = 0;
    let foundGCol = 4;
    for (const [c, count] of Object.entries(colGroupCount)) {
      if (count > maxGCount) {
        maxGCount = count;
        foundGCol = Number(c);
      }
    }
    detectedCols.groupCol = foundGCol;
  }

  const { sttCol, nameCol, qtyCol, codeCol, groupCol, ccdcCol, unitCol } = detectedCols;
  const tags: MasterKittingTag[] = [];

  for (let r = bestHeaderRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const rawStt = row[sttCol] !== undefined && row[sttCol] !== null ? String(row[sttCol]).trim() : '';
    const rawName = String(row[nameCol] || '').trim();
    const rawCode = String(row[codeCol] || '').trim();
    const rawGroup = row[groupCol] !== undefined && row[groupCol] !== null ? String(row[groupCol]).trim() : '';
    const rawCcdc = row[ccdcCol] !== undefined && row[ccdcCol] !== null ? String(row[ccdcCol]).trim() : '';
    const rawUnit = unitCol !== -1 && row[unitCol] ? String(row[unitCol]).trim() : 'cái/bộ';

    // Parse Qty: if empty, 0, or "0", keep 0
    let rawQty = 0;
    if (row[qtyCol] !== undefined && row[qtyCol] !== null && String(row[qtyCol]).trim() !== '') {
      const parsed = parseFloat(String(row[qtyCol]).replace(/[^0-9.]/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        rawQty = parsed;
      }
    }

    if (!rawCode && !rawName) continue;
    if (
      cleanStr(rawCode).includes('ma linh kien') ||
      cleanStr(rawName).includes('ten linh kien') ||
      cleanStr(rawCode).includes('ma vt')
    ) {
      continue;
    }

    // Determine Group Configuration accurately from rawGroup string
    // If rawGroup is empty, fallback to inferring from part name
    const effectiveGroupStr = rawGroup || rawName;
    const groupConfig = getPartGroupConfig(effectiveGroupStr);
    const finalGroupName = rawGroup || groupConfig.name;

    // Standard format: [Mã_Linh_Kiện]|[Số_Lượng_Định_Mức]|[Mã_Nhóm]
    const qrPayload = `${rawCode}|${rawQty > 0 ? rawQty : ''}|${groupConfig.id}`;

    // Normalize STT format (e.g. "1" -> "Số 1", "Số 1" -> "Số 1")
    let displayStt = rawStt;
    if (displayStt && !displayStt.toLowerCase().startsWith('số')) {
      displayStt = `Số ${displayStt}`;
    }

    tags.push({
      id: `master-${rawCode}-${r}-${Math.random().toString(36).substring(2, 6)}`,
      stt: displayStt || `Số ${tags.length + 1}`,
      partCode: rawCode,
      partName: rawName,
      standardQty: rawQty,
      unit: rawUnit || 'cái/bộ',
      groupName: finalGroupName,
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

