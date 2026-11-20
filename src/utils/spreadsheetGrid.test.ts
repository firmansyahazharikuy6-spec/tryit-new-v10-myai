import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addGridColumn,
  addGridRow,
  addGridSheet,
  colLetterToIndex,
  computeColumnStats,
  createStarterSpreadsheetContent,
  deleteGridColumn,
  deleteGridRow,
  evaluateCellDetailed,
  indexToColLetter,
  parseCsvContent,
  parseSpreadsheetFile,
  serializeWorkbookForFile,
  sortGridRowsByColumn,
  toggleGridSummaryRow,
  updateGridCell,
  updateGridColumnHeader,
} from './spreadsheetGrid';
import type { ExcelWorkbookSpec } from './officeGenerator';

test('indexToColLetter and colLetterToIndex support single and multi-letter columns', () => {
  assert.equal(indexToColLetter(0), 'A');
  assert.equal(indexToColLetter(25), 'Z');
  assert.equal(indexToColLetter(26), 'AA');
  assert.equal(colLetterToIndex('A'), 0);
  assert.equal(colLetterToIndex('AA'), 26);
});

test('parseCsvContent handles RFC-4180 quotes, embedded commas, numeric coercion, and formulas', () => {
  const csv = [
    'Region,"Unit Price, USD",Units,Revenue',
    '"Jakarta, ID",25.5,4,=B2*C2',
    '"Bandung, ID",10,8,"=SUM(B3,C3)"',
  ].join('\n');

  const parsed = parseCsvContent(csv);
  assert.deepEqual(parsed.columns, ['Region', 'Unit Price, USD', 'Units', 'Revenue']);
  assert.equal(parsed.rows[0][0], 'Jakarta, ID');
  assert.equal(parsed.rows[0][1], 25.5);
  assert.equal(parsed.rows[0][2], 4);
  assert.equal(parsed.rows[0][3], '=B2*C2');
  assert.equal(parsed.rows[1][3], '=SUM(B3,C3)');
});

test('evaluateCellDetailed handles ranges, arithmetic precedence, parentheses, circular refs, and div/0', () => {
  const wb: ExcelWorkbookSpec = {
    kind: 'excel',
    title: 'Formula Suite',
    sheets: [
      {
        name: 'Calc',
        columns: ['Item', 'Qty', 'Price', 'Discount', 'Net', 'FormulaCheck'],
        rows: [
          ['License', 10, 50, 100, '=(B2*C2)-D2', '=SUM(B2:C2, 5)'],
          ['Support', 2, 0, 0, '=B3/C3', '=MAX(10, B2, C2)'],
          ['CycleA', '=B4', 1, 0, '=A4', '=E4'],
        ],
      },
    ],
  };
  const sheet = wb.sheets[0];
  const net0 = evaluateCellDetailed(sheet, 0, 4);
  assert.equal(net0.numericValue, 400);
  assert.equal(net0.display, '400');

  const sumArgs = evaluateCellDetailed(sheet, 0, 5);
  assert.equal(sumArgs.numericValue, 65);

  const divZero = evaluateCellDetailed(sheet, 1, 4);
  assert.equal(divZero.display, '#DIV/0!');
  assert.ok(divZero.error);

  const maxCheck = evaluateCellDetailed(sheet, 1, 5);
  assert.equal(maxCheck.numericValue, 50);

  const cycleCheck = evaluateCellDetailed(sheet, 2, 1);
  assert.equal(cycleCheck.display, '#CYCLE!');
  assert.ok(cycleCheck.error);
});

test('grid cell editing, headers, rows, columns, sorting, summary row, and serialization round-trip cleanly', () => {
  const starter = createStarterSpreadsheetContent('csv');
  const wb = parseSpreadsheetFile({
    path: starter.path,
    language: 'csv',
    content: starter.content,
    updatedAt: 1,
  });
  assert.ok(wb);
  if (!wb) return;

  // Edit B2 from 24500 -> 30000 and verify =SUM(B2:D2) updates from 87600 to 93100
  let updated = updateGridCell(wb, 0, 0, 1, '30000');
  const row0Total = evaluateCellDetailed(updated.sheets[0], 0, 4);
  assert.equal(row0Total.numericValue, 93100);

  // Compute column stats for column 4 (Total)
  const stats = computeColumnStats(updated.sheets[0], 4);
  assert.ok(stats);
  assert.equal(stats?.count, 4);
  assert.equal(stats?.max, 93100);

  // Header edit, row add/delete, col add/delete, summary toggle, sort
  updated = updateGridColumnHeader(updated, 0, 0, 'Segment');
  assert.equal(updated.sheets[0].columns[0], 'Segment');

  updated = addGridRow(updated, 0);
  assert.equal(updated.sheets[0].rows.length, 5);
  updated = deleteGridRow(updated, 0, 4);
  assert.equal(updated.sheets[0].rows.length, 4);

  updated = addGridColumn(updated, 0, 'Margin');
  assert.equal(updated.sheets[0].columns.length, 6);
  updated = deleteGridColumn(updated, 0, 5);
  assert.equal(updated.sheets[0].columns.length, 5);

  updated = toggleGridSummaryRow(updated, 0);
  assert.ok(updated.sheets[0].summaryRow);
  const grandTotal = evaluateCellDetailed(updated.sheets[0], 4, 4);
  assert.equal(grandTotal.numericValue, 93100 + 47800 + 35500 + 21700);

  updated = sortGridRowsByColumn(updated, 0, 1, 'asc');
  assert.equal(updated.sheets[0].rows[0][0], 'Advisory');

  updated = addGridSheet(updated, 'Q4 Forecast');
  assert.equal(updated.sheets.length, 2);

  // Round-trip CSV serialization preserves embedded commas, summaryRow Σ detection, and non-double-counted stats
  const csvOut = serializeWorkbookForFile(updated, 'dataset.csv', 0);
  assert.ok(csvOut.includes('Segment,Q1 Revenue'));
  assert.ok(csvOut.includes('Advisory,6200'));

  const reparsedCsvWb = parseSpreadsheetFile({
    path: 'dataset.csv',
    language: 'csv',
    content: csvOut,
    updatedAt: 2,
  });
  assert.ok(reparsedCsvWb);
  if (reparsedCsvWb) {
    assert.equal(reparsedCsvWb.sheets[0].rows.length, 4);
    assert.ok(reparsedCsvWb.sheets[0].summaryRow);
    const reparsedColBStats = computeColumnStats(reparsedCsvWb.sheets[0], 1, false);
    assert.equal(reparsedColBStats?.count, 4);
    assert.equal(reparsedColBStats?.sum, 30000 + 12400 + 9800 + 6200);
  }
});
