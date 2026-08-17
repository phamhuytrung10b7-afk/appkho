import React, { useState, useMemo } from 'react';
import { Part, Transaction, AppSettings } from './types';
import { storageService } from './storage';
import { QRCodeSVG } from 'qrcode.react';
import {
  FileText,
  Search,
  Calendar,
  Printer,
  FileSpreadsheet,
  Package,
  MapPin,
  Boxes,
  ArrowDownCircle,
  ArrowUpCircle,
  RotateCcw,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
} from 'lucide-react';

interface BinCardHistoryViewProps {
  parts: Part[];
  transactions: Transaction[];
  settings?: AppSettings;
  onOpenBinCard: (part: Part) => void;
}

export const BinCardHistoryView: React.FC<BinCardHistoryViewProps> = ({
  parts,
  transactions,
  settings = {
    companyName: 'CÔNG TY CỔ PHẦN TẬP ĐOÀN SUNHOUSE',
    warehouseName: 'KHO LINH KIỆN SẢN XUẤT',
    address: 'Khu Công Nghiệp Ngọc Hồi, Thanh Trì, Hà Nội',
    lowStockThreshold: 10,
    barcodePrefix: 'SH',
  },
  onOpenBinCard,
}) => {
  // Selected Part ID state - defaults to first part if available, or null
  const [selectedPartId, setSelectedPartId] = useState<string | null>(parts[0]?.id || null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Filter states inside the selected part's bin card
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [binCardFilterText, setBinCardFilterText] = useState<string>('');

  // Selected Part object
  const selectedPart = useMemo(() => {
    if (!selectedPartId) return null;
    return parts.find((p) => p.id === selectedPartId) || null;
  }, [parts, selectedPartId]);

  // Filtered Parts List for Search View
  const filteredParts = useMemo(() => {
    if (!searchTerm) return parts;
    const q = searchTerm.toLowerCase();
    return parts.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.location && p.location.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  }, [parts, searchTerm]);

  // History for Selected Part
  const partHistory = useMemo(() => {
    if (!selectedPart) return [];
    return storageService.getBinCardHistory(selectedPart.id);
  }, [selectedPart]);

  // Filtered History for Selected Part
  const filteredHistory = useMemo(() => {
    return partHistory.filter((t) => {
      if (dateFrom && new Date(t.date) < new Date(dateFrom)) return false;
      if (dateTo && new Date(t.date) > new Date(dateTo + 'T23:59:59')) return false;

      if (binCardFilterText) {
        const query = binCardFilterText.toLowerCase();
        const matchNote = t.notes?.toLowerCase().includes(query);
        const matchPerson = t.person?.toLowerCase().includes(query);
        const matchPo = t.productionOrder?.toLowerCase().includes(query);
        const matchReason = t.reasonOrPurpose?.toLowerCase().includes(query);
        const matchLoc = t.locationId?.toLowerCase().includes(query);
        if (!matchNote && !matchPerson && !matchPo && !matchReason && !matchLoc) return false;
      }
      return true;
    });
  }, [partHistory, dateFrom, dateTo, binCardFilterText]);

  // Multi-location breakdown for Selected Part
  const partLocations = useMemo(() => {
    if (!selectedPart) return [];
    return storageService.getPartLocations(selectedPart);
  }, [selectedPart]);

  // Summary Metrics for Selected Part
  const totalIn = useMemo(() => {
    return filteredHistory
      .filter((t) => t.type === 'IN')
      .reduce((sum, t) => sum + t.quantity, 0);
  }, [filteredHistory]);

  const totalOut = useMemo(() => {
    return filteredHistory
      .filter((t) => t.type === 'OUT')
      .reduce((sum, t) => sum + t.quantity, 0);
  }, [filteredHistory]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    if (selectedPart) {
      storageService.exportBinCardToExcel(selectedPart, filteredHistory);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* SEARCH & SELECT HEADER BAR */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-md shadow-blue-500/20">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">TRA CỨU THẺ KHO ĐIỆN TỬ</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Chọn hoặc tìm kiếm linh kiện để xem nhật ký xuất/nhập kho chi tiết theo chuẩn thẻ kho.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSelectedPartId(null)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                selectedPartId === null
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Danh Sách Tất Cả Linh Kiện ({parts.length})</span>
            </button>
          </div>
        </div>

        {/* Big Search & Select Dropdown Combo */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
          <div className="md:col-span-8 relative">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Chọn linh kiện muốn xem thẻ kho:
            </label>
            <div className="relative">
              <Boxes className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={selectedPartId || ''}
                onChange={(e) => {
                  setSelectedPartId(e.target.value || null);
                  setDateFrom('');
                  setDateTo('');
                  setBinCardFilterText('');
                }}
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-hidden text-sm"
              >
                <option value="">-- Chọn linh kiện từ danh sách --</option>
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.code}] - {p.name} (Tồn: {p.currentStock.toLocaleString('vi-VN')} {p.unit} - Kệ: {p.location || 'N/A'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="md:col-span-4">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Lọc danh sách linh kiện:
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Gõ mã, tên, vị trí kệ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 outline-hidden text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* VIEW SECTION 1: DETAILED ELECTRONIC BIN CARD FOR SELECTED PART */}
      {selectedPart ? (
        <div className="space-y-5">
          {/* TOP CONTROL BAR FOR PRINT & EXPORT */}
          <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-600 text-white rounded-xl">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                  <span>THẺ KHO ĐIỆN TỬ LINH KIỆN</span>
                  <span className="bg-blue-500/30 text-blue-300 font-mono text-xs px-2 py-0.5 rounded-md border border-blue-400/30">
                    {selectedPart.code}
                  </span>
                </h3>
                <p className="text-xs text-slate-300">{selectedPart.name}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleExportExcel}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Xuất Excel Thẻ Kho</span>
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>In Thẻ Kho</span>
              </button>
              <button
                onClick={() => setSelectedPartId(null)}
                className="flex items-center space-x-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition-all cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Đổi linh kiện</span>
              </button>
            </div>
          </div>

          {/* KPI METRICS FOR SELECTED PART */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tồn Thực Tế Hiện Tại</p>
              <p
                className={`text-2xl font-black mt-1 ${
                  selectedPart.currentStock === 0
                    ? 'text-red-600'
                    : selectedPart.currentStock <= selectedPart.minStock
                    ? 'text-amber-600'
                    : 'text-emerald-700'
                }`}
              >
                {selectedPart.currentStock.toLocaleString('vi-VN')} <span className="text-xs font-normal text-slate-500">{selectedPart.unit}</span>
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-2xs">
              <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Tổng Nhập Trong Kỳ (+)</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">
                +{totalIn.toLocaleString('vi-VN')} <span className="text-xs font-normal text-slate-500">{selectedPart.unit}</span>
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-blue-200 bg-blue-50/20 shadow-2xs">
              <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">Tổng Xuất Trong Kỳ (-)</p>
              <p className="text-2xl font-black text-blue-700 mt-1">
                -{totalOut.toLocaleString('vi-VN')} <span className="text-xs font-normal text-slate-500">{selectedPart.unit}</span>
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tồn Tối Thiểu Cần Duy Trì</p>
              <p className="text-2xl font-black text-amber-700 mt-1">
                {selectedPart.minStock.toLocaleString('vi-VN')} <span className="text-xs font-normal text-slate-500">{selectedPart.unit}</span>
              </p>
            </div>
          </div>

          {/* OFFICIAL PRINTABLE PAPER BIN CARD CONTAINER */}
          <div className="bg-white border-2 border-slate-800 p-6 rounded-2xl shadow-sm printable-bin-card space-y-5">
            {/* Header Document Titles */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b-2 border-slate-800 pb-4 gap-4">
              <div>
                <h2 className="font-black text-slate-900 text-sm uppercase tracking-wide">{settings.companyName}</h2>
                <p className="text-xs font-bold text-slate-700">{settings.warehouseName}</p>
                <p className="text-[11px] text-slate-500">{settings.address}</p>
              </div>

              <div className="text-center md:text-right">
                <div className="inline-block px-5 py-1.5 bg-blue-50 border-2 border-blue-600 rounded-xl">
                  <h1 className="text-xl font-black text-blue-900 tracking-wider">THẺ KHO ĐIỆN TỬ</h1>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 font-medium">Lập ngày: {new Date().toLocaleDateString('vi-VN')}</p>
              </div>
            </div>

            {/* Part Attributes Card */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div className="col-span-1 md:col-span-2">
                <p className="text-slate-500 font-medium">Tên linh kiện:</p>
                <p className="text-base font-black text-slate-900 flex items-center mt-0.5">
                  <Package className="w-4 h-4 mr-1.5 text-blue-600 shrink-0" />
                  {selectedPart.name}
                </p>
                {selectedPart.description && (
                  <p className="text-slate-600 mt-1 italic">{selectedPart.description}</p>
                )}
              </div>

              <div>
                <p className="text-slate-500 font-medium">Mã linh kiện:</p>
                <p className="text-sm font-black font-mono text-blue-700 bg-white px-2.5 py-1 rounded-lg border border-slate-300 inline-block mt-0.5 shadow-2xs">
                  {selectedPart.code}
                </p>
              </div>

              <div>
                <p className="text-slate-500 font-medium">Đơn vị tính:</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{selectedPart.unit}</p>
              </div>

              <div className="col-span-1 md:col-span-3">
                <p className="text-slate-500 font-medium mb-1">Vị trí lưu trên các kệ kho:</p>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {partLocations.map((loc, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-950 border border-emerald-300 shadow-2xs"
                    >
                      <MapPin className="w-3.5 h-3.5 mr-1 text-emerald-600 shrink-0" />
                      <span>{loc.locationName}</span>
                      <span className="ml-1.5 text-[11px] font-mono text-emerald-950 bg-emerald-200/90 px-1.5 py-0.5 rounded-md font-extrabold">
                        {loc.quantity.toLocaleString('vi-VN')} {selectedPart.unit}
                      </span>
                    </span>
                  ))}
                  {partLocations.length === 0 && (
                    <span className="text-slate-500 italic">Chưa xác định vị trí</span>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <QRCodeSVG value={selectedPart.qrCode || selectedPart.code} size={48} className="bg-white p-1 rounded-lg border border-slate-300" />
                <div className="text-[10px] text-slate-500 font-mono">
                  <div>QR: {selectedPart.code}</div>
                  <div>BC: {selectedPart.barcode || 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* Filter controls inside the bin card */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                <span className="font-bold text-slate-700 flex items-center">
                  <Calendar className="w-3.5 h-3.5 mr-1 text-slate-500" />
                  Khoảng thời gian:
                </span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
                <span className="text-slate-400">đến</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="text-blue-600 hover:underline font-bold text-xs"
                  >
                    Xóa lọc ngày
                  </button>
                )}
              </div>

              <div className="relative min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Lọc theo lệnh SX, ghi chú..."
                  value={binCardFilterText}
                  onChange={(e) => setBinCardFilterText(e.target.value)}
                  className="w-full pl-8 pr-3 py-1 bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-blue-500 outline-hidden text-xs"
                />
              </div>
            </div>

            {/* BIN CARD HISTORY TABLE */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 border-b border-slate-300 uppercase font-bold text-[11px]">
                    <th className="p-2.5 border-r border-slate-300 text-center w-10">STT</th>
                    <th className="p-2.5 border-r border-slate-300 w-32">Ngày giờ</th>
                    <th className="p-2.5 border-r border-slate-300 text-right bg-emerald-50 text-emerald-900 w-24">Nhập (+)</th>
                    <th className="p-2.5 border-r border-slate-300 text-right bg-blue-50 text-blue-900 w-24">Xuất (-)</th>
                    <th className="p-2.5 border-r border-slate-300 text-right bg-amber-50 text-amber-950 font-black w-28">Tồn cuối</th>
                    <th className="p-2.5 border-r border-slate-300 bg-emerald-50/70 text-emerald-900 w-32">Kệ / Vị trí</th>
                    <th className="p-2.5 border-r border-slate-300">Người thực hiện</th>
                    <th className="p-2.5 border-r border-slate-300 w-32">Lệnh sản xuất</th>
                    <th className="p-2.5">Diễn giải / Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-10 text-center text-slate-400 italic">
                        Chưa có lịch sử giao dịch nhập/xuất kho nào phù hợp với bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((item, idx) => {
                      const isStockIn = item.type === 'IN';
                      const isAudit = item.type === 'AUDIT_ADJUSTMENT';
                      const itemLoc = item.locationId || selectedPart.location?.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính';

                      return (
                        <tr key={item.id} className="border-b border-slate-200 hover:bg-blue-50/30 transition-colors">
                          <td className="p-2 border-r border-slate-200 text-center font-medium text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="p-2 border-r border-slate-200 font-medium text-slate-800 whitespace-nowrap">
                            {new Date(item.date).toLocaleString('vi-VN', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-bold text-emerald-700 bg-emerald-50/30">
                            {isStockIn ? `+${item.quantity.toLocaleString('vi-VN')}` : '-'}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-bold text-blue-700 bg-blue-50/30">
                            {!isStockIn && !isAudit ? `-${item.quantity.toLocaleString('vi-VN')}` : '-'}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-black text-slate-900 bg-amber-50/30">
                            {item.stockAfter.toLocaleString('vi-VN')} {selectedPart.unit}
                          </td>
                          <td className="p-2 border-r border-slate-200 font-bold text-slate-800 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-950 border border-emerald-300 shadow-2xs">
                              <MapPin className="w-3 h-3 mr-1 text-emerald-600 shrink-0" />
                              {itemLoc}
                            </span>
                          </td>
                          <td className="p-2 border-r border-slate-200 font-medium text-slate-800">
                            {item.person || '-'}
                          </td>
                          <td className="p-2 border-r border-slate-200 font-mono text-blue-700 font-semibold">
                            {item.productionOrder ? (
                              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-800 rounded border border-blue-200">
                                {item.productionOrder}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="p-2 text-slate-600">
                            {item.reasonOrPurpose} {item.notes ? `(${item.notes})` : ''}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {/* Summary Table Footer */}
                {filteredHistory.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-400">
                      <td colSpan={2} className="p-2.5 border-r border-slate-300 text-right">
                        TỔNG CỘNG LỌC:
                      </td>
                      <td className="p-2.5 border-r border-slate-300 text-right text-emerald-800">
                        +{totalIn.toLocaleString('vi-VN')}
                      </td>
                      <td className="p-2.5 border-r border-slate-300 text-right text-blue-800">
                        -{totalOut.toLocaleString('vi-VN')}
                      </td>
                      <td className="p-2.5 border-r border-slate-300 text-right text-slate-900 font-black">
                        {selectedPart.currentStock.toLocaleString('vi-VN')} {selectedPart.unit}
                      </td>
                      <td colSpan={4} className="p-2.5 text-slate-500 font-normal italic">
                        Thẻ kho ghi nhận chính xác theo thời gian thực
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Signature Block for Print Mode */}
            <div className="mt-12 hidden print:grid grid-cols-3 gap-8 text-center text-xs">
              <div>
                <p className="font-bold uppercase text-slate-800">Người lập thẻ</p>
                <p className="text-slate-400 mt-1 italic">(Ký, họ tên)</p>
                <div className="h-16"></div>
              </div>
              <div>
                <p className="font-bold uppercase text-slate-800">Thủ kho</p>
                <p className="text-slate-400 mt-1 italic">(Ký, họ tên)</p>
                <div className="h-16"></div>
              </div>
              <div>
                <p className="font-bold uppercase text-slate-800">Kế toán trưởng</p>
                <p className="text-slate-400 mt-1 italic">(Ký, họ tên)</p>
                <div className="h-16"></div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW SECTION 2: ALL PARTS TABLE (When no part is selected) */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-3">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-slate-800">
              DANH SÁCH LINH KIỆN - BẤM "XEM THẺ KHO" ĐỂ TRA CỨU
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              Tìm thấy <strong className="text-slate-800">{filteredParts.length}</strong> linh kiện
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <th className="p-3 pl-5 w-12 text-center">STT</th>
                  <th className="p-3 w-40">Mã Linh Kiện</th>
                  <th className="p-3">Tên Linh Kiện</th>
                  <th className="p-3">Vị Trí Lưu (Kệ)</th>
                  <th className="p-3 text-center w-20">Đơn Vị</th>
                  <th className="p-3 text-right w-28">Tồn Hiện Tại</th>
                  <th className="p-3 text-center w-28">Trạng Thái</th>
                  <th className="p-3 pr-5 text-center w-32">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredParts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-slate-400 italic">
                      Không tìm thấy linh kiện nào trùng khớp với từ khóa tìm kiếm.
                    </td>
                  </tr>
                ) : (
                  filteredParts.map((p, index) => {
                    const isOut = p.currentStock === 0;
                    const isLow = p.currentStock <= p.minStock;

                    return (
                      <tr key={p.id} className="hover:bg-blue-50/40 transition-colors">
                        <td className="p-3 pl-5 text-center font-medium text-slate-500">{index + 1}</td>
                        <td className="p-3 font-mono font-bold text-blue-700 whitespace-nowrap">{p.code}</td>
                        <td className="p-3 font-semibold text-slate-900">{p.name}</td>
                        <td className="p-3 font-medium text-slate-700 whitespace-nowrap">
                          {p.location ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-950 border border-emerald-300">
                              <MapPin className="w-3 h-3 mr-1 text-emerald-600 shrink-0" />
                              {p.location}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Chưa xếp kệ</span>
                          )}
                        </td>
                        <td className="p-3 text-center font-medium text-slate-600">{p.unit}</td>
                        <td className={`p-3 text-right font-black ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-slate-900'}`}>
                          {p.currentStock.toLocaleString('vi-VN')}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          {isOut ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-200">
                              <XCircle className="w-3 h-3 mr-1" />
                              Hết hàng
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Sắp hết
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              An toàn
                            </span>
                          )}
                        </td>
                        <td className="p-3 pr-5 text-center whitespace-nowrap">
                          <button
                            onClick={() => setSelectedPartId(p.id)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center space-x-1.5 mx-auto"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Xem Thẻ Kho</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
