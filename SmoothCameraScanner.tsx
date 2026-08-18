import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, Flashlight, SwitchCamera, QrCode, CheckCircle2, RotateCcw, AlertCircle } from 'lucide-react';
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
  placeholderText = 'Căn mã QR / Barcode vào khung hình camera...',
  autoCloseOnScan = true,
}) => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [showSuccessBadge, setShowSuccessBadge] = useState(false);

  const containerIdRef = useRef<string>(`smooth-qr-reader-${Math.random().toString(36).substring(2, 8)}`);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);

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

  const triggerVibration = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([100, 50, 100]);
      } catch (e) {}
    }
  };

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

  const startCamera = async (camId?: string) => {
    setCameraError(null);
    setIsTorchOn(false);

    try {
      await stopCamera();
      setIsCameraActive(true);

      const devices = await Html5Qrcode.getCameras().catch(() => []);
      let activeCamId = camId || selectedCameraId;

      if (devices && devices.length > 0) {
        setCameras(devices.map((d, i) => ({ id: d.id, label: d.label || `Camera ${i + 1}` })));
        if (!activeCamId) {
          // Smart selection: Filter for back/rear main camera, avoid 0.5x ultra-wide or macro
          const backCams = devices.filter((d) => {
            const l = d.label.toLowerCase();
            return l.includes('back') || l.includes('rear') || l.includes('sau') || l.includes('environment') || l.includes('0');
          });

          const mainBackCam = backCams.find((d) => {
            const l = d.label.toLowerCase();
            return !l.includes('wide') && !l.includes('ultra') && !l.includes('0.5') && !l.includes('macro') && !l.includes('telephoto');
          }) || backCams[0] || devices[devices.length - 1];

          activeCamId = mainBackCam.id;
          setSelectedCameraId(mainBackCam.id);
        }
      }

      const html5QrCode = new Html5Qrcode(containerIdRef.current);
      html5QrCodeRef.current = html5QrCode;

      const onScanSuccessCallback = (decodedText: string) => {
        const now = Date.now();
        if (now - lastScanTimeRef.current < 500) {
          return; // Throttle repeat scans
        }
        lastScanTimeRef.current = now;

        playBeepSound();
        triggerVibration();

        setLastScannedCode(decodedText);
        setShowSuccessBadge(true);

        // 1. Synchronously stop camera media tracks IMMEDIATELY so camera shuts down instantly on mobile
        if (html5QrCodeRef.current) {
          try {
            const stream = (html5QrCodeRef.current as any).mediaStream as MediaStream;
            if (stream) {
              stream.getTracks().forEach((track) => {
                try { track.stop(); } catch (e) {}
              });
            }
            if (html5QrCodeRef.current.isScanning) {
              html5QrCodeRef.current.stop().catch(() => {});
            }
            html5QrCodeRef.current.clear();
          } catch (e) {
            console.warn('Instant stop camera stream error:', e);
          }
          html5QrCodeRef.current = null;
        }

        setIsCameraActive(false);
        setIsTorchOn(false);

        // 2. Trigger scan success callback which opens modal immediately
        onScanSuccess(decodedText);

        // 3. Auto close container if required
        if (autoCloseOnScan && onClose) {
          onClose();
        }
      };

      const qrConfig = {
        fps: 30,
        qrbox: (w: number, h: number) => {
          const minEdge = Math.min(w, h);
          return {
            width: Math.max(Math.floor(minEdge * 0.88), 240),
            height: Math.max(Math.floor(minEdge * 0.75), 200),
          };
        },
        aspectRatio: 1.333333,
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

      if (activeCamId) {
        await html5QrCode.start(activeCamId, qrConfig, onScanSuccessCallback, () => {});
      } else {
        await html5QrCode.start({ facingMode: 'environment' }, qrConfig, onScanSuccessCallback, () => {});
      }

      // Check flashlight support
      try {
        const stream = (html5QrCode as any).mediaStream as MediaStream;
        if (stream && stream.getVideoTracks()[0]?.getCapabilities) {
          const caps = stream.getVideoTracks()[0].getCapabilities() as any;
          if (caps?.torch) setTorchSupported(true);
        }
      } catch (e) {}

    } catch (err: any) {
      console.error('SmoothCameraScanner error:', err);
      // Fallback attempt with environment facing mode
      try {
        if (html5QrCodeRef.current) {
          await html5QrCodeRef.current.start(
            { facingMode: 'environment' },
            { fps: 25 },
            (text) => {
              playBeepSound();
              triggerVibration();
              onScanSuccess(text);
              if (autoCloseOnScan) {
                stopCamera();
                if (onClose) onClose();
              }
            },
            () => {}
          );
          return;
        }
      } catch (e2) {}

      setCameraError('Không thể mở Camera. Vui lòng kiểm tra quyền truy cập camera trên thiết bị/trình duyệt.');
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      startCamera();
    }, 150);

    return () => {
      clearTimeout(timer);
      stopCamera();
    };
  }, []);

  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !html5QrCodeRef.current.isScanning) return;
    const nextState = !isTorchOn;

    try {
      await html5QrCodeRef.current.applyVideoConstraints({ advanced: [{ torch: nextState } as any] });
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn('Torch failed:', err);
    }
  };

  return (
    <div className="bg-slate-950 text-white p-3.5 sm:p-4 rounded-2xl border-2 border-blue-500 shadow-2xl space-y-3 animate-in fade-in duration-200">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg animate-pulse">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-extrabold text-xs text-white uppercase tracking-wide flex items-center space-x-1.5">
              <span>CAMERA QUÉT QR SIÊU NÉT</span>
            </h4>
            <p className="text-[11px] text-blue-300 font-medium">
              {placeholderText}
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
              <span>Ẩn Camera</span>
            </button>
          )}
        </div>
      </div>

      {/* Camera Devices Dropdown if multiple cameras detected */}
      {cameras.length > 1 && (
        <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
          <SwitchCamera className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="text-[11px] font-bold text-slate-300 shrink-0">Đổi Camera:</span>
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
            <span className="truncate">Đã quét thành công: {lastScannedCode}</span>
          </div>
        </div>
      )}

      {/* Camera Error view */}
      {cameraError ? (
        <div className="p-4 bg-rose-950/80 border border-rose-600 rounded-xl text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
          <p className="text-xs font-bold text-rose-200">{cameraError}</p>
          <button
            type="button"
            onClick={() => startCamera()}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 mx-auto cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Thử lại Mở Camera</span>
          </button>
        </div>
      ) : (
        /* Video Container */
        <div className="relative w-full rounded-xl overflow-hidden bg-black min-h-[250px] max-h-[360px] flex items-center justify-center border border-slate-800 shadow-inner">
          <div id={containerIdRef.current} className="w-full h-full min-h-[250px]"></div>

          {/* Reticle Frame Overlay */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
            <div className="w-56 h-48 border-2 border-blue-400 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-400 -mt-1 -ml-1 rounded-tl-lg"></div>
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-400 -mt-1 -mr-1 rounded-tr-lg"></div>
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-400 -mb-1 -ml-1 rounded-bl-lg"></div>
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-400 -mb-1 -mr-1 rounded-br-lg"></div>
              <div className="w-full h-0.5 bg-blue-400/80 absolute top-1/2 -translate-y-1/2 shadow-[0_0_8px_#60a5fa] animate-pulse"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
