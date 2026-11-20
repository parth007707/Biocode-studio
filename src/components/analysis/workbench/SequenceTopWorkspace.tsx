import React, { useMemo, useState } from 'react';
import {
  Database,
  Plus,
  Copy,
  Check,
  Edit3,
  Sparkles,
  Play,
  RotateCcw,
  Loader2,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatNumber } from '../../../lib/utils/formatters';
import { validateBiologicalSequence } from '../../../lib/bio/sequenceValidator';
import { RealtimeFastaValidator } from './RealtimeFastaValidator';

interface SequenceTopWorkspaceProps {
  accession: string;
  definition: string;
  sequenceType: string;
  organism: string;
  length: number;
  unit: string;
  versionLabel: string;
  sequence: string;
  isModified?: boolean;
  mutationCount?: number;
  originalSequence?: string;
  copied: boolean;
  running: boolean;
  hasRunAnalysis: boolean;
  isLoadingSequence?: boolean;
  sequenceError?: string | null;
  sourceMetadata?: any;
  onRetryLoad?: () => void;
  onCopySequence: (seq: string) => void;
  onOpenLoadModal: () => void;
  onOpenNewModal: () => void;
  onOpenEditor: () => void;
  onOpenWhatIf: () => void;
  onTriggerBioAI: () => void;
  onRunAnalysis: () => void;
  onSanitizeSequence?: (cleanSeq: string) => void;
}

export const SequenceTopWorkspace: React.FC<SequenceTopWorkspaceProps> = ({
  accession,
  definition,
  sequenceType,
  organism,
  length,
  unit,
  versionLabel,
  sequence,
  isModified,
  mutationCount,
  originalSequence,
  copied,
  running,
  hasRunAnalysis,
  isLoadingSequence,
  sequenceError,
  sourceMetadata,
  onRetryLoad,
  onCopySequence,
  onOpenLoadModal,
  onOpenNewModal,
  onOpenEditor,
  onOpenWhatIf,
  onTriggerBioAI,
  onRunAnalysis,
  onSanitizeSequence
}) => {
  const [showValidator, setShowValidator] = useState<boolean>(false);
  const [windowPage, setWindowPage] = useState<number>(1);
  const WINDOW_SIZE = 6000;

  // Real-time biological validation
  const validation = useMemo(() => {
    return validateBiologicalSequence(sequence || '', (sequenceType as any) || 'PROTEIN');
  }, [sequence, sequenceType]);

  const { isValid, totalInvalidCount, invalidFindings } = validation;

  const totalPages = Math.max(1, Math.ceil((sequence?.length || 0) / WINDOW_SIZE));
  const currentPage = Math.min(windowPage, totalPages);
  const windowOffset = (currentPage - 1) * WINDOW_SIZE;
  const currentWindowSeq = (sequence || '').slice(windowOffset, windowOffset + WINDOW_SIZE);
  const baseOffset = (sourceMetadata?.isPartialRange && typeof sourceMetadata.rangeStart === 'number')
    ? sourceMetadata.rangeStart - 1
    : 0;

  // Formatted biological sequence display with line numbers and character-level IUPAC highlighting
  const formattedSequenceDisplay = useMemo(() => {
    if (isLoadingSequence) {
      return (
        <div className="flex items-center gap-3 py-6 px-4 text-sky-700 bg-sky-50/50 rounded-xl border border-sky-200">
          <Loader2 className="w-5 h-5 animate-spin text-[#0284C7] shrink-0" />
          <div className="text-xs font-mono">
            <span className="font-semibold block text-[#0F172A]">Fetching biological sequence data...</span>
            <span className="text-slate-500 text-[11px]">Retrieving record for {accession} from biological repository</span>
          </div>
        </div>
      );
    }
    if (sequenceError && !sequence) {
      return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-mono">{sequenceError}</span>
          </div>
          {onRetryLoad && (
            <button
              type="button"
              onClick={onRetryLoad}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-mono font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Load</span>
            </button>
          )}
        </div>
      );
    }
    if (!sequence) {
      return <span className="text-[#94A3B8] italic">No sequence data available</span>;
    }

    // Set of invalid character positions for 1-based indexing
    const invalidCharPositionsMap = new Map<number, string>();
    invalidFindings.forEach((f) => {
      f.positions.forEach((pos) => {
        invalidCharPositionsMap.set(pos, f.description);
      });
    });

    const rows: { start: number; end: number; blocks: { startIdx: number; chars: { char: string; pos: number; desc?: string }[] }[] }[] = [];
    for (let i = 0; i < currentWindowSeq.length; i += 60) {
      const rowSeq = currentWindowSeq.slice(i, i + 60);
      const blocks: { startIdx: number; chars: { char: string; pos: number; desc?: string }[] }[] = [];
      for (let j = 0; j < rowSeq.length; j += 10) {
        const blockStr = rowSeq.slice(j, j + 10);
        const chars = [];
        for (let k = 0; k < blockStr.length; k++) {
          const charPos = baseOffset + windowOffset + i + j + k + 1;
          chars.push({
            char: blockStr[k],
            pos: charPos,
            desc: invalidCharPositionsMap.get(charPos)
          });
        }
        blocks.push({ startIdx: baseOffset + windowOffset + i + j + 1, chars });
      }
      rows.push({
        start: baseOffset + windowOffset + i + 1,
        end: baseOffset + windowOffset + Math.min(i + 60, currentWindowSeq.length),
        blocks
      });
    }

    return (
      <div className="space-y-1.5 w-full">
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200/80 text-xs font-mono text-slate-600">
            <span className="font-medium text-slate-700">
              Showing Window: <strong className="text-[#0F172A]">{(baseOffset + windowOffset + 1).toLocaleString()}–{(baseOffset + windowOffset + currentWindowSeq.length).toLocaleString()}</strong> of {(baseOffset + sequence.length).toLocaleString()} {unit}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setWindowPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-2.5 py-1 text-xs rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium cursor-pointer shadow-2xs"
              >
                ← Prev Window
              </button>
              <span className="px-2 text-slate-500 font-bold">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setWindowPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-2.5 py-1 text-xs rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium cursor-pointer shadow-2xs"
              >
                Next Window →
              </button>
            </div>
          </div>
        )}

        {rows.map((r) => (
          <div
            key={r.start}
            className="flex items-center gap-2.5 sm:gap-4 py-1 border-b border-slate-200/60 last:border-b-0 hover:bg-slate-100/60 rounded px-1.5 transition-colors min-w-max sm:min-w-0 w-full"
          >
            <span className="text-slate-400 select-none text-[11px] sm:text-xs w-10 sm:w-16 text-right shrink-0 font-mono font-semibold">
              {r.start}
            </span>

            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3 md:gap-4 font-mono font-medium text-xs sm:text-[13px] text-[#0F172A] tracking-wider sm:tracking-widest select-text w-full">
              {r.blocks.map((b, bIdx) => (
                <span key={bIdx} className="tracking-wider sm:tracking-widest whitespace-nowrap">
                  {b.chars.map((c) => (
                    c.desc ? (
                      <mark
                        key={c.pos}
                        className="bg-rose-200 text-rose-950 font-bold underline decoration-rose-600 rounded px-0.5"
                        title={`Pos ${c.pos}: '${c.char}' — ${c.desc}`}
                      >
                        {c.char}
                      </mark>
                    ) : (
                      c.char
                    )
                  ))}
                </span>
              ))}
            </div>

            <span className="text-slate-400 select-none text-[11px] sm:text-xs w-12 sm:w-16 text-left shrink-0 font-mono hidden md:inline">
              {r.end}
            </span>
          </div>
        ))}
      </div>
    );
  }, [sequence, currentWindowSeq, currentPage, totalPages, windowOffset, baseOffset, isLoadingSequence, sequenceError, invalidFindings, unit]);

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-6 md:p-8 shadow-xs space-y-5 sm:space-y-6">
      {/* SECTION 1 — SEQUENCE AT THE TOP */}
      <div className="border-b border-[#E2E8F0] pb-5">
        <span className="text-[11px] font-mono font-bold tracking-widest text-[#0284C7] uppercase block mb-1">
          BIOLOGICAL SEQUENCE
        </span>
        <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold font-mono text-[#0F172A] tracking-tight break-words">
              {accession}
            </h1>
            <p className="text-sm md:text-base font-medium text-[#475569] mt-0.5">
              {definition}
            </p>
          </div>

          {/* Quick Target Switch Controls */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenLoadModal}
              className="px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-[#0284C7] border border-sky-200 text-xs font-semibold font-mono flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs active:scale-95"
              title="Load another benchmark protein or external sequence"
            >
              <Database className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>Load Target</span>
            </button>
            <button
              type="button"
              onClick={onOpenNewModal}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-semibold font-mono flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
              title="Import or search new sequence"
            >
              <Plus className="w-3.5 h-3.5 text-slate-700" />
              <span>New Sequence</span>
            </button>
          </div>
        </div>

        {/* Sequence Metadata: Zero-pill discipline */}
        <div className="mt-3 flex items-center flex-wrap gap-2 text-xs text-[#64748B] font-mono">
          <span className="font-semibold text-[#0F172A]">{sequenceType}</span>
          <span aria-hidden="true" className="text-[#CBD5E1]">•</span>
          <span>{organism}</span>
          <span aria-hidden="true" className="text-[#CBD5E1]">•</span>
          <span>{formatNumber(length)} {unit}</span>
          <span aria-hidden="true" className="text-[#CBD5E1]">•</span>
          {sourceMetadata?.isPartialRange && (
            <>
              <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                Region: {Number(sourceMetadata.rangeStart || 1).toLocaleString()}–{Number(sourceMetadata.rangeEnd || length).toLocaleString()} of {Number(sourceMetadata.totalLength || length).toLocaleString()} {unit}
              </span>
              <span aria-hidden="true" className="text-[#CBD5E1]">•</span>
            </>
          )}
          {isModified ? (
            <>
              <span className="text-[#64748B]">Original: Version 1 — Original</span>
              <span aria-hidden="true" className="text-[#CBD5E1]">•</span>
              <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
                Current: Version 1 — Working Copy
              </span>
              <span aria-hidden="true" className="text-[#CBD5E1]">•</span>
              <span className="text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                Changes: {mutationCount || 0}
              </span>
            </>
          ) : (
            <span className="text-[#0284C7] font-semibold">{versionLabel}</span>
          )}
        </div>
      </div>

      {/* SECTION 2 — FULL-WIDTH SEQUENCE VIEWER */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-[#334155] flex items-center gap-2">
              <span>{isModified ? 'Working Sequence (Modified)' : 'Original Sequence'}</span>
              {isModified && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold normal-case">
                  Changes: {mutationCount || 0}
                </span>
              )}
            </span>

            {/* Warning Icon & Status Badge for FASTA Format Validation */}
            {!isValid && (
              <button
                type="button"
                onClick={() => setShowValidator(!showValidator)}
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-mono text-[11px] font-bold cursor-pointer transition-colors shadow-2xs"
                title="Click to inspect non-IUPAC characters and FASTA validation details"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
                <span>FASTA Warning ({totalInvalidCount})</span>
                {showValidator ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowValidator(!showValidator)}
              className="text-[11px] font-mono text-[#0284C7] hover:text-sky-700 flex items-center gap-1 transition-colors cursor-pointer px-2 py-0.5 rounded hover:bg-sky-50 border border-sky-200"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{showValidator ? 'Hide Validator' : 'FASTA Validator'}</span>
            </button>

            <span className="text-[11px] font-mono text-[#64748B]">
              {formatNumber(length)} {unit}
            </span>
            <button
              type="button"
              onClick={() => onCopySequence(sequence)}
              className="text-[11px] font-mono text-[#0284C7] hover:text-sky-600 flex items-center gap-1 transition-colors cursor-pointer px-2 py-0.5 rounded hover:bg-sky-50"
              title="Copy sequence to clipboard"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Real-time FASTA Format Validator Expandable Panel */}
        {showValidator && (
          <div className="animate-fadeIn">
            <RealtimeFastaValidator
              sequence={sequence}
              sequenceType={(sequenceType as any) || 'PROTEIN'}
              onSanitizeSequence={onSanitizeSequence}
            />
          </div>
        )}

        {/* Full-Width Scrollable Sequence Box (Light Theme) */}
        <div className="w-full bg-[#F8FAFC] text-[#0F172A] font-mono text-xs rounded-xl p-3 sm:p-4 border border-[#CBD5E1] shadow-inner max-h-64 overflow-y-auto overflow-x-auto custom-scrollbar select-text leading-relaxed tracking-wider">
          {formattedSequenceDisplay}
        </div>
      </div>

      {/* SECTION 3 — ACTION BAR (4 HORIZONTALLY BALANCED ACTIONS) */}
      <div className="pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
          {/* 1. Edit Sequence */}
          <button
            type="button"
            onClick={onOpenEditor}
            className="px-4 py-3 rounded-xl bg-white hover:bg-sky-50 border border-[#CBD5E1] hover:border-sky-300 text-[#0F172A] hover:text-[#0284C7] text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98] group"
          >
            <Edit3 className="w-4 h-4 text-[#0284C7] group-hover:scale-110 transition-transform" />
            <span>✎ Edit Sequence</span>
          </button>

          {/* 2. What-If */}
          <button
            type="button"
            onClick={onOpenWhatIf}
            className="px-4 py-3 rounded-xl bg-white hover:bg-purple-50 border border-[#CBD5E1] hover:border-purple-300 text-[#0F172A] hover:text-purple-700 text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98] group"
          >
            <Sparkles className="w-4 h-4 text-purple-600 group-hover:scale-110 transition-transform" />
            <span>✨ What-If</span>
          </button>

          {/* 3. Ask BioAI */}
          <button
            type="button"
            onClick={onTriggerBioAI}
            className="px-4 py-3 rounded-xl bg-white hover:bg-pink-50 border border-[#CBD5E1] hover:border-pink-300 text-[#0F172A] hover:text-[#DB2777] text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98] group"
          >
            <Sparkles className="w-4 h-4 text-[#DB2777] group-hover:scale-110 transition-transform" />
            <span>✦ Ask BioAI</span>
          </button>

          {/* 4. Run Analysis */}
          <button
            type="button"
            onClick={onRunAnalysis}
            disabled={running}
            className={`px-4 py-3 rounded-xl text-white text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98] disabled:opacity-60 ${
              hasRunAnalysis ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#0284C7] hover:bg-sky-600'
            }`}
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analyzing...</span>
              </>
            ) : hasRunAnalysis ? (
              <>
                <RotateCcw className="w-4 h-4" />
                <span>Re-Run Analysis</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Run Analysis</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
