/**
 * cameraScannerUtils.ts
 * Unified utilities for mobile camera QR & Barcode scanning on iOS and Android.
 * - Prioritizes Rear / Environment camera.
 * - Requests Full HD / HD resolution with continuous auto-focus constraints.
 * - Hardware BarcodeDetector acceleration for Android Chrome (instant decoding).
 * - Comprehensive permission and hardware error handling with clear user guidance.
 */

import { Html5QrcodeSupportedFormats } from 'html5-qrcode';
import jsQR from 'jsqr';

export interface CameraDeviceInfo {
  id: string;
  label: string;
  isRear: boolean;
}

/**
 * Prioritizes rear/back cameras and filters out ultra-wide/macro if a standard 1x camera is available.
 */
export function getCameraScore(label: string, isRear: boolean): number {
  if (!isRear) return -100; // Front cameras lowest priority
  const l = (label || '').toLowerCase();

  // 1. Demote Ultra-wide (0.5x, fixed focus at close range on many devices)
  const isUltraWide =
    l.includes('cực rộng') ||
    l.includes('cuc rong') ||
    l.includes('ultra') ||
    l.includes('0.5') ||
    l.includes('0,5');

  // 2. Demote Telephoto / Zoom (3x, 5x, 10x)
  const isTelephoto =
    l.includes('chụp xa') ||
    l.includes('chup xa') ||
    l.includes('tele') ||
    l.includes('zoom') ||
    l.includes('3x') ||
    l.includes('5x');

  if (isUltraWide) return 10;
  if (isTelephoto) return 20;

  // 3. High priority for 1x Primary Wide Camera with Auto-focus:
  // "Camera góc rộng mặt sau" (iOS Vietnamese 1x autofocus main camera)
  // "Back Wide Camera" (iOS English 1x autofocus main camera)
  // "Back Camera" / "Camera sau"
  // "camera 0" (Android primary back camera)
  // "main" / "chính"
  const isPrimary =
    l.includes('góc rộng') ||
    l.includes('goc rong') ||
    (l.includes('wide') && !isUltraWide) ||
    l.includes('main') ||
    l.includes('chính') ||
    l.includes('chinh') ||
    l.includes('camera 0') ||
    l.includes('camera 1') ||
    l.includes('back camera 1');

  if (isPrimary) return 100;

  // Standard rear camera fallback
  return 50;
}

export function sortAndFilterCameras(devices: Array<{ id: string; label: string }>): CameraDeviceInfo[] {
  if (!devices || devices.length === 0) return [];

  const mapped: CameraDeviceInfo[] = devices.map((d, index) => {
    const lbl = (d.label || '').toLowerCase();
    const isFront = lbl.includes('front') || lbl.includes('trước') || lbl.includes('user') || lbl.includes('selfie');
    const isRear =
      !isFront &&
      (lbl.includes('back') ||
        lbl.includes('rear') ||
        lbl.includes('sau') ||
        lbl.includes('environment') ||
        lbl.includes('camera 0') ||
        devices.length === 1);

    return {
      id: d.id,
      label: d.label || (isRear ? `Camera sau (${index + 1})` : `Camera ${index + 1}`),
      isRear,
    };
  });

  // Sort so 1x primary autofocus rear camera is guaranteed to be #1
  return mapped.sort((a, b) => {
    const scoreA = getCameraScore(a.label, a.isRear);
    const scoreB = getCameraScore(b.label, b.isRear);
    return scoreB - scoreA;
  });
}

/**
 * Detects iOS devices (iPhone, iPad, iPod) and iPadOS on Safari/WebKit
 */
export function isIOSDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    Boolean((window as any).MSStream)
  );
}

/**
 * Returns optimized video track constraints for high-resolution & continuous autofocus.
 * Tailored specifically for iOS WebKit vs Android Chrome.
 */
export function getOptimizedVideoConstraints(deviceId?: string): MediaTrackConstraints {
  const isIOS = isIOSDevice();

  if (isIOS) {
    // Ultra-compatible iOS WebKit constraints
    // NEVER use 'min' bounds on iOS Safari in portrait mode (triggers OverconstrainedError)
    // NEVER use advanced focus constraints inside getUserMedia on iOS WebKit
    const iosConstraints: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    };

    if (deviceId) {
      iosConstraints.deviceId = { ideal: deviceId };
    } else {
      iosConstraints.facingMode = { ideal: 'environment' };
    }
    return iosConstraints;
  }

  // Android & Desktop constraints
  const baseConstraints: MediaTrackConstraints = {
    width: { ideal: 1920, max: 2560 },
    height: { ideal: 1080, max: 1440 },
    frameRate: { ideal: 30, max: 60 },
  };

  if (deviceId) {
    baseConstraints.deviceId = { exact: deviceId };
  } else {
    baseConstraints.facingMode = { ideal: 'environment' };
  }

  // Advanced mobile focus constraints for Android Chrome & mobile web
  (baseConstraints as any).advanced = [
    { focusMode: 'continuous' },
    { exposureMode: 'continuous' },
    { whiteBalanceMode: 'continuous' },
  ];

  return baseConstraints;
}

/**
 * Dynamically applies continuous autofocus, exposure, and zoom if supported by the active camera track
 */
export async function applyTrackFocusAndCapabilities(stream?: MediaStream): Promise<boolean> {
  if (!stream) return false;
  const track = stream.getVideoTracks()[0];
  if (!track) return false;

  try {
    const caps = track.getCapabilities ? (track.getCapabilities() as any) : {};
    const advanced: any[] = [];

    if (caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
      advanced.push({ focusMode: 'continuous' });
    }
    if (caps.exposureMode && Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) {
      advanced.push({ exposureMode: 'continuous' });
    }
    if (caps.whiteBalanceMode && Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) {
      advanced.push({ whiteBalanceMode: 'continuous' });
    }

    if (advanced.length > 0) {
      await track.applyConstraints({ advanced });
      return true;
    }
  } catch (err) {
    // Some browsers ignore advanced constraints; silent catch
  }
  return false;
}

/**
 * Manual re-focus / tap-to-focus helper for mobile cameras
 */
export async function triggerManualFocus(stream?: MediaStream): Promise<void> {
  if (!stream) return;
  const track = stream.getVideoTracks()[0];
  if (!track || !track.applyConstraints) return;

  try {
    const caps = track.getCapabilities ? (track.getCapabilities() as any) : {};
    if (caps.focusMode && caps.focusMode.includes('continuous')) {
      // Cycle focus to force refocusing
      await track.applyConstraints({ advanced: [{ focusMode: 'auto' }] } as any).catch(() => {});
      setTimeout(async () => {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as any).catch(() => {});
      }, 150);
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Standard formats for high-accuracy industrial QR and barcodes
 */
export const STANDARD_SCANNER_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.PDF_417,
];

/**
 * Fast scanner formats for mobile WebKit (iOS) to prevent CPU thread choking
 */
export const FAST_SCANNER_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

/**
 * Configure video element attributes critical for iOS Safari video playback and canvas frame grabbing
 */
export function setupVideoElementAttributes(videoEl: HTMLVideoElement | null) {
  if (!videoEl) return;
  try {
    videoEl.setAttribute('playsinline', 'true');
    videoEl.setAttribute('webkit-playsinline', 'true');
    videoEl.setAttribute('x5-playsinline', 'true');
    videoEl.setAttribute('muted', 'true');
    videoEl.setAttribute('autoplay', 'true');
    videoEl.setAttribute('disablePictureInPicture', 'true');
    videoEl.setAttribute('controlslist', 'nodownload nofullscreen noremoteplayback');
    videoEl.playsInline = true;
    (videoEl as any).webkitPlaysInline = true;
    videoEl.muted = true;
    videoEl.autoplay = true;
    videoEl.controls = false;
    videoEl.removeAttribute('controls');
    videoEl.style.pointerEvents = 'none';
    videoEl.style.width = '100%';
    videoEl.style.height = 'auto';
    videoEl.style.maxHeight = '100%';
    videoEl.style.objectFit = 'contain';

    videoEl.addEventListener('webkitbeginfullscreen', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    if (videoEl.paused) {
      videoEl.play().catch(() => {});
    }
  } catch (e) {
    // Ignore video attribute setup errors
  }
}

/**
 * Monkey-patches document.createElement to ensure all video elements are created
 * with strict iOS WebKit inline playback attributes BEFORE srcObject is assigned.
 * This completely prevents iOS Safari from opening the native AVPlayer fullscreen overlay.
 */
export function ensureIosVideoInlinePatch() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if ((window as any).__ios_video_inline_patched) return;
  (window as any).__ios_video_inline_patched = true;

  try {
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = function (tagName: string, options?: any) {
      const el = originalCreateElement(tagName, options);
      if (tagName && tagName.toLowerCase() === 'video') {
        const v = el as HTMLVideoElement;
        v.setAttribute('playsinline', 'true');
        v.setAttribute('webkit-playsinline', 'true');
        v.setAttribute('x5-playsinline', 'true');
        v.setAttribute('muted', 'true');
        v.setAttribute('autoplay', 'true');
        v.setAttribute('disablePictureInPicture', 'true');
        v.setAttribute('controlslist', 'nodownload nofullscreen noremoteplayback');
        v.playsInline = true;
        (v as any).webkitPlaysInline = true;
        v.muted = true;
        v.autoplay = true;
        v.controls = false;
        v.style.pointerEvents = 'none';

        v.addEventListener('webkitbeginfullscreen', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        v.addEventListener('pause', () => {
          if (v.paused && v.srcObject) {
            v.play().catch(() => {});
          }
        });
      }
      return el;
    };
  } catch (e) {}
}

// Auto-run immediately when cameraScannerUtils is loaded
ensureIosVideoInlinePatch();

/**
 * BarcodeDetector hardware scanner instance for Android Chrome / Chromium
 */
export function getNativeBarcodeDetector(): any | null {
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      return new (window as any).BarcodeDetector({
        formats: ['qr_code', 'code_128', 'data_matrix', 'code_39', 'ean_13', 'itf', 'pdf417', 'upc_a'],
      });
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Launches real-time hardware accelerated BarcodeDetector frame polling
 */
export function startNativeBarcodeDetectorLoop(
  videoElement: HTMLVideoElement,
  onDetected: (code: string) => void,
  isScanningActive: () => boolean
): () => void {
  const detector = getNativeBarcodeDetector();
  if (!detector) return () => {};

  let animationFrameId: number | null = null;
  let isChecking = false;

  const checkFrame = async () => {
    if (!isScanningActive()) return;

    if (videoElement && videoElement.readyState >= 2 && !videoElement.paused && !videoElement.ended) {
      if (!isChecking) {
        isChecking = true;
        try {
          const results = await detector.detect(videoElement);
          if (results && results.length > 0 && results[0]?.rawValue) {
            onDetected(results[0].rawValue.trim());
            return;
          }
        } catch (e) {
          // ignore frame read error
        } finally {
          isChecking = false;
        }
      }
    }

    if (isScanningActive()) {
      animationFrameId = requestAnimationFrame(checkFrame);
    }
  };

  animationFrameId = requestAnimationFrame(checkFrame);

  return () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };
}

/**
 * Dual hardware BarcodeDetector + high-speed jsQR frame loop:
 * 1. Checks native BarcodeDetector on GPU (sub-15ms on Android Chrome)
 * 2. Uses pure-JS jsQR on uncropped frame (sub-15ms on iOS Safari WebKit)
 */
export function startFastQrFrameLoop(
  videoElement: HTMLVideoElement,
  onDetected: (code: string) => void,
  isScanningActive: () => boolean
): () => void {
  const detector = getNativeBarcodeDetector();
  let animationFrameId: number | null = null;
  let isChecking = false;

  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;

  const checkFrame = async () => {
    if (!isScanningActive()) return;

    if (videoElement && videoElement.readyState >= 2 && !videoElement.paused && !videoElement.ended) {
      if (!isChecking) {
        isChecking = true;
        try {
          // 1. Hardware BarcodeDetector (fastest on Android Chrome & Chromium)
          if (detector) {
            try {
              const results = await detector.detect(videoElement);
              if (results && results.length > 0 && results[0]?.rawValue) {
                const detectedCode = results[0].rawValue.trim();
                if (detectedCode) {
                  onDetected(detectedCode);
                  return;
                }
              }
            } catch (_) {}
          }

          // 2. High-speed jsQR frame decoder (instant on iOS Safari & everywhere else)
          if (ctx && canvas && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
            const vw = videoElement.videoWidth;
            const vh = videoElement.videoHeight;
            // Downscale to max 640px dimension for ultra-fast processing (<15ms per frame)
            const maxDim = 640;
            const scale = Math.min(1, maxDim / Math.max(vw, vh));
            const targetW = Math.round(vw * scale);
            const targetH = Math.round(vh * scale);

            if (canvas.width !== targetW || canvas.height !== targetH) {
              canvas.width = targetW;
              canvas.height = targetH;
            }

            ctx.drawImage(videoElement, 0, 0, targetW, targetH);
            const imageData = ctx.getImageData(0, 0, targetW, targetH);
            const qrResult = jsQR(imageData.data, targetW, targetH, {
              inversionAttempts: 'attemptBoth',
            });

            if (qrResult && qrResult.data && qrResult.data.trim()) {
              onDetected(qrResult.data.trim());
              return;
            }
          }
        } catch (_) {
          // ignore frame errors
        } finally {
          isChecking = false;
        }
      }
    }

    if (isScanningActive()) {
      animationFrameId = requestAnimationFrame(checkFrame);
    }
  };

  animationFrameId = requestAnimationFrame(checkFrame);

  return () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };
}

/**
 * User-friendly permission and error diagnostics
 */
export function parseCameraError(err: any): {
  title: string;
  message: string;
  isPermissionDenied: boolean;
  isNotFound: boolean;
  isBusy: boolean;
} {
  const errStr = (err?.message || err?.name || String(err)).toLowerCase();

  const isPermissionDenied =
    err?.name === 'NotAllowedError' ||
    err?.name === 'PermissionDeniedError' ||
    errStr.includes('permission') ||
    errStr.includes('denied') ||
    errStr.includes('từ chối');

  const isNotFound =
    err?.name === 'NotFoundError' ||
    err?.name === 'DevicesNotFoundError' ||
    errStr.includes('not found') ||
    errStr.includes('không tìm thấy');

  const isBusy =
    err?.name === 'NotReadableError' ||
    err?.name === 'TrackStartError' ||
    errStr.includes('could not start') ||
    errStr.includes('in use') ||
    errStr.includes('busy');

  if (isPermissionDenied) {
    return {
      title: 'Quyền truy cập Camera bị từ chối',
      message: 'Trình duyệt chưa được cấp quyền dùng Camera. Vui lòng bật quyền Camera trong cài đặt để quét mã QR.',
      isPermissionDenied: true,
      isNotFound: false,
      isBusy: false,
    };
  }

  if (isNotFound) {
    return {
      title: 'Không tìm thấy Camera',
      message: 'Thiết bị không có camera khả dụng hoặc camera đã bị vô hiệu hóa.',
      isPermissionDenied: false,
      isNotFound: true,
      isBusy: false,
    };
  }

  if (isBusy) {
    return {
      title: 'Camera đang bận',
      message: 'Camera đang bị ứng dụng hoặc thẻ trình duyệt khác sử dụng. Vui lòng đóng các tab khác và thử lại.',
      isPermissionDenied: false,
      isNotFound: false,
      isBusy: true,
    };
  }

  return {
    title: 'Lỗi khởi động Camera',
    message: err?.message || 'Không thể mở Camera. Vui lòng kiểm tra quyền hoặc tải lại trang.',
    isPermissionDenied: false,
    isNotFound: false,
    isBusy: false,
  };
}
