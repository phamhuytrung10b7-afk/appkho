export type PrintLayout = 'a7' | 'single' | 'double' | '150x100' | '100x75';

export interface PrintConfig {
  pageWidth: number;
  pageHeight: number;
  qrSize: number;
  nameFontSize: number;
  codeFontSize: number;
  metaFontSize: number;
  padding: number;
}

export type AllPrintConfigs = Record<PrintLayout, PrintConfig>;

export const defaultPrintConfigs: AllPrintConfigs = {
  a7: { pageWidth: 74, pageHeight: 105, qrSize: 42, nameFontSize: 15, codeFontSize: 13, metaFontSize: 11, padding: 4 },
  single: { pageWidth: 35, pageHeight: 22, qrSize: 15, nameFontSize: 9, codeFontSize: 8, metaFontSize: 7, padding: 1 },
  double: { pageWidth: 73, pageHeight: 22, qrSize: 15, nameFontSize: 9, codeFontSize: 8, metaFontSize: 7, padding: 1 },
  '150x100': { pageWidth: 150, pageHeight: 100, qrSize: 52, nameFontSize: 46, codeFontSize: 16, metaFontSize: 14, padding: 4 },
  '100x75': { pageWidth: 100, pageHeight: 75, qrSize: 36, nameFontSize: 34, codeFontSize: 12, metaFontSize: 11, padding: 3 },
};

export function getSavedPrintConfigs(): AllPrintConfigs {
  try {
    const saved = localStorage.getItem('printConfigs');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...defaultPrintConfigs,
        ...parsed,
        '150x100': { ...defaultPrintConfigs['150x100'], ...(parsed['150x100'] || {}) },
        '100x75': { ...defaultPrintConfigs['100x75'], ...(parsed['100x75'] || {}) },
      };
    }
  } catch (e) {
    console.error(e);
  }
  return defaultPrintConfigs;
}

export function savePrintConfigs(configs: AllPrintConfigs) {
  localStorage.setItem('printConfigs', JSON.stringify(configs));
}
