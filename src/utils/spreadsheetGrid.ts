import type {
  ExcelCellInput,
  ExcelSheetSpec,
  ExcelWorkbookSpec,
} from './officeGenerator';
import { parseOfficeSpecFromFile } from './officeGenerator';
import type { WorkspaceFile } from '../types/workspace';

export interface EvaluatedCellResult {
  raw: ExcelCellInput;
  display: string;
  numericValue: number | null;
  isFormula: boolean;
  isNumeric: boolean;
  error: string | null;
}

export interface ColumnStats {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
}

export function isSpreadsheetFile(file: Pick<WorkspaceFile, 'path' | 'language'>): boolean {
  const lower = file.path.toLowerCase();
  return (
    lower.endsWith('.xlsx.json') ||
    lower.endsWith('.excel.json') ||
    lower.endsWith('.csv') ||
    file.language === 'csv' ||
    file.language === 'excel'
  );
}

export function indexToColLetter(colIdx: number): string {
  let n = colIdx + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result || 'A';
}

export function colLetterToIndex(letters: string): number {
  let idx = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i);
    if (code < 65 || code > 90) return -1;
    idx = idx * 26 + (code - 64);
  }
  return idx - 1;
}

/**
 * Parses raw user cell input into a typed cell value.
 * Preserves formulas ('=...'), booleans, empty strings, and zero-padded codes (e.g. '0812').
 */
export function coerceCellInput(raw: string): ExcelCellInput {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  if (trimmed.startsWith('=')) return trimmed;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const hasLeadingZero =
      (trimmed.startsWith('0') &&
        trimmed.length > 1 &&
        !trimmed.startsWith('0.')) ||
      (trimmed.startsWith('-0') &&
        trimmed.length > 2 &&
        !trimmed.startsWith('-0.'));
    if (!hasLeadingZero) {
      const n = Number(trimmed);
      if (Number.isFinite(n)) return n;
    }
  }
  return raw;
}

export function parseCsvContent(content: string): {
  columns: string[];
  rows: ExcelCellInput[][];
  summaryRow?: ExcelCellInput[];
} {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (ch === '\r') {
      if (content[i + 1] === '\n') i += 1;
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else if (ch === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  const nonEmptyRows = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (nonEmptyRows.length === 0) {
    return {
      columns: ['Item', 'Amount', 'Quantity', 'Total'],
      rows: [['', 0, 1, '=B2*C2']],
    };
  }

  const maxCols = Math.max(1, ...nonEmptyRows.map((r) => r.length));
  const columns = Array.from({ length: maxCols }, (_, idx) => {
    const hdr = (nonEmptyRows[0][idx] ?? '').trim();
    return hdr || indexToColLetter(idx);
  });

  const dataRows: ExcelCellInput[][] = nonEmptyRows.slice(1).map((r) =>
    Array.from({ length: maxCols }, (_, idx) => coerceCellInput(r[idx] ?? '')),
  );

  // Restore a trailing formula Total/Summary row into summaryRow so toggling Σ and stats stay accurate
  if (dataRows.length >= 2) {
    const lastRow = dataRows[dataRows.length - 1];
    const firstLabel = String(lastRow[0] ?? '').trim().toLowerCase();
    const hasSummaryFormula = lastRow
      .slice(1)
      .some((cell) => typeof cell === 'string' && /^=(SUM|AVERAGE|AVG|MIN|MAX|COUNT)\(/i.test(cell.trim()));
    if ((firstLabel === 'total' || firstLabel === 'grand total' || firstLabel === 'summary') && hasSummaryFormula) {
      return {
        columns,
        rows: dataRows.slice(0, -1),
        summaryRow: lastRow,
      };
    }
  }

  return { columns, rows: dataRows };
}

export function serializeSheetToCsv(sheet: ExcelSheetSpec): string {
  const escapeCsvCell = (val: ExcelCellInput): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (
      str.includes(',') ||
      str.includes('"') ||
      str.includes('\n') ||
      str.includes('\r')
    ) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[] = [];
  if (sheet.columns.length > 0) {
    lines.push(sheet.columns.map(escapeCsvCell).join(','));
  }
  for (const row of sheet.rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  if (sheet.summaryRow && sheet.summaryRow.length > 0) {
    lines.push(sheet.summaryRow.map(escapeCsvCell).join(','));
  }
  return lines.join('\n');
}

export function parseSpreadsheetFile(file: WorkspaceFile): ExcelWorkbookSpec | null {
  const lower = file.path.toLowerCase();
  if (lower.endsWith('.csv') || file.language === 'csv') {
    const baseName =
      file.path.split('/').pop()?.replace(/\.csv$/i, '') || 'Dataset';
    const parsedCsv = parseCsvContent(file.content);
    return {
      kind: 'excel',
      title: baseName,
      sheets: [
        {
          name: 'Data',
          columns: parsedCsv.columns,
          rows: parsedCsv.rows,
          summaryRow: parsedCsv.summaryRow,
        },
      ],
    };
  }

  const office = parseOfficeSpecFromFile(file);
  if (office && office.kind === 'excel') {
    return office;
  }

  return null;
}

export function serializeWorkbookForFile(
  workbook: ExcelWorkbookSpec,
  filePath: string,
  activeSheetIdx = 0,
): string {
  if (filePath.toLowerCase().endsWith('.csv')) {
    const sheet =
      workbook.sheets[Math.min(activeSheetIdx, Math.max(0, workbook.sheets.length - 1))] ??
      workbook.sheets[0];
    return sheet ? serializeSheetToCsv(sheet) : '';
  }
  return JSON.stringify(workbook, null, 2);
}

function formatNumberDisplay(n: number): string {
  if (!Number.isFinite(n)) return '#NUM!';
  if (Object.is(n, -0)) n = 0;
  return Number.isInteger(n)
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * Evaluates spreadsheet formulas safely without eval/Function.
 * Supports:
 * - =SUM(B2:E2), =SUM(B2, C2, 10)
 * - =AVERAGE(...) / =AVG(...)
 * - =MIN(...), =MAX(...), =COUNT(...)
 * - Arithmetic with operator precedence & parentheses: =(B2*C2)+D2, =B2/C2, =-B2+10
 */
export function evaluateCellDetailed(
  sheet: ExcelSheetSpec,
  rowIdx: number, // 0-based into [...sheet.rows, ...(sheet.summaryRow ? [sheet.summaryRow] : [])]
  colIdx: number,
  visited = new Set<string>(),
): EvaluatedCellResult {
  const allRows = sheet.summaryRow
    ? [...sheet.rows, sheet.summaryRow]
    : sheet.rows;
  const raw = allRows[rowIdx]?.[colIdx];

  if (raw === null || raw === undefined || raw === '') {
    return {
      raw: raw ?? '',
      display: '',
      numericValue: null,
      isFormula: false,
      isNumeric: false,
      error: null,
    };
  }

  if (typeof raw === 'number') {
    return {
      raw,
      display: formatNumberDisplay(raw),
      numericValue: raw,
      isFormula: false,
      isNumeric: true,
      error: null,
    };
  }

  if (typeof raw === 'boolean') {
    return {
      raw,
      display: raw ? 'TRUE' : 'FALSE',
      numericValue: null,
      isFormula: false,
      isNumeric: false,
      error: null,
    };
  }

  const str = String(raw).trim();
  if (!str.startsWith('=')) {
    const cleanNum = Number(str.replace(/,/g, ''));
    const looksNumeric =
      str !== '' && /^-?[\d,]+(\.\d+)?$/.test(str) && Number.isFinite(cleanNum);
    return {
      raw,
      display: str,
      numericValue: looksNumeric ? cleanNum : null,
      isFormula: false,
      isNumeric: looksNumeric,
      error: null,
    };
  }

  const cellKey = `${rowIdx}:${colIdx}`;
  if (visited.has(cellKey)) {
    return {
      raw,
      display: '#CYCLE!',
      numericValue: null,
      isFormula: true,
      isNumeric: false,
      error: 'Circular reference detected',
    };
  }
  const nextVisited = new Set(visited);
  nextVisited.add(cellKey);

  const expr = str.slice(1).trim();
  if (!expr) {
    return {
      raw,
      display: '#ERR!',
      numericValue: null,
      isFormula: true,
      isNumeric: false,
      error: 'Empty formula',
    };
  }

  const resolveCellNumeric = (ref: string): { value: number; hasValue: boolean; error: string | null } => {
    const m = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
    if (!m) return { value: 0, hasValue: false, error: '#REF!' };
    const c = colLetterToIndex(m[1]);
    const r = Number(m[2]) - 2; // Row 1 is headers; rows[0] is Row 2
    if (r < 0 || r >= allRows.length || c < 0) {
      return { value: 0, hasValue: false, error: '#REF!' };
    }
    const evaluated = evaluateCellDetailed(sheet, r, c, nextVisited);
    if (evaluated.error) {
      return { value: 0, hasValue: false, error: evaluated.display };
    }
    if (evaluated.numericValue !== null) {
      return { value: evaluated.numericValue, hasValue: true, error: null };
    }
    return { value: 0, hasValue: false, error: null };
  };

  const expandRangeValues = (startRef: string, endRef: string): { values: number[]; error: string | null } => {
    const m1 = /^([A-Za-z]+)(\d+)$/.exec(startRef.trim());
    const m2 = /^([A-Za-z]+)(\d+)$/.exec(endRef.trim());
    if (!m1 || !m2) return { values: [], error: '#REF!' };
    const c1 = colLetterToIndex(m1[1]);
    const r1 = Number(m1[2]) - 2;
    const c2 = colLetterToIndex(m2[1]);
    const r2 = Number(m2[2]) - 2;
    if (c1 < 0 || c2 < 0 || r1 < 0 || r2 < 0) {
      return { values: [], error: '#REF!' };
    }
    const vals: number[] = [];
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
        if (r >= 0 && r < allRows.length && c >= 0) {
          const res = resolveCellNumeric(`${indexToColLetter(c)}${r + 2}`);
          if (res.error) return { values: [], error: res.error };
          if (res.hasValue) vals.push(res.value);
        }
      }
    }
    return { values: vals, error: null };
  };

  // Recursive descent parser for arithmetic + function calls
  type Token =
    | { type: 'num'; val: number }
    | { type: 'ident'; val: string }
    | { type: 'op'; val: string }
    | { type: 'paren'; val: '(' | ')' }
    | { type: 'comma' }
    | { type: 'colon' };

  const tokenize = (input: string): Token[] | null => {
    const tokens: Token[] = [];
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      if (/[0-9.]/.test(ch)) {
        let numStr = '';
        while (i < input.length && /[0-9.]/.test(input[i])) {
          numStr += input[i++];
        }
        const parsed = Number(numStr);
        if (!Number.isFinite(parsed)) return null;
        tokens.push({ type: 'num', val: parsed });
        continue;
      }
      if (/[A-Za-z]/.test(ch)) {
        let id = '';
        while (i < input.length && /[A-Za-z0-9]/.test(input[i])) {
          id += input[i++];
        }
        tokens.push({ type: 'ident', val: id.toUpperCase() });
        continue;
      }
      if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
        tokens.push({ type: 'op', val: ch });
        i += 1;
        continue;
      }
      if (ch === '(' || ch === ')') {
        tokens.push({ type: 'paren', val: ch });
        i += 1;
        continue;
      }
      if (ch === ',') {
        tokens.push({ type: 'comma' });
        i += 1;
        continue;
      }
      if (ch === ':') {
        tokens.push({ type: 'colon' });
        i += 1;
        continue;
      }
      return null;
    }
    return tokens;
  };

  const tokens = tokenize(expr);
  if (!tokens || tokens.length === 0) {
    return {
      raw,
      display: '#ERR!',
      numericValue: null,
      isFormula: true,
      isNumeric: false,
      error: 'Invalid formula syntax',
    };
  }

  let cursor = 0;
  let evalError: string | null = null;

  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];

  const parseExpression = (): number => {
    let left = parseTerm();
    while (!evalError) {
      const tok = peek();
      if (tok?.type === 'op' && (tok.val === '+' || tok.val === '-')) {
        consume();
        const right = parseTerm();
        left = tok.val === '+' ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  };

  const parseTerm = (): number => {
    let left = parseUnary();
    while (!evalError) {
      const tok = peek();
      if (tok?.type === 'op' && (tok.val === '*' || tok.val === '/')) {
        consume();
        const right = parseUnary();
        if (tok.val === '/') {
          if (right === 0) {
            evalError = '#DIV/0!';
            return 0;
          }
          left = left / right;
        } else {
          left = left * right;
        }
      } else {
        break;
      }
    }
    return left;
  };

  const parseUnary = (): number => {
    const tok = peek();
    if (tok?.type === 'op' && (tok.val === '+' || tok.val === '-')) {
      consume();
      const val = parseUnary();
      return tok.val === '-' ? -val : val;
    }
    return parsePrimary();
  };

  const parseFunctionArgs = (): number[] => {
    const collected: number[] = [];
    while (!evalError) {
      const next = peek();
      if (next?.type === 'paren' && next.val === ')') {
        break;
      }
      // Check range: IDENT ':' IDENT
      if (
        tokens[cursor]?.type === 'ident' &&
        tokens[cursor + 1]?.type === 'colon' &&
        tokens[cursor + 2]?.type === 'ident'
      ) {
        const startIdent = (consume() as { type: 'ident'; val: string }).val;
        consume(); // ':'
        const endIdent = (consume() as { type: 'ident'; val: string }).val;
        const { values, error } = expandRangeValues(startIdent, endIdent);
        if (error) {
          evalError = error;
          return [];
        }
        collected.push(...values);
      } else {
        const val = parseExpression();
        if (evalError) return [];
        collected.push(val);
      }

      const sep = peek();
      if (sep?.type === 'comma') {
        consume();
      } else {
        break;
      }
    }
    return collected;
  };

  const parsePrimary = (): number => {
    const tok = peek();
    if (!tok) {
      evalError = '#ERR!';
      return 0;
    }
    if (tok.type === 'num') {
      consume();
      return tok.val;
    }
    if (tok.type === 'paren' && tok.val === '(') {
      consume();
      const val = parseExpression();
      const close = peek();
      if (close?.type !== 'paren' || close.val !== ')') {
        evalError = '#ERR!';
        return 0;
      }
      consume();
      return val;
    }
    if (tok.type === 'ident') {
      consume();
      const after = peek();
      if (after?.type === 'paren' && after.val === '(') {
        consume(); // '('
        const args = parseFunctionArgs();
        const close = peek();
        if (close?.type !== 'paren' || close.val !== ')') {
          evalError = '#ERR!';
          return 0;
        }
        consume(); // ')'
        if (evalError) return 0;

        const fn = tok.val;
        if (fn === 'SUM') return args.reduce((a, b) => a + b, 0);
        if (fn === 'AVERAGE' || fn === 'AVG') {
          return args.length > 0
            ? args.reduce((a, b) => a + b, 0) / args.length
            : 0;
        }
        if (fn === 'MIN') return args.length > 0 ? Math.min(...args) : 0;
        if (fn === 'MAX') return args.length > 0 ? Math.max(...args) : 0;
        if (fn === 'COUNT') return args.length;
        evalError = '#NAME?';
        return 0;
      }

      // Single cell reference
      const res = resolveCellNumeric(tok.val);
      if (res.error) {
        evalError = res.error;
        return 0;
      }
      return res.value;
    }

    evalError = '#ERR!';
    return 0;
  };

  const numeric = parseExpression();
  if (!evalError && cursor < tokens.length) {
    evalError = '#ERR!';
  }

  if (evalError) {
    return {
      raw,
      display: evalError,
      numericValue: null,
      isFormula: true,
      isNumeric: false,
      error: evalError,
    };
  }

  return {
    raw,
    display: formatNumberDisplay(numeric),
    numericValue: numeric,
    isFormula: true,
    isNumeric: true,
    error: null,
  };
}

export function computeColumnStats(
  sheet: ExcelSheetSpec,
  colIdx: number,
  includeSummary = false,
): ColumnStats | null {
  const values: number[] = [];
  const limit = includeSummary && sheet.summaryRow ? sheet.rows.length + 1 : sheet.rows.length;
  for (let r = 0; r < limit; r++) {
    const res = evaluateCellDetailed(sheet, r, colIdx);
    if (res.numericValue !== null && Number.isFinite(res.numericValue)) {
      values.push(res.numericValue);
    }
  }
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    sum,
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function getSheetColumnCount(sheet: ExcelSheetSpec): number {
  return Math.max(
    1,
    sheet.columns.length,
    ...sheet.rows.map((r) => r.length),
    sheet.summaryRow?.length ?? 0,
  );
}

function normalizeSheetRowLengths(sheet: ExcelSheetSpec, targetCols: number): ExcelSheetSpec {
  const columns = Array.from(
    { length: targetCols },
    (_, i) => sheet.columns[i] ?? indexToColLetter(i),
  );
  const rows = sheet.rows.map((r) =>
    Array.from({ length: targetCols }, (_, i) => r[i] ?? ''),
  );
  const summaryRow = sheet.summaryRow
    ? Array.from({ length: targetCols }, (_, i) => sheet.summaryRow![i] ?? '')
    : undefined;
  return {
    ...sheet,
    columns,
    rows,
    summaryRow,
  };
}

export function updateGridCell(
  workbook: ExcelWorkbookSpec,
  sheetIdx: number,
  rowIdx: number,
  colIdx: number,
  rawInput: string,
): ExcelWorkbookSpec {
  const coerced = coerceCellInput(rawInput);
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet, idx) => {
      if (idx !== sheetIdx) return sheet;
      const colCount = Math.max(getSheetColumnCount(sheet), colIdx + 1);
      const normalized = normalizeSheetRowLengths(sheet, colCount);

      if (normalized.summaryRow && rowIdx === normalized.rows.length) {
        const nextSummary = [...normalized.summaryRow];
        nextSummary[colIdx] = coerced;
        return { ...normalized, summaryRow: nextSummary };
      }

      const nextRows = normalized.rows.map((r, rI) => {
        if (rI !== rowIdx) return r;
        const copy = [...r];
        copy[colIdx] = coerced;
        return copy;
      });
      return { ...normalized, rows: nextRows };
    }),
  };
}

export function updateGridColumnHeader(
  workbook: ExcelWorkbookSpec,
  sheetIdx: number,
  colIdx: number,
  nextHeader: string,
): ExcelWorkbookSpec {
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet, idx) => {
      if (idx !== sheetIdx) return sheet;
      const colCount = Math.max(getSheetColumnCount(sheet), colIdx + 1);
      const normalized = normalizeSheetRowLengths(sheet, colCount);
      const nextCols = [...normalized.columns];
      nextCols[colIdx] = nextHeader.trim() || indexToColLetter(colIdx);
      return { ...normalized, columns: nextCols };
    }),
  };
}

export function addGridRow(
  workbook: ExcelWorkbookSpec,
  sheetIdx: number,
): ExcelWorkbookSpec {
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet, idx) => {
      if (idx !== sheetIdx) return sheet;
      const colCount = getSheetColumnCount(sheet);
      const normalized = normalizeSheetRowLengths(sheet, colCount);
      const emptyRow: ExcelCellInput[] = Array.from({ length: colCount }, () => '');
      return {
        ...normalized,
        rows: [...normalized.rows, emptyRow],
      };
    }),
  };
}

export function deleteGridRow(
  workbook: ExcelWorkbookSpec,
  sheetIdx: number,
  rowIdx: number,
): ExcelWorkbookSpec {
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet, idx) => {
      if (idx !== sheetIdx) return sheet;
      if (sheet.summaryRow && rowIdx === sheet.rows.length) {
        return { ...sheet, summaryRow: undefined };
      }
      if (rowIdx < 0 || rowIdx >= sheet.rows.length) return sheet;
      return {
        ...sheet,
        rows: sheet.rows.filter((_, rI) => rI !== rowIdx),
      };
    }),
  };
}

export function addGridColumn(
  workbook: ExcelWorkbookSpec,
  sheetIdx: number,
  name?: string,
): ExcelWorkbookSpec {
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet, idx) => {
      if (idx !== sheetIdx) return sheet;
      const colCount = getSheetColumnCount(sheet);
      const normalized = normalizeSheetRowLengths(sheet, colCount);
      const label = name?.trim() || `Column ${indexToColLetter(colCount)}`;
      return {
        ...normalized,
        columns: [...normalized.columns, label],
        rows: normalized.rows.map((r) => [...r, '']),
        summaryRow: normalized.summaryRow
          ? [...normalized.summaryRow, '']
          : undefined,
      };
    }),
  };
}

export function deleteGridColumn(
  workbook: ExcelWorkbookSpec,
  sheetIdx: number,
  colIdx: number,
): ExcelWorkbookSpec {
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet, idx) => {
      if (idx !== sheetIdx) return sheet;
      const colCount = getSheetColumnCount(sheet);
      if (colCount <= 1 || colIdx < 0 || colIdx >= colCount) return sheet;
      const normalized = normalizeSheetRowLengths(sheet, colCount);
      return {
        ...normalized,
        columns: normalized.columns.filter((_, cI) => cI !== colIdx),
        rows: normalized.rows.map((r) => r.filter((_, cI) => cI !== colIdx)),
        summaryRow: normalized.summaryRow
          ? normalized.summaryRow.filter((_, cI) => cI !== colIdx)
          : undefined,
      };
    }),
  };
}

export function toggleGridSummaryRow(
  workbook: ExcelWorkbookSpec,
  sheetIdx: number,
): ExcelWorkbookSpec {
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet, idx) => {
      if (idx !== sheetIdx) return sheet;
      if (sheet.summaryRow) {
        return { ...sheet, summaryRow: undefined };
      }
      const colCount = getSheetColumnCount(sheet);
      const normalized = normalizeSheetRowLengths(sheet, colCount);
      const rowEnd = Math.max(2, normalized.rows.length + 1);
      const summaryRow: ExcelCellInput[] = normalized.columns.map((_, cIdx) => {
        if (cIdx === 0) return 'Total';
        const hasNumeric = normalized.rows.some((_, rIdx) => {
          const ev = evaluateCellDetailed(normalized, rIdx, cIdx);
          return ev.numericValue !== null;
        });
        if (!hasNumeric) return '';
        const colLetter = indexToColLetter(cIdx);
        return `=SUM(${colLetter}2:${colLetter}${rowEnd})`;
      });
      return { ...normalized, summaryRow };
    }),
  };
}

export function addGridSheet(
  workbook: ExcelWorkbookSpec,
  name?: string,
): ExcelWorkbookSpec {
  const nextNum = workbook.sheets.length + 1;
  const safeName =
    (name?.trim() || `Sheet${nextNum}`)
      .replace(/[\\/*?:[\]]/g, '')
      .slice(0, 31) || `Sheet${nextNum}`;
  return {
    ...workbook,
    sheets: [
      ...workbook.sheets,
      {
        name: safeName,
        columns: ['Item', 'Q1', 'Q2', 'Total'],
        rows: [
          ['Stream A', 1200, 1500, '=SUM(B2:C2)'],
          ['Stream B', 800, 1100, '=SUM(B3:C3)'],
        ],
        summaryRow: ['Total', '=SUM(B2:B3)', '=SUM(C2:C3)', '=SUM(D2:D3)'],
      },
    ],
  };
}

export function sortGridRowsByColumn(
  workbook: ExcelWorkbookSpec,
  sheetIdx: number,
  colIdx: number,
  direction: 'asc' | 'desc',
): ExcelWorkbookSpec {
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet, idx) => {
      if (idx !== sheetIdx) return sheet;
      const evaluatedPairs = sheet.rows.map((row, rIdx) => ({
        row,
        evalRes: evaluateCellDetailed(sheet, rIdx, colIdx),
      }));
      evaluatedPairs.sort((a, b) => {
        const na = a.evalRes.numericValue;
        const nb = b.evalRes.numericValue;
        let cmp = 0;
        if (na !== null && nb !== null) {
          cmp = na - nb;
        } else {
          cmp = a.evalRes.display.localeCompare(b.evalRes.display, undefined, {
            numeric: true,
            sensitivity: 'base',
          });
        }
        return direction === 'asc' ? cmp : -cmp;
      });
      return {
        ...sheet,
        rows: evaluatedPairs.map((p) => p.row),
      };
    }),
  };
}

export function createStarterSpreadsheetContent(kind: 'xlsx' | 'csv'): {
  path: string;
  content: string;
} {
  if (kind === 'csv') {
    return {
      path: 'dataset.csv',
      content: [
        'Department,Q1 Revenue,Q2 Revenue,Q3 Revenue,Total',
        'Enterprise SaaS,24500,28900,34200,=SUM(B2:D2)',
        'API Usage,12400,15800,19600,=SUM(B3:D3)',
        'Workspace Pro,9800,11200,14500,=SUM(B4:D4)',
        'Advisory,6200,7400,8100,=SUM(B5:D5)',
      ].join('\n'),
    };
  }

  const spec: ExcelWorkbookSpec = {
    kind: 'excel',
    title: 'Financial Projection 2026',
    sheets: [
      {
        name: 'Revenue & Margin',
        columns: ['Line Item', 'Q1', 'Q2', 'Q3', 'Q4', 'Annual Total'],
        rows: [
          ['Core Subscriptions', 18000, 22500, 27000, 33000, '=SUM(B2:E2)'],
          ['Enterprise Contracts', 12000, 14500, 18000, 21500, '=SUM(B3:E3)'],
          ['Infrastructure Cost', -4200, -4800, -5500, -6100, '=SUM(B4:E4)'],
          ['Operating Expenses', -6500, -6800, -7200, -7800, '=SUM(B5:E5)'],
        ],
        summaryRow: [
          'Net Profit',
          '=SUM(B2:B5)',
          '=SUM(C2:C5)',
          '=SUM(D2:D5)',
          '=SUM(E2:E5)',
          '=SUM(F2:F5)',
        ],
        notes: 'Click any cell or formula bar (fx) to edit values and recalculate live.',
      },
      {
        name: 'Unit KPIs',
        columns: ['Metric', 'Jan', 'Feb', 'Mar', 'Average'],
        rows: [
          ['Active Workspaces', 420, 515, 640, '=AVERAGE(B2:D2)'],
          ['Avg Revenue / Seat', 29, 31, 34, '=AVERAGE(B3:D3)'],
        ],
      },
    ],
  };

  return {
    path: 'financial-model.xlsx.json',
    content: JSON.stringify(spec, null, 2),
  };
}
