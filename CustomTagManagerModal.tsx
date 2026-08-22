import React, { useState, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { printHtml } from './printHelper';
import { storageService, CustomGeneratedContainerTag } from './storage';
import { MasterKittingTag } from './masterExcelParser';
import { getPartGroupConfig } from './partGroupColors';
import {
  Tag,
  Printer,
  X,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Package,
  Search,
  CheckSquare,
  Square,
  Trash2,
  Plus,
  RefreshCw,
  Info,
  Sliders,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

interface CustomTagManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTagForKitting?: (tag: MasterKittingTag) => void;
}

export const CustomTagManagerModal: React.FC<CustomTagManagerModalProps> = ({
  isOpen,
  onClose,
  onSelectTagForKitting,
}) => {
  const [customTags, setCustomTags] = useState<CustomGeneratedContainerTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'custom_list' | 'create_new' | 'print_preview'>('custom_list');
  const [msg, setMsg] = useState<string | null>(null);

  // Manual Creation Form
  const [newPartCode, setNewPartCode] = useState('');
  const [newPartName, setNewPartName] = useState('');
  const [newQty, setNewQty] = useState<number>(100);
  const [newCcdcSpec, setNewCcdcSpec] = useState('');
  const [newGroupName, setNewGroupName] = useState('NHÓM ĐIỆN');
  const [newReason, setNewReason] = useState('Bóc tách phát sinh quy cách tùy chỉnh');

  // Print quantities map
  const [printQuantities, setPrintQuantities] = useState<Record<string, number>>({});
  const [bulkQtyInput, setBulkQtyInput] = useState<number>(1);

  const printContainerRef = useRef<HTMLDivElement>(null);

  const currentUser = storageService.getCurrentUser();
  const isAdmin = storageService.isAdminUser(currentUser);

  useEffect(() => {
    if (isOpen) {
      loadCustomTags();
    }
  }, [isOpen]);

  const loadCustomTags = () => {
    const saved = storageService.getCustomGeneratedContainerTags();
    setCustomTags(saved);
    setSelectedTagIds(new Set(saved.map((t) => t.id)));
  };

  if (!isOpen) return null;

  const toggleSelectAll = () => {
    if (selectedTagIds.size === filteredTags.length) {
      setSelectedTagIds(new Set());
    } else {
      setSelectedTagIds(new Set(filteredTags.map((t) => t.id)));
    }
  };

  const toggleSelectTag = (id: string) => {
    const next = new Set(selectedTagIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedTagIds(next);
  };

  const getTagPrintQty = (id: string) => printQuantities[id] ?? 1;

  const handleSetTagPrintQty = (id: string, qty: number) => {
    const val = Math.max(1, Math.min(99, qty));
    setPrintQuantities((prev) => ({ ...prev, [id]: val }));
  };

  const handleApplyBulkQty = () => {
    if (bulkQtyInput < 1) return;
    const next = { ...printQuantities };
    selectedTagIds.forEach((id) => {
      next[id] = bulkQtyInput;
    });
    setPrintQuantities(next);
  };

  const handleDeleteTag = (id: string, partCode: string) => {
    if (!isAdmin) {
      alert('Chỉ tài khoản Quản trị viên (ADMIN) mới có quyền xóa thẻ thùng phát sinh!');
      return;
    }

    if (window.confirm(`Bạn có chắc chắn muốn xóa Thẻ Thùng Phát Sinh [${partCode}] khỏi hệ thống?`)) {
      storageService.deleteCustomGeneratedContainerTag(id);
      loadCustomTags();
      setMsg(`Đã xóa thẻ thùng phát sinh [${partCode}] thành công!`);
    }
  };

  const handleDeleteSelected = () => {
    if (!isAdmin) {
      alert('Chỉ tài khoản Quản trị viên (ADMIN) mới có quyền xóa thẻ thùng phát sinh!');
      return;
    }

    if (selectedTagIds.size === 0) {
      alert('Vui lòng chọn ít nhất 1 thẻ phát sinh để xóa!');
      return;
    }

    if (window.confirm(`Xác nhận xóa TẤT CẢ ${selectedTagIds.size} thẻ thùng phát sinh đã chọn? Hành động này không thể hoàn tác.`)) {
      selectedTagIds.forEach((id) => {
        storageService.deleteCustomGeneratedContainerTag(id);
      });
      loadCustomTags();
      setMsg(`Đã xóa thành công ${selectedTagIds.size} thẻ thùng phát sinh!`);
    }
  };

  const handleCreateNewTagSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartCode.trim()) {
      alert('Vui lòng nhập Mã Linh Kiện!');
      return;
    }

    const groupCfg = getPartGroupConfig(newGroupName || newPartName);
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    const newTag: CustomGeneratedContainerTag = {
      id: `custom-manual-${Date.now()}`,
      stt: `Số ${timeStr}`,
      partCode: newPartCode.trim().toUpperCase(),
      partName: newPartName.trim() || `Linh kiện ${newPartCode.trim()}`,
      standardQty: newQty > 0 ? newQty : 100,
      unit: 'cái/bộ',
      groupName: groupCfg.name,
      ccdcSpec: newCcdcSpec.trim() || `Thẻ phát sinh (${newQty} cái/bộ)`,
      groupConfig: groupCfg,
      qrPayload: `CONT_IN|${newPartCode.trim()}|${newQty}|cái/bộ|${groupCfg.id}`,
      createdAt: new Date().toISOString(),
      createdReason: newReason || 'Thẻ tạo thủ công',
      isCustomGenerated: true,
    };

    storageService.addCustomGeneratedContainerTag(newTag);
    loadCustomTags();

    // Reset form
    setNewPartCode('');
    setNewPartName('');
    setNewQty(100);
    setNewCcdcSpec('');
    setMsg(`Đã tạo thành công Thẻ Thùng Tùy Chỉnh [${newTag.partCode}]!`);
    setActiveTab('custom_list');
  };

  // Filter tags
  const filteredTags = customTags.filter((t) => {
    const q = searchTerm.toLowerCase();
    return (
      t.partName.toLowerCase().includes(q) ||
      t.partCode.toLowerCase().includes(q) ||
      t.ccdcSpec.toLowerCase().includes(q) ||
      (t.createdReason && t.createdReason.toLowerCase().includes(q))
    );
  });

  const tagsToPrint = customTags.filter((t) => selectedTagIds.has(t.id));

  const buildExpandedPrintList = (mode: 'ALL' | 'SELECTED') => {
    const targetList = mode === 'ALL' ? customTags : tagsToPrint;
    const expanded: CustomGeneratedContainerTag[] = [];
    targetList.forEach((tag) => {
      const qty = getTagPrintQty(tag.id);
      for (let i = 0; i < qty; i++) {
        expanded.push(tag);
      }
    });
    return expanded;
  };

  const totalSelectedCopies = tagsToPrint.reduce((sum, tag) => sum + getTagPrintQty(tag.id), 0);
  const totalAllCopies = customTags.reduce((sum, tag) => sum + getTagPrintQty(tag.id), 0);

  const expandedSelectedList = buildExpandedPrintList('SELECTED');
  const CARDS_PER_A4_PAGE = 8;
  const a4Pages: CustomGeneratedContainerTag[][] = [];
  for (let i = 0; i < expandedSelectedList.length; i += CARDS_PER_A4_PAGE) {
    a4Pages.push(expandedSelectedList.slice(i, i + CARDS_PER_A4_PAGE));
  }

  // 2-Sided Print Helper
  const handlePrint = (mode: 'ALL' | 'SELECTED') => {
    const expandedList = buildExpandedPrintList(mode);
    if (expandedList.length === 0) {
      alert('Chưa có Thẻ Thùng Phát Sinh nào được chọn để in!');
      return;
    }

    if (printContainerRef.current) {
      const styles = `
        @page {
          size: A4 portrait;
          margin: 8mm 10mm;
        }
        * {
          box-sizing: border-box !important;
        }
        html, body {
          margin: 0;
          padding: 0;
          width: 210mm;
          background: #fff;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          font-family: Arial, Helvetica, sans-serif;
        }
        .a4-page {
          width: 190mm;
          height: 275mm;
          box-sizing: border-box;
          page-break-after: always;
          break-after: page;
          display: grid;
          grid-template-columns: repeat(2, 90mm);
          grid-template-rows: repeat(4, 60mm);
          gap: 4mm 8mm;
          justify-content: center;
          align-content: start;
          margin: 0 auto;
        }
        .tag-card {
          width: 90mm !important;
          height: 60mm !important;
          max-width: 90mm !important;
          max-height: 60mm !important;
          box-sizing: border-box !important;
          border: 1.5px solid #000 !important;
          padding: 1.2mm 2mm !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: Arial, Helvetica, sans-serif !important;
          position: relative !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        .tag-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1.5px solid #000;
          padding-bottom: 1px;
          margin-bottom: 1px;
          height: 5.5mm;
          box-sizing: border-box;
        }
        .tag-card-title {
          font-weight: 900;
          font-size: 11.5px;
          letter-spacing: -0.2px;
          color: #000;
          white-space: nowrap;
        }
        .tag-card-stt {
          font-weight: 900;
          font-size: 10.5px;
          font-family: monospace;
          border: 1px solid #000;
          padding: 0 4px;
          background: #fff;
          white-space: nowrap;
        }
        .tag-card-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          border: 1px solid #000;
          font-size: 9.5px;
          color: #000;
          box-sizing: border-box;
        }
        .tag-card-table td {
          border: 1px solid #000;
          padding: 1px 3px;
          vertical-align: middle;
          box-sizing: border-box;
          overflow: hidden;
        }
        .lbl-cell {
          background-color: #f1f5f9 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          font-weight: 800;
          font-size: 9.5px;
          color: #000;
        }
        .tag-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 9px;
          font-family: monospace;
          color: #000;
          padding-top: 1px;
          height: 3.5mm;
          box-sizing: border-box;
        }
      `;
      printHtml(printContainerRef.current.innerHTML, styles);
    }
  };

  // Render Front Card (Mặt Trước 90mm x 60mm)
  const renderTagCardFront = (tag: CustomGeneratedContainerTag, copyIndex?: number) => {
    const grp = tag.groupConfig;
    const rawStt = tag.stt || '1';
    const displayStt = rawStt.toLowerCase().includes('số') ? rawStt : `Số ${rawStt}`;

    return (
      <div
        key={`front-${tag.id}-${copyIndex ?? 0}`}
        className="tag-card"
        style={{
          width: '90mm',
          height: '60mm',
          maxWidth: '90mm',
          maxHeight: '60mm',
          boxSizing: 'border-box',
          border: '1.5px solid #000',
          padding: '1.2mm 2mm',
          backgroundColor: '#ffffff',
          color: '#000000',
          fontFamily: 'Arial, Helvetica, sans-serif',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          pageBreakInside: 'avoid',
          breakInside: 'avoid',
        }}
      >
        <div
          className="tag-card-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1.5px solid #000',
            paddingBottom: '1px',
            marginBottom: '1px',
            height: '5.5mm',
            boxSizing: 'border-box',
          }}
        >
          <div
            className="tag-card-title"
            style={{
              fontWeight: 900,
              fontSize: '11.5px',
              letterSpacing: '-0.2px',
              color: '#000',
              whiteSpace: 'nowrap',
            }}
          >
            [SUNHOUSE - NMBD] PHIẾU THÔNG TIN
          </div>
          <div
            className="tag-card-stt"
            style={{
              fontWeight: 900,
              fontSize: '10.5px',
              fontFamily: 'monospace',
              border: '1px solid #000',
              padding: '0 3px',
              backgroundColor: '#fff',
              whiteSpace: 'nowrap',
            }}
          >
            {displayStt}
          </div>
        </div>

        <table
          className="tag-card-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            border: '1px solid #000',
            fontSize: '9.5px',
            color: '#000',
            boxSizing: 'border-box',
          }}
        >
          <colgroup>
            <col style={{ width: '21%' }} />
            <col style={{ width: '32%' }} />
            <col style={{ width: '23%' }} />
            <col style={{ width: '24%' }} />
          </colgroup>
          <tbody>
            <tr style={{ height: '6.5mm' }}>
              <td className="lbl-cell" style={{ border: '1px solid #000', padding: '1px 2px', backgroundColor: '#f1f5f9', fontWeight: 'bold', fontSize: '9.5px' }}>
                Nhóm
              </td>
              <td style={{ border: '1px solid #000', padding: '1px 2px', fontWeight: 900, fontSize: '10.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tag.groupName}
              </td>
              <td className="lbl-cell" style={{ border: '1px solid #000', padding: '1px 2px', backgroundColor: '#f1f5f9', fontWeight: 'bold', fontSize: '9.5px' }}>
                NCC
              </td>
              <td style={{ border: '1px solid #000', padding: '1px', textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ backgroundColor: grp.colorHex, color: grp.textColorHex, padding: '1px 2px', borderRadius: '3px', border: '1px solid #000', fontWeight: 900, fontSize: '9px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.1', maxHeight: '5.5mm' }}>
                  {grp.name}
                </div>
              </td>
            </tr>

            <tr style={{ height: '7.5mm' }}>
              <td className="lbl-cell" style={{ border: '1px solid #000', padding: '1px 2px', backgroundColor: '#f1f5f9', fontWeight: 'bold', fontSize: '9.5px' }}>
                Tên linh kiện
              </td>
              <td style={{ border: '1px solid #000', padding: '1px 2px', fontWeight: 900, fontSize: '10.5px', lineHeight: '1.1', wordBreak: 'break-word', overflow: 'hidden' }}>
                {tag.partName}
              </td>
              <td className="lbl-cell" style={{ border: '1px solid #000', padding: '1px 2px', backgroundColor: '#f1f5f9', fontWeight: 'bold', fontSize: '9.5px' }}>
                Quy cách CCDC
              </td>
              <td style={{ border: '1px solid #000', padding: '1px 2px', fontWeight: 900, fontSize: '10.5px' }}>
                {tag.ccdcSpec || 'Thùng dư lẻ'}
              </td>
            </tr>

            <tr style={{ height: '6.5mm' }}>
              <td className="lbl-cell" style={{ border: '1px solid #000', padding: '1px 2px', backgroundColor: '#f1f5f9', fontWeight: 'bold', fontSize: '9.5px' }}>
                Mã linh kiện
              </td>
              <td style={{ border: '1px solid #000', padding: '1px 2px', fontFamily: 'monospace', fontWeight: 900, fontSize: '10.5px', lineHeight: '1.1', wordBreak: 'break-all', overflow: 'hidden' }}>
                {tag.partCode}
              </td>
              <td className="lbl-cell" style={{ border: '1px solid #000', padding: '1px 2px', backgroundColor: '#f1f5f9', fontWeight: 'bold', fontSize: '9.5px' }}>
                Ghi chú
              </td>
              <td style={{ border: '1px solid #000', padding: '1px 2px', fontFamily: 'monospace', fontSize: '9px' }}>
                Phát sinh
              </td>
            </tr>

            <tr style={{ height: '6.5mm' }}>
              <td className="lbl-cell" style={{ border: '1px solid #000', padding: '1px 2px', backgroundColor: '#f1f5f9', fontWeight: 'bold', fontSize: '9.5px' }}>
                Số lượng
              </td>
              <td style={{ border: '1px solid #000', padding: '1px 2px', fontWeight: 900, fontSize: '13px', color: '#1e3a8a' }}>
                {tag.standardQty}
              </td>
              <td className="lbl-cell" style={{ border: '1px solid #000', padding: '1px 2px', backgroundColor: '#f1f5f9', fontWeight: 'bold', fontSize: '9.5px' }}>
                ĐVT
              </td>
              <td style={{ border: '1px solid #000', padding: '1px 2px', fontWeight: 900, fontSize: '10.5px' }}>
                {tag.unit || 'cái/bộ'}
              </td>
            </tr>

            <tr style={{ height: '6.5mm' }}>
              <td className="lbl-cell" style={{ border: '1px solid #000', padding: '1px 2px', backgroundColor: '#f1f5f9', fontWeight: 'bold', fontSize: '9.5px' }}>
                Khối lượng
              </td>
              <td style={{ border: '1px solid #000', padding: '1px 2px', fontWeight: 'bold', fontSize: '10px' }}>
                -
              </td>
              <td className="lbl-cell" style={{ border: '1px solid #000', padding: '1px 2px', backgroundColor: '#f1f5f9', fontWeight: 'bold', fontSize: '9.5px' }}>
                Tần suất
              </td>
              <td style={{ border: '1px solid #000', padding: '1px 2px', fontWeight: 900, fontSize: '10px' }}>
                1h / 1 lần
              </td>
            </tr>

            <tr style={{ height: '12mm' }}>
              <td className="lbl-cell" style={{ border: '1px solid #000', padding: '1px 2px', backgroundColor: '#f1f5f9', fontWeight: 'bold', fontSize: '9.5px' }}>
                Mã vạch QR
              </td>
              <td style={{ border: '1px solid #000', padding: '1px', textAlign: 'center', backgroundColor: '#ffffff', verticalAlign: 'middle' }}>
                <div style={{ display: 'inline-block', padding: '1px 3px', backgroundColor: '#eff6ff', border: '1px dashed #2563eb', borderRadius: '2px', textAlign: 'center', lineHeight: 1.1 }}>
                  <span style={{ fontSize: '9px', fontWeight: 900, color: '#1e40af' }}>MẶT SAU</span>
                  <br />
                  <span style={{ fontSize: '7.5px', fontWeight: 'bold', color: '#2563eb' }}>(QR 30x30mm)</span>
                </div>
              </td>
              <td className="lbl-cell" style={{ border: '1px solid #000', padding: '1px 2px', backgroundColor: '#f1f5f9', fontWeight: 'bold', fontSize: '9.5px' }}>
                Thời gian cần thực
              </td>
              <td style={{ border: '1px solid #000', padding: '1px 2px', fontFamily: 'monospace', fontSize: '9px' }}>
                ......(h)
              </td>
            </tr>
          </tbody>
        </table>

        <div className="tag-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', fontFamily: 'monospace', color: '#000', paddingTop: '1px', height: '3.5mm', boxSizing: 'border-box' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65mm' }}>
            Payload: {tag.qrPayload}
          </span>
          <span style={{ fontWeight: 'bold' }}>NMBD - SUNHOUSE</span>
        </div>
      </div>
    );
  };

  // Render Back Card (Mặt Sau 90mm x 60mm with 30x30mm QR code centered)
  const renderTagCardBack = (tag: CustomGeneratedContainerTag | null, copyIndex?: number) => {
    if (!tag) {
      return (
        <div
          key={`empty-back-${Math.random()}`}
          style={{
            width: '90mm',
            height: '60mm',
            maxWidth: '90mm',
            maxHeight: '60mm',
            boxSizing: 'border-box',
            border: '1.5px dashed #cbd5e1',
            backgroundColor: '#ffffff',
          }}
        />
      );
    }

    return (
      <div
        key={`back-${tag.id}-${copyIndex ?? 0}`}
        className="tag-card-back"
        style={{
          width: '90mm',
          height: '60mm',
          maxWidth: '90mm',
          maxHeight: '60mm',
          boxSizing: 'border-box',
          border: '1.5px solid #000',
          padding: '2.5mm',
          backgroundColor: '#ffffff',
          color: '#000000',
          fontFamily: 'Arial, Helvetica, sans-serif',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          pageBreakInside: 'avoid',
          breakInside: 'avoid',
        }}
      >
        <div
          style={{
            fontWeight: 900,
            fontSize: '11px',
            color: '#000',
            maxWidth: '84mm',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
            marginBottom: '1px',
          }}
          title={tag.partName}
        >
          {tag.partName}
        </div>

        <div
          style={{
            fontFamily: 'monospace',
            fontWeight: 900,
            fontSize: '11px',
            color: '#000',
            letterSpacing: '0.3px',
            marginBottom: '1.5mm',
          }}
        >
          MÃ LINH KIỆN: {tag.partCode}
        </div>

        <div
          style={{
            width: '30mm',
            height: '30mm',
            border: '1px solid #000',
            padding: '1mm',
            backgroundColor: '#fff',
            borderRadius: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          <QRCodeSVG
            value={tag.qrPayload}
            size={106}
            style={{ width: '28mm', height: '28mm' }}
            level="M"
            includeMargin={false}
          />
        </div>

        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '8px',
            fontWeight: 'bold',
            color: '#000',
            marginTop: '1.5mm',
            letterSpacing: '-0.2px',
          }}
        >
          MÃ QR THẺ THÙNG KITTING (SL: {tag.standardQty} {tag.unit})
        </div>
      </div>
    );
  };

  // Mirrored Back Page helper for duplex printing
  const getMirroredBackCards = (frontCards: CustomGeneratedContainerTag[]): (CustomGeneratedContainerTag | null)[] => {
    const backCards: (CustomGeneratedContainerTag | null)[] = new Array(8).fill(null);
    for (let r = 0; r < 4; r++) {
      const frontLeft = frontCards[r * 2 + 0] || null;
      const frontRight = frontCards[r * 2 + 1] || null;

      // Duplex horizontal flip alignment: Left on front = Right on back
      backCards[r * 2 + 0] = frontRight;
      backCards[r * 2 + 1] = frontLeft;
    }
    return backCards;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* Modal Top Banner */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-400 text-slate-950 rounded-2xl shadow-md shrink-0">
              <Tag className="w-6 h-6 font-black" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white flex items-center space-x-2">
                <span>QUẢN LÝ THẺ THÙNG PHÁT SINH (SỐ LƯỢNG TÙY CHỈNH)</span>
                <span className="px-2.5 py-0.5 bg-amber-400 text-slate-950 text-xs font-black rounded-full">
                  {customTags.length} Thẻ
                </span>
              </h3>
              <p className="text-xs text-purple-200">
                Lưu trữ độc lập các thẻ sinh ra khi bóc tách khác định mức. Hỗ trợ <strong>In 2 mặt A4 (Mã QR 30x30mm)</strong> &amp; Xóa (Chỉ Admin).
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => handlePrint('SELECTED')}
              disabled={tagsToPrint.length === 0}
              className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-black rounded-xl shadow-lg transition-all cursor-pointer ${
                tagsToPrint.length > 0
                  ? 'bg-amber-400 hover:bg-amber-500 text-slate-950'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>In {tagsToPrint.length} Thẻ ({totalSelectedCopies} Bản)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-white/20 text-white rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="p-3 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-slate-200 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => setActiveTab('custom_list')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'custom_list'
                    ? 'bg-white text-purple-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Package className="w-4 h-4 text-purple-600" />
                <span>1. Danh Sách Thẻ Phát Sinh ({customTags.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('create_new')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'create_new'
                    ? 'bg-white text-purple-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PlusCircle className="w-4 h-4 text-emerald-600" />
                <span>2. + Tạo Thẻ Tùy Chỉnh Mới</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('print_preview')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'print_preview'
                    ? 'bg-white text-purple-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Printer className="w-4 h-4 text-amber-600" />
                <span>3. Xem Mẫu In 2 Mặt ({totalSelectedCopies} Thẻ)</span>
              </button>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={selectedTagIds.size === 0}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              <span>Xóa Thẻ Đã Chọn ({selectedTagIds.size}) [Admin]</span>
            </button>
          )}
        </div>

        {msg && (
          <div className="px-4 py-2 bg-emerald-100 border-b border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{msg}</span>
            </div>
            <button
              onClick={() => setMsg(null)}
              className="text-emerald-700 font-black text-sm cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden p-4 bg-slate-50">
          {activeTab === 'custom_list' ? (
            <div className="h-full flex flex-col space-y-3">
              {/* Controls bar */}
              <div className="p-3 bg-white rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Tìm theo Mã LK, Tên LK, Quy cách hoặc Lý do..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-100 text-xs rounded-xl border-none focus:ring-2 focus:ring-purple-500 font-medium"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer"
                  >
                    {selectedTagIds.size === filteredTags.length && filteredTags.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-purple-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span>Chọn tất cả ({filteredTags.length})</span>
                  </button>

                  <div className="flex items-center space-x-1 pl-2 border-l border-slate-200">
                    <span className="text-xs font-bold text-slate-500">In bulk:</span>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={bulkQtyInput}
                      onChange={(e) => setBulkQtyInput(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-12 px-1.5 py-1 text-center bg-slate-100 text-xs font-bold rounded-lg border-none"
                    />
                    <button
                      type="button"
                      onClick={handleApplyBulkQty}
                      className="px-2 py-1 bg-purple-700 hover:bg-purple-800 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                    >
                      Gán
                    </button>
                  </div>
                </div>
              </div>

              {/* Table list */}
              <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xs">
                {filteredTags.length === 0 ? (
                  <div className="text-center py-16 text-slate-500">
                    <Tag className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-sm">Chưa có Thẻ Thùng Phát Sinh nào!</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Thẻ phát sinh tự động khởi tạo khi bạn bóc tách Kitting với số lượng khác định mức chuẩn.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 sticky top-0 z-10">
                      <tr>
                        <th className="p-3 w-10 text-center">In</th>
                        <th className="p-3 font-bold">Mã Linh Kiện</th>
                        <th className="p-3 font-bold">Tên Linh Kiện</th>
                        <th className="p-3 text-center font-bold">Số Lượng Phát Sinh</th>
                        <th className="p-3 font-bold">Quy Cách CCDC / Lý Do</th>
                        <th className="p-3 text-center font-bold">Thời Gian Tạo</th>
                        <th className="p-3 text-center font-bold w-20">Số Bản In</th>
                        <th className="p-3 text-center font-bold w-28">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTags.map((tag) => {
                        const isSelected = selectedTagIds.has(tag.id);
                        return (
                          <tr
                            key={tag.id}
                            className={`hover:bg-purple-50/50 transition-colors ${
                              isSelected ? 'bg-purple-50/30' : ''
                            }`}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectTag(tag.id)}
                                className="w-4 h-4 text-purple-600 rounded cursor-pointer"
                              />
                            </td>
                            <td className="p-3 font-mono font-black text-purple-950">
                              {tag.partCode}
                            </td>
                            <td className="p-3 font-bold text-slate-900 max-w-xs truncate">
                              {tag.partName}
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-2.5 py-1 bg-purple-100 text-purple-900 font-black rounded-lg text-xs">
                                {tag.standardQty} {tag.unit}
                              </span>
                            </td>
                            <td className="p-3 text-slate-600">
                              <div className="font-bold text-slate-800">{tag.ccdcSpec}</div>
                              {tag.createdReason && (
                                <div className="text-[10px] text-purple-700 italic">
                                  {tag.createdReason}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-center text-slate-500 font-mono text-[11px]">
                              {tag.createdAt
                                ? new Date(tag.createdAt).toLocaleString('vi-VN', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '-'}
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="number"
                                min="1"
                                max="99"
                                value={getTagPrintQty(tag.id)}
                                onChange={(e) => handleSetTagPrintQty(tag.id, parseInt(e.target.value) || 1)}
                                className="w-12 px-1 py-1 text-center font-bold border border-slate-300 rounded text-xs"
                              />
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center space-x-1.5">
                                {onSelectTagForKitting && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onSelectTagForKitting(tag);
                                      onClose();
                                    }}
                                    className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-bold text-[11px] cursor-pointer"
                                    title="Dùng thẻ này cho Bóc tách"
                                  >
                                    Chọn
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleDeleteTag(tag.id, tag.partCode)}
                                  className={`p-1.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                                    isAdmin
                                      ? 'bg-rose-50 text-rose-700 hover:bg-rose-200'
                                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  }`}
                                  title={isAdmin ? 'Xóa thẻ thùng phát sinh' : 'Chỉ Admin mới có quyền xóa'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : activeTab === 'create_new' ? (
            <div className="max-w-2xl mx-auto bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <div className="border-b border-slate-200 pb-3 flex items-center space-x-2">
                <PlusCircle className="w-5 h-5 text-purple-600" />
                <h4 className="font-extrabold text-sm text-slate-900 uppercase">
                  TẠO THỦ CÔNG THẺ THÙNG PHÁT SINH (QUY CÁCH TÙY CHỈNH)
                </h4>
              </div>

              <form onSubmit={handleCreateNewTagSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mã Linh Kiện *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: 04-29-05-SHA76210KL-9999"
                    value={newPartCode}
                    onChange={(e) => setNewPartCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tên Linh Kiện</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Cụm dây điện nối dài phát sinh lẻ"
                    value={newPartName}
                    onChange={(e) => setNewPartName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Số Lượng Phát Sinh (cái/bộ) *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={newQty}
                      onChange={(e) => setNewQty(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-black text-purple-900 focus:bg-white focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nhóm Linh Kiện</label>
                    <select
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:bg-white"
                    >
                      <option value="NHÓM ĐIỆN">Nhóm điện</option>
                      <option value="Nhóm cao su, silicon">Nhóm cao su, silicon</option>
                      <option value="Nhóm vít/bulong các loại">Nhóm vít/bulong các loại</option>
                      <option value="Nhóm phụ kiện lõi lọc">Nhóm phụ kiện lõi lọc</option>
                      <option value="Nhóm đồng, nhôm">Nhóm đồng, nhôm</option>
                      <option value="Nhóm nhựa">Nhóm nhựa</option>
                      <option value="Nhóm bao bì, xốp, thùng">Nhóm bao bì, xốp, thùng</option>
                      <option value="Nhóm tem, nhãn, sách">Nhóm tem, nhãn, sách</option>
                      <option value="Nhóm kim loại">Nhóm kim loại</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Quy Cách CCDC / Thùng</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Thùng SB026 lẻ 350 cái/bộ"
                    value={newCcdcSpec}
                    onChange={(e) => setNewCcdcSpec(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ghi Chú / Lý Do</label>
                  <input
                    type="text"
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 focus:bg-white"
                  />
                </div>

                <div className="pt-3 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('custom_list')}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white font-black rounded-xl shadow-md cursor-pointer"
                  >
                    + Tạo Thẻ &amp; Lưu Lưu Trữ
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* PRINT PREVIEW TAB (2-Sided Print Preview) */
            <div className="h-full flex flex-col space-y-3">
              <div className="p-3 bg-white rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center space-x-2">
                  <Printer className="w-5 h-5 text-amber-600" />
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900">
                      XEM TRƯỚC MẪU IN THẺ THÙNG PHÁT SINH 2 MẶT (A4 PORTRAIT - CỠ MÃ QR 30x30mm MẶT SAU)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Đã chọn {tagsToPrint.length} mã thẻ phát sinh ({totalSelectedCopies} bản in). In 2 mặt A4 tự động căn lật khớp đúng vị trí.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handlePrint('SELECTED')}
                    disabled={tagsToPrint.length === 0}
                    className="px-4 py-2 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>In {tagsToPrint.length} Mã Thẻ ({totalSelectedCopies} Bản A4 2 Mặt)</span>
                  </button>
                </div>
              </div>

              {/* Printable Pages Container */}
              <div className="flex-1 overflow-y-auto bg-slate-200/80 p-6 rounded-2xl border border-slate-300 space-y-10">
                <div ref={printContainerRef} className="space-y-10">
                  {a4Pages.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 font-bold">
                      Chưa chọn thẻ phát sinh nào để xem trước mẫu in 2 mặt A4!
                    </div>
                  ) : (
                    a4Pages.map((pageCards, pageIdx) => {
                      const backPageCards = getMirroredBackCards(pageCards);
                      return (
                        <div key={pageIdx} className="max-w-[210mm] mx-auto space-y-6">
                          {/* FRONT PAGE SHEET */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-2 print:hidden">
                              <span className="flex items-center space-x-2">
                                <span className="px-2.5 py-0.5 bg-blue-900 text-white rounded font-mono text-[11px]">
                                  MẶT TRƯỚC - TRANG A4 #{pageIdx * 2 + 1}
                                </span>
                                <span>Phiếu Thông Tin (Chứa {pageCards.length} Thẻ)</span>
                              </span>
                              <span className="text-slate-500 text-[11px]">Khổ A4 Portrait (90mm x 60mm)</span>
                            </div>

                            <div
                              className="a4-page bg-white p-4 shadow-xl rounded-xl border border-slate-300 mx-auto"
                              style={{
                                width: '190mm',
                                minHeight: '270mm',
                                boxSizing: 'border-box',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 90mm)',
                                gridAutoRows: '60mm',
                                gap: '4mm 8mm',
                                justifyContent: 'center',
                                alignContent: 'start',
                              }}
                            >
                              {pageCards.map((tag, cardIdx) => renderTagCardFront(tag, pageIdx * 8 + cardIdx))}
                            </div>
                          </div>

                          {/* BACK PAGE SHEET */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-purple-900 px-2 print:hidden">
                              <span className="flex items-center space-x-2">
                                <span className="px-2.5 py-0.5 bg-purple-900 text-white rounded font-mono text-[11px]">
                                  MẶT SAU - TRANG A4 #{pageIdx * 2 + 2} (MÃ QR 30x30mm)
                                </span>
                                <span>Căn lật ngang khớp vị trí thẻ mặt trước</span>
                              </span>
                              <span className="text-purple-700 text-[11px]">Duplex Mirror Alignment</span>
                            </div>

                            <div
                              className="a4-page bg-white p-4 shadow-xl rounded-xl border border-purple-300 mx-auto"
                              style={{
                                width: '190mm',
                                minHeight: '270mm',
                                boxSizing: 'border-box',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 90mm)',
                                gridAutoRows: '60mm',
                                gap: '4mm 8mm',
                                justifyContent: 'center',
                                alignContent: 'start',
                              }}
                            >
                              {backPageCards.map((tag, cardIdx) => renderTagCardBack(tag, pageIdx * 8 + cardIdx))}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
