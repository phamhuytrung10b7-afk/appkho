import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, RefreshCw, Upload, Smartphone, Apple, CheckCircle2 } from 'lucide-react';

interface CameraPermissionErrorCardProps {
  errorTitle?: string;
  errorMessage?: string;
  isPermissionDenied?: boolean;
  onRetry: () => void;
  onImageSelected?: (file: File) => void;
}

export const CameraPermissionErrorCard: React.FC<CameraPermissionErrorCardProps> = ({
  errorTitle = 'Không thể mở Camera',
  errorMessage = 'Vui lòng cấp quyền truy cập Camera cho trình duyệt để quét mã QR.',
  isPermissionDenied = true,
  onRetry,
  onImageSelected,
}) => {
  const [activeTab, setActiveTab] = useState<'android' | 'ios'>(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    }
    return 'android';
  });

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImageSelected) {
      onImageSelected(file);
    }
  };

  return (
    <div className="bg-slate-900 border-2 border-rose-500/80 rounded-2xl p-4 sm:p-5 text-white shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="flex items-start space-x-3">
        <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded-xl shrink-0 mt-0.5 border border-rose-500/40">
          <ShieldAlert className="w-6 h-6 animate-pulse" />
        </div>
        <div className="flex-1">
          <h4 className="font-extrabold text-sm sm:text-base text-rose-300 uppercase tracking-wide">
            {errorTitle}
          </h4>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            {errorMessage}
          </p>
        </div>
      </div>

      {/* Guide Tabs for Android and iOS */}
      {isPermissionDenied && (
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-3">
          <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Hướng dẫn mở quyền Camera:
            </span>
            <div className="flex space-x-1 ml-auto">
              <button
                type="button"
                onClick={() => setActiveTab('android')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer ${
                  activeTab === 'android'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Android</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ios')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer ${
                  activeTab === 'ios'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Apple className="w-3.5 h-3.5" />
                <span>iPhone / iPad</span>
              </button>
            </div>
          </div>

          {activeTab === 'android' ? (
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex items-start space-x-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[11px] shrink-0">1</span>
                <p>Nhấn vào biểu tượng <strong>Cài đặt trang web</strong> (hoặc ổ khóa 🔒) trên thanh địa chỉ trình duyệt Chrome.</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[11px] shrink-0">2</span>
                <p>Chọn <strong>Quyền</strong> (hoặc <strong>Quyền trang web</strong>) &rarr; chọn <strong>Máy ảnh / Camera</strong>.</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[11px] shrink-0">3</span>
                <p>Chuyển sang <strong>&quot;Cho phép&quot;</strong>, sau đó quay lại và nhấn nút <strong>&quot;Thử cấp quyền lại&quot;</strong> bên dưới.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex items-start space-x-2">
                <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-[11px] shrink-0">1</span>
                <p>Nhấn vào biểu tượng <strong>aA</strong> (hoặc ổ khóa) góc trái thanh địa chỉ Safari &rarr; chọn <strong>Cài đặt trang web</strong>.</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-[11px] shrink-0">2</span>
                <p>Tìm mục <strong>Camera</strong> và đổi từ <em>Hỏi</em> hoặc <em>Từ chối</em> sang <strong>&quot;Cho phép&quot;</strong>.</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-[11px] shrink-0">3</span>
                <p>Hoặc vào <strong>Cài đặt của iPhone &rarr; Safari &rarr; Camera &rarr; Cho phép</strong> rồi thử lại.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
        {onImageSelected && (
          <>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer border border-slate-700"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Chụp ảnh / Tải ảnh QR</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-emerald-900/40"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Thử cấp quyền lại</span>
        </button>
      </div>
    </div>
  );
};
