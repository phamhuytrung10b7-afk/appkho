import * as XLSX from 'xlsx';
import { Part } from './types';

export interface ContainerImportItem {
  id: string;
  tagId: string; // Mã Token QR độc nhất để kiểm soát mỗi tem chỉ được quét 1 lần
  code: string;
  name: string;
  unit: string;
  quantity: number; // Cột XUẤT (Số lượng cont về)
  contNumber: string; // Mã Cont (e.g. GAOU7800407)
  contDate: string; // Ngày Cont (e.g. 16/07/2026)
  supplier?: string; // Nhà cung cấp
  mfgDate?: string; // Ngày sản xuất
  matchedPart?: Part; // Linh kiện có sẵn trong hệ thống
  isNewPart: boolean; // Linh kiện mới chưa có trong hệ thống
  printCopies: number; // Số tem cần in (Mặc định: 1)
  qrPayload: string; // Embedded QR payload: CONT_IN|MãVT|SL|MãCont|TagID|NgàyCont|Supplier|MfgDate
}

export interface ContainerImportResult {
  contNumber: string;
  contDate: string;
  items: ContainerImportItem[];
  totalQuantity: number;
  newPartsCount: number;
  matchedPartsCount: number;
}

/**
 * Check if a row is hidden in Excel worksheet
 */
function isRowHidden(worksheet: XLSX.WorkSheet, r: number): boolean {
  if (!worksheet['!rows']) return false;
  const rowProp = worksheet['!rows'][r] as any;
  if (!rowProp) return false;
  return Boolean(
    rowProp.hidden ||
    rowProp.h ||
    (rowProp.hpx !== undefined && rowProp.hpx === 0) ||
    (rowProp.hpt !== undefined && rowProp.hpt === 0)
  );
}

/**
 * Check if a column is hidden in Excel worksheet
 */
function isColHidden(worksheet: XLSX.WorkSheet, c: number): boolean {
  if (!worksheet['!cols']) return false;
  const colProp = worksheet['!cols'][c] as any;
  if (!colProp) return false;
  return Boolean(colProp.hidden || colProp.h);
}

/**
 * Safely get cell data at row r, col c
 */
function getCellData(worksheet: XLSX.WorkSheet, r: number, c: number): {
  val: any;
  formatted: string;
  formula: string;
} {
  const cellAddress = XLSX.utils.encode_cell({ r, c });
  const cell = worksheet[cellAddress];
  if (!cell) return { val: '', formatted: '', formula: '' };
  return {
    val: cell.v !== undefined ? cell.v : '',
    formatted: cell.w ? String(cell.w).trim() : (cell.v !== undefined ? String(cell.v).trim() : ''),
    formula: cell.f ? String(cell.f).trim() : '',
  };
}

/**
 * Parse string math expressions e.g. "384+384" -> 768
 */
function parseMathExpr(str: string): number {
  if (!str) return 0;
  // Clean string to keep digits, +, ., commas
  const cleaned = str.replace(/[^0-9+.,]/g, '');
  if (!cleaned) return 0;

  if (cleaned.includes('+')) {
    const parts = cleaned.split('+');
    let sum = 0;
    for (const p of parts) {
      sum += parseStringQuantity(p);
    }
    return sum;
  }
  return parseStringQuantity(cleaned);
}

/**
 * Clean & parse string quantity.
 * Handles Vietnamese dot separators (1.000 -> 1000) and commas.
 */
export function parseStringQuantity(valStr: string): number {
  if (!valStr) return 0;
  let str = valStr.trim();
  if (!str) return 0;

  // Handle addition e.g. "384+384" or "12 THÙNG X 40 + 20"
  if (str.includes('+')) {
    return parseMathExpr(str);
  }

  // Handle Vietnamese dot thousands separators e.g. "1.000", "21.000", "1.920"
  if (/^\d{1,3}(\.\d{3})+$/.test(str)) {
    str = str.replace(/\./g, '');
  } else if (/^\d{1,3}(,\d{3})+$/.test(str)) {
    str = str.replace(/,/g, '');
  } else {
    // If str has dots and commas e.g. "1.000,00"
    if (str.includes('.') && str.includes(',')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.includes('.')) {
      // Check if dot is thousands or decimal
      const parts = str.split('.');
      if (parts.length > 1 && parts[parts.length - 1].length === 3) {
        str = str.replace(/\./g, '');
      }
    }
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}

/**
 * Clean & parse quantity from Excel cell object or raw value.
 */
export function parseContainerQuantity(qtyCellData: { val: any; formatted: string; formula: string } | any): number {
  if (qtyCellData === null || qtyCellData === undefined || qtyCellData === '') return 0;

  // If passed simple number
  if (typeof qtyCellData === 'number') {
    return isNaN(qtyCellData) ? 0 : Math.round(qtyCellData);
  }

  // If passed cell data object
  if (typeof qtyCellData === 'object' && qtyCellData !== null) {
    const { val, formatted, formula } = qtyCellData;

    // 1. Raw value is numeric (e.g. 1000, 1920, 21000, 768)
    if (typeof val === 'number' && !isNaN(val)) {
      return Math.round(val);
    }

    // 2. Formula string e.g. "384+384"
    if (formula) {
      const res = parseMathExpr(formula);
      if (res > 0) return res;
    }

    // 3. String formatted / value
    const strVal = String(formatted || val || '').trim();
    return parseStringQuantity(strVal);
  }

  // Simple string
  return parseStringQuantity(String(qtyCellData));
}

/**
 * Parse an uploaded DANH MỤC CONT Excel file buffer/array
 */
export function parseContainerExcel(
  fileData: ArrayBuffer | Uint8Array,
  systemParts: Part[]
): ContainerImportResult {
  const workbook = XLSX.read(fileData, { type: 'array', cellFormula: true, cellStyles: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  let contNumber = 'GAOU7800407'; // Fallback default if not detected
  let contDate = '';

  // Get sheet range
  const ref = worksheet['!ref'] || 'A1:Z100';
  const range = XLSX.utils.decode_range(ref);

  // 1. Scan top 15 rows to detect Container Number e.g. "cont: GAOU7800407" and Date e.g. "16/07/2026"
  for (let r = range.s.r; r <= Math.min(range.s.r + 15, range.e.r); r++) {
    if (isRowHidden(worksheet, r)) continue;

    let rowText = '';
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellData = getCellData(worksheet, r, c);
      if (cellData.formatted) {
        rowText += ' ' + cellData.formatted;
      }
    }

    if (!contDate) {
      const dateMatch = rowText.match(/(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/);
      if (dateMatch && dateMatch[1]) {
        contDate = dateMatch[1].trim();
      }
    }

    const contMatch = rowText.match(/cont\s*[:\s]*([A-Z0-9_\-]+)/i);
    if (contMatch && contMatch[1]) {
      contNumber = contMatch[1].trim();
    }
  }

  // Fallback contDate if not found in sheet
  if (!contDate) {
    const now = new Date();
    contDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
  }

  // 2. Find header row with "Mã VT" / "Tên VT" / "ĐVT" / "XUẤT" / "Nhà cung cấp" / "Ngày SX"
  let headerRowIndex = -1;
  let codeCol = -1;
  let nameCol = -1;
  let unitCol = -1;
  let qtyCol = -1;
  let supplierCol = -1;
  let mfgDateCol = -1;

  for (let r = range.s.r; r <= Math.min(range.s.r + 25, range.e.r); r++) {
    if (isRowHidden(worksheet, r)) continue;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellText = getCellData(worksheet, r, c).formatted.toLowerCase();
      if (!cellText) continue;

      if (
        codeCol === -1 &&
        (cellText.includes('mã vt') ||
          cellText.includes('mã vật tư') ||
          cellText.includes('mã linh kiện') ||
          cellText === 'mã' ||
          cellText === 'item')
      ) {
        codeCol = c;
        headerRowIndex = r;
      }
      if (
        nameCol === -1 &&
        (cellText.includes('tên vt') ||
          cellText.includes('tên vật tư') ||
          cellText.includes('tên linh kiện') ||
          cellText.includes('description') ||
          cellText === 'tên')
      ) {
        nameCol = c;
      }
      if (
        unitCol === -1 &&
        (cellText.includes('đvt') || cellText.includes('đơn vị'))
      ) {
        unitCol = c;
      }
      if (
        qtyCol === -1 &&
        (cellText.includes('xuất') || cellText.includes('số lượng') || cellText === 'sl')
      ) {
        qtyCol = c;
      }
      if (
        supplierCol === -1 &&
        (cellText.includes('nhà cung cấp') ||
          cellText.includes('ncc') ||
          cellText.includes('supplier') ||
          cellText.includes('hãng sx'))
      ) {
        supplierCol = c;
      }
      if (
        mfgDateCol === -1 &&
        (cellText.includes('ngày sx') ||
          cellText.includes('ngày sản xuất') ||
          cellText.includes('mfg') ||
          cellText.includes('nsx') ||
          cellText.includes('ngày đóng'))
      ) {
        mfgDateCol = c;
      }
    }

    if (codeCol !== -1 && nameCol !== -1) {
      break;
    }
  }

  // Fallbacks if header auto-detection was partial
  if (headerRowIndex === -1) {
    headerRowIndex = 4; // Row 5 in 1-based index
  }
  if (codeCol === -1) codeCol = 0; // Col A
  if (nameCol === -1) nameCol = 1; // Col B
  if (unitCol === -1) unitCol = 2; // Col C

  // If qtyCol was not found in header pass, scan headerRowIndex across ALL columns
  if (qtyCol === -1) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellText = getCellData(worksheet, headerRowIndex, c).formatted.toLowerCase();
      if (cellText.includes('xuất') || cellText.includes('số lượng') || cellText === 'sl') {
        qtyCol = c;
        break;
      }
    }
  }

  // Fallback to Column O (14) or Column D (3) if still not found
  if (qtyCol === -1) {
    qtyCol = 14; // Default to Column O in DANH MỤC CONT standard template
  }

  // Fallback for supplierCol (Col E / 4 in user's sheet) and mfgDateCol (Col F / 5 in user's sheet)
  if (supplierCol === -1) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellText = getCellData(worksheet, headerRowIndex, c).formatted.toLowerCase();
      if (cellText.includes('nhà cung cấp') || cellText.includes('ncc') || cellText.includes('supplier')) {
        supplierCol = c;
        break;
      }
    }
    if (supplierCol === -1 && range.e.c >= 4) supplierCol = 4; // Default Col E
  }

  if (mfgDateCol === -1) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellText = getCellData(worksheet, headerRowIndex, c).formatted.toLowerCase();
      if (cellText.includes('ngày sx') || cellText.includes('ngày sản xuất') || cellText.includes('nsx') || cellText.includes('mfg')) {
        mfgDateCol = c;
        break;
      }
    }
    if (mfgDateCol === -1 && range.e.c >= 5) mfgDateCol = 5; // Default Col F
  }

  const items: ContainerImportItem[] = [];
  let totalQuantity = 0;
  let newPartsCount = 0;
  let matchedPartsCount = 0;

  // Map system parts for quick lookup by lower code
  const systemPartsMap = new Map<string, Part>();
  systemParts.forEach((p) => {
    systemPartsMap.set(p.code.trim().toLowerCase(), p);
  });

  // 3. Iterate data rows after header
  for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
    // CRITICAL: SKIP HIDDEN ROWS IN EXCEL!
    if (isRowHidden(worksheet, r)) {
      continue;
    }

    const codeCell = getCellData(worksheet, r, codeCol);
    const nameCell = getCellData(worksheet, r, nameCol);
    const unitCell = getCellData(worksheet, r, unitCol);
    const qtyCell = getCellData(worksheet, r, qtyCol);
    const supplierCell = supplierCol !== -1 ? getCellData(worksheet, r, supplierCol) : { val: '', formatted: '', formula: '' };
    const mfgDateCell = mfgDateCol !== -1 ? getCellData(worksheet, r, mfgDateCol) : { val: '', formatted: '', formula: '' };

    const rawCode = String(codeCell.formatted || codeCell.val || '').trim();
    const rawName = String(nameCell.formatted || nameCell.val || '').trim();
    const rawUnit = String(unitCell.formatted || unitCell.val || 'Cái').trim();
    const rawSupplier = String(supplierCell.formatted || supplierCell.val || '').trim();
    let rawMfgDate = String(mfgDateCell.formatted || mfgDateCell.val || '').trim();

    // If mfgDate is numeric Excel date code, format it to DD/MM/YYYY
    if (!rawMfgDate && typeof mfgDateCell.val === 'number') {
      try {
        const parsedDate = XLSX.SSF.parse_date_code(mfgDateCell.val);
        if (parsedDate) {
          rawMfgDate = `${parsedDate.d.toString().padStart(2, '0')}/${parsedDate.m.toString().padStart(2, '0')}/${parsedDate.y}`;
        }
      } catch {
        // ignore
      }
    }

    // Ignore empty code/name or totals row
    if (!rawCode || !rawName) continue;
    const lowerCode = rawCode.toLowerCase();
    if (
      lowerCode.includes('mã vt') ||
      lowerCode.includes('tổng') ||
      lowerCode.includes('cộng') ||
      lowerCode.includes('danh mục cont') ||
      lowerCode === 'item'
    ) {
      continue;
    }

    const quantity = parseContainerQuantity(qtyCell);

    // Look up existing part in system
    const matchedPart = systemPartsMap.get(lowerCode);
    const isNewPart = !matchedPart;

    if (isNewPart) {
      continue; // Bỏ qua các linh kiện không có trong danh sách
    } else {
      matchedPartsCount++;
    }

    totalQuantity += quantity;

    const cleanCont = contNumber.replace(/[^a-zA-Z0-9]/g, '');
    const cleanCode = rawCode.replace(/[^a-zA-Z0-9]/g, '');
    const tagId = `TAG-${cleanCont}-${cleanCode}-${r}`;

    // Build QR code embedded payload (simplified without supplier & mfgDate for easier scanning): CONT_IN|MãVT|SốLượng|SốCont|TagID|NgàyCont
    const qrPayload = `CONT_IN|${rawCode}|${quantity}|${contNumber}|${tagId}|${contDate}`;

    items.push({
      id: `cont-item-${r}-${Math.random().toString(36).substring(2, 6)}`,
      tagId,
      code: rawCode,
      name: rawName,
      unit: rawUnit || (matchedPart ? matchedPart.unit : 'Cái'),
      quantity,
      contNumber,
      contDate,
      supplier: rawSupplier,
      mfgDate: rawMfgDate,
      matchedPart,
      isNewPart,
      printCopies: 1, // Default 1 label per line item
      qrPayload,
    });
  }

  return {
    contNumber,
    contDate,
    items,
    totalQuantity,
    newPartsCount,
    matchedPartsCount,
  };
}
