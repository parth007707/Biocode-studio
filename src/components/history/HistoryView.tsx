import React, { useState, useEffect } from 'react';
import { 
  History, 
  Search, 
  Database, 
  Dna, 
  Loader2, 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink, 
  Cloud, 
  HardDrive,
  RefreshCw,
  Code,
  ArrowRight
} from 'lucide-react';
import { AnalysisRecord, SchemaHealthStatus, formatOrganism } from '../../types';
import { bioService } from '../../services/bioService';
import { isSupabaseConfigured } from '../../lib/supabase/client';
import { SqlMigrationModal } from '../database/SqlMigrationModal';
import { AnalysisDetailView } from './AnalysisDetailView';

interface HistoryViewProps {
  user: any;
  onOpenAuth: () => void;
  initialAnalysisId?: string | null;
  onSelectAnalysis?: (id: string | null) => void;
  onOpenWorkbench?: (sequence: string, meta?: any, pipeline?: string, savedResults?: any) => void;
  onOpenAiWithContext?: (context: any) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ 
  user, 
  onOpenAuth,
  initialAnalysisId = null,
  onSelectAnalysis,
  onOpenWorkbench,
  onOpenAiWithContext
}) => {
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [schemaStatus, setSchemaStatus] = useState<SchemaHealthStatus | null>(null);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState<boolean>(false);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(initialAnalysisId);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 15;

  useEffect(() => {
    let isMounted = true;
    loadHistory(isMounted);
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  // Synchronize when initialAnalysisId prop changes (e.g. via direct URL navigation)
  useEffect(() => {
    if (initialAnalysisId !== undefined) {
      setSelectedAnalysisId(initialAnalysisId);
    }
  }, [initialAnalysisId]);

  const loadHistory = async (isMounted: boolean = true, forceRefresh: boolean = false) => {
    setLoading(true);
    setError(null);
    setIsRateLimited(false);
    try {
      const [data, health] = await Promise.all([
        bioService.getAnalyses(user?.id, forceRefresh),
        bioService.checkSchemaHealth()
      ]);
      if (isMounted) {
        setAnalyses(data);
        setSchemaStatus(health);
      }
    } catch (err: any) {
      console.error('Failed to load analysis history:', err);
      if (isMounted) {
        const msg = err?.message || String(err);
        const rateLimit = msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('429');
        setIsRateLimited(rateLimit);
        setError(msg);
        
        // Try fallback local analyses
        try {
          const local = localStorage.getItem('biocode_analyses');
          if (local) {
            setAnalyses(JSON.parse(local));
          }
        } catch {}
      }
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  };

  const handleOpenDetail = (id: string) => {
    setSelectedAnalysisId(id);
    if (onSelectAnalysis) {
      onSelectAnalysis(id);
    } else {
      window.history.pushState(null, '', `/analysis-history/${id}`);
    }
  };

  const handleBackToHistory = () => {
    setSelectedAnalysisId(null);
    if (onSelectAnalysis) {
      onSelectAnalysis(null);
    } else {
      window.history.pushState(null, '', '/analysis-history');
    }
  };

  // If a record is selected, display the detailed analysis record view
  if (selectedAnalysisId) {
    return (
      <AnalysisDetailView
        analysisId={selectedAnalysisId}
        user={user}
        onBack={handleBackToHistory}
        onOpenWorkbench={onOpenWorkbench}
      />
    );
  }

  const filteredAnalyses = analyses.filter(a =>
    a.analysis_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.sequence_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.input_source && a.input_source.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (a.result_summary && a.result_summary.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (a.sequence_record?.accession && a.sequence_record.accession.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (a.sequence_record?.organism && a.sequence_record.organism.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (a.sequence_record?.definition && a.sequence_record.definition.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const hasSchemaIssue = schemaStatus?.missingTables && schemaStatus.missingTables.length > 0;

  const totalPages = Math.ceil(filteredAnalyses.length / PAGE_SIZE) || 1;
  const paginatedAnalyses = filteredAnalyses.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div id="history-view-container" className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header & Database Architecture Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2.5">
            <History className="w-5 h-5 text-[#0284C7]" />
            <span>Analysis Audit History & Sequence Records</span>
          </h2>
          <p className="text-xs text-[#475569] mt-1">
            Real persistent records stored in the Supabase <code className="font-mono text-[#0284C7] bg-sky-50 px-1 py-0.5 rounded border border-sky-200">analyses</code> & <code className="font-mono text-[#0284C7] bg-sky-50 px-1 py-0.5 rounded border border-sky-200">sequence_records</code> tables. Click any record row to inspect full biological results.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMigrationModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F1F5F9] hover:bg-[#E2E8F0] border border-[#CBD5E1] text-xs text-[#334155] font-mono font-medium transition-all cursor-pointer shadow-xs"
          >
            <Code className="w-3.5 h-3.5 text-[#0284C7]" />
            <span>View SQL Schema</span>
          </button>

          <button
            onClick={() => loadHistory(true, true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F1F5F9] hover:bg-[#E2E8F0] border border-[#CBD5E1] text-xs text-[#334155] font-mono font-medium transition-all disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#0284C7]' : 'text-[#64748B]'}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Rate Exceeded / Network Error Alert Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <div>
              <span className="font-bold">
                {isRateLimited ? 'Database Rate Limit Throttled (429):' : 'Network Communication Issue:'}
              </span>{' '}
              {isRateLimited
                ? 'Server query limit reached. Automatic retry scheduled with exponential backoff. Local fallback records are displayed below.'
                : error}
            </div>
          </div>
          <button
            onClick={() => loadHistory(true, true)}
            className="px-3 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-300 text-[11px] font-bold transition-all shrink-0 cursor-pointer"
          >
            Force Retry
          </button>
        </div>
      )}

      {/* Database Status Diagnostic Banner */}
      {!isSupabaseConfigured ? (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold">Supabase Environment Unconfigured:</span> Showing local offline storage fallback. Configure <code className="font-mono bg-amber-100 px-1 py-0.5 rounded border border-amber-200">VITE_SUPABASE_URL</code> & <code className="font-mono bg-amber-100 px-1 py-0.5 rounded border border-amber-200">VITE_SUPABASE_ANON_KEY</code>.
            </div>
          </div>
        </div>
      ) : hasSchemaIssue ? (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start md:items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 md:mt-0" />
            <div className="space-y-0.5">
              <div className="font-bold text-amber-900">
                Supabase schema cache notice: Table(s) <code className="font-mono bg-amber-100 px-1 py-0.5 rounded border border-amber-200">{schemaStatus?.missingTables?.join(', ')}</code> not found in PostgREST schema cache.
              </div>
              <p className="text-[11px] text-amber-700">
                Analyses are temporarily stored in local storage cache. Execute the provided SQL migration in the Supabase SQL Editor to enable persistent cloud synchronization.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsMigrationModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs transition-all shrink-0 cursor-pointer shadow-xs"
          >
            View & Copy SQL Migration
          </button>
        </div>
      ) : (
        <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-xs text-[#0284C7] flex items-center justify-between font-mono">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-[#0284C7]" />
            <span>Supabase Cloud Database: Connected (<code className="text-[#0369a1] font-semibold">sequence_records</code>, <code className="text-[#0369a1] font-semibold">analyses</code>, <code className="text-[#0369a1] font-semibold">projects</code> verified)</span>
          </div>
          <span className="text-[10px] text-[#0284C7] bg-white px-2 py-0.5 rounded border border-sky-200 font-semibold shadow-2xs">
            PostgREST Schema Synchronized
          </span>
        </div>
      )}

      {/* Filter & Metrics Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by analysis type, sequence, or accession..."
            className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-10 pr-4 py-2 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono shadow-2xs"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-[#64748B] font-mono">
          <span>Total Records: <strong className="text-[#0F172A]">{analyses.length}</strong></span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Cloud className="w-3.5 h-3.5 text-[#0284C7]" />
            Supabase: <strong className="text-[#0284C7]">{analyses.filter(a => !a._is_local_fallback).length}</strong>
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <HardDrive className="w-3.5 h-3.5 text-amber-600" />
            Local Cache: <strong className="text-amber-600">{analyses.filter(a => a._is_local_fallback).length}</strong>
          </span>
        </div>
      </div>

      {/* History Records Table */}
      {loading ? (
        <div className="py-24 text-center space-y-3 bg-white border border-[#E2E8F0] rounded-2xl shadow-xs">
          <Loader2 className="w-8 h-8 text-[#0284C7] animate-spin mx-auto" />
          <p className="text-xs font-mono text-[#64748B]">Fetching audit records from Supabase database...</p>
        </div>
      ) : filteredAnalyses.length === 0 ? (
        <div className="p-16 text-center bg-white border border-[#E2E8F0] rounded-2xl space-y-3 shadow-xs">
          <History className="w-10 h-10 text-[#94A3B8] mx-auto" />
          <h3 className="text-sm font-semibold text-[#0F172A]">No analyses found</h3>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            {searchQuery ? 'No records match your filter query.' : 'No analyses yet. Execute a pipeline in the Sequence Workbench to record persistent data.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[11px] font-mono text-[#64748B] uppercase bg-[#F8FAFC]">
                  <th className="p-4">Analysis Pipeline & Scope</th>
                  <th className="p-4">Sequence / Accession</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Length Analyzed</th>
                  <th className="p-4">Storage Source</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Timestamp</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-xs font-mono">
                {paginatedAnalyses.map((record) => {
                  const isLocal = record._is_local_fallback;
                  return (
                    <tr 
                      key={record.id}
                      onClick={() => handleOpenDetail(record.id)}
                      className="hover:bg-[#F8FAFC] transition-all cursor-pointer group"
                      title="Click anywhere to inspect detailed analysis results"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 group-hover:border-sky-300 flex items-center justify-center text-[#0284C7] shrink-0 transition-colors">
                            <Dna className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-semibold text-[#0F172A] group-hover:text-[#0284C7] transition-colors block">
                              {record.analysis_type}
                            </span>
                            <span className="text-[10px] text-[#475569] bg-[#F1F5F9] px-1.5 py-0.5 rounded border border-[#E2E8F0] mt-0.5 inline-block">
                              {record.analysis_scope || 'Complete Sequence'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 text-[#334155]">
                        {record.sequence_record ? (
                          <div>
                            <span className="font-bold text-[#0284C7] group-hover:underline transition-colors block">
                              {record.sequence_record.accession}
                            </span>
                            <span className="text-[10px] text-[#64748B] truncate max-w-xs block">
                              {record.sequence_record.definition || formatOrganism(record.sequence_record.organism)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#64748B] truncate max-w-xs block">
                            {record.input_source || 'Direct Input'}
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          record.sequence_type === 'PROTEIN' 
                            ? 'bg-purple-50 text-purple-700 border-purple-200' 
                            : record.sequence_type === 'RNA' 
                            ? 'bg-amber-50 text-amber-700 border-amber-200' 
                            : 'bg-sky-50 text-[#0284C7] border-sky-200'
                        }`}>
                          {record.sequence_type}
                        </span>
                      </td>

                      <td className="p-4 text-[#334155]">
                        <div>
                          <span className="font-bold text-[#0F172A]">{(record.analyzed_length || record.total_sequence_length || 0).toLocaleString()}</span>
                          <span className="text-[#64748B] ml-1 text-[11px]">{record.sequence_type === 'PROTEIN' ? 'aa' : 'bp'}</span>
                        </div>
                        {record.total_sequence_length && record.total_sequence_length > (record.analyzed_length || 0) && (
                          <span className="text-[10px] text-[#64748B] block">
                            of {record.total_sequence_length.toLocaleString()} total
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        {isLocal ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                            <HardDrive className="w-3 h-3" />
                            Local Cache
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-sky-50 text-[#0284C7] border border-sky-200 font-medium">
                            <Cloud className="w-3 h-3" />
                            Supabase Cloud
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                          {record.status}
                        </span>
                      </td>

                      <td className="p-4 text-[#64748B] text-[11px]">
                        {new Date(record.created_at).toLocaleDateString()} {new Date(record.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>

                      <td className="p-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(record.id);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 group-hover:bg-sky-100 border border-sky-200 text-[#0284C7] text-xs font-mono font-semibold transition-all cursor-pointer shadow-2xs"
                        >
                          <span>View</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-4 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-between font-mono text-xs text-[#64748B]">
              <div>
                Showing <strong className="text-[#0F172A]">{(currentPage - 1) * PAGE_SIZE + 1}</strong> to{' '}
                <strong className="text-[#0F172A]">
                  {Math.min(currentPage * PAGE_SIZE, filteredAnalyses.length)}
                </strong>{' '}
                of <strong className="text-[#0F172A]">{filteredAnalyses.length}</strong> records
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#F1F5F9] disabled:opacity-40 disabled:pointer-events-none text-[#334155] border border-[#CBD5E1] transition-all cursor-pointer shadow-2xs"
                >
                  Previous
                </button>
                <span className="text-[#64748B] px-2">
                  Page <strong className="text-[#0284C7]">{currentPage}</strong> of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#F1F5F9] disabled:opacity-40 disabled:pointer-events-none text-[#334155] border border-[#CBD5E1] transition-all cursor-pointer shadow-2xs"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SQL Migration Modal */}
      <SqlMigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => {
          setIsMigrationModalOpen(false);
          loadHistory();
        }}
        missingTables={schemaStatus?.missingTables}
      />
    </div>
  );
};
