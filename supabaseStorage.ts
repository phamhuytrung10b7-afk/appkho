import { getActiveSupabaseClient } from './supabase';
import {
  Part,
  Transaction,
  StockCheckRecord,
  AppSettings,
  ContainerBatch,
  ModelBOM,
  KittingQueueItem,
  BufferLocationMap,
  MaterialCallRequest,
  BomExportVoucher,
  ConversionFactor,
  KittingScanLog,
  ProductivityPersonnelConfig,
} from './types';
import { MasterKittingTag } from './masterExcelParser';
import { CustomGeneratedContainerTag } from './storage';

// Keys for App Data store in Supabase Key-Value table `thekho_app_data`
export const STORAGE_KEYS = {
  PARTS: 'thekho_parts_v1',
  TRANSACTIONS: 'thekho_transactions_v1',
  STOCK_CHECKS: 'thekho_stock_checks_v1',
  SETTINGS: 'thekho_settings_v1',
  CONTAINER_BATCHES: 'thekho_container_batches_v1',
  USED_QR_TOKENS: 'thekho_used_qr_tokens_v1',
  MODEL_BOMS: 'thekho_model_boms_v1',
  KITTING_QUEUE: 'thekho_kitting_queue_v1',
  BUFFER_MAP: 'thekho_buffer_map_v1',
  MATERIAL_CALLS: 'thekho_material_calls_v1',
  BOM_VOUCHERS: 'thekho_bom_vouchers_v1',
  MASTER_CONTAINER_TAGS: 'thekho_master_container_tags_v1',
  CONVERSION_FACTORS: 'thekho_conversion_factors_v1',
  KITTING_SCAN_LOGS: 'thekho_kitting_scan_logs_v1',
  PRODUCTIVITY_PERSONNEL_CONFIG: 'thekho_productivity_personnel_config_v1',
  STAFF_ALLOCATION: 'thekho_staff_allocation_v1',
  DAILY_REPORTS: 'thekho_daily_reports_v1',
  CUSTOM_GENERATED_CONTAINER_TAGS: 'thekho_custom_generated_container_tags_v1',
  USERS: 'thekho_users_v1',
  MANUALLY_COMPLETED_VOUCHERS: 'thekho_manually_completed_vouchers_v1',
  DELETED_CALL_IDS: 'thekho_deleted_call_ids_v1',
  DELETED_BOM_VOUCHER_CODES: 'thekho_deleted_bom_voucher_codes_v1',
  DELETED_PART_CODES: 'thekho_deleted_part_codes_v1',
};

// Egress bandwidth savings tracker (for diagnostics & verification)
export const egressStats = {
  cacheHits: 0,
  cacheMisses: 0,
  estimatedBytesSaved: 0,
  estimatedBytesDownloaded: 0,
};

// Data mapper for Part -> Supabase Row matching exact column names
export function mapPartToSupabaseRow(part: Part) {
  const currentStock = typeof part.currentStock === 'number' ? part.currentStock : Number(part.currentStock) || 0;
  const qtyNg = typeof part.qtyNg === 'number' ? part.qtyNg : Number((part as any).qty_ng || part.qtyNg) || 0;
  const minStock = typeof part.minStock === 'number' ? part.minStock : Number(part.minStock) || 0;
  const maxStock = typeof (part as any).maxStock === 'number' ? (part as any).maxStock : Number((part as any).maxStock) || 0;
  const unitPrice = typeof (part as any).unitPrice === 'number' ? (part as any).unitPrice : Number((part as any).unitPrice) || 0;

  return {
    id: String(part.id || ''),
    code: String(part.code || ''),
    name: String(part.name || ''),
    group_name: String((part as any).groupName || (part as any).group_name || 'Khác'),
    unit: String(part.unit || 'Cái'),
    current_stock: currentStock,
    qty_ng: qtyNg,
    min_stock: minStock,
    max_stock: maxStock,
    location: String(part.location || 'Kho chính'),
    locations: Array.isArray(part.locations) ? part.locations : [],
    unit_price: unitPrice,
    supplier: String((part as any).supplier || ''),
    notes: String(part.note || part.description || (part as any).notes || ''),
    created_at: part.createdAt ? new Date(part.createdAt).toISOString() : new Date().toISOString(),
    updated_at: part.updatedAt ? new Date(part.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export function mapSupabaseRowToPart(row: any): Part {
  const currentStock = typeof row.current_stock === 'number' ? row.current_stock : Number(row.current_stock) || 0;
  const qtyNg = typeof row.qty_ng === 'number' ? row.qty_ng : Number(row.qty_ng || row.qtyNg) || 0;
  const minStock = typeof row.min_stock === 'number' ? row.min_stock : Number(row.min_stock) || 0;

  return {
    id: String(row.id || ''),
    code: String(row.code || ''),
    name: String(row.name || ''),
    description: String(row.notes || row.description || ''),
    location: String(row.location || 'Kho chính'),
    locations: Array.isArray(row.locations) ? row.locations : [],
    unit: String(row.unit || 'Cái'),
    currentStock: currentStock,
    qtyNg: qtyNg,
    minStock: minStock,
    barcode: String(row.code || ''),
    qrCode: String(row.code || ''),
    note: String(row.notes || ''),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

// Data mapper for Transaction -> Supabase Row
export function mapTransactionToSupabaseRow(tx: Transaction) {
  const quantity = typeof tx.quantity === 'number' ? tx.quantity : Number(tx.quantity) || 0;
  const stockBefore = typeof tx.stockBefore === 'number' ? tx.stockBefore : Number(tx.stockBefore) || 0;
  const stockAfter = typeof tx.stockAfter === 'number' ? tx.stockAfter : Number(tx.stockAfter) || 0;
  const reason = tx.reasonOrPurpose || tx.ngReason || (tx as any).reason_or_purpose || '';

  return {
    id: String(tx.id || ''),
    part_id: String(tx.partId || (tx as any).part_id || ''),
    part_code: String(tx.partCode || (tx as any).part_code || ''),
    part_name: String(tx.partName || (tx as any).part_name || ''),
    unit: String(tx.unit || 'Cái'),
    type: String(tx.type || 'IN'),
    quantity: quantity,
    date: tx.date ? new Date(tx.date).toISOString() : new Date().toISOString(),
    person: String(tx.person || ''),
    production_order: String(tx.productionOrder || (tx as any).production_order || ''),
    reason_or_purpose: String(reason),
    notes: String(tx.notes || ''),
    location_id: String(tx.locationId || (tx as any).location_id || ''),
    stock_before: stockBefore,
    stock_after: stockAfter,
    created_at: new Date().toISOString(),
  };
}

export function mapSupabaseRowToTransaction(row: any): Transaction {
  return {
    id: String(row.id || ''),
    partId: String(row.part_id || row.partId || ''),
    partCode: String(row.part_code || row.partCode || ''),
    partName: String(row.part_name || row.partName || ''),
    unit: String(row.unit || 'Cái'),
    type: row.type || 'IN',
    quantity: typeof row.quantity === 'number' ? row.quantity : Number(row.quantity) || 0,
    date: row.date || new Date().toISOString(),
    person: String(row.person || ''),
    locationId: String(row.location_id || row.locationId || ''),
    productionOrder: String(row.production_order || row.productionOrder || ''),
    reasonOrPurpose: String(row.reason_or_purpose || row.reasonOrPurpose || ''),
    notes: String(row.notes || ''),
    stockBefore: typeof row.stock_before === 'number' ? row.stock_before : Number(row.stock_before) || 0,
    stockAfter: typeof row.stock_after === 'number' ? row.stock_after : Number(row.stock_after) || 0,
  };
}

const loggedErrorKeys = new Set<string>();

function logSupabaseError(context: string, error: any) {
  if (!error) return;
  const errMsg =
    typeof error === 'object' && error !== null
      ? error.message || error.details || error.code || ''
      : String(error);
  const key = `${context}::${errMsg}`;
  if (loggedErrorKeys.has(key)) return;
  loggedErrorKeys.add(key);
  if (loggedErrorKeys.size > 20) loggedErrorKeys.clear();

  if (typeof window !== 'undefined' && (window as any).__SUPABASE_DEBUG__) {
    console.debug(`[Supabase Connection Notice] ${context}:`, errMsg);
  }
}

// Local storage cache timestamp prefix
export const CACHE_TS_PREFIX = '_thekho_cache_ts_';

import { compressStorageValue, decompressStorageValue } from './storageCompression';

// Helper for localStorage cached data
export function getLocalCacheData<T>(key: string): { data: T | null; timestamp: string | null } {
  try {
    const ts = localStorage.getItem(`${CACHE_TS_PREFIX}${key}`);
    const rawData = localStorage.getItem(key);
    if (rawData) {
      const decompressed = decompressStorageValue(rawData);
      if (decompressed) {
        return { data: JSON.parse(decompressed) as T, timestamp: ts };
      }
    }
    return { data: null, timestamp: ts };
  } catch {
    return { data: null, timestamp: null };
  }
}

export function setLocalCacheData<T>(key: string, data: T, timestamp?: string): void {
  // CRITICAL ARCHITECTURE RULE: thekho_transactions_v1 and thekho_master_container_tags_v1
  // MUST NEVER be saved to localStorage (Source of Truth is Supabase Cloud).
  if (key === STORAGE_KEYS.TRANSACTIONS || key === STORAGE_KEYS.MASTER_CONTAINER_TAGS || key === 'thekho_transactions_v1' || key === 'thekho_master_container_tags_v1') {
    try {
      localStorage.removeItem(key);
      localStorage.removeItem(`${CACHE_TS_PREFIX}${key}`);
    } catch (_) {}
    return;
  }

  try {
    const ts = timestamp || new Date().toISOString();

    // Compact thekho_kitting_queue_v1: only cache active queue items (PENDING_KITTING, IN_BUFFER)
    if (key === STORAGE_KEYS.KITTING_QUEUE && Array.isArray(data)) {
      const activeQueue = (data as any[]).filter(
        (item) => item.status === 'PENDING_KITTING' || item.status === 'IN_BUFFER'
      );
      const jsonStr = JSON.stringify(activeQueue);
      localStorage.setItem(key, compressStorageValue(jsonStr));
      localStorage.setItem(`${CACHE_TS_PREFIX}${key}`, ts);
      return;
    }

    // Compact thekho_parts_v1: cache slim stock snapshot to keep storage well under 2MB
    if (key === STORAGE_KEYS.PARTS && Array.isArray(data)) {
      const compactParts = (data as any[]).map((p) => ({
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
      const jsonStr = JSON.stringify(compactParts);
      localStorage.setItem(key, compressStorageValue(jsonStr));
      localStorage.setItem(`${CACHE_TS_PREFIX}${key}`, ts);
      return;
    }

    // Material calls: filter incoming items against deleted call IDs and strictly prevent rollbacks from COMPLETED or DELIVERING to CALLING
    if (key === STORAGE_KEYS.MATERIAL_CALLS && Array.isArray(data)) {
      let deletedSet = new Set<string>();
      try {
        const rawDel = localStorage.getItem('thekho_deleted_call_ids_v1');
        if (rawDel) {
          const decomp = decompressStorageValue(rawDel) || rawDel;
          const parsed = JSON.parse(decomp);
          if (Array.isArray(parsed)) deletedSet = new Set(parsed);
        }
      } catch (_) {}

      let existingCalls: any[] = [];
      try {
        const rawCalls = localStorage.getItem(key);
        if (rawCalls) {
          const decomp = decompressStorageValue(rawCalls) || rawCalls;
          const p = JSON.parse(decomp);
          if (Array.isArray(p)) existingCalls = p;
        }
      } catch (_) {}

      const existingMap = new Map<string, any>();
      for (const ex of existingCalls) {
        if (ex && ex.requestId) {
          existingMap.set(ex.requestId, ex);
        }
      }

      const statusWeights: Record<string, number> = { COMPLETED: 2, DELIVERING: 1, CALLING: 0 };
      const map = new Map<string, any>();

      // 1. Process all incoming calls from data
      for (const inc of (data as any[])) {
        if (inc && inc.requestId && !deletedSet.has(inc.requestId)) {
          const ex = existingMap.get(inc.requestId);
          if (ex) {
            const wEx = statusWeights[ex.status] ?? 0;
            const wInc = statusWeights[inc.status] ?? 0;
            // CRITICAL: NEVER rollback DELIVERING or COMPLETED to CALLING!
            const finalStatus = wInc >= wEx ? inc.status : ex.status;
            map.set(inc.requestId, {
              ...ex,
              ...inc,
              status: finalStatus,
              deliveredBy: (finalStatus === inc.status ? inc.deliveredBy : ex.deliveredBy) || inc.deliveredBy || ex.deliveredBy,
              deliveredAt: (finalStatus === inc.status ? inc.deliveredAt : ex.deliveredAt) || inc.deliveredAt || ex.deliveredAt,
              isStockDeducted: Boolean(inc.isStockDeducted || ex.isStockDeducted),
            });
          } else {
            map.set(inc.requestId, inc);
          }
        }
      }

      // 2. CRITICAL FIX: Retain ALL existing local calls that were not in incoming data!
      // This permanently stops calls waiting in "Đơn yêu cầu đang gọi" from disappearing when another order is accepted or synced!
      for (const ex of existingCalls) {
        if (ex && ex.requestId && !deletedSet.has(ex.requestId) && !map.has(ex.requestId)) {
          map.set(ex.requestId, ex);
        }
      }

      const mergedIncoming = Array.from(map.values()).sort(
        (a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime()
      );
      const jsonStr = JSON.stringify(mergedIncoming);
      localStorage.setItem(key, compressStorageValue(jsonStr));
      localStorage.setItem(`${CACHE_TS_PREFIX}${key}`, ts);
      return;
    }

    // Smart-merge Kitting Scan Logs by id so scans across devices never overwrite each other
    if (key === STORAGE_KEYS.KITTING_SCAN_LOGS && Array.isArray(data)) {
      let existingLogs: any[] = [];
      try {
        const rawLogs = localStorage.getItem(key);
        if (rawLogs) {
          const decomp = decompressStorageValue(rawLogs) || rawLogs;
          const p = JSON.parse(decomp);
          if (Array.isArray(p)) existingLogs = p;
        }
      } catch (_) {}

      const cutoffMs = Date.now() - 35 * 24 * 60 * 60 * 1000;
      const logMap = new Map<string, any>();

      for (const item of [...(data as any[]), ...existingLogs]) {
        if (!item || !item.id) continue;
        const t = new Date(item.timestamp || 0).getTime();
        if (!isNaN(t) && t < cutoffMs) continue;
        if (!logMap.has(item.id)) {
          logMap.set(item.id, item);
        }
      }

      const mergedLogs = Array.from(logMap.values()).sort(
        (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
      );
      const jsonStr = JSON.stringify(mergedLogs);
      localStorage.setItem(key, compressStorageValue(jsonStr));
      localStorage.setItem(`${CACHE_TS_PREFIX}${key}`, ts);
      return;
    }

    const jsonStr = JSON.stringify(data);
    localStorage.setItem(key, compressStorageValue(jsonStr));
    localStorage.setItem(`${CACHE_TS_PREFIX}${key}`, ts);
  } catch {
    // QuotaExceeded or private browsing mode safe fallback
  }
}

export function removeLocalCacheData(key: string): void {
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(`${CACHE_TS_PREFIX}${key}`);
  } catch (_) {}
}

// Helper to compare server and local timestamps accurately
export function isServerTimestampNewer(serverTs: string, localTs: string | null): boolean {
  if (!localTs) return true;
  const sTime = new Date(serverTs).getTime();
  const lTime = new Date(localTs).getTime();
  if (isNaN(sTime) || isNaN(lTime)) return serverTs !== localTs;
  return sTime > lTime;
}

/**
 * Smart Local Caching Key-Value Store for Supabase `thekho_app_data` table.
 * Dramatically reduces Egress by checking ~50 byte `updated_at` before downloading large JSONB payloads.
 */
export const supabaseKeyStore = {
  /**
   * Smart GET with updated_at timestamp comparison.
   * If updated_at on Supabase matches local cache timestamp, returns local cache with 0 JSONB Egress.
   */
  async get<T>(key: string, options?: { forceFresh?: boolean }): Promise<T | null> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      const localCache = getLocalCacheData<T>(key);

      // If Supabase is not configured or offline, return local cache immediately
      if (!isConfigured || !client) {
        return localCache.data;
      }

      // 1. SMART CHECK: If we have valid local cache and forceFresh is false, check ONLY `updated_at` (~50 Bytes)
      if (localCache.data !== null && localCache.timestamp && !options?.forceFresh) {
        const { data: metaData, error: metaErr } = await client
          .from('thekho_app_data')
          .select('updated_at')
          .eq('key', key)
          .maybeSingle();

        if (!metaErr && metaData?.updated_at) {
          const serverUpdatedAt = String(metaData.updated_at);
          if (!isServerTimestampNewer(serverUpdatedAt, localCache.timestamp)) {
            // CACHE HIT! The payload on cloud has NOT changed (or local is newer).
            egressStats.cacheHits++;
            const estimatedSaved = JSON.stringify(localCache.data).length;
            egressStats.estimatedBytesSaved += estimatedSaved;
            return localCache.data;
          }
        }
      }

      // 2. CACHE MISS or CHANGED: Fetch full payload `data, updated_at`
      egressStats.cacheMisses++;
      const { data, error } = await client
        .from('thekho_app_data')
        .select('data, updated_at')
        .eq('key', key)
        .maybeSingle();

      if (error) {
        logSupabaseError(`KeyStore.get(${key})`, error);
        return localCache.data; // Fallback to local cache on error
      }

      if (!data) {
        return localCache.data;
      }

      const fetchedData = data.data as T;
      const updatedTimestamp = data.updated_at || new Date().toISOString();
      const downloadedBytes = JSON.stringify(data).length;
      egressStats.estimatedBytesDownloaded += downloadedBytes;

      // Update local storage and timestamp
      setLocalCacheData(key, fetchedData, updatedTimestamp);
      return fetchedData;
    } catch (err) {
      logSupabaseError(`KeyStore.get(${key}) catch`, err);
      const localCache = getLocalCacheData<T>(key);
      return localCache.data;
    }
  },

  /**
   * Lightweight Check (~50 - 200 Bytes): Checks whether any key on Supabase Cloud has newer updated_at than local cache.
   * If false, callers can completely skip downloading full data payloads.
   */
  async checkCloudHasUpdates(keys?: string[]): Promise<boolean> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) {
        return false;
      }
      const targetKeys = keys && keys.length > 0 ? keys : Object.values(STORAGE_KEYS);
      const { data: metaList, error } = await client
        .from('thekho_app_data')
        .select('key, updated_at')
        .in('key', targetKeys);

      if (error || !metaList || metaList.length === 0) {
        return false;
      }

      for (const row of metaList) {
        const key = row.key;
        const serverTs = String(row.updated_at || '');
        const local = getLocalCacheData(key);
        // Only return true if local data doesn't exist or server timestamp is strictly newer
        if (local.data === null || isServerTimestampNewer(serverTs, local.timestamp)) {
          return true;
        }
      }

      return false;
    } catch (err) {
      logSupabaseError('checkCloudHasUpdates catch', err);
      return false;
    }
  },

  /**
   * Batch Smart Sync: Checks timestamps for multiple keys in a single lightweight query (~200 Bytes),
   * and only downloads the specific keys that have actually changed on Cloud!
   * When forceFetch is true (e.g. user clicks "Đồng bộ Supabase"), downloads 100% fresh data from Cloud.
   */
  async batchSyncAllKeys(keys: string[], forceFetch: boolean = false): Promise<{ updatedCount: number; cachedCount: number }> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client || keys.length === 0) {
        return { updatedCount: 0, cachedCount: 0 };
      }

      // 1. Single lightweight query to get all updated_at for specified keys (~200 - 400 Bytes)
      const { data: metaList, error } = await client
        .from('thekho_app_data')
        .select('key, updated_at')
        .in('key', keys);

      if (error || !metaList) {
        logSupabaseError('batchSyncAllKeys meta query', error);
        return { updatedCount: 0, cachedCount: 0 };
      }

      const changedKeys: string[] = [];
      let cachedCount = 0;

      if (forceFetch) {
        changedKeys.push(...keys);
      } else {
        for (const row of metaList) {
          const key = row.key;
          const serverTs = String(row.updated_at || '');
          const local = getLocalCacheData(key);

          if (local.data !== null && !isServerTimestampNewer(serverTs, local.timestamp)) {
            cachedCount++;
            egressStats.cacheHits++;
            egressStats.estimatedBytesSaved += JSON.stringify(local.data).length;
          } else {
            changedKeys.push(key);
          }
        }
      }

      // 2. Fetch data ONLY for changed or missing keys
      let updatedCount = 0;
      if (changedKeys.length > 0) {
        const { data: fullDataList, error: dataErr } = await client
          .from('thekho_app_data')
          .select('key, data, updated_at')
          .in('key', changedKeys);

        if (!dataErr && fullDataList) {
          for (const row of fullDataList) {
            setLocalCacheData(row.key, row.data, row.updated_at || new Date().toISOString());
            updatedCount++;
            egressStats.cacheMisses++;
            egressStats.estimatedBytesDownloaded += JSON.stringify(row).length;
          }
        }
      }

      return { updatedCount, cachedCount };
    } catch (err) {
      logSupabaseError('batchSyncAllKeys catch', err);
      return { updatedCount: 0, cachedCount: 0 };
    }
  },

  /**
   * UPSERT: Ghi đè đồng thời cả Supabase Cloud và localStorage
   */
  async set<T>(key: string, value: T): Promise<boolean> {
    // CRITICAL ARCHITECTURE RULE: Bảng `transactions` là nguồn dữ liệu duy nhất (Single Source of Truth)
    // cho lịch sử giao dịch. Tuyệt đối KHÔNG ghi trùng lặp mảng transactions vào bảng Key-Value `thekho_app_data`.
    if (key === STORAGE_KEYS.TRANSACTIONS || key === 'thekho_transactions_v1') {
      removeLocalCacheData(key);
      return true;
    }

    const nowIso = new Date().toISOString();

    // 1. Update localStorage immediately with latest timestamp (unless key is blacklisted)
    setLocalCacheData(key, value, nowIso);

    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return true;

      // 2. Upsert to Supabase Cloud
      const { error } = await client
        .from('thekho_app_data')
        .upsert(
          { key, data: value, updated_at: nowIso },
          { onConflict: 'key' }
        );

      if (error) {
        logSupabaseError(`KeyStore.set(${key})`, error);
        return false;
      }

      return true;
    } catch (err) {
      logSupabaseError(`KeyStore.set(${key}) catch`, err);
      return false;
    }
  },

  /**
   * UPSERT DUY NHẤT LÊN SUPABASE CLOUD, tuyệt đối không lưu vào localStorage.
   * Chuyên dùng cho Master Container Tags để bảo vệ dung lượng bộ nhớ.
   * (Tuyệt đối chặn ghi `thekho_transactions_v1` vào Key-Value để chống Write Amplification).
   */
  async setCloudOnly<T>(key: string, value: T): Promise<boolean> {
    if (key === STORAGE_KEYS.TRANSACTIONS || key === 'thekho_transactions_v1') {
      removeLocalCacheData(key);
      return true;
    }

    const nowIso = new Date().toISOString();
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return true;

      const { error } = await client
        .from('thekho_app_data')
        .upsert(
          { key, data: value, updated_at: nowIso },
          { onConflict: 'key' }
        );

      if (error) {
        logSupabaseError(`KeyStore.setCloudOnly(${key})`, error);
        return false;
      }

      return true;
    } catch (err) {
      logSupabaseError(`KeyStore.setCloudOnly(${key}) catch`, err);
      return false;
    }
  },

  /**
   * DELETE: Xóa đồng thời cả Supabase Cloud và localStorage
   */
  async delete(key: string): Promise<boolean> {
    removeLocalCacheData(key);

    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return true;

      const { error } = await client
        .from('thekho_app_data')
        .delete()
        .eq('key', key);

      if (error) {
        logSupabaseError(`KeyStore.delete(${key})`, error);
        return false;
      }

      return true;
    } catch (err) {
      logSupabaseError(`KeyStore.delete(${key}) catch`, err);
      return false;
    }
  },

  /**
   * Update cache when a Realtime broadcast arrives with the new row payload
   */
  handleRealtimePayload(key: string, data: any, updatedAt: string): void {
    if (!key) return;
    setLocalCacheData(key, data, updatedAt || new Date().toISOString());
  },
};

// In-Memory RAM TTL Cache for Transactions (5 phút = 300,000ms)
// Cắt giảm 100% Egress Supabase khi đọc lại giao dịch trong vòng 5 phút
const TRANSACTIONS_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedAllTransactionsData: { data: Transaction[]; timestamp: number } | null = null;
const pagedTransactionsMemoryCache = new Map<string, { data: Transaction[]; timestamp: number }>();

export function invalidateTransactionMemoryCache(): void {
  cachedAllTransactionsData = null;
  pagedTransactionsMemoryCache.clear();
}

/**
 * Direct Relational Table CRUD for Supabase with Pagination, Limits & Column Select Optimization.
 */
export const supabaseRelationalStore = {
  // --- PARTS CRUD ---
  /**
   * Selects parts with explicit column selection (tuyệt đối không dùng SELECT *) and pagination to save Egress.
   */
  async selectParts(options?: { limit?: number; offset?: number; search?: string }): Promise<Part[] | null> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return null;

      const limit = options?.limit ?? 2000;
      let query = client
        .from('parts')
        .select('id, code, name, group_name, unit, current_stock, qty_ng, min_stock, max_stock, location, locations, unit_price, supplier, notes, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (options?.search) {
        query = query.or(`code.ilike.%${options.search}%,name.ilike.%${options.search}%`);
      }

      if (options?.offset !== undefined) {
        query = query.range(options.offset, options.offset + limit - 1);
      } else {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      if (error) {
        logSupabaseError('selectParts', error);
        return null;
      }
      return (data || []).map(mapSupabaseRowToPart);
    } catch (err) {
      logSupabaseError('selectParts catch', err);
      return null;
    }
  },

  /**
   * Fetches ALL parts from relational `parts` table with automatic 1000-row pagination
   * (prevents Supabase PostgREST 1000-row default truncation).
   */
  async selectAllParts(): Promise<Part[] | null> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return null;

      const allParts: Part[] = [];
      const pageSize = 1000;
      let page = 0;

      while (page < 20) {
        const { data, error } = await client
          .from('parts')
          .select('id, code, name, group_name, unit, current_stock, qty_ng, min_stock, max_stock, location, locations, unit_price, supplier, notes, created_at, updated_at')
          .order('updated_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
          logSupabaseError('selectAllParts', error);
          return page === 0 ? null : allParts;
        }
        if (!data || data.length === 0) break;
        allParts.push(...data.map(mapSupabaseRowToPart));
        if (data.length < pageSize) break;
        page++;
      }

      return allParts;
    } catch (err) {
      logSupabaseError('selectAllParts catch', err);
      return null;
    }
  },

  /**
   * Lightweight query of relational `parts` table for Kho NG reconciliation (returns id, code, qtyNg, updatedAt only).
   */
  async selectPartsNgSummary(): Promise<Array<{ id: string; code: string; qtyNg: number; updatedAt: string }> | null> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return null;

      const result: Array<{ id: string; code: string; qtyNg: number; updatedAt: string }> = [];
      const pageSize = 1000;
      let page = 0;

      while (page < 20) {
        const { data, error } = await client
          .from('parts')
          .select('id, code, qty_ng, updated_at')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
          logSupabaseError('selectPartsNgSummary', error);
          return page === 0 ? null : result;
        }
        if (!data || data.length === 0) break;
        for (const row of data as any[]) {
          result.push({
            id: String(row.id || ''),
            code: String(row.code || ''),
            qtyNg: typeof row.qty_ng === 'number' ? row.qty_ng : Number(row.qty_ng) || 0,
            updatedAt: String(row.updated_at || ''),
          });
        }
        if (data.length < pageSize) break;
        page++;
      }

      return result;
    } catch (err) {
      logSupabaseError('selectPartsNgSummary catch', err);
      return null;
    }
  },

  async insertPart(part: Part): Promise<boolean> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return false;
      const row = mapPartToSupabaseRow(part);
      const { error } = await client.from('parts').upsert(row, { onConflict: 'id' });
      if (error) {
        logSupabaseError('insertPart', error);
        return false;
      }
      return true;
    } catch (err) {
      logSupabaseError('insertPart catch', err);
      return false;
    }
  },

  async upsertParts(parts: Part[], options?: { preserveExistingQtyNg?: boolean }): Promise<boolean> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return false;
      if (!parts || parts.length === 0) return true;

      const MAX_BATCH_SIZE = 150;
      const rows = parts.map((p) => {
        const mapped: any = mapPartToSupabaseRow(p);
        if (options?.preserveExistingQtyNg) {
          delete mapped.qty_ng;
        }
        return mapped;
      });

      for (let i = 0; i < rows.length; i += MAX_BATCH_SIZE) {
        const chunk = rows.slice(i, i + MAX_BATCH_SIZE);
        const { error } = await client.from('parts').upsert(chunk, { onConflict: 'id' });
        if (error) {
          logSupabaseError('upsertParts', error);
          if (String(error.message || '').includes('qty_ng')) {
            const rowsFallback = chunk.map((r: any) => {
              const copy = { ...r };
              delete copy.qty_ng;
              return copy;
            });
            const { error: err2 } = await client.from('parts').upsert(rowsFallback, { onConflict: 'id' });
            if (err2) return false;
          } else {
            return false;
          }
        }
      }
      return true;
    } catch (err) {
      logSupabaseError('upsertParts catch', err);
      return false;
    }
  },

  async updatePart(id: string, updates: Partial<Part>): Promise<boolean> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return false;
      const rowUpdates: any = {};
      if (updates.code !== undefined) rowUpdates.code = String(updates.code);
      if (updates.name !== undefined) rowUpdates.name = String(updates.name);
      if ((updates as any).groupName !== undefined || (updates as any).group_name !== undefined) {
        rowUpdates.group_name = String((updates as any).groupName || (updates as any).group_name);
      }
      if (updates.unit !== undefined) rowUpdates.unit = String(updates.unit);
      if (updates.currentStock !== undefined) {
        rowUpdates.current_stock =
          typeof updates.currentStock === 'number' ? updates.currentStock : Number(updates.currentStock) || 0;
      }
      if (updates.qtyNg !== undefined) {
        rowUpdates.qty_ng =
          typeof updates.qtyNg === 'number' ? updates.qtyNg : Number(updates.qtyNg) || 0;
      }
      if (updates.minStock !== undefined) {
        rowUpdates.min_stock =
          typeof updates.minStock === 'number' ? updates.minStock : Number(updates.minStock) || 0;
      }
      if (updates.location !== undefined) rowUpdates.location = String(updates.location);
      if (updates.locations !== undefined) {
        rowUpdates.locations = Array.isArray(updates.locations) ? updates.locations : [];
      }
      if (updates.note !== undefined || updates.description !== undefined) {
        rowUpdates.notes = String(updates.note || updates.description || '');
      }
      rowUpdates.updated_at = new Date().toISOString();

      const { error } = await client.from('parts').update(rowUpdates).eq('id', id);
      if (error) {
        logSupabaseError('updatePart', error);
        return false;
      }
      return true;
    } catch (err) {
      logSupabaseError('updatePart catch', err);
      return false;
    }
  },

  async deletePart(id: string): Promise<boolean> {
    return this.deletePartsBatch([id]);
  },

  async deletePartsBatch(ids: string[]): Promise<boolean> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return false;
      const cleanIds = Array.from(new Set((ids || []).filter(Boolean)));
      if (cleanIds.length === 0) return true;

      const MAX_BATCH_SIZE = 150;
      for (let i = 0; i < cleanIds.length; i += MAX_BATCH_SIZE) {
        const chunk = cleanIds.slice(i, i + MAX_BATCH_SIZE);
        const { error } = await client.from('parts').delete().in('id', chunk);
        if (error) {
          logSupabaseError('deletePartsBatch', error);
          return false;
        }
      }
      return true;
    } catch (err) {
      logSupabaseError('deletePartsBatch catch', err);
      return false;
    }
  },

  async deletePartsByCodes(codes: string[]): Promise<boolean> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return false;
      const cleanCodes = Array.from(new Set((codes || []).map((c) => String(c || '').trim()).filter(Boolean)));
      if (cleanCodes.length === 0) return true;

      const MAX_BATCH_SIZE = 100;
      for (let i = 0; i < cleanCodes.length; i += MAX_BATCH_SIZE) {
        const chunk = cleanCodes.slice(i, i + MAX_BATCH_SIZE);
        const { error } = await client.from('parts').delete().in('code', chunk);
        if (error) {
          logSupabaseError('deletePartsByCodes', error);
          return false;
        }
      }
      return true;
    } catch (err) {
      logSupabaseError('deletePartsByCodes catch', err);
      return false;
    }
  },

  // --- TRANSACTIONS CRUD ---
  /**
   * Selects transactions with strict pagination limit (default 100 rows) and optional date filter to eliminate massive egress.
   * Cắt giảm triệt để SELECT * bằng cách chỉ chọn đúng các trường bắt buộc.
   */
  async selectTransactions(options?: {
    limit?: number;
    offset?: number;
    partCode?: string;
    startDate?: string;
    endDate?: string;
    forceFresh?: boolean;
  }): Promise<Transaction[] | null> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return null;

      const limit = options?.limit ?? 100;
      const offset = options?.offset ?? 0;
      const cacheKey = `tx_${options?.partCode || 'all'}_${options?.startDate || 'none'}_${options?.endDate || 'none'}_${limit}_${offset}`;

      if (!options?.forceFresh) {
        const cached = pagedTransactionsMemoryCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < TRANSACTIONS_CACHE_TTL_MS) {
          egressStats.cacheHits++;
          return cached.data;
        }
      }

      let query = client
        .from('transactions')
        .select('id, part_id, part_code, part_name, unit, type, quantity, date, person, location_id, production_order, reason_or_purpose, notes, stock_before, stock_after, created_at')
        .order('date', { ascending: false });

      if (options?.partCode) {
        query = query.eq('part_code', options.partCode);
      }

      if (options?.startDate) {
        query = query.gte('date', options.startDate);
      }
      if (options?.endDate) {
        query = query.lte('date', `${options.endDate}T23:59:59.999Z`);
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) {
        logSupabaseError('selectTransactions', error);
        return null;
      }

      const mapped = (data || []).map(mapSupabaseRowToTransaction);
      pagedTransactionsMemoryCache.set(cacheKey, {
        data: mapped,
        timestamp: Date.now(),
      });
      egressStats.cacheMisses++;
      return mapped;
    } catch (err) {
      logSupabaseError('selectTransactions catch', err);
      return null;
    }
  },

  /**
   * Truy vấn tinh gọn các cột bắt buộc cho Reconcile / BinCard History (Tuyệt đối không dùng SELECT * hay count: 'exact').
   * Kết hợp RAM TTL Cache (5 phút) để không kéo lại toàn bộ transaction ledger khi dữ liệu vừa được đọc gần đây.
   */
  async selectReconcileTransactions(options?: {
    partCode?: string;
    forceFresh?: boolean;
  }): Promise<Transaction[]> {
    const cacheKey = `reconcile_tx_${(options?.partCode || 'ALL').trim().toUpperCase()}`;
    if (!options?.forceFresh) {
      const cached = pagedTransactionsMemoryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < TRANSACTIONS_CACHE_TTL_MS) {
        egressStats.cacheHits++;
        return cached.data;
      }
      if (!options?.partCode && cachedAllTransactionsData && Date.now() - cachedAllTransactionsData.timestamp < TRANSACTIONS_CACHE_TTL_MS) {
        egressStats.cacheHits++;
        return cachedAllTransactionsData.data;
      }
    }

    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) {
        return cachedAllTransactionsData ? cachedAllTransactionsData.data : [];
      }

      // Chỉ select đúng các cột cần thiết cho tính toán tồn kho & phân bổ vị trí kệ (tránh SELECT *)
      const minimalColumns =
        'id, part_id, part_code, part_name, unit, type, quantity, date, person, production_order, location_id, stock_before, stock_after, reason_or_purpose, notes';
      const resultTxs: Transaction[] = [];
      let page = 0;
      const pageSize = 1000;

      while (true) {
        let query = client
          .from('transactions')
          .select(minimalColumns)
          .order('date', { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (options?.partCode) {
          query = query.eq('part_code', options.partCode.trim());
        }

        const { data, error } = await query;
        if (error) {
          logSupabaseError('selectReconcileTransactions', error);
          break;
        }
        if (!data || data.length === 0) break;
        resultTxs.push(...data.map(mapSupabaseRowToTransaction));
        if (data.length < pageSize) break;
        page++;
      }

      const now = Date.now();
      pagedTransactionsMemoryCache.set(cacheKey, {
        data: resultTxs,
        timestamp: now,
      });
      if (!options?.partCode && resultTxs.length > 0) {
        cachedAllTransactionsData = {
          data: resultTxs,
          timestamp: now,
        };
      }
      egressStats.cacheMisses++;
      return resultTxs;
    } catch (err) {
      logSupabaseError('selectReconcileTransactions catch', err);
      return cachedAllTransactionsData ? cachedAllTransactionsData.data : [];
    }
  },

  /**
   * Selects ALL transactions from Supabase with RAM TTL Cache (5 phút).
   * Trả về ngay lập tức từ bộ nhớ RAM nếu đã tải trong 5 phút trước đó, tiết kiệm 100% dung lượng Egress.
   */
  async selectAllTransactions(forceFresh: boolean = false): Promise<Transaction[]> {
    if (!forceFresh && cachedAllTransactionsData && Date.now() - cachedAllTransactionsData.timestamp < TRANSACTIONS_CACHE_TTL_MS) {
      egressStats.cacheHits++;
      egressStats.estimatedBytesSaved += JSON.stringify(cachedAllTransactionsData.data).length;
      return cachedAllTransactionsData.data;
    }

    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return cachedAllTransactionsData ? cachedAllTransactionsData.data : [];

      const allTxs: Transaction[] = [];
      let page = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await client
          .from('transactions')
          .select('id, part_id, part_code, part_name, unit, type, quantity, date, person, location_id, production_order, reason_or_purpose, notes, stock_before, stock_after, created_at')
          .order('date', { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
          logSupabaseError('selectAllTransactions', error);
          break;
        }
        if (!data || data.length === 0) break;
        allTxs.push(...data.map(mapSupabaseRowToTransaction));
        if (data.length < pageSize) break;
        page++;
      }

      cachedAllTransactionsData = {
        data: allTxs,
        timestamp: Date.now(),
      };
      egressStats.cacheMisses++;
      return allTxs;
    } catch (err) {
      logSupabaseError('selectAllTransactions catch', err);
      return cachedAllTransactionsData ? cachedAllTransactionsData.data : [];
    }
  },

  /**
   * Đồng bộ gia tăng (Incremental Sync) cho Transactions:
   * - Khi khởi động lần đầu (chưa có sinceIso): chỉ tải tối đa `limit` (mặc định 100) giao dịch mới nhất.
   * - Các lần đồng bộ tiếp theo (có sinceIso): chỉ tải các bản ghi mới phát sinh có `date > sinceIso`.
   * Cắt giảm 99% Egress so với selectAllTransactions().
   */
  async selectIncrementalTransactions(options?: {
    sinceIso?: string;
    limit?: number;
  }): Promise<Transaction[]> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return [];

      const limit = options?.limit ?? 100;
      const columns =
        'id, part_id, part_code, part_name, unit, type, quantity, date, person, location_id, production_order, reason_or_purpose, notes, stock_before, stock_after, created_at';

      let query = client
        .from('transactions')
        .select(columns)
        .order('date', { ascending: false })
        .limit(limit);

      if (options?.sinceIso) {
        query = query.gt('date', options.sinceIso);
      }

      const { data, error } = await query;
      if (error) {
        logSupabaseError('selectIncrementalTransactions', error);
        return [];
      }

      const mapped = (data || []).map(mapSupabaseRowToTransaction);
      egressStats.cacheMisses++;
      return mapped;
    } catch (err) {
      logSupabaseError('selectIncrementalTransactions catch', err);
      return [];
    }
  },

  async deleteTransactionsByPart(partIdOrCode: string): Promise<boolean> {
    invalidateTransactionMemoryCache();
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client || !partIdOrCode) return false;
      const clean = partIdOrCode.trim();
      await client.from('transactions').delete().or(`part_id.eq.${clean},part_code.eq.${clean}`);
      return true;
    } catch (err) {
      logSupabaseError('deleteTransactionsByPart catch', err);
      return false;
    }
  },

  async insertTransaction(tx: Transaction): Promise<boolean> {
    invalidateTransactionMemoryCache();
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return false;
      const row = mapTransactionToSupabaseRow(tx);
      const { error } = await client.from('transactions').upsert(row, { onConflict: 'id' });
      if (error) {
        logSupabaseError('insertTransaction', error);
        return false;
      }
      return true;
    } catch (err) {
      logSupabaseError('insertTransaction catch', err);
      return false;
    }
  },

  async upsertTransactions(txs: Transaction[]): Promise<boolean> {
    invalidateTransactionMemoryCache();
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return false;
      if (!txs || txs.length === 0) return true;
      const MAX_BATCH_SIZE = 150;
      const rows = txs.map(mapTransactionToSupabaseRow);
      for (let i = 0; i < rows.length; i += MAX_BATCH_SIZE) {
        const chunk = rows.slice(i, i + MAX_BATCH_SIZE);
        const { error } = await client.from('transactions').upsert(chunk, { onConflict: 'id' });
        if (error) {
          logSupabaseError('upsertTransactions', error);
          return false;
        }
      }
      return true;
    } catch (err) {
      logSupabaseError('upsertTransactions catch', err);
      return false;
    }
  },

  // --- ANDON / MATERIAL CALLS CRUD (THEO REQUEST_ID & LỌC TRẠNG THÁI) ---
  /**
   * Truy vấn có điều kiện các đơn gọi hàng Andon theo trạng thái (mặc định chỉ lấy các đơn đang hoạt động: CALLING, DELIVERING
   * hoặc giới hạn bản ghi mới nhất), tránh tải toàn bộ lịch sử đơn gọi hàng cũ.
   */
  async selectActiveMaterialCalls(options?: {
    statuses?: Array<'CALLING' | 'DELIVERING' | 'COMPLETED'>;
    limit?: number;
    forceFresh?: boolean;
  }): Promise<MaterialCallRequest[] | null> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return null;

      // Fallback thông qua smart timestamp check của KeyStore (chỉ tốn ~50B nếu không có thay đổi trên Cloud)
      const remoteCalls = await supabaseKeyStore.get<MaterialCallRequest[]>(STORAGE_KEYS.MATERIAL_CALLS, {
        forceFresh: options?.forceFresh,
      });
      if (!remoteCalls || !Array.isArray(remoteCalls)) return null;

      const statuses = options?.statuses;
      if (statuses && statuses.length > 0) {
        const statusSet = new Set(statuses);
        const filtered = remoteCalls.filter((c) => c && statusSet.has(c.status));
        return options.limit ? filtered.slice(0, options.limit) : filtered;
      }

      // Always return 100% of active calls (CALLING and DELIVERING), plus recent completed calls
      // to ensure no active orders are ever lost or truncated!
      const activeCalls = remoteCalls.filter((c) => c && (c.status === 'CALLING' || c.status === 'DELIVERING'));
      const completedCalls = remoteCalls.filter((c) => c && c.status === 'COMPLETED');
      const limitCompleted = options?.limit ?? 500;
      const combined = [...activeCalls, ...completedCalls.slice(0, limitCompleted)].sort(
        (a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime()
      );
      return combined;
    } catch (err) {
      logSupabaseError('selectActiveMaterialCalls catch', err);
      return null;
    }
  },

  // --- SETTINGS CRUD ---
  async selectSettings(): Promise<AppSettings | null> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return null;
      const { data, error } = await client
        .from('settings')
        .select('data, updated_at')
        .eq('id', 'app_settings')
        .maybeSingle();

      if (error || !data) {
        if (error) logSupabaseError('selectSettings', error);
        return null;
      }
      return data.data as AppSettings;
    } catch (err) {
      logSupabaseError('selectSettings catch', err);
      return null;
    }
  },

  async upsertSettings(settings: AppSettings): Promise<boolean> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return false;
      const { error } = await client
        .from('settings')
        .upsert(
          { id: 'app_settings', data: settings, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        );
      if (error) {
        logSupabaseError('upsertSettings', error);
        return false;
      }
      return true;
    } catch (err) {
      logSupabaseError('upsertSettings catch', err);
      return false;
    }
  },
};

/**
 * Safely merge part updates into `thekho_app_data` (`thekho_parts_v1`) using Compare-And-Swap (`updated_at`)
 * so concurrent writes across workstations never resurrect exported NG stock or clobber unrelated parts.
 */
export async function mergePartsKvWithCloud({
  fallbackLocalParts,
  partsToUpsert = [],
  partIdsToDelete = [],
  partCodesToDelete = [],
  preserveCloudQtyNg = false,
}: {
  fallbackLocalParts: Part[];
  partsToUpsert?: Part[];
  partIdsToDelete?: string[];
  partCodesToDelete?: string[];
  preserveCloudQtyNg?: boolean;
}): Promise<{ success: boolean; mergedParts: Part[] }> {
  const { client, isConfigured } = getActiveSupabaseClient();
  const deleteIdSet = new Set((partIdsToDelete || []).filter(Boolean));
  const deleteCodeSet = new Set(
    (partCodesToDelete || []).map((c) => String(c || '').trim().toLowerCase()).filter(Boolean)
  );
  const upsertById = new Map<string, Part>();
  const upsertByCode = new Map<string, Part>();

  for (const p of partsToUpsert) {
    if (!p || !p.id) continue;
    const codeKey = p.code ? p.code.trim().toLowerCase() : '';
    if (deleteIdSet.has(p.id) || (codeKey && deleteCodeSet.has(codeKey))) continue;
    upsertById.set(p.id, p);
    if (codeKey) upsertByCode.set(codeKey, p);
  }

  // Read tombstoned deleted part codes from localStorage so stale devices cannot resurrect intentionally deleted parts
  let tombstoneCodeSet = new Set<string>();
  try {
    const rawTomb = localStorage.getItem(STORAGE_KEYS.DELETED_PART_CODES);
    if (rawTomb) {
      const decomp = decompressStorageValue(rawTomb) || rawTomb;
      const parsed = JSON.parse(decomp);
      if (Array.isArray(parsed)) {
        tombstoneCodeSet = new Set(parsed.map((c: any) => String(c || '').trim().toLowerCase()).filter(Boolean));
      }
    }
  } catch (_) {}

  const mergeWithBase = (baseList: Part[]): Part[] => {
    const mergedByCode = new Map<string, Part>();
    const noCodeMap = new Map<string, Part>();

    const isDeleted = (p: Part): boolean => {
      if (!p || !p.id) return true;
      const cKey = p.code ? p.code.trim().toLowerCase() : '';
      if (deleteIdSet.has(p.id)) return true;
      if (cKey && deleteCodeSet.has(cKey)) return true;
      // Never resurrect tombstoned code unless it is being explicitly upserted right now
      if (cKey && tombstoneCodeSet.has(cKey) && !upsertByCode.has(cKey) && !upsertById.has(p.id)) return true;
      return false;
    };

    // 1. Seed with authoritative Cloud base (preserving every part added on any device!)
    for (const cp of baseList) {
      if (isDeleted(cp)) continue;
      const cKey = cp.code ? cp.code.trim().toLowerCase() : '';
      if (cKey) {
        if (!mergedByCode.has(cKey)) mergedByCode.set(cKey, cp);
      } else {
        noCodeMap.set(cp.id, cp);
      }
    }

    // 2. Include any local parts missing from cloud (e.g., newly created locally before sync)
    for (const lp of fallbackLocalParts) {
      if (isDeleted(lp)) continue;
      const cKey = lp.code ? lp.code.trim().toLowerCase() : '';
      if (cKey) {
        if (!mergedByCode.has(cKey)) {
          mergedByCode.set(cKey, lp);
        }
      } else if (!noCodeMap.has(lp.id)) {
        noCodeMap.set(lp.id, lp);
      }
    }

    // 3. Apply explicit upserts onto base
    for (const [id, incoming] of upsertById.entries()) {
      const cKey = incoming.code ? incoming.code.trim().toLowerCase() : '';
      const existing = (cKey ? mergedByCode.get(cKey) : undefined) || noCodeMap.get(id);

      if (existing) {
        const finalQtyNg = preserveCloudQtyNg
          ? typeof existing.qtyNg === 'number'
            ? existing.qtyNg
            : Number((existing as any).qty_ng || existing.qtyNg) || 0
          : typeof incoming.qtyNg === 'number'
          ? incoming.qtyNg
          : Number((incoming as any).qty_ng || incoming.qtyNg) || 0;

        const mergedItem: Part = {
          ...existing,
          ...incoming,
          id: existing.id,
          qtyNg: finalQtyNg,
        };
        if (cKey) {
          mergedByCode.set(cKey, mergedItem);
        } else {
          noCodeMap.set(existing.id, mergedItem);
        }
      } else {
        if (cKey) {
          mergedByCode.set(cKey, incoming);
        } else {
          noCodeMap.set(id, incoming);
        }
      }
    }

    return [...Array.from(mergedByCode.values()), ...Array.from(noCodeMap.values())];
  };

  if (!isConfigured || !client) {
    const localMerged = mergeWithBase(fallbackLocalParts);
    setLocalCacheData(STORAGE_KEYS.PARTS, localMerged, new Date().toISOString());
    return { success: true, mergedParts: localMerged };
  }

  let lastCloudParts: Part[] | null = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const { data: row, error: fetchErr } = await client
        .from('thekho_app_data')
        .select('data, updated_at')
        .eq('key', STORAGE_KEYS.PARTS)
        .maybeSingle();

      if (fetchErr) {
        logSupabaseError('mergePartsKvWithCloud fetch', fetchErr);
        await new Promise((r) => setTimeout(r, 75 * (attempt + 1)));
        continue;
      }

      const cloudParts = Array.isArray(row?.data) ? (row.data as Part[]) : [];
      if (cloudParts.length > 0) {
        lastCloudParts = cloudParts;
      }
      const prevUpdatedAt = row?.updated_at ? String(row.updated_at) : null;
      const baseList = cloudParts.length > 0 ? cloudParts : fallbackLocalParts;
      const finalMerged = mergeWithBase(baseList);
      const nextIso = new Date().toISOString();

      if (prevUpdatedAt) {
        const { data: updatedRows, error: updErr } = await client
          .from('thekho_app_data')
          .update({ data: finalMerged, updated_at: nextIso })
          .eq('key', STORAGE_KEYS.PARTS)
          .eq('updated_at', prevUpdatedAt)
          .select('updated_at');

        if (!updErr && updatedRows && updatedRows.length > 0) {
          setLocalCacheData(STORAGE_KEYS.PARTS, finalMerged, String(updatedRows[0].updated_at || nextIso));
          return { success: true, mergedParts: finalMerged };
        }
        if (updErr) {
          logSupabaseError('mergePartsKvWithCloud CAS update', updErr);
        }
        // Contention detected: brief jitter backoff before next CAS retry
        await new Promise((r) => setTimeout(r, 75 * (attempt + 1) + Math.floor(Math.random() * 60)));
      } else {
        const { data: upsertedRows, error: upsErr } = await client
          .from('thekho_app_data')
          .upsert([{ key: STORAGE_KEYS.PARTS, data: finalMerged, updated_at: nextIso }], { onConflict: 'key' })
          .select('updated_at');

        if (!upsErr) {
          const ts = upsertedRows?.[0]?.updated_at ? String(upsertedRows[0].updated_at) : nextIso;
          setLocalCacheData(STORAGE_KEYS.PARTS, finalMerged, ts);
          return { success: true, mergedParts: finalMerged };
        }
        logSupabaseError('mergePartsKvWithCloud upsert', upsErr);
      }
    } catch (err) {
      logSupabaseError('mergePartsKvWithCloud attempt catch', err);
      await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
    }
  }

  // CRITICAL: NEVER blindly overwrite Cloud with stale local-only list!
  // Only write if we successfully fetched Cloud data and merged against it.
  if (lastCloudParts && lastCloudParts.length > 0) {
    const safeMerged = mergeWithBase(lastCloudParts);
    const ok = await supabaseKeyStore.set(STORAGE_KEYS.PARTS, safeMerged);
    return { success: ok, mergedParts: safeMerged };
  }

  return { success: false, mergedParts: mergeWithBase(fallbackLocalParts) };
}

/**
 * Batch Processing Engine for Kho NG:
 * Executes Atomic Batch updates for Parts and Transactions in a single command,
 * with ZERO Realtime overhead, ensuring high performance and data integrity.
 */
export async function batchExecuteNgTransaction({
  partsToUpdate,
  transactionsToInsert,
}: {
  partsToUpdate: Part[];
  transactionsToInsert: Transaction[];
}): Promise<{ success: boolean; message?: string; mergedParts?: Part[]; insertedTransactions?: Transaction[] }> {
  const { client, isConfigured } = getActiveSupabaseClient();

  // 1. Update local cache immediately
  const rawParts = localStorage.getItem(STORAGE_KEYS.PARTS) || localStorage.getItem('thekho_parts_v1');
  let currentParts: Part[] = [];
  try {
    const decompressed = decompressStorageValue(rawParts);
    currentParts = decompressed ? JSON.parse(decompressed) : [];
  } catch {
    currentParts = [];
  }

  const partsMap = new Map(partsToUpdate.map((p) => [p.id, p]));
  let mergedParts = currentParts.map((p) => partsMap.get(p.id) || p);
  for (const p of partsToUpdate) {
    if (!currentParts.some((cp) => cp.id === p.id)) {
      mergedParts.unshift(p);
    }
  }

  // Enforce zero localStorage for transactions (Stored on Cloud only)
  localStorage.removeItem('thekho_transactions_v1');
  localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
  const nowIso = new Date().toISOString();
  setLocalCacheData(STORAGE_KEYS.PARTS, mergedParts, nowIso);

  // 2. Batch Processing to Supabase Cloud
  let finalMergedParts = mergedParts;
  if (isConfigured && client) {
    // 2.1 Insert NG transactions atomically
    if (transactionsToInsert && transactionsToInsert.length > 0) {
      invalidateTransactionMemoryCache();
      const txRows = transactionsToInsert.map(mapTransactionToSupabaseRow);
      const { error: txErr } = await client.from('transactions').upsert(txRows, { onConflict: 'id' });
      if (txErr) {
        logSupabaseError('batchExecuteNgTransaction insert transactions', txErr);
        throw new Error(`Không thể lưu lịch sử giao dịch Kho NG lên Supabase: ${txErr.message || 'Lỗi mạng'}`);
      }
    }

    // 2.2 Upsert relational `parts` rows (authoritative `qty_ng` storage)
    if (partsToUpdate && partsToUpdate.length > 0) {
      const partRows = partsToUpdate.map(mapPartToSupabaseRow);
      const { error: partErr } = await client.from('parts').upsert(partRows, { onConflict: 'id' });
      if (partErr) {
        logSupabaseError('batchExecuteNgTransaction upsert parts', partErr);
        // If qty_ng column missing on remote table, fallback without qty_ng for relational parts table
        if (String(partErr.message || '').includes('qty_ng')) {
          const rowsFallback = partRows.map((r: any) => {
            const copy = { ...r };
            delete copy.qty_ng;
            return copy;
          });
          const { error: fallbackErr } = await client.from('parts').upsert(rowsFallback, { onConflict: 'id' });
          if (fallbackErr) {
            throw new Error(`Không thể cập nhật tồn Kho NG trên bảng parts: ${fallbackErr.message || 'Lỗi Supabase'}`);
          }
        } else {
          throw new Error(`Không thể cập nhật tồn Kho NG trên bảng parts: ${partErr.message || 'Lỗi Supabase'}`);
        }
      }
    }

    // 2.3 Atomically merge onto `thekho_app_data` (`thekho_parts_v1`) via CAS so concurrent devices never resurrect old qtyNg
    const kvRes = await mergePartsKvWithCloud({
      fallbackLocalParts: mergedParts,
      partsToUpsert: partsToUpdate,
      preserveCloudQtyNg: false,
    });
    if (!kvRes.success) {
      throw new Error('Không thể đồng bộ danh sách linh kiện Kho NG lên Supabase Cloud (thekho_parts_v1). Vui lòng thử lại!');
    }
    finalMergedParts = kvRes.mergedParts;
  }

  return {
    success: true,
    mergedParts: finalMergedParts,
    insertedTransactions: transactionsToInsert,
  };
}
