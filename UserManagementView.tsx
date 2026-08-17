import React, { useState } from 'react';
import { UserAccount, ViewTab } from './types';
import { storageService } from './storage';
import {
  Users,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Edit,
  Trash2,
  Lock,
  CheckCircle2,
  XCircle,
  Search,
  Check,
  X,
  Boxes,
  Home,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  MapPin,
  Scissors,
  LayoutGrid,
  Bell,
  BellRing,
  Truck,
  Clock,
  History,
  BarChart3,
  Settings,
  AlertTriangle,
} from 'lucide-react';

interface UserManagementViewProps {
  currentUser: UserAccount;
}

export const ALL_TAB_DEFINITIONS: { id: ViewTab; label: string; icon: React.ElementType; category: string }[] = [
  { id: 'dashboard', label: 'Trang chủ', icon: Home, category: 'Kho Cốt Lõi' },
  { id: 'parts', label: 'Danh sách linh kiện', icon: Package, category: 'Kho Cốt Lõi' },
  { id: 'stock_in', label: 'Nhập kho', icon: ArrowDownLeft, category: 'Kho Cốt Lõi' },
  { id: 'stock_out', label: 'Xuất kho', icon: ArrowUpRight, category: 'Kho Cốt Lõi' },
  { id: 'warehouse_map', label: 'Sơ đồ kho (Vị trí)', icon: MapPin, category: 'Kho Cốt Lõi' },
  
  { id: 'kitting', label: 'Khu Bóc Tách (Kitting)', icon: Scissors, category: 'Kitting & Logistics' },
  { id: 'buffer', label: 'Sơ Đồ Kệ OUTBUFFER', icon: LayoutGrid, category: 'Kitting & Logistics' },
  
  { id: 'andon_request', label: '1. Sản xuất gọi hàng (Andon Call)', icon: Bell, category: 'Gọi & Vận Chuyển' },
  { id: 'andon_calling', label: '2. Đơn yêu cầu đang gọi (Chờ giao)', icon: BellRing, category: 'Gọi & Vận Chuyển' },
  { id: 'andon_delivering', label: '3. Đang trên đường vận chuyển', icon: Truck, category: 'Gọi & Vận Chuyển' },
  { id: 'andon_history', label: '4. Lịch sử cấp hàng (Lịch sử Andon)', icon: Clock, category: 'Gọi & Vận Chuyển' },

  { id: 'bin_card', label: 'Thẻ kho / Lịch sử', icon: History, category: 'Báo Cáo & Hệ Thống' },
  { id: 'settings', label: 'Cài đặt & Dữ liệu', icon: Settings, category: 'Báo Cáo & Hệ Thống' },
  { id: 'users', label: 'Quản lý tài khoản', icon: Users, category: 'Báo Cáo & Hệ Thống' },
];

export const UserManagementView: React.FC<UserManagementViewProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<UserAccount[]>(() => storageService.getUsers());
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal States
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Form States
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formRoleTitle, setFormRoleTitle] = useState('');
  const [formAllowedTabs, setFormAllowedTabs] = useState<ViewTab[]>(['dashboard']);
  const [formIsActive, setFormIsActive] = useState(true);

  // Password reset modal
  const [isResetPassModalOpen, setIsResetPassModalOpen] = useState(false);
  const [resetPassUserId, setResetPassUserId] = useState<string | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');

  const refreshUsers = () => {
    setUsers(storageService.getUsers());
  };

  const handleOpenAdd = () => {
    setEditingUserId(null);
    setFormUsername('');
    setFormPassword('123');
    setFormFullName('');
    setFormRoleTitle('Thủ Kho');
    setFormAllowedTabs(['dashboard', 'parts', 'stock_in', 'stock_out']);
    setFormIsActive(true);
    setIsAddEditModalOpen(true);
  };

  const handleOpenEdit = (u: UserAccount) => {
    setEditingUserId(u.id);
    setFormUsername(u.username);
    setFormPassword(''); // leave blank if unchanged
    setFormFullName(u.fullName);
    setFormRoleTitle(u.roleTitle);
    setFormAllowedTabs(u.allowedTabs || []);
    setFormIsActive(u.isActive);
    setIsAddEditModalOpen(true);
  };

  const handleToggleTab = (tabId: ViewTab) => {
    if (formAllowedTabs.includes(tabId)) {
      setFormAllowedTabs(formAllowedTabs.filter((t) => t !== tabId));
    } else {
      setFormAllowedTabs([...formAllowedTabs, tabId]);
    }
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!formUsername.trim()) {
      setMessage({ type: 'error', text: 'Tên đăng nhập không được để trống!' });
      return;
    }
    if (!formFullName.trim()) {
      setMessage({ type: 'error', text: 'Họ và tên không được để trống!' });
      return;
    }
    if (formAllowedTabs.length === 0) {
      setMessage({ type: 'error', text: 'Vui lòng chọn ít nhất 1 chức năng được phép truy cập!' });
      return;
    }

    try {
      if (editingUserId) {
        // Update user
        const updates: Partial<UserAccount> = {
          username: formUsername,
          fullName: formFullName,
          roleTitle: formRoleTitle,
          allowedTabs: formAllowedTabs,
          isActive: formIsActive,
        };
        if (formPassword.trim()) {
          updates.password = formPassword.trim();
        }

        storageService.updateUser(editingUserId, updates);
        setMessage({ type: 'success', text: `Cập nhật phân quyền cho tài khoản [${formUsername}] thành công!` });
      } else {
        // Add new user
        if (!formPassword.trim()) {
          setMessage({ type: 'error', text: 'Vui lòng nhập mật khẩu cho tài khoản mới!' });
          return;
        }

        storageService.addUser({
          username: formUsername,
          password: formPassword.trim(),
          fullName: formFullName,
          roleTitle: formRoleTitle,
          allowedTabs: formAllowedTabs,
          isActive: formIsActive,
        });
        setMessage({ type: 'success', text: `Đã tạo tài khoản [${formUsername}] thành công!` });
      }

      refreshUsers();
      setIsAddEditModalOpen(false);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi không xác định khi lưu tài khoản!' });
    }
  };

  const handleToggleActiveStatus = (u: UserAccount) => {
    try {
      storageService.updateUser(u.id, { isActive: !u.isActive });
      refreshUsers();
      setMessage({
        type: 'success',
        text: `Đã ${!u.isActive ? 'mở khóa' : 'khóa'} tài khoản [${u.username}] thành công!`,
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi khi cập nhật trạng thái tài khoản' });
    }
  };

  const isAdmin = storageService.isAdminUser(currentUser);

  const handleDeleteUser = (u: UserAccount) => {
    if (!isAdmin) {
      alert('Chỉ Quản trị viên (ADMIN) mới có quyền xóa tài khoản!');
      return;
    }
    if (u.id === currentUser.id) {
      alert('Bạn không thể xóa tài khoản hiện đang đăng nhập của chính mình!');
      return;
    }

    if (confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản [${u.username}] (${u.fullName})?`)) {
      try {
        storageService.deleteUser(u.id);
        refreshUsers();
        setMessage({ type: 'success', text: `Đã xóa tài khoản [${u.username}] khỏi hệ thống!` });
      } catch (err: any) {
        setMessage({ type: 'error', text: err.message || 'Lỗi khi xóa tài khoản' });
      }
    }
  };

  const handleSaveResetPassword = () => {
    if (!resetPassUserId || !newPasswordValue.trim()) {
      alert('Vui lòng nhập mật khẩu mới!');
      return;
    }

    try {
      const u = users.find((x) => x.id === resetPassUserId);
      storageService.updateUser(resetPassUserId, { password: newPasswordValue.trim() });
      refreshUsers();
      setIsResetPassModalOpen(false);
      setNewPasswordValue('');
      setMessage({ type: 'success', text: `Đổi mật khẩu thành công cho tài khoản [${u?.username}]!` });
    } catch (err: any) {
      alert(err.message || 'Lỗi khi đổi mật khẩu');
    }
  };

  const handleToggleCardTab = (targetUser: UserAccount, tabId: ViewTab) => {
    const currentAllowed = targetUser.allowedTabs || [];
    let updatedTabs: ViewTab[];
    if (currentAllowed.includes(tabId)) {
      if (currentAllowed.length === 1) {
        alert('Tài khoản phải có ít nhất 1 chức năng được phép sử dụng!');
        return;
      }
      updatedTabs = currentAllowed.filter((t) => t !== tabId);
    } else {
      updatedTabs = [...currentAllowed, tabId];
    }

    try {
      storageService.updateUser(targetUser.id, { allowedTabs: updatedTabs });
      refreshUsers();
      setMessage({
        type: 'success',
        text: `Đã cập nhật phân quyền cho [@${targetUser.username}] (${updatedTabs.length} chức năng)!`,
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi khi cập nhật phân quyền' });
    }
  };

  const handlePresetCardUser = (targetUser: UserAccount, preset: 'ALL' | 'THUKHO' | 'KITTING' | 'DAYCHUYEN') => {
    let updatedTabs: ViewTab[] = [];
    if (preset === 'ALL') {
      updatedTabs = ALL_TAB_DEFINITIONS.map((t) => t.id);
    } else if (preset === 'THUKHO') {
      updatedTabs = ['dashboard', 'parts', 'stock_in', 'stock_out', 'warehouse_map', 'andon_calling', 'andon_delivering', 'andon_history', 'bin_card', 'reports'];
    } else if (preset === 'KITTING') {
      updatedTabs = ['kitting', 'buffer'];
    } else if (preset === 'DAYCHUYEN') {
      updatedTabs = ['andon_request', 'andon_calling', 'andon_delivering', 'andon_history', 'buffer'];
    }

    try {
      storageService.updateUser(targetUser.id, { allowedTabs: updatedTabs });
      refreshUsers();
      setMessage({
        type: 'success',
        text: `Đã gán nhanh quyền [${preset}] cho [@${targetUser.username}]!`,
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi khi cập nhật phân quyền' });
    }
  };

  // Preset permissions helper
  const applyPresetPermissions = (preset: 'ALL' | 'THUKHO' | 'KITTING' | 'DAYCHUYEN' | 'NONE') => {
    if (preset === 'ALL') {
      setFormAllowedTabs(ALL_TAB_DEFINITIONS.map((t) => t.id));
    } else if (preset === 'THUKHO') {
      setFormAllowedTabs(['dashboard', 'parts', 'stock_in', 'stock_out', 'warehouse_map', 'andon_calling', 'andon_delivering', 'andon_history', 'bin_card', 'reports']);
    } else if (preset === 'KITTING') {
      setFormAllowedTabs(['kitting', 'buffer']);
    } else if (preset === 'DAYCHUYEN') {
      setFormAllowedTabs(['andon_request', 'andon_calling', 'andon_delivering', 'andon_history', 'buffer']);
    } else if (preset === 'NONE') {
      setFormAllowedTabs([]);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      !searchTerm ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.roleTitle.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-3xl shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-300 rounded-2xl border border-blue-400/20">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">QUẢN LÝ TÀI KHOẢN & PHÂN QUYỀN TRUY CẬP</h1>
              <p className="text-xs text-blue-200">
                Phân quyền theo vị trí công việc: Mỗi nhân viên chỉ thấy các chức năng được giao trách nhiệm.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-5 py-3 bg-blue-500 hover:bg-blue-600 text-white font-extrabold rounded-2xl text-xs transition-all cursor-pointer shadow-md flex items-center space-x-2 shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>THÊM TÀI KHOẢN MỚI</span>
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-500 block">Tổng Tài Khoản</span>
          <strong className="text-2xl font-black text-slate-900">{users.length}</strong>
        </div>
        <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl shadow-xs space-y-1">
          <span className="text-xs font-bold text-emerald-700 block">Đang Hoạt Động</span>
          <strong className="text-2xl font-black text-emerald-800">
            {users.filter((u) => u.isActive).length}
          </strong>
        </div>
        <div className="p-4 bg-rose-50/60 border border-rose-200/80 rounded-2xl shadow-xs space-y-1">
          <span className="text-xs font-bold text-rose-700 block">Tạm Khóa</span>
          <strong className="text-2xl font-black text-rose-800">
            {users.filter((u) => !u.isActive).length}
          </strong>
        </div>
        <div className="p-4 bg-blue-50/60 border border-blue-200/80 rounded-2xl shadow-xs space-y-1">
          <span className="text-xs font-bold text-blue-700 block">Tài Khoản Admin</span>
          <strong className="text-2xl font-black text-blue-800">
            {users.filter((u) => u.allowedTabs.length === ALL_TAB_DEFINITIONS.length).length}
          </strong>
        </div>
      </div>

      {/* Main List Section */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Filter Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo username, tên, chức danh..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <p className="text-xs text-slate-500">
            Hiển thị <strong className="text-slate-900">{filteredUsers.length}</strong> / {users.length} tài khoản
          </p>
        </div>

        {/* Users Cards Grid */}
        <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredUsers.map((u) => {
            const isMe = u.id === currentUser.id;
            return (
              <div
                key={u.id}
                className={`p-5 rounded-2xl border transition-all space-y-4 ${
                  !u.isActive
                    ? 'bg-slate-50 border-slate-200 opacity-75'
                    : isMe
                    ? 'bg-blue-50/40 border-blue-300 ring-2 ring-blue-500/10'
                    : 'bg-white border-slate-200 hover:border-blue-300'
                }`}
              >
                {/* Account Top Row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 bg-gradient-to-tr from-blue-700 to-indigo-600 text-white font-extrabold text-base rounded-2xl flex items-center justify-center shrink-0 shadow-xs">
                      {u.fullName ? u.fullName.slice(0, 2).toUpperCase() : u.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-extrabold text-slate-900 text-base">{u.fullName}</h3>
                        {isMe && (
                          <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded-md uppercase">
                            Bạn (Đang đăng nhập)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-xs mt-0.5">
                        <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                          @{u.username}
                        </span>
                        <span className="text-slate-500">• {u.roleTitle}</span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {u.isActive ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-black rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Hoạt động</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-rose-100 text-rose-800 text-[11px] font-black rounded-full">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Bị Khóa</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Interactive Allowed Functions Checkbox Grid (Tick V) */}
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                    <span className="font-extrabold text-slate-800 text-[11px] uppercase tracking-wider">
                      TÍCH V CHỌN CHỨC NĂNG CẤP QUYỀN ({u.allowedTabs?.length || 0}/{ALL_TAB_DEFINITIONS.length}):
                    </span>

                    {/* Quick Preset Buttons on Card */}
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => handlePresetCardUser(u, 'ALL')}
                        className="px-1.5 py-0.5 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 text-[10px] font-extrabold rounded-md transition-colors cursor-pointer"
                        title="Tích chọn tất cả 12 chức năng"
                      >
                        ✓ Tất cả (12)
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePresetCardUser(u, 'THUKHO')}
                        className="px-1.5 py-0.5 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 text-[10px] font-extrabold rounded-md transition-colors cursor-pointer"
                        title="Gán nhóm quyền Thủ Kho"
                      >
                        ✓ Thủ kho
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePresetCardUser(u, 'KITTING')}
                        className="px-1.5 py-0.5 bg-slate-100 hover:bg-purple-100 text-slate-700 hover:text-purple-800 text-[10px] font-extrabold rounded-md transition-colors cursor-pointer"
                        title="Gán nhóm quyền Kitting"
                      >
                        ✓ Kitting
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePresetCardUser(u, 'DAYCHUYEN')}
                        className="px-1.5 py-0.5 bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 text-[10px] font-extrabold rounded-md transition-colors cursor-pointer"
                        title="Gán nhóm quyền Dây Chuyền"
                      >
                        ✓ Dây chuyền
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2 bg-slate-50/90 rounded-2xl border border-slate-200/80 max-h-52 overflow-y-auto">
                    {ALL_TAB_DEFINITIONS.map((def) => {
                      const isChecked = u.allowedTabs?.includes(def.id);
                      const Icon = def.icon;
                      return (
                        <button
                          key={def.id}
                          type="button"
                          onClick={() => handleToggleCardTab(u, def.id)}
                          className={`flex items-center space-x-2 p-1.5 rounded-xl border transition-all text-left cursor-pointer select-none text-[11px] ${
                            isChecked
                              ? 'bg-blue-600 text-white font-black border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-600 hover:text-slate-900 border-slate-200 hover:border-slate-300 font-semibold'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 text-[10px] border font-black ${
                              isChecked
                                ? 'bg-white text-blue-700 border-white'
                                : 'bg-slate-100 border-slate-300 text-transparent'
                            }`}
                          >
                            ✓
                          </div>
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${isChecked ? 'text-white' : 'text-slate-400'}`} />
                          <span className="truncate">{def.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(u)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl font-bold transition-colors cursor-pointer flex items-center space-x-1"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Sửa Phân Quyền</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setResetPassUserId(u.id);
                        setNewPasswordValue('');
                        setIsResetPassModalOpen(true);
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-700 rounded-xl font-bold transition-colors cursor-pointer flex items-center space-x-1"
                      title="Đổi mật khẩu tài khoản này"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Mật khẩu</span>
                    </button>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleToggleActiveStatus(u)}
                      className={`px-2.5 py-1.5 rounded-xl font-bold transition-colors cursor-pointer flex items-center space-x-1 ${
                        u.isActive
                          ? 'bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600'
                          : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                      }`}
                      title={u.isActive ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>{u.isActive ? 'Khóa' : 'Mở Khóa'}</span>
                    </button>

                    {!isMe && isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(u)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        title="Xóa tài khoản (Chỉ Quản trị viên)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Add or Edit User & Role Permissions */}
      {isAddEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {editingUserId ? 'Chỉnh Sửa Phân Quyền Tài Khoản' : 'Tạo Tài Khoản Người Dùng Mới'}
                  </h3>
                  <p className="text-xs text-slate-500">Phân công chức năng truy cập theo nhiệm vụ công việc</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddEditModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveUser} className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Account Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tên Đăng Nhập (Username) *</label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value.toLowerCase().trim())}
                    placeholder="ví dụ: thukho2, daychuyen2..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {editingUserId ? 'Mật Khẩu Mới (Để trống nếu giữ nguyên)' : 'Mật Khẩu Đăng Nhập *'}
                  </label>
                  <input
                    type="text"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder={editingUserId ? 'Giữ nguyên mật khẩu cũ' : '123'}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Họ Và Tên Nhân Viên *</label>
                  <input
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Văn A"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Chức Danh / Vị Trí *</label>
                  <input
                    type="text"
                    value={formRoleTitle}
                    onChange={(e) => setFormRoleTitle(e.target.value)}
                    placeholder="Ví dụ: Thủ Kho, Công Nhân Bóc Tách..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Status Toggle */}
              <div className="flex items-center space-x-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <input
                  type="checkbox"
                  id="userActiveCheck"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded-md focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="userActiveCheck" className="font-bold text-slate-800 cursor-pointer select-none">
                  Cho phép tài khoản này đăng nhập & hoạt động ngay
                </label>
              </div>

              {/* Permission Presets Bar */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-black text-slate-900 uppercase text-[11px]">
                    Chọn nhanh quyền mẫu (Preset Mẫu):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyPresetPermissions('ALL')}
                      className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 font-bold rounded-lg text-[11px] transition-colors cursor-pointer"
                    >
                      Toàn Quyền Admin (12/12)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetPermissions('THUKHO')}
                      className="px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold rounded-lg text-[11px] transition-colors cursor-pointer"
                    >
                      Thủ Kho (7/12)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetPermissions('KITTING')}
                      className="px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-800 font-bold rounded-lg text-[11px] transition-colors cursor-pointer"
                    >
                      Tổ Bóc Tách (2/12)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetPermissions('DAYCHUYEN')}
                      className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold rounded-lg text-[11px] transition-colors cursor-pointer"
                    >
                      Dây Chuyền (2/12)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetPermissions('NONE')}
                      className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-[11px] transition-colors cursor-pointer"
                    >
                      Bỏ Chọn
                    </button>
                  </div>
                </div>

                {/* Feature Permissions Checkboxes Grid */}
                <div className="space-y-3 pt-2">
                  {['Kho Cốt Lõi', 'Kitting & Logistics', 'Báo Cáo & Hệ Thống'].map((cat) => {
                    const catTabs = ALL_TAB_DEFINITIONS.filter((t) => t.category === cat);
                    return (
                      <div key={cat} className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-2">
                        <span className="font-extrabold text-blue-900 text-[11px] uppercase tracking-wider block">
                          📌 {cat}
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {catTabs.map((tab) => {
                            const Icon = tab.icon;
                            const isChecked = formAllowedTabs.includes(tab.id);
                            return (
                              <label
                                key={tab.id}
                                className={`flex items-center space-x-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                                  isChecked
                                    ? 'bg-blue-50/80 border-blue-300 text-blue-900 font-bold shadow-2xs'
                                    : 'bg-white border-slate-200/80 text-slate-600 hover:border-slate-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleTab(tab.id)}
                                  className="w-4 h-4 text-blue-600 rounded-md focus:ring-blue-500 cursor-pointer shrink-0"
                                />
                                <Icon className={`w-4 h-4 shrink-0 ${isChecked ? 'text-blue-600' : 'text-slate-400'}`} />
                                <span className="text-xs">{tab.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddEditModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl transition-colors cursor-pointer shadow-md"
                >
                  {editingUserId ? 'LƯU THAY ĐỔI' : 'TẠO TÀI KHOẢN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Quick Reset Password */}
      {isResetPassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-base text-slate-900 flex items-center space-x-2">
                <KeyRound className="w-5 h-5 text-amber-600" />
                <span>Cấp Mật Khẩu Mới</span>
              </h3>
              <button
                onClick={() => setIsResetPassModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block font-bold text-slate-700">Nhập Mật Khẩu Mới:</label>
              <input
                type="text"
                value={newPasswordValue}
                onChange={(e) => setNewPasswordValue(e.target.value)}
                placeholder="Ví dụ: 123456"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setIsResetPassModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveResetPassword}
                className="px-5 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 cursor-pointer shadow-xs"
              >
                Đổi Mật Khẩu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
