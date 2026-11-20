import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  Columns3,
  Download,
  FileSpreadsheet,
  FunctionSquare,
  Plus,
  Rows3,
  Search,
  Sigma,
  Sparkles,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { exportOfficeFileDownload } from '../utils/officeGenerator';
import {
  addGridColumn,
  addGridRow,
  addGridSheet,
  computeColumnStats,
  createStarterSpreadsheetContent,
  deleteGridColumn,
  deleteGridRow,
  evaluateCellDetailed,
  indexToColLetter,
  isSpreadsheetFile,
  parseSpreadsheetFile,
  serializeSheetToCsv,
  serializeWorkbookForFile,
  sortGridRowsByColumn,
  toggleGridSummaryRow,
  updateGridCell,
  updateGridColumnHeader,
} from '../utils/spreadsheetGrid';
import type { WorkspaceFile } from '../types/workspace';

interface SpreadsheetDataGridProps {
  files: WorkspaceFile[];
  activeFilePath: string | null;
  onSelectFile: (path: string) => void;
  onUpdateFileContent: (path: string, nextContent: string) => void;
  onCreateSpreadsheetFile: (path: string, initialContent: string) => void;
  onAskExcelAgent?: () => void;
}

interface CellCoord {
  rowIdx: number;
  colIdx: number;
}

export function SpreadsheetDataGrid({
  files,
  activeFilePath,
  onSelectFile,
  onUpdateFileContent,
  onCreateSpreadsheetFile,
  onAskExcelAgent,
}: SpreadsheetDataGridProps) {
  const spreadsheetFiles = useMemo(
    () => files.filter((f) => isSpreadsheetFile(f)),
    [files],
  );

  const targetFile = useMemo(() => {
    const selected = files.find(
      (f) => f.path === activeFilePath && isSpreadsheetFile(f),
    );
    return selected ?? spreadsheetFiles[0] ?? null;
  }, [files, activeFilePath, spreadsheetFiles]);

  const workbook = useMemo(
    () => (targetFile ? parseSpreadsheetFile(targetFile) : null),
    [targetFile],
  );

  const [sheetIdx, setSheetIdx] = useState(0);
  const [selectedCell, setSelectedCell] = useState<CellCoord>({
    rowIdx: 0,
    colIdx: 0,
  });
  const [editingCell, setEditingCell] = useState<CellCoord | null>(null);
  const [cellDraft, setCellDraft] = useState('');
  const [formulaDraft, setFormulaDraft] = useState('');
  const [editingColHeader, setEditingColHeader] = useState<number | null>(null);
  const [headerDraft, setHeaderDraft] = useState('');
  const [rowFilter, setRowFilter] = useState('');
  const [sortState, setSortState] = useState<{
    colIdx: number;
    dir: 'asc' | 'desc';
  } | null>(null);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const inlineInputRef = useRef<HTMLInputElement>(null);

  const safeSheetIdx = workbook
    ? Math.min(sheetIdx, Math.max(0, workbook.sheets.length - 1))
    : 0;
  const activeSheet = workbook ? workbook.sheets[safeSheetIdx] ?? null : null;

  const colCount = useMemo(() => {
    if (!activeSheet) return 0;
    return Math.max(
      1,
      activeSheet.columns.length,
      ...activeSheet.rows.map((r) => r.length),
      activeSheet.summaryRow?.length ?? 0,
    );
  }, [activeSheet]);

  const totalRowCount = activeSheet
    ? activeSheet.rows.length + (activeSheet.summaryRow ? 1 : 0)
    : 0;

  // Reset grid selection state when switching files
  useEffect(() => {
    setSheetIdx(0);
    setSelectedCell({ rowIdx: 0, colIdx: 0 });
    setEditingCell(null);
    setEditingColHeader(null);
    setRowFilter('');
    setSortState(null);
  }, [targetFile?.path]);

  // Keep selected cell clamped inside sheet bounds and sync formula bar draft
  useEffect(() => {
    if (!activeSheet) {
      setFormulaDraft('');
      return;
    }
    const maxR = Math.max(
      0,
      activeSheet.rows.length + (activeSheet.summaryRow ? 1 : 0) - 1,
    );
    const maxC = Math.max(0, colCount - 1);
    const clampedRow = Math.min(selectedCell.rowIdx, maxR);
    const clampedCol = Math.min(selectedCell.colIdx, maxC);

    if (
      clampedRow !== selectedCell.rowIdx ||
      clampedCol !== selectedCell.colIdx
    ) {
      setSelectedCell({ rowIdx: clampedRow, colIdx: clampedCol });
    }

    const isSummary = Boolean(
      activeSheet.summaryRow && clampedRow === activeSheet.rows.length,
    );
    const rawVal = isSummary
      ? activeSheet.summaryRow?.[clampedCol]
      : activeSheet.rows[clampedRow]?.[clampedCol];
    setFormulaDraft(rawVal === null || rawVal === undefined ? '' : String(rawVal));
  }, [activeSheet, colCount, selectedCell]);

  // Focus inline cell input when entering edit mode
  useEffect(() => {
    if (editingCell) {
      inlineInputRef.current?.focus();
      inlineInputRef.current?.select();
    }
  }, [editingCell]);

  function commitWorkbookUpdate(
    nextWorkbook: NonNullable<typeof workbook>,
    sheetIndexOverride?: number,
  ) {
    if (!targetFile) return;
    const serialized = serializeWorkbookForFile(
      nextWorkbook,
      targetFile.path,
      sheetIndexOverride ?? safeSheetIdx,
    );
    onUpdateFileContent(targetFile.path, serialized);
  }

  function startInlineEdit(rowIdx: number, colIdx: number, initialOverride?: string) {
    if (!activeSheet) return;
    const isSummary = Boolean(
      activeSheet.summaryRow && rowIdx === activeSheet.rows.length,
    );
    const rawVal = isSummary
      ? activeSheet.summaryRow?.[colIdx]
      : activeSheet.rows[rowIdx]?.[colIdx];
    const seed =
      initialOverride !== undefined
        ? initialOverride
        : rawVal === null || rawVal === undefined
          ? ''
          : String(rawVal);
    setSelectedCell({ rowIdx, colIdx });
    setEditingCell({ rowIdx, colIdx });
    setCellDraft(seed);
    setFormulaDraft(seed);
  }

  function commitInlineEdit(moveDirection?: 'down' | 'right' | 'stay') {
    if (!workbook || !editingCell) return;
    const { rowIdx, colIdx } = editingCell;
    const nextWb = updateGridCell(
      workbook,
      safeSheetIdx,
      rowIdx,
      colIdx,
      cellDraft,
    );
    commitWorkbookUpdate(nextWb);
    setEditingCell(null);

    if (moveDirection === 'down') {
      const nextR = Math.min(Math.max(0, totalRowCount - 1), rowIdx + 1);
      setSelectedCell({ rowIdx: nextR, colIdx });
    } else if (moveDirection === 'right') {
      const nextC = Math.min(Math.max(0, colCount - 1), colIdx + 1);
      setSelectedCell({ rowIdx, colIdx: nextC });
    }
  }

  function commitFormulaBarEdit() {
    if (!workbook || !activeSheet) return;
    const nextWb = updateGridCell(
      workbook,
      safeSheetIdx,
      selectedCell.rowIdx,
      selectedCell.colIdx,
      formulaDraft,
    );
    commitWorkbookUpdate(nextWb);
  }

  function commitHeaderEdit(colIdx: number) {
    if (!workbook) return;
    const nextWb = updateGridColumnHeader(
      workbook,
      safeSheetIdx,
      colIdx,
      headerDraft,
    );
    commitWorkbookUpdate(nextWb);
    setEditingColHeader(null);
  }

  function handleSortColumn(colIdx: number) {
    if (!workbook) return;
    const nextDir: 'asc' | 'desc' =
      sortState && sortState.colIdx === colIdx && sortState.dir === 'asc'
        ? 'desc'
        : 'asc';
    setSortState({ colIdx, dir: nextDir });
    const nextWb = sortGridRowsByColumn(workbook, safeSheetIdx, colIdx, nextDir);
    commitWorkbookUpdate(nextWb);
  }

  function handleInsertQuickFormula(fnName: 'SUM' | 'AVERAGE' | 'MIN' | 'MAX') {
    if (!workbook || !activeSheet) return;
    const colLetter = indexToColLetter(selectedCell.colIdx);
    const dataRowsCount = activeSheet.rows.length;
    const isSummary = Boolean(
      activeSheet.summaryRow && selectedCell.rowIdx === dataRowsCount,
    );
    const expr = isSummary
      ? `=${fnName}(${colLetter}2:${colLetter}${Math.max(2, dataRowsCount + 1)})`
      : colCount > 2 && selectedCell.colIdx > 0
        ? `=${fnName}(B${selectedCell.rowIdx + 2}:${indexToColLetter(
            Math.max(1, selectedCell.colIdx - 1),
          )}${selectedCell.rowIdx + 2})`
        : `=${fnName}(B2:C2)`;
    setFormulaDraft(expr);
    const nextWb = updateGridCell(
      workbook,
      safeSheetIdx,
      selectedCell.rowIdx,
      selectedCell.colIdx,
      expr,
    );
    commitWorkbookUpdate(nextWb);
  }

  async function handleExportXlsx() {
    if (!workbook || !targetFile || exportingXlsx) return;
    setExportingXlsx(true);
    try {
      await exportOfficeFileDownload(workbook, targetFile.path);
    } finally {
      setExportingXlsx(false);
    }
  }

  function handleExportCsv() {
    if (!activeSheet || !targetFile) return;
    const csv = serializeSheetToCsv(activeSheet);
    const cleanBase =
      targetFile.path
        .replace(/\.(xlsx|excel)\.json$/i, '')
        .replace(/\.csv$/i, '') || 'spreadsheet';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanBase}-${activeSheet.name.toLowerCase().replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCreateStarter(kind: 'xlsx' | 'csv') {
    const starter = createStarterSpreadsheetContent(kind);
    let candidatePath = starter.path;
    let counter = 2;
    while (files.some((f) => f.path === candidatePath)) {
      candidatePath =
        kind === 'csv'
          ? `dataset-${counter}.csv`
          : `financial-model-${counter}.xlsx.json`;
      counter += 1;
    }
    onCreateSpreadsheetFile(candidatePath, starter.content);
  }

  const activeColStats = useMemo(() => {
    if (!activeSheet) return null;
    return computeColumnStats(activeSheet, selectedCell.colIdx, false);
  }, [activeSheet, selectedCell.colIdx]);

  const filteredRowIndices = useMemo(() => {
    if (!activeSheet) return [];
    const q = rowFilter.trim().toLowerCase();
    return activeSheet.rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row, idx }) => {
        if (!q) return true;
        return row.some((_cell, cIdx) => {
          const ev = evaluateCellDetailed(activeSheet, idx, cIdx);
          return (
            ev.display.toLowerCase().includes(q) ||
            String(ev.raw ?? '').toLowerCase().includes(q)
          );
        });
      })
      .map((item) => item.idx);
  }, [activeSheet, rowFilter]);

  // Empty state when no Excel or CSV file exists in the workspace
  if (!targetFile || !workbook || !activeSheet) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 sm:p-10 bg-zinc-50 dark:bg-[#0B0B0E] text-zinc-900 dark:text-zinc-100">
        <div className="max-w-lg w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111116] p-6 sm:p-8 text-center space-y-5">
          <div className="w-11 h-11 mx-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
            <Table2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>

          <div className="space-y-1.5">
            <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-white">
              Interactive Excel & CSV Data Grid
            </h2>
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              Edit spreadsheet cells directly, add or sort rows and columns, and
              compute live formulas (=SUM, =AVERAGE, =MIN, =MAX, arithmetic)
              before exporting to .xlsx or .csv.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => handleCreateStarter('xlsx')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Create Budget Workbook (.xlsx.json)</span>
            </button>
            <button
              type="button"
              onClick={() => handleCreateStarter('csv')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Create Dataset Table (.csv)</span>
            </button>
          </div>

          {onAskExcelAgent && (
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
              <button
                type="button"
                onClick={onAskExcelAgent}
                className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate a custom spreadsheet with /excel</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const activeCellCoordLabel = `${indexToColLetter(selectedCell.colIdx)}${selectedCell.rowIdx + 2}`;
  const activeCellEval = evaluateCellDetailed(
    activeSheet,
    selectedCell.rowIdx,
    selectedCell.colIdx,
  );
  const isCsvMode = targetFile.path.toLowerCase().endsWith('.csv');
  const selectedRowIsSummary = Boolean(
    activeSheet.summaryRow && selectedCell.rowIdx === activeSheet.rows.length,
  );

  return (
    <div
      data-testid="spreadsheet-data-grid"
      className="w-full h-full flex flex-col bg-zinc-50 dark:bg-[#0B0B0E] text-zinc-900 dark:text-zinc-100 overflow-hidden"
    >
      {/* Header Row 1: File Switcher + Exports */}
      <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0D0D10] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          {spreadsheetFiles.length > 1 ? (
            <>
              <label htmlFor="grid-file-select" className="sr-only">
                Active spreadsheet file
              </label>
              <select
                id="grid-file-select"
                value={targetFile.path}
                onChange={(e) => onSelectFile(e.target.value)}
                className="px-2 py-1 rounded-md text-xs font-mono bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none max-w-[200px]"
              >
                {spreadsheetFiles.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <span className="text-xs font-mono font-medium truncate max-w-[200px]">
              {targetFile.path}
            </span>
          )}
          <span className="text-xs text-zinc-400">·</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums whitespace-nowrap">
            {activeSheet.rows.length} rows × {colCount} cols
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>Export .csv</span>
          </button>

          <button
            type="button"
            onClick={handleExportXlsx}
            disabled={exportingXlsx}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>{exportingXlsx ? 'Exporting...' : 'Export .xlsx'}</span>
          </button>
        </div>
      </div>

      {/* Header Row 2: Search Filter & Grid Structure Controls */}
      <div className="px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-[#0D0D10] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="relative flex-1 min-w-[140px] max-w-[220px]">
          <Search className="w-3 h-3 text-zinc-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Filter grid rows"
            value={rowFilter}
            onChange={(e) => setRowFilter(e.target.value)}
            placeholder="Filter rows..."
            className="w-full pl-6 pr-2 py-1 rounded-md text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              commitWorkbookUpdate(addGridRow(workbook, safeSheetIdx))
            }
            aria-label="Add row"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
          >
            <Rows3 className="w-3 h-3" />
            <span>+ Row</span>
          </button>

          <button
            type="button"
            onClick={() =>
              commitWorkbookUpdate(addGridColumn(workbook, safeSheetIdx))
            }
            aria-label="Add column"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
          >
            <Columns3 className="w-3 h-3" />
            <span>+ Col</span>
          </button>

          <button
            type="button"
            onClick={() =>
              commitWorkbookUpdate(toggleGridSummaryRow(workbook, safeSheetIdx))
            }
            aria-pressed={Boolean(activeSheet.summaryRow)}
            aria-label="Toggle summary sum row"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border whitespace-nowrap cursor-pointer ${
              activeSheet.summaryRow
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Sigma className="w-3 h-3" />
            <span>Sum Row</span>
          </button>

          <button
            type="button"
            onClick={() =>
              commitWorkbookUpdate(
                deleteGridRow(workbook, safeSheetIdx, selectedCell.rowIdx),
              )
            }
            disabled={
              activeSheet.rows.length === 0 && !activeSheet.summaryRow
            }
            aria-label="Delete selected row"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span>Del Row</span>
          </button>
        </div>
      </div>

      {/* Formula Bar (fx) */}
      <div className="px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#101015] flex flex-wrap items-center gap-2 shrink-0">
        <div
          aria-label="Active cell coordinate"
          className="px-2 py-1 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums min-w-[48px] text-center"
        >
          {activeCellCoordLabel}
          {selectedRowIsSummary ? ' · Σ' : ''}
        </div>

        <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
          <FunctionSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-[11px] font-mono">fx</span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            commitFormulaBarEdit();
          }}
          className="flex-1 min-w-[180px] flex items-center gap-1.5"
        >
          <input
            type="text"
            aria-label="Formula input"
            value={formulaDraft}
            onChange={(e) => setFormulaDraft(e.target.value)}
            onBlur={commitFormulaBarEdit}
            placeholder="Value or formula (e.g. =SUM(B2:D2) or =B2*C2)"
            className="flex-1 min-w-0 px-2.5 py-1 rounded-md text-xs font-mono bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            aria-label="Apply formula"
            className="px-2 py-1 rounded-md text-xs bg-zinc-900 dark:bg-zinc-800 text-white hover:bg-zinc-700 whitespace-nowrap cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="hidden lg:flex items-center gap-1">
          {(['SUM', 'AVERAGE', 'MIN', 'MAX'] as const).map((fn) => (
            <button
              key={fn}
              type="button"
              onClick={() => handleInsertQuickFormula(fn)}
              className="px-2 py-0.5 rounded text-[11px] font-mono border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:border-emerald-500/60 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
            >
              ={fn}
            </button>
          ))}
        </div>

        {activeCellEval.error && (
          <span className="text-[11px] font-mono text-red-600 dark:text-red-400">
            {activeCellEval.display}: {activeCellEval.error}
          </span>
        )}
      </div>

      {/* Sheet Tabs (for Excel workbooks) */}
      {!isCsvMode && (
        <div className="px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-[#0D0D10] flex flex-wrap items-center gap-1.5 shrink-0">
          {workbook.sheets.map((s, idx) => (
            <button
              key={`${s.name}-${idx}`}
              type="button"
              onClick={() => {
                setSheetIdx(idx);
                setSelectedCell({ rowIdx: 0, colIdx: 0 });
                setEditingCell(null);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                idx === safeSheetIdx
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              {s.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const nextWb = addGridSheet(workbook);
              commitWorkbookUpdate(nextWb, nextWb.sheets.length - 1);
              setSheetIdx(nextWb.sheets.length - 1);
            }}
            aria-label="Add sheet"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-600 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Sheet</span>
          </button>
        </div>
      )}

      {/* Spreadsheet Grid Table */}
      <div className="flex-1 min-h-0 overflow-auto bg-white dark:bg-[#0D0D10]">
        <table
          role="grid"
          aria-label={`Spreadsheet ${targetFile.path}`}
          className="w-full border-collapse text-xs"
        >
          <thead className="sticky top-0 z-10 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th
                scope="col"
                className="w-10 min-w-[40px] py-1.5 px-2 text-center font-mono text-[10px] text-zinc-400 border-r border-zinc-200 dark:border-zinc-800 select-none"
              >
                #
              </th>
              {Array.from({ length: colCount }, (_, cIdx) => {
                const colLetter = indexToColLetter(cIdx);
                const headerName = activeSheet.columns[cIdx] ?? colLetter;
                const isSorted = sortState?.colIdx === cIdx;
                const isEditingHdr = editingColHeader === cIdx;

                return (
                  <th
                    key={cIdx}
                    scope="col"
                    className={`${
                      cIdx === 0 ? 'min-w-[112px]' : 'min-w-[72px]'
                    } py-1.5 px-2 text-left font-medium text-zinc-700 dark:text-zinc-200 border-r last:border-r-0 border-zinc-200 dark:border-zinc-800 group`}
                  >
                    {isEditingHdr ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          commitHeaderEdit(cIdx);
                        }}
                        className="flex items-center gap-1"
                      >
                        <input
                          type="text"
                          autoFocus
                          aria-label={`Rename column ${colLetter}`}
                          value={headerDraft}
                          onChange={(e) => setHeaderDraft(e.target.value)}
                          onBlur={() => commitHeaderEdit(cIdx)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setEditingColHeader(null);
                            }
                          }}
                          className="w-full px-1.5 py-0.5 rounded bg-white dark:bg-zinc-950 border border-emerald-500 text-xs focus:outline-none"
                        />
                      </form>
                    ) : (
                      <div className="flex items-center justify-between gap-1.5">
                        <button
                          type="button"
                          onDoubleClick={() => {
                            setEditingColHeader(cIdx);
                            setHeaderDraft(headerName);
                          }}
                          title="Double-click to rename column"
                          className="flex items-center gap-1.5 min-w-0 text-left cursor-pointer"
                        >
                          <span className="font-mono text-[10px] text-zinc-400 shrink-0">
                            {colLetter}
                          </span>
                          <span className="truncate font-semibold">
                            {headerName}
                          </span>
                        </button>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSortColumn(cIdx)}
                            aria-label={`Sort column ${headerName}`}
                            className={`p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer ${
                              isSorted
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-zinc-400 opacity-70 group-hover:opacity-100'
                            }`}
                          >
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                          {colCount > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                commitWorkbookUpdate(
                                  deleteGridColumn(workbook, safeSheetIdx, cIdx),
                                )
                              }
                              aria-label={`Remove column ${headerName}`}
                              className="p-0.5 rounded text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
            {filteredRowIndices.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount + 1}
                  className="py-8 px-4 text-center text-xs text-zinc-500 dark:text-zinc-400"
                >
                  {activeSheet.rows.length === 0
                    ? 'No rows in this sheet yet. Click "+ Row" to add an entry.'
                    : `No rows match "${rowFilter}".`}
                </td>
              </tr>
            ) : (
              filteredRowIndices.map((rIdx) => {
                const isSelectedRow = selectedCell.rowIdx === rIdx;
                return (
                  <tr
                    key={rIdx}
                    className={`h-9 ${
                      isSelectedRow
                        ? 'bg-zinc-50/80 dark:bg-zinc-900/60'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/40'
                    }`}
                  >
                    <td className="py-1.5 px-2 text-center font-mono text-[10px] text-zinc-400 border-r border-zinc-200 dark:border-zinc-800 tabular-nums select-none">
                      {rIdx + 2}
                    </td>

                    {Array.from({ length: colCount }, (_, cIdx) => {
                      const colLetter = indexToColLetter(cIdx);
                      const cellCoord = `${colLetter}${rIdx + 2}`;
                      const isSelected =
                        selectedCell.rowIdx === rIdx &&
                        selectedCell.colIdx === cIdx;
                      const isEditing =
                        editingCell?.rowIdx === rIdx &&
                        editingCell?.colIdx === cIdx;
                      const evalRes = evaluateCellDetailed(
                        activeSheet,
                        rIdx,
                        cIdx,
                      );

                      return (
                        <td
                          key={cIdx}
                          role="gridcell"
                          aria-selected={isSelected}
                          onClick={() => {
                            if (isSelected && !isEditing) {
                              startInlineEdit(rIdx, cIdx);
                            } else {
                              setSelectedCell({ rowIdx: rIdx, colIdx: cIdx });
                            }
                          }}
                          onDoubleClick={() => startInlineEdit(rIdx, cIdx)}
                          onKeyDown={(e) => {
                            if (isEditing) return;
                            if (e.key === 'Enter' || e.key === 'F2') {
                              e.preventDefault();
                              startInlineEdit(rIdx, cIdx);
                            } else if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setSelectedCell({
                                rowIdx: Math.min(totalRowCount - 1, rIdx + 1),
                                colIdx: cIdx,
                              });
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setSelectedCell({
                                rowIdx: Math.max(0, rIdx - 1),
                                colIdx: cIdx,
                              });
                            } else if (e.key === 'ArrowRight') {
                              e.preventDefault();
                              setSelectedCell({
                                rowIdx: rIdx,
                                colIdx: Math.min(colCount - 1, cIdx + 1),
                              });
                            } else if (e.key === 'ArrowLeft') {
                              e.preventDefault();
                              setSelectedCell({
                                rowIdx: rIdx,
                                colIdx: Math.max(0, cIdx - 1),
                              });
                            }
                          }}
                          tabIndex={isSelected ? 0 : -1}
                          title={
                            evalRes.isFormula
                              ? String(evalRes.raw ?? '')
                              : undefined
                          }
                          className={`p-0 border-r last:border-r-0 border-zinc-200 dark:border-zinc-800 relative focus:outline-none ${
                            isSelected
                              ? 'ring-2 ring-inset ring-emerald-500 bg-emerald-500/5'
                              : ''
                          }`}
                        >
                          {isEditing ? (
                            <input
                              ref={inlineInputRef}
                              type="text"
                              aria-label={`Edit cell ${cellCoord}`}
                              value={cellDraft}
                              onChange={(e) => {
                                setCellDraft(e.target.value);
                                setFormulaDraft(e.target.value);
                              }}
                              onBlur={() => commitInlineEdit('stay')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  commitInlineEdit('down');
                                } else if (e.key === 'Tab') {
                                  e.preventDefault();
                                  commitInlineEdit('right');
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full h-9 px-2.5 text-xs font-mono bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none"
                            />
                          ) : (
                            <div
                              data-cell={cellCoord}
                              className={`h-9 px-2.5 flex items-center whitespace-nowrap cursor-cell ${
                                evalRes.error
                                  ? 'justify-end font-mono tabular-nums text-red-600 dark:text-red-400 font-medium'
                                  : evalRes.isNumeric
                                    ? 'justify-end font-mono tabular-nums'
                                    : 'justify-start'
                              } ${
                                evalRes.isFormula && !evalRes.error
                                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                  : ''
                              }`}
                            >
                              <span className="truncate">{evalRes.display}</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}

            {activeSheet.summaryRow && activeSheet.summaryRow.length > 0 && (
              <tr className="h-9 bg-emerald-50/70 dark:bg-emerald-950/30 font-semibold border-t-2 border-emerald-500/40">
                <td className="py-1.5 px-2 text-center font-mono text-[10px] text-emerald-700 dark:text-emerald-400 border-r border-zinc-200 dark:border-zinc-800 select-none">
                  Σ
                </td>
                {Array.from({ length: colCount }, (_, cIdx) => {
                  const summaryRowIdx = activeSheet.rows.length;
                  const cellCoord = `${indexToColLetter(cIdx)}${summaryRowIdx + 2}`;
                  const isSelected =
                    selectedCell.rowIdx === summaryRowIdx &&
                    selectedCell.colIdx === cIdx;
                  const isEditing =
                    editingCell?.rowIdx === summaryRowIdx &&
                    editingCell?.colIdx === cIdx;
                  const evalRes = evaluateCellDetailed(
                    activeSheet,
                    summaryRowIdx,
                    cIdx,
                  );

                  return (
                    <td
                      key={cIdx}
                      role="gridcell"
                      aria-selected={isSelected}
                      onClick={() => {
                        if (isSelected && !isEditing) {
                          startInlineEdit(summaryRowIdx, cIdx);
                        } else {
                          setSelectedCell({ rowIdx: summaryRowIdx, colIdx: cIdx });
                        }
                      }}
                      onDoubleClick={() => startInlineEdit(summaryRowIdx, cIdx)}
                      title={
                        evalRes.isFormula
                          ? String(evalRes.raw ?? '')
                          : undefined
                      }
                      className={`p-0 border-r last:border-r-0 border-zinc-200 dark:border-zinc-800 ${
                        isSelected
                          ? 'ring-2 ring-inset ring-emerald-500'
                          : ''
                      }`}
                    >
                      {isEditing ? (
                        <input
                          ref={inlineInputRef}
                          type="text"
                          aria-label={`Edit cell ${cellCoord}`}
                          value={cellDraft}
                          onChange={(e) => {
                            setCellDraft(e.target.value);
                            setFormulaDraft(e.target.value);
                          }}
                          onBlur={() => commitInlineEdit('stay')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              e.preventDefault();
                              commitInlineEdit('stay');
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditingCell(null);
                            }
                          }}
                          className="w-full h-9 px-2.5 text-xs font-mono bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none"
                        />
                      ) : (
                        <div
                          data-cell={cellCoord}
                          className={`h-9 px-2.5 flex items-center whitespace-nowrap cursor-cell ${
                            evalRes.isNumeric || evalRes.isFormula
                              ? 'justify-end font-mono tabular-nums text-emerald-700 dark:text-emerald-300'
                              : 'justify-start text-zinc-900 dark:text-zinc-100'
                          }`}
                        >
                          <span className="truncate">{evalRes.display}</span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Column Aggregation & Hint Footer */}
      <div className="px-3 py-1.5 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0D0D10] flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0">
        <span className="truncate">
          Click any cell to select · click again or double-click to edit · use{' '}
          <code className="font-mono text-zinc-700 dark:text-zinc-300">
            =SUM(B2:E2)
          </code>{' '}
          or{' '}
          <code className="font-mono text-zinc-700 dark:text-zinc-300">
            =B2*C2
          </code>
        </span>

        {activeColStats ? (
          <div
            data-testid="column-stats-bar"
            className="flex items-center gap-3 font-mono tabular-nums text-zinc-700 dark:text-zinc-300 whitespace-nowrap"
          >
            <span>
              Col {indexToColLetter(selectedCell.colIdx)} ({activeColStats.count}
              )
            </span>
            <span>
              Sum:{' '}
              {activeColStats.sum.toLocaleString('en-US', {
                maximumFractionDigits: 2,
              })}
            </span>
            <span>
              Avg:{' '}
              {activeColStats.avg.toLocaleString('en-US', {
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="hidden sm:inline">
              Min:{' '}
              {activeColStats.min.toLocaleString('en-US', {
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="hidden sm:inline">
              Max:{' '}
              {activeColStats.max.toLocaleString('en-US', {
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        ) : (
          <span className="font-mono">
            Col {indexToColLetter(selectedCell.colIdx)} · Text
          </span>
        )}
      </div>
    </div>
  );
}
