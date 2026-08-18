import React, { useState, useEffect, useCallback } from 'react';
import { Part, Transaction, AppSettings, ViewTab, KittingQueueItem, BufferLocationMap, MaterialCallRequest, UserAccount } from './types';
import { storageService } from './storage';
import { getActiveSupabaseClient } from './supabase';
import { STORAGE_KEYS, supabaseKeyStore, mapSupabaseRowToPart, mapSupabaseRowToTransaction } from './supabaseStorage';
import { Menu, Boxes, LogOut, AlertTriangle, RefreshCw } from 'lucide-react';

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

  // Refresh data from storage
  const refreshData = useCallback(() => {
    setParts(storageService.getParts());
    setTransactions(storageService.getTransactions());
    setKittingQueue(storageService.getKittingQueue());
    setBufferLocations(storageService.getBufferLocations());
    setMaterialCalls(storageService.getMaterialCallRequests());
    setSettings(storageService.getSettings());
  }, []);

  // On App Mount: Mandatory sync from Supabase Cloud as Single Source of Truth & Realtime 100% Channel
  useEffect(() => {
    let isMounted = true;

    async function syncCloudAndState() {
      try {
        const { parts: cloudParts, transactions: cloudTxs } = await storageService.fetchInitialDataFromCloud();
        if (isMounted) {
          setParts(cloudParts);
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
        }
      } catch (err: any) {
        console.warn('Lỗi khi tải/đồng bộ dữ liệu từ Supabase:', err);
        if (isMounted) {
          setCloudConnectionError(
            '⚠️ MẤT KẾT NỐI SUPABASE CLOUD: Không thể kết nối máy chủ Supabase. Dữ liệu chưa thể đồng bộ Cloud. Vui lòng kiểm tra lại mạng hoặc cấu hình kết nối trong Cài Đặt!'
          );
          refreshData();
        }
      }
    }

    async function initCloudData() {
      try {
        setIsLoadingCloud(true);
        await syncCloudAndState();
      } catch (err) {
        console.warn('Lỗi khởi tạo dữ liệu Supabase:', err);
      } finally {
        if (isMounted) {
          setIsLoadingCloud(false);
        }
      }
    }

    initCloudData();

    // ⚡ 100% Realtime Setup: Listening to postgres changes on schema 'public' with Zero-Egress Row-Level updates
    const { client, isConfigured } = getActiveSupabaseClient();
    let channel: any = null;

    if (isConfigured && client) {
      try {
        channel = client
          .channel('public-db-changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public' },
            (payload: any) => {
              if (!isMounted) return;
              const { table, eventType, new: newRow, old: oldRow } = payload;

              // 1. Handle Key-Value Table (`thekho_app_data`)
              if (table === 'thekho_app_data') {
                if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRow?.key) {
                  const key = newRow.key;
                  const data = newRow.data;
                  const updatedAt = newRow.updated_at || new Date().toISOString();

                  supabaseKeyStore.handleRealtimePayload(key, data, updatedAt);

                  if (key === STORAGE_KEYS.PARTS && Array.isArray(data)) {
                    setParts(data);
                  } else if (key === STORAGE_KEYS.TRANSACTIONS && Array.isArray(data)) {
                    setTransactions(data);
                  } else if (key === STORAGE_KEYS.KITTING_QUEUE && Array.isArray(data)) {
                    setKittingQueue(data);
                  } else if (key === STORAGE_KEYS.BUFFER_MAP && Array.isArray(data)) {
                    setBufferLocations(data);
                  } else if (key === STORAGE_KEYS.MATERIAL_CALLS && Array.isArray(data)) {
                    setMaterialCalls(data);
                  } else if (key === STORAGE_KEYS.SETTINGS && data) {
                    setSettings(data);
                  } else if (key === STORAGE_KEYS.USERS) {
                    const u = storageService.getCurrentUser();
                    if (u) setCurrentUser(u);
                  }
                }
                return;
              }

              // 2. Handle Relational `parts` Table
              if (table === 'parts') {
                if (eventType === 'INSERT' && newRow) {
                  const mapped = mapSupabaseRowToPart(newRow);
                  setParts((prev) => {
                    const filtered = prev.filter((p) => p.id !== mapped.id && p.code !== mapped.code);
                    const updated = [mapped, ...filtered];
                    localStorage.setItem(STORAGE_KEYS.PARTS, JSON.stringify(updated));
                    return updated;
                  });
                } else if (eventType === 'UPDATE' && newRow) {
                  const mapped = mapSupabaseRowToPart(newRow);
                  setParts((prev) => {
                    const updated = prev.map((p) => (p.id === mapped.id ? mapped : p));
                    localStorage.setItem(STORAGE_KEYS.PARTS, JSON.stringify(updated));
                    return updated;
                  });
                } else if (eventType === 'DELETE' && oldRow) {
                  setParts((prev) => {
                    const updated = prev.filter((p) => p.id !== oldRow.id);
                    localStorage.setItem(STORAGE_KEYS.PARTS, JSON.stringify(updated));
                    return updated;
                  });
                }
                return;
              }

              // 3. Handle Relational `transactions` Table
              if (table === 'transactions') {
                if (eventType === 'INSERT' && newRow) {
                  const mappedTx = mapSupabaseRowToTransaction(newRow);
                  setTransactions((prev) => {
                    const filtered = prev.filter((t) => t.id !== mappedTx.id);
                    const updated = [mappedTx, ...filtered];
                    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
                    return updated;
                  });
                }
                return;
              }

              // 4. Handle Relational `settings` Table
              if (table === 'settings') {
                if (newRow?.data) {
                  setSettings(newRow.data);
                  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(newRow.data));
                }
                return;
              }
            }
          )
          .subscribe((status) => {
            console.log('Supabase Realtime subscription status:', status);
          });
      } catch (err) {
        console.warn('Không thể khởi tạo kết nối Supabase Realtime:', err);
      }
    }

    return () => {
      isMounted = false;
      if (client && channel) {
        try {
          client.removeChannel(channel);
        } catch (_) {}
      }
    };
  }, [refreshData]);

  // Open Electronic Bin Card for a part
  const handleOpenBinCard = (part: Part) => {
    // Refresh part object from storage to get latest stock
    const latestPart = storageService.getPartById(part.id) || part;
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
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Right Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Mobile Header Bar (Hidden on Desktop) */}
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-2xs">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl border border-slate-200 cursor-pointer"
              title="Mở Menu Navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold text-xs">
                <Boxes className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-slate-800 text-sm tracking-tight">
                {settings.warehouseName || 'KHO LINH KIỆN'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl border border-rose-200 flex items-center space-x-1.5 text-xs font-bold cursor-pointer"
            title="Đăng xuất khỏi hệ thống"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Thoát</span>
          </button>
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
              onRefreshParts={refreshData}
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

          {currentTab === 'kitting' && (
            <KittingView
              queue={kittingQueue}
              settings={settings}
              buffers={bufferLocations}
              onRefresh={refreshData}
            />
          )}

          {currentTab === 'buffer' && (
            <BufferMapView
              buffers={bufferLocations}
              onRefresh={refreshData}
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
              onRefresh={refreshData}
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
            <UserManagementView currentUser={currentUser} />
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
    </div>
  );
}
