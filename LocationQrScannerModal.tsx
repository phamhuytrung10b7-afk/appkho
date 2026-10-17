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

interface LocationQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLocation?: (locationName: string) => void;
  onLocationDetected?: (location: WarehouseLocation) => void;
  locations?: WarehouseLocation[];
  title?: string;
  excludeLocation?: string;
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
  const qrContainerId = 'location-qr-scanner-viewport';

  useEffect(() => {
    if (isOpen) {
      setScannedResult(null);
      setMatchedLoc(null);
      setCameraErrorDetails(null);
      setTimeout(() => {
        initCamera();
      }, 200);
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
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
          await html5QrcodeRef.current.stop();
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
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  };

  const handleScanSuccess = (decodedText: string) => {
    if (!isScanningActiveRef.current) return;
    const raw = decodedText.trim();
    if (!raw) return;

    let shelfName = raw;
    if (raw.startsWith('LOC:')) {
      shelfName = raw.replace('LOC:', '').trim();
    } else if (raw.startsWith('{') && raw.endsWith('}')) {
      try {
        const parsed = JSON.parse(raw);
        shelfName = parsed.location || parsed.name || parsed.shelf || raw;
      } catch {}
    }

    if (excludeLocation && shelfName.toLowerCase() === excludeLocation.toLowerCase()) {
      setCameraErrorDetails({
        title: 'Vị trí trùng lặp',
        message: `Vị trí "${shelfName}" trùng với vị trí xuất phát hiện tại. Vui lòng quét vị trí khác!`,
        isPermissionDenied: false,
      });
      return;
    }

    playBeepSound();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([100, 50, 100]);
      } catch (e) {}
    }

    setScannedResult(shelfName);

    const found = locations.find((l) => l.name.toLowerCase() === shelfName.toLowerCase());
    if (found) {
      setMatchedLoc(found);
    }

    stopCamera();

    setTimeout(() => {
      try {
        if (onSelectLocation) {
          onSelectLocation(shelfName);
        }
        if (onLocationDetected) {
          onLocationDetected(found || { id: shelfName, name: shelfName });
        }
      } catch (_) {}
      onClose();
    }, 500);
  };

  const initCamera = async () => {
    setCameraErrorDetails(null);
    try {
      // 1. Probe permission with rear camera
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const testStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
          });
          testStream.getTracks().forEach((t) => t.stop());
        } catch (permErr: any) {
          const parsed = parseCameraError(permErr);
          setCameraErrorDetails(parsed);
          return;
        }
      }

      const rawDevices = await Html5Qrcode.getCameras().catch(() => []);
      const sorted = sortAndFilterCameras(rawDevices);
      setCameras(sorted);

      const chosenId = sorted.length > 0 ? sorted[0].id : undefined;
      if (chosenId) {
        setSelectedCameraId(chosenId);
      }

      await startScanner(chosenId);
    } catch (err: any) {
      const parsed = parseCameraError(err);
      setCameraErrorDetails(parsed);
    }
  };

  const startScanner = async (cameraId?: string) => {
    try {
      await stopCamera();
      setIsCameraActive(true);
      isScanningActiveRef.current = true;

      const html5QrCode = new Html5Qrcode(qrContainerId);
      html5QrcodeRef.current = html5QrCode;

      const videoConstraints = getOptimizedVideoConstraints(cameraId);

      const qrConfig = {
        fps: 30,
        qrbox: (w: number, h: number) => {
          const minDim = Math.min(w, h);
          const size = Math.max(Math.floor(minDim * 0.82), 220);
          return { width: size, height: size };
        },
        videoConstraints,
        disableFlip: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        formatsToSupport: STANDARD_SCANNER_FORMATS,
      };

      if (cameraId) {
        try {
          await html5QrCode.start(cameraId, qrConfig, handleScanSuccess, () => {});
        } catch (camErr) {
          await html5QrCode.start({ facingMode: 'environment' }, qrConfig, handleScanSuccess, () => {});
        }
      } else {
        await html5QrCode.start({ facingMode: 'environment' }, qrConfig, handleScanSuccess, () => {});
      }

      // Apply focus & torch capabilities
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

      // Native hardware BarcodeDetector loop for Android Chrome
      const pollForVideoEl = () => {
        const videoEl = document.querySelector(`#${qrContainerId} video`) as HTMLVideoElement;
        if (!videoEl || videoEl.readyState < 2) {
          if (isScanningActiveRef.current) {
            requestAnimationFrame(pollForVideoEl);
          }
          return;
        }

        stopNativeDetectorRef.current = startNativeBarcodeDetectorLoop(
          videoEl,
          (decoded) => {
            handleScanSuccess(decoded);
          },
          () => isScanningActiveRef.current
        );
      };
      pollForVideoEl();

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
    await startScanner(nextCamera.id);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 text-white">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">{title}</h3>
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

        {/* Viewport Area */}
        <div className="p-4 bg-slate-950 flex flex-col items-center justify-center relative min-h-[300px]">
          {/* Permission or hardware error */}
          {cameraErrorDetails ? (
            <div className="w-full">
              <CameraPermissionErrorCard
                errorTitle={cameraErrorDetails.title}
                errorMessage={cameraErrorDetails.message}
                isPermissionDenied={cameraErrorDetails.isPermissionDenied}
                onRetry={() => {
                  setCameraErrorDetails(null);
                  initCamera();
                }}
              />
            </div>
          ) : (
            <>
              {/* Camera Viewport Element with Tap-To-Focus */}
              <div
                onClick={handleManualRefocus}
                className="w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden bg-slate-900 border-2 border-emerald-500/60 relative shadow-inner cursor-crosshair group flex items-center justify-center"
                title="Chạm màn hình để lấy lại nét"
              >
                <div id={qrContainerId} className="w-full h-full" />

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

              {/* Flashlight & Camera Controls */}
              {isCameraActive && (
                <div className="absolute top-6 right-6 flex items-center space-x-2 z-10">
                  {focusSupported && (
                    <button
                      onClick={handleManualRefocus}
                      disabled={isRefocusing}
                      className="p-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-emerald-300 backdrop-blur-md transition-all cursor-pointer"
                      title="Lấy lại nét"
                    >
                      <Focus className={`w-4 h-4 ${isRefocusing ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  {torchSupported && (
                    <button
                      onClick={toggleTorch}
                      className={`p-2.5 rounded-xl border backdrop-blur-md transition-all cursor-pointer ${
                        isTorchOn
                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-lg shadow-amber-400/30'
                          : 'bg-slate-800/80 text-slate-200 border-slate-700'
                      }`}
                      title="Bật/Tắt Đèn Flash"
                    >
                      <Flashlight className="w-4 h-4" />
                    </button>
                  )}
                  {cameras.length > 1 && (
                    <button
                      onClick={switchCamera}
                      className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 backdrop-blur-md transition-all cursor-pointer"
                      title="Đổi Camera Sau / Trước"
                    >
                      <SwitchCamera className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Scanned Result Banner */}
          {scannedResult && (
            <div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-500/50 rounded-2xl text-emerald-300 text-xs flex items-center justify-between w-full max-w-sm animate-in zoom-in-95 duration-150">
              <div className="flex items-center space-x-2 min-w-0 pr-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-[10px] uppercase font-bold text-emerald-400">Đã nhận diện vị trí:</p>
                  <p className="text-base font-black text-white font-mono">{scannedResult}</p>
                  {matchedLoc?.description && (
                    <p className="text-[11px] text-slate-300 truncate">{matchedLoc.description}</p>
                  )}
                </div>
              </div>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                Đang áp dụng...
              </span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 text-xs flex items-center justify-between text-slate-400">
          <span className="text-[11px]">
            💡 Hướng camera sau vào mã QR dán trên kệ kho.
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
