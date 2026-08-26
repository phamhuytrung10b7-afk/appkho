import React, { useState, useRef, useEffect } from 'react';
import { WarehouseLocation } from './types';
import { MapPin, Search, ChevronDown, Check, Plus, X, QrCode } from 'lucide-react';

interface PartLocationOption {
  locationName: string;
  quantity?: number;
  unit?: string;
}

interface SearchableLocationSelectProps {
  locations: WarehouseLocation[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
  customValue?: string;
  onCustomChange?: (val: string) => void;
  partLocations?: PartLocationOption[]; // For stock-out or context-specific options
  onScanClick?: () => void;
  required?: boolean;
  id?: string;
  theme?: 'emerald' | 'blue' | 'indigo';
  disabled?: boolean;
}

export const SearchableLocationSelect: React.FC<SearchableLocationSelectProps> = ({
  locations = [],
  value,
  onChange,
  placeholder = '-- Chọn hoặc tìm kiếm khoang / kệ lưu trữ --',
  allowCustom = true,
  customValue = '',
  onCustomChange,
  partLocations,
  onScanClick,
  id,
  theme = 'emerald',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setHighlightedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // If custom is selected, focus custom input
  useEffect(() => {
    if (value === '__custom__') {
      setTimeout(() => {
        customInputRef.current?.focus();
      }, 50);
    }
  }, [value]);

  // Combine locations: if partLocations is passed, prioritize them or show all
  const filteredList = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    if (partLocations && partLocations.length > 0) {
      // Filter by partLocations
      return partLocations.filter((item) => {
        if (!q) return true;
        return item.locationName.toLowerCase().includes(q);
      });
    }

    return locations.filter((loc) => {
      if (!q) return true;
      const matchName = loc.name.toLowerCase().includes(q);
      const matchDesc = loc.description ? loc.description.toLowerCase().includes(q) : false;
      return matchName || matchDesc;
    });
  }, [locations, partLocations, searchQuery]);

  const handleSelect = (selectedName: string) => {
    onChange(selectedName);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    const totalItems = filteredList.length + (allowCustom ? 1 : 0);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % (totalItems || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + totalItems) % (totalItems || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex < filteredList.length) {
        const item = filteredList[highlightedIndex];
        const name = 'locationName' in item ? item.locationName : item.name;
        handleSelect(name);
      } else if (allowCustom && highlightedIndex === filteredList.length) {
        handleSelect('__custom__');
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  // Find label for current value
  const selectedLabel = React.useMemo(() => {
    if (!value) return null;
    if (value === '__custom__') {
      return customValue ? `Tự nhập: ${customValue}` : '➕ Vị trí mới (Tự nhập)...';
    }
    const foundLoc = locations.find((l) => l.name.toLowerCase() === value.toLowerCase());
    if (foundLoc) {
      return foundLoc.description ? `${foundLoc.name} (${foundLoc.description})` : foundLoc.name;
    }
    return value;
  }, [value, customValue, locations]);

  const themeClasses = {
    emerald: {
      border: 'border-emerald-400 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-400/40',
      activeItem: 'bg-emerald-50 text-emerald-950 font-bold',
      badge: 'bg-emerald-100 text-emerald-800',
      accent: 'text-emerald-600',
    },
    blue: {
      border: 'border-blue-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-400/40',
      activeItem: 'bg-blue-50 text-blue-950 font-bold',
      badge: 'bg-blue-100 text-blue-800',
      accent: 'text-blue-600',
    },
    indigo: {
      border: 'border-indigo-400 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-400/40',
      activeItem: 'bg-indigo-50 text-indigo-950 font-bold',
      badge: 'bg-indigo-100 text-indigo-800',
      accent: 'text-indigo-600',
    },
  }[theme];

  return (
    <div ref={containerRef} className="relative w-full" id={id}>
      {/* Main Select Button Trigger */}
      <div
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        className={`w-full px-3.5 py-2.5 bg-white border-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer select-none shadow-xs ${
          themeClasses.border
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-100' : 'hover:border-slate-400'}`}
      >
        <div className="flex items-center space-x-2 min-w-0 pr-2">
          <MapPin className={`w-4 h-4 shrink-0 ${value ? themeClasses.accent : 'text-slate-400'}`} />
          {selectedLabel ? (
            <span className="text-slate-900 font-extrabold truncate">
              {selectedLabel}
            </span>
          ) : (
            <span className="text-slate-400 font-medium truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                if (onCustomChange) onCustomChange('');
              }}
              className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-md transition-colors"
              title="Xóa lựa chọn"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {onScanClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onScanClick();
              }}
              className="p-1 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors flex items-center space-x-1 font-bold text-[10px]"
              title="Quét mã QR vị trí bằng camera"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Quét QR</span>
            </button>
          )}

          <ChevronDown
            className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-blue-600' : ''
            }`}
          />
        </div>
      </div>

      {/* Custom Input Field if '__custom__' is selected */}
      {value === '__custom__' && allowCustom && (
        <div className="mt-2 relative flex items-center">
          <input
            ref={customInputRef}
            type="text"
            value={customValue}
            onChange={(e) => onCustomChange && onCustomChange(e.target.value)}
            placeholder="Gõ tên vị trí / kệ mới (VD: Khoang B - Tầng 2)..."
            className="w-full pl-3.5 pr-8 py-2 bg-amber-50/70 border-2 border-amber-400 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-hidden"
          />
          {customValue && (
            <button
              type="button"
              onClick={() => onCustomChange && onCustomChange('')}
              className="absolute right-2.5 p-0.5 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          style={{ maxHeight: '340px' }}
        >
          {/* Quick Search Bar */}
          <div className="p-2.5 bg-slate-50 border-b border-slate-100 sticky top-0 z-10 flex items-center space-x-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Gõ tên kệ, khoang, tầng để tìm nhanh..."
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Locations Options List */}
          <div className="overflow-y-auto max-h-56 divide-y divide-slate-50">
            {filteredList.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                Không tìm thấy vị trí nào khớp với "{searchQuery}".
              </div>
            ) : (
              filteredList.map((item, index) => {
                const isPartLoc = 'quantity' in item;
                const locName = isPartLoc ? item.locationName : item.name;
                const locDesc = !isPartLoc ? (item as WarehouseLocation).description : undefined;
                const qty = isPartLoc ? (item as PartLocationOption).quantity : undefined;
                const unit = isPartLoc ? (item as PartLocationOption).unit : undefined;

                const isSelected = value?.toLowerCase() === locName.toLowerCase();
                const isHighlighted = highlightedIndex === index;

                return (
                  <div
                    key={locName + '-' + index}
                    onClick={() => handleSelect(locName)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`px-3.5 py-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? themeClasses.activeItem
                        : isHighlighted
                        ? 'bg-slate-100 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-slate-900 flex items-center space-x-1.5">
                          <span className="font-mono">{locName}</span>
                          {locDesc && (
                            <span className="text-[11px] font-normal text-slate-500 truncate">
                              — {locDesc}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {qty !== undefined && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            qty > 0 ? themeClasses.badge : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          Tồn: {qty.toLocaleString('vi-VN')} {unit || ''}
                        </span>
                      )}
                      {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                    </div>
                  </div>
                );
              })
            )}

            {/* Option to enter custom location */}
            {allowCustom && (
              <div
                onClick={() => handleSelect('__custom__')}
                onMouseEnter={() => setHighlightedIndex(filteredList.length)}
                className={`px-3.5 py-2.5 flex items-center space-x-2 text-xs font-bold cursor-pointer transition-colors border-t border-slate-200 ${
                  value === '__custom__'
                    ? 'bg-amber-50 text-amber-900'
                    : highlightedIndex === filteredList.length
                    ? 'bg-amber-50/50 text-amber-800'
                    : 'text-amber-700 hover:bg-amber-50/40'
                }`}
              >
                <Plus className="w-4 h-4 text-amber-600 shrink-0" />
                <span>➕ Tự nhập vị trí mới nếu chưa có trong danh sách...</span>
              </div>
            )}
          </div>

          {/* Quick Footer */}
          <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
            <span>Tổng cộng: {locations.length} vị trí</span>
            <span>💡 Dùng phím ↑ ↓ Enter để chọn nhanh</span>
          </div>
        </div>
      )}
    </div>
  );
};
