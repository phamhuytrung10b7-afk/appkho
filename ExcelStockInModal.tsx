import React, { useState, useRef, useEffect } from 'react';
import { Part, AppSettings } from './types';
import { storageService } from './storage';
import { soundEffects } from './soundEffects';
import {
  parseStockInExcel,
  StockInExcelItem,
  ParsedStockInResult,
  downloadSampleStockInExcel,
} from './excelStockInOutParser';
import {
  X,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Package,
  ArrowDownLeft,
  Calendar,
  User,
  MapPin,
  Download,
  Search,
  Sparkles,
  Info,
  RefreshCw,
} from 'lucide-react';
import { SearchableSelect } from './SearchableSelect';

interface ExcelStockInModalProps {
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

export const ExcelStockInModal: React.FC<ExcelStockInModalProps> = ({
  isOpen,
  onClose,
  parts,
  settings,
  onSuccess,
  initialFile,
}) => {
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [parsedData, setParsedData] = useState<ParsedStockInResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'valid' | 'invalid' | 'new'>('all');

  // Transaction form states
  const currentUser = storageService.getCurrentUser();
  const currentUserName = currentUser
    ? `${currentUser.fullName}${currentUser.roleTitle ? ` (${currentUser.roleTitle})` : ''}`
    : (settings.staffList?.[0] || 'Thủ kho');

  const [person, setPerson] = useState(currentUserName);
  const [dateTime, setDateTime] = useState(getNowLocalDateTime());
  const [reason, setReason] = useState('Nhập kho theo file Excel');
  const [generalNotes, setGeneralNotes] = useState('');

  // Editable items state
  const [items, setItems] = useState<StockInExcelItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successReport, setSuccessReport] = useState<{
    totalImported: number;
    newPartsCreated: number;
    totalQuantity: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // If initialFile is passed or changes
  useEffect(() => {
    if (initialFile) {
      handleFileSelected(initialFile);
    }
  }, [initialFile]);

  // Handle file reading
  const handleFileSelected = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsLoading(true);
    setSuccessReport(null);
    try {
      const result = await parseStockInExcel(selectedFile, parts);
      setParsedData(result);
      setItems(result.items);
      soundEffects.playSuccessTingTing();
    } catch (err: any) {
      soundEffects.playErrorBuzzer();
      alert(`Lỗi khi đọc file Excel: ${err.message || 'Không thể đọc file'}`);
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

  // Toggle select all valid items
  const handleToggleSelectAll = (select: boolean) => {
    setItems((prev) =>
      prev.map((item) => (item.isValid ? { ...item, selected: select } : item))
    );
  };

  // Update item field (quantity or location)
  const handleUpdateItem = (id: string, updates: Partial<StockInExcelItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...updates };
        // Re-validate
        if (updated.quantity <= 0) {
          updated.isValid = false;
          updated.errorMessage = 'Số lượng nhập phải lớn hơn 0';
        } else if (!updated.partCode.trim()) {
          updated.isValid = false;
          updated.errorMessage = 'Thiếu mã linh kiện';
        } else {
          updated.isValid = true;
          updated.errorMessage = undefined;
        }
        return updated;
      })
    );
  };

  // Execute Stock In for selected items
  const handleConfirmStockIn = async () => {
    const selectedItems = items.filter((i) => i.selected && i.isValid);
    if (selectedItems.length === 0) {
      alert('Vui lòng chọn ít nhất một linh kiện hợp lệ để nhập kho!');
      return;
    }

    if (!person.trim()) {
      alert('Vui lòng nhập tên người thực hiện nhập kho!');
      return;
    }

    setIsSubmitting(true);
    let newPartsCreated = 0;
    let totalQtyImported = 0;

    try {
      let currentParts = storageService.getParts();
      const batchItems: Array<{
        partId: string;
        quantity: number;
        date: string;
        person: string;
        reasonOrPurpose?: string;
        notes?: string;
        locationId?: string;
      }> = [];

      for (const item of selectedItems) {
        let targetPart = currentParts.find(
          (p) => p.code.toLowerCase().trim() === item.partCode.toLowerCase().trim()
        );

        if (!targetPart) {
          targetPart = storageService.addPart({
            code: item.partCode.trim(),
            name: item.partName.trim() || item.partCode.trim(),
            description: `Tạo tự động từ file Excel nhập kho: ${file?.name || ''}`,
            unit: item.unit.trim() || 'Cái',
            currentStock: 0,
            minStock: 10,
            location: item.location.trim() || 'Kho chính',
            barcode: item.partCode.trim(),
            qrCode: item.partCode.trim(),
            note: 'Tạo tự động từ nhập kho Excel',
          });
          newPartsCreated++;
          currentParts = storageService.getParts();
        }

        const targetLoc = item.location.trim() || targetPart.location?.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính';

        batchItems.push({
          partId: targetPart.id,
          quantity: item.quantity,
          date: new Date(dateTime).toISOString(),
          person: person.trim(),
          reasonOrPurpose: reason.trim() || 'Nhập kho theo file Excel',
          notes: generalNotes.trim()
            ? `${generalNotes.trim()} (Từ file: ${file?.name || ''})`
            : `Nhập kho tự động từ file Excel: ${file?.name || ''}`,
          locationId: targetLoc,
        });

        totalQtyImported += item.quantity;
      }

      await storageService.batchAddStockIn(batchItems);

      soundEffects.playSuccessTingTing();
      setSuccessReport({
        totalImported: selectedItems.length,
        newPartsCreated,
        totalQuantity: Math.round(totalQtyImported * 100) / 100,
      });

      onSuccess();
    } catch (err: any) {
      soundEffects.playErrorBuzzer();
      alert(`Lỗi trong quá trình nhập kho: ${err.message || 'Lỗi không xác định'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Filtered list
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      !searchTerm ||
      item.partCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.partName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.location.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === 'valid') return item.isValid;
    if (filterType === 'invalid') return !item.isValid;
    if (filterType === 'new') return item.isNewPart && item.isValid;
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
        <div className="p-5 bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 text-white flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/15 rounded-2xl backdrop-blur-xs">
              <FileSpreadsheet className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  NHẬP KHO BẰNG FILE EXCEL (POPUP KIỂM TRA & XÁC NHẬN)
                </h3>
                <span className="px-2 py-0.5 bg-amber-400 text-slate-900 text-[10px] font-black rounded-md uppercase">
                  Ảnh 3 Chuẩn
                </span>
              </div>
              <p className="text-xs text-emerald-100 mt-0.5">
                Nhận: STT (Cột 1) • Mã VT (Cột 2) • Tên VT (Cột 3) • ĐVT (Cột 4) • SL Đề Nghị (Cột 5) • Bỏ qua Cột 6, 7 • Vị Trí (Cột 8)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={downloadSampleStockInExcel}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer"
              title="Tải file mẫu Excel chuẩn để điền dữ liệu"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tải File Mẫu Excel</span>
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
          {/* Success Banner if completed */}
          {successReport && (
            <div className="p-5 bg-emerald-50 border-2 border-emerald-400 rounded-2xl text-emerald-950 space-y-2 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                  <h4 className="font-extrabold text-base">
                    ĐÃ NHẬP KHO THÀNH CÔNG TỪ FILE EXCEL!
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Hoàn Tất & Đóng
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                  <span className="text-slate-500 block">Số dòng linh kiện nhập:</span>
                  <strong className="text-base font-black text-emerald-700">
                    {successReport.totalImported} linh kiện
                  </strong>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                  <span className="text-slate-500 block">Mã mới tự động khởi tạo:</span>
                  <strong className="text-base font-black text-purple-700">
                    {successReport.newPartsCreated} mã
                  </strong>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                  <span className="text-slate-500 block">Tổng số lượng cộng dồn tồn:</span>
                  <strong className="text-base font-black text-blue-700">
                    {successReport.totalQuantity.toLocaleString('vi-VN')}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Upload Drop Zone if no file or user wants to re-upload */}
          {!parsedData ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/70 p-8 rounded-3xl text-center cursor-pointer transition-all space-y-3"
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
              <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                <Upload className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-800">
                  Kéo thả file Excel vào đây hoặc click để chọn file
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Hỗ trợ định dạng .xlsx, .xls theo cấu trúc phiếu đề nghị nhập kho (Ảnh 3). Hệ thống sẽ tự động quét đối soát mã và vị trí.
                </p>
              </div>
              <div className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Tự động nhận diện định dạng số phẩy VN (ví dụ: 3,90 hoặc 1.000,00)</span>
              </div>
            </div>
          ) : (
            /* Parsed Review Content */
            <div className="space-y-4">
              {/* File Info & Global Import Settings Form */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                      <FileSpreadsheet className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="text-sm font-black text-slate-800">
                        File đang xử lý: <span className="text-emerald-700">{parsedData.fileName}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Tổng cộng: <strong>{parsedData.totalRows}</strong> dòng • Hợp lệ: <strong className="text-emerald-700">{parsedData.validRows}</strong> • Không hợp lệ: <strong className="text-rose-600">{parsedData.invalidRows}</strong> • Mã mới: <strong className="text-purple-700">{parsedData.newPartsCount}</strong>
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

                {/* Import Parameters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Người Nhập Kho <span className="text-red-500">*</span>
                    </label>
                    <SearchableSelect
                      options={staffOptions}
                      value={person}
                      onChange={(val) => setPerson(val)}
                      placeholder="Chọn người nhập..."
                      allowCustom={true}
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Ngày Giờ Nhập Kho <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={dateTime}
                      onChange={(e) => setDateTime(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Lý Do Nhập Kho
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Nhập kho theo file Excel..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Ghi Chú Chung
                    </label>
                    <input
                      type="text"
                      value={generalNotes}
                      onChange={(e) => setGeneralNotes(e.target.value)}
                      placeholder="Ghi chú phiếu nhập..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Filtering & Table Toolbar */}
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
                    onClick={() => setFilterType('valid')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      filterType === 'valid'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200'
                    }`}
                  >
                    Hợp lệ ({items.filter((i) => i.isValid).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterType('new')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      filterType === 'new'
                        ? 'bg-purple-700 text-white'
                        : 'bg-white text-purple-700 hover:bg-purple-50 border border-purple-200'
                    }`}
                  >
                    Mã mới ({items.filter((i) => i.isNewPart && i.isValid).length})
                  </button>
                  {items.some((i) => !i.isValid) && (
                    <button
                      type="button"
                      onClick={() => setFilterType('invalid')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        filterType === 'invalid'
                          ? 'bg-rose-600 text-white'
                          : 'bg-white text-rose-600 hover:bg-rose-50 border border-rose-200'
                      }`}
                    >
                      Lỗi ({items.filter((i) => !i.isValid).length})
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
                      placeholder="Tìm mã / tên / vị trí..."
                      className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 w-44 sm:w-56"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(true)}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Chọn tất cả
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
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </th>
                        <th className="p-3 w-12 text-center">STT</th>
                        <th className="p-3 font-extrabold">Mã Linh Kiện (Mã VT)</th>
                        <th className="p-3 font-extrabold">Tên Linh Kiện (Tên VT)</th>
                        <th className="p-3 font-extrabold text-center">ĐVT</th>
                        <th className="p-3 font-extrabold text-right">SL Nhập (Đề nghị)</th>
                        <th className="p-3 font-extrabold">Vị Trí Nhập (Cột 8)</th>
                        <th className="p-3 font-extrabold text-right">Tồn Hiện Tại</th>
                        <th className="p-3 font-extrabold text-center">Trạng Thái Hợp Lệ</th>
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
                        filteredItems.map((item, idx) => {
                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors ${
                                !item.isValid
                                  ? 'bg-rose-50/50 hover:bg-rose-50'
                                  : item.selected
                                  ? 'bg-emerald-50/20 hover:bg-emerald-50/40'
                                  : 'hover:bg-slate-50 opacity-60'
                              }`}
                            >
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  disabled={!item.isValid}
                                  checked={item.selected}
                                  onChange={() => handleToggleSelect(item.id)}
                                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
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
                              <td className="p-3 font-semibold text-slate-700 max-w-[240px] truncate" title={item.partName}>
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
                                    handleUpdateItem(item.id, {
                                      quantity: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  className="w-24 px-2 py-1 bg-white border border-slate-300 focus:border-emerald-500 rounded-lg text-right font-black text-emerald-700 text-xs"
                                />
                              </td>
                              <td className="p-3">
                                <div className="flex items-center space-x-1">
                                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <input
                                    type="text"
                                    value={item.location}
                                    onChange={(e) =>
                                      handleUpdateItem(item.id, { location: e.target.value })
                                    }
                                    className="w-24 px-2 py-1 bg-white border border-slate-300 focus:border-emerald-500 rounded-lg font-bold text-slate-800 text-xs"
                                    placeholder="Vị trí kệ..."
                                  />
                                </div>
                              </td>
                              <td className="p-3 text-right font-bold text-slate-600">
                                {item.matchedPart ? (
                                  `${item.matchedPart.currentStock.toLocaleString('vi-VN')} ${item.matchedPart.unit}`
                                ) : (
                                  <span className="text-slate-400 italic">Mới (0)</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {!item.isValid ? (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200">
                                    <AlertCircle className="w-3 h-3" />
                                    <span>{item.errorMessage || 'Lỗi dữ liệu'}</span>
                                  </span>
                                ) : item.isNewPart ? (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200" title="Mã chưa có trong hệ thống, sẽ tự động tạo mới">
                                    <Sparkles className="w-3 h-3 text-purple-600" />
                                    <span>HỢP LỆ (MÃ MỚI)</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>HỢP LỆ (CÓ SẴN)</span>
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
              Đã chọn: <strong className="text-emerald-700 font-extrabold text-sm">{selectedCount}</strong> linh kiện
            </span>
            <span className="text-slate-500">
              Tổng SL nhập: <strong className="text-blue-700 font-extrabold text-sm">{totalSelectedQty.toLocaleString('vi-VN')}</strong>
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
                onClick={handleConfirmStockIn}
                className={`px-6 py-2.5 font-black text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer ${
                  selectedCount > 0 && !isSubmitting
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white active:scale-95'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang xử lý nhập kho...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-amber-300" />
                    <span>XÁC NHẬN NHẬP KHO ({selectedCount} LINH KIỆN)</span>
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
