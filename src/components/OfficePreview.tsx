import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  Table2,
} from 'lucide-react';
import {
  evaluateSheetCellDisplay,
  exportOfficeFileDownload,
  type OfficeArtifactSpec,
} from '../utils/officeGenerator';

interface OfficePreviewProps {
  spec: OfficeArtifactSpec;
  filePath: string;
  onEditInGrid?: () => void;
}

export function OfficePreview({ spec, filePath, onEditInGrid }: OfficePreviewProps) {
  const [downloading, setDownloading] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
  const [sheetIdx, setSheetIdx] = useState(0);

  useEffect(() => {
    setSlideIdx(0);
    setSheetIdx(0);
  }, [filePath]);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      await exportOfficeFileDownload(spec, filePath);
    } finally {
      setDownloading(false);
    }
  }

  const extLabel =
    spec.kind === 'word' ? '.docx' : spec.kind === 'ppt' ? '.pptx' : '.xlsx';
  const Icon =
    spec.kind === 'word'
      ? FileText
      : spec.kind === 'ppt'
        ? Presentation
        : FileSpreadsheet;

  return (
    <div className="w-full h-full flex flex-col bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden">
      {/* Header bar */}
      <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0D0D10] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-indigo-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">{spec.title}</div>
            <div className="text-[11px] font-mono text-zinc-500 truncate">
              {filePath} ·{' '}
              {spec.kind === 'word'
                ? `${spec.sections.length} sections`
                : spec.kind === 'ppt'
                  ? `${spec.slides.length} slides`
                  : `${spec.sheets.length} sheet(s)`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {spec.kind === 'excel' && onEditInGrid && (
            <button
              type="button"
              onClick={onEditInGrid}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 whitespace-nowrap cursor-pointer"
            >
              <Table2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Edit in Data Grid</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60 whitespace-nowrap cursor-pointer"
          >
            {downloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Download {extLabel}</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        {spec.kind === 'word' && (
          <article className="max-w-3xl mx-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white text-zinc-900 shadow-sm p-6 sm:p-10 space-y-6">
            <header className="border-b border-zinc-200 pb-4">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">
                {spec.title}
              </h1>
              {spec.subtitle && (
                <p className="text-sm text-indigo-600 mt-1">{spec.subtitle}</p>
              )}
              <div className="text-xs text-zinc-500 mt-2 flex flex-wrap gap-3">
                {spec.author && <span>Author: {spec.author}</span>}
                {spec.date && <span>Date: {spec.date}</span>}
              </div>
            </header>

            {spec.sections.map((sec, idx) => (
              <section key={idx} className="space-y-2.5">
                <h2
                  className={`font-semibold text-zinc-900 ${
                    sec.level === 2
                      ? 'text-base'
                      : sec.level === 3
                        ? 'text-sm'
                        : 'text-lg'
                  }`}
                >
                  {sec.heading}
                </h2>

                {sec.callout && (
                  <div className="p-3 rounded-lg bg-indigo-50 border-l-4 border-indigo-500 text-xs font-medium text-indigo-950">
                    {sec.callout}
                  </div>
                )}

                {sec.paragraphs?.map((p, pIdx) => (
                  <p key={pIdx} className="text-sm leading-relaxed text-zinc-700">
                    {p}
                  </p>
                ))}

                {sec.bullets && sec.bullets.length > 0 && (
                  <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-700">
                    {sec.bullets.map((b, bIdx) => (
                      <li key={bIdx}>{b}</li>
                    ))}
                  </ul>
                )}

                {sec.table && sec.table.headers.length > 0 && (
                  <div className="overflow-x-auto border border-zinc-200 rounded-lg mt-2">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-indigo-600 text-white">
                          {sec.table.headers.map((h, hIdx) => (
                            <th key={hIdx} className="py-2 px-3 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200">
                        {sec.table.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="odd:bg-zinc-50">
                            {sec.table!.headers.map((_h, cIdx) => (
                              <td key={cIdx} className="py-2 px-3 text-zinc-800">
                                {String(row[cIdx] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </article>
        )}

        {spec.kind === 'ppt' && (
          <div className="max-w-4xl mx-auto space-y-4">
            {(() => {
              const safeIdx = Math.min(slideIdx, Math.max(0, spec.slides.length - 1));
              const slide = spec.slides[safeIdx];
              if (!slide) return null;
              return (
                <>
                  <div className="aspect-video w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#0F1020] text-zinc-100 p-6 sm:p-10 flex flex-col justify-between shadow-lg">
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-indigo-300/80 mb-3">
                        <span>{spec.title}</span>
                        <span className="tabular-nums">
                          Slide {safeIdx + 1} / {spec.slides.length}
                        </span>
                      </div>

                      <h2
                        className={`font-display font-bold tracking-tight ${
                          slide.layout === 'title'
                            ? 'text-2xl sm:text-4xl mt-8'
                            : 'text-xl sm:text-2xl'
                        }`}
                      >
                        {slide.title}
                      </h2>

                      {slide.subtitle && (
                        <p className="text-sm sm:text-base text-zinc-400 mt-2">
                          {slide.subtitle}
                        </p>
                      )}

                      {slide.metrics && slide.metrics.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
                          {slide.metrics.slice(0, 4).map((m, mIdx) => (
                            <div
                              key={mIdx}
                              className="p-3.5 rounded-xl bg-[#1B1D36] border border-indigo-500/30"
                            >
                              <div className="text-[11px] text-zinc-400">{m.label}</div>
                              <div className="text-xl font-bold text-white mt-0.5 tabular-nums">
                                {m.value}
                              </div>
                              {m.delta && (
                                <div className="text-[11px] text-indigo-400 mt-0.5">
                                  {m.delta}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {slide.bullets && slide.bullets.length > 0 && (
                        <ul className="mt-5 space-y-2 text-sm text-zinc-200">
                          {slide.bullets.map((b, bIdx) => (
                            <li key={bIdx} className="flex items-start gap-2.5">
                              <span className="text-indigo-400 font-bold">•</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="text-[11px] font-mono text-zinc-500">
                      MyAI Studio × MYRA Presentation Engine
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}
                        disabled={safeIdx === 0}
                        aria-label="Previous slide"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Prev</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSlideIdx((i) => Math.min(spec.slides.length - 1, i + 1))
                        }
                        disabled={safeIdx >= spec.slides.length - 1}
                        aria-label="Next slide"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 disabled:opacity-40 cursor-pointer"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {spec.slides.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSlideIdx(idx)}
                          title={s.title}
                          className={`px-2 py-1 rounded text-[11px] font-mono tabular-nums cursor-pointer ${
                            idx === safeIdx
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>

                  {slide.notes && (
                    <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0D0D10] text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                        Speaker Notes:{' '}
                      </span>
                      {slide.notes}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {spec.kind === 'excel' && (
          <div className="max-w-5xl mx-auto space-y-4">
            {/* Sheet tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {spec.sheets.map((s, idx) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => setSheetIdx(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    idx === sheetIdx
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>

            {(() => {
              const sheet = spec.sheets[Math.min(sheetIdx, spec.sheets.length - 1)];
              if (!sheet) return null;
              const colCount = Math.max(
                sheet.columns.length,
                ...sheet.rows.map((r) => r.length),
                sheet.summaryRow?.length ?? 0,
              );

              const denseCols = colCount >= 5;
              const cellPad = denseCols ? 'py-1.5 px-2' : 'py-2 px-3';

              return (
                <>
                  <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0D0D10]">
                    <table
                      className={`w-full text-left border-collapse ${
                        denseCols ? 'text-[11px]' : 'text-xs'
                      }`}
                    >
                      <thead>
                        <tr className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300">
                          <th className="py-1.5 px-2 font-mono text-[10px] text-zinc-400 w-8 text-center border-r border-zinc-200 dark:border-zinc-800">
                            #
                          </th>
                          {Array.from({ length: colCount }, (_, cIdx) => (
                            <th
                              key={cIdx}
                              className={`${cellPad} font-semibold whitespace-nowrap border-r last:border-r-0 border-zinc-200 dark:border-zinc-800`}
                            >
                              {sheet.columns[cIdx] ??
                                String.fromCharCode(65 + cIdx)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {sheet.rows.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                          >
                            <td className="py-1.5 px-2 font-mono text-[10px] text-zinc-400 text-center border-r border-zinc-200 dark:border-zinc-800 tabular-nums">
                              {rIdx + 2}
                            </td>
                            {Array.from({ length: colCount }, (_, cIdx) => {
                              const rawCell = row[cIdx];
                              const isFormula =
                                typeof rawCell === 'string' &&
                                rawCell.trim().startsWith('=');
                              const display = evaluateSheetCellDisplay(
                                sheet,
                                rIdx,
                                cIdx,
                              );
                              const isNumeric =
                                typeof rawCell === 'number' || isFormula;
                              return (
                                <td
                                  key={cIdx}
                                  title={isFormula ? String(rawCell) : undefined}
                                  className={`${cellPad} border-r last:border-r-0 border-zinc-200 dark:border-zinc-800 whitespace-nowrap ${
                                    isNumeric
                                      ? 'font-mono tabular-nums text-right'
                                      : ''
                                  } ${
                                    isFormula
                                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                      : ''
                                  }`}
                                >
                                  {display}
                                </td>
                              );
                            })}
                          </tr>
                        ))}

                        {sheet.summaryRow && sheet.summaryRow.length > 0 && (
                          <tr className="bg-emerald-50/70 dark:bg-emerald-950/30 font-semibold border-t-2 border-emerald-500/40">
                            <td className="py-1.5 px-2 font-mono text-[10px] text-emerald-600 dark:text-emerald-400 text-center border-r border-zinc-200 dark:border-zinc-800">
                              Σ
                            </td>
                            {Array.from({ length: colCount }, (_, cIdx) => {
                              const rawCell = sheet.summaryRow![cIdx];
                              const isFormula =
                                typeof rawCell === 'string' &&
                                rawCell.trim().startsWith('=');
                              const display = evaluateSheetCellDisplay(
                                sheet,
                                sheet.rows.length,
                                cIdx,
                              );
                              return (
                                <td
                                  key={cIdx}
                                  title={isFormula ? String(rawCell) : undefined}
                                  className={`${cellPad} border-r last:border-r-0 border-zinc-200 dark:border-zinc-800 whitespace-nowrap ${
                                    typeof rawCell === 'number' || isFormula
                                      ? 'font-mono tabular-nums text-right text-emerald-700 dark:text-emerald-300'
                                      : ''
                                  }`}
                                >
                                  {display}
                                </td>
                              );
                            })}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {sheet.notes && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Notes: {sheet.notes}
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
