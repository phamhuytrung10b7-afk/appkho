import React, { useState } from 'react';
import { ConversionFactor } from './types';
import { storageService, DEFAULT_CONVERSION_FACTORS } from './storage';
import * as XLSX from 'xlsx';
import { Upload, Download, Search, Plus, Trash2, Edit2, Check, RefreshCw, FileSpreadsheet, Calculator } from 'lucide-react';

export const ConversionFactorManager: React.FC = () => {
  const [factors, setFactors] = useState<ConversionFactor[]>(() => storageService.getConversionFactors());
  const [searchTerm, setSearchTerm] = useState('');
  const [newPartCode, setNewPartCode] = useState('');
  const [newPartName, setNewPartName] = useState('');
  const [newHsqd, setNewHsqd] = useState<number | ''>(1.0);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editHsqdValue, setEditHsqdValue] = useState<number>(1.0);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const filteredFactors = factors.filter(
    (f) =>
      f.partCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.partName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveAll = (updated: ConversionFactor[]) => {
    setFactors(updated);
    storageService.saveConversionFactors(updated);
  };

  const handleAddFactor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartCode.trim() || !newPartName.trim() || newHsqd === '') {
      setMessage({ type: 'error', text: 'Vui lòng điền đầy đủ Mã linh kiện, Tên linh kiện và Hệ số quy đổi!' });
      return;
    }
    const val = Number(newHsqd);
    if (isNaN(val) || val <= 0) {
      setMessage({ type: 'error', text: 'Hệ số quy đổi phải là số lớn hơn 0!' });
      return;
    }

    const codeClean = newPartCode.trim().toUpperCase();
    const existingIndex = factors.findIndex((f) => f.partCode.toUpperCase() === codeClean);
    let updated: ConversionFactor[];
    if (existingIndex >= 0) {
      updated = [...factors];
      updated[existingIndex] = {
        ...updated[existingIndex],
        partName: newPartName.trim(),
        hsqd: val,
        updatedAt: new Date().toISOString(),
      };
      setMessage({ type: 'success', text: `Đã cập nhật hệ số quy đổi cho mã [${codeClean}] thành ${val}` });
    } else {
      updated = [
        ...factors,
        {
          partCode: codeClean,
          partName: newPartName.trim(),
          hsqd: val,
          updatedAt: new Date().toISOString(),
        },
      ];
      setMessage({ type: 'success', text: `Đã thêm mới hệ số quy đổi cho [${codeClean}]` });
    }

    handleSaveAll(updated);
    setNewPartCode('');
    setNewPartName('');
    setNewHsqd(1.0);
  };

  const handleDeleteFactor = (code: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa hệ số quy đổi của mã linh kiện [${code}]?`)) {
      const updated = factors.filter((f) => f.partCode !== code);
      handleSaveAll(updated);
      setMessage({ type: 'success', text: `Đã xóa mã linh kiện [${code}] khỏi danh sách hệ số quy đổi.` });
    }
  };

  const handleStartEdit = (f: ConversionFactor) => {
    setEditingCode(f.partCode);
    setEditHsqdValue(f.hsqd);
  };

  const handleSaveEdit = (code: string) => {
    const val = Number(editHsqdValue);
    if (isNaN(val) || val <= 0) {
      setMessage({ type: 'error', text: 'Hệ số quy đổi phải là số hợp lệ lớn hơn 0!' });
      return;
    }
    const updated = factors.map((f) =>
      f.partCode === code ? { ...f, hsqd: val, updatedAt: new Date().toISOString() } : f
    );
    handleSaveAll(updated);
    setEditingCode(null);
    setMessage({ type: 'success', text: `Đã lưu hệ số quy đổi mới là ${val}` });
  };

  const handleResetDefault = () => {
    if (window.confirm('Khôi phục lại danh sách 26 linh kiện mặc định mẫu từ hệ thống?')) {
      handleSaveAll(DEFAULT_CONVERSION_FACTORS);
      setMessage({ type: 'success', text: 'Đã khôi phục danh sách hệ số quy đổi chuẩn mặc định!' });
    }
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (!rows || rows.length <= 1) {
          setMessage({ type: 'error', text: 'Tệp Excel rỗng hoặc không có dữ liệu hợp lệ!' });
          return;
        }

        let updated = [...factors];
        let importedCount = 0;

        // Skip header row
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          let name = String(row[0] || '').trim();
          let code = String(row[1] || '').trim().toUpperCase();
          let hsqdVal = parseFloat(String(row[2] || '1').replace(',', '.'));

          // Fallback column positions
          if (!code && name && !isNaN(parseFloat(name))) {
            code = name;
            name = 'Linh kiện ' + code;
          }

          if (code && !isNaN(hsqdVal) && hsqdVal > 0) {
            const idx = updated.findIndex((f) => f.partCode.toUpperCase() === code);
            if (idx >= 0) {
              updated[idx] = { ...updated[idx], partName: name || updated[idx].partName, hsqd: hsqdVal };
            } else {
              updated.push({ partCode: code, partName: name || code, hsqd: hsqdVal });
            }
            importedCount++;
          }
        }

        handleSaveAll(updated);
        setMessage({
          type: 'success',
          text: `Nhập thành công ${importedCount} mã linh kiện kèm hệ số quy đổi từ file Excel!`,
        });
      } catch (err: any) {
        setMessage({ type: 'error', text: 'Lỗi đọc file Excel: ' + (err.message || 'Cấu trúc file không đúng!') });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleExportTemplate = () => {
    const data = factors.map((f) => ({
      'Tên linh kiện': f.partName,
      'Mã Linh Kiện': f.partCode,
      'Hệ số quy đổi': f.hsqd,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 45 }, { wch: 30 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'HeSoQuyDoi');
    XLSX.writeFile(wb, 'Danh_Sach_He_So_Quy_Doi_HSQD.xlsx');
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-base">Cấu Hình Hệ Số Quy Đổi (HSQĐ)</h3>
            <p className="text-xs text-slate-500">
              Quản lý chỉ số HSQĐ để tự động tính Năng Suất Lao Động (NSLĐ) trên Báo Cáo.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <label className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center space-x-1.5 shadow-sm">
            <Upload className="w-4 h-4" />
            <span>Upload File Excel HSQĐ</span>
            <input type="file" accept=".xlsx, .xls" onChange={handleExcelUpload} className="hidden" />
          </label>

          <button
            type="button"
            onClick={handleExportTemplate}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer"
            title="Tải bảng tính Excel hiện tại"
          >
            <Download className="w-4 h-4" />
            <span>Tải File Excel</span>
          </button>

          <button
            type="button"
            onClick={handleResetDefault}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors"
            title="Khôi phục danh sách mẫu 26 linh kiện"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium flex items-center ${
            message.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <span>{message.text}</span>
        </div>
      )}

      {/* Form thêm mới / Cập nhật */}
      <form onSubmit={handleAddFactor} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
          <Plus className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Thêm / Cập nhật nhanh Hệ Số Quy Đổi
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-4">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tên Linh Kiện</label>
            <input
              type="text"
              value={newPartName}
              onChange={(e) => setNewPartName(e.target.value)}
              placeholder="VD: Lõi lọc Mineral + nối nhanh (TC)"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Mã Linh Kiện</label>
            <input
              type="text"
              value={newPartCode}
              onChange={(e) => setNewPartCode(e.target.value)}
              placeholder="VD: 04-29-00-SHA76219CK-0002"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">HSQĐ</label>
            <input
              type="number"
              step="0.01"
              value={newHsqd}
              onChange={(e) => setNewHsqd(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="1.00"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-emerald-600 focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
          </div>

          <div className="sm:col-span-2 flex items-end">
            <button
              type="submit"
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm"
            >
              Lưu Chỉ Số
            </button>
          </div>
        </div>
      </form>

      {/* Tìm kiếm & Bảng danh sách */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên hoặc mã linh kiện..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
          </div>
          <span className="text-xs text-slate-500 font-medium">Tổng số: {filteredFactors.length} mã</span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-96">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 text-[11px] uppercase tracking-wider font-bold sticky top-0 border-b border-slate-200">
              <tr>
                <th className="p-3 w-12 text-center">STT</th>
                <th className="p-3">Tên Linh Kiện</th>
                <th className="p-3">Mã Linh Kiện</th>
                <th className="p-3 w-36 text-right">Hệ Số Quy Đổi</th>
                <th className="p-3 w-28 text-center">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-100 bg-white">
              {filteredFactors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                    Chưa có linh kiện nào trong danh sách HSQĐ
                  </td>
                </tr>
              ) : (
                filteredFactors.map((f, idx) => (
                  <tr key={f.partCode} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                    <td className="p-3 font-semibold text-slate-900">{f.partName}</td>
                    <td className="p-3 font-mono font-bold text-slate-700">{f.partCode}</td>
                    <td className="p-3 text-right">
                      {editingCode === f.partCode ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editHsqdValue}
                          onChange={(e) => setEditHsqdValue(Number(e.target.value))}
                          className="w-20 px-2 py-1 border-2 border-blue-500 rounded-lg text-xs font-black text-blue-700 text-right outline-hidden"
                          autoFocus
                        />
                      ) : (
                        <span className="font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                          {f.hsqd.toFixed(2).replace('.', ',')}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {editingCode === f.partCode ? (
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(f.partCode)}
                          className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer"
                          title="Lưu"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(f)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded-md hover:bg-slate-100 cursor-pointer"
                            title="Sửa HSQĐ"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFactor(f.partCode)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100 cursor-pointer"
                            title="Xóa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
