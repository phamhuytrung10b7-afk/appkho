import * as XLSX from 'xlsx';
import { ModelBOM, ModelBOMItem } from './types';

export interface BOMParseResult {
  modelName: string;
  modelDescription?: string;
  items: ModelBOMItem[];
  totalRows: number;
  skippedRows: number;
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
 * - Top 5 rows: Header / metadata (Row 1..5)
 *   - Row 4 (Index 3): Col A: Model Code (e.g. RMVSHA76639LA), Col B: Model Description
 * - Row 6 (Index 5): Header row:
 *   - Col A (0): lvl (STT)
 *   - Col B (1): Item (Mã linh kiện)
 *   - Col C (2): Description (Tên linh kiện)
 *   - Col D (3): [Bỏ qua]
 *   - Col E (4): Tồn kho [Bỏ qua]
 *   - Col F (5): Quantity (Định mức)
 *   - Col G (6): ĐVT (Đơn vị tính của linh kiện, e.g. Cái, Cuộn, kg, Bộ)
 * - Row 7+ (Index 6+): Data rows
 */
export function parseFactoryBOMExcel(
  fileData: ArrayBuffer | Uint8Array,
  fallbackModelName?: string,
  fileName?: string
): BOMParseResult {
  const workbook = XLSX.read(fileData, { type: 'array', cellFormula: true, cellStyles: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error('File Excel không có dữ liệu Sheet!');
  }

  const ref = worksheet['!ref'] || 'A1:Z500';
  const range = XLSX.utils.decode_range(ref);

  let detectedModelName = '';
  let detectedDescription = '';

  // 1. Check top 6 rows for Model Name metadata (e.g. Row 4 has RMVSHA76639LA in Col A or Col B)
  for (let r = range.s.r; r <= Math.min(range.s.r + 5, range.e.r); r++) {
    const colA = getCellStr(worksheet, r, 0);
    const colB = getCellStr(worksheet, r, 1);

    if (colA && !colA.toLowerCase().includes('đề nghị') && !colA.toLowerCase().includes('overview') && !colA.toLowerCase().includes('lvl')) {
      if (!detectedModelName && colA.length >= 3) {
        detectedModelName = colA;
      }
    }
    if (colB && (colB.toLowerCase().includes('sunhouse') || colB.toLowerCase().includes('máy') || colB.toLowerCase().includes('model'))) {
      detectedDescription = colB;
      if (!detectedModelName) {
        // Extract Model token from text e.g. SHA76639LA
        const match = colB.match(/([A-Z0-9]{5,})/);
        if (match) detectedModelName = match[1];
      }
    }
  }

  // Determine final Model Name
  let finalModelName = (fallbackModelName || '').trim();
  if (!finalModelName) {
    if (detectedModelName) {
      finalModelName = detectedModelName;
    } else if (fileName) {
      // Remove extension
      finalModelName = fileName.replace(/\.[^/.]+$/, '').trim();
    } else {
      finalModelName = `Model-${Date.now().toString().substring(6)}`;
    }
  }

  // 2. Find header row: scan rows 0..15 to find columns
  // Default expected indices based on factory layout:
  let headerRowIndex = 5; // Row 6 (0-indexed: 5)
  let itemCol = 1;        // Col B (1) -> Item
  let descCol = 2;        // Col C (2) -> Description
  let qtyCol = 5;         // Col F (5) -> Quantity (Định mức)
  let unitCol = 6;        // Col G (6) -> ĐVT (Đơn vị tính bên cạnh Quantity)

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

      if (cellText === 'item' || cellText.includes('mã vt') || cellText.includes('mã linh kiện') || cellText.includes('mã hàng')) {
        hasItem = true;
        tempItem = c;
      } else if (cellText.includes('description') || cellText.includes('tên vt') || cellText.includes('tên linh kiện') || cellText.includes('tên hàng') || cellText === 'mô tả') {
        hasDesc = true;
        tempDesc = c;
      } else if (cellText.includes('quantity') || cellText.includes('định mức') || cellText === 'sl' || cellText.includes('số lượng')) {
        hasQty = true;
        tempQty = c;
      } else if (cellText.includes('đvt') || cellText.includes('đơn vị') || cellText === 'unit') {
        tempUnit = c;
      }
    }

    if (hasItem && (hasDesc || hasQty)) {
      headerRowIndex = r;
      if (tempItem !== -1) itemCol = tempItem;
      if (tempDesc !== -1) descCol = tempDesc;
      if (tempQty !== -1) qtyCol = tempQty;
      if (tempUnit !== -1) unitCol = tempUnit;
      else unitCol = qtyCol + 1; // Default to column right next to Quantity
      foundHeader = true;
      break;
    }
  }

  // If header not found dynamically, default to factory layout: header at row 5 (0-indexed), data starts at row 6
  if (!foundHeader) {
    headerRowIndex = 5;
    itemCol = 1;
    descCol = 2;
    qtyCol = 5;
    unitCol = 6;
  }

  const items: ModelBOMItem[] = [];
  let skippedRows = 0;

  // 3. Parse Data Rows starting from headerRowIndex + 1
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

    // Validation
    if (!cleanCode) {
      skippedRows++;
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
      skippedRows++;
      continue;
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
    totalRows: items.length + skippedRows,
    skippedRows,
  };
}

/**
 * Generate Factory Standard BOM Sample Excel File (.xlsx)
 * Matching the exact image layout provided:
 * - Row 1: ĐỀ NGHỊ LÃNH VẬT TƯ DÂY CHUYỀN LẮP RÁP | KHSX : 21/08
 * - Row 2: Overview: BOM | 57 - BD-Bo tem bom (Minh 08.7.26)
 * - Row 4: RMVSHA76639LA | Máy lọc nước ion kiềm Hydrogen UltraX Sunhouse SHA76639LA | NHẬP SL IN
 * - Row 5: Batch quantity : | 1 | Cái
 * - Row 6: lvl | Item | Description | [Trống] | Tồn kho | Quantity | ĐVT
 * - Row 7+: Sample parts
 */
export function generateSampleBOMExcel(): Uint8Array {
  const rows: any[][] = [
    ['ĐỀ NGHỊ LÃNH VẬT TƯ DÂY CHUYỀN LẮP RÁP', '', '', '', 'KHSX : 21/08', '', ''],
    ['Overview: BOM', '', '', '57 - BD-Bo tem bom (Minh 08.7.26)', '', '', ''],
    ['', '', '', '', '', '', ''],
    ['RMVSHA76639LA', 'Máy lọc nước ion kiềm Hydrogen UltraX Sunhouse SHA76639LA', '', '', '', 'NHẬP SL IN', ''],
    ['', '', '', 'Batch quantity :', '', 1, 'Cái'],
    ['lvl', 'Item', 'Description', '', 'Tồn kho', 'Quantity', 'ĐVT'],
    [1, '04-29-07-SHA76210KL-0007', 'Adapter NS2415V3C', '', 1181, 1.00, 'Cái'],
    [2, 'VLP-BDDHX-K19X50', 'Băng dính định hình màu xanh K19x50', '', 181, 0.01, 'Cuộn'],
    [3, 'VLP-BDTT-4.8', 'Băng dính trong to 4.8 cm', '', 182, 0.02, 'Cuộn'],
    [4, '02-35-06-SHB9101-0005', 'Băng dính xốp dưới mặt bếp 9100/9101', '', 2238, 0.10, 'Cái'],
    [5, 'VLP-BDX-XANH', 'Băng dính xốp xanh', '', 1736, 0.02, 'Cuộn'],
    [6, 'VLP-BTQMTD-12', 'Băng tan quấn máy tự động khổ 12mm', '', 29, 0.01, 'kg'],
    [7, '04-29-07-SHA76210KL-0005', 'Bầu nóng 1.5L', '', 748, 1.00, 'Bộ'],
    [8, '04-28-03-BRA590N-0006', 'Bình áp HK TANK Model 3.2G', '', 1125, 1.00, 'Cái'],
    [9, '04-29-07-SHA76213CK-0008', 'Block ASV25H', '', 478, 1.00, 'Cái'],
    [10, '04-28-03-SHA8838K-0002', 'Bọ nhựa PP 15mm', '', 30596, 2.00, 'Cái'],
    [11, '04-28-03-SHA8800KL-0011', 'Bộ cốc lọc thô màu trắng NN', '', 4268, 2.00, 'Bộ'],
    [12, '04-28-03-SHA8800KL-0010', 'Bộ cốc lọc thô màu trong xanh SH NN', '', 2665, 1.00, 'Bộ'],
    [13, '04-29-07-SHA76636KL-0002', 'Bộ dây điện rời SHA76636KL', '', 3217, 1.00, 'Bộ'],
    [14, '04-29-07-SHA76636KL-0003', 'Bộ dây nguồn tổng SHA76636KL', '', 4812, 1.00, 'Cái'],
    [15, 'VLP-BHT-BOM2', 'Bột hàn the (BD)', '', '-', 0.00, 'kg']
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [
    { wch: 6 },  // A: lvl
    { wch: 28 }, // B: Item
    { wch: 45 }, // C: Description
    { wch: 18 }, // D: Trống / Metadata
    { wch: 12 }, // E: Tồn kho
    { wch: 12 }, // F: Quantity
    { wch: 10 }  // G: ĐVT
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
