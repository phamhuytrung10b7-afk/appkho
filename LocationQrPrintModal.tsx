import React, { useState, useEffect, useRef, useMemo } from 'react';
import { WarehouseLocation, AppSettings } from './types';
import {
  X,
  Printer,
  CheckSquare,
  Square,
  QrCode,
  Sliders,
  Settings2,
  RotateCcw,
  Check,
  Eye,
  Building2,
  MapPin,
  Tag,
  Layers,
  Filter,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { SunhouseLogo } from './SunhouseLogo';
import {
  getSavedPrintConfigs,
  savePrintConfigs,
  defaultPrintConfigs,
  PrintLayout,
  AllPrintConfigs,
} from './printConfig';
import { printHtml } from './printHelper';

export interface ShelfGroup {
  key: string;
  name: string;
  locations: WarehouseLocation[];
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  isPartiallySelected: boolean;
}

/**
 * Parses a location name into its shelf group prefix
 * E.g.: "A01" -> "A", "A30" -> "A", "Kệ B05" -> "B", "Khoang C" -> "C"
 */
export function getShelfGroupKey(name: string): string {
  const trimmed = (name || '').trim();
  // Match "Kệ A", "Dãy A", "Khoang A", "Khu A", "Tủ A"
  const wordPrefix = trimmed.match(/^(?:kệ|dãy|khoang|khu|tủ)\s*([A-Za-z0-9]+)/i);
  if (wordPrefix) {
    return wordPrefix[1].toUpperCase();
  }
  // Match starting alphabetic letters: "A01", "A-01", "AB01"
  const letterPrefix = trimmed.match(/^([A-Za-z]+)/);
  if (letterPrefix) {
    return letterPrefix[1].toUpperCase();
  }
  // Match starting numbers: "01-A"
  const numPrefix = trimmed.match(/^(\d+)/);
  if (numPrefix) {
    return numPrefix[1];
  }
  return 'Khác';
}

interface LocationQrPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  locations: WarehouseLocation[];
  settings: AppSettings;
  initialSelectedId?: string;
}

export const LocationQrPrintModal: React.FC<LocationQrPrintModalProps> = ({
  isOpen,
  onClose,
  locations,
  settings,
  initialSelectedId,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tagCopies, setTagCopies] = useState<number>(1);
  const [showCompanyHeader, setShowCompanyHeader] = useState<boolean>(true);
  const [showLogo, setShowLogo] = useState<boolean>(true);
  const [companyLine1, setCompanyLine1] = useState<string>(
    'CÔNG TY SẢN XUẤT ĐỒ GIA DỤNG SUNHOUSE'
  );
  const [companyLine2, setCompanyLine2] = useState<string>('CHI NHÁNH BÌNH DƯƠNG');
  const [labelLayout, setLabelLayout] = useState<PrintLayout>('150x100'); // '150x100' = 150x100mm, '100x75' = 100x75mm, 'a7' = 74x105mm, 'double' = 73x22mm, 'single' = 35x22mm
  const [printConfigs, setPrintConfigs] = useState<AllPrintConfigs>(getSavedPrintConfigs());
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeGroupFilter, setActiveGroupFilter] = useState<string>('all');

  const printRef = useRef<HTMLDivElement>(null);

  // Auto-save print configurations whenever changed
  useEffect(() => {
    savePrintConfigs(printConfigs);
  }, [printConfigs]);

  // Initialize selected IDs when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialSelectedId) {
        setSelectedIds([initialSelectedId]);
      } else {
        setSelectedIds(locations.map((l) => l.id));
      }
    }
  }, [isOpen, initialSelectedId, locations]);

  // Compute Shelf Groups (e.g. Kệ A, Kệ B, Kệ C...)
  const shelfGroups: ShelfGroup[] = useMemo(() => {
    const map = new Map<string, WarehouseLocation[]>();
    locations.forEach((loc) => {
      const key = getShelfGroupKey(loc.name);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(loc);
    });

    const groups: ShelfGroup[] = [];
    map.forEach((locs, key) => {
      const selectedCount = locs.filter((l) => selectedIds.includes(l.id)).length;
      groups.push({
        key,
        name: key === 'Khác' ? 'Vị trí khác' : `Kệ ${key}`,
        locations: locs,
        selectedCount,
        totalCount: locs.length,
        isAllSelected: locs.length > 0 && selectedCount === locs.length,
        isPartiallySelected: selectedCount > 0 && selectedCount < locs.length,
      });
    });

    // Sort alphabetically by group key
    groups.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
    return groups;
  }, [locations, selectedIds]);

  if (!isOpen) return null;

  // Selected locations
  const selectedLocations = locations.filter((loc) => selectedIds.includes(loc.id));

  // Filter locations by search term and active group tab
  const displayedLocations = locations.filter((loc) => {
    const matchesGroup =
      activeGroupFilter === 'all' || getShelfGroupKey(loc.name) === activeGroupFilter;
    const matchesSearch =
      !searchTerm.trim() ||
      loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (loc.description && loc.description.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesGroup && matchesSearch;
  });

  const handleToggleSelectAll = () => {
    if (selectedIds.length === locations.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(locations.map((l) => l.id));
    }
  };

  const handleToggleId = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Toggle full shelf group (e.g. Full Kệ A from 1 to 30)
  const handleToggleGroup = (group: ShelfGroup) => {
    const groupLocationIds = group.locations.map((l) => l.id);
    if (group.isAllSelected) {
      // Deselect all in this group
      setSelectedIds((prev) => prev.filter((id) => !groupLocationIds.includes(id)));
    } else {
      // Select all in this group
      setSelectedIds((prev) => {
        const next = new Set(prev);
        groupLocationIds.forEach((id) => next.add(id));
        return Array.from(next);
      });
    }
  };

  // Build list of individual labels to print
  const printItems: WarehouseLocation[] = [];
  selectedLocations.forEach((loc) => {
    for (let i = 0; i < tagCopies; i++) {
      printItems.push(loc);
    }
  });

  // Group into rows based on labelLayout
  const labelRows: WarehouseLocation[][] = [];
  if (labelLayout === 'double') {
    for (let i = 0; i < printItems.length; i += 2) {
      labelRows.push(printItems.slice(i, i + 2));
    }
  } else {
    for (let i = 0; i < printItems.length; i++) {
      labelRows.push([printItems[i]]);
    }
  }

  // Handle Printing
  const handlePrint = () => {
    if (printRef.current) {
      const styles = `
        @page {
          size: ${currentConf.pageWidth}mm ${currentConf.pageHeight}mm;
          margin: 0mm;
        }
        body {
          margin: 0;
          padding: 0;
        }
        .label-row {
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: center;
          box-sizing: border-box;
          page-break-after: always;
          break-after: page;
          page-break-inside: avoid;
          break-inside: avoid;
          overflow: hidden;
          background-color: white;
        }
        .single-label {
          box-sizing: border-box;
          display: flex;
          overflow: hidden;
          background-color: white;
        }
      `;
      printHtml(printRef.current.innerHTML, styles);
    }
  };

  // Update dimension config for current layout
  const handleConfigChange = (key: keyof typeof defaultPrintConfigs['single'], val: number) => {
    setPrintConfigs((prev) => ({
      ...prev,
      [labelLayout]: {
        ...prev[labelLayout],
        [key]: Math.max(1, val),
      },
    }));
  };

  const handleResetCurrentConfig = () => {
    setPrintConfigs((prev) => ({
      ...prev,
      [labelLayout]: { ...defaultPrintConfigs[labelLayout] },
    }));
  };

  const getLayoutLabel = (layout: PrintLayout) => {
    switch (layout) {
      case '150x100':
        return 'Tem Ngang Lớn (150x100mm)';
      case '100x75':
        return 'Tem Ngang Vừa (100x75mm)';
      case 'a7':
        return 'Khổ A7 Dọc (74x105mm)';
      case 'double':
        return 'Tem Đôi (73x22mm)';
      case 'single':
        return 'Tem Đơn (35x22mm)';
      default:
        return layout;
    }
  };

  const currentConf = printConfigs[labelLayout];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-4 animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-blue-900 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500 text-slate-950 rounded-2xl font-black shadow-lg">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 bg-emerald-400 text-slate-950 text-[10px] font-black rounded-md uppercase tracking-wider">
                  IN TEM NHÃN KỆ KHO
                </span>
                <span className="text-xs text-blue-200 font-medium">Chuẩn máy in nhiệt & in tem ngoài</span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white mt-0.5">
                In Mã QR Vị Trí / Khoang Kệ Lưu Trữ
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              disabled={printItems.length === 0}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:opacity-50 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>In {printItems.length} Tem</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Paper Size & Dimensions Settings Controls Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Paper Size Selector & Dimension Settings Button */}
            <div className="flex items-center space-x-2 flex-wrap gap-2">
              <div className="flex items-center space-x-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-700">
                <span className="text-slate-500">Khổ giấy:</span>
                <select
                  value={labelLayout}
                  onChange={(e) => setLabelLayout(e.target.value as PrintLayout)}
                  className="bg-transparent font-extrabold text-blue-700 outline-hidden cursor-pointer"
                >
                  <option value="150x100">⭐ Tem Ngang Lớn (150x100mm) - Chuẩn mới</option>
                  <option value="100x75">⭐ Tem Ngang Vừa (100x75mm) - Chuẩn mới</option>
                  <option value="a7">Khổ A7 Dọc (74x105mm)</option>
                  <option value="double">Tem Đôi (73x22mm)</option>
                  <option value="single">Tem Đơn Nhỏ (35x22mm)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className={`px-3 py-1.5 rounded-xl font-bold flex items-center space-x-1.5 transition-all cursor-pointer border ${
                  showSettings
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                }`}
              >
                <Settings2 className="w-4 h-4" />
                <span>Cài đặt thông tin tem</span>
              </button>

              <div className="flex items-center space-x-2 bg-white px-3 py-1.5 border border-slate-300 rounded-xl font-bold text-slate-700">
                <span className="text-slate-500">Số tem / kệ:</span>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={tagCopies}
                  onChange={(e) => setTagCopies(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-12 text-center bg-slate-100 border border-slate-300 rounded-md font-bold text-slate-800 py-0.5 outline-hidden"
                />
              </div>

              <label className="flex items-center space-x-1.5 cursor-pointer bg-white px-3 py-1.5 border border-slate-300 rounded-xl font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={showCompanyHeader}
                  onChange={(e) => setShowCompanyHeader(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>In Tên Doanh Nghiệp</span>
              </label>

              <label className="flex items-center space-x-1.5 cursor-pointer bg-white px-3 py-1.5 border border-slate-300 rounded-xl font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={showLogo}
                  onChange={(e) => setShowLogo(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Logo Sunhouse</span>
              </label>
            </div>

            <div className="text-slate-500 font-medium">
              Đã chọn:{' '}
              <strong className="text-blue-600 font-black">{selectedLocations.length}</strong> /{' '}
              {locations.length} vị trí ({printItems.length} tem)
            </div>
          </div>

          {/* Expandable Settings Panel */}
          {showSettings && (
            <div className="p-4 bg-white border border-emerald-200 rounded-2xl shadow-xs animate-in slide-in-from-top-2 duration-150 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-extrabold text-slate-800 flex items-center space-x-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Tuỳ Chỉnh Kích Thước & Tên Doanh Nghiệp - {getLayoutLabel(labelLayout)}</span>
                </span>
                <button
                  type="button"
                  onClick={handleResetCurrentConfig}
                  className="text-[11px] text-amber-700 hover:text-amber-900 font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Khôi phục mặc định</span>
                </button>
              </div>

              {/* Company Branding Lines Input */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    DÒNG 1 (TÊN CÔNG TY TRÊN TEM):
                  </label>
                  <input
                    type="text"
                    value={companyLine1}
                    onChange={(e) => setCompanyLine1(e.target.value)}
                    placeholder="CÔNG TY SẢN XUẤT ĐỒ GIA DỤNG SUNHOUSE"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 outline-hidden focus:ring-2 focus:ring-blue-500 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    DÒNG 2 (CHI NHÁNH / ĐƠN VỊ):
                  </label>
                  <input
                    type="text"
                    value={companyLine2}
                    onChange={(e) => setCompanyLine2(e.target.value)}
                    placeholder="CHI NHÁNH BÌNH DƯƠNG"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 outline-hidden focus:ring-2 focus:ring-blue-500 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    CỠ CHỮ TÊN KỆ (PX)
                  </label>
                  <input
                    type="number"
                    min={6}
                    max={72}
                    value={currentConf.nameFontSize}
                    onChange={(e) => handleConfigChange('nameFontSize', parseInt(e.target.value) || 8)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    CỠ CHỮ MÔ TẢ (PX)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={36}
                    value={currentConf.codeFontSize}
                    onChange={(e) => handleConfigChange('codeFontSize', parseInt(e.target.value) || 7)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    KÍCH THƯỚC QR (MM)
                  </label>
                  <input
                    type="number"
                    min={8}
                    max={90}
                    value={currentConf.qrSize}
                    onChange={(e) => handleConfigChange('qrSize', parseInt(e.target.value) || 12)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    LỀ PADDING (MM)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={currentConf.padding}
                    onChange={(e) => handleConfigChange('padding', parseInt(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Workspace Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* SECTION 1: QUICK SELECT BY SHELF GROUP (Full Kệ A, Full Kệ B...) */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    CHỌN NHANH THEO DÃY KỆ (TICK CHỌN FULL KỆ TỪ 1 ĐẾN 30):
                  </label>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Bấm vào kệ để chọn hoặc bỏ chọn nhanh toàn bộ vị trí trong kệ đó:
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl font-bold text-slate-700 flex items-center space-x-1.5 shadow-2xs cursor-pointer text-xs"
                >
                  {selectedIds.length === locations.length ? (
                    <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>
                    {selectedIds.length === locations.length
                      ? 'Bỏ chọn tất cả'
                      : `Chọn tất cả kho (${locations.length})`}
                  </span>
                </button>
              </div>
            </div>

            {/* Shelf Group Buttons Grid */}
            <div className="flex flex-wrap gap-2 pt-1">
              {shelfGroups.map((grp) => (
                <button
                  key={grp.key}
                  type="button"
                  onClick={() => handleToggleGroup(grp)}
                  title={`Click để ${grp.isAllSelected ? 'bỏ chọn' : 'chọn full'} toàn bộ ${grp.name} (${grp.totalCount} vị trí)`}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer border shadow-2xs ${
                    grp.isAllSelected
                      ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300'
                      : grp.isPartiallySelected
                      ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:bg-blue-50/50'
                  }`}
                >
                  {grp.isAllSelected ? (
                    <CheckSquare className="w-4 h-4 text-white" />
                  ) : grp.isPartiallySelected ? (
                    <div className="w-4 h-4 rounded-xs bg-amber-500 text-white flex items-center justify-center text-[10px] font-black leading-none">
                      -
                    </div>
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="tracking-tight">Full {grp.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                      grp.isAllSelected
                        ? 'bg-blue-700 text-white'
                        : grp.isPartiallySelected
                        ? 'bg-amber-200 text-amber-950'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {grp.selectedCount}/{grp.totalCount}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* SECTION 2: INDIVIDUAL LOCATION SELECTION & TABS */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span>CHI TIẾT TỪNG VỊ TRÍ KỆ:</span>
              </label>

              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm vị trí (VD: A01, Khoang 1)..."
                  className="px-3 py-1 bg-slate-100 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden w-48"
                />
              </div>
            </div>

            {/* Filter Tabs by Shelf Group */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveGroupFilter('all')}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  activeGroupFilter === 'all'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Tất cả ({locations.length})
              </button>
              {shelfGroups.map((grp) => (
                <button
                  key={`tab-${grp.key}`}
                  type="button"
                  onClick={() => setActiveGroupFilter(grp.key)}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border flex items-center space-x-1.5 ${
                    activeGroupFilter === grp.key
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{grp.name}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                      activeGroupFilter === grp.key
                        ? 'bg-blue-700 text-white'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {grp.selectedCount}/{grp.totalCount}
                  </span>
                </button>
              ))}
            </div>

            {/* Individual Shelf Items Pills */}
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2.5 bg-slate-50 rounded-2xl border border-slate-200">
              {displayedLocations.length === 0 ? (
                <div className="w-full py-4 text-center text-xs text-slate-400">
                  Không tìm thấy vị trí nào phù hợp bộ lọc.
                </div>
              ) : (
                displayedLocations.map((loc) => {
                  const isSelected = selectedIds.includes(loc.id);
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => handleToggleId(loc.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer border ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>{loc.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Interactive Tag Preview Section */}
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-extrabold text-slate-800 flex items-center space-x-1.5 uppercase tracking-wider">
                <Eye className="w-4 h-4 text-blue-600" />
                <span>MÔ PHỎNG MẪU TEM ({getLayoutLabel(labelLayout)})</span>
              </h3>
              <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200 font-bold">
                ✓ Đã tối ưu vừa khít 100% không bị tràn hay mất chữ
              </span>
            </div>

            {selectedLocations.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-400 text-xs">
                Vui lòng chọn ít nhất 1 vị trí để xem trước và in tem QR code.
              </div>
            ) : (
              <div className="p-4 bg-slate-200/80 rounded-2xl border border-slate-300">
                <p className="text-[11px] text-slate-600 mb-3 italic font-medium">
                  * Hình ảnh mô phỏng đúng tỉ lệ thực tế khi in ra giấy tem nhiệt.
                </p>

                {/* Grid Visual Preview */}
                <div className="flex flex-wrap justify-center gap-4">
                  {labelRows.map((row, rowIndex) => (
                    <div
                      key={`preview-row-${rowIndex}`}
                      className="bg-white border-2 border-dashed border-slate-400 p-2 rounded-2xl shadow-md flex items-center justify-center gap-2 bg-amber-50/20"
                      style={{
                        width:
                          labelLayout === '150x100'
                            ? '380px'
                            : labelLayout === '100x75'
                            ? '320px'
                            : labelLayout === 'a7'
                            ? '280px'
                            : labelLayout === 'double'
                            ? '420px'
                            : '210px',
                        height:
                          labelLayout === '150x100'
                            ? '253px'
                            : labelLayout === '100x75'
                            ? '240px'
                            : labelLayout === 'a7'
                            ? '400px'
                            : '120px',
                      }}
                    >
                      {row.map((loc, colIndex) => (
                        <div
                          key={`preview-item-${rowIndex}-${colIndex}`}
                          className="flex-1 w-full h-full bg-white border border-slate-400 rounded-xl overflow-hidden shadow-2xs relative flex flex-col justify-between"
                        >
                          {labelLayout === '150x100' ? (
                            /* 150x100mm TEM NGANG LỚN */
                            <div className="w-full h-full flex flex-col justify-between p-3 box-border">
                              {/* Header: Logo + 2-line Company Name */}
                              {showCompanyHeader && (
                                <div className="flex items-center justify-center gap-2 border-b-2 border-slate-900 pb-1.5 mb-1 text-center">
                                  {showLogo && (
                                    <div className="shrink-0 flex items-center justify-center">
                                      <SunhouseLogo className="w-7 h-7 text-red-600" />
                                    </div>
                                  )}
                                  <div className="flex flex-col text-center">
                                    <span className="text-[10px] font-black text-slate-950 uppercase tracking-tight leading-tight">
                                      {companyLine1}
                                    </span>
                                    <span className="text-[9px] font-extrabold text-slate-800 uppercase tracking-wider leading-tight">
                                      {companyLine2}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Middle: Left Info + Right QR */}
                              <div className="flex-1 flex flex-row items-center justify-between gap-2 px-1">
                                <div className="flex-1 flex flex-col justify-center min-w-0 pr-2">
                                  <p className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                    VỊ TRÍ KỆ
                                  </p>
                                  <p className="text-4xl font-black text-slate-950 font-mono tracking-tight my-0.5">
                                    {loc.name}
                                  </p>
                                  {loc.description && (
                                    <p className="text-xs font-bold text-slate-800 leading-snug line-clamp-2">
                                      {loc.description}
                                    </p>
                                  )}
                                </div>

                                <div className="shrink-0 flex items-center justify-center">
                                  <QRCodeSVG value={loc.name} size={115} level="Q" marginSize={0} />
                                </div>
                              </div>

                              {/* Footer */}
                              <div className="text-center border-t-2 border-slate-900 pt-1 mt-1 text-[10px] font-mono font-bold text-slate-800 tracking-wider">
                                MÃ SCAN TỰ ĐỘNG - KHO HÀNG
                              </div>
                            </div>
                          ) : labelLayout === '100x75' ? (
                            /* 100x75mm TEM NGANG VỪA */
                            <div className="w-full h-full flex flex-col justify-between p-2.5 box-border">
                              {/* Header: Logo + 2-line Company Name */}
                              {showCompanyHeader && (
                                <div className="flex items-center justify-center gap-1.5 border-b-2 border-slate-900 pb-1 mb-1 text-center">
                                  {showLogo && (
                                    <div className="shrink-0 flex items-center justify-center">
                                      <SunhouseLogo className="w-5 h-5 text-red-600" />
                                    </div>
                                  )}
                                  <div className="flex flex-col text-center">
                                    <span className="text-[9px] font-black text-slate-950 uppercase tracking-tight leading-tight">
                                      {companyLine1}
                                    </span>
                                    <span className="text-[8px] font-extrabold text-slate-800 uppercase tracking-wider leading-tight">
                                      {companyLine2}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Middle: Left Name + Center QR + Right Description */}
                              <div className="flex-1 flex flex-row items-center justify-between gap-1 px-1">
                                <div className="shrink-0 flex flex-col justify-center min-w-[70px]">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                                    VỊ TRÍ KỆ
                                  </p>
                                  <p className="text-2xl font-black text-slate-950 font-mono tracking-tight leading-tight">
                                    {loc.name}
                                  </p>
                                </div>

                                <div className="shrink-0 flex items-center justify-center mx-1">
                                  <QRCodeSVG value={loc.name} size={75} level="Q" marginSize={0} />
                                </div>

                                <div className="flex-1 min-w-0 pl-1">
                                  {loc.description && (
                                    <p className="text-[9px] font-bold text-slate-700 leading-tight line-clamp-3">
                                      {loc.description}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Footer */}
                              <div className="text-center border-t border-slate-400 pt-1 mt-1 text-[9px] font-mono font-bold text-slate-600 tracking-wider">
                                MÃ SCAN TỰ ĐỘNG - KHO HÀNG
                              </div>
                            </div>
                          ) : labelLayout === 'a7' ? (
                            /* A7 (74x105mm) */
                            <div className="w-full h-full flex flex-col items-center justify-between p-4 text-center">
                              <div className="w-full text-center">
                                {showCompanyHeader && (
                                  <div className="flex items-center justify-center gap-1.5 border-b border-slate-200 pb-1 mb-2">
                                    {showLogo && (
                                      <div className="shrink-0 flex items-center justify-center">
                                        <SunhouseLogo className="w-5 h-5 text-red-600" />
                                      </div>
                                    )}
                                    <div className="flex flex-col text-center">
                                      <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight leading-tight">
                                        {companyLine1}
                                      </span>
                                      <span className="text-[8.5px] font-bold text-slate-600 uppercase tracking-wider leading-tight">
                                        {companyLine2}
                                      </span>
                                    </div>
                                  </div>
                                )}
                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                  VỊ TRÍ / KỆ
                                </p>
                                <p className="text-2xl font-black text-slate-900 leading-tight mb-1 font-mono">
                                  {loc.name}
                                </p>
                                {loc.description && (
                                  <p className="text-xs text-slate-600 line-clamp-2">
                                    {loc.description}
                                  </p>
                                )}
                              </div>

                              <div className="my-3 flex items-center justify-center">
                                <QRCodeSVG value={loc.name} size={140} level="Q" marginSize={1} />
                              </div>

                              <div className="w-full text-center border-t border-slate-200 pt-2 text-[10px] text-slate-400 font-mono">
                                KHU VỰC LƯU TRỮ • SCAN TO LOCATE
                              </div>
                            </div>
                          ) : (
                            /* SINGLE & DOUBLE */
                            <div className="w-full h-full flex flex-row items-center p-2">
                              {/* Left: QR Code */}
                              <div className="shrink-0 pr-2 flex items-center justify-center">
                                <QRCodeSVG value={loc.name} size={68} level="M" marginSize={0} />
                              </div>

                              {/* Right: Info */}
                              <div className="flex-1 min-w-0 h-full flex flex-col justify-between py-0.5">
                                {showCompanyHeader && (
                                  <div className="flex items-center gap-1">
                                    {showLogo && <SunhouseLogo className="w-3 h-3 text-red-600 shrink-0" />}
                                    <p className="text-[7.5px] font-black text-slate-700 uppercase truncate">
                                      {companyLine1}
                                    </p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter leading-none">
                                    KỆ VỊ TRÍ
                                  </p>
                                  <p className="text-sm font-black text-slate-900 font-mono leading-tight truncate">
                                    {loc.name}
                                  </p>
                                </div>
                                {loc.description && (
                                  <p className="text-[9px] text-slate-600 leading-tight line-clamp-2 font-medium">
                                    {loc.description}
                                  </p>
                                )}
                              </div>
                              <span className="absolute top-0.5 right-1 text-[7px] font-mono text-slate-300">
                                {labelLayout === 'double' ? '35x22mm' : '35x22mm'}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}

                      {labelLayout === 'double' && row.length === 1 && (
                        <div className="flex-1 h-full bg-slate-100 border border-dashed border-slate-300 rounded-md p-2 flex items-center justify-center text-[10px] text-slate-400 italic">
                          (Tem trống)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-500 font-medium">
            💡 Hỗ trợ cài đặt máy in: Chọn Khổ giấy tương ứng ({getLayoutLabel(labelLayout)}), Lề (Margins) = None.
          </span>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold rounded-xl transition-colors cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={printItems.length === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Bắt Đầu In ({printItems.length} Tem)</span>
            </button>
          </div>
        </div>
      </div>

      {/* HIDDEN ISOLATED PRINT RENDERING CONTAINER */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '0', height: '0', overflow: 'hidden' }}>
        <div ref={printRef}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {labelRows.map((row, rowIndex) => {
              const conf = printConfigs[labelLayout];
              return (
                <div
                  key={`print-row-${rowIndex}`}
                  className="label-row"
                  style={{
                    width: `${conf.pageWidth}mm`,
                    height: `${conf.pageHeight}mm`,
                    padding: `${conf.padding}mm`,
                    gap: labelLayout === 'double' ? '2mm' : '0',
                    boxSizing: 'border-box',
                  }}
                >
                  {row.map((loc, colIndex) => (
                    <div
                      key={`print-col-${colIndex}`}
                      className="single-label"
                      style={{
                        width:
                          labelLayout === 'double'
                            ? '35mm'
                            : labelLayout === 'single'
                            ? '33mm'
                            : '100%',
                        height:
                          labelLayout === 'single' || labelLayout === 'double'
                            ? '20mm'
                            : '100%',
                        flexDirection:
                          labelLayout === 'single' || labelLayout === 'double'
                            ? 'row'
                            : 'column',
                        justifyContent: 'space-between',
                        alignItems: 'stretch',
                        border:
                          labelLayout === '150x100'
                            ? '1.5px solid #000000'
                            : labelLayout === '100x75'
                            ? '1.5px solid #000000'
                            : labelLayout === 'a7'
                            ? '1px solid #94a3b8'
                            : '0.5px solid #ccc',
                        borderRadius:
                          labelLayout === '150x100'
                            ? '4mm'
                            : labelLayout === '100x75'
                            ? '3.5mm'
                            : labelLayout === 'a7'
                            ? '3mm'
                            : '1.5mm',
                        padding:
                          labelLayout === '150x100'
                            ? '3.5mm'
                            : labelLayout === '100x75'
                            ? '2.5mm'
                            : labelLayout === 'a7'
                            ? '3.5mm'
                            : '1mm',
                        boxSizing: 'border-box',
                      }}
                    >
                      {labelLayout === '150x100' ? (
                        /* 150x100mm TEM NGANG LỚN */
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            boxSizing: 'border-box',
                          }}
                        >
                          {/* Header */}
                          {showCompanyHeader && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '3mm',
                                width: '100%',
                                borderBottom: '2px solid #000000',
                                paddingBottom: '2mm',
                                textAlign: 'center',
                              }}
                            >
                              {showLogo && (
                                <div style={{ width: '10mm', height: '10mm', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <SunhouseLogo style={{ width: '100%', height: '100%', color: '#dc2626' }} />
                                </div>
                              )}
                              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
                                <div
                                  style={{
                                    fontSize: `${conf.metaFontSize}px`,
                                    fontWeight: '900',
                                    color: '#000000',
                                    textTransform: 'uppercase',
                                    lineHeight: '1.2',
                                    letterSpacing: '0.2px',
                                  }}
                                >
                                  {companyLine1}
                                </div>
                                <div
                                  style={{
                                    fontSize: `${Math.max(8, conf.metaFontSize - 2)}px`,
                                    fontWeight: '800',
                                    color: '#000000',
                                    textTransform: 'uppercase',
                                    lineHeight: '1.2',
                                    letterSpacing: '0.4px',
                                  }}
                                >
                                  {companyLine2}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Middle: Left Info + Right QR */}
                          <div
                            style={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '2mm 3mm',
                            }}
                          >
                            <div
                              style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                paddingRight: '4mm',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: `${Math.round(conf.nameFontSize * 0.4)}px`,
                                  fontWeight: '800',
                                  color: '#000000',
                                  textTransform: 'uppercase',
                                }}
                              >
                                VỊ TRÍ KỆ
                              </div>
                              <div
                                style={{
                                  fontSize: `${conf.nameFontSize}px`,
                                  fontWeight: '900',
                                  fontFamily: 'monospace',
                                  color: '#000000',
                                  margin: '1mm 0 2mm 0',
                                  lineHeight: '1',
                                }}
                              >
                                {loc.name}
                              </div>
                              {loc.description && (
                                <div
                                  style={{
                                    fontSize: `${conf.codeFontSize}px`,
                                    fontWeight: 'bold',
                                    color: '#000000',
                                    lineHeight: '1.3',
                                  }}
                                >
                                  {loc.description}
                                </div>
                              )}
                            </div>

                            <div
                              style={{
                                width: `${conf.qrSize}mm`,
                                height: `${conf.qrSize}mm`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <QRCodeSVG
                                value={loc.name}
                                size={240}
                                level="Q"
                                marginSize={0}
                                style={{ width: '100%', height: '100%' }}
                              />
                            </div>
                          </div>

                          {/* Footer */}
                          <div
                            style={{
                              width: '100%',
                              textAlign: 'center',
                              fontSize: `${conf.metaFontSize - 2}px`,
                              fontWeight: 'bold',
                              color: '#000000',
                              borderTop: '1.5px solid #000000',
                              paddingTop: '1.5mm',
                              letterSpacing: '1px',
                              fontFamily: 'monospace',
                            }}
                          >
                            MÃ SCAN TỰ ĐỘNG - KHO HÀNG
                          </div>
                        </div>
                      ) : labelLayout === '100x75' ? (
                        /* 100x75mm TEM NGANG VỪA */
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            boxSizing: 'border-box',
                          }}
                        >
                          {/* Header */}
                          {showCompanyHeader && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '2mm',
                                width: '100%',
                                borderBottom: '1.5px solid #000000',
                                paddingBottom: '1.5mm',
                                textAlign: 'center',
                              }}
                            >
                              {showLogo && (
                                <div style={{ width: '7mm', height: '7mm', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <SunhouseLogo style={{ width: '100%', height: '100%', color: '#dc2626' }} />
                                </div>
                              )}
                              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
                                <div
                                  style={{
                                    fontSize: `${conf.metaFontSize}px`,
                                    fontWeight: '900',
                                    color: '#000000',
                                    textTransform: 'uppercase',
                                    lineHeight: '1.2',
                                    letterSpacing: '0.2px',
                                  }}
                                >
                                  {companyLine1}
                                </div>
                                <div
                                  style={{
                                    fontSize: `${Math.max(7, conf.metaFontSize - 2)}px`,
                                    fontWeight: '800',
                                    color: '#000000',
                                    textTransform: 'uppercase',
                                    lineHeight: '1.2',
                                  }}
                                >
                                  {companyLine2}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Middle: Left Name + Center QR + Right Description */}
                          <div
                            style={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '1mm 1.5mm',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                flexShrink: 0,
                                minWidth: '22mm',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: `${Math.round(conf.nameFontSize * 0.38)}px`,
                                  fontWeight: 'bold',
                                  color: '#64748b',
                                  textTransform: 'uppercase',
                                }}
                              >
                                VỊ TRÍ KỆ
                              </div>
                              <div
                                style={{
                                  fontSize: `${conf.nameFontSize}px`,
                                  fontWeight: '900',
                                  fontFamily: 'monospace',
                                  color: '#000000',
                                  marginTop: '0.5mm',
                                  lineHeight: '1',
                                }}
                              >
                                {loc.name}
                              </div>
                            </div>

                            <div
                              style={{
                                width: `${conf.qrSize}mm`,
                                height: `${conf.qrSize}mm`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 2mm',
                                flexShrink: 0,
                              }}
                            >
                              <QRCodeSVG
                                value={loc.name}
                                size={180}
                                level="Q"
                                marginSize={0}
                                style={{ width: '100%', height: '100%' }}
                              />
                            </div>

                            <div
                              style={{
                                flex: 1,
                                minWidth: 0,
                                paddingLeft: '1.5mm',
                              }}
                            >
                              {loc.description && (
                                <div
                                  style={{
                                    fontSize: `${conf.codeFontSize}px`,
                                    fontWeight: '600',
                                    color: '#334155',
                                    lineHeight: '1.3',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {loc.description}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Footer */}
                          <div
                            style={{
                              width: '100%',
                              textAlign: 'center',
                              fontSize: `${conf.metaFontSize - 2}px`,
                              fontWeight: 'bold',
                              color: '#475569',
                              borderTop: '1.5px solid #94a3b8',
                              paddingTop: '1.2mm',
                              letterSpacing: '0.5px',
                              fontFamily: 'monospace',
                            }}
                          >
                            MÃ SCAN TỰ ĐỘNG - KHO HÀNG
                          </div>
                        </div>
                      ) : labelLayout === 'a7' ? (
                        /* A7 */
                        <>
                          <div style={{ textAlign: 'center', width: '100%' }}>
                            {showCompanyHeader && (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '2mm',
                                  width: '100%',
                                  marginBottom: '2mm',
                                  borderBottom: '1px solid #cbd5e1',
                                  paddingBottom: '1.5mm',
                                }}
                              >
                                {showLogo && (
                                  <div style={{ width: '6mm', height: '6mm', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <SunhouseLogo style={{ width: '100%', height: '100%', color: '#dc2626' }} />
                                  </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
                                  <div
                                    style={{
                                      fontSize: `${conf.metaFontSize}px`,
                                      fontWeight: '900',
                                      color: '#0f172a',
                                      textTransform: 'uppercase',
                                      lineHeight: '1.2',
                                    }}
                                  >
                                    {companyLine1}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: `${Math.max(7, conf.metaFontSize - 2)}px`,
                                      fontWeight: '700',
                                      color: '#475569',
                                      textTransform: 'uppercase',
                                      lineHeight: '1.2',
                                    }}
                                  >
                                    {companyLine2}
                                  </div>
                                </div>
                              </div>
                            )}

                            <div
                              style={{
                                fontSize: `${conf.metaFontSize}px`,
                                fontWeight: 'bold',
                                color: '#64748b',
                                textTransform: 'uppercase',
                              }}
                            >
                              VỊ TRÍ KỆ
                            </div>

                            <div
                              style={{
                                fontSize: `${conf.nameFontSize + 4}px`,
                                fontWeight: '900',
                                fontFamily: 'monospace',
                                color: '#0f172a',
                                marginTop: '1mm',
                                marginBottom: '2mm',
                              }}
                            >
                              {loc.name}
                            </div>

                            {loc.description && (
                              <div
                                style={{
                                  fontSize: `${conf.codeFontSize}px`,
                                  color: '#334155',
                                  maxHeight: '12mm',
                                  overflow: 'hidden',
                                }}
                              >
                                {loc.description}
                              </div>
                            )}
                          </div>

                          <div
                            style={{
                              width: `${conf.qrSize}mm`,
                              height: `${conf.qrSize}mm`,
                              margin: '3mm auto',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <QRCodeSVG
                              value={loc.name}
                              size={220}
                              level="Q"
                              marginSize={1}
                              style={{ width: '100%', height: '100%' }}
                            />
                          </div>

                          <div
                            style={{
                              width: '100%',
                              textAlign: 'center',
                              fontSize: `${conf.metaFontSize - 1}px`,
                              color: '#64748b',
                              borderTop: '1px solid #cbd5e1',
                              paddingTop: '2mm',
                              fontFamily: 'monospace',
                            }}
                          >
                            MÃ SCAN TỰ ĐỘNG - KHO HÀNG
                          </div>
                        </>
                      ) : (
                        /* SINGLE & DOUBLE */
                        <>
                          {/* QR Code on Left */}
                          <div
                            style={{
                              width: `${conf.qrSize}mm`,
                              height: `${conf.qrSize}mm`,
                              flexShrink: 0,
                              marginRight: '1.5mm',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <QRCodeSVG
                              value={loc.name}
                              size={128}
                              level="M"
                              marginSize={0}
                              style={{ width: '100%', height: '100%' }}
                            />
                          </div>

                          {/* Details on Right */}
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              fontFamily: 'sans-serif',
                              lineHeight: '1.1',
                            }}
                          >
                            {showCompanyHeader && (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '1mm',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                }}
                              >
                                {showLogo && (
                                  <div style={{ width: '3mm', height: '3mm', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <SunhouseLogo style={{ width: '100%', height: '100%', color: '#dc2626' }} />
                                  </div>
                                )}
                                <div
                                  style={{
                                    fontSize: `${Math.max(5.5, conf.metaFontSize - 1.5)}px`,
                                    fontWeight: '800',
                                    color: '#334155',
                                    textTransform: 'uppercase',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {companyLine1}
                                </div>
                              </div>
                            )}

                            <div>
                              <div
                                style={{
                                  fontSize: `${Math.max(5, conf.metaFontSize - 2)}px`,
                                  fontWeight: 'bold',
                                  color: '#94a3b8',
                                  textTransform: 'uppercase',
                                }}
                              >
                                VỊ TRÍ
                              </div>
                              <div
                                style={{
                                  fontSize: `${conf.nameFontSize}px`,
                                  fontWeight: '900',
                                  fontFamily: 'monospace',
                                  color: '#000000',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {loc.name}
                              </div>
                            </div>

                            {loc.description && (
                              <div
                                style={{
                                  fontSize: `${conf.codeFontSize}px`,
                                  fontWeight: '500',
                                  color: '#334155',
                                  maxHeight: '6mm',
                                  overflow: 'hidden',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                }}
                              >
                                {loc.description}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {labelLayout === 'double' && row.length === 1 && (
                    <div className="single-label" style={{ visibility: 'hidden', width: '35mm' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
