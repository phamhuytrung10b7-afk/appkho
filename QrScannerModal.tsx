import React, { useState, useEffect, useRef } from 'react';
import { Part } from './types';
import { storageService } from './storage';
import { QrCode, X, Camera, Zap, CheckCircle2, AlertCircle, Package, Search, ShieldAlert, Flashlight, SwitchCamera } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPart: (part: Part, autoQty?: number, autoCont?: string, tagId?: string) => void;
  parts: Part[];
  mode?: 'in' | 'out';
}

export function parseScannedQrPayload(raw: string): {
  partCode: string;
  qty?: number;
  contNumber?: string;
  tagId?: string;
  contDate?: string;
  supplier?: string;
  mfgDate?: string;
} {
  const str = raw.trim();

  // 1. Pipe format CONT_IN|MãVT|SốLượng|MãCont|TagID|NgàyCont|Supplier|MfgDate
  if (str.startsWith('CONT_IN|')) {
    const parts = str.split('|');
    return {
      partCode: parts[1] || '',
      qty: parts[2] ? parseFloat(parts[2]) : undefined,
      contNumber: parts[3] || '',
      tagId: parts[4] || '',
      contDate: parts[5] || '',
      supplier: parts[6] || undefined,
      mfgDate: parts[7] || undefined,
    };
  }

  // 2. JSON format
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const obj = JSON.parse(str);
      if (obj.partCode || obj.code) {
        return {
          partCode: obj.partCode || obj.code,
          qty: obj.qty || obj.quantity,
          contNumber: obj.cont || obj.contNumber,
          tagId: obj.tagId || obj.id,
          contDate: obj.contDate || obj.date,
          supplier: obj.supplier || obj.supplierName,
          mfgDate: obj.mfgDate || obj.mfg,
        };
      }
    } catch {
      // ignore
    }
  }

  // 3. Fallback
  return { partCode: str };
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onSelectPart,
  parts,
  mode,
}) => {
  const [manualCode, setManualCode] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [matchedPart, setMatchedPart] = useState<Part | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  const [scannedQty, setScannedQty] = useState<number | undefined>(undefined);
  const [scannedCont, setScannedCont] = useState<string | undefined>(undefined);
  const [scannedTagId, setScannedTagId] = useState<string | undefined>(undefined);
  const [usedInfo, setUsedInfo] = useState<{ isUsed: boolean; scannedAt?: string; scannedBy?: string } | null>(null);

  // Auto focus text input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        manualInputRef.current?.focus();
      }, 100);
    } else {
      stopCamera();
      setManualCode('');
      setMatchedPart(null);
      setScannedQty(undefined);
      setScannedCont(undefined);
      setScannedTagId(undefined);
      setUsedInfo(null);
      setCameraError(null);
    }
  }, [isOpen]);

  // Match part whenever manualCode changes
  useEffect(() => {
    if (!manualCode.trim()) {
      setMatchedPart(null);
      setScannedQty(undefined);
      setScannedCont(undefined);
      setScannedTagId(undefined);
      setUsedInfo(null);
      return;
    }

    const parsed = parseScannedQrPayload(manualCode);
    const searchCode = parsed.partCode.toLowerCase();

    // STRICT CONTAINER BATCH VALIDATION FOR STOCK IN
    if (mode === 'in' && manualCode.trim()) {
      const validCheck = storageService.validateContainerQrTag(manualCode, parsed);
      if (!validCheck.isValid) {
        setCameraError(`⛔ ${validCheck.reason}`);
        setMatchedPart(null);
        return;
      } else {
        setCameraError(null);
      }
    }

    setScannedQty(parsed.qty);
    setScannedCont(parsed.contNumber);
    setScannedTagId(parsed.tagId);

    // Check if this QR token or tagId has already been scanned & imported!
    const tokenToCheck = parsed.tagId || manualCode.trim();
    const usedCheck = storageService.isQrTokenUsed(tokenToCheck);
    setUsedInfo(usedCheck.isUsed ? usedCheck : null);

    const found = parts.find(
      (p) =>
        p.code.toLowerCase() === searchCode ||
        p.qrCode?.toLowerCase() === searchCode ||
        p.barcode?.toLowerCase() === searchCode ||
        p.name.toLowerCase().includes(searchCode)
    );
    setMatchedPart(found || null);
  }, [manualCode, parts, mode]);

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (matchedPart && !usedInfo?.isUsed) {
      onSelectPart(matchedPart, scannedQty, scannedCont, scannedTagId || manualCode.trim());
      onClose();
    }
  };

  const playBeepSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, ctx.currentTime);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      // ignore
    }
  };

  const stopCamera = async () => {
    if (html5QrcodeRef.current) {
      try {
        const stream = (html5QrcodeRef.current as any).mediaStream as MediaStream;
        if (stream) {
          stream.getTracks().forEach((track) => {
            try { track.stop(); } catch (e) {}
          });
        }
        if (html5QrcodeRef.current.isScanning) {
          await html5QrcodeRef.current.stop();
        }
        html5QrcodeRef.current.clear();
      } catch (err) {
        console.error('Stop camera error', err);
      }
      html5QrcodeRef.current = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
    setTorchSupported(false);
  };

  const startCamera = async (camId?: string) => {
    setCameraError(null);
    setIsTorchOn(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Trình duyệt không hỗ trợ truy cập Camera trực tiếp. Vui lòng gõ mã ở trên.'
      );
      return;
    }

    try {
      await stopCamera();
      setIsCameraActive(true);

      const devices = await Html5Qrcode.getCameras().catch(() => []);
      if (devices && devices.length > 0) {
        setCameras(devices.map((d, i) => ({ id: d.id, label: d.label || `Camera ${i + 1}` })));
        if (!camId && !selectedCameraId) {
          const back = devices.find((d) => {
            const l = d.label.toLowerCase();
            return (l.includes('back') || l.includes('rear') || l.includes('sau') || l.includes('environment')) &&
              !l.includes('wide') && !l.includes('0.5');
          }) || devices[devices.length - 1];
          setSelectedCameraId(back.id);
          camId = back.id;
        }
      }

      const html5QrCode = new Html5Qrcode('qr-reader');
      html5QrcodeRef.current = html5QrCode;

      const onScanSuccess = (decodedText: string) => {
        playBeepSound();
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate([100, 50, 100]); } catch(e){}
        }
        setManualCode(decodedText);
        stopCamera();
      };

      const qrConfig = {
        fps: 30,
        qrbox: (w: number, h: number) => {
          const minEdge = Math.min(w, h);
          return { width: Math.max(Math.floor(minEdge * 0.85), 220), height: Math.max(Math.floor(minEdge * 0.70), 180) };
        },
        aspectRatio: 1.0,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.PDF_417,
        ],
      };

      const activeCam = camId || selectedCameraId;
      if (activeCam) {
        await html5QrCode.start(
          activeCam,
          qrConfig,
          onScanSuccess,
          () => {}
        );
      } else {
        await html5QrCode.start(
          { facingMode: 'environment' },
          qrConfig,
          onScanSuccess,
          () => {}
        );
      }

      try {
        const stream = (html5QrCode as any).mediaStream as MediaStream;
        if (stream && stream.getVideoTracks()[0]?.getCapabilities) {
          const caps = stream.getVideoTracks()[0].getCapabilities() as any;
          if (caps?.torch) setTorchSupported(true);
        }
      } catch (e) {}

    } catch (err: any) {
      console.warn('Camera start issue:', err);
      setCameraError('Không thể mở Camera. Vui lòng cấp quyền sử dụng camera.');
      setIsCameraActive(false);
    }
  };

  const toggleTorch = async () => {
    if (!html5QrcodeRef.current || !html5QrcodeRef.current.isScanning) return;
    const nextState = !isTorchOn;

    try {
      await html5QrcodeRef.current.applyVideoConstraints({ advanced: [{ torch: nextState } as any] });
      setIsTorchOn(nextState);
    } catch (err) {
      try {
        const stream = (html5QrcodeRef.current as any).mediaStream as MediaStream;
        const track = stream?.getVideoTracks()[0];
        if (track) {
          await track.applyConstraints({ advanced: [{ torch: nextState } as any] });
          setIsTorchOn(nextState);
        }
      } catch (e) {}
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-700 to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base">QUÉT MÃ QR / BARCODE LINH KIỆN</h3>
              <p className="text-[11px] text-blue-100">Dùng súng quét barcode hoặc Camera nét cao</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Camera Scanner Toggle & Live View Container (At top for fast scanning) */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={isCameraActive ? stopCamera : () => startCamera()}
              className={`w-full py-3 rounded-2xl text-xs font-extrabold transition-all flex items-center justify-center space-x-2 cursor-pointer border shadow-sm ${
                isCameraActive
                  ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500 animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>{isCameraActive ? 'Tắt Camera Quét' : 'Bật Camera Quét Nét Cao'}</span>
            </button>

            {isCameraActive && (
              <div className="bg-slate-950 text-white p-3 rounded-2xl border-2 border-emerald-500 space-y-2 animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  {cameras.length > 1 && (
                    <div className="flex items-center space-x-1 flex-1">
                      <SwitchCamera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <select
                        value={selectedCameraId}
                        onChange={(e) => {
                          setSelectedCameraId(e.target.value);
                          startCamera(e.target.value);
                        }}
                        className="bg-slate-800 text-emerald-300 font-bold text-xs py-1 px-2 rounded-lg border border-slate-700 outline-none w-full max-w-xs"
                      >
                        {cameras.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {torchSupported && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer transition-all ${
                        isTorchOn ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-800 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      <Flashlight className="w-3.5 h-3.5" />
                      <span>{isTorchOn ? 'TẮT FLASH' : 'FLASH'}</span>
                    </button>
                  )}
                </div>

                <div className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-black min-h-[250px] max-h-[350px] flex items-center justify-center">
                  <div id="qr-reader" className="w-full h-full min-h-[250px]"></div>

                  {/* Target Frame Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                    <div className="w-52 h-44 border-2 border-emerald-400/60 rounded-2xl relative shadow-2xl flex items-center justify-center">
                      <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg"></div>
                      <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg"></div>
                      <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg"></div>
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg"></div>
                      <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse shadow-lg shadow-emerald-400/50"></div>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-center text-emerald-300 font-bold">
                  Căn mã QR / Barcode vào khung xanh để hệ thống tự động quét
                </p>
              </div>
            )}

            {cameraError && (
              <p className="text-xs text-red-600 mt-2 font-medium">{cameraError}</p>
            )}
          </div>

          {/* Barcode Gun / Manual Input Box */}
          <form onSubmit={handleCodeSubmit} className="space-y-2 pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Súng Quét Barcode / Nhập Mã QR nhanh</span>
              <span className="text-[11px] text-blue-600 font-normal">Hỗ trợ tự động điền</span>
            </label>
            <div className="relative">
              <Zap className="w-4 h-4 text-amber-500 absolute left-3 top-1/2 -translate-y-1/2 animate-pulse" />
              <input
                ref={manualInputRef}
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Quét mã bằng máy quét hoặc gõ mã linh kiện..."
                className="w-full pl-9 pr-24 py-3 bg-slate-50 border-2 border-blue-200 rounded-2xl text-sm font-bold font-mono focus:bg-white focus:border-blue-600 outline-hidden transition-all shadow-xs"
              />
              <button
                type="submit"
                disabled={!matchedPart || Boolean(usedInfo?.isUsed)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                {usedInfo?.isUsed ? 'Đã Nhập' : 'Chọn'}
              </button>
            </div>
          </form>

          {/* Used QR Code Warning Banner (If scanned twice!) */}
          {usedInfo?.isUsed && (
            <div className="p-4 bg-red-50 border-2 border-red-400 text-red-900 rounded-2xl text-xs space-y-1.5 shadow-sm animate-in zoom-in-95 duration-150">
              <div className="flex items-center space-x-2 text-red-700 font-black">
                <ShieldAlert className="w-5 h-5 shrink-0 text-red-600 animate-bounce" />
                <span className="text-sm uppercase tracking-tight">⚠️ TEM QR NÀY ĐÃ ĐƯỢC NHẬP KHO TRƯỚC ĐÓ!</span>
              </div>
              <p className="text-slate-700 text-xs font-medium pl-7">
                Quét nhập kho lúc: <strong className="text-red-900 font-bold">{usedInfo.scannedAt}</strong>
                {usedInfo.scannedBy && <span> bởi <strong className="text-red-900">{usedInfo.scannedBy}</strong></span>}
              </p>
              <div className="pl-7 text-[11px] text-red-600 font-semibold italic">
                ⛔ QUY ĐỊNH KHO: Mỗi tem Cont chỉ được quét nhập kho ĐÚNG 1 LẦN DUY NHẤT để tránh nhập trùng làm sai lệch tồn kho.
              </div>
            </div>
          )}

          {/* Matched Part Card Preview */}
          {matchedPart ? (
            <div className={`p-4 rounded-2xl flex flex-col space-y-2.5 animate-in zoom-in-95 duration-150 border-2 ${
              usedInfo?.isUsed ? 'bg-slate-100 border-slate-300 opacity-75' : 'bg-emerald-50 border-emerald-300'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2.5 rounded-xl text-white ${usedInfo?.isUsed ? 'bg-slate-500' : 'bg-emerald-600'}`}>
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-extrabold text-xs text-slate-900">{matchedPart.name}</p>
                    <p className="text-[11px] font-mono font-bold text-slate-600">
                      [{matchedPart.code}] • Vị trí: {matchedPart.location}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[11px] text-slate-600 font-medium">Tồn kho hiện tại:</span>
                  <p className="text-sm font-black text-slate-900">
                    {matchedPart.currentStock} {matchedPart.unit}
                  </p>
                </div>
              </div>

              {(scannedQty !== undefined || scannedCont) && (
                <div className={`pt-2 border-t flex items-center justify-between text-xs font-bold px-3 py-1.5 rounded-xl ${
                  usedInfo?.isUsed ? 'bg-red-100/80 border-red-200 text-red-900' : 'bg-amber-100/80 border-amber-200 text-amber-900'
                }`}>
                  <span>Thông Tin Tem Cont:</span>
                  <span>
                    {scannedCont && `Cont: ${scannedCont} • `}
                    {scannedQty !== undefined && `SL Cont: ${scannedQty} ${matchedPart.unit}`}
                  </span>
                </div>
              )}
            </div>
          ) : manualCode.trim() ? (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Chưa tìm thấy mã linh kiện khớp với <strong>"{manualCode}"</strong></span>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>* Súng quét mã tự động kích hoạt khi quét.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold cursor-pointer transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

