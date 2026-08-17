import { Part, PartLocationStock, Transaction, StockCheckRecord, AppSettings, ContainerBatch, ContainerQrTag, FifoLot, ModelBOM, ModelBOMItem, KittingQueueItem, BufferLocationMap, BufferPartItem, MaterialCallRequest, BomExportVoucher, BomExportVoucherItem, UserAccount, ViewTab, ConversionFactor, KittingScanLog, ProductivityPersonnelConfig, HourlyPersonnelSlot } from './types';
import { initialParts, initialTransactions, initialSettings } from './sampleData';
import { MasterKittingTag, SAMPLE_MASTER_TAGS } from './masterExcelParser';
import { supabaseKeyStore, supabaseRelationalStore, STORAGE_KEYS } from './supabaseStorage';
import { getActiveSupabaseClient } from './supabase';
import * as XLSX from 'xlsx';

const PARTS_KEY = 'thekho_parts_v1';
const TRANSACTIONS_KEY = 'thekho_transactions_v1';
const STOCK_CHECKS_KEY = 'thekho_stock_checks_v1';
const SETTINGS_KEY = 'thekho_settings_v1';
const CONTAINER_BATCHES_KEY = 'thekho_container_batches_v1';
const USED_QR_TOKENS_KEY = 'thekho_used_qr_tokens_v1';
const MODEL_BOMS_KEY = 'thekho_model_boms_v1';
const KITTING_QUEUE_KEY = 'thekho_kitting_queue_v1';
const BUFFER_MAP_KEY = 'thekho_buffer_map_v1';
const MATERIAL_CALLS_KEY = 'thekho_material_calls_v1';
const BOM_VOUCHERS_KEY = 'thekho_bom_vouchers_v1';
const MASTER_CONTAINER_TAGS_KEY = 'thekho_master_container_tags_v1';
const CONVERSION_FACTORS_KEY = 'thekho_conversion_factors_v1';
const KITTING_SCAN_LOGS_KEY = 'thekho_kitting_scan_logs_v1';
const PRODUCTIVITY_PERSONNEL_CONFIG_KEY = 'thekho_productivity_personnel_config_v1';
const CUSTOM_GENERATED_CONTAINER_TAGS_KEY = 'thekho_custom_generated_container_tags_v1';

export interface CustomGeneratedContainerTag extends MasterKittingTag {
  createdAt: string;
  createdReason?: string;
  isCustomGenerated?: boolean;
}

export const DEFAULT_CONVERSION_FACTORS: ConversionFactor[] = [
  { partCode: '04-29-00-SHA76219CK-0002', partName: 'Lõi lọc Mineral + nối nhanh (TC)', hsqd: 1.00 },
  { partCode: '04-28-03-BRA590N-0006', partName: 'Bình áp HK TANK Model 3.2G', hsqd: 3.98 },
  { partCode: '04-28-00-SHA88113K-0001', partName: 'Màng R.O TFC 100GPD', hsqd: 1.14 },
  { partCode: '04-28-00-SHA8839K-0009', partName: 'Lõi fa infrared nối nhanh (TC)', hsqd: 1.00 },
  { partCode: '04-29-00-SHA76219CK-0000', partName: 'Lõi lọc Nano silver nối nhanh (TC)', hsqd: 1.00 },
  { partCode: '04-29-00-SHA76219CK-0001', partName: 'Lõi lọc Active carbon nối nhanh (TC)', hsqd: 1.00 },
  { partCode: '04-29-00-SHA76219CK-0003', partName: 'Lõi lọc Alkaline nối nhanh (TC)', hsqd: 1.00 },
  { partCode: '04-29-00-SHA76219CK-0004', partName: 'Lõi lọc Hydrogen nối nhanh (TC)', hsqd: 1.00 },
  { partCode: '04-29-00-SHA76219CK-0005', partName: 'Lõi lọc Bio ceramic nối nhanh (TC)', hsqd: 1.00 },
  { partCode: '04-29-00-SHA76639LA-0000', partName: 'Lõi lọc Hydrogen ion kiềm nối nhanh (TC)', hsqd: 1.00 },
  { partCode: '04-29-00-SHA76639LA-0001', partName: 'Lõi lọc SUNHOUSE số 1 - 5micron (UltraX)', hsqd: 1.54 },
  { partCode: '04-29-00-SHA76639LA-0002', partName: 'Lõi lọc SUNHOUSE số 2 - GAC (UltraX)', hsqd: 1.54 },
  { partCode: '04-29-00-SHA76639LA-0003', partName: 'Lõi lọc SUNHOUSE số 3 - 1micron (UltraX)', hsqd: 1.54 },
  { partCode: '04-29-00-SHA76688SH-0000', partName: 'Van điện từ nối nhanh', hsqd: 0.38 },
  { partCode: '04-29-00-VOI-0001', partName: 'Vòi lấy nước NL cổ vuông (CT)', hsqd: 0.59 },
  { partCode: '04-29-00-VOMANG-0002', partName: 'Vỏ màng R.O (cắm nhanh)', hsqd: 1.13 },
  { partCode: '04-29-00-ADAPTER-0003', partName: 'Adapter NS2415V3C', hsqd: 1.15 },
  { partCode: '04-29-00-BAUNONG-0004', partName: 'Bầu nóng 1.5L', hsqd: 1.04 },
  { partCode: '04-29-00-BLOCK-0005', partName: 'Block ASV25H', hsqd: 2.93 },
  { partCode: '04-29-00-CANG-0001', partName: 'Càng cua đơn (to)', hsqd: 0.08 },
  { partCode: '04-29-00-CANG-0002', partName: 'Càng cua đơn (nhỏ)', hsqd: 0.08 },
  { partCode: '04-29-00-CANG-0003', partName: 'Càng cua đôi to-to', hsqd: 0.10 },
  { partCode: '04-29-00-BOM-0001', partName: 'Bơm tăng áp GFP-75K', hsqd: 1.90 },
  { partCode: '04-29-00-BINHLANH-0001', partName: 'Cụm bình lạnh 2L (CT)', hsqd: 1.03 },
  { partCode: '04-29-00-COC-0001', partName: 'Bộ cốc lọc thô màu trong xanh SH', hsqd: 4.45 },
  { partCode: '04-29-00-COC-0002', partName: 'Bộ cốc lọc thô màu trắng NN', hsqd: 4.45 },
];

export const DEFAULT_PRODUCTIVITY_PERSONNEL_CONFIG: ProductivityPersonnelConfig = {
  chinhThuc: 10,
  soanVatTu: 2,
  bocTach: 1,
  bocXep: 3,
  xeNang: 2,
  capPhat: 2,
  hourlySlots: [
    { slot: '8h-9h', nsChinhThuc: 1, nsThoiVu: 2, nhanSuMoiGio: 3 },
    { slot: '9h-10h', nsChinhThuc: 1, nsThoiVu: 2, nhanSuMoiGio: 3 },
    { slot: '10h-11h', nsChinhThuc: 1, nsThoiVu: 2, nhanSuMoiGio: 3 },
    { slot: '11h-12h', nsChinhThuc: 1, nsThoiVu: 2, nhanSuMoiGio: 3 },
    { slot: '13h-14h', nsChinhThuc: 1, nsThoiVu: 2, nhanSuMoiGio: 3 },
    { slot: '14h-15h', nsChinhThuc: 1, nsThoiVu: 2, nhanSuMoiGio: 3 },
    { slot: '15h-16h', nsChinhThuc: 1, nsThoiVu: 1, nhanSuMoiGio: 2 },
    { slot: '16h-17h', nsChinhThuc: 1, nsThoiVu: 1, nhanSuMoiGio: 2 },
    { slot: '17h-18h', nsChinhThuc: 0, nsThoiVu: 0, nhanSuMoiGio: 0 },
    { slot: '18h-19h', nsChinhThuc: 0, nsThoiVu: 0, nhanSuMoiGio: 0 },
    { slot: '19h-20h', nsChinhThuc: 0, nsThoiVu: 0, nhanSuMoiGio: 0 },
  ],
};

const DEFAULT_BUFFER_LOCATIONS: BufferLocationMap[] = [
  {
    locationId: 'BUFFER-A1-01',
    description: 'Khoang A - Dãy 1 - Tầng 1',
    modelName: 'LSX-2026-TDH09',
    partCode: 'LK-RES-10K-0805',
    partName: '2 loại linh kiện (Model LSX-2026-TDH09)',
    unit: 'Con',
    currentStockQty: 520,
    containerStandardQty: 100,
    status: 'READY',
    lastUpdated: '2026-08-04T10:00:00.000Z',
    items: [
      {
        id: 'item-101',
        partCode: 'LK-RES-10K-0805',
        partName: 'Điện trở dán SMD 10K Ohm 0805',
        unit: 'Con',
        currentStockQty: 500,
        containerStandardQty: 100,
        modelName: 'LSX-2026-TDH09',
        lastUpdated: '2026-08-04T10:00:00.000Z',
      },
      {
        id: 'item-102',
        partCode: 'LK-SEN-OPT-M12',
        partName: 'Cảm biến quang M12 NPN NO Omron',
        unit: 'Cái',
        currentStockQty: 20,
        containerStandardQty: 10,
        modelName: 'LSX-2026-TDH09',
        lastUpdated: '2026-08-04T08:30:00.000Z',
      },
    ],
  },
  {
    locationId: 'BUFFER-A1-02',
    description: 'Khoang A - Dãy 1 - Tầng 2',
    modelName: 'LSX-2026-BT044',
    partCode: 'LK-SEN-OPT-M12',
    partName: 'Cảm biến quang M12 NPN NO Omron',
    unit: 'Cái',
    currentStockQty: 20,
    containerStandardQty: 10,
    status: 'CALL_PENDING',
    lastUpdated: '2026-08-04T08:30:00.000Z',
    items: [
      {
        id: 'item-103',
        partCode: 'LK-SEN-OPT-M12',
        partName: 'Cảm biến quang M12 NPN NO Omron',
        unit: 'Cái',
        currentStockQty: 20,
        containerStandardQty: 10,
        modelName: 'LSX-2026-BT044',
        lastUpdated: '2026-08-04T08:30:00.000Z',
      },
    ],
  },
  { locationId: 'BUFFER-A1-03', description: 'Khoang A - Dãy 1 - Tầng 3', currentStockQty: 0, containerStandardQty: 50, status: 'EMPTY', lastUpdated: '2026-08-01T00:00:00.000Z', items: [] },
  {
    locationId: 'BUFFER-A2-01',
    description: 'Khoang A - Dãy 2 - Tầng 1',
    modelName: 'LSX-2026-TDH09',
    partCode: 'LK-PLC-S71200-1214C',
    partName: 'Bộ điều khiển PLC Siemens S7-1200',
    unit: 'Bộ',
    currentStockQty: 5,
    containerStandardQty: 1,
    status: 'READY',
    lastUpdated: '2026-08-03T14:00:00.000Z',
    items: [
      {
        id: 'item-104',
        partCode: 'LK-PLC-S71200-1214C',
        partName: 'Bộ điều khiển PLC Siemens S7-1200',
        unit: 'Bộ',
        currentStockQty: 5,
        containerStandardQty: 1,
        modelName: 'LSX-2026-TDH09',
        lastUpdated: '2026-08-03T14:00:00.000Z',
      },
    ],
  },
  { locationId: 'BUFFER-A2-02', description: 'Khoang A - Dãy 2 - Tầng 2', currentStockQty: 0, containerStandardQty: 50, status: 'EMPTY', lastUpdated: '2026-08-01T00:00:00.000Z', items: [] },
  { locationId: 'BUFFER-A2-03', description: 'Khoang A - Dãy 2 - Tầng 3', currentStockQty: 0, containerStandardQty: 50, status: 'EMPTY', lastUpdated: '2026-08-01T00:00:00.000Z', items: [] },
  {
    locationId: 'BUFFER-B1-01',
    description: 'Khoang B - Dãy 1 - Tầng 1',
    modelName: 'LSX-2026-HL271',
    partCode: 'LK-RLY-24VDC-8P',
    partName: 'Rơ le trung gian 24VDC 8 chân',
    unit: 'Cái',
    currentStockQty: 80,
    containerStandardQty: 20,
    status: 'READY',
    lastUpdated: '2026-08-04T09:00:00.000Z',
    items: [
      {
        id: 'item-105',
        partCode: 'LK-RLY-24VDC-8P',
        partName: 'Rơ le trung gian 24VDC 8 chân',
        unit: 'Cái',
        currentStockQty: 80,
        containerStandardQty: 20,
        modelName: 'LSX-2026-HL271',
        lastUpdated: '2026-08-04T09:00:00.000Z',
      },
    ],
  },
  { locationId: 'BUFFER-B1-02', description: 'Khoang B - Dãy 1 - Tầng 2', currentStockQty: 0, containerStandardQty: 50, status: 'EMPTY', lastUpdated: '2026-08-01T00:00:00.000Z', items: [] },
  { locationId: 'BUFFER-B1-03', description: 'Khoang B - Dãy 1 - Tầng 3', currentStockQty: 0, containerStandardQty: 50, status: 'EMPTY', lastUpdated: '2026-08-01T00:00:00.000Z', items: [] },
  { locationId: 'BUFFER-B2-01', description: 'Khoang B - Dãy 2 - Tầng 1', currentStockQty: 0, containerStandardQty: 50, status: 'EMPTY', lastUpdated: '2026-08-01T00:00:00.000Z', items: [] },
  { locationId: 'BUFFER-B2-02', description: 'Khoang B - Dãy 2 - Tầng 2', currentStockQty: 0, containerStandardQty: 50, status: 'EMPTY', lastUpdated: '2026-08-01T00:00:00.000Z', items: [] },
  { locationId: 'BUFFER-B2-03', description: 'Khoang B - Dãy 2 - Tầng 3', currentStockQty: 0, containerStandardQty: 50, status: 'EMPTY', lastUpdated: '2026-08-01T00:00:00.000Z', items: [] },
];

const INITIAL_KITTING_QUEUE: KittingQueueItem[] = [
  {
    id: 'kit-101',
    transactionId: 'tx-sample-01',
    partCode: 'LK-RES-10K-0805',
    partName: 'Điện trở dán SMD 10K Ohm 0805',
    unit: 'Con',
    rawQuantity: 1000,
    kittedQuantity: 0,
    scrapQuantity: 0,
    bufferLocation: 'BUFFER-A1-01',
    status: 'PENDING_KITTING',
    operatorName: 'Lê Hoàng Nam',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'kit-102',
    transactionId: 'tx-sample-02',
    partCode: 'LK-PLC-S71200-1214C',
    partName: 'Bộ điều khiển PLC Siemens S7-1200',
    unit: 'Bộ',
    rawQuantity: 5,
    kittedQuantity: 5,
    scrapQuantity: 0,
    bufferLocation: 'BUFFER-A2-01',
    status: 'IN_BUFFER',
    startTime: new Date(Date.now() - 7200000).toISOString(),
    endTime: new Date(Date.now() - 5400000).toISOString(),
    durationMinutes: 30,
    operatorName: 'Trần Văn Bình',
    kittingProductivity: 10,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
];

const INITIAL_MATERIAL_CALLS: MaterialCallRequest[] = [
  {
    requestId: 'call-201',
    assemblyLine: 'Bàn Lắp Ráp Bo Mạch Line 1',
    partCode: 'LK-SEN-OPT-M12',
    partName: 'Cảm biến quang M12 NPN NO Omron',
    unit: 'Cái',
    requestedQty: 10,
    bufferLocation: 'BUFFER-A1-02',
    requestedBy: 'Nguyễn Văn A (Trưởng Dây Chuyền 1)',
    requestedAt: new Date(Date.now() - 1800000).toISOString(),
    status: 'CALLING',
  },
];

// Helper for initial load
export const storageService = {
  // Settings
  getSettings(): AppSettings {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(initialSettings));
      return initialSettings;
    }
    try {
      const parsed = JSON.parse(raw);
      return {
        ...initialSettings,
        ...parsed,
        staffList: parsed.staffList && parsed.staffList.length ? parsed.staffList : initialSettings.staffList,
        stockInReasons: parsed.stockInReasons && parsed.stockInReasons.length ? parsed.stockInReasons : initialSettings.stockInReasons,
        stockOutPurposes: parsed.stockOutPurposes && parsed.stockOutPurposes.length ? parsed.stockOutPurposes : initialSettings.stockOutPurposes,
        productionOrders: parsed.productionOrders && parsed.productionOrders.length ? parsed.productionOrders : initialSettings.productionOrders,
        assemblyLines: parsed.assemblyLines && parsed.assemblyLines.length ? parsed.assemblyLines : initialSettings.assemblyLines,
      };
    } catch {
      return initialSettings;
    }
  },

  saveSettings(settings: AppSettings): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    supabaseKeyStore.set(STORAGE_KEYS.SETTINGS, settings);
    supabaseRelationalStore.upsertSettings(settings);
  },

  // Parts
  getParts(): Part[] {
    const raw = localStorage.getItem(PARTS_KEY);
    if (!raw) {
      localStorage.setItem(PARTS_KEY, JSON.stringify(initialParts));
      supabaseKeyStore.set(STORAGE_KEYS.PARTS, initialParts);
      return initialParts;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return initialParts;
    }
  },

  getPartById(id: string): Part | undefined {
    const parts = this.getParts();
    return parts.find((p) => p.id === id);
  },

  saveParts(parts: Part[]): void {
    localStorage.setItem(PARTS_KEY, JSON.stringify(parts));
    supabaseKeyStore.set(STORAGE_KEYS.PARTS, parts);
  },

  addPart(partData: Omit<Part, 'id' | 'createdAt' | 'updatedAt'>): Part {
    const parts = this.getParts();
    const newPart: Part = {
      ...partData,
      id: 'part-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    parts.unshift(newPart);
    this.saveParts(parts);
    supabaseRelationalStore.insertPart(newPart);
    return newPart;
  },

  updatePart(id: string, updatedData: Partial<Part>): Part {
    const parts = this.getParts();
    const index = parts.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Không tìm thấy linh kiện');

    const updatedPart: Part = {
      ...parts[index],
      ...updatedData,
      updatedAt: new Date().toISOString(),
    };
    parts[index] = updatedPart;
    this.saveParts(parts);
    supabaseRelationalStore.updatePart(id, updatedData);
    return updatedPart;
  },

  deletePart(id: string): void {
    const parts = this.getParts().filter((p) => p.id !== id);
    this.saveParts(parts);

    // Remove transactions for this part
    const txs = this.getTransactions().filter((t) => t.partId !== id);
    this.saveTransactions(txs);
    supabaseRelationalStore.deletePart(id);
  },

  // Transactions (The Kho)
  getTransactions(): Transaction[] {
    const raw = localStorage.getItem(TRANSACTIONS_KEY);
    if (!raw) {
      localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(initialTransactions));
      supabaseKeyStore.set(STORAGE_KEYS.TRANSACTIONS, initialTransactions);
      return initialTransactions;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return initialTransactions;
    }
  },

  saveTransactions(txs: Transaction[]): void {
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(txs));
    supabaseKeyStore.set(STORAGE_KEYS.TRANSACTIONS, txs);
  },


  // Get transactions for a specific part chronologically (ascending for bin card calculations)
  getBinCardHistory(partId: string): Transaction[] {
    const txs = this.getTransactions().filter((t) => t.partId === partId);
    // Sort by date ascending
    return txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  },

  // Helper to get normalized location breakdown array for a part
  getPartLocations(part: Part): PartLocationStock[] {
    if (Array.isArray(part.locations) && part.locations.length > 0) {
      return part.locations.map((l) => ({ ...l }));
    }
    if (part.location && part.location.trim()) {
      const raw = part.location.trim();
      if (raw.includes(',')) {
        const segments = raw.split(',');
        const result: PartLocationStock[] = [];
        for (const seg of segments) {
          const trimmed = seg.trim();
          const match = trimmed.match(/^(.+?)\s*\(([\d\.\,\s]+)\)$/);
          if (match) {
            const name = match[1].trim();
            const qty = parseFloat(match[2].replace(/\./g, '').replace(',', '.').trim()) || 0;
            result.push({ locationName: name, quantity: qty });
          } else if (trimmed) {
            result.push({ locationName: trimmed, quantity: Math.max(0, part.currentStock) });
          }
        }
        if (result.length > 0) return result;
      } else {
        const match = raw.match(/^(.+?)\s*\(([\d\.\,\s]+)\)$/);
        if (match) {
          const name = match[1].trim();
          const qty = parseFloat(match[2].replace(/\./g, '').replace(',', '.').trim()) || part.currentStock;
          return [{ locationName: name, quantity: qty }];
        }
        return [{ locationName: raw, quantity: part.currentStock }];
      }
    }
    return [{ locationName: 'Kho chính', quantity: part.currentStock }];
  },

  formatPartLocationSummary(input: PartLocationStock[] | Part | undefined | null): string {
    if (!input) return 'Chưa phân vị trí';
    let locs: PartLocationStock[] = [];
    if (Array.isArray(input)) {
      locs = input;
    } else if (typeof input === 'object') {
      locs = this.getPartLocations(input as Part);
    }
    if (!Array.isArray(locs)) return 'Chưa phân vị trí';
    const active = locs.filter((l) => l && typeof l.quantity === 'number' && l.quantity > 0);
    if (active.length === 0) return 'Chưa phân vị trí';
    if (active.length === 1) {
      return active[0].locationName;
    }
    return active.map((l) => `${l.locationName} (${l.quantity.toLocaleString('vi-VN')})`).join(', ');
  },

  getPartStockAtLocation(part: Part, locationName: string): number {
    const locs = this.getPartLocations(part);
    const found = locs.find((l) => l.locationName.toLowerCase() === locationName.toLowerCase());
    return found ? found.quantity : 0;
  },

  getPartsAtLocation(parts: Part[], locationName: string): { part: Part; locationQty: number }[] {
    const result: { part: Part; locationQty: number }[] = [];
    for (const part of parts) {
      const qty = this.getPartStockAtLocation(part, locationName);
      if (qty > 0) {
        result.push({ part, locationQty: qty });
      }
    }
    return result;
  },

  // Perform Stock-In
  addStockIn(params: {
    partId: string;
    quantity: number;
    importedQuantity?: number;
    date: string;
    person: string;
    reasonOrPurpose?: string;
    notes?: string;
    locationId?: string;
  }): Transaction {
    const part = this.getPartById(params.partId);
    if (!part) throw new Error('Linh kiện không tồn tại');

    const stockBefore = part.currentStock;
    const stockAfter = stockBefore + params.quantity;

    const targetLocName = params.locationId?.trim() || part.location?.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính';

    // Get current locations array and add stock to the specific location
    const locs = this.getPartLocations(part);
    const existingIndex = locs.findIndex(
      (l) => l.locationName.toLowerCase() === targetLocName.toLowerCase()
    );

    if (existingIndex >= 0) {
      locs[existingIndex].quantity += params.quantity;
    } else {
      locs.push({ locationName: targetLocName, quantity: params.quantity });
    }

    const newLocationSummary = this.formatPartLocationSummary(locs);

    // Update part current stock & location breakdown
    this.updatePart(part.id, {
      currentStock: stockAfter,
      locations: locs,
      location: newLocationSummary,
    });

    // Create transaction
    const newTx: Transaction = {
      id: 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      partId: part.id,
      partCode: part.code,
      partName: part.name,
      unit: part.unit,
      type: 'IN',
      quantity: params.quantity,
      date: params.date || new Date().toISOString(),
      person: params.person,
      reasonOrPurpose: params.reasonOrPurpose || 'Nhập kho',
      notes: params.notes || '',
      locationId: targetLocName,
      stockBefore,
      stockAfter,
    };

    const txs = this.getTransactions();
    txs.push(newTx);
    this.saveTransactions(txs);

    return newTx;
  },

  // Perform Stock-Out with Anti-Negative Stock Rule!
  addStockOut(params: {
    partId: string;
    quantity: number;
    importedQuantity?: number;
    date: string;
    person: string;
    productionOrder?: string;
    reasonOrPurpose?: string;
    notes?: string;
    locationId?: string;
  }): Transaction {
    const part = this.getPartById(params.partId);
    if (!part) throw new Error('Linh kiện không tồn tại');

    if (params.quantity > part.currentStock) {
      throw new Error(`Số lượng xuất (${params.quantity} ${part.unit}) vượt quá số lượng tồn hiện tại trong kho (${part.currentStock} ${part.unit})!`);
    }

    const stockBefore = part.currentStock;
    const stockAfter = stockBefore - params.quantity;

    // Deduct stock from specific location or sequentially
    const locs = this.getPartLocations(part);
    let remainingToDeduct = params.quantity;

    if (params.locationId) {
      const targetLoc = params.locationId.trim();
      const existing = locs.find((l) => l.locationName.toLowerCase() === targetLoc.toLowerCase());
      if (existing) {
        const deduct = Math.min(existing.quantity, remainingToDeduct);
        existing.quantity -= deduct;
        remainingToDeduct -= deduct;
      }
    }

    if (remainingToDeduct > 0) {
      for (const loc of locs) {
        if (loc.quantity > 0) {
          const deduct = Math.min(loc.quantity, remainingToDeduct);
          loc.quantity -= deduct;
          remainingToDeduct -= deduct;
          if (remainingToDeduct <= 0) break;
        }
      }
    }

    const activeLocs = locs.filter((l) => l.quantity > 0);
    const newLocationSummary = this.formatPartLocationSummary(activeLocs.length > 0 ? activeLocs : locs);

    // Update part current stock & location breakdown
    this.updatePart(part.id, {
      currentStock: stockAfter,
      locations: locs,
      location: newLocationSummary,
    });

    // Create transaction
    const newTx: Transaction = {
      id: 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      partId: part.id,
      partCode: part.code,
      partName: part.name,
      unit: part.unit,
      type: 'OUT',
      quantity: params.quantity,
      date: params.date || new Date().toISOString(),
      person: params.person,
      productionOrder: params.productionOrder || '',
      reasonOrPurpose: params.reasonOrPurpose || 'Xuất sản xuất',
      notes: params.notes || '',
      locationId: params.locationId,
      stockBefore,
      stockAfter,
    };

    const txs = this.getTransactions();
    txs.push(newTx);
    this.saveTransactions(txs);

    // Automatically trigger Kitting Queue item for pre-assembly processing!
    try {
      this.addKittingQueueItemFromStockOut(newTx);
    } catch {
      // Ignore fallback
    }

    return newTx;
  },

  // Stock Audit Check & Adjustment
  performStockCheck(params: {
    partId: string;
    actualStock: number;
    performedBy: string;
    note?: string;
  }): { checkRecord: StockCheckRecord; adjustmentTx?: Transaction } {
    const part = this.getPartById(params.partId);
    if (!part) throw new Error('Linh kiện không tồn tại');

    const systemStock = part.currentStock;
    const difference = params.actualStock - systemStock;

    const checkRecord: StockCheckRecord = {
      id: 'chk-' + Date.now(),
      partId: part.id,
      partCode: part.code,
      partName: part.name,
      unit: part.unit,
      location: part.location,
      checkDate: new Date().toISOString(),
      expectedQuantity: systemStock,
      actualQuantity: params.actualStock,
      discrepancy: difference,
      checkedBy: params.performedBy,
      systemStock,
      actualStock: params.actualStock,
      difference,
      performedBy: params.performedBy,
      note: params.note || '',
      status: 'COMPLETED',
    };

    // Save stock check record
    const checks = this.getStockCheckRecords();
    checks.unshift(checkRecord);
    localStorage.setItem(STOCK_CHECKS_KEY, JSON.stringify(checks));

    let adjustmentTx: Transaction | undefined;

    // If difference != 0, create an adjustment transaction to sync stock
    if (difference !== 0) {
      const isIncrease = difference > 0;
      const absDiff = Math.abs(difference);

      this.updatePart(part.id, { currentStock: params.actualStock });

      adjustmentTx = {
        id: 'tx-audit-' + Date.now(),
        partId: part.id,
        partCode: part.code,
        partName: part.name,
        unit: part.unit,
        type: 'AUDIT_ADJUSTMENT',
        quantity: absDiff,
        date: new Date().toISOString(),
        person: params.performedBy,
        reasonOrPurpose: `Cân đối kiểm kê kho (${isIncrease ? 'Cộng' : 'Trừ'} ${absDiff} ${part.unit})`,
        notes: params.note || `Điều chỉnh từ ${systemStock} sang ${params.actualStock}`,
        stockBefore: systemStock,
        stockAfter: params.actualStock,
      };

      const txs = this.getTransactions();
      txs.push(adjustmentTx);
      this.saveTransactions(txs);
    }

    return { checkRecord, adjustmentTx };
  },

  getStockCheckRecords(): StockCheckRecord[] {
    const raw = localStorage.getItem(STOCK_CHECKS_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  // Reset to sample data
  resetToSampleData(): void {
    localStorage.setItem(PARTS_KEY, JSON.stringify(initialParts));
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(initialTransactions));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(initialSettings));
    localStorage.removeItem(STOCK_CHECKS_KEY);
    localStorage.removeItem(CONTAINER_BATCHES_KEY);
    localStorage.removeItem(USED_QR_TOKENS_KEY);
  },

  // Import Excel helper according to custom layout (Warehouse, Item, Item description, Stock, Description, Unit)
  importPartsFromRows(rawRows: any[]): { added: number; updated: number } {
    const existingParts = this.getParts();
    let added = 0;
    let updated = 0;

    const parseStock = (val: any): number => {
      if (val === undefined || val === null || val === '') return 0;
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      let s = String(val).trim();
      if (!s) return 0;
      if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else if (s.includes(',')) {
        s = s.replace(',', '.');
      }
      const parsed = parseFloat(s);
      return isNaN(parsed) ? 0 : parsed;
    };

    rawRows.forEach((row) => {
      let warehouse = '';
      let itemCode = '';
      let itemName = '';
      let stockVal: any = 0;
      let desc = '';
      let unit = '';

      if (Array.isArray(row)) {
        // Array representation (Column index 0..5)
        warehouse = String(row[0] ?? '').trim();
        itemCode = String(row[1] ?? '').trim();
        itemName = String(row[2] ?? '').trim();
        stockVal = row[3];
        desc = String(row[4] ?? '').trim();
        unit = String(row[5] ?? '').trim();
      } else if (typeof row === 'object' && row !== null) {
        // Named keys representation
        warehouse = String(
          row['Warehouse'] || row['Warehouse nào'] || row['Kho'] || row['Vị Trí Lưu'] || row['Location'] || ''
        ).trim();

        itemCode = String(
          row['Item'] || row['Mã linh kiện'] || row['Mã Linh Kiện'] || row['Code'] || row['Mã'] || ''
        ).trim();

        itemName = String(
          row['Item description'] || row['Item Description'] || row['Tên linh kiện'] || row['Tên Linh Kiện'] || row['Name'] || row['Tên'] || ''
        ).trim();

        stockVal = row['Stock'] ?? row['Tồn kho'] ?? row['Tồn Kho'] ?? row['Tồn Hiện Tại'] ?? row['Tồn'] ?? 0;

        desc = String(
          row['Description'] || row['Mô tả'] || row['Mô Tả'] || row['Phân loại'] || ''
        ).trim();

        unit = String(
          row['Unit'] || row['Đơn vị tính'] || row['Đơn Vị'] || row['ĐVT'] || ''
        ).trim();
      }

      // Ignore header row or rows without item code or name
      if (!itemCode || !itemName) return;
      const lowerCode = itemCode.toLowerCase();
      if (lowerCode === 'item' || lowerCode === 'mã linh kiện' || lowerCode === 'code') return;

      const currentStock = parseStock(stockVal);
      const locationStr = warehouse || 'Kho 1';
      const unitStr = unit || 'Cái';

      const existingIndex = existingParts.findIndex(
        (p) => p.code.trim().toLowerCase() === lowerCode
      );

      if (existingIndex !== -1) {
        // Update existing part stock & info
        existingParts[existingIndex] = {
          ...existingParts[existingIndex],
          code: itemCode,
          name: itemName,
          description: desc || existingParts[existingIndex].description,
          location: locationStr,
          unit: unitStr,
          currentStock: currentStock,
          updatedAt: new Date().toISOString(),
        };
        updated++;
      } else {
        // Add new part
        const newPart: Part = {
          id: 'part-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          code: itemCode,
          name: itemName,
          description: desc,
          location: locationStr,
          unit: unitStr,
          currentStock: currentStock,
          minStock: 10,
          barcode: itemCode,
          qrCode: itemCode,
          note: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        existingParts.unshift(newPart);
        added++;
      }
    });

    this.saveParts(existingParts);
    return { added, updated };
  },

  downloadImportTemplate(): void {
    const templateData = [
      {
        Warehouse: '2BVL',
        Item: '01-16-09-SHD8627-0005',
        'Item description': 'Vít nhọn 4x16, Inox, mũ D8',
        Stock: '69451,00',
        Description: 'LR-Linh kiện Máy lọc nước',
        Unit: 'Cái',
      },
      {
        Warehouse: '2BVL',
        Item: '01-16-09-SHD8627-0012',
        'Item description': 'Vít bulong M4x8, vàng(trắng), mũ D6.5 + đệm vênh, phẳng',
        Stock: '0,00',
        Description: 'LR-Linh kiện Nồi cơm điện',
        Unit: 'Cái',
      },
      {
        Warehouse: '2BVL',
        Item: '01-55-06-00-0001',
        'Item description': 'Tem bảo hành',
        Stock: '6734,00',
        Description: 'LR-Linh kiện chung',
        Unit: 'Cái',
      },
      {
        Warehouse: '2BVL',
        Item: '02-33-01-APB3551-0000',
        'Item description': 'Mặt kính in APB3551',
        Stock: '4,00',
        Description: 'LR-Linh kiện Bếp gas',
        Unit: 'Cái',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 15 }, // Warehouse
      { wch: 25 }, // Item
      { wch: 45 }, // Item description
      { wch: 15 }, // Stock
      { wch: 30 }, // Description
      { wch: 12 }, // Unit
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MauImportLinhKien');
    XLSX.writeFile(wb, 'mau_import_linh_kien_excel.xlsx');
  },

  // Backup & Restore
  backupData(): string {
    const backupObj = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      settings: this.getSettings(),
      parts: this.getParts(),
      transactions: this.getTransactions(),
      stockChecks: this.getStockCheckRecords(),
    };
    return JSON.stringify(backupObj, null, 2);
  },

  restoreData(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (data.parts && Array.isArray(data.parts)) {
        localStorage.setItem(PARTS_KEY, JSON.stringify(data.parts));
      }
      if (data.transactions && Array.isArray(data.transactions)) {
        localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(data.transactions));
      }
      if (data.settings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(data.settings));
      }
      if (data.stockChecks && Array.isArray(data.stockChecks)) {
        localStorage.setItem(STOCK_CHECKS_KEY, JSON.stringify(data.stockChecks));
      }
      return true;
    } catch (e) {
      console.error('Lỗi khi restore dữ liệu:', e);
      return false;
    }
  },

  // Excel Utilities
  exportPartsToExcel(parts: Part[], fileName = 'danh_sach_linh_kien.xlsx'): void {
    const nowMs = Date.now();

    const excelData = parts.map((p, index) => {
      let under3Months = 0;
      let from3To6Months = 0;
      let over6Months = 0;

      if (p.currentStock > 0) {
        const fifoLots = this.getPartFifoLots(p.id);
        fifoLots.forEach((lot) => {
          if (lot.remainingQty > 0) {
            const lotDate = lot.importDate ? new Date(lot.importDate).getTime() : nowMs;
            const diffDays = (nowMs - lotDate) / (1000 * 60 * 60 * 24);

            if (diffDays < 90) {
              under3Months += lot.remainingQty;
            } else if (diffDays < 180) {
              from3To6Months += lot.remainingQty;
            } else {
              over6Months += lot.remainingQty;
            }
          }
        });

        // Safety fallback if sum of lots is less than currentStock
        const allocated = under3Months + from3To6Months + over6Months;
        if (allocated < p.currentStock) {
          const unallocated = p.currentStock - allocated;
          const partCreatedDate = p.createdAt ? new Date(p.createdAt).getTime() : nowMs;
          const diffDays = (nowMs - partCreatedDate) / (1000 * 60 * 60 * 24);
          if (diffDays < 90) {
            under3Months += unallocated;
          } else if (diffDays < 180) {
            from3To6Months += unallocated;
          } else {
            over6Months += unallocated;
          }
        }
      }

      return {
        'STT': index + 1,
        'Mã Linh Kiện': p.code,
        'Tên Linh Kiện': p.name,
        'Vị Trí Lưu': p.location,
        'Đơn Vị': p.unit,
        'Tồn Hiện Tại': p.currentStock,
        'Tồn Tối Thiểu': p.minStock,
        'Trạng Thái':
          p.currentStock === 0
            ? 'Hết hàng'
            : p.currentStock <= p.minStock
            ? 'Sắp hết'
            : 'An toàn',
        'Mô Tả': p.description || '',
        'Tồn dưới 3 tháng': under3Months,
        'Tồn trên 3 tháng dưới 6 tháng': from3To6Months,
        'Tồn trên 6 tháng': over6Months,
        'Mã Vạch Barcode': p.barcode || '',
        'Ghi Chú': p.note || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Linh Kiện');

    // Auto col width
    const colWidths = [
      { wch: 5 },  // STT
      { wch: 20 }, // Mã Linh Kiện
      { wch: 35 }, // Tên Linh Kiện
      { wch: 18 }, // Vị Trí Lưu
      { wch: 10 }, // Đơn Vị
      { wch: 12 }, // Tồn Hiện Tại
      { wch: 12 }, // Tồn Tối Thiểu
      { wch: 12 }, // Trạng Thái
      { wch: 30 }, // Mô Tả
      { wch: 18 }, // Tồn dưới 3 tháng
      { wch: 28 }, // Tồn trên 3 tháng dưới 6 tháng
      { wch: 18 }, // Tồn trên 6 tháng
      { wch: 20 }, // Mã Vạch Barcode
      { wch: 25 }, // Ghi Chú
    ];
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, fileName);
  },

  exportBinCardToExcel(part: Part, transactions: Transaction[], fileName?: string): void {
    const settings = this.getSettings();
    const cleanFileName = fileName || `the_kho_${part.code}.xlsx`;

    const binCardData = transactions.map((t) => {
      const dateFormatted = new Date(t.date).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      return {
        'Ngày tháng': dateFormatted,
        'Diễn giải / Nội dung': t.reasonOrPurpose || (t.type === 'IN' ? 'Nhập kho' : 'Xuất kho'),
        'Nhập': t.type === 'IN' ? t.quantity : '',
        'Xuất': t.type === 'OUT' ? t.quantity : '',
        'Tồn cuối': t.stockAfter,
        'Người thực hiện': t.person || '',
        'Lệnh sản xuất': t.productionOrder || '',
        'Ghi chú': t.notes || '',
      };
    });

    // Create sheet with title AOA first
    const ws = XLSX.utils.aoa_to_sheet([
      [settings.companyName.toUpperCase()],
      [settings.warehouseName],
      ['THẺ KHO ĐIỆN TỬ'],
      [`Mã linh kiện: ${part.code} | Tên: ${part.name}`],
      [`Vị trí: ${part.location} | Đơn vị: ${part.unit} | Tồn hiện tại: ${part.currentStock}`],
      [],
    ]);

    // Append json data starting at A7
    XLSX.utils.sheet_add_json(ws, binCardData, { origin: 'A7' });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Thẻ Kho');
    XLSX.writeFile(wb, cleanFileName);
  },

  exportBinCardHistoryToExcel(transactions: Transaction[], fileName = 'nhat_ky_the_kho_dien_tu.xlsx'): void {
    const excelData = transactions.map((t, idx) => ({
      'STT': idx + 1,
      'Thời Gian': new Date(t.date).toLocaleString('vi-VN'),
      'Loại': t.type === 'IN' ? 'NHẬP KHO' : t.type === 'OUT' ? 'XUẤT KHO' : 'KIỂM KÊ',
      'Mã Linh Kiện': t.partCode,
      'Tên Linh Kiện': t.partName,
      'Số Lượng Nhập (+)': t.type === 'IN' ? t.quantity : '',
      'Số Lượng Xuất (-)': t.type === 'OUT' ? t.quantity : '',
      'Tồn Sau Giao Dịch': t.stockAfter,
      'Đơn Vị': t.unit,
      'Kệ / Vị Trí': t.locationId || '',
      'Người Thực Hiện': t.person || '',
      'Lệnh Sản Xuất': t.productionOrder || '',
      'Diễn Giải / Mục Đích': t.reasonOrPurpose || '',
      'Ghi Chú': t.notes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nhật Ký Thẻ Kho');
    XLSX.writeFile(wb, fileName);
  },

  // Container Batches (History of QR codes generated from Excel)
  getContainerBatches(): ContainerBatch[] {
    const raw = localStorage.getItem(CONTAINER_BATCHES_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  saveContainerBatch(batch: ContainerBatch): void {
    const batches = this.getContainerBatches();
    // Replace if batch with same contNumber exists or add to front
    const existingIndex = batches.findIndex((b) => b.contNumber.trim().toLowerCase() === batch.contNumber.trim().toLowerCase());
    if (existingIndex !== -1) {
      batches[existingIndex] = batch;
    } else {
      batches.unshift(batch);
    }
    localStorage.setItem(CONTAINER_BATCHES_KEY, JSON.stringify(batches));
  },

  deleteContainerBatch(id: string): void {
    const batches = this.getContainerBatches().filter((b) => b.id !== id);
    localStorage.setItem(CONTAINER_BATCHES_KEY, JSON.stringify(batches));
  },

  // Model BOMs
  getModelBOMs(): ModelBOM[] {
    const raw = localStorage.getItem(MODEL_BOMS_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  saveModelBOM(bom: ModelBOM): void {
    const boms = this.getModelBOMs();
    const index = boms.findIndex(b => b.name.toLowerCase() === bom.name.toLowerCase());
    if (index !== -1) {
      boms[index] = bom;
    } else {
      boms.unshift(bom);
    }
    localStorage.setItem(MODEL_BOMS_KEY, JSON.stringify(boms));
  },

  deleteModelBOM(id: string): void {
    const boms = this.getModelBOMs().filter(b => b.id !== id);
    localStorage.setItem(MODEL_BOMS_KEY, JSON.stringify(boms));
  },

  importModelBOMFromRows(rawRows: any[], modelName: string): { added: number; name: string } {
    const items: ModelBOMItem[] = [];
    const validPartCodes = new Set(this.getParts().map(p => p.code.toLowerCase()));

    rawRows.forEach(row => {
      let itemCode = '';
      let itemName = '';
      let quantityVal: any = 0;
      let unit = '';

      if (Array.isArray(row)) {
        itemCode = String(row[0] ?? '').trim();
        itemName = String(row[1] ?? '').trim();
        quantityVal = row[2];
        unit = String(row[3] ?? '').trim();
      } else if (typeof row === 'object' && row !== null) {
        itemCode = String(row['Item'] || row['Mã linh kiện'] || row['Code'] || '').trim();
        itemName = String(row['Description'] || row['Tên linh kiện'] || row['Name'] || '').trim();
        quantityVal = row['Quantity'] ?? row['Số lượng'] ?? row['Định mức'] ?? 0;
        unit = String(row['Unit'] || row['Đơn vị'] || row['ĐVT'] || '').trim();
      }

      if (!itemCode || !itemName) return;
      if (itemCode.toLowerCase() === 'item') return;

      // Only import items that exist in our valid parts list
      if (!validPartCodes.has(itemCode.toLowerCase())) return;

      let quantity = 0;
      if (typeof quantityVal === 'number') {
        quantity = quantityVal;
      } else {
        let s = String(quantityVal).trim();
        if (s.includes(',') && s.includes('.')) {
          s = s.replace(/\./g, '').replace(',', '.');
        } else if (s.includes(',')) {
          s = s.replace(',', '.');
        }
        quantity = parseFloat(s) || 0;
      }

      if (quantity > 0) {
        items.push({
          partCode: itemCode,
          partName: itemName,
          quantity,
          unit: unit || 'Cái'
        });
      }
    });

    if (items.length > 0) {
      const bom: ModelBOM = {
        id: 'bom-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        name: modelName,
        items,
        createdAt: new Date().toISOString()
      };
      this.saveModelBOM(bom);
      return { added: items.length, name: modelName };
    }
    return { added: 0, name: modelName };
  },

  // Used QR Tokens (To prevent scanning the same Cont QR tag twice)
  getUsedQrTokens(): Record<string, { scannedAt: string; scannedBy?: string; partCode: string; quantity: number; importedQuantity?: number; contNumber: string }> {
    const raw = localStorage.getItem(USED_QR_TOKENS_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  },

  isQrTokenUsed(tokenOrPayload: string): { isUsed: boolean; scannedAt?: string; scannedBy?: string; partCode?: string; quantity?: number; importedQuantity?: number; contNumber?: string } {
    if (!tokenOrPayload) return { isUsed: false };
    const tokens = this.getUsedQrTokens();
    
    // Check direct token / tagId key
    if (tokens[tokenOrPayload]) {
      const info = tokens[tokenOrPayload];
      return {
        isUsed: (info.importedQuantity || 0) >= (info.quantity || 0),
        scannedAt: info.scannedAt,
        scannedBy: info.scannedBy,
        partCode: info.partCode,
        quantity: info.quantity,
        importedQuantity: info.importedQuantity || 0,
        contNumber: info.contNumber,
      };
    }

    // Also check if raw payload string matches
    const keyStr = tokenOrPayload.trim();
    if (tokens[keyStr]) {
      const info = tokens[keyStr];
      return {
        isUsed: (info.importedQuantity || 0) >= (info.quantity || 0),
        scannedAt: info.scannedAt,
        scannedBy: info.scannedBy,
        partCode: info.partCode,
        quantity: info.quantity,
        importedQuantity: info.importedQuantity || 0,
        contNumber: info.contNumber,
      };
    }

    return { isUsed: false };
  },

  markQrTokenAsUsed(tokenOrPayload: string, details: { partCode: string; quantity: number; importedQuantity?: number; contNumber: string; person?: string }): void {
    if (!tokenOrPayload) return;
    const tokens = this.getUsedQrTokens();
    const nowStr = new Date().toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const info = {
      scannedAt: nowStr,
      scannedBy: details.person || 'Thủ kho',
      partCode: details.partCode,
      quantity: details.quantity,
      importedQuantity: details.importedQuantity || 0,
      contNumber: details.contNumber,
    };

    tokens[tokenOrPayload] = info;

    // If payload contains pipe e.g. CONT_IN|LK01|1000|CONT123|TAG123|16/07/2026, also mark TAG123
    if (tokenOrPayload.includes('|')) {
      const parts = tokenOrPayload.split('|');
      if (parts[4]) {
        tokens[parts[4]] = info; // Mark tagId
      }
    }

    localStorage.setItem(USED_QR_TOKENS_KEY, JSON.stringify(tokens));
  },

  // Validate if a scanned QR code belongs to a registered Container batch created on system
  validateContainerQrTag(
    rawText: string,
    parsed: { partCode: string; contNumber?: string; tagId?: string }
  ): {
    isValid: boolean;
    registeredTag?: ContainerQrTag;
    batch?: ContainerBatch;
    totalContQty?: number;
    reason?: string;
  } {
    const batches = this.getContainerBatches();
    if (batches.length === 0) {
      return {
        isValid: false,
        reason: 'Hệ thống chưa có Danh mục Container nào được khởi tạo! Vui lòng vào mục "Excel Danh Mục Cont & In Mã QR" để tạo danh sách Cont trước.',
      };
    }

    const rawStr = rawText ? rawText.trim() : '';
    const tagIdStr = parsed.tagId?.trim() || '';
    const contNumStr = parsed.contNumber?.trim().toLowerCase() || '';
    const partCodeStr = parsed.partCode?.trim().toLowerCase() || '';

    for (const batch of batches) {
      for (const item of batch.items) {
        // 1. Direct tagId match
        if (tagIdStr && item.id === tagIdStr) {
          return { isValid: true, registeredTag: item, batch, totalContQty: item.quantity };
        }
        // 2. Direct qrPayload match
        if (item.qrPayload && rawStr && item.qrPayload.trim() === rawStr) {
          return { isValid: true, registeredTag: item, batch, totalContQty: item.quantity };
        }
        // 3. Cont number + Part code match
        if (
          contNumStr &&
          partCodeStr &&
          item.contNumber.trim().toLowerCase() === contNumStr &&
          item.partCode.trim().toLowerCase() === partCodeStr
        ) {
          return { isValid: true, registeredTag: item, batch, totalContQty: item.quantity };
        }
      }
    }

    return {
      isValid: false,
      reason: `Mã QR này (${parsed.partCode}${parsed.contNumber ? ` - Cont ${parsed.contNumber}` : ''}) KHÔNG nằm trong bất kỳ Danh mục Container nào đã khởi tạo trên hệ thống!`,
    };
  },

  // FIFO Lot / Cont Batch Calculation
  getPartFifoLots(partId: string): FifoLot[] {
    const part = this.getPartById(partId);
    if (!part) return [];

    const txs = this.getTransactions().filter((t) => t.partId === partId);
    const inTxs = txs.filter((t) => t.type === 'IN').sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const outTxs = txs.filter((t) => t.type === 'OUT');

    const totalInQty = inTxs.reduce((sum, t) => sum + t.quantity, 0);
    const totalOutQty = outTxs.reduce((sum, t) => sum + t.quantity, 0);

    const defaultPartLoc = part.location?.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính';

    const rawLots: {
      id: string;
      contNumber: string;
      locationName: string;
      importDate: string;
      originalQty: number;
      notes?: string;
      isInitialBaseline?: boolean;
    }[] = [];

    // 1. Initial baseline stock lot (Lô Tồn Khởi Tạo #1)
    const initialBaselineQty = part.currentStock + totalOutQty - totalInQty;
    if (initialBaselineQty > 0) {
      rawLots.push({
        id: `init-lot-${part.id}`,
        contNumber: 'Lô Khởi Tạo',
        locationName: defaultPartLoc,
        importDate: part.createdAt || '2026-01-01T00:00:00.000Z',
        originalQty: initialBaselineQty,
        notes: 'Dữ liệu tồn kho ban đầu',
        isInitialBaseline: true,
      });
    }

    // 2. Add actual IN transactions (e.g. Scanned Cont QR or Stock In) as subsequent lots
    inTxs.forEach((tx) => {
      let contNum = '';
      if (tx.reasonOrPurpose) {
        const match = tx.reasonOrPurpose.match(/Cont\s*([\w\d-]+)/i);
        if (match) contNum = match[1];
      }
      if (!contNum && tx.notes) {
        const match = tx.notes.match(/Cont\s*([\w\d-]+)/i);
        if (match) contNum = match[1];
      }

      const txLoc = tx.locationId?.trim() || defaultPartLoc;

      rawLots.push({
        id: `tx-in-${tx.id}`,
        contNumber: contNum ? `Cont ${contNum}` : (tx.reasonOrPurpose || 'Nhập kho'),
        locationName: txLoc,
        importDate: tx.date,
        originalQty: tx.quantity,
        notes: tx.notes || tx.reasonOrPurpose,
        isInitialBaseline: false,
      });
    });

    // Fallback if rawLots is empty but part has currentStock
    if (rawLots.length === 0 && part.currentStock > 0) {
      rawLots.push({
        id: `init-lot-${part.id}`,
        contNumber: 'Lô Khởi Tạo',
        locationName: defaultPartLoc,
        importDate: part.createdAt || new Date().toISOString(),
        originalQty: part.currentStock + totalOutQty,
        notes: 'Dữ liệu tồn kho ban đầu',
        isInitialBaseline: true,
      });
    }

    // Sort raw lots chronologically (Oldest first for FIFO)
    rawLots.sort((a, b) => new Date(a.importDate).getTime() - new Date(b.importDate).getTime());

    // Deduct totalOutQty sequentially using FIFO
    let remainingOutDeduction = totalOutQty;
    let foundFirstActive = false;

    const fifoLots: FifoLot[] = rawLots.map((lot) => {
      let consumed = 0;
      let remaining = lot.originalQty;

      if (remainingOutDeduction >= lot.originalQty) {
        consumed = lot.originalQty;
        remaining = 0;
        remainingOutDeduction -= lot.originalQty;
      } else if (remainingOutDeduction > 0) {
        consumed = remainingOutDeduction;
        remaining = lot.originalQty - remainingOutDeduction;
        remainingOutDeduction = 0;
      }

      let status: 'FIFO_NEXT' | 'WAITING' | 'DEPLETED' = 'DEPLETED';
      if (remaining > 0) {
        if (!foundFirstActive) {
          status = 'FIFO_NEXT';
          foundFirstActive = true;
        } else {
          status = 'WAITING';
        }
      }

      return {
        id: lot.id,
        partId: part.id,
        partCode: part.code,
        partName: part.name,
        contNumber: lot.contNumber,
        locationName: lot.locationName,
        importDate: lot.importDate,
        originalQty: lot.originalQty,
        consumedQty: consumed,
        remainingQty: remaining,
        status,
        notes: lot.notes,
        isInitialBaseline: lot.isInitialBaseline,
      };
    });

    return fifoLots;
  },

  // --- KITTING QUEUE METHODS ---
  getKittingQueue(): KittingQueueItem[] {
    const raw = localStorage.getItem(KITTING_QUEUE_KEY);
    if (!raw) {
      localStorage.setItem(KITTING_QUEUE_KEY, JSON.stringify(INITIAL_KITTING_QUEUE));
      return INITIAL_KITTING_QUEUE;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_KITTING_QUEUE;
    }
  },

  saveKittingQueue(items: KittingQueueItem[]): void {
    localStorage.setItem(KITTING_QUEUE_KEY, JSON.stringify(items));
  },

  addKittingQueueItemFromStockOut(tx: Transaction): KittingQueueItem {
    const queue = this.getKittingQueue();
    const buffers = this.getBufferLocations();
    const existing = buffers.find((b) => b.partCode === tx.partCode && b.status !== 'EMPTY');
    const emptyBuf = buffers.find((b) => b.status === 'EMPTY');
    const defaultBuffer = existing ? existing.locationId : (emptyBuf ? emptyBuf.locationId : 'BUFFER-A1-01');

    const newItem: KittingQueueItem = {
      id: 'kit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      transactionId: tx.id,
      partCode: tx.partCode,
      partName: tx.partName,
      unit: tx.unit,
      rawQuantity: tx.quantity,
      kittedQuantity: 0,
      scrapQuantity: 0,
      bufferLocation: defaultBuffer,
      status: 'PENDING_KITTING',
      createdAt: new Date().toISOString(),
      operatorName: tx.person || 'Lê Hoàng Nam',
    };
    queue.unshift(newItem);
    this.saveKittingQueue(queue);
    return newItem;
  },

  completeKittingItem(params: {
    id: string;
    kittedQuantity: number;
    scrapQuantity: number;
    bufferLocation: string;
    operatorName: string;
    durationMinutes: number;
  }): KittingQueueItem {
    const queue = this.getKittingQueue();
    const idx = queue.findIndex((item) => item.id === params.id);
    if (idx === -1) throw new Error('Không tìm thấy mục kitting');

    const duration = Math.max(1, params.durationMinutes || 1);
    const productivity = Math.round((params.kittedQuantity / (duration / 60)) * 10) / 10;
    const nowIso = new Date().toISOString();

    const updatedItem: KittingQueueItem = {
      ...queue[idx],
      kittedQuantity: params.kittedQuantity,
      scrapQuantity: params.scrapQuantity,
      bufferLocation: params.bufferLocation,
      operatorName: params.operatorName,
      durationMinutes: duration,
      endTime: nowIso,
      status: 'IN_BUFFER',
      kittingProductivity: productivity,
    };
    queue[idx] = updatedItem;
    this.saveKittingQueue(queue);

    // Automatically update Buffer location stock and details
    const buffers = this.getBufferLocations();
    const bIdx = buffers.findIndex((b) => b.locationId === params.bufferLocation);
    if (bIdx >= 0) {
      const targetBuf = buffers[bIdx];
      let items: BufferPartItem[] = targetBuf.items ? [...targetBuf.items] : [];
      
      // Legacy fallback conversion
      if (items.length === 0 && targetBuf.partCode && targetBuf.currentStockQty > 0) {
        items.push({
          id: 'item-migrated-1',
          partCode: targetBuf.partCode,
          partName: targetBuf.partName || targetBuf.partCode,
          unit: targetBuf.unit || 'PCS',
          currentStockQty: targetBuf.currentStockQty,
          lastUpdated: targetBuf.lastUpdated,
        });
      }

      const itemIdx = items.findIndex((i) => i.partCode === updatedItem.partCode);
      if (itemIdx >= 0) {
        items[itemIdx] = {
          ...items[itemIdx],
          partName: updatedItem.partName,
          unit: updatedItem.unit,
          currentStockQty: items[itemIdx].currentStockQty + params.kittedQuantity,
          lastUpdated: nowIso,
        };
      } else {
        items.push({
          id: 'bitem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          partCode: updatedItem.partCode,
          partName: updatedItem.partName,
          unit: updatedItem.unit,
          currentStockQty: params.kittedQuantity,
          lastUpdated: nowIso,
        });
      }

      const totalQty = items.reduce((sum, i) => sum + (i.currentStockQty || 0), 0);

      buffers[bIdx] = {
        ...targetBuf,
        items,
        partCode: items[0]?.partCode,
        partName: items.length === 1 ? items[0]?.partName : `${items.length} loại linh kiện`,
        unit: items[0]?.unit || 'PCS',
        currentStockQty: totalQty,
        status: targetBuf.status === 'CALL_PENDING' ? 'CALL_PENDING' : (totalQty > 0 ? 'READY' : 'EMPTY'),
        lastUpdated: nowIso,
      };
      this.saveBufferLocations(buffers);
    }

    return updatedItem;
  },

  deleteKittingItem(id: string): void {
    const queue = this.getKittingQueue().filter((q) => q.id !== id);
    this.saveKittingQueue(queue);
  },

  // --- BUFFER LOCATION METHODS ---
  getBufferLocations(): BufferLocationMap[] {
    const raw = localStorage.getItem(BUFFER_MAP_KEY);
    let list: BufferLocationMap[] = DEFAULT_BUFFER_LOCATIONS;
    if (raw) {
      try {
        list = JSON.parse(raw);
      } catch {
        list = DEFAULT_BUFFER_LOCATIONS;
      }
    } else {
      localStorage.setItem(BUFFER_MAP_KEY, JSON.stringify(DEFAULT_BUFFER_LOCATIONS));
    }

    // Normalize each shelf item array
    return list.map((b) => {
      let items: BufferPartItem[] = b.items ? [...b.items] : [];
      if (items.length === 0 && b.partCode && (b.currentStockQty > 0 || b.partName)) {
        items.push({
          id: 'auto-item-1',
          partCode: b.partCode,
          partName: b.partName || b.partCode,
          unit: b.unit || 'PCS',
          currentStockQty: b.currentStockQty,
          lastUpdated: b.lastUpdated,
        });
      }
      const totalQty = items.reduce((sum, i) => sum + (i.currentStockQty || 0), 0);
      return {
        ...b,
        items,
        currentStockQty: totalQty,
        status: b.status === 'CALL_PENDING' ? 'CALL_PENDING' : totalQty > 0 ? 'READY' : 'EMPTY',
      };
    });
  },

  saveBufferLocations(locs: BufferLocationMap[]): void {
    localStorage.setItem(BUFFER_MAP_KEY, JSON.stringify(locs));
  },

  updateBufferLocation(locationId: string, data: Partial<BufferLocationMap>): BufferLocationMap {
    const locs = this.getBufferLocations();
    const idx = locs.findIndex((l) => l.locationId === locationId);
    if (idx === -1) throw new Error('Không tìm thấy kệ buffer');

    const updatedItems = data.items !== undefined ? data.items : locs[idx].items || [];
    const totalQty = updatedItems.length > 0
      ? updatedItems.reduce((sum, i) => sum + (i.currentStockQty || 0), 0)
      : (data.currentStockQty !== undefined ? data.currentStockQty : locs[idx].currentStockQty);

    locs[idx] = {
      ...locs[idx],
      ...data,
      items: updatedItems,
      currentStockQty: totalQty,
      status: totalQty <= 0 ? 'EMPTY' : (locs[idx].status === 'CALL_PENDING' ? 'CALL_PENDING' : 'READY'),
      lastUpdated: new Date().toISOString(),
    };
    this.saveBufferLocations(locs);
    return locs[idx];
  },

  clearBufferLocation(locationId: string): void {
    const locs = this.getBufferLocations();
    const idx = locs.findIndex((l) => l.locationId === locationId);
    if (idx !== -1) {
      locs[idx] = {
        ...locs[idx],
        items: [],
        partCode: undefined,
        partName: undefined,
        unit: undefined,
        currentStockQty: 0,
        status: 'EMPTY',
        lastUpdated: new Date().toISOString(),
      };
      this.saveBufferLocations(locs);
    }
  },

  addBufferLocation(data: { locationId: string; description?: string; containerStandardQty?: number }): BufferLocationMap {
    const locs = this.getBufferLocations();
    const cleanId = data.locationId.trim();
    if (!cleanId) throw new Error('Vui lòng nhập Tên vị trí / Mã kệ!');
    const existing = locs.find((l) => l.locationId.toLowerCase() === cleanId.toLowerCase());
    if (existing) throw new Error(`Vị trí kệ "${cleanId}" đã tồn tại trên sơ đồ!`);

    const newLoc: BufferLocationMap = {
      locationId: cleanId,
      description: data.description?.trim() || undefined,
      currentStockQty: 0,
      containerStandardQty: data.containerStandardQty || 50,
      status: 'EMPTY',
      lastUpdated: new Date().toISOString(),
    };
    locs.push(newLoc);
    this.saveBufferLocations(locs);
    return newLoc;
  },

  deleteBufferLocation(locationId: string): void {
    const locs = this.getBufferLocations();
    const idx = locs.findIndex((l) => l.locationId === locationId);
    if (idx === -1) throw new Error('Không tìm thấy kệ buffer');

    const target = locs[idx];
    if (target.currentStockQty > 0 || (target.partCode && target.partCode.trim() !== '')) {
      throw new Error(`Kệ "${locationId}" đang chứa linh kiện (${target.partCode || 'Linh kiện'} - Tồn: ${target.currentStockQty} ${target.unit || 'PCS'}), KHÔNG CHO PHÉP XÓA KỆ! Vui lòng dọn trống hoặc xuất linh kiện trước khi xóa.`);
    }

    const updated = locs.filter((l) => l.locationId !== locationId);
    this.saveBufferLocations(updated);
  },

  importBufferLocationsFromRows(rawRows: any[]): { added: number; updated: number } {
    const locs = this.getBufferLocations();
    let added = 0;
    let updated = 0;

    rawRows.forEach((row) => {
      let locName = '';
      let desc = '';

      if (Array.isArray(row)) {
        locName = String(row[0] ?? '').trim();
        desc = String(row[1] ?? '').trim();
      } else if (typeof row === 'object' && row !== null) {
        locName = String(
          row['Tên vị trí'] || row['Tên Vị Trí'] || row['Location'] || row['Mã kệ'] || row['Mã Kệ'] || row['Tên kệ'] || row['Name'] || row['Kệ'] || ''
        ).trim();
        desc = String(
          row['Mô tả vị trí'] || row['Mô Tả Vị Trí'] || row['Mô tả'] || row['Mô Tả'] || row['Description'] || ''
        ).trim();
      }

      if (!locName) return;
      const lower = locName.toLowerCase();
      if (lower === 'tên vị trí' || lower === 'location' || lower === 'mã kệ') return;

      const existingIdx = locs.findIndex((l) => l.locationId.toLowerCase() === lower);
      if (existingIdx !== -1) {
        locs[existingIdx] = {
          ...locs[existingIdx],
          locationId: locName,
          description: desc || locs[existingIdx].description,
          lastUpdated: new Date().toISOString(),
        };
        updated++;
      } else {
        locs.push({
          locationId: locName,
          description: desc || undefined,
          currentStockQty: 0,
          containerStandardQty: 50,
          status: 'EMPTY',
          lastUpdated: new Date().toISOString(),
        });
        added++;
      }
    });

    this.saveBufferLocations(locs);
    return { added, updated };
  },

  downloadBufferImportTemplate(): void {
    const templateData = [
      {
        'Tên vị trí': 'Kệ 1',
        'Mô tả vị trí': 'Khoang 01 - Tầng 1 - Vị trí 1',
      },
      {
        'Tên vị trí': 'Kệ 2',
        'Mô tả vị trí': 'Khoang 01 - Tầng 1 - Vị trí 2',
      },
      {
        'Tên vị trí': 'BUFFER-A1-01',
        'Mô tả vị trí': 'Khu vực A - Tầng 1 - Ô 01',
      },
      {
        'Tên vị trí': 'BUFFER-A1-02',
        'Mô tả vị trí': 'Khu vực A - Tầng 1 - Ô 02',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 25 }, // Tên vị trí
      { wch: 45 }, // Mô tả vị trí
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KhaiBaoViTriKe');
    XLSX.writeFile(wb, 'mau_khai_bao_vi_tri_ke_outbuffer.xlsx');
  },

  // --- MATERIAL CALL REQUEST METHODS (ANDON) ---
  getMaterialCallRequests(): MaterialCallRequest[] {
    const raw = localStorage.getItem(MATERIAL_CALLS_KEY);
    if (!raw) {
      localStorage.setItem(MATERIAL_CALLS_KEY, JSON.stringify(INITIAL_MATERIAL_CALLS));
      return INITIAL_MATERIAL_CALLS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_MATERIAL_CALLS;
    }
  },

  saveMaterialCallRequests(reqs: MaterialCallRequest[]): void {
    localStorage.setItem(MATERIAL_CALLS_KEY, JSON.stringify(reqs));
  },

  createMaterialCallRequest(params: {
    assemblyLine: string;
    partCode: string;
    partName: string;
    unit: string;
    requestedQty: number;
    bufferLocation: string;
    isDirectKitting?: boolean;
    requestedBy: string;
  }): MaterialCallRequest {
    const reqs = this.getMaterialCallRequests();
    const newReq: MaterialCallRequest = {
      requestId: 'call-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      assemblyLine: params.assemblyLine,
      partCode: params.partCode,
      partName: params.partName,
      unit: params.unit,
      requestedQty: params.requestedQty,
      bufferLocation: params.bufferLocation,
      isDirectKitting: params.isDirectKitting || false,
      requestedBy: params.requestedBy,
      requestedAt: new Date().toISOString(),
      status: 'CALLING',
    };
    reqs.unshift(newReq);
    this.saveMaterialCallRequests(reqs);

    // Set buffer location status to CALL_PENDING if it matches an actual buffer shelf
    if (!params.isDirectKitting && params.bufferLocation) {
      const buffers = this.getBufferLocations();
      const bIdx = buffers.findIndex((b) => b.locationId === params.bufferLocation);
      if (bIdx >= 0) {
        buffers[bIdx].status = 'CALL_PENDING';
        buffers[bIdx].lastUpdated = new Date().toISOString();
        this.saveBufferLocations(buffers);
      }
    }

    return newReq;
  },

  updateMaterialCallStatus(requestId: string, status: 'CALLING' | 'DELIVERING' | 'COMPLETED', deliveredBy?: string): MaterialCallRequest {
    const reqs = this.getMaterialCallRequests();
    const idx = reqs.findIndex((r) => r.requestId === requestId);
    if (idx === -1) throw new Error('Không tìm thấy đơn gọi hàng');

    const current = reqs[idx];
    const updated: MaterialCallRequest = {
      ...current,
      status,
      deliveredBy: deliveredBy || current.deliveredBy || 'Thủ Kho Logistics',
      deliveredAt: status === 'COMPLETED' ? new Date().toISOString() : current.deliveredAt,
    };
    reqs[idx] = updated;
    this.saveMaterialCallRequests(reqs);

    if (status === 'COMPLETED') {
      // Deduct from buffer location stock
      const buffers = this.getBufferLocations();
      const bIdx = buffers.findIndex((b) => b.locationId === current.bufferLocation);
      if (bIdx >= 0) {
        const targetBuf = buffers[bIdx];
        let items: BufferPartItem[] = targetBuf.items ? [...targetBuf.items] : [];

        const itemIdx = items.findIndex((i) => i.partCode === current.partCode);
        if (itemIdx >= 0) {
          items[itemIdx].currentStockQty = Math.max(0, items[itemIdx].currentStockQty - current.requestedQty);
          if (items[itemIdx].currentStockQty <= 0) {
            items.splice(itemIdx, 1);
          }
        }

        const remaining = items.reduce((sum, i) => sum + (i.currentStockQty || 0), 0);
        buffers[bIdx] = {
          ...targetBuf,
          items,
          partCode: items[0]?.partCode,
          partName: items.length === 1 ? items[0]?.partName : items.length > 1 ? `${items.length} loại linh kiện` : undefined,
          unit: items[0]?.unit || 'PCS',
          currentStockQty: remaining,
          status: remaining <= 0 ? 'EMPTY' : 'READY',
          lastUpdated: new Date().toISOString(),
        };
        this.saveBufferLocations(buffers);
      }

      // Update kitting queue status to DELIVERED if matching item exists
      const queue = this.getKittingQueue();
      const kIdx = queue.findIndex((k) => k.bufferLocation === current.bufferLocation && k.partCode === current.partCode && k.status === 'IN_BUFFER');
      if (kIdx >= 0) {
        queue[kIdx].status = 'DELIVERED';
        this.saveKittingQueue(queue);
      }
    }

    return updated;
  },

  // --- BOM EXPORT VOUCHERS STORAGE ---
  getBomExportVouchers(): BomExportVoucher[] {
    const data = localStorage.getItem(BOM_VOUCHERS_KEY);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  saveBomExportVouchers(vouchers: BomExportVoucher[]): void {
    localStorage.setItem(BOM_VOUCHERS_KEY, JSON.stringify(vouchers));
  },

  addBomExportVoucher(params: {
    modelName: string;
    modelQty: number;
    dateTime: string;
    person: string;
    items: BomExportVoucherItem[];
  }): BomExportVoucher {
    const vouchers = this.getBomExportVouchers();
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const todayCount = vouchers.filter((v) => v.createdAt && v.createdAt.startsWith(new Date().toISOString().slice(0, 10))).length + 1;
    const voucherCode = `PXK-BOM-${todayStr}-${String(todayCount).padStart(3, '0')}`;

    const totalQtyOut = params.items.reduce((sum, i) => sum + (i.totalQtyOut || 0), 0);

    const newVoucher: BomExportVoucher = {
      id: 'vxk-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      voucherCode,
      modelName: params.modelName,
      modelQty: params.modelQty,
      createdAt: new Date().toISOString(),
      dateTime: params.dateTime || new Date().toISOString(),
      person: params.person,
      items: params.items,
      totalPartsCount: params.items.length,
      totalQtyOut,
    };

    vouchers.unshift(newVoucher);
    this.saveBomExportVouchers(vouchers);
    return newVoucher;
  },

  deleteBomExportVoucher(id: string): void {
    const vouchers = this.getBomExportVouchers().filter((v) => v.id !== id);
    this.saveBomExportVouchers(vouchers);
  },

  // --- USER ACCOUNTS STORAGE & AUTH ---
  getUsers(): UserAccount[] {
    const data = localStorage.getItem('thekho_users_v1');
    if (!data) {
      const defaultUsers: UserAccount[] = [
        {
          id: 'user-admin',
          username: 'admin',
          password: '123',
          fullName: 'Nguyễn Văn Quản Trị',
          roleTitle: 'Quản Trị Hệ Thống (Admin)',
          allowedTabs: [
            'dashboard',
            'parts',
            'stock_in',
            'stock_out',
            'warehouse_map',
            'kitting',
            'buffer',
            'andon_request',
            'andon_calling',
            'andon_delivering',
            'bin_card',
            'reports',
            'settings',
            'users',
          ],
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'user-thukho',
          username: 'thukho',
          password: '123',
          fullName: 'Trần Văn Bình',
          roleTitle: 'Thủ Kho Trung Tâm',
          allowedTabs: [
            'dashboard',
            'parts',
            'stock_in',
            'stock_out',
            'warehouse_map',
            'bin_card',
            'reports',
          ],
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'user-kitting',
          username: 'kitting',
          password: '123',
          fullName: 'Lê Thị Hoa',
          roleTitle: 'Nhân Viên Bóc Tách Kitting',
          allowedTabs: ['kitting', 'buffer'],
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'user-daychuyen',
          username: 'daychuyen',
          password: '123',
          fullName: 'Phạm Văn Mạnh',
          roleTitle: 'Quản Lý Dây Chuyền Lắp Ráp',
          allowedTabs: ['andon_request', 'andon_calling', 'andon_delivering', 'buffer'],
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ];
      localStorage.setItem('thekho_users_v1', JSON.stringify(defaultUsers));
      return defaultUsers;
    }
    try {
      const parsed: UserAccount[] = JSON.parse(data);
      // Migrate legacy 'andon' tab to new granular tabs if needed
      return parsed.map((u) => {
        if (u.allowedTabs && u.allowedTabs.includes('andon' as any)) {
          const newTabs = u.allowedTabs.filter((t) => (t as any) !== 'andon');
          if (!newTabs.includes('andon_request')) newTabs.push('andon_request');
          if (!newTabs.includes('andon_calling')) newTabs.push('andon_calling');
          if (!newTabs.includes('andon_delivering')) newTabs.push('andon_delivering');
          return { ...u, allowedTabs: newTabs };
        }
        return u;
      });
    } catch {
      return [];
    }
  },

  saveUsers(users: UserAccount[]): void {
    localStorage.setItem('thekho_users_v1', JSON.stringify(users));
  },

  addUser(params: Omit<UserAccount, 'id' | 'createdAt'>): UserAccount {
    const users = this.getUsers();
    if (users.some((u) => u.username.toLowerCase() === params.username.toLowerCase())) {
      throw new Error(`Tên đăng nhập "${params.username}" đã tồn tại!`);
    }

    const newUser: UserAccount = {
      id: 'usr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      username: params.username.trim(),
      password: params.password,
      fullName: params.fullName.trim(),
      roleTitle: params.roleTitle.trim() || 'Nhân viên',
      allowedTabs: params.allowedTabs && params.allowedTabs.length > 0 ? params.allowedTabs : ['dashboard'],
      isActive: params.isActive !== undefined ? params.isActive : true,
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    this.saveUsers(users);
    return newUser;
  },

  updateUser(id: string, updates: Partial<UserAccount>): UserAccount {
    const users = this.getUsers();
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) throw new Error('Không tìm thấy tài khoản người dùng!');

    if (
      updates.username &&
      users.some((u) => u.id !== id && u.username.toLowerCase() === updates.username!.toLowerCase())
    ) {
      throw new Error(`Tên đăng nhập "${updates.username}" đã bị trùng lặp!`);
    }

    const updatedUser = {
      ...users[index],
      ...updates,
    };

    users[index] = updatedUser;
    this.saveUsers(users);

    const current = this.getCurrentUser();
    if (current && current.id === id) {
      this.setCurrentUser(updatedUser);
    }

    return updatedUser;
  },

  deleteUser(id: string): void {
    const current = this.getCurrentUser();
    if (current && current.id === id) {
      throw new Error('Không thể xóa tài khoản người dùng đang đăng nhập hiện tại!');
    }
    const users = this.getUsers().filter((u) => u.id !== id);
    this.saveUsers(users);
  },

  getCurrentUser(): UserAccount | null {
    const data = localStorage.getItem('thekho_current_user_v1');
    if (!data) return null;
    try {
      const u: UserAccount = JSON.parse(data);
      const users = this.getUsers();
      const found = users.find((item) => item.id === u.id);
      if (!found || !found.isActive) return null;
      return found;
    } catch {
      return null;
    }
  },

  setCurrentUser(user: UserAccount | null): void {
    if (!user) {
      localStorage.removeItem('thekho_current_user_v1');
    } else {
      localStorage.setItem('thekho_current_user_v1', JSON.stringify(user));
    }
  },

  isAdminUser(user?: UserAccount | null): boolean {
    const target = user !== undefined ? user : this.getCurrentUser();
    if (!target) return false;
    const username = (target.username || '').toLowerCase();
    const roleTitle = (target.roleTitle || '').toLowerCase();
    return (
      username === 'admin' ||
      roleTitle.includes('quản trị') ||
      roleTitle.includes('admin') ||
      roleTitle.includes('giám đốc') ||
      roleTitle.includes('quản lý')
    );
  },

  login(username: string, password: string): { success: boolean; user?: UserAccount; error?: string } {
    const users = this.getUsers();
    const target = users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!target) {
      return { success: false, error: 'Tên đăng nhập không tồn tại trên hệ thống!' };
    }

    if (!target.isActive) {
      return { success: false, error: 'Tài khoản này hiện đang bị tạm khóa!' };
    }

    if (target.password !== password) {
      return { success: false, error: 'Mật khẩu không chính xác!' };
    }

    const updatedUser = this.updateUser(target.id, {
      lastLoginAt: new Date().toISOString(),
    });

    this.setCurrentUser(updatedUser);
    return { success: true, user: updatedUser };
  },

  logout(): void {
    this.setCurrentUser(null);
  },

  // --- MASTER CONTAINER TAGS (BÓC TÁCH KITTING SMART) ---
  getMasterContainerTags(): MasterKittingTag[] {
    const raw = localStorage.getItem(MASTER_CONTAINER_TAGS_KEY);
    if (!raw) {
      localStorage.setItem(MASTER_CONTAINER_TAGS_KEY, JSON.stringify(SAMPLE_MASTER_TAGS));
      return SAMPLE_MASTER_TAGS;
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      return SAMPLE_MASTER_TAGS;
    } catch {
      return SAMPLE_MASTER_TAGS;
    }
  },

  saveMasterContainerTags(tags: MasterKittingTag[]): void {
    localStorage.setItem(MASTER_CONTAINER_TAGS_KEY, JSON.stringify(tags));
  },

  resetMasterContainerTags(): MasterKittingTag[] {
    localStorage.setItem(MASTER_CONTAINER_TAGS_KEY, JSON.stringify(SAMPLE_MASTER_TAGS));
    return SAMPLE_MASTER_TAGS;
  },

  // --- CONVERSION FACTORS (HỆ SỐ QUY ĐỔI) ---
  getConversionFactors(): ConversionFactor[] {
    const raw = localStorage.getItem(CONVERSION_FACTORS_KEY);
    if (!raw) {
      localStorage.setItem(CONVERSION_FACTORS_KEY, JSON.stringify(DEFAULT_CONVERSION_FACTORS));
      return DEFAULT_CONVERSION_FACTORS;
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      return DEFAULT_CONVERSION_FACTORS;
    } catch {
      return DEFAULT_CONVERSION_FACTORS;
    }
  },

  saveConversionFactors(factors: ConversionFactor[]): void {
    localStorage.setItem(CONVERSION_FACTORS_KEY, JSON.stringify(factors));
  },

  getConversionFactorForPart(partCode: string): number {
    const list = this.getConversionFactors();
    const found = list.find(f => f.partCode.trim().toLowerCase() === partCode.trim().toLowerCase());
    return found ? found.hsqd : 1.0;
  },

  // --- KITTING SCAN LOGS (Ghi nhận quét bóc tách lên OUTBUFFER - Lưu tối đa 35 ngày) ---
  getKittingScanLogs(): KittingScanLog[] {
    const raw = localStorage.getItem(KITTING_SCAN_LOGS_KEY);
    if (!raw) return [];
    try {
      const logs: KittingScanLog[] = JSON.parse(raw);
      if (!Array.isArray(logs)) return [];

      const thirtyFiveDaysAgo = new Date();
      thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);
      const cutoffMs = thirtyFiveDaysAgo.getTime();

      const validLogs = logs.filter((log) => {
        const logTime = new Date(log.timestamp).getTime();
        return !isNaN(logTime) && logTime >= cutoffMs;
      });

      if (validLogs.length !== logs.length) {
        localStorage.setItem(KITTING_SCAN_LOGS_KEY, JSON.stringify(validLogs));
      }
      return validLogs;
    } catch {
      return [];
    }
  },

  addKittingScanLog(log: Omit<KittingScanLog, 'id'>): KittingScanLog {
    const logs = this.getKittingScanLogs();
    const newLog: KittingScanLog = {
      ...log,
      id: 'scan-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    };
    logs.unshift(newLog);
    localStorage.setItem(KITTING_SCAN_LOGS_KEY, JSON.stringify(logs));
    return newLog;
  },

  // --- PRODUCTIVITY PERSONNEL CONFIG (Lưu gợi ý thông số điền tay) ---
  getProductivityPersonnelConfig(): ProductivityPersonnelConfig {
    const raw = localStorage.getItem(PRODUCTIVITY_PERSONNEL_CONFIG_KEY);
    if (!raw) {
      localStorage.setItem(PRODUCTIVITY_PERSONNEL_CONFIG_KEY, JSON.stringify(DEFAULT_PRODUCTIVITY_PERSONNEL_CONFIG));
      return DEFAULT_PRODUCTIVITY_PERSONNEL_CONFIG;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_PRODUCTIVITY_PERSONNEL_CONFIG;
    }
  },

  saveProductivityPersonnelConfig(config: ProductivityPersonnelConfig): void {
    localStorage.setItem(PRODUCTIVITY_PERSONNEL_CONFIG_KEY, JSON.stringify(config));
  },

  // --- CUSTOM GENERATED CONTAINER TAGS (Lưu vị trí riêng biệt với Thẻ Master Data) ---
  getCustomGeneratedContainerTags(): CustomGeneratedContainerTag[] {
    const raw = localStorage.getItem(CUSTOM_GENERATED_CONTAINER_TAGS_KEY);
    if (!raw) return [];
    try {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  },

  saveCustomGeneratedContainerTags(tags: CustomGeneratedContainerTag[]): void {
    localStorage.setItem(CUSTOM_GENERATED_CONTAINER_TAGS_KEY, JSON.stringify(tags));
  },

  addCustomGeneratedContainerTag(tag: CustomGeneratedContainerTag): void {
    const existing = this.getCustomGeneratedContainerTags();
    // Avoid duplicate if id exists
    const filtered = existing.filter((t) => t.id !== tag.id);
    filtered.unshift(tag);
    this.saveCustomGeneratedContainerTags(filtered);
  },

  deleteCustomGeneratedContainerTag(id: string): void {
    const existing = this.getCustomGeneratedContainerTags();
    const updated = existing.filter((t) => t.id !== id);
    this.saveCustomGeneratedContainerTags(updated);
  },

  // --- SUPABASE DUAL SYNC UTILITIES ---
  async syncWithSupabase(): Promise<{ success: boolean; message: string }> {
    const { isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) {
      return { success: false, message: 'Chưa cấu hình SUPABASE_URL và SUPABASE_ANON_KEY!' };
    }

    try {
      let syncCount = 0;

      // 1. Fetch Parts
      const remoteParts = await supabaseKeyStore.get<Part[]>(PARTS_KEY);
      if (remoteParts && Array.isArray(remoteParts) && remoteParts.length > 0) {
        localStorage.setItem(PARTS_KEY, JSON.stringify(remoteParts));
        syncCount++;
      } else {
        const relParts = await supabaseRelationalStore.selectParts();
        if (relParts && relParts.length > 0) {
          localStorage.setItem(PARTS_KEY, JSON.stringify(relParts));
          syncCount++;
        }
      }

      // 2. Fetch Transactions
      const remoteTxs = await supabaseKeyStore.get<Transaction[]>(TRANSACTIONS_KEY);
      if (remoteTxs && Array.isArray(remoteTxs) && remoteTxs.length > 0) {
        localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(remoteTxs));
        syncCount++;
      } else {
        const relTxs = await supabaseRelationalStore.selectTransactions();
        if (relTxs && relTxs.length > 0) {
          localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(relTxs));
          syncCount++;
        }
      }

      // 3. Fetch Settings
      const remoteSettings = await supabaseKeyStore.get<AppSettings>(SETTINGS_KEY);
      if (remoteSettings && remoteSettings.companyName) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(remoteSettings));
        syncCount++;
      }

      // 4. Fetch Other Entities
      const otherKeys = [
        CONTAINER_BATCHES_KEY,
        MODEL_BOMS_KEY,
        KITTING_QUEUE_KEY,
        BUFFER_MAP_KEY,
        MATERIAL_CALLS_KEY,
        BOM_VOUCHERS_KEY,
        MASTER_CONTAINER_TAGS_KEY,
        CONVERSION_FACTORS_KEY,
        PRODUCTIVITY_PERSONNEL_CONFIG_KEY,
        CUSTOM_GENERATED_CONTAINER_TAGS_KEY,
      ];

      for (const k of otherKeys) {
        const val = await supabaseKeyStore.get(k);
        if (val !== null && val !== undefined) {
          localStorage.setItem(k, JSON.stringify(val));
          syncCount++;
        }
      }

      return {
        success: true,
        message: `Đã đồng bộ thành công ${syncCount} danh mục dữ liệu từ Supabase!`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi đồng bộ từ Supabase: ${err?.message || 'Không thể tải dữ liệu'}`,
      };
    }
  },

  async pushAllToSupabase(): Promise<{ success: boolean; message: string }> {
    const { isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) {
      return { success: false, message: 'Chưa cấu hình SUPABASE_URL và SUPABASE_ANON_KEY!' };
    }

    try {
      this.saveSettings(this.getSettings());
      this.saveParts(this.getParts());
      this.saveTransactions(this.getTransactions());
      this.saveContainerBatches(this.getContainerBatches());
      this.saveModelBOMs(this.getModelBOMs());
      this.saveKittingQueue(this.getKittingQueue());
      this.saveBufferMap(this.getBufferMap());
      this.saveMaterialCalls(this.getMaterialCalls());
      this.saveBomVouchers(this.getBomVouchers());
      this.saveMasterContainerTags(this.getMasterContainerTags());
      this.saveConversionFactors(this.getConversionFactors());
      this.saveProductivityPersonnelConfig(this.getProductivityPersonnelConfig());
      this.saveCustomGeneratedContainerTags(this.getCustomGeneratedContainerTags());

      return {
        success: true,
        message: 'Đã đẩy toàn bộ dữ liệu hiện tại lên Cơ sở dữ liệu Supabase thành công!',
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi đẩy dữ liệu lên Supabase: ${err?.message || 'Thất bại'}`,
      };
    }
  },
};




