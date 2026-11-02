import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Part, Transaction, AppSettings, ViewTab, KittingQueueItem, BufferLocationMap, MaterialCallRequest, UserAccount } from './types';
import { storageService } from './storage';
import { Menu, Boxes, LogOut, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';

import { Sidebar } from './Sidebar';
import { ElectronicBinCardModal } from './ElectronicBinCardModal';
import { PartModal } from './PartModal';
import { ConfirmModal } from './ConfirmModal';

import { DashboardView } from './DashboardView';
import { PartsListView } from './PartsListView';
import { StockInView } from './StockInView';
import { StockOutView } from './StockOutView';
import { KittingView } from './KittingView';
import { BufferMapView } from './BufferMapView';
import { AndonCallView } from './AndonCallView';
import { BinCardHistoryView } from './BinCardHistoryView';
import { WarehouseMapView } from './WarehouseMapView';
import { SettingsView } from './SettingsView';
import { UserManagementView } from './UserManagementView';
import { LoginView } from './LoginView';
import { NgWarehouseView } from './NgWarehouseView';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => storageService.getCurrentUser());
  const [currentTab, setCurrentTab] = useState<ViewTab>('dashboard');
  const [parts, setParts] = useState<Part[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [kittingQueue, setKittingQueue] = useState<KittingQueueItem[]>([]);
  const [bufferLocations, setBufferLocations] = useState<BufferLocationMap[]>([]);
  const [materialCalls, setMaterialCalls] = useState<MaterialCallRequest[]>([]);
  const [settings, setSettings] = useState<AppSettings>(storageService.getSettings());
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoadingCloud, setIsLoadingCloud] = useState(true);
  const [cloudConnectionError, setCloudConnectionError] = useState<string | null>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(new Date());
  const [syncToast, setSyncToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Automatically adjust currentTab to the user's allowedTabs if currentTab is forbidden
  useEffect(() => {
    if (currentUser && currentUser.allowedTabs && currentUser.allowedTabs.length > 0) {
      const allowed = currentUser.allowedTabs;
      const isAllowed =
        allowed.includes(currentTab) ||
        (allowed.includes('andon' as any) &&
          (currentTab === 'andon_request' || currentTab === 'andon_calling' || currentTab === 'andon_delivering' || currentTab === 'andon_history'));
      if (!isAllowed) {
        setCurrentTab(allowed[0]);
      }
    }
  }, [currentUser, currentTab]);

  // Logout handler
  const handleLogout = () => {
    storageService.logout();
    setCurrentUser(null);
  };

  // Bin Card Modal State
  const [selectedBinCardPart, setSelectedBinCardPart] = useState<Part | null>(null);
  const [isBinCardOpen, setIsBinCardOpen] = useState(false);

  // Part Add/Edit Modal State
  const [partToEdit, setPartToEdit] = useState<Part | null>(null);
  const [isPartModalOpen, setIsPartModalOpen] = useState(false);

  // Delete Confirm Modal State
  const [partToDelete, setPartToDelete] = useState<Part | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Apply state from local storage cache
  const applyLocalState = useCallback(() => {
    const reconciled = storageService.reconcileAllPartsStock();
    setParts(reconciled.length > 0 ? reconciled : storageService.getParts());
    setTransactions(storageService.getTransactions());
    setKittingQueue(storageService.getKittingQueue());
    setBufferLocations(storageService.getBufferLocations());
    setMaterialCalls(storageService.getMaterialCallRequests());
    setSettings(storageService.getSettings());
  }, []);

  const lastCloudSyncTimestamp = useRef<number>(0);

  // Fetch fresh data from Supabase Cloud via pure REST API (Zero Realtime WebSocket Egress)
  const syncCloudAndState = useCallback(
    async (forceFetch: boolean = false, isInitial: boolean = false) => {
      try {
        // Trước khi gọi tải toàn bộ data từ Supabase Cloud, kiểm tra xem Cloud có dữ liệu mới không
        if (!forceFetch && !isInitial) {
          const hasUpdates = await storageService.checkCloudHasUpdates();
          lastCloudSyncTimestamp.current = Date.now();
          if (!hasUpdates) {
            // Dữ liệu Cloud không thay đổi và forceFetch = false, tiếp tục dùng dữ liệu Local State/LocalStorage mà không tải mới
            return;
          }
        }

        const { parts: cloudParts, transactions: cloudTxs } = await storageService.fetchInitialDataFromCloud(forceFetch);
        lastCloudSyncTimestamp.current = Date.now();
        const reconciled = storageService.reconcileAllPartsStock();
        setParts(reconciled.length > 0 ? reconciled : cloudParts);
        setTransactions(cloudTxs);
        setKittingQueue(storageService.getKittingQueue());
        setBufferLocations(storageService.getBufferLocations());
        setMaterialCalls(storageService.getMaterialCallRequests());
        setSettings(storageService.getSettings());
        setCloudConnectionError(null);
        const activeUser = storageService.getCurrentUser();
        if (activeUser) {
          setCurrentUser(activeUser);
        }
      } catch (err: any) {
        if (isInitial) {
          setCloudConnectionError(
            '⚠️ MẤT KẾT NỐI SUPABASE CLOUD: Không thể kết nối máy chủ Supabase. Dữ liệu chưa thể đồng bộ Cloud. Vui lòng kiểm tra lại mạng hoặc cấu hình kết nối trong Cài Đặt!'
          );
        }
        applyLocalState();
      }
    },
    [applyLocalState]
  );

  // Refresh data: Instantly update React state on user actions via Write-Through architecture
  // Triệt tiêu 100% câu lệnh SELECT rác chạy ngầm làm phình to log và cạn kiệt Egress của Supabase
  const refreshData = useCallback(() => {
    applyLocalState();
  }, [applyLocalState]);

  // Nút Làm Mới & Đồng Bộ Supabase Cloud (Thao tác chủ động On-demand từ người dùng)
  const handleManualSyncCloud = useCallback(async () => {
    if (isSyncingCloud) return;
    try {
      setIsSyncingCloud(true);
      setCloudConnectionError(null);
      await syncCloudAndState(true, false);
      const now = new Date();
      setLastSyncTime(now);
      const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setSyncToast({
        message: `Đã đồng bộ thành công dữ liệu mới nhất từ Supabase Cloud (${timeStr})!`,
        type: 'success',
      });
      setTimeout(() => {
        setSyncToast(null);
      }, 3500);
    } catch (err: any) {
      const errorMsg = err?.message || 'Không thể đồng bộ dữ liệu với máy chủ Supabase';
      setSyncToast({
        message: `Lỗi đồng bộ: ${errorMsg}`,
        type: 'error',
      });
      setTimeout(() => {
        setSyncToast(null);
      }, 5000);
    } finally {
      setIsSyncingCloud(false);
    }
  }, [isSyncingCloud, syncCloudAndState]);

  const tabTitles: Record<ViewTab, { title: string; subtitle: string }> = {
    dashboard: { title: 'Trang chủ Tổng quan', subtitle: 'Báo cáo chỉ số tồn kho & năng suất' },
    parts: { title: 'Danh sách linh kiện', subtitle: 'Quản lý danh mục & định mức tồn kho' },
    stock_in: { title: 'Nhập kho', subtitle: 'Quét QR và nhập linh kiện vào vị trí kệ' },
    stock_out: { title: 'Xuất kho (FIFO)', subtitle: 'Quét QR xuất kho theo nguyên tắc vào trước ra trước' },
    ng_warehouse: { title: 'Kho NG (Hàng Lỗi)', subtitle: 'Theo dõi & xử lý linh kiện lỗi tách biệt Kho Chính' },
    warehouse_map: { title: 'Sơ đồ kho (Vị trí)', subtitle: 'Trực quan hóa vị trí ô kệ và linh kiện' },
    kitting: { title: 'Khu Bóc Tách (Kitting)', subtitle: 'Bóc tách thùng nguyên và chuyển sang kệ Outbuffer' },
    buffer: { title: 'Sơ Đồ Kệ OUTBUFFER', subtitle: 'Quản lý sức chứa và linh kiện sẵn sàng cấp' },
    andon: { title: 'Sản xuất gọi hàng (Andon)', subtitle: 'Hệ thống gọi vật tư tự động cho dây chuyền' },
    andon_request: { title: '1. Sản xuất gọi hàng (Andon)', subtitle: 'Tạo yêu cầu cấp linh kiện đến dây chuyền' },
    andon_calling: { title: '2. Đơn yêu cầu đang gọi', subtitle: 'Danh sách đơn hàng chờ kho xử lý' },
    andon_delivering: { title: '3. Đang trên đường vận chuyển', subtitle: 'Đang vận chuyển cấp hàng đến dây chuyền' },
    andon_history: { title: '4. Lịch sử cấp hàng (Andon)', subtitle: 'Nhật ký các lần cấp hàng hoàn thành' },
    bin_card: { title: 'Thẻ kho / Nhật ký LK', subtitle: 'Tra cứu thẻ kho điện tử & lịch sử giao dịch' },
    reports: { title: 'Báo cáo thống kê', subtitle: 'Báo cáo năng suất & biến động tồn kho' },
    settings: { title: 'Cài đặt & Dữ liệu', subtitle: 'Cấu hình hệ thống, kho hàng & kết nối Supabase' },
    users: { title: 'Quản lý tài khoản', subtitle: 'Phân quyền người dùng & quản trị viên' },
  };

  // Initial load on App Mount (Fetch on start + Auto cleanup 35-day localStorage)
  useEffect(() => {
    let isMounted = true;

    async function initCloudData() {
      try {
        setIsLoadingCloud(true);
        // TỰ ĐỘNG DỌN DẸP LOCALSTORAGE (CHÍNH SÁCH 35 NGÀY):
        // Chạy khi khởi động app để kiểm tra và dọn dẹp lịch sử / scan logs > 35 ngày
        // Đảm bảo dung lượng luôn dưới 5MB an toàn, không bao giờ bị QuotaExceededError
        const cleanupMetrics = storageService.cleanupOldLocalStorageRecords(35);
        if (cleanupMetrics.bytesFreed > 0) {
          console.info(
            `[Storage Auto-Cleanup 35 Ngày] Đã giải phóng ${(cleanupMetrics.bytesFreed / 1024).toFixed(1)} KB bộ nhớ.`,
            cleanupMetrics
          );
        }
        await syncCloudAndState(true, true);
      } catch {
        // Handled in syncCloudAndState
      } finally {
        if (isMounted) {
          setIsLoadingCloud(false);
        }
      }
    }

    initCloudData();

    return () => {
      isMounted = false;
    };
  }, [syncCloudAndState]);

  // Lắng nghe sự kiện cập nhật Sơ đồ Kệ Outbuffer từ các module nghiệp vụ nội bộ
  useEffect(() => {
    const handleBufferMapUpdated = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setBufferLocations(e.detail);
      }
    };
    window.addEventListener('thekho:buffer_map_updated', handleBufferMapUpdated);
    return () => {
      window.removeEventListener('thekho:buffer_map_updated', handleBufferMapUpdated);
    };
  }, []);

  // Open Electronic Bin Card for a part
  const handleOpenBinCard = (part: Part) => {
    // Refresh part object from storage and reconcile with transaction ledger
    const reconciled = storageService.reconcilePartStock(part.id);
    const latestPart = reconciled || storageService.getPartById(part.id) || part;
    setSelectedBinCardPart(latestPart);
    setIsBinCardOpen(true);
  };

  // Handle Save Part (Add or Edit)
  const handleSavePart = (
    partData: Omit<Part, 'id' | 'createdAt' | 'updatedAt'>,
    editId?: string
  ) => {
    if (editId) {
      storageService.updatePart(editId, partData);
    } else {
      storageService.addPart(partData);
    }
    refreshData();
  };

  // Handle Delete Part
  const handleConfirmDelete = () => {
    if (partToDelete) {
      storageService.deletePart(partToDelete.id);
      setIsDeleteModalOpen(false);
      setPartToDelete(null);
      refreshData();
    }
  };

  // Badge counts
  const lowStockCount = parts.filter((p) => p.currentStock > 0 && p.currentStock <= p.minStock).length;
  const outOfStockCount = parts.filter((p) => p.currentStock === 0).length;
  const pendingKittingCount = kittingQueue.filter((k) => k.status === 'PENDING_KITTING').length;
  const callingAndonCount = materialCalls.filter((m) => m.status === 'CALLING').length;
  const deliveringAndonCount = materialCalls.filter((m) => m.status === 'DELIVERING').length;
  const ngCount = parts.filter((p) => {
    const qty = typeof p.qtyNg === 'number' ? p.qtyNg : Number((p as any).qty_ng || p.qtyNg) || 0;
    return qty > 0;
  }).length;

  if (isLoadingCloud) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white p-6 space-y-5">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
          <Boxes className="w-6 h-6 text-blue-400 absolute animate-pulse" />
        </div>
        <div className="text-center space-y-1.5 max-w-sm">
          <h2 className="text-base font-extrabold text-slate-100 tracking-tight">Đang tải dữ liệu từ Supabase Cloud...</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Hệ thống đang đồng bộ kho hàng và lịch sử giao dịch trực tiếp từ máy chủ...
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView onLoginSuccess={(u) => setCurrentUser(u)} warehouseName={settings.warehouseName} />;
  }

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-800 antialiased overflow-hidden">
      {/* Left Navigation Sidebar (Desktop + Mobile Drawer) */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        lowStockCount={lowStockCount}
        outOfStockCount={outOfStockCount}
        pendingKittingCount={pendingKittingCount}
        callingAndonCount={callingAndonCount}
        deliveringAndonCount={deliveringAndonCount}
        ngCount={ngCount}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        currentUser={currentUser}
        onLogout={handleLogout}
        onSyncCloud={handleManualSyncCloud}
        isSyncingCloud={isSyncingCloud}
        lastSyncTime={lastSyncTime}
      />

      {/* Main Right Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Mobile Header Bar (Visible on mobile, hidden on desktop) */}
        <div className="md:hidden bg-white border-b border-slate-200 px-3 sm:px-4 py-2.5 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
          <div className="flex items-center space-x-2 sm:space-x-2.5 min-w-0">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl border border-slate-200 cursor-pointer shrink-0"
              title="Mở Menu Navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-1.5 min-w-0">
              <div className="w-6 h-6 sm:w-7 sm:h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold text-xs shrink-0">
                <Boxes className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <span className="font-extrabold text-slate-800 text-xs sm:text-sm tracking-tight truncate max-w-[130px] xs:max-w-[170px]">
                {settings.warehouseName || 'KHO LINH KIỆN'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            {/* NÚT LÀM MỚI / ĐỒNG BỘ SUPABASE TRÊN ĐIỆN THOẠI */}
            <button
              type="button"
              onClick={handleManualSyncCloud}
              disabled={isSyncingCloud}
              className={`px-2.5 py-1.5 rounded-xl border flex items-center space-x-1.5 text-xs font-bold transition-all cursor-pointer ${
                isSyncingCloud
                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                  : 'bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border-blue-200 shadow-2xs'
              }`}
              title="Làm mới và đồng bộ dữ liệu Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin text-blue-600' : 'text-blue-700'}`} />
              <span className="hidden xs:inline">{isSyncingCloud ? 'Đang tải...' : 'Làm mới'}</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl border border-rose-200 flex items-center space-x-1 text-xs font-bold cursor-pointer"
              title="Đăng xuất khỏi hệ thống"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Desktop Top Header Bar (Hidden on Mobile) */}
        <div className="hidden md:flex bg-white border-b border-slate-200 px-6 py-2.5 items-center justify-between sticky top-0 z-30 shadow-2xs">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center font-bold">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-extrabold text-slate-900 text-sm tracking-tight">
                  {tabTitles[currentTab]?.title || settings.warehouseName || 'KHO LINH KIỆN'}
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {currentTab}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                {tabTitles[currentTab]?.subtitle || settings.companyName || 'Hệ thống Quản lý Kho Thẻ kho Điện tử'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Supabase Status Pill */}
            <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-semibold text-slate-600 text-[11px]">
                Supabase:{' '}
                {lastSyncTime
                  ? `Đồng bộ lúc ${lastSyncTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                  : 'Sẵn sàng'}
              </span>
            </div>

            {/* NÚT LÀM MỚI / ĐỒNG BỘ SUPABASE TRÊN MÁY TÍNH */}
            <button
              type="button"
              onClick={handleManualSyncCloud}
              disabled={isSyncingCloud}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 border shadow-xs ${
                isSyncingCloud
                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white border-transparent hover:shadow-md'
              }`}
              title="Đồng bộ toàn bộ dữ liệu mới nhất từ Supabase Cloud (Không cần bấm F5 lại trình duyệt)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
              <span>{isSyncingCloud ? 'Đang đồng bộ...' : 'Làm mới / Đồng bộ Supabase'}</span>
            </button>
          </div>
        </div>

        {/* Connection Failure Alert Banner */}
        {cloudConnectionError && (
          <div className="bg-rose-600 text-white px-4 py-3 shadow-md flex items-center justify-between gap-3 text-xs font-bold z-20">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-yellow-300 shrink-0 animate-bounce" />
              <span>{cloudConnectionError}</span>
            </div>
            <button
              onClick={() => {
                setIsLoadingCloud(true);
                storageService.fetchInitialDataFromCloud()
                  .then(({ parts: p, transactions: t }) => {
                    setParts(p);
                    setTransactions(t);
                    setCloudConnectionError(null);
                  })
                  .catch((err) => {
                    setCloudConnectionError('⚠️ Vẫn chưa thể kết nối Supabase Cloud: ' + (err?.message || 'Lỗi mạng'));
                  })
                  .finally(() => setIsLoadingCloud(false));
              }}
              className="bg-white text-rose-900 px-3 py-1.5 rounded-lg hover:bg-rose-100 font-extrabold shrink-0 shadow-2xs cursor-pointer flex items-center space-x-1.5 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Thử Kết Nối Lại</span>
            </button>
          </div>
        )}

        {/* View Router Body */}
        <main className="flex-1 pb-12 p-4 sm:p-6 max-w-7xl mx-auto w-full">
          {currentTab === 'dashboard' && (
            <DashboardView
              parts={parts}
              transactions={transactions}
              onNavigateTab={setCurrentTab}
              onOpenBinCard={handleOpenBinCard}
            />
          )}

          {currentTab === 'parts' && (
            <PartsListView
              parts={parts}
              settings={settings}
              onOpenAddModal={() => {
                setPartToEdit(null);
                setIsPartModalOpen(true);
              }}
              onOpenEditModal={(part) => {
                setPartToEdit(part);
                setIsPartModalOpen(true);
              }}
              onOpenDeleteModal={(part) => {
                setPartToDelete(part);
                setIsDeleteModalOpen(true);
              }}
              onOpenBinCard={handleOpenBinCard}
              onRefreshParts={handleManualSyncCloud}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
            />
          )}

          {currentTab === 'stock_in' && (
            <StockInView parts={parts} settings={settings} onSuccess={refreshData} />
          )}

          {currentTab === 'stock_out' && (
            <StockOutView parts={parts} settings={settings} onSuccess={refreshData} />
          )}

          {currentTab === 'ng_warehouse' && (
            <NgWarehouseView
              parts={parts}
              transactions={transactions}
              settings={settings}
              onRefresh={handleManualSyncCloud}
              onOpenBinCard={handleOpenBinCard}
            />
          )}

          {currentTab === 'kitting' && (
            <KittingView
              queue={kittingQueue}
              settings={settings}
              buffers={bufferLocations}
              onRefresh={handleManualSyncCloud}
            />
          )}

          {currentTab === 'buffer' && (
            <BufferMapView
              buffers={bufferLocations}
              onRefresh={handleManualSyncCloud}
            />
          )}

          {(currentTab === 'andon' ||
            currentTab === 'andon_request' ||
            currentTab === 'andon_calling' ||
            currentTab === 'andon_delivering' ||
            currentTab === 'andon_history') && (
            <AndonCallView
              materialCalls={materialCalls}
              buffers={bufferLocations}
              parts={parts}
              settings={settings}
              onRefresh={handleManualSyncCloud}
              onNavigateToSettings={() => setCurrentTab('settings')}
              viewMode={currentTab}
            />
          )}


          {currentTab === 'bin_card' && (
            <BinCardHistoryView
              parts={parts}
              transactions={transactions}
              settings={settings}
              onOpenBinCard={handleOpenBinCard}
            />
          )}

          {currentTab === 'warehouse_map' && (
            <WarehouseMapView
              parts={parts}
              settings={settings}
              onUpdateSettings={setSettings}
              onOpenBinCard={handleOpenBinCard}
              onRefreshData={refreshData}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              settings={settings}
              onUpdateSettings={setSettings}
              onRefreshAll={refreshData}
            />
          )}

          {currentTab === 'users' && (
            <UserManagementView currentUser={currentUser} onRefreshAll={refreshData} />
          )}
        </main>
      </div>

      {/* Global Electronic Bin Card Modal (100% Paper Bin Card Replica) */}
      <ElectronicBinCardModal
        part={selectedBinCardPart}
        isOpen={isBinCardOpen}
        onClose={() => setIsBinCardOpen(false)}
        settings={settings}
      />

      {/* Add / Edit Part Modal */}
      <PartModal
        isOpen={isPartModalOpen}
        onClose={() => setIsPartModalOpen(false)}
        onSave={handleSavePart}
        partToEdit={partToEdit}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title="Xác nhận xóa linh kiện"
        message={`Bạn có chắc chắn muốn xóa mã linh kiện [${partToDelete?.code}] "${partToDelete?.name}" khỏi hệ thống kho? Lịch sử thẻ kho của linh kiện này cũng sẽ bị xóa!`}
        confirmLabel="Xóa linh kiện"
        onConfirm={handleConfirmDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
      />

      {/* Floating Toast Notification for Supabase Sync Feedback */}
      {syncToast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-3 text-xs sm:text-sm font-bold border transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${
            syncToast.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-950/20'
              : 'bg-rose-600 text-white border-rose-500 shadow-rose-950/20'
          }`}
        >
          {syncToast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-200" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-200" />
          )}
          <span>{syncToast.message}</span>
        </div>
      )}
    </div>
  );
}
