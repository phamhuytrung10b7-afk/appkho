import React, { useState, useMemo } from 'react';
import { Part, AppSettings } from './types';
import { storageService } from './storage';
import { BatchPrintQrModal } from './BatchPrintQrModal';
import { ContainerImportPrintModal } from './ContainerImportPrintModal';
import { FifoDetailModal } from './FifoDetailModal';
import {
  Package,
  Plus,
  Search,
  FileSpreadsheet,
  Upload,
  FileDown,
  Edit,
  Trash2,
  History,
  Printer,
  QrCode,
  MapPin,
  AlertTriangle,
  XCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Layers,
  Zap,
} from 'lucide-react';
import * as XLSX from 'xlsx';


interface PartsListViewProps {
  parts: Part[];
  settings?: AppSettings;
  onOpenAddModal: () => void;
  onOpenEditModal: (part: Part) => void;
  onOpenDeleteModal: (part: Part) => void;
  onOpenBinCard: (part: Part) => void;
  onRefreshParts: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

export const PartsListView: React.FC<PartsListViewProps> = ({
  parts,
  settings,
  onOpenAddModal,
  onOpenEditModal,
  onOpenDeleteModal,
  onOpenBinCard,
  onRefreshParts,
  searchTerm,
  onSearchChange,
}) => {
  const isAdmin = storageService.isAdminUser();
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SAFE' | 'LOW' | 'OUT'>('ALL');
  const [sortBy, setSortBy] = useState<'code' | 'name' | 'currentStock' | 'location'>('code');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isBatchPrintModalOpen, setIsBatchPrintModalOpen] = useState(false);
  const [isContModalOpen, setIsContModalOpen] = useState(false);
  const [selectedSinglePartForPrint, setSelectedSinglePartForPrint] = useState<Part | null>(null);
  const [selectedPartForFifo, setSelectedPartForFifo] = useState<Part | null>(null);
  const pageSize = 10;

  // Filter & Search Logic
  const filteredParts = useMemo(() => {
    return parts.filter((p) => {
      // Status Filter
      if (statusFilter === 'SAFE' && (p.currentStock === 0 || p.currentStock <= p.minStock)) return false;
      if (statusFilter === 'LOW' && (p.currentStock === 0 || p.currentStock > p.minStock)) return false;
      if (statusFilter === 'OUT' && p.currentStock > 0) return false;

      // Text Search
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchCode = p.code.toLowerCase().includes(query);
        const matchName = p.name.toLowerCase().includes(query);
        const matchLoc = p.location.toLowerCase().includes(query);
        const matchNote = p.note?.toLowerCase().includes(query);
        if (!matchCode && !matchName && !matchLoc && !matchNote) return false;
      }
      return true;
    });
  }, [parts, statusFilter, searchTerm]);

  // Sort Logic
  const sortedParts = useMemo(() => {
    return [...filteredParts].sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB as string).toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredParts, sortBy, sortOrder]);

  // Pagination Logic
  const totalPages = Math.ceil(sortedParts.length / pageSize) || 1;
  const paginatedParts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedParts.slice(start, start + pageSize);
  }, [sortedParts, currentPage, pageSize]);

  const toggleSort = (column: 'code' | 'name' | 'currentStock' | 'location') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const handleExportExcel = () => {
    storageService.exportPartsToExcel(filteredParts);
  };

  const handleDownloadTemplate = () => {
    storageService.downloadImportTemplate();
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        // Parse both object array and raw array to support all Excel formats
        const objectRows = XLSX.utils.sheet_to_json<any>(ws);
        const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

        // Use raw array if object keys are empty or row array format fits better
        const rowsToProcess = objectRows.length > 0 ? objectRows : rawRows;

        const result = storageService.importPartsFromRows(rowsToProcess);

        if (result.added === 0 && result.updated === 0) {
          alert('Không tìm thấy dữ liệu hợp lệ trong file Excel. Vui lòng sử dụng File Mẫu!');
        } else {
          alert(
            `Nhập dữ liệu thành công!\n- Thêm mới: ${result.added} linh kiện\n- Cập nhật tồn kho: ${result.updated} linh kiện`
          );
          onRefreshParts();
        }
      } catch (err) {
        console.error(err);
        alert('Có lỗi xảy ra khi đọc tệp Excel. Vui lòng chọn đúng file Excel!');
      } finally {
        e.target.value = ''; // Reset input
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center">
            <Package className="w-5 h-5 text-blue-600 mr-2" />
            Danh Sách Linh Kiện Trong Kho ({filteredParts.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cấu trúc Import Excel chuẩn: <strong className="text-slate-800">Cột 1: Warehouse</strong> | <strong className="text-slate-800">Cột 2: Item (Mã)</strong> | <strong className="text-slate-800">Cột 3: Item description (Tên)</strong> | <strong className="text-slate-800">Cột 4: Stock (Tồn)</strong> | <strong className="text-slate-800">Cột 5: Description (Mô tả)</strong> | <strong className="text-slate-800">Cột 6: Unit (ĐVT)</strong>
          </p>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {/* Download Excel Template */}
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-300 transition-colors cursor-pointer"
            title="Tải file Excel mẫu đúng chuẩn 6 cột"
          >
            <FileDown className="w-4 h-4 text-blue-600" />
            <span>Mẫu Excel</span>
          </button>

          {/* Import Excel */}
          <label className="flex items-center space-x-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-semibold cursor-pointer border border-blue-200 transition-colors">
            <Upload className="w-4 h-4 text-blue-600" />
            <span>Import Excel</span>
            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleImportExcel} className="hidden" />
          </label>

          {/* Export Excel */}
          <button
            onClick={handleExportExcel}
            className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Xuất Excel</span>
          </button>

          {/* Batch Print QR Labels button */}
          <button
            onClick={() => setIsBatchPrintModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
            title="In tem dán kệ hàng loạt (Khổ 73x22mm - Tem đôi)"
          >
            <QrCode className="w-4 h-4 text-amber-300" />
            <span>In Tem QR Kệ (73x22mm)</span>
          </button>

          {/* Add New Part */}
          <button
            onClick={onOpenAddModal}
            className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Thêm Linh Kiện</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => {
              setStatusFilter('ALL');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tất cả ({parts.length})
          </button>
          <button
            onClick={() => {
              setStatusFilter('SAFE');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'SAFE' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            An toàn
          </button>
          <button
            onClick={() => {
              setStatusFilter('LOW');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'LOW' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sắp hết
          </button>
          <button
            onClick={() => {
              setStatusFilter('OUT');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'OUT' ? 'bg-red-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Hết hàng
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo mã, tên, vị trí..."
            value={searchTerm}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white outline-hidden"
          />
        </div>
      </div>

      {/* PARTS MAIN TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <th
                  onClick={() => toggleSort('code')}
                  className="p-3 pl-5 cursor-pointer hover:bg-slate-200 transition-colors"
                >
                  <div className="flex items-center space-x-1">
                    <span>Mã linh kiện</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('name')}
                  className="p-3 cursor-pointer hover:bg-slate-200 transition-colors"
                >
                  <div className="flex items-center space-x-1">
                    <span>Tên linh kiện</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('location')}
                  className="p-3 cursor-pointer hover:bg-slate-200 transition-colors"
                >
                  <div className="flex items-center space-x-1">
                    <span>Vị trí kệ</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="p-3 text-center">Đơn vị</th>
                <th
                  onClick={() => toggleSort('currentStock')}
                  className="p-3 text-right cursor-pointer hover:bg-slate-200 transition-colors"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Tồn hiện tại</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="p-3 text-left min-w-[190px]">
                  <div className="flex items-center space-x-1 text-amber-900 font-bold">
                    <Layers className="w-3.5 h-3.5 text-amber-600" />
                    <span>Tồn theo mốc Cont (FIFO)</span>
                  </div>
                </th>
                <th className="p-3 text-right">Tồn tối thiểu</th>
                <th className="p-3 text-center">Trạng thái</th>
                <th className="p-3 pr-5 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedParts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-400">
                    Không tìm thấy linh kiện nào phù hợp.
                  </td>
                </tr>
              ) : (
                paginatedParts.map((p) => {
                  const isOut = p.currentStock === 0;
                  const isLow = p.currentStock > 0 && p.currentStock <= p.minStock;

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
                      onClick={() => onOpenBinCard(p)}
                    >
                      {/* Code */}
                      <td className="p-3 pl-5 font-mono font-bold text-blue-700 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt=""
                              className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                              <Package className="w-4 h-4 text-slate-400" />
                            </div>
                          )}
                          <span>{p.code}</span>
                        </div>
                      </td>

                      {/* Name */}
                      <td className="p-3 font-semibold text-slate-900 max-w-[220px]">
                        <div>{p.name}</div>
                        {p.description && (
                          <div className="text-[11px] text-slate-400 font-normal truncate mt-0.5">
                            {p.description}
                          </div>
                        )}
                      </td>

                      {/* Location */}
                      <td className="p-3 font-medium text-slate-700 max-w-[180px]">
                        <span className="inline-flex items-center px-2 py-1 bg-slate-100 border border-slate-200 rounded-md text-[11px] leading-tight" title={storageService.formatPartLocationSummary(p)}>
                          <MapPin className="w-3 h-3 mr-1 text-slate-500 shrink-0" />
                          <span className="truncate">{storageService.formatPartLocationSummary(p)}</span>
                        </span>
                      </td>

                      {/* Unit */}
                      <td className="p-3 text-center font-medium text-slate-700">{p.unit}</td>

                      {/* Current Stock */}
                      <td
                        className={`p-3 text-right font-black text-sm ${
                          isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-slate-900'
                        }`}
                      >
                        {p.currentStock.toLocaleString('vi-VN')}
                      </td>

                      {/* FIFO Cont Breakdown */}
                      <td
                        className="p-3 text-left"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPartForFifo(p);
                        }}
                      >
                        {(() => {
                          const fifoLots = storageService.getPartFifoLots(p.id);
                          const fifoNext = fifoLots.find((l) => l.status === 'FIFO_NEXT');
                          const activeCount = fifoLots.filter((l) => l.remainingQty > 0).length;

                          if (p.currentStock === 0) {
                            return <span className="text-[11px] text-slate-400 italic">Hết tồn kho</span>;
                          }

                          if (fifoNext) {
                            const displayName = fifoNext.isInitialBaseline
                              ? fifoNext.contNumber
                              : `📍 ${fifoNext.locationName || 'Kệ kho'}`;

                            return (
                              <div className="space-y-1 group/fifo cursor-pointer" title="Bấm để xem chi tiết mốc Kệ (FIFO)">
                                <div className="inline-flex items-center px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg text-[11px] text-amber-950 font-bold transition-all shadow-2xs">
                                  <Zap className="w-3 h-3 mr-1 text-amber-600 shrink-0 animate-pulse" />
                                  <span className="truncate max-w-[120px]">{displayName}</span>:
                                  <span className="ml-1 text-amber-900 font-black">{fifoNext.remainingQty.toLocaleString('vi-VN')} {p.unit}</span>
                                </div>
                                {activeCount > 1 && (
                                  <p className="text-[10px] text-indigo-700 font-bold hover:underline block">
                                    + {activeCount - 1} mốc Kệ khác
                                  </p>
                                )}
                              </div>
                            );
                          }

                          return (
                            <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-md text-[11px] font-medium">
                              {p.currentStock.toLocaleString('vi-VN')} {p.unit} (1 mốc)
                            </span>
                          );
                        })()}
                      </td>


                      {/* Min Stock */}
                      <td className="p-3 text-right font-semibold text-slate-500">
                        {p.minStock.toLocaleString('vi-VN')}
                      </td>

                      {/* Status Badge */}
                      <td className="p-3 text-center">
                        {isOut ? (
                          <span className="inline-flex items-center px-2.5 py-1 bg-red-100 text-red-700 font-bold text-[11px] rounded-full">
                            <XCircle className="w-3 h-3 mr-1" />
                            Hết hàng
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center px-2.5 py-1 bg-amber-100 text-amber-800 font-bold text-[11px] rounded-full">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Sắp hết
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold text-[11px] rounded-full">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            An toàn
                          </span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="p-3 pr-5 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => setSelectedPartForFifo(p)}
                            className="p-1.5 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer"
                            title="Xem Quản Lý Tồn Mốc Cont (FIFO)"
                          >
                            <Layers className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedSinglePartForPrint(p);
                              setIsBatchPrintModalOpen(true);
                            }}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                            title="In Tem QR Dán Kệ (35x22mm)"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onOpenBinCard(p)}
                            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                            title="Xem Thẻ Kho Điện Tử"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onOpenEditModal(p)}
                            className="p-1.5 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                            title="Sửa Linh Kiện"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => onOpenDeleteModal(p)}
                              className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
                              title="Xóa Linh Kiện (Chỉ Quản trị viên)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
            <div>
              Hiển thị <strong>{(currentPage - 1) * pageSize + 1}</strong> -{' '}
              <strong>{Math.min(currentPage * pageSize, sortedParts.length)}</strong> trên{' '}
              <strong>{sortedParts.length}</strong> linh kiện
            </div>

            <div className="flex items-center space-x-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
                className="p-1.5 rounded-lg border border-slate-300 disabled:opacity-40 hover:bg-white cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 font-semibold text-slate-800">
                Trang {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
                className="p-1.5 rounded-lg border border-slate-300 disabled:opacity-40 hover:bg-white cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Batch Print QR Modal */}
      <BatchPrintQrModal
        isOpen={isBatchPrintModalOpen}
        onClose={() => {
          setIsBatchPrintModalOpen(false);
          setSelectedSinglePartForPrint(null);
        }}
        parts={selectedSinglePartForPrint ? [selectedSinglePartForPrint] : parts}
        settings={
          settings || {
            warehouseName: 'KHO LINH KIỆN',
            managerName: '',
            staffList: [],
            stockInReasons: [],
            stockOutPurposes: [],
            productionOrders: [],
          }
        }
      />

      {/* Container Import & QR Print Modal */}
      <ContainerImportPrintModal
        isOpen={isContModalOpen}
        onClose={() => setIsContModalOpen(false)}
        parts={parts}
        settings={
          settings || {
            companyName: 'CONG TY CP SUNHOUSE',
            warehouseName: 'KHO LINH KIỆN',
            address: '',
            managerName: '',
            phone: '',
            staffList: [],
            stockInReasons: [],
            stockOutPurposes: [],
            productionOrders: [],
          }
        }
        onRefreshParts={onRefreshParts}
      />

      {/* FIFO Detail Modal */}
      <FifoDetailModal
        isOpen={!!selectedPartForFifo}
        onClose={() => setSelectedPartForFifo(null)}
        part={selectedPartForFifo}
      />
    </div>
  );
};

