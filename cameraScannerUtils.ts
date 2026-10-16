/**
 * cameraScannerUtils.ts
 * Unified utilities for mobile camera QR & Barcode scanning on iOS and Android.
 * - Prioritizes Rear / Environment camera.
 * - Requests Full HD / HD resolution with continuous auto-focus constraints.
 * - Hardware BarcodeDetector acceleration for Android Chrome (instant decoding).
 * - Comprehensive permission and hardware error handling with clear user guidance.
 */

import { Html5QrcodeSupportedFormats } from 'html5-qrcode';

export interface CameraDeviceInfo {
  id: string;
  label: string;
  isRear: boolean;
}

/**
 * Prioritizes rear/back cameras and filters out ultra-wide/macro if a standard 1x camera is available.
 */
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

  // Sort so primary rear camera comes first
  return mapped.sort((a, b) => {
    const aLbl = a.label.toLowerCase();
    const bLbl = b.label.toLowerCase();

    // Front cameras go to bottom
    if (a.isRear && !b.isRear) return -1;
    if (!a.isRear && b.isRear) return 1;

    // Prefer main 1x rear camera over 0.5x ultra-wide or macro
    const aIsWide = aLbl.includes('wide') || aLbl.includes('0.5') || aLbl.includes('ultra') || aLbl.includes('macro');
    const bIsWide = bLbl.includes('wide') || bLbl.includes('0.5') || bLbl.includes('ultra') || bLbl.includes('macro');
    if (!aIsWide && bIsWide) return -1;
    if (aIsWide && !bIsWide) return 1;

    // Prefer "camera 0" on Android (usually primary back camera)
    if (aLbl.includes('camera 0') && !bLbl.includes('camera 0')) return -1;
    if (!aLbl.includes('camera 0') && bLbl.includes('camera 0')) return 1;

    return 0;
  });
}

/**
 * Returns optimized video track constraints for high-resolution & continuous autofocus
 */
export function getOptimizedVideoConstraints(deviceId?: string): MediaTrackConstraints {
  const baseConstraints: MediaTrackConstraints = {
    width: { min: 720, ideal: 1920, max: 2560 },
    height: { min: 720, ideal: 1080, max: 1440 },
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
