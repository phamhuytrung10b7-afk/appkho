import * as XLSX from 'xlsx';
import { Part, FifoLot } from './types';
import { storageService } from './storage';

export interface StockInExcelItem {
  id: string;
  stt: number | string;
  partCode: string;
  partName: string;
  unit: string;
  quantity: number; // SL đề nghị (nhập kho)
  location: string; // Vị trí nhập kho (Cột 8)
  matchedPart?: Part;
  isNewPart: boolean;
  isValid: boolean;
  errorMessage?: string;
  selected: boolean;
}

export interface ParsedStockInResult {
  fileName: string;
  items: StockInExcelItem[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  newPartsCount: number;
  matchedPartsCount: number;
  totalQuantity: number;
}

export interface FifoLotAllocation {
  lotId: string;
  contNumber: string;
  locationName: string;
  importDate: string;
  availableQty: number;
  allocatedQty: number;
}

export interface StockOutExcelItem {
  id: string;
  stt: number | string;
  partCode: string;
  partName: string;
  unit: string;
  quantity: number; // SL thực xuất (xuất kho)
  matchedPart?: Part;
  currentStock: number;
  hasEnoughStock: boolean;
  shortageQty: number;
  fifoAllocations: FifoLotAllocation[];
  isValid: boolean;
  errorMessage?: string;
  selected: boolean;
}

export interface ParsedStockOutResult {
  fileName: string;
  items: StockOutExcelItem[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  enoughStockCount: number;
  outOfStockCount: number;
  totalRequestedQty: number;
  totalAllocatedQty: number;
}

/**
 * Robust Vietnamese & International number parser
 * Handles strings like "3,90", "2,84", "1.000,00", "2.000,00", "100", 22.22
 */
export function parseVietnameseNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.round(val * 100) / 100;
  }
  let str = String(val).trim();
  if (!str) return 0;

  // Remove currency / unit text if present
  str = str.replace(/[^\d.,+-]/g, '');
  if (!str) return 0;

  // If contains both '.' and ','
  if (str.includes('.') && str.includes(',')) {
    const dotIdx = str.lastIndexOf('.');
    const commaIdx = str.lastIndexOf(',');
    if (dotIdx < commaIdx) {
      // European / Vietnamese format: 1.000,00 -> '.' is thousand separator, ',' is decimal
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 1,000.00 -> ',' is thousand separator, '.' is decimal
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // Only commas
    const parts = str.split(',');
    if (parts.length === 2 && parts[1].length === 3 && parseInt(parts[0], 10) > 0) {
      // Thousands separator: e.g. "1,000"
      str = str.replace(/,/g, '');
    } else {
      // Decimal separator: e.g. "3,90" -> "3.90"
      str = str.replace(',', '.');
    }
  } else if (str.includes('.')) {
    // Only dots: check if thousands or decimal
    const parts = str.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      // e.g. "1.000" or "10.000" -> thousands separator
      str = str.replace(/\./g, '');
    }
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
}

/**
 * Parse an Excel file for Stock In (Nhập kho)
 * Expected columns (Matching Image 3):
 * Col 1 (A): STT
 * Col 2 (B): Mã VT (Mã linh kiện)
 * Col 3 (C): Tên VT (Tên linh kiện)
 * Col 4 (D): ĐVT (Đơn vị tính)
 * Col 5 (E): SL đề nghị (Số lượng nhập kho)
 * Col 6 (F): SL thực xuất (Bỏ qua)
 * Col 7 (G): Ghi chú (Bỏ qua)
 * Col 8 (H): Vị trí nhập kho (Nhận thông tin vị trí nhập kho)
 */
export async function parseStockInExcel(
  file: File,
  systemParts: Part[]
): Promise<ParsedStockInResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error('File Excel không có dữ liệu bảng tính!');
  }

  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('File Excel rỗng!');
  }

  // Find header row or default to row index 0
  let headerRowIndex = 0;
  let colIndexMap = {
    stt: 0,
    partCode: 1,
    partName: 2,
    unit: 3,
    quantity: 4, // SL đề nghị
    location: 7, // Cột 8: Vị trí nhập kho
  };

  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row)) continue;

    const rowStr = row.map((c) => String(c).toLowerCase().trim());
    const hasCodeHeader = rowStr.some((c) => c.includes('mã vt') || c.includes('ma vt') || c.includes('mã linh kiện') || c.includes('mã hàng'));
    const hasQtyHeader = rowStr.some((c) => c.includes('sl đề nghị') || c.includes('đề nghị') || c.includes('số lượng') || c.includes('sl'));

    if (hasCodeHeader || hasQtyHeader) {
      headerRowIndex = r;
      // Dynamically locate columns by header names if found
      rowStr.forEach((cellText, idx) => {
        if (cellText === 'stt' || cellText.includes('số tt')) colIndexMap.stt = idx;
        else if (cellText.includes('mã vt') || cellText.includes('mã linh kiện') || cellText.includes('mã sp') || cellText === 'mã') colIndexMap.partCode = idx;
        else if (cellText.includes('tên vt') || cellText.includes('tên linh kiện') || cellText.includes('tên hàng') || cellText === 'tên') colIndexMap.partName = idx;
        else if (cellText.includes('đvt') || cellText.includes('đơn vị') || cellText === 'dvt') colIndexMap.unit = idx;
        else if (cellText.includes('sl đề nghị') || cellText.includes('đề nghị') || cellText.includes('sl nhập')) colIndexMap.quantity = idx;
        else if (cellText.includes('vị trí') || cellText.includes('vi tri') || cellText.includes('kệ') || cellText.includes('khoang')) colIndexMap.location = idx;
      });
      break;
    }
  }

  const items: StockInExcelItem[] = [];

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const rawCode = row[colIndexMap.partCode] !== undefined ? String(row[colIndexMap.partCode]).trim() : '';
    const rawName = row[colIndexMap.partName] !== undefined ? String(row[colIndexMap.partName]).trim() : '';
    const rawUnit = row[colIndexMap.unit] !== undefined ? String(row[colIndexMap.unit]).trim() : 'Cái';
    const rawQty = row[colIndexMap.quantity];
    const rawLoc = row[colIndexMap.location] !== undefined ? String(row[colIndexMap.location]).trim() : '';
    const rawStt = row[colIndexMap.stt] !== undefined ? String(row[colIndexMap.stt]).trim() : String(items.length + 1);

    // Skip empty rows or footer rows (e.g. "Tổng cộng", "Người lập")
    if (!rawCode && !rawName) continue;
    if (rawCode.toLowerCase().includes('tổng') || rawName.toLowerCase().includes('tổng cộng') || rawCode.toLowerCase().includes('ký tên')) {
      continue;
    }

    const qty = parseVietnameseNumber(rawQty);

    // Match with system parts
    const matchedPart = systemParts.find(
      (p) => p.code.toLowerCase().trim() === rawCode.toLowerCase()
    );

    const isNewPart = !matchedPart;
    let isValid = true;
    let errorMessage = '';

    if (!rawCode) {
      isValid = false;
      errorMessage = 'Thiếu mã linh kiện';
    } else if (qty <= 0) {
      isValid = false;
      errorMessage = 'Số lượng nhập phải lớn hơn 0';
    }

    // Default location if empty: use matched part location or default warehouse
    const resolvedLoc = rawLoc || (matchedPart?.location ? matchedPart.location.split(',')[0].split('(')[0].trim() : 'Kho chính');

    items.push({
      id: `in-${r}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      stt: rawStt || items.length + 1,
      partCode: rawCode,
      partName: rawName || (matchedPart ? matchedPart.name : rawCode),
      unit: rawUnit || (matchedPart ? matchedPart.unit : 'Cái'),
      quantity: qty,
      location: resolvedLoc,
      matchedPart,
      isNewPart,
      isValid,
      errorMessage,
      selected: isValid,
    });
  }

  const validRows = items.filter((i) => i.isValid).length;
  const invalidRows = items.length - validRows;
  const newPartsCount = items.filter((i) => i.isNewPart && i.isValid).length;
  const matchedPartsCount = items.filter((i) => !i.isNewPart && i.isValid).length;
  const totalQuantity = items
    .filter((i) => i.isValid)
    .reduce((sum, i) => sum + i.quantity, 0);

  return {
    fileName: file.name,
    items,
    totalRows: items.length,
    validRows,
    invalidRows,
    newPartsCount,
    matchedPartsCount,
    totalQuantity: Math.round(totalQuantity * 100) / 100,
  };
}

/**
 * Calculate FIFO allocation for a specific part and requested quantity.
 * Retrieves FIFO lots chronologically, allocating from the oldest lots first.
 */
export function calculatePartFifoAllocation(
  part: Part,
  requestedQty: number
): { allocations: FifoLotAllocation[]; totalAllocated: number; hasEnough: boolean } {
  const fifoLots = storageService.getPartFifoLots(part.id);
  const activeLots = fifoLots.filter((lot) => lot.remainingQty > 0);

  const allocations: FifoLotAllocation[] = [];
  let remainingNeed = requestedQty;

  // 1. Allocate from active FIFO lots
  for (const lot of activeLots) {
    if (remainingNeed <= 0) break;
    const allocQty = Math.min(lot.remainingQty, remainingNeed);
    allocations.push({
      lotId: lot.id,
      contNumber: lot.contNumber,
      locationName: lot.locationName || part.location?.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính',
      importDate: lot.importDate,
      availableQty: lot.remainingQty,
      allocatedQty: allocQty,
    });
    remainingNeed -= allocQty;
  }

  // 2. If part has currentStock but fifoLots did not cover all (e.g. unallocated stock or legacy locations)
  if (remainingNeed > 0 && part.currentStock >= requestedQty) {
    const locs = storageService.getPartLocations(part);
    for (const loc of locs) {
      if (remainingNeed <= 0) break;
      if (loc.quantity > 0) {
        // Check if this location already used in fifoLots
        const alreadyAlloc = allocations
          .filter((a) => a.locationName.toLowerCase() === loc.locationName.toLowerCase())
          .reduce((sum, a) => sum + a.allocatedQty, 0);
        const freeInLoc = Math.max(0, loc.quantity - alreadyAlloc);
        if (freeInLoc > 0) {
          const allocQty = Math.min(freeInLoc, remainingNeed);
          allocations.push({
            lotId: `loc-${loc.locationName}`,
            contNumber: 'Tồn Kho Vị Trí',
            locationName: loc.locationName,
            importDate: part.createdAt || new Date().toISOString(),
            availableQty: loc.quantity,
            allocatedQty: allocQty,
          });
          remainingNeed -= allocQty;
        }
      }
    }
  }

  // 3. Fallback if still remaining but part.currentStock >= requestedQty
  if (remainingNeed > 0 && part.currentStock >= requestedQty) {
    allocations.push({
      lotId: `fallback-${part.id}`,
      contNumber: 'Kho Chính',
      locationName: part.location?.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính',
      importDate: part.createdAt || new Date().toISOString(),
      availableQty: part.currentStock,
      allocatedQty: remainingNeed,
    });
    remainingNeed = 0;
  }

  const totalAllocated = allocations.reduce((sum, a) => sum + a.allocatedQty, 0);
  const hasEnough = part.currentStock >= requestedQty;

  return {
    allocations,
    totalAllocated: Math.round(totalAllocated * 100) / 100,
    hasEnough,
  };
}

/**
 * Parse an Excel file for Stock Out (Xuất kho - FIFO)
 * Cấu trúc chuẩn theo mẫu:
 * Col 1: STT
 * Col 2: Mã VT (Mã linh kiện)
 * Col 3: Tên VT (Tên linh kiện)
 * Col 4: ĐVT (Đơn vị tính)
 * Col 5: SL đề nghị (Số lượng cần xuất kho)
 * Cols 6, 7, 8: Bỏ qua (SL thực xuất, Ghi chú, Vị trí)
 */
export async function parseStockOutExcel(
  file: File,
  systemParts: Part[]
): Promise<ParsedStockOutResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error('File Excel không có dữ liệu bảng tính!');
  }

  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('File Excel rỗng!');
  }

  // Header detection
  let headerRowIndex = 0;
  let colIndexMap = {
    stt: 0,
    partCode: 1,
    partName: 2,
    unit: 3,
    quantity: 4, // Mặc định Cột 5 (index 4): SL đề nghị (hiểu là số lượng cần xuất kho)
    altQuantity: 5, // Cột 6: nếu file chỉ có cột thực xuất ở cột 6
  };

  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row)) continue;

    const rowStr = row.map((c) => String(c).toLowerCase().trim());
    const hasCodeHeader = rowStr.some((c) => c.includes('mã vt') || c.includes('ma vt') || c.includes('mã linh kiện') || c.includes('mã hàng'));
    const hasQtyHeader = rowStr.some((c) => c.includes('sl đề nghị') || c.includes('đề nghị') || c.includes('sl xuất') || c.includes('sl thực xuất'));

    if (hasCodeHeader || hasQtyHeader) {
      headerRowIndex = r;
      rowStr.forEach((cellText, idx) => {
        if (cellText === 'stt' || cellText.includes('số tt')) {
          colIndexMap.stt = idx;
        } else if (cellText.includes('mã vt') || cellText.includes('mã linh kiện') || cellText.includes('mã sp') || cellText === 'mã') {
          colIndexMap.partCode = idx;
        } else if (cellText.includes('tên vt') || cellText.includes('tên linh kiện') || cellText.includes('tên hàng') || cellText === 'tên') {
          colIndexMap.partName = idx;
        } else if (cellText.includes('đvt') || cellText.includes('đơn vị') || cellText === 'dvt') {
          colIndexMap.unit = idx;
        } else if (cellText.includes('sl đề nghị') || cellText.includes('đề nghị') || cellText.includes('yêu cầu')) {
          // Ưu tiên cao nhất: Cột SL đề nghị là số lượng cần xuất kho!
          colIndexMap.quantity = idx;
        } else if (cellText.includes('sl xuất') || cellText.includes('thực xuất')) {
          // Fallback nếu không có cột SL đề nghị riêng
          if (colIndexMap.quantity === 4 && !rowStr.some(c => c.includes('sl đề nghị') || c.includes('đề nghị'))) {
            colIndexMap.quantity = idx;
          } else {
            colIndexMap.altQuantity = idx;
          }
        }
      });
      break;
    }
  }

  const items: StockOutExcelItem[] = [];

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const rawCode = row[colIndexMap.partCode] !== undefined ? String(row[colIndexMap.partCode]).trim() : '';
    const rawName = row[colIndexMap.partName] !== undefined ? String(row[colIndexMap.partName]).trim() : '';
    const rawUnit = row[colIndexMap.unit] !== undefined ? String(row[colIndexMap.unit]).trim() : 'Cái';
    
    // Check primary quantity column (Col 5 / index 4), or alt column (Col 6 / index 5)
    let rawQty = row[colIndexMap.quantity];
    if ((rawQty === undefined || rawQty === '' || rawQty === 0) && row[colIndexMap.altQuantity] !== undefined && row[colIndexMap.altQuantity] !== '') {
      rawQty = row[colIndexMap.altQuantity];
    }

    const rawStt = row[colIndexMap.stt] !== undefined ? String(row[colIndexMap.stt]).trim() : String(items.length + 1);

    if (!rawCode && !rawName) continue;
    if (rawCode.toLowerCase().includes('tổng') || rawName.toLowerCase().includes('tổng cộng') || rawCode.toLowerCase().includes('ký tên')) {
      continue;
    }

    const qty = parseVietnameseNumber(rawQty);

    // Find in system parts
    const matchedPart = systemParts.find(
      (p) => p.code.toLowerCase().trim() === rawCode.toLowerCase()
    );

    const currentStock = matchedPart ? matchedPart.currentStock : 0;
    const hasEnoughStock = Boolean(matchedPart && currentStock >= qty && qty > 0);
    const shortageQty = matchedPart ? Math.max(0, qty - currentStock) : qty;

    let isValid = true;
    let errorMessage = '';

    if (!rawCode) {
      isValid = false;
      errorMessage = 'Thiếu mã linh kiện';
    } else if (!matchedPart) {
      isValid = false;
      errorMessage = 'Mã không tồn tại trong kho';
    } else if (qty <= 0) {
      isValid = false;
      errorMessage = 'Số lượng xuất phải lớn hơn 0';
    } else if (!hasEnoughStock) {
      isValid = false;
      errorMessage = `Tồn kho không đủ (Hiện còn: ${currentStock.toLocaleString('vi-VN')} ${matchedPart.unit}, Cần xuất: ${qty.toLocaleString('vi-VN')})`;
    }

    // Calculate FIFO allocations if matched
    const fifoResult = matchedPart && qty > 0
      ? calculatePartFifoAllocation(matchedPart, qty)
      : { allocations: [], totalAllocated: 0, hasEnough: false };

    items.push({
      id: `out-${r}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      stt: rawStt || items.length + 1,
      partCode: rawCode,
      partName: rawName || (matchedPart ? matchedPart.name : rawCode),
      unit: rawUnit || (matchedPart ? matchedPart.unit : 'Cái'),
      quantity: qty,
      matchedPart,
      currentStock,
      hasEnoughStock,
      shortageQty,
      fifoAllocations: fifoResult.allocations,
      isValid,
      errorMessage,
      selected: isValid,
    });
  }

  const validRows = items.filter((i) => i.isValid).length;
  const invalidRows = items.length - validRows;
  const enoughStockCount = items.filter((i) => i.hasEnoughStock && i.matchedPart).length;
  const outOfStockCount = items.filter((i) => !i.hasEnoughStock && i.matchedPart).length;
  const totalRequestedQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalAllocatedQty = items
    .filter((i) => i.isValid && i.selected)
    .reduce((sum, i) => sum + i.quantity, 0);

  return {
    fileName: file.name,
    items,
    totalRows: items.length,
    validRows,
    invalidRows,
    enoughStockCount,
    outOfStockCount,
    totalRequestedQty: Math.round(totalRequestedQty * 100) / 100,
    totalAllocatedQty: Math.round(totalAllocatedQty * 100) / 100,
  };
}

/**
 * Generate and trigger download for Sample Excel File (Nhập kho)
 * Perfectly matches Image 3
 */
export function downloadSampleStockInExcel() {
  const headers = [
    'STT',
    'Mã VT',
    'Tên VT',
    'ĐVT',
    'SL đề nghị',
    'SL thực xuất',
    'Ghi chú',
    'Vị trí nhập kho',
  ];

  const sampleData = [
    [1, 'VLP-TNL-120X400', 'Túi nilon 120x500', 'kg', '3,90', '', '', 'A01'],
    [2, 'VLP-TNL-100X160', 'Túi nilon ZIPPER 100x160 mm', 'kg', '3,00', '', '', 'A02'],
    [3, 'VLP-QHD-BD', 'Que hàn đồng (BD)', 'kg', '2,84', '', '', 'A03'],
    [4, 'VLP-QHD-10%BAC', 'Que hàn đồng (chứa 10% bạc)', 'kg', '1,67', '', '', 'A04'],
    [5, 'VLP-MXPE-FOAM-12', 'Mút xốp PE Foam 12mm', 'met', '100,00', '', '', 'A05'],
    [6, 'VLP-KTN-MT', 'Keo tản nhiệt màu trắng', 'kg', '1,67', '', '', 'A06'],
    [7, 'VLP-KEO-SILI-A300', 'Keo SILICON A300', 'lọ', '22,22', '', '', 'A07'],
    [8, 'VLP-DT-500', 'Dây thít 500', 'Cái', '1.000,00', '', '', 'A08'],
    [9, 'VLP-DD-14MM-10KG', 'Dây đai 14mm (theo mẫu), cuộn 10kg', 'kg', '58,82', '', '', 'A09'],
    [10, 'VLP-BDX-XANH', 'Băng dính xốp xanh', 'Cuộn', '21,67', '', '', 'A10'],
    [11, 'VLP-BDTT-4.8', 'Băng dính trong to 4.8 cm', 'Cuộn', '21,11', '', '', 'A11'],
    [12, 'VLP-BDDHX-K19X50', 'Băng dính định hình màu xanh K19x50', 'Cuộn', '14,00', '', '', 'A12'],
    [13, '04-29-09-SHA76688SH-0000', 'Vít bulong M4 D6.5 + đệm vênh, phẳng (trắng)', 'Cái', '2.000,00', '', '', 'A13'],
    [14, '04-29-09-SHA76258LA-0000', 'Vít bulong M4 D6.5 + đệm vênh, mũ phẳng (trắng)', 'Cái', '4.000,00', '', '', 'A14'],
    [15, '04-29-09-SHA76213CK-0004', 'Bulong M4x16 inox, mũ Ø7.5', 'Cái', '4.000,00', '', '', 'A15'],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);

  // Set column widths
  ws['!cols'] = [
    { wch: 6 },  // STT
    { wch: 28 }, // Mã VT
    { wch: 45 }, // Tên VT
    { wch: 8 },  // ĐVT
    { wch: 14 }, // SL đề nghị
    { wch: 14 }, // SL thực xuất
    { wch: 15 }, // Ghi chú
    { wch: 18 }, // Vị trí nhập kho
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mau_Nhap_Kho');
  XLSX.writeFile(wb, 'Mau_Nhap_Kho_Linh_Kien.xlsx');
}

/**
 * Generate and trigger download for Sample Excel File (Xuất kho - FIFO)
 * Cột 1: STT | Cột 2: Mã VT | Cột 3: Tên VT | Cột 4: ĐVT | Cột 5: SL đề nghị | Cột 6: SL thực xuất (bỏ qua) | Cột 7: Ghi chú | Cột 8: Vị trí (bỏ qua)
 */
export function downloadSampleStockOutExcel() {
  const headers = [
    'STT',
    'Mã VT',
    'Tên VT',
    'ĐVT',
    'SL đề nghị',
    'SL thực xuất',
    'Ghi chú',
    'Vị trí',
  ];

  const sampleData = [
    [1, 'VLP-TNL-120X400', 'Túi nilon 120x500', 'kg', '3,90', '', 'Xuất lắp ráp', ''],
    [2, 'VLP-TNL-100X160', 'Túi nilon ZIPPER 100x160 mm', 'kg', '3,00', '', 'Xuất đóng gói', ''],
    [3, 'VLP-QHD-BD', 'Que hàn đồng (BD)', 'kg', '2,84', '', 'Xưởng hàn', ''],
    [4, 'VLP-DT-500', 'Dây thít 500', 'Cái', '500,00', '', 'Line 1', ''],
    [5, '04-29-09-SHA76688SH-0000', 'Vít bulong M4 D6.5 + đệm vênh, phẳng (trắng)', 'Cái', '1.000,00', '', 'Bổ sung đơn hàng', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);

  ws['!cols'] = [
    { wch: 6 },  // STT
    { wch: 28 }, // Mã VT
    { wch: 45 }, // Tên VT
    { wch: 8 },  // ĐVT
    { wch: 16 }, // SL đề nghị
    { wch: 14 }, // SL thực xuất
    { wch: 20 }, // Ghi chú
    { wch: 14 }, // Vị trí
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mau_Xuat_Kho');
  XLSX.writeFile(wb, 'Mau_Xuat_Kho_FIFO_Linh_Kien.xlsx');
}
