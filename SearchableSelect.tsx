import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, Plus, X } from 'lucide-react';

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
  placeholder = '— Chọn hoặc tìm kiếm —',
  allowCustom = true,
  required = false,
  icon,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Normalize options to SelectOption[]
  const normalizedOptions: SelectOption[] = options.map((opt) => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return opt;
  });

  // Find currently selected label
  const selectedOpt = normalizedOptions.find((o) => o.value === value);
  const displayLabel = selectedOpt ? selectedOpt.label : value || placeholder;

  // Filtered options based on search term
  const filteredOptions = normalizedOptions.filter((opt) => {
    const term = searchTerm.toLowerCase();
    return (
      opt.label.toLowerCase().includes(term) ||
      opt.value.toLowerCase().includes(term) ||
      (opt.sublabel && opt.sublabel.toLowerCase().includes(term))
    );
  });

  const isExactMatch = normalizedOptions.some(
    (o) => o.value.toLowerCase() === searchTerm.trim().toLowerCase() || o.label.toLowerCase() === searchTerm.trim().toLowerCase()
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
        className={`w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-slate-100/80 border rounded-xl cursor-pointer transition-all ${
          isOpen ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white' : 'border-slate-300'
        }`}
      >
        <div className="flex items-center space-x-2 min-w-0 pr-2">
          {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
          <span
            className={`text-xs truncate font-medium ${
              value ? 'text-slate-900 font-bold' : 'text-slate-400'
            }`}
          >
            {displayLabel}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-blue-600' : ''
          }`}
        />
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search Header */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/50 flex items-center space-x-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1.5" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Gõ để tìm kiếm..."
              className="w-full bg-transparent border-none text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden py-1"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto p-1 divide-y divide-slate-50">
            {/* Custom Input Option if allowed and user typed something not matching */}
            {allowCustom && searchTerm.trim() && !isExactMatch && (
              <div
                onClick={() => handleSelect(searchTerm.trim())}
                className="p-2.5 hover:bg-blue-50 text-blue-700 rounded-xl cursor-pointer text-xs font-semibold flex items-center space-x-2 transition-colors mb-1 border border-dashed border-blue-200"
              >
                <Plus className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Dùng giá trị tự nhập: <strong className="font-bold">"{searchTerm.trim()}"</strong>
                </span>
              </div>
            )}

            {filteredOptions.length === 0 && (!allowCustom || !searchTerm.trim()) ? (
              <div className="p-4 text-center text-xs text-slate-400 italic">
                Không tìm thấy kết quả phù hợp
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    onClick={() => handleSelect(opt.value)}
                    className={`p-2.5 rounded-xl cursor-pointer text-xs flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-blue-50/80 text-blue-900 font-bold'
                        : 'hover:bg-slate-50 text-slate-700 font-medium'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-2">
                        <span className="truncate">{opt.label}</span>
                        {opt.badge && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-slate-100 text-slate-600 rounded-md font-mono shrink-0">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {opt.sublabel && (
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate font-normal">
                          {opt.sublabel}
                        </p>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-1" />}
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
