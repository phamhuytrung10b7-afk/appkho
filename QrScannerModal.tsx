import React, { useState, useEffect, useRef } from 'react';
import { Part } from './types';
import { storageService } from './storage';
import {
  QrCode,
  X,
  Camera,
  Zap,
  CheckCircle2,
  AlertCircle,
  Package,
  Search,
  ShieldAlert,
  Flashlight,
  SwitchCamera,
  Focus,
  RotateCcw,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  sortAndFilterCameras,
  getOptimizedVideoConstraints,
  applyTrackFocusAndCapabilities,
  triggerManualFocus,
  startNativeBarcodeDetectorLoop,
  parseCameraError,
  STANDARD_SCANNER_FORMATS,
  CameraDeviceInfo,
} from './cameraScannerUtils';
import { CameraPermissionErrorCard } from './CameraPermissionErrorCard';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPart: (part: Part, autoQty?: number, autoCont?: string, tagId?: string) => void;
  parts: Part[];
  mode?: 'in' | 'out';
  allowDirectPartCode?: boolean;
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
  allowDirectPartCode = false,
}) => {
  const [manualCode, setManualCode] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [matchedPart, setMatchedPart] = useState<Part | null>(null);
  const [cameraErrorDetails, setCameraErrorDetails] = useState<{
    title: string;
    message: string;
    isPermissionDenied: boolean;
  } | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [focusSupported, setFocusSupported] = useState(false);
  const [isRefocusing, setIsRefocusing] = useState(false);
  const [cameras, setCameras] = useState<CameraDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const stopNativeDetectorRef = useRef<(() => void) | null>(null);
  const isScanningRef = useRef<boolean>(false);
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
      setCameraErrorDetails(null);
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

    const cleanInput = manualCode.trim();
    const parsed = parseScannedQrPayload(cleanInput);
    const searchCode = (parsed.partCode || cleanInput).toLowerCase();

    // Check if directly matches a part from master parts list
    const directPartMatch = parts.find(
      (p) =>
        p.code.toLowerCase() === searchCode ||
        p.qrCode?.toLowerCase() === searchCode ||
        p.barcode?.toLowerCase() === searchCode ||
        p.name.toLowerCase() === searchCode ||
        p.code.toLowerCase() === cleanInput.toLowerCase() ||
        p.name.toLowerCase().includes(searchCode)
    );

    // CONTAINER BATCH VALIDATION FOR STOCK IN
    if (mode === 'in' && cleanInput) {
      if (allowDirectPartCode && directPartMatch) {
        // Direct part is explicitly permitted in manual tab
        setCameraErrorDetails(null);
      } else {
        const validCheck = storageService.validateContainerQrTag(cleanInput, parsed);
        if (!validCheck.isValid) {
          const errMessage = allowDirectPartCode
            ? `⛔ Mã quét "${cleanInput}" không thuộc danh mục Cont và không trùng khớp với bất kỳ linh kiện nào trong danh mục!`
            : `⛔ ${validCheck.reason}`;
          setCameraErrorDetails({
            title: 'Mã QR không hợp lệ',
            message: errMessage,
            isPermissionDenied: false,
          });
          setMatchedPart(null);
          return;
        } else {
          setCameraErrorDetails(null);
        }
      }
    }

    // In direct part scan (without container), do not suggest qty
    const isContTag = Boolean(parsed.tagId || parsed.contNumber || cleanInput.startsWith('CONT_IN|'));
    setScannedQty(allowDirectPartCode && !isContTag ? undefined : parsed.qty);
    setScannedCont(parsed.contNumber);
    setScannedTagId(parsed.tagId);

    // Only verify one-time token use if it's an actual container tag
    if (isContTag) {
      const tokenToCheck = parsed.tagId || cleanInput;
      const usedCheck = storageService.isQrTokenUsed(tokenToCheck);
      setUsedInfo(usedCheck.isUsed ? usedCheck : null);
    } else {
      setUsedInfo(null);
    }

    setMatchedPart(directPartMatch || null);
  }, [manualCode, parts, mode, allowDirectPartCode]);

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
    } catch (e) {}
  };

  const stopCamera = async () => {
    isScanningRef.current = false;
    if (stopNativeDetectorRef.current) {
      stopNativeDetectorRef.current();
      stopNativeDetectorRef.current = null;
    }

    if (html5QrcodeRef.current) {
      try {
        const stream = (html5QrcodeRef.current as any).mediaStream as MediaStream;
        if (stream) {
          stream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch (e) {}
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
    setFocusSupported(false);
  };

  const startCamera = async (camId?: string) => {
    setCameraErrorDetails(null);
    setIsTorchOn(false);

    try {
      await stopCamera();
      setIsCameraActive(true);
      isScanningRef.current = true;

      // 1. Probe permission with rear camera preference
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const testStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
          });
          testStream.getTracks().forEach((t) => t.stop());
        } catch (permErr: any) {
          const parsed = parseCameraError(permErr);
          setCameraErrorDetails(parsed);
          setIsCameraActive(false);
          return;
        }
      }

      // 2. Enumerate cameras and prioritize rear cameras
      const rawDevices = await Html5Qrcode.getCameras().catch(() => []);
      const sorted = sortAndFilterCameras(rawDevices);
      setCameras(sorted);

      let targetCamId = camId;
      if (!targetCamId && !selectedCameraId && sorted.length > 0) {
        targetCamId = sorted[0].id;
        setSelectedCameraId(targetCamId);
      } else if (!targetCamId && selectedCameraId) {
        targetCamId = selectedCameraId;
      }

      const html5QrCode = new Html5Qrcode('qr-reader');
      html5QrcodeRef.current = html5QrCode;

      const onScanSuccess = (decodedText: string) => {
        if (!isScanningRef.current) return;
        playBeepSound();
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate([100, 50, 100]);
          } catch (e) {}
        }
        setManualCode(decodedText);
        stopCamera();

        const cleanInput = decodedText.trim();
        const parsed = parseScannedQrPayload(cleanInput);
        const searchCode = (parsed.partCode || cleanInput).toLowerCase();

        const found = parts.find(
          (p) =>
            p.code.toLowerCase() === searchCode ||
            p.qrCode?.toLowerCase() === searchCode ||
            p.barcode?.toLowerCase() === searchCode ||
            p.name.toLowerCase() === searchCode ||
            p.code.toLowerCase() === cleanInput.toLowerCase() ||
            p.name.toLowerCase().includes(searchCode)
        );

        if (found) {
          const isContTag = Boolean(parsed.tagId || parsed.contNumber || cleanInput.startsWith('CONT_IN|'));
          if (mode === 'in') {
            if (isContTag) {
              const tokenToCheck = parsed.tagId || cleanInput;
              const usedCheck = storageService.isQrTokenUsed(tokenToCheck);
              if (usedCheck.isUsed) return;
              const validCheck = storageService.validateContainerQrTag(cleanInput, parsed);
              if (!validCheck.isValid) return;
            } else if (!allowDirectPartCode) {
              return;
            }
          }

          // Auto select on camera scan
          setTimeout(() => {
            onSelectPart(
              found,
              allowDirectPartCode && !isContTag ? undefined : parsed.qty,
              parsed.contNumber,
              parsed.tagId || (isContTag ? cleanInput : undefined)
            );
            onClose();
          }, 120);
        }
      };

      const videoConstraints = getOptimizedVideoConstraints(targetCamId);

      const qrConfig = {
        fps: 30,
        qrbox: (w: number, h: number) => {
          const minEdge = Math.min(w, h);
          const boxSize = Math.max(Math.floor(minEdge * 0.82), 220);
          return { width: boxSize, height: boxSize };
        },
        videoConstraints,
        disableFlip: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        formatsToSupport: STANDARD_SCANNER_FORMATS,
      };

      if (targetCamId) {
        try {
          await html5QrCode.start(targetCamId, qrConfig, onScanSuccess, () => {});
        } catch (startErr) {
          console.warn('Start with specific camera ID failed, trying environment facing:', startErr);
          await html5QrCode.start(
            { facingMode: 'environment' },
            qrConfig,
            onScanSuccess,
            () => {}
          );
        }
      } else {
        await html5QrCode.start(
          { facingMode: 'environment' },
          qrConfig,
          onScanSuccess,
          () => {}
        );
      }

      // 4. Apply continuous focus & capabilities
      const activeStream = (html5QrCode as any).mediaStream as MediaStream;
      if (activeStream) {
        await applyTrackFocusAndCapabilities(activeStream);
        const track = activeStream.getVideoTracks()[0];
        if (track && track.getCapabilities) {
          const caps = track.getCapabilities() as any;
          if (caps?.torch) setTorchSupported(true);
          if (caps?.focusMode) setFocusSupported(true);
        }
      }

      // 5. Hardware BarcodeDetector acceleration loop for Android Chrome
      const pollForVideoEl = () => {
        const videoEl = document.querySelector('#qr-reader video') as HTMLVideoElement;
        if (!videoEl || videoEl.readyState < 2) {
          if (isScanningRef.current) {
            requestAnimationFrame(pollForVideoEl);
          }
          return;
        }

        stopNativeDetectorRef.current = startNativeBarcodeDetectorLoop(
          videoEl,
          (decoded) => {
            onScanSuccess(decoded);
          },
          () => isScanningRef.current
        );
      };
      pollForVideoEl();

    } catch (err: any) {
      console.warn('Camera start issue:', err);
      const parsed = parseCameraError(err);
      setCameraErrorDetails(parsed);
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

  const handleManualRefocus = async () => {
    if (!html5QrcodeRef.current) return;
    setIsRefocusing(true);
    const stream = (html5QrcodeRef.current as any).mediaStream as MediaStream;
    await triggerManualFocus(stream);
    setTimeout(() => {
      setIsRefocusing(false);
    }, 400);
  };

  const handleScanImageFile = async (file: File) => {
    try {
      if (!html5QrcodeRef.current) {
        html5QrcodeRef.current = new Html5Qrcode('qr-reader');
      }
      const decodedText = await html5QrcodeRef.current.scanFile(file, true);
      if (decodedText) {
        setManualCode(decodedText);
        stopCamera();
      }
    } catch (err) {
      setCameraErrorDetails({
        title: 'Không nhận diện được ảnh',
        message: 'Không phát hiện được mã QR trong ảnh vừa chọn. Vui lòng thử lại với ảnh rõ nét hơn.',
        isPermissionDenied: false,
      });
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
              <p className="text-[11px] text-blue-100">Ưu tiên camera sau nét cao &amp; súng quét Barcode</p>
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
          {/* Camera Scanner Toggle & Live View Container */}
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
              <span>{isCameraActive ? 'Tắt Camera Quét' : 'Bật Camera Quét Nét Cao (Cam Sau)'}</span>
            </button>

            {/* Permission or hardware error */}
            {cameraErrorDetails && !isCameraActive && (
              <CameraPermissionErrorCard
                errorTitle={cameraErrorDetails.title}
                errorMessage={cameraErrorDetails.message}
                isPermissionDenied={cameraErrorDetails.isPermissionDenied}
                onRetry={() => {
                  setCameraErrorDetails(null);
                  startCamera();
                }}
                onImageSelected={handleScanImageFile}
              />
            )}

            {isCameraActive && (
              <div className="bg-slate-950 text-white p-3 rounded-2xl border-2 border-emerald-500 space-y-2 animate-in zoom-in-95 duration-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
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
                            {c.isRear ? `📷 [Camera sau] ${c.label}` : c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center space-x-1.5 ml-auto">
                    {focusSupported && (
                      <button
                        type="button"
                        onClick={handleManualRefocus}
                        disabled={isRefocusing}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer transition-all bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30"
                        title="Nhấn để lấy lại nét (Re-focus)"
                      >
                        <Focus className={`w-3.5 h-3.5 ${isRefocusing ? 'animate-spin' : ''}`} />
                        <span>{isRefocusing ? 'Đang lấy nét...' : 'Lấy nét'}</span>
                      </button>
                    )}

                    {torchSupported && (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer transition-all ${
                          isTorchOn
                            ? 'bg-amber-400 text-slate-950 font-black'
                            : 'bg-slate-800 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        <Flashlight className="w-3.5 h-3.5" />
                        <span>{isTorchOn ? 'TẮT FLASH' : 'FLASH'}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div
                  onClick={handleManualRefocus}
                  className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-black min-h-[260px] sm:min-h-[320px] max-h-[420px] flex items-center justify-center cursor-crosshair group"
                  title="Chạm vào màn hình để tự động lấy nét lại"
                >
                  <div id="qr-reader" className="w-full h-full min-h-[260px] sm:min-h-[320px]"></div>

                  {/* Target Frame Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                    <div className="w-60 h-60 border-2 border-emerald-400/60 rounded-2xl relative shadow-2xl flex items-center justify-center">
                      <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl"></div>
                      <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl"></div>
                      <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl"></div>
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl"></div>
                      <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse shadow-lg shadow-emerald-400/50"></div>
                    </div>
                  </div>

                  {/* Click to focus hint badge */}
                  <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-xs text-[10px] text-slate-300 px-2 py-0.5 rounded-md border border-slate-700 pointer-events-none">
                    💡 Chạm màn hình để lấy lại nét
                  </div>
                </div>

                <p className="text-[11px] text-center text-emerald-300 font-bold">
                  Căn mã QR / Barcode vào khung xanh để hệ thống tự động quét
                </p>
              </div>
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
              <p className="text-slate-800 text-xs font-medium pl-7">
                Đã nhập kho lúc: <strong className="text-red-950 font-bold">{usedInfo.scannedAt}</strong>
                {usedInfo.scannedBy && <span> bởi <strong className="text-red-950">{usedInfo.scannedBy}</strong></span>}
              </p>
              <div className="pl-7 text-[11px] text-red-700 font-semibold italic">
                ⛔ QUY ĐỊNH KHO: Mỗi tem Cont chỉ được quét nhập kho ĐÚNG 1 LẦN DUY NHẤT. Lần quét này bị khóa để chống trùng lặp.
              </div>
            </div>
          )}

          {/* Matched Part Preview Card */}
          {matchedPart && !usedInfo?.isUsed && (
            <div className="p-4 bg-emerald-50/70 border-2 border-emerald-300 rounded-2xl space-y-2 animate-in fade-in duration-200 shadow-xs">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
                  <Package className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded-md uppercase">
                      Khớp Linh Kiện
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-800">
                      {matchedPart.code}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 truncate mt-0.5">
                    {matchedPart.name}
                  </h4>
                  <p className="text-xs text-slate-600">
                    Vị trí: <strong>{matchedPart.location || 'Chưa phân vị trí'}</strong> • Tồn: <strong>{matchedPart.currentStock} {matchedPart.unit}</strong>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
