import React, { useState, useEffect, useRef } from 'react';
import { Part } from './types';
import { storageService } from './storage';
import { parseScannedQrPayload } from './QrScannerModal';
import { QrCode, Zap, Camera, ShieldAlert, CheckCircle2, AlertCircle, X, RotateCcw, Package, Flashlight, SwitchCamera } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface InlineQrScannerProps {
  mode: 'in' | 'out';
  parts: Part[];
  onScanSuccess: (data: {
    part: Part;
    qty?: number;
    contNumber?: string;
    tagId?: string;
    contDate?: string;
  }) => void;
  onClear?: () => void;
}

export const InlineQrScanner: React.FC<InlineQrScannerProps> = ({
  mode,
  parts,
  onScanSuccess,
  onClear,
}) => {
  const [scanInput, setScanInput] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  const [lastScannedPart, setLastScannedPart] = useState<Part | null>(null);
  const [lastScannedDetails, setLastScannedDetails] = useState<{
    qty?: number;
    contNumber?: string;
    tagId?: string;
    contDate?: string;
  } | null>(null);
  const [usedInfo, setUsedInfo] = useState<{
    isUsed: boolean;
    scannedAt?: string;
    scannedBy?: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const qrContainerId = `inline-qr-reader-${mode}`;

  // Auto focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        const stream = (html5QrCodeRef.current as any).mediaStream as MediaStream;
        if (stream) {
          stream.getTracks().forEach((track) => {
            try { track.stop(); } catch (e) {}
          });
        }
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (e) {
        console.warn('Error stopping scanner:', e);
      }
      html5QrCodeRef.current = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
    setTorchSupported(false);
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

  const handleProcessScan = (rawText: string) => {
    if (!rawText.trim()) return;

    playBeepSound();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([100, 50, 100]);
      } catch (e) {}
    }

    setErrorMsg(null);
    setUsedInfo(null);

    const parsed = parseScannedQrPayload(rawText);
    const foundPart = parts.find(
      (p) =>
        p.code.trim().toLowerCase() === parsed.partCode.trim().toLowerCase() ||
        p.id === parsed.partCode
    );

    if (!foundPart) {
      setErrorMsg(`Không tìm thấy linh kiện có mã: "${parsed.partCode}" trong kho!`);
      setLastScannedPart(null);
      setLastScannedDetails(null);
      return;
    }

    // STRICT CONTAINER BATCH VALIDATION FOR STOCK IN
    if (mode === 'in') {
      const validCheck = storageService.validateContainerQrTag(rawText, parsed);
      if (!validCheck.isValid) {
        setErrorMsg(`⛔ ${validCheck.reason}`);
        setLastScannedPart(null);
        setLastScannedDetails(null);
        return;
      }

      // Check if already fully imported
      const tokenToCheck = parsed.tagId || rawText.trim();
      const usedCheck = storageService.isQrTokenUsed(tokenToCheck);
      if (usedCheck.isUsed) {
        setUsedInfo(usedCheck);
        setLastScannedPart(foundPart);
        setLastScannedDetails(parsed);
        return;
      }
    }

    setLastScannedPart(foundPart);
    setLastScannedDetails(parsed);
    setScanInput('');

    onScanSuccess({
      part: foundPart,
      qty: mode === 'out' ? undefined : parsed.qty,
      contNumber: parsed.contNumber,
      tagId: parsed.tagId || rawText.trim(),
      contDate: parsed.contDate,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleProcessScan(scanInput);
    }
  };

  const startCameraInstance = async (camId?: string) => {
    setCameraError(null);
    setIsTorchOn(false);

    try {
      await stopCamera();
      setIsCameraActive(true);

      // Enumerate cameras
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

      const html5QrCode = new Html5Qrcode(qrContainerId);
      html5QrCodeRef.current = html5QrCode;

      const onScanSuccessCallback = (decodedText: string) => {
        setScanInput(decodedText);
        handleProcessScan(decodedText);
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

      const activeCamId = camId || selectedCameraId;
      if (activeCamId) {
        await html5QrCode.start(
          activeCamId,
          qrConfig,
          onScanSuccessCallback,
          () => {}
        );
      } else {
        await html5QrCode.start(
          { facingMode: 'environment' },
          qrConfig,
          onScanSuccessCallback,
          () => {}
        );
      }

      // Check flashlight
      try {
        const stream = (html5QrCode as any).mediaStream as MediaStream;
        if (stream && stream.getVideoTracks()[0]?.getCapabilities) {
          const caps = stream.getVideoTracks()[0].getCapabilities() as any;
          if (caps?.torch) setTorchSupported(true);
        }
      } catch (e) {}

    } catch (err: any) {
      console.error('Inline camera error:', err);
      // Fallback
      try {
        if (html5QrCodeRef.current) {
          await html5QrCodeRef.current.start(
            { facingMode: 'environment' },
            { fps: 25 },
            (text) => {
              setScanInput(text);
              handleProcessScan(text);
              stopCamera();
            },
            () => {}
          );
          return;
        }
      } catch (e2) {}

      setCameraError('Không thể mở Camera. Vui lòng cấp quyền Camera cho trình duyệt.');
      setIsCameraActive(false);
    }
  };

  const toggleCamera = () => {
    if (isCameraActive) {
      stopCamera();
    } else {
      setIsCameraActive(true);
      setTimeout(() => {
        startCameraInstance();
        cameraContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !html5QrCodeRef.current.isScanning) return;
    const nextState = !isTorchOn;

    try {
      await html5QrCodeRef.current.applyVideoConstraints({ advanced: [{ torch: nextState } as any] });
      setIsTorchOn(nextState);
    } catch (err) {
      try {
        const stream = (html5QrCodeRef.current as any).mediaStream as MediaStream;
        const track = stream?.getVideoTracks()[0];
        if (track) {
          await track.applyConstraints({ advanced: [{ torch: nextState } as any] });
          setIsTorchOn(nextState);
        }
      } catch (e) {}
    }
  };

  const handleReset = () => {
    setScanInput('');
    setLastScannedPart(null);
    setLastScannedDetails(null);
    setUsedInfo(null);
    setErrorMsg(null);
    if (onClear) onClear();
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  return (
    <div className={`p-4 sm:p-5 rounded-2xl shadow-xs space-y-4 border-2 transition-all ${
      mode === 'in' 
        ? 'bg-emerald-50/60 border-emerald-300 text-slate-900'
        : 'bg-blue-50/60 border-blue-300 text-slate-900'
    }`}>
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl font-bold border border-amber-200 flex items-center justify-center">
            <Zap className="w-5 h-5 text-amber-600 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-extrabold text-[10px] rounded-md uppercase tracking-wider border border-amber-200">
                QUÉT MÃ TỰ ĐỘNG
              </span>
              <span className="text-[11px] text-slate-600 font-medium">Súng quét USB / Bluetooth / Camera Siêu Nét</span>
            </div>
            <h3 className="font-extrabold text-sm sm:text-base text-slate-900 mt-0.5">
              {mode === 'in' ? 'QUÉT MÃ MẶC ĐỊNH NHẬP KHO' : 'QUÉT MÃ MẶC ĐỊNH XUẤT KHO'}
            </h3>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={toggleCamera}
            className={`px-3 py-2 rounded-xl font-extrabold text-xs transition-all flex items-center space-x-1.5 cursor-pointer shadow-md ${
              isCameraActive 
                ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse' 
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <Camera className="w-4 h-4 text-white" />
            <span>{isCameraActive ? 'Tắt Camera' : 'Bật Camera Scannner'}</span>
          </button>

          {(scanInput || lastScannedPart || errorMsg) && (
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
              <span>Quét lại</span>
            </button>
          )}
        </div>
      </div>

      {/* Camera Live View element - RENDERED AT TOP WHEN ACTIVE */}
      {isCameraActive && (
        <div
          ref={cameraContainerRef}
          className="bg-slate-950 text-white p-3.5 sm:p-4 rounded-2xl border-2 border-emerald-500 shadow-xl space-y-3 animate-in zoom-in-95 duration-200"
        >
          {/* Camera Header & Controls Toolbar */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg animate-pulse">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-extrabold text-xs text-white uppercase tracking-wide">
                  ĐANG MỞ CAMERA QUÉT MÃ
                </h4>
                <p className="text-[10px] text-emerald-300 font-medium">
                  Căn mã QR / Barcode vào khung xanh bên dưới
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {torchSupported && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer transition-all ${
                    isTorchOn
                      ? 'bg-amber-400 text-slate-950 font-black shadow-md'
                      : 'bg-slate-800 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  <Flashlight className="w-3.5 h-3.5" />
                  <span>{isTorchOn ? 'TẮT FLASH' : 'FLASH'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={stopCamera}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl transition-all flex items-center space-x-1 cursor-pointer shadow-md"
              >
                <X className="w-4 h-4" />
                <span>Tắt Camera</span>
              </button>
            </div>
          </div>

          {/* Camera Device Switcher */}
          {cameras.length > 1 && (
            <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <SwitchCamera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] font-bold text-slate-300 shrink-0">Đổi Camera:</span>
              <select
                value={selectedCameraId}
                onChange={(e) => {
                  setSelectedCameraId(e.target.value);
                  startCameraInstance(e.target.value);
                }}
                className="bg-slate-800 text-emerald-300 font-bold text-xs py-1 px-2 rounded-lg border border-slate-700 outline-none w-full"
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Video Container with Target Scanning Frame */}
          <div className="relative w-full rounded-xl overflow-hidden bg-black min-h-[260px] max-h-[380px] flex items-center justify-center border border-slate-800">
            <div id={qrContainerId} className="w-full h-full min-h-[260px]"></div>

            {/* Target Reticle Frame Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
              <div className="w-56 h-48 border-2 border-emerald-400/60 rounded-2xl relative shadow-2xl flex items-center justify-center">
                {/* Corner Brackets */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg"></div>
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg"></div>
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg"></div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg"></div>
                
                {/* Laser Scanning Line */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse shadow-lg shadow-emerald-400/50"></div>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-center text-emerald-300 font-bold flex items-center justify-center space-x-1 pt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block mr-1"></span>
            <span>Tự động quét QR Code & Barcode 1D/2D Siêu Nét</span>
          </p>
        </div>
      )}

      {/* Main Scan Input Box */}
      <div className="space-y-2">
        <label className="text-xs font-extrabold text-slate-800 flex items-center space-x-1.5">
          <QrCode className="w-4 h-4 text-emerald-600" />
          <span>Đặt con trỏ vào ô bên dưới hoặc bắn súng quét Barcode / QR:</span>
        </label>

        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={scanInput}
            onChange={(e) => {
              setScanInput(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder="[Sẵn sàng quét...] Bắn súng quét mã QR / Barcode hoặc gõ mã..."
            className="w-full pl-4 pr-24 py-3 bg-white border-2 border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-slate-900 font-mono font-bold text-sm sm:text-base rounded-xl placeholder:text-slate-400 placeholder:font-normal placeholder:text-xs outline-hidden shadow-2xs"
          />

          <button
            type="button"
            onClick={() => handleProcessScan(scanInput)}
            disabled={!scanInput.trim()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-lg transition-all cursor-pointer"
          >
            Nhận mã
          </button>
        </div>
        <p className="text-[11px] text-slate-500 flex items-center space-x-1 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block mr-1"></span>
          <span>Súng quét USB/Bluetooth tự động điền & nhấn Enter. Không cần thao tác chuột.</span>
        </p>
      </div>

      {cameraError && (
        <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-xs rounded-xl flex items-center space-x-2 font-medium">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{cameraError}</span>
        </div>
      )}

      {/* ERROR MSG */}
      {errorMsg && (
        <div className="p-3.5 bg-red-50 border-2 border-red-300 text-red-900 text-xs rounded-xl flex items-center justify-between font-bold shadow-2xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={handleReset} className="p-1 hover:bg-red-100 rounded-lg">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      )}

      {/* WARNING IF QR CODE WAS ALREADY USED BEFORE */}
      {usedInfo?.isUsed && (
        <div className="p-4 bg-red-50 border-2 border-red-400 text-red-900 rounded-xl text-xs space-y-1.5 shadow-2xs animate-in zoom-in-95">
          <div className="flex items-center space-x-2 text-red-700 font-black">
            <ShieldAlert className="w-5 h-5 shrink-0 text-red-600 animate-bounce" />
            <span className="text-sm uppercase tracking-tight">⚠️ CẢNH BÁO: TEM QR NÀY ĐÃ ĐƯỢC NHẬP KHO TRƯỚC ĐÓ!</span>
          </div>
          <p className="text-slate-800 text-xs font-medium pl-7">
            Đã nhập kho lúc: <strong className="text-red-950 font-bold">{usedInfo.scannedAt}</strong>
            {usedInfo.scannedBy && <span> bởi <strong className="text-red-950">{usedInfo.scannedBy}</strong></span>}
          </p>
          <div className="pl-7 text-[11px] text-red-700 font-semibold italic">
            ⛔ QUY ĐỊNH KHO: Mỗi tem Cont chỉ được quét nhập kho ĐÚNG 1 LẦN DUY NHẤT. Lần quét này bị khóa để chống trùng lặp.
          </div>
        </div>
      )}

      {/* SUCCESS RESULT CARD PREVIEW */}
      {lastScannedPart && !usedInfo?.isUsed && (
        <div className="p-4 bg-white border-2 border-emerald-300 rounded-xl text-slate-900 space-y-2 shadow-2xs animate-in fade-in-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-lg font-bold">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">ĐÃ QUÉT THÀNH CÔNG</p>
                  {lastScannedDetails?.qty && lastScannedDetails?.contNumber ? (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-200 font-bold text-[10px] rounded-md">
                      TEM QR CONT HỢP LỆ
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold text-[10px] rounded-md border border-slate-200">
                      MÃ LINH KIỆN THƯỜNG
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-bold text-slate-900">{lastScannedPart.name}</h4>
                <p className="text-xs font-mono font-bold text-slate-600">
                  Mã VT: [{lastScannedPart.code}] • Vị trí: {lastScannedPart.location}
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-slate-500">Tồn kho thực tế:</span>
              <p className="text-sm font-black text-emerald-700">
                {lastScannedPart.currentStock} {lastScannedPart.unit}
              </p>
            </div>
          </div>

          {lastScannedDetails?.qty && lastScannedDetails?.contNumber ? (
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-amber-900 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200/60">
              <span>Nội dung Tem QR Cont tự động:</span>
              <span>
                Cont: {lastScannedDetails.contNumber} • Số lượng tem: {lastScannedDetails.qty} {lastScannedPart.unit}
              </span>
            </div>
          ) : (
            <div className="pt-2 border-t border-slate-100 text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/60">
              ℹ️ Đã chọn linh kiện [{lastScannedPart.code}]. Vui lòng điền số lượng và vị trí kệ để tiếp tục.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

