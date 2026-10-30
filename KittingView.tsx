import React, { useState, useEffect } from 'react';
import { KittingQueueItem, AppSettings, BufferLocationMap, BufferPartItem } from './types';
import { storageService } from './storage';
import { SearchableSelect, SelectOption } from './SearchableSelect';
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
  Pencil,
  Plus,
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
  ChevronDown,
  ChevronRight,
  FileText,
  Undo2,
  Lock,
  ArrowRight,
  Layers,
  Eye,
} from 'lucide-react';

export interface PendingVoucherGroup {
  voucherCode: string;
  voucherTitle: string;
  createdAt: string;
  operatorName?: string;
  items: KittingQueueItem[];
  totalPartsCount: number;
  totalRawQty: number;
  totalKittedQty: number;
  remainingQty: number;
  isCompleted: boolean;
}

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

  // Voucher-based Kitting Management States
  const [selectedVoucherCode, setSelectedVoucherCode] = useState<string>('');
  const [expandedVoucherCodes, setExpandedVoucherCodes] = useState<string[]>([]);
  const [voucherSearchTerm, setVoucherSearchTerm] = useState<string>('');
  const [rollbackModalData, setRollbackModalData] = useState<{
    isOpen: boolean;
    voucher: PendingVoucherGroup | null;
  }>({ isOpen: false, voucher: null });
  const [isRollbacking, setIsRollbacking] = useState<boolean>(false);
  const [deletePendingModalData, setDeletePendingModalData] = useState<{
    isOpen: boolean;
    type: 'item' | 'voucher' | 'all';
    itemId?: string;
    allItemIds?: string[];
    itemCode?: string;
    itemName?: string;
    itemQty?: number;
    voucherCode?: string;
    voucherTitle?: string;
    partsCount?: number;
    totalQty?: number;
  }>({ isOpen: false, type: 'item' });
  const [isDeletingPending, setIsDeletingPending] = useState<boolean>(false);

  // Admin Edit Pending Quantity Modal State
  const [editPendingModalData, setEditPendingModalData] = useState<{
    isOpen: boolean;
    voucherCode: string;
    partCode: string;
    partName: string;
    unit: string;
    currentRawQty: number;
    newRawQty: number;
  }>({
    isOpen: false,
    voucherCode: '',
    partCode: '',
    partName: '',
    unit: 'Cái',
    currentRawQty: 0,
    newRawQty: 0,
  });
  const [isSavingEditPending, setIsSavingEditPending] = useState<boolean>(false);

  // Admin Add Part To Pending Voucher Modal State
  const [addPartPendingModalData, setAddPartPendingModalData] = useState<{
    isOpen: boolean;
    voucherCode: string;
    voucherTitle: string;
    selectedPartCode: string;
    selectedPartName: string;
    unit: string;
    rawQty: number;
    sourceBin: string;
  }>({
    isOpen: false,
    voucherCode: '',
    voucherTitle: '',
    selectedPartCode: '',
    selectedPartName: '',
    unit: 'Cái',
    rawQty: 100,
    sourceBin: 'Kho chính',
  });
  const [isSavingAddPartPending, setIsSavingAddPartPending] = useState<boolean>(false);

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

  // Filter & harmonize completed kitting records with Buffer Racks and Delivered Material Calls (Andon)
  const queueCompleted = queue.filter((i) => i.status === 'IN_BUFFER' || i.status === 'DELIVERED');
  const kittingScanLogs = storageService.getKittingScanLogs();
  const materialCalls = storageService.getMaterialCallRequests();

  // Completed delivery requests (Andon calls) dispatched from buffer shelves
  const completedDeliveries: KittingQueueItem[] = materialCalls
    .filter(
      (req) =>
        req.status === 'COMPLETED' &&
        req.bufferLocation &&
        req.bufferLocation !== 'DCLR' &&
        !req.isDirectKitting
    )
    .map((req) => ({
      id: `delivery-${req.requestId}`,
      transactionId: req.requestId,
      voucherCode: 'GIAO_ANDON',
      voucherTitle: `Giao cấp hàng Andon (${req.assemblyLine || 'Dây chuyền'})`,
      partCode: req.partCode,
      partName: req.partName,
      unit: req.unit || 'Cái',
      rawQuantity: req.requestedQty,
      kittedQuantity: req.requestedQty,
      scrapQuantity: 0,
      bufferLocation: req.bufferLocation,
      status: 'DELIVERED' as const,
      createdAt: req.requestedAt,
      endTime: req.deliveredAt || req.requestedAt,
      operatorName: req.deliveredBy || 'Thủ Kho Logistics',
      durationMinutes: 5,
    }));

  // Reconcile physical buffer shelf inventory:
  // If a shelf currently holds stock that exceeds the queue's IN_BUFFER records,
  // reconcile the difference as an active IN_BUFFER kitting record so history and shelf stock match 100%
  const rackStockRecords: KittingQueueItem[] = [];
  buffers.forEach((buf) => {
    const bItems: BufferPartItem[] =
      buf.items && buf.items.length > 0
        ? buf.items
        : buf.partCode && buf.currentStockQty > 0
        ? [
            {
              partCode: buf.partCode,
              partName: buf.partName || buf.partCode,
              unit: buf.unit || 'Cái',
              currentStockQty: buf.currentStockQty,
              lastUpdated: buf.lastUpdated,
            },
          ]
        : [];

    bItems.forEach((bItem) => {
      if (!bItem.currentStockQty || bItem.currentStockQty <= 0) return;
      const matchingQueue = queueCompleted.filter(
        (q) =>
          q.status === 'IN_BUFFER' &&
          q.bufferLocation.trim().toLowerCase() === buf.locationId.trim().toLowerCase() &&
          q.partCode.trim().toLowerCase() === bItem.partCode.trim().toLowerCase()
      );
      const queueSum = matchingQueue.reduce(
        (s, q) => s + (q.kittedQuantity || q.rawQuantity || 0),
        0
      );
      if (bItem.currentStockQty > queueSum) {
        rackStockRecords.push({
          id: `rack-stock-${buf.locationId}-${bItem.partCode}`,
          transactionId: `rack-${buf.locationId}`,
          voucherCode: 'KHO_OUTBUFFER',
          voucherTitle: `Tồn khoang kệ ${buf.locationId}`,
          partCode: bItem.partCode,
          partName: bItem.partName || bItem.partCode,
          unit: bItem.unit || 'Cái',
          rawQuantity: bItem.currentStockQty - queueSum,
          kittedQuantity: bItem.currentStockQty - queueSum,
          scrapQuantity: 0,
          bufferLocation: buf.locationId,
          status: 'IN_BUFFER' as const,
          createdAt: bItem.lastUpdated || buf.lastUpdated || new Date().toISOString(),
          endTime: bItem.lastUpdated || buf.lastUpdated || new Date().toISOString(),
          operatorName: 'Tuấn (Thủ Kho)',
          durationMinutes: 15,
        });
      }
    });
  });

  // Deduplicate and combine into completedItems
  const completedItems: KittingQueueItem[] = [
    ...queueCompleted,
    ...rackStockRecords,
    ...completedDeliveries.filter(
      (d) =>
        !queueCompleted.some(
          (q) =>
            q.status === 'DELIVERED' &&
            q.partCode.trim().toLowerCase() === d.partCode.trim().toLowerCase() &&
            q.bufferLocation.trim().toLowerCase() === d.bufferLocation.trim().toLowerCase() &&
            q.kittedQuantity === d.kittedQuantity
        )
    ),
  ];

  // FIFO Dynamic Reconciliation: Automatically allocate completed history & scan logs onto pending queue items
  // QUY TẮC NGHIỆP VỤ: Nếu xuất kho nhiều đợt sẽ phải CỘNG DỒN vào SL đề nghị ban đầu
  const rawPendingItems = (() => {
    // 1. Get all OUT transactions to establish the true export quantity and source shelves
    const allTxs = storageService.getTransactions();
    const outTxs = allTxs.filter((t) => t.type === 'OUT');
    const txMap = new Map(outTxs.map((t) => [t.id, t]));

    // 2. Consolidate items by voucherCode + partCode (Cộng dồn nhiều đợt xuất theo đúng số lượng đề nghị ban đầu)
    const consolidatedMap = new Map<
      string,
      KittingQueueItem & { distinctTxIds: Set<string>; hasPendingQueue: boolean }
    >();

    queue.forEach((item) => {
      const vCode = (item.voucherCode || 'PHIẾU_XUẤT_LẺ').trim();
      const pCode = item.partCode.trim().toLowerCase();
      const groupKey = `${vCode.toLowerCase()}__${pCode}`;

      const existing = consolidatedMap.get(groupKey);
      if (existing) {
        if (item.status === 'PENDING_KITTING') {
          existing.hasPendingQueue = true;
        }
        if (item.sourceBin && !existing.sourceBin?.includes(item.sourceBin)) {
          existing.sourceBin = existing.sourceBin ? `${existing.sourceBin}, ${item.sourceBin}` : item.sourceBin;
        }
        if (item.fifoAllocations && item.fifoAllocations.length > 0) {
          existing.fifoAllocations = [
            ...(existing.fifoAllocations || []),
            ...item.fifoAllocations,
          ];
        }
        if (!existing.allItemIds) {
          existing.allItemIds = [existing.id];
        }
        existing.allItemIds.push(item.id);
        existing.batchCount = (existing.batchCount || 1) + 1;
        if (new Date(item.createdAt).getTime() < new Date(existing.createdAt).getTime()) {
          existing.createdAt = item.createdAt;
        }
        if (item.transactionId && txMap.has(item.transactionId)) {
          existing.distinctTxIds.add(item.transactionId);
        }
        if (item.transactionIds && Array.isArray(item.transactionIds)) {
          item.transactionIds.forEach((tId) => {
            if (txMap.has(tId)) existing.distinctTxIds.add(tId);
          });
        }
        existing.rawQuantity += item.rawQuantity;
      } else {
        const distinctTxIds = new Set<string>();
        if (item.transactionId && txMap.has(item.transactionId)) {
          distinctTxIds.add(item.transactionId);
        }
        if (item.transactionIds && Array.isArray(item.transactionIds)) {
          item.transactionIds.forEach((tId) => {
            if (txMap.has(tId)) distinctTxIds.add(tId);
          });
        }

        consolidatedMap.set(groupKey, {
          ...item,
          voucherCode: vCode,
          voucherTitle:
            item.voucherTitle ||
            (vCode === 'PHIẾU_XUẤT_LẺ'
              ? 'Linh kiện xuất lẻ (Chưa gán mã phiếu)'
              : `Phiếu xuất ${vCode}`),
          allItemIds: [item.id],
          batchCount: 1,
          distinctTxIds,
          hasPendingQueue: item.status === 'PENDING_KITTING',
          rawQuantity: item.rawQuantity,
        });
      }
    });

    // Match transactions directly from outTxs for voucherCode and partCode
    const txByVoucherAndPart = new Map<string, number>();
    outTxs.forEach((tx) => {
      let vCode = tx.voucherCode || '';
      if (!vCode && tx.notes && tx.notes.includes('PXK-')) {
        const match = tx.notes.match(/PXK-[A-Z0-9-]+/i);
        if (match) vCode = match[0].trim();
      }
      if (!vCode && tx.reasonOrPurpose && tx.reasonOrPurpose.includes('PXK-')) {
        const match = tx.reasonOrPurpose.match(/PXK-[A-Z0-9-]+/i);
        if (match) vCode = match[0].trim();
      }
      if (!vCode && tx.productionOrder && tx.productionOrder.startsWith('PXK-')) {
        vCode = tx.productionOrder.trim();
      }
      if (vCode) {
        const key = `${vCode.toLowerCase()}__${tx.partCode.trim().toLowerCase()}`;
        txByVoucherAndPart.set(key, (txByVoucherAndPart.get(key) || 0) + (Number(tx.quantity) || 0));
      }
    });

    // Synthesize entries for any OUT transactions matching a voucherCode that aren't yet in consolidatedMap
    txByVoucherAndPart.forEach((txSum, groupKey) => {
      if (!consolidatedMap.has(groupKey) && txSum > 0) {
        const [vCodeLower, pCodeLower] = groupKey.split('__');
        const matchingTxs = outTxs.filter((tx) => {
          const txVCode = (tx.voucherCode || tx.notes?.match(/PXK-[A-Z0-9-]+/i)?.[0] || tx.reasonOrPurpose?.match(/PXK-[A-Z0-9-]+/i)?.[0] || tx.productionOrder || '').trim().toLowerCase();
          return txVCode === vCodeLower && tx.partCode.trim().toLowerCase() === pCodeLower;
        });

        if (matchingTxs.length > 0) {
          const sampleTx = matchingTxs[0];
          const vCode = matchingTxs.map(t => t.voucherCode || t.notes?.match(/PXK-[A-Z0-9-]+/i)?.[0] || t.reasonOrPurpose?.match(/PXK-[A-Z0-9-]+/i)?.[0] || t.productionOrder).find(Boolean) || vCodeLower.toUpperCase();
          const sourceBins = Array.from(new Set(matchingTxs.map(t => t.locationId).filter(Boolean))).join(', ') || 'Kho chính';

          consolidatedMap.set(groupKey, {
            id: 'kit-synth-' + sampleTx.id,
            transactionId: sampleTx.id,
            transactionIds: matchingTxs.map(t => t.id),
            voucherCode: vCode,
            voucherTitle: `Phiếu xuất ${vCode}`,
            sourceBin: sourceBins,
            partCode: sampleTx.partCode,
            partName: sampleTx.partName,
            unit: sampleTx.unit,
            rawQuantity: txSum,
            kittedQuantity: 0,
            scrapQuantity: 0,
            bufferLocation: 'BUFFER-A1-01',
            status: 'PENDING_KITTING',
            createdAt: sampleTx.date,
            operatorName: sampleTx.person || 'Lê Hoàng Nam',
            allItemIds: matchingTxs.map(t => t.id),
            batchCount: matchingTxs.length,
            distinctTxIds: new Set(matchingTxs.map(t => t.id)),
            hasPendingQueue: true,
          });
        }
      }
    });

    // Reconcile with saved BomExportVouchers (storageService.getBomExportVouchers)
    // Ensures that 100% of exported items in a voucher (e.g. 87 items) are always present in consolidatedMap
    const bomVouchers = storageService.getBomExportVouchers();
    bomVouchers.forEach((v) => {
      if (v.status !== 'ROLLED_BACK' && Array.isArray(v.items)) {
        v.items.forEach((vItem) => {
          const expQty = Number(vItem.exportedQty ?? vItem.totalQtyOut) || 0;
          if (expQty > 0) {
            const groupKey = `${v.voucherCode.trim().toLowerCase()}__${vItem.partCode.trim().toLowerCase()}`;
            const existing = consolidatedMap.get(groupKey);
            if (existing) {
              existing.rawQuantity = Math.max(existing.rawQuantity, expQty);
              if (vItem.fifoLocation && !existing.sourceBin?.includes(vItem.fifoLocation)) {
                existing.sourceBin = existing.sourceBin ? `${existing.sourceBin}, ${vItem.fifoLocation}` : vItem.fifoLocation;
              }
            } else {
              consolidatedMap.set(groupKey, {
                id: 'kit-vch-' + v.id + '-' + vItem.partCode,
                transactionId: 'tx-vch-' + v.id,
                transactionIds: [],
                voucherCode: v.voucherCode,
                voucherTitle: `Model BOM: ${v.modelName}`,
                sourceBin: vItem.fifoLocation || 'Kho chính',
                partCode: vItem.partCode,
                partName: vItem.partName,
                unit: vItem.unit || 'Cái',
                rawQuantity: expQty,
                kittedQuantity: 0,
                scrapQuantity: 0,
                bufferLocation: 'BUFFER-A1-01',
                status: 'PENDING_KITTING',
                createdAt: v.createdAt || v.dateTime || new Date().toISOString(),
                operatorName: v.person || 'Lê Hoàng Nam',
                allItemIds: ['kit-vch-' + v.id + '-' + vItem.partCode],
                batchCount: 1,
                distinctTxIds: new Set<string>(),
                hasPendingQueue: true,
              });
            }
          }
        });
      }
    });

    // Reconcile rawQuantity so it always reflects the maximum of accumulated queue quantity or transaction sum
    consolidatedMap.forEach((entry, key) => {
      let txTotal = 0;
      if (entry.distinctTxIds.size > 0) {
        entry.distinctTxIds.forEach((tId) => {
          const t = txMap.get(tId);
          if (t) {
            txTotal += Number(t.quantity) || 0;
            const loc = (t.locationId || '').trim();
            if (loc && !entry.sourceBin?.includes(loc)) {
              entry.sourceBin = entry.sourceBin ? `${entry.sourceBin}, ${loc}` : loc;
            }
          }
        });
      }

      const txVoucherTotal = txByVoucherAndPart.get(key) || 0;
      const trueMaxQty = Math.max(entry.rawQuantity, txTotal, txVoucherTotal);
      if (trueMaxQty > 0) {
        entry.rawQuantity = trueMaxQty;
      }
    });

    const pendingList = Array.from(consolidatedMap.values());

    // Aggregate total kitted quantity directly from completed items (unified ledger matching Lịch sử bóc tách 100%)
    const kittedHistoryByPart = new Map<string, number>();

    completedItems.forEach((item) => {
      const code = item.partCode.trim().toLowerCase();
      const qty = item.kittedQuantity || item.rawQuantity || 0;
      kittedHistoryByPart.set(code, (kittedHistoryByPart.get(code) || 0) + qty);
    });

    // Group pending items by partCode
    const pendingByPartMap = new Map<string, typeof pendingList>();
    pendingList.forEach((item) => {
      const code = item.partCode.trim().toLowerCase();
      if (!pendingByPartMap.has(code)) {
        pendingByPartMap.set(code, []);
      }
      pendingByPartMap.get(code)!.push(item);
    });

    // FIFO Allocation: Sort by createdAt ASC (oldest stock-out voucher first)
    pendingByPartMap.forEach((itemsForPart, code) => {
      itemsForPart.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      let availableHistoryQty = kittedHistoryByPart.get(code) || 0;

      itemsForPart.forEach((pItem) => {
        const needed = pItem.rawQuantity;
        if (availableHistoryQty > 0) {
          const alloc = Math.min(needed, availableHistoryQty);
          pItem.kittedQuantity = alloc;
          availableHistoryQty -= alloc;
        } else {
          pItem.kittedQuantity = 0;
        }
      });
    });

    return pendingList;
  })();

  const pendingItems = rawPendingItems;

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
  }).sort((a, b) => new Date(b.endTime || b.createdAt).getTime() - new Date(a.endTime || a.createdAt).getTime());

  const totalFilteredKittedQty = filteredCompletedItems.reduce((sum, i) => sum + (i.kittedQuantity || 0), 0);
  const totalFilteredScrapQty = filteredCompletedItems.reduce((sum, i) => sum + (i.scrapQuantity || 0), 0);

  // Group pending items by Mã Phiếu Xuất Kho (voucherCode)
  const groupedVouchersMap = new Map<string, PendingVoucherGroup>();

  rawPendingItems.forEach((item) => {
    const vCode = (item.voucherCode || 'PHIẾU_XUẤT_LẺ').trim();
    const existing = groupedVouchersMap.get(vCode);
    const unkitted = Math.max(0, item.rawQuantity - (item.kittedQuantity || 0));

    if (existing) {
      existing.items.push(item);
      existing.totalPartsCount = existing.items.length;
      existing.totalRawQty += item.rawQuantity;
      existing.totalKittedQty += (item.kittedQuantity || 0);
      existing.remainingQty += unkitted;
      if (new Date(item.createdAt).getTime() < new Date(existing.createdAt).getTime()) {
        existing.createdAt = item.createdAt;
      }
    } else {
      groupedVouchersMap.set(vCode, {
        voucherCode: vCode,
        voucherTitle:
          item.voucherTitle ||
          (vCode === 'PHIẾU_XUẤT_LẺ'
            ? 'Linh kiện xuất lẻ (Chưa gán mã phiếu)'
            : `Phiếu xuất ${vCode}`),
        createdAt: item.createdAt,
        operatorName: item.operatorName,
        items: [item],
        totalPartsCount: 1,
        totalRawQty: item.rawQuantity,
        totalKittedQty: item.kittedQuantity || 0,
        remainingQty: unkitted,
        isCompleted: false,
      });
    }
  });

  // Filter out vouchers where remainingQty === 0 (fully finished vouchers disappear from pending list)
  const groupedVouchersList: PendingVoucherGroup[] = Array.from(groupedVouchersMap.values())
    .filter((v) => v.remainingQty > 0)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const filteredVouchersList = groupedVouchersList.filter((v) => {
    if (!voucherSearchTerm.trim()) return true;
    const q = voucherSearchTerm.toLowerCase().trim();
    const matchVoucher =
      v.voucherCode.toLowerCase().includes(q) ||
      v.voucherTitle.toLowerCase().includes(q) ||
      (v.operatorName && v.operatorName.toLowerCase().includes(q));
    if (matchVoucher) return true;
    return v.items.some(
      (i) => i.partCode.toLowerCase().includes(q) || i.partName.toLowerCase().includes(q)
    );
  });

  const toggleVoucherExpanded = (vCode: string) => {
    setExpandedVoucherCodes((prev) =>
      prev.includes(vCode) ? prev.filter((c) => c !== vCode) : [...prev, vCode]
    );
  };

  // Legacy partCode grouped list (for fast lookup & summary)
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

    // Automatically detect pending vouchers containing this partCode, sorted by newest order first
    const vouchersForPart = rawPendingItems
      .filter((i) => i.partCode.trim().toLowerCase() === (tag.partCode || '').trim().toLowerCase())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (vouchersForPart.length > 0) {
      // Default to the newest order containing this part
      const newestVoucherCode = (vouchersForPart[0].voucherCode || 'PHIẾU_XUẤT_LẺ').trim();
      setSelectedVoucherCode(newestVoucherCode);
    }

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
    setSelectedVoucherCode((item.voucherCode || 'PHIẾU_XUẤT_LẺ').trim());
    setPartCode(item.partCode);
    setPartName(item.partName);

    const remainingUnkitted = Math.max(0, item.rawQuantity - (item.kittedQuantity || 0));
    setStandardQty(remainingUnkitted || item.rawQuantity);
    setActualQty(remainingUnkitted || item.rawQuantity);
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

    if (pendingForPart.length === 0) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'BÓC TÁCH THẤT BẠI',
        message: `Mã linh kiện [${partCode}] KHÔNG CÓ TRONG DANH SÁCH CHỜ BÓC TÁCH! Hệ thống không cho phép bóc tách tự do nếu chưa có đơn xuất thô từ Kho.`,
      });
      return;
    }

    // Determine target voucher to deduct from (User requirement: Trừ đúng theo từng mã phiếu xuất kho)
    let targetVoucher = selectedVoucherCode.trim();
    if (!targetVoucher) {
      // Pick oldest voucher containing this part
      targetVoucher = (pendingForPart[0]?.voucherCode || 'PHIẾU_XUẤT_LẺ').trim();
    }

    // Find pending items belonging specifically to this target voucher
    const targetVoucherItems = pendingForPart.filter(
      (i) => (i.voucherCode || 'PHIẾU_XUẤT_LẺ').trim().toLowerCase() === targetVoucher.toLowerCase()
    );

    const availableInTargetVoucher = targetVoucherItems.reduce(
      (sum, item) => sum + Math.max(0, item.rawQuantity - (item.kittedQuantity || 0)),
      0
    );

    if (targetVoucherItems.length === 0 || availableInTargetVoucher <= 0) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'BÓC TÁCH THẤT BẠI',
        message: `Linh kiện [${partCode}] KHÔNG CÒN TỒN trong Mã phiếu [${targetVoucher}]! Vui lòng kiểm tra và chọn đúng Mã phiếu xuất kho có linh kiện này.`,
      });
      return;
    }

    if (actualQty > availableInTargetVoucher) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'BÓC TÁCH THẤT BẠI',
        message: `SỐ LƯỢNG BÓC TÁCH VƯỢT QUÁ TỒN TRONG PHIẾU! Trong Mã phiếu [${targetVoucher}] hiện chỉ còn ${availableInTargetVoucher} ${unit}, nhưng bạn đang yêu cầu bóc tách ${actualQty} ${unit}. Vui lòng nhập tối đa ${availableInTargetVoucher} ${unit}.`,
      });
      return;
    }

    // Process deduction strictly from the selected voucher items
    try {
      let remainingToKitting = actualQty;

      // If a specific queue item was clicked and belongs to this voucher
      if (selectedItem && selectedItem.partCode.toLowerCase() === partCode.toLowerCase()) {
        const currentItemInQueue = allQueue.find((q) => q.id === selectedItem.id);
        if (
          currentItemInQueue &&
          currentItemInQueue.status === 'PENDING_KITTING' &&
          (currentItemInQueue.voucherCode || 'PHIẾU_XUẤT_LẺ').trim().toLowerCase() === targetVoucher.toLowerCase()
        ) {
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
                createdAt: currentItemInQueue.createdAt,
                voucherCode: currentItemInQueue.voucherCode,
                voucherTitle: currentItemInQueue.voucherTitle,
                sourceBin: currentItemInQueue.sourceBin,
                fifoAllocations: currentItemInQueue.fifoAllocations,
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

      // If remainingToKitting > 0, consume sequentially from this voucher's items
      if (remainingToKitting > 0) {
        for (const pItem of targetVoucherItems) {
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
              createdAt: freshItem.createdAt,
              voucherCode: freshItem.voucherCode,
              voucherTitle: freshItem.voucherTitle,
              sourceBin: freshItem.sourceBin,
              fifoAllocations: freshItem.fifoAllocations,
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

  const handleRequestDeleteItem = (item: KittingQueueItem) => {
    if (!isAdmin) {
      alert('⛔ QUYỀN HẠN BỊ TỪ CHỐI!\nChỉ tài khoản Quản trị viên (ADMIN) mới có quyền xóa linh kiện trong danh sách chờ bóc tách!');
      return;
    }
    const unkitted = Math.max(0, item.rawQuantity - (item.kittedQuantity || 0));
    setDeletePendingModalData({
      isOpen: true,
      type: 'item',
      itemId: item.id,
      allItemIds: item.allItemIds || [item.id],
      itemCode: item.partCode,
      itemName: item.partName,
      itemQty: unkitted,
      voucherCode: item.voucherCode || 'PHIẾU_XUẤT_LẺ',
    });
  };

  const handleRequestDeleteVoucher = (voucher: PendingVoucherGroup) => {
    if (!isAdmin) {
      alert('⛔ QUYỀN HẠN BỊ TỪ CHỐI!\nChỉ tài khoản Quản trị viên (ADMIN) mới có quyền xóa mã phiếu trong danh sách chờ bóc tách!');
      return;
    }
    setDeletePendingModalData({
      isOpen: true,
      type: 'voucher',
      voucherCode: voucher.voucherCode,
      voucherTitle: voucher.voucherTitle,
      partsCount: voucher.totalPartsCount,
      totalQty: voucher.remainingQty,
    });
  };

  const handleRequestClearAllPending = () => {
    if (!isAdmin) {
      alert('⛔ QUYỀN HẠN BỊ TỪ CHỐI!\nChỉ tài khoản Quản trị viên (ADMIN) mới có quyền xóa toàn bộ danh sách chờ bóc tách!');
      return;
    }
    const totalRemaining = rawPendingItems.reduce(
      (sum, i) => sum + Math.max(0, i.rawQuantity - (i.kittedQuantity || 0)),
      0
    );
    setDeletePendingModalData({
      isOpen: true,
      type: 'all',
      partsCount: rawPendingItems.length,
      totalQty: totalRemaining,
    });
  };

  const handleConfirmDeletePending = async () => {
    if (!isAdmin) {
      alert('⛔ QUYỀN HẠN BỊ TỪ CHỐI!\nChỉ tài khoản Quản trị viên (ADMIN) mới có quyền thực hiện thao tác này!');
      return;
    }
    setIsDeletingPending(true);
    try {
      if (deletePendingModalData.type === 'item') {
        const idsToDelete =
          deletePendingModalData.allItemIds && deletePendingModalData.allItemIds.length > 0
            ? deletePendingModalData.allItemIds
            : deletePendingModalData.itemId
            ? [deletePendingModalData.itemId]
            : [];
        for (const id of idsToDelete) {
          await storageService.deleteKittingItem(id);
        }
        setResultModal({
          isOpen: true,
          isSuccess: true,
          title: 'XÓA LINH KIỆN CHỜ BÓC TÁCH THÀNH CÔNG',
          message: `✅ ĐÃ XÓA THÀNH CÔNG!\nLinh kiện [${deletePendingModalData.itemCode}] đã được xóa khỏi danh sách chờ bóc tách.\nDữ liệu đã được tự động lưu trữ và đồng bộ tức thời lên Supabase Cloud database!`,
        });
      } else if (deletePendingModalData.type === 'voucher' && deletePendingModalData.voucherCode) {
        await storageService.deleteKittingVoucher(deletePendingModalData.voucherCode);
        setResultModal({
          isOpen: true,
          isSuccess: true,
          title: 'XÓA MÃ PHIẾU CHỜ BÓC TÁCH THÀNH CÔNG',
          message: `✅ ĐÃ XÓA THÀNH CÔNG!\nToàn bộ mã phiếu [${deletePendingModalData.voucherCode}] (${deletePendingModalData.partsCount || 0} linh kiện) đã được xóa khỏi danh sách chờ bóc tách.\nDữ liệu đã được tự động lưu trữ và đồng bộ tức thời lên Supabase Cloud database!`,
        });
      } else if (deletePendingModalData.type === 'all') {
        await storageService.clearAllPendingKittingItems();
        setResultModal({
          isOpen: true,
          isSuccess: true,
          title: 'DỌN SẠCH TOÀN BỘ DANH SÁCH CHỜ THÀNH CÔNG',
          message: `✅ ĐÃ DỌN SẠCH THÀNH CÔNG!\nToàn bộ (${deletePendingModalData.partsCount || 0} linh kiện) trong danh sách chờ bóc tách đã được xóa sạch.\nDữ liệu đã được tự động lưu trữ và đồng bộ tức thời lên Supabase Cloud database!`,
        });
      }
      setDeletePendingModalData({ isOpen: false, type: 'item' });
      onRefresh();
    } catch (err: any) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'LỖI KHI XÓA DANH SÁCH CHỜ BÓC TÁCH',
        message: err?.message || 'Không thể xóa hoặc lỗi kết nối Supabase Cloud!',
      });
    } finally {
      setIsDeletingPending(false);
    }
  };

  const handleConfirmRollback = async () => {
    if (!rollbackModalData.voucher) return;
    if (!isAdmin) {
      alert('⛔ QUYỀN HẠN BỊ TỪ CHỐI!\nChỉ tài khoản Quản trị viên (ADMIN) mới có quyền hoàn kho rollback!');
      return;
    }
    const targetVCode = rollbackModalData.voucher.voucherCode;
    setIsRollbacking(true);
    try {
      const result = await storageService.rollbackVoucherStockOut(
        targetVCode,
        currentUser ? `${currentUser.fullName} (Admin)` : 'Admin Quản Trị'
      );
      if (result.success) {
        setResultModal({
          isOpen: true,
          isSuccess: true,
          title: 'ROLLBACK HOÀN KHO THÀNH CÔNG',
          message: `✅ ĐÃ ROLLBACK THÀNH CÔNG PHIẾU [${targetVCode}]!\nĐã hoàn trả ${result.totalPartsRolledBack} linh kiện (tổng số lượng: ${result.totalQtyRolledBack.toLocaleString('vi-VN')}) về ĐÚNG CÁC VỊ TRÍ BIN gốc đã xuất trước đó trong kho. Dữ liệu tồn kho và thẻ kho đã được cập nhật chính xác!`,
        });
        setRollbackModalData({ isOpen: false, voucher: null });
        onRefresh();
      }
    } catch (err: any) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'ROLLBACK THẤT BẠI',
        message: err.message || 'Lỗi hệ thống khi rollback hoàn kho!',
      });
    } finally {
      setIsRollbacking(false);
    }
  };

  const handleRequestEditPendingItem = (item: KittingQueueItem, voucherCode: string) => {
    if (!isAdmin) {
      alert('⛔ QUYỀN HẠN BỊ TỪ CHỐI!\nChỉ tài khoản Quản trị viên (ADMIN) mới có quyền chỉnh sửa số lượng linh kiện!');
      return;
    }
    setEditPendingModalData({
      isOpen: true,
      voucherCode: voucherCode || item.voucherCode || 'PHIẾU_XUẤT_LẺ',
      partCode: item.partCode,
      partName: item.partName,
      unit: item.unit || 'Cái',
      currentRawQty: item.rawQuantity,
      newRawQty: item.rawQuantity,
    });
  };

  const handleConfirmEditPendingQuantity = async () => {
    if (!isAdmin) return;
    if (editPendingModalData.newRawQty < 0) {
      alert('Số lượng không thể nhỏ hơn 0!');
      return;
    }
    setIsSavingEditPending(true);
    try {
      await storageService.updatePendingKittingQuantity(
        editPendingModalData.voucherCode,
        editPendingModalData.partCode,
        editPendingModalData.newRawQty,
        operator
      );
      setResultModal({
        isOpen: true,
        isSuccess: true,
        title: 'CẬP NHẬT SỐ LƯỢNG THÀNH CÔNG',
        message: `✅ ĐÃ CẬP NHẬT SỐ LƯỢNG!\nLinh kiện [${editPendingModalData.partCode}] trong phiếu [${editPendingModalData.voucherCode}] đã được cập nhật thành ${editPendingModalData.newRawQty.toLocaleString('vi-VN')} ${editPendingModalData.unit}.\nDữ liệu đã được tự động lưu trữ và đồng bộ tức thời lên Supabase Cloud database!`,
      });
      setEditPendingModalData((prev) => ({ ...prev, isOpen: false }));
      onRefresh();
    } catch (err: any) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'LỖI CẬP NHẬT SỐ LƯỢNG',
        message: err?.message || 'Lỗi khi lưu số lượng mới!',
      });
    } finally {
      setIsSavingEditPending(false);
    }
  };

  const handleRequestAddPartPending = (voucher: PendingVoucherGroup) => {
    if (!isAdmin) {
      alert('⛔ QUYỀN HẠN BỊ TỪ CHỐI!\nChỉ tài khoản Quản trị viên (ADMIN) mới có quyền thêm linh kiện vào phiếu!');
      return;
    }
    const allParts = storageService.getParts();
    const firstPart = allParts[0];
    setAddPartPendingModalData({
      isOpen: true,
      voucherCode: voucher.voucherCode,
      voucherTitle: voucher.voucherTitle,
      selectedPartCode: firstPart ? firstPart.code : '',
      selectedPartName: firstPart ? firstPart.name : '',
      unit: firstPart ? firstPart.unit || 'Cái' : 'Cái',
      rawQty: 100,
      sourceBin: firstPart ? firstPart.location || 'Kho chính' : 'Kho chính',
    });
  };

  const handleConfirmAddPartPending = async () => {
    if (!isAdmin) return;
    if (!addPartPendingModalData.selectedPartCode) {
      alert('Vui lòng chọn hoặc nhập mã linh kiện!');
      return;
    }
    if (addPartPendingModalData.rawQty <= 0) {
      alert('Số lượng linh kiện thêm vào phải lớn hơn 0!');
      return;
    }
    setIsSavingAddPartPending(true);
    try {
      await storageService.addPendingKittingPart({
        voucherCode: addPartPendingModalData.voucherCode,
        voucherTitle: addPartPendingModalData.voucherTitle,
        partCode: addPartPendingModalData.selectedPartCode,
        partName: addPartPendingModalData.selectedPartName,
        unit: addPartPendingModalData.unit,
        rawQuantity: addPartPendingModalData.rawQty,
        operatorName: operator,
        sourceBin: addPartPendingModalData.sourceBin,
      });
      setResultModal({
        isOpen: true,
        isSuccess: true,
        title: 'THÊM LINH KIỆN VÀO PHIẾU THÀNH CÔNG',
        message: `✅ ĐÃ THÊM LINH KIỆN!\nĐã thêm ${addPartPendingModalData.rawQty.toLocaleString('vi-VN')} ${addPartPendingModalData.unit} [${addPartPendingModalData.selectedPartCode}] vào phiếu [${addPartPendingModalData.voucherCode}].\nDữ liệu đã được lưu trữ và đồng bộ tức thời lên Supabase Cloud database!`,
      });
      setAddPartPendingModalData((prev) => ({ ...prev, isOpen: false }));
      onRefresh();
    } catch (err: any) {
      setResultModal({
        isOpen: true,
        isSuccess: false,
        title: 'LỖI THÊM LINH KIỆN VÀO PHIẾU',
        message: err?.message || 'Lỗi khi thêm linh kiện!',
      });
    } finally {
      setIsSavingAddPartPending(false);
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
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Pending Queue Grouped by Mã Phiếu Xuất Kho */}
        {activeTab === 'pending' && (
          <div className="p-4 sm:p-6 space-y-5">
            {/* Toolbar & Filter */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-indigo-100 text-indigo-800 rounded-2xl">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center space-x-2">
                    <span>DANH SÁCH CHỜ BÓC TÁCH THEO MÃ PHIẾU XUẤT</span>
                    <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-900 text-xs font-black rounded-full">
                      {groupedVouchersList.length} Phiếu
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Linh kiện được gom nhóm theo từng Mã phiếu xuất kho. Bấm vào mã phiếu để xem chi tiết linh kiện cần bóc.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={voucherSearchTerm}
                    onChange={(e) => setVoucherSearchTerm(e.target.value)}
                    placeholder="Tìm mã phiếu / linh kiện..."
                    className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 w-48 sm:w-64 outline-hidden"
                  />
                </div>

                {groupedVouchersList.length > 0 && (
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setExpandedVoucherCodes(groupedVouchersList.map((v) => v.voucherCode))}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                    >
                      Mở tất cả
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedVoucherCodes([])}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                    >
                      Thu gọn
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={handleRequestClearAllPending}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 text-xs font-bold rounded-xl cursor-pointer flex items-center space-x-1 shadow-2xs active:scale-95 transition-all"
                        title="Xóa toàn bộ danh sách chờ bóc tách & đồng bộ Supabase Cloud (Chỉ Quản trị viên)"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>Xóa Toàn Bộ Chờ Bóc ({rawPendingItems.length})</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Overall Statistics Bar for Waiting List */}
            {groupedVouchersList.length > 0 && (() => {
              const grandTotalRaw = groupedVouchersList.reduce((sum, v) => sum + v.totalRawQty, 0);
              const grandTotalKitted = groupedVouchersList.reduce((sum, v) => sum + v.totalKittedQty, 0);
              const grandTotalRemaining = groupedVouchersList.reduce((sum, v) => sum + v.remainingQty, 0);
              const grandProgressPctExact = grandTotalRaw > 0 ? (grandTotalKitted / grandTotalRaw) * 100 : 0;
              const grandProgressPctText =
                grandProgressPctExact === 0
                  ? '0%'
                  : grandProgressPctExact === 100
                  ? '100%'
                  : grandProgressPctExact < 0.1
                  ? '>0%'
                  : `${(Math.round(grandProgressPctExact * 10) / 10).toFixed(grandProgressPctExact % 1 === 0 ? 0 : 1)}%`;

              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Tổng Phiếu Chờ</span>
                    <div className="flex items-baseline space-x-1 mt-1">
                      <span className="text-lg font-black text-indigo-950 font-mono">{groupedVouchersList.length}</span>
                      <span className="text-xs text-slate-500 font-bold">phiếu</span>
                      <span className="text-xs text-slate-400 font-medium">({rawPendingItems.length} LK)</span>
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Tổng SL Cần Bóc</span>
                    <div className="flex items-baseline space-x-1 mt-1">
                      <span className="text-lg font-black text-slate-900 font-mono">{grandTotalRaw.toLocaleString('vi-VN')}</span>
                      <span className="text-xs text-slate-500 font-medium">cái/bộ</span>
                    </div>
                  </div>

                  <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-emerald-800 uppercase block">Đã Bóc Tách</span>
                      <span className="text-[11px] font-black text-emerald-800 bg-emerald-200/80 px-1.5 py-0.2 rounded font-mono">
                        {grandProgressPctText}
                      </span>
                    </div>
                    <div className="flex items-baseline space-x-1 mt-1">
                      <span className="text-lg font-black text-emerald-700 font-mono">{grandTotalKitted.toLocaleString('vi-VN')}</span>
                      <span className="text-xs text-emerald-800 font-medium">cái/bộ</span>
                    </div>
                  </div>

                  <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-amber-800 uppercase block">Còn Tồn Chờ Bóc</span>
                    <div className="flex items-baseline space-x-1 mt-1">
                      <span className="text-lg font-black text-amber-900 font-mono">{grandTotalRemaining.toLocaleString('vi-VN')}</span>
                      <span className="text-xs text-amber-800 font-medium">cái/bộ</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* List of Vouchers */}
            {filteredVouchersList.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <h3 className="text-base font-bold text-slate-800">
                  {voucherSearchTerm ? 'Không tìm thấy mã phiếu nào phù hợp với từ khóa!' : 'Không có mã phiếu nào đang chờ bóc tách!'}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Tất cả các lô xuất kho từ Kho thô đã được xử lý xong kitting đóng thùng xanh. Khi có đơn xuất mới, hệ thống sẽ tự động hiển thị theo từng mã phiếu tại đây.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredVouchersList.map((voucher) => {
                  const isExpanded = expandedVoucherCodes.includes(voucher.voucherCode);
                  const progressPctExact =
                    voucher.totalRawQty > 0
                      ? (voucher.totalKittedQty / voucher.totalRawQty) * 100
                      : 0;
                  const progressPctText =
                    progressPctExact === 0
                      ? '0%'
                      : progressPctExact === 100
                      ? '100%'
                      : progressPctExact < 0.1
                      ? '>0%'
                      : `${(Math.round(progressPctExact * 10) / 10).toFixed(progressPctExact % 1 === 0 ? 0 : 1)}%`;

                  return (
                    <div
                      key={voucher.voucherCode}
                      className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-indigo-300 transition-all overflow-hidden"
                    >
                      {/* Voucher Card Header */}
                      <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-slate-50/70 via-white to-slate-50/40">
                        <div
                          onClick={() => toggleVoucherExpanded(voucher.voucherCode)}
                          className="flex items-center space-x-3.5 cursor-pointer flex-1 min-w-[260px]"
                        >
                          <button
                            type="button"
                            className="p-1.5 text-slate-400 hover:text-indigo-600 bg-white border border-slate-200 rounded-lg shadow-2xs"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>

                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-black text-sm px-3 py-1 bg-indigo-100 text-indigo-950 border border-indigo-200 rounded-xl shadow-2xs">
                                📦 {voucher.voucherCode}
                              </span>
                              <h4 className="font-extrabold text-sm text-slate-900">
                                {voucher.voucherTitle}
                              </h4>
                              {progressPctExact === 0 && (
                                <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 text-xs font-black rounded-lg flex items-center space-x-1">
                                  <span>⏳ Chưa bóc</span>
                                  <span className="bg-slate-200 px-1.5 py-0.2 rounded text-[11px] font-mono">0%</span>
                                </span>
                              )}
                              {progressPctExact > 0 && progressPctExact < 100 && (
                                <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black rounded-lg flex items-center space-x-1 animate-pulse">
                                  <span>⚡ Đang bóc tách</span>
                                  <span className="bg-amber-200/90 px-1.5 py-0.2 rounded text-[11px] font-mono">{progressPctText}</span>
                                </span>
                              )}
                              {progressPctExact === 100 && (
                                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-black rounded-lg flex items-center space-x-1">
                                  <span>✓ Đã bóc xong</span>
                                  <span className="bg-emerald-200 px-1.5 py-0.2 rounded text-[11px] font-mono">100%</span>
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                              <span>
                                🕒 Xuất: <strong>{new Date(voucher.createdAt).toLocaleString('vi-VN')}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                👤 Người xuất: <strong>{voucher.operatorName || 'Thủ kho'}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                📋 Tổng: <strong>{voucher.totalPartsCount}</strong> linh kiện
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Progress stats & action buttons */}
                        <div className="flex flex-wrap items-center gap-3 shrink-0">
                          {/* Progress summary with explicit quantity and percentage */}
                          <div className="bg-white border-2 border-indigo-100/80 rounded-2xl p-2.5 px-3 min-w-[210px] space-y-1.5 shadow-2xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center space-x-1">
                                <CheckCircle2 className={`w-3.5 h-3.5 ${progressPctExact === 100 ? 'text-emerald-600' : progressPctExact > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
                                <span>Tiến độ bóc đơn</span>
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-xs font-black font-mono shadow-2xs ${
                                progressPctExact === 100
                                  ? 'bg-emerald-600 text-white'
                                  : progressPctExact > 0
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-slate-200 text-slate-700'
                              }`}>
                                {progressPctText}
                              </span>
                            </div>

                            <div className="space-y-0.5 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500 font-medium">Đã bóc:</span>
                                <span className="font-mono">
                                  <strong className="text-emerald-700 font-black text-sm">
                                    {voucher.totalKittedQty.toLocaleString('vi-VN')}
                                  </strong>
                                  <span className="text-slate-400 mx-1">/</span>
                                  <strong className="text-slate-900 font-bold">
                                    {voucher.totalRawQty.toLocaleString('vi-VN')}
                                  </strong>
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-400">Còn chờ bóc:</span>
                                <strong className="text-amber-900 font-mono font-bold">
                                  {voucher.remainingQty.toLocaleString('vi-VN')}
                                </strong>
                              </div>
                            </div>

                            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  progressPctExact === 100
                                    ? 'bg-emerald-500'
                                    : progressPctExact > 0
                                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-amber-500'
                                    : 'bg-transparent'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, progressPctExact))}%` }}
                              />
                            </div>
                          </div>

                          {/* Action Button: Rollback Hoàn Kho (Admin Only) */}
                          <button
                            type="button"
                            onClick={() => {
                              if (!isAdmin) {
                                alert('⛔ QUYỀN HẠN BỊ TỪ CHỐI!\nChỉ tài khoản Quản trị viên (ADMIN) mới có quyền Rollback hoàn kho cả mã phiếu!');
                                return;
                              }
                              setRollbackModalData({ isOpen: true, voucher });
                            }}
                            className={`px-3.5 py-2 text-xs font-bold rounded-xl border flex items-center space-x-1.5 transition-all cursor-pointer ${
                              isAdmin
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 hover:border-amber-400 active:scale-95 shadow-2xs'
                                : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                            }`}
                            title={
                              isAdmin
                                ? 'Rollback hoàn kho toàn bộ linh kiện còn tồn trong mã phiếu về đúng vị trí BIN đã xuất'
                                : 'Chỉ tài khoản Quản trị viên (Admin) mới có quyền hoàn kho rollback'
                            }
                          >
                            {isAdmin ? (
                              <Undo2 className="w-3.5 h-3.5 text-amber-700" />
                            ) : (
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <span>Rollback Hoàn Kho</span>
                          </button>

                          {/* Action Button: Thêm LK Vào Phiếu (Admin Only) */}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleRequestAddPartPending(voucher)}
                              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                              title="Thêm linh kiện mới vào mã phiếu này (Chỉ Quản trị viên)"
                            >
                              <Plus className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Thêm LK</span>
                            </button>
                          )}

                          {/* Action Button: Xóa Phiếu Chờ (Admin Only) */}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleRequestDeleteVoucher(voucher)}
                              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                              title="Xóa toàn bộ mã phiếu này khỏi danh sách chờ bóc tách & đồng bộ Supabase (Chỉ Quản trị viên)"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              <span>Xóa Phiếu Chờ</span>
                            </button>
                          )}

                          {/* Toggle Expand Button */}
                          <button
                            type="button"
                            onClick={() => toggleVoucherExpanded(voucher.voucherCode)}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer text-xs font-bold flex items-center space-x-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">
                              {isExpanded ? 'Thu gọn' : 'Xem linh kiện'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Expanded Items Table for this Voucher */}
                      {isExpanded && (
                        <div className="border-t border-slate-200 p-4 sm:p-5 bg-white space-y-3 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center space-x-1.5">
                              <Layers className="w-4 h-4 text-indigo-600" />
                              <span>Chi Tiết Linh Kiện Trong Phiếu [{voucher.voucherCode}]</span>
                            </span>
                            <span className="text-xs text-slate-500">
                              (Chỉ hiển thị các linh kiện xuất của mã phiếu này)
                            </span>
                          </div>

                          <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                            <table className="w-full text-left text-xs whitespace-nowrap">
                              <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[11px] border-b border-slate-200">
                                <tr>
                                  <th className="p-3 w-10 text-center">STT</th>
                                  <th className="p-3">Mã Linh Kiện</th>
                                  <th className="p-3">Tên Linh Kiện</th>
                                  <th className="p-3 text-center">ĐVT</th>
                                  <th className="p-3 text-right">SL Đề Nghị (Ban Đầu)</th>
                                  <th className="p-3 text-right text-emerald-800 bg-emerald-50">Đã Bóc Tách (%)</th>
                                  <th className="p-3 text-right text-amber-800 bg-amber-50">Còn Tồn Chờ Bóc</th>
                                  <th className="p-3 text-blue-900 bg-blue-50">Vị Trí Xuất Gốc (BIN)</th>
                                  <th className="p-3 text-center">Trạng Thái</th>
                                  <th className="p-3 text-center">Thao Tác</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {voucher.items
                                  .filter((item) => Math.max(0, item.rawQuantity - (item.kittedQuantity || 0)) > 0)
                                  .map((item, idx) => {
                                  const unkitted = Math.max(0, item.rawQuantity - (item.kittedQuantity || 0));
                                  const isDone = unkitted === 0;
                                  const itemPctExact =
                                    item.rawQuantity > 0 ? ((item.kittedQuantity || 0) / item.rawQuantity) * 100 : 0;
                                  const itemPctText =
                                    itemPctExact === 0
                                      ? '0%'
                                      : itemPctExact === 100
                                      ? '100%'
                                      : itemPctExact < 0.1
                                      ? '>0%'
                                      : `${(Math.round(itemPctExact * 10) / 10).toFixed(itemPctExact % 1 === 0 ? 0 : 1)}%`;
                                  const binDisplay =
                                    item.fifoAllocations && item.fifoAllocations.length > 0
                                      ? item.fifoAllocations.map((a) => a.locationName).join(', ')
                                      : item.sourceBin || 'Kho chính';

                                  return (
                                    <tr
                                      key={item.id}
                                      className={`hover:bg-indigo-50/40 transition-colors ${
                                        isDone ? 'bg-slate-50/50 opacity-60' : ''
                                      }`}
                                    >
                                      <td className="p-3 text-center font-bold text-slate-400">
                                        {idx + 1}
                                      </td>
                                      <td className="p-3 font-mono font-bold text-blue-700 text-sm">
                                        {item.partCode}
                                      </td>
                                      <td className="p-3 font-semibold text-slate-900">
                                        {item.partName}
                                      </td>
                                      <td className="p-3 text-center text-slate-600 font-medium">
                                        {item.unit}
                                      </td>
                                      <td className="p-3 text-right font-bold text-slate-700">
                                        {item.rawQuantity.toLocaleString('vi-VN')}
                                      </td>
                                      <td className="p-3 text-right bg-emerald-50/40">
                                        <div className="font-black text-emerald-700">
                                          {(item.kittedQuantity || 0).toLocaleString('vi-VN')}
                                        </div>
                                        <div className="text-[10px] font-black text-emerald-700 bg-emerald-100 inline-block px-1.5 py-0.2 rounded mt-0.5 border border-emerald-300">
                                          {itemPctText}
                                        </div>
                                      </td>
                                      <td className="p-3 text-right font-black text-amber-900 bg-amber-50/60">
                                        {unkitted.toLocaleString('vi-VN')}
                                      </td>
                                      <td className="p-3 font-bold text-blue-800 bg-blue-50/40">
                                        📍 {binDisplay}
                                      </td>
                                      <td className="p-3 text-center">
                                        {isDone ? (
                                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-md border border-emerald-300">
                                            ✓ Đã xong (100%)
                                          </span>
                                        ) : (item.kittedQuantity || 0) > 0 ? (
                                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded-md border border-amber-300">
                                            Đang bóc ({itemPctText})
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-md border border-slate-200">
                                            Chờ bóc (0%)
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-3 text-center">
                                        <div className="flex items-center justify-center space-x-1.5">
                                          {!isDone ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setSelectedVoucherCode(voucher.voucherCode);
                                                handleOpenQueueKittingModal(item);
                                              }}
                                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-all active:scale-95 shadow-2xs"
                                            >
                                              Bóc Tách
                                            </button>
                                          ) : (
                                            <span className="text-slate-400 text-xs">---</span>
                                          )}
                                          {isAdmin && (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() => handleRequestEditPendingItem(item, voucher.voucherCode)}
                                                className="p-1.5 text-amber-600 hover:bg-amber-100 hover:text-amber-800 rounded-lg cursor-pointer transition-colors"
                                                title="Sửa số lượng đề nghị ban đầu (Chỉ Quản trị viên)"
                                              >
                                                <Pencil className="w-3.5 h-3.5" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleRequestDeleteItem(item)}
                                                className="p-1.5 text-rose-500 hover:bg-rose-100 hover:text-rose-700 rounded-lg cursor-pointer transition-colors"
                                                title="Xóa linh kiện này khỏi danh sách chờ bóc tách & đồng bộ Supabase (Chỉ Quản trị viên)"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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

            {/* Voucher Selection & Deduction Target (User Requirement) */}
            {(() => {
              const pendingVouchersForPart = rawPendingItems.filter(
                (i) => i.partCode.trim().toLowerCase() === partCode.trim().toLowerCase()
              );
              const voucherMap = new Map<string, { code: string; title: string; remainingQty: number; latestCreatedAt: string }>();
              pendingVouchersForPart.forEach((i) => {
                const code = (i.voucherCode || 'PHIẾU_XUẤT_LẺ').trim();
                const unkitted = Math.max(0, i.rawQuantity - (i.kittedQuantity || 0));
                const ex = voucherMap.get(code);
                if (ex) {
                  ex.remainingQty += unkitted;
                  if (new Date(i.createdAt).getTime() > new Date(ex.latestCreatedAt).getTime()) {
                    ex.latestCreatedAt = i.createdAt;
                  }
                } else {
                  voucherMap.set(code, {
                    code,
                    title: i.voucherTitle || (code === 'PHIẾU_XUẤT_LẺ' ? 'Linh kiện xuất lẻ' : `Phiếu xuất ${code}`),
                    remainingQty: unkitted,
                    latestCreatedAt: i.createdAt,
                  });
                }
              });
              const voucherList = Array.from(voucherMap.values()).sort(
                (a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime()
              );
              const currentVoucherInfo =
                voucherList.find((v) => v.code === selectedVoucherCode) || voucherList[0];

              return (
                <div className="p-4 bg-indigo-50/70 border-2 border-indigo-200 rounded-2xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block font-black text-indigo-950 text-xs flex items-center space-x-1.5">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      <span>MÃ PHIẾU XUẤT KHO TRỪ TỒN <span className="text-rose-500">*</span></span>
                    </label>
                    {currentVoucherInfo && (
                      <span className="text-xs font-bold text-indigo-900 bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-300">
                        Tồn khả dụng trong phiếu: <strong className="font-black text-indigo-950">{currentVoucherInfo.remainingQty} {unit}</strong>
                      </span>
                    )}
                  </div>

                  {voucherList.length === 0 ? (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">
                      ⚠️ Linh kiện này chưa có trong bất kỳ mã phiếu xuất kho nào đang chờ bóc tách!
                    </div>
                  ) : (
                    <div>
                      <select
                        value={selectedVoucherCode || (voucherList[0]?.code || '')}
                        onChange={(e) => setSelectedVoucherCode(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-indigo-300 rounded-xl font-bold text-indigo-950 text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden"
                      >
                        {voucherList.map((v) => (
                          <option key={v.code} value={v.code}>
                            📦 [{v.code}] {v.title} — Còn tồn: {v.remainingQty} {unit}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-indigo-700 mt-1.5">
                        * Hệ thống sẽ trừ số lượng bóc tách chính xác bên trong Mã phiếu xuất kho được chọn này.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

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

      {/* ADMIN ROLLBACK CONFIRMATION MODAL */}
      {rollbackModalData.isOpen && rollbackModalData.voucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border-2 border-amber-500 my-8 space-y-5 relative">
            {/* Close Button */}
            <button
              type="button"
              disabled={isRollbacking}
              onClick={() => setRollbackModalData({ isOpen: false, voucher: null })}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-full cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-200">
              <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl">
                <Undo2 className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full inline-flex items-center space-x-1">
                    <ShieldCheck className="w-3 h-3 text-amber-700" />
                    <span>QUYỀN HẠN QUẢN TRỊ VIÊN (ADMIN ONLY)</span>
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 mt-1">
                  XÁC NHẬN ROLLBACK HOÀN KHO PHIẾU XUẤT
                </h2>
              </div>
            </div>

            {/* Voucher Information Card */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-black text-sm px-3 py-1 bg-indigo-100 text-indigo-950 border border-indigo-200 rounded-xl">
                    📦 {rollbackModalData.voucher.voucherCode}
                  </span>
                  <strong className="text-sm text-slate-900 font-extrabold">
                    {rollbackModalData.voucher.voucherTitle}
                  </strong>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  🕒 Xuất lúc: <strong>{new Date(rollbackModalData.voucher.createdAt).toLocaleString('vi-VN')}</strong>
                </span>
              </div>

              {/* Warning Notice */}
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start space-x-2.5 text-xs text-amber-950">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-amber-900">
                    LƯU Ý QUAN TRỌNG VỀ CƠ CHẾ ROLLBACK HOÀN KHO:
                  </p>
                  <p className="mt-0.5 leading-relaxed">
                    Hệ thống sẽ <strong>hủy bỏ và hoàn trả toàn bộ các linh kiện còn tồn chưa bóc tách</strong> trong mã phiếu này về <strong>ĐÚNG VỊ TRÍ BIN gốc</strong> đã xuất trước đó trong kho. Tồn kho và thẻ kho của các linh kiện sẽ được cộng hoàn trả tự động.
                  </p>
                </div>
              </div>
            </div>

            {/* Items Table to Rollback */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>DANH SÁCH LINH KIỆN SẼ ĐƯỢC HOÀN VỀ VỊ TRÍ BIN GỐC:</span>
                <span className="text-slate-500 font-normal">
                  (Tổng cộng: <strong>{rollbackModalData.voucher.items.length}</strong> linh kiện)
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[11px] sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-2.5 w-10 text-center">STT</th>
                      <th className="p-2.5">Mã Linh Kiện</th>
                      <th className="p-2.5">Tên Linh Kiện</th>
                      <th className="p-2.5 text-center">ĐVT</th>
                      <th className="p-2.5 text-right text-slate-600">SL Xuất Thô</th>
                      <th className="p-2.5 text-right text-emerald-700">Đã Bóc</th>
                      <th className="p-2.5 text-right font-black text-amber-900 bg-amber-50">SL Hoàn Trả</th>
                      <th className="p-2.5 text-blue-900 bg-blue-50">Vị Trí BIN Sẽ Hoàn Về</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rollbackModalData.voucher.items.map((item, idx) => {
                      const unkitted = Math.max(0, item.rawQuantity - (item.kittedQuantity || 0));
                      const binDisplay =
                        item.fifoAllocations && item.fifoAllocations.length > 0
                          ? item.fifoAllocations.map((a) => `${a.locationName} (${a.quantity})`).join(', ')
                          : item.sourceBin || 'Kho chính';

                      return (
                        <tr key={item.id} className="hover:bg-amber-50/40">
                          <td className="p-2.5 text-center font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-2.5 font-mono font-bold text-blue-700">{item.partCode}</td>
                          <td className="p-2.5 font-semibold text-slate-900">{item.partName}</td>
                          <td className="p-2.5 text-center text-slate-600">{item.unit}</td>
                          <td className="p-2.5 text-right font-bold text-slate-600">{item.rawQuantity.toLocaleString('vi-VN')}</td>
                          <td className="p-2.5 text-right font-bold text-emerald-700">{(item.kittedQuantity || 0).toLocaleString('vi-VN')}</td>
                          <td className="p-2.5 text-right font-black text-amber-900 bg-amber-50/70">
                            {unkitted.toLocaleString('vi-VN')}
                          </td>
                          <td className="p-2.5 font-bold text-blue-800 bg-blue-50/50">
                            📍 {binDisplay}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total summary */}
            <div className="p-3 bg-slate-100 rounded-xl flex flex-wrap items-center justify-between text-xs">
              <span className="text-slate-600 font-bold">
                Tổng số lượng linh kiện sẽ hoàn kho:
              </span>
              <span className="font-mono font-black text-sm text-amber-950">
                {rollbackModalData.voucher.remainingQty.toLocaleString('vi-VN')} đơn vị
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                disabled={isRollbacking}
                onClick={() => setRollbackModalData({ isOpen: false, voucher: null })}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                HỦY BỎ
              </button>

              <button
                type="button"
                disabled={isRollbacking}
                onClick={handleConfirmRollback}
                className="w-full sm:w-auto px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50"
              >
                <Undo2 className="w-4 h-4 text-white" />
                <span>
                  {isRollbacking ? 'ĐANG TIẾN HÀNH ROLLBACK...' : 'XÁC NHẬN ROLLBACK VỀ VỊ TRÍ BIN GỐC'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN DELETE PENDING KITTING MODAL */}
      {deletePendingModalData.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border-2 border-rose-500 my-8 space-y-5 relative">
            {/* Close Button */}
            <button
              type="button"
              disabled={isDeletingPending}
              onClick={() => setDeletePendingModalData({ isOpen: false, type: 'item' })}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-full cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Title & Admin Badge */}
            <div className="space-y-1">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-rose-100 text-rose-800 text-xs font-black rounded-lg uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-rose-700" />
                <span>Quyền Quản Trị Viên (ADMIN)</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center space-x-2">
                <Trash2 className="w-6 h-6 text-rose-600 shrink-0" />
                <span>
                  {deletePendingModalData.type === 'item' && 'XÁC NHẬN XÓA LINH KIỆN CHỜ BÓC TÁCH'}
                  {deletePendingModalData.type === 'voucher' && 'XÁC NHẬN XÓA MÃ PHIẾU CHỜ BÓC TÁCH'}
                  {deletePendingModalData.type === 'all' && 'XÁC NHẬN XÓA TOÀN BỘ DANH SÁCH CHỜ BÓC TÁCH'}
                </span>
              </h2>
            </div>

            {/* Target Information Card */}
            <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200 space-y-3">
              {deletePendingModalData.type === 'item' && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-bold">Mã linh kiện:</span>
                    <span className="font-mono font-black text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                      {deletePendingModalData.itemCode}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-bold">Tên linh kiện:</span>
                    <span className="font-bold text-slate-900 text-right max-w-[260px] truncate">
                      {deletePendingModalData.itemName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-bold">Số lượng chờ bóc:</span>
                    <span className="font-mono font-black text-rose-700 text-sm">
                      {deletePendingModalData.itemQty?.toLocaleString('vi-VN')} đơn vị
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-bold">Thuộc mã phiếu:</span>
                    <span className="font-mono font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                      📦 {deletePendingModalData.voucherCode}
                    </span>
                  </div>
                </div>
              )}

              {deletePendingModalData.type === 'voucher' && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-bold">Mã phiếu xuất kho:</span>
                    <span className="font-mono font-black text-sm text-indigo-950 bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200">
                      📦 {deletePendingModalData.voucherCode}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-bold">Tiêu đề / Ghi chú:</span>
                    <span className="font-bold text-slate-900">
                      {deletePendingModalData.voucherTitle}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-bold">Số loại linh kiện:</span>
                    <span className="font-bold text-slate-800">
                      {deletePendingModalData.partsCount} linh kiện
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-bold">Tổng số lượng còn chờ:</span>
                    <span className="font-mono font-black text-rose-700 text-sm">
                      {deletePendingModalData.totalQty?.toLocaleString('vi-VN')} đơn vị
                    </span>
                  </div>
                </div>
              )}

              {deletePendingModalData.type === 'all' && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-bold">Phạm vi thao tác:</span>
                    <span className="font-black text-rose-800 bg-rose-100 px-2 py-0.5 rounded-md">
                      Toàn bộ hàng chờ bóc tách hệ thống
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-bold">Tổng số dòng linh kiện chờ:</span>
                    <span className="font-bold text-slate-900">
                      {deletePendingModalData.partsCount} linh kiện
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-bold">Tổng số lượng chờ bóc tách:</span>
                    <span className="font-mono font-black text-rose-700 text-sm">
                      {deletePendingModalData.totalQty?.toLocaleString('vi-VN')} đơn vị
                    </span>
                  </div>
                </div>
              )}

              {/* Warning Notice */}
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start space-x-2.5 text-xs text-amber-950">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-amber-900">
                    LƯU Ý DÀNH CHO QUẢN TRỊ VIÊN:
                  </p>
                  <p className="mt-1 leading-relaxed">
                    Dữ liệu sẽ được xóa dứt điểm khỏi Danh Sách Chờ Bóc Tách và <strong className="text-rose-900 underline">tự động đồng bộ ngay lập tức lên Supabase Cloud database</strong>. Tất cả các thiết bị và máy trạm khác sẽ cập nhật tức thời khi làm mới.
                  </p>
                </div>
              </div>
            </div>

            {/* Supabase Cloud Sync Badge */}
            <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Cơ sở dữ liệu Supabase: Tự động đồng bộ khóa <code>thekho_kitting_queue_v1</code></span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                disabled={isDeletingPending}
                onClick={() => setDeletePendingModalData({ isOpen: false, type: 'item' })}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                HỦY BỎ
              </button>

              <button
                type="button"
                disabled={isDeletingPending}
                onClick={handleConfirmDeletePending}
                className="w-full sm:w-auto px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4 text-white" />
                <span>
                  {isDeletingPending ? 'ĐANG XÓA & ĐỒNG BỘ SUPABASE...' : 'XÁC NHẬN XÓA & ĐỒNG BỘ SUPABASE'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN EDIT PENDING ITEM QUANTITY MODAL */}
      {editPendingModalData.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border-2 border-amber-500 my-8 space-y-5 relative">
            <button
              type="button"
              disabled={isSavingEditPending}
              onClick={() => setEditPendingModalData((prev) => ({ ...prev, isOpen: false }))}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-full cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-amber-100 text-amber-800 text-xs font-black rounded-lg uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                <span>Quyền Quản Trị Viên (ADMIN)</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center space-x-2">
                <Pencil className="w-5 h-5 text-amber-600 shrink-0" />
                <span>SỬA SỐ LƯỢNG ĐỀ NGHỊ BÓC TÁCH</span>
              </h2>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-bold">Mã phiếu xuất kho:</span>
                <span className="font-mono font-black text-indigo-950 bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200">
                  📦 {editPendingModalData.voucherCode}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-bold">Mã linh kiện:</span>
                <span className="font-mono font-black text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  {editPendingModalData.partCode}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-bold">Tên linh kiện:</span>
                <span className="font-bold text-slate-900 text-right max-w-[240px] truncate">
                  {editPendingModalData.partName}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                SỐ LƯỢNG ĐỀ NGHỊ MỚI ({editPendingModalData.unit}) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                value={editPendingModalData.newRawQty}
                onChange={(e) =>
                  setEditPendingModalData((prev) => ({
                    ...prev,
                    newRawQty: Number(e.target.value),
                  }))
                }
                className="w-full px-4 py-3 bg-amber-50 border-2 border-amber-300 rounded-2xl font-mono font-black text-amber-950 text-lg focus:ring-2 focus:ring-amber-500 outline-hidden"
              />
              <p className="text-[11px] text-slate-500">
                * Số lượng mới sẽ cập nhật trực tiếp vào danh sách chờ bóc tách, các lượt quét thẻ thùng tiếp theo sẽ ghi nhận theo số lượng này và đồng bộ lên Supabase Cloud.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                disabled={isSavingEditPending}
                onClick={() => setEditPendingModalData((prev) => ({ ...prev, isOpen: false }))}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                HỦY BỎ
              </button>
              <button
                type="button"
                disabled={isSavingEditPending}
                onClick={handleConfirmEditPendingQuantity}
                className="w-full sm:w-auto px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50"
              >
                <Check className="w-4 h-4 text-white" />
                <span>
                  {isSavingEditPending ? 'ĐANG LƯU & ĐỒNG BỘ SUPABASE...' : 'LƯU VÀ ĐỒNG BỘ SUPABASE'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN ADD PART TO PENDING VOUCHER MODAL */}
      {addPartPendingModalData.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border-2 border-indigo-500 my-8 space-y-5 relative">
            <button
              type="button"
              disabled={isSavingAddPartPending}
              onClick={() => setAddPartPendingModalData((prev) => ({ ...prev, isOpen: false }))}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-full cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-indigo-100 text-indigo-900 text-xs font-black rounded-lg uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-indigo-700" />
                <span>Quyền Quản Trị Viên (ADMIN)</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center space-x-2">
                <Plus className="w-5 h-5 text-indigo-600 shrink-0" />
                <span>THÊM LINH KIỆN VÀO PHIẾU CHỜ BÓC TÁCH</span>
              </h2>
            </div>

            <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-xs flex items-center justify-between">
              <span className="text-slate-600 font-bold">Thêm vào Mã phiếu xuất:</span>
              <span className="font-mono font-black text-indigo-950 bg-white px-3 py-1 rounded-xl border border-indigo-300 shadow-2xs">
                📦 {addPartPendingModalData.voucherCode}
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <SearchableSelect
                  label="CHỌN LINH KIỆN CẦN THÊM"
                  required
                  options={storageService.getParts().map((p) => ({
                    value: p.code,
                    label: `[${p.code}] ${p.name}`,
                    sublabel: `Tồn kho: ${p.currentStock.toLocaleString('vi-VN')} ${p.unit || 'Cái'} | Kệ: ${p.location || 'Kho chính'}`,
                    badge: `Tồn: ${p.currentStock.toLocaleString('vi-VN')}`,
                  }))}
                  value={addPartPendingModalData.selectedPartCode}
                  onChange={(code) => {
                    const allParts = storageService.getParts();
                    const p = allParts.find((part) => part.code === code) || allParts.find((part) => part.id === code);
                    setAddPartPendingModalData((prev) => ({
                      ...prev,
                      selectedPartCode: p ? p.code : code,
                      selectedPartName: p ? p.name : code,
                      unit: p ? p.unit || 'Cái' : 'Cái',
                      sourceBin: p ? p.location || 'Kho chính' : 'Kho chính',
                    }));
                  }}
                  placeholder="Gõ tìm kiếm thông minh fuzzy (mã, tên không dấu, vị trí kệ...)..."
                  allowCustom={true}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    SỐ LƯỢNG YÊU CẦU ({addPartPendingModalData.unit}) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={addPartPendingModalData.rawQty}
                    onChange={(e) =>
                      setAddPartPendingModalData((prev) => ({
                        ...prev,
                        rawQty: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3.5 py-2.5 bg-indigo-50 border-2 border-indigo-300 rounded-xl font-mono font-black text-indigo-950 text-base focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    VỊ TRÍ KHO GỐC (BIN)
                  </label>
                  <input
                    type="text"
                    value={addPartPendingModalData.sourceBin}
                    onChange={(e) =>
                      setAddPartPendingModalData((prev) => ({
                        ...prev,
                        sourceBin: e.target.value,
                      }))
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                * Linh kiện thêm vào sẽ hiển thị trong phiếu chờ bóc tách [{addPartPendingModalData.voucherCode}] và cho phép quét thẻ thùng kitting bình thường. <strong>Thao tác thêm này KHÔNG trừ tồn kho thực tế trên các vị trí kệ.</strong>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                disabled={isSavingAddPartPending}
                onClick={() => setAddPartPendingModalData((prev) => ({ ...prev, isOpen: false }))}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                HỦY BỎ
              </button>
              <button
                type="button"
                disabled={isSavingAddPartPending}
                onClick={handleConfirmAddPartPending}
                className="w-full sm:w-auto px-6 py-3 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl font-black text-xs shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50"
              >
                <Plus className="w-4 h-4 text-white" />
                <span>
                  {isSavingAddPartPending ? 'ĐANG THÊM & ĐỒNG BỘ SUPABASE...' : 'THÊM VÀO PHIẾU & ĐỒNG BỘ SUPABASE'}
                </span>
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

