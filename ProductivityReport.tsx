import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { FileSpreadsheet, Calendar, Users, Plus, Trash2, Download, RefreshCw, BarChart2, Table, Sparkles, QrCode } from 'lucide-react';
import { Part } from './types';
import { ProductivityExportModal } from './ProductivityExportModal';
import { storageService } from './storage';
import { exportProductivityExcel, ProductivityExportItem } from './exportProductivityExcel';

export interface HourlyReportItem {
  id: string;
  partCode: string;
  partName: string;
  khsx: number; // Kế hoạch sản xuất
  thucHien: number; // Thực hiện (Quét Kitting Smart)
  conLai: number; // Còn lại
  tyLeHoanThanh: number; // % Hoàn thành
  hsqd: number; // Hệ số quy đổi
  hourly: { [slot: string]: number }; // e.g. { "8h-9h": 100, ... }
  tongSanLuong: number;
}

export interface PersonnelSummary {
  chinhThuc: number;
  soanVatTu: number;
  bocTach: number;
  bocXep: number;
  xeNang: number;
  capPhat: number;
}

interface ProductivityReportProps {
  parts: Part[];
  onExportInventoryExcel: () => void;
}

const TIME_SLOTS = [
  '8h-9h',
  '9h-10h',
  '10h-11h',
  '11h-12h',
  '13h-14h',
  '14h-15h',
  '15h-16h',
  '16h-17h',
  '17h-18h',
  '18h-19h',
  '19h-20h',
];

export const ProductivityReport: React.FC<ProductivityReportProps> = ({
  parts,
  onExportInventoryExcel,
}) => {
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 35-day date retention bounds
  const today = new Date();
  const minDateObj = new Date();
  minDateObj.setDate(today.getDate() - 35);
  const minDateStr = minDateObj.toISOString().split('T')[0];
  const maxDateStr = today.toISOString().split('T')[0];

  const handleUpdateKhsx = (partCode: string, valStr: string) => {
    const parsed = parseInt(valStr, 10);
    const newKhsx = isNaN(parsed) ? 0 : Math.max(0, parsed);
    const currentConfig = storageService.getProductivityPersonnelConfig();
    const updatedMap = {
      ...(currentConfig.khsxMap || {}),
      [partCode]: newKhsx,
    };
    storageService.saveProductivityPersonnelConfig({
      ...currentConfig,
      khsxMap: updatedMap,
    });
    setRefreshTrigger((p) => p + 1);
  };

  const personnelConfig = storageService.getProductivityPersonnelConfig();
  const personnel: PersonnelSummary = {
    chinhThuc: personnelConfig.chinhThuc,
    soanVatTu: personnelConfig.soanVatTu,
    bocTach: personnelConfig.bocTach,
    bocXep: personnelConfig.bocXep,
    xeNang: personnelConfig.xeNang,
    capPhat: personnelConfig.capPhat,
  };

  // Fetch factors
  const factors = storageService.getConversionFactors();
  const factorMap = new Map<string, number>();
  factors.forEach((f) => factorMap.set(f.partCode.trim().toUpperCase(), f.hsqd));

  // Fetch scan logs for current reportDate
  const scanLogs = storageService.getKittingScanLogs();
  const dateLogs = scanLogs.filter((log) => log.timestamp.startsWith(reportDate));

  // Aggregate scanned items
  const partMap = new Map<string, HourlyReportItem>();

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
      const khsx = personnelConfig.khsxMap?.[log.partCode] || 550;
      partMap.set(codeKey, {
        id: codeKey,
        partCode: log.partCode,
        partName: log.partName || log.partCode,
        khsx: khsx,
        thucHien: 0,
        conLai: khsx,
        tyLeHoanThanh: 0,
        hsqd: factor,
        hourly: {
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
    item.thucHien += log.quantity;
    item.hourly[slotKey] = (item.hourly[slotKey] || 0) + log.quantity;
    item.tongSanLuong += log.quantity;
    item.conLai = Math.max(0, item.khsx - item.thucHien);
    item.tyLeHoanThanh = item.khsx > 0 ? (item.thucHien / item.khsx) * 100 : 0;
  });

  const items = Array.from(partMap.values());

  // Calculate hourly sums and metrics
  const hourlyTotals: { [slot: string]: number } = {};
  const hourlyConvertedSp: { [slot: string]: number } = {};
  const hourlyRequiredSp: { [slot: string]: number } = {};
  const hourlyNsldRatio: { [slot: string]: number } = {};

  let grandTotalKhsx = 0;
  let grandTotalThucHien = 0;
  let grandTotalConLai = 0;
  let grandTotalSanLuong = 0;
  let grandTotalConvertedSp = 0;
  let grandTotalRequiredSp = 0;

  TIME_SLOTS.forEach((slot) => {
    let slotActual = 0;
    let slotConverted = 0;

    items.forEach((item) => {
      const q = item.hourly[slot] || 0;
      slotActual += q;
      slotConverted += q * item.hsqd;
    });

    hourlyTotals[slot] = slotActual;
    hourlyConvertedSp[slot] = slotConverted;
    grandTotalConvertedSp += slotConverted;

    const slotConfig = personnelConfig.hourlySlots.find((s) => s.slot === slot);
    const nhanSu = slotConfig ? slotConfig.nhanSuMoiGio : 3;
    const required = nhanSu * 1069.125;
    hourlyRequiredSp[slot] = required;
    grandTotalRequiredSp += required;

    if (required > 0 && slotConverted > 0) {
      hourlyNsldRatio[slot] = (slotConverted / required) * 100;
    } else {
      hourlyNsldRatio[slot] = 0;
    }
  });

  items.forEach((i) => {
    grandTotalKhsx += i.khsx;
    grandTotalThucHien += i.thucHien;
    grandTotalConLai += i.conLai;
    grandTotalSanLuong += i.tongSanLuong;
  });

  const grandNsldRatio = grandTotalRequiredSp > 0 ? (grandTotalConvertedSp / grandTotalRequiredSp) * 100 : 0;

  // Prepare chart data for 8h-17h (Image 5)
  const chartData = TIME_SLOTS.slice(0, 8).map((slot) => {
    const sl = hourlyTotals[slot] || 0;
    const ns = Math.round(hourlyNsldRatio[slot] || 0);
    return {
      slot,
      sanLuong: sl,
      nangSuat: ns,
    };
  });

  // Seed Sample Scans for Testing if empty
  const handleSeedSampleScans = () => {
    const todayStr = reportDate;
    const sampleItems = [
      { code: '04-29-00-SHA76219CK-0002', name: 'Lõi lọc Mineral + nối nhanh (TC)', qty: 100, hour: 8 },
      { code: '04-29-00-SHA76219CK-0002', name: 'Lõi lọc Mineral + nối nhanh (TC)', qty: 120, hour: 10 },
      { code: '04-28-03-BRA590N-0006', name: 'Bình áp HK TANK Model 3.2G', qty: 60, hour: 8 },
      { code: '04-28-03-BRA590N-0006', name: 'Bình áp HK TANK Model 3.2G', qty: 120, hour: 9 },
      { code: '04-28-03-BRA590N-0006', name: 'Bình áp HK TANK Model 3.2G', qty: 180, hour: 13 },
      { code: '04-28-00-SHA88113K-0001', name: 'Màng R.O TFC 100GPD', qty: 80, hour: 8 },
      { code: '04-28-00-SHA88113K-0001', name: 'Màng R.O TFC 100GPD', qty: 240, hour: 10 },
      { code: '04-29-00-COC-0001', name: 'Bộ cốc lọc thô màu trong xanh SH', qty: 140, hour: 9 },
      { code: '04-29-00-COC-0001', name: 'Bộ cốc lọc thô màu trong xanh SH', qty: 140, hour: 13 },
    ];

    sampleItems.forEach((s, idx) => {
      const timeISO = `${todayStr}T${s.hour.toString().padStart(2, '0')}:15:00.000Z`;
      storageService.addKittingScanLog({
        partCode: s.code,
        partName: s.name,
        unit: 'Cái',
        quantity: s.qty,
        timestamp: timeISO,
        bufferLocation: 'OUTBUFFER-A1-01',
        operatorName: 'Bóc Tách Viên 01',
      });
    });

    setRefreshTrigger((prev) => prev + 1);
  };

  // Direct export formatted Excel file
  const handleExportDirect = () => {
    const exportItems: ProductivityExportItem[] = items.map((i) => ({
      partCode: i.partCode,
      partName: i.partName,
      khsx: i.khsx,
      actual: i.thucHien,
      conLai: i.conLai,
      tyLeHoanThanh: i.tyLeHoanThanh,
      hsqd: i.hsqd,
      hourlyQty: i.hourly,
      tongSanLuong: i.tongSanLuong,
    }));

    exportProductivityExcel(reportDate, personnelConfig, exportItems);
  };

  return (
    <div className="space-y-8">
      {/* Top Action Bar for Exports */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
              Báo Cáo Năng Suất Lao Động Hằng Ngày & Biểu Đồ Khung Giờ
            </h3>
            <p className="text-xs text-slate-500">
              Chỉ hiển thị linh kiện đã quét Kitting Smart thành công nhập kệ OUTBUFFER.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Inventory Excel Export */}
          <button
            onClick={onExportInventoryExcel}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md transition-all cursor-pointer ring-2 ring-emerald-400/30"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Xuất Báo Cáo Tồn Kho Excel</span>
          </button>

          {/* Productivity Report Export Modal Trigger */}
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md transition-all cursor-pointer ring-2 ring-blue-400/30"
          >
            <Download className="w-4 h-4" />
            <span>Cấu Hình & Xuất Báo Cáo Excel</span>
          </button>
        </div>
      </div>

      <ProductivityExportModal
        isOpen={isExportModalOpen}
        onClose={() => {
          setIsExportModalOpen(false);
          setRefreshTrigger((p) => p + 1);
        }}
      />

      {/* SECTION 1: BIỂU ĐỒ NĂNG SUẤT LAO ĐỘNG TỪNG KHUNG GIỜ (IMAGE 5) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-4 gap-3">
          <div>
            <h4 className="font-black text-slate-800 text-base uppercase tracking-tight flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-600 rounded-full inline-block"></span>
              Biểu Đồ Năng Suất Lao Động Theo Khung Giờ
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Cập nhật tự động theo sản lượng quét bóc tách Kitting Smart trong ngày {reportDate}.
            </p>
          </div>

          <div className="flex items-center space-x-2 bg-slate-100 p-1.5 rounded-xl text-xs font-bold text-slate-700">
            <Calendar className="w-4 h-4 text-slate-500 ml-1" />
            <input
              type="date"
              min={minDateStr}
              max={maxDateStr}
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer text-slate-800"
              title="Xem báo cáo hằng ngày trong vòng 35 ngày"
            />
            <span className="text-[10px] text-slate-500 font-semibold hidden lg:inline bg-slate-200/70 px-2 py-0.5 rounded-md">
              (Lưu 35 ngày)
            </span>
          </div>
        </div>

        {/* Recharts Dual Axis Chart */}
        <div className="h-80 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="slot" tick={{ fontSize: 12, fontWeight: 600, fill: '#475569' }} />
              <YAxis yAxisId="left" orientation="left" stroke="#2563eb" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#ea580c"
                unit="%"
                domain={[0, 180]}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value: any, name: any) => [
                  name === 'nangSuat' ? `${value}%` : value.toLocaleString('vi-VN'),
                  name === 'nangSuat' ? 'Năng suất lao động' : 'Sản lượng theo múi giờ',
                ]}
                contentStyle={{ borderRadius: '12px', borderColor: '#cbd5e1', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
              />
              <Legend
                formatter={(value) =>
                  value === 'sanLuong' ? 'Sản lượng theo múi giờ' : 'Năng suất lao động (%)'
                }
              />
              <Bar yAxisId="left" dataKey="sanLuong" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="nangSuat"
                stroke="#ea580c"
                strokeWidth={3}
                dot={{ r: 5, fill: '#ea580c', strokeWidth: 2, stroke: '#ffffff' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Aligned Data Table under Chart (Exact match to Image 5 matrix) */}
        <div className="overflow-x-auto border border-slate-300 rounded-xl">
          <table className="w-full text-center text-xs border-collapse">
            <tbody>
              <tr className="border-b border-slate-300 bg-slate-50 font-bold text-slate-800">
                <td className="p-2.5 text-left pl-4 font-bold border-r border-slate-300 bg-blue-50 text-blue-900 w-48 whitespace-nowrap">
                  Sản lượng theo múi giờ
                </td>
                {TIME_SLOTS.slice(0, 8).map((slot) => (
                  <td key={slot} className="p-2.5 border-r border-slate-200 font-mono font-bold text-slate-800">
                    {hourlyTotals[slot] ? hourlyTotals[slot].toLocaleString('vi-VN') : '0'}
                  </td>
                ))}
              </tr>
              <tr className="font-bold text-orange-700 bg-orange-50/50">
                <td className="p-2.5 text-left pl-4 font-bold border-r border-slate-300 bg-orange-100 text-orange-900 w-48 whitespace-nowrap">
                  Năng suất lao động
                </td>
                {TIME_SLOTS.slice(0, 8).map((slot) => (
                  <td key={slot} className="p-2.5 border-r border-slate-200 font-mono font-black text-orange-600">
                    {hourlyNsldRatio[slot] ? `${Math.round(hourlyNsldRatio[slot])}%` : '0%'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: BÁO CÁO HẰNG NGÀY & FORM DỮ LIỆU CÓ KHUNG VIỀN ĐẦY ĐỦ (IMAGE 6) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        {/* Top Header Banner matching Image 6 green styling */}
        <div className="bg-emerald-800 text-white p-4 rounded-xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <Table className="w-6 h-6 text-emerald-300" />
            <div>
              <h3 className="font-black text-lg tracking-tight">Báo Cáo Hằng Ngày</h3>
              <p className="text-xs text-emerald-100">
                Danh sách linh kiện được ghi nhận tự động khi quét bóc tách thẻ thùng Kitting Smart thành công.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-emerald-900/80 px-4 py-2 rounded-xl border border-emerald-700">
            <span className="text-xs font-extrabold text-emerald-200 uppercase">Ngày:</span>
            <input
              type="date"
              min={minDateStr}
              max={maxDateStr}
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="bg-white text-slate-900 px-3 py-1 rounded-lg text-xs font-bold border-none cursor-pointer focus:ring-2 focus:ring-emerald-400"
              title="Xem báo cáo hằng ngày trong vòng 35 ngày"
            />
          </div>
        </div>

        {/* Personnel Summary Box matching Image 6 green block */}
        <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-emerald-900 font-black text-xs uppercase tracking-wider">
              <Users className="w-4 h-4 text-emerald-700" />
              <span>Phân Bổ Nhân Sự Sản Xuất Trong Ngày</span>
            </div>
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="text-xs text-emerald-800 font-bold underline hover:text-emerald-950 cursor-pointer"
            >
              Chỉnh sửa phân bổ
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
              <span className="text-[11px] text-emerald-800 font-bold block">Nhân sự chính thức</span>
              <span className="text-lg font-black text-emerald-900">{personnel.chinhThuc}</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
              <span className="text-[11px] text-emerald-800 font-bold block">SOẠN VẬT TƯ</span>
              <span className="text-lg font-black text-emerald-900">{personnel.soanVatTu}</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
              <span className="text-[11px] text-emerald-800 font-bold block">BÓC TÁCH</span>
              <span className="text-lg font-black text-emerald-900">{personnel.bocTach}</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
              <span className="text-[11px] text-emerald-800 font-bold block">BÓC XẾP</span>
              <span className="text-lg font-black text-emerald-900">{personnel.bocXep}</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
              <span className="text-[11px] text-emerald-800 font-bold block">XE NÂNG</span>
              <span className="text-lg font-black text-emerald-900">{personnel.xeNang}</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
              <span className="text-[11px] text-emerald-800 font-bold block">CẤP PHÁT</span>
              <span className="text-lg font-black text-emerald-900">{personnel.capPhat}</span>
            </div>
          </div>
        </div>

        {/* Detailed Report Table with FULL GRID BORDERS matching Image 6 */}
        <div className="overflow-x-auto border border-slate-400 rounded-xl">
          <table className="w-full text-xs text-slate-900 border-collapse border border-slate-400">
            <thead>
              {/* Yellow Table Header Row matching Image 6 */}
              <tr className="bg-yellow-300 text-slate-900 font-bold uppercase text-[11px] border-b border-slate-400">
                <th className="p-2 border border-slate-400 text-left min-w-[220px]">Tên linh kiện</th>
                <th className="p-2 border border-slate-400 text-center w-16">KHSX</th>
                <th className="p-2 border border-slate-400 text-center w-16">Thực Hiện</th>
                <th className="p-2 border border-slate-400 text-center w-16">Còn Lại</th>
                <th className="p-2 border border-slate-400 text-center w-20">Tỉ lệ Hoàn Thành</th>
                <th className="p-2 border border-slate-400 text-center w-16">HSQĐ</th>
                {TIME_SLOTS.map((slot) => (
                  <th key={slot} className="p-2 border border-slate-400 text-center w-16 whitespace-nowrap">
                    {slot}
                  </th>
                ))}
                <th className="p-2 border border-slate-400 text-center w-24">Tổng sản lượng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 bg-white">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={TIME_SLOTS.length + 7} className="p-8 text-center bg-slate-50">
                    <div className="max-w-md mx-auto space-y-3">
                      <QrCode className="w-10 h-10 text-slate-400 mx-auto" />
                      <p className="text-sm font-bold text-slate-700">
                        Chưa có lượt quét Kitting Smart thành công trong ngày {reportDate}
                      </p>
                      <p className="text-xs text-slate-500">
                        Khi người bóc tách thực hiện quét mã QR thẻ thùng Kitting Smart đưa linh kiện lên kệ OUTBUFFER thành công, linh kiện sẽ tự động ghi nhận và xuất hiện tại đây.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2 border border-slate-300 font-semibold text-slate-900 text-left">
                      {item.partName}
                    </td>
                    <td className="p-1 border border-slate-300 text-center font-bold bg-amber-50/50">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={item.khsx || ''}
                        onChange={(e) => handleUpdateKhsx(item.partCode, e.target.value)}
                        className="w-20 text-center font-black bg-white hover:bg-amber-100/80 border border-amber-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30 rounded px-1.5 py-1 text-xs text-blue-900 transition-all shadow-2xs"
                        title="Bấm để điền Kế hoạch sản xuất (KHSX)"
                        placeholder="0"
                      />
                    </td>
                    <td className="p-2 border border-slate-300 text-center font-medium">
                      {item.thucHien.toLocaleString('vi-VN')}
                    </td>
                    <td className="p-2 border border-slate-300 text-center font-medium">
                      {item.conLai === 0 ? '-' : item.conLai.toLocaleString('vi-VN')}
                    </td>
                    <td className="p-2 border border-slate-300 text-center font-bold text-slate-800">
                      {Math.round(item.tyLeHoanThanh)}%
                    </td>
                    <td className="p-2 border border-slate-300 text-center font-mono">
                      {item.hsqd.toString().replace('.', ',')}
                    </td>
                    {TIME_SLOTS.map((slot) => (
                      <td key={slot} className="p-2 border border-slate-300 text-center font-mono">
                        {item.hourly[slot] ? item.hourly[slot].toLocaleString('vi-VN') : ''}
                      </td>
                    ))}
                    <td className="p-2 border border-slate-300 text-center font-extrabold text-slate-900">
                      {item.tongSanLuong.toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))
              )}

              {/* SUMMARY FORMULA ROWS MATCHING IMAGE 6 STYLING */}
              {/* Row 1: Total (Blue bold) */}
              <tr className="bg-blue-50/60 font-black text-blue-700 border-t-2 border-slate-400">
                <td className="p-2.5 border border-slate-400 text-left">Total</td>
                <td className="p-2.5 border border-slate-400 text-center">{grandTotalKhsx.toLocaleString('vi-VN')}</td>
                <td className="p-2.5 border border-slate-400 text-center">{grandTotalThucHien.toLocaleString('vi-VN')}</td>
                <td className="p-2.5 border border-slate-400 text-center">{grandTotalConLai <= 0 ? '-' : grandTotalConLai.toLocaleString('vi-VN')}</td>
                <td className="p-2.5 border border-slate-400 text-center">
                  {grandTotalKhsx > 0 ? `${Math.round((grandTotalThucHien / grandTotalKhsx) * 100)}%` : '0%'}
                </td>
                <td className="p-2.5 border border-slate-400 text-center"></td>
                {TIME_SLOTS.map((slot) => (
                  <td key={slot} className="p-2.5 border border-slate-400 text-center font-mono">
                    {hourlyTotals[slot] ? hourlyTotals[slot].toLocaleString('vi-VN') : '0'}
                  </td>
                ))}
                <td className="p-2.5 border border-slate-400 text-center">{grandTotalSanLuong.toLocaleString('vi-VN')}</td>
              </tr>

              {/* Row 2: Sản phẩm quy đổi (Blue bold) */}
              <tr className="bg-blue-50/40 font-black text-blue-700">
                <td className="p-2.5 border border-slate-400 text-left">Sản phẩm quy đổi</td>
                <td colSpan={5} className="p-2.5 border border-slate-400 text-center"></td>
                {TIME_SLOTS.map((slot) => (
                  <td key={slot} className="p-2.5 border border-slate-400 text-center font-mono">
                    {hourlyConvertedSp[slot] > 0
                      ? Math.round(hourlyConvertedSp[slot]).toLocaleString('vi-VN')
                      : '-'}
                  </td>
                ))}
                <td className="p-2.5 border border-slate-400 text-center">{Math.round(grandTotalConvertedSp).toLocaleString('vi-VN')}</td>
              </tr>

              {/* Row 3: Năng suất lao động (Bold Green) */}
              <tr className="bg-emerald-50 font-black text-emerald-800">
                <td className="p-2.5 border border-slate-400 text-left">Năng suất lao động</td>
                <td colSpan={5} className="p-2.5 border border-slate-400 text-center"></td>
                {TIME_SLOTS.map((slot) => (
                  <td key={slot} className="p-2.5 border border-slate-400 text-center font-mono text-emerald-700">
                    {hourlyNsldRatio[slot] > 0 ? `${Math.round(hourlyNsldRatio[slot])}%` : '-'}
                  </td>
                ))}
                <td className="p-2.5 border border-slate-400 text-center text-emerald-800">{grandNsldRatio > 0 ? `${Math.round(grandNsldRatio)}%` : '0%'}</td>
              </tr>

              {/* Row 4: NS CHÍNH THỨC (Bold Red) */}
              <tr className="bg-red-50/40 font-black text-red-600">
                <td className="p-2.5 border border-slate-400 text-left">NS CHÍNH THỨC</td>
                <td colSpan={5} className="p-2.5 border border-slate-400 text-center"></td>
                {personnelConfig.hourlySlots.map((s) => (
                  <td key={s.slot} className="p-2.5 border border-slate-400 text-center font-mono">
                    {s.nsChinhThuc}
                  </td>
                ))}
                <td className="p-2.5 border border-slate-400 text-center">
                  {personnelConfig.hourlySlots.reduce((sum, s) => sum + s.nsChinhThuc, 0)}
                </td>
              </tr>

              {/* Row 5: NS THỜI VỤ (Bold Red) */}
              <tr className="bg-red-50/40 font-black text-red-600">
                <td className="p-2.5 border border-slate-400 text-left">NS THỜI VỤ</td>
                <td colSpan={5} className="p-2.5 border border-slate-400 text-center"></td>
                {personnelConfig.hourlySlots.map((s) => (
                  <td key={s.slot} className="p-2.5 border border-slate-400 text-center font-mono">
                    {s.nsThoiVu}
                  </td>
                ))}
                <td className="p-2.5 border border-slate-400 text-center">
                  {personnelConfig.hourlySlots.reduce((sum, s) => sum + s.nsThoiVu, 0)}
                </td>
              </tr>

              {/* Row 6: Nhân sự mỗi giờ (Green Highlight #92d050) */}
              <tr className="bg-lime-300 font-black text-slate-900 border-t border-slate-400">
                <td className="p-2.5 border border-slate-400 text-left">Nhân sự mỗi giờ</td>
                <td colSpan={5} className="p-2.5 border border-slate-400 text-center"></td>
                {personnelConfig.hourlySlots.map((s) => (
                  <td key={s.slot} className="p-2.5 border border-slate-400 text-center font-mono">
                    {s.nhanSuMoiGio}
                  </td>
                ))}
                <td className="p-2.5 border border-slate-400 text-center">
                  {(
                    personnelConfig.hourlySlots.reduce((sum, s) => sum + s.nhanSuMoiGio, 0) /
                    (personnelConfig.hourlySlots.length || 1)
                  ).toFixed(2).replace('.', ',')}
                </td>
              </tr>

              {/* Row 7: Số lượng sản phẩm quy đổi cần đạt được */}
              <tr className="bg-white font-extrabold text-slate-900">
                <td className="p-2.5 border border-slate-400 text-left">Số lượng sản phẩm quy đổi cần đạt được</td>
                <td colSpan={5} className="p-2.5 border border-slate-400 text-center"></td>
                {TIME_SLOTS.map((slot) => (
                  <td key={slot} className="p-2.5 border border-slate-400 text-center font-mono">
                    {hourlyRequiredSp[slot] > 0
                      ? Math.round(hourlyRequiredSp[slot]).toLocaleString('vi-VN')
                      : '0'}
                  </td>
                ))}
                <td className="p-2.5 border border-slate-400 text-center">{Math.round(grandTotalRequiredSp).toLocaleString('vi-VN')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
