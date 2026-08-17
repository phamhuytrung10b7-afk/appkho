import React from 'react';
import { Part, FifoLot } from './types';
import { storageService } from './storage';
import { X, Layers, AlertCircle, CheckCircle2, Clock, Zap, ArrowDownRight, Package } from 'lucide-react';

interface FifoDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  part: Part | null;
}

export const FifoDetailModal: React.FC<FifoDetailModalProps> = ({ isOpen, onClose, part }) => {
  if (!isOpen || !part) return null;

  const fifoLots = storageService.getPartFifoLots(part.id);
  const fifoNextLot = fifoLots.find((l) => l.status === 'FIFO_NEXT');
  const activeLots = fifoLots.filter((l) => l.remainingQty > 0);
  const depletedLots = fifoLots.filter((l) => l.remainingQty === 0);

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-cyan-400 text-slate-950 rounded-xl font-black">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 bg-cyan-400 text-slate-950 text-[10px] font-black rounded-md uppercase tracking-wider">
                  QUẢN LÝ KHO FIFO (NHẬP TRƯỚC XUẤT TRƯỚC)
                </span>
              </div>
              <h3 className="font-extrabold text-base text-white mt-1 flex items-center space-x-2">
                <span>[{part.code}] {part.name}</span>
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Quick Summary Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Tồn kho hiện tại</span>
              <p className="text-xl font-black text-slate-900 mt-0.5">
                {part.currentStock.toLocaleString('vi-VN')} <span className="text-xs text-slate-500">{part.unit}</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-1">Vị trí: <strong>{part.location}</strong></p>
            </div>

            <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-amber-900 uppercase flex items-center space-x-1">
                  <Zap className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                  <span>ƯU TIÊN XUẤT HÀNG (#1 FIFO)</span>
                </span>
                <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-black rounded-md">
                  KỆ CỦ NHẤT CÒN TỒN
                </span>
              </div>

              {fifoNextLot ? (
                <div className="mt-1">
                  <p className="text-sm font-black text-amber-950 flex flex-wrap items-center gap-1.5">
                    <span>Lấy từ:</span>
                    <strong className="text-amber-900 text-base font-extrabold bg-amber-200/80 px-2.5 py-0.5 rounded-lg border border-amber-300">
                      📍 {fifoNextLot.isInitialBaseline ? 'Lô Tồn Khởi Tạo (Lô #1)' : (fifoNextLot.locationName || 'Kệ kho')}
                    </strong>
                    {!fifoNextLot.isInitialBaseline && fifoNextLot.contNumber && (
                      <span className="text-xs font-semibold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-md border border-amber-200">
                        (Ghi chú: {fifoNextLot.contNumber})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-amber-900 mt-1">
                    Ngày nhập: {new Date(fifoNextLot.importDate).toLocaleDateString('vi-VN')} • Còn tồn trong mốc này:{' '}
                    <strong className="text-amber-950 font-black text-sm">{fifoNextLot.remainingQty.toLocaleString('vi-VN')} {part.unit}</strong>
                  </p>
                </div>
              ) : (
                <p className="text-xs text-amber-800 mt-1">Chưa ghi nhận mốc nhập kho còn tồn</p>
              )}
            </div>
          </div>

          {/* FIFO Explanation & Guidance */}
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
            <p className="font-bold flex items-center space-x-1.5 text-blue-950">
              <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <span>QUY TRÌNH XUẤT KHO THEO KỆ FIFO (NHẬP TRƯỚC XUẤT TRƯỚC):</span>
            </p>
            <p className="text-blue-800 leading-relaxed">
              Thủ kho ưu tiên lấy vật tư từ <strong>Kệ nhập trước (#1 FIFO)</strong> theo thời gian. Thông tin số Cont được đính kèm làm ghi chú phụ để đối soát. Khi mốc Kệ cũ xuất hết (0 {part.unit}), hệ thống tự động chuyển ưu tiên sang Kệ tiếp theo.
            </p>
          </div>

          {/* Active Cont Batches Table/List */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>DANH SÁCH MỐC NHẬP THEO KỆ / FIFO ({fifoLots.length} mốc)</span>
              </span>
              <span className="text-[11px] font-normal text-slate-500">Thứ tự từ cũ nhất đến mới nhất</span>
            </h4>

            {fifoLots.length === 0 ? (
              <p className="text-xs text-slate-500 italic text-center py-6">Chưa có lịch sử mốc nhập kho nào cho linh kiện này</p>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {fifoLots.map((lot, idx) => {
                  const isFifoNext = lot.status === 'FIFO_NEXT';
                  const isDepleted = lot.status === 'DEPLETED';

                  const titleText = lot.isInitialBaseline
                    ? 'Lô Tồn Khởi Tạo (Lô #1)'
                    : `📍 ${lot.locationName || 'Kệ kho'}`;

                  const showContNote = !lot.isInitialBaseline && lot.contNumber;

                  return (
                    <div
                      key={lot.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isFifoNext
                          ? 'bg-amber-50/90 border-2 border-amber-400 shadow-xs'
                          : isDepleted
                          ? 'bg-slate-50 border-slate-200 opacity-60'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-2.5">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                              isFifoNext
                                ? 'bg-amber-400 text-slate-950'
                                : isDepleted
                                ? 'bg-slate-200 text-slate-500'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            #{idx + 1}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-extrabold text-slate-900 text-xs sm:text-sm">
                                {titleText}
                              </span>

                              {showContNote && (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-semibold rounded-md border border-slate-200">
                                  (Ghi chú: {lot.contNumber})
                                </span>
                              )}

                              {isFifoNext && (
                                <span className="px-2 py-0.5 bg-amber-400 text-slate-950 text-[10px] font-black rounded-md animate-pulse">
                                  #1 XUẤT TRƯỚC (FIFO)
                                </span>
                              )}
                              {isDepleted && (
                                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-semibold rounded-md">
                                  ĐÃ XUẤT HẾT (0 {part.unit})
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Vị trí: <strong className="text-slate-700">{lot.locationName || 'Kho chính'}</strong> • Ngày nhập: {new Date(lot.importDate).toLocaleDateString('vi-VN')} {lot.notes ? `• ${lot.notes}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-700">
                            Còn tồn:{' '}
                            <strong
                              className={`text-sm font-black ${
                                isFifoNext ? 'text-amber-900' : isDepleted ? 'text-slate-400' : 'text-indigo-900'
                              }`}
                            >
                              {lot.remainingQty.toLocaleString('vi-VN')} {part.unit}
                            </strong>
                          </div>
                          <p className="text-[10px] text-slate-500">
                            Nhập: {lot.originalQty.toLocaleString('vi-VN')} | Đã xuất: {lot.consumedQty.toLocaleString('vi-VN')}
                          </p>
                        </div>
                      </div>

                      {/* Visual Progress Bar */}
                      <div className="mt-2.5 bg-slate-200 h-2 rounded-full overflow-hidden flex">
                        <div
                          className={`h-full ${isFifoNext ? 'bg-amber-500' : 'bg-indigo-600'}`}
                          style={{
                            width: `${Math.min(100, (lot.remainingQty / (lot.originalQty || 1)) * 100)}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
