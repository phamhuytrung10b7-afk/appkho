import React, { useState } from 'react';
import { AppSettings, ModelBOM } from './types';
import { storageService } from './storage';
import { ConversionFactorManager } from './ConversionFactorManager';
import { getSupabaseCredentials, saveSupabaseCredentials, getActiveSupabaseClient } from './supabase';
import { egressStats } from './supabaseStorage';
import { parseFactoryBOMExcel, downloadSampleBOMFile } from './bomExcelParser';
import {
  Settings,
  Building2,
  Save,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  Users,
  FileText,
  FileCode,
  Plus,
  Trash2,
  Database,
  Truck,
  Calculator,
  MapPin,
  CloudUpload,
  RefreshCw,
  Copy,
  Check,
  Server,
  Key,
  Globe,
  Code,
  Zap,
  ShieldCheck,
  Activity,
  HardDrive,
  FileSpreadsheet,
  Eye,
  Info,
  X,
  Search,
  Layers,
  Table,
} from 'lucide-react';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onRefreshAll: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onRefreshAll,
}) => {
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [warehouseName, setWarehouseName] = useState(settings.warehouseName);
  const [address, setAddress] = useState(settings.address);
  const [managerName, setManagerName] = useState(settings.managerName);
  const [phone, setPhone] = useState(settings.phone);

  // Preset lists
  const [staffList, setStaffList] = useState<string[]>(settings.staffList || []);
  const [newStaff, setNewStaff] = useState('');

  const [stockInReasons, setStockInReasons] = useState<string[]>(settings.stockInReasons || []);
  const [newInReason, setNewInReason] = useState('');

  const [stockOutPurposes, setStockOutPurposes] = useState<string[]>(settings.stockOutPurposes || []);
  const [newOutPurpose, setNewOutPurpose] = useState('');

  const [productionOrders, setProductionOrders] = useState<string[]>(settings.productionOrders || []);
  const [newLSX, setNewLSX] = useState('');

  const [assemblyLines, setAssemblyLines] = useState<string[]>(settings.assemblyLines || []);
  const [newAssemblyLine, setNewAssemblyLine] = useState('');

  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'conversion' | 'warehouse_map' | 'supabase'>('general');
  const [locations, setLocations] = useState<{id: string; name: string; description?: string;}[]>(settings.locations || []);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationDesc, setNewLocationDesc] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<{id: string; name: string; description?: string;} | null>(null);

  // Supabase state
  const initialCreds = getSupabaseCredentials();
  const [supabaseUrl, setSupabaseUrl] = useState(initialCreds.url);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(initialCreds.anonKey);
  const [supabaseSyncing, setSupabaseSyncing] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // BOM Management State
  const [viewingBOM, setViewingBOM] = useState<ModelBOM | null>(null);
  const [showBOMTemplateModal, setShowBOMTemplateModal] = useState(false);
  const [bomItemSearchTerm, setBomItemSearchTerm] = useState('');

  const handleSaveSupabaseConfig = () => {
    saveSupabaseCredentials(supabaseUrl.trim(), supabaseAnonKey.trim());
    setMessage({ type: 'success', text: 'Đã lưu cấu hình kết nối Supabase thành công!' });
  };

  const handleSyncFromSupabase = async () => {
    setSupabaseSyncing(true);
    setMessage(null);
    const result = await storageService.syncWithSupabase();
    setSupabaseSyncing(false);
    if (result.success) {
      setMessage({ type: 'success', text: result.message });
      onRefreshAll();
    } else {
      setMessage({ type: 'error', text: result.message });
    }
  };

  const handlePushToSupabase = async () => {
    setSupabaseSyncing(true);
    setMessage(null);
    const result = await storageService.pushAllToSupabase();
    setSupabaseSyncing(false);
    if (result.success) {
      setMessage({ type: 'success', text: result.message });
    } else {
      setMessage({ type: 'error', text: result.message });
    }
  };

  const sqlSchemaText = `-- SUPABASE SQL SCHEMA DÀNH CHO THE KHO SMART WMS
CREATE TABLE IF NOT EXISTS public.thekho_app_data (
    key VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.thekho_app_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access on thekho_app_data" ON public.thekho_app_data FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update/delete access on thekho_app_data" ON public.thekho_app_data FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.parts (
    id VARCHAR(255) PRIMARY KEY,
    code VARCHAR(100) NOT NULL,
    name TEXT NOT NULL,
    group_name VARCHAR(100) DEFAULT 'Khác',
    unit VARCHAR(50) DEFAULT 'Cái',
    current_stock NUMERIC(15, 2) DEFAULT 0,
    min_stock NUMERIC(15, 2) DEFAULT 0,
    max_stock NUMERIC(15, 2) DEFAULT 0,
    location TEXT DEFAULT 'Kho chính',
    locations JSONB DEFAULT '[]'::jsonb,
    unit_price NUMERIC(15, 2) DEFAULT 0,
    supplier TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on parts" ON public.parts FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.transactions (
    id VARCHAR(255) PRIMARY KEY,
    part_id VARCHAR(255) REFERENCES public.parts(id) ON DELETE CASCADE,
    part_code VARCHAR(100) NOT NULL,
    part_name TEXT NOT NULL,
    unit VARCHAR(50) DEFAULT 'Cái',
    type VARCHAR(10) NOT NULL CHECK (type IN ('IN', 'OUT')),
    quantity NUMERIC(15, 2) NOT NULL,
    date TIMESTAMPTZ DEFAULT NOW(),
    person VARCHAR(255) NOT NULL,
    production_order VARCHAR(255) DEFAULT '',
    reason_or_purpose TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    location_id VARCHAR(255) DEFAULT '',
    stock_before NUMERIC(15, 2) DEFAULT 0,
    stock_after NUMERIC(15, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.settings (
    id VARCHAR(100) PRIMARY KEY DEFAULT 'app_settings',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);
`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlSchemaText);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };


  // Computed: get parts currently in the selected location
  const partsInLocation = selectedLocation
    ? storageService.getPartsAtLocation(storageService.getParts(), selectedLocation.name)
    : [];

  const handleAddLocation = () => {
    if (!newLocationName.trim()) return;
    const newLoc = { id: `loc-${Date.now()}`, name: newLocationName.trim(), description: newLocationDesc.trim() };
    const updated = [...locations, newLoc];
    setLocations(updated);
    storageService.saveSettings({ ...settings, locations: updated });
    setNewLocationName('');
    setNewLocationDesc('');
  };

  const handleDeleteLocation = (id: string) => {
    const updated = locations.filter(loc => loc.id !== id);
    setLocations(updated);
    storageService.saveSettings({ ...settings, locations: updated });
    if (selectedLocation?.id === id) setSelectedLocation(null);
  };


  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [pendingRestoreContent, setPendingRestoreContent] = useState<string | null>(null);
  const [pendingRestoreFileName, setPendingRestoreFileName] = useState<string>('');

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: AppSettings = {
      companyName: companyName.trim(),
      warehouseName: warehouseName.trim(),
      address: address.trim(),
      managerName: managerName.trim(),
      phone: phone.trim(),
      staffList,
      stockInReasons,
      stockOutPurposes,
      productionOrders,
      assemblyLines,
      locations: locations.length > 0 ? locations : (settings.locations || []),
    };
    storageService.saveSettings(updated);
    onUpdateSettings(updated);
    setMessage({ type: 'success', text: 'Đã lưu tất cả thông tin cài đặt thành công!' });
  };

  // Staff helpers
  const handleAddStaff = () => {
    if (!newStaff.trim()) return;
    if (staffList.includes(newStaff.trim())) {
      setMessage({ type: 'error', text: 'Tên người thực hiện này đã tồn tại trong danh sách!' });
      return;
    }
    setStaffList([...staffList, newStaff.trim()]);
    setNewStaff('');
  };
  const handleDeleteStaff = (idx: number) => {
    setStaffList(staffList.filter((_, i) => i !== idx));
  };

  // Stock In Reason helpers
  const handleAddInReason = () => {
    if (!newInReason.trim()) return;
    setStockInReasons([...stockInReasons, newInReason.trim()]);
    setNewInReason('');
  };
  const handleDeleteInReason = (idx: number) => {
    setStockInReasons(stockInReasons.filter((_, i) => i !== idx));
  };

  // Stock Out Purpose helpers
  const handleAddOutPurpose = () => {
    if (!newOutPurpose.trim()) return;
    setStockOutPurposes([...stockOutPurposes, newOutPurpose.trim()]);
    setNewOutPurpose('');
  };
  const handleDeleteOutPurpose = (idx: number) => {
    setStockOutPurposes(stockOutPurposes.filter((_, i) => i !== idx));
  };

  // Production Order helpers
  const handleAddLSX = () => {
    if (!newLSX.trim()) return;
    setProductionOrders([...productionOrders, newLSX.trim()]);
    setNewLSX('');
  };
  const handleDeleteLSX = (idx: number) => {
    setProductionOrders(productionOrders.filter((_, i) => i !== idx));
  };

  // Assembly Line helpers
  const handleAddAssemblyLine = () => {
    if (!newAssemblyLine.trim()) return;
    if (assemblyLines.includes(newAssemblyLine.trim())) {
      setMessage({ type: 'error', text: 'Tên vị trí bàn máy này đã tồn tại trong danh sách!' });
      return;
    }
    setAssemblyLines([...assemblyLines, newAssemblyLine.trim()]);
    setNewAssemblyLine('');
  };
  const handleDeleteAssemblyLine = (idx: number) => {
    setAssemblyLines(assemblyLines.filter((_, i) => i !== idx));
  };

  const handleBackup = () => {
    const jsonStr = storageService.backupData();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_kho_linh_kien_${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ type: 'success', text: 'Đã tải xuống tệp sao lưu dữ liệu JSON thành công!' });
  };

  const handleRestoreFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPendingRestoreFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      setPendingRestoreContent(content);
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const confirmRestoreFile = () => {
    if (!pendingRestoreContent) return;
    const success = storageService.restoreData(pendingRestoreContent);
    if (success) {
      setMessage({ type: 'success', text: 'Khôi phục dữ liệu từ tệp JSON thành công!' });
      onRefreshAll();
    } else {
      setMessage({ type: 'error', text: 'Tệp sao lưu không hợp lệ hoặc bị hỏng!' });
    }
    setPendingRestoreContent(null);
    setPendingRestoreFileName('');
  };

  const confirmResetSample = () => {
    storageService.resetToSampleData();
    setMessage({ type: 'success', text: 'Đã khôi phục dữ liệu mẫu ban đầu thành công!' });
    setIsResetModalOpen(false);
    onRefreshAll();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Title */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-3">
        <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">CÀI ĐẶT HỆ THỐNG & DANH MỤC LỌC NHANH</h2>
          <p className="text-xs text-slate-500">
            Cấu hình nhân sự, lý do nhập/xuất kho, mã LSX và tiêu đề in thẻ kho.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center ${
            message.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-600 shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      {/* Subtab Navigation Bar */}
      <div className="flex border-b border-slate-200 space-x-2 bg-slate-100/80 p-1.5 rounded-2xl">
        <button
          type="button"
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
            activeTab === 'general'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Settings className="w-4 h-4 text-blue-600" />
          <span>Cài Đặt Chung</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('conversion')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
            activeTab === 'conversion'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Calculator className="w-4 h-4 text-emerald-600" />
          <span>Cấu Hình Hệ Số Quy Đổi (HSQĐ)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('warehouse_map')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
            activeTab === 'warehouse_map'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <MapPin className="w-4 h-4 text-purple-600" />
          <span>Sơ Đồ Vị Trí Kệ Kho</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('supabase')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
            activeTab === 'supabase'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <CloudUpload className="w-4 h-4 text-sky-600" />
          <span>Cơ Sở Dữ Liệu Supabase</span>
        </button>

      </div>

      {activeTab === 'conversion' && <ConversionFactorManager />}

      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* Warehouse Header Config Form */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <h3 className="font-bold text-slate-800 text-sm flex items-center">
            <Building2 className="w-4 h-4 text-blue-600 mr-2" />
            Thông Tin Doanh Nghiệp & Nhà Kho (In trên Thẻ Kho)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tên Công Ty / Doanh Nghiệp</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tên Nhà Kho / Phân Xưởng</label>
              <input
                type="text"
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-blue-700 focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Địa Chỉ Nhà Kho</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Họ Tên Thủ Kho / Quản Lý Kho</label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* CÀI ĐẶT NGƯỜI THỰC HIỆN / THỦ KHO */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm flex items-center">
              <Users className="w-4 h-4 text-emerald-600 mr-2" />
              Cài Đặt Danh Sách Người Thực Hiện (Người Nhập / Người Xuất Kho)
            </h3>
            <span className="text-xs text-slate-400 font-medium">{staffList.length} nhân sự</span>
          </div>
          <p className="text-xs text-slate-500">
            Giúp chọn nhanh trong phiếu Nhập / Xuất kho mà không cần gõ lại. Dễ dàng thêm 1 hoặc 2 thủ kho mặc định.
          </p>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={newStaff}
              onChange={(e) => setNewStaff(e.target.value)}
              placeholder="Thêm tên nhân sự (VD: Nguyễn Văn A (Thủ kho)...)"
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-hidden"
            />
            <button
              type="button"
              onClick={handleAddStaff}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center space-x-1 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Nhân Sự</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
            {staffList.map((st, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
              >
                <span>{st}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteStaff(idx)}
                  className="p-1 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                  title="Xóa khỏi danh sách"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* CÀI ĐẶT LÝ DO NHẬP KHO & MỤC ĐÍCH XUẤT KHO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Stock In Reasons */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center">
              <FileText className="w-4 h-4 text-emerald-600 mr-2" />
              Cài Đặt Lý Do Nhập Kho
            </h3>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={newInReason}
                onChange={(e) => setNewInReason(e.target.value)}
                placeholder="Thêm lý do nhập kho mới..."
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-hidden"
              />
              <button
                type="button"
                onClick={handleAddInReason}
                className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
              >
                + Thêm
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {stockInReasons.map((r, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
                >
                  <span className="truncate pr-2">{r}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteInReason(idx)}
                    className="p-1 text-slate-400 hover:text-red-600 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Stock Out Purposes */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center">
              <FileText className="w-4 h-4 text-blue-600 mr-2" />
              Cài Đặt Mục Đích Xuất Kho
            </h3>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={newOutPurpose}
                onChange={(e) => setNewOutPurpose(e.target.value)}
                placeholder="Thêm mục đích xuất kho..."
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
              <button
                type="button"
                onClick={handleAddOutPurpose}
                className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
              >
                + Thêm
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {stockOutPurposes.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
                >
                  <span className="truncate pr-2">{p}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteOutPurpose(idx)}
                    className="p-1 text-slate-400 hover:text-red-600 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CÀI ĐẶT MÃ LỆNH SẢN XUẤT (LSX) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm flex items-center">
              <FileCode className="w-4 h-4 text-purple-600 mr-2" />
              Cài Đặt Mã Lệnh Sản Xuất (LSX Mặc Định Để Chọn Trực Tiếp)
            </h3>
            <span className="text-xs text-slate-400 font-medium">{productionOrders.length} mã LSX</span>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={newLSX}
              onChange={(e) => setNewLSX(e.target.value)}
              placeholder="Thêm mã LSX mới (VD: LSX-2026-HL300)..."
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-blue-700 focus:ring-2 focus:ring-purple-500 outline-hidden"
            />
            <button
              type="button"
              onClick={handleAddLSX}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shrink-0"
            >
              + Thêm LSX
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {productionOrders.map((lsx, idx) => (
              <div
                key={idx}
                className="flex items-center space-x-2 px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-900 rounded-xl text-xs font-mono font-bold"
              >
                <span>{lsx}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteLSX(idx)}
                  className="text-purple-400 hover:text-red-600"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* CÀI ĐẶT DÂY CHUYỀN / BÀN MÁY NHẬN HÀNG */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm flex items-center">
              <Truck className="w-4 h-4 text-amber-600 mr-2" />
              Cài Đặt Dây Chuyền / Bàn Máy Yêu Cầu Cấp Hàng (Vị Trí Nhận Hàng)
            </h3>
            <span className="text-xs text-slate-400 font-medium">{assemblyLines.length} vị trí</span>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={newAssemblyLine}
              onChange={(e) => setNewAssemblyLine(e.target.value)}
              placeholder="Thêm vị trí/bàn máy mới (VD: Bàn Lắp Ráp Bo Mạch Line 5)..."
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-500 outline-hidden"
            />
            <button
              type="button"
              onClick={handleAddAssemblyLine}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shrink-0"
            >
              + Thêm Vị Trí
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {assemblyLines.map((line, idx) => (
              <div
                key={idx}
                className="flex items-center space-x-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-950 rounded-xl text-xs font-bold"
              >
                <span>{line}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteAssemblyLine(idx)}
                  className="text-amber-500 hover:text-rose-600 font-black cursor-pointer ml-1"
                  title="Xóa vị trí này"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* QUẢN LÝ ĐỊNH MỨC MODEL (BOM) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-800 text-sm flex items-center">
                <FileCode className="w-4 h-4 text-pink-600 mr-2" />
                Quản Lý Định Mức Model (BOM)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cấu trúc Excel 5 cột: Cột A (lvl), Cột B (Item), Cột C (Description), Cột D (Trống), Cột E (Quantity định mức). Điền tên Model rồi tải file lên.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs bg-pink-50 text-pink-700 px-2.5 py-1 rounded-full font-bold border border-pink-200">
                {storageService.getModelBOMs().length} Models
              </span>
            </div>
          </div>

          {/* Quick Actions: Download Sample & View Layout */}
          <div className="flex flex-wrap items-center gap-2 p-3 bg-pink-50/60 border border-pink-100 rounded-xl">
            <button
              type="button"
              onClick={() => downloadSampleBOMFile()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Tải File Excel Mẫu BOM (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => setShowBOMTemplateModal(true)}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 shadow-xs cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-pink-600" />
              <span>Xem Cấu Trúc Cột File Mẫu</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              id="modelBOMName"
              placeholder="Nhập Tên Model (VD: SHA76210KL, SHB9101, RMVSHA76639LA...)..."
              className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-pink-700 focus:ring-2 focus:ring-pink-500 outline-hidden"
            />
            <label className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shrink-0 flex items-center justify-center space-x-1.5 shadow-xs">
              <Upload className="w-4 h-4" />
              <span>Chọn File Excel BOM Tải Lên</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const nameInput = document.getElementById('modelBOMName') as HTMLInputElement;
                  const manualName = nameInput ? nameInput.value.trim() : '';
                  const file = e.target.files?.[0];
                  if (!file) return;

                  const reader = new FileReader();
                  reader.onload = (evt) => {
                    try {
                      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                      const currentParts = storageService.getParts();
                      const allowedPartCodes = currentParts.map((p) => p.code);
                      const parsed = parseFactoryBOMExcel(data, manualName, file.name, allowedPartCodes);

                      if (parsed.acceptedCount > 0) {
                        const bom: ModelBOM = {
                          id: 'bom-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                          name: parsed.modelName,
                          items: parsed.items,
                          createdAt: new Date().toISOString(),
                        };
                        storageService.saveModelBOM(bom);

                        let successMsg = `🎉 Thành công! Đã lưu định mức Model [${parsed.modelName}] với ${parsed.acceptedCount} linh kiện hợp lệ.`;
                        if (parsed.skippedUnmatchedCount > 0) {
                          const sampleSkipped = parsed.unmatchedCodes.slice(0, 3).join(', ');
                          successMsg += ` (Đã tự động bỏ qua ${parsed.skippedUnmatchedCount} linh kiện chưa có trong kho: ${sampleSkipped}${parsed.unmatchedCodes.length > 3 ? '...' : ''})`;
                        }

                        setMessage({
                          type: 'success',
                          text: successMsg,
                        });
                        if (nameInput) nameInput.value = '';
                        onRefreshAll();
                      } else if (parsed.skippedUnmatchedCount > 0) {
                        setMessage({
                          type: 'error',
                          text: `⚠️ Model [${parsed.modelName}]: Có ${parsed.skippedUnmatchedCount} mã linh kiện trong file nhưng KHÔNG CÓ mã nào khớp với Danh mục Linh Kiện trong kho! Hệ thống chỉ nhận linh kiện đã được khai báo trong kho. Vui lòng thêm linh kiện vào kho trước.`,
                        });
                      } else {
                        setMessage({
                          type: 'error',
                          text: 'Không tìm thấy dữ liệu linh kiện hợp lệ trong file Excel. Vui lòng kiểm tra lại dòng tiêu đề hoặc nhấn "Tải File Mẫu BOM" để đối chiếu!',
                        });
                      }
                    } catch (err: any) {
                      console.error('Lỗi khi đọc file BOM Excel:', err);
                      setMessage({
                        type: 'error',
                        text: `Lỗi khi đọc file Excel: ${err?.message || 'Định dạng file không tương thích'}`,
                      });
                    }
                  };
                  reader.readAsArrayBuffer(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <div className="flex flex-col gap-2 pt-1 max-h-72 overflow-y-auto">
            {storageService.getModelBOMs().length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                Chưa có Model BOM nào. Nhấn <strong className="text-pink-600">"Tải File Excel Mẫu BOM"</strong> hoặc tải lên file BOM cố định của nhà máy để bắt đầu.
              </div>
            ) : (
              storageService.getModelBOMs().map((bom) => (
                <div
                  key={bom.id}
                  className="flex items-center justify-between p-3.5 bg-pink-50/70 border border-pink-200/80 text-pink-900 rounded-xl text-xs hover:border-pink-300 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <strong className="text-sm font-mono font-bold text-slate-800">{bom.name}</strong>
                      <span className="text-[10px] bg-pink-200/70 text-pink-800 font-bold px-2 py-0.5 rounded-full font-mono">
                        {bom.items.length} LK
                      </span>
                    </div>
                    <p className="text-[11px] text-pink-700/80">
                      Tạo lúc: {bom.createdAt ? new Date(bom.createdAt).toLocaleDateString('vi-VN') : 'Mặc định'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setViewingBOM(bom)}
                      className="px-2.5 py-1.5 bg-white text-slate-700 hover:text-pink-700 hover:bg-pink-100/50 border border-pink-200 rounded-lg text-xs font-semibold shadow-xs flex items-center space-x-1 cursor-pointer transition-colors"
                      title="Xem danh sách linh kiện trong BOM"
                    >
                      <Eye className="w-3.5 h-3.5 text-pink-600" />
                      <span>Xem LK</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Bạn có chắc muốn xóa Model BOM [${bom.name}]?`)) {
                          storageService.deleteModelBOM(bom.id);
                          onRefreshAll();
                          setMessage({ type: 'success', text: `Đã xóa Model BOM ${bom.name}` });
                        }
                      }}
                      className="p-1.5 bg-white text-slate-400 hover:text-red-600 hover:bg-red-50 border border-pink-200 rounded-lg shadow-xs cursor-pointer transition-colors"
                      title="Xóa định mức này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            className="flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold shadow-lg transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Lưu Tất Cả Cài Đặt Hệ Thống</span>
          </button>
        </div>
      </form>

      {/* BACKUP & RESTORE SECTION */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="font-bold text-slate-800 text-sm flex items-center">
          <Database className="w-4 h-4 text-emerald-600 mr-2" />
          Sao Lưu & Khôi Phục Dữ Liệu An Toàn
        </h3>
        <p className="text-xs text-slate-500">
          Toàn bộ dữ liệu linh kiện, lịch sử thẻ kho và phiếu kiểm kê có thể sao lưu thành tệp JSON để cất giữ hoặc chuyển đổi máy tính.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {/* Export Backup */}
          <button
            onClick={handleBackup}
            className="flex flex-col items-center justify-center p-5 bg-slate-50 border border-slate-300 hover:bg-slate-100 rounded-2xl transition-all cursor-pointer group"
          >
            <Download className="w-8 h-8 text-emerald-600 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-slate-800">Sao Lưu Dữ Liệu (Backup)</span>
            <span className="text-[10px] text-slate-500 mt-0.5">Tải tệp .JSON về máy</span>
          </button>

          {/* Import Restore */}
          <label className="flex flex-col items-center justify-center p-5 bg-slate-50 border border-slate-300 hover:bg-slate-100 rounded-2xl transition-all cursor-pointer group">
            <Upload className="w-8 h-8 text-blue-600 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-slate-800">Khôi Phục (Restore)</span>
            <span className="text-[10px] text-slate-500 mt-0.5">Chọn tệp .JSON từ máy</span>
            <input type="file" accept=".json" onChange={handleRestoreFileSelected} className="hidden" />
          </label>

          {/* Reset to sample */}
          <button
            type="button"
            onClick={() => setIsResetModalOpen(true)}
            className="flex flex-col items-center justify-center p-5 bg-slate-50 border border-slate-300 hover:bg-slate-100 rounded-2xl transition-all cursor-pointer group"
          >
            <RotateCcw className="w-8 h-8 text-amber-600 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-slate-800">Khôi Phục Dữ Liệu Mẫu</span>
            <span className="text-[10px] text-slate-500 mt-0.5">Reset về linh kiện mặc định</span>
          </button>
        </div>
      </div>

      {/* Custom Reset Sample Confirmation Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4">
            <div className="flex items-center space-x-3 text-amber-600">
              <div className="p-3 bg-amber-100 rounded-xl">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Xác Nhận Khôi Phục Dữ Liệu Mẫu</h3>
                <p className="text-xs text-slate-500">Đặt lại toàn bộ dữ liệu hệ thống</p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 leading-relaxed space-y-1">
              <p className="font-bold text-amber-900">⚠️ Bạn có chắc chắn muốn làm mới lại dữ liệu?</p>
              <p>
                Toàn bộ dữ liệu linh kiện hiện tại, lịch sử nhập xuất, phiếu kiểm kê và lô mốc Cont sẽ bị xóa sạch và reset về danh sách linh kiện điện tử mẫu ban đầu.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={confirmResetSample}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl cursor-pointer shadow-md transition-colors flex items-center space-x-1"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Đồng Ý Khôi Phục Dữ Liệu Mẫu</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Restore File Confirmation Modal */}
      {pendingRestoreContent && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4">
            <div className="flex items-center space-x-3 text-blue-600">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Xác Nhận Khôi Phục Tệp Sao Lưu</h3>
                <p className="text-xs text-slate-500 font-mono">{pendingRestoreFileName}</p>
              </div>
            </div>

            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-950 leading-relaxed">
              Dữ liệu từ tệp JSON này sẽ ghi đè lên kho dữ liệu hiện tại. Bạn có muốn tiếp tục không?
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPendingRestoreContent(null);
                  setPendingRestoreFileName('');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={confirmRestoreFile}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl cursor-pointer shadow-md transition-colors"
              >
                Xác Nhận Khôi Phục File
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      )}

      {activeTab === 'warehouse_map' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">Sơ Đồ Vị Trí Lưu Trữ</h3>
            <p className="text-xs text-slate-500">Tạo các khoang, kệ (VD: A1, B2) như sơ đồ ghế máy bay để quản lý vị trí nhập linh kiện.</p>
            
            <div className="flex items-center space-x-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <input
                type="text"
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="Tên vị trí (VD: Kệ A1)"
                className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-hidden"
                onKeyDown={(e) => e.key === 'Enter' && handleAddLocation()}
              />
              <input
                type="text"
                value={newLocationDesc}
                onChange={(e) => setNewLocationDesc(e.target.value)}
                placeholder="Mô tả (Không bắt buộc)"
                className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-hidden"
                onKeyDown={(e) => e.key === 'Enter' && handleAddLocation()}
              />
              <button
                type="button"
                onClick={handleAddLocation}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Thêm Vị Trí
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-4">
              {locations.map(loc => (
                <div 
                  key={loc.id}
                  onClick={() => setSelectedLocation(loc)}
                  className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center justify-center text-center ${selectedLocation?.id === loc.id ? 'border-emerald-500 bg-emerald-50 shadow-md transform scale-105' : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50'}`}
                >
                  <div className="text-lg font-black text-slate-800 mb-1">{loc.name}</div>
                  {loc.description && <div className="text-[10px] text-slate-500">{loc.description}</div>}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteLocation(loc.id); }}
                    className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-red-100 hover:bg-red-500 text-red-600 hover:text-white rounded-full transition-colors opacity-0 hover:opacity-100"
                    style={{ opacity: selectedLocation?.id === loc.id ? 1 : undefined }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Details for selected location */}
          {selectedLocation && (
             <div className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-xs space-y-4">
               <h3 className="font-bold text-emerald-800 text-sm">Đang chứa tại: {selectedLocation.name}</h3>
               {partsInLocation.length === 0 ? (
                 <p className="text-xs text-slate-500 italic">Chưa có linh kiện nào ở vị trí này.</p>
               ) : (
                 <div className="overflow-x-auto">
                   <table className="w-full text-left border-collapse">
                     <thead>
                       <tr className="bg-slate-50 text-slate-600 text-[11px] uppercase tracking-wider border-b border-slate-200">
                         <th className="p-3 font-semibold rounded-tl-xl">Mã LK</th>
                         <th className="p-3 font-semibold">Tên Linh Kiện</th>
                         <th className="p-3 font-semibold">Số Lượng Tồn</th>
                         <th className="p-3 font-semibold rounded-tr-xl">Đơn Vị</th>
                       </tr>
                     </thead>
                     <tbody className="text-xs divide-y divide-slate-100">
                       {partsInLocation.map(({ part: p, locationQty }) => (
                         <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                           <td className="p-3 font-mono font-bold text-slate-700">{p.code}</td>
                           <td className="p-3 text-slate-900 font-semibold">{p.name}</td>
                           <td className="p-3 font-black text-emerald-600">{locationQty.toLocaleString('vi-VN')}</td>
                           <td className="p-3 text-slate-500">{p.unit}</td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               )}
             </div>
          )}
        </div>
      )}

      {/* SUPABASE CLOUD DATABASE CONFIGURATION & MANAGEMENT VIEW */}
      {activeTab === 'supabase' && (
        <div className="space-y-6">
          {/* Connection Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
                  <Server className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">CẤU HÌNH KẾT NỐI SUPABASE CLOUD</h3>
                  <p className="text-xs text-slate-500">
                    Lưu trữ dữ liệu tập trung, đồng bộ thời gian thực giữa nhiều máy và thủ kho.
                  </p>
                </div>
              </div>
              <div>
                {getActiveSupabaseClient().isConfigured ? (
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <span className="w-2 h-2 mr-2 bg-emerald-500 rounded-full animate-pulse"></span>
                    Đã Kết Nối Supabase
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    <span className="w-2 h-2 mr-2 bg-amber-500 rounded-full"></span>
                    Chưa Cấu Hình (Đang Dùng LocalStorage)
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
                  <Globe className="w-3.5 h-3.5 mr-1 text-sky-600" />
                  SUPABASE URL (Ví dụ: https://xyzcompany.supabase.co)
                </label>
                <input
                  type="text"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
                  <Key className="w-3.5 h-3.5 mr-1 text-amber-600" />
                  SUPABASE ANON KEY (Mã khóa Public / Anonymous Key)
                </label>
                <input
                  type="password"
                  value={supabaseAnonKey}
                  onChange={(e) => setSupabaseAnonKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={handleSaveSupabaseConfig}
                className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shadow-sm cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Lưu Cấu Hình Kết Nối</span>
              </button>

              <button
                type="button"
                onClick={handleSyncFromSupabase}
                disabled={supabaseSyncing}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${supabaseSyncing ? 'animate-spin' : ''}`} />
                <span>Tải & Đồng Bộ Từ Supabase Về Máy</span>
              </button>

              <button
                type="button"
                onClick={handlePushToSupabase}
                disabled={supabaseSyncing}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <CloudUpload className="w-4 h-4" />
                <span>Đẩy Toàn Bộ Dữ Liệu App Lên Supabase</span>
              </button>
            </div>
          </div>

          {/* Smart Local Cache & Egress Saver Live Monitor Card */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 text-white p-6 rounded-2xl border border-blue-500/30 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30">
                  <Zap className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-white tracking-wide flex items-center space-x-2">
                    <span>HỆ THỐNG SMART CACHE & GIẢM THIỂU BĂNG THÔNG EGRESS</span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold rounded-full border border-emerald-500/30">
                      GÓI FREE TỐI ƯU
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400">
                    Cơ chế kiểm tra nhẹ <code className="text-blue-300 font-mono">updated_at (~50 Bytes)</code> giúp tiết kiệm hơn 99% dung lượng Egress tải về máy trạm.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    // Clear cache timestamps
                    Object.keys(localStorage).forEach((k) => {
                      if (k.startsWith('_thekho_cache_ts_')) {
                        localStorage.removeItem(k);
                      }
                    });
                    setMessage({ type: 'success', text: 'Đã xóa toàn bộ Timestamp Cache! Lần tải tới sẽ tải fresh data từ Supabase.' });
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                  title="Xóa cache metadata để test lại quá trình tải lại"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Xóa Timestamp Cache</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800/80">
                <div className="text-[11px] text-slate-400 font-bold mb-1 flex items-center space-x-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Số Lần Trúng Cache:</span>
                </div>
                <div className="text-xl font-black text-emerald-400 font-mono">
                  {egressStats.cacheHits} <span className="text-xs font-normal text-slate-400">lần</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Dùng cache máy, không tốn Egress</div>
              </div>

              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800/80">
                <div className="text-[11px] text-slate-400 font-bold mb-1 flex items-center space-x-1">
                  <Activity className="w-3.5 h-3.5 text-blue-400" />
                  <span>Số Lần Tải Mới:</span>
                </div>
                <div className="text-xl font-black text-blue-400 font-mono">
                  {egressStats.cacheMisses} <span className="text-xs font-normal text-slate-400">lần</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Chỉ tải khi có thay đổi thực sự</div>
              </div>

              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800/80">
                <div className="text-[11px] text-slate-400 font-bold mb-1 flex items-center space-x-1">
                  <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Ước Tính Tiết Kiệm:</span>
                </div>
                <div className="text-xl font-black text-emerald-400 font-mono">
                  {(egressStats.estimatedBytesSaved / 1024).toFixed(1)} <span className="text-xs font-normal text-slate-400">KB</span>
                </div>
                <div className="text-[10px] text-emerald-400/80 mt-1">Băng thông Egress đã tiết kiệm</div>
              </div>

              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800/80">
                <div className="text-[11px] text-slate-400 font-bold mb-1 flex items-center space-x-1">
                  <Zap className="w-3.5 h-3.5 text-sky-400" />
                  <span>Tỷ Lệ Tiết Kiệm:</span>
                </div>
                <div className="text-xl font-black text-sky-400 font-mono">
                  {egressStats.cacheHits + egressStats.cacheMisses > 0
                    ? `${((egressStats.cacheHits / (egressStats.cacheHits + egressStats.cacheMisses)) * 100).toFixed(0)}%`
                    : '100%'}
                </div>
                <div className="text-[10px] text-sky-400/80 mt-1">Tỷ lệ tránh tải thừa payload</div>
              </div>
            </div>
          </div>

          {/* SQL Editor Code Block Card */}
          <div className="bg-slate-900 text-slate-100 p-6 rounded-2xl shadow-md space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Code className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm text-white">CÂU LỆNH SQL TAO BẢNG (SUPABASE SQL EDITOR SCHEMA)</h3>
              </div>
              <button
                type="button"
                onClick={handleCopySql}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Đã Sao Chép!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sao Chép Mã SQL</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Hãy sao chép đoạn mã SQL dưới đây và dán vào mục <strong className="text-amber-300">SQL Editor</strong> trong trang quản trị Supabase của bạn, sau đó nhấn <strong className="text-emerald-400 font-mono">Run</strong> để khởi tạo tự động toàn bộ cấu trúc bảng dữ liệu:
            </p>

            <pre className="p-4 bg-slate-950 rounded-xl text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-80 border border-slate-800 leading-relaxed">
              {sqlSchemaText}
            </pre>
          </div>
        </div>
      )}


      {/* MODAL: XEM CHI TIẾT LINH KIỆN TRONG BOM */}
      {viewingBOM && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-pink-700 to-rose-700 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <FileCode className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-base sm:text-lg tracking-tight">ĐỊNH MỨC MODEL: {viewingBOM.name}</h3>
                  <p className="text-xs text-pink-100 font-medium">
                    Tổng cộng: <strong className="text-white font-mono">{viewingBOM.items.length}</strong> mã linh kiện
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setViewingBOM(null);
                  setBomItemSearchTerm('');
                }}
                className="p-2 hover:bg-white/20 text-white rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center space-x-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={bomItemSearchTerm}
                  onChange={(e) => setBomItemSearchTerm(e.target.value)}
                  placeholder="Tìm kiếm theo mã linh kiện hoặc tên linh kiện..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-pink-500 outline-hidden"
                />
              </div>
              <span className="text-xs text-slate-500 whitespace-nowrap font-medium">
                {
                  viewingBOM.items.filter(
                    (i) =>
                      i.partCode.toLowerCase().includes(bomItemSearchTerm.toLowerCase()) ||
                      i.partName.toLowerCase().includes(bomItemSearchTerm.toLowerCase())
                  ).length
                }{' '}
                / {viewingBOM.items.length} mã
              </span>
            </div>

            {/* Modal Body Table */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-12 text-center text-slate-400">STT</th>
                      <th className="p-3 font-mono">Mã Linh Kiện (Item)</th>
                      <th className="p-3">Tên / Mô Tả Linh Kiện (Description)</th>
                      <th className="p-3 text-right">Định Mức (Qty)</th>
                      <th className="p-3 text-center">ĐVT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewingBOM.items
                      .filter(
                        (i) =>
                          !bomItemSearchTerm ||
                          i.partCode.toLowerCase().includes(bomItemSearchTerm.toLowerCase()) ||
                          i.partName.toLowerCase().includes(bomItemSearchTerm.toLowerCase())
                      )
                      .map((item, idx) => (
                        <tr key={idx} className="hover:bg-pink-50/40 transition-colors">
                          <td className="p-3 text-center font-semibold text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-mono font-bold text-pink-700">{item.partCode}</td>
                          <td className="p-3 text-slate-700 font-medium">{item.partName}</td>
                          <td className="p-3 text-right font-mono font-black text-slate-900">
                            {item.quantity.toLocaleString('vi-VN', { maximumFractionDigits: 4 })}
                          </td>
                          <td className="p-3 text-center">
                            <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-semibold">
                              {item.unit || 'Cái'}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setViewingBOM(null);
                  setBomItemSearchTerm('');
                }}
                className="px-5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: XEM CẤU TRÚC FILE MẪU BOM CHUẨN NHÀ MÁY */}
      {showBOMTemplateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-700 to-teal-700 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <FileSpreadsheet className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-base sm:text-lg tracking-tight">CẤU TRÚC FILE EXCEL BOM CỐ ĐỊNH NHÀ MÁY</h3>
                  <p className="text-xs text-emerald-100 font-medium">
                    Hệ thống tự động bỏ qua 5 dòng đầu & trích xuất đúng 4 cột chính
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBOMTemplateModal(false)}
                className="p-2 hover:bg-white/20 text-white rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
              {/* Column Mapping Guide */}
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-sm text-emerald-900 flex items-center">
                  <Info className="w-4 h-4 text-emerald-600 mr-2" />
                  Quy Tắc Đọc Dữ Liệu Excel BOM (Chuẩn 5 Cột)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-emerald-100 space-y-1.5">
                    <div className="font-bold text-slate-800 flex items-center space-x-1">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[11px]">1</span>
                      <span>Cột 1 (A): <code className="font-mono text-emerald-700">lvl</code> (STT)</span>
                    </div>
                    <p className="text-slate-600 pl-6 leading-relaxed">
                      Số thứ tự cấp linh kiện hoặc thứ tự dòng (1, 2, 3...).
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-emerald-100 space-y-1.5">
                    <div className="font-bold text-slate-800 flex items-center space-x-1">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[11px]">2</span>
                      <span>Cột 2 (B): <code className="font-mono text-emerald-700">Item</code> (Mã Linh Kiện)</span>
                    </div>
                    <p className="text-slate-600 pl-6 leading-relaxed">
                      Mã linh kiện trong kho (VD: <code className="bg-slate-100 px-1 rounded text-slate-800 font-bold">04-29-07-SHA76210KL-0007</code>, <code className="bg-slate-100 px-1 rounded text-slate-800 font-bold">VLP-BDDHX-K19X50</code>).
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-emerald-100 space-y-1.5">
                    <div className="font-bold text-slate-800 flex items-center space-x-1">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[11px]">3</span>
                      <span>Cột 3 (C): <code className="font-mono text-emerald-700">Description</code> (Tên Linh Kiện)</span>
                    </div>
                    <p className="text-slate-600 pl-6 leading-relaxed">
                      Tên hoặc mô tả chi tiết linh kiện (VD: <code className="text-slate-800">Adapter NS2415V3C</code>).
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-emerald-100 space-y-1.5">
                    <div className="font-bold text-slate-800 flex items-center space-x-1">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[11px]">4</span>
                      <span>Cột 4 (D): [Trống / Bỏ qua] & Cột 5 (E): <code className="font-mono text-emerald-700">Quantity</code></span>
                    </div>
                    <p className="text-slate-600 pl-6 leading-relaxed">
                      <strong>Cột E (Quantity):</strong> Định mức số lượng (hỗ trợ số nguyên, số thập phân <code className="bg-slate-100 px-1 rounded font-bold">1,00</code>, <code className="bg-slate-100 px-1 rounded font-bold">0,01</code>, <code className="bg-slate-100 px-1 rounded font-bold">6,00</code>...).
                    </p>
                  </div>

                  <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 space-y-1.5 md:col-span-2">
                    <div className="font-bold text-amber-900 flex items-center space-x-1">
                      <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center text-[11px]">5</span>
                      <span>⚡ Thao Tác & Quy Tắc Kiểm Soát Dữ Liệu</span>
                    </div>
                    <p className="text-amber-800 pl-6 leading-relaxed">
                      • <strong>Điền Tên Model:</strong> Bạn nhập tên Model vào ô nhập liệu (VD: <code className="bg-amber-100 px-1 rounded font-mono font-bold">SHA76210KL</code>, <code className="bg-amber-100 px-1 rounded font-mono font-bold">SHB9101</code>...) rồi bấm chọn file tải lên cho nhanh.<br />
                      • <strong>Chỉ nhận linh kiện có trong kho:</strong> Hệ thống tự động đối chiếu mã Item với danh sách linh kiện trong kho, tự động lọc bỏ các mã chưa khai báo để đảm bảo dữ liệu xuất kho chính xác 100%.
                    </p>
                  </div>
                </div>
              </div>

              {/* Visual Table Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-800 flex items-center">
                    <Table className="w-4 h-4 text-emerald-600 mr-2" />
                    Xem Trước Bảng Dữ Liệu Mẫu (Khớp Ảnh Nhà Máy)
                  </h4>
                  <span className="text-[11px] text-slate-400 italic">Hiển thị mẫu 10 dòng đầu</span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-xs text-xs">
                  <table className="w-full text-left whitespace-nowrap">
                    {/* Header rows representation */}
                    <thead className="bg-slate-100 border-b border-slate-200">
                      <tr className="bg-slate-200/70 text-slate-500 text-[10px]">
                        <th className="p-2 text-center">A (Col 1)</th>
                        <th className="p-2">B (Col 2)</th>
                        <th className="p-2">C (Col 3)</th>
                        <th className="p-2 text-slate-400">D (Col 4)</th>
                        <th className="p-2 text-right">E (Col 5)</th>
                      </tr>
                      <tr className="text-slate-800 font-bold border-b border-slate-300">
                        <th className="p-2.5 text-center text-slate-500">lvl</th>
                        <th className="p-2.5 font-mono text-pink-700">Item</th>
                        <th className="p-2.5 text-slate-800">Description</th>
                        <th className="p-2.5 text-slate-400 italic">[Trống]</th>
                        <th className="p-2.5 text-right font-mono text-emerald-700">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      <tr className="hover:bg-slate-50">
                        <td className="p-2 text-center text-slate-400">6</td>
                        <td className="p-2 font-bold text-pink-700">04-29-07-SHA76210KL-0007</td>
                        <td className="p-2 font-sans text-slate-700">Adapter NS2415V3C</td>
                        <td className="p-2 text-slate-300"></td>
                        <td className="p-2 text-right font-bold text-emerald-700">1,00</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-2 text-center text-slate-400">5</td>
                        <td className="p-2 font-bold text-pink-700">VLP-BDDHX-K19X50</td>
                        <td className="p-2 font-sans text-slate-700">Băng dính định hình màu xanh</td>
                        <td className="p-2 text-slate-300"></td>
                        <td className="p-2 text-right font-bold text-emerald-700">0,01</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-2 text-center text-slate-400">4</td>
                        <td className="p-2 font-bold text-pink-700">VLP-BDTT-4.8</td>
                        <td className="p-2 font-sans text-slate-700">Băng dính trong to 4.8 cm</td>
                        <td className="p-2 text-slate-300"></td>
                        <td className="p-2 text-right font-bold text-emerald-700">0,02</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-2 text-center text-slate-400">3</td>
                        <td className="p-2 font-bold text-pink-700">02-35-06-SHB9101-0005</td>
                        <td className="p-2 font-sans text-slate-700">Băng dính xốp dưới mặt bếp 9</td>
                        <td className="p-2 text-slate-300"></td>
                        <td className="p-2 text-right font-bold text-emerald-700">0,10</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-2 text-center text-slate-400">2</td>
                        <td className="p-2 font-bold text-pink-700">VLP-BDX-XANH</td>
                        <td className="p-2 font-sans text-slate-700">Băng dính xốp xanh</td>
                        <td className="p-2 text-slate-300"></td>
                        <td className="p-2 text-right font-bold text-emerald-700">0,02</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-2 text-center text-slate-400">1</td>
                        <td className="p-2 font-bold text-pink-700">VLP-BTQMTD-12</td>
                        <td className="p-2 font-sans text-slate-700">Băng tan quấn máy tự động kl</td>
                        <td className="p-2 text-slate-300"></td>
                        <td className="p-2 text-right font-bold text-emerald-700">0,01</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-2 text-center text-slate-400">2</td>
                        <td className="p-2 font-bold text-pink-700">04-29-07-SHA76210KL-0005</td>
                        <td className="p-2 font-sans text-slate-700">Bầu nóng 1.5L</td>
                        <td className="p-2 text-slate-300"></td>
                        <td className="p-2 text-right font-bold text-emerald-700">1,00</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-2 text-center text-slate-400">3</td>
                        <td className="p-2 font-bold text-pink-700">04-28-03-BRA590N-0006</td>
                        <td className="p-2 font-sans text-slate-700">Bình áp HK TANK Model 3.2G</td>
                        <td className="p-2 text-slate-300"></td>
                        <td className="p-2 text-right font-bold text-emerald-700">1,00</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-2 text-center text-slate-400">4</td>
                        <td className="p-2 font-bold text-pink-700">04-29-07-SHA76213CK-0008</td>
                        <td className="p-2 font-sans text-slate-700">Block ASV25H</td>
                        <td className="p-2 text-slate-300"></td>
                        <td className="p-2 text-right font-bold text-emerald-700">1,00</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-2 text-center text-slate-400">5</td>
                        <td className="p-2 font-bold text-pink-700">04-28-03-SHA8838K-0002</td>
                        <td className="p-2 font-sans text-slate-700">Bọ nhựa PP 15mm</td>
                        <td className="p-2 text-slate-300"></td>
                        <td className="p-2 text-right font-bold text-emerald-700">2,00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => downloadSampleBOMFile()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải Ngay File Mẫu .XLSX Này</span>
              </button>
              <button
                type="button"
                onClick={() => setShowBOMTemplateModal(false)}
                className="px-5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
