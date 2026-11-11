import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getActiveSupabaseClient } from './supabase';

/**
 * IN-MEMORY RAM TTL CACHE (5 PHÚT = 300,000 MS)
 * Cắt giảm 100% Egress Supabase khi chuyển đổi qua lại giữa các Tab hoặc các bộ lọc đã truy vấn trong vòng 5 phút.
 */
export const DEFAULT_EGRESS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttlMs: number;
}

class MemoryTTLCacheStore {
  private cache = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number = DEFAULT_EGRESS_CACHE_TTL_MS): void {
    this.cache.set(key, {
      data,
      cachedAt: Date.now(),
      ttlMs,
    });
  }

  invalidate(keyPrefix?: string): void {
    if (!keyPrefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.cache.delete(key);
      }
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }
}

export const globalMemoryCache = new MemoryTTLCacheStore();

/**
 * Helper sinh chuỗi ngày định dạng YYYY-MM-DD theo giờ địa phương Việt Nam
 */
export function getLocalTodayStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLocalDaysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type HistoryDatePreset = 'today' | '3days' | '7days' | '35days' | 'all' | 'custom';

export interface UseHistoricalFilterOptions<T> {
  cacheKeyPrefix: string;
  sourceItems?: T[];
  getItemDate?: (item: T) => string | undefined;
  getItemSearchText?: (item: T) => string;
  defaultPreset?: HistoryDatePreset;
  pageSize?: number;
  ttlMs?: number;
}

/**
 * Hook quản lý bộ lọc lịch sử tối ưu Egress:
 * 1. Mặc định chỉ lọc theo Ngày Hiện Tại (Today)
 * 2. Phân trang giới hạn số dòng (Pagination 25 / 50 / 100)
 * 3. RAM TTL Cache 5 phút khi đổi tab
 */
export function useHistoricalFilter<T>({
  cacheKeyPrefix,
  sourceItems = [],
  getItemDate,
  getItemSearchText,
  defaultPreset = 'today',
  pageSize: initialPageSize = 50,
  ttlMs = DEFAULT_EGRESS_CACHE_TTL_MS,
}: UseHistoricalFilterOptions<T>) {
  const [preset, setPreset] = useState<HistoryDatePreset>(defaultPreset);
  const [startDate, setStartDate] = useState<string>(() => {
    return defaultPreset === 'today' ? getLocalTodayStr() : defaultPreset === '35days' ? getLocalDaysAgoStr(34) : getLocalTodayStr();
  });
  const [endDate, setEndDate] = useState<string>(getLocalTodayStr);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);

  // Áp dụng bộ lọc nhanh
  const applyPreset = useCallback((p: HistoryDatePreset) => {
    setPreset(p);
    const today = getLocalTodayStr();
    if (p === 'all') {
      setStartDate('');
      setEndDate('');
      setCurrentPage(1);
      return;
    }
    setEndDate(today);
    if (p === 'today') {
      setStartDate(today);
    } else if (p === '3days') {
      setStartDate(getLocalDaysAgoStr(2));
    } else if (p === '7days') {
      setStartDate(getLocalDaysAgoStr(6));
    } else if (p === '35days') {
      setStartDate(getLocalDaysAgoStr(34));
    }
    setCurrentPage(1);
  }, []);

  // Reset trang về 1 khi người dùng gõ tìm kiếm hoặc đổi ngày
  const handleStartDateChange = useCallback((dateStr: string) => {
    setStartDate(dateStr);
    setPreset('custom');
    setCurrentPage(1);
  }, []);

  const handleEndDateChange = useCallback((dateStr: string) => {
    setEndDate(dateStr);
    setPreset('custom');
    setCurrentPage(1);
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  }, []);

  // Lọc dữ liệu kết hợp In-Memory RAM TTL Cache 5 phút
  const filteredItems = useMemo(() => {
    const cacheKey = `${cacheKeyPrefix}_filter_${startDate || 'none'}_${endDate || 'none'}_${searchQuery.trim().toLowerCase()}_${sourceItems.length}`;
    const cached = globalMemoryCache.get<T[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const filtered = sourceItems.filter((item) => {
      // 1. Lọc theo ngày
      if (getItemDate) {
        const timeStr = getItemDate(item);
        if (timeStr) {
          const itemDate = new Date(timeStr);
          if (!isNaN(itemDate.getTime())) {
            if (startDate) {
              const [sY, sM, sD] = startDate.split('-').map(Number);
              const start = new Date(sY, sM - 1, sD, 0, 0, 0, 0);
              if (itemDate.getTime() < start.getTime()) return false;
            }
            if (endDate) {
              const [eY, eM, eD] = endDate.split('-').map(Number);
              const end = new Date(eY, eM - 1, eD, 23, 59, 59, 999);
              if (itemDate.getTime() > end.getTime()) return false;
            }
          }
        }
      }

      // 2. Lọc theo chuỗi tìm kiếm
      if (searchQuery.trim() && getItemSearchText) {
        const q = searchQuery.toLowerCase().trim();
        const text = getItemSearchText(item).toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });

    globalMemoryCache.set(cacheKey, filtered, ttlMs);
    return filtered;
  }, [cacheKeyPrefix, sourceItems, getItemDate, getItemSearchText, startDate, endDate, searchQuery, ttlMs]);

  // Phân trang
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, safeCurrentPage, pageSize]);

  const goToPage = useCallback((p: number) => {
    setCurrentPage((prev) => {
      const target = Math.max(1, Math.min(p, totalPages));
      return target;
    });
  }, [totalPages]);

  const changePageSize = useCallback((newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  }, []);

  return {
    preset,
    startDate,
    endDate,
    searchQuery,
    currentPage: safeCurrentPage,
    pageSize,
    totalPages,
    totalItems: filteredItems.length,
    rawCount: sourceItems.length,
    filteredItems,
    paginatedItems,
    applyPreset,
    handleStartDateChange,
    handleEndDateChange,
    handleSearchChange,
    goToPage,
    changePageSize,
    invalidateCache: () => globalMemoryCache.invalidate(cacheKeyPrefix),
  };
}
