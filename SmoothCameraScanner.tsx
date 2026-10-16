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
  Focus,
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
  FAST_SCANNER_FORMATS,
  isIOSDevice,
  setupVideoElementAttributes,
  CameraDeviceInfo,
} from './cameraScannerUtils';
import { CameraPermissionErrorCard } from './CameraPermissionErrorCard';

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
  const [currentFacingMode, setCurrentFacingMode] = useState<'environment' | 'user'>('environment');
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [showSuccessBadge, setShowSuccessBadge] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const containerIdRef = useRef<string>(`smooth-qr-reader-${Math.random().toString(36).substring(2, 9)}`);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const stopNativeDetectorRef = useRef<(() => void) | null>(null);
  const isScanningActiveRef = useRef<boolean>(false);
  const lastScanTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const playBeepSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  };

  const triggerVibration = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([100, 50, 100]);
      } catch (e) {}
    }
  };

  const stopCamera = async () => {
    isScanningActiveRef.current = false;
    if (stopNativeDetectorRef.current) {
      stopNativeDetectorRef.current();
      stopNativeDetectorRef.current = null;
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
    setFocusSupported(false);
  };

  const handleDecodedSuccess = (decodedText: string) => {
    if (!decodedText || !decodedText.trim() || !isScanningActiveRef.current) return;

    const now = Date.now();
    if (now - lastScanTimeRef.current < 600) {
      return;
    }
    lastScanTimeRef.current = now;

    playBeepSound();
    triggerVibration();

    setLastScannedCode(decodedText.trim());
    setShowSuccessBadge(true);

    stopCamera();

    onScanSuccess(decodedText.trim());

    if (autoCloseOnScan && onClose) {
      onClose();
    }
  };

  const startCamera = async (targetCamId?: string, forceFacingMode?: 'environment' | 'user') => {
    setIsInitializing(true);
    setCameraErrorDetails(null);
    setIsTorchOn(false);
    setTorchSupported(false);
    setFocusSupported(false);

    const isIOS = isIOSDevice();

    try {
      await stopCamera();

      // Ensure DOM element is mounted
      let element = document.getElementById(containerIdRef.current);
      if (!element) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        element = document.getElementById(containerIdRef.current);
      }

      setIsCameraActive(true);
      isScanningActiveRef.current = true;

      // 1. Explicitly probe permission on Android/Desktop to populate camera labels.
      // Skip on iOS to prevent Safari from wiping device labels or locking camera session.
      if (!isIOS && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const testStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: forceFacingMode || 'environment' } },
          });
          testStream.getTracks().forEach((t) => t.stop());
        } catch (permErr: any) {
          const parsed = parseCameraError(permErr);
          setCameraErrorDetails(parsed);
          setIsInitializing(false);
          setIsCameraActive(false);
          return;
        }
      }

      // 2. Enumerate cameras and prioritize rear cameras
      const rawDevices = await Html5Qrcode.getCameras().catch(() => []);
      const sorted = sortAndFilterCameras(rawDevices);
      setCameras(sorted);

      let camIdToUse = targetCamId;
      if (!camIdToUse && selectedCameraId) {
        camIdToUse = selectedCameraId;
      } else if (!camIdToUse && !isIOS && sorted.length > 0) {
        camIdToUse = sorted[0].id;
        setSelectedCameraId(camIdToUse);
      }

      const formatsToUse = isIOS ? FAST_SCANNER_FORMATS : STANDARD_SCANNER_FORMATS;
      const targetFps = isIOS ? 15 : 25;

      const html5QrCode = new Html5Qrcode(containerIdRef.current, {
        formatsToSupport: formatsToUse,
        experimentalFeatures: { useBarCodeDetectorIfSupported: !isIOS },
        verbose: false,
      });
      html5QrCodeRef.current = html5QrCode;

      // 3. Determine camera source configuration
      let cameraConfigToUse: any;
      if (forceFacingMode) {
        cameraConfigToUse = { facingMode: forceFacingMode };
      } else if (targetCamId) {
        cameraConfigToUse = targetCamId;
      } else if (isIOS) {
        // iOS: ALWAYS prefer direct facingMode 'environment' to let iOS AVFoundation pick the primary autofocus rear camera
        cameraConfigToUse = { facingMode: 'environment' };
      } else if (camIdToUse) {
        cameraConfigToUse = camIdToUse;
      } else {
        cameraConfigToUse = { facingMode: 'environment' };
      }

      const videoConstraints = getOptimizedVideoConstraints(
        typeof cameraConfigToUse === 'string' ? cameraConfigToUse : undefined
      );
      if (forceFacingMode) {
        (videoConstraints as any).facingMode = { ideal: forceFacingMode };
      }

      const qrConfig = {
        fps: targetFps,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minDim = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.max(Math.floor(minDim * 0.85), 240);
          return { width: size, height: size };
        },
        videoConstraints,
        disableFlip: false,
      };

      try {
        await html5QrCode.start(cameraConfigToUse, qrConfig, handleDecodedSuccess, () => {});
      } catch (firstErr) {
        console.warn('Initial camera start failed, retrying with fallback facingMode:', firstErr);
        await html5QrCode.start(
          { facingMode: forceFacingMode || 'environment' },
          {
            fps: 12,
            qrbox: (w, h) => {
              const m = Math.min(w, h);
              return { width: Math.max(Math.floor(m * 0.85), 240), height: Math.max(Math.floor(m * 0.85), 240) };
            },
            disableFlip: false,
          },
          handleDecodedSuccess,
          () => {}
        );
      }

      setIsInitializing(false);

      // 4. Apply continuous focus & exposure to active video track
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

      // 5. Video Element setup and Hardware BarcodeDetector acceleration loop
      const pollForVideoEl = () => {
        const videoEl = document.querySelector(`#${containerIdRef.current} video`) as HTMLVideoElement;
        if (!videoEl || videoEl.readyState < 2) {
          if (isScanningActiveRef.current) {
            requestAnimationFrame(pollForVideoEl);
          }
          return;
        }

        // Configure iOS Safari inline video playback
        setupVideoElementAttributes(videoEl);

        // Hardware BarcodeDetector acceleration for Android Chrome
        if (!isIOS) {
          stopNativeDetectorRef.current = startNativeBarcodeDetectorLoop(
            videoEl,
            (decoded) => {
              handleDecodedSuccess(decoded);
            },
            () => isScanningActiveRef.current
          );
        }
      };
      pollForVideoEl();

    } catch (err: any) {
      console.error('SmoothCameraScanner start error:', err);
      setIsInitializing(false);
      setIsCameraActive(false);
      const parsed = parseCameraError(err);
      setCameraErrorDetails(parsed);
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

  const handleManualRefocus = async () => {
    if (!html5QrCodeRef.current) return;
    setIsRefocusing(true);
    const stream = (html5QrCodeRef.current as any).mediaStream as MediaStream;
    await triggerManualFocus(stream);
    setTimeout(() => {
      setIsRefocusing(false);
    }, 400);
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg animate-pulse">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-extrabold text-xs text-white uppercase tracking-wide flex items-center space-x-1.5">
              <span>CAMERA QUÉT QR THẺ THÙNG (ƯU TIÊN CAM SAU)</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-blue-500/30 text-blue-300 rounded font-mono">
                HD/FHD
              </span>
            </h4>
            <p className="text-[11px] text-blue-300 font-medium">{placeholderText}</p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {focusSupported && (
            <button
              type="button"
              onClick={handleManualRefocus}
              disabled={isRefocusing}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer transition-all bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-500/30"
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
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.isRear ? `📷 [Camera sau] ${c.label}` : c.label}
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

      {/* Camera Error Display with Step-by-Step Instructions */}
      {cameraErrorDetails ? (
        <CameraPermissionErrorCard
          errorTitle={cameraErrorDetails.title}
          errorMessage={cameraErrorDetails.message}
          isPermissionDenied={cameraErrorDetails.isPermissionDenied}
          onRetry={() => {
            setCameraErrorDetails(null);
            startCamera();
          }}
          onImageSelected={(file) => {
            const dt = new DataTransfer();
            dt.items.add(file);
            if (fileInputRef.current) {
              fileInputRef.current.files = dt.files;
              handleFileUpload({ target: fileInputRef.current } as any);
            }
          }}
        />
      ) : (
        /* Video Container with Tap-To-Focus */
        <div
          onClick={handleManualRefocus}
          className="relative w-full rounded-xl overflow-hidden bg-black min-h-[280px] sm:min-h-[340px] max-h-[440px] flex items-center justify-center border border-slate-800 shadow-inner cursor-crosshair group"
          title="Chạm vào màn hình để tự động lấy nét lại"
        >
          <div id={containerIdRef.current} className="w-full h-full min-h-[280px] sm:min-h-[340px]"></div>

          {/* Initializing Spinner */}
          {isInitializing && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center space-y-2 z-10">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs font-bold text-blue-300">Đang khởi động Camera Sau Siêu Nét...</span>
            </div>
          )}

          {/* Reticle Target Frame Overlay */}
          {!isInitializing && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
              <div className="w-60 h-60 sm:w-72 sm:h-72 border-2 border-blue-400/60 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                {/* 4 Corner Markers */}
                <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-blue-400 -mt-1 -ml-1 rounded-tl-xl"></div>
                <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-blue-400 -mt-1 -mr-1 rounded-tr-xl"></div>
                <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-blue-400 -mb-1 -ml-1 rounded-bl-xl"></div>
                <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-blue-400 -mb-1 -mr-1 rounded-br-xl"></div>

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

          {/* Tap to focus hint badge */}
          <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-xs text-[10px] text-slate-300 px-2 py-0.5 rounded-md border border-slate-700 pointer-events-none">
            💡 Chạm màn hình để lấy lại nét
          </div>
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
