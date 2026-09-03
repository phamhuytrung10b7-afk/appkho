import React, { useState } from 'react';
import { Part, WarehouseLocation, AppSettings } from './types';
import { storageService } from './storage';
import { LocationTransferModal } from './LocationTransferModal';
import {
  MapPin,
  X,
  Package,
  Layers,
  ArrowRightLeft,
  ArrowRight,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Info,
  Boxes,
} from 'lucide-react';

interface LocationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  location: WarehouseLocation | null;
  parts: Part[];
  settings: AppSettings;
  onOpenBinCard: (part: Part) => void;
  onOpenPrintModal: (locationId: string) => void;
  onTransferSuccess?: (updatedPart: Part) => void;
}

export const LocationDetailModal: React.FC<LocationDetailModalProps> = ({
  isOpen,
  onClose,
  location,
  parts,
  settings,
  onOpenBinCard,
  onOpenPrintModal,
  onTransferSuccess,
}) => {
  const [transferringPartInfo, setTransferringPartInfo] = useState<{
    part: Part;
    locationQty: number;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (!isOpen || !location) return null;

  const partsAtLocation = storageService.getPartsAtLocation(parts, location.name);
  const totalUnitsOnShelf = partsAtLocation.reduce((sum, item) => sum + item.locationQty, 0);
  const isOccupied = partsAtLocation.length > 0;

  const handleTransferComplete = (updatedPart: Part) => {
    setToastMessage(
      `🎉 Đã điều chuyển linh kiện "${updatedPart.name}" thành công!`
    );
    setTimeout(() => setToastMessage(null), 4000);
    if (onTransferSuccess) {
      onTransferSuccess(updatedPart);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh]">
          {/* Modal Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shrink-0">
            <div className="flex items-center space-x-3 min-w-0 pr-2">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-black tracking-tight text-white font-mono truncate">
                    {location.name}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                      isOccupied ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {isOccupied ? `${partsAtLocation.length} Loại LK` : 'Trống'}
                  </span>
                </div>
                {location.description && (
                  <p className="text-xs text-blue-200 truncate mt-0.5" title={location.description}>
                    {location.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenPrintModal(location.id)}
                className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                title="In tem QR Kệ"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">In Tem QR</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Toast Alert */}
          {toastMessage && (
            <div className="p-3 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-bold flex items-center space-x-2 animate-in slide-in-from-top-2 shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Shelf Summary Stats */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 gap-3 shrink-0">
            <div className="p-3 bg-white border border-slate-200 rounded-2xl">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Số loại linh kiện trên kệ
              </span>
              <p className="text-lg font-black text-slate-900 mt-0.5">
                {partsAtLocation.length} <span className="text-xs font-semibold text-slate-500">loại</span>
              </p>
            </div>

            <div className="p-3 bg-white border border-emerald-200 rounded-2xl">
              <span className="text-[10px] font-bold uppercase text-emerald-700 block">
                Tổng số lượng đơn vị
              </span>
              <p className="text-lg font-black text-emerald-700 mt-0.5">
                {totalUnitsOnShelf.toLocaleString('vi-VN')} <span className="text-xs font-semibold text-emerald-800">đơn vị</span>
              </p>
            </div>
          </div>

          {/* Parts List */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center space-x-1.5">
                <Boxes className="w-3.5 h-3.5 text-blue-600" />
                <span>Chi tiết linh kiện lưu trữ ({partsAtLocation.length})</span>
              </h4>
            </div>

            {partsAtLocation.length === 0 ? (
              <div className="py-12 px-4 text-center bg-slate-50/80 rounded-2xl border-2 border-dashed border-slate-200 space-y-2">
                <Package className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">
                  Vị trí "{location.name}" hiện đang trống.
                </p>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Chưa có linh kiện nào được phân bổ vào kệ này. Bạn có thể nhập kho hoặc điều chuyển linh kiện từ kệ khác sang đây.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {partsAtLocation.map(({ part, locationQty }) => (
                  <div
                    key={part.id}
                    className="p-3.5 bg-white hover:bg-blue-50/30 rounded-2xl border border-slate-200 hover:border-blue-300 shadow-2xs transition-all space-y-2.5"
                  >
                    {/* Top Row: Part Code & Name */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 pr-2">
                        <span className="font-mono font-black text-blue-700 text-xs bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                          {part.code}
                        </span>
                        <h5 className="text-xs font-bold text-slate-900 mt-1 leading-snug">
                          {part.name}
                        </h5>
                        {part.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                            {part.description}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 font-medium block">Tồn tại kệ này:</span>
                        <span className="text-base font-black text-emerald-700 font-mono">
                          {locationQty.toLocaleString('vi-VN')} {part.unit}
                        </span>
                        {part.currentStock !== locationQty && (
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Tổng các kệ: {part.currentStock.toLocaleString('vi-VN')} {part.unit}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Actions: Move & Bin Card */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenBinCard(part);
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-bold inline-flex items-center space-x-1 cursor-pointer transition-colors"
                      >
                        <span>Xem thẻ kho</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>

                      {/* Transfer button */}
                      <button
                        type="button"
                        onClick={() =>
                          setTransferringPartInfo({
                            part,
                            locationQty,
                          })
                        }
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                        title="Di chuyển linh kiện này sang vị trí / kệ khác"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Điều Chuyển Vị Trí</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
            <span className="text-[11px] text-slate-500">
              📍 Vị trí: <strong className="text-slate-800 font-mono">{location.name}</strong>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Đóng Bảng
            </button>
          </div>
        </div>
      </div>

      {/* Transfer Location Sub-Modal */}
      {transferringPartInfo && (
        <LocationTransferModal
          isOpen={!!transferringPartInfo}
          onClose={() => setTransferringPartInfo(null)}
          part={transferringPartInfo.part}
          fromLocation={location.name}
          availableQty={transferringPartInfo.locationQty}
          settings={settings}
          onSuccess={(updatedPart) => {
            handleTransferComplete(updatedPart);
          }}
        />
      )}
    </>
  );
};
