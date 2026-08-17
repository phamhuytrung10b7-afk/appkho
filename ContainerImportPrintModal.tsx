import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Part, AppSettings, ContainerBatch, ContainerQrTag } from './types';
import { QRCodeSVG } from 'qrcode.react';
import { printHtml } from './printHelper';
import { getSavedPrintConfigs, savePrintConfigs, defaultPrintConfigs, PrintLayout, AllPrintConfigs, PrintConfig } from './printConfig';

import {
  FileSpreadsheet,
  Upload,
  Printer,
  X,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  QrCode,
  Tag,
  Package,
  Layers,
  Search,
  Check, Settings2,
  Eye, 
  Settings,
  History,
  Trash2,
  Clock,
  RotateCcw,
} from 'lucide-react';
import {
  parseContainerExcel,
  ContainerImportResult,
  ContainerImportItem,
} from './containerParser';
import { storageService } from './storage';

interface ContainerImportPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  parts: Part[];
  settings: AppSettings;
  onRefreshParts: () => void;
}

export const ContainerImportPrintModal: React.FC<ContainerImportPrintModalProps> = ({
  isOpen,
  onClose,
  parts,
  settings,
  onRefreshParts,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ContainerImportResult | null>(null);
  const [contNumber, setContNumber] = useState('GAOU7800407');
  const [contDate, setContDate] = useState('16/07/2026');
  const [isAddingNewParts, setIsAddingNewParts] = useState(false);
  const [addedSuccessMsg, setAddedSuccessMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'import' | 'history' | 'preview'>('import');
  const [labelLayout, setLabelLayout] = useState<'double' | 'single' | 'a7'>('a7');
  const [printConfigs, setPrintConfigs] = useState<AllPrintConfigs>(getSavedPrintConfigs());
  const printRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    savePrintConfigs(printConfigs);
  }, [printConfigs]);

  const handleConfigChange = (key: keyof PrintConfig, val: number) => {
    setPrintConfigs((prev) => ({
      ...prev,
      [labelLayout]: {
        ...prev[labelLayout],
        [key]: Math.max(0, val),
      },
    }));
  };

  const handleResetCurrentConfig = () => {
    setPrintConfigs((prev) => ({
      ...prev,
      [labelLayout]: { ...defaultPrintConfigs[labelLayout] },
    }));
  };

  const activeConf = printConfigs[labelLayout];
 // 'double' = 73x22mm (2 tem / hàng), 'single' = 35x22mm
  const [searchTerm, setSearchTerm] = useState('');
  const [savedBatches, setSavedBatches] = useState<ContainerBatch[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved container batches when modal opens
  useEffect(() => {
    if (isOpen) {
      setSavedBatches(storageService.getContainerBatches());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Real-time scanned QR tokens lookup
  const usedTokens = storageService.getUsedQrTokens();
  const checkScanStatus = (tagId?: string, qrPayload?: string, itemQty?: number) => {
    const token = (tagId && usedTokens[tagId]) || (qrPayload && usedTokens[qrPayload]) || null;
    if (token) {
      const imported = token.importedQuantity !== undefined ? token.importedQuantity : (token.quantity || 0);
      const total = token.quantity || itemQty || 0;
      const isComplete = total > 0 && imported >= total;
      return { 
        isScanned: isComplete, 
        importedQuantity: imported, 
        totalQuantity: total, 
        details: token 
      };
    }
    return { isScanned: false, importedQuantity: 0, totalQuantity: itemQty || 0 };
  };

  const saveBatchToStorage = (cNum: string, cDate: string, itemsList: ContainerImportItem[]) => {
    const qrTags: ContainerQrTag[] = itemsList.map((item) => ({
      id: item.tagId || `TAG-${item.code}-${Math.random().toString(36).substring(2, 6)}`,
      partCode: item.code,
      partName: item.name,
      unit: item.unit,
      quantity: item.quantity,
      contNumber: cNum,
      contDate: cDate,
      supplier: item.supplier,
      mfgDate: item.mfgDate,
      qrPayload: item.qrPayload,
      printCopies: item.printCopies || 1,
    }));

    const batchObj: ContainerBatch = {
      id: `batch-${cNum.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`,
      contNumber: cNum,
      contDate: cDate,
      createdAt: new Date().toISOString(),
      totalItems: itemsList.length,
      totalQuantity: itemsList.reduce((sum, i) => sum + i.quantity, 0),
      items: qrTags,
    };

    storageService.saveContainerBatch(batchObj);
    setSavedBatches(storageService.getContainerBatches());
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setAddedSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const result = parseContainerExcel(buffer, parts);
        setParseResult(result);
        setContNumber(result.contNumber || 'GAOU7800407');
        setContDate(result.contDate || '16/07/2026');

        // Automatically save batch to storage history so user can re-print anytime
        saveBatchToStorage(result.contNumber || 'GAOU7800407', result.contDate || '16/07/2026', result.items);
      } catch (err: any) {
        console.error('Lỗi khi đọc file Excel Danh mục Cont:', err);
        alert('Lỗi đọc file Excel: ' + (err.message || 'Không khớp định dạng Danh Mục Cont'));
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleContNumberChange = (newCont: string) => {
    setContNumber(newCont);
    if (parseResult) {
      // Update qrPayload for all items
      const updatedItems = parseResult.items.map((item) => ({
        ...item,
        contNumber: newCont,
        qrPayload: `CONT_IN|${item.code}|${item.quantity}|${newCont}|${item.tagId}|${item.contDate || contDate}`,
      }));
      setParseResult({
        ...parseResult,
        contNumber: newCont,
        items: updatedItems,
      });
    }
  };

  const handleContDateChange = (newDate: string) => {
    setContDate(newDate);
    if (parseResult) {
      const updatedItems = parseResult.items.map((item) => ({
        ...item,
        contDate: newDate,
        qrPayload: `CONT_IN|${item.code}|${item.quantity}|${contNumber}|${item.tagId}|${newDate}`,
      }));
      setParseResult({
        ...parseResult,
        contDate: newDate,
        items: updatedItems,
      });
    }
  };

  const handleSelectSavedBatch = (batch: ContainerBatch) => {
    const items: ContainerImportItem[] = batch.items.map((tag) => {
      const matchedPart = parts.find((p) => p.code.trim().toLowerCase() === tag.partCode.trim().toLowerCase());
      return {
        id: tag.id,
        tagId: tag.id,
        code: tag.partCode,
        name: tag.partName,
        unit: tag.unit,
        quantity: tag.quantity,
        contNumber: batch.contNumber,
        contDate: batch.contDate,
        supplier: tag.supplier,
        mfgDate: tag.mfgDate,
        matchedPart,
        isNewPart: !matchedPart,
        printCopies: tag.printCopies || 1,
        qrPayload: tag.qrPayload || `CONT_IN|${tag.partCode}|${tag.quantity}|${batch.contNumber}|${tag.id}|${batch.contDate}`,
      };
    });

    setContNumber(batch.contNumber);
    setContDate(batch.contDate);
    setParseResult({
      contNumber: batch.contNumber,
      contDate: batch.contDate,
      items,
      totalQuantity: batch.totalQuantity,
      newPartsCount: items.filter((i) => i.isNewPart).length,
      matchedPartsCount: items.filter((i) => !i.isNewPart).length,
    });

    setActiveTab('preview');
  };

  const handleDeleteSavedBatch = (batchId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Bạn có chắc muốn xóa lịch sử mã QR Cont này?')) {
      storageService.deleteContainerBatch(batchId);
      setSavedBatches(storageService.getContainerBatches());
    }
  };

  const handleAddMissingPartsToSystem = () => {
    if (!parseResult) return;
    setIsAddingNewParts(true);

    let addedCount = 0;
    const currentParts = storageService.getParts();

    parseResult.items.forEach((item) => {
      const exists = currentParts.some(
        (p) => p.code.trim().toLowerCase() === item.code.trim().toLowerCase()
      );

      if (!exists) {
        storageService.addPart({
          code: item.code,
          name: item.name,
          description: `Thêm tự động từ file Danh Mục Cont ${contNumber}`,
          location: 'Kệ Cont',
          unit: item.unit || 'Cái',
          currentStock: 0, // Tồn ban đầu = 0, sẽ cộng dồn khi Nhập kho
          minStock: 10,
          barcode: item.code,
          qrCode: item.code,
          note: `Cont: ${contNumber}`,
        });
        addedCount++;
      }
    });

    onRefreshParts();
    setIsAddingNewParts(false);

    // Re-parse with updated parts
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const buffer = evt.target?.result as ArrayBuffer;
        const updatedParts = storageService.getParts();
        const newResult = parseContainerExcel(buffer, updatedParts);
        setParseResult(newResult);
      };
      reader.readAsArrayBuffer(file);
    }

    setAddedSuccessMsg(
      `Thành công! Đã thêm ${addedCount} linh kiện mới vào hệ thống danh mục.`
    );
  };

  const handleQuantityChange = (itemId: string, copies: number) => {
    if (!parseResult) return;
    const updated = parseResult.items.map((it) =>
      it.id === itemId ? { ...it, printCopies: Math.max(0, copies) } : it
    );
    setParseResult({ ...parseResult, items: updated });
  };

  const handlePrint = () => {
    if (printRef.current) {
      const conf = printConfigs[labelLayout];
      const styles = `
        @page {
          size: ${conf.pageWidth}mm ${conf.pageHeight}mm;
          margin: 0;
        }
        @media print {
          html, body {
            margin: 0;
            padding: 0;
            width: ${conf.pageWidth}mm;
            height: ${conf.pageHeight}mm;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
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
          width: ${conf.pageWidth}mm;
          height: ${conf.pageHeight}mm;
        }
        .single-label {
          box-sizing: border-box;
          display: flex;
          overflow: hidden;
          background-color: white;
          width: 100%;
          height: 100%;
        }
      `;
      printHtml(printRef.current.innerHTML, styles);
    }
  };

  // Build array of label items to print based on printCopies
  const printLabelItems: ContainerImportItem[] = [];
  if (parseResult) {
    parseResult.items.forEach((item) => {
      for (let i = 0; i < item.printCopies; i++) {
        printLabelItems.push(item);
      }
    });
  }

  // Calculate scan progress for current parse result
  const currentParseScannedCount = parseResult
    ? parseResult.items.filter((item) => checkScanStatus(item.tagId || item.id, item.qrPayload).isScanned).length
    : 0;
  const currentParseTotalItems = parseResult ? parseResult.items.length : 0;
  const currentParsePercent = currentParseTotalItems > 0 ? Math.round((currentParseScannedCount / currentParseTotalItems) * 100) : 0;

  // Filter items by search
  const filteredItems = parseResult
    ? parseResult.items.filter(
        (it) =>
          it.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          it.code.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  // Group labels into rows based on selected layout (tem đôi = 2 tem/hàng)
  const labelRows: ContainerImportItem[][] = [];
  if (labelLayout === 'double') {
    for (let i = 0; i < printLabelItems.length; i += 2) {
      labelRows.push(printLabelItems.slice(i, i + 2));
    }
  } else {
    for (let i = 0; i < printLabelItems.length; i++) {
      labelRows.push([printLabelItems[i]]);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-md">
              <FileSpreadsheet className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg flex items-center space-x-2">
                <span>IN TEM QR KHO THEO DANH MỤC CONT (FILE EXCEL)</span>
                <span className="px-2 py-0.5 text-[11px] bg-amber-400 text-slate-950 font-black rounded-full">
                  Tem 73x22mm
                </span>
              </h3>
              <p className="text-xs text-emerald-200 mt-0.5">
                Tự động đọc Cột Mã VT, Tên VT, ĐVT & Cột XUẤT (Số lượng). Tạo mã QR chứa số lượng để quét tự động Nhập Kho.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {parseResult && (
              <button
                onClick={handlePrint}
                disabled={printLabelItems.length === 0}
                className="flex items-center space-x-2 px-4 py-2 bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black rounded-xl shadow-lg transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>In {printLabelItems.length} Tem Ngay</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 text-white rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab & Bar */}
        <div className="p-3 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-slate-200 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('import')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'import'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>1. Tải File Excel Cont</span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <History className="w-4 h-4" />
                <span>2. Lịch Sử Cont Đã Tạo ({savedBatches.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                disabled={!parseResult}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                } ${!parseResult ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Eye className="w-4 h-4" />
                <span>3. Xem Mẫu In Tem ({printLabelItems.length} tem)</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between w-full">
            <div className="flex items-center space-x-3 text-xs font-semibold text-slate-700">
              <div className="flex items-center space-x-1">
                <span className="text-slate-500">Khổ giấy:</span>
                <select
                  value={labelLayout}
                  onChange={(e) => setLabelLayout(e.target.value as 'double' | 'single' | 'a7')}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-bold text-emerald-800 focus:outline-hidden cursor-pointer"
                >
                  <option value="double">Tem Đôi (73x22mm)</option>
                  <option value="single">Tem Đơn (35x22mm)</option>
                  <option value="a7">Khổ A7 (74x105mm)</option>
                </select>
              </div>
              <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border transition-colors ${
                      showSettings ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
              >
                  <Settings2 className="w-4 h-4" />
                  <span>Cài đặt kích thước</span>
              </button>
            </div>
          </div>
          
          {showSettings && (
            <div className="mt-3 p-3 bg-white border border-emerald-200 rounded-2xl shadow-xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-extrabold text-slate-800 text-xs flex items-center space-x-1">
                  <Settings2 className="w-3.5 h-3.5 text-emerald-600" />
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

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    CỠ CHỮ TÊN (PX)
                  </label>
                  <input
                    type="number"
                    min={6}
                    max={36}
                    value={activeConf.nameFontSize}
                    onChange={(e) => handleConfigChange('nameFontSize', parseInt(e.target.value) || 8)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    CỠ CHỮ MÃ (PX)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={28}
                    value={activeConf.codeFontSize}
                    onChange={(e) => handleConfigChange('codeFontSize', parseInt(e.target.value) || 7)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    CỠ CHỮ PHỤ (PX)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={24}
                    value={activeConf.metaFontSize}
                    onChange={(e) => handleConfigChange('metaFontSize', parseInt(e.target.value) || 7)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    KÍCH THƯỚC QR (MM)
                  </label>
                  <input
                    type="number"
                    min={8}
                    max={80}
                    value={activeConf.qrSize}
                    onChange={(e) => handleConfigChange('qrSize', parseInt(e.target.value) || 12)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    LỀ PADDING (MM)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={activeConf.padding}
                    onChange={(e) => handleConfigChange('padding', parseInt(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'import' ? (
            <div className="h-full flex flex-col p-4 space-y-4 overflow-y-auto">
              {/* File Upload Banner */}
              <div className="p-5 bg-emerald-50/60 border-2 border-dashed border-emerald-300 rounded-2xl text-center space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="inline-flex p-3 bg-emerald-100 text-emerald-700 rounded-2xl">
                  <FileSpreadsheet className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-emerald-950">
                    Tải Tệp Excel "DANH MỤC CONT" Lên Hệ Thống
                  </h4>
                  <p className="text-xs text-slate-500 max-w-lg mx-auto mt-1">
                    Tự động bỏ qua các cột bị Ẩn (Hide). Đọc Mã VT, Tên VT, ĐVT và số lượng ở cột XUẤT (tính đúng các biểu thức như 384+384 hay số 1.000).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer inline-flex items-center space-x-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>{file ? `Đã chọn: ${file.name}` : 'Chọn File Excel Danh Mục Cont (.xlsx)'}</span>
                </button>
              </div>

              {addedSuccessMsg && (
                <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{addedSuccessMsg}</span>
                </div>
              )}

              {/* Parsed Result Section */}
              {parseResult && (
                <div className="space-y-3 flex-1 flex flex-col min-h-0">
                  {/* Container Info & Stats Bar */}
                  <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs text-slate-400 font-medium">Mã Số Cont:</span>
                            <input
                              type="text"
                              value={contNumber}
                              onChange={(e) => handleContNumberChange(e.target.value)}
                              className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-md font-mono font-bold text-emerald-400 text-xs outline-hidden w-28"
                            />
                          </div>

                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs text-slate-400 font-medium">Ngày Cont:</span>
                            <input
                              type="text"
                              value={contDate}
                              onChange={(e) => handleContDateChange(e.target.value)}
                              className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-md font-mono font-bold text-amber-300 text-xs outline-hidden w-24"
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Tổng số dòng vật tư: <strong>{parseResult.items.length}</strong> | Tổng SL Cont về (XUẤT):{' '}
                          <strong className="text-amber-300">
                            {parseResult.totalQuantity.toLocaleString('vi-VN')}
                          </strong>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      {parseResult.newPartsCount > 0 && (
                        <button
                          onClick={handleAddMissingPartsToSystem}
                          disabled={isAddingNewParts}
                          className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-sm flex items-center space-x-1.5"
                        >
                          <PlusCircle className="w-4 h-4" />
                          <span>Tạo {parseResult.newPartsCount} Linh Kiện Mới Vào Hệ Thống</span>
                        </button>
                      )}
                      <button
                        onClick={() => setActiveTab('preview')}
                        className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-sm flex items-center space-x-1.5"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Xem Mẫu In Tem</span>
                      </button>
                    </div>
                  </div>

                  {/* Search filter in parsed table */}
                  <div className="relative shrink-0">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Tìm theo Mã VT hoặc Tên VT trong danh mục Cont..."
                      className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-hidden"
                    />
                  </div>

                  {/* Parsed Items Table */}
                  <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="p-3 w-12 text-center">STT</th>
                          <th className="p-3">Mã VT</th>
                          <th className="p-3">Tên VT</th>
                          <th className="p-3">Nhà Cung Cấp</th>
                          <th className="p-3 text-center">Ngày SX</th>
                          <th className="p-3 text-center">ĐVT</th>
                          <th className="p-3 text-center font-black text-amber-700 bg-amber-50/60">
                            Số Lượng Cont (XUẤT)
                          </th>
                          <th className="p-3 text-center">Mã QR Sẽ Tạo</th>
                          <th className="p-3 text-center">Trạng Thái Hệ Thống</th>
                          <th className="p-3 text-center">Trạng Thái Quét QR</th>
                          <th className="p-3 text-center w-28">Số Tem In</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredItems.map((item, index) => {
                          const scanState = checkScanStatus(item.tagId || item.id, item.qrPayload);
                          return (
                            <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${scanState.isScanned ? 'bg-emerald-50/40' : ''}`}>
                              <td className="p-3 text-center font-semibold text-slate-400">{index + 1}</td>
                              <td className="p-3 font-mono font-bold text-emerald-800">{item.code}</td>
                              <td className="p-3 font-extrabold text-slate-900">{item.name}</td>
                              <td className="p-3 font-medium text-slate-700">{item.supplier || '-'}</td>
                              <td className="p-3 text-center font-mono font-bold text-amber-800">{item.mfgDate || '-'}</td>
                              <td className="p-3 text-center font-bold text-slate-600">{item.unit}</td>
                              <td className="p-3 text-center font-black text-base text-amber-700 bg-amber-50/30">
                                {item.quantity.toLocaleString('vi-VN')}
                              </td>
                              <td className="p-3 text-center font-mono text-[10px] text-slate-500">
                                <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md">
                                  {item.qrPayload}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                {item.isNewPart ? (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold text-[10px]">
                                    <AlertCircle className="w-3 h-3 text-amber-600" />
                                    <span>Linh kiện mới</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span>Đã có (Tồn: {item.matchedPart?.currentStock})</span>
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {scanState.isScanned ? (
                                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 bg-emerald-600 text-white rounded-full font-extrabold text-[10px] shadow-xs">
                                    <CheckCircle2 className="w-3 h-3 text-white" />
                                    <span>Đã quét nhập kho</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded-full font-bold text-[10px]">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    <span>Chưa quét</span>
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={50}
                                  value={item.printCopies}
                                  onChange={(e) =>
                                    handleQuantityChange(item.id, parseInt(e.target.value) || 0)
                                  }
                                  className="w-16 text-center px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg font-bold text-emerald-700 text-xs outline-hidden focus:ring-2 focus:ring-emerald-500"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'history' ? (
            /* HISTORY TAB (Danh sách các đợt Cont đã tạo tem QR để in lại & theo dõi tiến độ) */
            <div className="h-full overflow-y-auto p-6 bg-slate-50 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900 flex items-center space-x-2">
                    <History className="w-5 h-5 text-emerald-600" />
                    <span>LỊCH SỬ VÀ TIẾN ĐỘ QUÉT NHẬP KHO CÁC LÔ CONT</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Theo dõi màu sắc và phần trăm tiến độ nhập kho lên kệ của từng lô Cont sau khi quét mã QR tem in.
                  </p>
                </div>
              </div>

              {savedBatches.length === 0 ? (
                <div className="p-10 text-center bg-white border border-slate-200 rounded-2xl space-y-3">
                  <Clock className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold text-slate-600">Chưa có lịch sử mã QR Cont nào được lưu.</p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    Khi bạn chọn file Excel "Danh Mục Cont" ở Tab 1, hệ thống sẽ tự động tạo mã QR độc nhất và lưu lại danh sách tại đây.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedBatches.map((batch) => {
                    const batchScannedCount = batch.items.filter(
                      (tag) => checkScanStatus(tag.id, tag.qrPayload).isScanned
                    ).length;
                    const batchTotal = batch.items.length;
                    const batchPercent = batchTotal > 0 ? Math.round((batchScannedCount / batchTotal) * 100) : 0;
                    const batchIsComplete = batchTotal > 0 && batchScannedCount === batchTotal;

                    return (
                      <div
                        key={batch.id}
                        className={`p-5 bg-white border rounded-2xl shadow-xs transition-all space-y-3 group ${
                          batchIsComplete
                            ? 'border-emerald-400 bg-emerald-50/30'
                            : batchScannedCount > 0
                            ? 'border-amber-300 bg-amber-50/20'
                            : 'border-slate-200 hover:border-emerald-400'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`p-3 rounded-2xl font-black text-xs font-mono ${
                              batchIsComplete
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : batchScannedCount > 0
                                ? 'bg-amber-500 text-white'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              CONT
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <h5 className="font-black text-base text-slate-900 font-mono">
                                  {batch.contNumber}
                                </h5>
                                {batchIsComplete ? (
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-[10px] font-black flex items-center space-x-1">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>ĐÃ NHẬP HẾT LÊN KỆ (100%)</span>
                                  </span>
                                ) : batchScannedCount > 0 ? (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[10px] font-black flex items-center space-x-1">
                                    <Clock className="w-3 h-3 text-amber-600" />
                                    <span>ĐANG NHẬP KHO ({batchPercent}%)</span>
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-[10px] font-bold">
                                    CHƯA QUÉT (0%)
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-bold text-amber-700 mt-0.5">
                                Ngày Cont: {batch.contDate}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => handleDeleteSavedBatch(batch.id, e)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                            title="Xóa lô Cont này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Progress Bar for Batch */}
                        <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span className="text-slate-600">Tiến độ nhập kệ Cont:</span>
                            <span className={`font-mono font-black ${batchIsComplete ? 'text-emerald-700' : 'text-amber-800'}`}>
                              {batchScannedCount} / {batchTotal} mã đã quét ({batchPercent}%)
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${
                                batchIsComplete
                                  ? 'bg-emerald-500'
                                  : batchScannedCount > 0
                                  ? 'bg-amber-500'
                                  : 'bg-slate-300'
                              }`}
                              style={{ width: `${batchPercent}%` }}
                            />
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-50 p-2.5 rounded-xl">
                            <span className="text-slate-400 text-[11px]">Tổng số mã VT:</span>
                            <p className="font-extrabold text-slate-800">{batch.totalItems} loại linh kiện</p>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-xl">
                            <span className="text-slate-400 text-[11px]">Tổng SL Cont về:</span>
                            <p className="font-extrabold text-emerald-700">
                              {batch.totalQuantity.toLocaleString('vi-VN')}
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-slate-400">
                            Tạo lúc: {new Date(batch.createdAt).toLocaleString('vi-VN')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSelectSavedBatch(batch)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5 text-amber-300" />
                            <span>Xem Tem & Nhận Biết Mã</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* PREVIEW TEMPLATE TAB (Khổ A7 74x105mm / Tem đôi 73x22mm / Tem đơn 35x22mm) WITH SCANNED COLOR RECOGNITION */
            <div className="h-full overflow-y-auto p-6 bg-slate-200/80 space-y-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-300 shadow-xs space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className="font-black text-slate-900 text-sm">
                        Mẫu Tem QR Cho Danh Mục Cont {contNumber} ({labelLayout === 'a7' ? 'Khổ A7 74x105mm' : labelLayout === 'double' ? 'Tem Đôi 73x22mm' : 'Tem Đơn 35x22mm'})
                      </p>
                    </div>
                    <p className="text-slate-500 mt-0.5">
                      Tem nhúng mã QR thông minh. Nhận biết mã QR đã quét bằng <span className="font-bold text-emerald-700 bg-emerald-100 px-1 rounded-xs">khung xanh lá tươi</span>.
                    </p>
                  </div>
                  <button
                    onClick={handlePrint}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Bắt Đầu In Giấy Tem ({printLabelItems.length} tem)</span>
                  </button>
                </div>

                {/* Progress Bar Header & Layout Switcher */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-slate-700">Tiến độ nhập kệ Cont:</span>
                    <div className="w-32 sm:w-48 bg-slate-200 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          currentParsePercent === 100
                            ? 'bg-emerald-500'
                            : currentParsePercent > 0
                            ? 'bg-amber-500'
                            : 'bg-slate-300'
                        }`}
                        style={{ width: `${currentParsePercent}%` }}
                      />
                    </div>
                    <span className="font-mono font-black text-emerald-800">
                      {currentParseScannedCount}/{currentParseTotalItems} tem ({currentParsePercent}%)
                    </span>
                  </div>

                  <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <span className="text-[11px] font-extrabold text-slate-600 px-1.5">Khổ tem:</span>
                    <button
                      type="button"
                      onClick={() => setLabelLayout('a7')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                        labelLayout === 'a7'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                      }`}
                    >
                      A7 (74x105mm)
                    </button>
                    <button
                      type="button"
                      onClick={() => setLabelLayout('double')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                        labelLayout === 'double'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                      }`}
                    >
                      Tem Đôi (73x22mm)
                    </button>
                    <button
                      type="button"
                      onClick={() => setLabelLayout('single')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                        labelLayout === 'single'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                      }`}
                    >
                      Tem Đơn (35x22mm)
                    </button>
                  </div>
                </div>
              </div>

              {labelRows.length === 0 ? (
                <div className="p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-300">
                  Chưa có tem nào được chọn in.
                </div>
              ) : (
                <div className="flex flex-wrap justify-center gap-4 pb-8">
                  {labelRows.map((row, rowIndex) => (
                    <div
                      key={`label-row-${rowIndex}-${row[0]?.id || row[0]?.tagId || ''}`}
                      className={`bg-white border-2 border-dashed border-slate-400 p-2 rounded-xl shadow-md flex items-center gap-2 bg-amber-50/20 ${
                        labelLayout === 'a7' ? 'flex-col' : 'flex-row'
                      }`}
                      style={{
                        width: labelLayout === 'a7' ? '290px' : labelLayout === 'double' ? '430px' : '220px',
                        height: labelLayout === 'a7' ? '415px' : '100px',
                      }}
                    >
                      {row.map((item, colIndex) => {
                        const scanState = checkScanStatus(item.tagId || item.id, item.qrPayload, item.quantity);
                        const isScanned = scanState.isScanned;
                        const imported = scanState.importedQuantity || 0;
                        const total = item.quantity || scanState.totalQuantity || 0;
                        const isPartial = imported > 0 && imported < total;

                        if (labelLayout === 'a7') {
                          return (
                            <div
                              key={item.tagId || item.id || `col-${rowIndex}-${colIndex}`}
                              className={`w-full h-full rounded-lg p-3 flex flex-col justify-between overflow-hidden shadow-xs relative border transition-all ${
                                isScanned
                                  ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400 shadow-emerald-100'
                                  : isPartial
                                  ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-400 shadow-amber-100'
                                  : 'bg-white border-slate-300'
                              }`}
                            >
                              {/* Scanned Badge */}
                              <div className="absolute top-1.5 right-1.5 z-10">
                                {isScanned ? (
                                  <span className="px-1.5 py-0.5 bg-emerald-600 text-white font-black text-[8px] rounded-xs shadow-xs flex items-center space-x-0.5 uppercase">
                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                    <span>ĐÃ NHẬP ({imported}/{total})</span>
                                  </span>
                                ) : isPartial ? (
                                  <span className="px-1.5 py-0.5 bg-amber-500 text-white font-black text-[8px] rounded-xs shadow-xs flex items-center space-x-0.5 uppercase">
                                    <span>ĐANG NHẬP ({imported}/{total})</span>
                                  </span>
                                ) : (
                                  <span className="text-[8px] font-mono font-bold text-slate-500 bg-slate-100 px-1 py-0.5 rounded-xs border border-slate-200">
                                    CHƯA NHẬP KHO
                                  </span>
                                )}
                              </div>

                              {/* Header */}
                              <div className="text-center pt-1">
                                <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between pb-1 border-b border-slate-200 pr-20">
                                  <span>CONT: {item.contNumber || contNumber}</span>
                                  <span className="text-amber-700 font-extrabold">{item.contDate || contDate}</span>
                                </div>

                                <p className="text-xs font-black text-slate-900 mt-1.5 leading-tight line-clamp-2">
                                  {item.name}
                                </p>
                                <div className="inline-block bg-slate-100 border border-slate-300 text-emerald-800 font-mono font-extrabold text-[11px] px-2 py-0.5 rounded-md mt-1">
                                  {item.code}
                                </div>
                              </div>

                              {/* Center QR Code */}
                              <div className="my-1 flex justify-center shrink-0">
                                <div className="p-1.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
                                  <QRCodeSVG value={item.qrPayload} size={100} level="Q" marginSize={1} />
                                </div>
                              </div>

                              {/* Supplier & Mfg Date */}
                              <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200 text-[10px] leading-snug">
                                {item.supplier && (
                                  <p className="font-bold text-slate-800 truncate">
                                    NCC: <strong className="text-slate-900">{item.supplier}</strong>
                                  </p>
                                )}
                                {item.mfgDate && (
                                  <p className="font-extrabold text-amber-800">
                                    NSX: {item.mfgDate}
                                  </p>
                                )}
                              </div>

                              {/* Footer */}
                              <div className="pt-1 border-t border-slate-300 flex items-center justify-between text-[11px] font-bold text-slate-800">
                                <span>ĐVT: {item.unit}</span>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={item.tagId || item.id || `col-${rowIndex}-${colIndex}`}
                            className={`flex-1 h-full rounded-md p-2 flex items-center justify-between overflow-hidden shadow-2xs relative border transition-all ${
                              isScanned
                                ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400/80 shadow-emerald-100'
                                : isPartial
                                ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-400/80 shadow-amber-100'
                                : 'bg-white border-slate-300'
                            }`}
                          >
                            {/* Scanned Badge Indicator */}
                            <div className="absolute top-0.5 right-1 z-10 flex items-center space-x-1">
                              {isScanned ? (
                                <span className="px-1.5 py-0.5 bg-emerald-600 text-white font-black text-[8px] rounded-xs shadow-xs flex items-center space-x-0.5 uppercase tracking-wider">
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                  <span>ĐÃ NHẬP ({imported}/{total})</span>
                                </span>
                              ) : isPartial ? (
                                <span className="px-1.5 py-0.5 bg-amber-500 text-white font-black text-[8px] rounded-xs shadow-xs flex items-center space-x-0.5 uppercase tracking-wider">
                                  <span>ĐANG NHẬP ({imported}/{total})</span>
                                </span>
                              ) : (
                                <span className="text-[8px] font-mono font-bold text-slate-400 bg-slate-100 px-1 rounded-xs border border-slate-200">
                                  CHƯA NHẬP KHO
                                </span>
                              )}
                            </div>

                            {/* Left: QR Code */}
                            <div className="shrink-0 pr-1.5">
                              <QRCodeSVG
                                value={item.qrPayload}
                                size={60}
                                level="M"
                                marginSize={0}
                              />
                            </div>

                            {/* Right: Part Details */}
                            <div className="flex-1 min-w-0 h-full flex flex-col justify-between py-0.5">
                              <div className="text-[8px] font-bold text-slate-500 truncate uppercase tracking-tighter flex items-center justify-between pr-12">
                                <span>C: {item.contNumber || contNumber}</span>
                                <span className="text-amber-700 font-bold">{item.contDate || contDate}</span>
                              </div>

                              <div>
                                <p className="text-[10px] font-black text-slate-900 leading-tight line-clamp-1">
                                  {item.name}
                                </p>
                                <p className={`text-[9px] font-mono font-bold mt-0.5 ${isScanned ? 'text-emerald-900 font-black' : 'text-emerald-800'}`}>
                                  {item.code}
                                </p>
                              </div>

                              {(item.supplier || item.mfgDate) && (
                                <div className="text-[8px] font-medium text-slate-600 truncate leading-tight">
                                  {item.supplier && <span className="block truncate">NCC: <strong className="text-slate-800">{item.supplier}</strong></span>}
                                  {item.mfgDate && <span className="text-amber-800 font-bold">NSX: {item.mfgDate}</span>}
                                </div>
                              )}

                              <div className="flex items-center justify-between text-[9px] font-extrabold border-t border-slate-200 pt-0.5">
                                <span className="text-slate-500">ĐVT: {item.unit}</span>
                                {imported > 0 && (
                                  <span className={`px-1 rounded-xs font-mono text-[8px] ${isScanned ? 'bg-emerald-600 text-white font-black' : 'bg-amber-500 text-white font-bold'}`}>
                                    {imported}/{total}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

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
          <span>
            * Mẹo in: Chọn máy in tem nhiệt (Godex/Xprinter/HPRT), Khổ giấy {labelLayout === 'a7' ? 'A7 (74x105mm)' : labelLayout === 'double' ? '73x22mm' : '35x22mm'}, Margins = None.
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold cursor-pointer transition-colors"
            >
              Đóng
            </button>
            {parseResult && (
              <button
                onClick={handlePrint}
                disabled={printLabelItems.length === 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl font-bold shadow-md cursor-pointer transition-colors flex items-center space-x-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>In Ngay ({printLabelItems.length} tem)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* HIDDEN PRINT RENDERING CONTAINER */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '0', height: '0', overflow: 'hidden' }}>
        <div ref={printRef}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {labelRows.map((row, rowIndex) => {
              const conf = printConfigs[labelLayout];
              return (
                <div
                  key={rowIndex}
                  className="label-row"
                  style={{ 
                    width: `${conf.pageWidth}mm`, 
                    height: `${conf.pageHeight}mm`,
                    padding: `${conf.padding}mm`,
                    gap: labelLayout === 'double' ? '2mm' : '0',
                    boxSizing: 'border-box'
                  }}
                >
                  {row.map((item, colIndex) => (
                    <div
                      key={colIndex}
                      className="single-label"
                      style={{
                        width: labelLayout === 'double' ? '35mm' : (labelLayout === 'single' ? '33mm' : '100%'),
                        height: labelLayout === 'a7' ? '100%' : '20mm',
                        flexDirection: labelLayout === 'a7' ? 'column' : 'row',
                        justifyContent: labelLayout === 'a7' ? 'space-between' : 'flex-start',
                        alignItems: labelLayout === 'a7' ? 'stretch' : 'center',
                        border: labelLayout === 'a7' ? '1px solid #94a3b8' : '0.5px solid #ccc',
                        borderRadius: labelLayout === 'a7' ? '3mm' : '2mm',
                        padding: labelLayout === 'a7' ? '3.5mm' : '1mm',
                        boxSizing: 'border-box'
                      }}
                    >
                      {labelLayout === 'a7' ? (
                        <>
                          {/* Top Section */}
                          <div style={{ textAlign: 'center', width: '100%' }}>
                            <div style={{ fontSize: `${conf.metaFontSize}px`, fontWeight: 'bold', color: '#475569', marginBottom: '2mm', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '1.5mm' }}>
                              <span>CONT: {item.contNumber || contNumber}</span>
                              <span style={{ color: '#b45309' }}>{item.contDate || contDate}</span>
                            </div>

                            <div style={{ fontSize: `${conf.nameFontSize}px`, fontWeight: '900', color: '#0f172a', marginTop: '2mm', marginBottom: '2mm', lineHeight: '1.25', wordBreak: 'break-word', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {item.name}
                            </div>

                            <div style={{ fontSize: `${conf.codeFontSize}px`, fontWeight: 'bold', fontFamily: 'monospace', color: '#047857', padding: '1.5mm 3mm', background: '#f1f5f9', borderRadius: '2mm', border: '1px solid #cbd5e1', display: 'inline-block' }}>
                              {item.code}
                            </div>
                          </div>

                          {/* Center QR Code */}
                          <div style={{ width: `${conf.qrSize}mm`, height: `${conf.qrSize}mm`, margin: '2mm auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <QRCodeSVG
                              value={item.qrPayload}
                              size={220}
                              level="Q"
                              marginSize={1}
                              style={{ width: '100%', height: '100%' }}
                            />
                          </div>

                          {/* Supplier, Mfg Date & Footer */}
                          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5mm', marginTop: 'auto' }}>
                            {(item.supplier || item.mfgDate) && (
                              <div style={{ background: '#f8fafc', padding: '2mm', borderRadius: '1.5mm', border: '1px solid #e2e8f0' }}>
                                {item.supplier && (
                                  <div style={{ fontSize: `${conf.metaFontSize + 1}px`, fontWeight: 'bold', color: '#1e293b', wordBreak: 'break-word' }}>
                                    NCC: {item.supplier}
                                  </div>
                                )}
                                {item.mfgDate && (
                                  <div style={{ fontSize: `${conf.metaFontSize + 1}px`, fontWeight: '800', color: '#b45309', marginTop: item.supplier ? '1mm' : '0' }}>
                                    NSX: {item.mfgDate}
                                  </div>
                                )}
                              </div>
                            )}

                            <div style={{ fontSize: `${conf.metaFontSize + 1}px`, fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1.5px solid #cbd5e1', paddingTop: '1.5mm', marginTop: '1mm' }}>
                              <span>ĐVT: {item.unit}</span>
                            </div>

                            <div style={{ fontSize: '10px', fontWeight: 'normal', color: '#64748b', textAlign: 'right' }}>
                              Ngày in: {new Date().toLocaleDateString('vi-VN')}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ width: `${conf.qrSize}mm`, height: `${conf.qrSize}mm`, flexShrink: 0, marginRight: '1mm' }}>
                            <QRCodeSVG
                              value={item.qrPayload}
                              size={128}
                              level="M"
                              marginSize={0}
                              style={{ width: '100%', height: '100%' }}
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontFamily: 'sans-serif', lineHeight: '1.1' }}>
                            <div style={{ fontSize: `${conf.metaFontSize}px`, fontWeight: 'bold', color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', justifyContent: 'space-between' }}>
                              <span>C: {item.contNumber || contNumber}</span>
                              <span>{item.contDate || contDate}</span>
                            </div>
                            <div>
                              <div style={{ fontSize: `${conf.nameFontSize}px`, fontWeight: '900', color: '#000', maxHeight: '8mm', overflow: 'hidden', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                {item.name}
                              </div>
                              <div style={{ fontSize: `${conf.codeFontSize}px`, fontWeight: 'bold', fontFamily: 'monospace', color: '#065f46', marginTop: '0.2mm' }}>
                                {item.code}
                              </div>
                            </div>
                            {item.supplier && (
                              <div style={{ fontSize: `${Math.max(conf.metaFontSize - 1, 7)}px`, fontWeight: 'bold', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                NCC: {item.supplier}
                              </div>
                            )}
                            <div style={{ fontSize: `${conf.metaFontSize}px`, fontWeight: 'bold', borderTop: '0.5px solid #ccc', paddingTop: '0.5mm', display: 'flex', justifyContent: 'space-between' }}>
                              <span>ĐVT: {item.unit}</span>
                              {item.mfgDate && <span style={{ color: '#b45309' }}>NSX: {item.mfgDate}</span>}
                            </div>
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
