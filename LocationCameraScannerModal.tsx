import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, Flashlight, X, RefreshCw, AlertCircle, SwitchCamera, CheckCircle2 } from 'lucide-react';

interface LocationCameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (scannedText: string) => void;
  title?: string;
  hintText?: string;
}

export const LocationCameraScannerModal: React.FC<LocationCameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  title = 'Quét Mã QR / Barcode Vị Trí Kệ',
  hintText = 'Căn giữa mã QR hoặc Barcode vị trí kệ vào khung hình để tự động nhận diện',
}) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const containerIdRef = useRef(`loc-cam-reader-${Math.random().toString(36).substring(2, 9)}`);

  // Detect camera devices when opened
  useEffect(() => {
    if (isOpen) {
      Html5Qrcode.getCameras()
        .then((devices) => {
          if (devices && devices.length > 0) {
            const formatted = devices.map((d, index) => ({
              id: d.id,
              label: d.label || `Camera ${index + 1}`,
            }));
            setCameras(formatted);

            // Prioritize main rear/back camera (avoid ultra-wide or front)
            const backCam = devices.find((d) => {
              const lbl = d.label.toLowerCase();
              return (
                (lbl.includes('back') || lbl.includes('rear') || lbl.includes('sau') || lbl.includes('environment')) &&
                !lbl.includes('wide') &&
                !lbl.includes('ultra') &&
                !lbl.includes('0.5') &&
                !lbl.includes('front')
              );
            }) || devices.find((d) => {
              const lbl = d.label.toLowerCase();
              return lbl.includes('back') || lbl.includes('rear') || lbl.includes('sau') || lbl.includes('environment');
            }) || devices[devices.length - 1];

            setSelectedCameraId(backCam.id);
          }
        })
        .catch((err) => {
          console.warn('Could not enumerate cameras:', err);
        });

      const timer = setTimeout(() => {
        startCamera();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      stopCamera();
    }
  }, [isOpen]);

  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (e) {
        console.warn('Error stopping camera:', e);
      }
      html5QrCodeRef.current = null;
    }
    setIsTorchOn(false);
    setTorchSupported(false);
  };

  const handleClose = async () => {
    await stopCamera();
    onClose();
  };

  const startCamera = async (overrideCamId?: string) => {
    setIsInitializing(true);
    setErrorMsg(null);
    setIsTorchOn(false);

    try {
      await stopCamera();

      const html5QrCode = new Html5Qrcode(containerIdRef.current);
      html5QrCodeRef.current = html5QrCode;

      const handleSuccess = async (decodedText: string) => {
        if (!decodedText || !decodedText.trim()) return;

        // 1. Tactile Vibration Feedback
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(200);
          } catch (e) {
            // ignore
          }
        }

        // 2. Play Beep Audio
        try {
          const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContext) {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
          }
        } catch (e) {
          // ignore
        }

        let cleanText = decodedText.trim();
        if (cleanText.includes('|')) {
          const parts = cleanText.split('|');
          cleanText = parts[parts.length - 1].trim();
        }

        // 3. Stop camera immediately to conserve battery and prevent lag, then trigger callback
        await stopCamera();
        onScanSuccess(cleanText);
        onClose();
      };

      // Support ALL 1D and 2D barcode formats for small or custom QR tags
      const qrConfig = {
        fps: 30, // High frame rate for fast detection
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          // Standard rectangular/square scan box optimized for small QR / Barcode
          const width = Math.max(Math.floor(minEdge * 0.85), 220);
          const height = Math.max(Math.floor(minEdge * 0.70), 180);
          return { width, height };
        },
        aspectRatio: 1.0,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true, // Native GPU/Browser BarcodeDetector API
        },
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

      const targetCam = overrideCamId || selectedCameraId;

      if (targetCam) {
        await html5QrCode.start(targetCam, qrConfig, handleSuccess, () => {});
      } else {
        await html5QrCode.start({ facingMode: 'environment' }, qrConfig, handleSuccess, () => {});
      }

      setIsInitializing(false);

      // Check flashlight support
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities();
        if (capabilities && (capabilities as any).torch !== undefined) {
          setTorchSupported(true);
        } else {
          const stream = (html5QrCode as any).mediaStream as MediaStream;
          if (stream) {
            const track = stream.getVideoTracks()[0];
            const caps = track?.getCapabilities?.() as any;
            if (caps?.torch) {
              setTorchSupported(true);
            }
          }
        }
      } catch (e) {
        setTorchSupported(false);
      }
    } catch (err: any) {
      console.error('Camera start error:', err);
      // Retry with simple constraints if initial high-res failed
      try {
        if (html5QrCodeRef.current) {
          await html5QrCodeRef.current.start(
            { facingMode: 'environment' },
            { fps: 25 },
            (text) => {
              onScanSuccess(text);
              stopCamera();
              onClose();
            },
            () => {}
          );
          setIsInitializing(false);
          return;
        }
      } catch (retryErr) {
        console.error('Retry failed:', retryErr);
      }

      setIsInitializing(false);
      setErrorMsg('Không thể mở Camera. Vui lòng cho phép quyền sử dụng Camera trên trình duyệt.');
    }
  };

  const handleSwitchCamera = (camId: string) => {
    setSelectedCameraId(camId);
    startCamera(camId);
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
      try {
        const stream = (html5QrCodeRef.current as any).mediaStream as MediaStream;
        if (stream) {
          const track = stream.getVideoTracks()[0];
          if (track) {
            await track.applyConstraints({
              advanced: [{ torch: nextState } as any],
            });
            setIsTorchOn(nextState);
          }
        }
      } catch (e) {
        console.warn('Torch toggle failed:', e);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 text-white rounded-3xl shadow-2xl border border-slate-700/80 overflow-hidden flex flex-col my-auto">
        
        {/* Header */}
        <div className="p-4 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-white">{title}</h3>
              <p className="text-[11px] text-slate-300">Tự động lấy nét QR & Barcode 1D/2D</p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-all cursor-pointer"
            title="Đóng camera"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Selector Dropdown (If multiple back cameras exist) */}
        {cameras.length > 1 && (
          <div className="px-4 py-2 bg-slate-800/60 border-b border-slate-700/60 flex items-center space-x-2">
            <SwitchCamera className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-[11px] font-bold text-slate-300 shrink-0">Chọn Camera:</span>
            <select
              value={selectedCameraId}
              onChange={(e) => handleSwitchCamera(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-xs text-emerald-300 font-semibold focus:ring-1 focus:ring-emerald-400 outline-none"
            >
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Camera Container Area */}
        <div className="relative bg-black min-h-[300px] flex items-center justify-center overflow-hidden">
          {/* HTML5 QR CODE ELEMENT */}
          <div id={containerIdRef.current} className="w-full h-full min-h-[300px]"></div>

          {/* Loading spinner */}
          {isInitializing && !errorMsg && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center space-y-3 z-10">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
              <p className="text-xs font-bold text-slate-200">Đang khởi động Camera độ nét cao...</p>
            </div>
          )}

          {/* Error Message Display */}
          {errorMsg && (
            <div className="absolute inset-0 bg-slate-900/95 p-6 flex flex-col items-center justify-center text-center space-y-4 z-20">
              <AlertCircle className="w-12 h-12 text-rose-500" />
              <p className="text-xs text-rose-200 font-semibold leading-relaxed max-w-xs">{errorMsg}</p>
              <button
                onClick={() => startCamera()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-xl shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Thử Khởi Động Lại Camera</span>
              </button>
            </div>
          )}
        </div>

        {/* Toolbar & Hints */}
        <div className="p-4 bg-slate-800/90 border-t border-slate-700/80 space-y-3">
          <p className="text-xs text-center text-emerald-300 font-medium flex items-center justify-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block shrink-0"></span>
            <span>{hintText}</span>
          </p>

          <div className="flex items-center justify-between gap-2 pt-1">
            {/* Flashlight / Torch Toggle Button */}
            <button
              type="button"
              onClick={toggleTorch}
              disabled={!torchSupported || isInitializing}
              className={`flex-1 py-2.5 px-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center space-x-2 border cursor-pointer ${
                isTorchOn
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-lg shadow-amber-400/20'
                  : torchSupported
                  ? 'bg-slate-700/80 hover:bg-slate-700 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-500 border-slate-700/50 cursor-not-allowed opacity-60'
              }`}
            >
              <Flashlight className={`w-4 h-4 ${isTorchOn ? 'fill-slate-950 text-slate-950' : 'text-amber-400'}`} />
              <span>{isTorchOn ? 'TẮT ĐÈN FLASH' : torchSupported ? 'BẬT ĐÈN FLASH' : 'ĐÈN FLASH (N/A)'}</span>
            </button>

            {/* Cancel / Close Button */}
            <button
              type="button"
              onClick={handleClose}
              className="py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-600"
            >
              Hủy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

