import React, { useState, useEffect } from 'react';
import { Part } from './types';
import { QRCodeSVG } from 'qrcode.react';
import { X, Package, MapPin, Tag, Image as ImageIcon, Save, AlertCircle } from 'lucide-react';

interface PartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (partData: Omit<Part, 'id' | 'createdAt' | 'updatedAt'>, editId?: string) => void;
  partToEdit?: Part | null;
}

export const PartModal: React.FC<PartModalProps> = ({
  isOpen,
  onClose,
  onSave,
  partToEdit,
}) => {
  if (!isOpen) return null;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [location, setLocation] = useState('');
  const [unit, setUnit] = useState('Cái');
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(10);
  const [barcode, setBarcode] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (partToEdit) {
      setCode(partToEdit.code);
      setName(partToEdit.name);
      setDescription(partToEdit.description || '');
      setImageUrl(partToEdit.imageUrl || '');
      setLocation(partToEdit.location);
      setUnit(partToEdit.unit);
      setCurrentStock(partToEdit.currentStock);
      setMinStock(partToEdit.minStock);
      setBarcode(partToEdit.barcode || '');
      setQrCode(partToEdit.qrCode || partToEdit.code);
      setNote(partToEdit.note || '');
    } else {
      // Auto-generate code
      const autoCode = 'LK-' + Math.floor(1000 + Math.random() * 9000);
      setCode(autoCode);
      setName('');
      setDescription('');
      setImageUrl('https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80');
      setLocation('Kệ A1 - Khay 01');
      setUnit('Cái');
      setCurrentStock(0);
      setMinStock(10);
      setBarcode('893' + Math.floor(100000000 + Math.random() * 900000000));
      setQrCode(autoCode);
      setNote('');
    }
    setError('');
  }, [partToEdit, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Vui lòng nhập Mã linh kiện!');
      return;
    }
    if (!name.trim()) {
      setError('Vui lòng nhập Tên linh kiện!');
      return;
    }
    if (!location.trim()) {
      setError('Vui lòng nhập Vị trí lưu kho!');
      return;
    }

    onSave(
      {
        code: code.trim(),
        name: name.trim(),
        description: description.trim(),
        imageUrl: imageUrl.trim(),
        location: location.trim(),
        unit: unit.trim(),
        currentStock: Number(currentStock) || 0,
        minStock: Number(minStock) || 0,
        barcode: barcode.trim() || code.trim(),
        qrCode: qrCode.trim() || code.trim(),
        note: note.trim(),
      },
      partToEdit ? partToEdit.id : undefined
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <Package className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-base">
              {partToEdit ? 'Chỉnh Sửa Thông Tin Linh Kiện' : 'Thêm Linh Kiện Mới Vào Kho'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold flex items-center">
              <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form Fields - Simplified for Warehouse Management */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mã Linh Kiện */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã Linh Kiện <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setQrCode(e.target.value);
                }}
                placeholder="VD: LK-RES-10K"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white outline-hidden"
              />
            </div>

            {/* Tên Linh Kiện */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên Linh Kiện <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Vít nhọn 4x16, Inox, mũ D8"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white outline-hidden"
              />
            </div>

            {/* Vị Trí Lưu */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vị Trí Lưu Kho (Kệ / Ô) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="VD: 2BVL"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-hidden"
                />
              </div>
            </div>

            {/* Đơn Vị Tính */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Đơn Vị Tính</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white outline-hidden font-medium"
              >
                <option value="Cái">Cái</option>
                <option value="Bộ">Bộ</option>
                <option value="Con">Con</option>
                <option value="Cuộn">Cuộn</option>
                <option value="Hộp">Hộp</option>
                <option value="Kg">Kg</option>
                <option value="Thanh">Thanh</option>
                <option value="Mét">Mét</option>
              </select>
            </div>

            {/* Tồn Hiện Tại */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tồn Kho Hiện Tại {partToEdit && <span className="text-slate-400 font-normal">(Cập nhật qua Nhập/Xuất)</span>}
              </label>
              <input
                type="number"
                min={0}
                value={currentStock}
                onChange={(e) => setCurrentStock(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-hidden"
              />
            </div>

            {/* Mức Tồn Tối Thiểu */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mức Tồn Tối Thiểu (Cảnh báo)</label>
              <input
                type="number"
                min={0}
                value={minStock}
                onChange={(e) => setMinStock(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-amber-700 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-hidden"
              />
            </div>
          </div>

          {/* Ghi chú & Mô tả */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi Chú / Mô Tả Thẻ Kho</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi chú về dòng linh kiện, loại máy sử dụng..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white outline-hidden"
            />
          </div>

          {/* QR Preview */}
          {code && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-700">Mã QR Code Tự Động:</p>
                <p className="text-[11px] text-slate-500 font-mono">{code}</p>
              </div>
              <QRCodeSVG value={code} size={42} className="bg-white p-1 rounded-md border border-slate-200" />
            </div>
          )}

          {/* Form Action Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="flex items-center space-x-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{partToEdit ? 'Lưu Thay Đổi' : 'Thêm Linh Kiện'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
