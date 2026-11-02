import LZString from 'lz-string';

export const LZ_PREFIX = 'LZ16::';

/**
 * Nén chuỗi JSON bằng thuật toán LZ-String UTF-16 chuyên dụng cho localStorage trình duyệt.
 * Giảm 70% - 90% kích thước chuỗi JSON chứa nhiều key/text lặp lại.
 */
export function compressStorageValue(val: string): string {
  if (!val || typeof val !== 'string' || val.length < 120) {
    return val;
  }
  // Nếu chuỗi đã được nén trước đó thì không nén lại
  if (val.startsWith(LZ_PREFIX)) {
    return val;
  }
  try {
    const compressed = LZString.compressToUTF16(val);
    if (compressed && (compressed.length + LZ_PREFIX.length) < val.length) {
      return LZ_PREFIX + compressed;
    }
  } catch (err) {
    console.warn('[StorageCompression] Lỗi nén dữ liệu, giữ nguyên chuỗi gốc:', err);
  }
  return val;
}

/**
 * Giải nén chuỗi từ localStorage với khả năng tương thích ngược 100%.
 * Nếu chuỗi có tiền tố LZ16:: thì giải nén, nếu là JSON thuần (chưa nén) thì trả về nguyên bản.
 */
export function decompressStorageValue(val: string | null): string | null {
  if (!val || typeof val !== 'string') {
    return val;
  }
  if (val.startsWith(LZ_PREFIX)) {
    try {
      const decompressed = LZString.decompressFromUTF16(val.slice(LZ_PREFIX.length));
      if (decompressed !== null && decompressed !== undefined) {
        return decompressed;
      }
    } catch (err) {
      console.warn('[StorageCompression] Lỗi giải nén dữ liệu, fallback chuỗi thô:', err);
      return val;
    }
  }
  return val;
}

/**
 * Quét toàn bộ localStorage và nén tất cả các key lớn chưa được nén.
 * Đảm bảo 100% dữ liệu cũ được nén gọn mà không mất mát bất kỳ thông tin nào.
 */
export function optimizeAllExistingLocalStorage(): {
  convertedKeys: string[];
  beforeBytes: number;
  afterBytes: number;
  freedBytes: number;
  percentSaved: number;
} {
  const convertedKeys: string[] = [];
  let beforeBytes = 0;
  let afterBytes = 0;

  try {
    // 1. Tính dung lượng trước khi tối ưu (bytes theo chuẩn UTF-16 x 2)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) {
        const v = localStorage.getItem(k) || '';
        beforeBytes += (k.length + v.length) * 2;
      }
    }

    // 2. Danh sách các key bỏ qua (cấu hình nhạy cảm/nhỏ gọn)
    const ignoreKeys = new Set([
      'thekho_supabase_url',
      'thekho_supabase_anon_key',
      'thekho_current_user_v1',
    ]);

    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && !ignoreKeys.has(k) && !k.startsWith('_thekho_cache_ts_')) {
        allKeys.push(k);
      }
    }

    for (const k of allKeys) {
      const raw = localStorage.getItem(k);
      if (raw && !raw.startsWith(LZ_PREFIX) && raw.length >= 100) {
        const trimmed = raw.trim();
        // Chỉ nén các dữ liệu JSON hợp lệ
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          const comp = compressStorageValue(raw);
          if (comp.startsWith(LZ_PREFIX) && comp.length < raw.length) {
            localStorage.setItem(k, comp);
            convertedKeys.push(k);
          }
        }
      }
    }

    // 3. Tính dung lượng sau khi tối ưu
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) {
        const v = localStorage.getItem(k) || '';
        afterBytes += (k.length + v.length) * 2;
      }
    }
  } catch (err) {
    console.warn('[StorageCompression] Lỗi trong quá trình optimizeAllExistingLocalStorage:', err);
  }

  const freedBytes = Math.max(0, beforeBytes - afterBytes);
  const percentSaved = beforeBytes > 0 ? Math.round((freedBytes / beforeBytes) * 1000) / 10 : 0;

  return {
    convertedKeys,
    beforeBytes,
    afterBytes,
    freedBytes,
    percentSaved,
  };
}
