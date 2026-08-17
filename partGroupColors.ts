export interface PartGroupColorConfig {
  id: string;
  name: string; // Tên nhóm chuẩn
  colorHex: string; // Mã màu Hex
  textColorHex: string; // Text color on color box
  badgeClass: string;
  keywords: string[]; // Mẫu từ khóa khớp nhóm
}

export const PART_GROUP_COLORS: Record<string, PartGroupColorConfig> = {
  CAO_SU: {
    id: 'CAO_SU',
    name: 'Nhóm cao su, silicon',
    colorHex: '#38A169',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-emerald-600 text-white',
    keywords: ['nhóm cao su, silicon', 'cao su', 'silicon', 'silicone', 'gioăng', 'ống silicon', 'nút cao su', 'rubber'],
  },
  DIEN: {
    id: 'DIEN',
    name: 'Nhóm điện',
    colorHex: '#3182CE',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-blue-600 text-white',
    keywords: ['nhóm điện', 'điện', 'dien', 'electric', 'dây', 'nguồn', 'cảm biến', 'cụm đánh lửa', 'đánh lửa'],
  },
  DONG_GOI: {
    id: 'DONG_GOI',
    name: 'Nhóm đóng gói',
    colorHex: '#1A202C',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-slate-900 text-white',
    keywords: ['nhóm đóng gói', 'đóng gói', 'dong goi', 'carton', 'thùng', 'xốp', 'xốp bọc', 'packaging'],
  },
  KIM_LOAI: {
    id: 'KIM_LOAI',
    name: 'Nhóm kim loại',
    colorHex: '#E53E3E',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-red-600 text-white',
    keywords: ['nhóm kim loại', 'kim loại', 'kim loai', 'metal', 'sắt', 'thép', 'nhôm', 'đồng', 'inox'],
  },
  KHAC: {
    id: 'KHAC',
    name: 'Nhóm khác',
    colorHex: '#DD6B20',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-orange-600 text-white',
    keywords: ['nhóm khác', 'khác', 'khac', 'other', 'vật tư phụ'],
  },
  MACH: {
    id: 'MACH',
    name: 'Nhóm mạch',
    colorHex: '#D69E2E',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-yellow-600 text-white',
    keywords: ['nhóm mạch', 'mạch', 'mach', 'pcb', 'bo mạch', 'vi mạch', 'chip'],
  },
  NHUA: {
    id: 'NHUA',
    name: 'Nhóm nhựa',
    colorHex: '#ECC94B',
    textColorHex: '#1A202C',
    badgeClass: 'bg-yellow-400 text-slate-900',
    keywords: ['nhóm nhựa', 'nhựa', 'nhua', 'plastic', 'abs', 'pp', 'pvc', 'màng'],
  },
  VIT_BULONG: {
    id: 'VIT_BULONG',
    name: 'Nhóm vít/bulong các loại',
    colorHex: '#D69E2E',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-amber-600 text-white',
    keywords: ['nhóm vít/bulong các loại', 'nhóm vít/bulong', 'vít', 'vit', 'bulong', 'bu lông', 'đai ốc', 'long đen', 'ecu', 'ốc', 'vít/bulong'],
  },
  THUY_TINH: {
    id: 'THUY_TINH',
    name: 'Nhóm thủy tinh',
    colorHex: '#C53030',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-red-800 text-white',
    keywords: ['nhóm thủy tinh', 'thủy tinh', 'thuy tinh', 'kính', 'glass'],
  },
};

/**
 * Fuzzy match group name to get PartGroupColorConfig
 */
export function getPartGroupConfig(groupName: string): PartGroupColorConfig {
  if (!groupName) return PART_GROUP_COLORS.KHAC;
  const normalized = groupName.trim().toLowerCase();

  // 1. Direct equality checks (e.g. "nhóm điện" === "nhóm điện")
  for (const key of Object.keys(PART_GROUP_COLORS)) {
    const config = PART_GROUP_COLORS[key];
    if (config.name.toLowerCase() === normalized) {
      return config;
    }
  }

  // 2. Keyword checks
  for (const key of Object.keys(PART_GROUP_COLORS)) {
    const config = PART_GROUP_COLORS[key];
    for (const kw of config.keywords) {
      if (normalized.includes(kw)) {
        return config;
      }
    }
  }

  return PART_GROUP_COLORS.KHAC;
}
