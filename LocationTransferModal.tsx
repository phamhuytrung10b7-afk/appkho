import React, { useState, useEffect } from 'react';
import { Part, WarehouseLocation, AppSettings } from './types';
import { storageService } from './storage';
import { SearchableLocationSelect } from './SearchableLocationSelect';
import { LocationQrScannerModal } from './LocationQrScannerModal';
import {
  ArrowRightLeft,
  X,
  Package,
  MapPin,
  CheckCircle2,
  AlertCircle,
  QrCode,
  User,
  FileText,
  Truck,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface LocationTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  part: Part | null;
  fromLocation: string;
  availableQty: number;
  settings: AppSettings;
  onSuccess: (updatedPart: Part) => void;
}

export const LocationTransferModal: React.FC<LocationTransferModalProps> = ({
  isOpen,
  onClose,
  part,
  fromLocation,
  availableQty,
  settings,
  onSuccess,
}) => {
  const [transferQty, setTransferQty] = useState<number>(availableQty || 1);
  const [toLocation, setToLocation] = useState<string>('');
  const [customToLocation, setCustomToLocation] = useState<string>('');
  const [person, setPerson] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Initialize defaults
  useEffect(() => {
    if (isOpen && part) {
      setTransferQty(availableQty || 1);
      setToLocation('');
      setCustomToLocation('');
      setNotes('');
      setErrorMessage(null);
      setIsSubmitting(false);

      // Default person
      const currentUser = storageService.getCurrentUser?.();
      if (currentUser?.fullName) {
        setPerson(currentUser.fullName);
      } else if (settings.staffList && settings.staffList.length > 0) {
        setPerson(settings.staffList[0]);
      } else {
        setPerson(settings.managerName || 'Thủ kho');
      }
    }
  }, [isOpen, part, availableQty, settings]);

  if (!isOpen || !part) return null;

  // Filter destination locations excluding the source location
  const destinationLocations = (settings.locations || []).filter(
    (l) => l.name.toLowerCase() !== fromLocation.toLowerCase()
  );

  const effectiveToLocation =
    toLocation === '__custom__' ? customToLocation.trim() : toLocation.trim();

  const handleQuickQty = (percentage: number) => {
    const qty = Math.max(1, Math.floor((availableQty * percentage) / 100));
    setTransferQty(qty);
  };

  const handleConfirmTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!effectiveToLocation) {
      setErrorMessage('Vui lòng chọn hoặc quét vị trí tiếp nhận mới!');
      return;
    }

    if (effectiveToLocation.toLowerCase() === fromLocation.toLowerCase()) {
      setErrorMessage('Vị trí tiếp nhận phải khác vị trí xuất phát!');
      return;
    }

    if (!transferQty || transferQty <= 0) {
      setErrorMessage('Số lượng điều chuyển phải lớn hơn 0!');
      return;
    }

    if (transferQty > availableQty) {
      setErrorMessage(
        `Số lượng chuyển (${transferQty.toLocaleString('vi-VN')} ${part.unit}) vượt quá số lượng đang có tại kệ "${fromLocation}" (${availableQty.toLocaleString('vi-VN')} ${part.unit})!`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const result = storageService.transferPartLocationStock({
        partId: part.id,
        fromLocation,
        toLocation: effectiveToLocation,
        quantity: transferQty,
        person: person || 'Thủ kho',
        notes: notes.trim() || undefined,
      });

      // If user typed a new custom location and it does not exist in settings, auto add it!
      if (
        effectiveToLocation &&
        !settings.locations.some(
          (l) => l.name.toLowerCase() === effectiveToLocation.toLowerCase()
        )
      ) {
        const newLoc: WarehouseLocation = {
          id: 'loc-' + Date.now(),
          name: effectiveToLocation,
          description: 'Vị trí tạo khi điều chuyển',
        };
        const updatedSettings: AppSettings = {
          ...settings,
          locations: [...settings.locations, newLoc],
        };
        storageService.saveSettings(updatedSettings);
      }

      onSuccess(result.updatedPart);
      onClose();
    } catch (err: any) {
      console.error('Transfer error:', err);
      setErrorMessage(err.message || 'Lỗi trong quá trình điều chuyển');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
          {/* Modal Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-900 to-indigo-900 text-white shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black tracking-tight">ĐIỀU CHUYỂN VỊ TRÍ KỆ</h3>
                <p className="text-xs text-blue-200">
                  Di chuyển linh kiện từ kệ này sang kệ khác trong kho
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-blue-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body */}
          <form onSubmit={handleConfirmTransfer} className="p-5 overflow-y-auto space-y-4">
            {/* Error Message */}
            {errorMessage && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-bold flex items-center space-x-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Target Part Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 pr-2">
                  <div className="font-mono font-black text-blue-700 text-xs">{part.code}</div>
                  <h4 className="text-sm font-black text-slate-900 truncate" title={part.name}>
                    {part.name}
                  </h4>
                </div>
                <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-extrabold shrink-0">
                  {part.unit}
                </span>
              </div>

              {/* Transfer Path Indicator: From Shelf -> To Shelf */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-amber-700 block">
                    📍 Vị Trí Xuất Phát (Hiện tại):
                  </span>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="font-mono font-black text-slate-900 text-sm">{fromLocation}</span>
                    <span className="text-xs font-bold text-amber-900 bg-amber-200/60 px-2 py-0.5 rounded-md">
                      Có: {availableQty.toLocaleString('vi-VN')} {part.unit}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block">
                    🏁 Vị Trí Tiếp Nhận:
                  </span>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="font-mono font-black text-emerald-900 text-sm truncate">
                      {effectiveToLocation || '(Chưa chọn vị trí nhận)'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quantity to transfer */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-black text-slate-800">
                  Số Lượng Điều Chuyển <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => handleQuickQty(25)}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    25%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickQty(50)}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickQty(100)}
                    className="px-2.5 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-md text-[10px] font-black cursor-pointer transition-colors"
                  >
                    Tất cả (100%)
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={availableQty}
                  value={transferQty}
                  onChange={(e) => setTransferQty(parseInt(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-slate-300 rounded-2xl text-lg font-black text-emerald-700 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  {part.unit}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Tối đa: <strong className="text-slate-800">{availableQty.toLocaleString('vi-VN')} {part.unit}</strong> đang lưu tại kệ "{fromLocation}".
              </p>
            </div>

            {/* Destination Shelf Selector + Scan Button */}
            <div className="bg-blue-50/50 p-4 rounded-2xl border-2 border-blue-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-blue-950 flex items-center space-x-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span>VỊ TRÍ TIẾP NHẬN MỚI *</span>
                </label>

                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Quét Camera Kệ Mới</span>
                </button>
              </div>

              <SearchableLocationSelect
                locations={destinationLocations}
                value={toLocation}
                onChange={(val) => setToLocation(val)}
                placeholder="-- Tìm hoặc chọn kệ tiếp nhận trong danh sách --"
                allowCustom={true}
                customValue={customToLocation}
                onCustomChange={(val) => setCustomToLocation(val)}
                onScanClick={() => setIsScannerOpen(true)}
                theme="blue"
              />
              <p className="text-[10px] text-slate-500">
                💡 Bạn có thể gõ tìm kiếm nhanh kệ đã tạo, hoặc bấm <strong>"Quét Camera Kệ Mới"</strong> để nhận diện tự động từ tem QR trên kệ.
              </p>
            </div>

            {/* Performer & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Người Thực Hiện *
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                    placeholder="Tên thủ kho / người chuyển..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ghi Chú Điều Chuyển
                </label>
                <div className="relative">
                  <FileText className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="VD: Gom hàng, Chuyển line..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !effectiveToLocation || transferQty <= 0}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:opacity-60 text-white rounded-xl text-xs font-black shadow-md flex items-center space-x-2 transition-all cursor-pointer"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>{isSubmitting ? 'Đang điều chuyển...' : 'Xác Nhận Điều Chuyển'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* QR Camera Scanner Modal for Shelf */}
      <LocationQrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onSelectLocation={(scannedShelf) => {
          // Check if scannedShelf is in destinationLocations
          setToLocation(scannedShelf);
        }}
        locations={destinationLocations}
        title="Quét Mã QR Kệ Tiếp Nhận Mới"
        excludeLocation={fromLocation}
      />
    </>
  );
};
