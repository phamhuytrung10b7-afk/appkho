import * as XLSX from 'xlsx';
import { ModelBOM, ModelBOMItem } from './types';

export interface BOMParseResult {
  modelName: string;
  modelDescription?: string;
  items: ModelBOMItem[];
  totalFileRows: number;
  acceptedCount: number;
  skippedUnmatchedCount: number;
  unmatchedCodes: string[];
  skippedHeaderRows: number;
}

/**
 * Robust number parsing for quantities that can be numbers, strings with commas or dots, formulas
 */
function parseBOMQuantity(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  
  if (typeof val === 'object' && val !== null) {
    const raw = val.v !== undefined ? val.v : (val.val !== undefined ? val.val : val.formatted);
    if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
    val = String(raw || '');
  }

  let s = String(val).trim();
  if (!s || s === '-') return 0;

  // Handle Vietnamese/European format e.g. "1,00" -> 1.0, "0,01" -> 0.01, "1.181,50" -> 1181.5
  if (s.includes('.') && s.includes(',')) {
    // If dot comes before comma e.g. 1.234,56
    if (s.indexOf('.') < s.indexOf(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,234.56
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    // Check if comma is decimal e.g. "0,01" or "1,00"
    s = s.replace(',', '.');
  }

  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

/**
 * Extract text from cell
 */
function getCellStr(worksheet: XLSX.WorkSheet, r: number, c: number): string {
  const cellAddress = XLSX.utils.encode_cell({ r, c });
  const cell = worksheet[cellAddress];
  if (!cell) return '';
  if (cell.w !== undefined) return String(cell.w).trim();
  if (cell.v !== undefined) return String(cell.v).trim();
  return '';
}

/**
 * Parse factory BOM Excel file matching Factory Standard Layout:
 * - Image 1 Layout (5 columns):
 *   - Row 1: lvl | Item | Description | [Trống] | Quantity
 *   - Row 2+: Data rows
 * - Also supports legacy/extended layouts with top header metadata or explicit ĐVT column.
 * 
 * @param allowedPartCodes If provided, ONLY components present in this list will be accepted. All other components will be filtered out.
 */
export function parseFactoryBOMExcel(
  fileData: ArrayBuffer | Uint8Array,
  fallbackModelName?: string,
  fileName?: string,
  allowedPartCodes?: string[]
): BOMParseResult {
  const workbook = XLSX.read(fileData, { type: 'array', cellFormula: true, cellStyles: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error('File Excel không có dữ liệu Sheet!');
  }

  const ref = worksheet['!ref'] || 'A1:Z500';
  const range = XLSX.utils.decode_range(ref);

  let detectedModelCode = '';
  let detectedDescription = '';

  // 1. Dynamic Model Name Detection across top rows (Row 0..5):
  // Check Row 4 (index 3) first if it's a factory layout with metadata
  const row4A = getCellStr(worksheet, 3, 0);
  const row4B = getCellStr(worksheet, 3, 1);

  if (row4A && !row4A.toLowerCase().startsWith('đề nghị') && !row4A.toLowerCase().startsWith('overview') && !row4A.toLowerCase().startsWith('lvl')) {
    detectedModelCode = row4A.replace(/^(model|mã model|mã sp|mã|bom)\s*[:：\-]\s*/i, '').trim();
    if (row4B) {
      detectedDescription = row4B.trim();
    }
  }

  // If not found in Row 4, scan rows 0..5 for any cell that has Model info
  if (!detectedModelCode) {
    for (let r = range.s.r; r <= Math.min(range.s.r + 5, range.e.r); r++) {
      for (let c = range.s.c; c <= Math.min(range.s.c + 5, range.e.c); c++) {
        const text = getCellStr(worksheet, r, c);
        if (!text) continue;

        // Check if cell explicitly says "Model: XYZ" or "RMV..."
        const modelMatch = text.match(/(?:Model|Mã Model|KHSX|SP)\s*[:：\-]\s*([A-Za-z0-9_\-\.]+)/i);
        if (modelMatch && modelMatch[1]) {
          detectedModelCode = modelMatch[1].trim();
          break;
        }

        // Check if cell matches typical uppercase Model code (e.g. RMV..., SHA..., SHB..., APB..., KG..., etc.)
        if (!detectedModelCode && /^[A-Z0-9]{3,}[A-Z0-9_\-\.]{2,}$/.test(text) && !text.includes(' ') && text.length >= 4) {
          if (!['OVERVIEW', 'QUANTITY', 'DESCRIPTION', 'TOTAL', 'ITEM', 'LVL'].includes(text.toUpperCase())) {
            detectedModelCode = text.trim();
          }
        }
      }
      if (detectedModelCode) break;
    }
  }

  // Determine final Model Name (Priority: user-typed > detected > file name > fallback)
  let finalModelName = (fallbackModelName || '').trim();
  if (!finalModelName) {
    if (detectedModelCode) {
      finalModelName = detectedModelCode;
    } else if (fileName) {
      // Extract clean model name from file name
      // e.g. "BOM_SHA76639LA.xlsx" -> "SHA76639LA", "Dinh_muc_SHB9101_2026.xlsx" -> "SHB9101"
      let cleanFileName = fileName.replace(/\.[^/.]+$/, '').trim();
      cleanFileName = cleanFileName.replace(/^(mau_bom|bom|dinh_muc|bang_dinh_muc|mau)[_\-\s]+/i, '');
      finalModelName = cleanFileName || fileName.replace(/\.[^/.]+$/, '').trim();
    } else {
      finalModelName = `Model-${Date.now().toString().substring(6)}`;
    }
  }

  // 2. Find header row: scan rows 0..15 to find columns dynamically
  // Default expected indices based on Image 1 layout:
  // Row 1 (index 0): lvl (0), Item (1), Description (2), [empty] (3), Quantity (4)
  let headerRowIndex = 0; // Row 1 by default (0-indexed)
  let itemCol = 1;        // Col B (1) -> Item
  let descCol = 2;        // Col C (2) -> Description
  let qtyCol = 4;         // Col E (4) -> Quantity (Image 1 standard)
  let unitCol = -1;       // Optional unit column

  let foundHeader = false;
  for (let r = range.s.r; r <= Math.min(range.s.r + 15, range.e.r); r++) {
    let hasItem = false;
    let hasDesc = false;
    let hasQty = false;

    let tempItem = -1;
    let tempDesc = -1;
    let tempQty = -1;
    let tempUnit = -1;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellText = getCellStr(worksheet, r, c).toLowerCase().trim();
      if (!cellText) continue;

      if (cellText === 'item' || cellText.includes('mã vt') || cellText.includes('mã linh kiện') || cellText.includes('mã hàng') || cellText === 'mã sp') {
        hasItem = true;
        tempItem = c;
      } else if (cellText.includes('description') || cellText.includes('tên vt') || cellText.includes('tên linh kiện') || cellText.includes('tên hàng') || cellText === 'mô tả') {
        hasDesc = true;
        tempDesc = c;
      } else if (cellText.includes('quantity') || cellText.includes('định mức') || cellText === 'sl' || cellText.includes('số lượng') || cellText === 'qty') {
        hasQty = true;
        tempQty = c;
      } else if (cellText.includes('đvt') || cellText.includes('đơn vị') || cellText === 'unit' || cellText === 'uom') {
        tempUnit = c;
      }
    }

    if (hasItem && (hasDesc || hasQty)) {
      headerRowIndex = r;
      if (tempItem !== -1) itemCol = tempItem;
      if (tempDesc !== -1) descCol = tempDesc;
      if (tempQty !== -1) qtyCol = tempQty;
      if (tempUnit !== -1) unitCol = tempUnit;
      foundHeader = true;
      break;
    }
  }

  // If header not found dynamically, default to Image 1 layout: header at row 0, data starts at row 1
  if (!foundHeader) {
    headerRowIndex = 0;
    itemCol = 1;
    descCol = 2;
    qtyCol = 4;
    unitCol = -1;
  }

  // 3. Build Allowed Part Codes Set for filtering
  // Requirement: "chỉ nhận những linh kiện nào đang có trong danh sách linh kiện thôi nhé"
  const allowedSet: Set<string> | null =
    allowedPartCodes && allowedPartCodes.length > 0
      ? new Set(allowedPartCodes.map((code) => code.trim().toLowerCase()))
      : null;

  const items: ModelBOMItem[] = [];
  let skippedHeaderOrEmpty = 0;
  let skippedUnmatchedCount = 0;
  const unmatchedCodes: string[] = [];

  // 4. Parse Data Rows starting from headerRowIndex + 1
  for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
    const rawCode = getCellStr(worksheet, r, itemCol);
    const rawName = getCellStr(worksheet, r, descCol);
    const rawUnit = unitCol !== -1 ? getCellStr(worksheet, r, unitCol) : '';

    // Get Quantity value
    const cellAddress = XLSX.utils.encode_cell({ r, c: qtyCol });
    const qtyCell = worksheet[cellAddress];
    const rawQty = qtyCell ? (qtyCell.v !== undefined ? qtyCell.v : (qtyCell.w !== undefined ? qtyCell.w : 0)) : 0;
    const quantity = parseBOMQuantity(rawQty);

    const cleanCode = rawCode.trim();
    const cleanName = rawName.trim() || cleanCode;
    const cleanUnit = rawUnit.trim() || 'Cái';

    // Skip empty or blank lines
    if (!cleanCode) {
      skippedHeaderOrEmpty++;
      continue;
    }

    const lowerCode = cleanCode.toLowerCase();
    // Skip summary or repeated header lines
    if (
      lowerCode === 'item' ||
      lowerCode === 'mã linh kiện' ||
      lowerCode.includes('tổng cộng') ||
      lowerCode.includes('tổng cộng:') ||
      lowerCode === 'tổng' ||
      lowerCode === 'cộng' ||
      lowerCode === 'lvl'
    ) {
      skippedHeaderOrEmpty++;
      continue;
    }

    // FILTER: Check against allowed system parts list if provided
    if (allowedSet) {
      if (!allowedSet.has(lowerCode)) {
        // Part code does NOT exist in warehouse parts catalog -> SKIP IT
        skippedUnmatchedCount++;
        unmatchedCodes.push(cleanCode);
        continue;
      }
    }

    items.push({
      partCode: cleanCode,
      partName: cleanName,
      quantity: quantity,
      unit: cleanUnit,
    });
  }

  return {
    modelName: finalModelName,
    modelDescription: detectedDescription,
    items,
    totalFileRows: items.length + skippedUnmatchedCount,
    acceptedCount: items.length,
    skippedUnmatchedCount,
    unmatchedCodes,
    skippedHeaderRows: headerRowIndex + 1 + skippedHeaderOrEmpty,
  };
}

/**
 * Generate Factory Standard BOM Sample Excel File (.xlsx)
 * Matching the exact image layout provided in Image 1:
 * - Row 1: lvl | Item | Description | [Trống] | Quantity
 * - Row 2+: Sample components matching factory standard
 */
export function generateSampleBOMExcel(): Uint8Array {
  const rows: any[][] = [
    ['lvl', 'Item', 'Description', '', 'Quantity'],
    [6, '04-29-07-SHA76210KL-0007', 'Adapter NS2415V3C', '', 1.00],
    [5, 'VLP-BDDHX-K19X50', 'Băng dính định hình màu xanh', '', 0.01],
    [4, 'VLP-BDTT-4.8', 'Băng dính trong to 4.8 cm', '', 0.02],
    [3, '02-35-06-SHB9101-0005', 'Băng dính xốp dưới mặt bếp 9', '', 0.10],
    [2, 'VLP-BDX-XANH', 'Băng dính xốp xanh', '', 0.02],
    [1, 'VLP-BTQMTD-12', 'Băng tan quấn máy tự động kl', '', 0.01],
    [2, '04-29-07-SHA76210KL-0005', 'Bầu nóng 1.5L', '', 1.00],
    [3, '04-28-03-BRA590N-0006', 'Bình áp HK TANK Model 3.2G', '', 1.00],
    [4, '04-29-07-SHA76213CK-0008', 'Block ASV25H', '', 1.00],
    [5, '04-28-03-SHA8838K-0002', 'Bọ nhựa PP 15mm', '', 2.00],
    [6, '04-28-03-SHA8800KL-0011', 'Bộ cốc lọc thô màu trắng NN', '', 2.00],
    [7, '04-28-03-SHA8800KL-0010', 'Bộ cốc lọc thô màu trong xan', '', 1.00],
    [8, '04-29-07-SHA76636KL-0002', 'Bộ dây điện rời SHA76636KL', '', 1.00],
    [9, '04-29-07-SHA76636KL-0003', 'Bộ dây nguồn tổng SHA76636', '', 1.00],
    [10, 'VLP-BHT-BOM2', 'Bột hàn the (BD)', '', 0.00],
    [11, '04-28-07-SHA8800KL-0003', 'Bơm tăng áp GFP-75K', '', 1.00],
    [12, '04-29-09-SHA76213CK-0004', 'Bulong M4x16, inox, mũ Ø7.5', '', 6.00],
    [13, '04-29-09-SHA76214CKNK-0001', 'Bulong M5x16, inox, mũ Ø8.3', '', 6.00],
    [14, '04-29-03-SHA76215CK-0003', 'C hãm cút ống 3/8"', '', 1.00],
    [15, '04-28-03-SHA8858K-0007', 'C hãm MLN R.O (TS)', '', 15.00]
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [
    { wch: 8 },  // A: lvl
    { wch: 30 }, // B: Item
    { wch: 45 }, // C: Description
    { wch: 8 },  // D: [Trống]
    { wch: 14 }  // E: Quantity
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BOM');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
}

/**
 * Trigger browser download of the sample BOM file
 */
export function downloadSampleBOMFile(filename = 'Mau_BOM_Dinh_Muc_Nha_May.xlsx'): void {
  const data = generateSampleBOMExcel();
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
