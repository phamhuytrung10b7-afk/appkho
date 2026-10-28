import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, Plus, X, Sparkles } from 'lucide-react';
import { smartFuzzySearch } from './fuzzySearch';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
}

interface SearchableSelectProps {
  label?: string;
  options: (string | SelectOption)[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
  required?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder = '— Chọn hoặc gõ tìm kiếm linh kiện —',
  allowCustom = true,
  required = false,
  icon,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search term (220ms) - clears immediately if empty to remain ultra responsive
  useEffect(() => {
    if (!searchTerm.trim()) {
      setDebouncedSearch('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 220);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Normalize options to SelectOption[] using memoization
  const normalizedOptions: SelectOption[] = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt };
      }
      return opt;
    });
  }, [options]);

  // Find currently selected label
  const selectedOpt = normalizedOptions.find((o) => o.value === value);
  const displayLabel = selectedOpt ? selectedOpt.label : value || placeholder;

  // Filtered options based on smart fuzzy search with In-Memory RAM Cache
  const filteredOptions = useMemo(() => {
    return smartFuzzySearch(
      normalizedOptions,
      (opt) => [opt.label, opt.value, opt.sublabel || '', opt.badge || ''],
      debouncedSearch
    );
  }, [normalizedOptions, debouncedSearch]);

  const isExactMatch = normalizedOptions.some(
    (o) =>
      o.value.toLowerCase() === searchTerm.trim().toLowerCase() ||
      o.label.toLowerCase() === searchTerm.trim().toLowerCase()
  );

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm('');
      setDebouncedSearch('');
    }
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Main Trigger Button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2.5 sm:px-3.5 sm:py-3 bg-slate-50 hover:bg-slate-100/90 border rounded-xl cursor-pointer transition-all shadow-2xs select-none gap-2 ${
          isOpen ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-white' : 'border-slate-300'
        }`}
      >
        <div className="flex items-start sm:items-center space-x-2 min-w-0 pr-1 flex-1">
          {icon && <span className="text-slate-400 shrink-0 mt-0.5 sm:mt-0">{icon}</span>}
          <div className="min-w-0 flex-1 text-left">
            <span
              className={`text-xs sm:text-sm font-semibold break-words leading-snug line-clamp-2 block ${
                value ? 'text-slate-900' : 'text-slate-400 font-normal'
              }`}
            >
              {displayLabel}
            </span>
            {selectedOpt && (selectedOpt.badge || selectedOpt.sublabel) && (
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                {selectedOpt.badge && (
                  <span className="px-1.5 py-0.2 bg-emerald-100/80 text-emerald-800 rounded font-mono font-bold">
                    {selectedOpt.badge}
                  </span>
                )}
                {selectedOpt.sublabel && (
                  <span className="truncate max-w-[240px] text-slate-500">{selectedOpt.sublabel}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-1.5 shrink-0 self-center">
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-emerald-600' : ''
            }`}
          />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-w-full">
          {/* Search Header */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50 flex items-center space-x-2">
            <Search className="w-4 h-4 text-emerald-600 shrink-0 ml-1" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Gõ mã, tên linh kiện, vị trí kệ (không dấu)..."
              className="w-full bg-transparent border-none text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden py-1 font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors shrink-0"
                title="Xóa tìm kiếm"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick status bar showing result count */}
          <div className="px-3 py-1 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between text-[11px] text-emerald-800 font-medium">
            <span className="flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>
                {debouncedSearch ? `Tìm thấy ${filteredOptions.length} kết quả phù hợp` : `Tổng cộng ${normalizedOptions.length} linh kiện`}
              </span>
            </span>
            {debouncedSearch && (
              <span className="text-[10px] text-slate-400 shrink-0">Khớp nhất trên đầu</span>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-64 sm:max-h-72 overflow-y-auto p-1.5 divide-y divide-slate-100 overscroll-contain">
            {/* Custom Input Option if allowed and user typed something not matching */}
            {allowCustom && searchTerm.trim() && !isExactMatch && (
              <div
                onClick={() => handleSelect(searchTerm.trim())}
                className="p-2.5 hover:bg-emerald-50 text-emerald-700 rounded-xl cursor-pointer text-xs font-semibold flex items-center space-x-2 transition-colors mb-1 border border-dashed border-emerald-200"
              >
                <Plus className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="break-words">
                  Dùng giá trị tự nhập: <strong className="font-bold">"{searchTerm.trim()}"</strong>
                </span>
              </div>
            )}

            {filteredOptions.length === 0 && (!allowCustom || !searchTerm.trim()) ? (
              <div className="p-6 text-center text-xs text-slate-400 italic space-y-1">
                <p>Không tìm thấy linh kiện nào khớp với từ khóa "{debouncedSearch}"</p>
                <p className="text-[10px] text-slate-400">Thử gõ mã viết tắt, tên không dấu hoặc vị trí kệ</p>
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    onClick={() => handleSelect(opt.value)}
                    className={`p-2.5 sm:p-3 rounded-xl cursor-pointer text-xs flex items-start justify-between transition-colors gap-2 ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-950 font-bold border border-emerald-200'
                        : 'hover:bg-slate-50 text-slate-700 active:bg-emerald-50/50'
                    }`}
                  >
                    <div className="min-w-0 pr-1 flex-1 space-y-1">
                      <div className="text-xs sm:text-sm font-semibold break-words leading-snug text-slate-900">
                        {opt.label}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {opt.badge && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-emerald-100/90 text-emerald-800 rounded-md font-mono shrink-0 font-bold">
                            {opt.badge}
                          </span>
                        )}
                        {opt.sublabel && (
                          <span className="text-[11px] text-slate-500 font-normal break-words leading-tight">
                            {opt.sublabel}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
