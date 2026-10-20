import React, { useState, useEffect, useRef } from 'react';
import { WarehouseLocation } from './types';
import {
  QrCode,
  X,
  Camera,
  Zap,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Flashlight,
  SwitchCamera,
  Focus,
  RotateCcw,
  Search,
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
import { findLocationMatch } from './StockInView';

interface LocationQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLocation?: (locationName: string) => void;
  onLocationDetected?: (location: WarehouseLocation) => void;
  locations?: WarehouseLocation[];
  title?: string;
  excludeLocation?: string;
}

export function cleanScannedShelfPayload(raw: string): string {
  if (!raw || !raw.trim()) return '';
  let str = raw.trim();

  // Strip surrounding quotes
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }

  // Parse JSON payloads (e.g. {"location": "A01"} or {"shelf": "A01"} or {"code": "A01"})
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const parsed = JSON.parse(str);
      str = String(parsed.location || parsed.name || parsed.shelf || parsed.code || parsed.id || str).trim();
    } catch {}
  }

  // Strip pipe formats (e.g. "CONT|SHELF|A01" -> "A01")
  if (str.includes('|')) {
    const parts = str.split('|');
    str = parts[parts.length - 1].trim();
  }

  // Strip common shelf prefixes like "LOC: A01", "LOCATION: A01", "KỆ A01", "SHELF: A01", "LOC-A01"
  str = str.replace(/^(?:loc|location|shelf|rack|ke|kệ|kho|vitri|vị\s*trí|khoang|khu|tủ|tu)[\s:\-_.]+\s*/i, '').trim();

  return str;
}

export const LocationQrScannerModal: React.FC<LocationQrScannerModalProps> = ({
  isOpen,
  onClose,
  onSelectLocation,
  onLocationDetected,
  locations = [],
  title = 'Quét Mã QR Vị Trí / Kệ Kho',
  excludeLocation,
}) => {
  const [manualInput, setManualInput] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
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
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [matchedLoc, setMatchedLoc] = useState<WarehouseLocation | null>(null);

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const stopNativeDetectorRef = useRef<(() => void) | null>(null);
  const isScanningActiveRef = useRef<boolean>(false);
  const hasTriggeredResultRef = useRef<boolean>(false);
  const manualInputRef = useRef<HTMLInputElement>(null);

  const qrContainerIdRef = useRef<string>(`loc-qr-reader-${Math.random().toString(36).substring(2, 9)}`);

  useEffect(() => {
    if (isOpen) {
      setScannedResult(null);
      setMatchedLoc(null);
      setCameraErrorDetails(null);
      setManualInput('');
      hasTriggeredResultRef.current = false;

      // Small delay to let modal animate and mount the DOM container
      const timer = setTimeout(() => {
        startCamera();
      }, 120);

      return () => {
        clearTimeout(timer);
        stopCamera();
      };
    } else {
      stopCamera();
    }
  }, [isOpen]);

  const stopCamera = async () => {
    isScanningActiveRef.current = false;
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
          await html5QrcodeRef.current.stop().catch(() => {});
        }
        html5QrcodeRef.current.clear();
      } catch (_) {}
      html5QrcodeRef.current = null;
    }

    setIsCameraActive(false);
    setIsTorchOn(false);
    setTorchSupported(false);
    setFocusSupported(false);
  };

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
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {}
  };

  const triggerVibration = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([100, 50, 100]);
      } catch (e) {}
    }
  };

  const handleScanSuccess = (decodedText: string) => {
    if (!isScanningActiveRef.current || hasTriggeredResultRef.current) return;
    const raw = (decodedText || '').trim();
    if (!raw) return;

    const cleanedName = cleanScannedShelfPayload(raw);
    if (!cleanedName) return;

    if (excludeLocation && cleanedName.toLowerCase() === excludeLocation.toLowerCase()) {
      setCameraErrorDetails({
        title: 'Vị trí trùng lặp',
        message: `Vị trí "${cleanedName}" trùng với vị trí xuất phát hiện tại. Vui lòng quét vị trí khác!`,
        isPermissionDenied: false,
      });
      return;
    }

    // Mark as triggered immediately to block any secondary frame events
    hasTriggeredResultRef.current = true;
    isScanningActiveRef.current = false;

    playBeepSound();
    triggerVibration();

    setScannedResult(cleanedName);

    // Try finding in existing locations
    const found = findLocationMatch(cleanedName, locations);
    if (found) {
      setMatchedLoc(found);
    }

    // Stop camera immediately
    stopCamera();

    const targetLocName = found ? found.name : cleanedName;

    // Fast callback in 100ms - single dispatch
    setTimeout(() => {
      try {
        if (onSelectLocation) {
          onSelectLocation(targetLocName);
        } else if (onLocationDetected && found) {
          onLocationDetected(found);
        }
      } catch (_) {}
      onClose();
    }, 100);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleScanSuccess(manualInput.trim());
  };

  const startCamera = async (camId?: string) => {
    setCameraErrorDetails(null);
    setIsTorchOn(false);
    setTorchSupported(false);
    setFocusSupported(false);

    const isIOS = isIOSDevice();

    try {
      await stopCamera();

      // Ensure DOM element is mounted
      let el = document.getElementById(qrContainerIdRef.current);
      if (!el) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        el = document.getElementById(qrContainerIdRef.current);
      }

      setIsCameraActive(true);
      isScanningActiveRef.current = true;
      hasTriggeredResultRef.current = false;

      // 1. Permission probe on Android / Desktop to populate camera device labels
      // Note: Skip track probe on iOS Safari to avoid locking camera or triggering prompt errors
      if (!isIOS && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
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

      // 2. Query available cameras and prioritize rear autofocus lens
      const rawDevices = await Html5Qrcode.getCameras().catch(() => []);
      const sorted = sortAndFilterCameras(rawDevices);
      setCameras(sorted);

      let targetCamId = camId;
      if (!targetCamId && selectedCameraId) {
        targetCamId = selectedCameraId;
      } else if (!targetCamId && !isIOS && sorted.length > 0) {
        targetCamId = sorted[0].id;
        setSelectedCameraId(targetCamId);
      }

      // Fast formats for ultra-responsive scanning: QR_CODE and industrial barcodes
      const formatsToUse = isIOS ? FAST_SCANNER_FORMATS : STANDARD_SCANNER_FORMATS;
      const targetFps = isIOS ? 18 : 30;

      const html5QrCode = new Html5Qrcode(qrContainerIdRef.current, {
        formatsToSupport: formatsToUse,
        experimentalFeatures: { useBarCodeDetectorIfSupported: !isIOS },
        verbose: false,
      });
      html5QrcodeRef.current = html5QrCode;

      // Determine camera config: On iOS ALWAYS prefer facingMode: 'environment'
      let cameraConfigToUse: any;
      if (targetCamId && !isIOS) {
        cameraConfigToUse = targetCamId;
      } else {
        cameraConfigToUse = { facingMode: 'environment' };
      }

      const videoConstraints = getOptimizedVideoConstraints(
        typeof cameraConfigToUse === 'string' ? cameraConfigToUse : undefined
      );

      const qrConfig: any = {
        fps: targetFps,
        videoConstraints,
        disableFlip: false,
      };

      // On Android/Desktop: qrbox focuses the decode area.
      // On iOS Safari: OMITTING qrbox lets ZXing receive the full video frame without canvas crop coordinates getting misaligned!
      if (!isIOS) {
        qrConfig.qrbox = (w: number, h: number) => {
          const minDim = Math.min(w, h);
          const size = Math.max(Math.floor(minDim * 0.85), 220);
          return { width: size, height: size };
        };
      }

      // Start scanner with fail-safe fallback
      try {
        await html5QrCode.start(cameraConfigToUse, qrConfig, handleScanSuccess, () => {});
      } catch (primaryErr) {
        // Fallback to basic environment facing mode
        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            disableFlip: false,
          },
          handleScanSuccess,
          () => {}
        );
      }

      // 3. Setup video element attributes and continuous playback watchdog
      const setupVideoWatchdog = () => {
        const videoEl = document.querySelector(`#${qrContainerIdRef.current} video`) as HTMLVideoElement;
        if (!videoEl || videoEl.readyState < 2) {
          if (isScanningActiveRef.current) {
            requestAnimationFrame(setupVideoWatchdog);
          }
          return;
        }

        // Apply strict iOS & mobile video attributes
        setupVideoElementAttributes(videoEl);

        // Keep video playing if iOS Safari attempts to pause
        videoEl.addEventListener('pause', () => {
          if (isScanningActiveRef.current && videoEl.paused) {
            videoEl.play().catch(() => {});
          }
        });

        if (videoEl.paused) {
          videoEl.play().catch(() => {});
        }

        // 4. Hardware BarcodeDetector acceleration loop (instant sub-30ms decoding)
        stopNativeDetectorRef.current = startNativeBarcodeDetectorLoop(
          videoEl,
          (decoded) => {
            handleScanSuccess(decoded);
          },
          () => isScanningActiveRef.current
        );
      };

      setupVideoWatchdog();

      // 5. Apply continuous autofocus & check torch capability
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
    } catch (err: any) {
      const parsed = parseCameraError(err);
      setCameraErrorDetails(parsed);
      setIsCameraActive(false);
    }
  };

  const toggleTorch = async () => {
    if (!html5QrcodeRef.current || !torchSupported) return;
    const nextState = !isTorchOn;
    try {
      await html5QrcodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState } as any],
      });
      setIsTorchOn(nextState);
    } catch (_) {}
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

  const switchCamera = async () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex];
    setSelectedCameraId(nextCamera.id);
    await startCamera(nextCamera.id);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-in zoom-in-95">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                <span>{title}</span>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded-md border border-emerald-500/30">
                  Tức thì
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                {excludeLocation ? `Chuyển từ ${excludeLocation} sang vị trí mới` : 'Đưa mã QR kệ vào khung quét'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Gun / Manual Text input */}
        <div className="p-3 bg-slate-950/60 border-b border-slate-800 shrink-0">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                ref={manualInputRef}
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Hoặc bắn súng / gõ mã kệ (A01, B02...) rồi Enter"
                className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white placeholder-slate-400 focus:outline-hidden focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={!manualInput.trim()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0"
            >
              Chọn
            </button>
          </form>
        </div>

        {/* Viewport Area */}
        <div className="p-3 sm:p-4 bg-slate-950 flex flex-col items-center justify-center relative min-h-[300px] flex-1 overflow-y-auto">
          {/* Permission or hardware error */}
          {cameraErrorDetails ? (
            <div className="w-full">
              <CameraPermissionErrorCard
                errorTitle={cameraErrorDetails.title}
                errorMessage={cameraErrorDetails.message}
                isPermissionDenied={cameraErrorDetails.isPermissionDenied}
                onRetry={() => {
                  setCameraErrorDetails(null);
                  startCamera();
                }}
              />
            </div>
          ) : (
            <>
              {/* Camera Switcher & Controls Bar */}
              <div className="w-full max-w-[340px] flex items-center justify-between mb-2 px-1">
                {cameras.length > 1 ? (
                  <div className="flex items-center space-x-1 flex-1 min-w-0 mr-2">
                    <SwitchCamera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <select
                      value={selectedCameraId}
                      onChange={(e) => {
                        setSelectedCameraId(e.target.value);
                        startCamera(e.target.value);
                      }}
                      className="bg-slate-800 text-emerald-300 font-bold text-[11px] py-1 px-2 rounded-lg border border-slate-700 outline-hidden w-full truncate cursor-pointer"
                    >
                      {cameras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.isRear ? `📷 [Camera sau] ${c.label}` : c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="text-[11px] font-bold text-emerald-400 flex items-center space-x-1">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Camera nhạy tức thì</span>
                  </span>
                )}

                <div className="flex items-center space-x-1.5 ml-auto">
                  {focusSupported && (
                    <button
                      type="button"
                      onClick={handleManualRefocus}
                      disabled={isRefocusing}
                      className="p-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer transition-all bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30"
                      title="Chạm để lấy lại nét"
                    >
                      <Focus className={`w-3.5 h-3.5 ${isRefocusing ? 'animate-spin' : ''}`} />
                      <span className="text-[10px] hidden sm:inline">{isRefocusing ? 'Lấy nét...' : 'Nét'}</span>
                    </button>
                  )}

                  {torchSupported && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      className={`p-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer transition-all ${
                        isTorchOn
                          ? 'bg-amber-400 text-slate-950 font-black'
                          : 'bg-slate-800 text-amber-300 border border-amber-500/30'
                      }`}
                      title="Bật/Tắt Đèn Flash"
                    >
                      <Flashlight className="w-3.5 h-3.5" />
                      <span className="text-[10px] hidden sm:inline">{isTorchOn ? 'Tắt' : 'Flash'}</span>
                    </button>
                  )}

                  {cameras.length > 1 && (
                    <button
                      type="button"
                      onClick={switchCamera}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-all cursor-pointer"
                      title="Đổi camera"
                    >
                      <SwitchCamera className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Viewport Frame */}
              <div
                onClick={handleManualRefocus}
                className="w-full max-w-[340px] aspect-square rounded-2xl overflow-hidden bg-black border-2 border-emerald-500/60 relative shadow-inner cursor-crosshair group flex items-center justify-center min-h-[260px] sm:min-h-[280px]"
                title="Chạm màn hình để lấy lại nét"
              >
                <div id={qrContainerIdRef.current} className="w-full h-full min-h-[260px] sm:min-h-[280px]" />

                {/* Reticle Target Frame */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                  <div className="w-56 h-56 border-2 border-emerald-400/60 rounded-2xl relative shadow-2xl flex items-center justify-center">
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl"></div>
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl"></div>
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl"></div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl"></div>
                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse shadow-lg shadow-emerald-400/50"></div>
                  </div>
                </div>

                {/* Tap to focus hint badge */}
                <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-xs text-[10px] text-slate-300 px-2 py-0.5 rounded-md border border-slate-700 pointer-events-none">
                  💡 Chạm màn hình để lấy nét
                </div>
              </div>
            </>
          )}

          {/* Scanned Result Banner */}
          {scannedResult && (
            <div className="mt-3 p-3 bg-emerald-500/20 border border-emerald-500/50 rounded-2xl text-emerald-300 text-xs flex items-center justify-between w-full max-w-[340px] animate-in zoom-in-95 duration-150">
              <div className="flex items-center space-x-2 min-w-0 pr-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-[10px] uppercase font-bold text-emerald-400">Đã nhận diện kệ:</p>
                  <p className="text-base font-black text-white font-mono">{scannedResult}</p>
                  {matchedLoc?.description && (
                    <p className="text-[11px] text-slate-300 truncate">{matchedLoc.description}</p>
                  )}
                </div>
              </div>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                Áp dụng ngay...
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 text-xs flex items-center justify-between text-slate-400 shrink-0">
          <span className="text-[11px]">
            ⚡ Hỗ trợ tất cả tem QR Kệ kho (Android & iPhone).
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
