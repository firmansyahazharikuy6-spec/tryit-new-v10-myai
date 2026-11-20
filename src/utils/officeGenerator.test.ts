import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSheetCellDisplay,
  generateDocxUint8Array,
  generatePptxUint8Array,
  generateXlsxUint8Array,
  parseOfficeSpecFromFile,
  type ExcelWorkbookSpec,
  type PptDeckSpec,
  type WordDocumentSpec,
} from './officeGenerator';

test('parseOfficeSpecFromFile parses .docx.json, .pptx.json, .xlsx.json and CSV fallbacks', () => {
  const wordFile = {
    path: 'proposal.docx.json',
    language: 'word',
    updatedAt: 1,
    content: JSON.stringify({
      kind: 'word',
      title: 'Proposal Peluncuran AI',
      sections: [{ heading: 'Pendahuluan', paragraphs: ['Ringkasan proyek.'] }],
    }),
  };
  const parsedWord = parseOfficeSpecFromFile(wordFile);
  assert.equal(parsedWord?.kind, 'word');
  assert.equal(parsedWord?.title, 'Proposal Peluncuran AI');

  const csvFile = {
    path: 'metrics.csv',
    language: 'csv',
    updatedAt: 1,
    content: 'Bulan,Pendapatan,Biaya\nJan,1000,400\nFeb,1500,450',
  };
  const parsedCsv = parseOfficeSpecFromFile(csvFile);
  assert.equal(parsedCsv?.kind, 'excel');
  if (parsedCsv?.kind === 'excel') {
    assert.deepEqual(parsedCsv.sheets[0].columns, ['Bulan', 'Pendapatan', 'Biaya']);
    assert.equal(parsedCsv.sheets[0].rows[0][1], 1000);
  }
});

test('evaluateSheetCellDisplay evaluates =SUM and =AVERAGE formulas accurately', () => {
  const wb: ExcelWorkbookSpec = {
    kind: 'excel',
    title: 'Budget',
    sheets: [
      {
        name: 'Anggaran',
        columns: ['Kategori', 'Q1', 'Q2', 'Total'],
        rows: [
          ['Cloud', 100, 200, '=SUM(B2:C2)'],
          ['Team', 300, 400, '=SUM(B3:C3)'],
        ],
        summaryRow: ['Grand Total', '=SUM(B2:B3)', '=SUM(C2:C3)', '=AVERAGE(D2:D3)'],
      },
    ],
  };
  const sheet = wb.sheets[0];
  assert.equal(evaluateSheetCellDisplay(sheet, 0, 3), '300');
  assert.equal(evaluateSheetCellDisplay(sheet, 1, 3), '700');
  assert.equal(evaluateSheetCellDisplay(sheet, 2, 1), '400');
  assert.equal(evaluateSheetCellDisplay(sheet, 2, 3), '500');
});

test('generateDocxUint8Array, generatePptxUint8Array, and generateXlsxUint8Array emit valid OOXML ZIP archives', async () => {
  const wordSpec: WordDocumentSpec = {
    kind: 'word',
    title: 'Test Proposal',
    subtitle: 'Automated Test',
    sections: [
      {
        heading: '1. Overview',
        paragraphs: ['Testing binary Word export.'],
        bullets: ['Fast', 'Valid'],
        table: { headers: ['Item', 'Cost'], rows: [['Server', '100']] },
      },
    ],
  };
  const docxBytes = await generateDocxUint8Array(wordSpec);
  assert.equal(docxBytes[0], 0x50); // 'P'
  assert.equal(docxBytes[1], 0x4b); // 'K'
  assert.ok(docxBytes.byteLength > 1500);

  const pptSpec: PptDeckSpec = {
    kind: 'ppt',
    title: 'Test Pitch Deck',
    theme: 'indigo',
    slides: [
      { layout: 'title', title: 'Test Deck', subtitle: 'MyAI Studio' },
      {
        layout: 'metrics',
        title: 'KPIs',
        metrics: [{ label: 'Users', value: '12K', delta: '+24%' }],
        bullets: ['Strong retention'],
        notes: 'Mention growth.',
      },
    ],
  };
  const pptxBytes = await generatePptxUint8Array(pptSpec);
  assert.equal(pptxBytes[0], 0x50);
  assert.equal(pptxBytes[1], 0x4b);
  assert.ok(pptxBytes.byteLength > 5000);

  const xlsxSpec: ExcelWorkbookSpec = {
    kind: 'excel',
    title: 'Test Budget',
    sheets: [
      {
        name: 'Summary',
        columns: ['Category', 'Q1', 'Q2', 'Total'],
        rows: [['Cloud', 500, 750, '=SUM(B2:C2)']],
        summaryRow: ['Total', '=SUM(B2:B2)', '=SUM(C2:C2)', '=SUM(D2:D2)'],
      },
    ],
  };
  const xlsxBytes = generateXlsxUint8Array(xlsxSpec);
  assert.equal(xlsxBytes[0], 0x50);
  assert.equal(xlsxBytes[1], 0x4b);
  assert.ok(xlsxBytes.byteLength > 2000);
});
