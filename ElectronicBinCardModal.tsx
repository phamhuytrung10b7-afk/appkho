import React, { useState, useMemo } from 'react';
import { Part, Transaction, AppSettings } from './types';
import { storageService } from './storage';
import { QRCodeSVG } from 'qrcode.react';
import {
  X,
  Printer,
  FileSpreadsheet,
  Calendar,
  Search,
  Package,
  MapPin,
  Tag,
  Boxes,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  UserCheck,
} from 'lucide-react';

interface ElectronicBinCardModalProps {
  part: Part | null;
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
}

export const ElectronicBinCardModal: React.FC<ElectronicBinCardModalProps> = ({
  part,
  isOpen,
  onClose,
  settings,
}) => {
  if (!isOpen || !part) return null;

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterText, setFilterText] = useState('');

  // Fetch chronological bin card transaction history
  const allHistory = useMemo(() => {
    return storageService.getBinCardHistory(part.id);
  }, [part.id]);

  // Filter history
  const filteredHistory = useMemo(() => {
    return allHistory.filter((t) => {
      // Date filter
      if (dateFrom && new Date(t.date) < new Date(dateFrom)) return false;
      if (dateTo && new Date(t.date) > new Date(dateTo + 'T23:59:59')) return false;

      // Text filter
      if (filterText) {
        const query = filterText.toLowerCase();
        const matchNote = t.notes?.toLowerCase().includes(query);
        const matchPerson = t.person.toLowerCase().includes(query);
        const matchPo = t.productionOrder?.toLowerCase().includes(query);
        const matchReason = t.reasonOrPurpose?.toLowerCase().includes(query);
        if (!matchNote && !matchPerson && !matchPo && !matchReason) return false;
      }
      return true;
    });
  }, [allHistory, dateFrom, dateTo, filterText]);

  // Calculate part multi-location breakdown
  const partLocations = useMemo(() => {
    return storageService.getPartLocations(part);
  }, [part]);
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
    storageService.exportBinCardToExcel(part, filteredHistory);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-8 border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Control Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600 text-white rounded-lg">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">THẺ KHO ĐIỆN TỬ</h3>
              <p className="text-xs text-slate-400">Mã linh kiện: <span className="font-mono text-blue-300 font-bold">{part.code}</span></p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xuất Excel</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>In Thẻ Kho</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <span className="font-semibold text-slate-700 flex items-center">
              <Calendar className="w-3.5 h-3.5 mr-1 text-slate-500" />
              Lọc theo thời gian:
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
            <span className="text-slate-400">đến</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-blue-600 hover:underline font-medium"
              >
                Xóa lọc
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo lệnh SX, ghi chú..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="pl-8 pr-3 py-1 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-hidden text-xs w-48"
            />
          </div>
        </div>

        {/* PRINTABLE BIN CARD CONTAINER */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 printable-bin-card">
          {/* Paper Bin Card Official Header Format */}
          <div className="border-2 border-slate-800 p-6 rounded-xl bg-white shadow-xs">
            {/* Company & Document Title */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-300 pb-4 mb-4 gap-4">
              <div>
                <h2 className="font-black text-slate-900 text-sm uppercase tracking-wide">
                  {settings.companyName}
                </h2>
                <p className="text-xs font-semibold text-slate-700">{settings.warehouseName}</p>
                <p className="text-[11px] text-slate-500">{settings.address}</p>
              </div>

              <div className="text-center md:text-right">
                <div className="inline-block px-4 py-1.5 bg-blue-50 border-2 border-blue-600 rounded-lg">
                  <h1 className="text-xl font-black text-blue-900 tracking-wider">THẺ KHO GIẤY / ĐIỆN TỬ</h1>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Lập ngày: {new Date().toLocaleDateString('vi-VN')}</p>
              </div>
            </div>

            {/* Part Attributes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="col-span-1 md:col-span-2">
                <p className="text-xs text-slate-500 font-medium">Tên linh kiện:</p>
                <p className="text-base font-bold text-slate-900 flex items-center mt-0.5">
                  <Package className="w-4 h-4 mr-1.5 text-blue-600 shrink-0" />
                  {part.name}
                </p>
                {part.description && (
                  <p className="text-xs text-slate-600 mt-1 italic">{part.description}</p>
                )}
              </div>

              <div>
                <p className="text-xs text-slate-500 font-medium">Mã linh kiện:</p>
                <p className="text-sm font-bold font-mono text-blue-700 bg-white px-2 py-1 rounded-md border border-slate-200 inline-block mt-0.5">
                  {part.code}
                </p>
              </div>

              <div className="col-span-1 md:col-span-2">
                <p className="text-xs text-slate-500 font-medium mb-1">Vị trí trên kệ (Các kệ đang chứa linh kiện):</p>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {partLocations.map((loc, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-2xs"
                    >
                      <MapPin className="w-3.5 h-3.5 mr-1 text-emerald-600 shrink-0" />
                      <span>{loc.locationName}</span>
                      <span className="ml-1.5 text-[11px] font-mono text-emerald-950 bg-emerald-200/90 px-1.5 py-0.5 rounded-md font-extrabold">
                        {loc.quantity.toLocaleString('vi-VN')} {part.unit}
                      </span>
                    </span>
                  ))}
                  {partLocations.length === 0 && (
                    <span className="text-xs text-slate-500 italic">Chưa phân vị trí</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-500 font-medium">Đơn vị tính:</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{part.unit}</p>
              </div>

              <div>
                <p className="text-xs text-slate-500 font-medium">Mức tồn tối thiểu:</p>
                <p className="text-sm font-bold text-amber-700 mt-0.5">
                  {part.minStock.toLocaleString('vi-VN')} {part.unit}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500 font-medium">Tồn thực tế hiện tại:</p>
                <p
                  className={`text-base font-black mt-0.5 ${
                    part.currentStock === 0
                      ? 'text-red-600'
                      : part.currentStock <= part.minStock
                      ? 'text-amber-600'
                      : 'text-emerald-700'
                  }`}
                >
                  {part.currentStock.toLocaleString('vi-VN')} {part.unit}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <QRCodeSVG value={part.qrCode || part.code} size={48} className="bg-white p-1 rounded-md border border-slate-200" />
                <div className="text-[10px] text-slate-500 font-mono">
                  <div>QR: {part.code}</div>
                  <div>BC: {part.barcode || 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* THẺ KHO TABLE - PAPER BIN CARD FORMAT */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 border-b border-slate-300">
                    <th className="p-2.5 border-r border-slate-300 font-bold text-center w-10">STT</th>
                    <th className="p-2.5 border-r border-slate-300 font-bold w-24">Ngày</th>
                    <th className="p-2.5 border-r border-slate-300 font-bold text-right bg-emerald-50 text-emerald-900 w-20">Nhập</th>
                    <th className="p-2.5 border-r border-slate-300 font-bold text-right bg-blue-50 text-blue-900 w-20">Xuất</th>
                    <th className="p-2.5 border-r border-slate-300 font-bold text-right bg-amber-50 text-amber-900 w-24">Tồn cuối</th>
                    <th className="p-2.5 border-r border-slate-300 font-bold text-emerald-900 bg-emerald-50/70 w-32">Kệ / Vị trí</th>
                    <th className="p-2.5 border-r border-slate-300 font-bold">Người thực hiện / Nhận</th>
                    <th className="p-2.5 border-r border-slate-300 font-bold w-32">Lệnh sản xuất</th>
                    <th className="p-2.5 font-bold">Lý do / Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                        Chưa có giao dịch nhập/xuất kho nào cho linh kiện này.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((item, idx) => {
                      const isStockIn = item.type === 'IN';
                      const isAudit = item.type === 'AUDIT_ADJUSTMENT';

                      const itemLoc = item.locationId || part.location?.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính';

                      return (
                        <tr
                          key={item.id}
                          className="border-b border-slate-200 hover:bg-slate-50 transition-colors"
                        >
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
                          <td className="p-2 border-r border-slate-200 text-right font-bold text-emerald-700 bg-emerald-50/40">
                            {isStockIn ? `+${item.quantity.toLocaleString('vi-VN')}` : '-'}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-bold text-blue-700 bg-blue-50/40">
                            {!isStockIn && !isAudit ? `-${item.quantity.toLocaleString('vi-VN')}` : '-'}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-black text-slate-900 bg-amber-50/40">
                            {item.stockAfter.toLocaleString('vi-VN')}
                          </td>
                          <td className="p-2 border-r border-slate-200 font-bold text-slate-800 bg-emerald-50/20 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100/90 text-emerald-950 border border-emerald-300 shadow-2xs">
                              <MapPin className="w-3 h-3 mr-1 text-emerald-600 shrink-0" />
                              {itemLoc}
                            </span>
                          </td>
                          <td className="p-2 border-r border-slate-200 font-medium text-slate-800">
                            {item.person || '-'}
                          </td>
                          <td className="p-2 border-r border-slate-200 font-mono text-blue-700 font-semibold">
                            {item.productionOrder || '-'}
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
                        {part.currentStock.toLocaleString('vi-VN')}
                      </td>
                      <td colSpan={4} className="p-2.5 text-slate-500 font-normal italic">
                        Đã đối soát chính xác theo nhật ký thẻ kho
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Signature Block for Print */}
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
                <p className="font-medium text-slate-800">{settings.managerName}</p>
              </div>
              <div>
                <p className="font-bold uppercase text-slate-800">Quản lý xưởng / Khách</p>
                <p className="text-slate-400 mt-1 italic">(Ký, họ tên)</p>
                <div className="h-16"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
