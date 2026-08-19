import React, { useState, useEffect, useRef } from 'react';
import { Part, AppSettings, BomExportVoucher } from './types';
import { storageService } from './storage';
import { ArrowUpRight, CheckCircle2, AlertTriangle, AlertCircle, Package, Clock, User, FileCode, FileText, QrCode, Zap, Printer, X } from 'lucide-react';
import { SearchableSelect, SelectOption } from './SearchableSelect';
import { QrScannerModal } from './QrScannerModal';
import { InlineQrScanner } from './InlineQrScanner';
import { StockOutScanModal } from './StockOutScanModal';
import { printHtml } from './printHelper';

interface StockOutViewProps {
  parts: Part[];
  settings: AppSettings;
  onSuccess: () => void;
}

const getNowLocalDateTime = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
};

export const StockOutView: React.FC<StockOutViewProps> = ({ parts, settings, onSuccess }) => {
  const [selectedPartId, setSelectedPartId] = useState(parts[0]?.id || '');
  const [quantity, setQuantity] = useState<number>(10);
  const [dateTime, setDateTime] = useState(getNowLocalDateTime());

  // Default person from logged in user
  const currentUser = storageService.getCurrentUser();
  const currentUserName = currentUser
    ? `${currentUser.fullName}${currentUser.roleTitle ? ` (${currentUser.roleTitle})` : ''}`
    : (settings.staffList?.[0] || 'Lê Hoàng Nam (Xưởng 1)');

  const defaultPerson = currentUserName;
  const [person, setPerson] = useState(defaultPerson);

  const staffOptions = React.useMemo(() => {
    const list = settings.staffList || [];
    if (currentUserName && !list.includes(currentUserName)) {
      return [currentUserName, ...list];
    }
    return list.length ? list : [currentUserName];
  }, [settings.staffList, currentUserName]);

  // Default production order from settings
  const defaultLSX = settings.productionOrders?.[0] || 'LSX-2026-HL288';
  const [productionOrder, setProductionOrder] = useState(defaultLSX);

  // Default purpose from settings
  const defaultPurpose = settings.stockOutPurposes?.[0] || 'Sản xuất theo đơn hàng';
  const [purpose, setPurpose] = useState(defaultPurpose);

  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  // Tab #1 Priority: XUẤT THEO MODEL (BOM)
  const [mainTab, setMainTab] = useState<'model' | 'scan' | 'manual'>('model');

  // Printable BOM Dispatch Order Sheet Modal State
  const [bomPrintModalData, setBomPrintModalData] = useState<{
    voucherCode?: string;
    modelName: string;
    modelQty: number;
    dateTime: string;
    person: string;
    items: Array<{
      partCode: string;
      partName: string;
      unit: string;
      bomQtyPerSet: number;
      totalQtyOut: number;
      fifoLocation: string;
    }>;
  } | null>(null);

  // Saved BOM Export Vouchers History State
  const [savedVouchers, setSavedVouchers] = useState<BomExportVoucher[]>(() => storageService.getBomExportVouchers());
  const [isVoucherHistoryOpen, setIsVoucherHistoryOpen] = useState(false);
  const [searchVoucherTerm, setSearchVoucherTerm] = useState('');

  const refreshSavedVouchers = () => {
    setSavedVouchers(storageService.getBomExportVouchers());
  };

  // Stock Out Scan Modal States
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scannedPartForModal, setScannedPartForModal] = useState<Part | null>(null);
  const [initialScanQty, setInitialScanQty] = useState<number>(1);
  const [scanContNumber, setScanContNumber] = useState<string>('');

  // Model-based stock out states
  const [selectedBOMId, setSelectedBOMId] = useState<string>('');
  const [modelQty, setModelQty] = useState<number>(1);
  const [bomChecks, setBomChecks] = useState<Record<string, boolean>>({});

  const [scannedPartForQuickOut, setScannedPartForQuickOut] = useState<Part | null>(null);
  const [quickOutQty, setQuickOutQty] = useState<number>(10);
  const [autoScanHistory, setAutoScanHistory] = useState<
    { id: string; partCode: string; partName: string; qty: number; unit: string; time: string; stockAfter: number }[]
  >([]);

  const [selectedOutLocation, setSelectedOutLocation] = useState<string>('');
  const locationSelectRef = useRef<HTMLSelectElement>(null);

  const selectedPart = parts.find((p) => p.id === selectedPartId);
  const isOverStock = selectedPart ? quantity > selectedPart.currentStock : false;

  useEffect(() => {
    if (selectedPart) {
      const locs = storageService.getPartLocations(selectedPart);
      setSelectedOutLocation(locs[0]?.locationName || '');
    }
  }, [selectedPartId]);

  // Execute quick stock out
  const handleQuickStockOut = (partToOut: Part, qtyToOut: number) => {
    if (qtyToOut <= 0) {
      setMessage({ type: 'error', text: 'Số lượng xuất phải lớn hơn 0!' });
      return;
    }
    if (qtyToOut > partToOut.currentStock) {
      setMessage({
        type: 'error',
        text: `Số lượng xuất (${qtyToOut} ${partToOut.unit}) vượt quá tồn kho thực tế hiện tại (${partToOut.currentStock} ${partToOut.unit})!`,
      });
      return;
    }

    try {
      const tx = storageService.addStockOut({
        partId: partToOut.id,
        quantity: qtyToOut,
        date: new Date().toISOString(),
        person: person.trim() || 'Lê Hoàng Nam (Xưởng 1)',
        productionOrder: productionOrder.trim() || 'LSX-TỰ-ĐỘNG',
        reasonOrPurpose: purpose.trim() || 'Sản xuất theo đơn hàng',
        notes: 'Xuất kho qua quét mã QR tự động',
      });

      const nowTimeStr = new Date().toLocaleTimeString('vi-VN');
      setAutoScanHistory((prev) => [
        {
          id: `${partToOut.id}-${Date.now()}`,
          partCode: partToOut.code,
          partName: partToOut.name,
          qty: qtyToOut,
          unit: partToOut.unit,
          time: nowTimeStr,
          stockAfter: tx.stockAfter,
        },
        ...prev,
      ]);

      setMessage({
        type: 'success',
        text: `🎉 ĐÃ XUẤT KHO THÀNH CÔNG! -${qtyToOut} ${tx.unit} cho [${tx.partCode}] ${tx.partName}. Tồn kho còn lại: ${tx.stockAfter} ${tx.unit}.`,
      });

      setScannedPartForQuickOut(null);
      onSuccess();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi khi xuất kho' });
    }
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
    if (!selectedPart) {
      setMessage({ type: 'error', text: 'Vui lòng chọn linh kiện cần xuất kho!' });
      return;
    }
    if (quantity <= 0) {
      setMessage({ type: 'error', text: 'Số lượng xuất phải lớn hơn 0!' });
      return;
    }
    if (quantity > selectedPart.currentStock) {
      setMessage({
        type: 'error',
        text: `Số lượng xuất (${quantity} ${selectedPart.unit}) lớn hơn số lượng tồn kho hiện tại (${selectedPart.currentStock} ${selectedPart.unit})!`,
      });
      return;
    }
    if (!selectedOutLocation.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng chọn hoặc quét vị trí / kệ cần xuất kho!' });
      return;
    }
    if (!person.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng chọn hoặc nhập tên người lấy linh kiện!' });
      return;
    }

    try {
      const tx = storageService.addStockOut({
        partId: selectedPartId,
        quantity: Number(quantity),
        date: new Date(dateTime).toISOString(),
        person: person.trim(),
        productionOrder: productionOrder.trim(),
        reasonOrPurpose: purpose.trim(),
        notes: notes.trim(),
        locationId: selectedOutLocation || undefined,
      });

      setMessage({
        type: 'success',
        text: `Đã xuất kho thành công -${quantity} ${tx.unit} cho [${tx.partCode}] ${tx.partName}. Tồn kho còn lại: ${tx.stockAfter} ${tx.unit}.`,
      });

      // Reset form
      setNotes('');
      setDateTime(getNowLocalDateTime());
      onSuccess();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi khi xuất kho' });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Title */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-3">
        <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
          <ArrowUpRight className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">PHIẾU XUẤT KHO LINH KIỆN</h2>
          <p className="text-xs text-slate-500">Tự động trừ tồn kho, liên kết mã lệnh sản xuất, ghi thời gian chính xác và chống xuất âm kho.</p>
        </div>
      </div>

      {/* Main Mode Selection Tabs */}
      <div className="flex border border-slate-200 bg-slate-100 p-1.5 rounded-2xl gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
        <button
          type="button"
          onClick={() => setMainTab('model')}
          className={`px-4 py-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            mainTab === 'model'
              ? 'bg-pink-600 text-white shadow-md'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <Package className="w-4 h-4 text-amber-300 animate-bounce" />
          <span>1. XUẤT THEO MODEL (BOM) (ƯU TIÊN SỐ 1)</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('scan')}
          className={`px-4 py-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            mainTab === 'scan'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>2. QUÉT MÃ TỰ ĐỘNG</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('manual')}
          className={`px-4 py-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            mainTab === 'manual'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-300'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <FileText className="w-4 h-4 text-slate-500" />
          <span>3. XUẤT THỦ CÔNG</span>
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center shadow-xs animate-in zoom-in-95 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-2 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-2 border-red-300 text-red-900'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 mr-2 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-5 h-5 mr-2 shrink-0 text-red-600" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* TAB 1: MODEL-BASED STOCK OUT */}
      {mainTab === 'model' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <SearchableSelect
                label="Chọn Model (Lệnh Sản Xuất)"
                required={true}
                options={storageService.getModelBOMs().map((bom) => ({
                  value: bom.id,
                  label: bom.name,
                  sublabel: `${bom.items.length} linh kiện định mức`,
                  badge: `${bom.items.length} LK`,
                }))}
                value={selectedBOMId}
                onChange={(val) => {
                  setSelectedBOMId(val);
                  const selectedBom = storageService.getModelBOMs().find((b) => b.id === val);
                  if (selectedBom) {
                    const initialChecks: Record<string, boolean> = {};
                    selectedBom.items.forEach((item) => {
                      initialChecks[item.partCode] = true;
                    });
                    setBomChecks(initialChecks);
                  } else {
                    setBomChecks({});
                  }
                }}
                placeholder="-- Tìm kiếm hoặc chọn Model (BOM) --"
                allowCustom={false}
                icon={<FileCode className="w-4 h-4 text-pink-600" />}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Số Lượng Sản Xuất <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                value={modelQty}
                onChange={(e) => setModelQty(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-center focus:ring-2 focus:ring-pink-500 outline-hidden"
              />
            </div>
          </div>

          {selectedBOMId && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-sm flex items-center">
                  <FileCode className="w-4 h-4 text-pink-600 mr-2" />
                  Danh Sách Linh Kiện Sẽ Xuất Theo Định Mức
                </h3>
                <span className="text-xs bg-pink-100 text-pink-800 px-2 py-1 rounded-lg font-bold">
                  {Object.values(bomChecks).filter(Boolean).length} / {storageService.getModelBOMs().find(b => b.id === selectedBOMId)?.items.length} linh kiện chọn xuất
                </span>
              </div>
              
              <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-96">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 sticky top-0 shadow-sm">
                    <tr>
                      <th className="p-3 w-10">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded text-pink-600 focus:ring-pink-500 cursor-pointer"
                          checked={
                            storageService.getModelBOMs().find(b => b.id === selectedBOMId)?.items.length! > 0 &&
                            storageService.getModelBOMs().find(b => b.id === selectedBOMId)?.items.every(i => bomChecks[i.partCode])
                          }
                          onChange={(e) => {
                            const selectedBom = storageService.getModelBOMs().find(b => b.id === selectedBOMId);
                            if (selectedBom) {
                              const newChecks: Record<string, boolean> = {};
                              selectedBom.items.forEach(item => {
                                newChecks[item.partCode] = e.target.checked;
                              });
                              setBomChecks(newChecks);
                            }
                          }}
                        />
                      </th>
                      <th className="p-3 font-semibold">Mã Linh Kiện</th>
                      <th className="p-3 font-semibold">Tên Linh Kiện</th>
                      <th className="p-3 font-semibold text-right">Định Mức</th>
                      <th className="p-3 font-semibold text-right">SL Cần Xuất</th>
                      <th className="p-3 font-semibold text-right">Tồn Kho</th>
                      <th className="p-3 font-semibold text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {storageService.getModelBOMs().find(b => b.id === selectedBOMId)?.items.map((item, idx) => {
                      const sysPart = parts.find(p => p.code.toLowerCase() === item.partCode.toLowerCase());
                      const neededQty = item.quantity * modelQty;
                      const hasEnough = sysPart ? sysPart.currentStock >= neededQty : false;
                      const isChecked = bomChecks[item.partCode] || false;
                      
                      return (
                        <tr key={idx} className={`hover:bg-slate-50 transition-colors ${!isChecked ? 'opacity-50 grayscale' : ''}`}>
                          <td className="p-3">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded text-pink-600 focus:ring-pink-500 cursor-pointer"
                              checked={isChecked}
                              onChange={(e) => {
                                setBomChecks(prev => ({
                                  ...prev,
                                  [item.partCode]: e.target.checked
                                }));
                              }}
                            />
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-800">{item.partCode}</td>
                          <td className="p-3 text-slate-600 max-w-[200px] truncate" title={item.partName}>{item.partName}</td>
                          <td className="p-3 text-right font-medium text-slate-500">{item.quantity}</td>
                          <td className="p-3 text-right font-black text-pink-600">{neededQty.toLocaleString('vi-VN')} {item.unit}</td>
                          <td className="p-3 text-right font-bold text-blue-700">
                            {sysPart ? `${sysPart.currentStock.toLocaleString('vi-VN')} ${sysPart.unit}` : '0 Cái'}
                          </td>
                          <td className="p-3 text-center">
                            {!sysPart ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                Mã mới
                              </span>
                            ) : hasEnough ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
                                Đủ xuất
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                                Thiếu hàng
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons for Model */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex-1 w-full grid grid-cols-2 gap-4">
                   <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Người Lấy <span className="text-red-500">*</span>
                    </label>
                    <SearchableSelect
                      options={staffOptions}
                      value={person}
                      onChange={(val) => setPerson(val)}
                      placeholder="Chọn người nhận..."
                      allowCustom={true}
                    />
                  </div>
                   <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Ngày Giờ <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={dateTime}
                      onChange={(e) => setDateTime(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-hidden"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const selectedBom = storageService.getModelBOMs().find(b => b.id === selectedBOMId);
                    if (!selectedBom) return;
                    if (modelQty <= 0) {
                      setMessage({ type: 'error', text: 'Số lượng sản xuất phải lớn hơn 0!' });
                      return;
                    }

                    // Collect items to out
                    const itemsToOut = selectedBom.items.filter(i => bomChecks[i.partCode]);
                    if (itemsToOut.length === 0) {
                      setMessage({ type: 'error', text: 'Chưa có linh kiện nào được chọn để xuất!' });
                      return;
                    }

                    // Check stock
                    const insufficientParts: string[] = [];
                    for (const item of itemsToOut) {
                      const sysPart = parts.find(p => p.code.toLowerCase() === item.partCode.toLowerCase());
                      const neededQty = item.quantity * modelQty;
                      if (!sysPart || sysPart.currentStock < neededQty) {
                        insufficientParts.push(item.partCode);
                      }
                    }

                    if (insufficientParts.length > 0) {
                      setMessage({ type: 'error', text: `Có ${insufficientParts.length} linh kiện không đủ tồn kho: ${insufficientParts.join(', ')}` });
                      return;
                    }

                    // Perform stock out with FIFO location logging & printable list creation
                    try {
                      let totalOut = 0;
                      const printedItems: Array<{
                        partCode: string;
                        partName: string;
                        unit: string;
                        bomQtyPerSet: number;
                        totalQtyOut: number;
                        fifoLocation: string;
                      }> = [];

                      itemsToOut.forEach((item) => {
                        const sysPart = parts.find((p) => p.code.toLowerCase() === item.partCode.toLowerCase());
                        if (sysPart) {
                          const neededQty = item.quantity * modelQty;

                          // Retrieve FIFO priority location for this part
                          const fifoLots = storageService.getPartFifoLots(sysPart.id);
                          const fifoNext = fifoLots.find((l) => l.status === 'FIFO_NEXT');
                          const activeLocs = storageService.getPartLocations(sysPart).filter((l) => l.quantity > 0);

                          let locationName = 'Kho chính';
                          if (fifoNext && fifoNext.locationName) {
                            locationName = fifoNext.locationName;
                          } else if (activeLocs.length > 0) {
                            locationName = activeLocs[0].locationName;
                          } else if (sysPart.location) {
                            locationName = sysPart.location.split(',')[0]?.split('(')[0]?.trim() || 'Kho chính';
                          }

                          let fullFifoLocStr = locationName;
                          if (fifoNext && fifoNext.contNumber && !locationName.includes(fifoNext.contNumber)) {
                            fullFifoLocStr = `${locationName} (${fifoNext.contNumber})`;
                          }

                          storageService.addStockOut({
                            partId: sysPart.id,
                            quantity: neededQty,
                            date: new Date(dateTime).toISOString(),
                            person: person.trim() || 'Lê Hoàng Nam',
                            productionOrder: selectedBom.name,
                            reasonOrPurpose: 'Sản xuất theo Model (BOM)',
                            notes: `SL SX: ${modelQty} bộ [FIFO: ${locationName}]`,
                            locationId: locationName,
                          });

                          printedItems.push({
                            partCode: sysPart.code,
                            partName: sysPart.name,
                            unit: sysPart.unit,
                            bomQtyPerSet: item.quantity,
                            totalQtyOut: neededQty,
                            fifoLocation: fullFifoLocStr,
                          });

                          totalOut++;
                        }
                      });

                      // Save voucher to persistent history
                      const savedVoucher = storageService.addBomExportVoucher({
                        modelName: selectedBom.name,
                        modelQty,
                        dateTime: dateTime || new Date().toISOString(),
                        person: person.trim() || 'Lê Hoàng Nam',
                        items: printedItems,
                      });

                      refreshSavedVouchers();

                      setMessage({
                        type: 'success',
                        text: `🎉 Đã tiêu hao tồn kho thành công ${totalOut} linh kiện cho Model ${selectedBom.name}! Đã tự động lưu Phiếu Xuất BOM [${savedVoucher.voucherCode}].`,
                      });

                      // Open printable dispatch sheet modal
                      setBomPrintModalData({
                        voucherCode: savedVoucher.voucherCode,
                        modelName: savedVoucher.modelName,
                        modelQty: savedVoucher.modelQty,
                        dateTime: savedVoucher.dateTime,
                        person: savedVoucher.person,
                        items: savedVoucher.items,
                      });

                      setModelQty(1);
                      onSuccess();
                    } catch (err: any) {
                      setMessage({ type: 'error', text: err.message || 'Lỗi khi xuất kho hàng loạt' });
                    }
                  }}
                  className="w-full sm:w-auto px-6 py-4 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-sm font-bold shadow-lg transition-all cursor-pointer flex items-center justify-center space-x-2 shrink-0"
                >
                  <ArrowUpRight className="w-5 h-5" />
                  <span>XUẤT KHO HÀNG LOẠT THEO BOM</span>
                </button>
              </div>
            </div>
          )}

          {/* Saved BOM Export Vouchers History Section */}
          {(() => {
            const filteredVouchers = savedVouchers.filter(
              (v) =>
                !searchVoucherTerm ||
                v.voucherCode.toLowerCase().includes(searchVoucherTerm.toLowerCase()) ||
                v.modelName.toLowerCase().includes(searchVoucherTerm.toLowerCase()) ||
                v.person.toLowerCase().includes(searchVoucherTerm.toLowerCase())
            );

            return (
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 bg-pink-100 text-pink-700 rounded-2xl">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
                        <span>Lịch Sử Phiếu Xuất Kho BOM (Đã Lưu)</span>
                        <span className="px-2.5 py-0.5 bg-pink-100 text-pink-800 text-xs font-black rounded-full">
                          {savedVouchers.length} Phiếu
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        Tất cả phiếu xuất kho soạn hàng theo BOM đều được tự động lưu lại. Bạn có thể tra cứu và in lại bất kỳ lúc nào nếu lỡ đóng phiếu.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    <input
                      type="text"
                      value={searchVoucherTerm}
                      onChange={(e) => setSearchVoucherTerm(e.target.value)}
                      placeholder="Tìm mã phiếu / model / người lập..."
                      className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-pink-500 w-full sm:w-60"
                    />
                    <button
                      type="button"
                      onClick={() => setIsVoucherHistoryOpen(!isVoucherHistoryOpen)}
                      className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs shrink-0"
                    >
                      <Clock className="w-4 h-4" />
                      <span>{isVoucherHistoryOpen ? 'Thu Gọn' : 'Xem Lịch Sử & In Lại'}</span>
                    </button>
                  </div>
                </div>

                {isVoucherHistoryOpen && (
                  <div className="space-y-3 animate-in fade-in duration-200 pt-2">
                    {filteredVouchers.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 italic text-xs">
                        {searchVoucherTerm ? 'Không tìm thấy phiếu xuất kho nào phù hợp.' : 'Chưa có phiếu xuất kho BOM nào trong lịch sử lưu trữ.'}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredVouchers.map((v) => (
                          <div
                            key={v.id}
                            className="p-4 bg-slate-50 hover:bg-pink-50/50 border border-slate-200 hover:border-pink-300 rounded-2xl transition-all space-y-3 flex flex-col justify-between"
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="font-mono font-black text-pink-700 text-xs px-2 py-0.5 bg-pink-100 rounded-md inline-block">
                                    {v.voucherCode}
                                  </span>
                                  <h4 className="font-extrabold text-slate-900 text-sm mt-1">
                                    Model: <span className="text-blue-700 font-bold">{v.modelName}</span>
                                  </h4>
                                </div>
                                <span className="px-2.5 py-1 bg-pink-600 text-white text-xs font-black rounded-lg shrink-0">
                                  {v.modelQty} Bộ
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200/80">
                                <div>
                                  <span className="text-slate-400 block text-[10px]">Thời gian lập:</span>
                                  <strong className="font-semibold text-slate-800 font-mono">
                                    {new Date(v.dateTime || v.createdAt).toLocaleString('vi-VN')}
                                  </strong>
                                </div>
                                <div>
                                  <span className="text-slate-400 block text-[10px]">Người lập:</span>
                                  <strong className="font-semibold text-slate-800">{v.person}</strong>
                                </div>
                                <div>
                                  <span className="text-slate-400 block text-[10px]">Số loại LK:</span>
                                  <strong className="font-bold text-indigo-700">{v.totalPartsCount || v.items.length} loại</strong>
                                </div>
                                <div>
                                  <span className="text-slate-400 block text-[10px]">Tổng SL xuất:</span>
                                  <strong className="font-bold text-emerald-700">{(v.totalQtyOut || 0).toLocaleString('vi-VN')}</strong>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Bạn có chắc muốn xóa lịch sử phiếu ${v.voucherCode}?`)) {
                                    storageService.deleteBomExportVoucher(v.id);
                                    refreshSavedVouchers();
                                  }
                                }}
                                className="px-2.5 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                              >
                                Xóa phiếu
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setBomPrintModalData({
                                    voucherCode: v.voucherCode,
                                    modelName: v.modelName,
                                    modelQty: v.modelQty,
                                    dateTime: v.dateTime,
                                    person: v.person,
                                    items: v.items,
                                  });
                                }}
                                className="px-3.5 py-1.5 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>IN LẠI / XEM PHIẾU</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 1: AUTO SCAN & QUICK STOCK OUT MODE */}
      {mainTab === 'scan' && (
        <div className="space-y-6">
          <InlineQrScanner
            mode="out"
            parts={parts}
            onScanSuccess={({ part, qty, contNumber }) => {
              setScannedPartForQuickOut(part);
              setSelectedPartId(part.id);
              setScannedPartForModal(part);
              setInitialScanQty(qty && qty > 0 ? qty : 1);
              setScanContNumber(contNumber || '');
              setIsScanModalOpen(true);
              setMessage({
                type: 'success',
                text: `🎉 Đã nhận diện mã linh kiện [${part.code}] ${part.name}! Mở bảng POPUP xác nhận số lượng & quét đối soát vị trí kệ FIFO.`,
              });
            }}
          />

          {/* Quick Out Confirmation Card when a part is scanned */}
          {scannedPartForQuickOut && (
            <div className="p-5 bg-blue-50 border-2 border-blue-300 text-slate-900 rounded-2xl shadow-md space-y-4 animate-in fade-in slide-in-from-top-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-200 pb-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-blue-600 text-white rounded-xl font-black">
                    <Package className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-900 text-[10px] font-black rounded-md uppercase border border-blue-200">
                      Đã Nhận Mã Linh Kiện
                    </span>
                    <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                      [{scannedPartForQuickOut.code}] {scannedPartForQuickOut.name}
                    </h3>
                    <p className="text-xs text-slate-600">Vị trí kho: {scannedPartForQuickOut.location} • Tồn kho hiện tại: <strong className="text-blue-700 font-bold">{scannedPartForQuickOut.currentStock} {scannedPartForQuickOut.unit}</strong></p>
                  </div>
                </div>

                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setScannedPartForQuickOut(null)}
                    className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    Hủy chọn
                  </button>
                </div>
              </div>

              {/* FIFO Batch Recommendation for Quick Out */}
              {(() => {
                const fifoLots = storageService.getPartFifoLots(scannedPartForQuickOut.id);
                const fifoNext = fifoLots.find((l) => l.status === 'FIFO_NEXT');
                if (!fifoNext) return null;

                return (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs space-y-1 text-amber-900">
                    <div className="flex items-center justify-between font-bold text-amber-950">
                      <span className="flex items-center space-x-1.5">
                        <Zap className="w-4 h-4 text-amber-600 animate-pulse shrink-0" />
                        <span>GỢI Ý FIFO (#1 NHẬP TRƯỚC XUẤT TRƯỚC):</span>
                      </span>
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-950 text-[10px] font-black rounded-md">
                        {fifoNext.contNumber}
                      </span>
                    </div>
                    <p className="text-amber-800">
                      Khuyến nghị lấy hàng từ Cont <strong className="text-amber-950 font-bold">{fifoNext.contNumber}</strong> (Nhập ngày {new Date(fifoNext.importDate).toLocaleDateString('vi-VN')} • Còn tồn {fifoNext.remainingQty.toLocaleString('vi-VN')} {scannedPartForQuickOut.unit}).
                    </p>
                  </div>
                );
              })()}

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <div className="flex items-center space-x-3">
                  <label className="text-xs font-bold text-slate-800 whitespace-nowrap">
                    Số lượng xuất:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={scannedPartForQuickOut.currentStock}
                    value={quickOutQty}
                    onChange={(e) => setQuickOutQty(Number(e.target.value))}
                    className="w-28 px-3 py-2 bg-white border-2 border-blue-300 rounded-xl text-blue-900 font-black text-center text-sm outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs font-bold text-slate-700">{scannedPartForQuickOut.unit}</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setScannedPartForModal(scannedPartForQuickOut);
                    setInitialScanQty(quickOutQty);
                    setIsScanModalOpen(true);
                  }}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer active:scale-95"
                >
                  <Zap className="w-4 h-4" />
                  <span>XÁC NHẬN CHỌN KỆ & XUẤT KHO (-{quickOutQty})</span>
                </button>
              </div>
            </div>
          )}

          {/* Auto scan history in current session */}
          {autoScanHistory.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="font-extrabold text-xs text-slate-800 flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>DANH SÁCH LƯỢT XUẤT KHO VỪA THỰC HIỆN ({autoScanHistory.length})</span>
                </h4>
                <span className="text-[11px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-md">
                  Đã trừ trực tiếp vào kho
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {autoScanHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-600">[{item.partCode}]</span>{' '}
                      <strong className="text-slate-900">{item.partName}</strong>
                    </div>

                    <div className="text-right">
                      <span className="font-black text-blue-700 text-sm">
                        -{item.qty} {item.unit}
                      </span>
                      <p className="text-[10px] text-slate-400">Tồn còn: {item.stockAfter} • {item.time}</p>
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
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                Chọn Linh Kiện Xuất Kho <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold border border-blue-200 transition-colors cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5 text-blue-600" />
                <span>Quét mã camera phụ</span>
              </button>
            </div>

            <SearchableSelect
              options={partOptions}
              value={selectedPartId}
              onChange={(val) => setSelectedPartId(val)}
              placeholder="Gõ mã, tên linh kiện hoặc vị trí để tìm..."
              allowCustom={false}
              icon={<Package className="w-4 h-4 text-blue-600" />}
            />
          </div>

        {/* Selected Part Stock Status Card */}
        {selectedPart && (
          <div className="space-y-3">
            <div
              className={`p-4 border rounded-xl flex items-center justify-between text-xs transition-colors ${
                selectedPart.currentStock === 0
                  ? 'bg-red-50 border-red-200'
                  : isOverStock
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Package className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <p className="font-bold text-slate-800">{selectedPart.name}</p>
                  <p className="text-slate-500 font-mono">Mã: {selectedPart.code} | Vị trí: {selectedPart.location}</p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-slate-500 font-medium">Tồn kho hiện tại:</span>
                <p
                  className={`text-base font-black ${
                    selectedPart.currentStock === 0
                      ? 'text-red-600'
                      : selectedPart.currentStock <= selectedPart.minStock
                      ? 'text-amber-600'
                      : 'text-blue-700'
                  }`}
                >
                  {selectedPart.currentStock.toLocaleString('vi-VN')} {selectedPart.unit}
                </p>
              </div>
            </div>

            {/* FIFO Batch Recommendation Box */}
            {(() => {
              const fifoLots = storageService.getPartFifoLots(selectedPart.id);
              const fifoNext = fifoLots.find((l) => l.status === 'FIFO_NEXT');
              if (!fifoNext) return null;

              return (
                <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl text-xs space-y-1.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-amber-950 flex items-center space-x-1.5">
                      <Zap className="w-4 h-4 text-amber-600 animate-pulse shrink-0" />
                      <span>GỢI Ý KHUYẾN NGHỊ XUẤT KHO THEO FIFO (#1 NHẬP TRƯỚC XUẤT TRƯỚC):</span>
                    </span>
                    <span className="px-2 py-0.5 bg-amber-200 text-amber-950 font-black text-[10px] rounded-md">
                      LÔ CŨ NÊN XUẤT TRƯỚC
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-amber-900">
                    <div>
                      Mốc Cont ưu tiên: <strong className="text-amber-950 text-sm">{fifoNext.contNumber}</strong> (Nhập ngày: {new Date(fifoNext.importDate).toLocaleDateString('vi-VN')})
                      • Còn tồn trong mốc này: <strong className="text-amber-950">{fifoNext.remainingQty.toLocaleString('vi-VN')} {selectedPart.unit}</strong>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setNotes((prev) => (prev ? `${prev} | Gắn Cont FIFO: ${fifoNext.contNumber}` : `Xuất kho FIFO từ Cont ${fifoNext.contNumber}`));
                      }}
                      className="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-[11px] rounded-lg transition-colors cursor-pointer border border-amber-400"
                    >
                      + Gắn Mã Cont {fifoNext.contNumber} Vào Ghi Chú
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}


        {/* Overstock Warning Banner */}
        {isOverStock && selectedPart && (
          <div className="p-3.5 bg-red-100 border border-red-300 text-red-800 rounded-xl text-xs font-bold flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2 text-red-600 shrink-0" />
            <span>
              CẢNH BÁO: Số lượng muốn xuất ({quantity} {selectedPart.unit}) lớn hơn tồn kho thực tế ({selectedPart.currentStock} {selectedPart.unit}). Hệ thống không cho phép xuất âm kho!
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Location / Shelf Selection */}
          {selectedPart && (
            <div className="col-span-1 md:col-span-2 bg-blue-50/60 p-3.5 rounded-xl border-2 border-blue-300">
              <label className="block text-xs font-extrabold text-blue-950 mb-1 flex items-center justify-between">
                <span>📍 BẮT BUỘC CHỌN KỆ / VỊ TRÍ XUẤT HÀNG *</span>
                <span className="text-[11px] font-normal text-blue-800">Linh kiện có ở {storageService.getPartLocations(selectedPart).length} vị trí</span>
              </label>
              <select
                ref={locationSelectRef}
                value={selectedOutLocation}
                onChange={(e) => setSelectedOutLocation(e.target.value)}
                className="w-full px-3.5 py-2.5 border-2 border-blue-400 rounded-xl text-xs font-bold bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-hidden"
              >
                <option value="">-- Bắt buộc chọn kệ / vị trí xuất --</option>
                {storageService.getPartLocations(selectedPart).map((loc, i) => (
                  <option key={i} value={loc.locationName}>
                    📍 {loc.locationName} — Tồn tại kệ này: {loc.quantity.toLocaleString('vi-VN')} {selectedPart.unit}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-xs font-extrabold text-slate-800 mb-1">
              Số Lượng Xuất <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              value={quantity}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  locationSelectRef.current?.focus();
                }
              }}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
              className={`w-full px-3.5 py-2.5 border-2 rounded-xl text-base font-black focus:ring-2 outline-hidden ${
                isOverStock
                  ? 'bg-red-50 border-red-400 text-red-700 focus:ring-red-500'
                  : 'bg-slate-50 border-slate-300 text-blue-700 focus:ring-blue-500 focus:bg-white'
              }`}
            />
            <p className="text-[10px] text-slate-500 mt-1">
              💡 Gõ số lượng xong nhấn Enter để chuyển sang ô Chọn Kệ.
            </p>
          </div>

          {/* Date & Time (Giờ, phút, ngày) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ngày & Giờ Xuất Kho <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
            </div>
          </div>

          {/* Person Receiver (Searchable select from Settings staff list) */}
          <div>
            <SearchableSelect
              label="Người Lấy Linh Kiện / Nhận Hàng"
              required
              options={staffOptions}
              value={person}
              onChange={(val) => setPerson(val)}
              placeholder="Chọn nhân sự hoặc gõ tên mới..."
              allowCustom={true}
              icon={<User className="w-4 h-4 text-slate-400" />}
            />
          </div>

          {/* Production Order LSX (Searchable select from Settings productionOrders) */}
          <div>
            <SearchableSelect
              label="Mã Lệnh Sản Xuất (LSX)"
              options={settings.productionOrders || []}
              value={productionOrder}
              onChange={(val) => setProductionOrder(val)}
              placeholder="Chọn LSX hoặc gõ mã LSX mới..."
              allowCustom={true}
              icon={<FileCode className="w-4 h-4 text-slate-400" />}
            />
          </div>
        </div>

        {/* Purpose (Searchable select from Settings stockOutPurposes) */}
        <div>
          <SearchableSelect
            label="Mục Đích Xuất Kho"
            options={settings.stockOutPurposes || []}
            value={purpose}
            onChange={(val) => setPurpose(val)}
            placeholder="Chọn mục đích hoặc gõ mục đích mới..."
            allowCustom={true}
            icon={<FileText className="w-4 h-4 text-slate-400" />}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi Chú Chi Tiết</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ghi chú thêm..."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-hidden"
          />
        </div>

        {/* Submit Button */}
        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={isOverStock || !selectedPart || selectedPart.currentStock === 0 || !selectedOutLocation.trim() || quantity <= 0}
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer ${
              !isOverStock && selectedPart && selectedPart.currentStock > 0 && selectedOutLocation.trim() && quantity > 0
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Xác Nhận Xuất Kho</span>
          </button>
        </div>
      </form>
      )}

      {/* QR Scanner Modal */}
      <QrScannerModal
        mode="out"
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        parts={parts}
        onSelectPart={(p) => {
          setSelectedPartId(p.id);
          setIsQrModalOpen(false);
        }}
      />

      {/* POPUP Modal for Auto-Scan Stock Out Verification */}
      <StockOutScanModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        part={scannedPartForModal}
        initialQty={initialScanQty}
        contNumber={scanContNumber}
        settings={settings}
        defaultPerson={person}
        defaultLSX={productionOrder}
        defaultPurpose={purpose}
        onConfirm={({ part, qty, location, person: pPerson, productionOrder: pLSX, purpose: pPurpose, notes: pNotes }) => {
          try {
            const tx = storageService.addStockOut({
              partId: part.id,
              quantity: qty,
              date: new Date().toISOString(),
              person: pPerson,
              productionOrder: pLSX,
              reasonOrPurpose: pPurpose,
              notes: `${pNotes} [📍 Kệ ${location}]`,
              locationId: location,
            });

            const nowTimeStr = new Date().toLocaleTimeString('vi-VN');
            setAutoScanHistory((prev) => [
              {
                id: `${part.id}-${Date.now()}`,
                partCode: part.code,
                partName: part.name,
                qty,
                unit: part.unit,
                time: nowTimeStr,
                stockAfter: tx.stockAfter,
              },
              ...prev,
            ]);

            setMessage({
              type: 'success',
              text: `🎉 ĐÃ XUẤT KHO THÀNH CÔNG! -${qty} ${tx.unit} cho [${tx.partCode}] ${tx.partName} từ [${location}]. Tồn kho còn lại: ${tx.stockAfter} ${tx.unit}.`,
            });

            setIsScanModalOpen(false);
            setScannedPartForModal(null);
            onSuccess();
          } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Lỗi khi xuất kho' });
          }
        }}
      />

      {/* Printable BOM Dispatch Order Sheet Modal */}
      {bomPrintModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-4 animate-in zoom-in-95">
            {/* Header */}
            <div className="bg-gradient-to-r from-pink-700 to-rose-700 text-white p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-300 text-amber-950 rounded-2xl font-black">
                  <Printer className="w-6 h-6 text-amber-900" />
                </div>
                <div>
                  <span className="px-2.5 py-0.5 bg-amber-300 text-amber-950 text-[10px] font-extrabold rounded-md uppercase tracking-wide">
                    PHIẾU SOẠN HÀNG XUẤT KHO FIFO
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-white mt-0.5">
                    Phiếu Lệnh Xuất Kho Theo Model {bomPrintModalData.modelName}
                  </h2>
                </div>
              </div>

              <button
                onClick={() => setBomPrintModalData(null)}
                className="p-2 text-rose-100 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto text-slate-800 text-xs">
              <div className="p-4 bg-pink-50 border border-pink-200 rounded-2xl flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  {bomPrintModalData.voucherCode && (
                    <span className="px-2.5 py-1 bg-pink-200 text-pink-900 font-mono font-black text-xs rounded-md inline-block mb-1">
                      Mã Phiếu: {bomPrintModalData.voucherCode}
                    </span>
                  )}
                  <p className="text-slate-600">Model (Lệnh SX): <strong className="text-pink-900 text-sm">{bomPrintModalData.modelName}</strong></p>
                  <p className="text-slate-600">Người lập / xuất kho: <strong className="text-slate-900">{bomPrintModalData.person}</strong></p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-slate-600">Số lượng sản xuất: <strong className="text-pink-700 text-base font-black">{bomPrintModalData.modelQty} Bộ</strong></p>
                  <p className="text-slate-500 text-[11px]">Thời gian xuất: {new Date(bomPrintModalData.dateTime).toLocaleString('vi-VN')}</p>
                </div>
              </div>

              {/* Items List Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px]">
                    <tr>
                      <th className="p-3 text-center w-10">STT</th>
                      <th className="p-3">Mã Linh Kiện</th>
                      <th className="p-3">Tên Linh Kiện</th>
                      <th className="p-3 text-center">ĐVT</th>
                      <th className="p-3 text-right">Định Mức</th>
                      <th className="p-3 text-right text-emerald-800 bg-emerald-50">Tổng SL Xuất</th>
                      <th className="p-3 text-blue-900 bg-blue-50">Vị Trí Kệ Lấy Hàng (FIFO)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bomPrintModalData.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-blue-700">{item.partCode}</td>
                        <td className="p-3 font-semibold text-slate-900">{item.partName}</td>
                        <td className="p-3 text-center text-slate-600">{item.unit}</td>
                        <td className="p-3 text-right font-medium text-slate-600">{item.bomQtyPerSet}</td>
                        <td className="p-3 text-right font-black text-emerald-700 bg-emerald-50/50">
                          {item.totalQtyOut.toLocaleString('vi-VN')}
                        </td>
                        <td className="p-3 font-bold text-blue-900 bg-blue-50/50">
                          📍 {item.fifoLocation}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-slate-500 text-xs font-medium">
                * Phiếu in sẵn sàng để bộ phận kho đi soạn hàng theo đúng kệ vị trí FIFO.
              </span>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setBomPrintModalData(null)}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl font-bold cursor-pointer transition-colors"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const html = `
                      <div style="padding: 24px; font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #0f172a;">
                        <div style="text-align: center; border-bottom: 3px double #1e3a8a; padding-bottom: 12px; margin-bottom: 20px;">
                          <h2 style="margin: 0; font-size: 20px; font-weight: 800; text-transform: uppercase; color: #1e3a8a; letter-spacing: 0.5px;">PHIẾU XUẤT KHO & SOẠN HÀNG THEO MODEL (BOM)</h2>
                          ${bomPrintModalData.voucherCode ? `<p style="margin: 4px 0 0 0; font-size: 14px; font-family: monospace; font-weight: bold; color: #1e3a8a;">[ MÃ PHIẾU: ${bomPrintModalData.voucherCode} ]</p>` : ''}
                          <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569; font-style: italic;">Quản Lý Kho Linh Kiện - Chỉ Dẫn Soạn Hàng Chuẩn FIFO (Nhập Trước Xuất Trước)</p>
                        </div>

                        <table style="width: 100%; font-size: 13px; margin-bottom: 20px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 6px 0;"><strong>Tên Model (Lệnh SX):</strong> <span style="font-size: 15px; font-weight: bold; color: #1e40af;">${bomPrintModalData.modelName}</span></td>
                            <td style="padding: 6px 0; text-align: right;"><strong>Số Lượng Sản Xuất:</strong> <span style="font-size: 16px; font-weight: 900; color: #be185d;">${bomPrintModalData.modelQty} Bộ</span></td>
                          </tr>
                          <tr>
                            <td style="padding: 6px 0;"><strong>Thời Gian Thực Hiện:</strong> ${new Date(bomPrintModalData.dateTime).toLocaleString('vi-VN')}</td>
                            <td style="padding: 6px 0; text-align: right;"><strong>Người Lập / Soạn Hàng:</strong> ${bomPrintModalData.person}</td>
                          </tr>
                        </table>

                        <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #cbd5e1;">
                          <thead>
                            <tr style="background-color: #f1f5f9; color: #0f172a; font-weight: bold; text-align: left;">
                              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 35px;">STT</th>
                              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 140px;">Mã Linh Kiện</th>
                              <th style="border: 1px solid #cbd5e1; padding: 8px;">Tên Linh Kiện</th>
                              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 45px;">ĐVT</th>
                              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: right; width: 75px;">Định Mức</th>
                              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: right; width: 85px; color: #15803d; background-color: #f0fdf4;">Tổng SL Xuất</th>
                              <th style="border: 1px solid #cbd5e1; padding: 8px; color: #1e40af; background-color: #eff6ff;">Vị Trí Kệ Lấy Hàng (FIFO)</th>
                              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 65px;">Đã Lấy</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${bomPrintModalData.items.map((item, idx) => `
                              <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
                                <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; font-weight: bold;">${idx + 1}</td>
                                <td style="border: 1px solid #cbd5e1; padding: 8px; font-family: monospace; font-weight: bold; color: #1d4ed8;">${item.partCode}</td>
                                <td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: 600;">${item.partName}</td>
                                <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">${item.unit}</td>
                                <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right;">${item.bomQtyPerSet}</td>
                                <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right; font-weight: bold; color: #15803d; background-color: #f0fdf4;">${item.totalQtyOut.toLocaleString('vi-VN')}</td>
                                <td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold; color: #1e40af; background-color: #eff6ff;">📍 ${item.fifoLocation}</td>
                                <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; font-size: 10px; color: #94a3b8;">[ &nbsp; ]</td>
                              </tr>
                            `).join('')}
                          </tbody>
                        </table>

                        <div style="margin-top: 28px; display: flex; justify-content: space-between; font-size: 12px; text-align: center; page-break-inside: avoid;">
                          <div style="width: 30%;">
                            <p style="margin: 0; font-weight: bold;">Người Soạn Hàng</p>
                            <p style="margin: 4px 0 0 0; font-size: 10px; color: #64748b;">(Ký & ghi rõ họ tên)</p>
                            <div style="height: 55px;"></div>
                            <p style="margin: 0; font-weight: 600;">${bomPrintModalData.person}</p>
                          </div>
                          <div style="width: 30%;">
                            <p style="margin: 0; font-weight: bold;">Thủ Kho Xuất Hàng</p>
                            <p style="margin: 4px 0 0 0; font-size: 10px; color: #64748b;">(Ký & ghi rõ họ tên)</p>
                            <div style="height: 55px;"></div>
                          </div>
                          <div style="width: 30%;">
                            <p style="margin: 0; font-weight: bold;">Đơn Vị Nhận Hàng (SX)</p>
                            <p style="margin: 4px 0 0 0; font-size: 10px; color: #64748b;">(Ký & ghi rõ họ tên)</p>
                            <div style="height: 55px;"></div>
                          </div>
                        </div>
                      </div>
                    `;
                    printHtml(html);
                  }}
                  className="px-6 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-bold cursor-pointer transition-all flex items-center space-x-2 shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  <span>🖨 IN PHIẾU SOẠN HÀNG (PRINT)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
