import React, { useState, useEffect } from 'react';
import { 
  Terminal, 
  X, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Cloud, 
  HardDrive, 
  Activity, 
  Database,
  ArrowRight,
  ShieldCheck,
  Clock
} from 'lucide-react';
import { dbLogger, DBLogEntry } from '../../services/dbLogger';
import { bioService } from '../../services/bioService';
import { SchemaHealthStatus } from '../../types';

interface DatabaseDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DatabaseDebugModal: React.FC<DatabaseDebugModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<DBLogEntry[]>([]);
  const [health, setHealth] = useState<SchemaHealthStatus | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [pendingQueueCount, setPendingQueueCount] = useState<number>(0);
  const [filter, setFilter] = useState<'ALL' | 'SAVE' | 'HEALTH' | 'SYNC'>('ALL');

  useEffect(() => {
    if (!isOpen) return;

    // Subscribe to real-time logger events
    const unsubscribe = dbLogger.subscribe((newLogs) => {
      setLogs(newLogs);
    });

    loadHealthAndQueue();

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  const loadHealthAndQueue = async () => {
    try {
      const h = await bioService.checkSchemaHealth();
      setHealth(h);

      const count = await bioService.getPendingRecoveryQueueCount();
      setPendingQueueCount(count);
    } catch {}
  };

  const handleTriggerSync = async () => {
    setSyncing(true);
    try {
      await bioService.syncPendingRecoveryQueue();
      await loadHealthAndQueue();
    } catch (err) {
      console.error('Manual sync error:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearLogs = () => {
    dbLogger.clearLogs();
  };

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (filter === 'SAVE') return log.operation === 'SAVE_ANALYSIS' || log.operation === 'SAVE_SEQUENCE';
    if (filter === 'HEALTH') return log.operation === 'HEALTH_CHECK';
    if (filter === 'SYNC') return log.operation === 'SYNC_OFFLINE_QUEUE';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-[#BBF7D0] w-full max-w-4xl max-h-[92dvh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[#334155] font-mono text-xs">
        {/* Header */}
        <div className="p-4 bg-[#F0FDF4] border-b border-[#BBF7D0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-white border border-[#BBF7D0] text-[#15803D] shadow-2xs">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-[#0F172A] text-sm">Database Transaction & Health Diagnostics</h3>
              <p className="text-[11px] text-[#64748B]">Real-time audit logs of persistence operations, Supabase connectivity, and offline recovery queues.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#DCFCE7] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Bar */}
        <div className="p-4 bg-[#F8FAFC] border-b border-[#E2E8F0] grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-white border border-[#E2E8F0] shadow-2xs">
            <div className="text-[#64748B] text-[10px] uppercase font-semibold">Supabase Cloud Reachability</div>
            <div className="flex items-center gap-1.5 mt-1 font-semibold">
              {health?.connected ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />
                  <span className="text-[#15803D]">Connected & Operational</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-[#D97706]" />
                  <span className="text-[#B45309]">Unavailable (Fallback active)</span>
                </>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white border border-[#E2E8F0] shadow-2xs">
            <div className="text-[#64748B] text-[10px] uppercase font-semibold">Pending Recovery Queue</div>
            <div className="flex items-center justify-between mt-1">
              <span className={`font-semibold ${pendingQueueCount > 0 ? 'text-[#D97706]' : 'text-[#334155]'}`}>
                {pendingQueueCount} items pending
              </span>
              {pendingQueueCount > 0 && (
                <button
                  type="button"
                  onClick={handleTriggerSync}
                  disabled={syncing || !health?.connected}
                  className="px-2 py-0.5 rounded bg-[#DCFCE7] hover:bg-[#BBF7D0] text-[#15803D] border border-[#86EFAC] text-[10px] font-bold disabled:opacity-50 cursor-pointer"
                >
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white border border-[#E2E8F0] shadow-2xs">
            <div className="text-[#64748B] text-[10px] uppercase font-semibold">Canonical Schema Tables</div>
            <div className="text-[#334155] font-semibold mt-1 flex items-center gap-1.5 flex-wrap text-[11px]">
              <span className={health?.tables.sequence_records ? 'text-[#15803D]' : 'text-[#DC2626] font-bold'}>seq_records</span>
              <span className="text-[#CBD5E1]">•</span>
              <span className={health?.tables.analyses ? 'text-[#15803D]' : 'text-[#DC2626] font-bold'}>analyses</span>
              <span className="text-[#CBD5E1]">•</span>
              <span className={health?.tables.projects ? 'text-[#15803D]' : 'text-[#DC2626] font-bold'}>projects</span>
              <span className="text-[#CBD5E1]">•</span>
              <span className={health?.tables.project_sequences ? 'text-[#15803D]' : 'text-[#DC2626] font-bold'}>proj_seqs</span>
              <span className="text-[#CBD5E1]">•</span>
              <span className={health?.tables.sequence_versions ? 'text-[#15803D]' : 'text-[#DC2626] font-bold'}>versions</span>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="p-3 bg-white border-b border-[#E2E8F0] flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['ALL', 'SAVE', 'HEALTH', 'SYNC'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilter(mode)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                  filter === mode 
                    ? 'bg-[#15803D] text-white shadow-xs' 
                    : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
                }`}
              >
                {mode === 'ALL' ? 'All Events' : mode === 'SAVE' ? 'Persistence' : mode === 'HEALTH' ? 'Health Checks' : 'Recovery Sync'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadHealthAndQueue}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#334155] text-[11px] font-semibold cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Verify Health</span>
            </button>
            <button
              type="button"
              onClick={handleClearLogs}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-[#FEE2E2] text-[#64748B] hover:text-[#DC2626] text-[11px] font-semibold cursor-pointer transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Logs</span>
            </button>
          </div>
        </div>

        {/* Log Entries View */}
        <div className="flex-1 p-4 overflow-y-auto space-y-2.5 max-h-[480px] bg-[#F8FAFC]">
          {filteredLogs.length === 0 ? (
            <div className="py-16 text-center text-[#94A3B8]">
              <Database className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#15803D]" />
              <p>No database logs recorded in this session yet.</p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isSuccess = log.status === 'SUCCESS' || log.status === 'RECOVERY_SYNCED';
              const isStart = log.status === 'START';
              const isRecovery = log.status === 'RECOVERY_QUEUED';
              const isFailed = log.status === 'FAILED';

              return (
                <div
                  key={log.id}
                  className={`p-3 rounded-xl border transition-all ${
                    isSuccess
                      ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#14532D]'
                      : isStart
                      ? 'bg-[#F0F9FF] border-[#BAE6FD] text-[#0369A1]'
                      : isRecovery
                      ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
                      : 'bg-[#FFF1F2] border-[#FECDD3] text-[#9F1239]'
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 text-[10px]">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                        isSuccess ? 'bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]' :
                        isStart ? 'bg-[#E0F2FE] text-[#0284C7] border border-[#BAE6FD]' :
                        isRecovery ? 'bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]' : 'bg-[#FEE2E2] text-[#DC2626] border border-[#FECDD3]'
                      }`}>
                        {log.operation} • {log.status}
                      </span>

                      {log.storage && (
                        <span className="text-[#64748B] flex items-center gap-1 font-semibold">
                          {log.storage === 'supabase' ? <Cloud className="w-3 h-3 text-[#16A34A]" /> : <HardDrive className="w-3 h-3 text-[#D97706]" />}
                          {log.storage}
                        </span>
                      )}

                      {log.durationMs !== undefined && (
                        <span className="text-[#64748B]">
                          {log.durationMs}ms
                        </span>
                      )}
                    </div>

                    <span className="text-[#64748B] text-[10px] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-[#0F172A] mt-1.5">
                    {log.message}
                  </p>

                  {(log.accession || log.sequenceId || log.analysisId || log.pipeline) && (
                    <div className="mt-2 pt-2 border-t border-[#E2E8F0]/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-[#64748B]">
                      {log.accession && (
                        <div>
                          <span className="text-[#94A3B8] block">Accession:</span>
                          <span className="text-[#0284C7] font-bold">{log.accession}</span>
                        </div>
                      )}
                      {log.pipeline && (
                        <div>
                          <span className="text-[#94A3B8] block">Pipeline:</span>
                          <span className="text-[#0F172A] truncate font-medium">{log.pipeline}</span>
                        </div>
                      )}
                      {log.sequenceId && (
                        <div>
                          <span className="text-[#94A3B8] block">Sequence ID:</span>
                          <span className="text-[#334155] truncate font-mono" title={log.sequenceId}>{log.sequenceId.slice(0, 8)}...</span>
                        </div>
                      )}
                      {log.analysisId && (
                        <div>
                          <span className="text-[#94A3B8] block">Analysis ID:</span>
                          <span className="text-[#334155] truncate font-mono" title={log.analysisId}>{log.analysisId.slice(0, 8)}...</span>
                        </div>
                      )}
                    </div>
                  )}

                  {log.error && (
                    <div className="mt-2 p-2 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-[11px] font-medium">
                      <strong>Error:</strong> {log.error}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B]">
          <span>BioCode Studio Secure Logger • Zero credentials exposed</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-[#E2E8F0] hover:bg-[#CBD5E1] text-[#0F172A] font-semibold transition-colors cursor-pointer"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};
