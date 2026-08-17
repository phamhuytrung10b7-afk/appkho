import React from 'react';
import { ViewTab, UserAccount } from './types';
import {
  Home,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardCheck,
  History,
  MapPin,
  BarChart3,
  Settings,
  ShieldAlert,
  Boxes,
  X,
  Scissors,
  LayoutGrid,
  Bell,
  BellRing,
  Truck,
  Users,
  LogOut,
  User,
} from 'lucide-react';

interface SidebarProps {
  currentTab: ViewTab;
  onSelectTab: (tab: ViewTab) => void;
  lowStockCount: number;
  outOfStockCount: number;
  pendingKittingCount?: number;
  callingAndonCount?: number;
  deliveringAndonCount?: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  currentUser?: UserAccount | null;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  lowStockCount,
  outOfStockCount,
  pendingKittingCount = 0,
  callingAndonCount = 0,
  deliveringAndonCount = 0,
  isOpenMobile = false,
  onCloseMobile,
  currentUser,
  onLogout,
}) => {
  const allMenuItems: { id: ViewTab; label: string; icon: React.ElementType; badge?: number; badgeColor?: string; section?: string }[] = [
    { id: 'dashboard', label: 'Trang chủ', icon: Home },
    {
      id: 'parts',
      label: 'Danh sách linh kiện',
      icon: Package,
      badge: lowStockCount + outOfStockCount > 0 ? lowStockCount + outOfStockCount : undefined,
      badgeColor: outOfStockCount > 0 ? 'bg-red-500' : 'bg-amber-500',
    },
    { id: 'stock_in', label: 'Nhập kho', icon: ArrowDownLeft },
    { id: 'stock_out', label: 'Xuất kho', icon: ArrowUpRight },
    { id: 'warehouse_map', label: 'Sơ đồ kho (Vị trí)', icon: MapPin },
    {
      id: 'kitting',
      label: 'Khu Bóc Tách (Kitting)',
      icon: Scissors,
      badge: pendingKittingCount > 0 ? pendingKittingCount : undefined,
      badgeColor: 'bg-purple-600',
      section: 'Kitting & Outbuffer',
    },
    { id: 'buffer', label: 'Sơ Đồ Kệ OUTBUFFER', icon: LayoutGrid },
    {
      id: 'andon_request',
      label: '1. Sản xuất gọi hàng (Andon)',
      icon: Bell,
      section: 'Gọi Hàng & Vận Chuyển',
    },
    {
      id: 'andon_calling',
      label: '2. Đơn yêu cầu đang gọi',
      icon: BellRing,
      badge: callingAndonCount > 0 ? callingAndonCount : undefined,
      badgeColor: 'bg-amber-500 animate-pulse',
    },
    {
      id: 'andon_delivering',
      label: '3. Đang trên đường vận chuyển',
      icon: Truck,
      badge: deliveringAndonCount > 0 ? deliveringAndonCount : undefined,
      badgeColor: 'bg-indigo-600',
    },
    {
      id: 'andon_history',
      label: '4. Lịch sử cấp hàng (Andon)',
      icon: History,
    },
    { id: 'bin_card', label: 'Thẻ kho / Nhật ký LK', icon: ClipboardCheck, section: 'Báo Cáo & Quản Lý' },
    { id: 'settings', label: 'Cài đặt & Dữ liệu', icon: Settings },
    { id: 'users', label: 'Quản lý tài khoản', icon: Users },
  ];

  // Filter menu items by user allowed tabs if currentUser is provided
  const menuItems = currentUser && currentUser.allowedTabs
    ? allMenuItems.filter((item) => {
        if (currentUser.allowedTabs.includes(item.id)) return true;
        // Legacy fallback
        if (currentUser.allowedTabs.includes('andon' as any)) {
          if (
            item.id === 'andon_request' ||
            item.id === 'andon_calling' ||
            item.id === 'andon_delivering' ||
            item.id === 'andon_history'
          )
            return true;
        }
        return false;
      })
    : allMenuItems;

  const handleSelect = (tab: ViewTab) => {
    onSelectTab(tab);
    if (onCloseMobile) onCloseMobile();
  };

  const navContent = (
    <div className="flex flex-col h-full bg-white text-slate-800">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-700 to-indigo-600 text-white rounded-xl shadow-md flex items-center justify-center shrink-0">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-base sm:text-lg text-blue-900 tracking-tight leading-tight">KHO LINH KIỆN</h1>
            <p className="text-xs text-slate-400 font-medium">Thẻ Kho Điện Tử</p>
          </div>
        </div>

        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
            title="Đóng menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Chức năng được cấp quyền ({menuItems.length})
        </div>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <React.Fragment key={item.id}>
              {item.section && (
                <div className="px-3 pt-3 pb-1 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  {item.section}
                </div>
              )}
              <button
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150 group cursor-pointer ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 shadow-xs border border-blue-200/60'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-5 h-5 transition-transform duration-150 ${isActive ? 'scale-105 text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 text-xs font-bold text-white rounded-full ${
                      item.badgeColor || 'bg-amber-500'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      {/* User Account Profile Footer */}
      {currentUser && (
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/80 space-y-2">
          <div className="p-2.5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-2">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 bg-blue-600 text-white font-black text-xs rounded-xl flex items-center justify-center shrink-0">
                {currentUser.fullName ? currentUser.fullName.slice(0, 2).toUpperCase() : 'US'}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-extrabold text-slate-900 text-xs truncate">
                  {currentUser.fullName}
                </h4>
                <p className="text-[10px] text-blue-700 font-bold truncate">
                  {currentUser.roleTitle}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
              <span className="font-mono text-slate-500">@{currentUser.username}</span>
              <span className="text-emerald-600 font-bold">● Đang hoạt động</span>
            </div>
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={() => onLogout()}
              className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-extrabold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center space-x-2 border border-rose-200/80 shadow-2xs"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>ĐĂNG XUẤT TÀI KHOẢN</span>
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex w-64 border-r border-slate-200 shadow-xs select-none z-20 shrink-0 h-screen sticky top-0">
        {navContent}
      </aside>

      {/* Mobile Drawer Slide-over Overlay */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={onCloseMobile}
          />
          {/* Drawer Content */}
          <div className="relative w-4/5 max-w-xs bg-white h-full shadow-2xl z-10 flex flex-col animate-in slide-in-from-left duration-200">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};
