import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { BufferLocationMap, BufferPartItem, WarehouseLocation } from './types';
import { storageService } from './storage';
import { LocationQrPrintModal } from './LocationQrPrintModal';
import {
  LayoutGrid,
  QrCode,
  Package,
  Clock,
  Zap,
  Sparkles,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Trash2,
  Edit3,
  X,
  Search,
  Upload,
  Download,
  Plus,
  Info,
  Send,
  Check,
  Layers,
  Tag,
} from 'lucide-react';
import { InlineQrScanner } from './InlineQrScanner';

interface BufferMapViewProps {
  buffers: BufferLocationMap[];
  onRefresh: () => void;
}

export const BufferMapView: React.FC<BufferMapViewProps> = ({ buffers, onRefresh }) => {
  const [selectedBuffer, setSelectedBuffer] = useState<BufferLocationMap | null>(null);
  const [modalTab, setModalTab] = useState<'call' | 'manage'>('call');
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [filterPart, setFilterPart] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Print QR Location Modal state
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printInitialLocId, setPrintInitialLocId] = useState<string | undefined>(undefined);

  // Convert buffer locations to WarehouseLocation list for printing
  const bufferLocationsAsWarehouseLocs: WarehouseLocation[] = buffers.map((b) => ({
    id: b.locationId,
    name: b.locationId,
    description: b.description || (b.modelName ? `Model: ${b.modelName}` : 'Kệ Outbuffer'),
  }));

  // Assembly lines list from Settings
  const settings = storageService.getSettings();
  const assemblyLinesList = (settings.assemblyLines && settings.assemblyLines.length > 0)
    ? settings.assemblyLines
    : [
        'Bàn Lắp Ráp Bo Mạch Line 1',
        'Dây Chuyền SMT Tự Động 2',
        'Bàn Lắp Khung Cơ Khí 3',
        'Khu Kiểm Thử Quality Check 4',
      ];

  // Direct Call state in Modal
  const [selectedAssemblyLine, setSelectedAssemblyLine] = useState(assemblyLinesList[0]);
  const [callQtyMap, setCallQtyMap] = useState<{ [partCode: string]: number }>({});
  const currentUser = storageService.getCurrentUser();
  const defaultRequester = currentUser
    ? `${currentUser.fullName}${currentUser.roleTitle ? ` (${currentUser.roleTitle})` : ''}`
    : ((settings.staffList && settings.staffList[0]) || 'Nguyễn Văn A (Trưởng Dây Chuyền 1)');

  const [callRequestedBy, setCallRequestedBy] = useState(defaultRequester);

  // Manage Part / Shelf state in Modal
  const [shelfModelName, setShelfModelName] = useState('');
  const [editLocDesc, setEditLocDesc] = useState('');
  const [newPartCode, setNewPartCode] = useState('');
  const [newPartName, setNewPartName] = useState('');
  const [newPartUnit, setNewPartUnit] = useState('Con');
  const [newPartQty, setNewPartQty] = useState(10);

  // Add Shelf Modal state
  const [isAddShelfOpen, setIsAddShelfOpen] = useState(false);
  const [newLocId, setNewLocId] = useState('');
  const [addShelfDesc, setAddShelfDesc] = useState('');
  const [addShelfModel, setAddShelfModel] = useState('');
  const [newLocQty, setNewLocQty] = useState(50);

  // Find oldest shelf with goods for FIFO First Badge
  const readyBuffers = buffers.filter((b) => b.status === 'READY' || b.status === 'CALL_PENDING');
  let fifoOldestShelfId: string | null = null;
  if (readyBuffers.length > 0) {
    const sortedByAge = [...readyBuffers].sort(
      (a, b) => new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime()
    );
    fifoOldestShelfId = sortedByAge[0].locationId;
  }

  const handleOpenEditModal = (b: BufferLocationMap) => {
    setSelectedBuffer(b);
    setModalTab('call');
    setShelfModelName(b.modelName || '');
    setEditLocDesc(b.description || '');
    setNewPartCode('');
    setNewPartName('');
    setNewPartQty(10);

    // Initialize call quantities for items on shelf
    const initialQtyMap: { [partCode: string]: number } = {};
    const items = b.items && b.items.length > 0 ? b.items : (b.partCode ? [{ partCode: b.partCode, currentStockQty: b.currentStockQty }] : []);
    items.forEach((item) => {
      initialQtyMap[item.partCode] = item.currentStockQty || 1;
    });
    setCallQtyMap(initialQtyMap);
  };

  const handleDirectCallItem = (item: BufferPartItem) => {
    if (!selectedBuffer) return;
    const requestedQty = callQtyMap[item.partCode] !== undefined ? callQtyMap[item.partCode] : item.currentStockQty;

    if (requestedQty <= 0) {
      setMessage({ type: 'error', text: 'Số lượng yêu cầu gọi hàng phải lớn hơn 0!' });
      return;
    }

    if (requestedQty > item.currentStockQty) {
      setMessage({
        type: 'error',
        text: `Số lượng gọi (${requestedQty}) vượt quá số lượng tồn kho khả dụng trên kệ (${item.currentStockQty} ${item.unit})!`,
      });
      return;
    }

    try {
      storageService.createMaterialCallRequest({
        assemblyLine: selectedAssemblyLine,
        partCode: item.partCode,
        partName: item.partName,
        unit: item.unit,
        requestedQty,
        bufferLocation: selectedBuffer.locationId,
        isDirectKitting: false,
        requestedBy: callRequestedBy,
      });

      setMessage({
        type: 'success',
        text: `🚀 Đã phát lệnh Gọi Hàng [${item.partCode}] - SL: ${requestedQty} ${item.unit} từ kệ ${selectedBuffer.locationId} tới ${selectedAssemblyLine}!`,
      });

      // Refresh view and update selected modal buffer
      onRefresh();
      const freshBuffers = storageService.getBufferLocations();
      const updatedSel = freshBuffers.find((b) => b.locationId === selectedBuffer.locationId) || null;
      setSelectedBuffer(updatedSel);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi khi gọi hàng' });
    }
  };

  const handleSaveShelfInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBuffer) return;

    try {
      const updated = storageService.updateBufferLocation(selectedBuffer.locationId, {
        description: editLocDesc.trim() || undefined,
        modelName: shelfModelName.trim() || undefined,
      });

      setSelectedBuffer(updated);
      setMessage({ type: 'success', text: `Đã lưu thông tin Model & Mô tả Kệ ${selectedBuffer.locationId}` });
      onRefresh();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleAddPartToShelf = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBuffer) return;

    if (!newPartCode.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng nhập Mã Linh Kiện!' });
      return;
    }

    if (newPartQty <= 0) {
      setMessage({ type: 'error', text: 'Số lượng linh kiện nhập lên kệ phải lớn hơn 0!' });
      return;
    }

    try {
      const currentItems: BufferPartItem[] = selectedBuffer.items ? [...selectedBuffer.items] : [];
      const existingIdx = currentItems.findIndex((i) => i.partCode === newPartCode.trim());

      if (existingIdx >= 0) {
        currentItems[existingIdx] = {
          ...currentItems[existingIdx],
          partName: newPartName.trim() || currentItems[existingIdx].partName,
          unit: newPartUnit || currentItems[existingIdx].unit,
          currentStockQty: currentItems[existingIdx].currentStockQty + newPartQty,
          lastUpdated: new Date().toISOString(),
        };
      } else {
        currentItems.push({
          id: 'bitem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          partCode: newPartCode.trim(),
          partName: newPartName.trim() || newPartCode.trim(),
          unit: newPartUnit || 'Con',
          currentStockQty: newPartQty,
          modelName: shelfModelName || selectedBuffer.modelName,
          lastUpdated: new Date().toISOString(),
        });
      }

      const updated = storageService.updateBufferLocation(selectedBuffer.locationId, {
        modelName: shelfModelName.trim() || selectedBuffer.modelName,
        items: currentItems,
      });

      setSelectedBuffer(updated);
      setMessage({ type: 'success', text: `Đã thêm thành công linh kiện [${newPartCode}] vào Kệ ${selectedBuffer.locationId}` });
      setNewPartCode('');
      setNewPartName('');
      setNewPartQty(10);
      onRefresh();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleRemovePartFromShelf = (partCode: string) => {
    if (!selectedBuffer) return;
    if (window.confirm(`Bạn có chắc muốn xóa linh kiện [${partCode}] khỏi Kệ Buffer ${selectedBuffer.locationId}?`)) {
      const currentItems = (selectedBuffer.items || []).filter((i) => i.partCode !== partCode);
      const updated = storageService.updateBufferLocation(selectedBuffer.locationId, {
        items: currentItems,
      });
      setSelectedBuffer(updated);
      setMessage({ type: 'success', text: `Đã xóa linh kiện [${partCode}] khỏi kệ` });
      onRefresh();
    }
  };

  const isAdmin = storageService.isAdminUser();

  const handleClearShelf = (locationId: string) => {
    if (!isAdmin) {
      alert('Chỉ tài khoản Quản trị viên (ADMIN) mới có quyền xóa/dọn kệ!');
      return;
    }
    if (window.confirm(`Bạn có chắc muốn dọn trống tất cả linh kiện trên Kệ Buffer ${locationId}?`)) {
      storageService.clearBufferLocation(locationId);
      setMessage({ type: 'success', text: `Đã dọn trống tất cả linh kiện trên kệ ${locationId}` });
      setSelectedBuffer(null);
      onRefresh();
    }
  };

  const handleDeleteShelf = (locationId: string) => {
    if (!isAdmin) {
      alert('Chỉ tài khoản Quản trị viên (ADMIN) mới có quyền xóa kệ!');
      return;
    }
    if (!window.confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN Kệ Buffer ${locationId}?`)) return;
    try {
      storageService.deleteBufferLocation(locationId);
      setMessage({ type: 'success', text: `Đã xóa vĩnh viễn kệ ${locationId} khỏi sơ đồ` });
      setSelectedBuffer(null);
      onRefresh();
    } catch (err: any) {
      const errorMsg = err.message || 'Không thể xóa kệ này';
      alert(errorMsg);
      setMessage({ type: 'error', text: errorMsg });
    }
  };

  const handleAddShelfSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      storageService.addBufferLocation({
        locationId: newLocId,
        description: addShelfDesc,
        containerStandardQty: newLocQty,
      });
      if (addShelfModel.trim()) {
        storageService.updateBufferLocation(newLocId.trim(), { modelName: addShelfModel.trim() });
      }
      setMessage({ type: 'success', text: `Đã khai báo thành công kệ mới: ${newLocId}` });
      setIsAddShelfOpen(false);
      setNewLocId('');
      setAddShelfDesc('');
      setAddShelfModel('');
      onRefresh();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const result = storageService.importBufferLocationsFromRows(data);
        setMessage({
          type: 'success',
          text: `🎉 Đã khai báo Excel thành công: Thêm mới ${result.added} vị trí kệ, Cập nhật ${result.updated} kệ!`,
        });
        onRefresh();
      } catch (err: any) {
        setMessage({ type: 'error', text: 'Lỗi đọc file Excel khai báo vị trí: ' + err.message });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const filteredBuffers = buffers.filter((b) => {
    if (!filterPart.trim()) return true;
    const query = filterPart.toLowerCase();
    const hasInItems = b.items?.some(
      (i) => i.partCode.toLowerCase().includes(query) || i.partName.toLowerCase().includes(query)
    );
    return (
      b.locationId.toLowerCase().includes(query) ||
      (b.description && b.description.toLowerCase().includes(query)) ||
      (b.modelName && b.modelName.toLowerCase().includes(query)) ||
      (b.partCode && b.partCode.toLowerCase().includes(query)) ||
      (b.partName && b.partName.toLowerCase().includes(query)) ||
      hasInItems
    );
  });

  // Count summaries
  const readyCount = buffers.filter((b) => b.status === 'READY').length;
  const callPendingCount = buffers.filter((b) => b.status === 'CALL_PENDING').length;
  const emptyCount = buffers.filter((b) => b.status === 'EMPTY').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-cyan-900 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-2 bg-emerald-500/30 border border-emerald-300/30 text-emerald-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <LayoutGrid className="w-3.5 h-3.5 text-emerald-300" />
              <span>OUTBUFFER LIVE MATRIX GRID</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white">
              Sơ Đồ Trực Quan Kệ OUTBUFFER
            </h1>
            <p className="text-emerald-100 text-xs sm:text-sm max-w-2xl">
              Ma trận giám sát thời gian thực các ô kệ lưu giữ linh kiện theo Model sản xuất. Bấm trực tiếp vào từng kệ để xem danh sách linh kiện & phát lệnh gọi hàng (Andon Call).
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setPrintInitialLocId(undefined);
                setIsPrintModalOpen(true);
              }}
              className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-black rounded-2xl shadow-lg transition-all cursor-pointer flex items-center space-x-2 text-xs border border-indigo-400/30"
              title="In tem QR mã kệ Outbuffer dán lên khoang kệ để quét bóc tách Kitting Smart"
            >
              <QrCode className="w-4 h-4 text-amber-300" />
              <span>In Tem QR Kệ Outbuffer</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddShelfOpen(true)}
              className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-amber-950 font-black rounded-2xl shadow-md transition-all cursor-pointer flex items-center space-x-2 text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Vị Trí Kệ</span>
            </button>

            <label className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl border border-white/20 transition-all cursor-pointer flex items-center space-x-2 text-xs">
              <Upload className="w-4 h-4 text-emerald-300" />
              <span>Nhập Excel Kệ</span>
              <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
            </label>

            <button
              type="button"
              onClick={() => storageService.downloadBufferImportTemplate()}
              className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl border border-white/20 transition-all cursor-pointer"
              title="Tải File Mẫu Excel Khai Báo Vị Trí Kệ"
            >
              <Download className="w-4 h-4 text-cyan-200" />
            </button>
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

      {/* Search & Stats Bar */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo Mã Kệ, Model, Mã hoặc Tên Linh Kiện..."
            value={filterPart}
            onChange={(e) => setFilterPart(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Legend / Status Badges */}
        <div className="flex items-center space-x-2 text-xs font-bold">
          <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-xl border border-emerald-200">
            ✅ Có Hàng: {readyCount}
          </span>
          <span className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-xl border border-amber-200">
            ⚠️ Đang Gọi: {callPendingCount}
          </span>
          <span className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl border border-slate-200">
            ⚪ Trống: {emptyCount}
          </span>
        </div>
      </div>

      {/* OUTBUFFER Matrix Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredBuffers.map((buf) => {
          const isFifoNext = buf.locationId === fifoOldestShelfId;
          const isCallPending = buf.status === 'CALL_PENDING';
          const isReady = buf.status === 'READY';
          const isEmpty = buf.status === 'EMPTY' || buf.currentStockQty <= 0;

          const itemsOnShelf: BufferPartItem[] = (buf.items && buf.items.length > 0)
            ? buf.items
            : (buf.partCode ? [{ partCode: buf.partCode, partName: buf.partName || buf.partCode, unit: buf.unit || 'PCS', currentStockQty: buf.currentStockQty }] : []);

          return (
            <div
              key={buf.locationId}
              onClick={() => handleOpenEditModal(buf)}
              className={`relative rounded-3xl p-5 border transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between min-h-[210px] ${
                isCallPending
                  ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/50'
                  : isReady
                  ? 'bg-emerald-50/90 border-emerald-300 hover:border-emerald-500'
                  : 'bg-slate-50 border-slate-200 opacity-80 hover:opacity-100'
              }`}
            >
              {/* Header Badge */}
              <div>
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <span
                      className={`font-mono font-black text-sm px-3 py-1 rounded-xl shadow-xs ${
                        isCallPending
                          ? 'bg-amber-600 text-white'
                          : isReady
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-300 text-slate-700'
                      }`}
                    >
                      {buf.locationId}
                    </span>

                    {buf.modelName && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-900 border border-blue-300 text-[10px] font-extrabold rounded-lg flex items-center space-x-1">
                        <Tag className="w-3 h-3 text-blue-600 shrink-0" />
                        <span className="truncate max-w-[120px]">{buf.modelName}</span>
                      </span>
                    )}

                    {isFifoNext && !isEmpty && (
                      <span className="px-2 py-0.5 bg-pink-600 text-white text-[10px] font-black rounded-full animate-bounce shadow-md flex items-center space-x-1">
                        <Sparkles className="w-3 h-3" />
                        <span>FIFO FIRST</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrintInitialLocId(buf.locationId);
                        setIsPrintModalOpen(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                      title="In tem QR riêng cho kệ này"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditModal(buf);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/60 rounded-lg cursor-pointer"
                      title="Bấm để xem chi tiết & Gọi hàng"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Location Description */}
                {buf.description && (
                  <p className="text-[11px] text-slate-600 font-medium line-clamp-1 italic mt-1">
                    📍 {buf.description}
                  </p>
                )}
              </div>

              {/* Shelf Content Info */}
              <div className="my-2.5 space-y-1.5">
                {isEmpty ? (
                  <div className="py-4 text-center text-slate-400">
                    <span className="text-xs font-bold uppercase tracking-wider block">KỆ TRỐNG</span>
                    <span className="text-[11px]">Sẵn sàng nhập thùng xanh</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 border-b border-slate-200/60 pb-1">
                      <span className="flex items-center space-x-1">
                        <Layers className="w-3.5 h-3.5 text-emerald-700" />
                        <span>{itemsOnShelf.length} loại linh kiện:</span>
                      </span>
                      <span className="text-emerald-800 font-extrabold">
                        Tổng: {buf.currentStockQty.toLocaleString('vi-VN')} {buf.unit || 'PCS'}
                      </span>
                    </div>

                    <div className="space-y-1 max-h-[85px] overflow-y-auto pr-1">
                      {itemsOnShelf.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white/70 px-2 py-1 rounded-lg border border-slate-200/50 text-[11px]">
                          <span className="font-mono font-bold text-purple-900 truncate max-w-[140px]" title={item.partCode}>
                            {item.partCode}
                          </span>
                          <span className="font-extrabold text-emerald-800 shrink-0 ml-1">
                            {item.currentStockQty.toLocaleString('vi-VN')} {item.unit || 'PCS'}
                          </span>
                        </div>
                      ))}
                      {itemsOnShelf.length > 3 && (
                        <span className="text-[10px] text-slate-500 font-bold block text-center italic">
                          + {itemsOnShelf.length - 3} linh kiện khác trên kệ...
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Footer status line */}
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 pt-2 border-t border-slate-200/40">
                <span className="flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{new Date(buf.lastUpdated).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                </span>
                <span className="uppercase font-extrabold text-[10px]">
                  {isCallPending ? '⚠️ ĐANG GỌI HÀNG' : isReady ? '⚡ BẤM GỌI HÀNG' : 'TRỐNG'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Add New Shelf */}
      {isAddShelfOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-4">
            <div className="bg-gradient-to-r from-emerald-800 to-teal-800 text-white p-5 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Plus className="w-5 h-5 text-amber-300" />
                <h3 className="text-base font-bold text-white">Thêm Vị Trí Kệ Outbuffer Mới</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddShelfOpen(false)}
                className="text-emerald-200 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddShelfSubmit} className="p-5 space-y-4 text-xs text-slate-700">
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  1. Tên Vị Trí (Mã Kệ) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Kệ 1, Kệ 2, BUFFER-A1-05..."
                  value={newLocId}
                  onChange={(e) => setNewLocId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900 text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  2. Mô Tả Vị Trí Kệ
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Khoang 01 - Tầng 1 - Vị trí 1"
                  value={addShelfDesc}
                  onChange={(e) => setAddShelfDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  3. Gán Model Sản Xuất Cho Kệ (Tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Model LSX-2026-TDH09"
                  value={addShelfModel}
                  onChange={(e) => setAddShelfModel(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-blue-900 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  4. Quy Cách Sức Chứa Thùng Xanh Standard
                </label>
                <input
                  type="number"
                  min={1}
                  value={newLocQty}
                  onChange={(e) => setNewLocQty(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddShelfOpen(false)}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold shadow-md cursor-pointer transition-all"
                >
                  Tạo Vị Trí Kệ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Detailed Shelf View & Direct Calling (Andon Call) */}
      {selectedBuffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-4 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-800 to-teal-800 text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-400 text-amber-950 rounded-2xl font-mono font-black text-base shadow-sm">
                  {selectedBuffer.locationId}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <span>Chi Tiết & Gọi Hàng Kệ OUTBUFFER</span>
                    {selectedBuffer.modelName && (
                      <span className="px-2.5 py-0.5 bg-blue-500/40 text-blue-100 border border-blue-300/40 text-xs rounded-full font-extrabold">
                        Model: {selectedBuffer.modelName}
                      </span>
                    )}
                  </h3>
                  <p className="text-emerald-200 text-xs">
                    {selectedBuffer.description || 'Vị trí kệ chứa linh kiện sau bóc tách'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setPrintInitialLocId(selectedBuffer.locationId);
                    setIsPrintModalOpen(true);
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center space-x-1.5 border border-indigo-400/30"
                  title="In tem QR dán kệ này"
                >
                  <QrCode className="w-3.5 h-3.5 text-amber-300" />
                  <span>In Tem QR Kệ</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedBuffer(null)}
                  className="text-emerald-200 hover:text-white p-2 rounded-xl cursor-pointer text-lg"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Sub-Header Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-100 p-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setModalTab('call')}
                className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                  modalTab === 'call'
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Send className="w-4 h-4 text-slate-900" />
                <span>GỌI HÀNG TRỰC TIẾP TỪ KỆ (ANDON CALL)</span>
              </button>

              <button
                type="button"
                onClick={() => setModalTab('manage')}
                className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                  modalTab === 'manage'
                    ? 'bg-emerald-700 text-white shadow-sm font-black'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Edit3 className="w-4 h-4" />
                <span>CẤU HÌNH KỆ & NHẬP LINH KIỆN</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-700 grow">
              {/* TAB 1: CALL MATERIAL DIRECTLY FROM SHELF */}
              {modalTab === 'call' && (
                <div className="space-y-4">
                  {/* Select Destination Assembly Line */}
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                    <label className="block font-extrabold text-amber-900 text-xs">
                      1. Chọn Dây Chuyền / Bàn Máy Yêu Cầu Cấp Hàng <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={selectedAssemblyLine}
                      onChange={(e) => setSelectedAssemblyLine(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-amber-300 rounded-xl font-bold text-slate-900 text-xs focus:ring-2 focus:ring-amber-500 shadow-xs"
                    >
                      {assemblyLinesList.map((line) => (
                        <option key={line} value={line}>
                          📍 {line}
                        </option>
                      ))}
                    </select>

                    <div className="pt-2 flex items-center justify-between text-[11px] text-amber-800">
                      <span>Người Yêu Cầu Gọi:</span>
                      <input
                        type="text"
                        value={callRequestedBy}
                        onChange={(e) => setCallRequestedBy(e.target.value)}
                        className="px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-slate-800"
                      />
                    </div>
                  </div>

                  {/* List Parts on Shelf for Calling */}
                  <div className="space-y-3">
                    <h4 className="font-extrabold text-slate-800 text-xs flex items-center space-x-2">
                      <Package className="w-4 h-4 text-emerald-700" />
                      <span>Danh Sách Linh Kiện Đã Bóc Tách Trực Thuộc Kệ [{selectedBuffer.locationId}]:</span>
                    </h4>

                    {(!selectedBuffer.items || selectedBuffer.items.length === 0) && !selectedBuffer.partCode ? (
                      <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 italic">
                        Kệ hiện tại đang trống, chưa có linh kiện nào được nhập lên kệ.
                      </div>
                    ) : (
                      ((selectedBuffer.items && selectedBuffer.items.length > 0)
                        ? selectedBuffer.items
                        : [{
                            partCode: selectedBuffer.partCode || '',
                            partName: selectedBuffer.partName || '',
                            unit: selectedBuffer.unit || 'PCS',
                            currentStockQty: selectedBuffer.currentStockQty,
                          }]
                      ).map((item, idx) => {
                        const callVal = callQtyMap[item.partCode] !== undefined ? callQtyMap[item.partCode] : item.currentStockQty;
                        const isExceeded = callVal > item.currentStockQty;

                        return (
                          <div
                            key={idx}
                            className="p-4 bg-white border-2 border-slate-200 rounded-2xl space-y-3 shadow-xs hover:border-amber-300 transition-all"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <span className="font-mono font-black text-sm text-purple-900 block">
                                  {item.partCode}
                                </span>
                                <span className="font-bold text-slate-800 text-xs">{item.partName}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-slate-500 font-bold block uppercase">Tồn Hiện Tại:</span>
                                <span className="font-black text-sm text-emerald-800">
                                  {item.currentStockQty.toLocaleString('vi-VN')} {item.unit || 'PCS'}
                                </span>
                              </div>
                            </div>

                            {/* Call Action Bar */}
                            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-700 text-xs shrink-0">Số lượng gọi:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={item.currentStockQty}
                                  value={callVal}
                                  onChange={(e) =>
                                    setCallQtyMap({
                                      ...callQtyMap,
                                      [item.partCode]: Number(e.target.value),
                                    })
                                  }
                                  className={`w-24 px-3 py-1.5 border rounded-xl font-extrabold text-sm ${
                                    isExceeded
                                      ? 'bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-200'
                                      : 'bg-white border-slate-300 text-slate-900'
                                  }`}
                                />
                                <span className="font-bold text-slate-500 text-xs">{item.unit || 'PCS'}</span>
                              </div>

                              <button
                                type="button"
                                disabled={isExceeded || callVal <= 0}
                                onClick={() => handleDirectCallItem(item)}
                                className={`px-4 py-2 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center space-x-1.5 ${
                                  isExceeded || callVal <= 0
                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 active:scale-95'
                                }`}
                              >
                                <Zap className="w-4 h-4 fill-amber-950" />
                                <span>GỌI HÀNG NGAY</span>
                              </button>
                            </div>

                            {/* Validation warning if exceeded stock */}
                            {isExceeded && (
                              <p className="text-[11px] font-bold text-rose-600 bg-rose-50 p-2 rounded-xl border border-rose-200 flex items-center space-x-1">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>⚠️ Không được gọi quá số lượng tồn kho trên kệ (Tối đa: {item.currentStockQty} {item.unit})!</span>
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: MANAGE SHELF & ADD PARTS */}
              {modalTab === 'manage' && (
                <div className="space-y-5">
                  {/* Edit Shelf Header Info (Model, Desc) */}
                  <form onSubmit={handleSaveShelfInfo} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <h4 className="font-extrabold text-slate-800 text-xs">Cấu Hình Thông Tin Vị Trí & Model Kệ:</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Gán Model Sản Xuất</label>
                        <input
                          type="text"
                          placeholder="Ví dụ: Model LSX-2026-TDH09"
                          value={shelfModelName}
                          onChange={(e) => setShelfModelName(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-blue-900 text-xs focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Mô Tả Vị Trí Kệ</label>
                        <input
                          type="text"
                          placeholder="Khoang 01 - Tầng 1 - Vị trí 1"
                          value={editLocDesc}
                          onChange={(e) => setEditLocDesc(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800 text-xs focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-xs"
                      >
                        Lưu Cấu Hình Kệ
                      </button>
                    </div>
                  </form>

                  {/* Add New Part to Shelf Form */}
                  <form onSubmit={handleAddPartToShelf} className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
                    <h4 className="font-extrabold text-emerald-950 text-xs flex items-center space-x-1.5">
                      <Plus className="w-4 h-4 text-emerald-700" />
                      <span>Nhập Bổ Sung Linh Kiện Lên Kệ [{selectedBuffer.locationId}]:</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-800 mb-1">Mã Linh Kiện *</label>
                        <input
                          type="text"
                          required
                          placeholder="LK-RES-10K-0805"
                          value={newPartCode}
                          onChange={(e) => setNewPartCode(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold text-purple-900 text-xs focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-800 mb-1">Tên Linh Kiện</label>
                        <input
                          type="text"
                          placeholder="Điện trở dán SMD 10K Ohm"
                          value={newPartName}
                          onChange={(e) => setNewPartName(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800 text-xs focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-800 mb-1">Số Lượng Nhập *</label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={newPartQty}
                          onChange={(e) => setNewPartQty(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-emerald-800 text-xs focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-800 mb-1">Đơn Vị Tính</label>
                        <select
                          value={newPartUnit}
                          onChange={(e) => setNewPartUnit(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 text-xs"
                        >
                          <option value="Con">Con</option>
                          <option value="Cái">Cái</option>
                          <option value="Bộ">Bộ</option>
                          <option value="Cuộn">Cuộn</option>
                          <option value="Thùng">Thùng</option>
                          <option value="PCS">PCS</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-black rounded-xl text-xs shadow-md"
                      >
                        + Thêm Linh Kiện Lên Kệ
                      </button>
                    </div>
                  </form>

                  {/* List current parts on shelf with remove option */}
                  <div className="space-y-2">
                    <h4 className="font-extrabold text-slate-800 text-xs">Các Linh Kiện Đang Lưu Trên Kệ:</h4>
                    {(!selectedBuffer.items || selectedBuffer.items.length === 0) ? (
                      <p className="text-slate-400 italic text-xs">Chưa có linh kiện nào.</p>
                    ) : (
                      selectedBuffer.items.map((item, idx) => (
                        <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                          <div>
                            <span className="font-mono font-bold text-purple-900 text-xs block">{item.partCode}</span>
                            <span className="text-slate-700 text-[11px]">{item.partName}</span>
                          </div>
                          <div className="flex items-center space-x-3">
                            <span className="font-black text-emerald-800 text-xs">
                              {item.currentStockQty} {item.unit}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemovePartFromShelf(item.partCode)}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Xóa linh kiện này khỏi kệ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Clear or Delete Shelf Buttons */}
                  <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => handleClearShelf(selectedBuffer.locationId)}
                      className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-xl font-bold text-xs cursor-pointer"
                    >
                      Dọn Trống Kệ
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteShelf(selectedBuffer.locationId)}
                      className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs cursor-pointer flex items-center space-x-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa Kệ Vĩnh Viễn</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedBuffer(null)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs cursor-pointer shadow-md"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location QR Code Labels Print Modal for OUTBUFFER shelves */}
      <LocationQrPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        locations={bufferLocationsAsWarehouseLocs}
        settings={settings}
        initialSelectedId={printInitialLocId}
      />
    </div>
  );
};
