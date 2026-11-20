import React from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RotateCcw,
  Eye,
  GitCompare,
  ArrowLeft,
  Sparkles,
  Layers,
  Activity,
  FileText,
  Clock
} from 'lucide-react';
import { AnalysisJob, AnalysisJobState } from '../../../lib/bio/editor/types';
import { formatNumber } from '../../../lib/utils/formatters';

interface AnalysisJobProgressPanelProps {
  job: AnalysisJob;
  onCancel: () => void;
  onRetry: () => void;
  onViewResults: () => void;
  onCompareWithOriginal: () => void;
  onReturnToEditor: () => void;
}

export const AnalysisJobProgressPanel: React.FC<AnalysisJobProgressPanelProps> = ({
  job,
  onCancel,
  onRetry,
  onViewResults,
  onCompareWithOriginal,
  onReturnToEditor
}) => {
  const { status, progress, currentStageMessage, versionNumber, sequenceSnapshot, sequenceType, mutationSummary, error } = job;

  const isRunning = status === 'QUEUED' || status === 'VALIDATING' || status === 'ANALYZING' || status === 'GENERATING_RESULTS' || status === 'SAVING';
  const isCompleted = status === 'COMPLETED';
  const isFailed = status === 'FAILED';
  const isCancelled = status === 'CANCELLED';

  const unit = sequenceType === 'PROTEIN' ? 'aa' : sequenceType === 'RNA' ? 'nt' : 'bp';

  const getStageIcon = (targetStage: AnalysisJobState, minProgress: number) => {
    if (isFailed) {
      return <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />;
    }
    if (isCancelled) {
      return <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />;
    }
    if (progress >= minProgress + 15 || isCompleted) {
      return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
    }
    if (status === targetStage || (progress >= minProgress && progress < minProgress + 20)) {
      return <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />;
    }
    return <div className="w-3.5 h-3.5 rounded-full border border-slate-700 bg-slate-900 shrink-0" />;
  };

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6 shadow-md animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4 flex-wrap gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0284C7]" />
              <span>Modified Sequence Analysis</span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[11px] font-bold">
              Version {versionNumber}
            </span>
          </div>
          <p className="text-xs text-[#64748B] font-mono">
            {sequenceType} ({formatNumber(sequenceSnapshot?.length)} {unit}) • Snapshot ID: <span className="text-[#0F172A]">{job.id.slice(0, 8)}</span>
          </p>
        </div>

        {/* State Badge */}
        <div>
          {isRunning && (
            <span className="px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-800 text-xs font-mono font-semibold flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0284C7]" />
              <span>{status}</span>
            </span>
          )}
          {isCompleted && (
            <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>COMPLETED</span>
            </span>
          )}
          {isFailed && (
            <span className="px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>FAILED</span>
            </span>
          )}
          {isCancelled && (
            <span className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-[#64748B] text-xs font-mono font-semibold flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-slate-400" />
              <span>CANCELLED</span>
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar & Stage Description */}
      {isRunning && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#334155] flex items-center gap-2 font-medium">
              <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
              {currentStageMessage}
            </span>
            <span className="text-[#0284C7] font-bold">{progress}%</span>
          </div>

          {/* Graphical Progress Bar */}
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-[#E2E8F0] p-0.5">
            <div
              className="bg-gradient-to-r from-emerald-500 to-[#0284C7] h-full rounded-full transition-all duration-300 shadow-xs"
              style={{ width: `${Math.max(5, progress)}%` }}
            />
          </div>

          {/* Sequential Stage Markers */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-2 text-[11px] font-mono">
            <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
              progress >= 10 ? 'bg-slate-50 border-[#CBD5E1] text-[#0F172A]' : 'bg-slate-50/50 border-[#E2E8F0] text-[#94A3B8]'
            }`}>
              {getStageIcon('VALIDATING', 10)}
              <span className="truncate">1. Validating</span>
            </div>

            <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
              progress >= 25 ? 'bg-slate-50 border-[#CBD5E1] text-[#0F172A]' : 'bg-slate-50/50 border-[#E2E8F0] text-[#94A3B8]'
            }`}>
              {getStageIcon('QUEUED', 25)}
              <span className="truncate">2. Comparing</span>
            </div>

            <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
              progress >= 45 ? 'bg-slate-50 border-[#CBD5E1] text-[#0F172A]' : 'bg-slate-50/50 border-[#E2E8F0] text-[#94A3B8]'
            }`}>
              {getStageIcon('ANALYZING', 45)}
              <span className="truncate">3. Biological Engine</span>
            </div>

            <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
              progress >= 70 ? 'bg-slate-50 border-[#CBD5E1] text-[#0F172A]' : 'bg-slate-50/50 border-[#E2E8F0] text-[#94A3B8]'
            }`}>
              {getStageIcon('ANALYZING', 70)}
              <span className="truncate">4. Metrics Calculation</span>
            </div>

            <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
              progress >= 85 ? 'bg-slate-50 border-[#CBD5E1] text-[#0F172A]' : 'bg-slate-50/50 border-[#E2E8F0] text-[#94A3B8]'
            }`}>
              {getStageIcon('BUILDING_VISUALIZATION', 85)}
              <span className="truncate">5. Structural Model</span>
            </div>

            <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
              progress >= 95 ? 'bg-slate-50 border-[#CBD5E1] text-[#0F172A]' : 'bg-slate-50/50 border-[#E2E8F0] text-[#94A3B8]'
            }`}>
              {getStageIcon('SAVING', 95)}
              <span className="truncate">6. Version Record</span>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETED SUMMARY STATE */}
      {isCompleted && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-sm text-emerald-950 block">
                ✓ Analysis Completed Successfully
              </span>
              <p className="text-emerald-800 text-xs leading-relaxed">
                Version {versionNumber} was analyzed with 100% biological coverage. All {mutationSummary.totalChanges} mutations were processed and biophysical metrics have been generated.
              </p>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
            <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
              <span className="text-[#64748B] block text-[10px] uppercase">Sequence Version</span>
              <span className="text-emerald-700 font-bold text-sm">V{versionNumber}</span>
            </div>
            <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
              <span className="text-[#64748B] block text-[10px] uppercase">Modified Length</span>
              <span className="text-[#0F172A] font-bold text-sm">{sequenceSnapshot.length} {unit}</span>
            </div>
            <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
              <span className="text-[#64748B] block text-[10px] uppercase">Recorded Mutations</span>
              <span className="text-[#0284C7] font-bold text-sm">{mutationSummary.totalChanges} changes</span>
            </div>
            <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
              <span className="text-[#64748B] block text-[10px] uppercase">Analysis Pipeline</span>
              <span className="text-purple-700 font-bold truncate block">{job.pipeline}</span>
            </div>
          </div>
        </div>
      )}

      {/* FAILED STATE */}
      {isFailed && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>Analysis could not be completed</span>
            </div>
            <p className="text-rose-800 leading-relaxed font-mono text-[11px]">
              {error || 'An unexpected pipeline error occurred during execution.'}
            </p>
            <p className="text-[#64748B] text-[11px]">
              Your editor modifications and mutation history have been preserved. You can retry the analysis or return to the editor.
            </p>
          </div>
        </div>
      )}

      {/* CANCELLED STATE */}
      {isCancelled && (
        <div className="p-4 rounded-xl bg-slate-50 border border-[#E2E8F0] text-xs text-[#334155] space-y-1">
          <div className="flex items-center gap-2 font-semibold text-[#0F172A]">
            <XCircle className="w-4 h-4 text-[#64748B]" />
            <span>Analysis Cancelled</span>
          </div>
          <p className="text-[#64748B] text-[11px]">
            The modified sequence analysis job was safely cancelled. Your working sequence and mutation records remain intact.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-4 flex-wrap gap-3">
        {/* Left Side: Return / Context action */}
        <button
          type="button"
          onClick={onReturnToEditor}
          className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-[#0F172A] border border-[#CBD5E1] text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Sequence Editor</span>
        </button>

        {/* Right Side: Primary dynamic actions */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {isRunning && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-mono font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel Analysis</span>
            </button>
          )}

          {isFailed && (
            <button
              type="button"
              onClick={onRetry}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold transition-all shadow-md shadow-emerald-900/10 flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Analysis</span>
            </button>
          )}

          {isCancelled && (
            <button
              type="button"
              onClick={onRetry}
              className="px-5 py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-mono font-bold transition-all shadow-md shadow-sky-600/20 flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restart Analysis</span>
            </button>
          )}

          {isCompleted && (
            <>
              <button
                type="button"
                onClick={onCompareWithOriginal}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-[#0284C7] border border-[#CBD5E1] text-xs font-mono font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-2xs"
              >
                <GitCompare className="w-4 h-4 text-[#0284C7]" />
                <span>Compare with Original</span>
              </button>

              <button
                type="button"
                onClick={onViewResults}
                className="px-5 py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-mono font-bold transition-all shadow-md shadow-sky-600/20 flex items-center gap-2 cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>View Modified Results</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
