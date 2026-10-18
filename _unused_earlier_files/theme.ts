/**
 * PDF design tokens. The layout lives in BillDocument.tsx / ReportDocument.tsx — to restyle the bills,
 * change these values or replace those two files. Nothing else in the app depends on the layout.
 * Uses the PDF standard fonts, so no font files are needed.
 */
export const PDF = {
  navy: '#0B1733', obsidian: '#080B12', gold: '#E6B84A', goldDeep: '#A87C14', ivory: '#F7F5EF',
  ink: '#1B2437', muted: '#6B7488', line: '#DDE2EC', band: '#F3F5FA', success: '#2F7D57', danger: '#B8454B',
  font: 'Helvetica', fontBold: 'Helvetica-Bold', display: 'Times-Bold', displayRegular: 'Times-Roman',
} as const;
