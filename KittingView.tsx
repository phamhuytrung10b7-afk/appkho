import React, { useState, useEffect } from 'react';
import { KittingQueueItem, AppSettings, BufferLocationMap } from './types';
import { storageService } from './storage';
import { MasterKittingTag } from './masterExcelParser';
import { PART_GROUP_COLORS, getPartGroupConfig } from './partGroupColors';
import { ContainerTagManagerModal } from './ContainerTagManagerModal';
import { CustomTagManagerModal } from './CustomTagManagerModal';
import { InlineQrScanner } from './InlineQrScanner';
import { SmoothCameraScanner } from './SmoothCameraScanner';
import { findLocationMatch } from './StockInView';
import { normalizeLocationStr } from './StockOutScanModal';
import {
  Scissors,
  CheckCircle2,
  Clock,
  User,
  Package,
  AlertTriangle,
  QrCode,
  Check,
  BarChart2,
  Trash2,
  Tag,
  AlertCircle,
  Sparkles,
  X,
  XCircle,
  MapPin,
  ShieldCheck,
  Calendar,
  Filter,
  Search,
  RotateCcw,
} from 'lucide-react';

interface KittingViewProps {
  queue: KittingQueueItem[];
  settings: AppSettings;
  buffers: BufferLocationMap[];
  onRefresh: () => void;
}

export const KittingView: React.FC<KittingViewProps> = ({
  queue,
  settings,
  buffers,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'smart_scan' | 'pending' | 'history'>('smart_scan');
  const [selectedItem, setSelectedItem] = useState<KittingQueueItem | null>(null);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isCustomTagManagerOpen, setIsCustomTagManagerOpen] = useState(false);

  // Current Logged in User name
  const currentUser = storageService.getCurrentUser();
  const currentOperatorName = currentUser
    ? `${currentUser.fullName} (${currentUser.roleTitle || currentUser.username})`
    : settings.staffList[0] || 'Lê Hoàng Nam';

  // Smart Scan States
  const [qrInputText, setQrInputText] = useState('');
  const [scannedTag, setScannedTag] = useState<MasterKittingTag | null>(null);
  const [masterTags, setMasterTags] = useState<MasterKittingTag[]>([]);
  const [isAutoKittingModalOpen, setIsAutoKittingModalOpen] = useState(false);
  const [isModalLocationCameraOpen, setIsModalLocationCameraOpen] = useState(false);

  // Smart Kitting Form Fields
  const [partCode, setPartCode] = useState('');
  const [partName, setPartName] = useState('');
  const [ccdcSpec, setCcdcSpec] = useState('');
  const [groupName, setGroupName] = useState('NHÓM ĐIỆN');
  const [groupColorHex, setGroupColorHex] = useState('#3182CE');
  const [standardQty, setStandardQty] = useState<number>(100);
  const [actualQty, setActualQty] = useState<number>(100);
  const [unit, setUnit] = useState('cái/bộ');
  const [isOverride, setIsOverride] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('Thùng thô dư lẻ (Thiếu từ NCC)');
  const [scrapQty, setScrapQty] = useState<number>(0);
  const [operator, setOperator] = useState<string>(currentOperatorName);
  const [targetBuffer, setTargetBuffer] = useState<string>('BUFFER-A1-01');

  // Scanner toggles
  const [isCameraScanning, setIsCameraScanning] = useState(false);
  const [isBufferQrScanning, setIsBufferQrScanning] = useState(false);

  // Result Popup Modal State (Prominent OK or Error Notification)
  const [resultModal, setResultModal] = useState<{
    isOpen: boolean;
    isSuccess: boolean;
    title: string;
    message: string;
    details?: {
      partCode: string;
      partName: string;
      qty: number;
      unit: string;
      bufferLocation: string;
      operatorName: string;
      exceptionNote?: string;
    };
  } | null>(null);

  // Compact Toast Notification
  const [compactToast, setCompactToast] = useState<string | null>(null);

  useEffect(() => {
    const loaded = storageService.getMasterContainerTags();
    setMasterTags(loaded);
  }, []);

  useEffect(() => {
    if (currentUser) {
      setOperator(`${currentUser.fullName} (${currentUser.roleTitle || currentUser.username})`);
    }
  }, [currentUser]);

  const isAdmin = storageService.isAdminUser(currentUser);

  // Filter items
  const rawPendingItems = queue.filter((i) => i.status === 'PENDING_KITTING');
  const pendingItems = rawPendingItems;
  const completedItems = queue.filter((i) => i.status === 'IN_BUFFER' || i.status === 'DELIVERED');

  // Date Filtering State for History Tab (Lịch sử bóc tách) - Defaults to Today
  const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDaysAgoStr = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [historyStartDate, setHistoryStartDate] = useState<string>(getTodayStr);
  const [historyEndDate, setHistoryEndDate] = useState<string>(getTodayStr);
  const [historyPreset, setHistoryPreset] = useState<'today' | '3days' | '7days' | '35days' | 'custom'>('today');
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  const applyHistoryPreset = (preset: 'today' | '3days' | '7days' | '35days') => {
    setHistoryPreset(preset);
    const today = getTodayStr();
    setHistoryEndDate(today);
    if (preset === 'today') {
      setHistoryStartDate(today);
    } else if (preset === '3days') {
      setHistoryStartDate(getDaysAgoStr(2));
    } else if (preset === '7days') {
      setHistoryStartDate(getDaysAgoStr(6));
    } else if (preset === '35days') {
      setHistoryStartDate(getDaysAgoStr(34));
    }
  };

  // Filter completed items by date range and search keyword
  const filteredCompletedItems = completedItems.filter((item) => {
    const timeStr = item.endTime || item.createdAt;
    if (timeStr) {
      const itemDate = new Date(timeStr);
      if (!isNaN(itemDate.getTime())) {
        if (historyStartDate) {
          const [sYear, sMonth, sDay] = historyStartDate.split('-').map(Number);
          const start = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0);
          if (itemDate.getTime() < start.getTime()) return false;
        }
        if (historyEndDate) {
          const [eYear, eMonth, eDay] = historyEndDate.split('-').map(Number);
          const end = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999);
          if (itemDate.getTime() > end.getTime()) return false;
        }
      }
    }

    if (historySearchQuery.trim()) {
      const q = historySearchQuery.toLowerCase().trim();
      const match =
        item.partCode.toLowerCase().includes(q) ||
        item.partName.toLowerCase().includes(q) ||
        (item.operatorName && item.operatorName.toLowerCase().includes(q)) ||
        (item.bufferLocation && item.bufferLocation.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const totalFilteredKittedQty = filteredCompletedItems.reduce((sum, i) => sum + (i.kittedQuantity || 0), 0);
  const totalFilteredScrapQty = filteredCompletedItems.reduce((sum, i) => sum + (i.scrapQuantity || 0), 0);

  // Group pending items by partCode (case insensitive)
  interface PendingGroup {
    partCode: string;
    partName: string;
    unit: string;
    totalRawQuantity: number;
    batches: Array<{
      id: string;
      createdAt: string;
      rawQuantity: number;
      transactionId?: string;
    }>;
  }

  const groupedPendingMap = new Map<string, PendingGroup>();

  rawPendingItems.forEach((item) => {
    const key = item.partCode.trim().toLowerCase();
    const existing = groupedPendingMap.get(key);
    if (existing) {
      existing.totalRawQuantity += item.rawQuantity;
      existing.batches.push({
        id: item.id,
        createdAt: item.createdAt,
        rawQuantity: item.rawQuantity,
        transactionId: item.transactionId,
      });
    } else {
      groupedPendingMap.set(key, {
        partCode: item.partCode,
        partName: item.partName,
        unit: item.unit || 'Cái',
        totalRawQuantity: item.rawQuantity,
        batches: [
          {
            id: item.id,
            createdAt: item.createdAt,
            rawQuantity: item.rawQuantity,
            transactionId: item.transactionId,
          },
        ],
      });
    }
  });

  // Sort batches inside each group by createdAt ASC (oldest first for FIFO)
  groupedPendingMap.forEach((group) => {
    group.batches.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });

  const groupedPendingList = Array.from(groupedPendingMap.values());

  // Handle Scanning or Selecting a Container Tag
  const handleProcessTagSelection = (tag: MasterKittingTag) => {
    setScannedTag(tag);
    setPartCode(tag.partCode || '');
    setPartName(tag.partName || '');
    setCcdcSpec(tag.ccdcSpec || '');
    setGroupName(tag.groupName || tag.groupConfig.name);
    setGroupColorHex(tag.groupConfig.colorHex);

    const stdQty = tag.standardQty && tag.standardQty > 0 ? tag.standardQty : 0;
    setStandardQty(stdQty);
    setActualQty(stdQty);
    setUnit(tag.unit || 'cái/bộ');

    if (stdQty === 0) {
      setIsOverride(true);
      setExceptionReason('Thẻ Thùng chưa có định mức sẵn trong Excel (Cần điền khi quét)');
    } else {
      setIsOverride(false);
    }

    // Auto find buffer
    const matchingBuf = buffers.find((b) => b.partCode === tag.partCode && b.status !== 'EMPTY');
    const emptyBuf = buffers.find((b) => b.status === 'EMPTY');
    setTargetBuffer(matchingBuf ? matchingBuf.locationId : emptyBuf ? emptyBuf.locationId : 'BUFFER-A1-01');

    // Automatically open popup modal for Kitting Info
    setIsAutoKittingModalOpen(true);
  };

  // Parse Raw QR Code payload strictly matching Master Data or Custom Generated Container Tags
  const handleParseQrPayload = (payloadStr: string) => {
    if (!payloadStr) return;
    const cleanStr = payloadStr.trim();
    if (!cleanStr) return;

    const validation = storageService.findAndValidateContainerTag(cleanStr);

    if (!validation.isValid || !validation.matchedTag) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'MÃ THẺ THÙNG KHÔNG HỢP LỆ',
        message: validation.errorReason || `⛔ Mã QR "${cleanStr}" KHÔNG TỒN TẠI trong Danh Sách Thẻ Thùng Master Data (539 Thẻ) hoặc Thẻ Thùng Phát Sinh! Hệ thống chỉ chấp nhận các mã Thẻ Thùng hợp lệ đã được khai báo.`,
      });
      return;
    }

    // Found valid Master Tag or Custom Tag
    const tagToProcess: MasterKittingTag = {
      ...validation.matchedTag,
      standardQty: validation.extractedQty !== undefined ? validation.extractedQty : validation.matchedTag.standardQty,
    };

    handleProcessTagSelection(tagToProcess);
  };

  const handleOpenQueueKittingModal = (item: KittingQueueItem) => {
    setSelectedItem(item);
    setPartCode(item.partCode);
    setPartName(item.partName);
    setStandardQty(item.rawQuantity);
    setActualQty(item.rawQuantity);
    setUnit(item.unit);
    setScrapQty(0);

    const grpConfig = getPartGroupConfig(item.partName);
    setGroupName(grpConfig.name);
    setGroupColorHex(grpConfig.colorHex);

    const matchingBuf = buffers.find((b) => b.partCode === item.partCode && b.status !== 'EMPTY');
    const emptyBuf = buffers.find((b) => b.status === 'EMPTY');
    setTargetBuffer(matchingBuf ? matchingBuf.locationId : emptyBuf ? emptyBuf.locationId : 'BUFFER-A1-01');
    setIsAutoKittingModalOpen(true);
  };

  // Execution & Strict Queue Validation for Smart Kitting
  const executeSmartKitting = (chosenBuffer?: string) => {
    const finalBufferRaw = (chosenBuffer || targetBuffer).trim();

    if (!finalBufferRaw) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'BÓC TÁCH THẤT BẠI',
        message: '⚠️ Vui lòng quét hoặc chọn vị trí Kệ Outbuffer!',
      });
      return;
    }

    // STRICT VALIDATION: Check if finalBufferRaw matches a valid buffer or system location
    const matchedBuf = buffers.find(
      (b) =>
        b.locationId.toLowerCase() === finalBufferRaw.toLowerCase() ||
        (b.locationName && b.locationName.toLowerCase() === finalBufferRaw.toLowerCase()) ||
        normalizeLocationStr(b.locationId) === normalizeLocationStr(finalBufferRaw)
    );
    const matchedSettingsLoc = findLocationMatch(finalBufferRaw, settings.locations || []);

    if (!matchedBuf && !matchedSettingsLoc) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'BÓC TÁCH THẤT BẠI',
        message: `❌ MÃ KỆ OUTBUFFER KHÔNG TỒN TẠI! Vị trí kệ "${finalBufferRaw}" KHÔNG CÓ TRONG DANH MỤC kệ Outbuffer / Kệ kho đã khai báo trong hệ thống. Vui lòng chọn hoặc quét kệ hợp lệ!`,
      });
      return;
    }

    const finalBuffer = matchedBuf ? matchedBuf.locationId : matchedSettingsLoc ? matchedSettingsLoc.name : finalBufferRaw;

    if (!partCode) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'BÓC TÁCH THẤT BẠI',
        message: 'Vui lòng quét hoặc chọn Mã Linh Kiện trước khi thực hiện bóc tách!',
      });
      return;
    }

    if (!actualQty || actualQty <= 0) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'BÓC TÁCH THẤT BẠI',
        message: '⚠️ SỐ LƯỢNG BÓC TÁCH BẮT BUỘC! Vui lòng nhập số lượng kitting thực tế lớn hơn 0.',
      });
      return;
    }

    // STRICT RULE: Only allow kitting within available quantity of the pending queue (Danh Sách Chờ Bóc Tách)
    const allQueue = storageService.getKittingQueue();
    const pendingForPart = allQueue.filter(
      (item) =>
        item.status === 'PENDING_KITTING' &&
        item.partCode.trim().toLowerCase() === partCode.trim().toLowerCase()
    );

    const totalPendingAvailable = pendingForPart.reduce(
      (sum, item) => sum + (item.rawQuantity || 0),
      0
    );

    if (pendingForPart.length === 0 || totalPendingAvailable <= 0) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'BÓC TÁCH THẤT BẠI',
        message: `Mã linh kiện [${partCode}] KHÔNG CÓ TRONG DANH SÁCH CHỜ BÓC TÁCH! Hệ thống không cho phép bóc tách tự do nếu chưa có đơn xuất thô từ Kho.`,
      });
      return;
    }

    if (actualQty > totalPendingAvailable) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'BÓC TÁCH THẤT BẠI',
        message: `SỐ LƯỢNG BÓC TÁCH KHÔNG ĐỦ! Trong Danh Sách Chờ Bóc Tách hiện chỉ có ${totalPendingAvailable} ${unit}, nhưng bạn đang yêu cầu bóc tách ${actualQty} ${unit}. Không được phép bóc tách quá số lượng cho phép!`,
      });
      return;
    }

    // Process deduction from pending queue
    try {
      let remainingToKitting = actualQty;

      // If a specific queue item was clicked
      if (selectedItem && selectedItem.partCode.toLowerCase() === partCode.toLowerCase()) {
        const currentItemInQueue = allQueue.find((q) => q.id === selectedItem.id);
        if (currentItemInQueue && currentItemInQueue.status === 'PENDING_KITTING') {
          if (remainingToKitting <= currentItemInQueue.rawQuantity) {
            if (remainingToKitting < currentItemInQueue.rawQuantity) {
              const leftover = currentItemInQueue.rawQuantity - remainingToKitting;
              storageService.completeKittingItem({
                id: currentItemInQueue.id,
                kittedQuantity: remainingToKitting,
                scrapQuantity: scrapQty,
                bufferLocation: finalBuffer,
                operatorName: operator,
                durationMinutes: 15,
              });
              const newPendingLeftover: KittingQueueItem = {
                ...currentItemInQueue,
                id: 'kit-remain-' + Date.now(),
                rawQuantity: leftover,
                kittedQuantity: 0,
                status: 'PENDING_KITTING',
                createdAt: currentItemInQueue.createdAt, // Preserve original timestamp for FIFO
              };
              const refreshedQueue = storageService.getKittingQueue();
              refreshedQueue.unshift(newPendingLeftover);
              storageService.saveKittingQueue(refreshedQueue);
            } else {
              storageService.completeKittingItem({
                id: currentItemInQueue.id,
                kittedQuantity: remainingToKitting,
                scrapQuantity: scrapQty,
                bufferLocation: finalBuffer,
                operatorName: operator,
                durationMinutes: 15,
              });
            }
            remainingToKitting = 0;
          }
        }
      }

      // If remainingToKitting > 0, consume sequentially from pending queue
      if (remainingToKitting > 0) {
        for (const pItem of pendingForPart) {
          if (remainingToKitting <= 0) break;

          const freshQueue = storageService.getKittingQueue();
          const freshItem = freshQueue.find((i) => i.id === pItem.id && i.status === 'PENDING_KITTING');
          if (!freshItem) continue;

          if (freshItem.rawQuantity <= remainingToKitting) {
            storageService.completeKittingItem({
              id: freshItem.id,
              kittedQuantity: freshItem.rawQuantity,
              scrapQuantity: scrapQty,
              bufferLocation: finalBuffer,
              operatorName: operator,
              durationMinutes: 15,
            });
            remainingToKitting -= freshItem.rawQuantity;
          } else {
            const leftover = freshItem.rawQuantity - remainingToKitting;
            storageService.completeKittingItem({
              id: freshItem.id,
              kittedQuantity: remainingToKitting,
              scrapQuantity: scrapQty,
              bufferLocation: finalBuffer,
              operatorName: operator,
              durationMinutes: 15,
            });
            const newPendingLeftover: KittingQueueItem = {
              ...freshItem,
              id: 'kit-remain-' + Date.now(),
              rawQuantity: leftover,
              kittedQuantity: 0,
              status: 'PENDING_KITTING',
              createdAt: freshItem.createdAt, // Preserve original timestamp for FIFO
            };
            const refreshedQueue = storageService.getKittingQueue();
            refreshedQueue.unshift(newPendingLeftover);
            storageService.saveKittingQueue(refreshedQueue);
            remainingToKitting = 0;
          }
        }
      }

      // Always log scan event for productivity reporting when items are pushed to OUTBUFFER shelf
      storageService.addKittingScanLog({
        partCode,
        partName: partName || partCode,
        unit: unit || 'Cái',
        quantity: actualQty,
        timestamp: new Date().toISOString(),
        bufferLocation: finalBuffer,
        operatorName: operator,
      });

      // AUTO GENERATE & SAVE SEPARATE CUSTOM CONTAINER TAG IF QTY / SPEC DIFFERS
      if (actualQty !== standardQty || isQtyDifference || !scannedTag) {
        const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const grpCfg = getPartGroupConfig(groupName || partName);
        storageService.addCustomGeneratedContainerTag({
          id: `custom-kitting-${Date.now()}`,
          stt: `Số ${timeStr}`,
          partCode: partCode.trim().toUpperCase(),
          partName: partName || `Linh kiện ${partCode.trim()}`,
          standardQty: actualQty,
          unit: unit || 'cái/bộ',
          groupName: grpCfg.name,
          ccdcSpec: ccdcSpec || `Phát sinh tùy chỉnh (${actualQty} ${unit || 'cái/bộ'})`,
          groupConfig: grpCfg,
          qrPayload: `CONT_IN|${partCode.trim()}|${actualQty}|${unit || 'cái/bộ'}|${grpCfg.id}`,
          createdAt: new Date().toISOString(),
          createdReason: exceptionReason || `Bóc tách phát sinh khác quy cách chuẩn (${standardQty})`,
          isCustomGenerated: true,
        });
      }

      const overrideNote = isQtyDifference ? ` (Ghi đè: ${exceptionReason})` : '';

      // Show compact small notification toast and close popup modal
      setCompactToast(
        `✅ BÓC TÁCH KITTING THÀNH CÔNG: +${actualQty} ${unit} [${partCode}] ➔ Kệ Outbuffer [${finalBuffer}].`
      );
      setIsAutoKittingModalOpen(false);

      // Reset form
      setScannedTag(null);
      setPartCode('');
      setPartName('');
      setCcdcSpec('');
      setSelectedItem(null);
      setQrInputText('');
      setActualQty(100);
      setStandardQty(100);
      onRefresh();
    } catch (err: any) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'BÓC TÁCH THẤT BẠI',
        message: err.message || 'Đã xảy ra lỗi trong quá trình bóc tách kitting!',
      });
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSmartKitting();
  };

  // Auto-confirm execution when Rack QR is scanned via Scanner/Camera
  const handleScanBufferQrSuccess = (scannedText: string) => {
    const clean = scannedText.trim();
    if (!clean) return;

    const matchedBuf = buffers.find(
      (b) =>
        b.locationId.toLowerCase() === clean.toLowerCase() ||
        (b.locationName && b.locationName.toLowerCase() === clean.toLowerCase()) ||
        normalizeLocationStr(b.locationId) === normalizeLocationStr(clean)
    );
    const matchedSettingsLoc = findLocationMatch(clean, settings.locations || []);

    if (!matchedBuf && !matchedSettingsLoc) {
      setIsBufferQrScanning(false);
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'BÓC TÁCH THẤT BẠI',
        message: `❌ MÃ KỆ OUTBUFFER KHÔNG TỒN TẠI! Mã QR kệ "${clean}" KHÔNG TỒN TẠI trong danh mục kệ kho / Outbuffer của hệ thống. Vui lòng quét đúng mã QR kệ hợp lệ!`,
      });
      return;
    }

    const selectedBuf = matchedBuf ? matchedBuf.locationId : matchedSettingsLoc ? matchedSettingsLoc.name : clean;
    setTargetBuffer(selectedBuf);
    setIsBufferQrScanning(false);

    // AUTO-SUBMIT / AUTO-CONFIRM WHEN SCANNED VIA QR
    setTimeout(() => {
      executeSmartKitting(selectedBuf);
    }, 150);
  };

  const handleDeleteItem = (id: string) => {
    if (!isAdmin) {
      alert('Chỉ tài khoản Quản trị viên (ADMIN) mới có quyền xóa dữ liệu!');
      return;
    }
    if (window.confirm('Bạn có chắc chắn muốn xóa bản ghi bóc tách này khỏi hàng chờ?')) {
      storageService.deleteKittingItem(id);
      onRefresh();
    }
  };

  const handleDeleteBatch = (batchId: string, partCode: string) => {
    if (!isAdmin) {
      alert('Chỉ tài khoản Quản trị viên (ADMIN) mới có quyền xóa dữ liệu!');
      return;
    }
    if (window.confirm(`Bạn có chắc chắn muốn xóa mốc thời gian/lô này của linh kiện [${partCode}] khỏi hàng chờ?`)) {
      storageService.deleteKittingItem(batchId);
      onRefresh();
    }
  };

  const handleDeleteGroup = (partCode: string, batches: Array<{ id: string }>) => {
    if (!isAdmin) {
      alert('Chỉ tài khoản Quản trị viên (ADMIN) mới có quyền xóa dữ liệu!');
      return;
    }
    if (window.confirm(`Bạn có chắc chắn muốn xóa TẤT CẢ mốc/lô chờ bóc tách của linh kiện [${partCode}] không?`)) {
      batches.forEach((b) => {
        storageService.deleteKittingItem(b.id);
      });
      onRefresh();
    }
  };

  const isQtyDifference = actualQty !== standardQty;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-950 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-2 bg-blue-500/30 border border-blue-300/30 text-blue-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>SMART KITTING & CONTAINER TAG SYSTEM</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center space-x-2">
              <span>Bóc Tách Kitting Thông Minh & Quản Lý Thẻ Thùng</span>
            </h1>
            <p className="text-blue-200 text-xs sm:text-sm max-w-2xl">
              Quét Mã QR Thẻ Thùng ➜ Tự động điền linh kiện ➜ Kiểm tra số lượng Danh Sách Chờ ➜ Đẩy lên Kệ OUTBUFFER.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsTagManagerOpen(true)}
              className="px-3.5 py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-2xl shadow-lg transition-all cursor-pointer flex items-center space-x-1.5"
            >
              <Tag className="w-4 h-4" />
              <span>Thẻ Thùng Master Data ({masterTags.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCustomTagManagerOpen(true)}
              className="px-3.5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-2xl shadow-lg transition-all cursor-pointer flex items-center space-x-1.5 border border-purple-400/30"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Thẻ Thùng Phát Sinh (Tùy Chỉnh)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Compact Toast Notification */}
      {compactToast && (
        <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950 text-xs sm:text-sm font-bold flex items-center justify-between shadow-xs animate-in zoom-in-95">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 text-lg" />
            <span>{compactToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setCompactToast(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold px-2.5 py-1 rounded-lg bg-emerald-200/80 hover:bg-emerald-300 cursor-pointer text-xs"
          >
            ✕ Đóng
          </button>
        </div>
      )}

      {/* Main Navigation Tabs */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50 p-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('smart_scan')}
            className={`flex-1 py-3 px-4 rounded-2xl font-black text-xs sm:text-sm transition-all flex items-center justify-center space-x-2 cursor-pointer ${
              activeTab === 'smart_scan'
                ? 'bg-blue-800 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <QrCode className="w-4 h-4 text-amber-300" />
            <span>1. QUÉT THẺ THÙNG KITTING SMART</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center space-x-2 cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-blue-800 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>2. DANH SÁCH CHỜ BÓC TÁCH ({groupedPendingList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center space-x-2 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-blue-800 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span>3. LỊCH SỬ BÓC TÁCH ({completedItems.length})</span>
          </button>
        </div>

        {/* Tab 1: Smart Scan & Kitting Execution */}
        {activeTab === 'smart_scan' && (
          <div className="p-4 sm:p-6 space-y-6">
            {/* Step 1: Scan / Input Container Tag Bar */}
            <div className="p-5 bg-blue-50/70 border border-blue-200 rounded-3xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-blue-950 flex items-center space-x-2">
                    <QrCode className="w-5 h-5 text-blue-700" />
                    <span>QUÉT MÃ QR TRÊN THẺ THÙNG CONTAINER TAG</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Đưa súng quét hoặc Camera quét mã QR trên Thẻ Thùng. Chuỗi mã hóa <code className="bg-blue-200 px-1 rounded font-mono text-blue-900">[Mã_VT]|[Số_Lượng_Định_Mức]|[Mã_Nhóm]</code>.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsCameraScanning(!isCameraScanning)}
                    className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>{isCameraScanning ? 'Ẩn Camera' : 'Quét Camera QR'}</span>
                  </button>
                </div>
              </div>

              {isCameraScanning && (
                <SmoothCameraScanner
                  onScanSuccess={(scannedText) => {
                    setIsCameraScanning(false);
                    handleParseQrPayload(scannedText);
                  }}
                  onClose={() => setIsCameraScanning(false)}
                  placeholderText="Căn mã QR Thẻ Thùng vào giữa khung hình camera..."
                  autoCloseOnScan={true}
                />
              )}

              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={qrInputText}
                  onChange={(e) => setQrInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleParseQrPayload(qrInputText);
                    }
                  }}
                  placeholder="Nhập hoặc quét chuỗi QR code e.g. 02-33-07-SHB3336-0000|100|DIEN..."
                  className="flex-1 px-4 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-600 outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => handleParseQrPayload(qrInputText)}
                  className="px-5 py-2.5 bg-blue-800 hover:bg-blue-900 text-white font-extrabold text-xs rounded-xl shadow-sm cursor-pointer"
                >
                  Xác Nhận Quét
                </button>
              </div>
            </div>

            {/* Step 2: Clean Guidance & Buffer Racks Overview (Replaces redundant inline form) */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
                <div className="p-2.5 bg-blue-100 text-blue-800 rounded-2xl">
                  <Sparkles className="w-5 h-5 text-blue-700 animate-pulse" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm sm:text-base text-slate-900">
                    HƯỚNG DẪN BÓC TÁCH KITTING TỰ ĐỘNG
                  </h4>
                  <p className="text-xs text-slate-500">
                    Quét Mã QR Thẻ Thùng ở khung quét trên. Bảng Popup [Phiếu Bóc Tách Kitting] sẽ tự động hiển thị để bạn kiểm tra & chọn Kệ Outbuffer.
                  </p>
                </div>
              </div>

              {/* Status Indicator & Quick Buffer Racks Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <span className="font-extrabold text-slate-700 block uppercase text-[10px]">
                    📍 TRẠNG THÁI KỆ OUTBUFFER ({buffers.filter((b) => b.status === 'EMPTY').length} Kệ Trống)
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {buffers.slice(0, 6).map((b) => (
                      <div
                        key={b.locationId}
                        className={`p-2 rounded-xl border text-center font-mono font-bold text-[11px] ${
                          b.status === 'EMPTY'
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-amber-50 border-amber-300 text-amber-900'
                        }`}
                      >
                        📍 {b.locationId}
                        <span className="block text-[9px] font-sans font-normal opacity-80">
                          {b.status === 'EMPTY' ? 'Trống' : b.partCode}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl space-y-2">
                  <span className="font-extrabold text-blue-900 block uppercase text-[10px]">
                    📦 DANH SÁCH CHỜ BÓC TÁCH TỪ KHO THÔ ({rawPendingItems.length} Lô Chờ)
                  </span>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    Tất cả linh kiện đã xuất Kho Thô sẽ nằm trong <strong>Danh Sách Chờ Bóc Tách</strong>. Khi quét Thẻ Thùng, hệ thống sẽ tự động đối soát và trừ lùi FIFO.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('pending')}
                    className="mt-1 px-3.5 py-2 bg-blue-800 hover:bg-blue-900 text-white rounded-xl font-bold text-xs inline-flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Xem Chi Tiết Danh Sách Chờ ({groupedPendingList.length} Mã)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Pending Queue */}
        {activeTab === 'pending' && (
          <div className="p-4 sm:p-6">
            {groupedPendingList.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <h3 className="text-base font-bold text-slate-800">Không có linh kiện nào chờ bóc tách!</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Tất cả các lô xuất kho từ Kho thô đã được xử lý xong kitting đóng thùng xanh. Khi có đơn xuất mới, hệ thống sẽ tự động hiển thị tại đây.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-10 text-center">STT</th>
                      <th className="p-3">Mã Linh Kiện</th>
                      <th className="p-3">Tên Linh Kiện</th>
                      <th className="p-3 text-right">SL Xuất Thô (Cộng Dồn)</th>
                      <th className="p-3 text-center">ĐVT</th>
                      <th className="p-3">Các Mốc Thời Gian & SL Cụ Thể (Lô FIFO)</th>
                      {isAdmin && <th className="p-3 text-center w-16">Xóa</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {groupedPendingList.map((group, idx) => (
                      <tr key={group.partCode} className="hover:bg-blue-50/50 transition-colors">
                        <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-blue-700 text-sm">
                          {group.partCode}
                        </td>
                        <td className="p-3 font-semibold text-slate-900">{group.partName}</td>
                        <td className="p-3 text-right font-black text-amber-900 bg-amber-50/80 text-sm">
                          {group.totalRawQuantity.toLocaleString('vi-VN')}
                        </td>
                        <td className="p-3 text-center text-slate-600 font-medium">{group.unit}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1.5 py-1">
                            {group.batches.map((batch, bIdx) => {
                              const dateObj = new Date(batch.createdAt);
                              const timeStr = dateObj.toLocaleTimeString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              });
                              const dateStr = dateObj.toLocaleDateString('vi-VN');
                              return (
                                <span
                                  key={batch.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 shadow-2xs"
                                >
                                  <span className="font-extrabold text-blue-800">Lô #{bIdx + 1}:</span>
                                  <span className="text-slate-600 font-mono">{timeStr} ({dateStr})</span>
                                  <span className="font-black text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded text-[11px]">
                                    +{batch.rawQuantity.toLocaleString('vi-VN')} {group.unit}
                                  </span>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteBatch(batch.id, group.partCode)}
                                      className="ml-1 text-slate-400 hover:text-rose-600 font-bold px-1 rounded cursor-pointer"
                                      title="Xóa riêng mốc thời gian/lô này (Quản trị viên)"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteGroup(group.partCode, group.batches)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg cursor-pointer transition-colors"
                              title="Xóa toàn bộ linh kiện chờ bóc tách này (Chỉ Quản trị viên)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Completed History with Date Range Filter & 35-Day Retention */}
        {activeTab === 'history' && (
          <div className="p-4 sm:p-6 space-y-5">
            {/* Filter Toolbar */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
                    <Filter className="w-4 h-4 text-blue-700" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs sm:text-sm text-slate-900">
                      BỘ LỌC NGÀY LỊCH SỬ BÓC TÁCH
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Chỉ hiển thị các ngày bạn chọn xem (Dữ liệu lưu trữ tối đa trong 35 ngày gần nhất).
                    </p>
                  </div>
                </div>

                {/* Quick presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyHistoryPreset('today')}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                      historyPreset === 'today'
                        ? 'bg-blue-700 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    📅 Hôm nay
                  </button>
                  <button
                    type="button"
                    onClick={() => applyHistoryPreset('3days')}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                      historyPreset === '3days'
                        ? 'bg-blue-700 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    3 ngày qua
                  </button>
                  <button
                    type="button"
                    onClick={() => applyHistoryPreset('7days')}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                      historyPreset === '7days'
                        ? 'bg-blue-700 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    7 ngày qua
                  </button>
                  <button
                    type="button"
                    onClick={() => applyHistoryPreset('35days')}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                      historyPreset === '35days'
                        ? 'bg-blue-700 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    Toàn bộ (35 ngày)
                  </button>
                </div>
              </div>

              {/* Date Inputs & Search Box */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-200">
                <div className="sm:col-span-3 flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-600 shrink-0">Từ ngày:</span>
                  <input
                    type="date"
                    value={historyStartDate}
                    onChange={(e) => {
                      setHistoryStartDate(e.target.value);
                      setHistoryPreset('custom');
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-600 outline-hidden"
                  />
                </div>

                <div className="sm:col-span-3 flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-600 shrink-0">Đến ngày:</span>
                  <input
                    type="date"
                    value={historyEndDate}
                    onChange={(e) => {
                      setHistoryEndDate(e.target.value);
                      setHistoryPreset('custom');
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-600 outline-hidden"
                  />
                </div>

                <div className="sm:col-span-6 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    placeholder="Tìm theo mã LK, tên LK, người bóc, kệ buffer..."
                    className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-600 outline-hidden"
                  />
                  {historySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setHistorySearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Result Summary Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs font-bold">
                <div className="flex items-center space-x-2 text-slate-600">
                  <span>
                    Kết quả lọc: <strong className="text-blue-700">{filteredCompletedItems.length}</strong> / {completedItems.length} bản ghi
                  </span>
                  {historyStartDate && historyEndDate && (
                    <span className="bg-blue-100 text-blue-900 px-2 py-0.5 rounded-md text-[11px] font-mono">
                      {historyStartDate} ➜ {historyEndDate}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                    Tổng Thực Bóc: <strong>{totalFilteredKittedQty.toLocaleString()}</strong>
                  </span>
                  {totalFilteredScrapQty > 0 && (
                    <span className="text-rose-800 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
                      Phế Phẩm: <strong>{totalFilteredScrapQty.toLocaleString()}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* History Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-10 text-center">STT</th>
                    <th className="p-3">Thời Gian Bóc</th>
                    <th className="p-3">Mã Linh Kiện</th>
                    <th className="p-3">Tên Linh Kiện</th>
                    <th className="p-3 text-right text-emerald-800 bg-emerald-50">SL Thực Bóc</th>
                    <th className="p-3 text-right text-rose-800 bg-rose-50">SL Phế Phẩm</th>
                    <th className="p-3">Vị Trí Kệ Buffer</th>
                    <th className="p-3">Người Bóc Tách</th>
                    <th className="p-3 text-center">Trạng Thái</th>
                    {isAdmin && <th className="p-3 text-center text-rose-700 font-bold">Thao Tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCompletedItems.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 10 : 9} className="p-12 text-center text-slate-400">
                        <Clock className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        <p className="font-extrabold text-slate-700 text-sm">
                          Không có dữ liệu bóc tách trong khoảng ngày đã chọn
                        </p>
                        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                          {historyStartDate && historyEndDate ? (
                            <span>Từ ngày <strong>{historyStartDate}</strong> đến <strong>{historyEndDate}</strong> chưa có lượt bóc tách nào.</span>
                          ) : (
                            <span>Chưa có dữ liệu lịch sử bóc tách trong hệ thống.</span>
                          )}
                        </p>
                        <div className="mt-3 flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => applyHistoryPreset('35days')}
                            className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-xl font-bold text-xs cursor-pointer"
                          >
                            Xem Toàn Bộ 35 Ngày
                          </button>
                          <button
                            type="button"
                            onClick={() => applyHistoryPreset('today')}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs cursor-pointer"
                          >
                            Về Ngày Hôm Nay
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredCompletedItems.map((item, idx) => {
                      const timeStr = item.endTime || item.createdAt;
                      const formattedTime = timeStr
                        ? new Date(timeStr).toLocaleString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })
                        : '---';

                      return (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-mono font-bold text-slate-700 text-[11px]">{formattedTime}</td>
                          <td className="p-3 font-mono font-bold text-blue-700">{item.partCode}</td>
                          <td className="p-3 font-semibold text-slate-900">{item.partName}</td>
                          <td className="p-3 text-right font-black text-emerald-700 bg-emerald-50/50">
                            {item.kittedQuantity} {item.unit}
                          </td>
                          <td className="p-3 text-right font-bold text-rose-600 bg-rose-50/50">
                            {item.scrapQuantity || 0}
                          </td>
                          <td className="p-3 font-bold text-blue-700">📍 {item.bufferLocation}</td>
                          <td className="p-3 text-slate-700 font-medium">{item.operatorName}</td>
                          <td className="p-3 text-center">
                            {item.status === 'DELIVERED' ? (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md">
                                Đã Giao Dây Chuyền
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md">
                                Đang Trên Kệ Buffer
                              </span>
                            )}
                          </td>
                          {isAdmin && (
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg cursor-pointer transition-colors"
                                title="Xóa bản ghi lịch sử này (Chỉ Quản trị viên)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* PROMINENT RESULT NOTIFICATION MODAL (SUCCESS OK or ERROR) */}
      {resultModal && resultModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className={`bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border-4 transform transition-all animate-in zoom-in-95 ${
              resultModal.isSuccess
                ? 'border-emerald-500 shadow-emerald-500/20'
                : 'border-rose-500 shadow-rose-500/20'
            }`}
          >
            <div className="text-center space-y-4">
              {/* Big Icon */}
              <div className="flex justify-center">
                {resultModal.isSuccess ? (
                  <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center border-4 border-emerald-300 animate-bounce">
                    <CheckCircle2 className="w-12 h-12 text-emerald-600" />
                  </div>
                ) : (
                  <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center border-4 border-rose-300">
                    <XCircle className="w-12 h-12 text-rose-600" />
                  </div>
                )}
              </div>

              {/* Title & Message */}
              <div>
                <h3
                  className={`text-xl sm:text-2xl font-black uppercase tracking-tight ${
                    resultModal.isSuccess ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {resultModal.title}
                </h3>
                <p className="text-slate-600 font-medium text-sm mt-2 leading-relaxed">
                  {resultModal.message}
                </p>
              </div>

              {/* Details breakdown for Success */}
              {resultModal.isSuccess && resultModal.details && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left text-xs space-y-2">
                  <div className="flex justify-between border-b border-slate-200 pb-1.5">
                    <span className="text-slate-500 font-bold">Mã linh kiện:</span>
                    <strong className="font-mono text-blue-700 text-sm font-extrabold">
                      {resultModal.details.partCode}
                    </strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1.5">
                    <span className="text-slate-500 font-bold">Tên linh kiện:</span>
                    <strong className="text-slate-900 font-bold truncate max-w-[200px]">
                      {resultModal.details.partName}
                    </strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1.5">
                    <span className="text-slate-500 font-bold">Số lượng thực bóc:</span>
                    <strong className="text-emerald-700 font-mono text-base font-black">
                      {resultModal.details.qty} {resultModal.details.unit}
                    </strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1.5">
                    <span className="text-slate-500 font-bold">Vị trí Kệ Outbuffer:</span>
                    <strong className="text-blue-800 font-bold flex items-center space-x-1">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      <span>{resultModal.details.bufferLocation}</span>
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Nhân viên thực hiện:</span>
                    <strong className="text-slate-800 font-bold">{resultModal.details.operatorName}</strong>
                  </div>
                </div>
              )}

              {/* Action Close Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setResultModal(null)}
                  className={`w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider text-white shadow-lg transition-all cursor-pointer ${
                    resultModal.isSuccess
                      ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'
                      : 'bg-rose-600 hover:bg-rose-700 active:scale-95'
                  }`}
                >
                  {resultModal.isSuccess ? '✓ OK - ĐÃ XÁC NHẬN' : 'ĐÓNG & KIỂM TRA LẠI'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AUTO KITTING INFORMATION POPUP MODAL */}
      {isAutoKittingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border-2 border-blue-600 my-8 space-y-5 relative">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setIsAutoKittingModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-full cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-200">
              <div className="p-3 bg-blue-100 text-blue-800 rounded-2xl">
                <Sparkles className="w-6 h-6 text-blue-700 animate-pulse" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full inline-block">
                  ⚡ THÔNG TIN BÓC TÁCH KITTING TỰ ĐỘNG
                </span>
                <h2 className="text-lg sm:text-xl font-black text-slate-900">
                  [SUNHOUSE] PHIẾU BÓC TÁCH KITTING
                </h2>
              </div>
            </div>

            {/* Tag info badge & status check */}
            <div className="p-4 rounded-2xl border border-slate-200 space-y-3 bg-slate-50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <span
                    className="px-3 py-1 rounded-lg text-xs font-black text-white shadow-2xs"
                    style={{ backgroundColor: groupColorHex || '#3182CE' }}
                  >
                    {groupName}
                  </span>
                  <span className="font-mono font-black text-xs px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-slate-900">
                    {scannedTag?.stt ? (scannedTag.stt.toLowerCase().includes('số') ? scannedTag.stt : `Số ${scannedTag.stt}`) : 'Số 1'}
                  </span>
                </div>

                {/* Pending queue availability check */}
                {(() => {
                  const pendingForPart = rawPendingItems.filter(
                    (i) => i.partCode.trim().toLowerCase() === partCode.trim().toLowerCase()
                  );
                  const totalPending = pendingForPart.reduce((sum, i) => sum + i.rawQuantity, 0);
                  const isAvailable = totalPending >= (actualQty || 1);

                  return (
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="font-bold text-slate-600">SL Chờ bóc tách từ Kho Thô:</span>
                      <span
                        className={`font-mono font-black px-2.5 py-0.5 rounded-full ${
                          isAvailable
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}
                      >
                        {totalPending} {unit}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Mã Linh Kiện</span>
                  <span className="font-mono font-black text-blue-700 text-sm block truncate">{partCode}</span>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Tên Linh Kiện</span>
                  <span className="font-extrabold text-slate-900 text-xs block truncate">{partName}</span>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Quy Cách CCDC</span>
                  <span className="font-bold text-slate-800 text-xs block">{ccdcSpec || '0'}</span>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Định Mức Quy Chuẩn</span>
                  <span className="font-mono font-extrabold text-amber-900 text-xs block">{standardQty} {unit}</span>
                </div>
              </div>
            </div>

            {/* Inputs for Actual Qty & Buffer location */}
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    SỐ LƯỢNG THỰC BÓC TÁCH ({unit}) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={actualQty}
                    onChange={(e) => setActualQty(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-amber-50 border-2 border-amber-300 rounded-xl font-black text-amber-900 text-base focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    * Pre-fill theo định mức chuẩn ({standardQty} {unit}).
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    📍 VỊ TRÍ KỆ OUTBUFFER LẤY / CẤP (QUÉT / CHỌN KỆ) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={targetBuffer}
                      onChange={(e) => setTargetBuffer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          executeSmartKitting(targetBuffer);
                        }
                      }}
                      placeholder="Quét hoặc gõ mã kệ (VD: BUFFER-A1-01)..."
                      className="flex-1 px-3 py-2.5 bg-blue-50 border-2 border-blue-300 rounded-xl font-mono font-bold text-blue-900 text-xs focus:ring-2 focus:ring-blue-500 outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setIsModalLocationCameraOpen(!isModalLocationCameraOpen)}
                      className="px-3 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-black text-xs rounded-xl flex items-center space-x-1 shrink-0 cursor-pointer shadow-xs"
                    >
                      <QrCode className="w-4 h-4 text-amber-300" />
                      <span>{isModalLocationCameraOpen ? 'Ẩn' : 'Quét Kệ'}</span>
                    </button>
                    <select
                      value={targetBuffer}
                      onChange={(e) => {
                        setTargetBuffer(e.target.value);
                        executeSmartKitting(e.target.value);
                      }}
                      className="px-2.5 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 text-xs cursor-pointer shrink-0"
                    >
                      {buffers.map((b) => (
                        <option key={b.locationId} value={b.locationId}>
                          📍 {b.locationId} {b.partCode ? `(${b.partCode})` : '(Kệ trống)'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isModalLocationCameraOpen && (
                    <div className="mt-2">
                      <SmoothCameraScanner
                        onScanSuccess={(scannedLocation) => {
                          setIsModalLocationCameraOpen(false);
                          const loc = scannedLocation.trim().toUpperCase();
                          setTargetBuffer(loc);
                          executeSmartKitting(loc);
                          setIsAutoKittingModalOpen(false);
                        }}
                        onClose={() => setIsModalLocationCameraOpen(false)}
                        placeholderText="Căn mã QR Kệ Outbuffer vào giữa khung hình camera..."
                        autoCloseOnScan={true}
                      />
                    </div>
                  )}

                  <p className="text-[10px] text-blue-700 font-medium mt-1">
                    * Quét QR kệ bằng camera hoặc bắn súng quét để <strong>TỰ ĐỘNG XÁC NHẬN & VÀO KỆ</strong>.
                  </p>
                </div>
              </div>

              {/* Operator display */}
              <div className="p-3 bg-slate-100 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4 text-blue-700 shrink-0" />
                  <span className="text-slate-600 font-bold">Người bóc tách:</span>
                  <strong className="text-slate-900 font-extrabold">{operator}</strong>
                </div>
                <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">
                  Tài khoản đăng nhập
                </span>
              </div>

              {/* Exception Reason selector if actualQty !== standardQty */}
              {actualQty !== standardQty && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                  <label className="block font-bold text-amber-900 text-xs">
                    ⚠️ LÝ DO LỆCH ĐỊNH MỨC ({actualQty - standardQty > 0 ? `+${actualQty - standardQty}` : actualQty - standardQty} {unit}):
                  </label>
                  <select
                    value={exceptionReason}
                    onChange={(e) => setExceptionReason(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl font-bold text-slate-900 text-xs"
                  >
                    <option value="Thùng thô dư lẻ (Thiếu từ NCC)">Thùng thô dư lẻ (Thiếu hàng từ NCC)</option>
                    <option value="Hàng hỏng / móp vỡ trong bóc tách">Hàng hỏng / móp vỡ trong bóc tách</option>
                    <option value="Chẻ thùng cấp dở dở theo lệnh">Chẻ thùng cấp dở dở theo lệnh</option>
                    <option value="Yêu cầu bổ sung đặc biệt">Yêu cầu bổ sung đặc biệt</option>
                    <option value="Khác">Lý do khác</option>
                  </select>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsAutoKittingModalOpen(false)}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                HỦY / ĐÓNG
              </button>
              <button
                type="button"
                onClick={() => {
                  executeSmartKitting();
                  setIsAutoKittingModalOpen(false);
                }}
                className="w-full sm:w-auto px-6 py-3 bg-blue-800 hover:bg-blue-900 text-white rounded-xl font-black text-xs shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                <Check className="w-4 h-4 text-amber-300" />
                <span>XÁC NHẬN BÓC TÁCH & ĐƯA VÀO BUFFER</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Container Tag Manager Modal */}
      <ContainerTagManagerModal
        isOpen={isTagManagerOpen}
        onClose={() => setIsTagManagerOpen(false)}
        onSelectTagForKitting={(tag) => {
          handleProcessTagSelection(tag);
          setActiveTab('smart_scan');
        }}
      />

      {/* Custom Tag Manager Modal */}
      <CustomTagManagerModal
        isOpen={isCustomTagManagerOpen}
        onClose={() => setIsCustomTagManagerOpen(false)}
        onSelectTagForKitting={(tag) => {
          handleProcessTagSelection(tag);
          setActiveTab('smart_scan');
        }}
      />
    </div>
  );
};

