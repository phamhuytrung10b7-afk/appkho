import React, { useState, useRef, useEffect } from 'react';
import { MasterKittingTag, parseMasterExcel } from './masterExcelParser';
import { PART_GROUP_COLORS, getPartGroupConfig } from './partGroupColors';
import { QRCodeSVG } from 'qrcode.react';
import { printHtml } from './printHelper';
import { storageService } from './storage';
import {
  FileSpreadsheet,
  Upload,
  Printer,
  X,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Tag,
  Package,
  Layers,
  Search,
  Check,
  Palette,
  RefreshCw,
  Sliders,
  CheckSquare,
  Square,
  Info,
  Copy,
  Plus,
  Minus,
} from 'lucide-react';

interface ContainerTagManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTagForKitting?: (tag: MasterKittingTag) => void;
}

export const ContainerTagManagerModal: React.FC<ContainerTagManagerModalProps> = ({
  isOpen,
  onClose,
  onSelectTagForKitting,
}) => {
  const [tags, setTags] = useState<MasterKittingTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'master_data' | 'color_config' | 'print_preview'>('master_data');
  const [addedMsg, setAddedMsg] = useState<string | null>(null);

  // Custom print quantities per tag ID (default 1)
  const [printQuantities, setPrintQuantities] = useState<Record<string, number>>({});
  const [bulkQtyInput, setBulkQtyInput] = useState<number>(1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const printContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const saved = storageService.getMasterContainerTags();
      setTags(saved);
      // Select all by default
      setSelectedTagIds(new Set(saved.map((t) => t.id)));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const result = parseMasterExcel(buffer);
        if (result.tags.length === 0) {
          alert('Không tìm thấy dữ liệu linh kiện hợp lệ trong file Excel Master Data!');
          return;
        }

        storageService.saveMasterContainerTags(result.tags);
        setTags(result.tags);
        setSelectedTagIds(new Set(result.tags.map((t) => t.id)));
        setAddedMsg(`Đã tải thành công ${result.tags.length} Thẻ Thùng Master từ file Excel!`);
        setActiveTab('master_data');
      } catch (err: any) {
        console.error('Lỗi đọc file Master Excel:', err);
        alert('Lỗi đọc file Excel Master Data: ' + (err.message || 'Sai định dạng'));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleResetSampleData = () => {
    if (confirm('Khôi phục danh sách Master Data Thẻ Thùng mẫu chuẩn SUNHOUSE NMBD (10+ Linh Kiện)?')) {
      const reset = storageService.resetMasterContainerTags();
      setTags(reset);
      setSelectedTagIds(new Set(reset.map((t) => t.id)));
      setAddedMsg('Đã khôi phục Master Data mẫu chuẩn nhà máy SUNHOUSE NMBD!');
    }
  };

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

  // Filter tags
  const filteredTags = tags.filter((t) => {
    const matchesSearch =
      t.partName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.partCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.groupName && t.groupName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      t.ccdcSpec.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.stt.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesGroup =
      selectedGroupFilter === 'ALL' ||
      t.groupConfig.id === selectedGroupFilter ||
      (t.groupName && t.groupName.toLowerCase() === selectedGroupFilter.toLowerCase());

    return matchesSearch && matchesGroup;
  });

  // Selected tags for printing
  const tagsToPrint = tags.filter((t) => selectedTagIds.has(t.id));

  // Build expanded list according to custom print quantity per tag
  const buildExpandedPrintList = (mode: 'ALL' | 'SELECTED') => {
    const targetList = mode === 'ALL' ? tags : tagsToPrint;
    const expanded: MasterKittingTag[] = [];
    targetList.forEach((tag) => {
      const qty = getTagPrintQty(tag.id);
      for (let i = 0; i < qty; i++) {
        expanded.push(tag);
      }
    });
    return expanded;
  };

  const totalSelectedCopies = tagsToPrint.reduce((sum, tag) => sum + getTagPrintQty(tag.id), 0);
  const totalAllCopies = tags.reduce((sum, tag) => sum + getTagPrintQty(tag.id), 0);

  // Group expanded tags into A4 sheets (8 cards per page: 2 columns x 4 rows)
  const expandedSelectedList = buildExpandedPrintList('SELECTED');
  const CARDS_PER_A4_PAGE = 8;
  const a4Pages: MasterKittingTag[][] = [];
  for (let i = 0; i < expandedSelectedList.length; i += CARDS_PER_A4_PAGE) {
    a4Pages.push(expandedSelectedList.slice(i, i + CARDS_PER_A4_PAGE));
  }

  const handlePrint = (mode: 'ALL' | 'SELECTED') => {
    const expandedList = buildExpandedPrintList(mode);
    if (expandedList.length === 0) {
      alert('Chưa có Thẻ Thùng nào được chọn để in!');
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
          font-size: 12.5px;
          letter-spacing: -0.2px;
          color: #000;
          white-space: nowrap;
        }
        .tag-card-stt {
          font-weight: 900;
          font-size: 11px;
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
          border: 1.5px solid #000;
          font-size: 10.5px;
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
          font-size: 10.5px;
          color: #000;
        }
        .tag-card-footer {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          font-size: 10px;
          font-family: Arial, sans-serif;
          font-weight: 900;
          color: #000;
          padding-top: 1px;
          height: 3.5mm;
          box-sizing: border-box;
        }
      `;
      printHtml(printContainerRef.current.innerHTML, styles);
    }
  };

  // Render a single 90mm x 60mm Tag Card based on Photo 4
  const renderTagCard = (tag: MasterKittingTag, copyIndex?: number) => {
    const grp = tag.groupConfig;

    // Clean STT string to prevent double "Số Số 1"
    const rawStt = tag.stt || '1';
    const displayStt = rawStt.toLowerCase().includes('số') ? rawStt : `Số ${rawStt}`;

    // Dynamic auto-scaling font size for long part names and codes (larger & optimized)
    const getPartNameFontSize = (text: string) => {
      if (text.length > 40) return '9.5px';
      if (text.length > 25) return '10.5px';
      if (text.length > 15) return '11.5px';
      return '12.5px';
    };

    const getPartCodeFontSize = (text: string) => {
      if (text.length > 30) return '9.5px';
      if (text.length > 20) return '10.5px';
      if (text.length > 14) return '11.5px';
      return '12.5px';
    };

    return (
      <div
        key={`${tag.id}-${copyIndex ?? 0}`}
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
        {/* Header Title & STT Box */}
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
              fontSize: '12.5px',
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
              fontSize: '11px',
              fontFamily: 'monospace',
              border: '1px solid #000',
              padding: '0 4px',
              backgroundColor: '#fff',
              whiteSpace: 'nowrap',
            }}
          >
            {displayStt}
          </div>
        </div>

        {/* 6-Row Grid Table (Strictly bounded 90mm x 60mm layout) */}
        <table
          className="tag-card-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            border: '1.5px solid #000',
            fontSize: '10.5px',
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
            {/* Row 1: Nhóm | Nhóm tên | NCC | Color Pill */}
            <tr style={{ height: '6.5mm' }}>
              <td
                className="lbl-cell"
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  backgroundColor: '#f1f5f9',
                  fontWeight: 800,
                  fontSize: '10.5px',
                }}
              >
                Nhóm
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  fontWeight: 900,
                  fontSize: '11.5px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {tag.groupName}
              </td>
              <td
                className="lbl-cell"
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  backgroundColor: '#f1f5f9',
                  fontWeight: 800,
                  fontSize: '10.5px',
                }}
              >
                NCC
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '1px',
                  textAlign: 'center',
                  verticalAlign: 'middle',
                }}
              >
                <div
                  style={{
                    backgroundColor: grp.colorHex,
                    color: grp.textColorHex,
                    padding: '1.5px 3px',
                    borderRadius: '3px',
                    border: '1px solid #000',
                    fontWeight: 900,
                    fontSize: '10px',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: '1.15',
                    maxHeight: '5.5mm',
                  }}
                >
                  {grp.name}
                </div>
              </td>
            </tr>

            {/* Row 2: Tên linh kiện | Value | Quy cách CCDC | Value */}
            <tr style={{ height: '7.5mm' }}>
              <td
                className="lbl-cell"
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  backgroundColor: '#f1f5f9',
                  fontWeight: 800,
                  fontSize: '10.5px',
                }}
              >
                Tên linh kiện
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  fontWeight: 900,
                  fontSize: getPartNameFontSize(tag.partName || ''),
                  lineHeight: '1.15',
                  wordBreak: 'break-word',
                  overflow: 'hidden',
                  maxHeight: '7.5mm',
                }}
              >
                {tag.partName}
              </td>
              <td
                className="lbl-cell"
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  backgroundColor: '#f1f5f9',
                  fontWeight: 800,
                  fontSize: '10.5px',
                }}
              >
                Quy cách CCDC
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  fontWeight: 900,
                  fontSize: '12px',
                }}
              >
                {tag.ccdcSpec || '0'}
              </td>
            </tr>

            {/* Row 3: Mã linh kiện | Value | Ghi chú | Số ...... */}
            <tr style={{ height: '6.5mm' }}>
              <td
                className="lbl-cell"
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  backgroundColor: '#f1f5f9',
                  fontWeight: 800,
                  fontSize: '10.5px',
                }}
              >
                Mã linh kiện
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  fontFamily: 'monospace',
                  fontWeight: 900,
                  fontSize: getPartCodeFontSize(tag.partCode || ''),
                  lineHeight: '1.15',
                  wordBreak: 'break-all',
                  overflow: 'hidden',
                }}
              >
                {tag.partCode}
              </td>
              <td
                className="lbl-cell"
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  backgroundColor: '#f1f5f9',
                  fontWeight: 800,
                  fontSize: '10.5px',
                }}
              >
                Ghi chú
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: '10px',
                }}
              >
                Số ......
              </td>
            </tr>

            {/* Row 4: Số lượng | Value | ĐVT | Value */}
            <tr style={{ height: '6.5mm' }}>
              <td
                className="lbl-cell"
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  backgroundColor: '#f1f5f9',
                  fontWeight: 800,
                  fontSize: '10.5px',
                }}
              >
                Số lượng
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  fontWeight: 900,
                  fontSize: '14.5px',
                }}
              >
                {tag.standardQty > 0 ? tag.standardQty : ''}
              </td>
              <td
                className="lbl-cell"
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  backgroundColor: '#f1f5f9',
                  fontWeight: 800,
                  fontSize: '10.5px',
                }}
              >
                ĐVT
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  fontWeight: 900,
                  fontSize: '11.5px',
                }}
              >
                {tag.unit || 'cái/bộ'}
              </td>
            </tr>

            {/* Row 5: Khối lượng | - | Tần suất | 1h / 1 lần */}
            <tr style={{ height: '6.5mm' }}>
              <td
                className="lbl-cell"
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  backgroundColor: '#f1f5f9',
                  fontWeight: 800,
                  fontSize: '10.5px',
                }}
              >
                Khối lượng
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  fontWeight: 900,
                  fontSize: '11px',
                }}
              >
                -
              </td>
              <td
                className="lbl-cell"
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  backgroundColor: '#f1f5f9',
                  fontWeight: 800,
                  fontSize: '10.5px',
                }}
              >
                Tần suất
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  fontWeight: 900,
                  fontSize: '11px',
                }}
              >
                {tag.mfgFrequency || '1h / 1 lần'}
              </td>
            </tr>

            {/* Row 6: Mã vạch QR | QR SVG | Thời gian cần thực | ......(h) */}
            <tr style={{ height: '12mm' }}>
              <td
                className="lbl-cell"
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  backgroundColor: '#f1f5f9',
                  fontWeight: 800,
                  fontSize: '10.5px',
                }}
              >
                Mã vạch QR
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '1px',
                  textAlign: 'center',
                  backgroundColor: '#ffffff',
                  verticalAlign: 'middle',
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    padding: '2px 4px',
                    backgroundColor: '#eff6ff',
                    border: '1px dashed #2563eb',
                    borderRadius: '3px',
                    textAlign: 'center',
                    lineHeight: 1.15,
                  }}
                >
                  <span style={{ fontSize: '10px', fontWeight: 900, color: '#1e40af' }}>
                    MẶT SAU
                  </span>
                  <br />
                  <span style={{ fontSize: '8.5px', fontWeight: 800, color: '#2563eb' }}>
                    (QR 30x30mm)
                  </span>
                </div>
              </td>
              <td
                className="lbl-cell"
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  backgroundColor: '#f1f5f9',
                  fontWeight: 800,
                  fontSize: '10.5px',
                }}
              >
                Thời gian cần thực
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '1px 3px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: '10px',
                }}
              >
                ......(h)
              </td>
            </tr>
          </tbody>
        </table>

        {/* Footer: NMBD - SUNHOUSE (Cleanly removed payload string) */}
        <div
          className="tag-card-footer"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            fontSize: '10px',
            fontFamily: 'Arial, Helvetica, sans-serif',
            color: '#000',
            paddingTop: '1px',
            height: '3.5mm',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontWeight: 900, letterSpacing: '0.5px' }}>
            NMBD - SUNHOUSE
          </span>
        </div>
      </div>
    );
  };

  // Render Back Tag Card (Mặt Sau 90mm x 60mm with 30x30mm QR code centered)
  const renderTagCardBack = (tag: MasterKittingTag | null, copyIndex?: number) => {
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
          MÃ QR THẺ THÙNG KITTING (IN 2 MẶT A4)
        </div>
      </div>
    );
  };

  // Mirrored Back Page helper for duplex printing
  const getMirroredBackCards = (frontCards: MasterKittingTag[]): (MasterKittingTag | null)[] => {
    const backCards: (MasterKittingTag | null)[] = new Array(8).fill(null);
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
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden">
        {/* Header Banner */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-300 rounded-2xl backdrop-blur-md border border-blue-400/20">
              <Tag className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-extrabold text-base sm:text-lg">
                  QUẢN LÝ THẺ THÙNG (CONTAINER TAG) & MÃ MÀU BÓC TÁCH SMART
                </h3>
                <span className="px-2.5 py-0.5 text-[10px] bg-emerald-500 text-white font-black rounded-full uppercase tracking-wider">
                  SUNHOUSE - NMBD
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-0.5">
                Kích thước thẻ <strong>90mm x 60mm</strong>. Tối ưu xếp <strong>8 thẻ / 1 trang A4</strong>. Cho phép chọn số lượng bản in từng thẻ linh hoạt.
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
              <span>In {tagsToPrint.length} Thẻ Đã Chọn ({totalSelectedCopies} Bản)</span>
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

        {/* Tab Switcher & Actions Bar */}
        <div className="p-3 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-slate-200 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => setActiveTab('master_data')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'master_data'
                    ? 'bg-white text-blue-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>1. Danh Sách Master Data ({tags.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('color_config')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'color_config'
                    ? 'bg-white text-blue-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Palette className="w-4 h-4 text-emerald-600" />
                <span>2. Bảng Mã Màu 9 Nhóm Linh Kiện</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('print_preview')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'print_preview'
                    ? 'bg-white text-blue-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Printer className="w-4 h-4 text-amber-600" />
                <span>3. Xem Mẫu In "PHIẾU THÔNG TIN" ({totalSelectedCopies} Thẻ)</span>
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Import Master Data Excel</span>
            </button>

            <button
              type="button"
              onClick={handleResetSampleData}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center space-x-1 cursor-pointer"
              title="Khôi phục dữ liệu mẫu SUNHOUSE NMBD"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Khôi Phục Mẫu</span>
            </button>
          </div>
        </div>

        {addedMsg && (
          <div className="px-4 py-2 bg-emerald-100 border-b border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{addedMsg}</span>
            </div>
            <button
              onClick={() => setAddedMsg(null)}
              className="text-emerald-700 hover:text-emerald-950 font-extrabold cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-hidden p-4 bg-slate-50">
          {activeTab === 'master_data' ? (
            <div className="h-full flex flex-col space-y-3">
              {/* Search & Bulk Quantity Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center space-x-2 flex-1 min-w-[260px]">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Tìm theo Tên linh kiện, Mã linh kiện, Quy cách CCDC, Số..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                  />
                </div>

                <div className="flex items-center space-x-3">
                  {/* Bulk Quantity Setter */}
                  <div className="flex items-center space-x-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
                    <span className="font-bold text-slate-600 text-[11px] pl-1">
                      Gán SL in cho thẻ đã chọn:
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={bulkQtyInput}
                      onChange={(e) => setBulkQtyInput(parseInt(e.target.value) || 1)}
                      className="w-12 px-1.5 py-0.5 bg-white border border-slate-300 rounded font-bold text-center text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleApplyBulkQty}
                      className="px-2 py-0.5 bg-blue-700 hover:bg-blue-800 text-white rounded font-bold text-[11px] cursor-pointer"
                    >
                      Áp Dụng
                    </button>
                  </div>

                  <span className="text-xs font-bold text-slate-500">Lọc Nhóm:</span>
                  <select
                    value={selectedGroupFilter}
                    onChange={(e) => setSelectedGroupFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-extrabold text-slate-800 focus:bg-white outline-hidden cursor-pointer"
                  >
                    <option value="ALL">-- Tất cả 9 nhóm linh kiện --</option>
                    {Object.values(PART_GROUP_COLORS).map((grp) => (
                      <option key={grp.id} value={grp.id}>
                        {grp.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center space-x-1 cursor-pointer"
                  >
                    {selectedTagIds.size === filteredTags.length ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span>
                      {selectedTagIds.size === filteredTags.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Master Data Table */}
              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl bg-white shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={selectedTagIds.size === filteredTags.length && filteredTags.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </th>
                      <th className="p-3 w-14 text-center">STT</th>
                      <th className="p-3">Nhóm Linh Kiện</th>
                      <th className="p-3">Tên Linh Kiện</th>
                      <th className="p-3 font-mono">Mã Linh Kiện</th>
                      <th className="p-3">Quy Cách CCDC</th>
                      <th className="p-3 text-center">Định Mức (SL/ĐVT)</th>
                      <th className="p-3 text-center w-32 bg-amber-50/80 text-amber-900 border-x border-amber-200">
                        SL Bản In (Thẻ)
                      </th>
                      <th className="p-3">Chuỗi QR Standard</th>
                      <th className="p-3 text-center w-28">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTags.map((tag) => {
                      const isSelected = selectedTagIds.has(tag.id);
                      const grp = tag.groupConfig;
                      const printQty = getTagPrintQty(tag.id);

                      return (
                        <tr
                          key={tag.id}
                          onClick={() => toggleSelectTag(tag.id)}
                          className={`hover:bg-blue-50/50 transition-colors cursor-pointer ${
                            isSelected ? 'bg-blue-50/70' : ''
                          }`}
                        >
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectTag(tag.id)}
                              className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-slate-500">{tag.stt || '-'}</td>
                          <td className="p-3">
                            <span
                              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-black shadow-2xs"
                              style={{
                                backgroundColor: grp.colorHex,
                                color: grp.textColorHex,
                              }}
                            >
                              <span>●</span>
                              <span>{tag.groupName || grp.name}</span>
                            </span>
                          </td>
                          <td className="p-3 font-extrabold text-slate-900">{tag.partName || '-'}</td>
                          <td className="p-3 font-mono font-bold text-blue-700">{tag.partCode || '-'}</td>
                          <td className="p-3 font-medium text-slate-700">{tag.ccdcSpec || ''}</td>
                          <td className="p-3 text-center font-black rounded-lg">
                            {tag.standardQty > 0 ? (
                              <span className="text-amber-800 bg-amber-50 px-2 py-1 rounded">
                                {tag.standardQty} {tag.unit}
                              </span>
                            ) : (
                              <span className="text-rose-600 bg-rose-50 px-2 py-1 rounded text-[10px] italic">
                                Trống (Điền khi quét)
                              </span>
                            )}
                          </td>

                          {/* Print Quantity Controls Column */}
                          <td className="p-2 text-center bg-amber-50/30 border-x border-amber-100" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center space-x-1 bg-white border border-slate-300 rounded-lg p-1 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleSetTagPrintQty(tag.id, printQty - 1)}
                                className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                                title="Giảm số lượng in"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={99}
                                value={printQty}
                                onChange={(e) => handleSetTagPrintQty(tag.id, parseInt(e.target.value) || 1)}
                                className="w-10 text-center font-black text-xs text-blue-900 outline-hidden"
                              />
                              <button
                                type="button"
                                onClick={() => handleSetTagPrintQty(tag.id, printQty + 1)}
                                className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                                title="Tăng số lượng in"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </td>

                          <td className="p-3 font-mono text-[10px] text-slate-500">
                            <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-bold">
                              {tag.qrPayload}
                            </span>
                          </td>
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            {onSelectTagForKitting && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectTagForKitting(tag);
                                  onClose();
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-2xs cursor-pointer"
                              >
                                Chọn Kitting
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'color_config' ? (
            /* COLOR MASTER CONFIGURATION TAB */
            <div className="h-full overflow-y-auto space-y-4">
              <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center space-x-2 text-slate-900">
                  <Palette className="w-5 h-5 text-blue-600" />
                  <h4 className="font-extrabold text-sm">
                    BẢNG CẤU HÌNH MÃ MÀU NHẬN DẠNG TRỰC QUAN 9 NHÓM LINH KIỆN (VISUAL COLOR CODING MASTER)
                  </h4>
                </div>
                <p className="text-xs text-slate-500">
                  Khai báo quy chuẩn nhận dạng bằng màu sắc theo tiêu chuẩn nhà máy SUNHOUSE. Ô màu tương ứng sẽ tự động in trên góc trên bên phải của từng Thẻ Thùng (Container Tag) giúp nhân viên kho nhận biết chủng loại ngay lập tức.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.values(PART_GROUP_COLORS).map((grp) => {
                  const grpTags = tags.filter((t) => t.groupConfig.id === grp.id);

                  return (
                    <div
                      key={grp.id}
                      className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3 relative overflow-hidden"
                    >
                      {/* Top color bar accent */}
                      <div
                        className="absolute top-0 left-0 right-0 h-2"
                        style={{ backgroundColor: grp.colorHex }}
                      />

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-6 h-6 rounded-lg shadow-inner flex items-center justify-center font-black text-xs"
                            style={{
                              backgroundColor: grp.colorHex,
                              color: grp.textColorHex,
                            }}
                          >
                            ✓
                          </div>
                          <h5 className="font-extrabold text-sm text-slate-900">{grp.name}</h5>
                        </div>
                        <span className="font-mono font-bold text-xs px-2 py-0.5 bg-slate-100 rounded border text-slate-700">
                          {grp.colorHex}
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 space-y-1">
                        <div className="flex justify-between">
                          <span>Số linh kiện trong Master Data:</span>
                          <strong className="text-slate-900">{grpTags.length} mã</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Từ khóa khớp tự động:</span>
                          <span className="font-mono text-[11px] text-slate-600">
                            {grp.keywords.slice(0, 3).join(', ')}
                          </span>
                        </div>
                      </div>

                      {/* Visual Badge Preview */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-400">Hiển thị Badge:</span>
                        <span
                          className="px-3 py-1 rounded-full text-xs font-black shadow-2xs"
                          style={{
                            backgroundColor: grp.colorHex,
                            color: grp.textColorHex,
                          }}
                        >
                          THẺ THÙNG - {grp.name}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* PRINT PREVIEW TAB (8 Cards per A4 Page, 90mm x 60mm Grid) */
            <div className="h-full flex flex-col space-y-3">
              <div className="p-3 bg-white rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center space-x-2">
                  <Printer className="w-5 h-5 text-amber-600" />
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900">
                      XEM TRƯỚC MẪU IN PHIẾU THÔNG TIN (KÍCH THƯỚC 90mm x 60mm, TỐI ƯU 8 THẺ / TRANG A4)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Đã chọn {tagsToPrint.length} mã thẻ (Tổng <strong>{totalSelectedCopies} bản in</strong>). Tự động dàn trang xếp 8 thẻ / 1 tờ giấy A4 ({a4Pages.length} trang A4).
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
                    <span>In {tagsToPrint.length} Mã Thẻ ({totalSelectedCopies} Bản A4)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrint('ALL')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>In TẤT CẢ ({tags.length} Mã - {totalAllCopies} Bản)</span>
                  </button>
                </div>
              </div>

              {/* Printable Pages Preview Container */}
              <div className="flex-1 overflow-y-auto bg-slate-200/80 p-6 rounded-2xl border border-slate-300 space-y-8">
                <div ref={printContainerRef} className="space-y-8">
                  {a4Pages.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 font-bold">
                      Chưa chọn thẻ nào để hiển thị xem trước mẫu in A4!
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
                                justifyHorizontal: 'center',
                                alignContent: 'start',
                              }}
                            >
                              {pageCards.map((tag, cardIdx) => renderTagCard(tag, pageIdx * 8 + cardIdx))}
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
                                justifyHorizontal: 'center',
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
