import React, { useState, useEffect, useRef } from 'react';
import { Part, AppSettings } from './types';
import { storageService } from './storage';
import { LocationCameraScannerModal } from './LocationCameraScannerModal';
import { findLocationMatch } from './StockInView';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Zap,
  MapPin,
  Package,
  QrCode,
  ShieldAlert,
  Clock,
  ArrowRight,
  Info,
  Camera,
} from 'lucide-react';

interface StockOutScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  part: Part | null;
  initialQty?: number;
  contNumber?: string;
  settings: AppSettings;
  defaultPerson?: string;
  defaultLSX?: string;
  defaultPurpose?: string;
  onConfirm: (data: {
    part: Part;
    qty: number;
    location: string;
    person: string;
    productionOrder: string;
    purpose: string;
    notes: string;
  }) => void;
}

export function normalizeLocationStr(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export const StockOutScanModal: React.FC<StockOutScanModalProps> = ({
  isOpen,
  onClose,
  part,
  initialQty,
  contNumber,
  settings,
  defaultPerson = '',
  defaultLSX = '',
  defaultPurpose = '',
  onConfirm,
}) => {
  // Allow empty string initially so user types quantity without pre-filled number
  const [qty, setQty] = useState<number | ''>(initialQty && initialQty > 0 ? initialQty : '');
  const [scannedLocation, setScannedLocation] = useState<string>('');
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  // Calculate default person from logged in user
  const currentUser = storageService.getCurrentUser();
  const currentUserName = currentUser
    ? `${currentUser.fullName}${currentUser.roleTitle ? ` (${currentUser.roleTitle})` : ''}`
    : (defaultPerson || settings.staffList?.[0] || 'Thủ kho');

  const [person, setPerson] = useState<string>(currentUserName);
  const [productionOrder, setProductionOrder] = useState<string>(defaultLSX || settings.productionOrders?.[0] || 'LSX-XUẤT-QUÉT');
  const [purpose, setPurpose] = useState<string>(defaultPurpose || settings.stockOutPurposes?.[0] || 'Sản xuất theo đơn hàng');
  const [notes, setNotes] = useState<string>('Xuất kho bằng quét mã tự động');
  const [locationError, setLocationError] = useState<string | null>(null);

  const qtyInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);

  const staffOptions = React.useMemo(() => {
    const list = settings.staffList || [];
    if (currentUserName && !list.includes(currentUserName)) {
      return [currentUserName, ...list];
    }
    return list.length ? list : [currentUserName];
  }, [settings.staffList, currentUserName]);

  // Sync initial state when modal opens
  useEffect(() => {
    if (isOpen && part) {
      const user = storageService.getCurrentUser();
      const userName = user
        ? `${user.fullName}${user.roleTitle ? ` (${user.roleTitle})` : ''}`
        : (defaultPerson || settings.staffList?.[0] || 'Thủ kho');
      setPerson(userName);

      setQty(initialQty && initialQty > 0 ? Math.min(initialQty, part.currentStock) : '');
      setScannedLocation('');
      setLocationError(null);
      
      // Auto focus directly on Quantity Input Field first
      setTimeout(() => {
        qtyInputRef.current?.focus();
        if (qtyInputRef.current && initialQty) {
          qtyInputRef.current.select();
        }
      }, 120);
    }
  }, [isOpen, part, initialQty]);

  if (!isOpen || !part) return null;

  // 1. Analyze Location & FIFO Lots for this Part
  const activeLocations = storageService.getPartLocations(part).filter((l) => l.quantity > 0);
  const fifoLots = storageService.getPartFifoLots(part.id);
  const fifoNext = fifoLots.find((l) => l.status === 'FIFO_NEXT');

  // Determine FIFO Priority Shelf Location
  let expectedFifoLocationName = 'Kho chính';
  let isBaselineLot = false;

  if (fifoNext) {
    if (fifoNext.contNumber && fifoNext.contNumber.includes('Khởi Tạo')) {
      isBaselineLot = true;
    }
    // Check if fifoNext has location or find match in activeLocations
    if (activeLocations.length > 0) {
      expectedFifoLocationName = activeLocations[0].locationName;
    } else {
      expectedFifoLocationName = part.location?.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính';
    }
  } else if (activeLocations.length > 0) {
    expectedFifoLocationName = activeLocations[0].locationName;
  } else {
    expectedFifoLocationName = part.location?.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính';
  }

  // Check user selected/scanned location against expected FIFO location
  const normScannedLoc = normalizeLocationStr(scannedLocation);
  const normExpectedLoc = normalizeLocationStr(expectedFifoLocationName);

  // Is scanned location valid?
  let isLocationValid = false;
  let isLocationMatchFifo = false;
  let validationMessage: string | null = null;

  if (scannedLocation.trim()) {
    // Check if scanned location matches expected FIFO location OR any location where stock exists
    const matchedActiveLoc = activeLocations.find(
      (l) =>
        normalizeLocationStr(l.locationName) === normScannedLoc ||
        normScannedLoc.includes(normalizeLocationStr(l.locationName)) ||
        normalizeLocationStr(l.locationName).includes(normScannedLoc)
    );

    if (
      normScannedLoc === normExpectedLoc ||
      normScannedLoc.includes(normExpectedLoc) ||
      normExpectedLoc.includes(normScannedLoc)
    ) {
      isLocationValid = true;
      isLocationMatchFifo = true;
    } else if (matchedActiveLoc) {
      // Scanned location has stock, but is not the #1 FIFO location!
      if (activeLocations.length > 1) {
        isLocationValid = false;
        isLocationMatchFifo = false;
        validationMessage = `❌ SAI NGUYÊN TẮC FIFO! Kệ bạn quét "${scannedLocation}" có hàng, nhưng KHÔNG ĐÚNG kệ ưu tiên xuất trước "${expectedFifoLocationName}".`;
      } else {
        // Only 1 location exists, so it's valid
        isLocationValid = true;
        isLocationMatchFifo = true;
      }
    } else if (isBaselineLot) {
      // Baseline initial lot allows standard deduction
      isLocationValid = true;
      isLocationMatchFifo = true;
    } else {
      isLocationValid = false;
      isLocationMatchFifo = false;
      validationMessage = `❌ SAI VỊ TRÍ KỆ! Vị trí "${scannedLocation}" không thuộc kệ lưu trữ linh kiện này hoặc không đúng với kệ FIFO "${expectedFifoLocationName}".`;
    }
  }

  const [errorPopup, setErrorPopup] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  const triggerAutoConfirmIfValid = (targetLocationStr: string) => {
    const cleanStr = targetLocationStr.trim();
    if (!cleanStr) return;

    const normScannedLoc = normalizeLocationStr(cleanStr);
    const normExpectedLoc = normalizeLocationStr(expectedFifoLocationName);

    // 1. First check if location exists in system settings or active FIFO locations
    const foundInSettings = findLocationMatch(cleanStr, settings.locations || []);
    const matchedInActive = activeLocations.find(
      (l) =>
        normalizeLocationStr(l.locationName) === normScannedLoc ||
        l.locationName.toLowerCase() === cleanStr.toLowerCase()
    );

    // If it's NOT found in system settings, AND NOT in active locations for this part, REJECT IT!
    if (!foundInSettings && !matchedInActive && normScannedLoc !== normExpectedLoc) {
      setErrorPopup({
        isOpen: true,
        title: '❌ MÃ KỆ KHÔNG TỒN TẠI TRONG HỆ THỐNG',
        message: `Mã QR vị trí kệ "${cleanStr}" KHÔNG TỒN TẠI trong danh mục kệ kho của hệ thống. Vui lòng nhập hoặc quét đúng mã QR kệ hợp lệ!`,
      });
      return;
    }

    // 2. Next check FIFO rule matching
    let locValid = false;
    if (
      normScannedLoc === normExpectedLoc ||
      (foundInSettings && normalizeLocationStr(foundInSettings.name) === normExpectedLoc)
    ) {
      locValid = true;
    } else if (activeLocations.length === 1 && (normalizeLocationStr(activeLocations[0].locationName) === normScannedLoc || matchedInActive)) {
      locValid = true;
    } else if (matchedInActive && activeLocations.length <= 1) {
      locValid = true;
    }

    const numQty = Number(qty);

    if (!locValid) {
      setErrorPopup({
        isOpen: true,
        title: '❌ SAI VỊ TRÍ KỆ FIFO',
        message: `Vị trí vừa quét "${cleanStr}" KHÔNG KHỚP với vị trí kệ ưu tiên xuất hàng FIFO [${expectedFifoLocationName}]. Vui lòng kiểm tra và quét đúng kệ FIFO!`,
      });
      return;
    }

    if (!qty || isNaN(numQty) || numQty <= 0) {
      setErrorPopup({
        isOpen: true,
        title: '⚠️ THIẾU SỐ LƯỢNG XUẤT KHO',
        message: 'Vui lòng nhập Số Lượng cần xuất lớn hơn 0 trước khi quét Vị Trí Kệ!',
      });
      return;
    }

    if (numQty > part.currentStock) {
      setErrorPopup({
        isOpen: true,
        title: '⚠️ SỐ LƯỢNG VƯỢT QUÁ TỒN KHO',
        message: `Số lượng xuất (${numQty} ${part.unit}) vượt quá tồn kho thực tế (${part.currentStock} ${part.unit})!`,
      });
      return;
    }

    // ALL VALID -> AUTO SUBMIT IMMEDIATELY!
    onConfirm({
      part,
      qty: numQty,
      location: targetLocationStr.trim() || expectedFifoLocationName,
      person,
      productionOrder,
      purpose,
      notes,
    });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!scannedLocation.trim()) {
      setErrorPopup({
        isOpen: true,
        title: '⚠️ THIẾU VỊ TRÍ KỆ',
        message: 'Bắt buộc phải quét hoặc chọn Vị trí Kệ trước khi xuất kho!',
      });
      return;
    }

    triggerAutoConfirmIfValid(scannedLocation);
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Jump cursor focus directly to location scan field!
      locationInputRef.current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-4 sm:my-8 animate-in zoom-in-95 duration-200">
        
        {/* Header Bar - BRIGHT CLEAN */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white p-4 sm:p-5 flex items-center justify-between border-b border-blue-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-300 text-amber-950 rounded-2xl font-black shadow-xs">
              <Zap className="w-6 h-6 animate-pulse text-amber-900" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 bg-amber-300 text-amber-950 text-[10px] font-extrabold rounded-md uppercase tracking-wide">
                XÁC NHẬN XUẤT KHO
              </span>
              <h2 className="text-base sm:text-lg font-bold text-white mt-0.5">
                Xác Nhận Số Lượng & Quét Vị Trí Kệ
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-blue-100 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleFormSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-h-[82vh] overflow-y-auto">
          
          {/* Part Information Card */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              {part.imageUrl ? (
                <img
                  src={part.imageUrl}
                  alt={part.name}
                  className="w-14 h-14 rounded-xl object-cover border border-slate-200 shadow-xs shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-14 h-14 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center font-bold shrink-0">
                  <Package className="w-7 h-7" />
                </div>
              )}
              <div>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[11px] font-bold rounded-md font-mono">
                  [{part.code}]
                </span>
                <h3 className="text-base font-extrabold text-slate-900 mt-1">{part.name}</h3>
                <p className="text-xs text-slate-500 flex items-center space-x-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Vị trí kho hiện tại: <strong className="text-slate-700 font-semibold">{part.location}</strong></span>
                </p>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl text-right">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">Tồn kho thực tế</span>
              <p className="text-xl font-black text-emerald-700">
                {part.currentStock.toLocaleString('vi-VN')} <span className="text-xs font-bold text-emerald-900">{part.unit}</span>
              </p>
            </div>
          </div>

          {/* FIFO Guidance Note */}
          <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-xs space-y-2">
            <div className="flex items-center justify-between font-black text-amber-900 flex-wrap gap-2">
              <span className="flex items-center space-x-2 text-sm font-bold">
                <Zap className="w-4 h-4 text-amber-600 shrink-0" />
                <span>GỢI Ý KỆ XUẤT HÀNG THEO NGUYÊN TẮC FIFO (#1 NHẬP TRƯỚC XUẤT TRƯỚC):</span>
              </span>
              <span className="px-2.5 py-1 bg-amber-300 text-amber-950 font-bold rounded-lg text-xs">
                📍 {expectedFifoLocationName}
              </span>
            </div>

            <p className="text-amber-900 font-medium leading-relaxed">
              {isBaselineLot ? (
                <span>
                  Linh kiện đang dùng <strong>Lô tồn khởi tạo ban đầu</strong>. Hệ thống cho phép trừ tồn từ kệ <strong>{expectedFifoLocationName}</strong> hoặc các kệ hợp lệ.
                </span>
              ) : fifoNext ? (
                <span>
                  Lô nhập gần nhất chưa xuất hết: <strong>{fifoNext.contNumber}</strong> (Nhập ngày {new Date(fifoNext.importDate).toLocaleDateString('vi-VN')} • Còn tồn <strong>{fifoNext.remainingQty.toLocaleString('vi-VN')} {part.unit}</strong>).
                  Ưu tiên lấy hàng tại <strong className="text-amber-950 underline font-bold">Kệ {expectedFifoLocationName}</strong>.
                </span>
              ) : (
                <span>Kệ lưu trữ ưu tiên cho linh kiện này là: <strong>{expectedFifoLocationName}</strong>.</span>
              )}
            </p>
          </div>

          {/* STEP 1: QUANTITY INPUT - BRIGHT LIGHT STYLING */}
          <div className="bg-sky-50/80 p-4 sm:p-5 rounded-2xl text-slate-900 space-y-3 border-2 border-sky-300 shadow-2xs">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-blue-950 uppercase tracking-wide flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold">1</span>
                <span>NHẬP SỐ LƯỢNG CẦN XUẤT KHO:</span>
              </label>
              <span className="text-xs font-bold text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-md border border-blue-200">
                Đơn vị: {part.unit}
              </span>
            </div>

            <div className="flex items-center space-x-3">
              <input
                ref={qtyInputRef}
                type="number"
                min="1"
                max={part.currentStock}
                value={qty}
                onKeyDown={handleQtyKeyDown}
                onChange={(e) => {
                  const val = e.target.value;
                  setQty(val === '' ? '' : Number(val));
                  setLocationError(null);
                }}
                placeholder="Nhập số lượng..."
                className="w-full px-4 py-3 bg-white border-2 border-blue-400 rounded-xl text-center text-blue-950 font-black text-2xl outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-100 shadow-2xs placeholder:text-slate-300 placeholder:text-base placeholder:font-normal"
              />
              <button
                type="button"
                onClick={() => locationInputRef.current?.focus()}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-2xs shrink-0 transition-colors cursor-pointer"
                title="Bấm hoặc nhấn Enter để chuyển sang ô quét kệ"
              >
                Tiếp: Chọn Kệ ➔
              </button>
            </div>
            <p className="text-[11px] text-blue-800 font-medium flex items-center space-x-1">
              <span>💡 Nhập số lượng xong, nhấn <strong>Enter</strong> để chuyển ngay sang <strong>Bắt buộc Chọn / Quét Vị trí Kệ</strong>.</span>
            </p>
          </div>

          {/* STEP 2: SCAN OR SELECT SHELF LOCATION WITH FIFO VALIDATION */}
          <div className="bg-slate-50 p-4 rounded-2xl border-2 border-blue-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-extrabold text-slate-800 flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                <span>2. BẮT BUỘC QUÉT HOẶC CHỌN VỊ TRÍ KỆ (ĐỐI SOÁT FIFO) *</span>
              </label>

              {/* Quick Select Buttons from Existing Locations */}
              <div className="flex flex-wrap gap-1.5">
                {activeLocations.map((loc, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setScannedLocation(loc.locationName);
                      setLocationError(null);
                      triggerAutoConfirmIfValid(loc.locationName);
                    }}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      scannedLocation === loc.locationName
                        ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                        : 'bg-white text-blue-900 border-blue-200 hover:bg-blue-50'
                    }`}
                  >
                    📍 {loc.locationName} ({loc.quantity} {part.unit})
                  </button>
                ))}
              </div>
            </div>

            {/* Scanner Input field with Camera Scanner Button */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  ref={locationInputRef}
                  type="text"
                  value={scannedLocation}
                  onChange={(e) => {
                    setScannedLocation(e.target.value);
                    setLocationError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      triggerAutoConfirmIfValid(scannedLocation);
                    }
                  }}
                  placeholder={`[Bắn súng quét hoặc bấm Quét Camera] Ví dụ: ${expectedFifoLocationName}...`}
                  className={`w-full pl-10 pr-28 py-3 bg-white border-2 rounded-xl text-sm font-bold text-slate-900 outline-hidden transition-all ${
                    isLocationValid && scannedLocation
                      ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-200'
                      : scannedLocation && !isLocationValid
                      ? 'border-red-500 bg-red-50/40 ring-2 ring-red-200'
                      : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                  }`}
                />
                <QrCode className="w-5 h-5 text-blue-600 absolute left-3 top-1/2 -translate-y-1/2" />

                {/* Quick Preset Dropdown */}
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      setScannedLocation(e.target.value);
                      setLocationError(null);
                      triggerAutoConfirmIfValid(e.target.value);
                    }
                  }}
                  value=""
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-blue-50 text-blue-900 font-bold text-xs rounded-lg border border-blue-200 cursor-pointer"
                >
                  <option value="">-- Chọn Kệ --</option>
                  {(settings.locations || []).map((loc) => (
                    <option key={loc.id} value={loc.name}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setIsCameraModalOpen(true)}
                className="px-3.5 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer shrink-0 ring-2 ring-emerald-300/60"
                title="Mở Camera quét mã QR / Barcode dán trên Kệ"
              >
                <Camera className="w-4.5 h-4.5 text-white" />
                <span className="hidden sm:inline">Quét Camera Kệ</span>
                <span className="sm:hidden">Camera</span>
              </button>
            </div>

            {/* VALIDATION FEEDBACK BOX - BRIGHT LIGHT THEME */}
            {scannedLocation.trim() !== '' && (
              <div>
                {isLocationValid ? (
                  <div className="p-3 bg-emerald-50 border-2 border-emerald-400 rounded-xl text-emerald-900 text-xs font-bold flex items-center space-x-2 shadow-2xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-extrabold uppercase text-emerald-800">🟢 VỊ TRÍ CHÍNH XÁC & ĐÚNG CHUẨN FIFO!</p>
                      <p className="text-[11px] font-medium text-emerald-800">
                        Đã xác nhận kệ <strong>"{scannedLocation}"</strong> hợp lệ cho linh kiện [{part.code}].
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-red-50 border-2 border-red-400 rounded-xl text-red-900 text-xs space-y-2 shadow-2xs animate-in zoom-in-95">
                    <div className="flex items-center space-x-2 text-red-700 font-bold text-sm uppercase">
                      <ShieldAlert className="w-5 h-5 shrink-0 text-red-600 animate-bounce" />
                      <span>CẢNH BÁO VỊ TRÍ KỆ / FIFO!</span>
                    </div>
                    
                    <p className="text-red-800 font-semibold pl-7">
                      Vị trí vừa quét/chọn: <strong className="text-red-950 font-bold">"{scannedLocation}"</strong> KHÔNG ĐÚNG với kệ ưu tiên FIFO.
                    </p>

                    <div className="bg-white p-3 rounded-lg border border-red-200 text-slate-800 font-medium text-xs space-y-1">
                      <p className="font-bold text-red-700 flex items-center space-x-1">
                        <span>📌 LƯU Ý NGUYÊN TẮC XUẤT KHO:</span>
                      </p>
                      <p className="leading-relaxed">
                        Theo quy định <strong>FIFO</strong>, linh kiện này cần lấy tại kệ <strong className="text-red-700 underline font-extrabold text-sm">[{expectedFifoLocationName}]</strong>.
                        Vui lòng di chuyển đến kệ <strong className="text-red-700 font-bold">[{expectedFifoLocationName}]</strong> và quét lại mã vị trí này để hệ thống xác nhận xuất kho.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {locationError && (
              <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-xs font-bold rounded-xl flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{locationError}</span>
              </div>
            )}
          </div>

          {/* Form Metadata Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Người Lấy Hàng <span className="text-red-500">*</span>
              </label>
              <select
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-hidden"
              >
                {staffOptions.map((s, idx) => (
                  <option key={idx} value={s}>
                    {s} {s === currentUserName ? ' (Đang đăng nhập)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Lệnh Sản Xuất (LSX) <span className="text-red-500">*</span>
              </label>
              <select
                value={productionOrder}
                onChange={(e) => setProductionOrder(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 outline-hidden"
              >
                {(settings.productionOrders || []).map((lsx, idx) => (
                  <option key={idx} value={lsx}>
                    {lsx}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
            >
              Hủy Bỏ
            </button>

            <button
              type="submit"
              disabled={!scannedLocation.trim() || !isLocationValid || !qty || Number(qty) <= 0}
              className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                scannedLocation.trim() && isLocationValid && qty && Number(qty) > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>XÁC NHẬN XUẤT KHO NGAY {qty ? `(-${qty})` : ''}</span>
            </button>
          </div>
        </form>

        {/* Dedicated Camera Scan Modal */}
        <LocationCameraScannerModal
          isOpen={isCameraModalOpen}
          onClose={() => setIsCameraModalOpen(false)}
          onScanSuccess={(scannedText) => {
            setScannedLocation(scannedText);
            setLocationError(null);
            triggerAutoConfirmIfValid(scannedText);
          }}
          title="Quét Mã QR / Barcode Vị Trí Kệ"
          hintText="Căn giữa mã QR / Barcode dán trên Kệ vào khung hình"
        />

        {/* ERROR POPUP MODAL */}
        {errorPopup && errorPopup.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-rose-500 text-center space-y-4 animate-in zoom-in-95">
              <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto border-4 border-rose-200">
                <AlertCircle className="w-10 h-10 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-rose-700 uppercase tracking-tight">
                  {errorPopup.title}
                </h3>
                <p className="text-xs sm:text-sm font-semibold text-slate-700 mt-2 leading-relaxed">
                  {errorPopup.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setErrorPopup(null)}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer"
              >
                ĐÓNG & KIỂM TRA LẠI
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
