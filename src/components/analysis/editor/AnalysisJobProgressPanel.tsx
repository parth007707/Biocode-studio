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
    <div className="bg-[#161B22] border border-slate-700/80 rounded-2xl p-6 md:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 flex-wrap gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Modified Sequence Analysis</span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-[11px] font-bold">
              Version {versionNumber}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono">
            {sequenceType} ({formatNumber(sequenceSnapshot?.length)} {unit}) • Snapshot ID: <span className="text-slate-300">{job.id.slice(0, 8)}</span>
          </p>
        </div>

        {/* State Badge */}
        <div>
          {isRunning && (
            <span className="px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-semibold flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              <span>{status}</span>
            </span>
          )}
          {isCompleted && (
            <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>COMPLETED</span>
            </span>
          )}
          {isFailed && (
            <span className="px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-mono font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              <span>FAILED</span>
            </span>
          )}
          {isCancelled && (
            <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-mono font-semibold flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-slate-500" />
              <span>CANCELLED</span>
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar & Stage Description */}
      {isRunning && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              {currentStageMessage}
            </span>
            <span className="text-cyan-400 font-bold">{progress}%</span>
          </div>

          {/* Graphical Progress Bar */}
          <div className="w-full bg-[#0B0F17] rounded-full h-2.5 overflow-hidden border border-slate-800 p-0.5">
            <div
              className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-full rounded-full transition-all duration-300 shadow-sm shadow-cyan-500/30"
              style={{ width: `${Math.max(5, progress)}%` }}
            />
          </div>

          {/* Sequential Stage Markers */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-2 text-[11px] font-mono">
            <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
              progress >= 10 ? 'bg-slate-900/80 border-slate-800 text-slate-300' : 'bg-slate-950/40 border-slate-900 text-slate-600'
            }`}>
              {getStageIcon('VALIDATING', 10)}
              <span className="truncate">1. Validating</span>
            </div>

            <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
              progress >= 25 ? 'bg-slate-900/80 border-slate-800 text-slate-300' : 'bg-slate-950/40 border-slate-900 text-slate-600'
            }`}>
              {getStageIcon('QUEUED', 25)}
              <span className="truncate">2. Comparing</span>
            </div>

            <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
              progress >= 45 ? 'bg-slate-900/80 border-slate-800 text-slate-300' : 'bg-slate-950/40 border-slate-900 text-slate-600'
            }`}>
              {getStageIcon('ANALYZING', 45)}
              <span className="truncate">3. Biological Engine</span>
            </div>

            <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
              progress >= 70 ? 'bg-slate-900/80 border-slate-800 text-slate-300' : 'bg-slate-950/40 border-slate-900 text-slate-600'
            }`}>
              {getStageIcon('ANALYZING', 70)}
              <span className="truncate">4. Metrics Calculation</span>
            </div>

            <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
              progress >= 85 ? 'bg-slate-900/80 border-slate-800 text-slate-300' : 'bg-slate-950/40 border-slate-900 text-slate-600'
            }`}>
              {getStageIcon('BUILDING_VISUALIZATION', 85)}
              <span className="truncate">5. Structural Model</span>
            </div>

            <div className={`p-2 rounded-lg border flex items-center gap-1.5 ${
              progress >= 95 ? 'bg-slate-900/80 border-slate-800 text-slate-300' : 'bg-slate-950/40 border-slate-900 text-slate-600'
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
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-sm text-emerald-200 block">
                ✓ Analysis Completed Successfully
              </span>
              <p className="text-emerald-300/90 text-xs leading-relaxed">
                Version {versionNumber} was analyzed with 100% biological coverage. All {mutationSummary.totalChanges} mutations were processed and biophysical metrics have been generated.
              </p>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
            <div className="bg-[#0B0F17] p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Sequence Version</span>
              <span className="text-emerald-400 font-bold text-sm">V{versionNumber}</span>
            </div>
            <div className="bg-[#0B0F17] p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Modified Length</span>
              <span className="text-white font-bold text-sm">{sequenceSnapshot.length} {unit}</span>
            </div>
            <div className="bg-[#0B0F17] p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Recorded Mutations</span>
              <span className="text-cyan-400 font-bold text-sm">{mutationSummary.totalChanges} changes</span>
            </div>
            <div className="bg-[#0B0F17] p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Analysis Pipeline</span>
              <span className="text-purple-300 font-bold truncate block">{job.pipeline}</span>
            </div>
          </div>
        </div>
      )}

      {/* FAILED STATE */}
      {isFailed && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-red-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>Analysis could not be completed</span>
            </div>
            <p className="text-red-200/90 leading-relaxed font-mono text-[11px]">
              {error || 'An unexpected pipeline error occurred during execution.'}
            </p>
            <p className="text-slate-400 text-[11px]">
              Your editor modifications and mutation history have been preserved. You can retry the analysis or return to the editor.
            </p>
          </div>
        </div>
      )}

      {/* CANCELLED STATE */}
      {isCancelled && (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1">
          <div className="flex items-center gap-2 font-semibold text-slate-300">
            <XCircle className="w-4 h-4 text-slate-400" />
            <span>Analysis Cancelled</span>
          </div>
          <p className="text-slate-400 text-[11px]">
            The modified sequence analysis job was safely cancelled. Your working sequence and mutation records remain intact.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-4 flex-wrap gap-3">
        {/* Left Side: Return / Context action */}
        <button
          type="button"
          onClick={onReturnToEditor}
          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Sequence Editor</span>
        </button>

        {/* Right Side: Primary dynamic actions */}
        <div className="flex items-center gap-3">
          {isRunning && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-mono font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel Analysis</span>
            </button>
          )}

          {isFailed && (
            <button
              type="button"
              onClick={onRetry}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Analysis</span>
            </button>
          )}

          {isCancelled && (
            <button
              type="button"
              onClick={onRetry}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-2 cursor-pointer"
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
                className="px-4 py-2.5 rounded-xl bg-[#0B0F17] hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <GitCompare className="w-4 h-4 text-cyan-400" />
                <span>Compare with Original</span>
              </button>

              <button
                type="button"
                onClick={onViewResults}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-2 cursor-pointer"
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
