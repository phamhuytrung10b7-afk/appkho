import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Part, AppSettings, BomExportVoucher, BomExportVoucherItem } from './types';
import { storageService, isLocationMatch } from './storage';
import { ArrowUpRight, CheckCircle2, AlertTriangle, AlertCircle, Package, Clock, User, FileCode, FileText, QrCode, Zap, Printer, X, FileSpreadsheet, Upload, Download, MapPin, RotateCcw, Check, PlusCircle, Layers, ListChecks, Search, Trash2, Sparkles, Filter, Plus } from 'lucide-react';
import { SearchableSelect, SelectOption } from './SearchableSelect';
import { QrScannerModal } from './QrScannerModal';
import { InlineQrScanner } from './InlineQrScanner';
import { StockOutScanModal } from './StockOutScanModal';
import { ExcelStockOutFifoModal } from './ExcelStockOutFifoModal';
import { downloadSampleStockOutExcel } from './excelStockInOutParser';
import { printHtml } from './printHelper';

interface StockOutViewProps {
  parts: Part[];
  settings: AppSettings;
  onSuccess: () => void;
}

export interface ExtraBomItem {
  id: string;
  partId: string;
  partCode: string;
  partName: string;
  unit: string;
  qty: number;
  note: string;
  currentStock: number;
  location: string;
}

// Utility for unaccented Vietnamese fuzzy search
const normalizeVietnamese = (str: string): string => {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .trim();
};

const matchesFuzzy = (target: string, query: string): boolean => {
  const normTarget = normalizeVietnamese(target);
  const normQuery = normalizeVietnamese(query);
  if (!normQuery) return true;
  if (normTarget.includes(normQuery)) return true;

  // Split into tokens (e.g. "bang dinh" matches "Băng dính...")
  const tokens = normQuery.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => normTarget.includes(t))) {
    return true;
  }

  // Subsequence match (e.g. "sha76" matches "04-29-07-SHA76210KL-0011")
  let tIdx = 0;
  for (let i = 0; i < normQuery.length; i++) {
    const char = normQuery[i];
    if (char === ' ') continue;
    tIdx = normTarget.indexOf(char, tIdx);
    if (tIdx === -1) return false;
    tIdx++;
  }
  return true;
};

const getNowLocalDateTime = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
};

export const StockOutView: React.FC<StockOutViewProps> = ({ parts, settings, onSuccess }) => {
  const [selectedPartId, setSelectedPartId] = useState(parts[0]?.id || '');
  const [quantity, setQuantity] = useState<number>(10);
  const [dateTime, setDateTime] = useState(getNowLocalDateTime());

  // Default person from logged in user
  const currentUser = storageService.getCurrentUser();
  const currentUserName = currentUser
    ? `${currentUser.fullName}${currentUser.roleTitle ? ` (${currentUser.roleTitle})` : ''}`
    : (settings.staffList?.[0] || 'Lê Hoàng Nam (Xưởng 1)');

  const defaultPerson = currentUserName;
  const [person, setPerson] = useState(defaultPerson);

  const staffOptions = React.useMemo(() => {
    const list = settings.staffList || [];
    if (currentUserName && !list.includes(currentUserName)) {
      return [currentUserName, ...list];
    }
    return list.length ? list : [currentUserName];
  }, [settings.staffList, currentUserName]);

  // Default production order from settings
  const defaultLSX = settings.productionOrders?.[0] || 'LSX-2026-HL288';
  const [productionOrder, setProductionOrder] = useState(defaultLSX);

  // Default purpose from settings
  const defaultPurpose = settings.stockOutPurposes?.[0] || 'Sản xuất theo đơn hàng';
  const [purpose, setPurpose] = useState(defaultPurpose);

  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isExcelOutModalOpen, setIsExcelOutModalOpen] = useState(false);
  const [excelOutFile, setExcelOutFile] = useState<File | null>(null);
  const excelOutFileInputRef = useRef<HTMLInputElement>(null);

  // Tab #1 Priority: XUẤT THEO MODEL (BOM)
  const [mainTab, setMainTab] = useState<'model' | 'scan' | 'manual'>('model');

  // Printable BOM Dispatch Order Sheet Modal State
  const [bomPrintModalData, setBomPrintModalData] = useState<{
    voucherCode?: string;
    modelName: string;
    modelQty: number;
    dateTime: string;
    person: string;
    status?: string;
    dispatchRounds?: number;
    items: Array<{
      partCode: string;
      partName: string;
      unit: string;
      bomQtyPerSet: number;
      requiredQty?: number;
      exportedQty?: number;
      remainingQty?: number;
      totalQtyOut: number;
      fifoLocation: string;
      status?: string;
    }>;
  } | null>(null);

  // Saved BOM Export Vouchers History State
  const [savedVouchers, setSavedVouchers] = useState<BomExportVoucher[]>(() => storageService.getBomExportVouchers());
  const [isVoucherHistoryOpen, setIsVoucherHistoryOpen] = useState(false);
  const [searchVoucherTerm, setSearchVoucherTerm] = useState('');
  const [voucherFilterStatus, setVoucherFilterStatus] = useState<'ALL' | 'PARTIAL' | 'COMPLETED'>('ALL');

  const refreshSavedVouchers = () => {
    setSavedVouchers(storageService.getBomExportVouchers());
  };

  // Xuất phiếu xuất kho theo model BOM ra file Excel (.xlsx) với cấu trúc cột y chang bản in
  const handleExportVoucherExcel = (voucher: {
    voucherCode?: string;
    modelName: string;
    modelQty: number;
    dateTime: string;
    person: string;
    status?: string;
    dispatchRounds?: number;
    items: BomExportVoucherItem[];
  }) => {
    try {
      const isPartial = voucher.status === 'PARTIAL';
      const statusText = isPartial ? 'ĐANG XUẤT BÙ' : 'ĐÃ HOÀN THÀNH 100%';
      const formattedDate = voucher.dateTime
        ? new Date(voucher.dateTime).toLocaleString('vi-VN')
        : new Date().toLocaleString('vi-VN');

      // 1. Tiêu đề và thông tin chung y chang bản in
      const sheetData: any[][] = [
        ['PHIẾU XUẤT KHO & SOẠN HÀNG THEO MODEL (BOM)'],
        ['Mã Phiếu:', voucher.voucherCode || 'N/A', '', 'Trạng Thái:', statusText],
        ['Tên Model (Lệnh SX):', voucher.modelName, '', 'Số Lượng Sản Xuất:', `${voucher.modelQty} Bộ`],
        ['Thời Gian Thực Hiện:', formattedDate, '', 'Người Lập / Soạn Hàng:', voucher.person],
        ['Số Đợt Xuất:', `Đợt ${voucher.dispatchRounds || 1}`, '', 'Ghi Chú:', 'Quản Lý Kho Linh Kiện - Cơ Chế Xuất Kho Từng Phần / Xuất Bù FIFO'],
        [],
        [
          'STT',
          'Mã Linh Kiện',
          'Tên Linh Kiện',
          'ĐVT',
          'Định Mức (ĐM/Bộ)',
          'Cần Xuất',
          'Đã Thực Xuất',
          'Chờ Xuất Bù',
          'Vị Trí Kệ (FIFO)',
          'Trạng Thái',
        ],
      ];

      // 2. Dữ liệu từng dòng linh kiện y chang bảng hiển thị in
      let totalReq = 0;
      let totalExp = 0;
      let totalRem = 0;

      (voucher.items || []).forEach((item, idx) => {
        const req = item.requiredQty ?? (item.bomQtyPerSet * (voucher.modelQty || 1));
        const exp = item.exportedQty ?? item.totalQtyOut ?? 0;
        const rem = item.remainingQty ?? Math.max(0, req - exp);

        totalReq += req;
        totalExp += exp;
        totalRem += rem;

        let statusTextItem = 'Đủ 100%';
        if (rem > 0) {
          statusTextItem = exp > 0 ? 'Xuất 1 phần' : 'Nợ 100%';
        }

        sheetData.push([
          idx + 1,
          item.partCode,
          item.partName + (item.isExtraConsumable ? ` [Tiêu hao thêm${item.extraNote ? `: ${item.extraNote}` : ''}]` : ''),
          item.unit,
          item.isExtraConsumable ? 'Tiêu hao thêm' : item.bomQtyPerSet,
          req,
          exp,
          rem > 0 ? -rem : 0,
          item.fifoLocation || 'Kho chính',
          statusTextItem,
        ]);
      });

      // 3. Dòng tổng cộng
      sheetData.push([
        'TỔNG CỘNG',
        '',
        '',
        '',
        '',
        totalReq,
        totalExp,
        totalRem > 0 ? -totalRem : 0,
        '',
        totalRem === 0 ? 'Đã xuất đủ 100%' : `Còn thiếu ${totalRem.toLocaleString('vi-VN')}`,
      ]);

      // 4. Khối chữ ký y chang bản in
      sheetData.push([]);
      sheetData.push(['Người Soạn Hàng', '', '', 'Thủ Kho Xuất Hàng', '', '', '', 'Đơn Vị Nhận Hàng (SX)']);
      sheetData.push(['(Ký & ghi rõ họ tên)', '', '', '(Ký & ghi rõ họ tên)', '', '', '', '(Ký & ghi rõ họ tên)']);
      sheetData.push([]);
      sheetData.push([]);
      sheetData.push([voucher.person, '', '', '', '', '', '', '']);

      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      // Độ rộng các cột chuẩn để khi mở Excel nhìn đẹp và không bị che khuất
      ws['!cols'] = [
        { wch: 6 },  // STT
        { wch: 22 }, // Mã Linh Kiện
        { wch: 38 }, // Tên Linh Kiện
        { wch: 8 },  // ĐVT
        { wch: 18 }, // Định Mức (ĐM/Bộ)
        { wch: 14 }, // Cần Xuất
        { wch: 16 }, // Đã Thực Xuất
        { wch: 16 }, // Chờ Xuất Bù
        { wch: 24 }, // Vị Trí Kệ (FIFO)
        { wch: 16 }, // Trạng Thái
      ];

      const wb = XLSX.utils.book_new();
      const safeSheetName = (voucher.voucherCode || 'Phieu_Xuat').replace(/[:\/\\?*\[\]]/g, '_').slice(-31);
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

      const safeCode = (voucher.voucherCode || 'PXK-BOM').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeModel = (voucher.modelName || 'MODEL').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `Phieu_Xuat_Kho_${safeCode}_${safeModel}.xlsx`;

      XLSX.writeFile(wb, fileName);
    } catch (err: any) {
      console.error('Lỗi khi xuất file Excel:', err);
      setMessage({ type: 'error', text: 'Lỗi khi xuất file Excel: ' + (err.message || 'Lỗi không xác định') });
    }
  };

  // BOM Partial & Backorder Workflow states
  const [bomWorkflowMode, setBomWorkflowMode] = useState<'new' | 'backorder'>('new');
  const [selectedBackorderVoucherId, setSelectedBackorderVoucherId] = useState<string>('');
  const [selectedBOMId, setSelectedBOMId] = useState<string>('');
  const [modelQty, setModelQty] = useState<number>(1);
  const [bomChecks, setBomChecks] = useState<Record<string, boolean>>({});
  const [customOutQuantities, setCustomOutQuantities] = useState<Record<string, number>>({});

  // Extra consumable items (Tiêu hao thêm ngoài định mức) states
  const [extraBomItems, setExtraBomItems] = useState<ExtraBomItem[]>([]);
  const [isAddExtraModalOpen, setIsAddExtraModalOpen] = useState(false);
  const [extraSearchQuery, setExtraSearchQuery] = useState('');
  const [extraCategoryFilter, setExtraCategoryFilter] = useState<'ALL' | 'IN_STOCK' | 'FASTENER' | 'TAPE' | 'CABLE' | 'PACKAGING'>('ALL');
  const [selectedExtraPart, setSelectedExtraPart] = useState<Part | null>(null);
  const [extraQuantity, setExtraQuantity] = useState<number>(1);
  const [extraReason, setExtraReason] = useState<string>('Tiêu hao thêm lắp ráp');

  // Stock Out Scan Modal States
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scannedPartForModal, setScannedPartForModal] = useState<Part | null>(null);
  const [initialScanQty, setInitialScanQty] = useState<number>(1);
  const [scanContNumber, setScanContNumber] = useState<string>('');

  const [scannedPartForQuickOut, setScannedPartForQuickOut] = useState<Part | null>(null);
  const [quickOutQty, setQuickOutQty] = useState<number>(10);
  const [successModalData, setSuccessModalData] = useState<{
    isOpen: boolean;
    partCode: string;
    partName: string;
    unit: string;
    qty: number;
    location: string;
    stockAfter: number;
    time: string;
    person: string;
    productionOrder?: string;
  } | null>(null);
  const [autoScanHistory, setAutoScanHistory] = useState<
    { id: string; partCode: string; partName: string; qty: number; unit: string; time: string; stockAfter: number }[]
  >([]);

  const [selectedOutLocation, setSelectedOutLocation] = useState<string>('');
  const locationSelectRef = useRef<HTMLSelectElement>(null);

  const selectedPart = parts.find((p) => p.id === selectedPartId);
  const isOverStock = selectedPart ? quantity > selectedPart.currentStock : false;

  useEffect(() => {
    if (selectedPart) {
      const locs = storageService.getPartLocations(selectedPart);
      setSelectedOutLocation(locs[0]?.locationName || selectedPart.location || 'Kho chính');
    }
  }, [selectedPartId]);

  // Tự động tính toán số lượng xuất đợt này theo tồn kho thực tế khi ở chế độ tạo phiếu mới
  useEffect(() => {
    if (bomWorkflowMode === 'new' && selectedBOMId) {
      const selectedBom = storageService.getModelBOMs().find((b) => b.id === selectedBOMId);
      if (selectedBom) {
        const checks: Record<string, boolean> = {};
        const qtys: Record<string, number> = {};
        selectedBom.items.forEach((item) => {
          checks[item.partCode] = true;
          const sysPart = parts.find((p) => p.code.toLowerCase() === item.partCode.toLowerCase());
          const needed = item.quantity * modelQty;
          const stock = sysPart ? sysPart.currentStock : 0;
          // Xuất theo tồn kho thực tế: nếu tồn kho < số lượng cần xuất, hệ thống vẫn cho phép xuất số lượng hiện có trong kho
          qtys[item.partCode] = Math.min(Math.max(0, stock), needed);
        });
        setBomChecks(checks);
        setCustomOutQuantities(qtys);
      }
    }
  }, [bomWorkflowMode, selectedBOMId, modelQty, parts]);

  // Tự động tính toán số lượng xuất bù theo tồn kho thực tế khi mở phiếu đang xuất bù cũ
  useEffect(() => {
    if (bomWorkflowMode === 'backorder' && selectedBackorderVoucherId) {
      const voucher = savedVouchers.find((v) => v.id === selectedBackorderVoucherId || v.voucherCode === selectedBackorderVoucherId);
      if (voucher) {
        const checks: Record<string, boolean> = {};
        const qtys: Record<string, number> = {};
        voucher.items.forEach((item) => {
          const sysPart = parts.find((p) => p.code.toLowerCase() === item.partCode.toLowerCase());
          const req = item.requiredQty ?? (item.bomQtyPerSet * (voucher.modelQty || 1));
          const exp = item.exportedQty ?? item.totalQtyOut ?? 0;
          const rem = item.remainingQty ?? Math.max(0, req - exp);
          const stock = sysPart ? sysPart.currentStock : 0;
          checks[item.partCode] = rem > 0;
          qtys[item.partCode] = rem > 0 ? Math.min(Math.max(0, stock), rem) : 0;
        });
        setBomChecks(checks);
        setCustomOutQuantities(qtys);
      }
    }
  }, [bomWorkflowMode, selectedBackorderVoucherId, savedVouchers, parts]);

  // Execute quick stock out
  const handleQuickStockOut = (partToOut: Part, qtyToOut: number) => {
    if (qtyToOut <= 0) {
      setMessage({ type: 'error', text: 'Số lượng xuất phải lớn hơn 0!' });
      return;
    }
    if (qtyToOut > partToOut.currentStock) {
      setMessage({
        type: 'error',
        text: `Số lượng xuất (${qtyToOut} ${partToOut.unit}) vượt quá tồn kho thực tế hiện tại (${partToOut.currentStock} ${partToOut.unit})!`,
      });
      return;
    }

    try {
      const tx = storageService.addStockOut({
        partId: partToOut.id,
        quantity: qtyToOut,
        date: new Date().toISOString(),
        person: person.trim() || 'Lê Hoàng Nam (Xưởng 1)',
        productionOrder: productionOrder.trim() || 'LSX-TỰ-ĐỘNG',
        reasonOrPurpose: purpose.trim() || 'Sản xuất theo đơn hàng',
        notes: 'Xuất kho qua quét mã QR tự động',
      });

      // Bắt buộc cập nhật lại currentStock và danh sách locations của linh kiện thông qua storageService.updatePart
      const latestPart = storageService.getPartById(partToOut.id) || storageService.getPartByCode(partToOut.code) || partToOut;
      const partLocs = storageService.getPartLocations(latestPart);
      const activeLocs = partLocs.filter((l) => l.quantity > 0);
      const newLocSummary = storageService.formatPartLocationSummary(activeLocs);
      storageService.updatePart(latestPart.id, {
        currentStock: tx.stockAfter,
        locations: activeLocs,
        location: newLocSummary,
      });

      const nowTimeStr = new Date().toLocaleTimeString('vi-VN');
      setAutoScanHistory((prev) => [
        {
          id: `${partToOut.id}-${Date.now()}`,
          partCode: partToOut.code,
          partName: partToOut.name,
          qty: qtyToOut,
          unit: partToOut.unit,
          time: nowTimeStr,
          stockAfter: tx.stockAfter,
        },
        ...prev,
      ]);

      setMessage({
        type: 'success',
        text: `🎉 ĐÃ XUẤT KHO THÀNH CÔNG! -${qtyToOut} ${tx.unit} cho [${tx.partCode}] ${tx.partName}. Tồn kho còn lại: ${tx.stockAfter} ${tx.unit}.`,
      });

      setScannedPartForQuickOut(null);
      onSuccess();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi khi xuất kho' });
    }
  };

  // Part options for SearchableSelect
  const partOptions: SelectOption[] = parts.map((p) => ({
    value: p.id,
    label: `[${p.code}] ${p.name}`,
    sublabel: `Tồn: ${p.currentStock} ${p.unit} | Vị trí: ${p.location}`,
    badge: `${p.currentStock} ${p.unit}`,
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPart) {
      setMessage({ type: 'error', text: 'Vui lòng chọn linh kiện cần xuất kho!' });
      return;
    }
    if (quantity <= 0) {
      setMessage({ type: 'error', text: 'Số lượng xuất phải lớn hơn 0!' });
      return;
    }
    if (quantity > selectedPart.currentStock) {
      setMessage({
        type: 'error',
        text: `Số lượng xuất (${quantity} ${selectedPart.unit}) lớn hơn số lượng tồn kho hiện tại (${selectedPart.currentStock} ${selectedPart.unit})!`,
      });
      return;
    }
    let finalLocation = selectedOutLocation.trim();
    if (!finalLocation) {
      const locs = storageService.getPartLocations(selectedPart);
      if (locs.length > 0) {
        finalLocation = locs[0].locationName;
        setSelectedOutLocation(finalLocation);
      } else {
        finalLocation = selectedPart.location || 'Kho chính';
      }
    }
    if (!finalLocation) {
      setMessage({ type: 'error', text: 'Vui lòng chọn hoặc quét vị trí / kệ cần xuất kho!' });
      return;
    }
    if (!person.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng chọn hoặc nhập tên người lấy linh kiện!' });
      return;
    }

    try {
      const tx = storageService.addStockOut({
        partId: selectedPartId,
        quantity: Number(quantity),
        date: new Date(dateTime).toISOString(),
        person: person.trim(),
        productionOrder: productionOrder.trim(),
        reasonOrPurpose: purpose.trim(),
        notes: notes.trim(),
        locationId: finalLocation || undefined,
      });

      // Bắt buộc cập nhật lại currentStock và danh sách locations của linh kiện thông qua storageService.updatePart
      const latestPart = storageService.getPartById(selectedPartId) || selectedPart;
      if (latestPart) {
        const partLocs = storageService.getPartLocations(latestPart);
        const activeLocs = partLocs.filter((l) => l.quantity > 0);
        const newLocSummary = storageService.formatPartLocationSummary(activeLocs);
        storageService.updatePart(latestPart.id, {
          currentStock: tx.stockAfter,
          locations: activeLocs,
          location: newLocSummary,
        });
      }

      setMessage({
        type: 'success',
        text: `Đã xuất kho thành công -${quantity} ${tx.unit} cho [${tx.partCode}] ${tx.partName}. Tồn kho còn lại: ${tx.stockAfter} ${tx.unit}.`,
      });

      // Reset form
      setNotes('');
      setDateTime(getNowLocalDateTime());
      onSuccess();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi khi xuất kho' });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Title */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
            <ArrowUpRight className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">PHIẾU XUẤT KHO LINH KIỆN</h2>
            <p className="text-xs text-slate-500">Tự động trừ tồn kho, liên kết mã lệnh sản xuất, ghi thời gian chính xác và chống xuất âm kho.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setExcelOutFile(null);
            setIsExcelOutModalOpen(true);
          }}
          className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer active:scale-95"
        >
          <FileSpreadsheet className="w-4 h-4 text-amber-300" />
          <span>Xuất Kho Bằng File Excel (FIFO)</span>
        </button>
      </div>

      {/* Main Mode Selection Tabs */}
      <div className="flex border border-slate-200 bg-slate-100 p-1.5 rounded-2xl gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
        <button
          type="button"
          onClick={() => setMainTab('model')}
          className={`px-4 py-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            mainTab === 'model'
              ? 'bg-pink-600 text-white shadow-md'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <Package className="w-4 h-4 text-amber-300 animate-bounce" />
          <span>1. XUẤT THEO MODEL (BOM) (ƯU TIÊN SỐ 1)</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('scan')}
          className={`px-4 py-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            mainTab === 'scan'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>2. QUÉT MÃ TỰ ĐỘNG</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('manual')}
          className={`px-4 py-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            mainTab === 'manual'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-300'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <FileText className="w-4 h-4 text-slate-500" />
          <span>3. XUẤT THỦ CÔNG</span>
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center shadow-xs animate-in zoom-in-95 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-2 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-2 border-red-300 text-red-900'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 mr-2 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-5 h-5 mr-2 shrink-0 text-red-600" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* TAB 1: MODEL-BASED STOCK OUT (WITH PARTIAL & BACKORDER WORKFLOW) */}
      {mainTab === 'model' && (() => {
        const partialVouchers = savedVouchers.filter(
          (v) => v.status === 'PARTIAL' || (v.totalQtyRemaining && v.totalQtyRemaining > 0)
        );

        const currentBOM = storageService.getModelBOMs().find((b) => b.id === selectedBOMId);
        const selectedBackorderVoucher = savedVouchers.find(
          (v) => v.id === selectedBackorderVoucherId || v.voucherCode === selectedBackorderVoucherId
        );

        // Compute items to display in the table
        const baseBomItems = bomWorkflowMode === 'new'
          ? (currentBOM
              ? currentBOM.items.map((item) => {
                  const rowKey = item.partCode;
                  const sysPart = parts.find((p) => p.code.toLowerCase() === item.partCode.toLowerCase());
                  const requiredQty = item.quantity * modelQty;
                  const currentStock = sysPart ? sysPart.currentStock : 0;
                  const prevExported = 0;
                  const remainingBeforeRound = requiredQty;
                  const qtyThisRound =
                    customOutQuantities[rowKey] !== undefined
                      ? customOutQuantities[rowKey]
                      : Math.min(Math.max(0, currentStock), remainingBeforeRound);
                  const remainingAfterRound = Math.max(0, remainingBeforeRound - qtyThisRound);
                  return {
                    rowKey,
                    partCode: item.partCode,
                    partName: item.partName,
                    unit: item.unit,
                    bomQtyPerSet: item.quantity,
                    requiredQty,
                    currentStock,
                    prevExported,
                    remainingBeforeRound,
                    qtyThisRound,
                    remainingAfterRound,
                    isChecked: bomChecks[rowKey] !== false,
                    sysPart,
                    isExtraConsumable: false,
                    extraId: '',
                    extraNote: '',
                  };
                })
              : [])
          : (selectedBackorderVoucher
              ? selectedBackorderVoucher.items.map((item) => {
                  const rowKey = item.partCode;
                  const sysPart = parts.find((p) => p.code.toLowerCase() === item.partCode.toLowerCase());
                  const requiredQty = item.requiredQty ?? (item.bomQtyPerSet * (selectedBackorderVoucher.modelQty || 1));
                  const currentStock = sysPart ? sysPart.currentStock : 0;
                  const prevExported = item.exportedQty ?? item.totalQtyOut ?? 0;
                  const remainingBeforeRound = item.remainingQty ?? Math.max(0, requiredQty - prevExported);
                  const qtyThisRound =
                    customOutQuantities[rowKey] !== undefined
                      ? customOutQuantities[rowKey]
                      : (remainingBeforeRound > 0 ? Math.min(Math.max(0, currentStock), remainingBeforeRound) : 0);
                  const remainingAfterRound = Math.max(0, remainingBeforeRound - qtyThisRound);
                  return {
                    rowKey,
                    partCode: item.partCode,
                    partName: item.partName,
                    unit: item.unit,
                    bomQtyPerSet: item.bomQtyPerSet,
                    requiredQty,
                    currentStock,
                    prevExported,
                    remainingBeforeRound,
                    qtyThisRound,
                    remainingAfterRound,
                    isChecked: bomChecks[rowKey] !== false,
                    sysPart,
                    isExtraConsumable: !!item.isExtraConsumable,
                    extraId: '',
                    extraNote: item.extraNote || '',
                  };
                })
              : []);

        // Also append extra consumable items in new BOM mode
        const extraDisplayItems = bomWorkflowMode === 'new'
          ? extraBomItems.map((ex) => {
              const rowKey = ex.id;
              const sysPart = parts.find((p) => p.id === ex.partId || p.code.toLowerCase() === ex.partCode.toLowerCase());
              const requiredQty = ex.qty;
              const currentStock = sysPart ? sysPart.currentStock : ex.currentStock;
              const prevExported = 0;
              const remainingBeforeRound = requiredQty;
              const qtyThisRound =
                customOutQuantities[rowKey] !== undefined
                  ? customOutQuantities[rowKey]
                  : Math.min(Math.max(0, currentStock), remainingBeforeRound);
              const remainingAfterRound = Math.max(0, remainingBeforeRound - qtyThisRound);
              return {
                rowKey,
                partCode: ex.partCode,
                partName: ex.partName,
                unit: ex.unit,
                bomQtyPerSet: 0,
                requiredQty,
                currentStock,
                prevExported,
                remainingBeforeRound,
                qtyThisRound,
                remainingAfterRound,
                isChecked: bomChecks[rowKey] !== false,
                sysPart,
                isExtraConsumable: true,
                extraId: ex.id,
                extraNote: ex.note,
              };
            })
          : [];

        const displayItems = [...baseBomItems, ...extraDisplayItems];

        const checkedItems = displayItems.filter((i) => i.isChecked);
        const totalSelectedPartsCount = checkedItems.length;
        const totalRequiredQty = checkedItems.reduce((sum, i) => sum + i.requiredQty, 0);
        const totalRoundOutQty = checkedItems.reduce((sum, i) => sum + i.qtyThisRound, 0);
        const totalRemainingAfterQty = checkedItems.reduce((sum, i) => sum + i.remainingAfterRound, 0);

        const handleExecuteBomOut = () => {
          if (!person.trim()) {
            setMessage({ type: 'error', text: 'Vui lòng chọn hoặc nhập tên người nhận linh kiện!' });
            return;
          }

          if (bomWorkflowMode === 'new') {
            if (!currentBOM) {
              setMessage({ type: 'error', text: 'Vui lòng chọn Model (Lệnh Sản Xuất)!' });
              return;
            }
            if (modelQty <= 0) {
              setMessage({ type: 'error', text: 'Số lượng sản xuất phải lớn hơn 0!' });
              return;
            }
            if (checkedItems.length === 0) {
              setMessage({ type: 'error', text: 'Chưa có linh kiện nào được chọn để xuất!' });
              return;
            }

            // Verify aggregated physical stock across all checked items (prevent over-export if same part selected multiple times)
            const requestedByPartId: Record<string, number> = {};
            for (const item of checkedItems) {
              if (item.sysPart && item.qtyThisRound > 0) {
                requestedByPartId[item.sysPart.id] = (requestedByPartId[item.sysPart.id] || 0) + item.qtyThisRound;
              }
            }
            for (const item of checkedItems) {
              if (item.sysPart && requestedByPartId[item.sysPart.id] > item.sysPart.currentStock) {
                setMessage({
                  type: 'error',
                  text: `Tổng số lượng xuất cho [${item.partCode}] (${requestedByPartId[item.sysPart.id]} ${item.unit}) vượt quá tồn kho thực tế (${item.sysPart.currentStock} ${item.unit})!`,
                });
                return;
              }
            }

            const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const todayCount = storageService.getBomExportVouchers().filter((v) => v.createdAt && v.createdAt.startsWith(new Date().toISOString().slice(0, 10))).length + 1;
            const bomVoucherCode = `PXK-BOM-${todayStr}-${String(todayCount).padStart(3, '0')}`;

            const printedItems: BomExportVoucherItem[] = [];
            const roundItemsSummary: Array<{ partCode: string; quantity: number; fifoLocation?: string }> = [];

            checkedItems.forEach((item) => {
              let fullFifoLocStr = 'Kho chính';
              if (item.sysPart && item.qtyThisRound > 0) {
                const fifoLots = storageService.getPartFifoLots(item.sysPart.id);
                const fifoNext = fifoLots.find((l) => l.status === 'FIFO_NEXT');
                const activeLocs = storageService.getPartLocations(item.sysPart).filter((l) => l.quantity > 0);
                let locationName = 'Kho chính';
                if (fifoNext && fifoNext.locationName) {
                  locationName = fifoNext.locationName;
                } else if (activeLocs.length > 0) {
                  locationName = activeLocs[0].locationName;
                } else if (item.sysPart.location) {
                  locationName = item.sysPart.location.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính';
                }
                fullFifoLocStr = locationName;
                if (fifoNext && fifoNext.contNumber && !locationName.includes(fifoNext.contNumber)) {
                  fullFifoLocStr = `${locationName} (${fifoNext.contNumber})`;
                }

                const tx = storageService.addStockOut({
                  partId: item.sysPart.id,
                  quantity: item.qtyThisRound,
                  date: new Date(dateTime).toISOString(),
                  person: person.trim() || 'Thủ kho',
                  productionOrder: currentBOM.name,
                  reasonOrPurpose: item.isExtraConsumable ? `Tiêu hao thêm Model BOM: ${currentBOM.name}` : 'Sản xuất theo Model (BOM)',
                  notes: item.isExtraConsumable
                    ? `[Tiêu hao thêm] Model ${currentBOM.name} (${item.extraNote || 'Tiêu hao ngoài định mức'})`
                    : `[Đợt 1] Model ${currentBOM.name} (${modelQty} bộ) ${item.remainingAfterRound > 0 ? `(Nợ: ${item.remainingAfterRound} ${item.unit})` : '(Đủ)'}`,
                  locationId: locationName,
                  voucherCode: bomVoucherCode,
                  voucherTitle: `Model BOM: ${currentBOM.name}${item.isExtraConsumable ? ' (Tiêu hao thêm)' : ''}`,
                  sourceBin: locationName,
                });

                const latestPart = storageService.getPartById(item.sysPart.id) || item.sysPart;
                const partLocs = storageService.getPartLocations(latestPart);
                const updatedActiveLocs = partLocs.filter((l) => l.quantity > 0);
                const newLocSummary = storageService.formatPartLocationSummary(updatedActiveLocs);
                storageService.updatePart(latestPart.id, {
                  currentStock: tx.stockAfter,
                  locations: updatedActiveLocs,
                  location: newLocSummary,
                });

                roundItemsSummary.push({
                  partCode: item.partCode,
                  quantity: item.qtyThisRound,
                  fifoLocation: fullFifoLocStr,
                });
              }

              printedItems.push({
                partCode: item.partCode,
                partName: item.partName,
                unit: item.unit,
                bomQtyPerSet: item.bomQtyPerSet,
                requiredQty: item.requiredQty,
                exportedQty: item.qtyThisRound,
                remainingQty: item.remainingAfterRound,
                currentBatchQty: item.qtyThisRound,
                totalQtyOut: item.qtyThisRound,
                fifoLocation: fullFifoLocStr,
                status: item.remainingAfterRound === 0 ? 'COMPLETED' : item.qtyThisRound > 0 ? 'PARTIAL' : 'PENDING',
                isExtraConsumable: item.isExtraConsumable,
                extraNote: item.extraNote,
              });
            });

            const totalQtyRequired = printedItems.reduce((sum, i) => sum + (i.requiredQty || 0), 0);
            const totalQtyOut = printedItems.reduce((sum, i) => sum + (i.exportedQty || 0), 0);
            const totalQtyRemaining = Math.max(0, totalQtyRequired - totalQtyOut);
            const overallStatus = totalQtyRemaining === 0 ? 'COMPLETED' : 'PARTIAL';

            const savedVoucher: BomExportVoucher = {
              id: 'vxk-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
              voucherCode: bomVoucherCode,
              modelName: currentBOM.name,
              modelQty,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              dateTime: dateTime || new Date().toISOString(),
              person: person.trim() || 'Thủ kho',
              items: printedItems,
              totalPartsCount: printedItems.length,
              totalQtyRequired,
              totalQtyOut,
              totalQtyRemaining,
              voucherType: 'BOM',
              status: overallStatus,
              dispatchRounds: 1,
              roundsHistory: [
                {
                  roundNumber: 1,
                  dateTime: dateTime || new Date().toISOString(),
                  person: person.trim() || 'Thủ kho',
                  notes: overallStatus === 'COMPLETED' ? 'Đã xuất đủ 100% trong đợt 1' : `Đợt 1 (Còn thiếu ${totalQtyRemaining} linh kiện chờ xuất bù)`,
                  items: roundItemsSummary,
                },
              ],
            };

            const existingVouchers = storageService.getBomExportVouchers();
            existingVouchers.unshift(savedVoucher);
            storageService.saveBomExportVouchers(existingVouchers);
            refreshSavedVouchers();

            setMessage({
              type: 'success',
              text: overallStatus === 'COMPLETED'
                ? `🎉 ĐÃ XUẤT KHO HOÀN TẤT 100%! Phiếu [${savedVoucher.voucherCode}] cho Model ${currentBOM.name}.`
                : `⚠️ ĐÃ XUẤT KHO ĐỢT 1 & LƯU PHIẾU XUẤT BÙ [${savedVoucher.voucherCode}]! Còn thiếu ${totalQtyRemaining} linh kiện. Trạng thái phiếu: "Đang xuất bù".`,
            });

            setBomPrintModalData({
              voucherCode: savedVoucher.voucherCode,
              modelName: savedVoucher.modelName,
              modelQty: savedVoucher.modelQty,
              dateTime: savedVoucher.dateTime,
              person: savedVoucher.person,
              status: savedVoucher.status,
              dispatchRounds: savedVoucher.dispatchRounds,
              items: savedVoucher.items,
            });

            setExtraBomItems([]);
            setCustomOutQuantities({});
            onSuccess();
          } else {
            // 'backorder' mode
            if (!selectedBackorderVoucher) {
              setMessage({ type: 'error', text: 'Vui lòng chọn phiếu xuất đang nợ cần xuất bù!' });
              return;
            }

            if (checkedItems.length === 0) {
              setMessage({ type: 'error', text: 'Chưa có linh kiện nào được chọn để xuất bù!' });
              return;
            }

            // Verify stock
            for (const item of checkedItems) {
              if (item.qtyThisRound > item.currentStock) {
                setMessage({
                  type: 'error',
                  text: `Số lượng xuất bù của [${item.partCode}] (${item.qtyThisRound}) vượt quá tồn kho thực tế (${item.currentStock})!`,
                });
                return;
              }
            }

            const nextRound = (selectedBackorderVoucher.dispatchRounds || 1) + 1;
            const roundItemsSummary: Array<{ partCode: string; quantity: number; fifoLocation?: string }> = [];

            const updatedItems = selectedBackorderVoucher.items.map((item) => {
              const match = checkedItems.find((ci) => ci.partCode === item.partCode);
              const requiredQty = item.requiredQty ?? (item.bomQtyPerSet * (selectedBackorderVoucher.modelQty || 1));
              const oldExported = item.exportedQty ?? item.totalQtyOut ?? 0;

              if (!match) {
                const remaining = item.remainingQty ?? Math.max(0, requiredQty - oldExported);
                return {
                  ...item,
                  requiredQty,
                  exportedQty: oldExported,
                  remainingQty: remaining,
                  status: remaining === 0 ? 'COMPLETED' : 'PARTIAL',
                };
              }

              const qtyOutThisRound = match.qtyThisRound;
              let fullFifoLocStr = item.fifoLocation || 'Kho chính';

              if (qtyOutThisRound > 0 && match.sysPart) {
                const fifoLots = storageService.getPartFifoLots(match.sysPart.id);
                const fifoNext = fifoLots.find((l) => l.status === 'FIFO_NEXT');
                const activeLocs = storageService.getPartLocations(match.sysPart).filter((l) => l.quantity > 0);
                let locationName = 'Kho chính';
                if (fifoNext && fifoNext.locationName) {
                  locationName = fifoNext.locationName;
                } else if (activeLocs.length > 0) {
                  locationName = activeLocs[0].locationName;
                } else if (match.sysPart.location) {
                  locationName = match.sysPart.location.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính';
                }
                fullFifoLocStr = locationName;

                const tx = storageService.addStockOut({
                  partId: match.sysPart.id,
                  quantity: qtyOutThisRound,
                  date: new Date(dateTime).toISOString(),
                  person: person.trim() || 'Thủ kho',
                  productionOrder: selectedBackorderVoucher.modelName,
                  reasonOrPurpose: 'Sản xuất theo Model (BOM) - Xuất bù',
                  notes: `[Xuất bù Đợt ${nextRound}] Phiếu ${selectedBackorderVoucher.voucherCode} - Model ${selectedBackorderVoucher.modelName} (Đợt này: +${qtyOutThisRound} ${match.unit})`,
                  locationId: locationName,
                  voucherCode: selectedBackorderVoucher.voucherCode,
                  voucherTitle: `Xuất bù Đợt ${nextRound} - ${selectedBackorderVoucher.modelName}`,
                  sourceBin: locationName,
                });

                const latestPart = storageService.getPartById(match.sysPart.id) || match.sysPart;
                const partLocs = storageService.getPartLocations(latestPart);
                const updatedActiveLocs = partLocs.filter((l) => l.quantity > 0);
                const newLocSummary = storageService.formatPartLocationSummary(updatedActiveLocs);
                storageService.updatePart(latestPart.id, {
                  currentStock: tx.stockAfter,
                  locations: updatedActiveLocs,
                  location: newLocSummary,
                });

                roundItemsSummary.push({
                  partCode: item.partCode,
                  quantity: qtyOutThisRound,
                  fifoLocation: locationName,
                });
              }

              const newExported = oldExported + qtyOutThisRound;
              const newRemaining = Math.max(0, requiredQty - newExported);
              const newStatus = newRemaining === 0 ? 'COMPLETED' : 'PARTIAL';

              return {
                ...item,
                requiredQty,
                exportedQty: newExported,
                remainingQty: newRemaining,
                currentBatchQty: qtyOutThisRound,
                totalQtyOut: newExported,
                fifoLocation: fullFifoLocStr,
                status: newStatus,
              };
            });

            const totalQtyRequired = updatedItems.reduce((sum, i) => sum + (i.requiredQty || 0), 0);
            const totalQtyOut = updatedItems.reduce((sum, i) => sum + (i.exportedQty || 0), 0);
            const totalQtyRemaining = Math.max(0, totalQtyRequired - totalQtyOut);
            const overallStatus = totalQtyRemaining === 0 ? 'COMPLETED' : 'PARTIAL';

            const roundsHistory = selectedBackorderVoucher.roundsHistory ? [...selectedBackorderVoucher.roundsHistory] : [];
            roundsHistory.push({
              roundNumber: nextRound,
              dateTime: dateTime || new Date().toISOString(),
              person: person.trim() || 'Thủ kho',
              notes: overallStatus === 'COMPLETED' ? `Xuất bù Đợt ${nextRound}: Đã hoàn thành 100% phiếu!` : `Xuất bù Đợt ${nextRound}: Còn nợ ${totalQtyRemaining} linh kiện`,
              items: roundItemsSummary,
            });

            const updatedVoucher = storageService.updateBomExportVoucher(selectedBackorderVoucher.id, {
              items: updatedItems,
              totalQtyRequired,
              totalQtyOut,
              totalQtyRemaining,
              status: overallStatus,
              dispatchRounds: nextRound,
              roundsHistory,
            });

            refreshSavedVouchers();

            setMessage({
              type: 'success',
              text: overallStatus === 'COMPLETED'
                ? `🎉 XUẤT BÙ ĐỢT ${nextRound} THÀNH CÔNG! Phiếu [${selectedBackorderVoucher.voucherCode}] đã đủ 100% và chuyển sang trạng thái "ĐÃ HOÀN THÀNH".`
                : `✅ Đã ghi nhận Xuất bù Đợt ${nextRound} cho phiếu [${selectedBackorderVoucher.voucherCode}]! Còn thiếu ${totalQtyRemaining} linh kiện, tiếp tục ở trạng thái "Đang xuất bù".`,
            });

            setBomPrintModalData({
              voucherCode: updatedVoucher.voucherCode,
              modelName: updatedVoucher.modelName,
              modelQty: updatedVoucher.modelQty,
              dateTime: dateTime || new Date().toISOString(),
              person: person.trim() || 'Thủ kho',
              status: updatedVoucher.status,
              dispatchRounds: updatedVoucher.dispatchRounds,
              items: updatedVoucher.items,
            });

            onSuccess();
          }
        };

        return (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
            {/* WORKFLOW MODE SWITCHER (Tạo phiếu mới vs Tiếp tục xuất bù) */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-2 bg-slate-100 rounded-2xl border border-slate-200">
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setBomWorkflowMode('new');
                    setMessage(null);
                  }}
                  className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center space-x-2 ${
                    bomWorkflowMode === 'new'
                      ? 'bg-pink-600 text-white shadow-md'
                      : 'text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <PlusCircle className="w-4 h-4 text-pink-200" />
                  <span>1. Tạo Phiếu Xuất BOM Mới</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBomWorkflowMode('backorder');
                    setMessage(null);
                    if (partialVouchers.length > 0 && !selectedBackorderVoucherId) {
                      setSelectedBackorderVoucherId(partialVouchers[0].id);
                    }
                  }}
                  className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center space-x-2 ${
                    bomWorkflowMode === 'backorder'
                      ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                      : 'text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <RotateCcw className="w-4 h-4 text-amber-950" />
                  <span>2. Tiếp Tục Xuất Bù Phiếu Cũ</span>
                  <span className="px-2 py-0.5 bg-amber-950/20 text-slate-950 rounded-full text-[10px] font-black">
                    {partialVouchers.length} phiếu chờ
                  </span>
                </button>
              </div>

              <div className="text-[11px] font-bold text-slate-500 px-3 py-1 bg-white rounded-xl border border-slate-200 shadow-xs">
                {bomWorkflowMode === 'new'
                  ? '⚡ Cho phép xuất theo tồn kho thực tế, tự động lưu vết thiếu hụt'
                  : '🔄 Đợt linh kiện tiếp theo về: Chọn phiếu cũ để tiếp tục xuất bù'}
              </div>
            </div>

            {/* SELECTION ROW */}
            {bomWorkflowMode === 'new' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <SearchableSelect
                    label="Chọn Model (Lệnh Sản Xuất)"
                    required={true}
                    options={storageService.getModelBOMs().map((bom) => ({
                      value: bom.id,
                      label: bom.name,
                      sublabel: `${bom.items.length} linh kiện định mức`,
                      badge: `${bom.items.length} LK`,
                    }))}
                    value={selectedBOMId}
                    onChange={(val) => {
                      setSelectedBOMId(val);
                      setExtraBomItems([]);
                      setCustomOutQuantities({});
                    }}
                    placeholder="-- Tìm kiếm hoặc chọn Model (BOM) --"
                    allowCustom={false}
                    icon={<FileCode className="w-4 h-4 text-pink-600" />}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Số Lượng Sản Xuất (Bộ) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={modelQty}
                    onChange={(e) => setModelQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-center focus:ring-2 focus:ring-pink-500 outline-hidden"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <SearchableSelect
                    label="Chọn Phiếu Xuất Đang Nợ / Chờ Xuất Bù"
                    required={true}
                    options={partialVouchers.map((v) => ({
                      value: v.id,
                      label: `[${v.voucherCode}] Model: ${v.modelName} (${v.modelQty} bộ)`,
                      sublabel: `Đã xuất: ${(v.totalQtyOut || 0).toLocaleString('vi-VN')} | Còn nợ: ${(v.totalQtyRemaining || 0).toLocaleString('vi-VN')} | Đợt tiếp theo: Đợt ${(v.dispatchRounds || 1) + 1}`,
                      badge: `Nợ ${(v.totalQtyRemaining || 0).toLocaleString('vi-VN')}`,
                    }))}
                    value={selectedBackorderVoucherId}
                    onChange={(val) => setSelectedBackorderVoucherId(val)}
                    placeholder="-- Chọn phiếu xuất đang ở trạng thái Đang xuất bù --"
                    allowCustom={false}
                    icon={<RotateCcw className="w-4 h-4 text-amber-600" />}
                  />
                </div>

                {selectedBackorderVoucher && (
                  <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-300 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-black text-xs text-amber-900 bg-amber-200/80 px-2.5 py-0.5 rounded-md">
                          {selectedBackorderVoucher.voucherCode}
                        </span>
                        <span className="text-xs font-extrabold text-slate-800">
                          Model: <span className="text-blue-700">{selectedBackorderVoucher.modelName}</span> ({selectedBackorderVoucher.modelQty} bộ)
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        Phiếu tạo ngày: <strong>{new Date(selectedBackorderVoucher.createdAt).toLocaleString('vi-VN')}</strong> | Người tạo: <strong>{selectedBackorderVoucher.person}</strong>
                      </p>
                    </div>

                    <div className="flex items-center space-x-3 text-xs">
                      <span className="px-3 py-1.5 bg-amber-400 text-slate-950 font-black rounded-xl shadow-xs">
                        👉 Đợt Xuất Bù Kế Tiếp: ĐỢT {(selectedBackorderVoucher.dispatchRounds || 1) + 1}
                      </span>
                      <span className="px-3 py-1.5 bg-rose-100 text-rose-800 font-black rounded-xl border border-rose-300">
                        Còn nợ: {(selectedBackorderVoucher.totalQtyRemaining || 0).toLocaleString('vi-VN')} linh kiện
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* INTERACTIVE COMPONENT TABLE WITH PARTIAL QUANTITY OVERRIDES & LIVE SHORTAGE TRACKING */}
            {((bomWorkflowMode === 'new' && selectedBOMId) || (bomWorkflowMode === 'backorder' && selectedBackorderVoucher)) && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <FileCode className="w-4 h-4 text-pink-600" />
                    <h3 className="font-black text-slate-800 text-sm">
                      {bomWorkflowMode === 'new'
                        ? 'Danh Sách Linh Kiện Xuất Đợt 1 (Cho Phép Xuất Một Phần)'
                        : `Danh Sách Xuất Bù Đợt ${(selectedBackorderVoucher?.dispatchRounds || 1) + 1}`}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {bomWorkflowMode === 'new' && (
                      <button
                        type="button"
                        onClick={() => {
                          setExtraSearchQuery('');
                          setSelectedExtraPart(null);
                          setExtraQuantity(1);
                          setExtraReason('Tiêu hao thêm lắp ráp');
                          setIsAddExtraModalOpen(true);
                        }}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white rounded-xl font-bold shadow-md cursor-pointer transition-all active:scale-95"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-purple-200 animate-pulse" />
                        <span>+ Thêm Linh Kiện Tiêu Hao (Fuzzy)</span>
                      </button>
                    )}

                    <span className="bg-pink-100 text-pink-900 px-2.5 py-1 rounded-lg font-bold">
                      {checkedItems.length} / {displayItems.length} linh kiện chọn xuất
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const allChecked = displayItems.every((i) => bomChecks[i.rowKey]);
                        const newChecks: Record<string, boolean> = {};
                        displayItems.forEach((i) => {
                          newChecks[i.rowKey] = !allChecked;
                        });
                        setBomChecks(newChecks);
                      }}
                      className="px-2.5 py-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold cursor-pointer transition-colors"
                    >
                      {displayItems.every((i) => bomChecks[i.rowKey]) ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-2xl max-h-[480px] shadow-xs">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0 shadow-xs z-10 font-bold">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded text-pink-600 focus:ring-pink-500 cursor-pointer"
                            checked={displayItems.length > 0 && displayItems.every((i) => bomChecks[i.rowKey])}
                            onChange={(e) => {
                              const newChecks: Record<string, boolean> = {};
                              displayItems.forEach((i) => {
                                newChecks[i.rowKey] = e.target.checked;
                              });
                              setBomChecks(newChecks);
                            }}
                          />
                        </th>
                        <th className="p-3">Mã Linh Kiện</th>
                        <th className="p-3">Tên Linh Kiện</th>
                        <th className="p-3 text-right">Định Mức (1 Bộ)</th>
                        <th className="p-3 text-right">SL Cần Xuất</th>
                        <th className="p-3 text-right">Tồn Kho Hiện Tại</th>
                        {bomWorkflowMode === 'backorder' && (
                          <th className="p-3 text-right">Đã Xuất Đợt Trước</th>
                        )}
                        <th className="p-3 text-right bg-pink-50/80 text-pink-900 border-x border-pink-200">
                          SL Xuất Đợt Này (Thực Tế)
                        </th>
                        <th className="p-3 text-right bg-amber-50/80 text-amber-900">
                          Chờ Xuất Bù (Còn Thiếu)
                        </th>
                        <th className="p-3 text-center">Trạng Thái Đợt Này</th>
                        <th className="p-3 text-center w-12">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayItems.map((item, idx) => {
                        const isChecked = bomChecks[item.rowKey] || false;
                        const isZeroStock = item.currentStock <= 0;
                        const isPartiallyMet = item.qtyThisRound > 0 && item.remainingAfterRound > 0;
                        const isFullyMet = item.remainingAfterRound === 0;

                        return (
                          <tr
                            key={item.rowKey || idx}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              item.isExtraConsumable ? 'bg-purple-50/30' : ''
                            } ${!isChecked ? 'opacity-40 grayscale bg-slate-50/40' : ''}`}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded text-pink-600 focus:ring-pink-500 cursor-pointer"
                                checked={isChecked}
                                onChange={(e) => {
                                  setBomChecks((prev) => ({
                                    ...prev,
                                    [item.rowKey]: e.target.checked,
                                  }));
                                }}
                              />
                            </td>
                            <td className="p-3 font-mono font-bold text-slate-800">
                              <div className="flex items-center space-x-1.5">
                                <span>{item.partCode}</span>
                                {item.isExtraConsumable && (
                                  <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-black rounded-md border border-purple-300 shadow-2xs">
                                    Tiêu hao
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-slate-700 max-w-[220px] truncate" title={item.partName}>
                              {item.partName}
                              {item.isExtraConsumable && item.extraNote && (
                                <span className="block text-[10px] text-purple-600 italic">
                                  ({item.extraNote})
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right font-medium text-slate-500">
                              {item.isExtraConsumable ? (
                                <span className="text-purple-600 font-bold italic" title={item.extraNote || 'Tiêu hao thêm'}>
                                  + Tiêu hao
                                </span>
                              ) : (
                                `${item.bomQtyPerSet} ${item.unit}`
                              )}
                            </td>
                            <td className="p-3 text-right font-black text-slate-800">
                              {item.requiredQty.toLocaleString('vi-VN')} {item.unit}
                            </td>
                            <td className="p-3 text-right">
                              <span
                                className={`font-mono font-bold px-2 py-0.5 rounded-md ${
                                  isZeroStock
                                    ? 'bg-rose-100 text-rose-700 border border-rose-300'
                                    : item.currentStock < item.remainingBeforeRound
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : 'bg-blue-50 text-blue-800 border border-blue-200'
                                }`}
                              >
                                {item.currentStock.toLocaleString('vi-VN')} {item.unit}
                              </span>
                            </td>

                            {bomWorkflowMode === 'backorder' && (
                              <td className="p-3 text-right font-mono font-semibold text-slate-600">
                                {item.prevExported.toLocaleString('vi-VN')} {item.unit}
                              </td>
                            )}

                            {/* CỘT NHẬP SỐ LƯỢNG THỰC TẾ XUẤT ĐỢT NÀY */}
                            <td className="p-2.5 text-right bg-pink-50/30 border-x border-pink-100">
                              <div className="flex items-center space-x-1.5 justify-end">
                                <input
                                  type="number"
                                  min={0}
                                  max={item.currentStock}
                                  value={item.qtyThisRound}
                                  disabled={!isChecked || item.remainingBeforeRound === 0}
                                  onChange={(e) => {
                                    const val = Number(e.target.value) || 0;
                                    const clamped = Math.max(0, Math.min(val, item.currentStock));
                                    setCustomOutQuantities((prev) => ({
                                      ...prev,
                                      [item.rowKey]: clamped,
                                    }));
                                  }}
                                  className={`w-24 px-2 py-1 text-right text-xs font-black rounded-xl border focus:ring-2 focus:ring-pink-500 outline-hidden transition-all ${
                                    item.qtyThisRound > item.currentStock
                                      ? 'bg-red-50 border-red-500 text-red-700'
                                      : item.qtyThisRound > 0
                                      ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                                      : 'bg-white border-slate-300 text-slate-700'
                                  }`}
                                />
                                <span className="text-[11px] text-slate-500 font-semibold w-7 text-left">
                                  {item.unit}
                                </span>
                              </div>
                            </td>

                            {/* CỘT TÍNH VÀ LƯU VẾT THIẾU HỤT: CHỜ XUẤT BÙ */}
                            <td className="p-3 text-right bg-amber-50/30">
                              {item.remainingAfterRound > 0 ? (
                                <span className="font-mono font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-300">
                                  -{item.remainingAfterRound.toLocaleString('vi-VN')} {item.unit}
                                </span>
                              ) : (
                                <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                  0 (Đủ)
                                </span>
                              )}
                            </td>

                            {/* CỘT TRẠNG THÁI CỦA LINH KIỆN */}
                            <td className="p-3 text-center">
                              {item.remainingBeforeRound === 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  ✅ Đã đủ 100%
                                </span>
                              ) : isFullyMet ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  ✅ Đủ xuất đợt này
                                </span>
                              ) : isPartiallyMet ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                  ⚡ Xuất 1 phần (+{item.qtyThisRound})
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                  ⚠️ Hết tồn kho / Nợ bù
                                </span>
                              )}
                            </td>

                            {/* CỘT THAO TÁC */}
                            <td className="p-3 text-center">
                              {item.isExtraConsumable ? (
                                <button
                                  type="button"
                                  title="Xóa linh kiện tiêu hao thêm này"
                                  onClick={() => {
                                    setExtraBomItems((prev) => prev.filter((ex) => ex.id !== item.extraId));
                                    setCustomOutQuantities((prev) => {
                                      const updated = { ...prev };
                                      delete updated[item.rowKey];
                                      return updated;
                                    });
                                    setBomChecks((prev) => {
                                      const updated = { ...prev };
                                      delete updated[item.rowKey];
                                      return updated;
                                    });
                                  }}
                                  className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-slate-300 text-[10px]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* SUMMARY METRICS BAR */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px] font-semibold">Linh kiện chọn xuất:</span>
                    <strong className="text-sm font-black text-slate-800">{totalSelectedPartsCount} mã</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px] font-semibold">Tổng SL cần xuất:</span>
                    <strong className="text-sm font-black text-slate-800">{totalRequiredQty.toLocaleString('vi-VN')}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px] font-semibold">SL thực tế xuất đợt này:</span>
                    <strong className="text-sm font-black text-emerald-600">+{totalRoundOutQty.toLocaleString('vi-VN')}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px] font-semibold">Chờ xuất bù sau đợt này:</span>
                    <strong className={`text-sm font-black ${totalRemainingAfterQty > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {totalRemainingAfterQty > 0 ? `-${totalRemainingAfterQty.toLocaleString('vi-VN')}` : '0 (Đủ 100%)'}
                    </strong>
                  </div>
                </div>

                {/* BOTTOM FORM CONTROLS & SUBMIT BUTTON */}
                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Người Lấy / Soạn Hàng <span className="text-red-500">*</span>
                      </label>
                      <SearchableSelect
                        options={staffOptions}
                        value={person}
                        onChange={(val) => setPerson(val)}
                        placeholder="Chọn người nhận..."
                        allowCustom={true}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ngày Giờ Xuất <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={dateTime}
                        onChange={(e) => setDateTime(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-hidden"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleExecuteBomOut}
                    className={`w-full sm:w-auto px-6 py-4 rounded-xl text-sm font-black shadow-lg transition-all cursor-pointer flex items-center justify-center space-x-2 shrink-0 ${
                      bomWorkflowMode === 'new'
                        ? totalRemainingAfterQty > 0
                          ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                          : 'bg-pink-600 hover:bg-pink-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    <ArrowUpRight className="w-5 h-5" />
                    <span>
                      {bomWorkflowMode === 'new'
                        ? totalRemainingAfterQty > 0
                          ? 'XUẤT KHO ĐỢT 1 & LƯU PHIẾU XUẤT BÙ (PARTIAL)'
                          : 'XUẤT KHO HÀNG LOẠT THEO BOM (HOÀN TẤT 100%)'
                        : `XÁC NHẬN XUẤT BÙ ĐỢT ${(selectedBackorderVoucher?.dispatchRounds || 1) + 1}`}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* SAVED BOM EXPORT VOUCHERS HISTORY SECTION */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-pink-100 text-pink-700 rounded-2xl">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
                      <span>Lịch Sử Phiếu Xuất Kho & Theo Dõi Xuất Bù</span>
                      <span className="px-2.5 py-0.5 bg-pink-100 text-pink-800 text-xs font-black rounded-full">
                        {savedVouchers.length} Phiếu
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Tất cả phiếu xuất kho soạn hàng theo Model BOM và File Excel đều được lưu vết chi tiết theo từng đợt xuất bù.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {/* Status Filters */}
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setVoucherFilterStatus('ALL')}
                      className={`px-3 py-1 rounded-lg cursor-pointer transition-all ${
                        voucherFilterStatus === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Tất cả ({savedVouchers.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoucherFilterStatus('PARTIAL')}
                      className={`px-3 py-1 rounded-lg cursor-pointer transition-all ${
                        voucherFilterStatus === 'PARTIAL' ? 'bg-amber-400 text-slate-950 font-black shadow-xs' : 'text-amber-700'
                      }`}
                    >
                      Đang xuất bù ({savedVouchers.filter((v) => v.status === 'PARTIAL' || (v.totalQtyRemaining && v.totalQtyRemaining > 0)).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoucherFilterStatus('COMPLETED')}
                      className={`px-3 py-1 rounded-lg cursor-pointer transition-all ${
                        voucherFilterStatus === 'COMPLETED' ? 'bg-emerald-600 text-white font-black shadow-xs' : 'text-emerald-700'
                      }`}
                    >
                      Đã hoàn thành ({savedVouchers.filter((v) => v.status === 'COMPLETED' || (!v.totalQtyRemaining && v.status !== 'PARTIAL')).length})
                    </button>
                  </div>

                  <input
                    type="text"
                    value={searchVoucherTerm}
                    onChange={(e) => setSearchVoucherTerm(e.target.value)}
                    placeholder="Tìm mã phiếu / model / người lập..."
                    className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-pink-500 w-full sm:w-56"
                  />
                  <button
                    type="button"
                    onClick={() => setIsVoucherHistoryOpen(!isVoucherHistoryOpen)}
                    className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs shrink-0"
                  >
                    <Clock className="w-4 h-4" />
                    <span>{isVoucherHistoryOpen ? 'Thu Gọn' : 'Xem Lịch Sử & In Lại'}</span>
                  </button>
                </div>
              </div>

              {isVoucherHistoryOpen && (
                <div className="space-y-3 animate-in fade-in duration-200 pt-2">
                  {(() => {
                    const filteredVouchers = savedVouchers.filter((v) => {
                      const matchesSearch =
                        !searchVoucherTerm ||
                        v.voucherCode.toLowerCase().includes(searchVoucherTerm.toLowerCase()) ||
                        v.modelName.toLowerCase().includes(searchVoucherTerm.toLowerCase()) ||
                        v.person.toLowerCase().includes(searchVoucherTerm.toLowerCase());

                      const isPartial = v.status === 'PARTIAL' || (v.totalQtyRemaining && v.totalQtyRemaining > 0);
                      const matchesStatus =
                        voucherFilterStatus === 'ALL' ||
                        (voucherFilterStatus === 'PARTIAL' && isPartial) ||
                        (voucherFilterStatus === 'COMPLETED' && !isPartial);

                      return matchesSearch && matchesStatus;
                    });

                    if (filteredVouchers.length === 0) {
                      return (
                        <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 italic text-xs">
                          {searchVoucherTerm || voucherFilterStatus !== 'ALL'
                            ? 'Không tìm thấy phiếu xuất kho nào phù hợp với bộ lọc.'
                            : 'Chưa có phiếu xuất kho nào trong lịch sử lưu trữ.'}
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredVouchers.map((v) => {
                          const isPartial = v.status === 'PARTIAL' || (v.totalQtyRemaining && v.totalQtyRemaining > 0);
                          const currentRounds = v.dispatchRounds || 1;

                          return (
                            <div
                              key={v.id}
                              className={`p-4 rounded-2xl border transition-all space-y-3 flex flex-col justify-between ${
                                isPartial
                                  ? 'bg-amber-50/40 border-amber-300 hover:border-amber-400 shadow-xs'
                                  : 'bg-slate-50 hover:bg-pink-50/50 border-slate-200 hover:border-pink-300'
                              }`}
                            >
                              <div className="space-y-2.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-mono font-black text-pink-700 text-xs px-2 py-0.5 bg-pink-100 rounded-md inline-block">
                                        {v.voucherCode}
                                      </span>
                                      {isPartial ? (
                                        <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-amber-400 text-slate-950 rounded-md border border-amber-500 shadow-xs">
                                          ⏳ Đang Xuất Bù (Đợt {currentRounds})
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-md">
                                          ✅ Đã Hoàn Thành
                                        </span>
                                      )}
                                    </div>
                                    <h4 className="font-extrabold text-slate-900 text-sm mt-1">
                                      Model: <span className="text-blue-700 font-bold">{v.modelName}</span>
                                    </h4>
                                  </div>
                                  <span className="px-2.5 py-1 text-white text-xs font-black rounded-lg shrink-0 bg-pink-600">
                                    {v.modelQty} Bộ
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200/80">
                                  <div>
                                    <span className="text-slate-400 block text-[10px]">Thời gian lập:</span>
                                    <strong className="font-semibold text-slate-800 font-mono">
                                      {new Date(v.dateTime || v.createdAt).toLocaleString('vi-VN')}
                                    </strong>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block text-[10px]">Người lập:</span>
                                    <strong className="font-semibold text-slate-800">{v.person}</strong>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block text-[10px]">Tổng đã xuất:</span>
                                    <strong className="font-bold text-emerald-700">
                                      {(v.totalQtyOut || 0).toLocaleString('vi-VN')}
                                    </strong>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block text-[10px]">Chờ xuất bù:</span>
                                    <strong className={`font-black ${isPartial ? 'text-rose-600' : 'text-slate-500'}`}>
                                      {isPartial ? `-${(v.totalQtyRemaining || 0).toLocaleString('vi-VN')}` : '0 (Đủ)'}
                                    </strong>
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Bạn có chắc muốn xóa lịch sử phiếu ${v.voucherCode}?`)) {
                                      storageService.deleteBomExportVoucher(v.id);
                                      refreshSavedVouchers();
                                    }
                                  }}
                                  className="px-2.5 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  Xóa
                                </button>

                                <div className="flex items-center space-x-2">
                                  {isPartial && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBomWorkflowMode('backorder');
                                        setSelectedBackorderVoucherId(v.id);
                                        window.scrollTo({ top: 180, behavior: 'smooth' });
                                      }}
                                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition-all cursor-pointer flex items-center space-x-1 shadow-sm"
                                      title="Tiếp tục xuất bù đợt tiếp theo cho phiếu này"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      <span>Xuất Bù Đợt {currentRounds + 1}</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBomPrintModalData({
                                        voucherCode: v.voucherCode,
                                        modelName: v.modelName,
                                        modelQty: v.modelQty,
                                        dateTime: v.dateTime,
                                        person: v.person,
                                        status: v.status,
                                        dispatchRounds: v.dispatchRounds,
                                        items: v.items,
                                      });
                                    }}
                                    className="px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center space-x-1 shadow-xs"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                    <span>In Phiếu</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleExportVoucherExcel(v)}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center space-x-1 shadow-xs active:scale-95"
                                    title="Xuất phiếu xuất kho ra file Excel (.xlsx) với cấu trúc cột y chang bản in"
                                  >
                                    <FileSpreadsheet className="w-3.5 h-3.5" />
                                    <span>Xuất Excel</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* TAB 1: AUTO SCAN & QUICK STOCK OUT MODE */}
      {mainTab === 'scan' && (
        <div className="space-y-6">
          {/* EXCEL STOCK OUT (FIFO) SECTION */}
          <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 p-5 rounded-3xl text-white shadow-lg border border-blue-500/30 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <div className="p-3 bg-blue-500/20 text-amber-300 rounded-2xl border border-blue-400/30">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm sm:text-base font-black tracking-tight text-white">
                    XUẤT KHO THEO FILE EXCEL (ƯU TIÊN FIFO)
                  </h3>
                  <span className="px-2 py-0.5 bg-amber-400 text-slate-950 font-black text-[10px] rounded-md uppercase">
                    FIFO #1
                  </span>
                </div>
                <p className="text-xs text-blue-200/90 mt-0.5 max-w-xl">
                  Đọc file Excel (Ảnh 3: Cột 1 STT, Cột 2 Mã VT, Cột 3 Tên VT, Cột 4 ĐVT, Cột 5 SL thực xuất). Tự động tính toán phân bổ Kệ & Lô hàng cũ nhất theo nguyên tắc FIFO.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                ref={excelOutFileInputRef}
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setExcelOutFile(e.target.files[0]);
                    setIsExcelOutModalOpen(true);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => excelOutFileInputRef.current?.click()}
                className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer active:scale-95"
              >
                <Upload className="w-4 h-4 text-amber-300" />
                <span>Tải File Excel Xuất Kho</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setExcelOutFile(null);
                  setIsExcelOutModalOpen(true);
                }}
                className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Mở Bảng Xuất FIFO</span>
              </button>

              <button
                type="button"
                onClick={downloadSampleStockOutExcel}
                className="px-3 py-2.5 bg-white/10 hover:bg-white/20 text-blue-200 hover:text-white font-semibold text-xs rounded-xl transition-all cursor-pointer"
                title="Tải file mẫu Excel xuất kho (.xlsx)"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          <InlineQrScanner
            mode="out"
            parts={parts}
            onScanSuccess={({ part, qty, contNumber }) => {
              setSelectedPartId(part.id);
              setScannedPartForModal(part);
              setInitialScanQty(qty && qty > 0 ? qty : 1);
              setScanContNumber(contNumber || '');
              setIsScanModalOpen(true);
              setScannedPartForQuickOut(null);
              setMessage(null);
            }}
          />

          {/* Auto scan history in current session */}
          {autoScanHistory.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="font-extrabold text-xs text-slate-800 flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>DANH SÁCH LƯỢT XUẤT KHO VỪA THỰC HIỆN ({autoScanHistory.length})</span>
                </h4>
                <span className="text-[11px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-md">
                  Đã trừ trực tiếp vào kho
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {autoScanHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-600">[{item.partCode}]</span>{' '}
                      <strong className="text-slate-900">{item.partName}</strong>
                    </div>

                    <div className="text-right">
                      <span className="font-black text-blue-700 text-sm">
                        -{item.qty} {item.unit}
                      </span>
                      <p className="text-[10px] text-slate-400">Tồn còn: {item.stockAfter} • {item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MANUAL FORM MODE */}
      {mainTab === 'manual' && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                Chọn Linh Kiện Xuất Kho <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold border border-blue-200 transition-colors cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5 text-blue-600" />
                <span>Quét mã camera phụ</span>
              </button>
            </div>

            <SearchableSelect
              options={partOptions}
              value={selectedPartId}
              onChange={(val) => setSelectedPartId(val)}
              placeholder="Gõ mã, tên linh kiện hoặc vị trí để tìm..."
              allowCustom={false}
              icon={<Package className="w-4 h-4 text-blue-600" />}
            />
          </div>

        {/* Selected Part Stock Status Card */}
        {selectedPart && (
          <div className="space-y-3">
            <div
              className={`p-4 border rounded-xl flex items-center justify-between text-xs transition-colors ${
                selectedPart.currentStock === 0
                  ? 'bg-red-50 border-red-200'
                  : isOverStock
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Package className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <p className="font-bold text-slate-800">{selectedPart.name}</p>
                  <p className="text-slate-500 font-mono">Mã: {selectedPart.code} | Vị trí: {selectedPart.location}</p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-slate-500 font-medium">Tồn kho hiện tại:</span>
                <p
                  className={`text-base font-black ${
                    selectedPart.currentStock === 0
                      ? 'text-red-600'
                      : selectedPart.currentStock <= selectedPart.minStock
                      ? 'text-amber-600'
                      : 'text-blue-700'
                  }`}
                >
                  {selectedPart.currentStock.toLocaleString('vi-VN')} {selectedPart.unit}
                </p>
              </div>
            </div>

            {/* FIFO Batch Recommendation Box */}
            {(() => {
              const fifoLots = storageService.getPartFifoLots(selectedPart.id);
              const fifoNext = fifoLots.find((l) => l.status === 'FIFO_NEXT');
              if (!fifoNext) return null;

              return (
                <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl text-xs space-y-1.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-amber-950 flex items-center space-x-1.5">
                      <Zap className="w-4 h-4 text-amber-600 animate-pulse shrink-0" />
                      <span>GỢI Ý KHUYẾN NGHỊ XUẤT KHO THEO FIFO (#1 NHẬP TRƯỚC XUẤT TRƯỚC):</span>
                    </span>
                    <span className="px-2 py-0.5 bg-amber-200 text-amber-950 font-black text-[10px] rounded-md">
                      LÔ CŨ NÊN XUẤT TRƯỚC
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-amber-900">
                    <div>
                      Mốc Cont ưu tiên: <strong className="text-amber-950 text-sm">{fifoNext.contNumber}</strong> (Nhập ngày: {new Date(fifoNext.importDate).toLocaleDateString('vi-VN')})
                      • Còn tồn trong mốc này: <strong className="text-amber-950">{fifoNext.remainingQty.toLocaleString('vi-VN')} {selectedPart.unit}</strong>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setNotes((prev) => (prev ? `${prev} | Gắn Cont FIFO: ${fifoNext.contNumber}` : `Xuất kho FIFO từ Cont ${fifoNext.contNumber}`));
                      }}
                      className="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-[11px] rounded-lg transition-colors cursor-pointer border border-amber-400"
                    >
                      + Gắn Mã Cont {fifoNext.contNumber} Vào Ghi Chú
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}


        {/* Overstock Warning Banner */}
        {isOverStock && selectedPart && (
          <div className="p-3.5 bg-red-100 border border-red-300 text-red-800 rounded-xl text-xs font-bold flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2 text-red-600 shrink-0" />
            <span>
              CẢNH BÁO: Số lượng muốn xuất ({quantity} {selectedPart.unit}) lớn hơn tồn kho thực tế ({selectedPart.currentStock} {selectedPart.unit}). Hệ thống không cho phép xuất âm kho!
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Location / Shelf Selection */}
          {selectedPart && (
            <div className="col-span-1 md:col-span-2 bg-blue-50/60 p-3.5 rounded-xl border-2 border-blue-300">
              <label className="block text-xs font-extrabold text-blue-950 mb-1 flex items-center justify-between">
                <span>📍 BẮT BUỘC CHỌN KỆ / VỊ TRÍ XUẤT HÀNG *</span>
                <span className="text-[11px] font-normal text-blue-800">Linh kiện có ở {storageService.getPartLocations(selectedPart).length} vị trí</span>
              </label>
              <select
                ref={locationSelectRef}
                value={selectedOutLocation}
                onChange={(e) => setSelectedOutLocation(e.target.value)}
                className="w-full px-3.5 py-2.5 border-2 border-blue-400 rounded-xl text-xs font-bold bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-hidden"
              >
                <option value="">-- Bắt buộc chọn kệ / vị trí xuất --</option>
                {storageService.getPartLocations(selectedPart).map((loc, i) => (
                  <option key={i} value={loc.locationName}>
                    📍 {loc.locationName} — Tồn tại kệ này: {loc.quantity.toLocaleString('vi-VN')} {selectedPart.unit}
                  </option>
                ))}
                {settings.locations && settings.locations.length > 0 && (
                  <optgroup label="Các kệ khác trong kho">
                    {settings.locations
                      .filter(
                        (l) =>
                          !storageService
                            .getPartLocations(selectedPart)
                            .some((pl) => isLocationMatch(pl.locationName, l.name))
                      )
                      .map((l) => (
                        <option key={l.id} value={l.name}>
                          Kệ {l.name} {l.description ? `(${l.description})` : ''}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-xs font-extrabold text-slate-800 mb-1">
              Số Lượng Xuất <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              value={quantity}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  locationSelectRef.current?.focus();
                }
              }}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
              className={`w-full px-3.5 py-2.5 border-2 rounded-xl text-base font-black focus:ring-2 outline-hidden ${
                isOverStock
                  ? 'bg-red-50 border-red-400 text-red-700 focus:ring-red-500'
                  : 'bg-slate-50 border-slate-300 text-blue-700 focus:ring-blue-500 focus:bg-white'
              }`}
            />
            <p className="text-[10px] text-slate-500 mt-1">
              💡 Gõ số lượng xong nhấn Enter để chuyển sang ô Chọn Kệ.
            </p>
          </div>

          {/* Date & Time (Giờ, phút, ngày) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ngày & Giờ Xuất Kho <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
            </div>
          </div>

          {/* Person Receiver (Searchable select from Settings staff list) */}
          <div>
            <SearchableSelect
              label="Người Lấy Linh Kiện / Nhận Hàng"
              required
              options={staffOptions}
              value={person}
              onChange={(val) => setPerson(val)}
              placeholder="Chọn nhân sự hoặc gõ tên mới..."
              allowCustom={true}
              icon={<User className="w-4 h-4 text-slate-400" />}
            />
          </div>

          {/* Production Order LSX (Searchable select from Settings productionOrders) */}
          <div>
            <SearchableSelect
              label="Mã Lệnh Sản Xuất (LSX)"
              options={settings.productionOrders || []}
              value={productionOrder}
              onChange={(val) => setProductionOrder(val)}
              placeholder="Chọn LSX hoặc gõ mã LSX mới..."
              allowCustom={true}
              icon={<FileCode className="w-4 h-4 text-slate-400" />}
            />
          </div>
        </div>

        {/* Purpose (Searchable select from Settings stockOutPurposes) */}
        <div>
          <SearchableSelect
            label="Mục Đích Xuất Kho"
            options={settings.stockOutPurposes || []}
            value={purpose}
            onChange={(val) => setPurpose(val)}
            placeholder="Chọn mục đích hoặc gõ mục đích mới..."
            allowCustom={true}
            icon={<FileText className="w-4 h-4 text-slate-400" />}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi Chú Chi Tiết</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ghi chú thêm..."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-hidden"
          />
        </div>

        {/* Submit Button */}
        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={isOverStock || !selectedPart || selectedPart.currentStock === 0 || !selectedOutLocation.trim() || quantity <= 0}
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer ${
              !isOverStock && selectedPart && selectedPart.currentStock > 0 && selectedOutLocation.trim() && quantity > 0
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Xác Nhận Xuất Kho</span>
          </button>
        </div>
      </form>
      )}

      {/* QR Scanner Modal */}
      <QrScannerModal
        mode="out"
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        parts={parts}
        onSelectPart={(p) => {
          setSelectedPartId(p.id);
          setIsQrModalOpen(false);
        }}
      />

      {/* POPUP Modal for Auto-Scan Stock Out Verification */}
      <StockOutScanModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        part={scannedPartForModal}
        initialQty={initialScanQty}
        contNumber={scanContNumber}
        settings={settings}
        defaultPerson={person}
        defaultLSX={productionOrder}
        defaultPurpose={purpose}
        onConfirm={({ part, qty, location, person: pPerson, productionOrder: pLSX, purpose: pPurpose, notes: pNotes }) => {
          try {
            const tx = storageService.addStockOut({
              partId: part.id,
              quantity: qty,
              date: new Date().toISOString(),
              person: pPerson,
              productionOrder: pLSX,
              reasonOrPurpose: pPurpose,
              notes: `${pNotes} [📍 Kệ ${location}]`,
              locationId: location,
            });

            // Bắt buộc cập nhật lại currentStock và danh sách locations của linh kiện thông qua storageService.updatePart
            const latestPart = storageService.getPartById(part.id) || storageService.getPartByCode(part.code) || part;
            const partLocs = storageService.getPartLocations(latestPart);
            const activeLocs = partLocs.filter((l) => l.quantity > 0);
            const newLocSummary = storageService.formatPartLocationSummary(activeLocs);
            storageService.updatePart(latestPart.id, {
              currentStock: tx.stockAfter,
              locations: activeLocs,
              location: newLocSummary,
            });

            const nowTimeStr = new Date().toLocaleTimeString('vi-VN');
            setAutoScanHistory((prev) => [
              {
                id: `${part.id}-${Date.now()}`,
                partCode: part.code,
                partName: part.name,
                qty,
                unit: part.unit,
                time: nowTimeStr,
                stockAfter: tx.stockAfter,
              },
              ...prev,
            ]);

            // Mở bảng POPUP thông báo thành công gọn gàng, rõ ràng
            setSuccessModalData({
              isOpen: true,
              partCode: tx.partCode,
              partName: tx.partName,
              qty,
              unit: tx.unit,
              location,
              stockAfter: tx.stockAfter,
              time: nowTimeStr,
              person: pPerson,
              productionOrder: pLSX,
            });

            setMessage(null);
            setIsScanModalOpen(false);
            setScannedPartForModal(null);
            setScannedPartForQuickOut(null);
            onSuccess();
          } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Lỗi khi xuất kho' });
          }
        }}
      />

      {/* Printable BOM Dispatch Order Sheet Modal */}
      {bomPrintModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-4 animate-in zoom-in-95">
            {/* Header */}
            <div className="bg-gradient-to-r from-pink-700 to-rose-700 text-white p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-300 text-amber-950 rounded-2xl font-black">
                  <Printer className="w-6 h-6 text-amber-900" />
                </div>
                <div>
                  <span className="px-2.5 py-0.5 bg-amber-300 text-amber-950 text-[10px] font-extrabold rounded-md uppercase tracking-wide">
                    PHIẾU SOẠN HÀNG XUẤT KHO FIFO
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-white mt-0.5">
                    Phiếu Lệnh Xuất Kho Theo Model {bomPrintModalData.modelName}
                  </h2>
                </div>
              </div>

              <button
                onClick={() => setBomPrintModalData(null)}
                className="p-2 text-rose-100 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto text-slate-800 text-xs">
              <div className="p-4 bg-pink-50 border border-pink-200 rounded-2xl flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  {bomPrintModalData.voucherCode && (
                    <span className="px-2.5 py-1 bg-pink-200 text-pink-900 font-mono font-black text-xs rounded-md inline-block mb-1">
                      Mã Phiếu: {bomPrintModalData.voucherCode}
                    </span>
                  )}
                  <p className="text-slate-600">Model (Lệnh SX): <strong className="text-pink-900 text-sm">{bomPrintModalData.modelName}</strong></p>
                  <p className="text-slate-600">Người lập / xuất kho: <strong className="text-slate-900">{bomPrintModalData.person}</strong></p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-slate-600">Số lượng sản xuất: <strong className="text-pink-700 text-base font-black">{bomPrintModalData.modelQty} Bộ</strong></p>
                  <p className="text-slate-500 text-[11px]">Thời gian xuất: {new Date(bomPrintModalData.dateTime).toLocaleString('vi-VN')}</p>
                </div>
              </div>

              {/* Items List Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px]">
                    <tr>
                      <th className="p-3 text-center w-10">STT</th>
                      <th className="p-3">Mã Linh Kiện</th>
                      <th className="p-3">Tên Linh Kiện</th>
                      <th className="p-3 text-center">ĐVT</th>
                      <th className="p-3 text-right">Định Mức</th>
                      <th className="p-3 text-right">SL Cần Xuất</th>
                      <th className="p-3 text-right text-emerald-800 bg-emerald-50">Đã Thực Xuất</th>
                      <th className="p-3 text-right text-rose-800 bg-rose-50">Chờ Xuất Bù</th>
                      <th className="p-3 text-blue-900 bg-blue-50">Vị Trí Kệ Lấy Hàng (FIFO)</th>
                      <th className="p-3 text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bomPrintModalData.items.map((item, idx) => {
                      const req = item.requiredQty ?? (item.bomQtyPerSet * (bomPrintModalData.modelQty || 1));
                      const exp = item.exportedQty ?? item.totalQtyOut ?? 0;
                      const rem = item.remainingQty ?? Math.max(0, req - exp);

                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                          <td className="p-3 font-mono font-bold text-blue-700">
                            <div className="flex items-center space-x-1">
                              <span>{item.partCode}</span>
                              {item.isExtraConsumable && (
                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-black rounded border border-purple-200">
                                  Tiêu hao
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 font-semibold text-slate-900">
                            {item.partName}
                            {item.isExtraConsumable && item.extraNote && (
                              <span className="block text-[10px] text-purple-600 italic">
                                ({item.extraNote})
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center text-slate-600">{item.unit}</td>
                          <td className="p-3 text-right font-medium text-slate-600">
                            {item.isExtraConsumable ? (
                              <span className="text-purple-600 font-bold italic">Tiêu hao</span>
                            ) : (
                              item.bomQtyPerSet
                            )}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-800">{req.toLocaleString('vi-VN')}</td>
                          <td className="p-3 text-right font-black text-emerald-700 bg-emerald-50/50">
                            {exp.toLocaleString('vi-VN')}
                          </td>
                          <td className="p-3 text-right font-black bg-rose-50/50">
                            {rem > 0 ? (
                              <span className="text-rose-700">-{rem.toLocaleString('vi-VN')}</span>
                            ) : (
                              <span className="text-emerald-700">0 (Đủ)</span>
                            )}
                          </td>
                          <td className="p-3 font-bold text-blue-900 bg-blue-50/50">
                            📍 {item.fifoLocation}
                          </td>
                          <td className="p-3 text-center">
                            {rem === 0 ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">Đủ 100%</span>
                            ) : exp > 0 ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Xuất 1 phần</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">Nợ 100%</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-slate-500 text-xs font-medium">
                * Phiếu in sẵn sàng để bộ phận kho đi soạn hàng theo đúng kệ vị trí FIFO.
              </span>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setBomPrintModalData(null)}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl font-bold cursor-pointer transition-colors"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => handleExportVoucherExcel(bomPrintModalData)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold cursor-pointer transition-all flex items-center space-x-2 shadow-md active:scale-95"
                  title="Xuất bảng soạn hàng ra file Excel (.xlsx) với cấu trúc cột y chang bản in"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                  <span>📊 XUẤT EXCEL (.XLSX)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const html = `
                      <div style="padding: 24px; font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #0f172a;">
                        <div style="text-align: center; border-bottom: 3px double #1e3a8a; padding-bottom: 12px; margin-bottom: 20px;">
                          <h2 style="margin: 0; font-size: 20px; font-weight: 800; text-transform: uppercase; color: #1e3a8a; letter-spacing: 0.5px;">PHIẾU XUẤT KHO & SOẠN HÀNG THEO MODEL (BOM)</h2>
                          ${bomPrintModalData.voucherCode ? `<p style="margin: 4px 0 0 0; font-size: 14px; font-family: monospace; font-weight: bold; color: #1e3a8a;">[ MÃ PHIẾU: ${bomPrintModalData.voucherCode} ${bomPrintModalData.status === 'PARTIAL' ? '- ĐANG XUẤT BÙ' : '- ĐÃ HOÀN THÀNH'} ]</p>` : ''}
                          <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569; font-style: italic;">Quản Lý Kho Linh Kiện - Cơ Chế Xuất Kho Từng Phần / Xuất Bù Nối Đuôi Chuẩn FIFO</p>
                        </div>

                        <table style="width: 100%; font-size: 13px; margin-bottom: 20px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 6px 0;"><strong>Tên Model (Lệnh SX):</strong> <span style="font-size: 15px; font-weight: bold; color: #1e40af;">${bomPrintModalData.modelName}</span></td>
                            <td style="padding: 6px 0; text-align: right;"><strong>Số Lượng Sản Xuất:</strong> <span style="font-size: 16px; font-weight: 900; color: #be185d;">${bomPrintModalData.modelQty} Bộ</span></td>
                          </tr>
                          <tr>
                            <td style="padding: 6px 0;"><strong>Thời Gian Thực Hiện:</strong> ${new Date(bomPrintModalData.dateTime).toLocaleString('vi-VN')}</td>
                            <td style="padding: 6px 0; text-align: right;"><strong>Người Lập / Soạn Hàng:</strong> ${bomPrintModalData.person}</td>
                          </tr>
                          <tr>
                            <td style="padding: 6px 0;"><strong>Trạng Thái Phiếu:</strong> <span style="font-weight: bold; color: ${bomPrintModalData.status === 'PARTIAL' ? '#b45309' : '#15803d'};">${bomPrintModalData.status === 'PARTIAL' ? 'ĐANG XUẤT BÙ' : 'ĐÃ HOÀN THÀNH 100%'}</span></td>
                            <td style="padding: 6px 0; text-align: right;"><strong>Số Đợt Xuất:</strong> Đợt ${bomPrintModalData.dispatchRounds || 1}</td>
                          </tr>
                        </table>

                        <table style="width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #cbd5e1;">
                          <thead>
                            <tr style="background-color: #f1f5f9; color: #0f172a; font-weight: bold; text-align: left;">
                              <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; width: 30px;">STT</th>
                              <th style="border: 1px solid #cbd5e1; padding: 6px; width: 130px;">Mã Linh Kiện</th>
                              <th style="border: 1px solid #cbd5e1; padding: 6px;">Tên Linh Kiện</th>
                              <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; width: 40px;">ĐVT</th>
                              <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; width: 55px;">Định Mức</th>
                              <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; width: 70px;">Cần Xuất</th>
                              <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; width: 75px; color: #15803d; background-color: #f0fdf4;">Đã Thực Xuất</th>
                              <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; width: 75px; color: #be123c; background-color: #fff1f2;">Chờ Xuất Bù</th>
                              <th style="border: 1px solid #cbd5e1; padding: 6px; color: #1e40af; background-color: #eff6ff;">Vị Trí Kệ (FIFO)</th>
                              <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; width: 55px;">Đã Lấy</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${bomPrintModalData.items.map((item, idx) => {
                              const req = item.requiredQty ?? (item.bomQtyPerSet * (bomPrintModalData.modelQty || 1));
                              const exp = item.exportedQty ?? item.totalQtyOut ?? 0;
                              const rem = item.remainingQty ?? Math.max(0, req - exp);
                              return `
                                <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
                                  <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold;">${idx + 1}</td>
                                  <td style="border: 1px solid #cbd5e1; padding: 6px; font-family: monospace; font-weight: bold; color: #1d4ed8;">${item.partCode}</td>
                                  <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: 600;">${item.partName} ${item.isExtraConsumable ? `<span style="font-size: 9px; padding: 1px 4px; background-color: #f3e8ff; color: #7e22ce; border-radius: 4px; font-weight: bold; margin-left: 4px;">Tiêu hao</span>` : ''}</td>
                                  <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${item.unit}</td>
                                  <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: right;">${item.isExtraConsumable ? '<span style="color: #7e22ce; font-style: italic;">Tiêu hao</span>' : item.bomQtyPerSet}</td>
                                  <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; font-weight: bold;">${req.toLocaleString('vi-VN')}</td>
                                  <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; font-weight: bold; color: #15803d; background-color: #f0fdf4;">${exp.toLocaleString('vi-VN')}</td>
                                  <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; font-weight: bold; color: ${rem > 0 ? '#be123c' : '#15803d'}; background-color: ${rem > 0 ? '#fff1f2' : '#f0fdf4'};">${rem > 0 ? `-${rem.toLocaleString('vi-VN')}` : '0 (Đủ)'}</td>
                                  <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; color: #1e40af; background-color: #eff6ff;">📍 ${item.fifoLocation}</td>
                                  <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-size: 10px; color: #94a3b8;">[ &nbsp; ]</td>
                                </tr>
                              `;
                            }).join('')}
                          </tbody>
                        </table>

                        <div style="margin-top: 28px; display: flex; justify-content: space-between; font-size: 12px; text-align: center; page-break-inside: avoid;">
                          <div style="width: 30%;">
                            <p style="margin: 0; font-weight: bold;">Người Soạn Hàng</p>
                            <p style="margin: 4px 0 0 0; font-size: 10px; color: #64748b;">(Ký & ghi rõ họ tên)</p>
                            <div style="height: 55px;"></div>
                            <p style="margin: 0; font-weight: 600;">${bomPrintModalData.person}</p>
                          </div>
                          <div style="width: 30%;">
                            <p style="margin: 0; font-weight: bold;">Thủ Kho Xuất Hàng</p>
                            <p style="margin: 4px 0 0 0; font-size: 10px; color: #64748b;">(Ký & ghi rõ họ tên)</p>
                            <div style="height: 55px;"></div>
                          </div>
                          <div style="width: 30%;">
                            <p style="margin: 0; font-weight: bold;">Đơn Vị Nhận Hàng (SX)</p>
                            <p style="margin: 4px 0 0 0; font-size: 10px; color: #64748b;">(Ký & ghi rõ họ tên)</p>
                            <div style="height: 55px;"></div>
                          </div>
                        </div>
                      </div>
                    `;
                    printHtml(html);
                  }}
                  className="px-6 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-bold cursor-pointer transition-all flex items-center space-x-2 shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  <span>🖨 IN PHIẾU SOẠN HÀNG (PRINT)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Excel Stock Out FIFO Modal */}
      <ExcelStockOutFifoModal
        isOpen={isExcelOutModalOpen}
        onClose={() => {
          setIsExcelOutModalOpen(false);
          setExcelOutFile(null);
        }}
        parts={parts}
        settings={settings}
        initialFile={excelOutFile}
        onSuccess={() => {
          onSuccess();
          setIsExcelOutModalOpen(false);
          setExcelOutFile(null);
        }}
      />

      {/* POPUP THÔNG BÁO XUẤT KHO THÀNH CÔNG */}
      {successModalData && successModalData.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border-2 border-emerald-400 space-y-5 animate-in zoom-in-95 duration-150 text-center relative">
            {/* Close 'X' Button */}
            <button
              type="button"
              onClick={() => {
                setSuccessModalData(null);
                const scanInput = document.querySelector('input[placeholder*="Bắn súng quét mã"]') as HTMLInputElement;
                scanInput?.focus();
              }}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Icon & Title */}
            <div className="space-y-2">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10 animate-bounce" />
              </div>
              <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-black rounded-full uppercase tracking-wider inline-block">
                Giao Dịch Đã Ghi Nhận
              </span>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                XUẤT KHO THÀNH CÔNG!
              </h3>
            </div>

            {/* Part & Quantity Highlight Card */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold">Mã linh kiện:</span>
                <span className="font-mono font-black text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                  [{successModalData.partCode}]
                </span>
              </div>

              <div>
                <span className="text-xs text-slate-500 font-semibold block">Tên linh kiện:</span>
                <span className="font-bold text-slate-900 text-sm block mt-0.5">
                  {successModalData.partName}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <span className="text-xs text-slate-600 font-bold">Số lượng xuất:</span>
                <span className="font-mono font-black text-xl text-emerald-600">
                  -{successModalData.qty.toLocaleString('vi-VN')} {successModalData.unit}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 font-semibold">Vị trí kệ đã trừ:</span>
                <span className="font-bold text-xs text-blue-900 bg-blue-100/70 px-2.5 py-1 rounded-lg border border-blue-200">
                  📍 {successModalData.location}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 font-semibold">Tồn kho còn lại:</span>
                <span className="font-mono font-black text-sm text-slate-900">
                  {successModalData.stockAfter.toLocaleString('vi-VN')} {successModalData.unit}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span>Người xuất: <strong>{successModalData.person}</strong></span>
                <span>🕒 {successModalData.time}</span>
              </div>
            </div>

            {/* Confirm button to continue scanning */}
            <button
              type="button"
              autoFocus
              onClick={() => {
                setSuccessModalData(null);
                const scanInput = document.querySelector('input[placeholder*="Bắn súng quét mã"]') as HTMLInputElement;
                scanInput?.focus();
              }}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2 active:scale-95"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>TIẾP TỤC QUÉT MÃ MỚI (ENTER)</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL THÊM LINH KIỆN TIÊU HAO NGOÀI ĐỊNH MỨC (BOM) VỚI FUZZY SEARCH */}
      {isAddExtraModalOpen && (() => {
        let filteredParts = parts;
        if (extraCategoryFilter === 'IN_STOCK') {
          filteredParts = filteredParts.filter((p) => p.currentStock > 0);
        } else if (extraCategoryFilter === 'FASTENER') {
          filteredParts = filteredParts.filter((p) => matchesFuzzy(`${p.code} ${p.name}`, 'oc vit bulong'));
        } else if (extraCategoryFilter === 'TAPE') {
          filteredParts = filteredParts.filter((p) => matchesFuzzy(`${p.code} ${p.name}`, 'bang dinh bang keo'));
        } else if (extraCategoryFilter === 'CABLE') {
          filteredParts = filteredParts.filter((p) => matchesFuzzy(`${p.code} ${p.name}`, 'day cap giac jack'));
        } else if (extraCategoryFilter === 'PACKAGING') {
          filteredParts = filteredParts.filter((p) => matchesFuzzy(`${p.code} ${p.name}`, 'thung bao bi mang hop'));
        }

        if (extraSearchQuery.trim()) {
          filteredParts = filteredParts.filter((p) => {
            const target = `${p.code} ${p.name} ${p.location || ''} ${p.unit}`;
            return matchesFuzzy(target, extraSearchQuery);
          });
        }

        const displayedMatchingParts = filteredParts.slice(0, 50);

        const handleConfirmAddExtra = () => {
          if (!selectedExtraPart) {
            setMessage({ type: 'error', text: 'Vui lòng chọn linh kiện cần thêm tiêu hao!' });
            return;
          }
          if (extraQuantity <= 0) {
            setMessage({ type: 'error', text: 'Số lượng tiêu hao thêm phải lớn hơn 0!' });
            return;
          }
          if (extraQuantity > selectedExtraPart.currentStock) {
            setMessage({
              type: 'error',
              text: `Số lượng tiêu hao thêm (${extraQuantity} ${selectedExtraPart.unit}) vượt quá tồn kho hiện tại (${selectedExtraPart.currentStock} ${selectedExtraPart.unit})!`,
            });
            return;
          }

          const newExtraItem: ExtraBomItem = {
            id: 'extra-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
            partId: selectedExtraPart.id,
            partCode: selectedExtraPart.code,
            partName: selectedExtraPart.name,
            unit: selectedExtraPart.unit,
            qty: extraQuantity,
            note: extraReason.trim() || 'Tiêu hao thêm ngoài định mức',
            currentStock: selectedExtraPart.currentStock,
            location: selectedExtraPart.location || 'Kho chính',
          };

          setExtraBomItems((prev) => [...prev, newExtraItem]);
          setBomChecks((prev) => ({ ...prev, [newExtraItem.id]: true }));
          setCustomOutQuantities((prev) => ({ ...prev, [newExtraItem.id]: extraQuantity }));
          setIsAddExtraModalOpen(false);
          setSelectedExtraPart(null);
          setExtraSearchQuery('');

          setMessage({
            type: 'success',
            text: `✅ Đã thêm linh kiện tiêu hao [${selectedExtraPart.code}] ${selectedExtraPart.name} (+${extraQuantity} ${selectedExtraPart.unit}) vào danh sách xuất BOM!`,
          });
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-xs">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-base flex items-center space-x-2">
                      <span>THÊM LINH KIỆN TIÊU HAO NGOÀI ĐỊNH MỨC</span>
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-black rounded-full uppercase">
                        BOM Model
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Tìm kiếm thông minh (Fuzzy Search không dấu) linh kiện từ toàn kho để bổ sung tiêu hao thêm.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddExtraModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Fuzzy Search Box & Category Filters */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    value={extraSearchQuery}
                    onChange={(e) => setExtraSearchQuery(e.target.value)}
                    placeholder="Gõ tìm kiếm fuzzy: mã, tên, vị trí... (Ví dụ: bang dinh, oc vit, sha76, adapter...)"
                    className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-purple-500 outline-hidden transition-all"
                  />
                  {extraSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setExtraSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Quick Filters */}
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {[
                    { id: 'ALL', label: 'Tất cả' },
                    { id: 'IN_STOCK', label: '⚡ Còn tồn kho' },
                    { id: 'FASTENER', label: 'Ốc / Bulong' },
                    { id: 'TAPE', label: 'Băng dính / Keo' },
                    { id: 'CABLE', label: 'Dây / Giắc cắm' },
                    { id: 'PACKAGING', label: 'Bao bì / Thùng' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setExtraCategoryFilter(cat.id as any)}
                      className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                        extraCategoryFilter === cat.id
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                  <span className="ml-auto text-slate-400 font-semibold self-center">
                    Tìm thấy: {filteredParts.length} linh kiện
                  </span>
                </div>
              </div>

              {/* Search Results List */}
              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl p-1.5 max-h-48 divide-y divide-slate-100 bg-slate-50/50">
                {displayedMatchingParts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 font-medium">
                    Không tìm thấy linh kiện nào phù hợp với từ khóa "{extraSearchQuery}"
                  </div>
                ) : (
                  displayedMatchingParts.map((part) => {
                    const isSelected = selectedExtraPart?.id === part.id;
                    const isZeroStock = part.currentStock <= 0;
                    return (
                      <div
                        key={part.id}
                        onClick={() => setSelectedExtraPart(part)}
                        className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-purple-100/70 border border-purple-400 shadow-xs'
                            : 'hover:bg-white border border-transparent'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-black text-xs text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                              {part.code}
                            </span>
                            <span className="font-bold text-xs text-slate-900 truncate">
                              {part.name}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center space-x-2">
                            <span>Vị trí: <strong>{part.location || 'Kho chính'}</strong></span>
                            <span>•</span>
                            <span>ĐVT: <strong>{part.unit}</strong></span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <span
                            className={`px-2 py-1 rounded-lg text-xs font-mono font-black ${
                              isZeroStock
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            }`}
                          >
                            Tồn: {part.currentStock.toLocaleString('vi-VN')} {part.unit}
                          </span>
                          <button
                            type="button"
                            className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-purple-700 text-white'
                                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                            }`}
                          >
                            {isSelected ? 'Đã Chọn' : 'Chọn'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Selected Part Details & Extra Quantity Configuration */}
              {selectedExtraPart && (
                <div className="p-3.5 bg-purple-50/70 rounded-2xl border border-purple-300 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-purple-700 block">Linh kiện đã chọn:</span>
                      <strong className="text-xs sm:text-sm font-black text-slate-900">
                        [{selectedExtraPart.code}] {selectedExtraPart.name}
                      </strong>
                    </div>
                    <span className="text-xs font-black text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-xl border border-emerald-300">
                      Tồn kho: {selectedExtraPart.currentStock.toLocaleString('vi-VN')} {selectedExtraPart.unit}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-purple-200">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-slate-700">
                          Số lượng tiêu hao thêm <span className="text-red-500">*</span>
                        </label>
                        <div className="flex space-x-1">
                          {[1, 5, 10].map((step) => (
                            <button
                              key={step}
                              type="button"
                              onClick={() => setExtraQuantity((prev) => Math.min(selectedExtraPart.currentStock, (prev || 0) + step))}
                              className="px-1.5 py-0.5 bg-white hover:bg-purple-100 text-purple-700 border border-purple-300 rounded text-[10px] font-bold cursor-pointer"
                            >
                              +{step}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setExtraQuantity(selectedExtraPart.currentStock)}
                            className="px-1.5 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 rounded text-[10px] font-bold cursor-pointer"
                          >
                            Max
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min={1}
                          max={selectedExtraPart.currentStock}
                          value={extraQuantity}
                          onChange={(e) => setExtraQuantity(Math.max(1, Math.min(selectedExtraPart.currentStock, Number(e.target.value) || 1)))}
                          className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl text-sm font-bold text-center text-purple-900 focus:ring-2 focus:ring-purple-500 outline-hidden"
                        />
                        <span className="text-xs font-bold text-slate-600 shrink-0 w-8">
                          {selectedExtraPart.unit}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Lý do / Hạng mục tiêu hao:
                      </label>
                      <input
                        type="text"
                        value={extraReason}
                        onChange={(e) => setExtraReason(e.target.value)}
                        placeholder="Vd: Tiêu hao thêm lắp ráp, Hỏng hóc sx, Bù hao hụt..."
                        className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-purple-500 outline-hidden"
                      />
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {['Tiêu hao thêm lắp ráp', 'Bù hỏng hóc sản xuất', 'Vật tư đóng gói thêm'].map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setExtraReason(tag)}
                            className="text-[10px] font-medium text-purple-700 bg-white hover:bg-purple-100 px-2 py-0.5 rounded border border-purple-200 cursor-pointer"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddExtraModalOpen(false)}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  Hủy / Đóng
                </button>
                <button
                  type="button"
                  disabled={!selectedExtraPart || extraQuantity <= 0 || extraQuantity > (selectedExtraPart?.currentStock || 0)}
                  onClick={handleConfirmAddExtra}
                  className="px-5 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md cursor-pointer transition-all flex items-center space-x-2 active:scale-95"
                >
                  <PlusCircle className="w-4 h-4 text-purple-200" />
                  <span>+ Xác Nhận Thêm Vào Phiếu Xuất BOM</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
