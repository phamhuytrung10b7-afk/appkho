import React, { useState, useRef, useEffect, useMemo } from 'react';
import { WarehouseLocation } from './types';
import { MapPin, Search, ChevronDown, Check, Plus, X, QrCode, Sparkles } from 'lucide-react';
import { LocationQrScannerModal } from './LocationQrScannerModal';

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
  placeholder = '-- Tìm kiếm nhanh tên kệ hoặc mô tả kệ --',
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
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isInternalScannerOpen, setIsInternalScannerOpen] = useState(false);

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

  // When dropdown opens, focus search input automatically
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setHighlightedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 60);
    }
  }, [isOpen]);

  // If custom is selected, focus custom input
  useEffect(() => {
    if (value === '__custom__') {
      setTimeout(() => {
        customInputRef.current?.focus();
      }, 60);
    }
  }, [value]);

  // Extract shelf prefixes for quick group tabs (e.g. A, B, C...)
  const shelfGroups = useMemo(() => {
    const groups = new Set<string>();
    locations.forEach((loc) => {
      const match = loc.name.match(/^([A-Za-z]+)/);
      if (match) {
        groups.add(match[1].toUpperCase());
      }
    });
    return Array.from(groups).sort();
  }, [locations]);

  // Quick chips for top common shelves (first 10-12 shelves or matching current group)
  const quickChips = useMemo(() => {
    if (selectedGroup === 'ALL') {
      return locations.slice(0, 10);
    }
    return locations.filter((loc) => loc.name.toUpperCase().startsWith(selectedGroup)).slice(0, 15);
  }, [locations, selectedGroup]);

  // Filter list by query + selected group
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    if (partLocations && partLocations.length > 0) {
      return partLocations.filter((item) => {
        if (!q) return true;
        return item.locationName.toLowerCase().includes(q);
      });
    }

    return locations.filter((loc) => {
      // Group filter
      if (selectedGroup !== 'ALL') {
        if (!loc.name.toUpperCase().startsWith(selectedGroup)) return false;
      }

      if (!q) return true;
      const matchName = loc.name.toLowerCase().includes(q);
      const matchDesc = loc.description ? loc.description.toLowerCase().includes(q) : false;
      // Also match normalized (e.g. "a1" matches "A01" or "Kệ A01")
      const strippedQ = q.replace(/[^a-z0-9]/gi, '');
      const strippedName = loc.name.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const matchStripped = strippedQ && strippedName.includes(strippedQ);

      return matchName || matchDesc || matchStripped;
    });
  }, [locations, partLocations, searchQuery, selectedGroup]);

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
      if (filteredList.length > 0 && highlightedIndex < filteredList.length) {
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
  const selectedLabel = useMemo(() => {
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
      border: 'border-emerald-400 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-400/40',
      activeItem: 'bg-emerald-50 text-emerald-950 font-bold',
      badge: 'bg-emerald-100 text-emerald-800',
      accent: 'text-emerald-600',
      chipSelected: 'bg-emerald-600 text-white font-black',
      chipHover: 'hover:bg-emerald-100 text-emerald-900 border-emerald-300',
      tabActive: 'bg-emerald-600 text-white',
    },
    blue: {
      border: 'border-blue-400 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-400/40',
      activeItem: 'bg-blue-50 text-blue-950 font-bold',
      badge: 'bg-blue-100 text-blue-800',
      accent: 'text-blue-600',
      chipSelected: 'bg-blue-600 text-white font-black',
      chipHover: 'hover:bg-blue-100 text-blue-900 border-blue-300',
      tabActive: 'bg-blue-600 text-white',
    },
    indigo: {
      border: 'border-indigo-400 focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-400/40',
      activeItem: 'bg-indigo-50 text-indigo-950 font-bold',
      badge: 'bg-indigo-100 text-indigo-800',
      accent: 'text-indigo-600',
      chipSelected: 'bg-indigo-600 text-white font-black',
      chipHover: 'hover:bg-indigo-100 text-indigo-900 border-indigo-300',
      tabActive: 'bg-indigo-600 text-white',
    },
  }[theme];

  const handleTriggerScan = () => {
    if (onScanClick) {
      onScanClick();
    } else {
      setIsInternalScannerOpen(true);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full" id={id}>
      {/* Main Select Box Display */}
      <div
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        className={`w-full px-3.5 py-2.5 bg-white border-2 rounded-2xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer select-none shadow-xs ${
          themeClasses.border
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-100' : 'hover:border-slate-400'}`}
      >
        <div className="flex items-center space-x-2.5 min-w-0 pr-2">
          <div
            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
              value ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
            }`}
          >
            <MapPin className="w-4 h-4" />
          </div>
          {selectedLabel ? (
            <div className="min-w-0">
              <span className="text-[10px] text-slate-400 font-bold uppercase block leading-none">
                Vị trí đã chọn:
              </span>
              <span className="text-slate-900 font-black font-mono text-sm truncate block mt-0.5">
                {selectedLabel}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 font-medium truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          {value ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(true);
                }}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
              >
                Đổi vị trí
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('');
                  if (onCustomChange) onCustomChange('');
                }}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Xóa lựa chọn"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleTriggerScan();
              }}
              className="px-2.5 py-1 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors flex items-center space-x-1 font-black text-xs cursor-pointer shadow-2xs"
              title="Quét mã QR vị trí bằng camera"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Quét QR Kệ</span>
            </button>
          )}

          <ChevronDown
            className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-blue-600' : ''
            }`}
          />
        </div>
      </div>

      {/* Quick Shelf Pills (Fast 1-tap select when not expanded) */}
      {!isOpen && quickChips.length > 0 && !value && (
        <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 shrink-0 flex items-center space-x-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>Kệ nhanh:</span>
          </span>
          {quickChips.slice(0, 8).map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => handleSelect(loc.name)}
              className="px-2.5 py-1 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-400 rounded-lg text-xs font-mono font-bold text-slate-700 hover:text-emerald-800 transition-all shrink-0 cursor-pointer shadow-2xs"
            >
              {loc.name}
            </button>
          ))}
        </div>
      )}

      {/* Custom Input Field if '__custom__' is selected */}
      {value === '__custom__' && allowCustom && (
        <div className="mt-2 relative flex items-center animate-in fade-in">
          <input
            ref={customInputRef}
            type="text"
            value={customValue}
            onChange={(e) => onCustomChange && onCustomChange(e.target.value)}
            placeholder="Gõ tên vị trí / kệ mới (VD: Khoang B - Tầng 2)..."
            className="w-full pl-3.5 pr-8 py-2.5 bg-amber-50 border-2 border-amber-400 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-hidden"
          />
          {customValue && (
            <button
              type="button"
              onClick={() => onCustomChange && onCustomChange('')}
              className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Fast Dropdown Menu Popup */}
      {isOpen && (
        <div
          className="absolute z-50 left-0 right-0 mt-1.5 bg-white border-2 border-slate-300 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col"
          style={{ maxHeight: '380px' }}
        >
          {/* Top Quick Search Bar */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2 shrink-0">
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Gõ nhanh tên kệ (VD: A01, B02, Kệ A)..."
                  className="w-full bg-white border-2 border-blue-400 rounded-xl pl-9 pr-8 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-2xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleTriggerScan}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center space-x-1 shrink-0 cursor-pointer shadow-xs transition-colors"
                title="Quét mã QR kệ bằng camera"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Quét QR</span>
              </button>
            </div>

            {/* Shelf Prefix Group Tabs */}
            {shelfGroups.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-[11px]">
                <button
                  type="button"
                  onClick={() => setSelectedGroup('ALL')}
                  className={`px-2.5 py-1 rounded-lg font-black transition-colors cursor-pointer shrink-0 ${
                    selectedGroup === 'ALL'
                      ? themeClasses.tabActive
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Tất cả ({locations.length})
                </button>
                {shelfGroups.map((grp) => {
                  const count = locations.filter((l) => l.name.toUpperCase().startsWith(grp)).length;
                  return (
                    <button
                      key={grp}
                      type="button"
                      onClick={() => setSelectedGroup(grp)}
                      className={`px-2.5 py-1 rounded-lg font-black transition-colors cursor-pointer shrink-0 ${
                        selectedGroup === grp
                          ? themeClasses.tabActive
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Dãy {grp} ({count})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Locations Options List */}
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100 max-h-60">
            {filteredList.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                <MapPin className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-bold text-slate-600">
                  Không tìm thấy vị trí nào khớp với "{searchQuery}".
                </p>
                <p className="text-[11px]">
                  Thử tìm theo mã ký tự khác hoặc chọn tab dãy kệ ở trên.
                </p>
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
                    className={`px-4 py-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? themeClasses.activeItem
                        : isHighlighted
                        ? 'bg-blue-50 text-slate-950 font-bold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 pr-2">
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 font-mono text-[11px] font-black ${
                          isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {locName.substring(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-slate-900 flex items-center space-x-2">
                          <span className="font-mono text-sm">{locName}</span>
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
                className={`px-4 py-3 flex items-center space-x-2.5 text-xs font-bold cursor-pointer transition-colors border-t-2 border-slate-100 ${
                  value === '__custom__'
                    ? 'bg-amber-50 text-amber-950 font-black'
                    : highlightedIndex === filteredList.length
                    ? 'bg-amber-50/70 text-amber-900'
                    : 'text-amber-700 hover:bg-amber-50/40'
                }`}
              >
                <Plus className="w-4 h-4 text-amber-600 shrink-0" />
                <span>➕ Tự nhập tên vị trí / kệ mới nếu chưa có trong danh sách...</span>
              </div>
            )}
          </div>

          {/* Quick Footer info */}
          <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-between shrink-0 font-medium">
            <span>Hiển thị: {filteredList.length} / {locations.length} vị trí</span>
            <span>💡 Gõ tìm kiếm hoặc bấm trực tiếp để chọn</span>
          </div>
        </div>
      )}

      {/* Internal QR Scanner Modal if not handled externally */}
      {isInternalScannerOpen && (
        <LocationQrScannerModal
          isOpen={isInternalScannerOpen}
          onClose={() => setIsInternalScannerOpen(false)}
          locations={locations}
          onLocationDetected={(matchedLoc) => {
            handleSelect(matchedLoc.name);
            setIsInternalScannerOpen(false);
          }}
          title="Quét mã QR Kệ Vị Trí"
        />
      )}
    </div>
  );
};
