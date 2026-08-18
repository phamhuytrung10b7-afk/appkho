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
};

// Local storage cache timestamp prefix
const CACHE_TS_PREFIX = '_thekho_cache_ts_';

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
    reason_or_purpose: String(tx.reasonOrPurpose || (tx as any).reason_or_purpose || ''),
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

function logSupabaseError(context: string, error: any) {
  const errMsg =
    typeof error === 'object' && error !== null
      ? error.message || error.details || JSON.stringify(error)
      : String(error);
  console.warn(`[Supabase Connection Warning] ${context}:`, errMsg);
}

// Helper for localStorage cached data
function getLocalCacheData<T>(key: string): { data: T | null; timestamp: string | null } {
  try {
    const ts = localStorage.getItem(`${CACHE_TS_PREFIX}${key}`);
    const rawData = localStorage.getItem(key);
    if (rawData) {
      return { data: JSON.parse(rawData) as T, timestamp: ts };
    }
    return { data: null, timestamp: ts };
  } catch {
    return { data: null, timestamp: null };
  }
}

function setLocalCacheData<T>(key: string, data: T, timestamp: string): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(`${CACHE_TS_PREFIX}${key}`, timestamp);
  } catch (err) {
    console.warn(`[Cache Warning] Failed to write localStorage for key ${key}:`, err);
  }
}

function removeLocalCacheData(key: string): void {
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(`${CACHE_TS_PREFIX}${key}`);
  } catch (_) {}
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
          if (serverUpdatedAt === localCache.timestamp) {
            // CACHE HIT! The payload on cloud has NOT changed.
            egressStats.cacheHits++;
            const estimatedSaved = JSON.stringify(localCache.data).length;
            egressStats.estimatedBytesSaved += estimatedSaved;
            // console.log(`⚡ [Egress Saver] Cache Hit for "${key}"! Saved ~${(estimatedSaved / 1024).toFixed(1)} KB.`);
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
   * Batch Smart Sync: Checks timestamps for multiple keys in a single lightweight query (~200 Bytes),
   * and only downloads the specific keys that have actually changed on Cloud!
   */
  async batchSyncAllKeys(keys: string[]): Promise<{ updatedCount: number; cachedCount: number }> {
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

      for (const row of metaList) {
        const key = row.key;
        const serverTs = String(row.updated_at || '');
        const local = getLocalCacheData(key);

        if (local.data !== null && local.timestamp === serverTs) {
          cachedCount++;
          egressStats.cacheHits++;
          egressStats.estimatedBytesSaved += JSON.stringify(local.data).length;
        } else {
          changedKeys.push(key);
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
    const nowIso = new Date().toISOString();

    // 1. Update localStorage immediately with latest timestamp
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

/**
 * Direct Relational Table CRUD for Supabase with Pagination, Limits & Column Select Optimization.
 */
export const supabaseRelationalStore = {
  // --- PARTS CRUD ---
  /**
   * Selects parts with specific columns and pagination to save Egress.
   */
  async selectParts(options?: { limit?: number; offset?: number; search?: string }): Promise<Part[] | null> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return null;

      const limit = options?.limit ?? 500;
      let query = client
        .from('parts')
        .select('id, code, name, group_name, unit, current_stock, min_stock, max_stock, location, locations, unit_price, supplier, notes, created_at, updated_at')
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

  async upsertParts(parts: Part[]): Promise<boolean> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return false;
      if (!parts || parts.length === 0) return true;
      const rows = parts.map(mapPartToSupabaseRow);
      const { error } = await client.from('parts').upsert(rows, { onConflict: 'id' });
      if (error) {
        logSupabaseError('upsertParts', error);
        return false;
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
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return false;
      const { error } = await client.from('parts').delete().eq('id', id);
      if (error) {
        logSupabaseError('deletePart', error);
        return false;
      }
      return true;
    } catch (err) {
      logSupabaseError('deletePart catch', err);
      return false;
    }
  },

  // --- TRANSACTIONS CRUD ---
  /**
   * Selects transactions with strict pagination limit (default 100 recent rows) to eliminate massive egress.
   */
  async selectTransactions(options?: { limit?: number; offset?: number; partCode?: string }): Promise<Transaction[] | null> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return null;

      const limit = options?.limit ?? 100;
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
      if (error) {
        logSupabaseError('selectTransactions', error);
        return null;
      }
      return (data || []).map(mapSupabaseRowToTransaction);
    } catch (err) {
      logSupabaseError('selectTransactions catch', err);
      return null;
    }
  },

  async insertTransaction(tx: Transaction): Promise<boolean> {
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
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured || !client) return false;
      if (!txs || txs.length === 0) return true;
      const rows = txs.map(mapTransactionToSupabaseRow);
      const { error } = await client.from('transactions').upsert(rows, { onConflict: 'id' });
      if (error) {
        logSupabaseError('upsertTransactions', error);
        return false;
      }
      return true;
    } catch (err) {
      logSupabaseError('upsertTransactions catch', err);
      return false;
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
