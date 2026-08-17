export type PrintLayout = 'a7' | 'single' | 'double';

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
};

export function getSavedPrintConfigs(): AllPrintConfigs {
  try {
    const saved = localStorage.getItem('printConfigs');
    if (saved) {
      return { ...defaultPrintConfigs, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error(e);
  }
  return defaultPrintConfigs;
}

export function savePrintConfigs(configs: AllPrintConfigs) {
  localStorage.setItem('printConfigs', JSON.stringify(configs));
}
