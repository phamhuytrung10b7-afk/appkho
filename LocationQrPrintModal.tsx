import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  getSavedPrintConfigs,
  savePrintConfigs,
  defaultPrintConfigs,
  PrintLayout,
  AllPrintConfigs,
} from './printConfig';
import { printHtml } from './printHelper';

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
  const [labelLayout, setLabelLayout] = useState<PrintLayout>('single'); // 'single' = 35x22mm, 'double' = 73x22mm, 'a7' = 74x105mm
  const [printConfigs, setPrintConfigs] = useState<AllPrintConfigs>(getSavedPrintConfigs());
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

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

  if (!isOpen) return null;

  // Selected locations
  const selectedLocations = locations.filter((loc) => selectedIds.includes(loc.id));

  // Filter locations by search term
  const filteredLocations = locations.filter(
    (loc) =>
      loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (loc.description && loc.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
        .label-row {
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: center;
          box-sizing: border-box;
          page-break-after: always;
          break-after: page;
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
                <span className="text-xs text-blue-200 font-medium">Chuẩn máy in nhiệt barcode</span>
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
                  <option value="single">Tem Đơn (35x22mm)</option>
                  <option value="double">Tem Đôi (73x22mm)</option>
                  <option value="a7">Khổ A7 (74x105mm)</option>
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
                <span>Cài đặt kích thước</span>
              </button>

              <div className="flex items-center space-x-2 bg-white px-3 py-1.5 border border-slate-300 rounded-xl font-bold text-slate-700">
                <span className="text-slate-500">Số tem mỗi kệ:</span>
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
                <span>In Tên Kho</span>
              </label>
            </div>

            <div className="text-slate-500 font-medium">
              Đã chọn: <strong className="text-blue-600 font-black">{selectedLocations.length}</strong> / {locations.length} vị trí ({printItems.length} tem)
            </div>
          </div>

          {/* Expandable Dimension Settings Panel */}
          {showSettings && (
            <div className="p-3 bg-white border border-emerald-200 rounded-2xl shadow-xs animate-in slide-in-from-top-2 duration-150 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-extrabold text-slate-800 flex items-center space-x-1">
                  <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Tuỳ Chỉnh Kích Thước Tem - Khổ {labelLayout === 'a7' ? 'A7 (74x105mm)' : labelLayout === 'double' ? 'Tem Đôi (73x22mm)' : 'Tem Đơn (35x22mm)'}</span>
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    CỠ CHỮ TÊN KỆ (PX)
                  </label>
                  <input
                    type="number"
                    min={6}
                    max={36}
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
                    max={28}
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
                    max={80}
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
          {/* Location Selection Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span>CHỌN VỊ TRÍ KỆ CẦN IN TEM:</span>
              </label>

              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Lọc tên kệ..."
                  className="px-3 py-1 bg-slate-100 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden w-36"
                />

                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl font-bold text-slate-700 flex items-center space-x-1.5 shadow-2xs cursor-pointer text-xs"
                >
                  {selectedIds.length === locations.length ? (
                    <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>
                    {selectedIds.length === locations.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-2xl border border-slate-200">
              {filteredLocations.map((loc) => {
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
              })}
            </div>
          </div>

          {/* Interactive Tag Preview Section */}
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-extrabold text-slate-800 flex items-center space-x-1.5 uppercase tracking-wider">
                <Eye className="w-4 h-4 text-blue-600" />
                <span>MÔ PHỎNG MẪU TEM ({labelLayout === 'a7' ? 'A7 74x105mm' : labelLayout === 'double' ? 'Tem Đôi 73x22mm' : 'Tem Đơn 35x22mm'})</span>
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
                <div className="flex flex-wrap justify-center gap-3">
                  {labelRows.map((row, rowIndex) => (
                    <div
                      key={`preview-row-${rowIndex}`}
                      className={`bg-white border-2 border-dashed border-slate-400 p-1.5 rounded-xl shadow-md flex items-center gap-1.5 bg-amber-50/20 ${
                        labelLayout === 'a7' ? 'flex-col' : 'flex-row'
                      }`}
                      style={{
                        width: labelLayout === 'a7' ? '280px' : labelLayout === 'double' ? '420px' : '210px',
                        height: labelLayout === 'a7' ? '400px' : '120px',
                      }}
                    >
                      {row.map((loc, colIndex) => (
                        <div
                          key={`preview-item-${rowIndex}-${colIndex}`}
                          className={`flex-1 w-full h-full bg-white border border-slate-300 rounded-md overflow-hidden shadow-2xs relative flex ${
                            labelLayout === 'a7' ? 'flex-col items-center p-5 justify-between' : 'flex-row items-center p-2'
                          }`}
                        >
                          {labelLayout === 'a7' ? (
                            <>
                              <div className="w-full text-center">
                                {showCompanyHeader && (
                                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 border-b border-slate-200 pb-1">
                                    {settings.warehouseName || 'KHO LINH KIỆN'}
                                  </p>
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
                                <QRCodeSVG value={loc.name} size={150} level="Q" marginSize={1} />
                              </div>

                              <div className="w-full text-center border-t border-slate-200 pt-2 text-[10px] text-slate-400 font-mono">
                                KHU VỰC LƯU TRỮ • SCAN TO LOCATE
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Left: QR Code */}
                              <div className="shrink-0 pr-2 flex items-center justify-center">
                                <QRCodeSVG value={loc.name} size={68} level="M" marginSize={0} />
                              </div>

                              {/* Right: Info */}
                              <div className="flex-1 min-w-0 h-full flex flex-col justify-between py-0.5">
                                {showCompanyHeader && (
                                  <p className="text-[8px] font-extrabold text-slate-400 uppercase truncate">
                                    {settings.warehouseName || 'KHO HÀNG'}
                                  </p>
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
                            </>
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
            💡 Hỗ trợ cài đặt máy in: Chọn Khổ giấy tương ứng ({labelLayout === 'a7' ? '74x105mm' : labelLayout === 'double' ? '73x22mm' : '35x22mm'}), Lề (Margins) = None.
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
                        width: labelLayout === 'double' ? '35mm' : labelLayout === 'single' ? '33mm' : '100%',
                        height: labelLayout === 'a7' ? '100%' : '20mm',
                        flexDirection: labelLayout === 'a7' ? 'column' : 'row',
                        justifyContent: labelLayout === 'a7' ? 'space-between' : 'flex-start',
                        alignItems: labelLayout === 'a7' ? 'center' : 'center',
                        border: labelLayout === 'a7' ? '1px solid #94a3b8' : '0.5px solid #ccc',
                        borderRadius: labelLayout === 'a7' ? '3mm' : '1.5mm',
                        padding: labelLayout === 'a7' ? '3.5mm' : '1mm',
                        boxSizing: 'border-box',
                      }}
                    >
                      {labelLayout === 'a7' ? (
                        <>
                          <div style={{ textAlign: 'center', width: '100%' }}>
                            {showCompanyHeader && (
                              <div
                                style={{
                                  fontSize: `${conf.metaFontSize}px`,
                                  fontWeight: 'bold',
                                  color: '#475569',
                                  marginBottom: '2mm',
                                  textTransform: 'uppercase',
                                  borderBottom: '1px solid #cbd5e1',
                                  paddingBottom: '1.5mm',
                                }}
                              >
                                {settings.warehouseName || 'KHO LINH KIỆN'}
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
                                  fontSize: `${Math.max(6, conf.metaFontSize - 1)}px`,
                                  fontWeight: 'bold',
                                  color: '#64748b',
                                  textTransform: 'uppercase',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {settings.warehouseName || 'KHO HÀNG'}
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
