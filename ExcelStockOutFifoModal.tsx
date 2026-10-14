import React, { useState, useRef, useEffect } from 'react';
import { Part, AppSettings, BomExportVoucher } from './types';
import { storageService } from './storage';
import { soundEffects } from './soundEffects';
import {
  parseStockOutExcel,
  StockOutExcelItem,
  ParsedStockOutResult,
  downloadSampleStockOutExcel,
  FifoLotAllocation,
} from './excelStockInOutParser';
import {
  X,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Package,
  ArrowUpRight,
  Calendar,
  User,
  MapPin,
  Download,
  Search,
  Zap,
  Clock,
  Printer,
  RefreshCw,
  Info,
} from 'lucide-react';
import { SearchableSelect } from './SearchableSelect';
import { printHtml } from './printHelper';

interface ExcelStockOutFifoModalProps {
  isOpen: boolean;
  onClose: () => void;
  parts: Part[];
  settings: AppSettings;
  onSuccess: () => void;
  initialFile?: File | null;
}

const getNowLocalDateTime = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
};

const generateDefaultVoucherCode = () => {
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const vouchers = storageService.getBomExportVouchers();
  const count = vouchers.filter((v) => v.createdAt?.startsWith(new Date().toISOString().slice(0, 10))).length + 1;
  return `PXK-EXCEL-${todayStr}-${String(count).padStart(3, '0')}`;
};

export const ExcelStockOutFifoModal: React.FC<ExcelStockOutFifoModalProps> = ({
  isOpen,
  onClose,
  parts,
  settings,
  onSuccess,
  initialFile,
}) => {
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [parsedData, setParsedData] = useState<ParsedStockOutResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'enough' | 'shortage'>('all');

  // Form states
  const currentUser = storageService.getCurrentUser();
  const currentUserName = currentUser
    ? `${currentUser.fullName}${currentUser.roleTitle ? ` (${currentUser.roleTitle})` : ''}`
    : (settings.staffList?.[0] || 'Lê Hoàng Nam (Xưởng 1)');

  const [person, setPerson] = useState(currentUserName);
  const [productionOrder, setProductionOrder] = useState(
    settings.productionOrders?.[0] || 'LSX-2026-HL288'
  );
  const [purpose, setPurpose] = useState(
    settings.stockOutPurposes?.[0] || 'Sản xuất theo đơn hàng'
  );
  const [dateTime, setDateTime] = useState(getNowLocalDateTime());
  const [generalNotes, setGeneralNotes] = useState('');

  // Customizable Voucher Code & Title (Người dùng có thể tự đặt tên để dễ nhận biết lúc bóc tách)
  const [customVoucherCode, setCustomVoucherCode] = useState(generateDefaultVoucherCode);
  const [customVoucherTitle, setCustomVoucherTitle] = useState('');

  // Editable items
  const [items, setItems] = useState<StockOutExcelItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successReport, setSuccessReport] = useState<{
    voucherCode: string;
    voucherTitle: string;
    totalExportedParts: number;
    totalQuantity: number;
    items: Array<{
      partCode: string;
      partName: string;
      unit: string;
      bomQtyPerSet: number;
      totalQtyOut: number;
      fifoLocation: string;
    }>;
    person: string;
    dateTime: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialFile) {
      handleFileSelected(initialFile);
    }
  }, [initialFile]);

  const handleFileSelected = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsLoading(true);
    setSuccessReport(null);
    try {
      const result = await parseStockOutExcel(selectedFile, parts);
      setParsedData(result);
      setItems(result.items);
      if (!customVoucherTitle) {
        const cleanName = selectedFile.name.replace(/\.[^/.]+$/, '');
        setCustomVoucherTitle(`Xuất theo file: ${cleanName}`);
      }
      soundEffects.playSuccessTingTing();
    } catch (err: any) {
      soundEffects.playErrorBuzzer();
      alert(`Lỗi khi đọc file Excel xuất kho: ${err.message || 'Không thể đọc file'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls')) {
        handleFileSelected(droppedFile);
      } else {
        alert('Vui lòng chọn file Excel có đuôi .xlsx hoặc .xls');
      }
    }
  };

  // Toggle item selection
  const handleToggleSelect = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleToggleSelectAll = (select: boolean) => {
    setItems((prev) =>
      prev.map((item) => (item.isValid ? { ...item, selected: select } : item))
    );
  };

  // Update item requested quantity & recompute FIFO
  const handleUpdateItemQty = (id: string, newQty: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const currentStock = item.matchedPart ? item.matchedPart.currentStock : 0;
        const hasEnoughStock = Boolean(item.matchedPart && currentStock >= newQty && newQty > 0);
        const shortageQty = item.matchedPart ? Math.max(0, newQty - currentStock) : newQty;
        const isValid = Boolean(item.matchedPart && hasEnoughStock && newQty > 0);

        // Recompute allocations
        let fifoAllocations: FifoLotAllocation[] = [];
        if (item.matchedPart && newQty > 0) {
          const fifoLots = storageService.getPartFifoLots(item.matchedPart.id);
          const activeLots = fifoLots.filter((lot) => lot.remainingQty > 0);
          let remainingNeed = newQty;

          for (const lot of activeLots) {
            if (remainingNeed <= 0) break;
            const allocQty = Math.min(lot.remainingQty, remainingNeed);
            fifoAllocations.push({
              lotId: lot.id,
              contNumber: lot.contNumber,
              locationName: lot.locationName || item.matchedPart.location?.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính',
              importDate: lot.importDate,
              availableQty: lot.remainingQty,
              allocatedQty: allocQty,
            });
            remainingNeed -= allocQty;
          }

          if (remainingNeed > 0 && item.matchedPart.currentStock >= newQty) {
            fifoAllocations.push({
              lotId: `fallback-${item.matchedPart.id}`,
              contNumber: 'Tồn Kho Vị Trí',
              locationName: item.matchedPart.location?.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính',
              importDate: item.matchedPart.createdAt || new Date().toISOString(),
              availableQty: item.matchedPart.currentStock,
              allocatedQty: remainingNeed,
            });
          }
        }

        return {
          ...item,
          quantity: newQty,
          hasEnoughStock,
          shortageQty,
          isValid,
          fifoAllocations,
          errorMessage: !hasEnoughStock ? `Thiếu ${shortageQty.toLocaleString('vi-VN')} ${item.unit}` : undefined,
        };
      })
    );
  };

  // Print voucher helper
  const handlePrintCurrentVoucher = () => {
    if (!successReport) return;
    const html = `
      <div style="padding: 24px; font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #0f172a;">
        <div style="text-align: center; border-bottom: 3px double #1e3a8a; padding-bottom: 12px; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; text-transform: uppercase; color: #1e3a8a; letter-spacing: 0.5px;">PHIẾU XUẤT KHO & SOẠN HÀNG (FIFO)</h2>
          <p style="margin: 4px 0 0 0; font-size: 15px; font-family: monospace; font-weight: bold; color: #1e40af;">[ MÃ PHIẾU: ${successReport.voucherCode} ]</p>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569; font-style: italic;">Phiếu xuất kho theo danh sách Excel - Phân bổ chuẩn FIFO</p>
        </div>

        <table style="width: 100%; font-size: 13px; margin-bottom: 20px; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0;"><strong>Tên Phiếu / Ghi Chú:</strong> <span style="font-size: 14px; font-weight: bold; color: #1e40af;">${successReport.voucherTitle}</span></td>
            <td style="padding: 6px 0; text-align: right;"><strong>Tổng Số Lượng:</strong> <span style="font-size: 16px; font-weight: 900; color: #be185d;">${successReport.totalQuantity.toLocaleString('vi-VN')}</span></td>
          </tr>
          <tr>
            <td style="padding: 6px 0;"><strong>Thời Gian Xuất:</strong> ${new Date(successReport.dateTime).toLocaleString('vi-VN')}</td>
            <td style="padding: 6px 0; text-align: right;"><strong>Người Lập / Xuất:</strong> ${successReport.person}</td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #cbd5e1;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #0f172a; font-weight: bold; text-align: left;">
              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 35px;">STT</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 140px;">Mã Linh Kiện</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px;">Tên Linh Kiện</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 45px;">ĐVT</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: right; width: 85px; color: #15803d; background-color: #f0fdf4;">SL Đề Nghị</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; color: #1e40af; background-color: #eff6ff;">Vị Trí Kệ Soạn Hàng (FIFO)</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 65px;">Đã Lấy</th>
            </tr>
          </thead>
          <tbody>
            ${successReport.items
              .map(
                (item, idx) => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; font-weight: bold;">${idx + 1}</td>
                <td style="border: 1px solid #cbd5e1; padding: 8px; font-family: monospace; font-weight: bold; color: #1d4ed8;">${item.partCode}</td>
                <td style="border: 1px solid #cbd5e1; padding: 8px;">${item.partName}</td>
                <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">${item.unit}</td>
                <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right; font-weight: bold; color: #15803d; background-color: #f0fdf4;">${item.totalQtyOut.toLocaleString('vi-VN')}</td>
                <td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold; color: #1e40af; background-color: #eff6ff;">📍 ${item.fifoLocation}</td>
                <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">[ &nbsp; ]</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; margin-top: 36px; padding: 0 20px; font-size: 13px; text-align: center;">
          <div>
            <p style="margin: 0; font-weight: bold;">Người Lập Phiếu</p>
            <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">(Ký, ghi rõ họ tên)</p>
            <div style="height: 60px;"></div>
            <p style="margin: 0; font-weight: bold;">${successReport.person}</p>
          </div>
          <div>
            <p style="margin: 0; font-weight: bold;">Thủ Kho Xuất Hàng</p>
            <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">(Ký, ghi rõ họ tên)</p>
            <div style="height: 60px;"></div>
            <p style="margin: 0; font-weight: bold;">...........................</p>
          </div>
          <div>
            <p style="margin: 0; font-weight: bold;">Người Nhận / Bóc Tách</p>
            <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">(Ký, ghi rõ họ tên)</p>
            <div style="height: 60px;"></div>
            <p style="margin: 0; font-weight: bold;">...........................</p>
          </div>
        </div>
      </div>
    `;
    printHtml(html);
  };

  // Confirm stock out according to FIFO
  const handleConfirmStockOut = () => {
    const selectedItems = items.filter((i) => i.selected && i.isValid && i.matchedPart);
    if (selectedItems.length === 0) {
      alert('Vui lòng chọn ít nhất một linh kiện hợp lệ có đủ tồn kho để xuất!');
      return;
    }

    if (!person.trim()) {
      alert('Vui lòng nhập tên người lấy / người thực hiện xuất kho!');
      return;
    }

    setIsSubmitting(true);
    let totalQtyOut = 0;
    const nowIso = new Date(dateTime).toISOString();
    const finalVoucherCode = (customVoucherCode.trim() || generateDefaultVoucherCode()).toUpperCase();
    const finalVoucherTitle = customVoucherTitle.trim() || (file ? `Xuất theo file: ${file.name}` : 'Phiếu Xuất Kho Excel');

    try {
      const voucherItems: Array<{
        partCode: string;
        partName: string;
        unit: string;
        bomQtyPerSet: number;
        totalQtyOut: number;
        fifoLocation: string;
      }> = [];

      for (const item of selectedItems) {
        if (!item.matchedPart) continue;

        // Perform stock out allocations sequentially by FIFO
        if (item.fifoAllocations && item.fifoAllocations.length > 0) {
          for (const alloc of item.fifoAllocations) {
            if (alloc.allocatedQty <= 0) continue;
            storageService.addStockOut({
              partId: item.matchedPart.id,
              quantity: alloc.allocatedQty,
              date: nowIso,
              person: person.trim(),
              productionOrder: productionOrder.trim() || 'LSX-XUAT-EXCEL',
              reasonOrPurpose: purpose.trim() || 'Xuất theo file Excel (FIFO)',
              notes: `Xuất FIFO từ ${alloc.locationName} (${alloc.contNumber}) - Phiếu: ${finalVoucherCode}`,
              locationId: alloc.locationName,
              voucherCode: finalVoucherCode,
              voucherTitle: finalVoucherTitle,
              sourceBin: alloc.locationName,
              fifoAllocations: [alloc],
            });
          }
        } else {
          // Fallback if no specific FIFO lot breakdown
          storageService.addStockOut({
            partId: item.matchedPart.id,
            quantity: item.quantity,
            date: nowIso,
            person: person.trim(),
            productionOrder: productionOrder.trim() || 'LSX-XUAT-EXCEL',
            reasonOrPurpose: purpose.trim() || 'Xuất theo file Excel (FIFO)',
            notes: `Xuất kho FIFO từ file Excel - Phiếu: ${finalVoucherCode}`,
            locationId: item.matchedPart.location,
            voucherCode: finalVoucherCode,
            voucherTitle: finalVoucherTitle,
            sourceBin: item.matchedPart.location,
            fifoAllocations: item.fifoAllocations,
          });
        }

        totalQtyOut += item.quantity;

        // Format FIFO locations summary
        const fifoLocSummary = item.fifoAllocations && item.fifoAllocations.length > 0
          ? item.fifoAllocations.map((a) => `${a.locationName} (${a.allocatedQty})`).join(', ')
          : (item.matchedPart.location || 'Kho chính');

        voucherItems.push({
          partCode: item.partCode,
          partName: item.partName,
          unit: item.unit,
          bomQtyPerSet: item.quantity,
          totalQtyOut: item.quantity,
          fifoLocation: fifoLocSummary,
        });
      }

      // Save voucher history
      try {
        const vouchers = storageService.getBomExportVouchers();
        const newVoucher: BomExportVoucher = {
          id: 'vch-' + Date.now(),
          voucherCode: finalVoucherCode,
          modelName: finalVoucherTitle,
          modelQty: 1,
          dateTime: nowIso,
          person: person.trim(),
          items: voucherItems,
          totalPartsCount: selectedItems.length,
          totalQtyOut: Math.round(totalQtyOut * 100) / 100,
          createdAt: nowIso,
          voucherType: 'EXCEL',
          status: 'ACTIVE',
          notes: generalNotes.trim() || `Xuất file: ${file?.name || ''}`,
        };
        vouchers.unshift(newVoucher);
        storageService.saveBomExportVouchers(vouchers);
      } catch {
        // Ignore fallback
      }

      soundEffects.playSuccessTingTing();
      setSuccessReport({
        voucherCode: finalVoucherCode,
        voucherTitle: finalVoucherTitle,
        totalExportedParts: selectedItems.length,
        totalQuantity: Math.round(totalQtyOut * 100) / 100,
        items: voucherItems,
        person: person.trim(),
        dateTime: nowIso,
      });

      onSuccess();
    } catch (err: any) {
      soundEffects.playErrorBuzzer();
      alert(`Lỗi trong quá trình xuất kho FIFO: ${err.message || 'Lỗi không xác định'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Filtered items
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      !searchTerm ||
      item.partCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.partName.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === 'enough') return item.hasEnoughStock;
    if (filterType === 'shortage') return !item.hasEnoughStock;
    return true;
  });

  const selectedCount = items.filter((i) => i.selected && i.isValid).length;
  const totalSelectedQty = items
    .filter((i) => i.selected && i.isValid)
    .reduce((sum, i) => sum + i.quantity, 0);

  const staffOptions = (settings.staffList && settings.staffList.length > 0)
    ? settings.staffList
    : [currentUserName];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/15 rounded-2xl backdrop-blur-xs">
              <Zap className="w-6 h-6 text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  XUẤT KHO THEO FILE EXCEL (ƯU TIÊN FIFO)
                </h3>
                <span className="px-2 py-0.5 bg-amber-400 text-slate-900 text-[10px] font-black rounded-md uppercase">
                  FIFO #1 Nhập Trước Xuất Trước
                </span>
              </div>
              <p className="text-xs text-blue-100 mt-0.5">
                Nhận: STT (Cột 1) • Mã VT (Cột 2) • Tên VT (Cột 3) • ĐVT (Cột 4) • SL Đề Nghị (Cột 5: Số lượng xuất kho) • Tự động quét đối soát Kệ & Lô FIFO
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={downloadSampleStockOutExcel}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer"
              title="Tải file mẫu Excel xuất kho"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">File Mẫu Xuất Kho</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/50">
          {/* Success Banner if exported */}
          {successReport && (
            <div className="p-5 bg-blue-50 border-2 border-blue-400 rounded-2xl text-blue-950 space-y-4 animate-in fade-in zoom-in-95 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="font-extrabold text-base text-blue-950">
                      🎉 ĐÃ XUẤT KHO FIFO & TẠO PHIẾU XUẤT THÀNH CÔNG!
                    </h4>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="font-mono text-xs font-black bg-blue-200 text-blue-950 px-2 py-0.5 rounded-md">
                        Mã phiếu: {successReport.voucherCode}
                      </span>
                      <span className="text-xs text-slate-600">
                        {successReport.voucherTitle}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handlePrintCurrentVoucher}
                    className="px-4 py-2 bg-amber-400 hover:bg-amber-500 active:scale-95 text-amber-950 text-xs font-black rounded-xl shadow-md flex items-center space-x-1.5 cursor-pointer transition-all"
                  >
                    <Printer className="w-4 h-4 text-amber-950" />
                    <span>IN PHIẾU XUẤT KHO</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
                  >
                    Đóng
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                <div className="bg-white p-3 rounded-xl border border-blue-200">
                  <span className="text-slate-500 block">Số loại linh kiện đã xuất:</span>
                  <strong className="text-base font-black text-blue-700">
                    {successReport.totalExportedParts} linh kiện
                  </strong>
                </div>
                <div className="bg-white p-3 rounded-xl border border-blue-200">
                  <span className="text-slate-500 block">Tổng số lượng đã trừ tồn kho:</span>
                  <strong className="text-base font-black text-emerald-700">
                    {successReport.totalQuantity.toLocaleString('vi-VN')}
                  </strong>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-medium flex items-center space-x-2">
                <Info className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Các linh kiện trên đã tự động chuyển sang <strong>Danh Sách Chờ Bóc Tách</strong> theo nhóm Mã Phiếu <strong>[{successReport.voucherCode}]</strong>. Phiếu đã được lưu vào lịch sử phiếu xuất kho.
                </span>
              </div>
            </div>
          )}

          {/* Upload Drop Zone if no file */}
          {!parsedData ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/40 hover:bg-blue-50/70 p-8 rounded-3xl text-center cursor-pointer transition-all space-y-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelected(e.target.files[0]);
                  }
                }}
              />
              <div className="w-14 h-14 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                <Upload className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-800">
                  Kéo thả file Excel xuất kho vào đây hoặc click để chọn file
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Cấu trúc chuẩn: Cột 1 (STT), Cột 2 (Mã VT), Cột 3 (Tên VT), Cột 4 (ĐVT), Cột 5 (SL Đề Nghị - hiểu là số lượng cần xuất kho). Bỏ qua các cột sau.
                </p>
              </div>
              <div className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-blue-300 text-blue-800 rounded-xl text-xs font-bold shadow-2xs">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Hệ thống tự động tra cứu Kệ & Lô hàng cũ nhất theo nguyên tắc FIFO</span>
              </div>
            </div>
          ) : (
            /* Parsed Review Content */
            <div className="space-y-4">
              {/* File Info & Global Stock-Out Parameters */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="p-2 bg-blue-100 text-blue-800 rounded-xl">
                      <FileSpreadsheet className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="text-sm font-black text-slate-800">
                        File đang xử lý: <span className="text-blue-700">{parsedData.fileName}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Tổng yêu cầu: <strong>{parsedData.totalRows}</strong> dòng • Đủ hàng xuất: <strong className="text-emerald-700">{parsedData.enoughStockCount}</strong> • Thiếu tồn kho: <strong className="text-rose-600">{parsedData.outOfStockCount}</strong>
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setParsedData(null);
                      setFile(null);
                      setItems([]);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 underline flex items-center space-x-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Chọn file khác</span>
                  </button>
                </div>

                {/* Customizable Voucher Identification Block */}
                <div className="p-3.5 bg-gradient-to-r from-blue-50 via-indigo-50/60 to-blue-50 border border-blue-200 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-black text-blue-950 mb-1 text-xs flex items-center space-x-1.5">
                      <span>Mã Phiếu Xuất Kho (Đặt tên dễ nhận biết lúc bóc tách)</span>
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={customVoucherCode}
                      onChange={(e) => setCustomVoucherCode(e.target.value.toUpperCase())}
                      placeholder="Ví dụ: PXK-20261013-001 hoặc PXK-MAY-01..."
                      className="w-full px-3 py-2 bg-white border border-blue-300 rounded-xl text-xs font-mono font-black text-blue-900 focus:ring-2 focus:ring-blue-500 outline-hidden uppercase shadow-2xs"
                    />
                    <p className="text-[10px] text-blue-700 mt-1">
                      💡 Mã phiếu này sẽ hiển thị trên <strong>Danh Sách Chờ Bóc Tách</strong> để gom gọn linh kiện theo từng đợt xuất.
                    </p>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1 text-xs">
                      Tên / Ghi Chú Đơn Hàng Phiếu Xuất
                    </label>
                    <input
                      type="text"
                      value={customVoucherTitle}
                      onChange={(e) => setCustomVoucherTitle(e.target.value)}
                      placeholder="Ví dụ: Xuất linh kiện ĐH A - Dây chuyền 1..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-hidden shadow-2xs"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Tên gọi hiển thị trên tiêu đề Phiếu In và trong Thẻ Bóc Tách.
                    </p>
                  </div>
                </div>

                {/* Form fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Người Lấy / Xuất Kho <span className="text-red-500">*</span>
                    </label>
                    <SearchableSelect
                      options={staffOptions}
                      value={person}
                      onChange={(val) => setPerson(val)}
                      placeholder="Chọn người lấy..."
                      allowCustom={true}
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Lệnh Sản Xuất (LSX)
                    </label>
                    <input
                      type="text"
                      value={productionOrder}
                      onChange={(e) => setProductionOrder(e.target.value)}
                      placeholder="Mã LSX..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Mục Đích Xuất
                    </label>
                    <input
                      type="text"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      placeholder="Mục đích xuất..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Ngày Giờ Xuất <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={dateTime}
                      onChange={(e) => setDateTime(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Filtering & Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFilterType('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      filterType === 'all'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Tất cả ({items.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterType('enough')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      filterType === 'enough'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200'
                    }`}
                  >
                    Đủ tồn xuất ({items.filter((i) => i.hasEnoughStock).length})
                  </button>
                  {items.some((i) => !i.hasEnoughStock) && (
                    <button
                      type="button"
                      onClick={() => setFilterType('shortage')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        filterType === 'shortage'
                          ? 'bg-rose-600 text-white'
                          : 'bg-white text-rose-600 hover:bg-rose-50 border border-rose-200'
                      }`}
                    >
                      Thiếu tồn ({items.filter((i) => !i.hasEnoughStock).length})
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Tìm mã / tên..."
                      className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 w-44 sm:w-56"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(true)}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Chọn đủ tồn
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(false)}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              {/* Data Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-slate-100/90 text-slate-700 sticky top-0 shadow-2xs z-10 font-black">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              items.filter((i) => i.isValid).length > 0 &&
                              items.filter((i) => i.isValid).every((i) => i.selected)
                            }
                            onChange={(e) => handleToggleSelectAll(e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </th>
                        <th className="p-3 w-12 text-center">STT</th>
                        <th className="p-3 font-extrabold">Mã Linh Kiện</th>
                        <th className="p-3 font-extrabold">Tên Linh Kiện</th>
                        <th className="p-3 font-extrabold text-center">ĐVT</th>
                        <th className="p-3 font-extrabold text-right">SL Đề Nghị (Xuất Kho)</th>
                        <th className="p-3 font-extrabold text-right">Tồn Hiện Tại</th>
                        <th className="p-3 font-extrabold">Gợi Ý Kệ & Lô FIFO (#1 Ưu Tiên)</th>
                        <th className="p-3 font-extrabold text-center">Trạng Thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                            Không tìm thấy dòng dữ liệu nào phù hợp với bộ lọc.
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => {
                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors ${
                                !item.hasEnoughStock
                                  ? 'bg-rose-50/50 hover:bg-rose-50'
                                  : item.selected
                                  ? 'bg-blue-50/20 hover:bg-blue-50/40'
                                  : 'hover:bg-slate-50 opacity-60'
                              }`}
                            >
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  disabled={!item.isValid}
                                  checked={item.selected}
                                  onChange={() => handleToggleSelect(item.id)}
                                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                                />
                              </td>
                              <td className="p-3 text-center font-mono text-slate-500">
                                {item.stt}
                              </td>
                              <td className="p-3">
                                <span className="font-mono font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                  {item.partCode}
                                </span>
                              </td>
                              <td className="p-3 font-semibold text-slate-700 max-w-[220px] truncate" title={item.partName}>
                                {item.partName}
                              </td>
                              <td className="p-3 text-center text-slate-600 font-bold">
                                {item.unit}
                              </td>
                              <td className="p-3 text-right">
                                <input
                                  type="number"
                                  step="any"
                                  min="0.01"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    handleUpdateItemQty(item.id, parseFloat(e.target.value) || 0)
                                  }
                                  className={`w-24 px-2 py-1 bg-white border rounded-lg text-right font-black text-xs ${
                                    item.hasEnoughStock
                                      ? 'border-slate-300 focus:border-blue-500 text-blue-700'
                                      : 'border-rose-400 text-rose-700 bg-rose-50'
                                  }`}
                                />
                              </td>
                              <td className="p-3 text-right font-bold text-slate-700">
                                {item.matchedPart ? (
                                  <span className={item.currentStock >= item.quantity ? 'text-emerald-700' : 'text-rose-600 font-black'}>
                                    {item.currentStock.toLocaleString('vi-VN')} {item.unit}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">Chưa có mã (0)</span>
                                )}
                              </td>
                              <td className="p-3">
                                {item.fifoAllocations && item.fifoAllocations.length > 0 ? (
                                  <div className="space-y-1 max-w-[280px]">
                                    {item.fifoAllocations.map((alloc, aIdx) => (
                                      <div
                                        key={aIdx}
                                        className="flex items-center space-x-1.5 text-[11px] bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md text-amber-950"
                                      >
                                        <MapPin className="w-3 h-3 text-amber-600 shrink-0" />
                                        <span className="font-bold">{alloc.locationName}</span>
                                        <span className="text-amber-800 font-black">
                                          ({alloc.allocatedQty.toLocaleString('vi-VN')} {item.unit})
                                        </span>
                                        <span className="text-slate-400 text-[10px]">
                                          • {alloc.contNumber}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">
                                    {item.matchedPart?.location || 'Chưa định vị'}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {!item.matchedPart ? (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-100 text-slate-600 border border-slate-200">
                                    <AlertCircle className="w-3 h-3" />
                                    <span>MÃ CHƯA CÓ</span>
                                  </span>
                                ) : item.hasEnoughStock ? (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>ĐỦ XUẤT (FIFO)</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200" title={`Thiếu ${item.shortageQty.toLocaleString('vi-VN')} ${item.unit}`}>
                                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                                    <span>THIẾU TỒN</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-4 text-xs">
            <span className="text-slate-500">
              Đã chọn xuất: <strong className="text-blue-700 font-extrabold text-sm">{selectedCount}</strong> linh kiện
            </span>
            <span className="text-slate-500">
              Tổng SL xuất: <strong className="text-emerald-700 font-extrabold text-sm">{totalSelectedQty.toLocaleString('vi-VN')}</strong>
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Hủy / Đóng
            </button>

            {parsedData && (
              <button
                type="button"
                disabled={selectedCount === 0 || isSubmitting}
                onClick={handleConfirmStockOut}
                className={`px-6 py-2.5 font-black text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer ${
                  selectedCount > 0 && !isSubmitting
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white active:scale-95'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang trừ tồn kho FIFO...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-amber-300" />
                    <span>XÁC NHẬN XUẤT KHO FIFO ({selectedCount} LINH KIỆN)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
