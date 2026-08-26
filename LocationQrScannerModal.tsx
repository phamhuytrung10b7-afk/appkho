import React, { useState, useEffect, useRef } from 'react';
import { WarehouseLocation } from './types';
import { QrCode, X, Camera, Zap, CheckCircle2, AlertCircle, MapPin, Flashlight, SwitchCamera } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface LocationQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLocation: (locationName: string) => void;
  locations?: WarehouseLocation[];
  title?: string;
  excludeLocation?: string; // e.g. cannot transfer to the same shelf
}

export const LocationQrScannerModal: React.FC<LocationQrScannerModalProps> = ({
  isOpen,
  onClose,
  onSelectLocation,
  locations = [],
  title = 'Quét Mã QR Vị Trí / Kệ Kho',
  excludeLocation,
}) => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [matchedLoc, setMatchedLoc] = useState<WarehouseLocation | null>(null);

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const qrContainerId = 'location-qr-scanner-viewport';

  useEffect(() => {
    if (isOpen) {
      setScannedResult(null);
      setMatchedLoc(null);
      setCameraError(null);
      setTimeout(() => {
        initCamera();
      }, 300);
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const stopCamera = async () => {
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
      } catch (e) {
        console.warn('Error stopping scanner:', e);
      }
      html5QrcodeRef.current = null;
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
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // Audio ignore
    }
  };

  const handleScanSuccess = (decodedText: string) => {
    const raw = decodedText.trim();
    if (!raw) return;

    // Parse raw shelf name
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
      setCameraError(`Vị trí "${shelfName}" trùng với vị trí xuất phát hiện tại. Vui lòng quét vị trí khác!`);
      return;
    }

    playBeepSound();
    setScannedResult(shelfName);

    const found = locations.find((l) => l.name.toLowerCase() === shelfName.toLowerCase());
    if (found) {
      setMatchedLoc(found);
    }

    // Auto accept after a brief visual confirmation
    setTimeout(() => {
      onSelectLocation(shelfName);
      onClose();
    }, 600);
  };

  const initCamera = async () => {
    setCameraError(null);
    try {
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        setCameraError('Không tìm thấy Camera trên thiết bị này.');
        return;
      }

      setCameras(devices);
      let backCam = devices.find(
        (d) =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('sau') ||
          d.label.toLowerCase().includes('environment')
      );
      const chosenId = backCam ? backCam.id : devices[0].id;
      setSelectedCameraId(chosenId);

      await startScanner(chosenId);
    } catch (err: any) {
      console.error('Camera init error:', err);
      setCameraError('Không thể truy cập camera. Vui lòng cấp quyền camera trong trình duyệt.');
    }
  };

  const startScanner = async (cameraId: string) => {
    try {
      if (html5QrcodeRef.current) {
        await stopCamera();
      }

      const html5QrCode = new Html5Qrcode(qrContainerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
        ],
        verbose: false,
      });

      html5QrcodeRef.current = html5QrCode;

      await html5QrCode.start(
        cameraId,
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        () => {
          // ignore scan frame misses
        }
      );

      setIsCameraActive(true);

      // Check flashlight support
      try {
        const stream = (html5QrCode as any).mediaStream as MediaStream;
        if (stream) {
          const track = stream.getVideoTracks()[0];
          const caps = (track.getCapabilities && track.getCapabilities()) as any;
          if (caps && caps.torch) {
            setTorchSupported(true);
          }
        }
      } catch (e) {
        setTorchSupported(false);
      }
    } catch (err: any) {
      console.error('Start scanner error:', err);
      setCameraError('Lỗi khởi động camera: ' + (err.message || 'Vui lòng kiểm tra quyền thiết bị'));
      setIsCameraActive(false);
    }
  };

  const toggleTorch = async () => {
    if (!html5QrcodeRef.current || !torchSupported) return;
    try {
      const stream = (html5QrcodeRef.current as any).mediaStream as MediaStream;
      if (stream) {
        const track = stream.getVideoTracks()[0];
        const nextState = !isTorchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState } as any],
        });
        setIsTorchOn(nextState);
      }
    } catch (e) {
      console.error('Torch toggle error:', e);
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
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
          {/* Camera Viewport Element */}
          <div
            id={qrContainerId}
            className="w-full max-w-[280px] aspect-square rounded-2xl overflow-hidden bg-slate-900 border-2 border-emerald-500/50 relative shadow-inner"
          />

          {/* Flashlight & Camera Controls */}
          {isCameraActive && (
            <div className="absolute top-6 right-6 flex items-center space-x-2 z-10">
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
                  title="Đổi Camera"
                >
                  <SwitchCamera className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Camera Error */}
          {cameraError && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center space-x-2 w-full max-w-sm">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{cameraError}</span>
            </div>
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

        {/* Modal Footer: Manual Selection Fallback */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 text-xs flex items-center justify-between text-slate-400">
          <span className="text-[11px]">
            💡 Hướng camera vào tem nhãn QR dán trên khoang/kệ kho.
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
