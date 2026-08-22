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
    keywords: [
      'nhóm cao su, silicon',
      'nhóm cao su silicon',
      'cao su, silicon',
      'cao su silicon',
      'nhóm cao su',
      'nhóm silicon',
      'cao su',
      'silicon',
      'silicone',
      'gioăng',
      'gasket',
      'ống silicon',
      'nút cao su',
      'rubber',
    ],
  },
  VIT_BULONG: {
    id: 'VIT_BULONG',
    name: 'Nhóm vít/bulong các loại',
    colorHex: '#D69E2E',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-amber-600 text-white',
    keywords: [
      'nhóm vít/bulong các loại',
      'nhóm vít/bulong',
      'nhóm vít, bulong các loại',
      'nhóm vít, bulong',
      'nhóm vít bulong',
      'nhóm bulong, ốc vít',
      'nhóm bulong ốc vít',
      'nhóm ốc vít',
      'vít/bulong các loại',
      'vít, bulong các loại',
      'vít/bulong',
      'vít bulong',
      'vít, bulong',
      'bulong, ốc vít',
      'bulong ốc vít',
      'ốc vít, bulong',
      'vít',
      'vit',
      'bulong',
      'bu lông',
      'đai ốc',
      'dai oc',
      'long đen',
      'long den',
      'ecu',
      'tán',
      'ty ren',
      'ốc',
      'screw',
      'bolt',
      'nut',
    ],
  },
  DIEN: {
    id: 'DIEN',
    name: 'Nhóm điện',
    colorHex: '#3182CE',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-blue-600 text-white',
    keywords: [
      'nhóm điện',
      'điện',
      'dien',
      'dây điện',
      'dây',
      'nguồn',
      'cảm biến',
      'cụm đánh lửa',
      'đánh lửa',
      'electric',
      'electrical',
      'cable',
      'wire',
      'sensor',
      'relay',
      'switch',
      'công tắc',
    ],
  },
  DONG_GOI: {
    id: 'DONG_GOI',
    name: 'Nhóm đóng gói',
    colorHex: '#1A202C',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-slate-900 text-white',
    keywords: [
      'nhóm đóng gói',
      'đóng gói',
      'dong goi',
      'bao bì',
      'carton',
      'thùng carton',
      'thùng',
      'xốp',
      'xốp bọc',
      'màng co',
      'băng dính',
      'tem',
      'nhãn',
      'packaging',
      'box',
      'foam',
    ],
  },
  KIM_LOAI: {
    id: 'KIM_LOAI',
    name: 'Nhóm kim loại',
    colorHex: '#E53E3E',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-red-600 text-white',
    keywords: [
      'nhóm kim loại',
      'kim loại',
      'kim loai',
      'kim khí',
      'cơ khí',
      'sắt',
      'thép',
      'nhôm',
      'đồng',
      'inox',
      'tôn',
      'khung sắt',
      'vỏ tôn',
      'metal',
      'steel',
      'aluminum',
      'iron',
      'copper',
    ],
  },
  MACH: {
    id: 'MACH',
    name: 'Nhóm mạch',
    colorHex: '#805AD5',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-purple-600 text-white',
    keywords: [
      'nhóm mạch',
      'mạch',
      'mach',
      'bo mạch',
      'bo mach',
      'mạch điện tử',
      'vi mạch',
      'pcb',
      'mainboard',
      'circuit board',
      'chip',
    ],
  },
  NHUA: {
    id: 'NHUA',
    name: 'Nhóm nhựa',
    colorHex: '#ECC94B',
    textColorHex: '#1A202C',
    badgeClass: 'bg-yellow-400 text-slate-900',
    keywords: [
      'nhóm nhựa',
      'nhựa',
      'nhua',
      'linh kiện nhựa',
      'ép nhựa',
      'plastic',
      'abs',
      'pp',
      'pvc',
      'màng',
    ],
  },
  THUY_TINH: {
    id: 'THUY_TINH',
    name: 'Nhóm thủy tinh',
    colorHex: '#C53030',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-red-800 text-white',
    keywords: [
      'nhóm thủy tinh',
      'thủy tinh',
      'thuy tinh',
      'kính',
      'kinh',
      'mặt kính',
      'kính cường lực',
      'glass',
    ],
  },
  KHAC: {
    id: 'KHAC',
    name: 'Nhóm khác',
    colorHex: '#DD6B20',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-orange-600 text-white',
    keywords: [
      'nhóm khác',
      'khác',
      'khac',
      'vật tư phụ',
      'vật tư tiêu hao',
      'phụ tùng',
      'other',
      'misc',
    ],
  },
};

/**
 * Helper to strip Vietnamese accents for flexible fuzzy matching
 */
function removeVietnameseAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * Fuzzy match group name to get PartGroupColorConfig
 */
export function getPartGroupConfig(groupName: string): PartGroupColorConfig {
  if (!groupName || typeof groupName !== 'string') return PART_GROUP_COLORS.KHAC;
  
  const raw = groupName.trim();
  if (!raw) return PART_GROUP_COLORS.KHAC;

  const normalized = raw.toLowerCase().replace(/[\s\-_/\\,]+/g, ' ');
  const nonAccent = removeVietnameseAccents(raw).replace(/[\s\-_/\\,]+/g, ' ');

  // 1. Direct match by group ID (e.g. "CAO_SU", "VIT_BULONG", "DIEN")
  const upperKey = raw.toUpperCase().replace(/[\s\-]+/g, '_');
  if (PART_GROUP_COLORS[upperKey]) {
    return PART_GROUP_COLORS[upperKey];
  }

  // 2. Direct equality checks against canonical names (with or without accents)
  for (const key of Object.keys(PART_GROUP_COLORS)) {
    const config = PART_GROUP_COLORS[key];
    const configNorm = config.name.toLowerCase().replace(/[\s\-_/\\,]+/g, ' ');
    const configNonAccent = removeVietnameseAccents(config.name).replace(/[\s\-_/\\,]+/g, ' ');
    
    if (configNorm === normalized || configNonAccent === nonAccent) {
      return config;
    }
  }

  // 3. Keyword checks (prioritize specific multi-word groups before general ones)
  const orderedKeys = ['VIT_BULONG', 'CAO_SU', 'THUY_TINH', 'DONG_GOI', 'KIM_LOAI', 'MACH', 'NHUA', 'DIEN', 'KHAC'];

  for (const key of orderedKeys) {
    const config = PART_GROUP_COLORS[key];
    if (!config) continue;
    
    for (const kw of config.keywords) {
      const kwNorm = kw.toLowerCase().replace(/[\s\-_/\\,]+/g, ' ');
      const kwNonAccent = removeVietnameseAccents(kw).replace(/[\s\-_/\\,]+/g, ' ');

      if (normalized.includes(kwNorm) || nonAccent.includes(kwNonAccent)) {
        return config;
      }
    }
  }

  // 4. If non-standard custom group name provided, create a dynamic configuration so the custom group name isn't lost
  return {
    id: `CUSTOM_${upperKey.substring(0, 10)}`,
    name: raw,
    colorHex: '#64748B',
    textColorHex: '#FFFFFF',
    badgeClass: 'bg-slate-600 text-white',
    keywords: [normalized],
  };
}
