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
};

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
        console.warn(`Supabase SELECT error for key [${key}]:`, error.message);
        return null;
      }

      return data ? (data.data as T) : null;
    } catch (err) {
      console.warn(`Supabase fetch exception for key [${key}]:`, err);
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
        console.warn(`Supabase UPSERT error for key [${key}]:`, error.message);
        return false;
      }

      return true;
    } catch (err) {
      console.warn(`Supabase set exception for key [${key}]:`, err);
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
        console.warn(`Supabase DELETE error for key [${key}]:`, error.message);
        return false;
      }

      return true;
    } catch (err) {
      console.warn(`Supabase delete exception for key [${key}]:`, err);
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
    if (error) return null;
    return data as Part[];
  },

  async insertPart(part: Part): Promise<boolean> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return false;
    const { error } = await client.from('parts').insert(part);
    return !error;
  },

  async updatePart(id: string, updates: Partial<Part>): Promise<boolean> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return false;
    const { error } = await client.from('parts').update(updates).eq('id', id);
    return !error;
  },

  async deletePart(id: string): Promise<boolean> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return false;
    const { error } = await client.from('parts').delete().eq('id', id);
    return !error;
  },

  // --- TRANSACTIONS CRUD ---
  async selectTransactions(): Promise<Transaction[] | null> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return null;
    const { data, error } = await client.from('transactions').select('*').order('date', { ascending: false });
    if (error) return null;
    return data as Transaction[];
  },

  async insertTransaction(tx: Transaction): Promise<boolean> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return false;
    const { error } = await client.from('transactions').insert(tx);
    return !error;
  },

  // --- SETTINGS CRUD ---
  async selectSettings(): Promise<AppSettings | null> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return null;
    const { data, error } = await client.from('settings').select('data').eq('id', 'app_settings').maybeSingle();
    if (error || !data) return null;
    return data.data as AppSettings;
  },

  async upsertSettings(settings: AppSettings): Promise<boolean> {
    const { client, isConfigured } = getActiveSupabaseClient();
    if (!isConfigured) return false;
    const { error } = await client.from('settings').upsert({ id: 'app_settings', data: settings, updated_at: new Date().toISOString() });
    return !error;
  },
};
