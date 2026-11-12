import { Part, PartLocationStock, Transaction, StockCheckRecord, AppSettings, ContainerBatch, ContainerQrTag, FifoLot, ModelBOM, ModelBOMItem, KittingQueueItem, BufferLocationMap, BufferPartItem, MaterialCallRequest, BomExportVoucher, BomExportVoucherItem, BomExportVoucherRoundRecord, UserAccount, ViewTab, ConversionFactor, KittingScanLog, ProductivityPersonnelConfig, HourlyPersonnelSlot } from './types';
import { initialParts, initialTransactions, initialSettings } from './sampleData';
import { MasterKittingTag, SAMPLE_MASTER_TAGS } from './masterExcelParser';
import { getPartGroupConfig } from './partGroupColors';
import { supabaseKeyStore, supabaseRelationalStore, STORAGE_KEYS, batchExecuteNgTransaction, mapSupabaseRowToTransaction, getLocalCacheData, setLocalCacheData } from './supabaseStorage';
import { getActiveSupabaseClient } from './supabase';
import { compressStorageValue, decompressStorageValue, optimizeAllExistingLocalStorage } from './storageCompression';
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
const USERS_KEY = 'thekho_users_v1';
const DELETED_CALL_IDS_KEY = 'thekho_deleted_call_ids_v1';
const MANUALLY_COMPLETED_VOUCHERS_KEY = 'thekho_manually_completed_vouchers_v1';
const DELETED_BOM_VOUCHER_CODES_KEY = 'thekho_deleted_bom_voucher_codes_v1';

/**
 * Helper an toàn đọc dữ liệu localStorage với tự động giải nén LZ-String.
 * Tương thích ngược 100% với JSON thô cũ.
 */
function safeGetRaw(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    return decompressStorageValue(raw);
  } catch {
    return null;
  }
}

/**
 * Helper an toàn ghi dữ liệu localStorage với tự động nén LZ-String UTF-16.
 * Giảm 70-90% dung lượng thực tế, chống tuyệt đối tràn bộ nhớ QuotaExceededError.
 */
function safeSetRaw(key: string, value: string): boolean {
  try {
    const compressed = compressStorageValue(value);
    localStorage.setItem(key, compressed);
    return true;
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError' || err?.code === 22 || err?.code === 1014) {
      console.warn('[Storage] QuotaExceededError detected! Running emergency 14-day cleanup...');
      try {
        storageService.cleanupOldLocalStorageRecords(14);
        const compressed = compressStorageValue(value);
        localStorage.setItem(key, compressed);
        return true;
      } catch {
        console.error('[Storage] Still exceeded quota after emergency cleanup.');
        return false;
      }
    }
    return false;
  }
}

// In-Memory RAM Caches for high-volume entities (Transactions & Master Container Tags).
// Eliminates localStorage bloating (keeping localStorage < 500KB) while ensuring instant UI access.
let inMemoryTransactions: Transaction[] = [];
let lastSyncedTransactionTimestamp: string | null = null;
let hasLoadedFullReconcileLedger: boolean = false;
let inMemoryMasterContainerTags: MasterKittingTag[] | null = null;

// --- RAM TTL CACHE CHO BINCARD HISTORY & RECONCILE (TTL: 4 PHÚT = 240,000ms) ---
// Cắt giảm triệt để việc quét/kéo lại toàn bộ transaction ledger khi dữ liệu vừa được đọc gần đây
const BIN_CARD_CACHE_TTL_MS = 4 * 60 * 1000;
interface BinCardCacheEntry {
  data: Transaction[];
  timestamp: number;
  txCount: number;
  firstTxId: string;
  lastTxId: string;
}
const binCardHistoryRamCache = new Map<string, BinCardCacheEntry>();
let lastReconcileCloudFetchAt = 0;

function invalidateBinCardHistoryCache(): void {
  binCardHistoryRamCache.clear();
}

// --- HÀNG ĐỢI GOM LÔ GHI DỮ LIỆU (WRITE DEBOUNCE 400ms & BATCH QUEUE MAX 150 RECORDS) ---
// Cắt giảm triệt để Log Ingestion và các lệnh upsert lẻ tẻ lên Supabase Free Tier
const WRITE_QUEUE_DEBOUNCE_MS = 400;
const MAX_BATCH_UPSERT_RECORDS = 150;

const pendingPartsUpsertQueue = new Map<string, Part>();
const pendingPartsDeleteQueue = new Set<string>();
let pendingFullPartsKvSnapshot: Part[] | null = null;
let pendingSettingsSnapshot: AppSettings | null = null;
let pendingMaterialCallsSnapshot: MaterialCallRequest[] | null = null;
let writeQueueDebounceTimer: ReturnType<typeof setTimeout> | null = null;

async function flushWriteQueueToSupabase(): Promise<void> {
  if (writeQueueDebounceTimer) {
    clearTimeout(writeQueueDebounceTimer);
    writeQueueDebounceTimer = null;
  }

  const settingsToFlush = pendingSettingsSnapshot;
  const fullPartsKvToFlush = pendingFullPartsKvSnapshot;
  const materialCallsToFlush = pendingMaterialCallsSnapshot;
  const partsToUpsert = Array.from(pendingPartsUpsertQueue.values());
  const partIdsToDelete = Array.from(pendingPartsDeleteQueue.values());

  pendingSettingsSnapshot = null;
  pendingFullPartsKvSnapshot = null;
  pendingMaterialCallsSnapshot = null;
  pendingPartsUpsertQueue.clear();
  pendingPartsDeleteQueue.clear();

  const tasks: Promise<any>[] = [];

  // 1. Flush Settings (KV + Relational)
  if (settingsToFlush) {
    tasks.push(
      supabaseKeyStore.set(STORAGE_KEYS.SETTINGS, settingsToFlush),
      supabaseRelationalStore.upsertSettings(settingsToFlush)
    );
  }

  // 2. Flush Full Parts KV Snapshot (1 lệnh duy nhất thay vì bắn liên tục)
  if (fullPartsKvToFlush) {
    tasks.push(supabaseKeyStore.set(STORAGE_KEYS.PARTS, fullPartsKvToFlush));
  }

  // 2b. Flush Material Calls Snapshot (Debounced)
  if (materialCallsToFlush) {
    tasks.push(supabaseKeyStore.set(STORAGE_KEYS.MATERIAL_CALLS, materialCallsToFlush));
  }

  // 3. Flush Relational Parts Upsert theo lô tối đa 150 bản ghi/lần gửi
  if (partsToUpsert.length > 0) {
    for (let i = 0; i < partsToUpsert.length; i += MAX_BATCH_UPSERT_RECORDS) {
      const chunk = partsToUpsert.slice(i, i + MAX_BATCH_UPSERT_RECORDS);
      tasks.push(supabaseRelationalStore.upsertParts(chunk));
    }
  }

  // 4. Flush Relational Parts Delete theo lô tối đa 150 ID/lần gửi
  if (partIdsToDelete.length > 0) {
    for (let i = 0; i < partIdsToDelete.length; i += MAX_BATCH_UPSERT_RECORDS) {
      const chunk = partIdsToDelete.slice(i, i + MAX_BATCH_UPSERT_RECORDS);
      tasks.push(supabaseRelationalStore.deletePartsBatch(chunk));
    }
  }

  if (tasks.length > 0) {
    try {
      await Promise.allSettled(tasks);
    } catch (_) {}
  }
}

function scheduleDebouncedWriteFlush(): void {
  if (writeQueueDebounceTimer) {
    clearTimeout(writeQueueDebounceTimer);
  }
  writeQueueDebounceTimer = setTimeout(() => {
    flushWriteQueueToSupabase();
  }, WRITE_QUEUE_DEBOUNCE_MS);
}

export interface CustomGeneratedContainerTag extends MasterKittingTag {
  createdAt: string;
  createdReason?: string;
  isCustomGenerated?: boolean;
}

export interface LocalStorageUsageSummary {
  totalBytes: number;
  totalKB: number;
  quotaKB: number;
  percentUsed: number;
  isSafe: boolean;
  itemCounts: {
    parts: number;
    transactions: number;
    kittingLogs: number;
    andonCalls: number;
    containerBatches: number;
    usedTokens: number;
    bomVouchers: number;
  };
}

export interface CleanupResult {
  prunedCount: number;
  prunedTransactions: number;
  prunedKittingLogs: number;
  prunedAndonCalls: number;
  prunedKittingQueue: number;
  prunedContainerBatches: number;
  prunedTokens: number;
  prunedBomVouchers: number;
  bytesFreed: number;
  beforeBytes: number;
  afterBytes: number;
  retentionDays: number;
  executedAt: string;
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

export const DEFAULT_SYSTEM_USERS: UserAccount[] = [
  {
    id: 'user-admin',
    username: 'admin',
    password: '123',
    fullName: 'Sunhouse',
    roleTitle: 'Quản Trị Hệ Thống (Admin)',
    allowedTabs: [
      'dashboard',
      'parts',
      'stock_in',
      'stock_out',
      'ng_warehouse',
      'warehouse_map',
      'kitting',
      'buffer',
      'andon_request',
      'andon_calling',
      'andon_delivering',
      'andon_history',
      'bin_card',
      'settings',
      'users',
    ],
    canConfigureBuffer: true,
    isActive: true,
    createdAt: '2026-10-26T10:00:00.000Z',
  },
  {
    id: 'user-thukho',
    username: 'thukho',
    password: '123',
    fullName: 'Nguyễn Văn Nghĩa',
    roleTitle: 'Thủ Kho Trung Tâm',
    allowedTabs: [
      'dashboard',
      'parts',
      'stock_in',
      'stock_out',
      'ng_warehouse',
      'warehouse_map',
      'kitting',
      'buffer',
      'andon_request',
      'andon_calling',
      'andon_delivering',
      'andon_history',
      'bin_card',
      'settings',
    ],
    canConfigureBuffer: false,
    isActive: true,
    createdAt: '2026-10-26T10:00:00.000Z',
  },
  {
    id: 'user-boctach1',
    username: 'boctach1',
    password: '123',
    fullName: 'Võ Thạch Toàn',
    roleTitle: 'Nhân Viên Bóc Tách Kitting',
    allowedTabs: [
      'kitting',
      'buffer',
      'andon_calling',
      'andon_delivering',
      'andon_history',
    ],
    canConfigureBuffer: false,
    isActive: true,
    createdAt: '2026-10-26T10:00:00.000Z',
  },
  {
    id: 'user-daychuyen',
    username: 'daychuyen',
    password: '123',
    fullName: 'Nguyễn Minh Hoàng Khiêm',
    roleTitle: 'Quản Lý Dây Chuyền Lắp Ráp',
    allowedTabs: [
      'buffer',
      'andon_request',
      'andon_calling',
      'andon_delivering',
    ],
    canConfigureBuffer: true,
    isActive: true,
    createdAt: '2026-10-26T10:00:00.000Z',
  },
  {
    id: 'user-phukho1',
    username: 'phukho1',
    password: '123',
    fullName: 'Nguyễn Văn Thìn',
    roleTitle: 'Phụ kho',
    allowedTabs: [
      'parts',
      'stock_in',
      'stock_out',
      'ng_warehouse',
      'warehouse_map',
    ],
    canConfigureBuffer: false,
    isActive: true,
    createdAt: '2026-10-26T10:00:00.000Z',
  },
  {
    id: 'user-phukho2',
    username: 'phukho2',
    password: '123',
    fullName: 'Nguyễn Thị Kim Đào',
    roleTitle: 'Phụ kho',
    allowedTabs: [
      'parts',
      'stock_in',
      'stock_out',
      'ng_warehouse',
      'warehouse_map',
      'kitting',
      'buffer',
    ],
    canConfigureBuffer: false,
    isActive: true,
    createdAt: '2026-10-26T10:00:00.000Z',
  },
  {
    id: 'user-phukho3',
    username: 'phukho3',
    password: '123',
    fullName: 'Nguyễn Văn Hùng',
    roleTitle: 'Phụ Kho',
    allowedTabs: [
      'parts',
      'stock_in',
      'stock_out',
      'ng_warehouse',
      'warehouse_map',
    ],
    canConfigureBuffer: false,
    isActive: true,
    createdAt: '2026-10-26T10:00:00.000Z',
  },
  {
    id: 'user-boctach2',
    username: 'boctach2',
    password: '123',
    fullName: 'Tuấn',
    roleTitle: 'Thủ Kho',
    allowedTabs: [
      'kitting',
      'buffer',
      'bin_card',
    ],
    canConfigureBuffer: false,
    isActive: true,
    createdAt: '2026-10-26T10:00:00.000Z',
  },
  {
    id: 'user-daychuyen1',
    username: 'daychuyen1',
    password: '123',
    fullName: 'Duyên',
    roleTitle: 'Nhóm trưởng',
    allowedTabs: [
      'andon_request',
      'andon_delivering',
      'andon_history',
    ],
    canConfigureBuffer: false,
    isActive: true,
    createdAt: '2026-10-26T10:00:00.000Z',
  },
  {
    id: 'user-daychuyen2',
    username: 'daychuyen2',
    password: '123',
    fullName: 'Dũng',
    roleTitle: 'Nhóm trưởng',
    allowedTabs: [
      'andon_request',
      'andon_delivering',
      'andon_history',
    ],
    canConfigureBuffer: false,
    isActive: true,
    createdAt: '2026-10-26T10:00:00.000Z',
  },
  {
    id: 'user-daychuyen3',
    username: 'daychuyen3',
    password: '123',
    fullName: 'Tuyền',
    roleTitle: 'Nhóm trưởng',
    allowedTabs: [
      'parts',
      'stock_in',
      'ng_warehouse',
      'andon_request',
      'andon_delivering',
    ],
    canConfigureBuffer: false,
    isActive: true,
    createdAt: '2026-10-26T10:00:00.000Z',
  },
  {
    id: 'user-daychuyen4',
    username: 'daychuyen4',
    password: '123',
    fullName: 'Nguyễn Quốc Thịnh',
    roleTitle: 'Thủ Kho',
    allowedTabs: [
      'buffer',
      'andon_request',
      'andon_delivering',
    ],
    canConfigureBuffer: false,
    isActive: true,
    createdAt: '2026-10-26T10:00:00.000Z',
  },
];

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

// Clean warehouse prefixes (e.g. "2BVL - H02" -> "H02", "Kho 1 - A01" -> "A01", "Nhà máy 2BVL / H02" -> "H02")
export function cleanWarehousePrefix(name: string | undefined | null): string {
  if (!name) return '';
  const trimmed = name.trim();
  // Strip compound warehouse/plant prefix before delimiter
  return trimmed
    .replace(/^(?:2bvl|nha\s*may\s*2bvl|nhà\s*máy\s*2bvl|kho\s*chinh|kho\s*chính|kho\s*1|kho\s*2)[\s:\-_./]+\s*/i, '')
    .trim();
}

// Check if a location name is a real physical shelf location (not generic 'kho chính', not empty, etc.)
export function isRealShelfLocation(name: string | undefined | null): boolean {
  if (!name) return false;
  // Clean parenthesis with qty first (e.g. "H02 (1.670)" -> "H02")
  const strippedQty = name.replace(/\s*\([\d\.\,\s]+\)$/, '').trim();
  const cleaned = cleanWarehousePrefix(strippedQty);
  const target = (cleaned || strippedQty).toLowerCase();

  if (
    !target ||
    target === '2bvl' ||
    target === 'kho chính' ||
    target === 'kho 1' ||
    target === 'kho 2' ||
    target === 'kho' ||
    target === 'n/a' ||
    target === 'chưa phân vị trí' ||
    target.includes('chưa phân') ||
    target.includes('hết hàng')
  ) {
    return false;
  }
  return true;
}

// Helper to normalize a shelf identifier (stripping accents, 'kệ', spaces, punctuation, warehouse prefix)
export function normalizeShelfKey(name: string | undefined | null): string {
  if (!name) return '';
  const strippedQty = name.replace(/\s*\([\d\.\,\s]+\)$/, '').trim();
  const cleaned = cleanWarehousePrefix(strippedQty);
  return (cleaned || strippedQty)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/^(?:ke|khay|o|khoang|khu|day|tang|vi\s*tri)[\s:\-_./]*/i, '')
    .replace(/[^a-z0-9]/g, '');
}

// Generate normalized key variants (e.g. "a01" <-> "a1") for resilient shelf lookup
export function getShelfKeyVariants(name: string | undefined | null): string[] {
  const norm = normalizeShelfKey(name);
  if (!norm) return [];
  const variants = new Set<string>([norm]);
  const m = norm.match(/^([a-z]+)(0*)([1-9]\d*)$/);
  if (m) {
    const prefix = m[1];
    const numStr = m[3];
    variants.add(`${prefix}${numStr}`);
    if (numStr.length === 1) {
      variants.add(`${prefix}0${numStr}`);
    }
  }
  return Array.from(variants);
}

// Helper for location matching that handles accents, case, prefixes, and sub-compartments accurately
export function isLocationMatch(locA: string | undefined | null, locB: string | undefined | null): boolean {
  if (!locA || !locB) return false;

  const a = locA.trim().toLowerCase();
  const b = locB.trim().toLowerCase();
  if (a === b) return true;

  // Clean parenthesis with qty, e.g. "Kệ A1 (500)" -> "Kệ A1"
  const cleanA = a.replace(/\s*\([\d\.\,\s]+\)$/, '').trim();
  const cleanB = b.replace(/\s*\([\d\.\,\s]+\)$/, '').trim();
  if (cleanA === cleanB) return true;

  const strippedA = cleanWarehousePrefix(cleanA);
  const strippedB = cleanWarehousePrefix(cleanB);
  if (strippedA && strippedB && strippedA.toLowerCase() === strippedB.toLowerCase()) return true;

  const variantsA = getShelfKeyVariants(cleanA);
  const variantsB = new Set(getShelfKeyVariants(cleanB));
  if (variantsA.some((va) => variantsB.has(va))) return true;

  // Split both by [-/._,;] into sub-segments and check for matching shelf key
  const segsA = cleanA
    .split(/\s*[-/,;+]\s*/)
    .flatMap((s) => getShelfKeyVariants(s))
    .filter(Boolean);
  const segsB = new Set(
    cleanB
      .split(/\s*[-/,;+]\s*/)
      .flatMap((s) => getShelfKeyVariants(s))
      .filter(Boolean)
  );

  if (segsA.some((sa) => segsB.has(sa))) {
    return true;
  }

  return false;
}

/**
 * Helper chuẩn hóa & tách danh sách kệ từ chuỗi `part.location` (hỗ trợ dấu phẩy, chấm phẩy, gạch chéo).
 */
function parseShelfLocationsFromString(locationStr: string | undefined | null, fallbackStock: number): PartLocationStock[] {
  if (!locationStr || !locationStr.trim()) return [];
  const raw = locationStr.trim();
  const lower = raw.toLowerCase();
  if (lower.includes('chưa phân') || lower.includes('hết hàng')) return [];

  const segments = raw.includes(',')
    ? raw.split(',')
    : raw.includes(';')
    ? raw.split(';')
    : raw.includes(' / ')
    ? raw.split(' / ')
    : [raw];

  const result: PartLocationStock[] = [];
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(.+?)\s*\(([\d\.\,\s]+)\)$/);
    if (match) {
      const rawShelfName = match[1].trim();
      const cleanShelfName = cleanWarehousePrefix(rawShelfName) || rawShelfName;
      const parsedQty = parseFloat(match[2].replace(/\./g, '').replace(',', '.').trim()) || 0;
      if (parsedQty > 0 && isRealShelfLocation(cleanShelfName)) {
        result.push({ locationName: cleanShelfName, quantity: parsedQty });
      }
    } else {
      const cleanShelfName = cleanWarehousePrefix(trimmed) || trimmed;
      if (isRealShelfLocation(cleanShelfName)) {
        const defaultQty =
          segments.length === 1
            ? Math.max(1, fallbackStock)
            : Math.max(1, Math.round(fallbackStock / segments.length));
        result.push({ locationName: cleanShelfName, quantity: defaultQty });
      }
    }
  }
  return result;
}

/**
 * Tính toán chính xác tồn kho thực tế từ sổ cái giao dịch (Transaction Ledger),
 * có tính đến tồn kho khởi tạo ban đầu (`stockBefore` của giao dịch đầu tiên) và `stockAfter` của kiểm kê/giao dịch cuối.
 */
function computeTrueStockFromHistory(part: Part, history: Transaction[]): number {
  if (!history || history.length === 0) {
    return typeof part.currentStock === 'number' ? part.currentStock : Number(part.currentStock) || 0;
  }

  let totalIn = 0;
  let totalOut = 0;
  for (let h = 0; h < history.length; h++) {
    const tx = history[h];
    const q = typeof tx.quantity === 'number' ? tx.quantity : Number(tx.quantity) || 0;
    if (q <= 0) continue;
    if (tx.type === 'IN') {
      totalIn += q;
    } else if (
      tx.type === 'OUT' ||
      tx.type === 'TRANSFER_TO_NG' ||
      tx.type === 'EXPORT_NG_RTV' ||
      tx.type === 'EXPORT_NG_SCRAP'
    ) {
      totalOut += q;
    }
  }

  const firstTx = history[0];
  let initialBaseline = 0;
  if (firstTx) {
    const sb = typeof firstTx.stockBefore === 'number' ? firstTx.stockBefore : Number(firstTx.stockBefore) || 0;
    const sa = typeof firstTx.stockAfter === 'number' ? firstTx.stockAfter : Number(firstTx.stockAfter) || 0;
    const fq = typeof firstTx.quantity === 'number' ? firstTx.quantity : Number(firstTx.quantity) || 0;
    if (sb > 0) {
      initialBaseline = sb;
    } else if (firstTx.type === 'IN' && sa > fq) {
      initialBaseline = sa - fq;
    } else if (
      (firstTx.type === 'OUT' || firstTx.type === 'TRANSFER_TO_NG') &&
      sa >= 0 &&
      fq > 0
    ) {
      initialBaseline = sa + fq;
    }
  }

  let runningStock = initialBaseline;
  for (let h = 0; h < history.length; h++) {
    const tx = history[h];
    const q = typeof tx.quantity === 'number' ? tx.quantity : Number(tx.quantity) || 0;
    if (q <= 0) continue;

    if (tx.type === 'IN') {
      runningStock += q;
    } else if (
      tx.type === 'OUT' ||
      tx.type === 'TRANSFER_TO_NG' ||
      tx.type === 'EXPORT_NG_RTV' ||
      tx.type === 'EXPORT_NG_SCRAP'
    ) {
      const sb = typeof tx.stockBefore === 'number' ? tx.stockBefore : Number(tx.stockBefore) || 0;
      if (runningStock < q && sb >= q) {
        runningStock = sb - q;
      } else {
        runningStock = Math.max(0, runningStock - q);
      }
    } else if (tx.type === 'AUDIT_ADJUSTMENT') {
      const isTransfer =
        (tx.reasonOrPurpose && /điều chuyển|chuyển/i.test(tx.reasonOrPurpose)) ||
        (tx.notes && /chuyển.*từ.*sang/i.test(tx.notes));
      if (!isTransfer && typeof tx.stockAfter === 'number' && tx.stockAfter >= 0) {
        runningStock = tx.stockAfter;
      }
    }
  }

  const pureLedgerStock = Math.max(0, Math.round((totalIn - totalOut) * 100) / 100);
  const runningRounded = Math.max(0, Math.round(runningStock * 100) / 100);
  const lastTx = history[history.length - 1];
  const lastStockAfter =
    lastTx && typeof lastTx.stockAfter === 'number' && lastTx.stockAfter > 0
      ? Math.round(lastTx.stockAfter * 100) / 100
      : 0;

  if (runningRounded > 0) return runningRounded;
  if (pureLedgerStock > 0) return pureLedgerStock;
  if (lastStockAfter > 0) return lastStockAfter;
  return 0;
}

// Helper for initial load
export const storageService = {
  // Settings
  getSettings(): AppSettings {
    const raw = safeGetRaw(SETTINGS_KEY);
    if (!raw) {
      return initialSettings;
    }
    try {
      const parsed = JSON.parse(raw);
      return {
        ...initialSettings,
        ...parsed,
        locations: Array.isArray(parsed.locations) && parsed.locations.length > 0 ? parsed.locations : initialSettings.locations,
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
    safeSetRaw(SETTINGS_KEY, JSON.stringify(settings));
    setLocalCacheData(STORAGE_KEYS.SETTINGS, settings, new Date().toISOString());
    pendingSettingsSnapshot = settings;
    scheduleDebouncedWriteFlush();
  },

  async flushWriteQueue(): Promise<void> {
    await flushWriteQueueToSupabase();
  },

  // Parts
  getParts(): Part[] {
    const raw = safeGetRaw(PARTS_KEY);
    if (!raw) {
      return [];
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  getPartById(id: string): Part | undefined {
    const parts = this.getParts();
    return parts.find((p) => p.id === id);
  },

  getPartByCode(code: string): Part | undefined {
    if (!code) return undefined;
    const parts = this.getParts();
    const clean = code.trim().toLowerCase();
    return parts.find((p) => p.code && p.code.trim().toLowerCase() === clean);
  },

  /**
   * Reconcile part currentStock and locations with chronological transaction ledger.
   * Ensures stock never diverges from the true bin card transactions history.
   * Sử dụng kết quả từ RAM TTL Cache (getBinCardHistory) và chỉ đọc các cột tinh gọn khi cần đồng bộ từ Cloud.
   */
  reconcilePartStock(partIdOrCode: string): Part | null {
    const part = this.getPartById(partIdOrCode) || this.getPartByCode(partIdOrCode);
    if (!part) return null;

    if (!hasLoadedFullReconcileLedger && Date.now() - lastReconcileCloudFetchAt > BIN_CARD_CACHE_TTL_MS) {
      lastReconcileCloudFetchAt = Date.now();
      supabaseRelationalStore
        .selectReconcileTransactions()
        .then((lightweightTxs) => {
          if (lightweightTxs && lightweightTxs.length > 0) {
            inMemoryTransactions = lightweightTxs;
            hasLoadedFullReconcileLedger = true;
            invalidateBinCardHistoryCache();
          }
        })
        .catch(() => {});
    }

    const history = this.getBinCardHistory(part.id);
    if (history.length === 0) return part;

    const trueStock = computeTrueStockFromHistory(part, history);
    const partWithTrueStock: Part = { ...part, currentStock: trueStock };
    const activeLocs = trueStock > 0 ? this.deriveLocationsFromTransactions(partWithTrueStock, history) : [];
    const newLocSummary = this.formatPartLocationSummary(activeLocs);

    const locationsChanged = JSON.stringify(part.locations || []) !== JSON.stringify(activeLocs);
    const stockChanged = part.currentStock !== trueStock;

    if (stockChanged || locationsChanged || (activeLocs.length > 0 && part.location !== newLocSummary)) {
      const updated = this.updatePart(part.id, {
        currentStock: trueStock,
        locations: activeLocs,
        location: newLocSummary,
      });
      return updated;
    }
    return part;
  },

  /**
   * Scan and reconcile all parts against the transaction ledger.
   * Restores accurate shelf locations (locations array and location summary)
   * for any parts that were imported without shelves or had desynchronized locations.
   * Chỉ đẩy các linh kiện thực sự có thay đổi vào hàng đợi gom lô (tối đa 150 bản ghi/lần).
   */
  reconcileAllPartsStock(): Part[] {
    const parts = this.getParts();
    if (parts.length === 0) return parts;

    // Nếu chưa nạp đầy đủ sổ cái tinh gọn vào RAM, nạp ngầm từ bảng transactions (chỉ select các cột cần thiết, cache 5 phút)
    if (!hasLoadedFullReconcileLedger && Date.now() - lastReconcileCloudFetchAt > BIN_CARD_CACHE_TTL_MS) {
      lastReconcileCloudFetchAt = Date.now();
      supabaseRelationalStore
        .selectReconcileTransactions()
        .then((lightweightTxs) => {
          if (lightweightTxs && lightweightTxs.length > 0) {
            inMemoryTransactions = lightweightTxs;
            hasLoadedFullReconcileLedger = true;
            invalidateBinCardHistoryCache();
          }
        })
        .catch(() => {});
    }

    const changedParts: Part[] = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const history = this.getBinCardHistory(p.id);

      if (history.length === 0) {
        const stock = typeof p.currentStock === 'number' ? p.currentStock : Number(p.currentStock) || 0;
        if (stock > 0) {
          const parsed = this.getPartLocations(p);
          if (parsed && parsed.length > 0) {
            const formatted = this.formatPartLocationSummary(parsed);
            if (JSON.stringify(p.locations || []) !== JSON.stringify(parsed) || p.location !== formatted) {
              const updatedP: Part = {
                ...p,
                locations: parsed,
                location: formatted,
                updatedAt: new Date().toISOString(),
              };
              parts[i] = updatedP;
              changedParts.push(updatedP);
            }
          }
        }
        continue;
      }

      // Если chưa tải xong toàn bộ sổ cái (chỉ có 1 phần), không bao giờ được ghi đè giảm tồn kho hay xóa kệ hiện có
      const computedStock = computeTrueStockFromHistory(p, history);
      const trueStock = hasLoadedFullReconcileLedger
        ? computedStock
        : Math.max(computedStock, typeof p.currentStock === 'number' ? p.currentStock : Number(p.currentStock) || 0);

      // Tạo bản sao linh kiện với trueStock đã khôi phục để deriveLocationsFromTransactions không bị chặn bởi p.currentStock cũ (= 0)
      const partWithTrueStock: Part = { ...p, currentStock: trueStock };

      // 1. Lấy phân bổ kệ từ sổ cái giao dịch (Thẻ kho)
      let activeLocs = trueStock > 0 ? this.deriveLocationsFromTransactions(partWithTrueStock, history) : [];

      // 2. Gom nhóm và đối soát bổ sung với dữ liệu kệ trong bảng linh kiện (p.locations & p.location)
      // để đảm bảo không bỏ sót bất kỳ kệ có hàng nào từ dữ liệu khởi tạo ban đầu
      if (trueStock > 0) {
        const existingValidLocs: PartLocationStock[] = [];
        if (Array.isArray(p.locations) && p.locations.length > 0) {
          for (const l of p.locations) {
            const cleanName = cleanWarehousePrefix((l.locationName || '').trim()) || (l.locationName || '').trim();
            const q = Math.max(0, Number(l.quantity) || 0);
            if (q > 0 && isRealShelfLocation(cleanName)) {
              existingValidLocs.push({ locationName: cleanName, quantity: q });
            }
          }
        }
        const parsedFromLocationStr = parseShelfLocationsFromString(p.location, trueStock);
        for (const pl of parsedFromLocationStr) {
          if (!existingValidLocs.some((el) => isLocationMatch(el.locationName, pl.locationName))) {
            existingValidLocs.push(pl);
          }
        }

        if (activeLocs.length === 0 && existingValidLocs.length > 0) {
          activeLocs = existingValidLocs;
        } else if (activeLocs.length > 0 && existingValidLocs.length > 0) {
          const derivedSum = activeLocs.reduce((s, item) => s + item.quantity, 0);
          if (derivedSum < trueStock) {
            let unallocated = trueStock - derivedSum;
            for (const ex of existingValidLocs) {
              if (unallocated <= 0) break;
              const alreadyInActive = activeLocs.find((a) => isLocationMatch(a.locationName, ex.locationName));
              if (!alreadyInActive) {
                const addQty = Math.min(ex.quantity, unallocated);
                if (addQty > 0) {
                  activeLocs.push({ locationName: ex.locationName, quantity: addQty });
                  unallocated -= addQty;
                }
              }
            }
          }
        }
      }

      const newSummary =
        activeLocs.length > 0
          ? this.formatPartLocationSummary(activeLocs)
          : trueStock > 0
          ? p.location && !p.location.toLowerCase().includes('chưa phân')
            ? p.location
            : 'Kho chính'
          : 'Chưa phân vị trí';

      const locsChanged = JSON.stringify(p.locations || []) !== JSON.stringify(activeLocs);
      const stockChanged = p.currentStock !== trueStock;

      if (stockChanged || locsChanged || (activeLocs.length > 0 && p.location !== newSummary)) {
        const updatedP: Part = {
          ...p,
          currentStock: trueStock,
          locations: activeLocs,
          location: newSummary,
          updatedAt: new Date().toISOString(),
        };
        parts[i] = updatedP;
        changedParts.push(updatedP);
      }
    }
    if (changedParts.length > 0) {
      this.saveParts(parts, changedParts);
    }
    return parts;
  },

  saveParts(parts: Part[], specificChangedParts?: Part[]): void {
    // Lưu bản snapshot tinh gọn cho LocalStorage ngay lập tức
    const compactParts = parts.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit || 'Cái',
      currentStock: typeof p.currentStock === 'number' ? p.currentStock : Number(p.currentStock) || 0,
      qtyNg: typeof p.qtyNg === 'number' ? p.qtyNg : Number(p.qtyNg) || 0,
      minStock: typeof p.minStock === 'number' ? p.minStock : Number(p.minStock) || 0,
      location: p.location || 'Kho chính',
      locations: p.locations || [],
      updatedAt: p.updatedAt,
    }));
    safeSetRaw(PARTS_KEY, JSON.stringify(compactParts));
    setLocalCacheData(STORAGE_KEYS.PARTS, parts, new Date().toISOString());

    // Đưa vào hàng đợi gom lô (Debounce 400ms, tối đa 150 bản ghi/lần gửi)
    pendingFullPartsKvSnapshot = parts;
    const recordsToQueue = specificChangedParts !== undefined ? specificChangedParts : parts;
    for (const p of recordsToQueue) {
      if (p && p.id) {
        pendingPartsDeleteQueue.delete(p.id);
        pendingPartsUpsertQueue.set(p.id, p);
      }
    }
    scheduleDebouncedWriteFlush();
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
    // Gom nhóm vào hàng đợi Debounce 400ms thay vì bắn insertPart lẻ tẻ
    this.saveParts(parts, [newPart]);
    return newPart;
  },

  updatePart(id: string, updatedData: Partial<Part>): Part {
    const parts = this.getParts();
    let index = parts.findIndex((p) => p.id === id);
    if (index === -1) {
      index = parts.findIndex((p) => p.code && p.code.trim().toLowerCase() === id.trim().toLowerCase());
    }
    if (index === -1) throw new Error('Không tìm thấy linh kiện');

    const updatedPart: Part = {
      ...parts[index],
      ...updatedData,
      updatedAt: new Date().toISOString(),
    };
    parts[index] = updatedPart;
    // Gom nhóm vào hàng đợi Debounce 400ms thay vì bắn updatePart lẻ tẻ
    this.saveParts(parts, [updatedPart]);
    return updatedPart;
  },

  deletePart(id: string): void {
    const allParts = this.getParts();
    const matchedToDelete = allParts.filter((p) => p.id === id || p.code === id);
    const remainingParts = allParts.filter((p) => p.id !== id && p.code !== id);

    for (const p of matchedToDelete) {
      pendingPartsUpsertQueue.delete(p.id);
      pendingPartsDeleteQueue.add(p.id);
    }
    if (matchedToDelete.length === 0 && id) {
      pendingPartsUpsertQueue.delete(id);
      pendingPartsDeleteQueue.add(id);
    }

    // Đưa vào hàng đợi Debounce 400ms
    this.saveParts(remainingParts, []);

    // Remove transactions for this part in memory & delete only matching rows in relational table
    const txs = this.getTransactions().filter((t) => t.partId !== id && t.partCode !== id);
    this.setTransactionsInMemory(txs);
    supabaseRelationalStore.deleteTransactionsByPart(id);
  },

  // Transactions (The Kho) - SOURCE OF TRUTH LÀ BẢNG RELATIONAL `transactions`, TUYỆT ĐỐI KHÔNG GHI TRÙNG LẶP VÀO KEY-VALUE
  getTransactions(): Transaction[] {
    // Trả về cache trong RAM nếu đã tải
    if (inMemoryTransactions.length > 0) {
      return inMemoryTransactions;
    }
    // Xóa triệt để key thekho_transactions_v1 nếu còn sót lại trong localStorage cũ
    try {
      localStorage.removeItem(TRANSACTIONS_KEY);
    } catch (_) {}
    return inMemoryTransactions;
  },

  setTransactionsInMemory(txs: Transaction[]): void {
    inMemoryTransactions = txs;
    invalidateBinCardHistoryCache();
    try {
      localStorage.removeItem(TRANSACTIONS_KEY);
    } catch (_) {}
  },

  /**
   * Lưu giao dịch vào RAM và CHỈ INSERT/UPSERT các bản ghi giao dịch MỚI phát sinh (`changedTxs`) vào bảng `transactions`.
   * - Chấm dứt hoàn toàn việc gọi `supabaseKeyStore.setCloudOnly(STORAGE_KEYS.TRANSACTIONS, txs)`.
   * - Chấm dứt hoàn toàn việc đẩy lại toàn bộ mảng `txs` cũ lên Supabase gây Write Amplification.
   */
  saveTransactions(txs: Transaction[], changedTxs?: Transaction[]): void {
    inMemoryTransactions = txs;
    invalidateBinCardHistoryCache();
    try {
      localStorage.removeItem(TRANSACTIONS_KEY);
    } catch (_) {}

    if (changedTxs && changedTxs.length > 0) {
      for (const tx of changedTxs) {
        if (tx.date && (!lastSyncedTransactionTimestamp || tx.date > lastSyncedTransactionTimestamp)) {
          lastSyncedTransactionTimestamp = tx.date;
        }
      }
      if (changedTxs.length === 1) {
        supabaseRelationalStore.insertTransaction(changedTxs[0]);
      } else {
        supabaseRelationalStore.upsertTransactions(changedTxs);
      }
    }
  },

  // --- KHO NG (HÀNG LỖI) HELPERS & BATCH PROCESSOR ---
  getNgParts(): Part[] {
    const parts = this.getParts();
    return parts.filter((p) => typeof p.qtyNg === 'number' && p.qtyNg > 0);
  },

  getNgTransactions(): Transaction[] {
    const txs = this.getTransactions();
    const ngTypes = ['TRANSFER_TO_NG', 'IMPORT_NG', 'EXPORT_NG_RTV', 'EXPORT_NG_SCRAP'];
    return txs
      .filter((t) => ngTypes.includes(t.type))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  async batchExecuteNgTransaction(params: {
    partsToUpdate: Part[];
    transactionsToInsert: Transaction[];
  }): Promise<{ success: boolean; message?: string }> {
    return batchExecuteNgTransaction(params);
  },

  // Get transactions for a specific part chronologically (ascending for bin card calculations)
  // Áp dụng bộ nhớ đệm RAM (TTL Cache 4 phút) để không quét/kéo lại toàn bộ transaction ledger khi vừa đọc gần đây
  getBinCardHistory(partIdOrCode: string): Transaction[] {
    if (!partIdOrCode) return [];
    const rawKey = partIdOrCode.trim().toLowerCase();
    const allTxs = this.getTransactions();
    const currentTxCount = allTxs.length;
    const currentFirstId = currentTxCount > 0 ? allTxs[0]?.id || '' : '';
    const currentLastId = currentTxCount > 0 ? allTxs[currentTxCount - 1]?.id || '' : '';
    const now = Date.now();

    // 1. Kiểm tra RAM TTL Cache (4 phút)
    const cachedByRaw = binCardHistoryRamCache.get(rawKey);
    if (
      cachedByRaw &&
      now - cachedByRaw.timestamp < BIN_CARD_CACHE_TTL_MS &&
      cachedByRaw.txCount === currentTxCount &&
      cachedByRaw.firstTxId === currentFirstId &&
      cachedByRaw.lastTxId === currentLastId
    ) {
      return cachedByRaw.data;
    }

    const part = this.getPartById(partIdOrCode) || this.getPartByCode(partIdOrCode);
    const targetIdClean = (part?.id || partIdOrCode)?.trim().toLowerCase();
    const targetCodeClean = (part?.code || partIdOrCode)?.trim().toLowerCase();
    const targetNameClean = part?.name?.trim().toLowerCase();

    if (targetIdClean && targetIdClean !== rawKey) {
      const cachedById = binCardHistoryRamCache.get(targetIdClean);
      if (
        cachedById &&
        now - cachedById.timestamp < BIN_CARD_CACHE_TTL_MS &&
        cachedById.txCount === currentTxCount &&
        cachedById.firstTxId === currentFirstId &&
        cachedById.lastTxId === currentLastId
      ) {
        return cachedById.data;
      }
    }

    const txs = allTxs.filter((t) => {
      const tPartIdClean = (t.partId || '').trim().toLowerCase();
      const tPartCodeClean = (t.partCode || '').trim().toLowerCase();
      const tPartNameClean = (t.partName || '').trim().toLowerCase();

      // Kiểm tra đồng thời cả partId, partCode và partName
      const matchId = Boolean(targetIdClean) && (tPartIdClean === targetIdClean || t.partId === partIdOrCode);
      const matchCode = Boolean(targetCodeClean) && (tPartCodeClean === targetCodeClean || tPartIdClean === targetCodeClean);
      const matchName = Boolean(targetNameClean) && tPartNameClean === targetNameClean;

      const isPartMatch = matchId || matchCode || matchName;
      if (!isPartMatch) return false;

      // Pure NG warehouse operations (manual/excel import directly to NG, RTV or Scrap) do NOT affect the Main Warehouse bin card
      // ONLY TRANSFER_TO_NG affects main warehouse stock!
      return (
        t.type !== 'IMPORT_NG' &&
        t.type !== 'EXPORT_NG_RTV' &&
        t.type !== 'EXPORT_NG_SCRAP'
      );
    });

    // Sort by date ascending
    const sorted = txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 2. Lưu kết quả vào RAM TTL Cache (4 phút) cho cả ID và Code của linh kiện
    const entry: BinCardCacheEntry = {
      data: sorted,
      timestamp: now,
      txCount: currentTxCount,
      firstTxId: currentFirstId,
      lastTxId: currentLastId,
    };
    binCardHistoryRamCache.set(rawKey, entry);
    if (targetIdClean) binCardHistoryRamCache.set(targetIdClean, entry);
    if (targetCodeClean) binCardHistoryRamCache.set(targetCodeClean, entry);

    return sorted;
  },

  /**
   * Derive accurate physical shelf stock breakdown directly from the transaction ledger.
   * This is the immutable source of truth for shelf distribution (as seen in Thẻ kho).
   */
  deriveLocationsFromTransactions(part: Part, txs?: Transaction[]): PartLocationStock[] {
    const history = txs || this.getBinCardHistory(part.id);
    const currentStock =
      typeof part.currentStock === 'number' && part.currentStock > 0
        ? part.currentStock
        : history && history.length > 0
        ? computeTrueStockFromHistory(part, history)
        : 0;
    if (currentStock <= 0) return [];
    if (!history || history.length === 0) return [];

    // Track stock per shelf in FIFO insertion order
    // Key: normalized shelf key, Value: { displayName: string, quantity: number }
    const shelfMap = new Map<string, { displayName: string; quantity: number }>();
    const allSeenRealShelves = new Map<string, string>(); // key -> displayName

    // Seed initial baseline stock (nếu linh kiện có tồn đầu kỳ trước khi phát sinh giao dịch đầu tiên)
    const firstTx = history[0];
    let initialBaseline = 0;
    if (firstTx) {
      const sb = typeof firstTx.stockBefore === 'number' ? firstTx.stockBefore : Number(firstTx.stockBefore) || 0;
      const sa = typeof firstTx.stockAfter === 'number' ? firstTx.stockAfter : Number(firstTx.stockAfter) || 0;
      const fq = typeof firstTx.quantity === 'number' ? firstTx.quantity : Number(firstTx.quantity) || 0;
      if (sb > 0) {
        initialBaseline = sb;
      } else if (firstTx.type === 'IN' && sa > fq) {
        initialBaseline = sa - fq;
      } else if ((firstTx.type === 'OUT' || firstTx.type === 'TRANSFER_TO_NG') && sa >= 0 && fq > 0) {
        initialBaseline = sa + fq;
      }
    }

    if (initialBaseline > 0) {
      const baselineShelves = parseShelfLocationsFromString(part.location, initialBaseline);
      if (baselineShelves.length > 0) {
        for (const bs of baselineShelves) {
          const key = normalizeShelfKey(bs.locationName) || bs.locationName.toLowerCase();
          shelfMap.set(key, { displayName: bs.locationName, quantity: bs.quantity });
          allSeenRealShelves.set(key, bs.locationName);
        }
      } else {
        shelfMap.set('__baseline_pool__', { displayName: 'Kho chính', quantity: initialBaseline });
      }
    }

    for (let i = 0; i < history.length; i++) {
      const tx = history[i];
      const qty = typeof tx.quantity === 'number' ? tx.quantity : Number(tx.quantity) || 0;
      if (qty <= 0) continue;

      const locRaw = (tx.locationId || '').trim();

      // Check if this is an audit adjustment representing a shelf transfer
      const isTransfer =
        tx.type === 'AUDIT_ADJUSTMENT' &&
        ((tx.reasonOrPurpose && /điều chuyển|chuyển/i.test(tx.reasonOrPurpose)) ||
         (tx.notes && /chuyển.*từ.*sang/i.test(tx.notes)));

      if (isTransfer) {
        const transferText = `${tx.reasonOrPurpose || ''} ${tx.notes || ''}`;
        const match = transferText.match(/(?:từ|vị trí:?)\s*([^\s➔\->]+)\s*(?:➔|->|sang)\s*([^\s\.\,]+)/i);
        if (match) {
          const fromLoc = cleanWarehousePrefix(match[1].trim()) || match[1].trim();
          const toLoc = cleanWarehousePrefix(match[2].trim()) || match[2].trim();
          if (fromLoc && toLoc) {
            const fromKey = normalizeShelfKey(fromLoc) || fromLoc.toLowerCase();
            const toKey = normalizeShelfKey(toLoc) || toLoc.toLowerCase();
            const fromExisting = shelfMap.get(fromKey);
            if (fromExisting) {
              fromExisting.quantity = Math.max(0, fromExisting.quantity - qty);
            }
            const toExisting = shelfMap.get(toKey);
            if (toExisting) {
              toExisting.quantity += qty;
            } else {
              shelfMap.set(toKey, { displayName: toLoc, quantity: qty });
            }
            if (isRealShelfLocation(toLoc)) {
              allSeenRealShelves.set(toKey, toLoc);
            }
            continue;
          }
        }
      }

      // Normal IN/OUT operations (support splitting by comma, semicolon, or slash)
      const segments = locRaw.includes(',')
        ? locRaw.split(',')
        : locRaw.includes(';')
        ? locRaw.split(';')
        : locRaw.includes(' / ')
        ? locRaw.split(' / ')
        : [locRaw];

      if (tx.type === 'IN') {
        let anyShelfAdded = false;
        for (const seg of segments) {
          const trimmed = seg.trim();
          if (!trimmed) continue;
          const match = trimmed.match(/^(.+?)\s*\(([\d\.\,\s]+)\)$/);
          let rawShelfName = trimmed;
          let shelfQty = segments.length > 1 ? Math.max(1, Math.round(qty / segments.length)) : qty;
          if (match) {
            rawShelfName = match[1].trim();
            shelfQty = parseFloat(match[2].replace(/\./g, '').replace(',', '.').trim()) || shelfQty;
          }
          const shelfName = cleanWarehousePrefix(rawShelfName) || rawShelfName;
          if (isRealShelfLocation(shelfName)) {
            anyShelfAdded = true;
            const key = normalizeShelfKey(shelfName) || shelfName.toLowerCase();
            allSeenRealShelves.set(key, shelfName);
            const existing = shelfMap.get(key);
            if (existing) {
              existing.quantity += shelfQty;
            } else {
              shelfMap.set(key, { displayName: shelfName, quantity: shelfQty });
            }
          }
        }

        // If locationId had no real shelf name, check if notes had shelf name (e.g. "Kệ X21")
        if (!anyShelfAdded) {
          const noteMatch = (tx.notes || '').match(/(?:kệ|vị trí|khoang)\s*([a-zA-Z0-9_\-]+)/i);
          if (noteMatch && isRealShelfLocation(noteMatch[1])) {
            const shelfName = cleanWarehousePrefix(noteMatch[1].trim()) || noteMatch[1].trim();
            const key = normalizeShelfKey(shelfName) || shelfName.toLowerCase();
            allSeenRealShelves.set(key, shelfName);
            const existing = shelfMap.get(key);
            if (existing) {
              existing.quantity += qty;
            } else {
              shelfMap.set(key, { displayName: shelfName, quantity: qty });
            }
            anyShelfAdded = true;
          }
        }

        // Nếu giao dịch IN chỉ ghi chung "Kho chính" / "2BVL", đưa vào pool chung để khi OUT trừ FIFO từ pool trước, không làm mất tồn trên kệ thật
        if (!anyShelfAdded) {
          const pool = shelfMap.get('__unassigned_pool__');
          if (pool) {
            pool.quantity += qty;
          } else {
            shelfMap.set('__unassigned_pool__', { displayName: 'Kho chính', quantity: qty });
          }
        }
      } else if (
        tx.type === 'OUT' ||
        tx.type === 'TRANSFER_TO_NG' ||
        tx.type === 'EXPORT_NG_RTV' ||
        tx.type === 'EXPORT_NG_SCRAP'
      ) {
        let remainingToDeduct = qty;

        // 1. If explicit shelves were recorded in locationId
        for (const seg of segments) {
          const trimmed = seg.trim();
          if (!trimmed) continue;
          const match = trimmed.match(/^(.+?)\s*\(([\d\.\,\s]+)\)$/);
          let rawShelfName = trimmed;
          let shelfDeductQty = remainingToDeduct;
          if (match) {
            rawShelfName = match[1].trim();
            shelfDeductQty = parseFloat(match[2].replace(/\./g, '').replace(',', '.').trim()) || remainingToDeduct;
          }
          const shelfName = cleanWarehousePrefix(rawShelfName) || rawShelfName;
          if (isRealShelfLocation(shelfName)) {
            const key = normalizeShelfKey(shelfName) || shelfName.toLowerCase();
            allSeenRealShelves.set(key, shelfName);
            const existing = shelfMap.get(key);
            if (existing && existing.quantity > 0) {
              const deduct = Math.min(existing.quantity, shelfDeductQty, remainingToDeduct);
              existing.quantity -= deduct;
              remainingToDeduct -= deduct;
            }
          }
        }

        // 2. If remaining to deduct > 0, deduct from unassigned/baseline pool FIRST before touching real shelves
        if (remainingToDeduct > 0) {
          for (const poolKey of ['__baseline_pool__', '__unassigned_pool__']) {
            const pool = shelfMap.get(poolKey);
            if (pool && pool.quantity > 0) {
              const deduct = Math.min(pool.quantity, remainingToDeduct);
              pool.quantity -= deduct;
              remainingToDeduct -= deduct;
              if (remainingToDeduct <= 0) break;
            }
          }
        }

        // 3. Finally deduct FIFO from positive real shelves
        if (remainingToDeduct > 0) {
          for (const val of shelfMap.values()) {
            if (val.quantity > 0 && isRealShelfLocation(val.displayName)) {
              const deduct = Math.min(val.quantity, remainingToDeduct);
              val.quantity -= deduct;
              remainingToDeduct -= deduct;
              if (remainingToDeduct <= 0) break;
            }
          }
        }
      }
    }

    // Filter positive shelf balances
    const activeShelves: PartLocationStock[] = [];
    for (const val of shelfMap.values()) {
      if (val.quantity > 0 && isRealShelfLocation(val.displayName)) {
        activeShelves.push({
          locationName: val.displayName,
          quantity: val.quantity,
        });
      }
    }

    // Nếu linh kiện vẫn còn tồn kho > 0 (ví dụ chỉ có giao dịch OUT xuất từ kệ gốc khởi tạo), khôi phục kệ gốc từ allSeenRealShelves
    if (activeShelves.length === 0 && currentStock > 0 && allSeenRealShelves.size > 0) {
      const seenList = Array.from(allSeenRealShelves.values());
      const perShelf = Math.max(1, Math.round(currentStock / seenList.length));
      let rem = currentStock;
      for (let idx = 0; idx < seenList.length; idx++) {
        const q = idx === seenList.length - 1 ? rem : Math.min(rem, perShelf);
        if (q > 0) {
          activeShelves.push({ locationName: seenList[idx], quantity: q });
          rem -= q;
        }
      }
    }

    if (activeShelves.length === 0) {
      return [];
    }

    // Align sum with currentStock if shelves hold more than current physical stock
    const derivedSum = activeShelves.reduce((acc, s) => acc + s.quantity, 0);
    if (derivedSum > currentStock) {
      let excess = derivedSum - currentStock;
      for (let j = activeShelves.length - 1; j >= 0; j--) {
        if (excess <= 0) break;
        const deduct = Math.min(activeShelves[j].quantity, excess);
        activeShelves[j].quantity -= deduct;
        excess -= deduct;
      }
    }

    return activeShelves.filter((s) => s.quantity > 0);
  },

  // Helper to get normalized location breakdown array for a part (only real shelves with stock > 0)
  getPartLocations(part: Part): PartLocationStock[] {
    const currentStock = typeof part.currentStock === 'number' ? part.currentStock : Number(part.currentStock) || 0;

    // If current stock is 0, no shelves hold inventory
    if (currentStock <= 0) {
      return [];
    }

    // 1. Collect valid shelves from part.locations
    const fromLocationsArr: PartLocationStock[] = [];
    if (Array.isArray(part.locations) && part.locations.length > 0) {
      for (const l of part.locations) {
        const cleanName = cleanWarehousePrefix((l.locationName || '').trim()) || (l.locationName || '').trim();
        const qty = Math.max(0, Number(l.quantity) || 0);
        if (qty > 0 && isRealShelfLocation(cleanName)) {
          fromLocationsArr.push({ locationName: cleanName, quantity: qty });
        }
      }
    }

    // 2. Collect shelves from Bin Card transaction ledger (if history is present in memory)
    const derived = this.deriveLocationsFromTransactions(part);

    // 3. Collect shelves parsed from part.location string
    const fromLocationStr = parseShelfLocationsFromString(part.location, currentStock);

    // Merge all sources so no valid occupied shelf is ever dropped
    const mergedMap = new Map<string, PartLocationStock>();
    const primaryList = derived.length > 0 ? derived : fromLocationsArr;

    for (const item of primaryList) {
      const key = normalizeShelfKey(item.locationName) || item.locationName.toLowerCase();
      const existing = mergedMap.get(key);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        mergedMap.set(key, { locationName: item.locationName, quantity: item.quantity });
      }
    }

    let currentSum = Array.from(mergedMap.values()).reduce((s, i) => s + i.quantity, 0);

    // If primary source sum is less than currentStock, supplement with remaining shelves from secondary sources
    if (currentSum < currentStock) {
      let unallocated = currentStock - currentSum;
      const secondaryCandidates = [...fromLocationsArr, ...fromLocationStr];
      for (const cand of secondaryCandidates) {
        if (unallocated <= 0) break;
        const key = normalizeShelfKey(cand.locationName) || cand.locationName.toLowerCase();
        if (!mergedMap.has(key)) {
          const addQty = Math.min(cand.quantity, unallocated);
          if (addQty > 0) {
            mergedMap.set(key, { locationName: cand.locationName, quantity: addQty });
            unallocated -= addQty;
          }
        }
      }
    }

    const finalResult = Array.from(mergedMap.values()).filter((r) => r.quantity > 0);
    if (finalResult.length > 0) {
      // Clamp if sum exceeds currentStock
      const totalAllocated = finalResult.reduce((s, r) => s + r.quantity, 0);
      if (totalAllocated > currentStock) {
        let excess = totalAllocated - currentStock;
        for (let j = finalResult.length - 1; j >= 0; j--) {
          if (excess <= 0) break;
          const deduct = Math.min(finalResult[j].quantity, excess);
          finalResult[j].quantity -= deduct;
          excess -= deduct;
        }
      }
      const validFinal = finalResult.filter((r) => r.quantity > 0);
      if (validFinal.length > 0) {
        part.locations = validFinal;
        return validFinal;
      }
    }

    return [];
  },

  getOldestFifoLocationSummary(part: Part): string {
    const currentStock = typeof part.currentStock === 'number' ? part.currentStock : Number(part.currentStock) || 0;
    if (currentStock <= 0) return 'Chưa phân vị trí';

    const fifoLots = this.getPartFifoLots(part.id);
    const activeLot = fifoLots.find((l) => l.remainingQty > 0 && isRealShelfLocation(l.locationName));
    if (activeLot) {
      return `${activeLot.locationName} (${activeLot.remainingQty.toLocaleString('vi-VN')})`;
    }

    const locs = this.getPartLocations(part);
    const validLocs = locs.filter((l) => l.quantity > 0 && isRealShelfLocation(l.locationName));
    if (validLocs.length > 0) {
      return `${validLocs[0].locationName} (${validLocs[0].quantity.toLocaleString('vi-VN')})`;
    }

    return 'Chưa phân vị trí';
  },

  formatPartLocationSummary(input: PartLocationStock[] | Part | undefined | null): string {
    if (!input) return 'Chưa phân vị trí';
    let locs: PartLocationStock[] = [];

    if (Array.isArray(input)) {
      locs = input;
    } else if (typeof input === 'object') {
      const p = input as Part;
      const currentStock = typeof p.currentStock === 'number' ? p.currentStock : Number(p.currentStock) || 0;
      if (currentStock <= 0) {
        return 'Chưa phân vị trí';
      }
      locs = this.getPartLocations(p);
    }

    if (!Array.isArray(locs)) return 'Chưa phân vị trí';
    // Only shelves with quantity > 0
    const active = locs.filter((l) => l && typeof l.quantity === 'number' && l.quantity > 0);
    if (active.length === 0) return 'Chưa phân vị trí';
    return active.map((l) => `${l.locationName} (${l.quantity.toLocaleString('vi-VN')})`).join(', ');
  },

  getPartStockAtLocation(part: Part, locationName: string): number {
    const locs = this.getPartLocations(part);
    let totalAtLoc = 0;
    for (const l of locs) {
      if (typeof l.quantity === 'number' && l.quantity > 0 && isLocationMatch(l.locationName, locationName)) {
        totalAtLoc += l.quantity;
      }
    }

    return totalAtLoc;
  },

  getPartsAtLocation(parts: Part[], locationName: string): { part: Part; locationQty: number }[] {
    const result: { part: Part; locationQty: number }[] = [];
    for (const part of parts) {
      const stock = typeof part.currentStock === 'number' ? part.currentStock : Number(part.currentStock) || 0;
      if (stock <= 0) continue;
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
    let part = this.getPartById(params.partId);
    if (!part) {
      const allParts = this.getParts();
      part = allParts.find((p) => p.id === params.partId || p.code === params.partId || p.code.toLowerCase() === params.partId.toLowerCase());
    }
    if (!part) throw new Error('Linh kiện không tồn tại');

    const stockBefore = part.currentStock;
    const stockAfter = stockBefore + params.quantity;

    let targetLocName = params.locationId?.trim() || '';
    if (!targetLocName && part.location) {
      const activeLocs = this.getPartLocations(part);
      targetLocName = activeLocs[0]?.locationName || 'Kho chính';
    }
    if (!targetLocName) targetLocName = 'Kho chính';
    targetLocName = targetLocName.replace(/\s*\([\d\.\,\s]+\)$/, '').trim();

    // Get current locations array using stockBefore and add stock to the specific location
    const locs = this.getPartLocations(part);
    const existingIndex = locs.findIndex(
      (l) => isLocationMatch(l.locationName, targetLocName)
    );

    if (existingIndex >= 0) {
      locs[existingIndex].quantity += params.quantity;
    } else {
      locs.push({ locationName: targetLocName, quantity: params.quantity });
    }

    const activeLocs = locs.filter((l) => l.quantity > 0);
    const newLocationSummary = this.formatPartLocationSummary(activeLocs);

    // Update part current stock & location breakdown
    this.updatePart(part.id, {
      currentStock: stockAfter,
      locations: activeLocs,
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
    this.saveTransactions(txs, [newTx]);

    return newTx;
  },

  async batchAddStockIn(items: Array<{
    partId: string;
    quantity: number;
    date: string;
    person: string;
    reasonOrPurpose?: string;
    notes?: string;
    locationId?: string;
  }>): Promise<Transaction[]> {
    const parts = this.getParts();
    const txs = this.getTransactions();
    const newTxs: Transaction[] = [];
    const partsMap = new Map<string, Part>();
    parts.forEach((p) => partsMap.set(p.id, { ...p, locations: p.locations ? [...p.locations] : [] }));

    for (const params of items) {
      const part = partsMap.get(params.partId);
      if (!part) continue;

      const stockBefore = part.currentStock;
      const stockAfter = stockBefore + params.quantity;

      let targetLocName = params.locationId?.trim() || '';
      if (!targetLocName && part.location) {
        const curActive = this.getPartLocations(part);
        targetLocName = curActive[0]?.locationName || 'Kho chính';
      }
      if (!targetLocName) targetLocName = 'Kho chính';
      targetLocName = targetLocName.replace(/\s*\([\d\.\,\s]+\)$/, '').trim();

      // Retrieve current locations using stockBefore
      const locs = this.getPartLocations(part);
      const existingIndex = locs.findIndex(
        (l) => isLocationMatch(l.locationName, targetLocName)
      );
      if (existingIndex >= 0) {
        locs[existingIndex].quantity += params.quantity;
      } else {
        locs.push({ locationName: targetLocName, quantity: params.quantity });
      }

      const activeLocs = locs.filter((l) => l.quantity > 0);
      part.currentStock = stockAfter;
      part.locations = activeLocs;
      part.location = this.formatPartLocationSummary(activeLocs);
      part.updatedAt = new Date().toISOString();

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
        reasonOrPurpose: params.reasonOrPurpose || 'Nhập kho Excel',
        notes: params.notes || '',
        locationId: targetLocName,
        stockBefore,
        stockAfter,
      };
      newTxs.push(newTx);
    }

    const updatedParts = Array.from(partsMap.values());
    this.saveParts(updatedParts);

    const allTxs = [...newTxs, ...txs];
    this.saveTransactions(allTxs, newTxs);

    return newTxs;
  },

  async batchAddStockOutFifo(
    items: Array<{
      partId: string;
      quantity: number;
      date: string;
      person: string;
      productionOrder?: string;
      reasonOrPurpose?: string;
      notes?: string;
      locationId?: string;
      voucherCode?: string;
      voucherTitle?: string;
      sourceBin?: string;
      fifoAllocations?: Array<{
        locationName: string;
        quantity: number;
        lotId?: string;
        contNumber?: string;
      }>;
    }>,
    voucherMeta?: { voucherCode: string; voucherTitle: string; person: string; dateTime: string }
  ): Promise<{ transactions: Transaction[]; voucher: BomExportVoucher }> {
    const parts = this.getParts();
    const txs = this.getTransactions();
    const queue = this.getKittingQueue();
    const vouchers = this.getBomExportVouchers();

    const newTxs: Transaction[] = [];
    const newQueueItems: KittingQueueItem[] = [];
    const partsMap = new Map<string, Part>();
    parts.forEach((p) => partsMap.set(p.id, { ...p, locations: p.locations ? [...p.locations] : [] }));

    const voucherCode = voucherMeta?.voucherCode || ('PXK-EXCEL-' + Date.now());
    const voucherTitle = voucherMeta?.voucherTitle || 'Xuất kho Excel FIFO';

    for (const params of items) {
      const part = partsMap.get(params.partId);
      if (!part) continue;
      if (params.quantity > part.currentStock) {
        throw new Error(
          `Số lượng xuất (${params.quantity} ${part.unit}) vượt quá tồn kho hiện tại (${part.currentStock} ${part.unit}) cho [${part.code}]!`
        );
      }

      const stockBefore = part.currentStock;
      const stockAfter = stockBefore - params.quantity;

      // Get current locations using stockBefore
      const locs = this.getPartLocations(part);
      let remainingToDeduct = params.quantity;
      const deductedLocations: Array<{ name: string; qty: number }> = [];

      // Clean target location
      const targetLoc = params.locationId
        ? params.locationId.replace(/\s*\([\d\.\,\s]+\)$/, '').trim()
        : '';

      if (targetLoc) {
        const existing = locs.find((l) => isLocationMatch(l.locationName, targetLoc) && l.quantity > 0);
        if (existing) {
          const deduct = Math.min(existing.quantity, remainingToDeduct);
          existing.quantity -= deduct;
          remainingToDeduct -= deduct;
          deductedLocations.push({ name: existing.locationName, qty: deduct });
        }
      }

      if (remainingToDeduct > 0) {
        for (const loc of locs) {
          if (loc.quantity > 0) {
            const deduct = Math.min(loc.quantity, remainingToDeduct);
            loc.quantity -= deduct;
            remainingToDeduct -= deduct;
            const existingDeducted = deductedLocations.find((d) => d.name === loc.locationName);
            if (existingDeducted) {
              existingDeducted.qty += deduct;
            } else {
              deductedLocations.push({ name: loc.locationName, qty: deduct });
            }
            if (remainingToDeduct <= 0) break;
          }
        }
      }

      // Filter only shelves with quantity > 0
      const activeLocs = locs.filter((l) => l.quantity > 0);
      part.currentStock = stockAfter;
      part.locations = activeLocs;
      part.location = this.formatPartLocationSummary(activeLocs);
      part.updatedAt = new Date().toISOString();

      // Clean location description for transaction: actual shelves deducted from
      const txLocation = deductedLocations.length > 0
        ? deductedLocations.map((d) => d.name).join(', ')
        : (targetLoc || 'Kho chính');

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
        reasonOrPurpose: params.reasonOrPurpose || 'Xuất sản xuất FIFO',
        notes: params.notes || '',
        locationId: txLocation,
        stockBefore,
        stockAfter,
      };
      newTxs.push(newTx);

      const newItem: KittingQueueItem = {
        id: 'kit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        transactionId: newTx.id,
        voucherCode: voucherCode,
        voucherTitle: voucherTitle,
        sourceBin: params.sourceBin || params.locationId || 'Kho chính',
        fifoAllocations: params.fifoAllocations,
        partCode: part.code,
        partName: part.name,
        unit: part.unit,
        rawQuantity: params.quantity,
        kittedQuantity: 0,
        scrapQuantity: 0,
        bufferLocation: 'BUFFER-A1-01',
        status: 'PENDING_KITTING',
        createdAt: new Date().toISOString(),
        operatorName: params.person,
      };
      newQueueItems.push(newItem);
    }

    const updatedParts = Array.from(partsMap.values());
    this.saveParts(updatedParts);

    const allTxs = [...newTxs, ...txs];
    this.saveTransactions(allTxs, newTxs);

    const updatedQueue = [...newQueueItems, ...queue];
    this.saveKittingQueue(updatedQueue);

    const newVoucher: BomExportVoucher = {
      id: 'vch-' + Date.now(),
      voucherCode,
      modelName: voucherTitle,
      modelQty: 1,
      dateTime: voucherMeta?.dateTime || new Date().toISOString(),
      person: voucherMeta?.person || 'Thủ kho',
      notes: 'Xuất kho FIFO qua file Excel',
      totalPartsCount: newTxs.length,
      totalQtyOut: newTxs.reduce((sum, t) => sum + t.quantity, 0),
      voucherType: 'EXCEL',
      status: 'ACTIVE',
      items: newTxs.map((t) => ({
        partCode: t.partCode,
        partName: t.partName,
        unit: t.unit,
        bomQtyPerSet: t.quantity,
        totalQtyOut: t.quantity,
        fifoLocation: t.locationId || 'Kho chính',
      })),
      createdAt: new Date().toISOString(),
    };
    vouchers.unshift(newVoucher);
    localStorage.setItem(BOM_VOUCHERS_KEY, JSON.stringify(vouchers));
    supabaseKeyStore.set(STORAGE_KEYS.BOM_VOUCHERS, vouchers);

    return { transactions: newTxs, voucher: newVoucher };
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
    voucherCode?: string;
    voucherTitle?: string;
    sourceBin?: string;
    fifoAllocations?: Array<{
      locationName: string;
      quantity: number;
      lotId?: string;
      contNumber?: string;
    }>;
  }): Transaction {
    const part = this.getPartById(params.partId) || this.getPartByCode(params.partId);
    if (!part) throw new Error('Linh kiện không tồn tại');

    if (params.quantity > part.currentStock) {
      throw new Error(`Số lượng xuất (${params.quantity} ${part.unit}) vượt quá số lượng tồn hiện tại trong kho (${part.currentStock} ${part.unit})!`);
    }

    const stockBefore = part.currentStock;
    const stockAfter = stockBefore - params.quantity;

    // Deduct stock from specific location or sequentially
    const locs = this.getPartLocations(part);
    let remainingToDeduct = params.quantity;
    const deductedLocations: Array<{ name: string; qty: number }> = [];

    const targetLoc = params.locationId
      ? params.locationId.replace(/\s*\([\d\.\,\s]+\)$/, '').trim()
      : '';

    if (targetLoc) {
      const existing = locs.find((l) => isLocationMatch(l.locationName, targetLoc) && l.quantity > 0);
      if (existing) {
        const deduct = Math.min(existing.quantity, remainingToDeduct);
        existing.quantity -= deduct;
        remainingToDeduct -= deduct;
        deductedLocations.push({ name: existing.locationName, qty: deduct });
      }
    }

    if (remainingToDeduct > 0) {
      for (const loc of locs) {
        if (loc.quantity > 0) {
          const deduct = Math.min(loc.quantity, remainingToDeduct);
          loc.quantity -= deduct;
          remainingToDeduct -= deduct;
          const existingDeducted = deductedLocations.find((d) => d.name === loc.locationName);
          if (existingDeducted) {
            existingDeducted.qty += deduct;
          } else {
            deductedLocations.push({ name: loc.locationName, qty: deduct });
          }
          if (remainingToDeduct <= 0) break;
        }
      }
    }

    const activeLocs = locs.filter((l) => l.quantity > 0);
    const newLocationSummary = this.formatPartLocationSummary(activeLocs);

    // Update part current stock & location breakdown
    this.updatePart(part.id, {
      currentStock: stockAfter,
      locations: activeLocs,
      location: newLocationSummary,
    });

    const txLocation = deductedLocations.length > 0
      ? deductedLocations.map((d) => d.name).join(', ')
      : (targetLoc || 'Kho chính');

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
      voucherCode: params.voucherCode || undefined,
      reasonOrPurpose: params.reasonOrPurpose || 'Xuất sản xuất',
      notes: params.notes || '',
      locationId: txLocation,
      stockBefore,
      stockAfter,
    };

    const txs = this.getTransactions();
    txs.push(newTx);
    this.saveTransactions(txs, [newTx]);

    // Automatically trigger Kitting Queue item for pre-assembly processing!
    try {
      this.addKittingQueueItemFromStockOut(newTx, {
        voucherCode: params.voucherCode,
        voucherTitle: params.voucherTitle,
        sourceBin: params.sourceBin || txLocation,
        fifoAllocations: params.fifoAllocations,
      });
    } catch {
      // Ignore fallback
    }

    return newTx;
  },

  // Perform fast batched stock exports (used by BOM export to prevent browser freezing and network saturation)
  executeBatchStockOut(params: {
    items: Array<{
      partId: string;
      quantity: number;
      importedQuantity?: number;
      date?: string;
      person?: string;
      productionOrder?: string;
      reasonOrPurpose?: string;
      notes?: string;
      locationId?: string;
      voucherCode?: string;
      voucherTitle?: string;
      sourceBin?: string;
      fifoAllocations?: Array<{
        locationName: string;
        quantity: number;
        lotId?: string;
        contNumber?: string;
      }>;
    }>;
  }): { transactions: Transaction[]; updatedParts: Part[] } {
    const parts = this.getParts();
    const txs = this.getTransactions();
    const queue = this.getKittingQueue();
    const buffers = this.getBufferLocations();

    const createdTxs: Transaction[] = [];
    const affectedPartsMap = new Map<string, Part>();

    for (const item of params.items) {
      if (item.quantity <= 0) continue;
      const partIdx = parts.findIndex((p) => p.id === item.partId || p.code === item.partId);
      if (partIdx === -1) continue;
      const part = parts[partIdx];

      const stockBefore = part.currentStock;
      const stockAfter = Math.max(0, stockBefore - item.quantity);

      const locs = this.getPartLocations(part);
      let remainingToDeduct = item.quantity;
      const deductedLocations: Array<{ name: string; qty: number }> = [];

      const targetLoc = item.locationId
        ? item.locationId.replace(/\s*\([\d\.\,\s]+\)$/, '').trim()
        : '';

      if (targetLoc) {
        const existing = locs.find((l) => isLocationMatch(l.locationName, targetLoc) && l.quantity > 0);
        if (existing) {
          const deduct = Math.min(existing.quantity, remainingToDeduct);
          existing.quantity -= deduct;
          remainingToDeduct -= deduct;
          deductedLocations.push({ name: existing.locationName, qty: deduct });
        }
      }

      if (remainingToDeduct > 0) {
        for (const loc of locs) {
          if (loc.quantity > 0) {
            const deduct = Math.min(loc.quantity, remainingToDeduct);
            loc.quantity -= deduct;
            remainingToDeduct -= deduct;
            const existingDeducted = deductedLocations.find((d) => d.name === loc.locationName);
            if (existingDeducted) {
              existingDeducted.qty += deduct;
            } else {
              deductedLocations.push({ name: loc.locationName, qty: deduct });
            }
            if (remainingToDeduct <= 0) break;
          }
        }
      }

      const activeLocs = locs.filter((l) => l.quantity > 0);
      const newLocSummary = this.formatPartLocationSummary(activeLocs);

      part.currentStock = stockAfter;
      part.locations = activeLocs;
      part.location = newLocSummary;
      part.updatedAt = new Date().toISOString();
      affectedPartsMap.set(part.id, part);

      const txLocation = deductedLocations.length > 0
        ? deductedLocations.map((d) => d.name).join(', ')
        : (targetLoc || 'Kho chính');

      const newTx: Transaction = {
        id: 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        partId: part.id,
        partCode: part.code,
        partName: part.name,
        unit: part.unit,
        type: 'OUT',
        quantity: item.quantity,
        date: item.date || new Date().toISOString(),
        person: item.person || 'Thủ kho',
        productionOrder: item.productionOrder || '',
        voucherCode: item.voucherCode || undefined,
        reasonOrPurpose: item.reasonOrPurpose || 'Xuất sản xuất',
        notes: item.notes || '',
        locationId: txLocation,
        stockBefore,
        stockAfter,
      };

      createdTxs.push(newTx);
      txs.push(newTx);

      // Kitting Queue in-memory update
      const cleanVoucherCode = (item.voucherCode || 'PHIẾU_XUẤT_LẺ').trim();
      const cleanVoucherTitle = (item.voucherTitle || '').trim().toLowerCase();
      const existingPending = queue.find(
        (q) =>
          q.status === 'PENDING_KITTING' &&
          (q.voucherCode || 'PHIẾU_XUẤT_LẺ').trim().toLowerCase() === cleanVoucherCode.toLowerCase() &&
          (q.voucherTitle || '').trim().toLowerCase() === cleanVoucherTitle &&
          q.partCode.trim().toLowerCase() === newTx.partCode.trim().toLowerCase()
      );

      if (existingPending) {
        existingPending.rawQuantity += newTx.quantity;
        if (!existingPending.allItemIds) {
          existingPending.allItemIds = [existingPending.id];
        }
        existingPending.batchCount = (existingPending.batchCount || 1) + 1;
        if (newTx.id) {
          if (!existingPending.transactionIds) {
            existingPending.transactionIds = existingPending.transactionId ? [existingPending.transactionId] : [];
          }
          if (!existingPending.transactionIds.includes(newTx.id)) {
            existingPending.transactionIds.push(newTx.id);
          }
        }
      } else {
        const existingBuf = buffers.find((b) => b.partCode === newTx.partCode && b.status !== 'EMPTY');
        const emptyBuf = buffers.find((b) => b.status === 'EMPTY');
        const defaultBuffer = existingBuf ? existingBuf.locationId : (emptyBuf ? emptyBuf.locationId : 'BUFFER-A1-01');

        queue.push({
          id: 'kit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          transactionId: newTx.id,
          transactionIds: [newTx.id],
          voucherCode: item.voucherCode,
          voucherTitle: item.voucherTitle,
          sourceBin: item.sourceBin || txLocation,
          fifoAllocations: item.fifoAllocations,
          partCode: newTx.partCode,
          partName: newTx.partName,
          unit: newTx.unit,
          rawQuantity: newTx.quantity,
          kittedQuantity: 0,
          scrapQuantity: 0,
          bufferLocation: defaultBuffer,
          status: 'PENDING_KITTING',
          createdAt: newTx.date,
          operatorName: newTx.person || 'Thủ kho',
        });
      }
    }

    // 1 single atomic save to disk & memory (chỉ đẩy đúng các linh kiện và giao dịch mới phát sinh)
    const affectedPartsList = Array.from(affectedPartsMap.values());
    this.saveParts(parts, affectedPartsList);
    this.saveTransactions(txs, createdTxs);
    this.saveKittingQueue(queue);

    return { transactions: createdTxs, updatedParts: affectedPartsList };
  },

  // Transfer part stock between warehouse locations
  transferPartLocationStock(params: {
    partId: string;
    fromLocation: string;
    toLocation: string;
    quantity: number;
    person: string;
    notes?: string;
  }): { updatedPart: Part; transaction: Transaction } {
    const part = this.getPartById(params.partId);
    if (!part) throw new Error('Linh kiện không tồn tại trong hệ thống');

    const fromLoc = params.fromLocation.trim();
    const toLoc = params.toLocation.trim();

    if (!fromLoc || !toLoc) {
      throw new Error('Vui lòng chọn đầy đủ vị trí xuất phát và vị trí tiếp nhận');
    }

    if (fromLoc.toLowerCase() === toLoc.toLowerCase()) {
      throw new Error('Vị trí tiếp nhận phải khác vị trí xuất phát');
    }

    if (params.quantity <= 0) {
      throw new Error('Số lượng điều chuyển phải lớn hơn 0');
    }

    const locs = this.getPartLocations(part);
    const fromIndex = locs.findIndex(
      (l) => isLocationMatch(l.locationName, fromLoc)
    );

    const availableInFrom = fromIndex >= 0 ? locs[fromIndex].quantity : 0;
    if (availableInFrom < params.quantity) {
      throw new Error(
        `Số lượng điều chuyển (${params.quantity.toLocaleString('vi-VN')} ${part.unit}) vượt quá số lượng hiện có tại vị trí "${fromLoc}" (${availableInFrom.toLocaleString('vi-VN')} ${part.unit})!`
      );
    }

    // Deduct from fromLocation
    locs[fromIndex].quantity -= params.quantity;

    // Add to toLocation
    const toIndex = locs.findIndex(
      (l) => isLocationMatch(l.locationName, toLoc)
    );
    if (toIndex >= 0) {
      locs[toIndex].quantity += params.quantity;
    } else {
      locs.push({ locationName: toLoc, quantity: params.quantity });
    }

    // Keep locations with non-zero only
    const activeLocs = locs.filter((l) => l.quantity > 0);
    const newLocationSummary = this.formatPartLocationSummary(activeLocs);

    const updatedPart = this.updatePart(part.id, {
      locations: activeLocs,
      location: newLocationSummary,
    });

    // Record an adjustment transaction for audit & bin card tracking
    const newTx: Transaction = {
      id: 'tx-trans-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      partId: part.id,
      partCode: part.code,
      partName: part.name,
      unit: part.unit,
      type: 'AUDIT_ADJUSTMENT',
      quantity: params.quantity,
      date: new Date().toISOString(),
      person: params.person || 'Thủ kho',
      reasonOrPurpose: `Điều chuyển vị trí: ${fromLoc} ➔ ${toLoc}`,
      notes: params.notes || `Chuyển ${params.quantity.toLocaleString('vi-VN')} ${part.unit} từ ${fromLoc} sang ${toLoc}`,
      locationId: toLoc,
      stockBefore: part.currentStock,
      stockAfter: part.currentStock,
    };

    const txs = this.getTransactions();
    txs.push(newTx);
    this.saveTransactions(txs, [newTx]);

    return { updatedPart, transaction: newTx };
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
      this.saveTransactions(txs, [adjustmentTx]);
    }

    return { checkRecord, adjustmentTx };
  },

  getStockCheckRecords(): StockCheckRecord[] {
    const raw = safeGetRaw(STOCK_CHECKS_KEY);
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
        // Update existing part stock & info while preserving existing physical shelf breakdown
        const existing = existingParts[existingIndex];
        const hasExistingShelves = Array.isArray(existing.locations) && existing.locations.length > 0;
        existingParts[existingIndex] = {
          ...existing,
          code: itemCode,
          name: itemName,
          description: desc || existing.description,
          location: hasExistingShelves ? existing.location : (locationStr || existing.location),
          locations: existing.locations,
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
      const isTransferNg = t.type === 'TRANSFER_TO_NG';

      return {
        'Ngày tháng': dateFormatted,
        'Diễn giải / Nội dung': isTransferNg ? `[Chuyển Kho NG] ${t.reasonOrPurpose || t.notes || ''}` : (t.reasonOrPurpose || (t.type === 'IN' ? 'Nhập kho' : 'Xuất kho')),
        'Nhập': t.type === 'IN' ? t.quantity : '',
        'Xuất': (t.type === 'OUT' || isTransferNg) ? t.quantity : '',
        'Tồn cuối': t.stockAfter,
        'Kệ / Vị trí': (t.locationId || '').replace(/\s*\([\d\.\,\s]+\)$/, '').trim() + (isTransferNg ? ' (Xuất NG)' : ''),
        'Người thực hiện': t.person || '',
        'Lệnh sản xuất': t.productionOrder || (isTransferNg ? 'KHO-NG' : ''),
        'Ghi chú': t.notes || '',
      };
    });

    // Create sheet with title AOA first
    const activeLocs = this.getPartLocations(part);
    const locSummary = activeLocs.map((l) => `${l.locationName} (${l.quantity.toLocaleString('vi-VN')})`).join(', ') || 'Chưa phân vị trí';

    const ws = XLSX.utils.aoa_to_sheet([
      [settings.companyName.toUpperCase()],
      [settings.warehouseName],
      ['THẺ KHO ĐIỆN TỬ'],
      [`Mã linh kiện: ${part.code} | Tên: ${part.name}`],
      [`Vị trí trên kệ: ${locSummary} | Đơn vị: ${part.unit} | Tồn hiện tại: ${part.currentStock}`],
      [],
    ]);

    // Append json data starting at A7
    XLSX.utils.sheet_add_json(ws, binCardData, { origin: 'A7' });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Thẻ Kho');
    XLSX.writeFile(wb, cleanFileName);
  },

  exportBinCardHistoryToExcel(transactions: Transaction[], fileName = 'nhat_ky_the_kho_dien_tu.xlsx'): void {
    // Filter out pure NG internal transactions
    const mainTxs = transactions.filter(
      (t) => t.type !== 'IMPORT_NG' && t.type !== 'EXPORT_NG_RTV' && t.type !== 'EXPORT_NG_SCRAP'
    );

    const excelData = mainTxs.map((t, idx) => {
      const isTransferNg = t.type === 'TRANSFER_TO_NG';
      return {
        'STT': idx + 1,
        'Thời Gian': new Date(t.date).toLocaleString('vi-VN'),
        'Loại': t.type === 'IN' ? 'NHẬP KHO' : isTransferNg ? 'CHUYỂN KHO NG' : t.type === 'OUT' ? 'XUẤT KHO' : 'KIỂM KÊ',
        'Mã Linh Kiện': t.partCode,
        'Tên Linh Kiện': t.partName,
        'Số Lượng Nhập (+)': t.type === 'IN' ? t.quantity : '',
        'Số Lượng Xuất (-)': (t.type === 'OUT' || isTransferNg) ? t.quantity : '',
        'Tồn Sau Giao Dịch': t.stockAfter,
        'Đơn Vị': t.unit,
        'Kệ / Vị Trí': (t.locationId || '').replace(/\s*\([\d\.\,\s]+\)$/, '').trim() + (isTransferNg ? ' (Xuất NG)' : ''),
        'Người Thực Hiện': t.person || '',
        'Lệnh Sản Xuất': t.productionOrder || (isTransferNg ? 'KHO-NG' : ''),
        'Diễn Giải / Mục Đích': isTransferNg ? `[Chuyển Kho NG] ${t.reasonOrPurpose || ''}` : (t.reasonOrPurpose || ''),
        'Ghi Chú': t.notes || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nhật Ký Thẻ Kho');
    XLSX.writeFile(wb, fileName);
  },

  // Container Batches (History of QR codes generated from Excel)
  getContainerBatches(): ContainerBatch[] {
    const raw = safeGetRaw(CONTAINER_BATCHES_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  saveContainerBatches(batches: ContainerBatch[]): void {
    safeSetRaw(CONTAINER_BATCHES_KEY, JSON.stringify(batches));
    supabaseKeyStore.set(STORAGE_KEYS.CONTAINER_BATCHES, batches);
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
    this.saveContainerBatches(batches);
  },

  deleteContainerBatch(id: string): void {
    const batches = this.getContainerBatches().filter((b) => b.id !== id);
    this.saveContainerBatches(batches);
  },

  // Model BOMs
  getModelBOMs(): ModelBOM[] {
    const raw = safeGetRaw(MODEL_BOMS_KEY);
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
    safeSetRaw(MODEL_BOMS_KEY, JSON.stringify(boms));
    supabaseKeyStore.set(STORAGE_KEYS.MODEL_BOMS, boms);
  },

  deleteModelBOM(id: string): void {
    const boms = this.getModelBOMs().filter(b => b.id !== id);
    safeSetRaw(MODEL_BOMS_KEY, JSON.stringify(boms));
    supabaseKeyStore.set(STORAGE_KEYS.MODEL_BOMS, boms);
  },

  importModelBOMFromRows(rawRows: any[], modelName: string, allowedPartCodes?: string[]): { added: number; name: string; skippedUnmatched?: number } {
    const items: ModelBOMItem[] = [];
    const allowedSet: Set<string> | null =
      allowedPartCodes && allowedPartCodes.length > 0
        ? new Set(allowedPartCodes.map((code) => code.trim().toLowerCase()))
        : new Set(this.getParts().map((p) => p.code.trim().toLowerCase()));

    let skippedUnmatched = 0;

    rawRows.forEach((row, idx) => {
      let itemCode = '';
      let itemName = '';
      let quantityVal: any = 0;
      let unit = '';

      if (Array.isArray(row)) {
        // Factory layout: [lvl, Item, Description, (empty), Tồn kho, Quantity, ĐVT]
        if (row.length >= 6) {
          // Check if index 1 is Item code
          const colB = String(row[1] ?? '').trim();
          const colC = String(row[2] ?? '').trim();
          const colF = row[5];
          const colG = String(row[6] ?? '').trim();

          if (colB && colB.toLowerCase() !== 'item' && !colB.toLowerCase().includes('mã')) {
            itemCode = colB;
            itemName = colC || colB;
            quantityVal = colF;
            unit = colG;
          } else {
            itemCode = String(row[0] ?? '').trim();
            itemName = String(row[1] ?? '').trim();
            quantityVal = row[2];
            unit = String(row[3] ?? '').trim();
          }
        } else if (row.length >= 3) {
          itemCode = String(row[0] ?? '').trim();
          itemName = String(row[1] ?? '').trim();
          quantityVal = row[2];
          unit = String(row[3] ?? '').trim();
        }
      } else if (typeof row === 'object' && row !== null) {
        itemCode = String(row['Item'] || row['item'] || row['Mã linh kiện'] || row['Mã VT'] || row['Code'] || '').trim();
        itemName = String(row['Description'] || row['description'] || row['Tên linh kiện'] || row['Tên VT'] || row['Name'] || '').trim();
        quantityVal = row['Quantity'] ?? row['quantity'] ?? row['Số lượng'] ?? row['Định mức'] ?? 0;
        unit = String(row['ĐVT'] || row['đvt'] || row['Unit'] || row['unit'] || row['Đơn vị'] || '').trim();
      }

      if (!itemCode) return;
      const lowerCode = itemCode.toLowerCase();
      if (lowerCode === 'item' || lowerCode === 'mã linh kiện' || lowerCode.includes('tổng') || lowerCode.includes('cộng') || lowerCode === 'lvl') return;

      // Filter: Only accept part if it exists in system's parts list
      if (allowedSet && !allowedSet.has(lowerCode)) {
        skippedUnmatched++;
        return;
      }

      let quantity = 0;
      if (typeof quantityVal === 'number') {
        quantity = isNaN(quantityVal) ? 0 : quantityVal;
      } else {
        let s = String(quantityVal || '').trim();
        if (s.includes('.') && s.includes(',')) {
          if (s.indexOf('.') < s.indexOf(',')) {
            s = s.replace(/\./g, '').replace(',', '.');
          } else {
            s = s.replace(/,/g, '');
          }
        } else if (s.includes(',')) {
          s = s.replace(',', '.');
        }
        quantity = parseFloat(s) || 0;
      }

      // Add item to BOM (allow 0 or positive định mức)
      items.push({
        partCode: itemCode,
        partName: itemName || itemCode,
        quantity: Math.max(0, quantity),
        unit: unit || 'Cái'
      });
    });

    if (items.length > 0) {
      const bom: ModelBOM = {
        id: 'bom-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        name: modelName || `Model-${Date.now().toString().substring(6)}`,
        items,
        createdAt: new Date().toISOString()
      };
      this.saveModelBOM(bom);
      return { added: items.length, name: bom.name, skippedUnmatched };
    }
    return { added: 0, name: modelName, skippedUnmatched };
  },

  // Used QR Tokens (To prevent scanning the same Cont QR tag twice)
  getUsedQrTokens(): Record<string, { scannedAt: string; scannedBy?: string; partCode: string; quantity: number; importedQuantity?: number; contNumber: string }> {
    const raw = safeGetRaw(USED_QR_TOKENS_KEY);
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

  saveUsedQrTokens(tokens: Record<string, any>): void {
    safeSetRaw(USED_QR_TOKENS_KEY, JSON.stringify(tokens));
    supabaseKeyStore.set(STORAGE_KEYS.USED_QR_TOKENS, tokens);
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
    let extractedTagId = '';
    if (tokenOrPayload.includes('|')) {
      const parts = tokenOrPayload.split('|');
      if (parts[4]) {
        extractedTagId = parts[4].trim();
        tokens[extractedTagId] = info; // Mark tagId
      }
    }

    this.saveUsedQrTokens(tokens);

    // Update container batches state and sync directly to Supabase thekho_container_batches_v1
    const batches = this.getContainerBatches();
    let batchesModified = false;
    const lookupTagId = extractedTagId || tokenOrPayload.trim();
    const cleanContNumber = (details.contNumber || '').trim().toLowerCase();
    const cleanPartCode = (details.partCode || '').trim().toLowerCase();

    for (const batch of batches) {
      for (const item of batch.items) {
        const isMatch =
          (lookupTagId && (item.id === lookupTagId || item.id?.trim() === lookupTagId)) ||
          (tokenOrPayload && (item.qrPayload === tokenOrPayload || item.id === tokenOrPayload)) ||
          (cleanContNumber && cleanPartCode &&
           item.contNumber?.trim().toLowerCase() === cleanContNumber &&
           item.partCode?.trim().toLowerCase() === cleanPartCode);

        if (isMatch) {
          const newImported = details.importedQuantity !== undefined ? details.importedQuantity : details.quantity;
          item.importedQuantity = newImported;
          item.isUsed = newImported >= (item.quantity || details.quantity);
          item.scannedAt = nowStr;
          item.scannedBy = details.person || 'Thủ kho';
          batchesModified = true;
        }
      }
    }

    if (batchesModified) {
      this.saveContainerBatches(batches);
    }
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
    const part = this.getPartById(partId) || this.getPartByCode(partId);
    if (!part) return [];

    const txs = this.getBinCardHistory(part.id);
    const inTxs = txs.filter((t) => t.type === 'IN').sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const outTxs = txs.filter((t) => t.type === 'OUT' || t.type === 'TRANSFER_TO_NG' || t.type === 'EXPORT_NG_RTV' || t.type === 'EXPORT_NG_SCRAP');

    const totalInQty = inTxs.reduce((sum, t) => sum + t.quantity, 0);
    const totalOutQty = outTxs.reduce((sum, t) => sum + t.quantity, 0);

    const defaultPartLoc = (Array.isArray(part.locations) && part.locations[0]?.locationName) || cleanWarehousePrefix(part.location?.split(',')[0]?.split('(')[0]?.trim()) || 'Kho chính';

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
    const initialBaselineQty = Math.max(0, part.currentStock + totalOutQty - totalInQty);
    if (initialBaselineQty > 0 && totalInQty === 0) {
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

      const rawLoc = tx.locationId?.trim() || defaultPartLoc;
      const txLoc = cleanWarehousePrefix(rawLoc) || rawLoc;

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

  // --- 35-DAY RETENTION POLICY & HISTORY PRUNING ---
  pruneHistoryOlderThan35Days(maxDays: number = 35): { prunedKitting: number; prunedCalls: number } {
    const cutoffTime = Date.now() - maxDays * 24 * 60 * 60 * 1000;
    let prunedKitting = 0;
    let prunedCalls = 0;

    // 1. Prune completed Kitting records older than maxDays
    const rawKitting = safeGetRaw(KITTING_QUEUE_KEY);
    if (rawKitting) {
      try {
        const kQueue: KittingQueueItem[] = JSON.parse(rawKitting);
        const filteredQueue = kQueue.filter((item) => {
          const isCompleted = item.status === 'IN_BUFFER' || item.status === 'DELIVERED';
          if (!isCompleted) return true; // keep pending items
          const itemTime = new Date(item.endTime || item.createdAt).getTime();
          if (itemTime < cutoffTime) {
            prunedKitting++;
            return false;
          }
          return true;
        });
        if (prunedKitting > 0) {
          safeSetRaw(KITTING_QUEUE_KEY, JSON.stringify(filteredQueue));
          supabaseKeyStore.set(STORAGE_KEYS.KITTING_QUEUE, filteredQueue);
        }
      } catch {
        // Fallback
      }
    }

    // 2. Prune completed Material Call (Andon) records older than maxDays
    const rawCalls = safeGetRaw(MATERIAL_CALLS_KEY);
    if (rawCalls) {
      try {
        const calls: MaterialCallRequest[] = JSON.parse(rawCalls);
        const filteredCalls = calls.filter((item) => {
          const isCompleted = item.status === 'COMPLETED';
          if (!isCompleted) return true; // keep active calling/delivering
          const itemTime = new Date(item.deliveredAt || item.requestedAt).getTime();
          if (itemTime < cutoffTime) {
            prunedCalls++;
            return false;
          }
          return true;
        });
        if (prunedCalls > 0) {
          safeSetRaw(MATERIAL_CALLS_KEY, JSON.stringify(filteredCalls));
          supabaseKeyStore.set(STORAGE_KEYS.MATERIAL_CALLS, filteredCalls);
        }
      } catch {
        // Fallback
      }
    }

    return { prunedKitting, prunedCalls };
  },

  // --- MANUALLY COMPLETED VOUCHERS (ADMIN VIRTUAL COMPLETION) ---
  getManuallyCompletedVouchers(): string[] {
    const raw = safeGetRaw(MANUALLY_COMPLETED_VOUCHERS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((k) => String(k).trim()).filter(Boolean);
      return [];
    } catch {
      return [];
    }
  },

  async saveManuallyCompletedVouchers(voucherKeys: string[]): Promise<void> {
    const unique = Array.from(new Set(voucherKeys.map((k) => String(k).trim()).filter(Boolean)));
    safeSetRaw(MANUALLY_COMPLETED_VOUCHERS_KEY, JSON.stringify(unique));
    try {
      await supabaseKeyStore.set(STORAGE_KEYS.MANUALLY_COMPLETED_VOUCHERS, unique);
    } catch (err) {
      console.error('[Storage] Error syncing manually completed vouchers to Supabase:', err);
    }
  },

  async toggleVoucherManuallyCompleted(voucherKey: string): Promise<boolean> {
    const key = voucherKey.trim();
    if (!key) return false;
    const current = this.getManuallyCompletedVouchers();
    const isCompleted = current.includes(key);
    const updated = isCompleted ? current.filter((k) => k !== key) : [...current, key];
    await this.saveManuallyCompletedVouchers(updated);
    return !isCompleted;
  },

  // --- KITTING QUEUE METHODS ---
  getKittingQueue(): KittingQueueItem[] {
    const raw = safeGetRaw(KITTING_QUEUE_KEY);
    if (!raw) {
      safeSetRaw(KITTING_QUEUE_KEY, JSON.stringify(INITIAL_KITTING_QUEUE));
      return INITIAL_KITTING_QUEUE;
    }
    try {
      const items: KittingQueueItem[] = JSON.parse(raw);
      // Auto-enforce 35-day retention policy on completed records
      const cutoffTime = Date.now() - 35 * 24 * 60 * 60 * 1000;
      let hasPruned = false;
      const validItems = items.filter((item) => {
        const isCompleted = item.status === 'IN_BUFFER' || item.status === 'DELIVERED';
        if (!isCompleted) return true;
        const itemTime = new Date(item.endTime || item.createdAt).getTime();
        if (itemTime < cutoffTime) {
          hasPruned = true;
          return false;
        }
        return true;
      });

      if (hasPruned) {
        safeSetRaw(KITTING_QUEUE_KEY, JSON.stringify(validItems));
        supabaseKeyStore.set(STORAGE_KEYS.KITTING_QUEUE, validItems);
      }
      return validItems;
    } catch {
      return INITIAL_KITTING_QUEUE;
    }
  },

  saveKittingQueue(items: KittingQueueItem[]): void {
    // Tối ưu hóa: lưu các đơn PENDING_KITTING, IN_BUFFER và DELIVERED trong vòng 35 ngày
    const cutoffTime = Date.now() - 35 * 24 * 60 * 60 * 1000;
    const activeQueue = items.filter((item) => {
      if (item.status === 'PENDING_KITTING' || item.status === 'IN_BUFFER') return true;
      if (item.status === 'DELIVERED') {
        const itemTime = new Date(item.endTime || item.createdAt).getTime();
        return itemTime >= cutoffTime;
      }
      return false;
    });
    safeSetRaw(KITTING_QUEUE_KEY, JSON.stringify(activeQueue));
    supabaseKeyStore.set(STORAGE_KEYS.KITTING_QUEUE, activeQueue);
  },

  /**
   * Lấy toàn bộ danh sách các bản ghi bóc tách đã hoàn thành (bao gồm cả hàng đã lên kệ Outbuffer và giao Andon)
   * Đồng bộ 100% giữa màn hình "Lịch Sử Bóc Tách" và "Báo Cáo Năng Suất Lao Động Theo Khung Giờ".
   */
  getCompletedKittingRecords(): KittingQueueItem[] {
    const queue = this.getKittingQueue();
    const buffers = this.getBufferLocations();
    const materialCalls = this.getMaterialCallRequests();

    const queueCompleted = queue.filter(
      (q) => q.status === 'IN_BUFFER' || q.status === 'DELIVERED'
    );

    const rackStockRecords: KittingQueueItem[] = [];
    buffers.forEach((buf) => {
      const bItems: BufferPartItem[] =
        buf.items && buf.items.length > 0
          ? buf.items
          : buf.partCode && buf.currentStockQty > 0
          ? [
              {
                partCode: buf.partCode,
                partName: buf.partName || buf.partCode,
                unit: buf.unit || 'Cái',
                currentStockQty: buf.currentStockQty,
                lastUpdated: buf.lastUpdated,
              },
            ]
          : [];

      bItems.forEach((bItem) => {
        if (!bItem.currentStockQty || bItem.currentStockQty <= 0) return;
        const matchingQueue = queueCompleted.filter(
          (q) =>
            q.status === 'IN_BUFFER' &&
            q.bufferLocation?.trim().toLowerCase() === buf.locationId?.trim().toLowerCase() &&
            q.partCode?.trim().toLowerCase() === bItem.partCode?.trim().toLowerCase()
        );
        const queueSum = matchingQueue.reduce(
          (s, q) => s + (q.kittedQuantity || q.rawQuantity || 0),
          0
        );
        if (bItem.currentStockQty > queueSum) {
          const qty = bItem.currentStockQty - queueSum;
          rackStockRecords.push({
            id: `rack-stock-${buf.locationId}-${bItem.partCode}`,
            transactionId: `rack-${buf.locationId}`,
            voucherCode: 'KHO_OUTBUFFER',
            voucherTitle: `Tồn khoang kệ ${buf.locationId}`,
            partCode: bItem.partCode,
            partName: bItem.partName || bItem.partCode,
            unit: bItem.unit || 'Cái',
            rawQuantity: qty,
            kittedQuantity: qty,
            scrapQuantity: 0,
            bufferLocation: buf.locationId,
            status: 'IN_BUFFER' as const,
            createdAt: bItem.lastUpdated || buf.lastUpdated || new Date().toISOString(),
            endTime: bItem.lastUpdated || buf.lastUpdated || new Date().toISOString(),
            operatorName: 'Tuấn (Thủ Kho)',
            durationMinutes: 15,
          });
        }
      });
    });

    const completedDeliveries: KittingQueueItem[] = materialCalls
      .filter(
        (req) =>
          req.status === 'COMPLETED' &&
          req.bufferLocation &&
          req.bufferLocation !== 'DCLR' &&
          !req.isDirectKitting
      )
      .map((req) => ({
        id: `delivery-${req.requestId}`,
        transactionId: req.requestId,
        voucherCode: 'GIAO_ANDON',
        voucherTitle: `Giao cấp hàng Andon (${req.assemblyLine || 'Dây chuyền'})`,
        partCode: req.partCode,
        partName: req.partName,
        unit: req.unit || 'Cái',
        rawQuantity: req.requestedQty,
        kittedQuantity: req.requestedQty,
        scrapQuantity: 0,
        bufferLocation: req.bufferLocation,
        status: 'DELIVERED' as const,
        createdAt: req.requestedAt,
        endTime: req.deliveredAt || req.requestedAt,
        operatorName: req.deliveredBy || 'Thủ Kho Logistics',
        durationMinutes: 5,
      }));

    return [
      ...queueCompleted,
      ...rackStockRecords,
      ...completedDeliveries.filter(
        (d) =>
          !queueCompleted.some(
            (q) =>
              q.status === 'DELIVERED' &&
              q.partCode.trim().toLowerCase() === d.partCode.trim().toLowerCase() &&
              q.bufferLocation?.trim().toLowerCase() === d.bufferLocation?.trim().toLowerCase() &&
              q.kittedQuantity === d.kittedQuantity
          )
      ),
    ].sort((a, b) => new Date(b.endTime || b.createdAt).getTime() - new Date(a.endTime || a.createdAt).getTime());
  },

  async syncKittingHistoryDataFromCloud(forceFetch: boolean = false): Promise<void> {
    try {
      await supabaseKeyStore.batchSyncAllKeys(
        [
          STORAGE_KEYS.KITTING_QUEUE,
          STORAGE_KEYS.BUFFER_MAP,
          STORAGE_KEYS.MATERIAL_CALLS,
          STORAGE_KEYS.KITTING_SCAN_LOGS,
        ],
        forceFetch
      );
    } catch (_) {}
  },

  addKittingQueueItemFromStockOut(
    tx: Transaction,
    meta?: {
      voucherCode?: string;
      voucherTitle?: string;
      sourceBin?: string;
      fifoAllocations?: Array<{
        locationName: string;
        quantity: number;
        lotId?: string;
        contNumber?: string;
      }>;
    }
  ): KittingQueueItem {
    const queue = this.getKittingQueue();
    const cleanVoucherCode = (meta?.voucherCode || 'PHIẾU_XUẤT_LẺ').trim();
    const cleanVoucherTitle = (meta?.voucherTitle || '').trim().toLowerCase();

    // Quy tắc xuất kho nhiều đợt: CỘNG DỒN vào SL Đề Nghị của linh kiện đó trong cùng mã phiếu và cùng tiêu đề phiếu
    const existingPending = queue.find(
      (item) =>
        item.status === 'PENDING_KITTING' &&
        (item.voucherCode || 'PHIẾU_XUẤT_LẺ').trim().toLowerCase() === cleanVoucherCode.toLowerCase() &&
        (item.voucherTitle || '').trim().toLowerCase() === cleanVoucherTitle &&
        item.partCode.trim().toLowerCase() === tx.partCode.trim().toLowerCase()
    );

    if (existingPending) {
      existingPending.rawQuantity += tx.quantity;
      if (!existingPending.allItemIds) {
        existingPending.allItemIds = [existingPending.id];
      }
      existingPending.batchCount = (existingPending.batchCount || 1) + 1;

      if (tx.id) {
        if (!existingPending.transactionIds) {
          existingPending.transactionIds = existingPending.transactionId ? [existingPending.transactionId] : [];
        }
        if (!existingPending.transactionIds.includes(tx.id)) {
          existingPending.transactionIds.push(tx.id);
        }
      }

      if (meta?.sourceBin || tx.locationId) {
        const newBin = (meta?.sourceBin || tx.locationId || '').trim();
        if (newBin && !existingPending.sourceBin?.includes(newBin)) {
          existingPending.sourceBin = existingPending.sourceBin ? `${existingPending.sourceBin}, ${newBin}` : newBin;
        }
      }
      if (meta?.fifoAllocations && meta.fifoAllocations.length > 0) {
        existingPending.fifoAllocations = [
          ...(existingPending.fifoAllocations || []),
          ...meta.fifoAllocations,
        ];
      }
      this.saveKittingQueue(queue);
      return existingPending;
    }

    const buffers = this.getBufferLocations();
    const existing = buffers.find((b) => b.partCode === tx.partCode && b.status !== 'EMPTY');
    const emptyBuf = buffers.find((b) => b.status === 'EMPTY');
    const defaultBuffer = existing ? existing.locationId : (emptyBuf ? emptyBuf.locationId : 'BUFFER-A1-01');

    const newItem: KittingQueueItem = {
      id: 'kit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      transactionId: tx.id,
      transactionIds: tx.id ? [tx.id] : [],
      voucherCode: meta?.voucherCode,
      voucherTitle: meta?.voucherTitle,
      sourceBin: meta?.sourceBin || tx.locationId || 'Kho chính',
      fifoAllocations: meta?.fifoAllocations,
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

  /**
   * Rollback toàn bộ mã phiếu xuất kho với các linh kiện còn tồn chưa bóc tách.
   * QUYỀN HẠN: Chỉ tài khoản Admin mới được thực hiện.
   * LƯU Ý: Trả về ĐÚNG vị trí BIN đã xuất trước đó!
   */
  async rollbackVoucherStockOut(
    voucherCode: string,
    performedBy: string,
    fallbackItems?: KittingQueueItem[]
  ): Promise<{
    success: boolean;
    voucherCode: string;
    totalPartsRolledBack: number;
    totalQtyRolledBack: number;
    restoredItems: Array<{
      partCode: string;
      partName: string;
      quantity: number;
      unit: string;
      restoredBin: string;
    }>;
  }> {
    const cleanVoucherCode = voucherCode.trim();
    if (!cleanVoucherCode) {
      throw new Error('Vui lòng chỉ định Mã phiếu xuất kho cần rollback!');
    }

    const vouchers = this.getBomExportVouchers();
    const existingVoucherIdx = vouchers.findIndex(
      (v) => v.voucherCode?.trim().toLowerCase() === cleanVoucherCode.toLowerCase()
    );
    if (existingVoucherIdx >= 0 && vouchers[existingVoucherIdx].status === 'ROLLED_BACK') {
      // Nếu đã rollback trước đó thì dọn sạch hàng chờ để tránh bấm lại nhiều lần
      const cleanedQueue = this.getKittingQueue().filter(
        (q) =>
          !(
            q.status === 'PENDING_KITTING' &&
            (q.voucherCode || 'PHIẾU_XUẤT_LẺ').trim().toLowerCase() === cleanVoucherCode.toLowerCase()
          )
      );
      this.saveKittingQueue(cleanedQueue);
      await supabaseKeyStore.set(STORAGE_KEYS.KITTING_QUEUE, cleanedQueue).catch(() => {});
      throw new Error(`Mã phiếu [${cleanVoucherCode}] đã được Rollback hoàn kho trước đó!`);
    }

    const queue = this.getKittingQueue();
    let pendingItems = queue.filter(
      (item) =>
        (item.voucherCode || 'PHIẾU_XUẤT_LẺ').trim().toLowerCase() === cleanVoucherCode.toLowerCase() &&
        item.status === 'PENDING_KITTING'
    );

    if (pendingItems.length === 0 && fallbackItems && fallbackItems.length > 0) {
      pendingItems = fallbackItems;
    }

    if (pendingItems.length === 0) {
      throw new Error(
        `Không tìm thấy linh kiện nào còn chờ bóc tách trong Mã phiếu [${cleanVoucherCode}] để hoàn kho!`
      );
    }

    // Gộp theo mã linh kiện và lấy số lượng còn tồn chờ bóc chính xác (nếu UI truyền fallbackItems thì ưu tiên SL còn tồn trên UI)
    const fallbackByPart = new Map<string, KittingQueueItem>();
    if (fallbackItems && fallbackItems.length > 0) {
      fallbackItems.forEach((f) => {
        if (f.partCode) fallbackByPart.set(f.partCode.trim().toLowerCase(), f);
      });
    }

    const consolidatedByPart = new Map<
      string,
      {
        partCode: string;
        remainingUnkitted: number;
        sourceBin: string;
        fifoAllocations?: Array<{ locationName: string; quantity: number; lotId?: string; contNumber?: string }>;
      }
    >();

    for (const item of pendingItems) {
      const pKey = item.partCode.trim().toLowerCase();
      const uiItem = fallbackByPart.get(pKey);
      const itemRem = Math.max(0, item.rawQuantity - (item.kittedQuantity || 0));
      const prev = consolidatedByPart.get(pKey);
      if (prev) {
        prev.remainingUnkitted += itemRem;
        if (item.sourceBin && !prev.sourceBin.includes(item.sourceBin)) {
          prev.sourceBin = prev.sourceBin ? `${prev.sourceBin}, ${item.sourceBin}` : item.sourceBin;
        }
        if (item.fifoAllocations && item.fifoAllocations.length > 0) {
          prev.fifoAllocations = [...(prev.fifoAllocations || []), ...item.fifoAllocations];
        }
      } else {
        consolidatedByPart.set(pKey, {
          partCode: item.partCode,
          remainingUnkitted: itemRem,
          sourceBin: item.sourceBin || uiItem?.sourceBin || 'Kho chính',
          fifoAllocations: item.fifoAllocations ? [...item.fifoAllocations] : uiItem?.fifoAllocations,
        });
      }
    }

    // Nếu trên UI hiển thị SL còn chờ bóc lớn hơn (do phiếu bù/đối soát), đồng bộ theo đúng SL đang hiển thị
    fallbackByPart.forEach((uiItem, pKey) => {
      const uiRem = Math.max(0, uiItem.rawQuantity - (uiItem.kittedQuantity || 0));
      const existing = consolidatedByPart.get(pKey);
      if (existing) {
        if (uiRem > existing.remainingUnkitted) {
          existing.remainingUnkitted = uiRem;
        }
      } else if (uiRem > 0) {
        consolidatedByPart.set(pKey, {
          partCode: uiItem.partCode,
          remainingUnkitted: uiRem,
          sourceBin: uiItem.sourceBin || 'Kho chính',
          fifoAllocations: uiItem.fifoAllocations,
        });
      }
    });

    const parts = this.getParts();
    const txs = this.getTransactions();
    const partsMap = new Map<string, Part>();
    parts.forEach((p) => partsMap.set(p.id, { ...p, locations: p.locations ? [...p.locations] : [] }));

    const restoredItems: Array<{
      partCode: string;
      partName: string;
      quantity: number;
      unit: string;
      restoredBin: string;
    }> = [];

    const nowIso = new Date().toISOString();
    let totalQtyRolledBack = 0;
    const newTxs: Transaction[] = [];

    for (const entry of consolidatedByPart.values()) {
      const remainingUnkitted = entry.remainingUnkitted;
      if (remainingUnkitted <= 0) continue;

      const part =
        partsMap.get(entry.partCode) ||
        Array.from(partsMap.values()).find((p) => p.code.toLowerCase().trim() === entry.partCode.toLowerCase().trim());
      if (!part) continue;

      let needToRestore = remainingUnkitted;
      const primaryBin = (entry.sourceBin || 'Kho chính').split(',')[0]?.split('(')[0]?.trim() || 'Kho chính';
      const allocs =
        entry.fifoAllocations && entry.fifoAllocations.length > 0
          ? entry.fifoAllocations
          : [{ locationName: primaryBin, quantity: remainingUnkitted }];

      for (const alloc of allocs) {
        if (needToRestore <= 0) break;
        const returnQty = Math.min(alloc.quantity || (alloc as any).allocatedQty || needToRestore, needToRestore);
        if (returnQty <= 0) continue;

        const rawBin = alloc.locationName || primaryBin || 'Kho chính';
        const binName = rawBin.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính';
        const stockBefore = part.currentStock;
        const stockAfter = stockBefore + returnQty;
        part.currentStock = stockAfter;

        const locs = this.getPartLocations(part);
        const existingIndex = locs.findIndex(
          (l) => l.locationName.toLowerCase() === binName.toLowerCase()
        );

        if (existingIndex >= 0) {
          locs[existingIndex].quantity += returnQty;
        } else {
          locs.push({ locationName: binName, quantity: returnQty });
        }

        part.locations = locs;
        part.location = this.formatPartLocationSummary(locs);
        part.updatedAt = nowIso;

        const rollbackTx: Transaction = {
          id: 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          partId: part.id,
          partCode: part.code,
          partName: part.name,
          unit: part.unit,
          type: 'IN',
          quantity: returnQty,
          date: nowIso,
          person: performedBy || 'Admin Quản Trị',
          reasonOrPurpose: 'Rollback hoàn kho phiếu xuất',
          notes: `[Rollback Admin] Hoàn trả từ phiếu [${cleanVoucherCode}] về đúng BIN [${binName}]`,
          locationId: binName,
          stockBefore,
          stockAfter,
        };
        newTxs.push(rollbackTx);

        restoredItems.push({
          partCode: part.code,
          partName: part.name,
          quantity: returnQty,
          unit: part.unit,
          restoredBin: binName,
        });

        needToRestore -= returnQty;
        totalQtyRolledBack += returnQty;
      }

      // Nếu tổng các lô phân bổ nhỏ hơn số lượng cần hoàn trả thì hoàn nốt phần còn lại về kệ chính
      if (needToRestore > 0) {
        const binName = primaryBin;
        const stockBefore = part.currentStock;
        const stockAfter = stockBefore + needToRestore;
        part.currentStock = stockAfter;

        const locs = this.getPartLocations(part);
        const existingIndex = locs.findIndex(
          (l) => l.locationName.toLowerCase() === binName.toLowerCase()
        );
        if (existingIndex >= 0) {
          locs[existingIndex].quantity += needToRestore;
        } else {
          locs.push({ locationName: binName, quantity: needToRestore });
        }
        part.locations = locs;
        part.location = this.formatPartLocationSummary(locs);
        part.updatedAt = nowIso;

        const rollbackTx: Transaction = {
          id: 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          partId: part.id,
          partCode: part.code,
          partName: part.name,
          unit: part.unit,
          type: 'IN',
          quantity: needToRestore,
          date: nowIso,
          person: performedBy || 'Admin Quản Trị',
          reasonOrPurpose: 'Rollback hoàn kho phiếu xuất',
          notes: `[Rollback Admin] Hoàn trả từ phiếu [${cleanVoucherCode}] về đúng BIN [${binName}]`,
          locationId: binName,
          stockBefore,
          stockAfter,
        };
        newTxs.push(rollbackTx);

        restoredItems.push({
          partCode: part.code,
          partName: part.name,
          quantity: needToRestore,
          unit: part.unit,
          restoredBin: binName,
        });

        totalQtyRolledBack += needToRestore;
        needToRestore = 0;
      }
    }

    // Xóa triệt để các bản ghi PENDING_KITTING của mã phiếu này khỏi hàng chờ
    const remainingQueue = queue.filter(
      (item) =>
        !(
          item.status === 'PENDING_KITTING' &&
          (item.voucherCode || 'PHIẾU_XUẤT_LẺ').trim().toLowerCase() === cleanVoucherCode.toLowerCase()
        )
    );

    const updatedParts = Array.from(partsMap.values());
    this.saveParts(updatedParts);

    const allTxs = [...newTxs, ...txs];
    this.saveTransactions(allTxs, newTxs);

    this.saveKittingQueue(remainingQueue);

    if (existingVoucherIdx >= 0) {
      vouchers[existingVoucherIdx] = {
        ...vouchers[existingVoucherIdx],
        status: 'ROLLED_BACK',
        notes: `${vouchers[existingVoucherIdx].notes || ''} [Đã Rollback hoàn kho lúc ${new Date().toLocaleString('vi-VN')} bởi ${performedBy}]`.trim(),
      };
    } else {
      vouchers.unshift({
        id: 'vxk-rb-' + Date.now(),
        voucherCode: cleanVoucherCode,
        modelName: cleanVoucherCode,
        modelQty: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        dateTime: nowIso,
        person: performedBy || 'Admin Quản Trị',
        items: [],
        totalPartsCount: restoredItems.length,
        totalQtyRequired: totalQtyRolledBack,
        totalQtyOut: totalQtyRolledBack,
        totalQtyRemaining: 0,
        voucherType: 'BOM',
        status: 'ROLLED_BACK',
        dispatchRounds: 1,
        notes: `[Đã Rollback hoàn kho lúc ${new Date().toLocaleString('vi-VN')} bởi ${performedBy}]`,
      });
    }
    this.saveBomExportVouchers(vouchers);

    await Promise.all([
      supabaseKeyStore.set(STORAGE_KEYS.KITTING_QUEUE, remainingQueue).catch(() => {}),
      supabaseKeyStore.set(STORAGE_KEYS.BOM_VOUCHERS, vouchers).catch(() => {}),
      this.flushWriteQueue().catch(() => {}),
    ]);

    return {
      success: true,
      voucherCode: cleanVoucherCode,
      totalPartsRolledBack: restoredItems.length,
      totalQtyRolledBack: Math.round(totalQtyRolledBack * 100) / 100,
      restoredItems,
    };
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

  async deleteKittingItem(id: string): Promise<boolean> {
    const queue = this.getKittingQueue().filter((q) => q.id !== id && !(Array.isArray(q.allItemIds) && q.allItemIds.includes(id)));
    this.saveKittingQueue(queue);
    try {
      const ok = await supabaseKeyStore.set(STORAGE_KEYS.KITTING_QUEUE, queue);
      return ok;
    } catch {
      return false;
    }
  },

  async deleteKittingVoucher(voucherCode: string): Promise<boolean> {
    const target = voucherCode.trim().toLowerCase();
    const queue = this.getKittingQueue().filter((q) => {
      if (q.status !== 'PENDING_KITTING') return true;
      const qCode = (q.voucherCode || 'PHIẾU_XUẤT_LẺ').trim().toLowerCase();
      return qCode !== target;
    });
    this.saveKittingQueue(queue);

    const vouchers = this.getBomExportVouchers();
    let vUpdated = false;
    vouchers.forEach((v) => {
      if (v.voucherCode?.trim().toLowerCase() === target) {
        (v as any).isDeletedFromKitting = true;
        vUpdated = true;
      }
    });
    if (vUpdated) {
      this.saveBomExportVouchers(vouchers);
    }

    try {
      const [ok] = await Promise.all([
        supabaseKeyStore.set(STORAGE_KEYS.KITTING_QUEUE, queue),
        vUpdated ? supabaseKeyStore.set(STORAGE_KEYS.BOM_VOUCHERS, vouchers) : Promise.resolve(true),
      ]);
      return ok;
    } catch {
      return false;
    }
  },

  async clearAllPendingKittingItems(): Promise<boolean> {
    const queue = this.getKittingQueue().filter((q) => q.status !== 'PENDING_KITTING');
    this.saveKittingQueue(queue);

    const vouchers = this.getBomExportVouchers();
    vouchers.forEach((v) => {
      (v as any).isDeletedFromKitting = true;
    });
    this.saveBomExportVouchers(vouchers);

    try {
      const [ok] = await Promise.all([
        supabaseKeyStore.set(STORAGE_KEYS.KITTING_QUEUE, queue),
        supabaseKeyStore.set(STORAGE_KEYS.BOM_VOUCHERS, vouchers),
      ]);
      return ok;
    } catch {
      return false;
    }
  },

  async updatePendingKittingQuantity(
    voucherCode: string,
    partCode: string,
    newQuantity: number,
    operatorName?: string
  ): Promise<boolean> {
    const cleanVoucherCode = voucherCode.trim();
    const cleanPartCode = partCode.trim().toLowerCase();
    const newQty = Math.max(0, Number(newQuantity) || 0);

    const queue = this.getKittingQueue();
    let updated = false;

    // 1. Find matching PENDING_KITTING items in queue
    const matchingItems = queue.filter(
      (q) =>
        q.status === 'PENDING_KITTING' &&
        (q.voucherCode || 'PHIẾU_XUẤT_LẺ').trim().toLowerCase() === cleanVoucherCode.toLowerCase() &&
        q.partCode.trim().toLowerCase() === cleanPartCode
    );

    if (matchingItems.length > 0) {
      matchingItems[0].rawQuantity = newQty;
      for (let i = 1; i < matchingItems.length; i++) {
        matchingItems[i].rawQuantity = 0;
      }
      updated = true;
    } else {
      const parts = this.getParts();
      const p = parts.find((part) => part.code.trim().toLowerCase() === cleanPartCode);
      const newItem: KittingQueueItem = {
        id: 'kit-edit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        transactionId: 'tx-edit-' + Date.now(),
        voucherCode: cleanVoucherCode,
        voucherTitle: `Phiếu xuất ${cleanVoucherCode}`,
        partCode: p ? p.code : partCode,
        partName: p ? p.name : partCode,
        unit: p ? p.unit : 'Cái',
        rawQuantity: newQty,
        kittedQuantity: 0,
        scrapQuantity: 0,
        bufferLocation: 'BUFFER-A1-01',
        status: 'PENDING_KITTING',
        createdAt: new Date().toISOString(),
        operatorName: operatorName || 'Admin Quản Trị',
        sourceBin: p ? p.location || 'Kho chính' : 'Kho chính',
      };
      queue.unshift(newItem);
      updated = true;
    }

    this.saveKittingQueue(queue);

    // 2. Also update BomExportVouchers if present so reconciliation does not overwrite the edited quantity
    try {
      const vouchers = this.getBomExportVouchers();
      const vIdx = vouchers.findIndex(
        (v) => v.voucherCode?.trim().toLowerCase() === cleanVoucherCode.toLowerCase()
      );
      if (vIdx >= 0) {
        const v = vouchers[vIdx];
        if (Array.isArray(v.items)) {
          const itemIdx = v.items.findIndex(
            (i) => i.partCode.trim().toLowerCase() === cleanPartCode
          );
          if (itemIdx >= 0) {
            v.items[itemIdx].exportedQty = newQty;
            v.items[itemIdx].totalQtyOut = newQty;
          } else {
            const parts = this.getParts();
            const p = parts.find((part) => part.code.trim().toLowerCase() === cleanPartCode);
            v.items.push({
              partCode: p ? p.code : partCode,
              partName: p ? p.name : partCode,
              unit: p ? p.unit : 'Cái',
              bomQtyPerSet: newQty,
              totalQtyOut: newQty,
              exportedQty: newQty,
              fifoLocation: p ? p.location || 'Kho chính' : 'Kho chính',
            });
          }
          localStorage.setItem(BOM_VOUCHERS_KEY, JSON.stringify(vouchers));
          await supabaseKeyStore.set(STORAGE_KEYS.BOM_VOUCHERS, vouchers);
        }
      }
    } catch (_) {}

    return updated;
  },

  async addPendingKittingPart(params: {
    voucherCode: string;
    voucherTitle?: string;
    partCode: string;
    partName?: string;
    unit?: string;
    rawQuantity: number;
    operatorName?: string;
    sourceBin?: string;
  }): Promise<KittingQueueItem> {
    const cleanVoucherCode = params.voucherCode.trim();
    const cleanPartCode = params.partCode.trim();
    const newQty = Math.max(0, Number(params.rawQuantity) || 0);

    const parts = this.getParts();
    const p = parts.find((part) => part.code.trim().toLowerCase() === cleanPartCode.toLowerCase());

    const partCode = p ? p.code : cleanPartCode;
    const partName = params.partName || (p ? p.name : cleanPartCode);
    const unit = params.unit || (p ? p.unit : 'Cái');
    const sourceBin = params.sourceBin || (p ? p.location || 'Kho chính' : 'Kho chính');

    const queue = this.getKittingQueue();

    const existing = queue.find(
      (q) =>
        q.status === 'PENDING_KITTING' &&
        (q.voucherCode || 'PHIẾU_XUẤT_LẺ').trim().toLowerCase() === cleanVoucherCode.toLowerCase() &&
        q.partCode.trim().toLowerCase() === cleanPartCode.toLowerCase()
    );

    let resultItem: KittingQueueItem;

    if (existing) {
      existing.rawQuantity += newQty;
      resultItem = existing;
    } else {
      resultItem = {
        id: 'kit-add-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        transactionId: 'tx-add-' + Date.now(),
        voucherCode: cleanVoucherCode,
        voucherTitle: params.voucherTitle || `Phiếu xuất ${cleanVoucherCode}`,
        partCode,
        partName,
        unit,
        rawQuantity: newQty,
        kittedQuantity: 0,
        scrapQuantity: 0,
        bufferLocation: 'BUFFER-A1-01',
        status: 'PENDING_KITTING',
        createdAt: new Date().toISOString(),
        operatorName: params.operatorName || 'Admin Quản Trị',
        sourceBin,
      };
      queue.unshift(resultItem);
    }

    this.saveKittingQueue(queue);

    try {
      const vouchers = this.getBomExportVouchers();
      const vIdx = vouchers.findIndex(
        (v) => v.voucherCode?.trim().toLowerCase() === cleanVoucherCode.toLowerCase()
      );
      if (vIdx >= 0) {
        const v = vouchers[vIdx];
        if (Array.isArray(v.items)) {
          const itemIdx = v.items.findIndex(
            (i) => i.partCode.trim().toLowerCase() === cleanPartCode.toLowerCase()
          );
          if (itemIdx >= 0) {
            v.items[itemIdx].exportedQty = (v.items[itemIdx].exportedQty || v.items[itemIdx].totalQtyOut || 0) + newQty;
            v.items[itemIdx].totalQtyOut = (v.items[itemIdx].totalQtyOut || 0) + newQty;
          } else {
            v.items.push({
              partCode,
              partName,
              unit,
              bomQtyPerSet: newQty,
              totalQtyOut: newQty,
              exportedQty: newQty,
              fifoLocation: sourceBin,
            });
          }
          v.totalPartsCount = v.items.length;
          v.totalQtyOut = v.items.reduce((sum, i) => sum + (i.totalQtyOut || i.exportedQty || 0), 0);
          localStorage.setItem(BOM_VOUCHERS_KEY, JSON.stringify(vouchers));
          await supabaseKeyStore.set(STORAGE_KEYS.BOM_VOUCHERS, vouchers);
        }
      }
    } catch (_) {}

    return resultItem;
  },

  // --- BUFFER LOCATION METHODS ---
  normalizeBufferLocations(list: BufferLocationMap[]): BufferLocationMap[] {
    if (!Array.isArray(list)) return [];
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

  getBufferMap(): BufferLocationMap[] {
    const raw = safeGetRaw(BUFFER_MAP_KEY);
    let list: BufferLocationMap[] | null = null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          list = parsed;
        }
      } catch {
        list = null;
      }
    }

    // 1. Kiểm tra cache đồng bộ từ Supabase KeyStore nếu localStorage chưa có
    if (!list || list.length === 0) {
      try {
        const cachedRaw = safeGetRaw(STORAGE_KEYS.BUFFER_MAP);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            list = parsed;
            safeSetRaw(BUFFER_MAP_KEY, JSON.stringify(list));
          }
        }
      } catch (_) {}
    }

    // 2. Nếu vẫn chưa có dữ liệu tại máy local, gọi kéo dữ liệu ngầm từ Supabase Cloud
    if (!list || list.length === 0) {
      this.fetchBufferMapFromCloud(true)
        .then((cloudData) => {
          if (cloudData && Array.isArray(cloudData) && cloudData.length > 0) {
            safeSetRaw(BUFFER_MAP_KEY, JSON.stringify(cloudData));
            window.dispatchEvent(new CustomEvent('thekho:buffer_map_updated', { detail: cloudData }));
          }
        })
        .catch((err) => {
          console.warn('[getBufferMap] Lỗi kéo ngầm sơ đồ kệ từ Supabase:', err);
        });

      // Tuyệt đối KHÔNG tự ý ghi đè DEFAULT_BUFFER_LOCATIONS vào localStorage!
      // Trả về DEFAULT_BUFFER_LOCATIONS tạm thời làm placeholder trong lúc chờ Cloud phản hồi
      list = DEFAULT_BUFFER_LOCATIONS;
    }

    return this.normalizeBufferLocations(list);
  },

  getBufferLocations(): BufferLocationMap[] {
    return this.getBufferMap();
  },

  async fetchBufferMapFromCloud(forceFresh: boolean = false): Promise<BufferLocationMap[]> {
    try {
      const remote = await supabaseKeyStore.get<BufferLocationMap[]>(STORAGE_KEYS.BUFFER_MAP, { forceFresh });
      if (remote && Array.isArray(remote) && remote.length > 0) {
        safeSetRaw(BUFFER_MAP_KEY, JSON.stringify(remote));
        return this.normalizeBufferLocations(remote);
      }
    } catch (err) {
      console.warn('[fetchBufferMapFromCloud] Lỗi kéo sơ đồ kệ từ Supabase:', err);
    }
    const raw = safeGetRaw(BUFFER_MAP_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return this.normalizeBufferLocations(parsed);
        }
      } catch (_) {}
    }
    return this.normalizeBufferLocations(DEFAULT_BUFFER_LOCATIONS);
  },

  async saveBufferMap(locs: BufferLocationMap[]): Promise<boolean> {
    try {
      safeSetRaw(BUFFER_MAP_KEY, JSON.stringify(locs));
      const ok = await supabaseKeyStore.set(STORAGE_KEYS.BUFFER_MAP, locs);
      return ok;
    } catch (err) {
      console.error('[saveBufferMap] Lỗi đồng bộ sơ đồ kệ lên Supabase:', err);
      return false;
    }
  },

  saveBufferLocations(locs: BufferLocationMap[]): void {
    safeSetRaw(BUFFER_MAP_KEY, JSON.stringify(locs));
    this.saveBufferMap(locs).catch((err) => {
      console.warn('[saveBufferLocations] Lỗi ngầm lưu sơ đồ kệ lên Supabase:', err);
    });
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

  getDeletedCallIds(): Set<string> {
    const raw = safeGetRaw(DELETED_CALL_IDS_KEY);
    if (!raw) return new Set<string>();
    try {
      const list = JSON.parse(raw);
      return new Set<string>(Array.isArray(list) ? list : []);
    } catch {
      return new Set<string>();
    }
  },

  async addDeletedCallId(id: string): Promise<void> {
    if (!id) return;
    const ids = this.getDeletedCallIds();
    ids.add(id);
    const arr = Array.from(ids);
    safeSetRaw(DELETED_CALL_IDS_KEY, JSON.stringify(arr));

    // Persist deleted call IDs to Supabase table thekho_app_data
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (isConfigured && client) {
        const { data: row } = await client
          .from('thekho_app_data')
          .select('data')
          .eq('key', STORAGE_KEYS.DELETED_CALL_IDS)
          .maybeSingle();

        const cloudIds: string[] = (row && Array.isArray(row.data)) ? row.data : [];
        const unionIds = Array.from(new Set([...cloudIds, ...arr]));
        const nowIso = new Date().toISOString();
        await client
          .from('thekho_app_data')
          .upsert(
            { key: STORAGE_KEYS.DELETED_CALL_IDS, data: unionIds, updated_at: nowIso },
            { onConflict: 'key' }
          );
        safeSetRaw(DELETED_CALL_IDS_KEY, JSON.stringify(unionIds));
      }
    } catch (err) {
      console.warn('[addDeletedCallId] Cloud error:', err);
    }
  },

  async fetchDeletedCallIdsFromCloud(): Promise<Set<string>> {
    const localIds = this.getDeletedCallIds();
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return localIds;

      const { data: row } = await client
        .from('thekho_app_data')
        .select('data')
        .eq('key', STORAGE_KEYS.DELETED_CALL_IDS)
        .maybeSingle();

      if (row && Array.isArray(row.data) && row.data.length > 0) {
        const unionSet = new Set([...localIds, ...row.data]);
        const arr = Array.from(unionSet);
        safeSetRaw(DELETED_CALL_IDS_KEY, JSON.stringify(arr));
        return unionSet;
      }
    } catch (err) {
      console.warn('[fetchDeletedCallIdsFromCloud] error:', err);
    }
    return localIds;
  },

  // --- MATERIAL CALL REQUEST METHODS (ANDON) ---
  getMaterialCalls(): MaterialCallRequest[] {
    return this.getMaterialCallRequests();
  },

  getMaterialCallRequests(): MaterialCallRequest[] {
    const deletedIds = this.getDeletedCallIds();
    const raw = safeGetRaw(MATERIAL_CALLS_KEY);
    if (!raw) {
      const cached = getLocalCacheData<MaterialCallRequest[]>(STORAGE_KEYS.MATERIAL_CALLS);
      if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
        const filtered = cached.data.filter((c) => c && c.requestId && !deletedIds.has(c.requestId));
        safeSetRaw(MATERIAL_CALLS_KEY, JSON.stringify(filtered));
        return filtered;
      }
      const filtered = INITIAL_MATERIAL_CALLS.filter((c) => c && c.requestId && !deletedIds.has(c.requestId));
      safeSetRaw(MATERIAL_CALLS_KEY, JSON.stringify(filtered));
      return filtered;
    }
    try {
      const items: MaterialCallRequest[] = JSON.parse(raw);
      const cutoffTime = Date.now() - 35 * 24 * 60 * 60 * 1000;
      let hasPruned = false;
      const validItems = items.filter((item) => {
        if (!item || !item.requestId || deletedIds.has(item.requestId)) {
          hasPruned = true;
          return false;
        }
        const isCompleted = item.status === 'COMPLETED';
        if (!isCompleted) return true;
        const itemTime = new Date(item.deliveredAt || item.requestedAt).getTime();
        if (itemTime < cutoffTime) {
          hasPruned = true;
          return false;
        }
        return true;
      });

      if (hasPruned) {
        safeSetRaw(MATERIAL_CALLS_KEY, JSON.stringify(validItems));
        supabaseKeyStore.set(STORAGE_KEYS.MATERIAL_CALLS, validItems);
      }
      return validItems;
    } catch {
      return INITIAL_MATERIAL_CALLS.filter((c) => c && c.requestId && !deletedIds.has(c.requestId));
    }
  },

  async fetchMaterialCallsFromCloud(forceFetch: boolean = false): Promise<MaterialCallRequest[]> {
    // 1. Fetch deleted call IDs using smart timestamp check (0 JSONB egress if unchanged)
    const deletedIds = await this.fetchDeletedCallIdsFromCloud();
    try {
      const remoteCalls = await supabaseRelationalStore.selectActiveMaterialCalls({
        forceFresh: forceFetch,
        limit: 300,
      });
      if (remoteCalls && Array.isArray(remoteCalls)) {
        const localCalls = this.getMaterialCallRequests();
        const statusWeights: Record<string, number> = { COMPLETED: 2, DELIVERING: 1, CALLING: 0 };

        const map = new Map<string, MaterialCallRequest>();
        for (const loc of localCalls) {
          if (loc && loc.requestId && !deletedIds.has(loc.requestId)) {
            map.set(loc.requestId, loc);
          }
        }

        for (const rem of remoteCalls) {
          if (rem && rem.requestId && !deletedIds.has(rem.requestId)) {
            const existing = map.get(rem.requestId);
            if (existing) {
              const wExisting = statusWeights[existing.status] || 0;
              const wRem = statusWeights[rem.status] || 0;
              // CRITICAL: NEVER rollback DELIVERING or COMPLETED to CALLING!
              const finalStatus = wRem >= wExisting ? rem.status : existing.status;
              map.set(rem.requestId, {
                ...rem,
                ...existing,
                status: finalStatus,
                deliveredBy: (finalStatus === rem.status ? rem.deliveredBy : existing.deliveredBy) || rem.deliveredBy || existing.deliveredBy,
                deliveredAt: (finalStatus === rem.status ? rem.deliveredAt : existing.deliveredAt) || rem.deliveredAt || existing.deliveredAt,
                isStockDeducted: Boolean(existing.isStockDeducted || rem.isStockDeducted),
              });
            } else {
              map.set(rem.requestId, rem);
            }
          }
        }

        const merged = Array.from(map.values())
          .filter((item) => item && item.requestId && !deletedIds.has(item.requestId))
          .sort(
            (a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime()
          );

        // Chỉ cập nhật bộ nhớ đệm cục bộ, tuyệt đối KHÔNG ghi ngược toàn bộ mảng lên Cloud khi vừa tải về!
        const nowIso = new Date().toISOString();
        safeSetRaw(MATERIAL_CALLS_KEY, JSON.stringify(merged));
        setLocalCacheData(STORAGE_KEYS.MATERIAL_CALLS, merged, nowIso);
        return merged;
      }
      return this.getMaterialCallRequests();
    } catch {
      return this.getMaterialCallRequests();
    }
  },

  saveMaterialCallRequests(reqs: MaterialCallRequest[]): void {
    const deletedIds = this.getDeletedCallIds();
    const cleanReqs = reqs.filter((r) => r && r.requestId && !deletedIds.has(r.requestId));
    const nowIso = new Date().toISOString();
    safeSetRaw(MATERIAL_CALLS_KEY, JSON.stringify(cleanReqs));
    setLocalCacheData(STORAGE_KEYS.MATERIAL_CALLS, cleanReqs, nowIso);
    // Đưa vào hàng đợi Debounce 400ms để tránh bắn nhiều lệnh ghi đè mảng lớn liên tiếp
    pendingMaterialCallsSnapshot = cleanReqs;
    scheduleDebouncedWriteFlush();
  },

  /**
   * Đồng bộ đơn gọi hàng Andon theo `requestId` với cơ chế kiểm tra timestamp nhẹ (~50B),
   * không tải lại toàn bộ lịch sử nếu Cloud không có thay đổi mới hơn.
   */
  async syncMaterialCallToCloud(targetCall: MaterialCallRequest): Promise<boolean> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return true;

      const deletedIds = this.getDeletedCallIds();
      if (deletedIds.has(targetCall.requestId)) {
        return true;
      }

      // Sử dụng supabaseKeyStore.get (chỉ kiểm tra updated_at ~50B nếu cache đã mới nhất, tránh kéo toàn bộ JSONB)
      const cloudCallsRaw = await supabaseKeyStore.get<MaterialCallRequest[]>(STORAGE_KEYS.MATERIAL_CALLS);
      const cloudCalls: MaterialCallRequest[] = Array.isArray(cloudCallsRaw) ? cloudCallsRaw : [];
      const statusWeights: Record<string, number> = { COMPLETED: 2, DELIVERING: 1, CALLING: 0 };
      const map = new Map<string, MaterialCallRequest>();

      for (const c of cloudCalls) {
        if (c && c.requestId && !deletedIds.has(c.requestId)) {
          map.set(c.requestId, c);
        }
      }

      const localCalls = this.getMaterialCallRequests();
      for (const loc of localCalls) {
        if (loc && loc.requestId && !deletedIds.has(loc.requestId)) {
          const ex = map.get(loc.requestId);
          if (ex) {
            const wEx = statusWeights[ex.status] || 0;
            const wLoc = statusWeights[loc.status] || 0;
            const finalStatus = wLoc >= wEx ? loc.status : ex.status;
            map.set(loc.requestId, {
              ...ex,
              ...loc,
              status: finalStatus,
              deliveredBy: (finalStatus === loc.status ? loc.deliveredBy : ex.deliveredBy) || loc.deliveredBy || ex.deliveredBy,
              deliveredAt: (finalStatus === loc.status ? loc.deliveredAt : ex.deliveredAt) || loc.deliveredAt || ex.deliveredAt,
              isStockDeducted: Boolean(ex.isStockDeducted || loc.isStockDeducted),
            });
          } else {
            map.set(loc.requestId, loc);
          }
        }
      }

      // Cập nhật đúng bản ghi theo `requestId` với bảo toàn trạng thái cao nhất
      const exTarget = map.get(targetCall.requestId);
      if (exTarget) {
        const wEx = statusWeights[exTarget.status] || 0;
        const wTarget = statusWeights[targetCall.status] || 0;
        const finalStatus = wTarget >= wEx ? targetCall.status : exTarget.status;
        map.set(targetCall.requestId, {
          ...exTarget,
          ...targetCall,
          status: finalStatus,
          deliveredBy: (finalStatus === targetCall.status ? targetCall.deliveredBy : exTarget.deliveredBy) || targetCall.deliveredBy || exTarget.deliveredBy,
          deliveredAt: (finalStatus === targetCall.status ? targetCall.deliveredAt : exTarget.deliveredAt) || targetCall.deliveredAt || exTarget.deliveredAt,
          isStockDeducted: Boolean(exTarget.isStockDeducted || targetCall.isStockDeducted),
        });
      } else {
        map.set(targetCall.requestId, targetCall);
      }

      const merged = Array.from(map.values())
        .filter((c) => c && c.requestId && !deletedIds.has(c.requestId))
        .sort(
          (a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime()
        );

      const nowIso = new Date().toISOString();
      safeSetRaw(MATERIAL_CALLS_KEY, JSON.stringify(merged));
      setLocalCacheData(STORAGE_KEYS.MATERIAL_CALLS, merged, nowIso);
      pendingMaterialCallsSnapshot = merged;
      scheduleDebouncedWriteFlush();
      return true;
    } catch (err) {
      console.warn('[syncMaterialCallToCloud] Catch error:', err);
      return false;
    }
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
    requiredTime?: string;
  }): MaterialCallRequest {
    const reqs = this.getMaterialCallRequests();
    const isDirect =
      params.isDirectKitting ||
      params.bufferLocation === 'DCLR' ||
      params.bufferLocation === 'KHU BÓC TÁCH KITTING' ||
      params.bufferLocation?.toUpperCase().includes('DCLR') ||
      params.bufferLocation?.toUpperCase().includes('KITTING');

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
      requiredTime: params.requiredTime || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      status: 'CALLING',
      isStockDeducted: false,
    };

    reqs.unshift(newReq);
    this.saveMaterialCallRequests(reqs);

    // Reliable background sync to Cloud merging with server array
    this.syncMaterialCallToCloud(newReq).catch((e) => {
      console.warn('[createMaterialCallRequest] Cloud sync notice:', e);
    });

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

    // CRITICAL: Push status transition to Supabase Cloud immediately so it can NEVER be rolled back!
    this.syncMaterialCallToCloud(updated).catch((err) => {
      console.warn('[updateMaterialCallStatus] sync notice:', err);
    });

    // If completed and stock was not already deducted at creation time, deduct now
    if (status === 'COMPLETED' && !current.isStockDeducted) {
      // 1. ALWAYS CONSUME / DEDUCT FROM PENDING KITTING QUEUE (Danh Sách Chờ Bóc Tách) via FIFO
      const queue = this.getKittingQueue();
      const pendingIndices: number[] = [];
      queue.forEach((item, index) => {
        if (
          item.status === 'PENDING_KITTING' &&
          item.partCode.trim().toLowerCase() === current.partCode.trim().toLowerCase()
        ) {
          pendingIndices.push(index);
        }
      });

      pendingIndices.sort((a, b) => new Date(queue[a].createdAt).getTime() - new Date(queue[b].createdAt).getTime());

      let remainingToDeduct = current.requestedQty;
      const nowIso = new Date().toISOString();

      for (const pIdx of pendingIndices) {
        if (remainingToDeduct <= 0) break;
        const pItem = queue[pIdx];
        const unkitted = Math.max(0, pItem.rawQuantity - (pItem.kittedQuantity || 0));
        if (unkitted <= 0) continue;

        if (unkitted <= remainingToDeduct) {
          remainingToDeduct -= unkitted;
          queue[pIdx] = {
            ...pItem,
            kittedQuantity: pItem.rawQuantity,
            status: 'DELIVERED',
            bufferLocation: current.bufferLocation || 'Giao DCLR',
            operatorName: deliveredBy || current.deliveredBy || 'Thủ Kho Logistics',
            endTime: nowIso,
            durationMinutes: 5,
          };
        } else {
          const consumedPortion = remainingToDeduct;
          queue[pIdx] = {
            ...pItem,
            kittedQuantity: (pItem.kittedQuantity || 0) + consumedPortion,
          };
          remainingToDeduct = 0;
        }
      }
      this.saveKittingQueue(queue);

      // 2. IF NOT DIRECT (from Outbuffer Shelf), ALSO DEDUCT FROM OUTBUFFER SHELF STOCK
      const isDirect =
        current.isDirectKitting ||
        current.bufferLocation === 'DCLR' ||
        current.bufferLocation === 'KHU BÓC TÁCH KITTING' ||
        current.bufferLocation?.toUpperCase().includes('DCLR') ||
        current.bufferLocation?.toUpperCase().includes('KITTING');

      if (!isDirect) {
        const buffers = this.getBufferLocations();
        const bIdx = buffers.findIndex((b) => b.locationId === current.bufferLocation);
        if (bIdx >= 0) {
          const targetBuf = buffers[bIdx];
          let items: BufferPartItem[] = targetBuf.items ? [...targetBuf.items] : [];

          const itemIdx = items.findIndex((i) => i.partCode?.trim().toLowerCase() === current.partCode?.trim().toLowerCase());
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

        // Update kitting queue status to DELIVERED for matching IN_BUFFER items proportionally
        const refreshedQueue = this.getKittingQueue();
        let remainingToDeliver = current.requestedQty;
        let queueChanged = false;

        for (let idx = 0; idx < refreshedQueue.length && remainingToDeliver > 0; idx++) {
          const k = refreshedQueue[idx];
          if (
            k.bufferLocation?.trim().toLowerCase() === current.bufferLocation?.trim().toLowerCase() &&
            k.partCode?.trim().toLowerCase() === current.partCode?.trim().toLowerCase() &&
            k.status === 'IN_BUFFER'
          ) {
            const kQty = k.kittedQuantity || k.rawQuantity || 0;
            if (kQty <= remainingToDeliver) {
              k.status = 'DELIVERED';
              k.endTime = new Date().toISOString();
              remainingToDeliver -= kQty;
              queueChanged = true;
            } else {
              // Partial delivery: split into DELIVERED and remaining IN_BUFFER
              const deliveredPart: KittingQueueItem = {
                ...k,
                id: `${k.id}-del-${Date.now()}`,
                rawQuantity: remainingToDeliver,
                kittedQuantity: remainingToDeliver,
                status: 'DELIVERED',
                endTime: new Date().toISOString(),
              };
              k.rawQuantity = kQty - remainingToDeliver;
              k.kittedQuantity = kQty - remainingToDeliver;
              refreshedQueue.push(deliveredPart);
              remainingToDeliver = 0;
              queueChanged = true;
              break;
            }
          }
        }
        if (queueChanged) {
          this.saveKittingQueue(refreshedQueue);
        }
      }

      updated.isStockDeducted = true;
    }

    return updated;
  },

  restoreStockFromMaterialCall(req: MaterialCallRequest): void {
    const isDirect =
      req.isDirectKitting ||
      req.bufferLocation === 'DCLR' ||
      req.bufferLocation === 'KHU BÓC TÁCH KITTING' ||
      req.bufferLocation?.toUpperCase().includes('DCLR') ||
      req.bufferLocation?.toUpperCase().includes('KITTING');

    if (isDirect) {
      // Revert stock back to PENDING_KITTING in kitting queue
      const queue = this.getKittingQueue();
      const dclrIdx = queue.findIndex(
        (k) =>
          (k.bufferLocation === 'Giao trực tiếp DCLR' || k.bufferLocation === 'DCLR' || k.bufferLocation === 'KHU BÓC TÁCH KITTING') &&
          k.partCode.trim().toLowerCase() === req.partCode.trim().toLowerCase() &&
          k.status === 'DELIVERED'
      );
      if (dclrIdx >= 0 && queue[dclrIdx].kittedQuantity === req.requestedQty) {
        queue[dclrIdx] = {
          ...queue[dclrIdx],
          status: 'PENDING_KITTING',
          kittedQuantity: 0,
        };
      } else {
        queue.unshift({
          id: 'kit-reverted-' + Date.now(),
          partCode: req.partCode,
          partName: req.partName,
          unit: req.unit,
          rawQuantity: req.requestedQty,
          kittedQuantity: 0,
          scrapQuantity: 0,
          bufferLocation: 'DCLR',
          status: 'PENDING_KITTING',
          createdAt: new Date().toISOString(),
          operatorName: 'Hệ thống (Hoàn trả đơn Andon)',
        });
      }
      this.saveKittingQueue(queue);
      return;
    }

    if (!req.bufferLocation) return;

    const buffers = this.getBufferLocations();
    const bIdx = buffers.findIndex((b) => b.locationId === req.bufferLocation);
    if (bIdx >= 0) {
      const targetBuf = buffers[bIdx];
      let items: BufferPartItem[] = targetBuf.items ? [...targetBuf.items] : [];

      const itemIdx = items.findIndex((i) => i.partCode?.trim().toLowerCase() === req.partCode?.trim().toLowerCase());
      if (itemIdx >= 0) {
        items[itemIdx].currentStockQty += req.requestedQty;
      } else {
        items.push({
          partCode: req.partCode,
          partName: req.partName,
          unit: req.unit,
          currentStockQty: req.requestedQty,
          lastUpdated: new Date().toISOString(),
        });
      }

      const totalStock = items.reduce((sum, i) => sum + (i.currentStockQty || 0), 0);
      buffers[bIdx] = {
        ...targetBuf,
        items,
        partCode: items[0]?.partCode,
        partName: items.length === 1 ? items[0]?.partName : items.length > 1 ? `${items.length} loại linh kiện` : undefined,
        unit: items[0]?.unit || 'PCS',
        currentStockQty: totalStock,
        status: 'READY',
        lastUpdated: new Date().toISOString(),
      };
      this.saveBufferLocations(buffers);
    }

    // Revert Kitting queue item status back to IN_BUFFER if it was DELIVERED
    const queue = this.getKittingQueue();
    const kIdx = queue.findIndex(
      (k) =>
        k.bufferLocation === req.bufferLocation &&
        k.partCode.trim().toLowerCase() === req.partCode.trim().toLowerCase() &&
        k.status === 'DELIVERED'
    );
    if (kIdx >= 0) {
      queue[kIdx].status = 'IN_BUFFER';
      this.saveKittingQueue(queue);
    }
  },

  async deleteMaterialCallRequest(requestId: string, restoreStockIfCompleted: boolean = true): Promise<void> {
    if (!requestId) return;
    await this.addDeletedCallId(requestId);
    const reqs = this.getMaterialCallRequests();
    const idx = reqs.findIndex((r) => r.requestId === requestId);
    if (idx !== -1) {
      const req = reqs[idx];
      if ((req.status === 'COMPLETED' || req.isStockDeducted) && restoreStockIfCompleted) {
        this.restoreStockFromMaterialCall(req);
      }
      reqs.splice(idx, 1);
    }
    // Lưu và đẩy qua hàng đợi Debounce mà không cần tải lại toàn bộ mảng MATERIAL_CALLS từ Cloud
    this.saveMaterialCallRequests(reqs);
    await flushWriteQueueToSupabase();
  },

  async clearAllCallingRequests(): Promise<void> {
    const reqs = this.getMaterialCallRequests();
    const calling = reqs.filter((r) => r.status === 'CALLING');
    for (const r of calling) {
      if (r.requestId) await this.addDeletedCallId(r.requestId);
    }
    const remaining = reqs.filter((r) => r.status !== 'CALLING');
    this.saveMaterialCallRequests(remaining);
    await flushWriteQueueToSupabase();
  },

  rollbackMaterialCallStatus(requestId: string, targetStatus: 'CALLING' | 'DELIVERING'): MaterialCallRequest {
    const reqs = this.getMaterialCallRequests();
    const idx = reqs.findIndex((r) => r.requestId === requestId);
    if (idx === -1) throw new Error('Không tìm thấy đơn yêu cầu cần rollback');

    const req = reqs[idx];
    if (req.status === 'COMPLETED') {
      this.restoreStockFromMaterialCall(req);
    }

    const updated: MaterialCallRequest = {
      ...req,
      status: targetStatus,
      deliveredAt: targetStatus === 'CALLING' ? undefined : req.deliveredAt,
      deliveredBy: targetStatus === 'CALLING' ? undefined : req.deliveredBy,
    };

    reqs[idx] = updated;
    this.saveMaterialCallRequests(reqs);
    return updated;
  },

  // --- BOM EXPORT VOUCHERS STORAGE ---
  getBomExportVouchers(): BomExportVoucher[] {
    const data = safeGetRaw(BOM_VOUCHERS_KEY);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  getBomVouchers(): BomExportVoucher[] {
    return this.getBomExportVouchers();
  },

  saveBomExportVouchers(vouchers: BomExportVoucher[]): void {
    safeSetRaw(BOM_VOUCHERS_KEY, JSON.stringify(vouchers));
    supabaseKeyStore.set(STORAGE_KEYS.BOM_VOUCHERS, vouchers);

    // CRITICAL: Tự động gỡ các mã phiếu đang HOẠT ĐỘNG (chưa rollback) khỏi danh sách đã xóa
    const activeCodes = vouchers
      .filter((v) => v.status !== 'ROLLED_BACK' && !(v as any).isDeletedFromKitting)
      .map((v) => v.voucherCode?.trim().toUpperCase())
      .filter((c): c is string => !!c);

    if (activeCodes.length > 0) {
      const raw = safeGetRaw(DELETED_BOM_VOUCHER_CODES_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter((c: string) => !activeCodes.includes(c.trim().toUpperCase()));
            if (cleaned.length !== parsed.length) {
              safeSetRaw(DELETED_BOM_VOUCHER_CODES_KEY, JSON.stringify(cleaned));
              supabaseKeyStore.set('thekho_deleted_bom_voucher_codes_v1', cleaned).catch(() => {});
            }
          }
        } catch (_) {}
      }
    }
  },

  saveBomVouchers(vouchers: BomExportVoucher[]): void {
    this.saveBomExportVouchers(vouchers);
  },

  /**
   * Đảm bảo mọi linh kiện đã xuất kho của phiếu BOM đang hoạt động đều có mặt trong hàng chờ bóc tách
   */
  syncActiveVoucherToKittingQueue(voucher: BomExportVoucher): void {
    if (!voucher || voucher.status === 'ROLLED_BACK' || (voucher as any).isDeletedFromKitting) return;
    const vCode = voucher.voucherCode?.trim();
    if (!vCode) return;
    const vTitle = `Model BOM: ${voucher.modelName}`;
    const queue = this.getKittingQueue();
    let updated = false;

    (voucher.items || []).forEach((item) => {
      const exportedQty = item.exportedQty ?? item.currentBatchQty ?? item.totalQtyOut ?? 0;
      if (exportedQty <= 0) return;
      const pCode = (item.partCode || '').trim();
      if (!pCode) return;

      const fullVTitle = `${vTitle}${item.isExtraConsumable ? ' (Tiêu hao thêm)' : ''}`.trim().toLowerCase();
      const existing = queue.find(
        (q) =>
          q.status === 'PENDING_KITTING' &&
          (q.voucherCode || '').trim().toUpperCase() === vCode.toUpperCase() &&
          ((q.voucherTitle || '').trim().toLowerCase() === fullVTitle || !q.voucherTitle) &&
          q.partCode.trim().toUpperCase() === pCode.toUpperCase()
      );

      if (!existing) {
        queue.unshift({
          id: 'kit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          voucherCode: vCode,
          voucherTitle: `${vTitle}${item.isExtraConsumable ? ' (Tiêu hao thêm)' : ''}`,
          sourceBin: item.fifoLocation || 'Kho chính',
          partCode: pCode,
          partName: item.partName || pCode,
          unit: item.unit || 'Cái',
          rawQuantity: exportedQty,
          kittedQuantity: 0,
          scrapQuantity: 0,
          bufferLocation: 'BUFFER-A1-01',
          status: 'PENDING_KITTING',
          createdAt: voucher.dateTime || voucher.createdAt || new Date().toISOString(),
          operatorName: voucher.person || 'Thủ kho',
        });
        updated = true;
      }
    });

    if (updated) {
      this.saveKittingQueue(queue);
    }
  },

  getBomVoucherById(id: string): BomExportVoucher | undefined {
    return this.getBomExportVouchers().find((v) => v.id === id || v.voucherCode === id);
  },

  updateBomExportVoucher(id: string, updates: Partial<BomExportVoucher>): BomExportVoucher {
    const vouchers = this.getBomExportVouchers();
    const idx = vouchers.findIndex((v) => v.id === id || v.voucherCode === id);
    if (idx === -1) throw new Error(`Không tìm thấy phiếu xuất kho BOM [${id}]!`);
    vouchers[idx] = {
      ...vouchers[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.saveBomExportVouchers(vouchers);
    return vouchers[idx];
  },

  addBomExportVoucher(params: {
    modelName: string;
    modelQty: number;
    dateTime: string;
    person: string;
    items: BomExportVoucherItem[];
    status?: 'ACTIVE' | 'PARTIAL' | 'COMPLETED' | 'ROLLED_BACK';
    dispatchRounds?: number;
    roundsHistory?: BomExportVoucherRoundRecord[];
    notes?: string;
  }): BomExportVoucher {
    const vouchers = this.getBomExportVouchers();
    const deletedCodes = this.getDeletedBomVoucherCodes();
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const usedCodes = new Set(
      vouchers
        .map((v) => v.voucherCode?.trim().toUpperCase())
        .filter((c): c is string => !!c && c.startsWith(`PXK-BOM-${todayStr}-`))
    );
    deletedCodes.forEach((c) => {
      if (c && c.toUpperCase().startsWith(`PXK-BOM-${todayStr}-`)) {
        usedCodes.add(c.trim().toUpperCase());
      }
    });

    let seq = 1;
    while (usedCodes.has(`PXK-BOM-${todayStr}-${String(seq).padStart(3, '0')}`)) {
      seq++;
    }
    const voucherCode = `PXK-BOM-${todayStr}-${String(seq).padStart(3, '0')}`;

    const totalQtyRequired = params.items.reduce((sum, i) => sum + (i.requiredQty ?? (i.bomQtyPerSet * params.modelQty) ?? 0), 0);
    const totalQtyOut = params.items.reduce((sum, i) => sum + (i.exportedQty ?? i.totalQtyOut ?? 0), 0);
    const totalQtyRemaining = Math.max(0, totalQtyRequired - totalQtyOut);
    const status = params.status || (totalQtyRemaining > 0 ? 'PARTIAL' : 'COMPLETED');

    const newVoucher: BomExportVoucher = {
      id: 'vxk-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      voucherCode,
      modelName: params.modelName,
      modelQty: params.modelQty,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dateTime: params.dateTime || new Date().toISOString(),
      person: params.person,
      items: params.items,
      totalPartsCount: params.items.length,
      totalQtyRequired,
      totalQtyOut,
      totalQtyRemaining,
      voucherType: 'BOM',
      status,
      dispatchRounds: params.dispatchRounds || 1,
      roundsHistory: params.roundsHistory || [],
      notes: params.notes,
    };

    vouchers.unshift(newVoucher);
    this.saveBomExportVouchers(vouchers);
    this.syncActiveVoucherToKittingQueue(newVoucher);
    return newVoucher;
  },

  getDeletedBomVoucherCodes(): string[] {
    const raw = safeGetRaw(DELETED_BOM_VOUCHER_CODES_KEY);
    let parsed: string[] = [];
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        parsed = Array.isArray(arr) ? arr : [];
      } catch {
        parsed = [];
      }
    }

    // CRITICAL: Các phiếu đang ACTIVE trong bomVouchers TUYỆT ĐỐI không bị xem là đã xóa
    const activeVouchers = this.getBomExportVouchers().filter(
      (v) => v.status !== 'ROLLED_BACK' && !(v as any).isDeletedFromKitting
    );
    const activeCodes = new Set(
      activeVouchers.map((v) => v.voucherCode?.trim().toUpperCase()).filter((c): c is string => !!c)
    );

    return parsed.filter((c) => !activeCodes.has(c.trim().toUpperCase()));
  },

  async removeDeletedBomVoucherCode(code: string): Promise<void> {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    const raw = safeGetRaw(DELETED_BOM_VOUCHER_CODES_KEY);
    let parsed: string[] = [];
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        parsed = Array.isArray(arr) ? arr : [];
      } catch {
        parsed = [];
      }
    }
    const updated = parsed.filter((c) => c.trim().toUpperCase() !== clean);
    safeSetRaw(DELETED_BOM_VOUCHER_CODES_KEY, JSON.stringify(updated));
    await supabaseKeyStore.set('thekho_deleted_bom_voucher_codes_v1', updated).catch(() => {});
  },

  async addDeletedBomVoucherCode(code: string): Promise<void> {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    const current = this.getDeletedBomVoucherCodes();
    if (!current.includes(clean)) {
      const updated = [...current, clean];
      safeSetRaw(DELETED_BOM_VOUCHER_CODES_KEY, JSON.stringify(updated));
      await supabaseKeyStore.set('thekho_deleted_bom_voucher_codes_v1', updated).catch(() => {});
    }
  },

  async deleteBomExportVoucher(idOrCode: string): Promise<boolean> {
    const cleanTarget = idOrCode.trim();
    if (!cleanTarget) return false;

    const vouchers = this.getBomExportVouchers();
    const targetIdx = vouchers.findIndex(
      (v) => v.id === cleanTarget || v.voucherCode?.trim().toUpperCase() === cleanTarget.toUpperCase()
    );
    const targetVoucher = targetIdx >= 0 ? vouchers[targetIdx] : null;
    const voucherCode = targetVoucher?.voucherCode?.trim() || (cleanTarget.startsWith('PXK-') ? cleanTarget : '');

    // 1. Thêm vào danh sách mã phiếu đã xóa cấm tái lập vĩnh viễn
    if (voucherCode) {
      await this.addDeletedBomVoucherCode(voucherCode);
    }

    // 2. Xóa khỏi danh sách phiếu xuất BOM
    const updatedVouchers = vouchers.filter(
      (v) => v.id !== cleanTarget && (!voucherCode || v.voucherCode?.trim().toUpperCase() !== voucherCode.toUpperCase())
    );
    this.saveBomExportVouchers(updatedVouchers);

    // 3. Xóa vĩnh viễn toàn bộ linh kiện của mã phiếu này trong Hàng chờ bóc tách Kitting
    let updatedQueue = this.getKittingQueue();
    if (voucherCode) {
      const upperVc = voucherCode.toUpperCase();
      updatedQueue = updatedQueue.filter((q) => {
        const qVc = (q.voucherCode || '').trim().toUpperCase();
        return qVc !== upperVc;
      });
      this.saveKittingQueue(updatedQueue);
    }

    // 4. Đồng bộ tức thời lên Supabase Cloud database
    await Promise.all([
      supabaseKeyStore.set(STORAGE_KEYS.BOM_VOUCHERS, updatedVouchers).catch(() => {}),
      supabaseKeyStore.set(STORAGE_KEYS.KITTING_QUEUE, updatedQueue).catch(() => {}),
    ]);

    return true;
  },

  /**
   * KÍCH HOẠT THEO YÊU CẦU (ON-DEMAND): Đối soát & Bù phiếu xuất kho BOM & Kitting Queue từ transactions.
   * Giới hạn phạm vi: chỉ quét các giao dịch xuất trong ngày/tuần hiện tại (mặc định 7 ngày gần nhất).
   * Tự động tái lập các phiếu còn thiếu và đẩy đồng bộ ngay lên Supabase Cloud.
   * TUYỆT ĐỐI KHÔNG TÁI LẬP CÁC PHIẾU ĐÃ BỊ NGƯỜI DÙNG XÓA HOẶC ROLLBACK!
   */
  async reconcileBomVouchersAndQueueFromTransactions(options?: { daysLimit?: number }): Promise<{
    restoredVouchers: number;
    restoredQueueItems: number;
    scannedCount: number;
    totalVouchersCount: number;
  }> {
    let restoredVouchers = 0;
    let restoredQueueItems = 0;

    // Giới hạn phạm vi ngày/tuần hiện tại (mặc định 7 ngày)
    const days = options?.daysLimit && options.daysLimit > 0 ? options.daysLimit : 7;
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    let txs = this.getTransactions();
    // Nếu trong RAM chưa có, chỉ truy vấn các giao dịch trong phạm vi `daysLimit` ngày gần nhất (không bao giờ gọi selectAllTransactions)
    if (!txs || txs.length === 0) {
      try {
        const recentTxs = await supabaseRelationalStore.selectTransactions({
          startDate: new Date(cutoffTime).toISOString(),
          limit: 200,
        });
        if (recentTxs && recentTxs.length > 0) {
          txs = recentTxs;
          inMemoryTransactions = recentTxs;
        }
      } catch (_) {}
    }

    if (!txs || txs.length === 0) {
      return { restoredVouchers: 0, restoredQueueItems: 0, scannedCount: 0, totalVouchersCount: this.getBomExportVouchers().length };
    }

    const vouchers = this.getBomExportVouchers();
    let queue = this.getKittingQueue();
    const modelBoms = this.getModelBOMs();

    // 0. Xác định danh sách các mã phiếu đã bị Rollback hoặc đã bị người dùng XÓA để tuyệt đối không bao giờ tái tạo lại
    const deletedBomCodes = this.getDeletedBomVoucherCodes();
    const rolledBackOrDeletedCodes = new Set<string>();
    deletedBomCodes.forEach((c) => rolledBackOrDeletedCodes.add(c.trim().toUpperCase()));

    vouchers.forEach((v) => {
      const vCode = v.voucherCode?.trim().toUpperCase();
      if (!vCode) return;
      if (v.status === 'ROLLED_BACK' || (v as any).isDeletedFromKitting) {
        rolledBackOrDeletedCodes.add(vCode);
      } else {
        // Phiếu đang HOẠT ĐỘNG (chưa rollback) TUYỆT ĐỐI không bị xem là đã xóa
        rolledBackOrDeletedCodes.delete(vCode);
      }
    });

    txs.forEach((t) => {
      if (t.type === 'IN' && ((t.reasonOrPurpose || '').includes('Rollback') || (t.notes || '').includes('Rollback'))) {
        const m = (t.notes || '').match(/\[(PXK-[^\]]+)\]/i);
        if (m) {
          const rbCode = m[1].trim().toUpperCase();
          const isActive = vouchers.some(
            (v) => (v.voucherCode || '').trim().toUpperCase() === rbCode && v.status !== 'ROLLED_BACK' && !(v as any).isDeletedFromKitting
          );
          if (!isActive) {
            rolledBackOrDeletedCodes.add(rbCode);
          }
        }
      }
    });

    // Dọn dẹp ngay các mục PENDING_KITTING mồ côi của những phiếu đã Rollback hoặc đã bị Xóa
    let queueUpdated = false;
    const beforeLen = queue.length;
    queue = queue.filter((q) => {
      if (q.status === 'PENDING_KITTING' && q.voucherCode && rolledBackOrDeletedCodes.has(q.voucherCode.trim().toUpperCase())) {
        return false;
      }
      return true;
    });
    if (queue.length !== beforeLen) {
      queueUpdated = true;
    }

    // Tìm các giao dịch xuất theo BOM trong phạm vi thời gian chỉ định
    const bomTxs = txs.filter((t) => {
      if (t.type !== 'OUT') return false;
      const tTime = new Date(t.date).getTime();
      if (!isNaN(tTime) && tTime < cutoffTime) return false;

      // BỎ QUA HOÀN TOÀN nếu giao dịch này thuộc về bất kỳ phiếu nào đã bị Xóa hoặc Rollback
      const pxkMatch = (t.notes || '').match(/(PXK-BOM-\d{8}-\d{3})/i);
      if (pxkMatch && rolledBackOrDeletedCodes.has(pxkMatch[1].toUpperCase())) {
        return false;
      }
      if (t.voucherCode && rolledBackOrDeletedCodes.has(t.voucherCode.trim().toUpperCase())) {
        return false;
      }

      return (
        !!pxkMatch ||
        !!t.voucherCode ||
        t.notes?.toUpperCase().includes('MODEL') ||
        (t.reasonOrPurpose && t.reasonOrPurpose.includes('BOM')) ||
        t.productionOrder?.toUpperCase().includes('SHA')
      );
    });

    // Gom nhóm giao dịch theo Mã phiếu rõ ràng hoặc theo (Model + Mốc giờ:phút xuất + Số bộ) để KHÔNG gộp nhầm các đợt xuất khác nhau trong cùng ngày
    const groupMap = new Map<
      string,
      { explicitCode?: string; modelName: string; date: string; person: string; modelQty: number; txs: Transaction[] }
    >();

    for (const tx of bomTxs) {
      let modelName = (tx.productionOrder || '').trim().toUpperCase();
      if (!modelName || !modelBoms.some((b) => b.name.toUpperCase() === modelName)) {
        const match = (tx.notes || '').match(/Model\s+([A-Z0-9]+)/i);
        if (match) modelName = match[1].trim().toUpperCase();
      }
      if (!modelName) continue;

      let modelQty = 1;
      const qtyMatch = (tx.notes || '').match(/\((\d+)\s*bộ\)/i);
      if (qtyMatch) {
        modelQty = parseInt(qtyMatch[1], 10) || 1;
      }

      const pxkMatch = (tx.notes || '').match(/(PXK-BOM-\d{8}-\d{3})/i);
      const explicitCode = pxkMatch ? pxkMatch[1].toUpperCase() : undefined;

      // Bỏ qua các giao dịch xuất bù (vì đã thuộc về phiếu gốc)
      if ((tx.notes || '').includes('Xuất bù Đợt') || (tx.reasonOrPurpose || '').includes('Xuất bù')) {
        continue;
      }

      const minuteKey = (tx.date || '').slice(0, 16); // YYYY-MM-DDTHH:mm
      const groupKey = explicitCode ? `CODE__${explicitCode}` : `${modelName}__${minuteKey}__${modelQty}`;

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          explicitCode,
          modelName,
          date: tx.date,
          person: tx.person || 'Sunhouse (Quản Trị Hệ Thống (Admin))',
          modelQty,
          txs: [tx],
        });
      } else {
        groupMap.get(groupKey)!.txs.push(tx);
      }
    }

    let vouchersUpdated = false;

    groupMap.forEach((group) => {
      const { explicitCode, modelName, date, person, modelQty, txs: groupTxs } = group;
      if (explicitCode && rolledBackOrDeletedCodes.has(explicitCode)) return;

      const matchingBom = modelBoms.find((b) => b.name.toUpperCase() === modelName);
      if (!matchingBom) return;

      // Kiểm tra xem đợt xuất này đã có phiếu tương ứng chưa (khớp theo mã phiếu, hoặc khớp theo Model + số bộ + thời điểm gần nhau)
      const existingVoucher = vouchers.find((v) => {
        if (explicitCode && v.voucherCode?.trim().toUpperCase() === explicitCode) return true;
        if (v.modelName?.toUpperCase() !== modelName) return false;
        const vDate = v.dateTime || v.createdAt || '';
        if (!vDate.startsWith(date.slice(0, 10))) return false;
        const timeDiff = Math.abs(new Date(vDate).getTime() - new Date(date).getTime());
        return v.modelQty === modelQty && timeDiff <= 5 * 60 * 1000;
      });

      if (existingVoucher && (existingVoucher.status === 'ROLLED_BACK' || (existingVoucher as any).isDeletedFromKitting)) {
        return;
      }

      let targetVoucherCode = existingVoucher?.voucherCode;

      if (!existingVoucher) {
        const dateFormatted = date.slice(0, 10).replace(/-/g, '');
        const usedCodes = new Set<string>();
        vouchers.forEach((v) => {
          if (v.voucherCode) usedCodes.add(v.voucherCode.trim().toUpperCase());
        });
        queue.forEach((q) => {
          if (q.voucherCode) usedCodes.add(q.voucherCode.trim().toUpperCase());
        });
        rolledBackOrDeletedCodes.forEach((c) => usedCodes.add(c.toUpperCase()));

        if (explicitCode && !usedCodes.has(explicitCode)) {
          targetVoucherCode = explicitCode;
        } else {
          let seq = 1;
          while (usedCodes.has(`PXK-BOM-${dateFormatted}-${String(seq).padStart(3, '0')}`)) {
            seq++;
          }
          targetVoucherCode = `PXK-BOM-${dateFormatted}-${String(seq).padStart(3, '0')}`;
        }

        const txByPart = new Map<string, number>();
        const locByPart = new Map<string, string>();
        const sampleTxByPart = new Map<string, Transaction>();
        groupTxs.forEach((t) => {
          const pKey = t.partCode.trim().toLowerCase();
          txByPart.set(pKey, (txByPart.get(pKey) || 0) + (Number(t.quantity) || 0));
          if (t.locationId && !locByPart.get(pKey)?.includes(t.locationId)) {
            locByPart.set(pKey, locByPart.get(pKey) ? `${locByPart.get(pKey)}, ${t.locationId}` : t.locationId);
          }
          if (!sampleTxByPart.has(pKey)) sampleTxByPart.set(pKey, t);
        });

        const printedItems: BomExportVoucherItem[] = [];
        const round1Items: Array<{ partCode: string; quantity: number; fifoLocation: string }> = [];

        for (const bItem of matchingBom.items) {
          const pCode = bItem.partCode.trim();
          const pKey = pCode.toLowerCase();
          const tx = sampleTxByPart.get(pKey);
          const requiredQty = Math.round((Number(bItem.quantity) || 0) * modelQty * 1000) / 1000;
          const exportedQty = Math.round((txByPart.get(pKey) || 0) * 1000) / 1000;
          const remainingQty = Math.max(0, Math.round((requiredQty - exportedQty) * 1000) / 1000);

          let status: 'PENDING' | 'PARTIAL' | 'COMPLETED' = 'PENDING';
          if (exportedQty >= requiredQty) status = 'COMPLETED';
          else if (exportedQty > 0) status = 'PARTIAL';

          const itemObj: BomExportVoucherItem = {
            partCode: pCode,
            partName: bItem.partName || (tx ? tx.partName : ''),
            unit: bItem.unit || (tx ? tx.unit : 'Cái'),
            bomQtyPerSet: Number(bItem.quantity) || 0,
            requiredQty,
            exportedQty,
            remainingQty,
            currentBatchQty: exportedQty,
            totalQtyOut: exportedQty,
            fifoLocation: locByPart.get(pKey) || (tx ? tx.locationId || 'Kho1200' : 'Kho chính'),
            status,
            isExtraConsumable: false,
            extraNote: '',
          };
          printedItems.push(itemObj);

          if (exportedQty > 0) {
            round1Items.push({
              partCode: pCode,
              quantity: exportedQty,
              fifoLocation: itemObj.fifoLocation,
            });
          }
        }

        const totalQtyRequired = Math.round(printedItems.reduce((s, i) => s + (i.requiredQty || 0), 0) * 1000) / 1000;
        const totalQtyOut = Math.round(printedItems.reduce((s, i) => s + (i.exportedQty || 0), 0) * 1000) / 1000;
        const totalQtyRemaining = Math.max(0, Math.round((totalQtyRequired - totalQtyOut) * 1000) / 1000);

        const newVoucher: BomExportVoucher = {
          id: 'vxk-' + new Date(date).getTime() + '-' + modelName.toLowerCase() + '-' + modelQty,
          voucherCode: targetVoucherCode,
          modelName,
          modelQty,
          createdAt: date,
          updatedAt: new Date().toISOString(),
          dateTime: date,
          person,
          items: printedItems,
          totalPartsCount: printedItems.length,
          totalQtyRequired,
          totalQtyOut,
          totalQtyRemaining,
          voucherType: 'BOM',
          status: totalQtyRemaining > 0 ? 'PARTIAL' : 'COMPLETED',
          dispatchRounds: 1,
          roundsHistory: [
            {
              roundNumber: 1,
              dateTime: date,
              person,
              notes:
                totalQtyRemaining > 0
                  ? `Đợt 1 (Còn thiếu ${totalQtyRemaining.toLocaleString('vi-VN')} linh kiện chờ xuất bù)`
                  : 'Đã xuất đủ 100% trong đợt 1',
              items: round1Items,
            },
          ],
          notes: `Xuất theo BOM Model ${modelName} (${modelQty} bộ)`,
        };

        vouchers.unshift(newVoucher);
        vouchersUpdated = true;
        restoredVouchers++;
      }

      // Đảm bảo các linh kiện đã xuất có trong hàng chờ bóc tách Kitting (chỉ khi phiếu chưa bị xóa hoặc rollback)
      if (targetVoucherCode && !rolledBackOrDeletedCodes.has(targetVoucherCode.toUpperCase())) {
        for (const tx of groupTxs) {
          const alreadyInQueue = queue.some(
            (q) =>
              ((q.voucherCode === targetVoucherCode && (q.voucherTitle?.includes(modelName) || !q.voucherTitle)) ||
                q.transactionId === tx.id ||
                (Array.isArray(q.transactionIds) && q.transactionIds.includes(tx.id))) &&
              q.partCode.trim().toLowerCase() === tx.partCode.trim().toLowerCase()
          );

          if (!alreadyInQueue && Number(tx.quantity) > 0) {
            queue.push({
              id: 'kit-' + (tx.id || String(Date.now())) + '-' + Math.random().toString(36).substring(2, 6),
              transactionId: tx.id,
              transactionIds: [tx.id],
              voucherCode: targetVoucherCode,
              voucherTitle: `Model BOM: ${modelName}`,
              sourceBin: tx.locationId || 'Kho1200',
              partCode: tx.partCode,
              partName: tx.partName,
              unit: tx.unit || 'Cái',
              rawQuantity: Number(tx.quantity),
              kittedQuantity: 0,
              scrapQuantity: 0,
              bufferLocation: 'BUFFER-A1-01',
              status: 'PENDING_KITTING',
              createdAt: tx.date || date,
              operatorName: tx.person || person,
            });
            queueUpdated = true;
            restoredQueueItems++;
          }
        }
      }
    });

    if (vouchersUpdated) {
      this.saveBomExportVouchers(vouchers);
    }
    if (queueUpdated) {
      this.saveKittingQueue(queue);
    }
    await Promise.all([
      supabaseKeyStore.set(STORAGE_KEYS.BOM_VOUCHERS, vouchers).catch(() => {}),
      supabaseKeyStore.set(STORAGE_KEYS.KITTING_QUEUE, queue).catch(() => {}),
    ]);

    return {
      restoredVouchers,
      restoredQueueItems,
      scannedCount: bomTxs.length,
      totalVouchersCount: vouchers.length,
    };
  },

  // --- USER ACCOUNTS STORAGE & AUTH ---
  getUsers(): UserAccount[] {
    const data = safeGetRaw('thekho_users_v1');
    if (!data) {
      safeSetRaw('thekho_users_v1', JSON.stringify(DEFAULT_SYSTEM_USERS));
      supabaseKeyStore.set('thekho_users_v1', DEFAULT_SYSTEM_USERS);
      return DEFAULT_SYSTEM_USERS;
    }
    try {
      const parsed: UserAccount[] = JSON.parse(data);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        safeSetRaw('thekho_users_v1', JSON.stringify(DEFAULT_SYSTEM_USERS));
        supabaseKeyStore.set('thekho_users_v1', DEFAULT_SYSTEM_USERS);
        return DEFAULT_SYSTEM_USERS;
      }

      // Check if parsed list is missing any of the 12 default accounts or contains old dummy placeholder users
      const hasOldDummy = parsed.some(
        (u) =>
          u.username === 'kitting' ||
          u.fullName === 'Lê Thị Hoa' ||
          u.fullName === 'Trần Văn Bình' ||
          u.fullName === 'Nguyễn Văn Quản Trị' ||
          u.fullName === 'Phạm Văn Mạnh'
      );

      if (parsed.length < 12 || hasOldDummy) {
        // Automatically merge/reconcile so all 12 canonical accounts are always present
        const merged: UserAccount[] = [];
        for (const defUser of DEFAULT_SYSTEM_USERS) {
          const existing = parsed.find(
            (p) => p.username.toLowerCase() === defUser.username.toLowerCase()
          );
          if (existing) {
            merged.push({
              ...defUser,
              password: existing.password || defUser.password,
              lastLoginAt: existing.lastLoginAt,
            });
          } else {
            merged.push(defUser);
          }
        }

        // Keep any extra custom user accounts created by user (excluding old dummy placeholders)
        for (const p of parsed) {
          const isStandard = DEFAULT_SYSTEM_USERS.some(
            (d) => d.username.toLowerCase() === p.username.toLowerCase()
          );
          const isOldDummy =
            p.username === 'kitting' ||
            p.fullName === 'Lê Thị Hoa' ||
            p.fullName === 'Trần Văn Bình' ||
            p.fullName === 'Nguyễn Văn Quản Trị' ||
            p.fullName === 'Phạm Văn Mạnh';
          if (!isStandard && !isOldDummy) {
            merged.push(p);
          }
        }

        localStorage.setItem('thekho_users_v1', JSON.stringify(merged));
        supabaseKeyStore.set('thekho_users_v1', merged);
        return merged;
      }

      // Migrate legacy tabs & add ng_warehouse if applicable
      return parsed.map((u) => {
        let tabs = [...(u.allowedTabs || [])];
        if (tabs.includes('andon' as any)) {
          tabs = tabs.filter((t) => (t as any) !== 'andon');
          if (!tabs.includes('andon_request')) tabs.push('andon_request');
          if (!tabs.includes('andon_calling')) tabs.push('andon_calling');
          if (!tabs.includes('andon_delivering')) tabs.push('andon_delivering');
        }
        if (u.username === 'admin' || tabs.includes('stock_in') || tabs.includes('stock_out')) {
          if (!tabs.includes('ng_warehouse')) {
            tabs.push('ng_warehouse');
          }
        }
        return { ...u, allowedTabs: tabs };
      });
    } catch {
      localStorage.setItem('thekho_users_v1', JSON.stringify(DEFAULT_SYSTEM_USERS));
      return DEFAULT_SYSTEM_USERS;
    }
  },

  saveUsers(users: UserAccount[]): void {
    localStorage.setItem('thekho_users_v1', JSON.stringify(users));
    supabaseKeyStore.set('thekho_users_v1', users);
  },

  async syncUsersToSupabase(): Promise<{ success: boolean; count: number; message: string }> {
    const current = this.getUsers();
    localStorage.setItem('thekho_users_v1', JSON.stringify(current));
    const ok = await supabaseKeyStore.set('thekho_users_v1', current);
    return {
      success: ok,
      count: current.length,
      message: ok
        ? `Đã lưu & đồng bộ thành công ${current.length} tài khoản lên Supabase Cloud!`
        : 'Có lỗi khi lưu lên Supabase, vui lòng kiểm tra kết nối mạng!',
    };
  },

  async resetToDefaultSystemUsers(): Promise<{ success: boolean; users: UserAccount[] }> {
    localStorage.setItem('thekho_users_v1', JSON.stringify(DEFAULT_SYSTEM_USERS));
    const ok = await supabaseKeyStore.set('thekho_users_v1', DEFAULT_SYSTEM_USERS);
    return {
      success: ok,
      users: DEFAULT_SYSTEM_USERS,
    };
  },

  getUserById(id: string): UserAccount | undefined {
    return this.getUsers().find((u) => u.id === id);
  },

  getUserByUsername(username: string): UserAccount | undefined {
    const clean = username.trim().toLowerCase();
    return this.getUsers().find((u) => u.username.toLowerCase() === clean);
  },

  async fetchUsersFromCloud(): Promise<UserAccount[]> {
    try {
      const remoteUsers = await supabaseKeyStore.get<UserAccount[]>('thekho_users_v1', { forceFresh: true });
      if (remoteUsers && Array.isArray(remoteUsers) && remoteUsers.length > 0) {
        localStorage.setItem('thekho_users_v1', JSON.stringify(remoteUsers));
        return remoteUsers;
      }
    } catch {
      // safe fallback
    }
    return this.getUsers();
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
      canConfigureBuffer: Boolean(params.canConfigureBuffer),
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
    const data = safeGetRaw('thekho_current_user_v1');
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

  canConfigureOutbuffer(user?: UserAccount | null): boolean {
    const target = user !== undefined ? user : this.getCurrentUser();
    if (!target) return false;
    if (this.isAdminUser(target)) return true;
    return Boolean(target.canConfigureBuffer);
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
  // On-demand from Supabase Cloud / In-Memory RAM, ZERO localStorage (~1MB saved)
  getMasterContainerTags(): MasterKittingTag[] {
    try {
      localStorage.removeItem(MASTER_CONTAINER_TAGS_KEY);
    } catch (_) {}

    if (inMemoryMasterContainerTags && inMemoryMasterContainerTags.length > 0) {
      return inMemoryMasterContainerTags;
    }
    return SAMPLE_MASTER_TAGS;
  },

  async fetchMasterContainerTagsOnDemand(): Promise<MasterKittingTag[]> {
    try {
      localStorage.removeItem(MASTER_CONTAINER_TAGS_KEY);
    } catch (_) {}

    if (inMemoryMasterContainerTags && inMemoryMasterContainerTags.length > 0) {
      return inMemoryMasterContainerTags;
    }

    try {
      const cloudTags = await supabaseKeyStore.get<MasterKittingTag[]>(STORAGE_KEYS.MASTER_CONTAINER_TAGS, { forceFresh: true });
      if (cloudTags && Array.isArray(cloudTags) && cloudTags.length > 0) {
        inMemoryMasterContainerTags = cloudTags;
        return cloudTags;
      }
    } catch (e) {
      console.warn('[Storage] Error fetching master container tags on-demand:', e);
    }

    inMemoryMasterContainerTags = SAMPLE_MASTER_TAGS;
    return SAMPLE_MASTER_TAGS;
  },

  saveMasterContainerTags(tags: MasterKittingTag[]): void {
    inMemoryMasterContainerTags = tags;
    try {
      localStorage.removeItem(MASTER_CONTAINER_TAGS_KEY);
    } catch (_) {}
    supabaseKeyStore.setCloudOnly(STORAGE_KEYS.MASTER_CONTAINER_TAGS, tags);
  },

  resetMasterContainerTags(): MasterKittingTag[] {
    inMemoryMasterContainerTags = SAMPLE_MASTER_TAGS;
    try {
      localStorage.removeItem(MASTER_CONTAINER_TAGS_KEY);
    } catch (_) {}
    supabaseKeyStore.setCloudOnly(STORAGE_KEYS.MASTER_CONTAINER_TAGS, SAMPLE_MASTER_TAGS);
    return SAMPLE_MASTER_TAGS;
  },

  /**
   * Validate and find Container Tag from Master Data (539 Tags) or Custom Generated Tags
   * Strict validation: Only returns valid if the scanned code or partCode is in Master Data or Custom Tags
   */
  findAndValidateContainerTag(rawInput: string): {
    isValid: boolean;
    matchedTag?: MasterKittingTag;
    source?: 'MASTER_DATA' | 'CUSTOM_GENERATED';
    extractedPartCode?: string;
    extractedQty?: number;
    errorReason?: string;
  } {
    if (!rawInput || !rawInput.trim()) {
      return {
        isValid: false,
        errorReason: 'Chuỗi quét rỗng hoặc không có dữ liệu!',
      };
    }

    const rawClean = rawInput.trim();
    const rawCleanLower = rawClean.toLowerCase();

    const masterTags = this.getMasterContainerTags();
    const customTags = this.getCustomGeneratedContainerTags();

    // 1. Direct match with qrPayload, id, or partCode
    // Master tags first
    let foundMaster = masterTags.find(
      (m) =>
        (m.qrPayload && m.qrPayload.trim().toLowerCase() === rawCleanLower) ||
        (m.id && m.id.trim().toLowerCase() === rawCleanLower) ||
        (m.partCode && m.partCode.trim().toLowerCase() === rawCleanLower)
    );
    if (foundMaster) {
      return {
        isValid: true,
        matchedTag: foundMaster,
        source: 'MASTER_DATA',
        extractedPartCode: foundMaster.partCode,
        extractedQty: foundMaster.standardQty,
      };
    }

    // Custom tags
    let foundCustom = customTags.find(
      (c) =>
        (c.qrPayload && c.qrPayload.trim().toLowerCase() === rawCleanLower) ||
        (c.id && c.id.trim().toLowerCase() === rawCleanLower) ||
        (c.partCode && c.partCode.trim().toLowerCase() === rawCleanLower)
    );
    if (foundCustom) {
      return {
        isValid: true,
        matchedTag: foundCustom,
        source: 'CUSTOM_GENERATED',
        extractedPartCode: foundCustom.partCode,
        extractedQty: foundCustom.standardQty,
      };
    }

    // 2. Parse Pipe format: e.g. "04-29-05-SHA76210KL-0001||CAO_SU" or "04-29-05-SHA76210KL-0001|100|CAO_SU" or "CONT_IN|04-29-05-SHA76210KL-0001|..."
    let parsedCode = '';
    let parsedQty: number | undefined = undefined;

    if (rawClean.includes('|')) {
      const parts = rawClean.split('|').map((s) => s.trim()).filter(Boolean);
      if (rawClean.startsWith('CONT_IN|') && parts.length > 1) {
        parsedCode = parts[1];
        if (parts[2] && !isNaN(parseFloat(parts[2]))) parsedQty = parseFloat(parts[2]);
      } else if (parts.length > 0) {
        parsedCode = parts[0];
        if (parts.length > 1 && !isNaN(parseFloat(parts[1]))) parsedQty = parseFloat(parts[1]);
      }
    }

    // 3. Parse JSON format
    if (!parsedCode && rawClean.startsWith('{') && rawClean.endsWith('}')) {
      try {
        const obj = JSON.parse(rawClean);
        parsedCode = String(obj.partCode || obj.code || obj.part_code || obj.maLK || '').trim();
        if (obj.qty || obj.quantity || obj.sl) {
          parsedQty = parseFloat(obj.qty || obj.quantity || obj.sl);
        }
      } catch {}
    }

    // 4. Parse standard code format via regex e.g. 04-29-05-SHA76210KL-0001
    if (!parsedCode) {
      const codeRegex = /\b\d{2}-\d{2}-\d{2}-[A-Za-z0-9-]+\b/i;
      const match = rawClean.match(codeRegex);
      if (match) {
        parsedCode = match[0].trim();
      }
    }

    // If parsedCode is found, verify if this code exists in Master Tags or Custom Tags
    if (parsedCode) {
      const codeLower = parsedCode.toLowerCase();
      const mMatch = masterTags.find(
        (m) =>
          m.partCode.trim().toLowerCase() === codeLower ||
          (m.qrPayload && m.qrPayload.trim().toLowerCase().includes(codeLower))
      );
      if (mMatch) {
        return {
          isValid: true,
          matchedTag: mMatch,
          source: 'MASTER_DATA',
          extractedPartCode: mMatch.partCode,
          extractedQty: parsedQty !== undefined ? parsedQty : mMatch.standardQty,
        };
      }

      const cMatch = customTags.find(
        (c) =>
          c.partCode.trim().toLowerCase() === codeLower ||
          (c.qrPayload && c.qrPayload.trim().toLowerCase().includes(codeLower))
      );
      if (cMatch) {
        return {
          isValid: true,
          matchedTag: cMatch,
          source: 'CUSTOM_GENERATED',
          extractedPartCode: cMatch.partCode,
          extractedQty: parsedQty !== undefined ? parsedQty : cMatch.standardQty,
        };
      }
    }

    // 5. Check if any known tag's partCode is contained within the scanned string
    const allKnown = [
      ...masterTags.map((t) => ({ tag: t, source: 'MASTER_DATA' as const })),
      ...customTags.map((t) => ({ tag: t, source: 'CUSTOM_GENERATED' as const })),
    ].sort((a, b) => b.tag.partCode.length - a.tag.partCode.length);

    for (const item of allKnown) {
      const pCodeLower = item.tag.partCode.trim().toLowerCase();
      if (pCodeLower && rawCleanLower.includes(pCodeLower)) {
        return {
          isValid: true,
          matchedTag: item.tag,
          source: item.source,
          extractedPartCode: item.tag.partCode,
          extractedQty: parsedQty !== undefined ? parsedQty : item.tag.standardQty,
        };
      }
    }

    // 6. Check if it matches any part directly from Master Data (getParts)
    const allParts = this.getParts();
    const matchedPart = allParts.find(
      (p) =>
        p.code.trim().toLowerCase() === rawCleanLower ||
        (parsedCode && p.code.trim().toLowerCase() === parsedCode.toLowerCase())
    );
    if (matchedPart) {
      const syntheticTag: MasterKittingTag = {
        id: `tag-${matchedPart.code}`,
        stt: 'Số 1',
        groupName: 'Nhóm linh kiện',
        ccdcSpec: '',
        groupConfig: getPartGroupConfig('Nhóm linh kiện'),
        partCode: matchedPart.code,
        partName: matchedPart.name,
        unit: matchedPart.unit || 'PCS',
        standardQty: parsedQty !== undefined && parsedQty > 0 ? parsedQty : 10,
        qrPayload: `CONT_IN|${matchedPart.code}|${parsedQty || 10}|MASTER|tag-${matchedPart.code}`,
      };
      return {
        isValid: true,
        matchedTag: syntheticTag,
        source: 'MASTER_DATA',
        extractedPartCode: matchedPart.code,
        extractedQty: parsedQty !== undefined ? parsedQty : syntheticTag.standardQty,
      };
    }

    // NOT FOUND: STRICT REJECTION
    return {
      isValid: false,
      errorReason: `Mã "${rawClean.length > 35 ? rawClean.substring(0, 35) + '...' : rawClean}" KHÔNG TỒN TẠI trong Danh Sách Thẻ Thùng Master Data (${masterTags.length} Thẻ) hoặc Thẻ Thùng Phát Sinh! Hệ thống chỉ chấp nhận mã Thẻ Thùng hợp lệ.`,
    };
  },

  // --- CONVERSION FACTORS (HỆ SỐ QUY ĐỔI) ---
  getConversionFactors(): ConversionFactor[] {
    const raw = safeGetRaw(CONVERSION_FACTORS_KEY);
    if (!raw) {
      safeSetRaw(CONVERSION_FACTORS_KEY, JSON.stringify(DEFAULT_CONVERSION_FACTORS));
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
    safeSetRaw(CONVERSION_FACTORS_KEY, JSON.stringify(factors));
    supabaseKeyStore.set(STORAGE_KEYS.CONVERSION_FACTORS, factors);
  },

  getConversionFactorForPart(partCode: string): number {
    const list = this.getConversionFactors();
    const found = list.find(f => f.partCode.trim().toLowerCase() === partCode.trim().toLowerCase());
    return found ? found.hsqd : 1.0;
  },

  // --- KITTING SCAN LOGS (Ghi nhận quét bóc tách lên OUTBUFFER - Lưu tối đa 35 ngày) ---
  getKittingScanLogs(): KittingScanLog[] {
    const raw = safeGetRaw(KITTING_SCAN_LOGS_KEY);
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
        safeSetRaw(KITTING_SCAN_LOGS_KEY, JSON.stringify(validLogs));
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
    safeSetRaw(KITTING_SCAN_LOGS_KEY, JSON.stringify(logs));
    supabaseKeyStore.set(STORAGE_KEYS.KITTING_SCAN_LOGS, logs);
    return newLog;
  },

  /**
   * Lấy danh sách các lượt CHỦ ĐỘNG QUÉT tại "1. QUÉT THẺ THÙNG KITTING SMART" theo ngày.
   * TUYỆT ĐỐI KHÔNG BAO GỒM các đơn gọi hàng Andon thành công (status === 'DELIVERED' / GIAO_ANDON / materialCalls).
   * Tự động đối chiếu các bản ghi IN_BUFFER vừa quét lên kệ trong ngày nếu chưa kịp đồng bộ sang scanLogs,
   * đồng thời không bao giờ cộng đè tồn kệ cũ vào các mã đã có trong scanLogs.
   */
  getSmartKittingScanLogsForDate(targetDateStr: string): KittingScanLog[] {
    const parseDateSafe = (ts: string | Date | undefined | null): Date | null => {
      if (!ts) return null;
      if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
      const str = String(ts).trim();
      if (!str) return null;

      const dmyMatch = str.match(/(\b\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10);
        const year = parseInt(dmyMatch[3], 10);
        const timeMatch = str.match(/(\d{1,2}):(\d{1,2})(:(\d{1,2}))?/);
        const hours = timeMatch ? parseInt(timeMatch[1], 10) : 0;
        const minutes = timeMatch ? parseInt(timeMatch[2], 10) : 0;
        const seconds = timeMatch && timeMatch[4] ? parseInt(timeMatch[4], 10) : 0;
        return new Date(year, month - 1, day, hours, minutes, seconds);
      }

      const d = new Date(str);
      if (!isNaN(d.getTime())) return d;
      return null;
    };

    const isDateMatch = (tsStr: string | Date | undefined | null): boolean => {
      if (!tsStr) return false;
      const d = parseDateSafe(tsStr);
      if (!d) return false;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}` === targetDateStr;
    };

    const getSlotKey = (dt: Date): string => {
      const hour = dt.getHours();
      if (hour >= 8 && hour < 9) return '8h-9h';
      if (hour >= 9 && hour < 10) return '9h-10h';
      if (hour >= 10 && hour < 11) return '10h-11h';
      if (hour >= 11 && hour < 13) return '11h-12h';
      if (hour >= 13 && hour < 14) return '13h-14h';
      if (hour >= 14 && hour < 15) return '14h-15h';
      if (hour >= 15 && hour < 16) return '15h-16h';
      if (hour >= 16 && hour < 17) return '16h-17h';
      if (hour >= 17 && hour < 18) return '17h-18h';
      if (hour >= 18 && hour < 19) return '18h-19h';
      if (hour >= 19) return '19h-20h';
      return '8h-9h';
    };

    const resultLogs: KittingScanLog[] = [];
    const loggedPartHourSet = new Set<string>();

    // 1. Nguồn chính: Nhật ký chủ động quét tại "1. QUÉT THẺ THÙNG KITTING SMART" (KittingScanLog)
    const allScanLogs = this.getKittingScanLogs();
    for (const log of allScanLogs) {
      if (!log || !log.partCode || !(log.quantity > 0)) continue;
      if (isDateMatch(log.timestamp)) {
        const dt = parseDateSafe(log.timestamp) || new Date(log.timestamp);
        const slotKey = getSlotKey(dt);
        const codeKey = log.partCode.trim().toUpperCase();
        loggedPartHourSet.add(`${codeKey}__${slotKey}`);
        resultLogs.push(log);
      }
    }

    // 2. Đối chiếu các mục vừa quét lên kệ (CHỈ nhận status === 'IN_BUFFER', TUYỆT ĐỐI KHÔNG nhận 'DELIVERED' hay Andon)
    // Chỉ bổ sung nếu khung giờ của mã linh kiện đó chưa có trong scanLogs (tránh cộng trùng tồn kệ cũ)
    const queue = this.getKittingQueue();
    for (const q of queue) {
      if (q.status !== 'IN_BUFFER') continue;
      if (q.voucherCode === 'GIAO_ANDON') continue;
      const ts = q.endTime || q.createdAt;
      if (!isDateMatch(ts)) continue;
      const qty = q.kittedQuantity || q.rawQuantity || 0;
      if (qty <= 0) continue;

      const dt = parseDateSafe(ts) || new Date(ts);
      const slotKey = getSlotKey(dt);
      const codeKey = q.partCode.trim().toUpperCase();
      const sig = `${codeKey}__${slotKey}`;

      if (!loggedPartHourSet.has(sig)) {
        loggedPartHourSet.add(sig);
        resultLogs.push({
          id: `inbuf-q-${q.id}`,
          partCode: q.partCode,
          partName: q.partName || q.partCode,
          unit: q.unit || 'Cái',
          quantity: qty,
          timestamp: ts,
          bufferLocation: q.bufferLocation || 'OUTBUFFER',
          operatorName: q.operatorName || 'Thủ Kho',
          voucherCode: q.voucherCode,
        });
      }
    }

    // 3. Đối chiếu linh kiện mới quét lên kệ Outbuffer (chỉ xét bItem.lastUpdated của chính linh kiện đó trong ngày)
    const buffers = this.getBufferLocations();
    for (const buf of buffers) {
      const bItems = buf.items && buf.items.length > 0 ? buf.items : [];
      for (const bItem of bItems) {
        if (!bItem.partCode || !(bItem.currentStockQty > 0)) continue;
        // Chỉ xét bItem.lastUpdated (không dùng buf.lastUpdated để tránh trường hợp gọi hàng Andon cập nhật kệ)
        if (!bItem.lastUpdated || !isDateMatch(bItem.lastUpdated)) continue;

        const dt = parseDateSafe(bItem.lastUpdated) || new Date(bItem.lastUpdated);
        const slotKey = getSlotKey(dt);
        const codeKey = bItem.partCode.trim().toUpperCase();
        const sig = `${codeKey}__${slotKey}`;

        if (!loggedPartHourSet.has(sig)) {
          loggedPartHourSet.add(sig);
          resultLogs.push({
            id: `inbuf-rack-${buf.locationId}-${codeKey}`,
            partCode: bItem.partCode,
            partName: bItem.partName || bItem.partCode,
            unit: bItem.unit || 'Cái',
            quantity: bItem.currentStockQty,
            timestamp: bItem.lastUpdated,
            bufferLocation: buf.locationId,
            operatorName: 'Tuấn (Thủ Kho)',
            voucherCode: 'KITTING_SMART',
          });
        }
      }
    }

    // Sắp xếp theo thời gian quét mới nhất lên đầu (tb - ta)
    return resultLogs.sort((a, b) => {
      const ta = parseDateSafe(a.timestamp)?.getTime() || 0;
      const tb = parseDateSafe(b.timestamp)?.getTime() || 0;
      return tb - ta;
    });
  },

  // --- PRODUCTIVITY PERSONNEL CONFIG (Lưu trực tiếp Supabase Cloud: thekho_staff_allocation_v1 & thekho_daily_reports_v1) ---
  getProductivityPersonnelConfig(): ProductivityPersonnelConfig {
    const raw = safeGetRaw(PRODUCTIVITY_PERSONNEL_CONFIG_KEY);
    if (!raw) {
      safeSetRaw(PRODUCTIVITY_PERSONNEL_CONFIG_KEY, JSON.stringify(DEFAULT_PRODUCTIVITY_PERSONNEL_CONFIG));
      return DEFAULT_PRODUCTIVITY_PERSONNEL_CONFIG;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_PRODUCTIVITY_PERSONNEL_CONFIG;
    }
  },

  async saveProductivityPersonnelConfig(config: ProductivityPersonnelConfig): Promise<{ success: boolean; cloudSynced: boolean; message?: string }> {
    safeSetRaw(PRODUCTIVITY_PERSONNEL_CONFIG_KEY, JSON.stringify(config));
    
    // Push directly to Supabase Cloud under keys
    try {
      const p1 = supabaseKeyStore.set(STORAGE_KEYS.PRODUCTIVITY_PERSONNEL_CONFIG, config);
      const p2 = supabaseKeyStore.set(STORAGE_KEYS.STAFF_ALLOCATION, config);
      const p3 = supabaseKeyStore.set(STORAGE_KEYS.DAILY_REPORTS, config);
      const [res1, res2, res3] = await Promise.all([p1, p2, p3]);
      const cloudSynced = res1 && res2 && res3;
      if (!cloudSynced) {
        return {
          success: true,
          cloudSynced: false,
          message: '⚠️ Đã lưu tại máy nhưng KHÔNG THỂ đồng bộ lên Supabase Cloud do lỗi kết nối mạng!',
        };
      }
      return { success: true, cloudSynced: true };
    } catch (err: any) {
      return {
        success: true,
        cloudSynced: false,
        message: `⚠️ Đã lưu local nhưng lỗi đẩy Supabase Cloud: ${err?.message || 'Mất kết nối'}`,
      };
    }
  },

  async fetchProductivityPersonnelConfigFromCloud(): Promise<ProductivityPersonnelConfig> {
    try {
      const cloudVal = await supabaseKeyStore.get<ProductivityPersonnelConfig>(STORAGE_KEYS.PRODUCTIVITY_PERSONNEL_CONFIG)
        || await supabaseKeyStore.get<ProductivityPersonnelConfig>(STORAGE_KEYS.STAFF_ALLOCATION);
      if (cloudVal && typeof cloudVal === 'object') {
        safeSetRaw(PRODUCTIVITY_PERSONNEL_CONFIG_KEY, JSON.stringify(cloudVal));
        return cloudVal;
      }
    } catch (_) {}
    return this.getProductivityPersonnelConfig();
  },

  /**
   * Truy vấn thô chỉ đúng ngày đang chọn trên báo cáo năng suất từ bảng transactions.
   * Cắt giảm triệt để SELECT *: Chỉ chọn đúng part_code, part_name, quantity, date, type.
   * Giới hạn trong khoảng thời gian ngày được chọn, không bao giờ kéo gộp cả 35 ngày.
   */
  async fetchDailyProductivityTransactionsFromCloud(dateStr: string): Promise<Array<{
    partCode: string;
    partName: string;
    quantity: number;
    date: string;
    type: string;
  }>> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return [];

      const startIso = `${dateStr}T00:00:00.000Z`;
      const endIso = `${dateStr}T23:59:59.999Z`;

      const { data, error } = await client
        .from('transactions')
        .select('part_code, part_name, quantity, date, type')
        .gte('date', startIso)
        .lte('date', endIso)
        .order('date', { ascending: true });

      if (error || !data) return [];

      return data.map((r: any) => ({
        partCode: String(r.part_code || ''),
        partName: String(r.part_name || ''),
        quantity: typeof r.quantity === 'number' ? r.quantity : Number(r.quantity) || 0,
        date: String(r.date || ''),
        type: String(r.type || 'OUT'),
      }));
    } catch (e) {
      console.warn('[fetchDailyProductivityTransactionsFromCloud] notice:', e);
      return [];
    }
  },

  // --- CUSTOM GENERATED CONTAINER TAGS (Lưu vị trí riêng biệt với Thẻ Master Data) ---
  getCustomGeneratedContainerTags(): CustomGeneratedContainerTag[] {
    const raw = safeGetRaw(CUSTOM_GENERATED_CONTAINER_TAGS_KEY);
    if (!raw) return [];
    try {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  },

  saveCustomGeneratedContainerTags(tags: CustomGeneratedContainerTag[]): void {
    safeSetRaw(CUSTOM_GENERATED_CONTAINER_TAGS_KEY, JSON.stringify(tags));
    supabaseKeyStore.set(STORAGE_KEYS.CUSTOM_GENERATED_CONTAINER_TAGS, tags);
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
  async checkCloudHasUpdates(): Promise<boolean> {
    const { isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return false;
    return supabaseKeyStore.checkCloudHasUpdates();
  },

  async fetchInitialDataFromCloud(forceFetch: boolean = false): Promise<{ parts: Part[]; transactions: Transaction[] }> {
    let parts: Part[] = [];
    let transactions: Transaction[] = [];

    // Nếu không forceFetch và máy đã có dữ liệu local, kiểm tra xem Cloud có cập nhật mới không
    if (!forceFetch) {
      const localParts = this.getParts();
      const localTxs = this.getTransactions();
      if (localParts && localParts.length > 0 && localTxs && localTxs.length > 0) {
        const hasUpdates = await this.checkCloudHasUpdates();
        if (!hasUpdates) {
          // Cloud không có thay đổi mới -> dùng local data để tiết kiệm tối đa Egress
          return { parts: localParts, transactions: localTxs };
        }
      }
    }

    try {
      // 1. Batch timestamp check for lightweight Key-Value keys in 1 request
      // Đã loại bỏ hoàn toàn TRANSACTIONS và MASTER_CONTAINER_TAGS khỏi batch download để giảm ~2MB
      const allKvKeys = [
        STORAGE_KEYS.PARTS,
        STORAGE_KEYS.SETTINGS,
        STORAGE_KEYS.CONTAINER_BATCHES,
        STORAGE_KEYS.USED_QR_TOKENS,
        STORAGE_KEYS.MODEL_BOMS,
        STORAGE_KEYS.KITTING_QUEUE,
        STORAGE_KEYS.BUFFER_MAP,
        STORAGE_KEYS.MATERIAL_CALLS,
        STORAGE_KEYS.BOM_VOUCHERS,
        STORAGE_KEYS.CONVERSION_FACTORS,
        STORAGE_KEYS.PRODUCTIVITY_PERSONNEL_CONFIG,
        STORAGE_KEYS.STAFF_ALLOCATION,
        STORAGE_KEYS.DAILY_REPORTS,
        STORAGE_KEYS.KITTING_SCAN_LOGS,
        STORAGE_KEYS.CUSTOM_GENERATED_CONTAINER_TAGS,
        STORAGE_KEYS.USERS,
        STORAGE_KEYS.MANUALLY_COMPLETED_VOUCHERS,
        STORAGE_KEYS.DELETED_CALL_IDS,
      ];

      await supabaseKeyStore.batchSyncAllKeys(allKvKeys, forceFetch);

      // 1.1 Ensure all material calls (Andon) are synced and smart-merged from Supabase Cloud
      await this.fetchMaterialCallsFromCloud(forceFetch);

      // 2. Data is already written to localStorage by batchSyncAllKeys for all changed keys!
      // Ensure full warehouse locations list (>1000 shelves) is loaded from settings relational fallback if needed
      const currentSettings = this.getSettings();
      if (!currentSettings.locations || currentSettings.locations.length <= 4) {
        const relSettings = await supabaseRelationalStore.selectSettings();
        if (relSettings && Array.isArray(relSettings.locations) && relSettings.locations.length > currentSettings.locations.length) {
          this.saveSettings(relSettings);
        }
      }

      // Retrieve parts directly from localStorage, fallback to relational table if brand new
      parts = this.getParts();
      if (!parts || parts.length === 0) {
        const relParts = await supabaseRelationalStore.selectParts({ limit: 2000 });
        if (relParts !== null && relParts.length > 0) {
          parts = relParts;
          this.saveParts(parts);
        }
      }

      // 3. LIGHTWEIGHT RECONCILE LEDGER + INCREMENTAL SYNC CHO TRANSACTIONS:
      // - Lần khởi động đầu tiên (hoặc khi RAM rỗng): nạp sổ cái tinh gọn (selectReconcileTransactions với RAM TTL Cache 5 phút, không dùng SELECT *)
      //   để đảm bảo đối soát chính xác 100% vị trí kệ "Có hàng" trên Sơ đồ kho và tồn kho thực tế của toàn bộ linh kiện.
      // - Các lần đồng bộ tiếp theo: chỉ tải gia tăng (Incremental Sync) các giao dịch mới có `date > lastSyncedTransactionTimestamp`.
      try {
        localStorage.removeItem(TRANSACTIONS_KEY);
      } catch (_) {}

      if (!hasLoadedFullReconcileLedger || inMemoryTransactions.length === 0) {
        const reconcileTxs = await supabaseRelationalStore.selectReconcileTransactions({ forceFresh: forceFetch });
        if (reconcileTxs && reconcileTxs.length > 0) {
          inMemoryTransactions = [...reconcileTxs].sort(
            (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
          );
          hasLoadedFullReconcileLedger = true;
          const newestDate = inMemoryTransactions[0]?.date;
          if (newestDate) {
            lastSyncedTransactionTimestamp = newestDate;
          }
          invalidateBinCardHistoryCache();
        }
      } else {
        const deltaTxs = await supabaseRelationalStore.selectIncrementalTransactions({
          sinceIso: lastSyncedTransactionTimestamp || undefined,
          limit: 200,
        });

        if (deltaTxs && deltaTxs.length > 0) {
          const txMap = new Map<string, Transaction>();
          for (const existing of inMemoryTransactions) {
            if (existing && existing.id) txMap.set(existing.id, existing);
          }
          for (const incoming of deltaTxs) {
            if (incoming && incoming.id) txMap.set(incoming.id, incoming);
          }
          inMemoryTransactions = Array.from(txMap.values()).sort(
            (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
          );
          const newestDate = inMemoryTransactions[0]?.date;
          if (newestDate) {
            lastSyncedTransactionTimestamp = newestDate;
          }
          invalidateBinCardHistoryCache();
        }
      }
      transactions = inMemoryTransactions;

      // 4. Ensure canonical 12 system users are present
      const currentUsers = this.getUsers();
      if (!currentUsers || !Array.isArray(currentUsers) || currentUsers.length < 12) {
        localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_SYSTEM_USERS));
        supabaseKeyStore.set(USERS_KEY, DEFAULT_SYSTEM_USERS);
      }
    } catch (err: any) {
      parts = this.getParts();
      transactions = this.getTransactions();
      throw new Error(`[Supabase Connection Failure] ${err?.message || 'Failed to fetch from cloud'}`);
    }

    return { parts, transactions };
  },

  async syncWithSupabase(): Promise<{ success: boolean; message: string }> {
    const { isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) {
      return { success: false, message: 'Chưa cấu hình SUPABASE_URL và SUPABASE_ANON_KEY!' };
    }

    try {
      const { parts, transactions } = await this.fetchInitialDataFromCloud();
      return {
        success: true,
        message: `Đã đồng bộ thành công! Tìm thấy ${parts.length} linh kiện và ${transactions.length} giao dịch từ Supabase Cloud.`,
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
      this.saveUsers(this.getUsers());
      this.saveParts(this.getParts());
      this.saveContainerBatches(this.getContainerBatches());
      this.saveModelBOMs(this.getModelBOMs());
      this.saveKittingQueue(this.getKittingQueue());
      await this.saveBufferMap(this.getBufferMap());
      this.saveMaterialCalls(this.getMaterialCalls());
      this.saveBomVouchers(this.getBomVouchers());
      this.saveMasterContainerTags(this.getMasterContainerTags());
      this.saveConversionFactors(this.getConversionFactors());
      this.saveProductivityPersonnelConfig(this.getProductivityPersonnelConfig());
      this.saveCustomGeneratedContainerTags(this.getCustomGeneratedContainerTags());
      await flushWriteQueueToSupabase();

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

  /**
   * Safe localStorage setItem wrapper with automatic quota management.
   * If a QuotaExceededError is detected, triggers emergency cleanup to prevent application crashes.
   */
  safeSetItem(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err: any) {
      if (err?.name === 'QuotaExceededError' || err?.code === 22 || err?.code === 1014) {
        console.warn('[Storage] QuotaExceededError detected! Running emergency 14-day cleanup...');
        this.cleanupOldLocalStorageRecords(14);
        try {
          localStorage.setItem(key, value);
          return true;
        } catch {
          console.error('[Storage] Still exceeded quota after emergency cleanup.');
          return false;
        }
      }
      return false;
    }
  },

  /**
   * TỰ ĐỘNG DỌN DẸP LOCALSTORAGE (CHÍNH SÁCH 35 NGÀY):
   * Tự động chạy khi app khởi động để kiểm tra và dọn dẹp các bản ghi lịch sử / scan logs cũ hơn 35 ngày trong localStorage.
   * Đảm bảo dung lượng localStorage luôn được giữ ở mức an toàn (dưới 5MB), tuyệt đối không để xảy ra lỗi QuotaExceededError.
   * Dữ liệu cũ vẫn nằm an toàn trên Supabase và chỉ được tải lên khi người dùng chủ động bấm tra cứu.
   */
  cleanupOldLocalStorageRecords(retentionDays: number = 35): CleanupResult {
    const executedAt = new Date().toISOString();
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    // 1. Tính dung lượng trước khi dọn dẹp (Bytes)
    let beforeBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) {
          const v = localStorage.getItem(k);
          beforeBytes += (k.length + (v ? v.length : 0)) * 2;
        }
      }
    } catch (_) {}

    let prunedTransactions = 0;
    let prunedKittingLogs = 0;
    let prunedAndonCalls = 0;
    let prunedKittingQueue = 0;
    let prunedContainerBatches = 0;
    let prunedTokens = 0;
    let prunedBomVouchers = 0;

    // 2. Chuyển đổi và dọn dẹp triệt để thekho_transactions_v1 & thekho_master_container_tags_v1:
    // Tuyệt đối không lưu lịch sử giao dịch và thẻ container dưới localStorage (Source of Truth là Supabase)
    try {
      const rawTxs = safeGetRaw(TRANSACTIONS_KEY);
      if (rawTxs) {
        try {
          const parsed: Transaction[] = JSON.parse(rawTxs);
          if (Array.isArray(parsed) && parsed.length > 0) {
            prunedTransactions = parsed.length;
            if (inMemoryTransactions.length === 0) {
              inMemoryTransactions = parsed;
            }
          }
        } catch (_) {}
        localStorage.removeItem(TRANSACTIONS_KEY);
      }
      localStorage.removeItem(MASTER_CONTAINER_TAGS_KEY);
    } catch (e) {
      console.warn('[Storage Cleanup] Error pruning transactions:', e);
    }

    // 3. Dọn dẹp Kitting Scan Logs (thekho_kitting_scan_logs_v1)
    try {
      const rawLogs = safeGetRaw(KITTING_SCAN_LOGS_KEY);
      if (rawLogs) {
        const logs: KittingScanLog[] = JSON.parse(rawLogs);
        if (Array.isArray(logs)) {
          const keptLogs = logs.filter((l) => {
            const time = new Date(l.timestamp || (l as any).createdAt).getTime();
            return !isNaN(time) && time >= cutoffMs;
          });
          if (keptLogs.length < logs.length) {
            prunedKittingLogs = logs.length - keptLogs.length;
            safeSetRaw(KITTING_SCAN_LOGS_KEY, JSON.stringify(keptLogs));
          }
        }
      }
    } catch (e) {
      console.warn('[Storage Cleanup] Error pruning kitting logs:', e);
    }

    // 4. Dọn dẹp Yêu cầu Gọi Hàng Andon (thekho_material_calls_v1)
    // CHÚ Ý: Tuyệt đối KHÔNG xóa đơn đang gọi (CALLING) hoặc đang giao (DELIVERING)
    try {
      const rawCalls = safeGetRaw(MATERIAL_CALLS_KEY);
      if (rawCalls) {
        const calls: MaterialCallRequest[] = JSON.parse(rawCalls);
        if (Array.isArray(calls)) {
          const keptCalls = calls.filter((c) => {
            if (c.status === 'CALLING' || c.status === 'DELIVERING') {
              return true; // Giữ nguyên toàn bộ đơn đang xử lý
            }
            const time = new Date(c.deliveredAt || c.requestedAt).getTime();
            return !isNaN(time) && time >= cutoffMs;
          });
          if (keptCalls.length < calls.length) {
            prunedAndonCalls = calls.length - keptCalls.length;
            safeSetRaw(MATERIAL_CALLS_KEY, JSON.stringify(keptCalls));
          }
        }
      }
    } catch (e) {
      console.warn('[Storage Cleanup] Error pruning andon calls:', e);
    }

    // 5. Dọn dẹp Kitting Queue đã hoàn thành (thekho_kitting_queue_v1)
    // CHÚ Ý: Giữ lại toàn bộ PENDING_KITTING và IN_BUFFER
    try {
      const rawQueue = safeGetRaw(KITTING_QUEUE_KEY);
      if (rawQueue) {
        const queue: KittingQueueItem[] = JSON.parse(rawQueue);
        if (Array.isArray(queue)) {
          const keptQueue = queue.filter((k) => {
            if (k.status === 'PENDING_KITTING' || k.status === 'IN_BUFFER') {
              return true;
            }
            const time = new Date(k.endTime || k.createdAt).getTime();
            return !isNaN(time) && time >= cutoffMs;
          });
          if (keptQueue.length < queue.length) {
            prunedKittingQueue = queue.length - keptQueue.length;
            safeSetRaw(KITTING_QUEUE_KEY, JSON.stringify(keptQueue));
          }
        }
      }
    } catch (e) {
      console.warn('[Storage Cleanup] Error pruning kitting queue:', e);
    }

    // 6. Dọn dẹp Lô Thẻ Thùng Container đã nhập hết và cũ (thekho_container_batches_v1)
    try {
      const rawBatches = safeGetRaw(CONTAINER_BATCHES_KEY);
      if (rawBatches) {
        const batches: ContainerBatch[] = JSON.parse(rawBatches);
        if (Array.isArray(batches)) {
          const keptBatches = batches.filter((b) => {
            const isAllUsed = b.items && b.items.length > 0 && b.items.every((item) => item.importedQuantity || item.isUsed);
            if (!isAllUsed) return true; // Giữ lại nếu chưa nhập hết
            const time = new Date(b.createdAt || b.contDate).getTime();
            return !isNaN(time) && time >= cutoffMs;
          });
          if (keptBatches.length < batches.length) {
            prunedContainerBatches = batches.length - keptBatches.length;
            safeSetRaw(CONTAINER_BATCHES_KEY, JSON.stringify(keptBatches));
          }
        }
      }
    } catch (e) {
      console.warn('[Storage Cleanup] Error pruning container batches:', e);
    }

    // 7. Dọn dẹp Token QR đã quét (thekho_used_qr_tokens_v1)
    try {
      const rawTokens = safeGetRaw(USED_QR_TOKENS_KEY);
      if (rawTokens) {
        const tokens: Record<string, any> = JSON.parse(rawTokens);
        if (typeof tokens === 'object' && tokens !== null) {
          const newTokens: Record<string, any> = {};
          let count = 0;
          for (const [k, v] of Object.entries(tokens)) {
            const time = new Date(v?.scannedAt || 0).getTime();
            if (isNaN(time) || time >= cutoffMs) {
              newTokens[k] = v;
            } else {
              count++;
            }
          }
          if (count > 0) {
            prunedTokens = count;
            safeSetRaw(USED_QR_TOKENS_KEY, JSON.stringify(newTokens));
          }
        }
      }
    } catch (e) {
      console.warn('[Storage Cleanup] Error pruning used qr tokens:', e);
    }

    // 8. Dọn dẹp Phiếu Xuất BOM đã hoàn thành cũ (thekho_bom_vouchers_v1)
    try {
      const rawVouchers = safeGetRaw(BOM_VOUCHERS_KEY);
      if (rawVouchers) {
        const vouchers: BomExportVoucher[] = JSON.parse(rawVouchers);
        if (Array.isArray(vouchers)) {
          const keptVouchers = vouchers.filter((v) => {
            if (v.status !== 'COMPLETED' && v.status !== 'ROLLED_BACK') {
              return true;
            }
            const time = new Date(v.createdAt).getTime();
            return !isNaN(time) && time >= cutoffMs;
          });
          if (keptVouchers.length < vouchers.length) {
            prunedBomVouchers = vouchers.length - keptVouchers.length;
            safeSetRaw(BOM_VOUCHERS_KEY, JSON.stringify(keptVouchers));
          }
        }
      }
    } catch (e) {
      console.warn('[Storage Cleanup] Error pruning bom vouchers:', e);
    }

    // 9. Dọn dẹp Báo Cáo Hàng Ngày cũ
    try {
      const rawReports = safeGetRaw('thekho_daily_reports_v1');
      if (rawReports) {
        const reports = JSON.parse(rawReports);
        if (Array.isArray(reports)) {
          const keptReports = reports.filter((r: any) => {
            const time = new Date(r.reportDate || r.createdAt).getTime();
            return !isNaN(time) && time >= cutoffMs;
          });
          if (keptReports.length < reports.length) {
            safeSetRaw('thekho_daily_reports_v1', JSON.stringify(keptReports));
          }
        }
      }
    } catch (e) {
      console.warn('[Storage Cleanup] Error pruning daily reports:', e);
    }

    // 9b. TỰ ĐỘNG NÉN TOÀN BỘ LOCALSTORAGE CÒN LẠI VỚI LZ-STRING UTF-16:
    // Nén siêu cấp tất cả các key lớn, giảm 70% - 90% dung lượng trình duyệt
    try {
      optimizeAllExistingLocalStorage();
    } catch (e) {
      console.warn('[Storage Cleanup] Error optimizing storage compression:', e);
    }

    // 10. Tính dung lượng sau khi dọn dẹp (Bytes)
    let afterBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) {
          const v = localStorage.getItem(k);
          afterBytes += (k.length + (v ? v.length : 0)) * 2;
        }
      }
    } catch (_) {}

    const bytesFreed = Math.max(0, beforeBytes - afterBytes);
    const totalPruned =
      prunedTransactions +
      prunedKittingLogs +
      prunedAndonCalls +
      prunedKittingQueue +
      prunedContainerBatches +
      prunedTokens +
      prunedBomVouchers;

    return {
      prunedCount: totalPruned,
      prunedTransactions,
      prunedKittingLogs,
      prunedAndonCalls,
      prunedKittingQueue,
      prunedContainerBatches,
      prunedTokens,
      prunedBomVouchers,
      bytesFreed,
      beforeBytes,
      afterBytes,
      retentionDays,
      executedAt,
    };
  },

  /**
   * Lấy báo cáo thống kê dung lượng LocalStorage hiện tại
   */
  getLocalStorageUsageSummary(): LocalStorageUsageSummary {
    let totalBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) {
          const v = localStorage.getItem(k);
          totalBytes += (k.length + (v ? v.length : 0)) * 2;
        }
      }
    } catch (_) {}

    const quotaBytes = 5 * 1024 * 1024; // 5 MB tiêu chuẩn trình duyệt
    const totalKB = Math.round((totalBytes / 1024) * 10) / 10;
    const quotaKB = 5120;
    const percentUsed = Math.min(100, Math.round((totalBytes / quotaBytes) * 1000) / 10);

    return {
      totalBytes,
      totalKB,
      quotaKB,
      percentUsed,
      isSafe: percentUsed < 80,
      itemCounts: {
        parts: this.getParts().length,
        transactions: this.getTransactions().length,
        kittingLogs: this.getKittingScanLogs().length,
        andonCalls: this.getMaterialCallRequests().length,
        containerBatches: this.getContainerBatches().length,
        usedTokens: Object.keys(this.getUsedQrTokens()).length,
        bomVouchers: this.getBomVouchers().length,
      },
    };
  },

  /**
   * Tối ưu hóa nén toàn bộ LocalStorage sang chuẩn LZ-String UTF-16
   */
  optimizeLocalStorage(): {
    convertedKeys: string[];
    beforeBytes: number;
    afterBytes: number;
    freedBytes: number;
    percentSaved: number;
  } {
    return optimizeAllExistingLocalStorage();
  },

  /**
   * ON-DEMAND TRA CỨU LỊCH SỬ TỪ SUPABASE CLOUD:
   * Tải toàn bộ giao dịch lịch sử cũ từ Supabase Cloud theo yêu cầu của người dùng,
   * KHÔNG lưu vĩnh viễn vào localStorage để bảo vệ dung lượng bộ nhớ dưới 5MB.
   */
  async fetchHistoricalTransactionsOnDemand(options?: {
    partCode?: string;
    limit?: number;
    offset?: number;
  }): Promise<Transaction[]> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) {
        const local = this.getTransactions();
        if (options?.partCode) {
          return local.filter((t) => t.partCode.toLowerCase() === options.partCode!.toLowerCase());
        }
        return local;
      }

      const limit = options?.limit ?? 300;
      let query = client
        .from('transactions')
        .select('id, part_id, part_code, part_name, unit, type, quantity, date, person, location_id, production_order, reason_or_purpose, notes, stock_before, stock_after, created_at')
        .order('date', { ascending: false });

      if (options?.partCode) {
        query = query.eq('part_code', options.partCode);
      }

      if (options?.offset !== undefined) {
        query = query.range(options.offset, options.offset + limit - 1);
      } else {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        // Tuyệt đối KHÔNG fallback sang supabaseKeyStore.get(STORAGE_KEYS.TRANSACTIONS, { forceFresh: true })
        // để tránh tải cục dữ liệu Key-Value khổng lồ gây tốn băng thông Egress.
        if (options?.partCode) {
          const targetCode = options.partCode.trim().toLowerCase();
          return this.getTransactions().filter((t) => t.partCode.trim().toLowerCase() === targetCode);
        }
        return [];
      }

      const mapped = (data || []).map(mapSupabaseRowToTransaction);
      if (mapped.length > 0) {
        const existingIds = new Set(inMemoryTransactions.map((t) => t.id));
        const newOnes = mapped.filter((t) => !existingIds.has(t.id));
        if (newOnes.length > 0) {
          inMemoryTransactions = [...inMemoryTransactions, ...newOnes];
        }
      }
      return mapped;
    } catch (err) {
      console.warn('[OnDemand History] Error loading historical transactions:', err);
      return this.getTransactions();
    }
  },
};




