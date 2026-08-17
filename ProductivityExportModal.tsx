import React, { useState, useEffect } from 'react';
import { storageService } from './storage';
import { ProductivityPersonnelConfig, HourlyPersonnelSlot, ConversionFactor, KittingScanLog } from './types';
import { exportProductivityExcel, ProductivityExportItem } from './exportProductivityExcel';
import { X, Download, Save, Users, Calendar, Calculator, CheckCircle2, FileSpreadsheet, Sparkles } from 'lucide-react';

interface ProductivityExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProductivityExportModal: React.FC<ProductivityExportModalProps> = ({ isOpen, onClose }) => {
  const [reportDate, setReportDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [config, setConfig] = useState<ProductivityPersonnelConfig>(() =>
    storageService.getProductivityPersonnelConfig()
  );
  const [savedSuccessMessage, setSavedSuccessMessage] = useState<string | null>(null);

  const today = new Date();
  const minDateObj = new Date();
  minDateObj.setDate(today.getDate() - 35);
  const minDateStr = minDateObj.toISOString().split('T')[0];
  const maxDateStr = today.toISOString().split('T')[0];

  useEffect(() => {
    if (isOpen) {
      const currentConfig = storageService.getProductivityPersonnelConfig();
      setConfig(currentConfig);
      setReportDate(new Date().toISOString().split('T')[0]);
      setSavedSuccessMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleHeaderNumberChange = (field: keyof Omit<ProductivityPersonnelConfig, 'hourlySlots' | 'khsxMap'>, val: number) => {
    setConfig((prev) => ({
      ...prev,
      [field]: Math.max(0, val),
    }));
  };

  const handleSlotChange = (index: number, field: 'nsChinhThuc' | 'nsThoiVu' | 'nhanSuMoiGio', val: number) => {
    const updatedSlots = [...config.hourlySlots];
    const current = { ...updatedSlots[index] };

    if (field === 'nsChinhThuc') {
      current.nsChinhThuc = Math.max(0, val);
      current.nhanSuMoiGio = current.nsChinhThuc + current.nsThoiVu;
    } else if (field === 'nsThoiVu') {
      current.nsThoiVu = Math.max(0, val);
      current.nhanSuMoiGio = current.nsChinhThuc + current.nsThoiVu;
    } else if (field === 'nhanSuMoiGio') {
      current.nhanSuMoiGio = Math.max(0, val);
    }

    updatedSlots[index] = current;
    setConfig((prev) => ({
      ...prev,
      hourlySlots: updatedSlots,
    }));
  };

  const handleSaveConfigOnly = () => {
    storageService.saveProductivityPersonnelConfig(config);
    setSavedSuccessMessage('Đã lưu cấu hình phân bổ nhân sự! Hệ thống sẽ gợi ý thông số này cho các lần xuất sau.');
    setTimeout(() => setSavedSuccessMessage(null), 3000);
  };

  const handleExecuteExportExcel = () => {
    // Save settings for future sessions
    storageService.saveProductivityPersonnelConfig(config);

    // Fetch conversion factors
    const factors = storageService.getConversionFactors();
    const factorMap = new Map<string, number>();
    factors.forEach((f) => factorMap.set(f.partCode.trim().toUpperCase(), f.hsqd));

    // Fetch kitting scan logs for chosen date
    const scanLogs = storageService.getKittingScanLogs();
    const dateLogs = scanLogs.filter((log) => log.timestamp.startsWith(reportDate));

    const partMap = new Map<string, ProductivityExportItem>();

    // Process scan logs for selected date
    dateLogs.forEach((log) => {
      const codeKey = log.partCode.trim().toUpperCase();
      const dt = new Date(log.timestamp);
      const hour = dt.getHours();

      let slotKey = '8h-9h';
      if (hour >= 8 && hour < 9) slotKey = '8h-9h';
      else if (hour >= 9 && hour < 10) slotKey = '9h-10h';
      else if (hour >= 10 && hour < 11) slotKey = '10h-11h';
      else if (hour >= 11 && hour < 12) slotKey = '11h-12h';
      else if (hour >= 13 && hour < 14) slotKey = '13h-14h';
      else if (hour >= 14 && hour < 15) slotKey = '14h-15h';
      else if (hour >= 15 && hour < 16) slotKey = '15h-16h';
      else if (hour >= 16 && hour < 17) slotKey = '16h-17h';
      else if (hour >= 17 && hour < 18) slotKey = '17h-18h';
      else if (hour >= 18 && hour < 19) slotKey = '18h-19h';
      else if (hour >= 19 && hour < 20) slotKey = '19h-20h';

      if (!partMap.has(codeKey)) {
        const factor = factorMap.get(codeKey) || 1.0;
        const khsx = config.khsxMap?.[log.partCode] || 550;
        partMap.set(codeKey, {
          partCode: log.partCode,
          partName: log.partName || log.partCode,
          khsx: khsx,
          actual: 0,
          conLai: khsx,
          tyLeHoanThanh: 0,
          hsqd: factor,
          hourlyQty: {
            '8h-9h': 0,
            '9h-10h': 0,
            '10h-11h': 0,
            '11h-12h': 0,
            '13h-14h': 0,
            '14h-15h': 0,
            '15h-16h': 0,
            '16h-17h': 0,
            '17h-18h': 0,
            '18h-19h': 0,
            '19h-20h': 0,
          },
          tongSanLuong: 0,
        });
      }

      const item = partMap.get(codeKey)!;
      item.actual += log.quantity;
      item.hourlyQty[slotKey] = (item.hourlyQty[slotKey] || 0) + log.quantity;
      item.tongSanLuong += log.quantity;
      item.conLai = Math.max(0, item.khsx - item.actual);
      item.tyLeHoanThanh = item.khsx > 0 ? (item.actual / item.khsx) * 100 : 0;
    });

    const items = Array.from(partMap.values());

    // Export formatted Excel table (.xls HTML)
    exportProductivityExcel(reportDate, config, items);

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-blue-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-800/80 rounded-xl">
              <Calculator className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-wide">XUẤT BÁO CÁO NĂNG SUẤT LAO ĐỘNG (NSLĐ)</h3>
              <p className="text-xs text-blue-200">
                Xác nhận thông số nhân sự trước khi xuất file Excel. Hệ thống sẽ lưu làm gợi ý mặc định.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-blue-200 hover:text-white hover:bg-blue-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
          {savedSuccessMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center">
              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600 shrink-0" />
              <span>{savedSuccessMessage}</span>
            </div>
          )}

          {/* Date Selector */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <label className="text-xs font-bold text-slate-700">Ngày xuất báo cáo:</label>
            </div>
            <input
              type="date"
              min={minDateStr}
              max={maxDateStr}
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 outline-hidden"
              title="Chỉ xem dữ liệu báo cáo trong vòng 35 ngày gần nhất"
            />
          </div>

          {/* Section 1: Header Personnel Summary (Ảnh 2) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 shadow-2xs">
            <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
              <Users className="w-4 h-4 text-emerald-600" />
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                1. Thông tin Phân bổ Nhân sự Kho Tổng Hợp (Gợi ý mặc định)
              </h4>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">NS Chính thức</label>
                <input
                  type="number"
                  value={config.chinhThuc}
                  onChange={(e) => handleHeaderNumberChange('chinhThuc', Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-center focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">SOẠN VẬT TƯ</label>
                <input
                  type="number"
                  value={config.soanVatTu}
                  onChange={(e) => handleHeaderNumberChange('soanVatTu', Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-center focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">BÓC TÁCH</label>
                <input
                  type="number"
                  value={config.bocTach}
                  onChange={(e) => handleHeaderNumberChange('bocTach', Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-center focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">BÓC XẾP</label>
                <input
                  type="number"
                  value={config.bocXep}
                  onChange={(e) => handleHeaderNumberChange('bocXep', Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-center focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">XE NÂNG</label>
                <input
                  type="number"
                  value={config.xeNang}
                  onChange={(e) => handleHeaderNumberChange('xeNang', Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-center focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">CẤP PHÁT</label>
                <input
                  type="number"
                  value={config.capPhat}
                  onChange={(e) => handleHeaderNumberChange('capPhat', Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-center focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Hourly Personnel Breakdown Table (Ảnh 6 bottom) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-2">
                <Calculator className="w-4 h-4 text-blue-600" />
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  2. Điền Số Lượng Nhân Sự Theo Từng Khung Giờ (Ảnh 6)
                </h4>
              </div>
              <span className="text-[11px] text-slate-500">Mức định chuẩn: 1069.125 SP quy đổi/người/giờ</span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 text-[11px] uppercase tracking-wider font-bold">
                  <tr>
                    <th className="p-2.5 border-b border-r border-slate-200 min-w-[140px]">Chỉ Tiêu / Khung Giờ</th>
                    {config.hourlySlots.map((s) => (
                      <th key={s.slot} className="p-2.5 text-center border-b border-r border-slate-200 min-w-[65px]">
                        {s.slot}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-slate-100">
                  {/* Row: NS CHÍNH THỨC */}
                  <tr className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-800 border-r border-slate-200 bg-slate-50">
                      NS CHÍNH THỨC
                    </td>
                    {config.hourlySlots.map((s, idx) => (
                      <td key={s.slot} className="p-1.5 text-center border-r border-slate-200">
                        <input
                          type="number"
                          value={s.nsChinhThuc}
                          onChange={(e) => handleSlotChange(idx, 'nsChinhThuc', Number(e.target.value))}
                          className="w-12 px-1 py-1 text-center bg-white border border-slate-300 rounded-md font-bold text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 outline-hidden"
                        />
                      </td>
                    ))}
                  </tr>

                  {/* Row: NS THỜI VỤ */}
                  <tr className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-800 border-r border-slate-200 bg-slate-50">
                      NS THỜI VỤ
                    </td>
                    {config.hourlySlots.map((s, idx) => (
                      <td key={s.slot} className="p-1.5 text-center border-r border-slate-200">
                        <input
                          type="number"
                          value={s.nsThoiVu}
                          onChange={(e) => handleSlotChange(idx, 'nsThoiVu', Number(e.target.value))}
                          className="w-12 px-1 py-1 text-center bg-white border border-slate-300 rounded-md font-bold text-amber-700 text-xs focus:ring-1 focus:ring-blue-500 outline-hidden"
                        />
                      </td>
                    ))}
                  </tr>

                  {/* Row: Nhân sự mỗi giờ */}
                  <tr className="bg-blue-50/60 font-bold">
                    <td className="p-2.5 text-blue-950 border-r border-slate-200">Nhân sự mỗi giờ</td>
                    {config.hourlySlots.map((s, idx) => (
                      <td key={s.slot} className="p-1.5 text-center border-r border-slate-200 text-blue-800 font-extrabold">
                        {s.nhanSuMoiGio}
                      </td>
                    ))}
                  </tr>

                  {/* Row: Sản phẩm quy đổi cần đạt (= Nhân sự * 1069.125) */}
                  <tr className="bg-emerald-50/50 text-[11px] text-slate-700">
                    <td className="p-2.5 font-bold text-emerald-900 border-r border-slate-200">
                      SP Quy Đổi Cần Đạt
                    </td>
                    {config.hourlySlots.map((s) => {
                      const req = Math.round(s.nhanSuMoiGio * 1069.125);
                      return (
                        <td key={s.slot} className="p-2 text-center border-r border-slate-200 font-mono font-bold text-emerald-700">
                          {req > 0 ? req.toLocaleString('vi-VN') : 0}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleSaveConfigOnly}
            className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5"
          >
            <Save className="w-4 h-4 text-slate-600" />
            <span>Lưu Thông Số Làm Gợi Ý</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Hủy
            </button>

            <button
              type="button"
              onClick={handleExecuteExportExcel}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-md transition-colors cursor-pointer flex items-center space-x-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xác Nhận & Xuất File Excel (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
