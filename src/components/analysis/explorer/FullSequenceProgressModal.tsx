import React from 'react';
import { formatOrganism } from '../../../types';
import { 
  Loader2, 
  Dna, 
  Database, 
  X, 
  Activity, 
  CheckCircle2, 
  Layers, 
  ShieldCheck 
} from 'lucide-react';
import { ChunkedProgressReport } from '../../../lib/bio/chunkedSequenceProcessor';

interface FullSequenceProgressModalProps {
  isOpen: boolean;
  onCancel: () => void;
  record: {
    accession: string;
    title: string;
    organism?: string;
    sourceDb?: string;
    category?: string;
    totalLength?: number;
  };
  progress: ChunkedProgressReport | null;
}

export const FullSequenceProgressModal: React.FC<FullSequenceProgressModalProps> = ({
  isOpen,
  onCancel,
  record,
  progress
}) => {
  if (!isOpen) return null;

  const percentage = progress?.percentage || 0;
  const currentChunk = progress?.currentChunk || 1;
  const totalChunks = progress?.totalChunks || 1;
  const basesProcessed = progress?.basesProcessed || 0;
  const totalBases = progress?.totalBases || record.totalLength || 0;

  const formatNumber = (n: number) => n.toLocaleString();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#121722] border border-emerald-500/40 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 flex items-start sm:items-center justify-between gap-2 bg-emerald-950/20">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
              <Dna className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight">
                  Processing Complete Biological Record
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  100% Target
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Full sequence ingestion &amp; stream-based biological analytics
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer shrink-0"
            title="Cancel Processing"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 overflow-y-auto flex-1">
          {/* Metadata Card */}
          <div className="bg-[#0A0E17] border border-slate-800/90 rounded-xl p-4 space-y-2.5 text-xs font-mono">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-emerald-400 text-sm">{record.accession}</span>
                <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                  {record.category || 'NCBI'} {record.sourceDb ? `(${record.sourceDb})` : ''}
                </span>
              </div>
              {totalBases > 0 && (
                <span className="text-slate-300 text-[11px] bg-slate-800/80 px-2 py-0.5 rounded">
                  Record Length: <strong className="text-emerald-400">{formatNumber(totalBases)} bp</strong>
                </span>
              )}
            </div>

            <p className="text-slate-300 text-xs font-sans line-clamp-2 leading-relaxed">
              {record.title}
            </p>

            {record.organism && (
              <p className="text-slate-400 text-[11px] italic font-sans">
                Organism: <span className="text-slate-200">{formatOrganism(record.organism)}</span>
              </p>
            )}
          </div>

          {/* Real-time Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 flex items-center gap-1.5 font-semibold">
                <Activity className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                <span>{progress?.message || 'Downloading complete sequence...'}</span>
              </span>
              <span className="text-emerald-400 font-bold text-sm">
                {percentage}%
              </span>
            </div>

            {/* Glowing Progress Track */}
            <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-0.5">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                style={{ width: `${Math.max(4, percentage)}%` }}
              />
            </div>
          </div>

          {/* Metric Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center font-mono">
            <div className="p-2.5 rounded-xl bg-[#0A0E17] border border-slate-800/80">
              <span className="text-[10px] uppercase text-slate-500 block">Current Stage</span>
              <span className="text-xs font-bold text-slate-200 capitalize">
                {progress?.stage || 'Downloading'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#0A0E17] border border-slate-800/80">
              <span className="text-[10px] uppercase text-slate-500 block">Chunk</span>
              <span className="text-xs font-bold text-emerald-400">
                {currentChunk} / {totalChunks}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#0A0E17] border border-slate-800/80">
              <span className="text-[10px] uppercase text-slate-500 block">Bases Processed</span>
              <span className="text-xs font-bold text-slate-200">
                {formatNumber(basesProcessed)}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#0A0E17] border border-slate-800/80">
              <span className="text-[10px] uppercase text-slate-500 block">Total Record</span>
              <span className="text-xs font-bold text-emerald-300">
                {formatNumber(totalBases)} bp
              </span>
            </div>
          </div>

          {/* Transparency & Safety Guarantee */}
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Real biological data is fetched directly from scientific repositories. 100% of sequence bases are calculated.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-800 bg-[#0A0E17] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs font-mono">
          <span className="text-slate-400 text-[11px] flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 shrink-0" />
            Analyzing biological sequence stream...
          </span>

          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer text-center"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
