import { getActiveSupabaseClient } from './supabase';
import { Part, Transaction, StockCheckRecord, AppSettings, ContainerBatch, ModelBOM, KittingQueueItem, BufferLocationMap, MaterialCallRequest, BomExportVoucher, ConversionFactor, KittingScanLog, ProductivityPersonnelConfig } from './types';
import { MasterKittingTag } from './masterExcelParser';
import { CustomGeneratedContainerTag } from './storage';

// Keys for App Data store
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
  CUSTOM_GENERATED_CONTAINER_TAGS: 'thekho_custom_generated_container_tags_v1',
  USERS: 'thekho_users_v1',
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

// Generic Supabase CRUD for Key-Value Table (`thekho_app_data`)
export const supabaseKeyStore = {
  // SELECT
  async get<T>(key: string): Promise<T | null> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured) return null;

      const { data, error } = await client
        .from('thekho_app_data')
        .select('data')
        .eq('key', key)
        .maybeSingle();

      if (error) {
        console.error('Lỗi chi tiết Supabase:', error);
        return null;
      }

      return data ? (data.data as T) : null;
    } catch (err) {
      console.error('Lỗi chi tiết Supabase:', err);
      return null;
    }
  },

  // UPSERT (INSERT or UPDATE)
  async set<T>(key: string, value: T): Promise<boolean> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured) return false;

      const { error } = await client
        .from('thekho_app_data')
        .upsert(
          { key, data: value, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );

      if (error) {
        console.error('Lỗi chi tiết Supabase:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Lỗi chi tiết Supabase:', err);
      return false;
    }
  },

  // DELETE
  async delete(key: string): Promise<boolean> {
    try {
      const { client, isConfigured } = getActiveSupabaseClient();
      if (!isConfigured) return false;

      const { error } = await client
        .from('thekho_app_data')
        .delete()
        .eq('key', key);

      if (error) {
        console.error('Lỗi chi tiết Supabase:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Lỗi chi tiết Supabase:', err);
      return false;
    }
  },
};

// Direct Relational Table CRUD for Supabase
export const supabaseRelationalStore = {
  // --- PARTS CRUD ---
  async selectParts(): Promise<Part[] | null> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return null;
    const { data, error } = await client.from('parts').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Lỗi chi tiết Supabase:', error);
      return null;
    }
    return (data || []).map(mapSupabaseRowToPart);
  },

  async insertPart(part: Part): Promise<boolean> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return false;
    const row = mapPartToSupabaseRow(part);
    const { error } = await client.from('parts').upsert(row, { onConflict: 'id' });
    if (error) {
      console.error('Lỗi chi tiết Supabase:', error);
      return false;
    }
    return true;
  },

  async upsertParts(parts: Part[]): Promise<boolean> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return false;
    if (!parts || parts.length === 0) return true;
    const rows = parts.map(mapPartToSupabaseRow);
    const { error } = await client.from('parts').upsert(rows, { onConflict: 'id' });
    if (error) {
      console.error('Lỗi chi tiết Supabase:', error);
      return false;
    }
    return true;
  },

  async updatePart(id: string, updates: Partial<Part>): Promise<boolean> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return false;
    const rowUpdates: any = {};
    if (updates.code !== undefined) rowUpdates.code = String(updates.code);
    if (updates.name !== undefined) rowUpdates.name = String(updates.name);
    if ((updates as any).groupName !== undefined || (updates as any).group_name !== undefined) {
      rowUpdates.group_name = String((updates as any).groupName || (updates as any).group_name);
    }
    if (updates.unit !== undefined) rowUpdates.unit = String(updates.unit);
    if (updates.currentStock !== undefined) rowUpdates.current_stock = typeof updates.currentStock === 'number' ? updates.currentStock : Number(updates.currentStock) || 0;
    if (updates.minStock !== undefined) rowUpdates.min_stock = typeof updates.minStock === 'number' ? updates.minStock : Number(updates.minStock) || 0;
    if (updates.location !== undefined) rowUpdates.location = String(updates.location);
    if (updates.locations !== undefined) rowUpdates.locations = Array.isArray(updates.locations) ? updates.locations : [];
    if (updates.note !== undefined || updates.description !== undefined) {
      rowUpdates.notes = String(updates.note || updates.description || '');
    }
    rowUpdates.updated_at = new Date().toISOString();

    const { error } = await client.from('parts').update(rowUpdates).eq('id', id);
    if (error) {
      console.error('Lỗi chi tiết Supabase:', error);
      return false;
    }
    return true;
  },

  async deletePart(id: string): Promise<boolean> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return false;
    const { error } = await client.from('parts').delete().eq('id', id);
    if (error) {
      console.error('Lỗi chi tiết Supabase:', error);
      return false;
    }
    return true;
  },

  // --- TRANSACTIONS CRUD ---
  async selectTransactions(): Promise<Transaction[] | null> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return null;
    const { data, error } = await client.from('transactions').select('*').order('date', { ascending: false });
    if (error) {
      console.error('Lỗi chi tiết Supabase:', error);
      return null;
    }
    return (data || []).map(mapSupabaseRowToTransaction);
  },

  async insertTransaction(tx: Transaction): Promise<boolean> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return false;
    const row = mapTransactionToSupabaseRow(tx);
    const { error } = await client.from('transactions').upsert(row, { onConflict: 'id' });
    if (error) {
      console.error('Lỗi chi tiết Supabase:', error);
      return false;
    }
    return true;
  },

  async upsertTransactions(txs: Transaction[]): Promise<boolean> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return false;
    if (!txs || txs.length === 0) return true;
    const rows = txs.map(mapTransactionToSupabaseRow);
    const { error } = await client.from('transactions').upsert(rows, { onConflict: 'id' });
    if (error) {
      console.error('Lỗi chi tiết Supabase:', error);
      return false;
    }
    return true;
  },

  // --- SETTINGS CRUD ---
  async selectSettings(): Promise<AppSettings | null> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return null;
    const { data, error } = await client.from('settings').select('data').eq('id', 'app_settings').maybeSingle();
    if (error || !data) {
      if (error) console.error('Lỗi chi tiết Supabase:', error);
      return null;
    }
    return data.data as AppSettings;
  },

  async upsertSettings(settings: AppSettings): Promise<boolean> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return false;
    const { error } = await client.from('settings').upsert({ id: 'app_settings', data: settings, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) {
      console.error('Lỗi chi tiết Supabase:', error);
      return false;
    }
    return true;
  },
};

