import React, { useState, useEffect } from 'react';
import { MaterialCallRequest, BufferLocationMap, AppSettings, Part, ViewTab } from './types';
import { storageService } from './storage';
import { SearchableSelect, SelectOption } from './SearchableSelect';
import { InlineQrScanner } from './InlineQrScanner';
import { SmoothCameraScanner } from './SmoothCameraScanner';
import { ContainerTagManagerModal } from './ContainerTagManagerModal';
import { MasterKittingTag } from './masterExcelParser';
import {
  Bell,
  BellRing,
  Send,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  User,
  AlertCircle,
  Volume2,
  ArrowRight,
  ShieldCheck,
  Check,
  Zap,
  Search,
  Settings as SettingsIcon,
  Plus,
  Trash2,
  QrCode,
  Tag,
  X,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';

interface AndonCallViewProps {
  materialCalls: MaterialCallRequest[];
  buffers: BufferLocationMap[];
  parts?: Part[];
  settings: AppSettings;
  onRefresh: () => void;
  onNavigateToSettings?: () => void;
  viewMode?: ViewTab;
}

export const AndonCallView: React.FC<AndonCallViewProps> = ({
  materialCalls,
  buffers,
  parts,
  settings,
  onRefresh,
  onNavigateToSettings,
  viewMode,
}) => {
  const getInitialTab = (): 'request' | 'calling' | 'delivering' | 'history' => {
    if (viewMode === 'andon_request') return 'request';
    if (viewMode === 'andon_calling') return 'calling';
    if (viewMode === 'andon_delivering') return 'delivering';
    if (viewMode === 'andon_history') return 'history';
    return 'calling';
  };

  const [activeTab, setActiveTab] = useState<'request' | 'calling' | 'delivering' | 'history'>(getInitialTab);

  useEffect(() => {
    if (viewMode === 'andon_request') setActiveTab('request');
    else if (viewMode === 'andon_calling') setActiveTab('calling');
    else if (viewMode === 'andon_delivering') setActiveTab('delivering');
    else if (viewMode === 'andon_history') setActiveTab('history');
  }, [viewMode]);

  // Master parts list
  const allParts = parts && parts.length > 0 ? parts : storageService.getParts();

  // Assembly lines list from Settings
  const assemblyLinesList = (settings.assemblyLines && settings.assemblyLines.length > 0)
    ? settings.assemblyLines
    : [
        'Bàn Lắp Ráp Bo Mạch Line 1',
        'Dây Chuyền SMT Tự Động 2',
        'Bàn Lắp Khung Cơ Khí 3',
        'Khu Kiểm Thử Quality Check 4',
      ];

  // Current logged in user
  const currentUser = storageService.getCurrentUser();
  const defaultRequester = currentUser
    ? `${currentUser.fullName} (${currentUser.roleTitle || currentUser.username})`
    : (settings.staffList && settings.staffList[0]) || 'Nguyễn Văn A (Trưởng Dây Chuyền 1)';

  // Request form state - Default assemblyLine to 'DCLR', default requestedBy to logged in user
  const [assemblyLine, setAssemblyLine] = useState('DCLR');
  const [isCustomLineMode, setIsCustomLineMode] = useState(false);
  const [isManageLinesModalOpen, setIsManageLinesModalOpen] = useState(false);
  const [newLineInput, setNewLineInput] = useState('');

  const [selectedPartCode, setSelectedPartCode] = useState('');
  const [requestedQty, setRequestedQty] = useState<number>(10);
  const [requestedBy, setRequestedBy] = useState(defaultRequester);

  // QR Code scanning states for Phiếu Thông Tin / Thẻ Thùng
  const [isAndonCameraScanning, setIsAndonCameraScanning] = useState(false);
  const [isAndonModalCameraOpen, setIsAndonModalCameraOpen] = useState(false);
  const [andonQrInputText, setAndonQrInputText] = useState('');
  const [isAndonTagManagerOpen, setIsAndonTagManagerOpen] = useState(false);
  const [andonScanMessage, setAndonScanMessage] = useState('');

  // Selected pick shelf for Andon call (FIFO recommended or user-selected)
  const [selectedPickShelf, setSelectedPickShelf] = useState<string>('');

  // State for Andon Scan Popup Modal & Error Modal
  const [andonModalData, setAndonModalData] = useState<{
    isOpen: boolean;
    partCode: string;
    partName: string;
    unit: string;
    standardQty: number;
    isKitted: boolean;
    recommendedLocation: string;
    availableShelves: string[];
    availableBuffers: BufferLocationMap[];
    kittedStockQty: number;
    pendingRawQty: number;
    statusText: string;
    locationGuideText: string;
  } | null>(null);

  const [andonErrorModal, setAndonErrorModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  const [showManualForm, setShowManualForm] = useState(false);

  useEffect(() => {
    if (currentUser) {
      const userStr = `${currentUser.fullName} (${currentUser.roleTitle || currentUser.username})`;
      setRequestedBy(userStr);
      setDelivererName(userStr);
    }
  }, [currentUser]);

  // Handle parsing QR code from Phiếu Thông Tin / Thẻ Thùng for Andon Call
  const handleParseAndonQrPayload = (payloadStr: string) => {
    if (!payloadStr) return;
    const cleanStr = payloadStr.trim();
    const masterTags = storageService.getMasterContainerTags();
    const kittingQueue = storageService.getKittingQueue();
    const pendingKittingItems = kittingQueue.filter((k) => k.status === 'PENDING_KITTING');

    let pCode = '';
    let pName = '';
    let pQty = 10;
    let pUnit = 'Cái';

    // 1. Match in Master Container Tags
    const matchedMaster = masterTags.find(
      (m) =>
        (m.qrPayload && m.qrPayload.trim().toLowerCase() === cleanStr.toLowerCase()) ||
        (m.partCode && m.partCode.trim().toLowerCase() === cleanStr.toLowerCase())
    );

    if (matchedMaster) {
      pCode = matchedMaster.partCode;
      pName = matchedMaster.partName || matchedMaster.partCode;
      pQty = matchedMaster.standardQty && matchedMaster.standardQty > 0 ? matchedMaster.standardQty : 10;
      pUnit = matchedMaster.unit || 'Cái';
    } else if (cleanStr.includes('|')) {
      // Pipe format e.g. "04-29-09-SHA76214CKNK-0001|1000|01" or "CONT_IN|LK01|100|..."
      const parts = cleanStr.split('|');
      pCode = parts[0] || '';
      pQty = parts[1] && !isNaN(parseFloat(parts[1])) ? parseFloat(parts[1]) : 10;
      if (cleanStr.startsWith('CONT_IN|')) {
        pCode = parts[1] || '';
        pQty = parts[2] && !isNaN(parseFloat(parts[2])) ? parseFloat(parts[2]) : 10;
      }
      const matchInMaster = masterTags.find((m) => m.partCode.toLowerCase() === pCode.toLowerCase());
      const matchInPending = pendingKittingItems.find((p) => p.partCode.toLowerCase() === pCode.toLowerCase());
      const matchInParts = allParts.find((p) => p.code.toLowerCase() === pCode.toLowerCase() || p.id.toLowerCase() === pCode.toLowerCase());

      if (matchInMaster) {
        pName = matchInMaster.partName;
        pUnit = matchInMaster.unit || 'Cái';
      } else if (matchInPending) {
        pName = matchInPending.partName;
        pUnit = matchInPending.unit || 'Cái';
      } else if (matchInParts) {
        pName = matchInParts.name;
        pUnit = matchInParts.unit || 'Cái';
      } else {
        pName = pCode;
      }
    } else {
      pCode = cleanStr;
      const matchInMaster = masterTags.find((m) => m.partCode.toLowerCase() === pCode.toLowerCase());
      const matchInPending = pendingKittingItems.find((p) => p.partCode.toLowerCase() === pCode.toLowerCase());
      const matchInParts = allParts.find((p) => p.code.toLowerCase() === pCode.toLowerCase() || p.id.toLowerCase() === pCode.toLowerCase());

      if (matchInMaster) {
        pName = matchInMaster.partName;
        pQty = matchInMaster.standardQty > 0 ? matchInMaster.standardQty : 10;
        pUnit = matchInMaster.unit || 'Cái';
      } else if (matchInPending) {
        pName = matchInPending.partName;
        pQty = matchInPending.rawQuantity > 0 ? matchInPending.rawQuantity : 10;
        pUnit = matchInPending.unit || 'Cái';
      } else if (matchInParts) {
        pName = matchInParts.name;
        pUnit = matchInParts.unit || 'Cái';
      } else {
        pName = pCode;
      }
    }

    const bufferEntry = bufferPartsMap.get(pCode.trim());
    const pendingItemsForCode = pendingKittingItems.filter((k) => k.partCode.trim().toLowerCase() === pCode.trim().toLowerCase());

    // Determine Kitting status & location recommendation
    let isKitted = false;
    let recLocation = 'DCLR';
    let availableShelves: string[] = [];
    let stockOnBuffer = 0;
    let pendingRawQty = 0;
    let statusText = '';
    let locationGuideText = '';

    if (bufferEntry && bufferEntry.totalBufferStock > 0 && bufferEntry.availableBuffers.length > 0) {
      isKitted = true;
      stockOnBuffer = bufferEntry.totalBufferStock;
      availableShelves = bufferEntry.availableBuffers.map((b) => b.locationId);
      recLocation = availableShelves[0]; // FIFO shelf recommendation
      setSelectedPickShelf(recLocation);
      statusText = `🟢 ĐÃ KITTING (Sẵn sàng trên Kệ Outbuffer)`;
      locationGuideText = `📍 Linh kiện ĐÃ KITTING. Có ${bufferEntry.availableBuffers.length} kệ chứa linh kiện này. Kệ gợi ý FIFO: ${recLocation} (Tồn kệ: ${stockOnBuffer} ${pUnit})`;
    } else {
      isKitted = false;
      recLocation = 'DCLR';
      setSelectedPickShelf('DCLR');
      pendingRawQty = pendingItemsForCode.reduce((sum, i) => sum + i.rawQuantity, 0);
      statusText = `🟡 CHƯA KITTING (Giao trực tiếp qua DCLR / Kho Thô)`;
      locationGuideText = `🚚 Linh kiện CHƯA KITTING lên Kệ Outbuffer. Tín hiệu Andon sẽ giao cấp trực tiếp qua DCLR (Kho Thô)`;
    }

    // Auto update selected part code & values
    setSelectedPartCode(pCode);
    setRequestedQty(pQty);
    setAssemblyLine(assemblyLinesList[0] || 'DCLR');

    // Open Andon Scan Modal IMMEDIATELY
    setAndonModalData({
      isOpen: true,
      partCode: pCode,
      partName: pName,
      unit: pUnit,
      standardQty: pQty,
      isKitted,
      recommendedLocation: recLocation,
      availableShelves,
      availableBuffers: bufferEntry ? bufferEntry.availableBuffers : [],
      kittedStockQty: stockOnBuffer,
      pendingRawQty,
      statusText,
      locationGuideText,
    });
  };

  // Logistics deliver modal / confirm state
  const defaultDeliverer = currentUser
    ? `${currentUser.fullName} (${currentUser.roleTitle || currentUser.username})`
    : (settings.staffList && settings.staffList[0]) || 'Lê Hoàng Nam (Thủ Kho Logistics)';

  const [delivererName, setDelivererName] = useState(defaultDeliverer);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Get Kitting Queue items waiting for kitting (đã xuất kho thô, chờ bóc tách)
  const kittingQueue = storageService.getKittingQueue();
  const pendingKittingItems = kittingQueue.filter((k) => k.status === 'PENDING_KITTING');

  // Group available stock on Outbuffer shelves by part code
  const bufferPartsMap = new Map<
    string,
    {
      partCode: string;
      partName: string;
      unit: string;
      totalBufferStock: number;
      availableBuffers: BufferLocationMap[];
    }
  >();

  buffers.forEach((b) => {
    if (b.status !== 'EMPTY') {
      const itemsOnShelf = (b.items && b.items.length > 0)
        ? b.items
        : (b.partCode ? [{ partCode: b.partCode, partName: b.partName || b.partCode, unit: b.unit || 'PCS', currentStockQty: b.currentStockQty }] : []);

      itemsOnShelf.forEach((item) => {
        if (item.partCode && item.currentStockQty > 0) {
          const code = item.partCode.trim();
          if (!bufferPartsMap.has(code)) {
            bufferPartsMap.set(code, {
              partCode: code,
              partName: item.partName || code,
              unit: item.unit || 'PCS',
              totalBufferStock: item.currentStockQty,
              availableBuffers: [{
                ...b,
                partCode: item.partCode,
                partName: item.partName,
                unit: item.unit,
                currentStockQty: item.currentStockQty,
              }],
            });
          } else {
            const entry = bufferPartsMap.get(code)!;
            entry.totalBufferStock += item.currentStockQty;
            entry.availableBuffers.push({
              ...b,
              partCode: item.partCode,
              partName: item.partName,
              unit: item.unit,
              currentStockQty: item.currentStockQty,
            });
          }
        }
      });
    }
  });

  // Sort each part's available buffers by FIFO (oldest lastUpdated first)
  bufferPartsMap.forEach((entry) => {
    entry.availableBuffers.sort((a, b) => {
      const timeA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
      const timeB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
      return timeA - timeB;
    });
  });

  // Prepare searchable options for SearchableSelect
  // Rule: ONLY allow parts that are either on Outbuffer shelves OR in Pending Kitting list (đã xuất kho thô)
  const partSelectOptions: SelectOption[] = Array.from(bufferPartsMap.values()).map((p) => {
    const shelfListStr = p.availableBuffers.map((b) => b.locationId).join(', ');
    return {
      value: p.partCode,
      label: `[${p.partCode}] ${p.partName}`,
      sublabel: `Tồn Outbuffer: ${p.totalBufferStock} ${p.unit} | Kệ: ${shelfListStr}`,
      badge: `Sẵn sàng Kệ ${p.availableBuffers[0].locationId}`,
    };
  });

  // Add parts from "Danh sách chờ bóc tách" that are not on Outbuffer shelves yet
  const seenPendingPartCodes = new Set<string>();
  pendingKittingItems.forEach((kit) => {
    if (!bufferPartsMap.has(kit.partCode) && !seenPendingPartCodes.has(kit.partCode)) {
      seenPendingPartCodes.add(kit.partCode);
      partSelectOptions.push({
        value: kit.partCode,
        label: `[${kit.partCode}] ${kit.partName}`,
        sublabel: `Đã xuất kho thô (Chờ bóc tách Kitting): ${kit.rawQuantity} ${kit.unit}`,
        badge: `📦 Chờ Bóc Tách Kitting`,
      });
    }
  });

  // Automatically select first available part if none selected
  useEffect(() => {
    if (partSelectOptions.length > 0) {
      if (!selectedPartCode) {
        setSelectedPartCode(partSelectOptions[0].value);
      }
    } else {
      setSelectedPartCode('');
    }
  }, [partSelectOptions]);

  // Keep assemblyLine in sync if settings update
  useEffect(() => {
    if (assemblyLinesList.length > 0 && !assemblyLinesList.includes(assemblyLine)) {
      setAssemblyLine(assemblyLinesList[0]);
    }
  }, [assemblyLinesList]);

  // Determine auto-selected buffer location for the chosen part code
  const chosenBufferInfo = bufferPartsMap.get(selectedPartCode);
  let targetBufferLocation = '';
  let availableQtyOnShelf = 0;
  let partName = '';
  let unit = 'PCS';
  let isDirectKitting = false;
  let availableBuffersForPart: BufferLocationMap[] = [];

  if (chosenBufferInfo && chosenBufferInfo.availableBuffers.length > 0) {
    availableBuffersForPart = chosenBufferInfo.availableBuffers;
    const selectedBufObj = availableBuffersForPart.find((b) => b.locationId === selectedPickShelf) || availableBuffersForPart[0];
    targetBufferLocation = selectedBufObj.locationId;
    availableQtyOnShelf = selectedBufObj.currentStockQty;
    partName = selectedBufObj.partName || chosenBufferInfo.partName;
    unit = selectedBufObj.unit || chosenBufferInfo.unit;
    isDirectKitting = false;
  } else {
    // Part is in Pending Kitting list
    const pendingItem = pendingKittingItems.find((k) => k.partCode === selectedPartCode);
    const masterPart = allParts.find((p) => p.code === selectedPartCode);
    partName = pendingItem?.partName || masterPart?.name || selectedPartCode;
    unit = pendingItem?.unit || masterPart?.unit || 'PCS';
    targetBufferLocation = 'KHU BÓC TÁCH KITTING';
    availableQtyOnShelf = 0;
    isDirectKitting = true;
  }

  const handleCreateCallRequest = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPartCode) {
      setMessage({ type: 'error', text: 'Vui lòng chọn mã linh kiện cần gọi!' });
      return;
    }

    if (isDirectKitting) {
      const pendingItemsForPart = pendingKittingItems.filter((k) => k.partCode === selectedPartCode);
      const maxPendingQty = pendingItemsForPart.reduce((sum, k) => sum + k.rawQuantity, 0);
      if (requestedQty > maxPendingQty && maxPendingQty > 0) {
        setMessage({
          type: 'error',
          text: `Số lượng yêu cầu (${requestedQty}) vượt quá giới hạn số lượng trong danh sách chờ bóc tách Kitting (${maxPendingQty} ${unit})! Không được gọi vượt quá số lượng này.`,
        });
        return;
      }
    } else if (chosenBufferInfo && requestedQty > availableQtyOnShelf) {
      setMessage({
        type: 'error',
        text: `Số lượng yêu cầu (${requestedQty}) vượt quá tồn kho khả dụng trên Kệ ${targetBufferLocation} (${availableQtyOnShelf} ${unit})! Không được gọi vượt quá số lượng tồn.`,
      });
      return;
    }

    try {
      storageService.createMaterialCallRequest({
        assemblyLine,
        partCode: selectedPartCode,
        partName: partName || selectedPartCode,
        unit,
        requestedQty,
        bufferLocation: targetBufferLocation,
        isDirectKitting,
        requestedBy,
      });

      // Audio notification chime
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      } catch {
        // Fallback
      }

      setMessage({
        type: 'success',
        text: `🚀 Đã phát tín hiệu ANDON gọi mã linh kiện [${selectedPartCode}] thành công tới bộ phận Logistics!`,
      });

      onRefresh();
      setActiveTab('logistics');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi khi tạo tín hiệu Andon' });
    }
  };

  const handleConfirmAndonFromModal = () => {
    if (!andonModalData) return;
    const { partCode, partName, unit, isKitted, recommendedLocation, availableBuffers, kittedStockQty, pendingRawQty } = andonModalData;
    const targetLine = assemblyLine || 'DCLR';
    const chosenPickLocation = isKitted ? (selectedPickShelf || recommendedLocation) : 'KHU BÓC TÁCH KITTING';

    // Stock validation against actual available quantity on chosen shelf
    const chosenBuf = availableBuffers.find((b) => b.locationId === chosenPickLocation);
    const availableQty = chosenBuf ? chosenBuf.currentStockQty : kittedStockQty;

    if (isKitted) {
      if (requestedQty > availableQty && availableQty > 0) {
        setMessage({
          type: 'error',
          text: `Số lượng yêu cầu (${requestedQty}) vượt quá tồn kho khả dụng trên Kệ ${chosenPickLocation} (${availableQty} ${unit})! Không thể phát tín hiệu gọi quá số lượng.`,
        });
        setAndonModalData(null);
        return;
      }
    } else {
      if (requestedQty > pendingRawQty && pendingRawQty > 0) {
        setMessage({
          type: 'error',
          text: `Số lượng yêu cầu (${requestedQty}) vượt quá số lượng khả dụng trong Danh Sách Chờ Bóc Tách (${pendingRawQty} ${unit})! Không thể phát tín hiệu gọi quá số lượng.`,
        });
        setAndonModalData(null);
        return;
      }
    }

    try {
      storageService.createMaterialCallRequest({
        assemblyLine: targetLine,
        partCode: partCode,
        partName: partName || partCode,
        unit: unit || 'Cái',
        requestedQty: requestedQty,
        bufferLocation: chosenPickLocation,
        isDirectKitting: !isKitted,
        requestedBy: requestedBy,
      });

      // Sound notification chime
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      } catch {
        // Fallback
      }

      setMessage({
        type: 'success',
        text: `🚀 Đã phát tín hiệu ANDON gọi mã linh kiện [${partCode}] thành công tới bộ phận Logistics! Vị trí giao: ${targetLine}`,
      });

      onRefresh();
      setActiveTab('logistics');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi khi tạo tín hiệu Andon' });
    }

    setAndonModalData(null);
  };

  const handleStartDelivery = (requestId: string) => {
    try {
      storageService.updateMaterialCallStatus(requestId, 'DELIVERING', delivererName);
      setMessage({ type: 'success', text: 'Đã nhận đơn và chuyển sang trạng thái Đang Vận Chuyển Delivery!' });
      onRefresh();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleCompleteDelivery = (requestId: string) => {
    try {
      storageService.updateMaterialCallStatus(requestId, 'COMPLETED', delivererName);
      setMessage({ type: 'success', text: '🎉 Xác nhận Giao Hàng Thành Công! Đã trừ tồn kệ Buffer và hoàn tất đơn.' });
      onRefresh();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  // Filter requests with strict FIFO ordering (oldest call requestedAt first)
  const callingReqs = materialCalls
    .filter((m) => m.status === 'CALLING')
    .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime());
  const deliveringReqs = materialCalls.filter((m) => m.status === 'DELIVERING');
  const completedReqs = materialCalls
    .filter((m) => m.status === 'COMPLETED')
    .sort((a, b) => new Date(b.deliveredAt || b.requestedAt).getTime() - new Date(a.deliveredAt || a.requestedAt).getTime());

  const formatVietnamDateTime = (isoString: string) => {
    if (!isoString) return 'Chưa ghi nhận';
    try {
      const d = new Date(isoString);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${hours}:${minutes}:${seconds} - ${day}/${month}/${year}`;
    } catch {
      return isoString;
    }
  };

  const getRelativeTimeString = (isoString: string) => {
    if (!isoString) return '';
    const diffMs = new Date().getTime() - new Date(isoString).getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffMinutes < 1) return 'Vừa mới gọi';
    if (diffMinutes < 60) return `Cách đây ${diffMinutes} phút`;
    const diffHours = Math.floor(diffMinutes / 60);
    const remMinutes = diffMinutes % 60;
    if (diffHours < 24) return `Cách đây ${diffHours} giờ ${remMinutes > 0 ? `${remMinutes}p` : ''}`;
    const diffDays = Math.floor(diffHours / 24);
    return `Cách đây ${diffDays} ngày`;
  };

  const isSpecificTab =
    viewMode === 'andon_request' ||
    viewMode === 'andon_calling' ||
    viewMode === 'andon_delivering' ||
    viewMode === 'andon_history';

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-amber-700 via-orange-800 to-rose-900 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-2 bg-amber-500/30 border border-amber-300/30 text-amber-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <BellRing className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span>ANDON MATERIAL CALL & DELIVERY SYSTEM</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white">
              {viewMode === 'andon_request' && '1. Sản Xuất Gọi Hàng (Andon Call)'}
              {viewMode === 'andon_calling' && '2. Đơn Yêu Cầu Đang Gọi (Chờ Nhận Giao)'}
              {viewMode === 'andon_delivering' && '3. Đang Trên Đường Vận Chuyển (In Transit)'}
              {viewMode === 'andon_history' && '4. Lịch Sử Giao Cấp Hàng (Andon)'}
              {(!isSpecificTab) && 'Gọi Hàng & Giao Hàng Dây Chuyền (Andon Call)'}
            </h1>
            <p className="text-amber-100 text-xs sm:text-sm max-w-2xl">
              Hệ thống tín hiệu Andon thời gian thực: Dây chuyền tìm chọn mã linh kiện & số lượng cần gọi, bộ phận Logistics tự động định vị vị trí kệ Outbuffer cấp hàng.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl flex items-center space-x-3">
              <div className="p-2.5 bg-amber-400 text-amber-950 rounded-xl font-black">
                <BellRing className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <span className="text-[10px] text-amber-200 font-bold uppercase block">Tín Hiệu Đang Gọi</span>
                <span className="text-2xl font-black text-white">{callingReqs.length} Yêu Cầu</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Message Feedback */}
      {message && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between animate-in fade-in ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-semibold text-xs sm:text-sm">{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-xs font-bold underline hover:no-underline cursor-pointer">
            Đóng
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Main Tabs Header - Only shown if not in specific single tab view */}
        {!isSpecificTab && (
          <div className="flex border-b border-slate-200 bg-slate-50 p-2 gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('request')}
            className={`py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center space-x-2 shrink-0 cursor-pointer ${
              activeTab === 'request'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>1. SẢN XUẤT GỌI HÀNG (ANDON)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('calling')}
            className={`py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center space-x-2 shrink-0 cursor-pointer ${
              activeTab === 'calling'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <BellRing className="w-4 h-4" />
            <span>2. ĐƠN YÊU CẦU ĐANG GỌI</span>
            {callingReqs.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] bg-red-500 text-white font-black rounded-full animate-pulse">
                {callingReqs.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('delivering')}
            className={`py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center space-x-2 shrink-0 cursor-pointer ${
              activeTab === 'delivering'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>3. ĐANG VẬN CHUYỂN</span>
            {deliveringReqs.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] bg-blue-600 text-white font-black rounded-full">
                {deliveringReqs.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center space-x-2 shrink-0 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>4. LỊCH SỬ GIAO CẤP HÀNG</span>
            <span className="px-2 py-0.5 text-[10px] bg-amber-100 text-amber-900 font-bold rounded-full">
              {completedReqs.length}
            </span>
          </button>
        </div>
        )}

        {/* TAB 1: CALLING REQUESTS (ĐƠN YÊU CẦU ĐANG GỌI) */}
        {activeTab === 'calling' && (
          <div className="p-4 sm:p-6 space-y-6">
            {/* Active Delivering Staff Picker */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs">
                <User className="w-4 h-4 text-amber-700" />
                <span>Nhân Viên Logistics / Thủ Kho Nhận Giao Hàng:</span>
              </div>
              <select
                value={delivererName}
                onChange={(e) => setDelivererName(e.target.value)}
                className="px-3.5 py-1.5 bg-white border border-amber-300 rounded-xl font-bold text-slate-900 text-xs focus:ring-2 focus:ring-amber-500 shadow-2xs"
              >
                {currentUser && (
                  <option value={`${currentUser.fullName} (${currentUser.roleTitle || currentUser.username})`}>
                    {currentUser.fullName} ({currentUser.roleTitle || currentUser.username}) [Đang đăng nhập]
                  </option>
                )}
                {settings.staffList && settings.staffList.length > 0 ? (
                  settings.staffList
                    .filter((s) => !currentUser || !s.includes(currentUser.fullName))
                    .map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))
                ) : (
                  !currentUser && (
                    <option value="Lê Hoàng Nam (Thủ Kho Logistics)">Lê Hoàng Nam (Thủ Kho Logistics)</option>
                  )
                )}
              </select>
            </div>

            {/* Calling Requests List */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 gap-1">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 flex items-center space-x-2">
                    <Bell className="w-4 h-4 text-red-500 animate-pulse" />
                    <span>Danh Sách Đơn Yêu Cầu Đang Phát Tín Hiệu Gọi Hàng (Calling Requests)</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 italic">
                    * Tự động ưu tiên FIFO: Yêu cầu gọi trước xếp trên cùng để xử lý cấp hàng trước
                  </p>
                </div>
                <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200 self-start sm:self-auto">
                  {callingReqs.length} Đơn
                </span>
              </div>

              {callingReqs.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 italic text-xs">
                  Hiện không có yêu cầu gọi hàng mới nào từ Dây Chuyền.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {callingReqs.map((req, idx) => (
                    <div
                      key={req.requestId}
                      className="p-5 bg-white border-2 border-red-200 rounded-2xl shadow-xs hover:shadow-md transition-all space-y-3 relative overflow-hidden"
                    >
                      {/* Priority Badge */}
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-red-100">
                        <span
                          className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-xs flex items-center space-x-1 ${
                            idx === 0
                              ? 'bg-red-600 text-white ring-2 ring-red-400 animate-pulse'
                              : idx === 1
                              ? 'bg-amber-500 text-slate-950 font-black'
                              : 'bg-slate-700 text-white font-bold'
                          }`}
                        >
                          <Zap className="w-3 h-3" />
                          <span>
                            {idx === 0 ? 'ƯU TIÊN #1 (GỌI ĐẦU TIÊN)' : `ƯU TIÊN #${idx + 1}`}
                          </span>
                        </span>
                        {req.isDirectKitting ? (
                          <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 text-[10px] font-black uppercase rounded-md tracking-wide">
                            📦 BÓC TÁCH KITTING
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 bg-red-100 text-red-900 text-[10px] font-black uppercase rounded-md tracking-wide">
                            ⚡ OUTBUFFER
                          </span>
                        )}
                      </div>

                      {/* Call Timestamp Highlight */}
                      <div className="p-2.5 bg-rose-50/90 border border-rose-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center space-x-2 text-slate-800">
                          <Clock className="w-4 h-4 text-red-600 shrink-0 animate-spin-slow" />
                          <span>
                            Ngày giờ gọi: <strong className="font-mono font-extrabold text-slate-900">{formatVietnamDateTime(req.requestedAt)}</strong>
                          </span>
                        </div>
                        <span className="text-[11px] font-extrabold text-red-700 bg-white px-2 py-0.5 rounded-md border border-red-200">
                          ⏱ {getRelativeTimeString(req.requestedAt)}
                        </span>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <span className="text-amber-900 font-bold text-xs block">
                          📍 Nơi Nhận: <strong className="text-slate-900 text-sm font-extrabold">{req.assemblyLine}</strong>
                        </span>
                        <div>
                          <h4 className="text-base font-black text-slate-900 leading-snug">
                            {req.partName}
                          </h4>
                          <div className="mt-1 flex items-center space-x-2">
                            <span className="text-[11px] font-bold text-slate-500">Mã LK:</span>
                            <span className="font-mono font-black text-purple-800 text-xs bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-lg inline-block">
                              {req.partCode}
                            </span>
                          </div>
                        </div>
                      </div>

                      {req.isDirectKitting || req.bufferLocation.includes('KITTING') ? (
                        <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs space-y-1">
                          <span className="font-extrabold text-amber-900 flex items-center space-x-1 uppercase text-[10px]">
                            <Zap className="w-3.5 h-3.5 text-amber-600" />
                            <span>LỘ TRÌNH KITTING CROSS-DOCKING:</span>
                          </span>
                          <p className="font-bold text-slate-800 text-[11px]">
                            1. Đến Khu Bóc Tách Kitting lấy <strong className="text-emerald-700 font-extrabold">[{req.requestedQty} {req.unit}]</strong> <br />
                            2. Giao trực tiếp tới <strong className="text-slate-900 font-extrabold">[{req.assemblyLine}]</strong>
                          </p>
                        </div>
                      ) : (
                        (() => {
                          const shelfBuf = buffers.find((b) => b.locationId === req.bufferLocation);
                          return (
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-1">
                              <span className="font-extrabold text-blue-900 block uppercase text-[10px]">LỘ TRÌNH LẤY HÀNG OUTBUFFER:</span>
                              <p className="font-bold text-slate-800 text-[11px]">
                                1. Đến Kệ <strong className="text-blue-700 font-mono font-black">[{req.bufferLocation}]</strong>
                                {shelfBuf?.modelName && (
                                  <span className="ml-1 text-blue-900 font-extrabold">
                                    [Model: {shelfBuf.modelName}]
                                  </span>
                                )}
                                {shelfBuf?.description && (
                                  <span className="ml-1 text-slate-600 font-medium">
                                    ({shelfBuf.description})
                                  </span>
                                )} lấy <strong className="text-emerald-700 font-extrabold">[{req.requestedQty} {req.unit}]</strong> <br />
                                2. Giao tới <strong className="text-slate-900 font-bold">[{req.assemblyLine}]</strong>
                              </p>
                            </div>
                          );
                        })()
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                        <span>Người gọi: {req.requestedBy}</span>
                        <button
                          type="button"
                          onClick={() => handleStartDelivery(req.requestId)}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center space-x-1.5"
                        >
                          <Truck className="w-3 h-3.5" />
                          <span>NHẬN ĐƠN DELIVERY</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: IN-TRANSIT DELIVERIES (ĐANG TRÊN ĐƯỜNG VẬN CHUYỂN) */}
        {activeTab === 'delivering' && (
          <div className="p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900 flex items-center space-x-2">
                  <Truck className="w-5 h-5 text-blue-600" />
                  <span>Danh Sách Đơn Đang Trên Đường Vận Chuyển (In Transit)</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Các đơn hàng đã được nhân viên giao hàng tiếp nhận và đang trên đường vận chuyển tới dây chuyền.
                </p>
              </div>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                {deliveringReqs.length} Đơn
              </span>
            </div>

            {deliveringReqs.length === 0 ? (
              <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 italic text-xs">
                Hiện chưa có đơn hàng nào đang trên đường vận chuyển.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {deliveringReqs.map((req) => (
                  <div
                    key={req.requestId}
                    className="p-5 bg-white border-2 border-blue-200 rounded-2xl shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-blue-100 pb-2">
                      <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 font-black text-[10px] rounded-md uppercase">
                        🚚 ĐANG TRÊN ĐƯỜNG GIAO HÀNG
                      </span>
                      <span className="text-slate-600 text-xs font-bold">
                        Giao bởi: <strong className="text-slate-900">{req.deliveredBy || delivererName}</strong>
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <h4 className="text-base font-black text-slate-900 leading-snug">
                        {req.partName}
                      </h4>
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] font-bold text-slate-500">Mã LK:</span>
                        <span className="font-mono font-black text-purple-800 text-xs bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-lg inline-block">
                          {req.partCode}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 pt-1">
                        Số lượng giao: <strong className="text-emerald-700 font-black text-sm">{req.requestedQty} {req.unit}</strong> | Kệ lấy: <strong className="text-blue-700 font-mono font-extrabold">{req.bufferLocation}</strong>
                      </p>
                    </div>

                    <div className="p-3 bg-blue-50/80 border border-blue-100 rounded-xl text-xs space-y-1">
                      <span className="font-bold text-blue-900">Nơi nhận hàng:</span>
                      <p className="font-extrabold text-slate-900 text-sm">{req.assemblyLine}</p>
                      <p className="text-[11px] text-slate-500">Người yêu cầu: {req.requestedBy}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCompleteDelivery(req.requestId)}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2 text-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>XÁC NHẬN ĐÃ GIAO HÀNG TỚI BÀN MÁY</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CREATE ANDON CALL REQUEST */}
        {activeTab === 'request' && (
          <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center space-x-3 text-amber-900">
              <Zap className="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <h3 className="font-bold text-sm">Chế Độ Sản Xuất Bấm Gọi Hàng (Andon Call)</h3>
                <p className="text-xs text-amber-800">
                  Chọn mã/tên linh kiện cần gọi và nhập số lượng, hệ thống tự động xác định vị trí kệ Outbuffer khả dụng tốt nhất.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateCallRequest} className="p-6 bg-white border border-slate-200 rounded-3xl space-y-4 text-xs text-slate-800 shadow-xs">
              {/* QUÉT MÃ QR PHIẾU THÔNG TIN / THẺ THÙNG (TỰ ĐỘNG LẤY TÊN, MÃ, SỐ LƯỢNG QUY CÁCH) */}
              <div className="p-4 bg-blue-50/80 border-2 border-blue-200 rounded-2xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-extrabold text-blue-900 text-xs flex items-center space-x-2">
                    <QrCode className="w-4 h-4 text-blue-700 animate-pulse shrink-0" />
                    <span>QUÉT MÃ QR PHIẾU THÔNG TIN / THẺ THÙNG (TỰ ĐỘNG CẤP TÊN, MÃ, SL QUY CÁCH)</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setIsAndonCameraScanning(!isAndonCameraScanning)}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold shadow-2xs flex items-center space-x-1 cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>{isAndonCameraScanning ? 'Ẩn Camera' : 'Quét Camera QR'}</span>
                    </button>
                  </div>
                </div>

                {isAndonCameraScanning && (
                  <SmoothCameraScanner
                    onScanSuccess={(code) => {
                      setIsAndonCameraScanning(false);
                      handleParseAndonQrPayload(code);
                    }}
                    onClose={() => setIsAndonCameraScanning(false)}
                    placeholderText="Căn mã QR Phiếu Thông Tin / Thẻ Thùng vào giữa khung hình camera..."
                    autoCloseOnScan={true}
                  />
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={andonQrInputText}
                    onChange={(e) => setAndonQrInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleParseAndonQrPayload(andonQrInputText);
                        setAndonQrInputText('');
                      }
                    }}
                    placeholder="Quét hoặc dán chuỗi QR code Phiếu Thông Tin / Thẻ Thùng..."
                    className="flex-1 px-3.5 py-2 bg-white border border-blue-300 rounded-xl font-mono text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      handleParseAndonQrPayload(andonQrInputText);
                      setAndonQrInputText('');
                    }}
                    className="px-4 py-2 bg-blue-800 hover:bg-blue-900 text-white rounded-xl font-extrabold text-xs cursor-pointer shadow-2xs"
                  >
                    Xác Nhận Quét
                  </button>
                </div>

                {andonScanMessage && (
                  <div className="p-2.5 bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-950 font-bold text-xs flex items-center justify-between">
                    <span>{andonScanMessage}</span>
                    <button
                      type="button"
                      onClick={() => setAndonScanMessage('')}
                      className="text-emerald-800 hover:underline text-[10px] font-extrabold"
                    >
                      Đóng
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowManualForm(!showManualForm)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs rounded-xl transition-all cursor-pointer inline-flex items-center space-x-2 border border-slate-300 shadow-2xs"
                >
                  <SettingsIcon className="w-4 h-4 text-amber-700" />
                  <span>{showManualForm ? 'Ẩn Form Chọn Linh Kiện Thủ Công' : '📋 Hiện Form Chọn Linh Kiện Thủ Công (Không Quét QR)'}</span>
                </button>
              </div>

              {showManualForm && (
                <div className="space-y-4 pt-2 border-t border-slate-200 animate-in fade-in">
                  {/* 1. Dây Chuyền / Bàn Máy Yêu Cầu Cấp Hàng - Default DCLR */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-800">
                        1. Dây Chuyền / Bàn Máy Yêu Cầu Cấp Hàng <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomLineMode(!isCustomLineMode)}
                        className="text-[11px] font-bold text-amber-700 hover:text-amber-900 underline flex items-center space-x-1 cursor-pointer"
                      >
                        <SettingsIcon className="w-3.5 h-3.5" />
                        <span>{isCustomLineMode ? 'Mặc Định DCLR' : 'Sửa Chi Tiết Vị Trí'}</span>
                      </button>
                    </div>

                    {isCustomLineMode ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={assemblyLine}
                          onChange={(e) => setAssemblyLine(e.target.value)}
                          placeholder="Nhập thủ công vị trí / bàn máy / dây chuyền..."
                          className="w-full px-3.5 py-2.5 bg-white border-2 border-amber-400 rounded-xl font-extrabold text-slate-900 text-sm focus:ring-2 focus:ring-amber-500 outline-hidden"
                        />
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <span className="text-[10px] text-slate-500 font-bold">Chọn nhanh:</span>
                          <button
                            type="button"
                            onClick={() => setAssemblyLine('DCLR')}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-amber-100 border border-slate-300 rounded text-[11px] font-bold cursor-pointer"
                          >
                            DCLR (Ghi chung)
                          </button>
                          {assemblyLinesList.map((line) => (
                            <button
                              key={line}
                              type="button"
                              onClick={() => setAssemblyLine(line)}
                              className="px-2 py-0.5 bg-slate-100 hover:bg-amber-100 border border-slate-300 rounded text-[11px] font-bold cursor-pointer"
                            >
                              {line}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={assemblyLine}
                          onChange={(e) => setAssemblyLine(e.target.value)}
                          className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-extrabold text-amber-900 text-sm focus:ring-2 focus:ring-amber-500 outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => setIsCustomLineMode(true)}
                          className="px-3.5 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-extrabold shrink-0 cursor-pointer"
                        >
                          ✏️ Sửa Chi Tiết
                        </button>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1 italic">
                      * Mặc định là DCLR. Bấm "Sửa Chi Tiết" nếu muốn ghi thủ công tên bàn máy / dây chuyền cụ thể.
                    </p>
                  </div>

                  {/* Searchable Select Part Code & Name */}
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      2. Chọn Mã & Tên Linh Kiện Cần Gọi (Chỉ gọi linh kiện trong Danh Sách Chờ Bóc Tách hoặc Kệ Outbuffer) <span className="text-rose-500">*</span>
                    </label>
                    {partSelectOptions.length === 0 ? (
                      <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-xs text-amber-900 space-y-2">
                        <p className="font-extrabold flex items-center space-x-2 text-sm text-amber-950">
                          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                          <span>Chưa Có Linh Kiện Nào Được Xuất Kho Thô Hoặc Tồn Kệ Outbuffer</span>
                        </p>
                        <p className="text-slate-700 leading-relaxed font-medium">
                          Theo quy trình sản xuất, chỉ những linh kiện <strong>đã được xuất kho thô (nằm trong Danh Sách Chờ Bóc Tách)</strong> hoặc <strong>đã có sẵn trên kệ Outbuffer</strong> mới được phép phát tín hiệu gọi cấp hàng.
                        </p>
                        <p className="text-amber-900 font-bold italic">
                          👉 Vui lòng tạo phiếu Xuất Kho Thô từ Kho Tổng trước!
                        </p>
                      </div>
                    ) : (
                      <SearchableSelect
                        options={partSelectOptions}
                        value={selectedPartCode}
                        onChange={(val) => {
                          setSelectedPartCode(val);
                          const info = bufferPartsMap.get(val);
                          if (info && info.availableBuffers.length > 0) {
                            setRequestedQty(Math.min(10, info.availableBuffers[0].currentStockQty));
                          }
                        }}
                        placeholder="Gõ mã hoặc tên linh kiện để tìm kiếm..."
                        required
                        allowCustom={false}
                        icon={<Search className="w-4 h-4" />}
                      />
                    )}
                  </div>

                  {/* Auto-detected Buffer Shelf / Direct Kitting Information Box */}
                  {selectedPartCode && (
                    isDirectKitting ? (
                      <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-amber-900 flex items-center space-x-1.5">
                            <Package className="w-4 h-4 text-amber-600" />
                            <span>Trạng Thái Outbuffer:</span>
                          </span>
                          <span className="font-extrabold text-[11px] px-3 py-1 bg-amber-500 text-slate-950 rounded-xl shadow-xs uppercase">
                            📦 CHƯA CÓ TRÊN KỆ OUTBUFFER
                          </span>
                        </div>
                        <p className="text-slate-800 font-bold">
                          Tên LK: <strong className="text-slate-900">{partName || selectedPartCode}</strong>
                        </p>
                        <div className="p-3 bg-amber-100/90 border border-amber-200 rounded-xl text-amber-950 space-y-1">
                          <p className="flex items-center space-x-1.5 font-extrabold text-amber-900 text-xs">
                            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                            <span>Quy Trình: Bóc Tách Kitting & Giao Thẳng (Cross-Docking)</span>
                          </p>
                          <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                            Linh kiện chưa sẵn sàng trên kệ Outbuffer. Tín hiệu bấm gọi này sẽ thông báo cho bộ phận Logistics <strong>thực hiện Bóc Tách tại Khu Kitting và giao TRỰC TIẾP tới {assemblyLine}</strong> mà không gợi ý vị trí kệ lấy ảo!
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs space-y-3">
                        <div className="space-y-1.5">
                          <label className="block font-extrabold text-emerald-950">
                            Chọn Kệ Outbuffer Lấy Hàng (Ưu tiên FIFO):
                          </label>
                          <select
                            value={targetBufferLocation}
                            onChange={(e) => setSelectedPickShelf(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-white border border-emerald-300 rounded-xl font-bold text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 shadow-xs"
                          >
                            {availableBuffersForPart.map((b, idx) => (
                              <option key={b.locationId} value={b.locationId}>
                                [{b.locationId}] {b.modelName ? ` • Model: ${b.modelName}` : ''} {b.description ? ` (${b.description})` : ''} — Tồn: {b.currentStockQty} {unit} {idx === 0 ? ' ⭐ (Ưu tiên FIFO)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        {(() => {
                          const curBuf = availableBuffersForPart.find((b) => b.locationId === targetBufferLocation) || availableBuffersForPart[0];
                          if (!curBuf) return null;
                          return (
                            <div className="p-3 bg-white border border-emerald-200/80 rounded-xl space-y-1.5 text-xs shadow-xs">
                              <div className="flex items-center justify-between font-bold">
                                <span className="flex items-center space-x-1.5 text-slate-900">
                                  <MapPin className="w-4 h-4 text-emerald-600" />
                                  <span>Kệ Đang Chọn: <strong className="font-mono text-emerald-800 font-extrabold">{curBuf.locationId}</strong></span>
                                </span>
                                {curBuf.locationId === availableBuffersForPart[0]?.locationId && (
                                  <span className="px-2 py-0.5 bg-emerald-700 text-white text-[10px] font-black rounded-md uppercase">
                                    ⭐ Hàng xuất trước (FIFO)
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-[11px] pt-1">
                                {curBuf.modelName ? (
                                  <span className="px-2.5 py-1 bg-blue-50 text-blue-900 border border-blue-200 rounded-lg font-extrabold flex items-center space-x-1">
                                    <Tag className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Model Kệ: <strong>{curBuf.modelName}</strong></span>
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md font-semibold italic border border-slate-200">
                                    Chưa gán Model
                                  </span>
                                )}

                                {curBuf.description && (
                                  <span className="px-2.5 py-1 bg-slate-50 text-slate-800 border border-slate-200 rounded-lg font-bold">
                                    📍 Mô tả vị trí: <strong>{curBuf.description}</strong>
                                  </span>
                                )}

                                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-950 border border-emerald-300 rounded-lg font-extrabold">
                                  📦 Tồn khả dụng: <strong>{curBuf.currentStockQty} {unit}</strong>
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )
                  )}

                  {/* Requested Quantity */}
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      3. Số Lượng Cần Gọi ({unit}) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={requestedQty}
                      onChange={(e) => setRequestedQty(Number(e.target.value))}
                      required
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-black text-amber-800 text-sm focus:ring-2 focus:ring-amber-500 outline-hidden"
                    />
                  </div>

                  {/* Requester Select - Default to Logged in User */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-800">
                        4. Người Yêu Cầu <span className="text-rose-500">*</span>
                      </label>
                      {currentUser && (
                        <button
                          type="button"
                          onClick={() =>
                            setRequestedBy(`${currentUser.fullName} (${currentUser.roleTitle || currentUser.username})`)
                          }
                          className="text-[11px] font-extrabold text-blue-700 hover:underline flex items-center space-x-1 cursor-pointer"
                        >
                          <User className="w-3.5 h-3.5 text-blue-600" />
                          <span>Đặt theo User Đăng Nhập</span>
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={requestedBy}
                      onChange={(e) => setRequestedBy(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-sm focus:ring-2 focus:ring-amber-500 outline-hidden"
                      placeholder="Tên người yêu cầu..."
                    />
                    <p className="text-[10px] text-slate-400 mt-1 italic">
                      * Mặc định theo tài khoản người dùng đang đăng nhập: <strong className="text-slate-700">{defaultRequester}</strong>
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-extrabold rounded-2xl shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2 text-sm mt-4"
                  >
                    <BellRing className="w-5 h-5 animate-bounce" />
                    <span>GỬI YÊU CẦU CẤP HÀNG (ANDON SIGNAL)</span>
                  </button>
                </div>
              )}
            </form>
          </div>
        )}

        {/* TAB 4: CALL HISTORY - ONLY COMPLETED DELIVERIES */}
        {activeTab === 'history' && (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-10 text-center">STT</th>
                    <th className="p-3">Thời Gian Hoàn Tất Giao</th>
                    <th className="p-3">Bàn Máy Nhận</th>
                    <th className="p-3">Mã Linh Kiện</th>
                    <th className="p-3">Tên Linh Kiện</th>
                    <th className="p-3 text-right font-black text-amber-800">SL Cấp</th>
                    <th className="p-3">Kệ Buffer Lấy</th>
                    <th className="p-3">Người Gọi</th>
                    <th className="p-3">Người Giao Hàng</th>
                    <th className="p-3 text-center">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {completedReqs.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-12 text-center text-slate-400">
                        <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                        <p className="font-extrabold text-slate-700 text-sm">Chưa Có Lịch Sử Giao Cấp Hàng Hoàn Tất</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                          Hệ thống chỉ tự động ghi nhận vào lịch sử sau khi nhân viên hoàn tất vận chuyển và bấm nút <strong className="text-emerald-700 font-bold">"XÁC NHẬN ĐÃ GIAO HÀNG TỚI BÀN MÁY"</strong>.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    completedReqs.map((m, idx) => (
                      <tr key={m.requestId} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td className="p-3 text-slate-600 font-semibold">{formatVietnamDateTime(m.deliveredAt || m.requestedAt)}</td>
                        <td className="p-3 font-bold text-slate-800">{m.assemblyLine}</td>
                        <td className="p-3 font-mono font-bold text-purple-800">{m.partCode}</td>
                        <td className="p-3 font-semibold text-slate-900">{m.partName}</td>
                        <td className="p-3 text-right font-black text-emerald-800">{m.requestedQty} {m.unit}</td>
                        <td className="p-3 font-bold text-blue-700">📍 {m.bufferLocation}</td>
                        <td className="p-3 text-slate-600">{m.requestedBy}</td>
                        <td className="p-3 text-slate-700 font-semibold">{m.deliveredBy || '---'}</td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-extrabold rounded-lg border border-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Đã Giao Thành Công</span>
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL QUẢN LÝ BÀN MÁY / VỊ TRÍ NHẬN HÀNG */}
      {isManageLinesModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center space-x-2">
                <Truck className="w-5 h-5 text-amber-600" />
                <span>Quản Lý Vị Trí / Bàn Máy Nhận Hàng</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsManageLinesModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="space-y-2">
              <label className="block font-bold text-slate-800 text-xs">Thêm vị trí mới:</label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newLineInput}
                  onChange={(e) => setNewLineInput(e.target.value)}
                  placeholder="Tên bàn máy (VD: Line SMT 3)..."
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500 outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newLineInput.trim()) return;
                    if (assemblyLinesList.includes(newLineInput.trim())) return;
                    const updated = [...assemblyLinesList, newLineInput.trim()];
                    storageService.saveSettings({ ...settings, assemblyLines: updated });
                    setAssemblyLine(newLineInput.trim());
                    setNewLineInput('');
                    onRefresh();
                  }}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shrink-0"
                >
                  + Thêm
                </button>
              </div>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pt-2">
              <label className="block font-bold text-slate-700 text-[11px] uppercase tracking-wider">Danh sách hiện tại ({assemblyLinesList.length}):</label>
              {assemblyLinesList.map((line, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                >
                  <span>{line}</span>
                  {assemblyLinesList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const updated = assemblyLinesList.filter((_, i) => i !== idx);
                        storageService.saveSettings({ ...settings, assemblyLines: updated });
                        if (assemblyLine === line) {
                          setAssemblyLine(updated[0] || '');
                        }
                        onRefresh();
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                      title="Xóa vị trí này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsManageLinesModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold cursor-pointer"
              >
                Hoàn Tất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Andon Scan Confirmation Popup Modal */}
      {andonModalData && andonModalData.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 relative">
            <button
              type="button"
              onClick={() => setAndonModalData(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
              <div className="p-3 bg-amber-100 text-amber-900 rounded-2xl">
                <Bell className="w-6 h-6 text-amber-700 animate-bounce" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full inline-block">
                  ⚡ POPUP PHIẾU GỌI LINH KIỆN TỰ ĐỘNG (ANDON SIGNAL)
                </span>
                <h2 className="text-lg sm:text-xl font-black text-slate-900">
                  [SUNHOUSE] YÊU CẦU CẤP LINH KIỆN CHO DÂY CHUYỀN
                </h2>
              </div>
            </div>

            {/* Scanned Tag & Kitting Status info card */}
            <div className="p-4 rounded-2xl border border-slate-200 space-y-3 bg-slate-50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-black text-xs px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-blue-900">
                  MÃ LINH KIỆN: {andonModalData.partCode}
                </span>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-black border ${
                    andonModalData.isKitted
                      ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                      : 'bg-amber-100 text-amber-950 border-amber-300'
                  }`}
                >
                  {andonModalData.statusText}
                </span>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 text-xs">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Tên Linh Kiện</span>
                <span className="font-extrabold text-slate-900 text-sm block">{andonModalData.partName}</span>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1 text-xs text-blue-900 font-bold">
                <span>{andonModalData.locationGuideText}</span>
              </div>
            </div>

            {/* Inputs in Modal */}
            <div className="space-y-4 text-xs">
              {/* Requested Qty & Destination Line */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    SỐ LƯỢNG YÊU CẦU CẤP ({andonModalData.unit}) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={requestedQty}
                    onChange={(e) => setRequestedQty(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-amber-50 border-2 border-amber-300 rounded-xl font-black text-amber-900 text-base focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    * Tự động nhận diện từ quy cách Thẻ Thùng ({andonModalData.standardQty} {andonModalData.unit}).
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    DÂY CHUYỀN / BÀN MÁY NHẬN HÀNG <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={assemblyLine}
                    onChange={(e) => setAssemblyLine(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-blue-50 border-2 border-blue-300 rounded-xl font-extrabold text-blue-900 text-sm focus:ring-2 focus:ring-blue-500 outline-hidden"
                  >
                    {assemblyLinesList.map((line) => (
                      <option key={line} value={line}>
                        📍 {line}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    * Mặc định theo bàn máy / dây chuyền yêu cầu ({assemblyLine}).
                  </p>
                </div>
              </div>

              {/* OUTBUFFER PICK SHELF SELECTOR & MODEL DISPLAY */}
              {andonModalData.isKitted && andonModalData.availableBuffers.length > 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div>
                    <label className="block font-extrabold text-slate-800 mb-1">
                      CHỌN KỆ OUTBUFFER LẤY HÀNG (ƯU TIÊN FIFO) <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedPickShelf || andonModalData.recommendedLocation}
                        onChange={(e) => setSelectedPickShelf(e.target.value)}
                        className="flex-1 px-3.5 py-2.5 bg-white border-2 border-emerald-500 rounded-xl font-black text-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 shadow-xs"
                      >
                        {andonModalData.availableBuffers.map((b, idx) => (
                          <option key={b.locationId} value={b.locationId}>
                            [{b.locationId}] {b.modelName ? ` • Model: ${b.modelName}` : ''} {b.description ? ` (${b.description})` : ''} — Tồn: {b.currentStockQty} {andonModalData.unit} {idx === 0 ? ' ⭐ (Ưu tiên FIFO)' : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setIsAndonModalCameraOpen(!isAndonModalCameraOpen)}
                        className="px-3 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs rounded-xl flex items-center space-x-1 shrink-0 cursor-pointer shadow-xs"
                      >
                        <QrCode className="w-4 h-4 text-amber-300" />
                        <span>{isAndonModalCameraOpen ? 'Ẩn' : 'Quét Kệ'}</span>
                      </button>
                    </div>

                    {isAndonModalCameraOpen && (
                      <div className="mt-2">
                        <SmoothCameraScanner
                          onScanSuccess={(scannedShelf) => {
                            setIsAndonModalCameraOpen(false);
                            const cleanShelf = scannedShelf.trim().toUpperCase();
                            setSelectedPickShelf(cleanShelf);
                          }}
                          onClose={() => setIsAndonModalCameraOpen(false)}
                          placeholderText="Căn mã QR Kệ Outbuffer cần lấy vào giữa khung hình camera..."
                          autoCloseOnScan={true}
                        />
                      </div>
                    )}
                  </div>

                  {(() => {
                    const currentShelfId = selectedPickShelf || andonModalData.recommendedLocation;
                    const curBuf = andonModalData.availableBuffers.find((b) => b.locationId === currentShelfId) || andonModalData.availableBuffers[0];
                    if (!curBuf) return null;
                    return (
                      <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 text-xs shadow-xs">
                        <div className="flex items-center justify-between font-bold text-slate-900">
                          <span className="flex items-center space-x-1.5">
                            <MapPin className="w-4 h-4 text-emerald-600" />
                            <span>Kệ Đang Chọn: <strong className="font-mono text-emerald-800 font-black">{curBuf.locationId}</strong></span>
                          </span>
                          {curBuf.locationId === andonModalData.recommendedLocation && (
                            <span className="px-2 py-0.5 bg-emerald-700 text-white text-[10px] font-black rounded-md uppercase">
                              ⭐ Hàng xuất trước (FIFO)
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[11px] pt-1">
                          {curBuf.modelName ? (
                            <span className="px-2.5 py-1 bg-blue-50 text-blue-900 border border-blue-200 rounded-lg font-extrabold flex items-center space-x-1">
                              <Tag className="w-3.5 h-3.5 text-blue-600" />
                              <span>Model Kệ: <strong>{curBuf.modelName}</strong></span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md font-semibold italic border border-slate-200">
                              Chưa gán Model
                            </span>
                          )}

                          {curBuf.description && (
                            <span className="px-2.5 py-1 bg-slate-50 text-slate-800 border border-slate-200 rounded-lg font-bold">
                              📍 Mô tả vị trí: <strong>{curBuf.description}</strong>
                            </span>
                          )}

                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-950 border border-emerald-300 rounded-lg font-extrabold">
                            📦 Tồn trên kệ này: <strong>{curBuf.currentStockQty} {andonModalData.unit}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1 text-amber-950">
                  <span className="font-extrabold flex items-center space-x-1.5 text-amber-900">
                    <Truck className="w-4 h-4 text-amber-600" />
                    <span>Lộ Trình Lấy Hàng: CROSS-DOCKING TỪ KHU BÓC TÁCH KITTING</span>
                  </span>
                  <p className="text-[11px] font-medium text-slate-700">
                    Mã linh kiện chưa có sẵn trên kệ Outbuffer. Tín hiệu bấm gọi này sẽ chuyển yêu cầu tới bộ phận Logistics để bóc tách trực tiếp và giao thẳng tới {assemblyLine}.
                  </p>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-800 mb-1">NGƯỜI YÊU CẦU CẤP HÀNG</label>
                <div className="flex items-center space-x-2 px-3.5 py-2.5 bg-slate-100 border border-slate-300 rounded-xl font-bold text-slate-900 text-xs">
                  <User className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>{requestedBy}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setAndonModalData(null)}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                HỦY / ĐÓNG
              </button>
              <button
                type="button"
                onClick={handleConfirmAndonFromModal}
                className="w-full sm:w-auto px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-black text-xs shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                <Bell className="w-4 h-4 text-slate-950" />
                <span>🔔 XÁC NHẬN GỬI YÊU CẦU GỌI HÀNG (ANDON SIGNAL)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Andon Error Modal */}
      {andonErrorModal && andonErrorModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-rose-300 space-y-4 relative text-center">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h3 className="text-base font-black text-rose-900">{andonErrorModal.title}</h3>
            <p className="text-xs text-slate-700 leading-relaxed font-semibold bg-rose-50 p-3 rounded-2xl border border-rose-200">
              {andonErrorModal.message}
            </p>

            <button
              type="button"
              onClick={() => setAndonErrorModal(null)}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-extrabold text-xs cursor-pointer shadow-md"
            >
              Đã Hiểu / Đóng
            </button>
          </div>
        </div>
      )}

      {/* Container Tag Manager Modal for Andon Selection */}
      <ContainerTagManagerModal
        isOpen={isAndonTagManagerOpen}
        onClose={() => setIsAndonTagManagerOpen(false)}
        onSelectTagForKitting={(tag) => {
          handleParseAndonQrPayload(tag.qrPayload || tag.partCode);
          setIsAndonTagManagerOpen(false);
        }}
      />
    </div>
  );
};
