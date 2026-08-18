import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  X,
  Flashlight,
  SwitchCamera,
  QrCode,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  UploadCloud,
  Image as ImageIcon,
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface SmoothCameraScannerProps {
  onScanSuccess: (scannedText: string) => void;
  onClose?: () => void;
  placeholderText?: string;
  autoCloseOnScan?: boolean;
}

export const SmoothCameraScanner: React.FC<SmoothCameraScannerProps> = ({
  onScanSuccess,
  onClose,
  placeholderText = 'Căn mã QR Thẻ Thùng / Phiếu Thông Tin vào khung hình camera...',
  autoCloseOnScan = true,
}) => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [currentFacingMode, setCurrentFacingMode] = useState<'environment' | 'user'>('environment');
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [showSuccessBadge, setShowSuccessBadge] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const containerIdRef = useRef<string>(`smooth-qr-reader-${Math.random().toString(36).substring(2, 9)}`);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const playBeepSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6 pitch
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      // AudioContext might be muted or restricted
    }
  };

  const triggerVibration = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([120, 60, 120]);
      } catch (e) {}
    }
  };

  const stopCamera = async () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (html5QrCodeRef.current) {
      try {
        const stream = (html5QrCodeRef.current as any).mediaStream as MediaStream;
        if (stream) {
          stream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch (e) {}
          });
        }
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop().catch(() => {});
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

  const handleDecodedSuccess = (decodedText: string) => {
    if (!decodedText || !decodedText.trim()) return;

    const now = Date.now();
    if (now - lastScanTimeRef.current < 600) {
      return; // Throttle repeat scans
    }
    lastScanTimeRef.current = now;

    playBeepSound();
    triggerVibration();

    setLastScannedCode(decodedText.trim());
    setShowSuccessBadge(true);

    // Stop camera media tracks immediately so mobile resources are freed
    stopCamera();

    // Trigger success callback
    onScanSuccess(decodedText.trim());

    if (autoCloseOnScan && onClose) {
      onClose();
    }
  };

  const startCamera = async (targetCamId?: string, forceFacingMode?: 'environment' | 'user') => {
    setIsInitializing(true);
    setCameraError(null);
    setIsTorchOn(false);
    setTorchSupported(false);

    try {
      await stopCamera();

      // Ensure DOM element is mounted
      const element = document.getElementById(containerIdRef.current);
      if (!element) {
        // Wait 100ms for DOM ready
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      setIsCameraActive(true);

      // Check available cameras
      let devices: Array<{ id: string; label: string }> = [];
      try {
        const detected = await Html5Qrcode.getCameras();
        if (detected && detected.length > 0) {
          devices = detected.map((d, i) => ({
            id: d.id,
            label: d.label || `Camera ${i + 1}`,
          }));
          setCameras(devices);
        }
      } catch (e) {
        console.warn('Could not enumerate cameras, falling back to facingMode:', e);
      }

      const html5QrCode = new Html5Qrcode(containerIdRef.current);
      html5QrCodeRef.current = html5QrCode;

      const qrConfig = {
        fps: 25,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minDim = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.max(Math.floor(minDim * 0.76), 180);
          return { width: size, height: size };
        },
        aspectRatio: 1.0,
        disableFlip: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
        ],
      };

      const facingToUse = forceFacingMode || currentFacingMode;

      // Start strategy:
      // 1. If targetCamId specified, try it.
      // 2. Otherwise start with { facingMode: { ideal: facingToUse } } (most robust across all mobile browsers)
      if (targetCamId) {
        try {
          await html5QrCode.start(targetCamId, qrConfig, handleDecodedSuccess, () => {});
          setSelectedCameraId(targetCamId);
        } catch (camErr) {
          console.warn('Specific camera ID failed, trying facingMode:', camErr);
          await html5QrCode.start({ facingMode: { ideal: facingToUse } }, qrConfig, handleDecodedSuccess, () => {});
        }
      } else {
        try {
          await html5QrCode.start({ facingMode: { ideal: facingToUse } }, qrConfig, handleDecodedSuccess, () => {});
        } catch (idealErr) {
          console.warn('FacingMode ideal failed, trying direct environment string:', idealErr);
          try {
            await html5QrCode.start({ facingMode: 'environment' }, qrConfig, handleDecodedSuccess, () => {});
          } catch (envErr) {
            // If rear camera fails, try any available device ID or user camera
            if (devices.length > 0) {
              await html5QrCode.start(devices[0].id, qrConfig, handleDecodedSuccess, () => {});
              setSelectedCameraId(devices[0].id);
            } else {
              throw envErr;
            }
          }
        }
      }

      setIsInitializing(false);

      // Check flashlight support on media stream
      try {
        const stream = (html5QrCode as any).mediaStream as MediaStream;
        if (stream && stream.getVideoTracks()[0]?.getCapabilities) {
          const caps = stream.getVideoTracks()[0].getCapabilities() as any;
          if (caps?.torch) {
            setTorchSupported(true);
          }
        }
      } catch (e) {}

      // Hardware BarcodeDetector acceleration for high-speed scanning on mobile Chrome
      try {
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          const detector = new (window as any).BarcodeDetector({
            formats: ['qr_code', 'code_128', 'data_matrix', 'code_39', 'ean_13'],
          });

          const pollForVideo = () => {
            const videoEl = document.querySelector(`#${containerIdRef.current} video`) as HTMLVideoElement;
            if (!videoEl || videoEl.readyState < 2) {
              if (html5QrCodeRef.current) {
                animationFrameRef.current = requestAnimationFrame(pollForVideo);
              }
              return;
            }

            const checkFrame = async () => {
              if (!html5QrCodeRef.current || videoEl.paused || videoEl.ended) return;
              try {
                const detected = await detector.detect(videoEl);
                if (detected && detected.length > 0 && detected[0].rawValue) {
                  handleDecodedSuccess(detected[0].rawValue);
                  return;
                }
              } catch (e) {}
              if (html5QrCodeRef.current) {
                animationFrameRef.current = requestAnimationFrame(checkFrame);
              }
            };
            animationFrameRef.current = requestAnimationFrame(checkFrame);
          };

          pollForVideo();
        }
      } catch (e) {}
    } catch (err: any) {
      console.error('SmoothCameraScanner start error:', err);
      setIsInitializing(false);
      setIsCameraActive(false);

      let msg = 'Không thể mở Camera. Vui lòng cấp quyền truy cập Camera trong Cài Đặt Trình Duyệt / Điện Thoại.';
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission denied')) {
        msg = '⛔ Bạn đã từ chối quyền truy cập Camera. Vui lòng cho phép quyền Camera trên trình duyệt để quét.';
      } else if (err?.name === 'NotFoundError' || err?.message?.includes('DevicesNotFoundError')) {
        msg = 'Không tìm thấy camera trên thiết bị này. Bạn có thể sử dụng nút "Tải ảnh / Chụp ảnh" bên dưới.';
      } else if (err?.name === 'NotReadableError') {
        msg = 'Camera đang bị ứng dụng khác sử dụng hoặc bị khóa. Vui lòng đóng các tab camera khác và thử lại.';
      }
      setCameraError(msg);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      startCamera();
    }, 100);

    return () => {
      clearTimeout(timer);
      stopCamera();
    };
  }, []);

  const toggleCameraFacing = async () => {
    const nextFacing = currentFacingMode === 'environment' ? 'user' : 'environment';
    setCurrentFacingMode(nextFacing);
    await startCamera(undefined, nextFacing);
  };

  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !html5QrCodeRef.current.isScanning) return;
    const nextState = !isTorchOn;

    try {
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState } as any],
      });
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn('Torch failed:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    try {
      let scanner = html5QrCodeRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode(containerIdRef.current);
      }

      const decodedResult = await scanner.scanFileV2(file, true);
      if (decodedResult?.decodedText) {
        handleDecodedSuccess(decodedResult.decodedText);
      } else {
        alert('Không tìm thấy mã QR / Barcode hợp lệ trong ảnh vừa chọn. Vui lòng thử lại với ảnh rõ nét hơn.');
      }
    } catch (err) {
      console.error('File scan error:', err);
      alert('Không nhận diện được mã QR trong ảnh. Hãy đảm bảo hình ảnh rõ nét và không bị lóa.');
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="bg-slate-950 text-white p-3.5 sm:p-4 rounded-2xl border-2 border-blue-500 shadow-2xl space-y-3 animate-in fade-in duration-200">
      {/* Hidden File Input for Image/Gallery Scanner */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg animate-pulse">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-extrabold text-xs text-white uppercase tracking-wide flex items-center space-x-1.5">
              <span>CAMERA QUÉT QR THẺ THÙNG</span>
            </h4>
            <p className="text-[11px] text-blue-300 font-medium">{placeholderText}</p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer transition-all ${
                isTorchOn
                  ? 'bg-amber-400 text-slate-950 font-black shadow-md'
                  : 'bg-slate-800 text-amber-300 border border-amber-500/30'
              }`}
              title="Bật/Tắt Đèn Flash Trợ Sáng"
            >
              <Flashlight className="w-3.5 h-3.5" />
              <span>{isTorchOn ? 'TẮT FLASH' : 'FLASH'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleCameraFacing}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer transition-all"
            title="Đổi Camera Trước / Sau"
          >
            <SwitchCamera className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Đổi Cam</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl transition-all flex items-center space-x-1 cursor-pointer shadow-md"
            >
              <X className="w-4 h-4" />
              <span>Đóng</span>
            </button>
          )}
        </div>
      </div>

      {/* Camera Selection Dropdown if multiple rear/front cameras exist */}
      {cameras.length > 1 && (
        <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
          <SwitchCamera className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="text-[11px] font-bold text-slate-300 shrink-0">Chọn Camera:</span>
          <select
            value={selectedCameraId}
            onChange={(e) => {
              setSelectedCameraId(e.target.value);
              startCamera(e.target.value);
            }}
            className="bg-slate-800 text-blue-300 font-bold text-xs py-1 px-2 rounded-lg border border-slate-700 outline-none w-full cursor-pointer"
          >
            <option value="">Tự động (Camera Sau Tốt Nhất)</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Success Banner Badge */}
      {showSuccessBadge && lastScannedCode && (
        <div className="p-2 bg-emerald-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-between shadow-lg animate-in zoom-in-95">
          <div className="flex items-center space-x-2 truncate">
            <CheckCircle2 className="w-4 h-4 text-slate-950 shrink-0" />
            <span className="truncate">Đã nhận mã: {lastScannedCode}</span>
          </div>
        </div>
      )}

      {/* Camera Error or Viewfinder Box */}
      {cameraError ? (
        <div className="p-5 bg-rose-950/80 border border-rose-600 rounded-xl text-center space-y-3">
          <AlertCircle className="w-9 h-9 text-rose-400 mx-auto" />
          <p className="text-xs font-bold text-rose-200 leading-relaxed">{cameraError}</p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => startCamera()}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl flex items-center space-x-1.5 cursor-pointer shadow-md"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Thử lại Mở Camera</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl flex items-center space-x-1.5 cursor-pointer shadow-md"
            >
              <UploadCloud className="w-4 h-4" />
              <span>📸 Chụp Ảnh / Chọn Ảnh Thẻ Thùng</span>
            </button>
          </div>
        </div>
      ) : (
        /* Video Container */
        <div className="relative w-full rounded-xl overflow-hidden bg-black min-h-[260px] max-h-[360px] flex items-center justify-center border border-slate-800 shadow-inner">
          <div id={containerIdRef.current} className="w-full h-full min-h-[260px]"></div>

          {/* Initializing Spinner */}
          {isInitializing && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center space-y-2 z-10">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs font-bold text-blue-300">Đang khởi động Camera...</span>
            </div>
          )}

          {/* Reticle Target Frame Overlay */}
          {!isInitializing && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
              <div className="w-56 h-56 border-2 border-blue-400/60 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                {/* 4 Corner Markers */}
                <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-blue-400 -mt-1 -ml-1 rounded-tl-lg"></div>
                <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-blue-400 -mt-1 -mr-1 rounded-tr-lg"></div>
                <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-blue-400 -mb-1 -ml-1 rounded-bl-lg"></div>
                <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-blue-400 -mb-1 -mr-1 rounded-br-lg"></div>

                {/* Animated Laser Scan Line */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-300 to-transparent absolute top-1/2 -translate-y-1/2 shadow-[0_0_10px_#22d3ee] animate-pulse"></div>

                <div className="absolute bottom-2 inset-x-0 text-center">
                  <span className="bg-black/60 backdrop-blur-xs text-[10px] text-blue-200 font-bold px-2 py-0.5 rounded-full border border-blue-400/30">
                    Căn mã QR vào giữa khung
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Tool Helper: Photo capture / gallery upload button */}
      <div className="pt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={isProcessingFile}
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-blue-300 hover:text-white border border-blue-500/30 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
        >
          <ImageIcon className="w-4 h-4 text-blue-400" />
          <span>{isProcessingFile ? 'Đang đọc mã từ ảnh...' : '📸 Chụp ảnh / Tải ảnh từ thư viện'}</span>
        </button>
      </div>
    </div>
  );
};
