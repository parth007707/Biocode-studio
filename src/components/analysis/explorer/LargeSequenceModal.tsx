import React, { useState, useEffect, useRef } from 'react';
import {
  Sliders,
  Layers,
  Dna,
  Database,
  ArrowRight,
  Loader2,
  X,
  Sparkles,
  Info,
  CheckCircle2,
  FileCode2,
  Maximize2,
  Scissors
} from 'lucide-react';
import { ncbiAdapter } from '../../../services/adapters/ncbiAdapter';
import { SequenceSourceMetadata } from '../../../services/adapters/types';

interface LargeSequenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: {
    uid?: string;
    accession: string;
    version?: string;
    title: string;
    definition?: string;
    organism?: string;
    sequenceType?: string;
    moleculeType?: string;
    strand?: string;
    topology?: string;
    feature_annotations?: Array<{ type: string; location: string; description?: string }>;
    totalLength?: number;
    sourceDb?: string;
    category?: string;
  };
  onSelectRangeAndLoad: (sequence: string, meta: SequenceSourceMetadata) => void;
}

const MAX_WINDOW_SIZE = 250000; // Expanded safe region size

export const LargeSequenceModal: React.FC<LargeSequenceModalProps> = ({
  isOpen,
  onClose,
  record,
  onSelectRangeAndLoad
}) => {
  const totalLength = record.totalLength || 1000000;
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(Math.min(10000, totalLength));
  const [fetching, setFetching] = useState<boolean>(false);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [preview, setPreview] = useState<{ first200: string; last200: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize range when modal opens
  useEffect(() => {
    if (isOpen) {
      const defaultEnd = Math.min(10000, totalLength);
      setRangeStart(1);
      setRangeEnd(defaultEnd);
      setErrorMsg(null);
      loadPreview();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isOpen, record.accession, totalLength]);

  const loadPreview = async () => {
    setPreviewLoading(true);
    try {
      const db = record.sourceDb || 'nucleotide';
      const prev = await ncbiAdapter.fetchPreview(db, record.accession, totalLength);
      setPreview({
        first200: prev.first200,
        last200: prev.last200
      });
    } catch {
      // preview error handled silently with fallback
    } finally {
      setPreviewLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentSpan = Math.max(0, rangeEnd - rangeStart + 1);
  const coveragePercent = totalLength > 0 ? Number(((currentSpan / totalLength) * 100).toFixed(2)) : 0;
  const isSpanValid = currentSpan > 0 && currentSpan <= MAX_WINDOW_SIZE && rangeStart >= 1 && rangeEnd <= totalLength;

  const formatNumber = (num: number) => num.toLocaleString();
  const formatLength = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)} Mb (${formatNumber(num)} bp)`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)} kb (${formatNumber(num)} bp)`;
    return `${formatNumber(num)} bp`;
  };

  const handleApplyPreset = (start: number, end: number) => {
    const safeEnd = Math.min(end, totalLength);
    setRangeStart(start);
    setRangeEnd(safeEnd);
    setErrorMsg(null);
  };

  const handleExecuteRangeFetch = async (customStart?: number, customEnd?: number) => {
    const start = customStart ?? rangeStart;
    const end = customEnd ?? rangeEnd;
    const span = end - start + 1;

    if (start < 1) {
      setErrorMsg('Start position must be at least 1.');
      return;
    }
    if (end > totalLength) {
      setErrorMsg(`End position cannot exceed total sequence length (${formatNumber(totalLength)}).`);
      return;
    }
    if (start > end) {
      setErrorMsg('Start position cannot be greater than End position.');
      return;
    }
    if (span > MAX_WINDOW_SIZE) {
      setErrorMsg(`Selected range (${formatNumber(span)} bp) exceeds maximum recommended region size (${formatNumber(MAX_WINDOW_SIZE)} bp).`);
      return;
    }

    setFetching(true);
    setErrorMsg(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const db = record.sourceDb || 'nucleotide';
      const rawFasta = await ncbiAdapter.fetchRangeFasta(
        db,
        record.accession,
        start,
        end,
        controller.signal
      );

      const metadata: SequenceSourceMetadata = {
        source: record.category || 'NCBI',
        database: db,
        accession: record.accession,
        version: record.version,
        title: record.title,
        definition: record.definition || record.title,
        organism: record.organism,
        molecule_type: record.moleculeType,
        sequence_type: record.sequenceType || 'Genomic DNA',
        strand: record.strand,
        topology: record.topology,
        feature_annotations: record.feature_annotations,
        totalLength,
        rangeStart: start,
        rangeEnd: end,
        subLength: span,
        isPartialRange: true,
        analysisScope: 'Selected Region',
        basesAnalyzed: span,
        coveragePercentage: totalLength > 0 ? Number(((span / totalLength) * 100).toFixed(2)) : 100
      };

      onSelectRangeAndLoad(rawFasta, metadata);
      onClose();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMsg(err.message || 'Failed to fetch sequence region from repository.');
      }
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#121722] border border-slate-700/90 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-teal-400">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight">
                  Select Region for Targeted Analysis
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  Total: {formatLength(totalLength)}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Scope analysis to specific loci, gene exons, promoters, or chromosomal coordinate windows.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={fetching}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Metadata Card */}
          <div className="bg-[#0A0E17] border border-slate-800/90 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-500 block">Accession ID</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">{record.accession}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-500 block">Organism</span>
                <span className="text-slate-200 font-medium">{record.organism || 'Homo sapiens'}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-500 block">Sequence Type</span>
                <span className="text-slate-200 font-medium">{record.sequenceType || 'Genomic DNA'}</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase text-slate-500 block">Record Title</span>
              <span className="text-slate-300 line-clamp-2 leading-relaxed">{record.title}</span>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-slate-500" />
                Source: <span className="text-slate-200">{record.category || 'NCBI'} {record.sourceDb ? `(${record.sourceDb})` : ''}</span>
              </span>
              <span className="text-teal-400 flex items-center gap-1.5 font-bold">
                <Info className="w-3.5 h-3.5" />
                Total Record Length: {formatNumber(totalLength)} bp
              </span>
            </div>
          </div>

          {/* Sequence Preview Box (First 200 ... Last 200) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 uppercase font-mono tracking-wider flex items-center gap-1.5">
                <FileCode2 className="w-3.5 h-3.5 text-teal-400" />
                <span>Boundary Preview (Head &amp; Tail Inspection)</span>
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {previewLoading ? 'Fetching preview snippet...' : '5\' and 3\' Flank Reference'}
              </span>
            </div>

            <div className="bg-[#0A0E17] border border-slate-800 rounded-xl p-3.5 font-mono text-[11px] space-y-2 text-slate-300">
              {previewLoading ? (
                <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                  <span>Loading boundary residues from repository...</span>
                </div>
              ) : preview ? (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide block">
                      5&apos; Flank (Positions 1 .. 200):
                    </span>
                    <div className="p-2 rounded bg-slate-900/90 text-emerald-400 break-all leading-relaxed border border-slate-800/60 select-all">
                      {preview.first200}
                    </div>
                  </div>

                  <div className="py-1 text-center text-slate-500 text-[10px] italic border-y border-slate-800/60">
                    &bull; &bull; &bull;{' '}
                    <span className="text-slate-400 font-semibold">
                      {formatNumber(Math.max(0, totalLength - 400))} base pairs intermediate
                    </span>{' '}
                    &bull; &bull; &bull;
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide block">
                      3&apos; Flank (Positions {formatNumber(Math.max(1, totalLength - 199))} .. {formatNumber(totalLength)}):
                    </span>
                    <div className="p-2 rounded bg-slate-900/90 text-cyan-400 break-all leading-relaxed border border-slate-800/60 select-all">
                      {preview.last200}
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-4 text-center text-slate-500">Preview not available</div>
              )}
            </div>
          </div>

          {/* Range Selection Controls */}
          <div className="bg-[#0A0E17] border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 flex items-center gap-1.5 uppercase font-mono tracking-wider text-xs">
                <Sliders className="w-3.5 h-3.5 text-teal-400" />
                <span>Coordinate Range Settings</span>
              </span>
              <span
                className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full ${
                  isSpanValid
                    ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                    : 'bg-red-500/15 text-red-400 border border-red-500/30'
                }`}
              >
                Region Span: {formatNumber(currentSpan)} bp ({coveragePercent}% of record)
              </span>
            </div>

            {/* Range Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-mono text-slate-400">
                  Start Position (1-based coordinate)
                </label>
                <input
                  type="number"
                  min={1}
                  max={totalLength}
                  value={rangeStart}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 1;
                    setRangeStart(val);
                    setErrorMsg(null);
                  }}
                  className="w-full bg-[#161B22] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-mono text-slate-400">
                  End Position (Max: {formatNumber(totalLength)})
                </label>
                <input
                  type="number"
                  min={rangeStart}
                  max={totalLength}
                  value={rangeEnd}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || rangeStart;
                    setRangeEnd(val);
                    setErrorMsg(null);
                  }}
                  className="w-full bg-[#161B22] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-mono uppercase text-slate-500 block">Quick Coordinate Presets:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyPreset(1, Math.min(10000, totalLength))}
                  className="px-2.5 py-1 rounded-lg bg-[#161B22] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[11px] font-mono transition-colors cursor-pointer"
                >
                  First 10,000 bp (1 .. {formatNumber(Math.min(10000, totalLength))})
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset(1, Math.min(50000, totalLength))}
                  className="px-2.5 py-1 rounded-lg bg-[#161B22] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[11px] font-mono transition-colors cursor-pointer"
                >
                  First 50,000 bp (1 .. {formatNumber(Math.min(50000, totalLength))})
                </button>
                {totalLength >= 110000 && (
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(100000, Math.min(150000, totalLength))}
                    className="px-2.5 py-1 rounded-lg bg-[#161B22] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[11px] font-mono transition-colors cursor-pointer"
                  >
                    Locus Window (100k .. {formatNumber(Math.min(150000, totalLength))})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-[#0A0E17] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={fetching}
            className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-mono transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => handleExecuteRangeFetch()}
            disabled={fetching || !isSpanValid}
            className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs font-mono transition-all shadow-lg shadow-teal-900/30 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {fetching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Fetching Region {rangeStart}..{rangeEnd}...</span>
              </>
            ) : (
              <>
                <span>Analyze Selected Region ({formatNumber(currentSpan)} bp)</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
