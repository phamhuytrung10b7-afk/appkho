import React from 'react';
import { Part, Transaction, ViewTab } from './types';
import { storageService } from './storage';
import { Package, Layers, AlertTriangle, XCircle } from 'lucide-react';
import { ProductivityReport } from './ProductivityReport';

interface DashboardViewProps {
  parts: Part[];
  transactions: Transaction[];
  onNavigateTab: (tab: ViewTab) => void;
  onOpenBinCard: (part: Part) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  parts,
  onNavigateTab,
}) => {
  const totalParts = parts.length;
  const totalStockQuantity = parts.reduce((sum, p) => sum + p.currentStock, 0);

  const lowStockParts = parts.filter((p) => p.currentStock > 0 && p.currentStock <= p.minStock);
  const outOfStockParts = parts.filter((p) => p.currentStock === 0);

  const handleExportInventoryExcel = () => {
    storageService.exportPartsToExcel(parts, 'bao_cao_tong_hop_ton_kho.xlsx');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* TOP STATS BENTO ROW (IMAGE 2 - PRESERVED) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Parts */}
        <div
          onClick={() => onNavigateTab('parts')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
        >
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">TỔNG MÃ LINH KIỆN</p>
            <p className="text-2xl font-black text-slate-800 mt-1">{totalParts.toLocaleString('vi-VN')}</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* Total Stock */}
        <div
          onClick={() => onNavigateTab('parts')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
        >
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">TỔNG SỐ LƯỢNG TỒN</p>
            <p className="text-2xl font-black text-slate-800 mt-1">{totalStockQuantity.toLocaleString('vi-VN')}</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        {/* Low Stock Warning */}
        <div
          onClick={() => onNavigateTab('parts')}
          className="bg-white p-5 rounded-2xl border border-amber-200 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between group bg-amber-50/20"
        >
          <div>
            <p className="text-amber-800 text-xs font-bold uppercase tracking-wider">SẮP HẾT HÀNG</p>
            <p className="text-2xl font-black text-amber-600 mt-1">{lowStockParts.length}</p>
          </div>
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Out of Stock Alert */}
        <div
          onClick={() => onNavigateTab('parts')}
          className="bg-white p-5 rounded-2xl border border-red-200 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between group bg-red-50/20"
        >
          <div>
            <p className="text-red-800 text-xs font-bold uppercase tracking-wider">ĐÃ HẾT HÀNG</p>
            <p className="text-2xl font-black text-red-600 mt-1">{outOfStockParts.length}</p>
          </div>
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <XCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* REPLACED SECTIONS (IMAGE 3 & 4 DELETED) -> INSERT PRODUCTIVITY REPORT (IMAGE 5 & 6) */}
      <ProductivityReport
        parts={parts}
        onExportInventoryExcel={handleExportInventoryExcel}
      />
    </div>
  );
};

