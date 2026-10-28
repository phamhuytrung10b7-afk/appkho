import React, { useState, useMemo, useRef } from 'react';
import { Part, Transaction, AppSettings, TransactionType } from './types';
import { storageService } from './storage';
import { SearchableSelect, SelectOption } from './SearchableSelect';
import {
  ShieldAlert,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Search,
  Filter,
  Package,
  Layers,
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  Trash2,
  ArrowRight,
  TrendingDown,
  Building2,
  AlertTriangle,
  History,
  CheckSquare,
  Square,
  HelpCircle,
  FileText,
  Truck,
  Flame,
  Check,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface NgWarehouseViewProps {
  parts: Part[];
  transactions: Transaction[];
  settings: AppSettings;
  onRefresh: () => void;
  onOpenBinCard?: (part: Part) => void;
}

export const NgWarehouseView: React.FC<NgWarehouseViewProps> = ({
  parts,
  transactions,
  settings,
  onRefresh,
  onOpenBinCard,
}) => {
  // Navigation sub-tabs
  const [activeTab, setActiveTab] = useState<'inventory' | 'history'>('inventory');

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<string>('ALL');
  const [historyReasonFilter, setHistoryReasonFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Selected parts in NG inventory table for bulk export
  const [selectedPartIds, setSelectedPartIds] = useState<Set<string>>(new Set());

  // Modals state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportPreselectedParts, setExportPreselectedParts] = useState<Array<{ part: Part; maxQty: number }>>([]);

  // Batch loading & feedback state
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchProgressText, setBatchProgressText] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. NG INVENTORY DATA (Chỉ hiển thị linh kiện có qtyNg > 0; khi qtyNg = 0 tự động biến mất)
  const ngInventoryList = useMemo(() => {
    return parts.filter((p) => {
      const ngStock = typeof p.qtyNg === 'number' ? p.qtyNg : Number((p as any).qty_ng || p.qtyNg) || 0;
      return ngStock > 0;
    });
  }, [parts]);

  // Filtered NG Inventory based on search
  const filteredNgInventory = useMemo(() => {
    if (!searchTerm.trim()) return ngInventoryList;
    const query = searchTerm.toLowerCase().trim();
    return ngInventoryList.filter(
      (p) =>
        p.code.toLowerCase().includes(query) ||
        p.name.toLowerCase().includes(query) ||
        (p.location && p.location.toLowerCase().includes(query))
    );
  }, [ngInventoryList, searchTerm]);

  // 2. NG TRANSACTIONS HISTORY (TRANSFER_TO_NG, IMPORT_NG, EXPORT_NG_RTV, EXPORT_NG_SCRAP)
  const ngTransactions = useMemo(() => {
    const ngTypes: TransactionType[] = ['TRANSFER_TO_NG', 'IMPORT_NG', 'EXPORT_NG_RTV', 'EXPORT_NG_SCRAP'];
    return transactions.filter((t) => ngTypes.includes(t.type));
  }, [transactions]);

  // Filtered History
  const filteredHistory = useMemo(() => {
    return ngTransactions.filter((t) => {
      // Type filter
      if (historyTypeFilter !== 'ALL' && t.type !== historyTypeFilter) return false;

      // Reason filter
      if (historyReasonFilter !== 'ALL') {
        const fullReason = (t.reasonOrPurpose || '') + ' ' + (t.ngReason || '');
        if (historyReasonFilter === 'VENDOR' && !fullReason.toLowerCase().includes('nhà cung cấp') && !fullReason.toLowerCase().includes('ncc')) {
          return false;
        }
        if (historyReasonFilter === 'INTERNAL' && !fullReason.toLowerCase().includes('nội bộ') && !fullReason.toLowerCase().includes('thao tác')) {
          return false;
        }
      }

      // Date range filter
      if (dateFrom && new Date(t.date) < new Date(dateFrom)) return false;
      if (dateTo && new Date(t.date) > new Date(dateTo + 'T23:59:59')) return false;

      // Search term filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchCode = t.partCode.toLowerCase().includes(query);
        const matchName = t.partName.toLowerCase().includes(query);
        const matchPerson = t.person?.toLowerCase().includes(query);
        const matchReason = t.reasonOrPurpose?.toLowerCase().includes(query);
        const matchNotes = t.notes?.toLowerCase().includes(query);
        if (!matchCode && !matchName && !matchPerson && !matchReason && !matchNotes) return false;
      }

      return true;
    });
  }, [ngTransactions, historyTypeFilter, historyReasonFilter, dateFrom, dateTo, searchTerm]);

  // Overall Statistics
  const stats = useMemo(() => {
    const totalNgQuantity = ngInventoryList.reduce((sum, p) => sum + (p.qtyNg || 0), 0);
    const totalNgSkus = ngInventoryList.length;

    let totalRtvQty = 0;
    let totalScrapQty = 0;
    let totalImportedNgQty = 0;

    ngTransactions.forEach((t) => {
      if (t.type === 'EXPORT_NG_RTV') totalRtvQty += t.quantity;
      if (t.type === 'EXPORT_NG_SCRAP') totalScrapQty += t.quantity;
      if (t.type === 'TRANSFER_TO_NG' || t.type === 'IMPORT_NG') totalImportedNgQty += t.quantity;
    });

    return {
      totalNgQuantity,
      totalNgSkus,
      totalRtvQty,
      totalScrapQty,
      totalImportedNgQty,
    };
  }, [ngInventoryList, ngTransactions]);

  // Multi-select handlers
  const handleToggleSelectAll = () => {
    if (selectedPartIds.size === filteredNgInventory.length && filteredNgInventory.length > 0) {
      setSelectedPartIds(new Set());
    } else {
      setSelectedPartIds(new Set(filteredNgInventory.map((p) => p.id)));
    }
  };

  const handleToggleSelectPart = (id: string) => {
    const next = new Set(selectedPartIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedPartIds(next);
  };

  // Open Export Modal for selected items
  const handleOpenExportForSelected = () => {
    const selectedPartsList = parts
      .filter((p) => selectedPartIds.has(p.id) && (p.qtyNg || 0) > 0)
      .map((p) => ({ part: p, maxQty: p.qtyNg || 0 }));

    if (selectedPartsList.length === 0) {
      alert('Vui lòng chọn ít nhất một linh kiện có tồn lỗi > 0 để xuất kho!');
      return;
    }

    setExportPreselectedParts(selectedPartsList);
    setIsExportModalOpen(true);
  };

  // Quick export single row
  const handleQuickExportSingle = (part: Part) => {
    setExportPreselectedParts([{ part, maxQty: part.qtyNg || 0 }]);
    setIsExportModalOpen(true);
  };

  // Export NG History to Excel
  const handleExportHistoryExcel = () => {
    if (filteredHistory.length === 0) {
      alert('Không có dữ liệu lịch sử Kho NG để xuất!');
      return;
    }

    const data = filteredHistory.map((t, index) => {
      let typeLabel = 'Nhập Kho NG';
      if (t.type === 'TRANSFER_TO_NG') typeLabel = 'Chuyển Kho Chính -> Kho NG';
      if (t.type === 'IMPORT_NG') typeLabel = 'Nhập Trực Tiếp Kho NG';
      if (t.type === 'EXPORT_NG_RTV') typeLabel = 'Xuất Trả Nhà Cung Cấp (RTV)';
      if (t.type === 'EXPORT_NG_SCRAP') typeLabel = 'Xuất Hủy Phế Phẩm (Scrap)';

      return {
        'STT': index + 1,
        'Thời Gian': new Date(t.date).toLocaleString('vi-VN'),
        'Loại Giao Dịch': typeLabel,
        'Mã Linh Kiện': t.partCode,
        'Tên Linh Kiện': t.partName,
        'Đơn Vị Tính': t.unit,
        'Số Lượng': t.quantity,
        'Tồn Kho Chính Trước': t.stockBefore,
        'Tồn Kho Chính Sau': t.stockAfter,
        'Tồn Kho NG Trước': t.ngStockBefore ?? '',
        'Tồn Kho NG Sau': t.ngStockAfter ?? '',
        'Lý Do Lỗi / Diễn Giải': t.reasonOrPurpose || t.ngReason || '',
        'Người Thực Hiện': t.person,
        'Ghi Chú': t.notes || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lich_Su_Kho_NG');
    const fileName = `Lich_Su_Kho_NG_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Export current NG Inventory to Excel
  const handleExportInventoryExcel = () => {
    if (ngInventoryList.length === 0) {
      alert('Kho NG hiện tại đang trống (0 hàng lỗi)!');
      return;
    }

    const data = ngInventoryList.map((p, index) => ({
      'STT': index + 1,
      'Mã Linh Kiện': p.code,
      'Tên Linh Kiện': p.name,
      'Đơn Vị Tính': p.unit,
      'Số Lượng Tồn Kho NG': p.qtyNg || 0,
      'Tồn Kho Chính': p.currentStock || 0,
      'Vị Trí Kho Chính': p.location || '',
      'Cập Nhật Cuối': p.updatedAt ? new Date(p.updatedAt).toLocaleString('vi-VN') : '',
      'Ghi Chú': p.note || p.description || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ton_Kho_NG');
    const fileName = `Ton_Kho_NG_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-rose-900 via-red-900 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-rose-800/60 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-6 opacity-10 pointer-events-none">
          <ShieldAlert className="w-64 h-64 text-white" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3.5 bg-rose-500/30 text-rose-300 rounded-2xl border border-rose-400/40 shadow-inner">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 bg-rose-500 text-white text-[11px] font-black rounded-md tracking-wider uppercase shadow-xs">
                  Kho Hàng Lỗi & Phế Phẩm
                </span>
                <span className="text-xs text-rose-300 font-medium">Batch Processing • Không Realtime</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white mt-1">
                KHO NG (DEFECTIVE WAREHOUSE)
              </h1>
              <p className="text-xs text-rose-200/90 mt-0.5">
                Theo dõi số lượng lỗi thực tế tách biệt hoàn toàn với Kho Chính. Xuất hết (tồn NG = 0) tự động ẩn khỏi danh sách.
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            <button
              onClick={() => onRefresh()}
              className="px-3.5 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs border border-slate-700 flex items-center space-x-2 transition-all cursor-pointer shadow-sm"
              title="Tải lại dữ liệu mới nhất từ Supabase"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tải Lại Dữ Liệu</span>
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-extrabold text-xs flex items-center space-x-2 shadow-lg hover:shadow-emerald-900/30 transition-all cursor-pointer"
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>Nhập Kho NG</span>
            </button>

            <button
              onClick={() => {
                if (selectedPartIds.size > 0) {
                  handleOpenExportForSelected();
                } else {
                  setExportPreselectedParts([]);
                  setIsExportModalOpen(true);
                }
              }}
              className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-xl font-extrabold text-xs flex items-center space-x-2 shadow-lg hover:shadow-rose-900/30 transition-all cursor-pointer"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Xuất Kho NG (RTV / Hủy)</span>
            </button>
          </div>
        </div>

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-rose-800/50">
          <div className="bg-slate-900/60 backdrop-blur-xs p-3.5 rounded-xl border border-rose-700/30">
            <div className="text-[11px] font-bold text-rose-300 uppercase tracking-wider flex items-center justify-between">
              <span>Tổng Tồn Kho NG</span>
              <Layers className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-black text-white mt-1">
              {stats.totalNgQuantity.toLocaleString('vi-VN')}
            </div>
            <div className="text-[11px] text-rose-200/70 mt-0.5">Số lượng linh kiện lỗi hiện có</div>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xs p-3.5 rounded-xl border border-rose-700/30">
            <div className="text-[11px] font-bold text-rose-300 uppercase tracking-wider flex items-center justify-between">
              <span>Mặt Hàng (SKU) Lỗi</span>
              <Package className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-300 mt-1">
              {stats.totalNgSkus} <span className="text-xs font-normal text-rose-200">mã</span>
            </div>
            <div className="text-[11px] text-rose-200/70 mt-0.5">Có số lượng lỗi &gt; 0</div>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xs p-3.5 rounded-xl border border-rose-700/30">
            <div className="text-[11px] font-bold text-rose-300 uppercase tracking-wider flex items-center justify-between">
              <span>Đã Xuất Trả NCC</span>
              <Truck className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-2xl font-black text-sky-300 mt-1">
              {stats.totalRtvQty.toLocaleString('vi-VN')}
            </div>
            <div className="text-[11px] text-rose-200/70 mt-0.5">Return To Vendor (RTV)</div>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xs p-3.5 rounded-xl border border-rose-700/30">
            <div className="text-[11px] font-bold text-rose-300 uppercase tracking-wider flex items-center justify-between">
              <span>Đã Xuất Tiêu Hủy</span>
              <Flame className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-black text-rose-300 mt-1">
              {stats.totalScrapQty.toLocaleString('vi-VN')}
            </div>
            <div className="text-[11px] text-rose-200/70 mt-0.5">Xuất hủy phế phẩm (Scrap)</div>
          </div>
        </div>
      </div>

      {/* Feedback banner if any */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-xl text-sm font-bold flex items-center justify-between shadow-md ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-rose-50 text-rose-900 border border-rose-200'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="p-1 hover:bg-slate-200/50 rounded-lg cursor-pointer text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 pt-4 bg-slate-50/70">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-5 py-3 font-extrabold text-sm rounded-t-xl transition-all flex items-center space-x-2 border-b-2 cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-white text-rose-700 border-rose-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 border-transparent hover:bg-slate-100/50'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>TỒN KHO NG HIỆN TẠI</span>
              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full text-xs font-black">
                {ngInventoryList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-5 py-3 font-extrabold text-sm rounded-t-xl transition-all flex items-center space-x-2 border-b-2 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-white text-indigo-700 border-indigo-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 border-transparent hover:bg-slate-100/50'
              }`}
            >
              <History className="w-4 h-4" />
              <span>LỊCH SỬ KHO NG</span>
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full text-xs font-black">
                {ngTransactions.length}
              </span>
            </button>
          </div>

          <div className="pb-3 flex items-center space-x-2">
            {activeTab === 'inventory' ? (
              <button
                onClick={handleExportInventoryExcel}
                className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200 flex items-center space-x-1.5 cursor-pointer transition-all"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Xuất Excel Tồn NG</span>
              </button>
            ) : (
              <button
                onClick={handleExportHistoryExcel}
                className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200 flex items-center space-x-1.5 cursor-pointer transition-all"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Xuất Excel Lịch Sử</span>
              </button>
            )}
          </div>
        </div>

        {/* TAB 1: TỒN KHO NG HIỆN TẠI */}
        {activeTab === 'inventory' && (
          <div className="p-6 space-y-4">
            {/* Search Bar & Multi-Select Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm kiếm mã linh kiện, tên linh kiện lỗi..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>

              {selectedPartIds.size > 0 && (
                <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 px-3.5 py-1.5 rounded-xl text-xs text-rose-900 font-bold animate-in fade-in">
                  <span>Đã chọn {selectedPartIds.size} linh kiện lỗi</span>
                  <button
                    onClick={handleOpenExportForSelected}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-extrabold shadow-sm cursor-pointer"
                  >
                    Xuất Kho Các Mục Này
                  </button>
                  <button
                    onClick={() => setSelectedPartIds(new Set())}
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Bỏ chọn"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Inventory Table */}
            {filteredNgInventory.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-200">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl mx-auto flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="font-extrabold text-slate-800 text-base">
                  {searchTerm ? 'Không tìm thấy linh kiện lỗi phù hợp' : 'Hiện tại Kho NG không có hàng lỗi!'}
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  {searchTerm
                    ? 'Thử đổi từ khóa tìm kiếm hoặc bấm Xóa bộ lọc.'
                    : 'Toàn bộ linh kiện lỗi đã được xuất trả NCC hoặc tiêu hủy hết (qty_ng = 0), danh sách tự động làm sạch.'}
                </p>
                {!searchTerm && (
                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="mt-4 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer inline-flex items-center space-x-2 shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nhập Hàng Lỗi Vào Kho NG</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-black tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <button
                          onClick={handleToggleSelectAll}
                          className="text-slate-500 hover:text-rose-600 cursor-pointer"
                          title="Chọn tất cả"
                        >
                          {selectedPartIds.size === filteredNgInventory.length && filteredNgInventory.length > 0 ? (
                            <CheckSquare className="w-4 h-4 text-rose-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="p-3">Mã Linh Kiện</th>
                      <th className="p-3">Tên Linh Kiện</th>
                      <th className="p-3 text-center">ĐVT</th>
                      <th className="p-3 text-right">Tồn Kho Chính</th>
                      <th className="p-3 text-right bg-rose-50 text-rose-900 border-l border-r border-rose-100">
                        Số Lượng Lỗi (NG)
                      </th>
                      <th className="p-3">Vị Trí Kho Chính</th>
                      <th className="p-3">Lần Cập Nhật Cuối</th>
                      <th className="p-3 text-center">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredNgInventory.map((part) => {
                      const isSelected = selectedPartIds.has(part.id);
                      const qtyNg = part.qtyNg || 0;

                      return (
                        <tr
                          key={part.id}
                          className={`hover:bg-rose-50/40 transition-colors ${
                            isSelected ? 'bg-rose-50/70' : ''
                          }`}
                        >
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleToggleSelectPart(part.id)}
                              className="text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-rose-600" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="p-3">
                            <span className="font-mono font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                              {part.code}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-slate-900 max-w-xs truncate" title={part.name}>
                            {part.name}
                          </td>
                          <td className="p-3 text-center font-bold text-slate-600">
                            {part.unit}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-600">
                            {part.currentStock.toLocaleString('vi-VN')}
                          </td>
                          <td className="p-3 text-right font-mono font-black text-sm bg-rose-50/60 text-rose-700 border-l border-r border-rose-100">
                            <span className="px-2.5 py-1 bg-rose-600 text-white rounded-lg shadow-2xs">
                              {qtyNg.toLocaleString('vi-VN')}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500 text-[11px] font-medium max-w-[150px] truncate" title={part.location}>
                            {part.location || 'Kho chính'}
                          </td>
                          <td className="p-3 text-slate-400 text-[11px]">
                            {part.updatedAt ? new Date(part.updatedAt).toLocaleString('vi-VN') : '—'}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center space-x-1.5">
                              <button
                                onClick={() => handleQuickExportSingle(part)}
                                className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-[11px] font-bold cursor-pointer transition-colors flex items-center space-x-1"
                                title="Xuất kho hàng lỗi này"
                              >
                                <ArrowUpRight className="w-3 h-3 text-rose-600" />
                                <span>Xuất NG</span>
                              </button>

                              {onOpenBinCard && (
                                <button
                                  onClick={() => onOpenBinCard(part)}
                                  className="p-1 hover:bg-slate-200 text-slate-500 rounded-lg cursor-pointer"
                                  title="Xem thẻ kho chi tiết"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LỊCH SỬ KHO NG */}
        {activeTab === 'history' && (
          <div className="p-6 space-y-4">
            {/* Filter controls */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase mb-1">
                  Loại Giao Dịch
                </label>
                <select
                  value={historyTypeFilter}
                  onChange={(e) => setHistoryTypeFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="ALL">Tất cả loại giao dịch</option>
                  <option value="TRANSFER_TO_NG">Chuyển từ Kho chính sang NG</option>
                  <option value="IMPORT_NG">Nhập trực tiếp Kho NG</option>
                  <option value="EXPORT_NG_RTV">Xuất trả Nhà Cung Cấp (RTV)</option>
                  <option value="EXPORT_NG_SCRAP">Xuất hủy phế phẩm (Scrap)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase mb-1">
                  Phân Loại Lý Do
                </label>
                <select
                  value={historyReasonFilter}
                  onChange={(e) => setHistoryReasonFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="ALL">Tất cả lý do lỗi</option>
                  <option value="VENDOR">Lỗi do Nhà Cung Cấp</option>
                  <option value="INTERNAL">Lỗi do Thao Tác Nội Bộ</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase mb-1">
                  Từ Ngày
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase mb-1">
                  Đến Ngày
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* History Table */}
            {filteredHistory.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-200">
                <History className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                <h3 className="font-extrabold text-slate-800 text-sm">Chưa có giao dịch Kho NG nào</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Các giao dịch Chuyển kho NG, Nhập trực tiếp NG, Xuất trả NCC hoặc Tiêu hủy sẽ được ghi lại ở đây.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-black tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-3">Thời Gian</th>
                      <th className="p-3">Loại Giao Dịch</th>
                      <th className="p-3">Mã Linh Kiện</th>
                      <th className="p-3">Tên Linh Kiện</th>
                      <th className="p-3 text-center">ĐVT</th>
                      <th className="p-3 text-right">Số Lượng</th>
                      <th className="p-3 text-right">Tồn NG Trước -&gt; Sau</th>
                      <th className="p-3">Lý Do Lỗi / Mục Đích</th>
                      <th className="p-3">Người Thực Hiện</th>
                      <th className="p-3">Ghi Chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredHistory.map((tx) => {
                      let typeBadge = (
                        <span className="px-2 py-0.5 rounded-md font-extrabold text-[10px] bg-slate-100 text-slate-700">
                          {tx.type}
                        </span>
                      );

                      if (tx.type === 'TRANSFER_TO_NG') {
                        typeBadge = (
                          <span className="px-2 py-0.5 rounded-md font-extrabold text-[10px] bg-purple-100 text-purple-800 border border-purple-200 flex items-center space-x-1 w-fit">
                            <Layers className="w-3 h-3" />
                            <span>Kho Chính ➔ NG</span>
                          </span>
                        );
                      } else if (tx.type === 'IMPORT_NG') {
                        typeBadge = (
                          <span className="px-2 py-0.5 rounded-md font-extrabold text-[10px] bg-amber-100 text-amber-800 border border-amber-200 flex items-center space-x-1 w-fit">
                            <ArrowDownLeft className="w-3 h-3" />
                            <span>Nhập Trực Tiếp NG</span>
                          </span>
                        );
                      } else if (tx.type === 'EXPORT_NG_RTV') {
                        typeBadge = (
                          <span className="px-2 py-0.5 rounded-md font-extrabold text-[10px] bg-sky-100 text-sky-800 border border-sky-200 flex items-center space-x-1 w-fit">
                            <Truck className="w-3 h-3" />
                            <span>Trả NCC (RTV)</span>
                          </span>
                        );
                      } else if (tx.type === 'EXPORT_NG_SCRAP') {
                        typeBadge = (
                          <span className="px-2 py-0.5 rounded-md font-extrabold text-[10px] bg-rose-100 text-rose-800 border border-rose-200 flex items-center space-x-1 w-fit">
                            <Flame className="w-3 h-3" />
                            <span>Xuất Hủy (Scrap)</span>
                          </span>
                        );
                      }

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-[11px] text-slate-500 whitespace-nowrap">
                            {new Date(tx.date).toLocaleString('vi-VN')}
                          </td>
                          <td className="p-3">{typeBadge}</td>
                          <td className="p-3 font-mono font-extrabold text-slate-900">
                            {tx.partCode}
                          </td>
                          <td className="p-3 font-medium text-slate-800 max-w-xs truncate" title={tx.partName}>
                            {tx.partName}
                          </td>
                          <td className="p-3 text-center font-bold text-slate-500">
                            {tx.unit}
                          </td>
                          <td className="p-3 text-right font-mono font-black text-rose-700">
                            {tx.quantity.toLocaleString('vi-VN')}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-600 text-[11px]">
                            {tx.ngStockBefore !== undefined && tx.ngStockAfter !== undefined ? (
                              <span>
                                {tx.ngStockBefore} ➔ <b className="text-slate-900">{tx.ngStockAfter}</b>
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="p-3 font-medium text-slate-700 text-[11px] max-w-xs">
                            {tx.reasonOrPurpose || tx.ngReason || '—'}
                          </td>
                          <td className="p-3 text-slate-700 font-bold text-[11px]">
                            {tx.person}
                          </td>
                          <td className="p-3 text-slate-400 text-[11px] max-w-[120px] truncate" title={tx.notes}>
                            {tx.notes || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: NHẬP KHO NG */}
      {isImportModalOpen && (
        <NgImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          parts={parts}
          settings={settings}
          onSuccess={() => {
            setIsImportModalOpen(false);
            setFeedbackMessage({ type: 'success', text: 'Nhập Kho NG thành công qua Batch Processing!' });
            onRefresh();
          }}
        />
      )}

      {/* MODAL 2: XUẤT KHO NG */}
      {isExportModalOpen && (
        <NgExportModal
          isOpen={isExportModalOpen}
          onClose={() => {
            setIsExportModalOpen(false);
            setExportPreselectedParts([]);
          }}
          ngInventoryList={ngInventoryList}
          preselectedParts={exportPreselectedParts}
          settings={settings}
          onSuccess={() => {
            setIsExportModalOpen(false);
            setSelectedPartIds(new Set());
            setExportPreselectedParts([]);
            setFeedbackMessage({ type: 'success', text: 'Xuất Kho NG thành công qua Batch Processing!' });
            onRefresh();
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// SUB-MODAL 1: NHẬP KHO NG (Chuyển từ Kho chính OR Nhập trực tiếp thủ công/Excel)
// ============================================================================
interface NgImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  parts: Part[];
  settings: AppSettings;
  onSuccess: () => void;
}

const NgImportModal: React.FC<NgImportModalProps> = ({
  isOpen,
  onClose,
  parts,
  settings,
  onSuccess,
}) => {
  const [importMode, setImportMode] = useState<'transfer' | 'direct'>('transfer');
  const [directSubMode, setDirectSubMode] = useState<'manual' | 'excel'>('manual');

  // Form states for Transfer from Main to NG
  const [transferPartCode, setTransferPartCode] = useState('');
  const [transferQuantity, setTransferQuantity] = useState<number | ''>('');
  const [transferReason, setTransferReason] = useState('Do Nhà Cung Cấp');
  const [transferCustomReason, setTransferCustomReason] = useState('');
  const [transferPerson, setTransferPerson] = useState(settings.staffList?.[0] || 'Thủ kho');
  const [transferNotes, setTransferNotes] = useState('');

  // Pending queue for multi-item transfer
  const [pendingTransfers, setPendingTransfers] = useState<
    Array<{
      part: Part;
      quantity: number;
      reason: string;
      notes: string;
    }>
  >([]);

  // Direct Manual Import
  const [directPartCode, setDirectPartCode] = useState('');
  const [directQuantity, setDirectQuantity] = useState<number | ''>('');
  const [directReason, setDirectReason] = useState('Do Nhà Cung Cấp');
  const [directCustomReason, setDirectCustomReason] = useState('');
  const [directPerson, setDirectPerson] = useState(settings.staffList?.[0] || 'Thủ kho');
  const [directNotes, setDirectNotes] = useState('');

  // Direct Excel Import
  const [excelRows, setExcelRows] = useState<
    Array<{
      partCode: string;
      partName: string;
      quantity: number;
      reason: string;
      notes: string;
      valid: boolean;
      errorMsg?: string;
    }>
  >([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-computed Smart Fuzzy Search options for Transfer from Main Warehouse
  const transferPartOptions: SelectOption[] = useMemo(() => {
    return parts.map((p) => ({
      value: p.code,
      label: `[${p.code}] ${p.name}`,
      sublabel: `Tồn kho chính: ${p.currentStock.toLocaleString('vi-VN')} ${p.unit} ${p.location ? `| Vị trí: ${p.location}` : ''}`,
      badge: `Tồn chính: ${p.currentStock} ${p.unit}`,
    }));
  }, [parts]);

  // Pre-computed Smart Fuzzy Search options for Direct NG Import
  const directPartOptions: SelectOption[] = useMemo(() => {
    return parts.map((p) => ({
      value: p.code,
      label: `[${p.code}] ${p.name}`,
      sublabel: `Tồn NG hiện tại: ${(p.qtyNg || 0).toLocaleString('vi-VN')} ${p.unit} | Tồn chính: ${p.currentStock.toLocaleString('vi-VN')} ${p.unit}`,
      badge: `Tồn NG: ${p.qtyNg || 0} ${p.unit}`,
    }));
  }, [parts]);

  if (!isOpen) return null;

  // Selected Part for Transfer
  const selectedTransferPart = parts.find((p) => p.code === transferPartCode);
  const selectedDirectPart = parts.find((p) => p.code === directPartCode);

  // Add to Pending Transfer list
  const handleAddPendingTransfer = () => {
    setErrorText('');
    if (!selectedTransferPart) {
      setErrorText('Vui lòng chọn linh kiện từ Kho Chính!');
      return;
    }
    const qty = Number(transferQuantity);
    if (!qty || qty <= 0) {
      setErrorText('Số lượng chuyển phải lớn hơn 0!');
      return;
    }

    // Check available stock in Main warehouse
    const alreadyAllocated = pendingTransfers
      .filter((t) => t.part.id === selectedTransferPart.id)
      .reduce((sum, t) => sum + t.quantity, 0);

    if (qty + alreadyAllocated > selectedTransferPart.currentStock) {
      setErrorText(
        `Số lượng chuyển (${qty + alreadyAllocated}) vượt quá tồn kho chính hiện có (${selectedTransferPart.currentStock})!`
      );
      return;
    }

    const finalReason = transferReason === 'KHAC' ? transferCustomReason.trim() : transferReason;
    if (!finalReason) {
      setErrorText('Vui lòng chọn hoặc nhập Lý do lỗi!');
      return;
    }

    setPendingTransfers((prev) => [
      ...prev,
      {
        part: selectedTransferPart,
        quantity: qty,
        reason: finalReason,
        notes: transferNotes.trim(),
      },
    ]);

    // Reset inputs
    setTransferQuantity('');
    setTransferNotes('');
  };

  // Submit All Transfers in 1 Atomic Batch
  const handleSubmitTransferBatch = async () => {
    setErrorText('');
    if (pendingTransfers.length === 0) {
      setErrorText('Vui lòng thêm ít nhất 1 linh kiện vào danh sách chuyển!');
      return;
    }

    setIsSubmitting(true);
    try {
      const partsToUpdate: Part[] = [];
      const transactionsToInsert: Transaction[] = [];

      // Group transfers by part
      const transferByPartId = new Map<string, number>();
      pendingTransfers.forEach((item) => {
        const cur = transferByPartId.get(item.part.id) || 0;
        transferByPartId.set(item.part.id, cur + item.quantity);
      });

      // Prepare updated parts
      transferByPartId.forEach((totalTransferQty, partId) => {
        const part = parts.find((p) => p.id === partId);
        if (!part) return;

        const oldCurrentStock = part.currentStock || 0;
        const oldQtyNg = part.qtyNg || 0;

        const newCurrentStock = Math.max(0, oldCurrentStock - totalTransferQty);
        const newQtyNg = oldQtyNg + totalTransferQty;

        // Deduct from shelf locations
        const locs = storageService.getPartLocations(part);
        let rem = totalTransferQty;
        for (const loc of locs) {
          if (loc.quantity > 0) {
            const dec = Math.min(loc.quantity, rem);
            loc.quantity -= dec;
            rem -= dec;
            if (rem <= 0) break;
          }
        }
        const activeLocs = locs.filter((l) => l.quantity > 0);

        partsToUpdate.push({
          ...part,
          currentStock: newCurrentStock,
          qtyNg: newQtyNg,
          locations: activeLocs,
          location: storageService.formatPartLocationSummary(activeLocs),
          updatedAt: new Date().toISOString(),
        });
      });

      // Prepare transactions
      pendingTransfers.forEach((item) => {
        const p = item.part;
        const currentStock = p.currentStock || 0;
        const currentQtyNg = p.qtyNg || 0;

        const activeLocs = storageService.getPartLocations(p);
        const sourceLoc = activeLocs[0]?.locationName || p.location?.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính';

        transactionsToInsert.push({
          id: 'tx-ng-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
          partId: p.id,
          partCode: p.code,
          partName: p.name,
          unit: p.unit,
          type: 'TRANSFER_TO_NG',
          quantity: item.quantity,
          date: new Date().toISOString(),
          person: transferPerson,
          reasonOrPurpose: `Chuyển Kho NG: ${item.reason}`,
          ngReason: item.reason,
          notes: item.notes || `Chuyển ${item.quantity} ${p.unit} từ Kho Chính sang Kho NG`,
          locationId: sourceLoc,
          stockBefore: currentStock,
          stockAfter: Math.max(0, currentStock - item.quantity),
          ngStockBefore: currentQtyNg,
          ngStockAfter: currentQtyNg + item.quantity,
        });
      });

      // 1 Lệnh duy nhất lên Supabase (Batch Processing)
      await storageService.batchExecuteNgTransaction({
        partsToUpdate,
        transactionsToInsert,
      });

      onSuccess();
    } catch (err: any) {
      setErrorText('Lỗi khi lưu Batch chuyển kho NG: ' + (err.message || 'Lỗi không xác định'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Direct Manual Import in 1 Atomic Batch
  const handleSubmitDirectManual = async () => {
    setErrorText('');
    if (!selectedDirectPart) {
      setErrorText('Vui lòng chọn linh kiện cần nhập lỗi!');
      return;
    }
    const qty = Number(directQuantity);
    if (!qty || qty <= 0) {
      setErrorText('Số lượng nhập phải lớn hơn 0!');
      return;
    }
    const finalReason = directReason === 'KHAC' ? directCustomReason.trim() : directReason;
    if (!finalReason) {
      setErrorText('Vui lòng chọn hoặc nhập Lý do lỗi!');
      return;
    }

    setIsSubmitting(true);
    try {
      const oldQtyNg = selectedDirectPart.qtyNg || 0;
      const newQtyNg = oldQtyNg + qty;

      const updatedPart: Part = {
        ...selectedDirectPart,
        qtyNg: newQtyNg,
        updatedAt: new Date().toISOString(),
      };

      const newTx: Transaction = {
        id: 'tx-ng-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        partId: selectedDirectPart.id,
        partCode: selectedDirectPart.code,
        partName: selectedDirectPart.name,
        unit: selectedDirectPart.unit,
        type: 'IMPORT_NG',
        quantity: qty,
        date: new Date().toISOString(),
        person: directPerson,
        reasonOrPurpose: finalReason,
        ngReason: finalReason,
        notes: directNotes || `Nhập trực tiếp ${qty} ${selectedDirectPart.unit} vào Kho NG`,
        stockBefore: selectedDirectPart.currentStock,
        stockAfter: selectedDirectPart.currentStock, // Không đổi tồn kho chính
        ngStockBefore: oldQtyNg,
        ngStockAfter: newQtyNg,
      };

      // 1 Lệnh duy nhất
      await storageService.batchExecuteNgTransaction({
        partsToUpdate: [updatedPart],
        transactionsToInsert: [newTx],
      });

      onSuccess();
    } catch (err: any) {
      setErrorText('Lỗi khi nhập trực tiếp kho NG: ' + (err.message || 'Lỗi không xác định'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Parse Excel File for Direct Import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorText('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws);

        if (!rawJson || rawJson.length === 0) {
          setErrorText('File Excel không có dữ liệu!');
          return;
        }

        const rows = rawJson.map((r, idx) => {
          const code = String(r['Mã Linh Kiện'] || r['Ma_Linh_Kien'] || r['Mã LK'] || r['PartCode'] || '').trim();
          const qty = parseFloat(String(r['Số Lượng'] || r['So_Luong'] || r['Quantity'] || '0').replace(/,/g, ''));
          const reason = String(r['Lý Do Lỗi'] || r['Ly_Do_Loi'] || r['Lý Do'] || 'Do Nhà Cung Cấp').trim();
          const notes = String(r['Ghi Chú'] || r['Ghi_Chu'] || r['Notes'] || '').trim();

          const part = parts.find((p) => p.code.toLowerCase() === code.toLowerCase());

          if (!code) {
            return { partCode: code, partName: '', quantity: 0, reason, notes, valid: false, errorMsg: 'Thiếu mã linh kiện' };
          }
          if (!part) {
            return { partCode: code, partName: 'Chưa có trong danh mục kho', quantity: qty, reason, notes, valid: false, errorMsg: 'Mã không tồn tại trong hệ thống' };
          }
          if (isNaN(qty) || qty <= 0) {
            return { partCode: code, partName: part.name, quantity: 0, reason, notes, valid: false, errorMsg: 'Số lượng phải > 0' };
          }

          return {
            partCode: part.code,
            partName: part.name,
            quantity: qty,
            reason: reason || 'Do Nhà Cung Cấp',
            notes,
            valid: true,
          };
        });

        setExcelRows(rows);
      } catch (err: any) {
        setErrorText('Lỗi khi đọc file Excel: ' + (err.message || 'File không đúng định dạng'));
      }
    };
    reader.readAsBinaryString(file);
  };

  // Submit Excel Batch Direct Import
  const handleSubmitExcelBatch = async () => {
    setErrorText('');
    const validRows = excelRows.filter((r) => r.valid);
    if (validRows.length === 0) {
      setErrorText('Không có dòng hợp lệ nào để nhập!');
      return;
    }

    setIsSubmitting(true);
    try {
      const partsToUpdateMap = new Map<string, Part>();
      const transactionsToInsert: Transaction[] = [];

      for (const row of validRows) {
        const part = parts.find((p) => p.code === row.partCode);
        if (!part) continue;

        const currentPart = partsToUpdateMap.get(part.id) || { ...part };
        const oldQtyNg = currentPart.qtyNg || 0;
        const newQtyNg = oldQtyNg + row.quantity;

        currentPart.qtyNg = newQtyNg;
        currentPart.updatedAt = new Date().toISOString();
        partsToUpdateMap.set(part.id, currentPart);

        transactionsToInsert.push({
          id: 'tx-ng-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
          partId: part.id,
          partCode: part.code,
          partName: part.name,
          unit: part.unit,
          type: 'IMPORT_NG',
          quantity: row.quantity,
          date: new Date().toISOString(),
          person: directPerson,
          reasonOrPurpose: row.reason,
          ngReason: row.reason,
          notes: row.notes || 'Nhập từ file Excel',
          stockBefore: part.currentStock,
          stockAfter: part.currentStock,
          ngStockBefore: oldQtyNg,
          ngStockAfter: newQtyNg,
        });
      }

      // 1 Lệnh duy nhất lên Supabase
      await storageService.batchExecuteNgTransaction({
        partsToUpdate: Array.from(partsToUpdateMap.values()),
        transactionsToInsert,
      });

      onSuccess();
    } catch (err: any) {
      setErrorText('Lỗi khi lưu Batch Excel Kho NG: ' + (err.message || 'Lỗi không xác định'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Download Sample Excel Template for Import NG
  const handleDownloadSampleExcel = () => {
    const sample = [
      {
        'Mã Linh Kiện': parts[0]?.code || '04-29-00-SHA76219CK-0002',
        'Số Lượng': 10,
        'Lý Do Lỗi': 'Do Nhà Cung Cấp',
        'Ghi Chú': 'Lỗi hỏng ren nối nhanh',
      },
      {
        'Mã Linh Kiện': parts[1]?.code || '04-28-03-BRA590N-0006',
        'Số Lượng': 5,
        'Lý Do Lỗi': 'Do Thao Tác Nội Bộ',
        'Ghi Chú': 'Móp bình khi di chuyển pallet',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mau_Nhap_Kho_NG');
    XLSX.writeFile(wb, 'Mau_Nhap_Kho_NG_Template.xlsx');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8 border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-rose-950 text-white px-6 py-4 flex items-center justify-between border-b border-rose-900">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-rose-500/30 text-rose-300 rounded-xl">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">NHẬP KHO NG (HÀNG LỖI)</h3>
              <p className="text-xs text-rose-300">
                Chuyển từ Kho chính hoặc Nhập lỗi trực tiếp qua Excel / Thủ công
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switch Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3">
          <button
            onClick={() => setImportMode('transfer')}
            className={`px-5 py-2.5 font-black text-xs rounded-t-xl transition-all border-b-2 cursor-pointer flex items-center space-x-2 ${
              importMode === 'transfer'
                ? 'bg-white text-rose-700 border-rose-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>TAB 1: CHUYỂN TỪ KHO CHÍNH SANG KHO NG</span>
          </button>
          <button
            onClick={() => setImportMode('direct')}
            className={`px-5 py-2.5 font-black text-xs rounded-t-xl transition-all border-b-2 cursor-pointer flex items-center space-x-2 ${
              importMode === 'direct'
                ? 'bg-white text-rose-700 border-rose-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>TAB 2: NHẬP TRỰC TIẾP KHO NG (THỦ CÔNG / EXCEL)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {errorText && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorText}</span>
            </div>
          )}

          {/* TAB 1: TRANSFER FROM MAIN TO NG */}
          {importMode === 'transfer' && (
            <div className="space-y-4">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 font-medium">
                💡 <b>Cơ chế chuyển kho:</b> Số lượng chuyển sẽ được <b>Trừ tồn Kho Chính</b> và <b>Cộng dồn vào Tồn Kho NG</b> của linh kiện đó.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <SearchableSelect
                    label="Chọn Linh Kiện Từ Kho Chính"
                    required
                    options={transferPartOptions}
                    value={transferPartCode}
                    onChange={(val) => setTransferPartCode(val)}
                    placeholder="— Gõ mã, tên linh kiện, vị trí kho để tìm kiếm thông minh —"
                    allowCustom={false}
                    icon={<Search className="w-4 h-4 text-rose-500" />}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Số Lượng Chuyển Sang NG <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max={selectedTransferPart?.currentStock || 999999}
                      placeholder="Nhập số lượng..."
                      value={transferQuantity}
                      onChange={(e) =>
                        setTransferQuantity(e.target.value === '' ? '' : parseFloat(e.target.value))
                      }
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                    />
                    {selectedTransferPart && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        / Tồn: {selectedTransferPart.currentStock} {selectedTransferPart.unit}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Lý Do Lỗi Phát Sinh <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  >
                    <option value="Do Nhà Cung Cấp">Do Nhà Cung Cấp (Vendor Defect)</option>
                    <option value="Do Thao Tác Nội Bộ">Do Thao Tác Nội Bộ (Internal Handling)</option>
                    <option value="Hư hỏng khi vận chuyển">Hư hỏng khi vận chuyển / bốc xếp</option>
                    <option value="Lỗi gia công / lắp ráp">Lỗi gia công / lắp ráp trên dây chuyền</option>
                    <option value="KHAC">Lý do khác (tự nhập)...</option>
                  </select>
                </div>

                {transferReason === 'KHAC' && (
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      placeholder="Nhập cụ thể lý do lỗi..."
                      value={transferCustomReason}
                      onChange={(e) => setTransferCustomReason(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Người Thực Hiện</label>
                  <input
                    type="text"
                    value={transferPerson}
                    onChange={(e) => setTransferPerson(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ghi Chú</label>
                  <input
                    type="text"
                    placeholder="Ghi chú thêm..."
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleAddPendingTransfer}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm Vào Danh Sách Chờ Chuyển</span>
                </button>
              </div>

              {/* Pending transfers table */}
              {pendingTransfers.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between text-xs font-black text-slate-700">
                    <span>DANH SÁCH CHỜ CHUYỂN ({pendingTransfers.length} mục)</span>
                    <button
                      type="button"
                      onClick={() => setPendingTransfers([])}
                      className="text-rose-600 hover:underline cursor-pointer text-[11px]"
                    >
                      Xóa tất cả
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 font-bold text-slate-600 text-[11px]">
                        <tr>
                          <th className="p-2.5">Mã LK</th>
                          <th className="p-2.5">Tên LK</th>
                          <th className="p-2.5 text-right">SL Chuyển</th>
                          <th className="p-2.5">Lý Do Lỗi</th>
                          <th className="p-2.5 text-center">Xóa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {pendingTransfers.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono font-bold text-rose-700">{item.part.code}</td>
                            <td className="p-2.5 truncate max-w-xs">{item.part.name}</td>
                            <td className="p-2.5 text-right font-mono font-black text-slate-900">
                              {item.quantity} {item.part.unit}
                            </td>
                            <td className="p-2.5 text-slate-600">{item.reason}</td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingTransfers((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="text-rose-500 hover:text-rose-700 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleSubmitTransferBatch}
                    className="w-full py-3 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-lg cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>
                      {isSubmitting
                        ? 'ĐANG LƯU BATCH SUPABASE...'
                        : `XÁC NHẬN CHUYỂN HÀNG LOẠT (${pendingTransfers.length} MỤC) SANG KHO NG`}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DIRECT IMPORT TO NG (MANUAL OR EXCEL) */}
          {importMode === 'direct' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium">
                💡 <b>Cơ chế nhập trực tiếp:</b> Số lượng nhập sẽ <b>Cộng thẳng vào Tồn Kho NG</b> mà <b>KHÔNG</b> làm thay đổi tồn Kho Chính.
              </div>

              {/* Sub-mode selector */}
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setDirectSubMode('manual')}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    directSubMode === 'manual'
                      ? 'bg-rose-50 text-rose-800 border-rose-300'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  1. Nhập Thủ Công Bằng Tay
                </button>
                <button
                  type="button"
                  onClick={() => setDirectSubMode('excel')}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    directSubMode === 'excel'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  2. Upload File Excel Nhập Kho NG
                </button>
              </div>

              {/* Manual Direct Form */}
              {directSubMode === 'manual' && (
                <div className="space-y-3 pt-2">
                  <div>
                    <SearchableSelect
                      label="Chọn Linh Kiện Nhập Lỗi"
                      required
                      options={directPartOptions}
                      value={directPartCode}
                      onChange={(val) => setDirectPartCode(val)}
                      placeholder="— Gõ mã hoặc tên linh kiện để tìm kiếm thông minh —"
                      allowCustom={false}
                      icon={<Search className="w-4 h-4 text-rose-500" />}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Số Lượng NG Nhập Thêm <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Nhập số lượng..."
                        value={directQuantity}
                        onChange={(e) =>
                          setDirectQuantity(e.target.value === '' ? '' : parseFloat(e.target.value))
                        }
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Lý Do Lỗi <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={directReason}
                        onChange={(e) => setDirectReason(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                      >
                        <option value="Do Nhà Cung Cấp">Do Nhà Cung Cấp (Vendor Defect)</option>
                        <option value="Do Thao Tác Nội Bộ">Do Thao Tác Nội Bộ (Internal Handling)</option>
                        <option value="Hỏng hóc lưu kho">Hỏng hóc trong quá trình bảo quản</option>
                        <option value="KHAC">Lý do khác...</option>
                      </select>
                    </div>

                    {directReason === 'KHAC' && (
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          placeholder="Nhập cụ thể lý do lỗi..."
                          value={directCustomReason}
                          onChange={(e) => setDirectCustomReason(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Người Thực Hiện</label>
                      <input
                        type="text"
                        value={directPerson}
                        onChange={(e) => setDirectPerson(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Ghi Chú</label>
                      <input
                        type="text"
                        placeholder="Ghi chú thêm..."
                        value={directNotes}
                        onChange={(e) => setDirectNotes(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleSubmitDirectManual}
                    className="w-full py-3 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-lg cursor-pointer disabled:opacity-50 mt-4"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>{isSubmitting ? 'ĐANG LƯU BATCH SUPABASE...' : 'XÁC NHẬN NHẬP KHO NG'}</span>
                  </button>
                </div>
              )}

              {/* Excel Direct Import */}
              {directSubMode === 'excel' && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Tải File Excel Nhập Hàng Lỗi</span>
                    <button
                      type="button"
                      onClick={handleDownloadSampleExcel}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải File Mẫu (.xlsx)</span>
                    </button>
                  </div>

                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-8 border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/30 rounded-2xl text-center cursor-pointer transition-all"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Upload className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-700">
                      Bấm vào đây để chọn file Excel (.xlsx, .xls)
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Cột yêu cầu: Mã Linh Kiện, Số Lượng, Lý Do Lỗi, Ghi Chú
                    </p>
                  </div>

                  {excelRows.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>
                          Đã đọc được {excelRows.length} dòng (Hợp lệ:{' '}
                          <b className="text-emerald-600">{excelRows.filter((r) => r.valid).length}</b>)
                        </span>
                        <button
                          type="button"
                          onClick={() => setExcelRows([])}
                          className="text-rose-600 hover:underline cursor-pointer text-[11px]"
                        >
                          Hủy kết quả đọc
                        </button>
                      </div>

                      <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold sticky top-0">
                            <tr>
                              <th className="p-2">Trạng Thái</th>
                              <th className="p-2">Mã LK</th>
                              <th className="p-2">Tên LK</th>
                              <th className="p-2 text-right">SL</th>
                              <th className="p-2">Lý Do</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium">
                            {excelRows.map((row, idx) => (
                              <tr key={idx} className={row.valid ? 'hover:bg-slate-50' : 'bg-rose-50/50'}>
                                <td className="p-2">
                                  {row.valid ? (
                                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">
                                      OK
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded text-[10px] font-bold" title={row.errorMsg}>
                                      Lỗi
                                    </span>
                                  )}
                                </td>
                                <td className="p-2 font-mono font-bold text-slate-800">{row.partCode}</td>
                                <td className="p-2 truncate max-w-xs">{row.partName}</td>
                                <td className="p-2 text-right font-mono font-bold">{row.quantity}</td>
                                <td className="p-2 text-slate-500">{row.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <button
                        type="button"
                        disabled={isSubmitting || excelRows.filter((r) => r.valid).length === 0}
                        onClick={handleSubmitExcelBatch}
                        className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-lg cursor-pointer disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        <span>
                          {isSubmitting
                            ? 'ĐANG LƯU BATCH SUPABASE...'
                            : `LƯU BATCH EXCEL (${excelRows.filter((r) => r.valid).length} MỤC HỢP LỆ) LÊN SUPABASE`}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SUB-MODAL 2: XUẤT KHO NG (Xuất trả NCC RTV / Xuất Hủy Scrap)
// ============================================================================
interface NgExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  ngInventoryList: Part[];
  preselectedParts: Array<{ part: Part; maxQty: number }>;
  settings: AppSettings;
  onSuccess: () => void;
}

const NgExportModal: React.FC<NgExportModalProps> = ({
  isOpen,
  onClose,
  ngInventoryList,
  preselectedParts,
  settings,
  onSuccess,
}) => {
  const [exportType, setExportType] = useState<'EXPORT_NG_RTV' | 'EXPORT_NG_SCRAP'>('EXPORT_NG_RTV');
  const [exportPerson, setExportPerson] = useState(settings.staffList?.[0] || 'Thủ kho');
  const [recipientOrDocument, setRecipientOrDocument] = useState('');
  const [exportNotes, setExportNotes] = useState('');

  // Items to export: map of partId -> quantity to export
  const [exportItems, setExportItems] = useState<
    Array<{
      part: Part;
      quantity: number;
    }>
  >(() => {
    if (preselectedParts && preselectedParts.length > 0) {
      return preselectedParts.map((p) => ({ part: p.part, quantity: p.maxQty }));
    }
    return [];
  });

  // Adding another part manually
  const [selectedAddPartId, setSelectedAddPartId] = useState('');
  const [selectedAddQty, setSelectedAddQty] = useState<number | ''>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');

  // Pre-computed Smart Fuzzy Search options for Export NG
  const exportPartOptions: SelectOption[] = useMemo(() => {
    return ngInventoryList.map((p) => ({
      value: p.id,
      label: `[${p.code}] ${p.name}`,
      sublabel: `Tồn NG: ${(p.qtyNg || 0).toLocaleString('vi-VN')} ${p.unit} | Kho chính: ${p.currentStock.toLocaleString('vi-VN')} ${p.unit}`,
      badge: `Tồn NG: ${p.qtyNg || 0} ${p.unit}`,
    }));
  }, [ngInventoryList]);

  if (!isOpen) return null;

  const handleAddExportItem = () => {
    setErrorText('');
    if (!selectedAddPartId) {
      setErrorText('Vui lòng chọn linh kiện trong Kho NG!');
      return;
    }
    const part = ngInventoryList.find((p) => p.id === selectedAddPartId);
    if (!part) return;

    const qty = Number(selectedAddQty);
    const maxQty = part.qtyNg || 0;
    if (!qty || qty <= 0) {
      setErrorText('Số lượng xuất phải lớn hơn 0!');
      return;
    }
    if (qty > maxQty) {
      setErrorText(`Số lượng xuất (${qty}) vượt quá tồn kho NG hiện có (${maxQty})!`);
      return;
    }

    // Check if already in list
    if (exportItems.some((item) => item.part.id === part.id)) {
      setExportItems((prev) =>
        prev.map((item) => (item.part.id === part.id ? { ...item, quantity: qty } : item))
      );
    } else {
      setExportItems((prev) => [...prev, { part, quantity: qty }]);
    }

    setSelectedAddPartId('');
    setSelectedAddQty('');
  };

  const handleUpdateItemQuantity = (partId: string, newQty: number) => {
    const part = ngInventoryList.find((p) => p.id === partId);
    if (!part) return;
    const maxQty = part.qtyNg || 0;
    const safeQty = Math.max(1, Math.min(maxQty, newQty));
    setExportItems((prev) =>
      prev.map((item) => (item.part.id === partId ? { ...item, quantity: safeQty } : item))
    );
  };

  const handleRemoveExportItem = (partId: string) => {
    setExportItems((prev) => prev.filter((item) => item.part.id !== partId));
  };

  // Submit Export in 1 Atomic Batch
  const handleSubmitExportBatch = async () => {
    setErrorText('');
    if (exportItems.length === 0) {
      setErrorText('Vui lòng thêm ít nhất 1 linh kiện cần xuất kho!');
      return;
    }

    setIsSubmitting(true);
    try {
      const partsToUpdate: Part[] = [];
      const transactionsToInsert: Transaction[] = [];

      for (const item of exportItems) {
        const p = item.part;
        const oldQtyNg = p.qtyNg || 0;
        const newQtyNg = Math.max(0, oldQtyNg - item.quantity);

        partsToUpdate.push({
          ...p,
          qtyNg: newQtyNg,
          updatedAt: new Date().toISOString(),
        });

        const reasonLabel =
          exportType === 'EXPORT_NG_RTV'
            ? `Xuất trả Nhà Cung Cấp: ${recipientOrDocument.trim() || 'NCC'}`
            : `Xuất hủy phế phẩm: ${recipientOrDocument.trim() || 'Biên bản tiêu hủy'}`;

        transactionsToInsert.push({
          id: 'tx-ng-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
          partId: p.id,
          partCode: p.code,
          partName: p.name,
          unit: p.unit,
          type: exportType,
          quantity: item.quantity,
          date: new Date().toISOString(),
          person: exportPerson,
          reasonOrPurpose: reasonLabel,
          ngReason: reasonLabel,
          notes: exportNotes || reasonLabel,
          stockBefore: p.currentStock,
          stockAfter: p.currentStock, // Tồn kho chính không đổi
          ngStockBefore: oldQtyNg,
          ngStockAfter: newQtyNg,
        });
      }

      // 1 Lệnh duy nhất lên Supabase (Batch Processing)
      await storageService.batchExecuteNgTransaction({
        partsToUpdate,
        transactionsToInsert,
      });

      onSuccess();
    } catch (err: any) {
      setErrorText('Lỗi khi lưu Batch xuất kho NG: ' + (err.message || 'Lỗi không xác định'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-rose-950 text-white px-6 py-4 flex items-center justify-between border-b border-rose-900">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-rose-500/30 text-rose-300 rounded-xl">
              <ArrowUpRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">XUẤT KHO NG (HÀNG LỖI)</h3>
              <p className="text-xs text-rose-300">
                Xuất trả Nhà Cung Cấp (RTV) hoặc Xuất Hủy Phế Phẩm (Scrap)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {errorText && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorText}</span>
            </div>
          )}

          {/* Export Type Selection */}
          <div>
            <label className="block text-xs font-black text-slate-700 uppercase mb-2">
              Chọn Loại Xuất Kho NG <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportType('EXPORT_NG_RTV')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  exportType === 'EXPORT_NG_RTV'
                    ? 'bg-sky-50 border-sky-500 text-sky-950 ring-2 ring-sky-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center space-x-2 font-black text-xs">
                  <Truck className="w-4 h-4 text-sky-600" />
                  <span>XUẤT TRẢ NCC (RTV)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Trả lại cho nhà cung cấp bảo hành hoặc đổi bù
                </p>
              </button>

              <button
                type="button"
                onClick={() => setExportType('EXPORT_NG_SCRAP')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  exportType === 'EXPORT_NG_SCRAP'
                    ? 'bg-rose-50 border-rose-500 text-rose-950 ring-2 ring-rose-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center space-x-2 font-black text-xs text-rose-700">
                  <Flame className="w-4 h-4 text-rose-600" />
                  <span>XUẤT HỦY PHẾ PHẨM (SCRAP)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Tiêu hủy phế phẩm không thể tái sử dụng
                </p>
              </button>
            </div>
          </div>

          {/* Recipient & Staff */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {exportType === 'EXPORT_NG_RTV' ? 'Tên Nhà Cung Cấp Nhận Lại' : 'Biên Bản Hủy / Đơn Vị Tiêu Hủy'}
              </label>
              <input
                type="text"
                placeholder={exportType === 'EXPORT_NG_RTV' ? 'Ví dụ: Cty Omron, Cty Nichicon...' : 'Ví dụ: BB-HUY-2026-08...'}
                value={recipientOrDocument}
                onChange={(e) => setRecipientOrDocument(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Người Xuất Hàng</label>
              <input
                type="text"
                value={exportPerson}
                onChange={(e) => setExportPerson(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Ghi Chú</label>
              <input
                type="text"
                placeholder="Ghi chú chi tiết đợt xuất..."
                value={exportNotes}
                onChange={(e) => setExportNotes(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>
          </div>

          {/* Add more part selector */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <span className="text-[11px] font-black text-slate-600 uppercase">
              Thêm Linh Kiện Vào Danh Sách Xuất
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-8">
                <SearchableSelect
                  options={exportPartOptions}
                  value={selectedAddPartId}
                  onChange={(val) => setSelectedAddPartId(val)}
                  placeholder="— Gõ tìm linh kiện trong Kho NG —"
                  allowCustom={false}
                  icon={<Search className="w-3.5 h-3.5 text-rose-500" />}
                />
              </div>

              <div className="sm:col-span-3">
                <input
                  type="number"
                  min="1"
                  placeholder="SL xuất..."
                  value={selectedAddQty}
                  onChange={(e) =>
                    setSelectedAddQty(e.target.value === '' ? '' : parseFloat(e.target.value))
                  }
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
                />
              </div>

              <div className="sm:col-span-1">
                <button
                  type="button"
                  onClick={handleAddExportItem}
                  className="w-full h-full p-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg flex items-center justify-center cursor-pointer"
                  title="Thêm"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Export Items List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-black text-slate-700">
              <span>DANH SÁCH LINH KIỆN XUẤT ({exportItems.length} mục)</span>
              {exportItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExportItems([])}
                  className="text-rose-600 hover:underline cursor-pointer text-[11px]"
                >
                  Xóa tất cả
                </button>
              )}
            </div>

            {exportItems.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                Chưa có linh kiện nào trong danh sách xuất. Chọn bên trên để thêm vào.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-52">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 font-bold text-slate-600 text-[10px] uppercase sticky top-0">
                    <tr>
                      <th className="p-2.5">Mã LK</th>
                      <th className="p-2.5">Tên LK</th>
                      <th className="p-2.5 text-center">Tồn NG</th>
                      <th className="p-2.5 text-right w-28">SL Xuất</th>
                      <th className="p-2.5 text-center w-10">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {exportItems.map((item) => {
                      const maxQty = item.part.qtyNg || 0;
                      return (
                        <tr key={item.part.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-bold text-rose-700">{item.part.code}</td>
                          <td className="p-2.5 truncate max-w-xs">{item.part.name}</td>
                          <td className="p-2.5 text-center font-bold text-slate-500">
                            {maxQty} {item.part.unit}
                          </td>
                          <td className="p-2.5 text-right">
                            <input
                              type="number"
                              min="1"
                              max={maxQty}
                              value={item.quantity}
                              onChange={(e) =>
                                handleUpdateItemQuantity(item.part.id, parseFloat(e.target.value) || 0)
                              }
                              className="w-20 p-1 text-right font-mono font-black text-rose-700 bg-rose-50 border border-rose-200 rounded-md focus:outline-none"
                            />
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveExportItem(item.part.id)}
                              className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="button"
            disabled={isSubmitting || exportItems.length === 0}
            onClick={handleSubmitExportBatch}
            className="w-full py-3 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-lg cursor-pointer disabled:opacity-50 mt-4"
          >
            {isSubmitting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>
              {isSubmitting
                ? 'ĐANG LƯU BATCH SUPABASE...'
                : `XÁC NHẬN XUẤT KHO NG HÀNG LOẠT (${exportItems.length} MỤC)`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
