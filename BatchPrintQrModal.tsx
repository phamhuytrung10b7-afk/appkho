import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Part, AppSettings } from './types';
import { QRCodeSVG } from 'qrcode.react';
import { printHtml } from './printHelper';
import { getSavedPrintConfigs, savePrintConfigs, PrintLayout, AllPrintConfigs } from './printConfig';

import { Printer, X, Search, CheckSquare, Square, Filter, RefreshCw, Settings, Tag, Eye } from 'lucide-react';

interface BatchPrintQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  parts: Part[];
  settings: AppSettings;
}

export const BatchPrintQrModal: React.FC<BatchPrintQrModalProps> = ({
  isOpen,
  onClose,
  parts,
  settings,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');

  // Selected part IDs and quantities { [partId]: labelQuantity }
  const [selectedPartsMap, setSelectedPartsMap] = useState<{ [id: string]: number }>(() => {
    const initialMap: { [id: string]: number } = {};
    parts.forEach((p) => {
      initialMap[p.id] = 1; // Default 1 label per part
    });
    return initialMap;
  });

  // Display options
  const [labelLayout, setLabelLayout] = useState<'double' | 'single' | 'a7'>('double');
  const [printConfigs, setPrintConfigs] = useState<AllPrintConfigs>(getSavedPrintConfigs());
  const printRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    savePrintConfigs(printConfigs);
  }, [printConfigs]);
 // 'double' = 73x22mm (2 tem / hàng), 'single' = 35x22mm
  const [showLocation, setShowLocation] = useState(true);
  const [showWarehouseName, setShowWarehouseName] = useState(false);
  const [activeTab, setActiveTab] = useState<'select' | 'preview'>('select');

  // Locations list
  const locations = Array.from(new Set(parts.map((p) => p.location || 'Kệ A1'))).sort();

  // Filtered parts
  const filteredParts = parts.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLocation = selectedLocation === 'ALL' || p.location === selectedLocation;
    return matchesSearch && matchesLocation;
  });

  // Toggle selection
  const toggleSelectAll = () => {
    const allFilteredSelected = filteredParts.every((p) => (selectedPartsMap[p.id] || 0) > 0);
    const newMap = { ...selectedPartsMap };

    filteredParts.forEach((p) => {
      if (allFilteredSelected) {
        newMap[p.id] = 0;
      } else {
        newMap[p.id] = newMap[p.id] > 0 ? newMap[p.id] : 1;
      }
    });

    setSelectedPartsMap(newMap);
  };

  const handleQuantityChange = (partId: string, qty: number) => {
    setSelectedPartsMap((prev) => ({
      ...prev,
      [partId]: Math.max(0, qty),
    }));
  };

  // Build array of individual labels to print
  const labelItems: Part[] = [];
  parts.forEach((p) => {
    const count = selectedPartsMap[p.id] || 0;
    for (let i = 0; i < count; i++) {
      labelItems.push(p);
    }
  });

  // Group labelItems into rows for 2-up (tem đôi 73x22mm)
  const labelRows: Part[][] = [];
  
    for (let i = 0; i < labelItems.length; i++) {
      labelRows.push([labelItems[i]]);
    
  }

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

  if (!isOpen) return null;

  const totalSelectedLabels = labelItems.length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-800 via-indigo-800 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-md">
              <Printer className="w-6 h-6 text-blue-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg flex items-center space-x-2">
                <span>IN HÀNG LOẠT TEM QR CODE DÁN KỆ</span>
                <span className="px-2 py-0.5 text-[11px] bg-amber-400 text-slate-950 font-black rounded-full">
                  Kích thước: {'Khổ A7 74x105mm'}
                </span>
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                Thiết kế chuẩn kích thước máy in tem nhiệt (Xprinter, Godex, Zebra...). Chuẩn 2 tem / hàng (35x22mm/tem).
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              disabled={totalSelectedLabels === 0}
              className="flex items-center space-x-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-xs font-black rounded-xl shadow-lg transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>In {totalSelectedLabels} Tem Ngay</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 text-white rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab & Controls Bar */}
        <div className="p-3 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Navigation Tabs */}
          <div className="flex items-center bg-slate-200 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('select')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'select'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tag className="w-4 h-4" />
              <span>Chọn Linh Kiện ({totalSelectedLabels} tem)</span>
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>Xem Trước Mẫu In (A7 74x105mm)</span>
            </button>
          </div>

          {/* Quick Print Configs */}
          <div className="flex items-center space-x-3 text-xs font-semibold text-slate-700">
            <div className="flex items-center space-x-1">
              <span className="text-slate-500">Khổ tem:</span>
              <select
                value={labelLayout}
                onChange={(e) => setLabelLayout(e.target.value as 'double' | 'single')}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-bold text-blue-700 focus:outline-hidden cursor-pointer"
              >
                <option value="double">Tem Đôi (73x22mm - 2 Tem/Hàng)</option>
                <option value="single">Tem Đơn (35x22mm - 1 Tem/Hàng)</option>
                <option value="a7">Khổ A7 (74x105mm - 1 Tem)</option>
              </select>
            </div>

            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showLocation}
                onChange={(e) => setShowLocation(e.target.checked)}
                className="rounded-xs text-blue-600 focus:ring-0"
              />
              <span>In Vị Trí Kệ</span>
            </label>

            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showWarehouseName}
                onChange={(e) => setShowWarehouseName(e.target.checked)}
                className="rounded-xs text-blue-600 focus:ring-0"
              />
              <span>In Tên Kho</span>
            </label>
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'select' ? (
            <div className="h-full flex flex-col p-4 space-y-3 overflow-hidden">
              {/* Search & Location Filter Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200 shrink-0">
                <div className="flex items-center space-x-2 w-full sm:w-auto flex-1">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Tìm theo mã, tên linh kiện hoặc vị trí kệ..."
                      className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-hidden"
                    />
                  </div>

                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-hidden cursor-pointer shrink-0"
                  >
                    <option value="ALL">Tất cả vị trí kệ ({locations.length} kệ)</option>
                    {locations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold border border-blue-200 transition-colors cursor-pointer"
                  >
                    <CheckSquare className="w-4 h-4" />
                    <span>Chọn / Bỏ chọn hiển thị ({filteredParts.length})</span>
                  </button>
                </div>
              </div>

              {/* Table of Parts with Quantity inputs */}
              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-12 text-center">STT</th>
                      <th className="p-3">Mã Linh Kiện</th>
                      <th className="p-3">Tên Linh Kiện</th>
                      <th className="p-3">Vị Trí Kệ</th>
                      <th className="p-3 text-center">Tồn Kho</th>
                      <th className="p-3 text-center w-36">Số Tem In</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredParts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">
                          Không tìm thấy linh kiện nào phù hợp.
                        </td>
                      </tr>
                    ) : (
                      filteredParts.map((part, index) => {
                        const count = selectedPartsMap[part.id] || 0;
                        const isSelected = count > 0;
                        return (
                          <tr
                            key={part.id}
                            className={`hover:bg-blue-50/50 transition-colors ${
                              isSelected ? 'bg-blue-50/20' : 'opacity-75'
                            }`}
                          >
                            <td className="p-3 text-center font-semibold text-slate-400">{index + 1}</td>
                            <td className="p-3 font-mono font-bold text-blue-700">{part.code}</td>
                            <td className="p-3 font-extrabold text-slate-900">{part.name}</td>
                            <td className="p-3 font-medium text-slate-600">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-mono font-bold">
                                {part.location}
                              </span>
                            </td>
                            <td className="p-3 text-center font-extrabold text-slate-800">
                              {part.currentStock} {part.unit}
                            </td>
                            <td className="p-3 text-center">
                              <div className="inline-flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                                <button
                                  type="button"
                                  onClick={() => handleQuantityChange(part.id, count - 1)}
                                  className="w-6 h-6 bg-white hover:bg-slate-200 text-slate-800 font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  max={99}
                                  value={count}
                                  onChange={(e) =>
                                    handleQuantityChange(part.id, parseInt(e.target.value) || 0)
                                  }
                                  className="w-12 text-center bg-white border-none font-bold text-blue-700 text-xs focus:outline-hidden py-0.5"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleQuantityChange(part.id, count + 1)}
                                  className="w-6 h-6 bg-white hover:bg-slate-200 text-slate-800 font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* PREVIEW TAB - Visual layout representation of 73x22mm roll */
            <div className="h-full overflow-y-auto p-6 bg-slate-200/80 space-y-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-300 shadow-xs flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-slate-800">
                    Mô Phỏng Trực Quan Giấy In Tem Nhiệt ({'Khổ A7 74x105mm'})
                  </p>
                  <p className="text-slate-500">
                    Mỗi cuộn tem gồm {'1 tem A7 (74x105mm)'}. Đúng tỉ lệ thực tế khi dán kệ.
                  </p>
                </div>
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Bắt Đầu In Giấy Tem</span>
                </button>
              </div>

              {labelRows.length === 0 ? (
                <div className="p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-300">
                  Vui lòng chọn ít nhất 1 tem để xem trước mẫu in.
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-3 pb-8">
                  {labelRows.map((row, rowIndex) => (
                    <div
                      key={rowIndex}
                      className={`bg-white border-2 border-dashed border-slate-400 p-1.5 rounded-lg shadow-md flex bg-amber-50/20 mx-auto ${
                        labelLayout === 'a7' ? 'flex-col items-center justify-center' : 'flex-row items-center space-x-1.5'
                      }`}
                      style={{
                        width: labelLayout === 'double' ? '420px' : (labelLayout === 'a7' ? '280px' : '210px'),
                        height: labelLayout === 'a7' ? '400px' : '125px', 
                      }}
                    >
                      {row.map((item, colIndex) => (
                        <div
                          key={colIndex}
                          className={`flex-1 w-full h-full bg-white border border-slate-300 rounded-md overflow-hidden shadow-2xs relative flex ${
                             labelLayout === 'a7' ? 'flex-col items-center p-6' : 'flex-row items-center p-2'
                          }`}
                        >
                          {labelLayout === 'a7' ? (
                             <>
                                <div className="w-full text-center">
                                    {showWarehouseName && (
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 line-clamp-1">
                                            {settings.warehouseName || 'KHO LINH KIỆN'}
                                        </p>
                                    )}
                                    <p className="text-xl font-black text-slate-900 leading-tight mb-3 line-clamp-4">
                                        {item.name}
                                    </p>
                                    <p className="text-base font-mono font-bold text-blue-800 bg-blue-50 py-1.5 px-3 rounded-md inline-block">
                                        {item.code}
                                    </p>
                                </div>
                                <div className="shrink-0 my-4">
                                    <QRCodeSVG value={item.qrCode || item.code} size={180} level="Q" marginSize={1} />
                                </div>
                                <div className="w-full flex flex-col gap-3 mt-auto">
                                    {showLocation && (
                                        <div className="flex items-center justify-between text-sm font-bold border-t-2 border-slate-200 pt-3">
                                            <span className="text-slate-500">KỆ:</span>
                                            <span className="bg-slate-900 text-white px-3 py-1 rounded-md font-mono">{item.location || 'N/A'}</span>
                                        </div>
                                    )}
                                    <p className="text-[11px] text-slate-400 text-right mt-1 font-medium">
                                        Ngày in: {new Date().toLocaleDateString('vi-VN')}
                                    </p>
                                </div>
                                <span className="absolute top-2 right-2 text-[9px] font-mono text-slate-300">74x105mm</span>
                             </>
                          ) : (
                             <>
                                <div className="shrink-0 pr-2">
                                  <QRCodeSVG value={item.qrCode || item.code} size={75} level="M" marginSize={0} />
                                </div>
                                <div className="flex-1 min-w-0 h-full flex flex-col justify-between py-0.5">
                                  {showWarehouseName && (
                                    <p className="text-[9px] font-bold text-slate-500 truncate uppercase tracking-tighter">
                                      {settings.warehouseName || 'KHO LINH KIỆN'}
                                    </p>
                                  )}
                                  <div>
                                    <p className="text-[11px] font-black text-slate-900 leading-tight line-clamp-3">
                                      {item.name}
                                    </p>
                                    <p className="text-[11px] font-mono font-bold text-blue-700 mt-0.5">
                                      {item.code}
                                    </p>
                                  </div>
                                  {showLocation && (
                                    <div className="flex items-center justify-between text-[10px] font-bold border-t border-slate-200 pt-0.5">
                                      <span className="text-slate-500">KỆ:</span>
                                      <span className="bg-slate-900 text-white px-1 rounded-xs font-mono">{item.location}</span>
                                    </div>
                                  )}
                                </div>
                                <span className="absolute top-0.5 right-1 text-[8px] font-mono text-slate-300">35x22mm</span>
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
              )}
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 text-xs text-slate-500">
          <span>* Hỗ trợ cài đặt lề máy in nhiệt: Lề (Margins) = None (Không có), Tỉ lệ (Scale) = 100%</span>
          <div className="flex items-center space-x-2">
            <button onClick={onClose} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold cursor-pointer transition-colors">Đóng</button>
            <button onClick={handlePrint} disabled={totalSelectedLabels === 0} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl font-bold shadow-md cursor-pointer transition-colors flex items-center space-x-1.5">
              <Printer className="w-4 h-4" />
              <span>In Ngay ({totalSelectedLabels} tem)</span>
            </button>
          </div>
        </div>
      </div>
      {/* HIDDEN PRINT RENDERING */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', visibility: 'hidden', overflow: 'hidden' }}>
        <div ref={printRef}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {labelRows.map((row, rowIndex) => {
              const conf = printConfigs[labelLayout];
              return (
              <div key={rowIndex} className="label-row" style={{ 
                  width: `${conf.pageWidth}mm`, 
                  height: `${conf.pageHeight}mm`,
                  padding: `${conf.padding}mm`,
                  gap: labelLayout === 'double' ? '2mm' : '0'
              }}>
                {row.map((item, colIndex) => (
                  <div key={colIndex} className="single-label" style={{
                      width: labelLayout === 'double' ? '35mm' : (labelLayout === 'single' ? '33mm' : '100%'),
                      height: labelLayout === 'a7' ? '100%' : '20mm',
                      flexDirection: labelLayout === 'a7' ? 'column' : 'row',
                      alignItems: 'center',
                      border: labelLayout === 'a7' ? '1px solid #ccc' : '0.5px solid #ccc',
                      borderRadius: labelLayout === 'a7' ? '4mm' : '2mm',
                      padding: labelLayout === 'a7' ? '4mm' : '1mm'
                  }}>
                    {labelLayout === 'a7' ? (
                        <>
                            <div style={{ textAlign: 'center', width: '100%' }}>
                                {showWarehouseName && (
                                    <div style={{ fontSize: `${conf.metaFontSize}px`, fontWeight: 'bold', color: '#555', marginBottom: '4mm', textTransform: 'uppercase' }}>
                                        {settings.warehouseName || 'KHO LINH KIỆN'}
                                    </div>
                                )}
                                <div style={{ fontSize: `${conf.nameFontSize}px`, fontWeight: '900', color: '#000', marginBottom: '6mm', lineHeight: '1.3', wordBreak: 'break-word', overflow: 'hidden' }}>
                                    {item.name}
                                </div>
                                <div style={{ fontSize: `${conf.codeFontSize}px`, fontWeight: 'bold', fontFamily: 'monospace', color: '#1e40af', padding: '3mm', background: '#f1f5f9', borderRadius: '2mm', display: 'inline-block' }}>
                                    {item.code}
                                </div>
                            </div>
                            <div style={{ width: `${conf.qrSize}mm`, height: `${conf.qrSize}mm`, margin: '4mm 0' }}>
                              <QRCodeSVG
                                value={item.qrCode || item.code}
                                size={300}
                                level="Q"
                                marginSize={1}
                                style={{ width: '100%', height: '100%' }}
                              />
                            </div>
                            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2mm', marginTop: 'auto' }}>
                                {showLocation && (
                                    <div style={{ fontSize: `${conf.metaFontSize + 2}px`, fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #ccc', paddingTop: '3mm' }}>
                                        <span>VỊ TRÍ (KỆ):</span>
                                        <span style={{ fontFamily: 'monospace', fontWeight: '900', background: '#0f172a', color: 'white', padding: '1.5mm 4mm', borderRadius: '2mm' }}>{item.location || 'N/A'}</span>
                                    </div>
                                )}
                                <div style={{ fontSize: '12px', fontWeight: 'normal', color: '#64748b', textAlign: 'right' }}>
                                    Ngày in: {new Date().toLocaleDateString('vi-VN')}
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ width: `${conf.qrSize}mm`, height: `${conf.qrSize}mm`, flexShrink: 0, marginRight: '1mm' }}>
                              <QRCodeSVG
                                value={item.qrCode || item.code}
                                size={128}
                                level="M"
                                marginSize={0}
                                style={{ width: '100%', height: '100%' }}
                              />
                            </div>
                            <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontFamily: 'sans-serif', lineHeight: '1.1' }}>
                              {showWarehouseName && (
                                <div style={{ fontSize: `${conf.metaFontSize}px`, fontWeight: 'bold', color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {settings.warehouseName || 'KHO LINH KIỆN'}
                                </div>
                              )}
                              <div>
                                <div style={{ fontSize: `${conf.nameFontSize}px`, fontWeight: '900', color: '#000', maxHeight: '11mm', overflow: 'hidden', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                                  {item.name}
                                </div>
                                <div style={{ fontSize: `${conf.codeFontSize}px`, fontWeight: 'bold', fontFamily: 'monospace', color: '#1e40af', marginTop: '0.5mm' }}>
                                  {item.code}
                                </div>
                              </div>
                              {showLocation && (
                                <div style={{ fontSize: `${conf.metaFontSize}px`, fontWeight: 'bold', borderTop: '0.5px solid #ccc', paddingTop: '0.5mm' }}>
                                  Kệ: {item.location || 'N/A'}
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
            )})}
          </div>
        </div>
      </div>
    </div>
  );
};
