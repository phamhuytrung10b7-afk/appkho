import { ProductivityPersonnelConfig } from './types';

export interface ProductivityExportItem {
  partCode: string;
  partName: string;
  khsx: number;
  actual: number;
  conLai: number;
  tyLeHoanThanh: number;
  hsqd: number;
  hourlyQty: { [slot: string]: number };
  tongSanLuong: number;
}

export function formatVietnameseNumber(num: number, decimals: number = 0): string {
  if (num === 0 || isNaN(num)) return '0';
  if (decimals > 0) {
    const formatted = num.toFixed(decimals);
    const [intPart, decPart] = formatted.split('.');
    const intFormatted = parseInt(intPart, 10).toLocaleString('vi-VN');
    return `${intFormatted},${decPart}`;
  }
  return Math.round(num).toLocaleString('vi-VN');
}

export function exportProductivityExcel(
  reportDate: string,
  config: ProductivityPersonnelConfig,
  items: ProductivityExportItem[]
) {
  const slots = config.hourlySlots.map((s) => s.slot);

  // Calculate totals
  let grandKhsx = 0;
  let grandActual = 0;
  let grandConLai = 0;
  let grandTotalQty = 0;
  const hourlyTotals: { [slot: string]: number } = {};
  slots.forEach((s) => (hourlyTotals[s] = 0));

  items.forEach((item) => {
    grandKhsx += item.khsx;
    grandActual += item.actual;
    grandConLai += item.conLai;
    grandTotalQty += item.tongSanLuong;

    slots.forEach((s) => {
      hourlyTotals[s] += item.hourlyQty[s] || 0;
    });
  });

  const grandTyLe = grandKhsx > 0 ? (grandActual / grandKhsx) * 100 : 0;

  // Hourly converted SP
  const hourlyConvertedSp: { [slot: string]: number } = {};
  let grandConvertedSp = 0;

  slots.forEach((s) => {
    let slotConverted = 0;
    items.forEach((item) => {
      const qty = item.hourlyQty[s] || 0;
      slotConverted += qty * item.hsqd;
    });
    hourlyConvertedSp[s] = slotConverted;
    grandConvertedSp += slotConverted;
  });

  // Hourly Required SP & NSLD %
  const hourlyRequiredSp: { [slot: string]: number } = {};
  const hourlyNsldRatio: { [slot: string]: number } = {};
  let grandRequiredSp = 0;

  config.hourlySlots.forEach((slotCfg) => {
    const s = slotCfg.slot;
    const required = slotCfg.nhanSuMoiGio * 1069.125;
    hourlyRequiredSp[s] = required;
    grandRequiredSp += required;

    const actualConverted = hourlyConvertedSp[s] || 0;
    if (required > 0 && actualConverted > 0) {
      hourlyNsldRatio[s] = (actualConverted / required) * 100;
    } else {
      hourlyNsldRatio[s] = 0;
    }
  });

  const grandNsldRatio = grandRequiredSp > 0 ? (grandConvertedSp / grandRequiredSp) * 100 : 0;

  // Build Styled HTML Table string
  const formattedDate = reportDate.split('-').reverse().join('/'); // YYYY-MM-DD -> DD/MM/YYYY

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Báo Cáo Năng Suất</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        table { border-collapse: collapse; font-family: 'Times New Roman', Arial, sans-serif; font-size: 11pt; }
        td, th { border: 1px solid #000000; padding: 5px 8px; vertical-align: middle; white-space: nowrap; }
        .bg-green-title { background-color: #006100; color: #FFFFFF; font-weight: bold; font-size: 14pt; text-align: center; }
        .bg-green-date { background-color: #92D050; font-weight: bold; text-align: center; font-size: 11pt; color: #000000; }
        .bg-personnel-hdr { background-color: #C6EFCE; font-weight: bold; text-align: center; font-size: 10pt; color: #006100; }
        .bg-personnel-val { background-color: #E2EFDA; font-weight: bold; text-align: center; font-size: 11pt; color: #000000; }
        .bg-header { background-color: #92D050; font-weight: bold; text-align: center; font-size: 10pt; color: #000000; }
        .text-left { text-align: left; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .font-bold { font-weight: bold; }
        .color-total { color: #002060; font-weight: bold; }
        .color-nsld { color: #008000; font-weight: bold; }
        .color-red { color: #FF0000; font-weight: bold; }
        .color-black { color: #000000; font-weight: bold; }
      </style>
    </head>
    <body>
      <table>
        <!-- Row 1: Date & Title -->
        <tr>
          <td class="bg-green-date" colspan="2">Ngày: ${formattedDate}</td>
          <td class="bg-green-title" colspan="${slots.length + 6}">Báo cáo hằng ngày</td>
        </tr>

        <!-- Empty Spacer -->
        <tr><td colspan="${slots.length + 8}" style="border:none; height:10px;"></td></tr>

        <!-- Personnel Summary Box (Image 3) -->
        <tr>
          <td class="bg-personnel-hdr" colspan="2">Nhân sự chính thức</td>
          <td class="bg-personnel-hdr" colspan="2">SOẠN VẬT TƯ</td>
          <td class="bg-personnel-hdr" colspan="2">BÓC TÁCH</td>
          <td class="bg-personnel-hdr" colspan="2">BÓC XẾP</td>
          <td class="bg-personnel-hdr" colspan="2">XE NÂNG</td>
          <td class="bg-personnel-hdr" colspan="2">CẤP PHÁT</td>
          <td colspan="${slots.length - 4}" style="border:none;"></td>
        </tr>
        <tr>
          <td class="bg-personnel-val" colspan="2">${config.chinhThuc}</td>
          <td class="bg-personnel-val" colspan="2">${config.soanVatTu}</td>
          <td class="bg-personnel-val" colspan="2">${config.bocTach}</td>
          <td class="bg-personnel-val" colspan="2">${config.bocXep}</td>
          <td class="bg-personnel-val" colspan="2">${config.xeNang}</td>
          <td class="bg-personnel-val" colspan="2">${config.capPhat}</td>
          <td colspan="${slots.length - 4}" style="border:none;"></td>
        </tr>

        <!-- Empty Spacer -->
        <tr><td colspan="${slots.length + 8}" style="border:none; height:10px;"></td></tr>

        <!-- Main Table Header (Image 3) -->
        <tr>
          <th class="bg-header" style="width: 280px;">Tên linh kiện</th>
          <th class="bg-header">KHSX</th>
          <th class="bg-header">Thực Hiện</th>
          <th class="bg-header">Còn Lại</th>
          <th class="bg-header">Tỉ lệ Hoàn Thành KHSX</th>
          <th class="bg-header">HSQĐ</th>
          ${slots.map((s) => `<th class="bg-header">${s}</th>`).join('')}
          <th class="bg-header">Tổng sản lượng</th>
        </tr>

        <!-- Data Rows -->
        ${
          items.length === 0
            ? `<tr>
                <td colspan="${slots.length + 7}" class="text-center font-bold" style="padding: 15px; color: #888888;">
                  Chưa có dữ liệu bóc tách (Kitting Smart) trong ngày ${formattedDate}
                </td>
              </tr>`
            : items
                .map((item) => {
                  const conLaiStr = item.conLai <= 0 ? '-' : formatVietnameseNumber(item.conLai);
                  const hsqdStr = Number(item.hsqd.toFixed(3)).toString().replace('.', ',');
                  const tyLeStr = `${Math.round(item.tyLeHoanThanh)}%`;

                  const slotTds = slots
                    .map((s) => {
                      const qty = item.hourlyQty[s] || 0;
                      return `<td class="text-center">${qty > 0 ? formatVietnameseNumber(qty) : ''}</td>`;
                    })
                    .join('');

                  return `
            <tr>
              <td class="text-left">${item.partName}</td>
              <td class="text-right">${formatVietnameseNumber(item.khsx)}</td>
              <td class="text-right">${formatVietnameseNumber(item.actual)}</td>
              <td class="text-right">${conLaiStr}</td>
              <td class="text-center">${tyLeStr}</td>
              <td class="text-center">${hsqdStr}</td>
              ${slotTds}
              <td class="text-right font-bold">${formatVietnameseNumber(item.tongSanLuong)}</td>
            </tr>`;
                })
                .join('')
        }

        <!-- Total Row (Blue - Image 3) -->
        <tr>
          <td class="text-left font-bold color-total">Total</td>
          <td class="text-right font-bold color-total">${formatVietnameseNumber(grandKhsx)}</td>
          <td class="text-right font-bold color-total">${formatVietnameseNumber(grandActual)}</td>
          <td class="text-right font-bold color-total">${grandConLai <= 0 ? '-' : formatVietnameseNumber(grandConLai)}</td>
          <td class="text-center font-bold color-total">${Math.round(grandTyLe)}%</td>
          <td class="text-center font-bold color-total"></td>
          ${slots
            .map((s) => {
              const qty = hourlyTotals[s] || 0;
              return `<td class="text-center font-bold color-total">${qty > 0 ? formatVietnameseNumber(qty) : '0'}</td>`;
            })
            .join('')}
          <td class="text-right font-bold color-total">${formatVietnameseNumber(grandTotalQty)}</td>
        </tr>

        <!-- Row: Sản phẩm quy đổi -->
        <tr>
          <td class="text-left font-bold color-total" colspan="6">Sản phẩm quy đổi</td>
          ${slots
            .map((s) => {
              const converted = hourlyConvertedSp[s] || 0;
              return `<td class="text-center font-bold color-total">${converted > 0 ? formatVietnameseNumber(converted) : '-'}</td>`;
            })
            .join('')}
          <td class="text-right font-bold color-total">${formatVietnameseNumber(grandConvertedSp)}</td>
        </tr>

        <!-- Row: Năng suất lao động (%) -->
        <tr>
          <td class="text-left font-bold color-nsld" colspan="6">Năng suất lao động</td>
          ${slots
            .map((s) => {
              const ratio = hourlyNsldRatio[s] || 0;
              return `<td class="text-center font-bold color-nsld">${ratio > 0 ? `${Math.round(ratio)}%` : '-'}</td>`;
            })
            .join('')}
          <td class="text-right font-bold color-nsld">${grandNsldRatio > 0 ? `${Math.round(grandNsldRatio)}%` : '-'}</td>
        </tr>

        <!-- Row: NS CHÍNH THỨC (Red) -->
        <tr>
          <td class="text-left font-bold color-red" colspan="6">NS CHÍNH THỨC</td>
          ${config.hourlySlots
            .map((s) => `<td class="text-center font-bold color-red">${s.nsChinhThuc}</td>`)
            .join('')}
          <td class="text-right font-bold color-red">${config.hourlySlots.reduce((sum, s) => sum + s.nsChinhThuc, 0)}</td>
        </tr>

        <!-- Row: NS THỜI VỤ (Red) -->
        <tr>
          <td class="text-left font-bold color-red" colspan="6">NS THỜI VỤ</td>
          ${config.hourlySlots
            .map((s) => `<td class="text-center font-bold color-red">${s.nsThoiVu}</td>`)
            .join('')}
          <td class="text-right font-bold color-red">${config.hourlySlots.reduce((sum, s) => sum + s.nsThoiVu, 0)}</td>
        </tr>

        <!-- Row: Nhân sự mỗi giờ (Green) -->
        <tr>
          <td class="text-left font-bold color-nsld" colspan="6">Nhân sự mỗi giờ</td>
          ${config.hourlySlots
            .map((s) => `<td class="text-center font-bold color-nsld">${s.nhanSuMoiGio}</td>`)
            .join('')}
          <td class="text-right font-bold color-nsld">${(
            config.hourlySlots.reduce((sum, s) => sum + s.nhanSuMoiGio, 0) / (config.hourlySlots.length || 1)
          ).toFixed(2).replace('.', ',')}</td>
        </tr>

        <!-- Row: Số lượng sản phẩm quy đổi cần đạt được -->
        <tr>
          <td class="text-left font-bold color-black" colspan="6">Số lượng sản phẩm quy đổi cần đạt được</td>
          ${config.hourlySlots
            .map((s) => {
              const req = hourlyRequiredSp[s.slot] || 0;
              return `<td class="text-center font-bold color-black">${req > 0 ? formatVietnameseNumber(req) : '0'}</td>`;
            })
            .join('')}
          <td class="text-right font-bold color-black">${formatVietnameseNumber(grandRequiredSp)}</td>
        </tr>

      </table>
    </body>
    </html>
  `;

  // Trigger download as HTML Excel file (.xls)
  const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Bao_Cao_Nang_Suat_Lao_Dong_${reportDate}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
