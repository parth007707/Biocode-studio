import React from 'react';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  X, 
  Database, 
  Dna, 
  CloudDownload, 
  Cpu, 
  HardDrive 
} from 'lucide-react';

export type JobPhase = 
  | 'preparing'
  | 'downloading_metadata'
  | 'downloading_chunks'
  | 'processing_chunks'
  | 'analyzing'
  | 'saving_results'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface JobProgressProps {
  phase: JobPhase | string;
  percent: number;
  message?: string;
  currentChunk?: number;
  totalChunks?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  etaSeconds?: number;
  onCancel?: () => void;
  title?: string;
  isCompact?: boolean;
}

export const JobProgress: React.FC<JobProgressProps> = ({
  phase,
  percent,
  message,
  currentChunk,
  totalChunks,
  downloadedBytes,
  totalBytes,
  etaSeconds,
  onCancel,
  title = 'Biological Analysis Pipeline',
  isCompact = false
}) => {
  const safePercent = Math.min(100, Math.max(0, Math.round(percent)));

  const getPhaseIcon = () => {
    switch (phase) {
      case 'downloading_metadata':
        return <Database className="w-4 h-4 text-[#0284C7] animate-pulse" />;
      case 'downloading_chunks':
        return <CloudDownload className="w-4 h-4 text-[#0284C7] animate-bounce" />;
      case 'processing_chunks':
      case 'analyzing':
        return <Cpu className="w-4 h-4 text-[#EA580C] animate-spin" />;
      case 'saving_results':
        return <HardDrive className="w-4 h-4 text-[#15803D] animate-pulse" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-[#DC2626]" />;
      default:
        return <Dna className="w-4 h-4 text-[#0284C7] animate-spin" />;
    }
  };

  const getPhaseLabel = () => {
    switch (phase) {
      case 'preparing':
        return 'Preparing data buffer...';
      case 'downloading_metadata':
        return 'Downloading record metadata...';
      case 'downloading_chunks':
        return totalChunks && currentChunk
          ? `Downloading sequence chunk ${currentChunk} of ${totalChunks}...`
          : 'Downloading sequence stream...';
      case 'processing_chunks':
        return totalChunks && currentChunk
          ? `Processing chunk ${currentChunk} of ${totalChunks}...`
          : 'Processing sequence chunks in worker...';
      case 'analyzing':
        return 'Computing biological algorithms & reading frames...';
      case 'saving_results':
        return 'Persisting audit logs to database...';
      case 'completed':
        return 'Analysis execution completed';
      case 'failed':
        return 'Pipeline execution encountered an error';
      case 'cancelled':
        return 'Pipeline cancelled by user';
      default:
        return message || 'Executing biological workflow...';
    }
  };

  const formatBytes = (bytes?: number): string => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (isCompact) {
    return (
      <div className="p-3 bg-white/95 border border-[#FED7AA] rounded-xl space-y-2 shadow-2xs">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-[#334155] truncate">
            {getPhaseIcon()}
            <span className="truncate font-semibold">{getPhaseLabel()}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-bold text-[#EA580C]">{safePercent}%</span>
            {onCancel && phase !== 'completed' && phase !== 'failed' && (
              <button
                type="button"
                onClick={onCancel}
                className="text-[#94A3B8] hover:text-[#DC2626] p-0.5 rounded transition-colors cursor-pointer"
                title="Cancel job"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="w-full bg-[#F1F5F9] rounded-full h-1.5 overflow-hidden border border-[#E2E8F0]">
          <div
            className="h-full bg-linear-to-r from-[#F97316] via-[#0284C7] to-[#16A34A] transition-all duration-200"
            style={{ width: `${safePercent}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 bg-white/95 border border-[#FED7AA] rounded-2xl shadow-[0_4px_20px_rgba(249,115,22,0.06)] space-y-4 font-mono text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-[#FFF7ED] border border-[#FED7AA] text-[#EA580C] shadow-2xs">
            {getPhaseIcon()}
          </div>
          <div>
            <h4 className="font-bold text-[#0F172A] text-sm">{title}</h4>
            <p className="text-[#64748B] text-[11px] mt-0.5">{getPhaseLabel()}</p>
          </div>
        </div>

        {onCancel && phase !== 'completed' && phase !== 'failed' && phase !== 'cancelled' && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-[#FFF1F2] text-[#64748B] hover:text-[#DC2626] border border-[#E2E8F0] hover:border-[#FECDD3] transition-all cursor-pointer shadow-2xs font-semibold"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
        )}
      </div>

      {/* Progress Track */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] text-[#64748B]">
          <span className="font-medium">{message || getPhaseLabel()}</span>
          <span className="font-bold text-[#EA580C]">{safePercent}%</span>
        </div>
        <div className="w-full bg-[#F1F5F9] rounded-full h-2 overflow-hidden border border-[#E2E8F0]">
          <div
            className="h-full bg-linear-to-r from-[#F97316] via-[#0284C7] to-[#16A34A] transition-all duration-150 ease-out"
            style={{ width: `${safePercent}%` }}
          />
        </div>
      </div>

      {/* Metrics Footer */}
      {(totalChunks || totalBytes || etaSeconds) && (
        <div className="pt-2 border-t border-[#FED7AA]/60 flex flex-wrap items-center justify-between text-[11px] text-[#64748B] gap-2">
          {totalChunks && (
            <span>
              Chunk: <strong className="text-[#0F172A]">{currentChunk || 1}</strong> / {totalChunks}
            </span>
          )}
          {totalBytes && (
            <span>
              Data: <strong className="text-[#0F172A]">{formatBytes(downloadedBytes)}</strong> / {formatBytes(totalBytes)}
            </span>
          )}
          {etaSeconds !== undefined && etaSeconds > 0 && (
            <span>
              ETA: <strong className="text-[#0F172A]">{etaSeconds}s</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
