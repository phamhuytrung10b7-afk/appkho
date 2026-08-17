import React, { useState, useEffect, useRef } from 'react';
import { Part, AppSettings, WarehouseLocation } from './types';
import { storageService } from './storage';
import { ArrowDownLeft, CheckCircle2, AlertCircle, Package, Clock, User, FileText, QrCode, FileSpreadsheet, Zap, X, MapPin, Camera } from 'lucide-react';
import { SearchableSelect, SelectOption } from './SearchableSelect';
import { QrScannerModal } from './QrScannerModal';
import { ContainerImportPrintModal } from './ContainerImportPrintModal';
import { InlineQrScanner } from './InlineQrScanner';
import { Html5Qrcode } from 'html5-qrcode';
import { normalizeLocationStr } from './StockOutScanModal';

interface StockInViewProps {
  parts: Part[];
  settings: AppSettings;
  onSuccess: () => void;
}

const getNowLocalDateTime = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
};

// Smart matching function for location QR code scanning
export function findLocationMatch(
  scannedText: string,
  locations: WarehouseLocation[] = []
): WarehouseLocation | undefined {
  if (!scannedText || !scannedText.trim()) return undefined;

  let raw = scannedText.trim();
  if (raw.includes('|')) {
    const parts = raw.split('|');
    raw = parts[parts.length - 1].trim();
  }

  const normScanned = normalizeLocationStr(raw);
  if (!normScanned) return undefined;

  // 1. Exact case-insensitive match on name or id
  let found = locations.find(
    (l) =>
      l.name.toLowerCase() === raw.toLowerCase() ||
      l.id.toLowerCase() === raw.toLowerCase()
  );
  if (found) return found;

  // 2. Exact match on prefix/short name (e.g. "A01" matching "A01 (Khoang 01 - Tầng 1 - Vị trí 1)")
  found = locations.find((l) => {
    const shortName = l.name.split('(')[0].trim();
    return (
      shortName.toLowerCase() === raw.toLowerCase() ||
      normalizeLocationStr(shortName) === normScanned
    );
  });
  if (found) return found;

  // 3. Normalized string match on l.name or l.id
  found = locations.find(
    (l) =>
      normalizeLocationStr(l.name) === normScanned ||
      normalizeLocationStr(l.id) === normScanned
  );
  if (found) return found;

  // 4. If scanned text is a long QR barcode payload containing the exact full location name/id
  found = locations.find((l) => {
    const normName = normalizeLocationStr(l.name);
    const normId = normalizeLocationStr(l.id);
    const shortNameNorm = normalizeLocationStr(l.name.split('(')[0].trim());

    return (
      (normName.length >= 2 && normScanned.includes(normName)) ||
      (shortNameNorm.length >= 2 && normScanned.includes(shortNameNorm)) ||
      (normId.length >= 2 && normScanned.includes(normId))
    );
  });
  if (found) return found;

  // 5. Match description exactly
  found = locations.find(
    (l) => l.description && normalizeLocationStr(l.description) === normScanned
  );
  return found;
}

export const StockInView: React.FC<StockInViewProps> = ({ parts, settings, onSuccess }) => {
  const [selectedPartId, setSelectedPartId] = useState(parts[0]?.id || '');
  const [quantity, setQuantity] = useState<number>(100);
  const [dateTime, setDateTime] = useState(getNowLocalDateTime());

  // Default person from logged in user, or fallback to settings
  const currentUser = storageService.getCurrentUser();
  const currentUserName = currentUser
    ? `${currentUser.fullName}${currentUser.roleTitle ? ` (${currentUser.roleTitle})` : ''}`
    : (settings.staffList?.[0] || settings.managerName || 'Trần Văn Bình (Kho)');
  
  const defaultPerson = currentUserName;
  const [person, setPerson] = useState(defaultPerson);

  const staffOptions = React.useMemo(() => {
    const list = settings.staffList || [];
    if (currentUserName && !list.includes(currentUserName)) {
      return [currentUserName, ...list];
    }
    return list.length ? list : [currentUserName];
  }, [settings.staffList, currentUserName]);

  // Default reason from settings or initial fallback
  const defaultReason = settings.stockInReasons?.[0] || 'Nhập mua hàng theo hợp đồng';
  const [reason, setReason] = useState(defaultReason);

  const [notes, setNotes] = useState('');
  const [scannedTagId, setScannedTagId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isContModalOpen, setIsContModalOpen] = useState(false);

  const [mainTab, setMainTab] = useState<'scan' | 'manual'>('scan');
  const [autoScanHistory, setAutoScanHistory] = useState<
    { id: string; partCode: string; partName: string; qty: number; unit: string; time: string; contNumber?: string; stockAfter: number }[]
  >([]);

  const [partialImportModal, setPartialImportModal] = useState<{
    isOpen: boolean;
    part: Part;
    tagId?: string;
    contNumber?: string;
    originalQty: number;
    alreadyImported: number;
  } | null>(null);
  
  const [importQtyInput, setImportQtyInput] = useState<number | ''>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [customLocation, setCustomLocation] = useState('');

  // Location QR Camera / Gun Scanner States
  const [isLocScannerActive, setIsLocScannerActive] = useState(false);
  const [locScannerError, setLocScannerError] = useState<string | null>(null);
  const [locScanGunInput, setLocScanGunInput] = useState('');

  const qtyInputRef = useRef<HTMLInputElement>(null);
  const manualQtyInputRef = useRef<HTMLInputElement>(null);
  const locationSelectRef = useRef<HTMLSelectElement>(null);
  const modalLocationSelectRef = useRef<HTMLSelectElement>(null);
  const locScanGunInputRef = useRef<HTMLInputElement>(null);
  const locHtml5QrRef = useRef<Html5Qrcode | null>(null);

  const selectedPart = parts.find((p) => p.id === selectedPartId);

  useEffect(() => {
    if (selectedPart) {
      setSelectedLocation('');
      setCustomLocation('');
    }
  }, [selectedPartId]);

  // Auto focus into Quantity Input when Partial Import Modal opens
  useEffect(() => {
    if (partialImportModal?.isOpen) {
      setTimeout(() => {
        qtyInputRef.current?.focus();
      }, 150);
    } else {
      stopLocCamera();
      setLocScanGunInput('');
    }
  }, [partialImportModal?.isOpen]);

  const [errorModal, setErrorModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  const processStockInSubmit = (targetLoc: string, actualQty: number) => {
    if (!partialImportModal) return;

    const { part, tagId, contNumber, originalQty, alreadyImported } = partialImportModal;
    const reasonText = `Nhập kho theo Cont ${contNumber}`;

    const tx = storageService.addStockIn({
      partId: part.id,
      quantity: actualQty,
      date: new Date().toISOString(),
      person: defaultPerson,
      reasonOrPurpose: reasonText,
      notes: tagId ? `Tem QR Cont: ${contNumber} (ID: ${tagId})` : `Tem QR Cont ${contNumber}`,
      locationId: targetLoc.trim(),
    });

    // Save location to part
    storageService.updatePart(part.id, { location: targetLoc.trim() });

    const newImportedTotal = alreadyImported + actualQty;
    if (tagId) {
      storageService.markQrTokenAsUsed(tagId, {
        partCode: part.code,
        quantity: originalQty,
        importedQuantity: newImportedTotal,
        contNumber: contNumber || '',
        person: defaultPerson,
      });
    }

    const nowTimeStr = new Date().toLocaleTimeString('vi-VN');
    setAutoScanHistory((prev) => [
      {
        id: `${part.id}-${Date.now()}`,
        partCode: part.code,
        partName: part.name,
        qty: actualQty,
        unit: part.unit,
        time: nowTimeStr,
        contNumber,
        stockAfter: tx.stockAfter,
      },
      ...prev,
    ]);

    // Close partial import modal immediately
    setPartialImportModal(null);

    // Show compact small success notification toast
    setMessage({
      type: 'success',
      text: `✅ NHẬP KHO THÀNH CÔNG: +${actualQty} ${part.unit} [${part.code}] vào Kệ [${targetLoc.trim()}]. Tồn kho: ${tx.stockAfter.toLocaleString('vi-VN')} ${part.unit}.`,
    });
  };

  const handleLocScanResult = (scannedText: string) => {
    if (!scannedText.trim()) return;

    const foundInSettings = findLocationMatch(scannedText, settings.locations || []);

    if (!foundInSettings) {
      setLocScanGunInput('');
      setErrorModal({
        isOpen: true,
        title: '❌ MÃ KỆ KHÔNG TỒN TẠI TRONG HỆ THỐNG',
        message: `Mã QR kệ "${scannedText}" KHÔNG TỒN TẠI trong danh mục vị trí kệ kho của hệ thống. Vui lòng quét đúng mã QR kệ hợp lệ!`,
      });
      return;
    }

    const targetLocName = foundInSettings.name;
    setSelectedLocation(foundInSettings.name);
    setCustomLocation('');
    setLocScanGunInput('');

    // If Partial Import Popup Modal is currently open, validate & auto confirm immediately!
    if (partialImportModal) {
      const actualQty = typeof importQtyInput === 'number' ? importQtyInput : Number(importQtyInput);
      const remaining = partialImportModal.originalQty - partialImportModal.alreadyImported;

      if (!actualQty || actualQty <= 0) {
        setErrorModal({
          isOpen: true,
          title: '⚠️ THIẾU SỐ LƯỢNG NHẬP KHO',
          message: 'Vui lòng nhập Số Lượng thực tế cần nhập trước khi quét mã QR Kệ!',
        });
        return;
      }

      if (actualQty > remaining) {
        setErrorModal({
          isOpen: true,
          title: '❌ SỐ LƯỢNG VƯỢT QUÁ CÒN LẠI',
          message: `Số lượng nhập (${actualQty} ${partialImportModal.part.unit}) vượt quá số lượng còn lại trong Cont (${remaining} ${partialImportModal.part.unit})!`,
        });
        return;
      }

      // Auto Submit Confirmation!
      processStockInSubmit(targetLocName, actualQty);
    }
  };

  const startLocCamera = async () => {
    setIsLocScannerActive(true);
    setLocScannerError(null);

    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode('loc-qr-reader-container');
        locHtml5QrRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            handleLocScanResult(decodedText);
            if (html5QrCode.isScanning) {
              html5QrCode.stop().then(() => html5QrCode.clear()).catch(() => {});
            }
            setIsLocScannerActive(false);
          },
          () => {}
        );
      } catch (err: any) {
        console.warn('Loc camera error:', err);
        setLocScannerError('Không mở được camera trực tiếp. Vui lòng dùng súng quét USB/Bluetooth hoặc chọn vị trí kệ trong danh sách.');
      }
    }, 120);
  };

  const stopLocCamera = () => {
    if (locHtml5QrRef.current && locHtml5QrRef.current.isScanning) {
      locHtml5QrRef.current.stop().then(() => locHtml5QrRef.current?.clear()).catch(() => {});
    }
    setIsLocScannerActive(false);
  };

  // Submit handler for partial / batch import popup modal
  const submitPartialImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partialImportModal) return;

    const actualQty = typeof importQtyInput === 'number' ? importQtyInput : Number(importQtyInput);
    if (!actualQty || actualQty <= 0) {
      setErrorModal({
        isOpen: true,
        title: '⚠️ THIẾU SỐ LƯỢNG NHẬP KHO',
        message: 'Vui lòng nhập Số Lượng thực tế cần nhập trước khi xác nhận!',
      });
      return;
    }

    const remaining = partialImportModal.originalQty - partialImportModal.alreadyImported;
    if (actualQty > remaining) {
      setErrorModal({
        isOpen: true,
        title: '❌ SỐ LƯỢNG VƯỢT QUÁ CÒN LẠI',
        message: `Số lượng nhập (${actualQty} ${partialImportModal.part.unit}) vượt quá số lượng còn lại trong Cont (${remaining} ${partialImportModal.part.unit})!`,
      });
      return;
    }

    const targetLocation = (selectedLocation === '__custom__' ? customLocation : selectedLocation) || customLocation;
    if (!targetLocation.trim()) {
      setErrorModal({
        isOpen: true,
        title: '❌ THIẾU VỊ TRÍ KỆ',
        message: 'Vui lòng chọn hoặc quét vị trí / kệ đặt linh kiện!',
      });
      return;
    }

    const foundLoc = findLocationMatch(targetLocation, settings.locations || []);
    if (!foundLoc) {
      setErrorModal({
        isOpen: true,
        title: '❌ MÃ KỆ KHÔNG TỒN TẠI TRONG HỆ THỐNG',
        message: `Vị trí kệ "${targetLocation}" KHÔNG TỒN TẠI trong danh mục vị trí kệ kho đã khai báo của hệ thống. Vui lòng chọn hoặc quét kệ hợp lệ!`,
      });
      return;
    }

    stopLocCamera();
    processStockInSubmit(foundLoc.name, actualQty);
    onSuccess();
  };

  const handleAutoStockInFromQr = ({
    part,
    qty,
    contNumber,
    tagId,
  }: {
    part: Part;
    qty?: number;
    contNumber?: string;
    tagId?: string;
  }) => {
    // If not a Cont QR code with explicit quantity & contNumber, switch to manual tab
    if (!qty || qty <= 0 || !contNumber) {
      setSelectedPartId(part.id);
      setMainTab('manual');
      setMessage({
        type: 'success',
        text: `ℹ️ Đã tìm thấy linh kiện [${part.code}] ${part.name}. Vui lòng nhập số lượng và chọn vị trí kệ để hoàn tất phiếu nhập.`,
      });
      return;
    }

    // STRICT CONTAINER BATCH CHECK
    const tokenKey = tagId || `${contNumber}-${part.code}`;
    const validCheck = storageService.validateContainerQrTag(tokenKey, {
      partCode: part.code,
      contNumber,
      tagId,
    });

    if (!validCheck.isValid) {
      setMessage({
        type: 'error',
        text: `⛔ KHÔNG THỂ NHẬP KHO! ${validCheck.reason || 'Mã QR này không thuộc bất kỳ Danh mục Container nào đã khởi tạo trên hệ thống.'}`,
      });
      return;
    }

    const usedCheck = storageService.isQrTokenUsed(tokenKey);
    const totalQtyInCont = qty || usedCheck.quantity || validCheck.totalContQty || 0;
    const alreadyImported = usedCheck.importedQuantity || 0;
    const remainingQty = totalQtyInCont - alreadyImported;

    if (remainingQty <= 0) {
      setMessage({
        type: 'error',
        text: `⛔ Mã QR Tem Cont ${contNumber} linh kiện [${part.code}] đã được nhập ĐỦ số lượng (${alreadyImported.toLocaleString('vi-VN')}/${totalQtyInCont.toLocaleString('vi-VN')} ${part.unit})!`,
      });
      return;
    }

    // Open Popup Modal asking user for import quantity and location!
    setSelectedLocation('');
    setCustomLocation('');
    setImportQtyInput(''); // Blank by default, user must enter actual quantity!
    setPartialImportModal({
      isOpen: true,
      part,
      tagId: tokenKey,
      contNumber,
      originalQty: totalQtyInCont,
      alreadyImported,
    });
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
    if (!selectedPartId) {
      setMessage({ type: 'error', text: 'Vui lòng chọn linh kiện cần nhập kho!' });
      return;
    }
    if (quantity <= 0) {
      setMessage({ type: 'error', text: 'Số lượng nhập phải lớn hơn 0!' });
      return;
    }

    const targetLoc = (selectedLocation === '__custom__' ? customLocation : selectedLocation).trim();
    if (!targetLoc) {
      setMessage({ type: 'error', text: 'Vui lòng chọn hoặc quét vị trí / kệ nhập kho!' });
      return;
    }

    if (!person.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng chọn hoặc nhập tên người nhập kho!' });
      return;
    }

    try {
      const tx = storageService.addStockIn({
        partId: selectedPartId,
        quantity: Number(quantity),
        date: new Date(dateTime).toISOString(),
        person: person.trim(),
        reasonOrPurpose: reason.trim(),
        notes: notes.trim(),
        locationId: targetLoc,
      });

      // If imported via Cont QR Code, mark this tag as USED so it can NEVER be scanned twice!
      if (scannedTagId) {
        storageService.markQrTokenAsUsed(scannedTagId, {
          partCode: selectedPart?.code || '',
          quantity: Number(quantity),
          contNumber: reason.replace('Nhập kho theo Cont ', ''),
          person: person.trim(),
        });
        setScannedTagId(null);
      }

      setMessage({
        type: 'success',
        text: `Đã nhập kho thành công +${quantity} ${tx.unit} cho [${tx.partCode}] ${tx.partName}. Tồn kho mới: ${tx.stockAfter} ${tx.unit}.`,
      });

      // Reset form
      setQuantity(100);
      setNotes('');
      setDateTime(getNowLocalDateTime());
      onSuccess();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi khi lưu phiếu nhập kho' });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Title */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
            <ArrowDownLeft className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">PHIẾU NHẬP KHO LINH KIỆN</h2>
            <p className="text-xs text-slate-500">Tự động cộng dồn tồn kho thực tế, lưu ngày giờ chính xác và cập nhật Thẻ kho.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsContModalOpen(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4 text-amber-300" />
          <span>In Tem QR Danh Mục Cont (Excel)</span>
        </button>
      </div>

      {/* Main Mode Selection Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-100/80 p-1.5 rounded-2xl gap-2">
        <button
          type="button"
          onClick={() => setMainTab('scan')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            mainTab === 'scan'
              ? 'bg-emerald-700 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>1. QUÉT MÃ TỰ ĐỘNG (TỰ ĐỘNG CỘNG TỒN KHO)</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('manual')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            mainTab === 'manual'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <FileText className="w-4 h-4 text-slate-500" />
          <span>2. NHẬP KHO THỦ CÔNG (DỰ PHÒNG)</span>
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

      
      {/* PARTIAL / BATCH IMPORT MODAL */}
      {partialImportModal && partialImportModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] border border-slate-100 animate-in zoom-in-95">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-emerald-800 to-teal-900 text-white">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                  <Package className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight">Khai Báo Nhập Kho Linh Kiện (Tem Cont)</h3>
                  <p className="text-[11px] text-emerald-200">Xác nhận số lượng thực tế & khoang kệ cất giữ</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPartialImportModal(null)}
                className="p-1 text-emerald-200 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={submitPartialImport} className="p-5 space-y-4 overflow-y-auto">
              {/* Cont & Part Info Box */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono font-bold text-blue-700 text-xs bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                      {partialImportModal.part.code}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm mt-1">
                      {partialImportModal.part.name}
                    </h4>
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 bg-slate-200/60 px-2.5 py-1 rounded-lg">
                    ĐVT: {partialImportModal.part.unit}
                  </span>
                </div>

                <div className="text-xs text-slate-600 flex items-center space-x-1">
                  <span>Mã Container:</span>
                  <strong className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
                    {partialImportModal.contNumber}
                  </strong>
                </div>

                {/* Progress Stats */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 text-center text-xs">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-medium">Tổng trong Cont</span>
                    <strong className="font-mono font-bold text-slate-800 text-sm">
                      {partialImportModal.originalQty.toLocaleString('vi-VN')}
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-medium">Đã nhập kho</span>
                    <strong className="font-mono font-bold text-emerald-600 text-sm">
                      {partialImportModal.alreadyImported.toLocaleString('vi-VN')}
                    </strong>
                  </div>
                  <div className="bg-amber-50 p-2 rounded-lg border border-amber-200">
                    <span className="text-[10px] text-amber-700 block font-medium">Còn chưa nhập</span>
                    <strong className="font-mono font-bold text-amber-900 text-sm">
                      {(partialImportModal.originalQty - partialImportModal.alreadyImported).toLocaleString('vi-VN')}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Input Quantity */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-extrabold text-slate-800">
                    1. Số lượng thực tế nhập đợt này ({partialImportModal.part.unit}) *
                  </label>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    Tối đa: {(partialImportModal.originalQty - partialImportModal.alreadyImported).toLocaleString('vi-VN')} {partialImportModal.part.unit}
                  </span>
                </div>

                <input
                  ref={qtyInputRef}
                  type="number"
                  min="1"
                  max={partialImportModal.originalQty - partialImportModal.alreadyImported}
                  required
                  autoFocus
                  value={importQtyInput === '' ? '' : importQtyInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      // Jump cursor focus directly into the Rack QR Scan input!
                      locScanGunInputRef.current?.focus();
                      locScanGunInputRef.current?.select();
                    }
                  }}
                  onChange={(e) => setImportQtyInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-amber-50/50 border-2 border-amber-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-base font-mono font-bold text-slate-900 outline-hidden transition-all"
                  placeholder="👉 Tự điền số lượng kiểm đếm đợt này..."
                />
                <p className="text-[10px] text-emerald-700 italic font-medium">
                  💡 Gõ số lượng xong nhấn Enter để nhảy ngay tới ô Bắn mã QR Kệ. Hệ thống không tự điền sẵn.
                </p>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-slate-400 font-medium">Nhanh:</span>
                  {[100, 200, 500, 1000].map((preset) => {
                    const remaining = partialImportModal.originalQty - partialImportModal.alreadyImported;
                    if (preset > remaining) return null;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setImportQtyInput(preset)}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 rounded-md text-[11px] font-bold text-slate-600 transition-colors cursor-pointer"
                      >
                        +{preset}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setImportQtyInput(partialImportModal.originalQty - partialImportModal.alreadyImported)}
                    className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-md text-[11px] font-bold transition-colors cursor-pointer ml-auto"
                  >
                    Nhập hết ({(partialImportModal.originalQty - partialImportModal.alreadyImported).toLocaleString('vi-VN')})
                  </button>
                </div>
              </div>

              {/* Location Select & Scan Section */}
              <div className="space-y-2.5 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-extrabold text-slate-800 flex items-center space-x-1.5">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    <span>2. Vị trí / Kệ cất giữ linh kiện *</span>
                  </label>
                  
                  <button
                    type="button"
                    onClick={() => (isLocScannerActive ? stopLocCamera() : startLocCamera())}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                      isLocScannerActive
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{isLocScannerActive ? 'Tắt Camera Kệ' : 'Quét Camera Kệ'}</span>
                  </button>
                </div>

                {/* Inline Camera for Shelf QR Scanning */}
                {isLocScannerActive && (
                  <div className="p-3 bg-slate-900 rounded-xl space-y-2 text-white animate-in zoom-in-95">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold flex items-center text-emerald-400">
                        <MapPin className="w-3.5 h-3.5 mr-1 animate-bounce" />
                        Đưa mã QR trên Kệ vào ô vuông bên dưới
                      </span>
                      <button
                        type="button"
                        onClick={stopLocCamera}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div id="loc-qr-reader-container" className="overflow-hidden rounded-lg min-h-[180px] bg-black" />

                    {locScannerError && (
                      <p className="text-[11px] text-red-400 font-medium">{locScannerError}</p>
                    )}
                  </div>
                )}

                {/* PRIMARY: Handheld barcode gun input for Rack QR */}
                <div className="space-y-1">
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <MapPin className="w-4 h-4 text-emerald-600 absolute left-3 top-3" />
                      <input
                        ref={locScanGunInputRef}
                        type="text"
                        value={locScanGunInput}
                        onChange={(e) => {
                          setLocScanGunInput(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleLocScanResult(locScanGunInput);
                          }
                        }}
                        placeholder="🎯 Gõ mã kệ đầy đủ hoặc bắn súng quét mã QR kệ..."
                        className="w-full pl-9 pr-3 py-2.5 bg-emerald-50/60 border-2 border-emerald-400 rounded-xl text-xs font-bold text-slate-900 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-hidden transition-all"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLocScanResult(locScanGunInput)}
                      className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
                    >
                      Xác nhận Kệ
                    </button>
                  </div>
                  <p className="text-[10px] text-emerald-700 italic">
                    ⚡ Nhập chính xác mã kệ đầy đủ hoặc dùng súng quét mã QR dán trên kệ rồi nhấn Enter / Xác nhận Kệ.
                  </p>
                </div>

                {/* Status badge if location is selected */}
                {selectedLocation && (
                  <div className="p-2.5 bg-emerald-100/80 border border-emerald-300 rounded-xl flex items-center justify-between text-xs font-bold text-emerald-950">
                    <span className="flex items-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Kệ đã nhận diện: <strong className="underline text-emerald-900">{selectedLocation === '__custom__' ? customLocation : selectedLocation}</strong></span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLocation('');
                        setCustomLocation('');
                        locScanGunInputRef.current?.focus();
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-800 underline font-normal"
                    >
                      Chọn lại
                    </button>
                  </div>
                )}

                {/* SECONDARY: Location Select Dropdown */}
                <div className="pt-1">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Hoặc chọn chọn tay vị trí trong danh sách kệ (khi không quét):
                  </label>
                  <select
                    ref={modalLocationSelectRef}
                    value={selectedLocation}
                    onChange={(e) => {
                      setSelectedLocation(e.target.value);
                      if (e.target.value !== '__custom__') {
                        setCustomLocation('');
                      }
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 text-xs font-semibold text-slate-800 outline-hidden"
                  >
                    <option value="">-- Bắt buộc chọn khoang / kệ lưu trữ --</option>
                    {settings.locations?.map((loc) => (
                      <option key={loc.id} value={loc.name}>
                        📍 {loc.name} {loc.description ? `(${loc.description})` : ''}
                      </option>
                    ))}
                    <option value="__custom__">➕ Tự nhập vị trí mới...</option>
                  </select>

                  {/* Custom Location Text Input if custom selected or no predefined locations */}
                  {(selectedLocation === '__custom__' || (!settings.locations || settings.locations.length === 0)) && (
                    <input
                      type="text"
                      value={customLocation}
                      onChange={(e) => setCustomLocation(e.target.value)}
                      placeholder="Gõ tên kệ / khoang mới (VD: Kệ A1, Tủ B2)..."
                      className="w-full mt-2 px-3 py-2 bg-white border-2 border-emerald-400 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-hidden"
                      required
                    />
                  )}
                </div>
              </div>
              
              {/* Action Buttons */}
              {(() => {
                const modalTargetLoc = (selectedLocation === '__custom__' ? customLocation : selectedLocation).trim();
                const isModalQtyValid = typeof importQtyInput === 'number' && importQtyInput > 0 && importQtyInput <= (partialImportModal.originalQty - partialImportModal.alreadyImported);
                const isModalLocValid = Boolean(modalTargetLoc);
                const isModalCanSubmit = isModalQtyValid && isModalLocValid;

                return (
                  <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setPartialImportModal(null)}
                      className="px-4 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={!isModalCanSubmit}
                      className={`px-6 py-2.5 font-black rounded-xl text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                        isModalCanSubmit
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>XÁC NHẬN NHẬP KHO</span>
                    </button>
                  </div>
                );
              })()}
            </form>
          </div>
        </div>
      )}

      {/* TAB 1: AUTO SCAN MODE */}
      {mainTab === 'scan' && (
        <div className="space-y-6">
          <InlineQrScanner
            mode="in"
            parts={parts}
            onScanSuccess={handleAutoStockInFromQr}
          />

          {/* Auto scan history in current session */}
          {autoScanHistory.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="font-extrabold text-xs text-slate-800 flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>DANH SÁCH LƯỢT QUÉT TỰ ĐỘNG VỪA THỰC HIỆN ({autoScanHistory.length})</span>
                </h4>
                <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
                  Đã tự động cộng vào tồn kho
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {autoScanHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-600">[{item.partCode}]</span>{' '}
                      <strong className="text-slate-900">{item.partName}</strong>
                      {item.contNumber && (
                        <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-900 text-[10px] font-bold rounded-md">
                          Cont: {item.contNumber}
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="font-black text-emerald-700 text-sm">
                        +{item.qty} {item.unit}
                      </span>
                      <p className="text-[10px] text-slate-400">Tồn mới: {item.stockAfter} • {item.time}</p>
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
              <label className="text-xs font-semibold text-slate-700 flex items-center space-x-2">
                <span>Chọn Linh Kiện Nhập Kho (Nhập thủ công)</span>
              </label>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200 transition-colors cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                <span>Quét mã camera phụ</span>
              </button>
            </div>

            <SearchableSelect
              options={partOptions}
              value={selectedPartId}
              onChange={(val) => setSelectedPartId(val)}
              placeholder="Gõ mã, tên linh kiện hoặc vị trí để tìm..."
              allowCustom={false}
              icon={<Package className="w-4 h-4 text-emerald-600" />}
            />
          </div>

        {/* Selected Part Quick Summary Card */}
        {selectedPart && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center space-x-3">
              <Package className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold text-slate-800">{selectedPart.name}</p>
                <p className="text-slate-500 font-mono">Mã: {selectedPart.code} | Vị trí: {selectedPart.location}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-slate-500 font-medium">Tồn kho hiện tại:</span>
              <p className="text-base font-black text-emerald-700">
                {selectedPart.currentStock.toLocaleString('vi-VN')} {selectedPart.unit}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Location / Shelf Selector */}
          {selectedPart && (
            <div className="col-span-1 md:col-span-2 bg-emerald-50/60 p-3.5 rounded-xl border-2 border-emerald-300">
              <label className="block text-xs font-extrabold text-emerald-950 mb-1 flex items-center justify-between">
                <span>📍 BẮT BUỘC CHỌN KỆ / VỊ TRÍ NHẬP HÀNG *</span>
                <span className="text-[11px] font-normal text-emerald-800">Cộng tồn kho cụ thể cho kệ được chọn</span>
              </label>
              <select
                ref={locationSelectRef}
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full px-3.5 py-2.5 border-2 border-emerald-400 rounded-xl text-xs font-bold bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-hidden"
              >
                <option value="">-- Bắt buộc chọn khoang / kệ lưu trữ --</option>
                {(settings.locations || []).map((loc) => (
                  <option key={loc.id} value={loc.name}>
                    📍 {loc.name} {loc.description ? `(${loc.description})` : ''}
                  </option>
                ))}
                <option value="__custom__">➕ Tự nhập vị trí mới...</option>
              </select>

              {selectedLocation === '__custom__' && (
                <input
                  type="text"
                  value={customLocation}
                  onChange={(e) => setCustomLocation(e.target.value)}
                  placeholder="Gõ tên vị trí/kệ mới..."
                  className="w-full mt-2 px-3.5 py-2 bg-white border-2 border-emerald-400 rounded-xl text-xs font-bold text-slate-900 outline-hidden"
                />
              )}
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-xs font-extrabold text-slate-800 mb-1">
              Số Lượng Nhập <span className="text-red-500">*</span>
            </label>
            <input
              ref={manualQtyInputRef}
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
              className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 rounded-xl text-base font-black text-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-hidden"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              💡 Gõ số lượng xong nhấn Enter để chuyển sang ô Chọn Kệ.
            </p>
          </div>

          {/* Date & Time (Giờ, phút, ngày) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ngày & Giờ Nhập Kho <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-hidden"
              />
            </div>
          </div>

          {/* Person / Staff (Searchable select from Settings staff list) */}
          <div>
            <SearchableSelect
              label="Người Thực Hiện / Người Nhập Kho"
              required
              options={staffOptions}
              value={person}
              onChange={(val) => setPerson(val)}
              placeholder="Chọn nhân sự hoặc gõ tên mới..."
              allowCustom={true}
              icon={<User className="w-4 h-4 text-slate-400" />}
            />
          </div>

          {/* Reason (Searchable select from Settings stockInReasons) */}
          <div>
            <SearchableSelect
              label="Lý Do Nhập Kho"
              options={settings.stockInReasons || []}
              value={reason}
              onChange={(val) => setReason(val)}
              placeholder="Chọn lý do hoặc gõ lý do mới..."
              allowCustom={true}
              icon={<FileText className="w-4 h-4 text-slate-400" />}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi Chú Thêm (Số hóa đơn, nhà cung cấp...)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="VD: Nhập theo HĐ102, Hàng mới 100%..."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-hidden"
          />
        </div>

        {/* Submit Button */}
        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={!selectedPartId || quantity <= 0 || !((selectedLocation === '__custom__' ? customLocation : selectedLocation).trim())}
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer ${
              selectedPartId && quantity > 0 && ((selectedLocation === '__custom__' ? customLocation : selectedLocation).trim())
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>Xác Nhận Nhập Kho</span>
          </button>
        </div>
      </form>
      )}

      {/* QR Scanner Modal */}
      <QrScannerModal
        mode="in"
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        parts={parts}
        onSelectPart={(p, autoQty, autoCont, tagId) => {
          setSelectedPartId(p.id);
          if (autoQty !== undefined && autoQty > 0) {
            setQuantity(autoQty);
          }
          if (autoCont) {
            setReason(`Nhập kho theo Cont ${autoCont}`);
          }
          if (tagId) {
            setScannedTagId(tagId);
          }
          if (autoQty !== undefined || autoCont) {
            setMessage({
              type: 'success',
              text: `Đã tự động chọn [${p.code}] ${p.name}${autoQty ? ` và điền số lượng: ${autoQty.toLocaleString('vi-VN')} ${p.unit}` : ''}${autoCont ? ` từ Cont ${autoCont}` : ''}!`,
            });
          }
          setIsQrModalOpen(false);
        }}
      />

      {/* Container Import & QR Print Modal */}
      <ContainerImportPrintModal
        isOpen={isContModalOpen}
        onClose={() => setIsContModalOpen(false)}
        parts={parts}
        settings={settings}
        onRefreshParts={onSuccess}
      />

      {/* ERROR POPUP MODAL */}
      {errorModal && errorModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-rose-500 text-center space-y-4 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto border-4 border-rose-200">
              <AlertCircle className="w-10 h-10 text-rose-600" />
            </div>
            <div>
              <h3 className="text-lg font-black text-rose-700 uppercase tracking-tight">
                {errorModal.title}
              </h3>
              <p className="text-xs sm:text-sm font-semibold text-slate-700 mt-2 leading-relaxed">
                {errorModal.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setErrorModal(null)}
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer"
            >
              ĐÓNG & KIỂM TRA LẠI
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
