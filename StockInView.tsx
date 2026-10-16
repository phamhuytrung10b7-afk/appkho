import React, { useState, useEffect, useRef } from 'react';
import { Part, AppSettings, WarehouseLocation } from './types';
import { storageService } from './storage';
import {
  ArrowDownLeft,
  CheckCircle2,
  AlertCircle,
  Package,
  Clock,
  User,
  FileText,
  QrCode,
  FileSpreadsheet,
  Zap,
  X,
  MapPin,
  Camera,
  Volume2,
  Sparkles,
  ShieldAlert,
  BellRing,
  Download,
  Upload,
  Info,
} from 'lucide-react';
import { SearchableSelect, SelectOption } from './SearchableSelect';
import { SearchableLocationSelect } from './SearchableLocationSelect';
import { QrScannerModal, parseScannedQrPayload } from './QrScannerModal';
import { ContainerImportPrintModal } from './ContainerImportPrintModal';
import { InlineQrScanner } from './InlineQrScanner';
import { Html5Qrcode } from 'html5-qrcode';
import { normalizeLocationStr } from './StockOutScanModal';
import { soundEffects } from './soundEffects';
import { ExcelStockInModal } from './ExcelStockInModal';
import { downloadSampleStockInExcel } from './excelStockInOutParser';
import { setupVideoElementAttributes } from './cameraScannerUtils';

interface StockInMessage {
  type: 'success' | 'error';
  text: string;
  details?: {
    partCode?: string;
    partName?: string;
    qty?: number;
    unit?: string;
    location?: string;
    stockAfter?: number;
    contNumber?: string;
  };
}

interface StockInViewProps {
  parts: Part[];
  settings: AppSettings;
  onSuccess: () => void;
}

const getNowLocalDateTime = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
};

// Smart matching function for location QR code scanning
export function findLocationMatch(
  scannedText: string,
  locations: WarehouseLocation[] = []
): WarehouseLocation | undefined {
  if (!scannedText || !scannedText.trim()) return undefined;

  let raw = scannedText.trim();
  if (raw.includes('|')) {
    const parts = raw.split('|');
    raw = parts[parts.length - 1].trim();
  }

  // 1. Exact case-insensitive match on name or id
  let found = locations.find(
    (l) =>
      l.name.toLowerCase() === raw.toLowerCase() ||
      l.id.toLowerCase() === raw.toLowerCase()
  );
  if (found) return found;

  const normScanned = normalizeLocationStr(raw);
  if (!normScanned) return undefined;

  // Normalized version without prefixes (e.g. 'kea01' -> 'a01')
  const cleanNormScanned = normScanned.replace(/^(ke|kho|rack|shelf|vitri|khoang)/i, '');

  // 2. Exact match on prefix/short name (e.g. "A01" matching "A01 (Khoang 01 - Tầng 1 - Vị trí 1)")
  found = locations.find((l) => {
    const shortName = l.name.split('(')[0].trim();
    const shortNorm = normalizeLocationStr(shortName);
    const shortCleanNorm = shortNorm.replace(/^(ke|kho|rack|shelf|vitri|khoang)/i, '');
    return (
      shortName.toLowerCase() === raw.toLowerCase() ||
      shortNorm === normScanned ||
      shortCleanNorm === cleanNormScanned ||
      shortCleanNorm === normScanned ||
      shortNorm === cleanNormScanned
    );
  });
  if (found) return found;

  // 3. Normalized string match on l.name or l.id
  found = locations.find((l) => {
    const normName = normalizeLocationStr(l.name);
    const normId = normalizeLocationStr(l.id);
    const cleanNormName = normName.replace(/^(ke|kho|rack|shelf|vitri|khoang)/i, '');
    return (
      normName === normScanned ||
      cleanNormName === cleanNormScanned ||
      cleanNormName === normScanned ||
      normName === cleanNormScanned ||
      normId === normScanned ||
      normId === cleanNormScanned
    );
  });
  if (found) return found;

  // 4. Substring inclusion match (e.g. "A01" inside "Kho kệ A01")
  found = locations.find((l) => {
    const normName = normalizeLocationStr(l.name);
    const shortNameNorm = normalizeLocationStr(l.name.split('(')[0].trim());
    const cleanShort = shortNameNorm.replace(/^(ke|kho|rack|shelf|vitri|khoang)/i, '');

    return (
      (cleanShort.length >= 2 && (cleanNormScanned === cleanShort || cleanNormScanned.includes(cleanShort) || cleanShort.includes(cleanNormScanned))) ||
      (normName.length >= 2 && (normScanned.includes(normName) || normName.includes(normScanned)))
    );
  });
  if (found) return found;

  // 5. Match description
  found = locations.find(
    (l) => l.description && normalizeLocationStr(l.description) === normScanned
  );
  return found;
}

export const StockInView: React.FC<StockInViewProps> = ({ parts, settings, onSuccess }) => {
  const [selectedPartId, setSelectedPartId] = useState(parts[0]?.id || '');
  const [quantity, setQuantity] = useState<number>(100);
  const [dateTime, setDateTime] = useState(getNowLocalDateTime());

  // Default person from logged in user, or fallback to settings
  const currentUser = storageService.getCurrentUser();
  const currentUserName = currentUser
    ? `${currentUser.fullName}${currentUser.roleTitle ? ` (${currentUser.roleTitle})` : ''}`
    : (settings.staffList?.[0] || settings.managerName || 'Trần Văn Bình (Kho)');
  
  const defaultPerson = currentUserName;
  const [person, setPerson] = useState(defaultPerson);

  const staffOptions = React.useMemo(() => {
    const list = settings.staffList || [];
    if (currentUserName && !list.includes(currentUserName)) {
      return [currentUserName, ...list];
    }
    return list.length ? list : [currentUserName];
  }, [settings.staffList, currentUserName]);

  // Default reason from settings or initial fallback
  const defaultReason = settings.stockInReasons?.[0] || 'Nhập mua hàng theo hợp đồng';
  const [reason, setReason] = useState(defaultReason);

  const [notes, setNotes] = useState('');
  const [scannedTagId, setScannedTagId] = useState<string | null>(null);
  const [message, setMessage] = useState<StockInMessage | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isContModalOpen, setIsContModalOpen] = useState(false);

  const [mainTab, setMainTab] = useState<'scan' | 'manual' | 'excel'>('scan');
  const [isExcelInModalOpen, setIsExcelInModalOpen] = useState(false);
  const [excelInFile, setExcelInFile] = useState<File | null>(null);
  const excelInFileInputRef = useRef<HTMLInputElement>(null);
  const [autoScanHistory, setAutoScanHistory] = useState<
    { id: string; partCode: string; partName: string; qty: number; unit: string; time: string; contNumber?: string; stockAfter: number }[]
  >([]);

  const [partialImportModal, setPartialImportModal] = useState<{
    isOpen: boolean;
    part: Part;
    tagId?: string;
    contNumber?: string;
    originalQty: number;
    alreadyImported: number;
  } | null>(null);
  
  const [importQtyInput, setImportQtyInput] = useState<number | ''>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [customLocation, setCustomLocation] = useState('');

  // Location QR Camera / Gun Scanner States
  const [isLocScannerActive, setIsLocScannerActive] = useState(false);
  const [locScannerError, setLocScannerError] = useState<string | null>(null);
  const [locScanGunInput, setLocScanGunInput] = useState('');

  const qtyInputRef = useRef<HTMLInputElement>(null);
  const manualQtyInputRef = useRef<HTMLInputElement>(null);
  const locationSelectRef = useRef<HTMLSelectElement>(null);
  const modalLocationSelectRef = useRef<HTMLSelectElement>(null);
  const locScanGunInputRef = useRef<HTMLInputElement>(null);
  const locHtml5QrRef = useRef<Html5Qrcode | null>(null);

  // Manual Tab (Tab 2) Modal Popup & Fast Submit States
  const [manualStockInModal, setManualStockInModal] = useState<{
    isOpen: boolean;
    part: Part;
    contNumber?: string;
    tagId?: string;
  } | null>(null);
  const [manualModalQtyInput, setManualModalQtyInput] = useState<number | ''>('');
  const [manualModalShelfInput, setManualModalShelfInput] = useState('');
  const [isManualModalShelfCamActive, setIsManualModalShelfCamActive] = useState(false);
  const [manualPartScanInput, setManualPartScanInput] = useState('');
  const manualModalQtyInputRef = useRef<HTMLInputElement>(null);
  const manualModalShelfInputRef = useRef<HTMLInputElement>(null);
  const manualModalShelfHtml5QrRef = useRef<Html5Qrcode | null>(null);
  const isManualStockInProcessingRef = useRef(false);

  const selectedPart = parts.find((p) => p.id === selectedPartId);

  useEffect(() => {
    if (selectedPart) {
      setSelectedLocation('');
      setCustomLocation('');
    }
  }, [selectedPartId]);

  // Auto focus into Quantity Input when Partial Import Modal opens
  useEffect(() => {
    if (partialImportModal?.isOpen) {
      setTimeout(() => {
        qtyInputRef.current?.focus();
      }, 150);
    } else {
      stopLocCamera();
      setLocScanGunInput('');
    }
  }, [partialImportModal?.isOpen]);

  // Auto focus into Quantity Input when Manual Stock In Modal opens
  useEffect(() => {
    if (manualStockInModal?.isOpen) {
      setManualModalQtyInput('');
      setManualModalShelfInput('');
      setSelectedLocation('');
      setCustomLocation('');
      setIsManualModalShelfCamActive(false);
      setTimeout(() => {
        manualModalQtyInputRef.current?.focus();
      }, 150);
    } else {
      stopManualModalShelfCamera();
      setManualModalShelfInput('');
    }
  }, [manualStockInModal?.isOpen]);

  const [errorModal, setErrorModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  const processStockInSubmit = (targetLoc: string, actualQty: number) => {
    if (!partialImportModal) return;

    const { part, tagId, contNumber, originalQty, alreadyImported } = partialImportModal;
    const reasonText = `Nhập kho theo Cont ${contNumber}`;

    const tx = storageService.addStockIn({
      partId: part.id,
      quantity: actualQty,
      date: new Date().toISOString(),
      person: defaultPerson,
      reasonOrPurpose: reasonText,
      notes: tagId ? `Tem QR Cont: ${contNumber} (ID: ${tagId})` : `Tem QR Cont ${contNumber}`,
      locationId: targetLoc.trim(),
    });

    // Save location to part
    storageService.updatePart(part.id, { location: targetLoc.trim() });

    const newImportedTotal = alreadyImported + actualQty;
    if (tagId) {
      storageService.markQrTokenAsUsed(tagId, {
        partCode: part.code,
        quantity: originalQty,
        importedQuantity: newImportedTotal,
        contNumber: contNumber || '',
        person: defaultPerson,
      });
    }

    const nowTimeStr = new Date().toLocaleTimeString('vi-VN');
    setAutoScanHistory((prev) => [
      {
        id: `${part.id}-${Date.now()}`,
        partCode: part.code,
        partName: part.name,
        qty: actualQty,
        unit: part.unit,
        time: nowTimeStr,
        contNumber,
        stockAfter: tx.stockAfter,
      },
      ...prev,
    ]);

    // Close partial import modal immediately
    setPartialImportModal(null);

    // Play Ting Ting audio & trigger haptic
    soundEffects.playSuccessTingTing();

    // Show high-impact, attention-grabbing success notification
    setMessage({
      type: 'success',
      text: `Nhập kho thành công +${actualQty} ${part.unit} [${part.code}] vào Kệ [${targetLoc.trim()}]. Tồn kho: ${tx.stockAfter.toLocaleString('vi-VN')} ${part.unit}.`,
      details: {
        partCode: part.code,
        partName: part.name,
        qty: actualQty,
        unit: part.unit,
        location: targetLoc.trim(),
        stockAfter: tx.stockAfter,
        contNumber,
      },
    });
  };

  const handleLocScanResult = (scannedText: string) => {
    if (!scannedText.trim()) return;

    const foundInSettings = findLocationMatch(scannedText, settings.locations || []);

    if (!foundInSettings) {
      soundEffects.playErrorBuzzer();
      setLocScanGunInput('');
      setErrorModal({
        isOpen: true,
        title: '❌ MÃ KỆ KHÔNG TỒN TẠI TRONG HỆ THỐNG',
        message: `Mã QR kệ "${scannedText}" KHÔNG TỒN TẠI trong danh mục vị trí kệ kho của hệ thống. Vui lòng quét đúng mã QR kệ hợp lệ!`,
      });
      return;
    }

    const targetLocName = foundInSettings.name;
    setSelectedLocation(foundInSettings.name);
    setCustomLocation('');
    setLocScanGunInput('');

    // If Partial Import Popup Modal is currently open, validate & auto confirm immediately!
    if (partialImportModal) {
      const actualQty = typeof importQtyInput === 'number' ? importQtyInput : Number(importQtyInput);
      const remaining = partialImportModal.originalQty - partialImportModal.alreadyImported;

      if (!actualQty || actualQty <= 0) {
        soundEffects.playErrorBuzzer();
        setErrorModal({
          isOpen: true,
          title: '⚠️ THIẾU SỐ LƯỢNG NHẬP KHO',
          message: 'Vui lòng nhập Số Lượng thực tế cần nhập trước khi quét mã QR Kệ!',
        });
        return;
      }

      if (actualQty > remaining) {
        soundEffects.playErrorBuzzer();
        setErrorModal({
          isOpen: true,
          title: '❌ SỐ LƯỢNG VƯỢT QUÁ CÒN LẠI',
          message: `Số lượng nhập (${actualQty} ${partialImportModal.part.unit}) vượt quá số lượng còn lại trong Cont (${remaining} ${partialImportModal.part.unit})!`,
        });
        return;
      }

      // Auto Submit Confirmation!
      processStockInSubmit(targetLocName, actualQty);
    }
  };

  const startLocCamera = async () => {
    setIsLocScannerActive(true);
    setLocScannerError(null);

    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode('loc-qr-reader-container');
        locHtml5QrRef.current = html5QrCode;

        let hasHandledLocFrame = false;

        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            if (hasHandledLocFrame) return;
            hasHandledLocFrame = true;

            if (html5QrCode.isScanning) {
              html5QrCode.stop().then(() => html5QrCode.clear()).catch(() => {});
            }
            setIsLocScannerActive(false);
            handleLocScanResult(decodedText);
          },
          () => {}
        );

        // Ensure iOS Safari plays inline and doesn't freeze
        const pollForLocVideo = () => {
          const videoEl = document.querySelector('#loc-qr-reader-container video') as HTMLVideoElement;
          if (videoEl) {
            setupVideoElementAttributes(videoEl);
          } else if (html5QrCode.isScanning) {
            requestAnimationFrame(pollForLocVideo);
          }
        };
        pollForLocVideo();
      } catch (err: any) {
        console.warn('Loc camera error:', err);
        setLocScannerError('Không mở được camera trực tiếp. Vui lòng dùng súng quét USB/Bluetooth hoặc chọn vị trí kệ trong danh sách.');
      }
    }, 120);
  };

  const stopLocCamera = () => {
    if (locHtml5QrRef.current && locHtml5QrRef.current.isScanning) {
      locHtml5QrRef.current.stop().then(() => locHtml5QrRef.current?.clear()).catch(() => {});
    }
    setIsLocScannerActive(false);
  };

  const openManualStockInModal = (part: Part, contNumber?: string, tagId?: string) => {
    setSelectedPartId(part.id);
    setManualStockInModal({
      isOpen: true,
      part,
      contNumber,
      tagId,
    });
    setManualModalQtyInput('');
    setManualModalShelfInput('');
    setSelectedLocation('');
    setCustomLocation('');
  };

  const handleManualPartLookup = (scannedPartText: string) => {
    const clean = (scannedPartText || '').trim();
    if (!clean) return;

    const parsed = parseScannedQrPayload(clean);
    const searchCode = (parsed.partCode || clean).toLowerCase();

    // Check if directly matches a part from master parts list
    const found = parts.find(
      (p) =>
        p.code.toLowerCase() === searchCode ||
        p.qrCode?.toLowerCase() === searchCode ||
        p.barcode?.toLowerCase() === searchCode ||
        p.name.toLowerCase() === searchCode ||
        p.code.toLowerCase() === clean.toLowerCase()
    );

    if (!found) {
      soundEffects.playErrorBuzzer();
      setManualPartScanInput('');
      setErrorModal({
        isOpen: true,
        title: '❌ LINH KIỆN KHÔNG TỒN TẠI TRONG HỆ THỐNG',
        message: `Mã linh kiện quét được "${clean}" KHÔNG CÓ trong danh mục ${parts.length} linh kiện của hệ thống! Vui lòng kiểm tra lại tem hoặc thêm mới linh kiện vào danh mục trước khi nhập kho.`,
      });
      return;
    }

    setManualPartScanInput('');
    openManualStockInModal(found, parsed.contNumber, parsed.tagId);
  };

  const handleManualModalShelfScan = (scannedLocText: string) => {
    const rawLoc = (scannedLocText || '').trim();
    if (!rawLoc) return;

    if (!manualStockInModal || !manualStockInModal.part) return;

    // Prevent duplicate triggers if already executing
    if (isManualStockInProcessingRef.current) {
      return;
    }

    // STRICT LOCATION VALIDATION: Must exist in settings.locations (Sơ đồ vị trí kho hàng Ảnh 2)
    const foundLoc = findLocationMatch(rawLoc, settings.locations || []);
    if (!foundLoc) {
      isManualStockInProcessingRef.current = false;
      soundEffects.playErrorBuzzer();
      setManualModalShelfInput('');
      setErrorModal({
        isOpen: true,
        title: '❌ MÃ KỆ KHÔNG TỒN TẠI TRONG SƠ ĐỒ KHO',
        message: `Mã kệ "${rawLoc}" KHÔNG TỒN TẠI trong Sơ đồ vị trí kho hàng (Ảnh 2)! Bạn không được quét mã bậy bạ, vui lòng quét đúng mã QR kệ hợp lệ đã khai báo trong hệ thống (Ví dụ: A01, A02, A03...)!`,
      });
      return;
    }

    const numQty = typeof manualModalQtyInput === 'number' ? manualModalQtyInput : parseInt(String(manualModalQtyInput), 10);
    if (!numQty || numQty <= 0) {
      isManualStockInProcessingRef.current = false;
      soundEffects.playErrorBuzzer();
      setErrorModal({
        isOpen: true,
        title: '⚠️ BẮT BUỘC ĐIỀN SỐ LƯỢNG',
        message: 'Vui lòng nhập Số Lượng thực tế cần nhập trước khi quét mã kệ để hoàn tất!',
      });
      setTimeout(() => {
        manualModalQtyInputRef.current?.focus();
      }, 100);
      return;
    }

    // Lock to prevent subsequent video frames from double submitting
    isManualStockInProcessingRef.current = true;

    // Auto complete stock in immediately!
    const targetLocName = foundLoc.name;
    executeManualStockIn(manualStockInModal.part, numQty, targetLocName, manualStockInModal.contNumber, manualStockInModal.tagId);
  };

  const executeManualStockIn = (
    part: Part,
    actualQty: number,
    targetLocName: string,
    contNumber?: string,
    tagId?: string
  ) => {
    let tx: any;
    try {
      const nowIso = new Date().toISOString();
      const staffPerson = person?.trim() || currentUserName || defaultPerson || 'Nhân sự kho';
      const reasonText = contNumber ? `Nhập kho theo Cont ${contNumber}` : 'Nhập kho thủ công';
      const noteText = tagId ? `Tem QR: ${tagId}` : (contNumber ? `Mã Cont: ${contNumber}` : '');

      tx = storageService.addStockIn({
        partId: part.id,
        quantity: actualQty,
        date: nowIso,
        person: staffPerson,
        reasonOrPurpose: reasonText,
        notes: noteText,
        locationId: targetLocName,
      });
    } catch (err: any) {
      soundEffects.playErrorBuzzer();
      setErrorModal({
        isOpen: true,
        title: '❌ LỖI LƯU NHẬP KHO',
        message: `Không thể hoàn tất giao dịch nhập kho: ${err?.message || 'Lỗi không xác định'}`,
      });
      isManualStockInProcessingRef.current = false;
      return;
    }

    // --- TRANSACTION HAS SUCCEEDED ---
    // All UI updates, camera closures, audio, and sync are safely executed without triggering error modal
    try {
      // 1. Mark QR token as used safely if applicable
      if (tagId) {
        try {
          storageService.markQrTokenAsUsed(tagId, {
            partCode: part.code,
            quantity: actualQty,
            contNumber: contNumber || '',
            person: person?.trim() || currentUserName || defaultPerson || 'Nhân sự kho',
          });
        } catch (e) {
          console.warn('Mark token warning:', e);
        }
      }

      // 2. Safely stop camera & close modal
      stopManualModalShelfCamera();
      setManualStockInModal(null);

      // 3. Add to session history
      const nowTimeStr = new Date().toLocaleTimeString('vi-VN');
      setAutoScanHistory((prev) => [
        {
          id: `${part.id}-${Date.now()}`,
          partCode: part.code,
          partName: part.name,
          qty: actualQty,
          unit: part.unit,
          time: nowTimeStr,
          contNumber: contNumber,
          stockAfter: tx.stockAfter,
        },
        ...prev,
      ]);

      // 4. Audio & success notification
      soundEffects.playSuccessTingTing();
      setMessage({
        type: 'success',
        text: `ĐÃ NHẬP KHO THỦ CÔNG: +${actualQty.toLocaleString('vi-VN')} ${part.unit} [${part.code}] vào Kệ [${targetLocName}]. Tồn kho mới: ${tx.stockAfter.toLocaleString('vi-VN')} ${part.unit}.`,
        details: {
          partCode: part.code,
          partName: part.name,
          qty: actualQty,
          unit: part.unit,
          location: targetLocName,
          stockAfter: tx.stockAfter,
          contNumber: contNumber,
        },
      });

      // 5. Reset form states
      setManualModalQtyInput('');
      setManualModalShelfInput('');

      // 6. Safely notify parent to refresh state
      try {
        onSuccess();
      } catch (onSuccessErr) {
        console.warn('onSuccess callback non-blocking warning:', onSuccessErr);
      }
    } catch (uiErr) {
      console.warn('Non-critical UI update error:', uiErr);
    } finally {
      setTimeout(() => {
        isManualStockInProcessingRef.current = false;
      }, 500);
    }
  };

  const startManualModalShelfCamera = async () => {
    setIsManualModalShelfCamActive(true);
    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode('manual-modal-shelf-qr-reader');
        manualModalShelfHtml5QrRef.current = html5QrCode;

        let hasHandledShelfFrame = false;

        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            // Guard against multiple frames firing before stop() resolves
            if (hasHandledShelfFrame || isManualStockInProcessingRef.current) return;
            hasHandledShelfFrame = true;

            // Stop camera first safely
            stopManualModalShelfCamera();

            // Execute shelf scan processing
            handleManualModalShelfScan(decodedText);
          },
          () => {}
        );

        // Ensure iOS Safari plays inline and doesn't freeze
        const pollForShelfVideo = () => {
          const videoEl = document.querySelector('#manual-modal-shelf-qr-reader video') as HTMLVideoElement;
          if (videoEl) {
            setupVideoElementAttributes(videoEl);
          } else if (html5QrCode.isScanning) {
            requestAnimationFrame(pollForShelfVideo);
          }
        };
        pollForShelfVideo();
      } catch (err: any) {
        console.warn('Manual modal shelf camera error:', err);
        setIsManualModalShelfCamActive(false);
      }
    }, 120);
  };

  const stopManualModalShelfCamera = () => {
    try {
      const qrInstance = manualModalShelfHtml5QrRef.current;
      manualModalShelfHtml5QrRef.current = null;
      if (qrInstance) {
        if (qrInstance.isScanning) {
          qrInstance
            .stop()
            .then(() => {
              try {
                qrInstance.clear();
              } catch {}
            })
            .catch(() => {});
        } else {
          try {
            qrInstance.clear();
          } catch {}
        }
      }
    } catch (e) {
      console.warn('Manual modal shelf camera stop error:', e);
    } finally {
      setIsManualModalShelfCamActive(false);
    }
  };

  // Submit handler for partial / batch import popup modal
  const submitPartialImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partialImportModal) return;

    const actualQty = typeof importQtyInput === 'number' ? importQtyInput : Number(importQtyInput);
    if (!actualQty || actualQty <= 0) {
      soundEffects.playErrorBuzzer();
      setErrorModal({
        isOpen: true,
        title: '⚠️ THIẾU SỐ LƯỢNG NHẬP KHO',
        message: 'Vui lòng nhập Số Lượng thực tế cần nhập trước khi xác nhận!',
      });
      return;
    }

    const remaining = partialImportModal.originalQty - partialImportModal.alreadyImported;
    if (actualQty > remaining) {
      soundEffects.playErrorBuzzer();
      setErrorModal({
        isOpen: true,
        title: '❌ SỐ LƯỢNG VƯỢT QUÁ CÒN LẠI',
        message: `Số lượng nhập (${actualQty} ${partialImportModal.part.unit}) vượt quá số lượng còn lại trong Cont (${remaining} ${partialImportModal.part.unit})!`,
      });
      return;
    }

    const targetLocation = (selectedLocation === '__custom__' ? customLocation : selectedLocation) || customLocation;
    if (!targetLocation.trim()) {
      soundEffects.playErrorBuzzer();
      setErrorModal({
        isOpen: true,
        title: '❌ THIẾU VỊ TRÍ KỆ',
        message: 'Vui lòng chọn hoặc quét vị trí / kệ đặt linh kiện!',
      });
      return;
    }

    const foundLoc = findLocationMatch(targetLocation, settings.locations || []);
    if (!foundLoc) {
      soundEffects.playErrorBuzzer();
      setErrorModal({
        isOpen: true,
        title: '❌ MÃ KỆ KHÔNG TỒN TẠI TRONG HỆ THỐNG',
        message: `Vị trí kệ "${targetLocation}" KHÔNG TỒN TẠI trong danh mục vị trí kệ kho đã khai báo của hệ thống. Vui lòng chọn hoặc quét kệ hợp lệ!`,
      });
      return;
    }

    stopLocCamera();
    processStockInSubmit(foundLoc.name, actualQty);
    onSuccess();
  };

  const handleAutoStockInFromQr = ({
    part,
    qty,
    contNumber,
    tagId,
  }: {
    part: Part;
    qty?: number;
    contNumber?: string;
    tagId?: string;
  }) => {
    // If not a Cont QR code with explicit quantity & contNumber, switch to manual tab
    if (!qty || qty <= 0 || !contNumber) {
      soundEffects.playScanBeep();
      setSelectedPartId(part.id);
      setMainTab('manual');
      setMessage({
        type: 'success',
        text: `ℹ️ Đã tìm thấy linh kiện [${part.code}] ${part.name}. Vui lòng nhập số lượng và chọn vị trí kệ để hoàn tất phiếu nhập.`,
      });
      return;
    }

    // STRICT CONTAINER BATCH CHECK
    const tokenKey = tagId || `${contNumber}-${part.code}`;
    const validCheck = storageService.validateContainerQrTag(tokenKey, {
      partCode: part.code,
      contNumber,
      tagId,
    });

    if (!validCheck.isValid) {
      soundEffects.playErrorBuzzer();
      setMessage({
        type: 'error',
        text: `⛔ KHÔNG THỂ NHẬP KHO! ${validCheck.reason || 'Mã QR này không thuộc bất kỳ Danh mục Container nào đã khởi tạo trên hệ thống.'}`,
      });
      return;
    }

    const usedCheck = storageService.isQrTokenUsed(tokenKey);
    const totalQtyInCont = qty || usedCheck.quantity || validCheck.totalContQty || 0;
    const alreadyImported = usedCheck.importedQuantity || 0;
    const remainingQty = totalQtyInCont - alreadyImported;

    if (remainingQty <= 0) {
      soundEffects.playErrorBuzzer();
      setMessage({
        type: 'error',
        text: `⛔ Mã QR Tem Cont ${contNumber} linh kiện [${part.code}] đã được nhập ĐỦ số lượng (${alreadyImported.toLocaleString('vi-VN')}/${totalQtyInCont.toLocaleString('vi-VN')} ${part.unit})!`,
      });
      return;
    }

    soundEffects.playScanBeep();

    // Open Popup Modal asking user for import quantity and location!
    setSelectedLocation('');
    setCustomLocation('');
    setImportQtyInput(''); // Blank by default, user must enter actual quantity!
    setPartialImportModal({
      isOpen: true,
      part,
      tagId: tokenKey,
      contNumber,
      originalQty: totalQtyInCont,
      alreadyImported,
    });
  };

  // Part options for SearchableSelect
  const partOptions: SelectOption[] = parts.map((p) => ({
    value: p.id,
    label: `[${p.code}] ${p.name}`,
    sublabel: `Tồn: ${p.currentStock} ${p.unit} | Vị trí: ${p.location}`,
    badge: `${p.currentStock} ${p.unit}`,
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartId) {
      soundEffects.playErrorBuzzer();
      setMessage({ type: 'error', text: 'Vui lòng chọn linh kiện cần nhập kho!' });
      return;
    }
    if (quantity <= 0) {
      soundEffects.playErrorBuzzer();
      setMessage({ type: 'error', text: 'Số lượng nhập phải lớn hơn 0!' });
      return;
    }

    const targetLoc = (selectedLocation === '__custom__' ? customLocation : selectedLocation).trim();
    if (!targetLoc) {
      soundEffects.playErrorBuzzer();
      setMessage({ type: 'error', text: 'Vui lòng chọn hoặc quét vị trí / kệ nhập kho!' });
      return;
    }

    if (!person.trim()) {
      soundEffects.playErrorBuzzer();
      setMessage({ type: 'error', text: 'Vui lòng chọn hoặc nhập tên người nhập kho!' });
      return;
    }

    try {
      const tx = storageService.addStockIn({
        partId: selectedPartId,
        quantity: Number(quantity),
        date: new Date(dateTime).toISOString(),
        person: person.trim(),
        reasonOrPurpose: reason.trim(),
        notes: notes.trim(),
        locationId: targetLoc,
      });

      // If imported via Cont QR Code, mark this tag as USED so it can NEVER be scanned twice!
      if (scannedTagId) {
        storageService.markQrTokenAsUsed(scannedTagId, {
          partCode: selectedPart?.code || '',
          quantity: Number(quantity),
          contNumber: reason.replace('Nhập kho theo Cont ', ''),
          person: person.trim(),
        });
        setScannedTagId(null);
      }

      soundEffects.playSuccessTingTing();
      setMessage({
        type: 'success',
        text: `Đã nhập kho thành công +${quantity} ${tx.unit} cho [${tx.partCode}] ${tx.partName}. Tồn kho mới: ${tx.stockAfter} ${tx.unit}.`,
        details: {
          partCode: tx.partCode,
          partName: tx.partName,
          qty: quantity,
          unit: tx.unit,
          location: targetLoc,
          stockAfter: tx.stockAfter,
        },
      });

      // Reset form
      setQuantity(100);
      setNotes('');
      setDateTime(getNowLocalDateTime());
      onSuccess();
    } catch (err: any) {
      soundEffects.playErrorBuzzer();
      setMessage({ type: 'error', text: err.message || 'Lỗi khi lưu phiếu nhập kho' });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Title & Header Action Buttons */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
            <ArrowDownLeft className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">PHIẾU NHẬP KHO LINH KIỆN</h2>
            <p className="text-xs text-slate-500">Tự động cộng dồn tồn kho thực tế, lưu ngày giờ chính xác và cập nhật Thẻ kho.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Hidden file input for fast Excel picking */}
          <input
            type="file"
            ref={excelInFileInputRef}
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                setExcelInFile(e.target.files[0]);
                setIsExcelInModalOpen(true);
              }
            }}
          />

          <button
            type="button"
            onClick={() => {
              setExcelInFile(null);
              setIsExcelInModalOpen(true);
            }}
            className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-300" />
            <span>Nhập Kho Bằng File Excel</span>
          </button>

          <button
            type="button"
            onClick={() => setIsContModalOpen(true)}
            className="flex items-center space-x-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>In Tem QR Cont (Excel)</span>
          </button>
        </div>
      </div>

      {/* Main Mode Selection Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-100/80 p-1.5 rounded-2xl gap-2">
        <button
          type="button"
          onClick={() => setMainTab('scan')}
          className={`flex-1 py-3 px-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            mainTab === 'scan'
              ? 'bg-emerald-700 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>1. QUÉT MÃ TỰ ĐỘNG</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMainTab('manual');
            setQuantity('' as any);
            setTimeout(() => {
              manualQtyInputRef.current?.focus();
            }, 100);
          }}
          className={`flex-1 py-3 px-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            mainTab === 'manual'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <FileText className="w-4 h-4 text-slate-500" />
          <span>2. NHẬP THỦ CÔNG</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMainTab('excel');
            setExcelInFile(null);
            setIsExcelInModalOpen(true);
          }}
          className={`flex-1 py-3 px-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            mainTab === 'excel'
              ? 'bg-gradient-to-r from-emerald-700 to-teal-800 text-white shadow-md'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-amber-400" />
          <span>3. NHẬP KHO FILE EXCEL</span>
        </button>
      </div>

      {/* PROMINENT, ATTENTION-GRABBING NOTIFICATION BANNER (WITH SOUND INDICATOR) */}
      {message && (
        <div
          className={`relative overflow-hidden rounded-2xl shadow-xl transition-all animate-in zoom-in-95 slide-in-from-top-3 duration-300 ${
            message.type === 'success'
              ? 'bg-gradient-to-br from-emerald-700 via-emerald-800 to-teal-900 border-2 border-emerald-400 ring-4 ring-emerald-500/20 text-white'
              : 'bg-gradient-to-br from-rose-700 via-red-800 to-rose-900 border-2 border-rose-400 ring-4 ring-rose-500/20 text-white'
          }`}
        >
          {/* Subtle decorative glow overlay */}
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-36 h-36 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-24 h-24 bg-emerald-400/20 rounded-full blur-lg pointer-events-none" />

          <div className="p-4 sm:p-5 relative z-10 space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2.5">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
                    message.type === 'success'
                      ? 'bg-emerald-500/40 text-emerald-200 border border-emerald-300/50'
                      : 'bg-rose-500/40 text-rose-200 border border-rose-300/50'
                  }`}
                >
                  {message.type === 'success' ? (
                    <Sparkles className="w-5 h-5 text-amber-300 animate-spin" style={{ animationDuration: '8s' }} />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-rose-200 animate-pulse" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-sm sm:text-base font-black tracking-wide uppercase text-white drop-shadow-xs">
                      {message.type === 'success' ? '🎉 NHẬP KHO THÀNH CÔNG!' : '⛔ CẢNH BÁO / LỖI THAO TÁC!'}
                    </span>
                    <button
                      type="button"
                      onClick={() => (message.type === 'success' ? soundEffects.playSuccessTingTing() : soundEffects.playErrorBuzzer())}
                      title="Bấm để nghe lại chuông thông báo"
                      className="px-2.5 py-0.5 bg-white/20 hover:bg-white/30 active:scale-95 rounded-full text-[10px] font-extrabold flex items-center space-x-1 cursor-pointer transition-all border border-white/20"
                    >
                      <Volume2 className="w-3 h-3 text-amber-300" />
                      <span className="text-white">{message.type === 'success' ? 'Ting Ting 🔔' : 'È è è 🔊'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-emerald-100/90 truncate font-medium mt-0.5">
                    {message.type === 'success'
                      ? 'Tồn kho và thẻ kho đã cập nhật tức thì vào hệ thống'
                      : 'Vui lòng kiểm tra lại thông tin thao tác'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMessage(null)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Đóng thông báo"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Details Content */}
            {message.details ? (
              <div className="bg-black/25 backdrop-blur-xs rounded-xl p-3 sm:p-4 border border-white/15 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="space-y-1.5 min-w-0 flex-1">
                  {message.details.partName && (
                    <h4 className="text-sm sm:text-base font-black text-white leading-tight">
                      {message.details.partName}
                    </h4>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {message.details.partCode && (
                      <span className="font-mono text-xs font-black bg-white/20 text-amber-200 px-2.5 py-0.5 rounded-lg border border-amber-300/30">
                        [{message.details.partCode}]
                      </span>
                    )}
                    {message.details.location && (
                      <span className="text-xs font-black bg-blue-500/50 text-blue-100 px-2.5 py-0.5 rounded-lg border border-blue-300/40 flex items-center space-x-1">
                        <MapPin className="w-3.5 h-3.5 text-blue-200" />
                        <span>Vào Kệ: <strong className="text-white underline">{message.details.location}</strong></span>
                      </span>
                    )}
                    {message.details.contNumber && (
                      <span className="text-[11px] font-bold bg-amber-500/40 text-amber-100 px-2 py-0.5 rounded-md border border-amber-300/30">
                        Cont: {message.details.contNumber}
                      </span>
                    )}
                  </div>
                </div>

                {/* Big Bold Quantity Highlight Badge */}
                <div className="bg-white text-slate-900 rounded-xl px-4 py-2.5 shadow-lg flex sm:flex-col items-center justify-between sm:justify-center shrink-0 min-w-[145px] border-2 border-emerald-300">
                  <div className="text-left sm:text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">
                      ĐÃ NHẬP VÀO KHO
                    </span>
                    <div className="flex items-baseline space-x-1 justify-start sm:justify-center">
                      <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-700 leading-none">
                        +{message.details.qty?.toLocaleString('vi-VN')}
                      </span>
                      <span className="text-xs font-black text-emerald-800 uppercase">
                        {message.details.unit}
                      </span>
                    </div>
                  </div>
                  {message.details.stockAfter !== undefined && (
                    <div className="text-right sm:text-center sm:mt-1 pt-0 sm:pt-1 sm:border-t sm:border-slate-200">
                      <span className="text-[10px] text-slate-500 font-bold block">Tồn kho mới:</span>
                      <strong className="text-xs font-black font-mono text-slate-900">
                        {message.details.stockAfter.toLocaleString('vi-VN')} {message.details.unit}
                      </strong>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-black/25 backdrop-blur-xs rounded-xl p-3 border border-white/15 text-xs sm:text-sm font-bold leading-relaxed text-white">
                {message.text}
              </div>
            )}
          </div>
        </div>
      )}

      
      {/* PARTIAL / BATCH IMPORT MODAL */}
      {partialImportModal && partialImportModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] border border-slate-100 animate-in zoom-in-95">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-emerald-800 to-teal-900 text-white">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                  <Package className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight">Khai Báo Nhập Kho Linh Kiện (Tem Cont)</h3>
                  <p className="text-[11px] text-emerald-200">Xác nhận số lượng thực tế & khoang kệ cất giữ</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPartialImportModal(null)}
                className="p-1 text-emerald-200 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={submitPartialImport} className="p-5 space-y-4 overflow-y-auto">
              {/* Cont & Part Info Box */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono font-bold text-blue-700 text-xs bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                      {partialImportModal.part.code}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm mt-1">
                      {partialImportModal.part.name}
                    </h4>
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 bg-slate-200/60 px-2.5 py-1 rounded-lg">
                    ĐVT: {partialImportModal.part.unit}
                  </span>
                </div>

                <div className="text-xs text-slate-600 flex items-center space-x-1">
                  <span>Mã Container:</span>
                  <strong className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
                    {partialImportModal.contNumber}
                  </strong>
                </div>

                {/* Progress Stats */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 text-center text-xs">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-medium">Tổng trong Cont</span>
                    <strong className="font-mono font-bold text-slate-800 text-sm">
                      {partialImportModal.originalQty.toLocaleString('vi-VN')}
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-medium">Đã nhập kho</span>
                    <strong className="font-mono font-bold text-emerald-600 text-sm">
                      {partialImportModal.alreadyImported.toLocaleString('vi-VN')}
                    </strong>
                  </div>
                  <div className="bg-amber-50 p-2 rounded-lg border border-amber-200">
                    <span className="text-[10px] text-amber-700 block font-medium">Còn chưa nhập</span>
                    <strong className="font-mono font-bold text-amber-900 text-sm">
                      {(partialImportModal.originalQty - partialImportModal.alreadyImported).toLocaleString('vi-VN')}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Input Quantity */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-extrabold text-slate-800">
                    1. Số lượng thực tế nhập đợt này ({partialImportModal.part.unit}) *
                  </label>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    Tối đa: {(partialImportModal.originalQty - partialImportModal.alreadyImported).toLocaleString('vi-VN')} {partialImportModal.part.unit}
                  </span>
                </div>

                <input
                  ref={qtyInputRef}
                  type="number"
                  min="1"
                  max={partialImportModal.originalQty - partialImportModal.alreadyImported}
                  required
                  autoFocus
                  value={importQtyInput === '' ? '' : importQtyInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      // Jump cursor focus directly into the Rack QR Scan input!
                      locScanGunInputRef.current?.focus();
                      locScanGunInputRef.current?.select();
                    }
                  }}
                  onChange={(e) => setImportQtyInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-amber-50/50 border-2 border-amber-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-base font-mono font-bold text-slate-900 outline-hidden transition-all"
                  placeholder="👉 Tự điền số lượng kiểm đếm đợt này..."
                />
                <p className="text-[10px] text-emerald-700 italic font-medium">
                  💡 Gõ số lượng xong nhấn Enter để nhảy ngay tới ô Bắn mã QR Kệ. Hệ thống không tự điền sẵn.
                </p>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-slate-400 font-medium">Nhanh:</span>
                  {[100, 200, 500, 1000].map((preset) => {
                    const remaining = partialImportModal.originalQty - partialImportModal.alreadyImported;
                    if (preset > remaining) return null;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setImportQtyInput(preset)}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 rounded-md text-[11px] font-bold text-slate-600 transition-colors cursor-pointer"
                      >
                        +{preset}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setImportQtyInput(partialImportModal.originalQty - partialImportModal.alreadyImported)}
                    className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-md text-[11px] font-bold transition-colors cursor-pointer ml-auto"
                  >
                    Nhập hết ({(partialImportModal.originalQty - partialImportModal.alreadyImported).toLocaleString('vi-VN')})
                  </button>
                </div>
              </div>

              {/* Location Select & Scan Section */}
              <div className="space-y-2.5 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-extrabold text-slate-800 flex items-center space-x-1.5">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    <span>2. Vị trí / Kệ cất giữ linh kiện *</span>
                  </label>
                  
                  <button
                    type="button"
                    onClick={() => (isLocScannerActive ? stopLocCamera() : startLocCamera())}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                      isLocScannerActive
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{isLocScannerActive ? 'Tắt Camera Kệ' : 'Quét Camera Kệ'}</span>
                  </button>
                </div>

                {/* Inline Camera for Shelf QR Scanning */}
                {isLocScannerActive && (
                  <div className="p-3 bg-slate-900 rounded-xl space-y-2 text-white animate-in zoom-in-95">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold flex items-center text-emerald-400">
                        <MapPin className="w-3.5 h-3.5 mr-1 animate-bounce" />
                        Đưa mã QR trên Kệ vào ô vuông bên dưới
                      </span>
                      <button
                        type="button"
                        onClick={stopLocCamera}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div id="loc-qr-reader-container" className="overflow-hidden rounded-lg min-h-[180px] bg-black" />

                    {locScannerError && (
                      <p className="text-[11px] text-red-400 font-medium">{locScannerError}</p>
                    )}
                  </div>
                )}

                {/* PRIMARY: Handheld barcode gun input for Rack QR */}
                <div className="space-y-1">
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <MapPin className="w-4 h-4 text-emerald-600 absolute left-3 top-3" />
                      <input
                        ref={locScanGunInputRef}
                        type="text"
                        value={locScanGunInput}
                        onChange={(e) => {
                          setLocScanGunInput(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleLocScanResult(locScanGunInput);
                          }
                        }}
                        placeholder="🎯 Gõ mã kệ đầy đủ hoặc bắn súng quét mã QR kệ..."
                        className="w-full pl-9 pr-3 py-2.5 bg-emerald-50/60 border-2 border-emerald-400 rounded-xl text-xs font-bold text-slate-900 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-hidden transition-all"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLocScanResult(locScanGunInput)}
                      className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
                    >
                      Xác nhận Kệ
                    </button>
                  </div>
                  <p className="text-[10px] text-emerald-700 italic">
                    ⚡ Nhập chính xác mã kệ đầy đủ hoặc dùng súng quét mã QR dán trên kệ rồi nhấn Enter / Xác nhận Kệ.
                  </p>
                </div>

                {/* Status badge if location is selected */}
                {selectedLocation && (
                  <div className="p-2.5 bg-emerald-100/80 border border-emerald-300 rounded-xl flex items-center justify-between text-xs font-bold text-emerald-950">
                    <span className="flex items-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Kệ đã nhận diện: <strong className="underline text-emerald-900">{selectedLocation === '__custom__' ? customLocation : selectedLocation}</strong></span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLocation('');
                        setCustomLocation('');
                        locScanGunInputRef.current?.focus();
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-800 underline font-normal"
                    >
                      Chọn lại
                    </button>
                  </div>
                )}

                {/* SECONDARY: Searchable Location Select */}
                <div className="pt-1">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Hoặc tìm kiếm / chọn tay vị trí trong danh sách kệ:
                  </label>
                  <SearchableLocationSelect
                    locations={settings.locations || []}
                    value={selectedLocation}
                    onChange={(val) => {
                      setSelectedLocation(val);
                      if (val !== '__custom__') {
                        setCustomLocation('');
                      }
                    }}
                    placeholder="-- Tìm kiếm nhanh tên kệ hoặc mô tả kệ --"
                    allowCustom={true}
                    customValue={customLocation}
                    onCustomChange={(val) => setCustomLocation(val)}
                    theme="emerald"
                  />
                </div>
              </div>
              
              {/* Action Buttons */}
              {(() => {
                const modalTargetLoc = (selectedLocation === '__custom__' ? customLocation : selectedLocation).trim();
                const isModalQtyValid = typeof importQtyInput === 'number' && importQtyInput > 0 && importQtyInput <= (partialImportModal.originalQty - partialImportModal.alreadyImported);
                const isModalLocValid = Boolean(modalTargetLoc);
                const isModalCanSubmit = isModalQtyValid && isModalLocValid;

                return (
                  <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setPartialImportModal(null)}
                      className="px-4 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={!isModalCanSubmit}
                      className={`px-6 py-2.5 font-black rounded-xl text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                        isModalCanSubmit
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>XÁC NHẬN NHẬP KHO</span>
                    </button>
                  </div>
                );
              })()}
            </form>
          </div>
        </div>
      )}

      {/* MANUAL STOCK IN POPUP MODAL (GIAO DIỆN POPUP Y NHƯ BÊN QUÉT MÃ TỰ ĐỘNG) */}
      {manualStockInModal && manualStockInModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[94vh] sm:max-h-[90vh] border border-slate-100 animate-in zoom-in-95">
            {/* Header */}
            <div className="p-3.5 sm:p-4.5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-emerald-800 to-teal-900 text-white shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 sm:w-9 sm:h-9 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-400/30">
                  <Package className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base tracking-tight leading-tight">
                    Khai Báo Nhập Kho Linh Kiện (Thủ Công)
                  </h3>
                  <p className="text-[11px] text-emerald-200">
                    Điền số lượng thực tế & quét mã kệ để tự động lưu
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setManualStockInModal(null);
                  stopManualModalShelfCamera();
                }}
                className="p-1.5 text-emerald-200 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (selectedLocation) {
                  handleManualModalShelfScan(selectedLocation);
                }
              }}
              className="p-4 sm:p-5 space-y-4 overflow-y-auto"
            >
              {/* Cont & Part Info Box (Y như bên quét mã tự động) */}
              <div className="bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-blue-700 text-xs bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60 inline-block">
                      {manualStockInModal.part.code}
                    </span>
                    <h4 className="font-extrabold text-slate-900 text-sm mt-1 leading-snug break-words">
                      {manualStockInModal.part.name}
                    </h4>
                  </div>
                  <span className="text-[11px] font-bold text-slate-600 bg-slate-200/70 px-2.5 py-1 rounded-lg shrink-0">
                    ĐVT: {manualStockInModal.part.unit}
                  </span>
                </div>

                {manualStockInModal.contNumber && (
                  <div className="text-xs text-slate-600 flex items-center space-x-1.5">
                    <span>Mã Container:</span>
                    <strong className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                      {manualStockInModal.contNumber}
                    </strong>
                  </div>
                )}

                {/* Current Stock Stats */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/80 text-xs">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-medium">Tồn kho hiện tại</span>
                    <strong className="font-mono font-bold text-emerald-600 text-sm">
                      {manualStockInModal.part.currentStock.toLocaleString('vi-VN')} {manualStockInModal.part.unit}
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-medium">Vị trí kệ hiện tại</span>
                    <strong className="font-mono font-bold text-slate-700 text-sm truncate block">
                      {manualStockInModal.part.location || 'Chưa gán kệ'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Input Quantity (Không đề xuất sẵn, bắt buộc tự nhập) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-tight">
                    1. Số lượng thực tế nhập ({manualStockInModal.part.unit}) *
                  </label>
                  <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200/60">
                    * Bắt buộc tự nhập
                  </span>
                </div>

                <input
                  ref={manualModalQtyInputRef}
                  type="number"
                  min="1"
                  required
                  autoFocus
                  value={manualModalQtyInput === '' ? '' : manualModalQtyInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      manualModalShelfInputRef.current?.focus();
                      manualModalShelfInputRef.current?.select();
                    }
                  }}
                  onChange={(e) => setManualModalQtyInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 sm:py-3 bg-amber-50/50 border-2 border-amber-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-base sm:text-lg font-mono font-bold text-slate-900 outline-hidden transition-all shadow-xs"
                  placeholder="👉 Tự điền số lượng kiểm đếm đợt này..."
                />
                <p className="text-[10px] text-emerald-700 italic font-medium">
                  💡 Gõ số lượng xong nhấn Enter để nhảy ngay tới ô Bắn mã QR Kệ. Hệ thống không tự điền sẵn.
                </p>

                {/* Quick Presets for Mobile */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-slate-400 font-medium">Nhanh:</span>
                  {[10, 50, 100, 200, 500, 1000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setManualModalQtyInput(preset)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 transition-all cursor-pointer"
                    >
                      +{preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Location / Shelf Section (Chỉ quét kệ trong sơ đồ kho - Ảnh 2) */}
              <div className="space-y-2.5 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-slate-800 flex items-center space-x-1.5 uppercase tracking-tight">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    <span>2. Vị trí / Kệ cất giữ linh kiện *</span>
                  </label>
                  
                  <button
                    type="button"
                    onClick={() => (isManualModalShelfCamActive ? stopManualModalShelfCamera() : startManualModalShelfCamera())}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center space-x-1.5 cursor-pointer shadow-xs ${
                      isManualModalShelfCamActive
                        ? 'bg-rose-600 text-white hover:bg-rose-700'
                        : 'bg-emerald-700 text-white hover:bg-emerald-800'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{isManualModalShelfCamActive ? 'Tắt Camera Kệ' : 'Quét Camera Kệ'}</span>
                  </button>
                </div>

                {/* Inline Camera for Shelf QR Scanning */}
                {isManualModalShelfCamActive && (
                  <div className="p-3 bg-slate-900 rounded-xl space-y-2 text-white animate-in zoom-in-95 border-2 border-emerald-400">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold flex items-center text-emerald-400">
                        <MapPin className="w-3.5 h-3.5 mr-1 animate-bounce" />
                        Đưa mã QR trên Kệ vào ô vuông bên dưới
                      </span>
                      <button
                        type="button"
                        onClick={stopManualModalShelfCamera}
                        className="text-slate-400 hover:text-white p-1 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div id="manual-modal-shelf-qr-reader" className="overflow-hidden rounded-lg min-h-[180px] bg-black" />
                  </div>
                )}

                {/* PRIMARY: Handheld barcode gun input for Rack QR */}
                <div className="space-y-1">
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <MapPin className="w-4 h-4 text-emerald-600 absolute left-3 top-3.5" />
                      <input
                        ref={manualModalShelfInputRef}
                        type="text"
                        value={manualModalShelfInput}
                        onChange={(e) => setManualModalShelfInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleManualModalShelfScan(manualModalShelfInput);
                          }
                        }}
                        placeholder="🎯 Bắn súng quét mã QR kệ hoặc gõ mã kệ..."
                        className="w-full pl-9 pr-3 py-2.5 sm:py-3 bg-emerald-50/60 border-2 border-emerald-400 rounded-xl text-xs sm:text-sm font-bold text-slate-900 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-hidden transition-all"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleManualModalShelfScan(manualModalShelfInput)}
                      className="px-3.5 py-2.5 sm:py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
                    >
                      Xác nhận Kệ
                    </button>
                  </div>
                  <p className="text-[10px] text-emerald-700 italic">
                    ⚡ Bắt buộc quét mã QR kệ trong Sơ đồ vị trí kho hàng (Ảnh 2). Không được quét mã bậy bạ.
                  </p>
                </div>

                {/* Status badge if location is selected */}
                {selectedLocation && (
                  <div className="p-2.5 bg-emerald-100/90 border border-emerald-300 rounded-xl flex items-center justify-between text-xs font-bold text-emerald-950">
                    <span className="flex items-center space-x-1.5 truncate">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Kệ đã nhận diện: <strong className="underline text-emerald-900">{selectedLocation}</strong></span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLocation('');
                        manualModalShelfInputRef.current?.focus();
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-800 underline font-normal shrink-0 ml-2 cursor-pointer"
                    >
                      Chọn lại
                    </button>
                  </div>
                )}

                {/* SECONDARY: Searchable Location Select (Chỉ danh mục kệ kho) */}
                <div className="pt-1">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Hoặc chọn vị trí trong danh sách sơ đồ kệ kho:
                  </label>
                  <SearchableLocationSelect
                    locations={settings.locations || []}
                    value={selectedLocation}
                    onChange={(val) => {
                      setSelectedLocation(val);
                    }}
                    placeholder="-- Chọn kệ trong sơ đồ kho (A01, A02, A03...) --"
                    allowCustom={false}
                    theme="emerald"
                  />
                </div>

                {/* Quick Shelf Chips */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-slate-400 font-medium">Kệ nhanh:</span>
                  {(settings.locations || []).slice(0, 8).map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => {
                        setSelectedLocation(loc.name);
                        const numQty = typeof manualModalQtyInput === 'number' ? manualModalQtyInput : parseInt(String(manualModalQtyInput), 10);
                        if (numQty && numQty > 0) {
                          handleManualModalShelfScan(loc.name);
                        }
                      }}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                        selectedLocation === loc.name
                          ? 'bg-emerald-600 text-white border-emerald-700'
                          : 'bg-white text-slate-700 hover:bg-emerald-50 border-slate-200'
                      }`}
                    >
                      {loc.name.split('(')[0].trim()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              {(() => {
                const isModalQtyValid = typeof manualModalQtyInput === 'number' && manualModalQtyInput > 0;
                const isModalLocValid = Boolean(selectedLocation && findLocationMatch(selectedLocation, settings.locations || []));
                const isModalCanSubmit = isModalQtyValid && isModalLocValid;

                return (
                  <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setManualStockInModal(null);
                        stopManualModalShelfCamera();
                      }}
                      className="px-4 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={!isModalCanSubmit}
                      className={`px-6 py-2.5 font-black rounded-xl text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                        isModalCanSubmit
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>XÁC NHẬN NHẬP KHO</span>
                    </button>
                  </div>
                );
              })()}
            </form>
          </div>
        </div>
      )}

      {/* TAB 1: AUTO SCAN MODE */}
      {mainTab === 'scan' && (
        <div className="space-y-6">
          <InlineQrScanner
            mode="in"
            parts={parts}
            onScanSuccess={handleAutoStockInFromQr}
          />

          {/* Auto scan history in current session */}
          {autoScanHistory.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="font-extrabold text-xs text-slate-800 flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>DANH SÁCH LƯỢT QUÉT TỰ ĐỘNG VỪA THỰC HIỆN ({autoScanHistory.length})</span>
                </h4>
                <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
                  Đã tự động cộng vào tồn kho
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {autoScanHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-600">[{item.partCode}]</span>{' '}
                      <strong className="text-slate-900">{item.partName}</strong>
                      {item.contNumber && (
                        <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-900 text-[10px] font-bold rounded-md">
                          Cont: {item.contNumber}
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="font-black text-emerald-700 text-sm">
                        +{item.qty} {item.unit}
                      </span>
                      <p className="text-[10px] text-slate-400">Tồn mới: {item.stockAfter} • {item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MANUAL FORM MODE */}
      {mainTab === 'manual' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          {/* Step 1: Chọn Linh kiện hoặc Quét Camera phụ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center space-x-2">
                <span>1. CHỌN HOẶC QUÉT MÃ LINH KIỆN / CONT (NHẬP THỦ CÔNG) *</span>
              </label>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer"
              >
                <Camera className="w-4 h-4 text-emerald-200" />
                <span>Quét mã camera phụ</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 italic">
              ⚡ Hỗ trợ quét mã Tem Cont HOẶC quét trực tiếp mã QR / Barcode linh kiện trong danh mục.
            </p>

            {/* PRIMARY: Handheld barcode gun or manual text input to scan Part QR/Barcode or Container Tag */}
            <div className="space-y-1">
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <Package className="w-4 h-4 text-emerald-600 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    value={manualPartScanInput}
                    onChange={(e) => setManualPartScanInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleManualPartLookup(manualPartScanInput);
                      }
                    }}
                    placeholder="🎯 Bắn súng quét mã Cont hoặc Barcode / QR linh kiện rồi Enter..."
                    className="w-full pl-9 pr-3 py-2.5 sm:py-3 bg-emerald-50/60 border-2 border-emerald-400 rounded-xl text-xs sm:text-sm font-bold text-slate-900 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-hidden transition-all shadow-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleManualPartLookup(manualPartScanInput)}
                  className="px-3.5 py-2.5 sm:py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
                >
                  Tra cứu
                </button>
              </div>
            </div>

            <SearchableSelect
              options={partOptions}
              value={selectedPartId}
              onChange={(val) => {
                setSelectedPartId(val);
                const found = parts.find((p) => p.id === val);
                if (found) {
                  openManualStockInModal(found);
                }
              }}
              placeholder="Gõ mã, tên linh kiện hoặc vị trí để tìm..."
              allowCustom={false}
              icon={<Package className="w-4 h-4 text-emerald-600" />}
            />

            {/* Selected Part Quick Summary Card */}
            {selectedPart && (
              <div className="p-4 bg-emerald-50/70 border-2 border-emerald-300 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-200 shadow-xs">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
                    <Package className="w-5 h-5 text-emerald-700 shrink-0" />
                  </div>
                  <div>
                    <p className="font-extrabold text-sm text-slate-900">{selectedPart.name}</p>
                    <p className="text-slate-600 font-mono text-xs">
                      Mã: <strong>{selectedPart.code}</strong> {selectedPart.location && <>| Vị trí kệ: <strong>{selectedPart.location}</strong></>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 ml-auto">
                  <div className="text-right">
                    <span className="text-slate-500 text-[11px] font-medium">Tồn kho hiện tại:</span>
                    <p className="text-base font-black text-emerald-700">
                      {selectedPart.currentStock.toLocaleString('vi-VN')} {selectedPart.unit}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openManualStockInModal(selectedPart)}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95"
                  >
                    <Package className="w-4 h-4 text-emerald-200" />
                    <span>Mở Popup Nhập Kho</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Workflow guide & status */}
          <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200/80 space-y-2">
            <h4 className="text-xs font-black text-emerald-950 uppercase tracking-tight flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Quy trình nhập kho thủ công (Popup thông minh chuẩn di động)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200 shadow-2xs">
                <span className="font-bold text-emerald-700 block text-[11px]">Bước 1: Quét mã hoặc chọn</span>
                <p className="text-slate-600 text-[11px] mt-0.5">Bắn mã vạch/QR tem Cont hoặc mã linh kiện trong danh mục. Popup sẽ tự động bật lên.</p>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200 shadow-2xs">
                <span className="font-bold text-emerald-700 block text-[11px]">Bước 2: Điền số lượng</span>
                <p className="text-slate-600 text-[11px] mt-0.5">Bắt buộc tự gõ số lượng thực tế kiểm đếm (không đề xuất sẵn). Nhấn Enter để sang ô Kệ.</p>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200 shadow-2xs">
                <span className="font-bold text-emerald-700 block text-[11px]">Bước 3: Quét kệ sơ đồ kho</span>
                <p className="text-slate-600 text-[11px] mt-0.5">Quét mã QR kệ trong sơ đồ kho (Ảnh 2). Hệ thống tự động hoàn thành ngay lập tức.</p>
              </div>
            </div>
          </div>

          {/* Session history of manual stock-in */}
          {autoScanHistory.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="font-extrabold text-xs text-slate-800 flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>CÁC LƯỢT NHẬP KHO VỪA THỰC HIỆN ({autoScanHistory.length})</span>
                </h4>
                <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
                  Đã tự động cộng vào tồn kho & lưu thẻ kho
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {autoScanHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-600">[{item.partCode}]</span>{' '}
                      <strong className="text-slate-900">{item.partName}</strong>
                      {item.contNumber && (
                        <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-900 text-[10px] font-bold rounded-md">
                          Cont: {item.contNumber}
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="font-black text-emerald-700 text-sm">
                        +{item.qty} {item.unit}
                      </span>
                      <p className="text-[10px] text-slate-400">Tồn mới: {item.stockAfter} • {item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: EXCEL IMPORT MODE */}
      {mainTab === 'excel' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  NHẬP KHO HÀNG LOẠT BẰNG FILE EXCEL
                </h3>
                <p className="text-xs text-slate-500">
                  Tải lên file Excel theo cấu trúc Ảnh 3. Hệ thống sẽ mở bảng Popup xác nhận các linh kiện hợp lệ trước khi nhập kho.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={downloadSampleStockInExcel}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Tải File Mẫu Excel (.xlsx)</span>
            </button>
          </div>

          {/* Drag & drop upload card */}
          <div
            onClick={() => {
              setExcelInFile(null);
              setIsExcelInModalOpen(true);
            }}
            className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/70 p-8 rounded-3xl text-center cursor-pointer transition-all space-y-3 group"
          >
            <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto shadow-xs group-hover:scale-105 transition-transform">
              <Upload className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-base font-black text-slate-800">
                Nhấn vào đây để tải file Excel hoặc mở bảng Popup kiểm tra
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
                Hệ thống tự động đọc Cột 1 (STT), Cột 2 (Mã VT), Cột 3 (Tên VT), Cột 4 (ĐVT), Cột 5 (SL đề nghị), Cột 8 (Vị trí nhập kho). Bỏ qua cột 6, 7.
              </p>
            </div>
            <button
              type="button"
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all inline-flex items-center space-x-2"
            >
              <FileSpreadsheet className="w-4 h-4 text-amber-300" />
              <span>Chọn File Excel & Bắt Đầu Nhập Kho</span>
            </button>
          </div>

          {/* Quick Specifications Guide */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
            <h5 className="font-extrabold text-slate-800 flex items-center space-x-1.5">
              <Info className="w-4 h-4 text-blue-600" />
              <span>Quy cách các cột file Excel (Chuẩn theo Ảnh 3):</span>
            </h5>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 block font-mono">Cột A (1):</span>
                <strong className="text-slate-800 font-bold">STT</strong>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 block font-mono">Cột B (2):</span>
                <strong className="text-emerald-700 font-black">Mã VT (Mã LK)</strong>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 block font-mono">Cột C (3):</span>
                <strong className="text-slate-800 font-bold">Tên VT</strong>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 block font-mono">Cột D (4):</span>
                <strong className="text-slate-800 font-bold">ĐVT</strong>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 block font-mono">Cột E (5):</span>
                <strong className="text-blue-700 font-black">SL đề nghị (Nhập)</strong>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 block font-mono">Cột F (6), G (7):</span>
                <span className="text-slate-400 italic">Bỏ qua</span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 block font-mono">Cột H (8):</span>
                <strong className="text-amber-700 font-black">Vị trí nhập kho</strong>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 block font-mono">Số thập phân:</span>
                <span className="text-emerald-700 font-bold">3,90 / 1.000,00</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Excel Stock In Modal (Image 3) */}
      <ExcelStockInModal
        isOpen={isExcelInModalOpen}
        onClose={() => {
          setIsExcelInModalOpen(false);
          setExcelInFile(null);
        }}
        parts={parts}
        settings={settings}
        initialFile={excelInFile}
        onSuccess={() => {
          onSuccess();
          setIsExcelInModalOpen(false);
          setExcelInFile(null);
        }}
      />

      {/* QR Scanner Modal */}
      <QrScannerModal
        mode="in"
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        parts={parts}
        allowDirectPartCode={mainTab === 'manual'}
        onSelectPart={(p, autoQty, autoCont, tagId) => {
          setSelectedPartId(p.id);
          setIsQrModalOpen(false);
          if (mainTab === 'manual') {
            // Manual tab: Open the POPUP modal immediately (Giao diện popup y như bên quét mã tự động)
            openManualStockInModal(p, autoCont, tagId);
          } else {
            if (autoQty !== undefined && autoQty > 0) {
              setQuantity(autoQty);
            }
            if (autoQty !== undefined || autoCont) {
              setMessage({
                type: 'success',
                text: `Đã tự động chọn [${p.code}] ${p.name}${autoQty ? ` và điền số lượng: ${autoQty.toLocaleString('vi-VN')} ${p.unit}` : ''}${autoCont ? ` từ Cont ${autoCont}` : ''}!`,
              });
            }
            if (autoCont) {
              setReason(`Nhập kho theo Cont ${autoCont}`);
            }
            if (tagId) {
              setScannedTagId(tagId);
            }
          }
        }}
      />

      {/* Container Import & QR Print Modal */}
      <ContainerImportPrintModal
        isOpen={isContModalOpen}
        onClose={() => setIsContModalOpen(false)}
        parts={parts}
        settings={settings}
        onRefreshParts={onSuccess}
      />

      {/* ERROR POPUP MODAL */}
      {errorModal && errorModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-rose-500 text-center space-y-4 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto border-4 border-rose-200">
              <AlertCircle className="w-10 h-10 text-rose-600" />
            </div>
            <div>
              <h3 className="text-lg font-black text-rose-700 uppercase tracking-tight">
                {errorModal.title}
              </h3>
              <p className="text-xs sm:text-sm font-semibold text-slate-700 mt-2 leading-relaxed">
                {errorModal.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setErrorModal(null)}
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer"
            >
              ĐÓNG & KIỂM TRA LẠI
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
