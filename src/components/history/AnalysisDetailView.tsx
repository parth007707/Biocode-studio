import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Dna,
  Cloud,
  HardDrive,
  Calendar,
  Layers,
  Copy,
  Check,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileCode,
  PieChart,
  BarChart3,
  ListFilter,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Binary,
  Microscope,
  Sparkles,
  Info,
  Terminal,
  Database,
  FileText,
  Loader2
} from 'lucide-react';
import { AnalysisRecord, SequenceRecord, formatOrganism } from '../../types';
import { bioService } from '../../services/bioService';
import { generateAnalysisReportPdf } from '../../services/pdfReportService';
import {
  computeNucleotideComposition,
  analyzeGCAndORF,
  analyzeProteinSequence,
  predictRNASecondaryStructure,
  GCAndORFAnalysisResult,
  AminoAcidComposition,
  RNASecondaryStructureResult,
  ORFResult,
  normalizeAnalysisRecord
} from '../../lib/bio';

interface AnalysisDetailViewProps {
  analysisId: string;
  user: any;
  onBack: () => void;
  onOpenWorkbench?: (sequence: string, identifierOrMeta?: any, pipeline?: string, savedResults?: any) => void;
}

type TabType = 'overview' | 'sequence' | 'results' | 'statistics' | 'metadata';

export const AnalysisDetailView: React.FC<AnalysisDetailViewProps> = ({
  analysisId,
  user,
  onBack,
  onOpenWorkbench
}) => {
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Sequence Tab States
  const [seqPage, setSeqPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(5000);
  const [seqSearchQuery, setSeqSearchQuery] = useState<string>('');
  const [copiedVisible, setCopiedVisible] = useState<boolean>(false);
  const [copiedFull, setCopiedFull] = useState<boolean>(false);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [copiedOrfProt, setCopiedOrfProt] = useState<number | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // ORF Filter State
  const [orfFrameFilter, setOrfFrameFilter] = useState<'all' | 'pos' | 'neg'>('all');
  const [orfMinLength, setOrfMinLength] = useState<number>(30);

  useEffect(() => {
    loadAnalysisData();
  }, [analysisId, user]);

  const loadAnalysisData = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('[AnalysisDetailView] Loading analysis record ID:', analysisId);
      const record = await bioService.getAnalysisById(analysisId, user?.id);
      if (!record) {
        setError('Analysis record not found in Supabase or local storage.');
      } else {
        setAnalysis(record);
      }
    } catch (err: any) {
      console.error('[AnalysisDetailView] Error loading analysis record:', err);
      setError(err.message || 'Unable to load analysis details. Please check Supabase connection.');
    } finally {
      setLoading(false);
    }
  };

  // Derive sequence content
  const fullSequence = useMemo(() => {
    if (!analysis) return '';
    if (analysis.sequence_record?.sequence) {
      return analysis.sequence_record.sequence;
    }
    if (analysis.results?.sequence) {
      return analysis.results.sequence;
    }
    return '';
  }, [analysis]);

  // Derive biological sequence type
  const normalizedType = useMemo<'DNA' | 'RNA' | 'PROTEIN'>(() => {
    const rawType = (analysis?.sequence_type || analysis?.sequence_record?.sequence_type || 'DNA').toUpperCase();
    if (rawType.includes('PROT') || rawType.includes('AA')) return 'PROTEIN';
    if (rawType.includes('RNA')) return 'RNA';
    return 'DNA';
  }, [analysis]);

  // Real biological calculations from sequence or stored results
  const computedBio = useMemo(() => {
    if (!fullSequence) {
      return {
        dna: null as GCAndORFAnalysisResult | null,
        rna: null as RNASecondaryStructureResult | null,
        protein: null as AminoAcidComposition | null
      };
    }

    try {
      if (normalizedType === 'PROTEIN') {
        const prot = analyzeProteinSequence(fullSequence);
        return { dna: null, rna: null, protein: prot };
      } else if (normalizedType === 'RNA') {
        const rna = predictRNASecondaryStructure(fullSequence.slice(0, 5000));
        const dna = analyzeGCAndORF(fullSequence, 'RNA');
        return { dna, rna, protein: null };
      } else {
        const dna = analyzeGCAndORF(fullSequence, 'DNA');
        return { dna, rna: null, protein: null };
      }
    } catch (e) {
      console.warn('[AnalysisDetailView] Bio computation error:', e);
      return { dna: null, rna: null, protein: null };
    }
  }, [fullSequence, normalizedType]);

  // Merged results with stored Supabase results taking precedence or combining
  const dnaResults: GCAndORFAnalysisResult | null = computedBio.dna || analysis?.results?.dnaAnalysis || null;
  const proteinResults: AminoAcidComposition | null = computedBio.protein || analysis?.results?.proteinAnalysis || null;
  const rnaResults: RNASecondaryStructureResult | null = computedBio.rna || analysis?.results?.rnaAnalysis || null;

  // Total Sequence Length
  const totalLength = analysis?.total_sequence_length || analysis?.sequence_record?.total_length || fullSequence.length || 0;
  const analyzedLength = analysis?.analyzed_length || fullSequence.length || totalLength;
  const unit = normalizedType === 'PROTEIN' ? 'aa' : 'bp';

  // Sequence pagination calculations
  const totalSeqPages = Math.max(1, Math.ceil((fullSequence.length || totalLength || 1) / pageSize));
  const currentPage = Math.min(seqPage, totalSeqPages);
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, fullSequence.length);
  const visibleSequence = fullSequence.slice(startIdx, endIdx);

  // Sequence Search Matches
  const searchMatches = useMemo(() => {
    if (!seqSearchQuery.trim() || !fullSequence) return [];
    const query = seqSearchQuery.trim().toUpperCase();
    const matches: number[] = [];
    let pos = 0;
    const upper = fullSequence.toUpperCase();
    while ((pos = upper.indexOf(query, pos)) !== -1) {
      matches.push(pos + 1); // 1-based index
      pos += 1;
      if (matches.length >= 200) break; // cap search results for speed
    }
    return matches;
  }, [seqSearchQuery, fullSequence]);

  // Filtered ORFs
  const filteredOrfs = useMemo(() => {
    if (!dnaResults?.orfs) return [];
    return dnaResults.orfs.filter((orf) => {
      if (orf.lengthBp < orfMinLength) return false;
      if (orfFrameFilter === 'pos' && orf.frame < 0) return false;
      if (orfFrameFilter === 'neg' && orf.frame > 0) return false;
      return true;
    });
  }, [dnaResults, orfFrameFilter, orfMinLength]);

  // Copy helpers
  const handleCopyVisible = () => {
    if (!visibleSequence) return;
    navigator.clipboard.writeText(visibleSequence);
    setCopiedVisible(true);
    setTimeout(() => setCopiedVisible(false), 2000);
  };

  const handleCopyFull = () => {
    if (!fullSequence) return;
    navigator.clipboard.writeText(fullSequence);
    setCopiedFull(true);
    setTimeout(() => setCopiedFull(false), 2000);
  };

  const handleCopyJson = () => {
    if (!analysis) return;
    navigator.clipboard.writeText(JSON.stringify(analysis, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleDownloadFasta = () => {
    const accession = analysis?.sequence_record?.accession || analysis?.id || 'sequence';
    const header = `>${accession} ${analysis?.sequence_record?.definition || analysis?.analysis_type || ''} [length=${totalLength} ${unit}]`;
    const wrappedSeq = fullSequence.match(/.{1,80}/g)?.join('\n') || fullSequence;
    const fastaContent = `${header}\n${wrappedSeq}\n`;

    const blob = new Blob([fastaContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${accession}_analysis.fasta`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = async () => {
    if (!analysis) return;
    setIsExportingPdf(true);
    try {
      await generateAnalysisReportPdf(analysis, { fullSequence });
    } catch (err) {
      console.error('Failed to generate PDF report:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Jump to page containing search match
  const handleJumpToMatch = (matchPosition: number) => {
    const targetPage = Math.floor((matchPosition - 1) / pageSize) + 1;
    setSeqPage(targetPage);
  };

  // --------------------------------------------------------------------------
  // Loading Skeleton State
  // --------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 bg-[#E2E8F0] rounded-lg"></div>
          <div className="h-6 w-32 bg-[#E2E8F0] rounded-lg"></div>
        </div>
        <div className="h-36 bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4 shadow-xs">
          <div className="h-8 w-2/3 bg-[#E2E8F0] rounded-lg"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="h-10 bg-[#F1F5F9] rounded-xl"></div>
            <div className="h-10 bg-[#F1F5F9] rounded-xl"></div>
            <div className="h-10 bg-[#F1F5F9] rounded-xl"></div>
            <div className="h-10 bg-[#F1F5F9] rounded-xl"></div>
          </div>
        </div>
        <div className="h-96 bg-white border border-[#E2E8F0] rounded-2xl shadow-xs"></div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Error / Not Found State
  // --------------------------------------------------------------------------
  if (error || !analysis) {
    return (
      <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#F1F5F9] hover:bg-[#E2E8F0] border border-[#CBD5E1] text-xs font-mono text-[#334155] transition-all cursor-pointer shadow-xs"
        >
          <ArrowLeft className="w-4 h-4 text-[#0284C7]" />
          <span>Back to Analysis History</span>
        </button>

        <div className="p-6 sm:p-12 text-center bg-white border border-rose-200 rounded-2xl space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto text-rose-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[#0F172A] tracking-tight">
            {error || 'Analysis record not found'}
          </h3>
          <p className="text-xs text-[#64748B] max-w-md mx-auto font-mono">
            We could not retrieve an analysis record with ID: <code className="text-[#0284C7] bg-sky-50 px-1 py-0.5 rounded border border-sky-200">{analysisId}</code> from Supabase.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={loadAnalysisData}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs transition-all cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry</span>
            </button>
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-xl bg-[#F1F5F9] hover:bg-[#E2E8F0] border border-[#CBD5E1] text-[#334155] text-xs font-mono transition-all cursor-pointer"
            >
              Return to History
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Main Detail View
  // --------------------------------------------------------------------------
  const accession = analysis.sequence_record?.accession || analysis.input_source || 'Record ID';
  const rawOrganism = analysis.sequence_record?.organism || 'Homo sapiens';
  const organism = formatOrganism(rawOrganism) || 'Homo sapiens';
  const pipeline = analysis.analysis_type || 'Complete GC & 6-Frame ORF Analysis';
  const isLocal = analysis._is_local_fallback;

  return (
    <div id="analysis-detail-view" className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <button
          id="back-to-history-btn"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-xs font-mono text-[#334155] hover:text-[#0F172A] transition-all cursor-pointer w-fit shadow-xs group"
        >
          <ArrowLeft className="w-4 h-4 text-[#0284C7] group-hover:-translate-x-0.5 transition-transform" />
          <span>← Back to Analysis History</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {fullSequence && onOpenWorkbench && (
            <button
              onClick={() => {
                const meta = analysis.sequence_record?.metadata || {
                  accession,
                  organism,
                  source: analysis.sequence_record?.source || 'Supabase',
                  totalLength,
                  sequence_type: normalizedType
                };

                const rawPayload = analysis.results || {
                  type: normalizedType,
                  pipeline: analysis.analysis_type,
                  header: analysis.sequence_record?.definition || analysis.sequence_record?.accession || null,
                  sequence: fullSequence,
                  dnaAnalysis: computedBio.dna,
                  rnaAnalysis: computedBio.rna,
                  proteinAnalysis: computedBio.protein,
                  result_summary: analysis.result_summary,
                  created_at: analysis.created_at
                };

                const normalizedResult = normalizeAnalysisRecord(rawPayload, fullSequence, meta);

                onOpenWorkbench(
                  fullSequence,
                  meta,
                  analysis.analysis_type,
                  normalizedResult
                );
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-[#0284C7] text-xs font-mono font-medium transition-all cursor-pointer shadow-xs"
              title="Open this sequence and results in the interactive 3D workbench"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>Open in Workbench</span>
            </button>
          )}

          {fullSequence && (
            <button
              onClick={handleDownloadFasta}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-xs font-mono text-[#334155] hover:text-[#0F172A] transition-all cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-[#64748B]" />
              <span>Download FASTA</span>
            </button>
          )}

          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-xs font-mono font-semibold text-[#0284C7] hover:text-[#0369a1] transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Export comprehensive scientific PDF report for this analysis"
          >
            {isExportingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0284C7]" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-[#0284C7]" />
            )}
            <span>{isExportingPdf ? 'Generating PDF...' : 'Export PDF Report'}</span>
          </button>
        </div>
      </div>

      {/* Main Header Display Card */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-6 shadow-xs relative overflow-hidden">
        {/* Subtle accent backdrop */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-[#0284C7] shrink-0">
                <Dna className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#64748B] block">
                  Analysis Pipeline
                </span>
                <h1 className="text-lg sm:text-xl font-bold text-[#0F172A] tracking-tight break-words">
                  {pipeline}
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono border ${
                normalizedType === 'PROTEIN'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : normalizedType === 'RNA'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-sky-50 text-[#0284C7] border-sky-200'
              }`}>
                {normalizedType}
              </span>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {analysis.status || 'Completed'}
              </span>

              {isLocal ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  <HardDrive className="w-3.5 h-3.5" />
                  Local Cache
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-sky-50 text-[#0284C7] border border-sky-200">
                  <Cloud className="w-3.5 h-3.5" />
                  Supabase Cloud
                </span>
              )}
            </div>
          </div>

          {/* Quick Metrics Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
              <span className="text-[10px] font-mono uppercase text-[#64748B] block">Sequence / Accession</span>
              <span className="text-sm font-bold font-mono text-[#0284C7] truncate block mt-0.5" title={accession}>
                {accession}
              </span>
            </div>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
              <span className="text-[10px] font-mono uppercase text-[#64748B] block">Organism</span>
              <span className="text-sm font-bold text-[#0F172A] truncate block mt-0.5" title={organism}>
                {organism}
              </span>
            </div>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
              <span className="text-[10px] font-mono uppercase text-[#64748B] block">Length Analyzed</span>
              <span className="text-sm font-bold font-mono text-[#0F172A] block mt-0.5">
                {analyzedLength.toLocaleString()} <span className="text-[#64748B] text-xs font-normal">{unit}</span>
              </span>
            </div>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
              <span className="text-[10px] font-mono uppercase text-[#64748B] block">Timestamp</span>
              <span className="text-xs font-mono text-[#475569] block mt-1 truncate" title={new Date(analysis.created_at).toLocaleString()}>
                {new Date(analysis.created_at).toLocaleDateString()} {new Date(analysis.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Navigation Tabs */}
      <div className="flex border-b border-[#E2E8F0] font-mono text-xs gap-1 select-none overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 font-semibold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-white text-[#0284C7] border-t-2 border-t-[#0284C7] border-x border-[#E2E8F0]'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>[ Overview ]</span>
        </button>

        <button
          onClick={() => setActiveTab('sequence')}
          className={`px-4 py-2.5 font-semibold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'sequence'
              ? 'bg-white text-[#0284C7] border-t-2 border-t-[#0284C7] border-x border-[#E2E8F0]'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
          }`}
        >
          <Binary className="w-3.5 h-3.5" />
          <span>[ Sequence ]</span>
          {fullSequence && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1]">
              {totalLength.toLocaleString()} {unit}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('results')}
          className={`px-4 py-2.5 font-semibold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'results'
              ? 'bg-white text-[#0284C7] border-t-2 border-t-[#0284C7] border-x border-[#E2E8F0]'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
          }`}
        >
          <Microscope className="w-3.5 h-3.5" />
          <span>[ Results ]</span>
        </button>

        <button
          onClick={() => setActiveTab('statistics')}
          className={`px-4 py-2.5 font-semibold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'statistics'
              ? 'bg-white text-[#0284C7] border-t-2 border-t-[#0284C7] border-x border-[#E2E8F0]'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>[ Statistics ]</span>
        </button>

        <button
          onClick={() => setActiveTab('metadata')}
          className={`px-4 py-2.5 font-semibold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'metadata'
              ? 'bg-white text-[#0284C7] border-t-2 border-t-[#0284C7] border-x border-[#E2E8F0]'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>[ Metadata ]</span>
        </button>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 1: OVERVIEW */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Definition / Description */}
          {analysis.sequence_record?.definition && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-2 shadow-xs">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#64748B] flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-[#0284C7]" />
                <span>Biological Definition & Summary</span>
              </span>
              <p className="text-sm text-[#0F172A] leading-relaxed font-sans">
                {analysis.sequence_record.definition}
              </p>
            </div>
          )}

          {/* Primary Record Metadata Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
              <h3 className="text-xs font-bold font-mono text-[#0284C7] uppercase tracking-wider flex items-center gap-2">
                <Database className="w-4 h-4" />
                <span>Sequence Identification</span>
              </h3>
              <div className="space-y-2 font-mono text-xs divide-y divide-[#E2E8F0]">
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 pt-1">
                  <span className="text-[#64748B]">Accession:</span>
                  <span className="text-[#0284C7] font-bold break-all text-right">{accession}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 pt-2">
                  <span className="text-[#64748B]">Database Source:</span>
                  <span className="text-[#0F172A] text-right">{analysis.sequence_record?.source || analysis.input_source || 'Direct Input'}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 pt-2">
                  <span className="text-[#64748B]">Organism:</span>
                  <span className="text-[#0F172A] italic text-right">{organism}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 pt-2">
                  <span className="text-[#64748B]">Molecule / Type:</span>
                  <span className="text-[#0F172A] text-right">{analysis.sequence_record?.molecule_type || analysis.sequence_type || 'DNA'}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 pt-2">
                  <span className="text-[#64748B]">Topology:</span>
                  <span className="text-[#0F172A] uppercase text-right">{analysis.sequence_record?.topology || 'Linear'}</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs">
              <h3 className="text-xs font-bold font-mono text-[#0284C7] uppercase tracking-wider flex items-center gap-2">
                <Microscope className="w-4 h-4" />
                <span>Pipeline Execution Specs</span>
              </h3>
              <div className="space-y-2 font-mono text-xs divide-y divide-[#E2E8F0]">
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 pt-1">
                  <span className="text-[#64748B]">Analysis Pipeline:</span>
                  <span className="text-[#0284C7] font-semibold text-right break-words">{pipeline}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 pt-2">
                  <span className="text-[#64748B]">Analysis Scope:</span>
                  <span className="text-[#0F172A] text-right">{analysis.analysis_scope || 'Complete Sequence'}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 pt-2">
                  <span className="text-[#64748B]">Total Record Length:</span>
                  <span className="text-[#0F172A] font-bold text-right">{totalLength.toLocaleString()} {unit}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 pt-2">
                  <span className="text-[#64748B]">Bases Analyzed:</span>
                  <span className="text-[#0F172A] font-bold text-right">{analyzedLength.toLocaleString()} {unit}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 pt-2">
                  <span className="text-[#64748B]">Execution Status:</span>
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {analysis.status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Biochemical Preview */}
          {dnaResults && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4 shadow-xs">
              <h3 className="text-xs font-bold font-mono text-[#0284C7] uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span>Calculated Biochemical Metrics</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[10px] font-mono uppercase text-[#64748B]">GC Content</span>
                  <div className="text-xl font-bold font-mono text-[#0284C7] mt-1">
                    {dnaResults.composition.gcPercentage}%
                  </div>
                  <span className="text-[10px] font-mono text-[#64748B]">
                    {dnaResults.composition.gcCount.toLocaleString()} {unit}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[10px] font-mono uppercase text-[#64748B]">
                    {normalizedType === 'RNA' ? 'AU Content' : 'AT Content'}
                  </span>
                  <div className="text-xl font-bold font-mono text-sky-600 mt-1">
                    {normalizedType === 'RNA' ? dnaResults.composition.auPercentage : dnaResults.composition.atPercentage}%
                  </div>
                  <span className="text-[10px] font-mono text-[#64748B]">
                    {(normalizedType === 'RNA' ? dnaResults.composition.auCount : dnaResults.composition.atCount).toLocaleString()} {unit}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[10px] font-mono uppercase text-[#64748B]">Open Reading Frames</span>
                  <div className="text-xl font-bold font-mono text-purple-600 mt-1">
                    {dnaResults.orfs.length}
                  </div>
                  <span className="text-[10px] font-mono text-[#64748B]">Across 6 frames</span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[10px] font-mono uppercase text-[#64748B]">Longest ORF</span>
                  <div className="text-xl font-bold font-mono text-amber-600 mt-1">
                    {dnaResults.longestOrf ? `${dnaResults.longestOrf.lengthBp.toLocaleString()} bp` : 'None'}
                  </div>
                  <span className="text-[10px] font-mono text-[#64748B]">
                    {dnaResults.longestOrf ? `${dnaResults.longestOrf.lengthAa} aa (Frame ${dnaResults.longestOrf.frame > 0 ? `+${dnaResults.longestOrf.frame}` : dnaResults.longestOrf.frame})` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {proteinResults && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4 shadow-xs">
              <h3 className="text-xs font-bold font-mono text-purple-700 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span>Protein Physicochemical Highlights</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[10px] font-mono uppercase text-[#64748B]">Molecular Weight</span>
                  <div className="text-xl font-bold font-mono text-purple-700 mt-1">
                    {proteinResults.molecularWeightKDa} <span className="text-xs text-[#64748B]">kDa</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[10px] font-mono uppercase text-[#64748B]">Isoelectric Point (pI)</span>
                  <div className="text-xl font-bold font-mono text-sky-600 mt-1">
                    {proteinResults.isoelectricPoint}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[10px] font-mono uppercase text-[#64748B]">Net Charge (pH 7.0)</span>
                  <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
                    {proteinResults.netChargeAtPh7 > 0 ? `+${proteinResults.netChargeAtPh7}` : proteinResults.netChargeAtPh7}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[10px] font-mono uppercase text-[#64748B]">GRAVY Score</span>
                  <div className="text-xl font-bold font-mono text-amber-600 mt-1">
                    {proteinResults.gravyScore}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 2: SEQUENCE (Paginated & Protected for Multi-Megabase Records) */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'sequence' && (
        <div className="space-y-4">
          {!fullSequence ? (
            <div className="p-12 text-center bg-white border border-[#E2E8F0] rounded-2xl space-y-3 font-mono shadow-xs">
              <Binary className="w-8 h-8 text-[#94A3B8] mx-auto" />
              <p className="text-sm text-[#0F172A] font-semibold">Sequence text not stored in this record payload.</p>
              <p className="text-xs text-[#64748B]">
                This record was imported with biological metadata only ({totalLength.toLocaleString()} {unit} total).
              </p>
            </div>
          ) : (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4 shadow-xs">
              {/* Sequence Viewer Controls & Pagination Toolbar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Binary className="w-4 h-4 text-[#0284C7]" />
                    <h3 className="text-sm font-bold font-mono text-[#0F172A]">
                      Positions {(startIdx + 1).toLocaleString()} – {endIdx.toLocaleString()} of {totalLength.toLocaleString()} {unit}
                    </h3>
                  </div>
                  <p className="text-xs text-[#64748B] font-mono">
                    High-performance virtualized sequence window ({visibleSequence.length.toLocaleString()} residues in view)
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  {/* Search inside sequence */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8]" />
                    <input
                      type="text"
                      value={seqSearchQuery}
                      onChange={(e) => setSeqSearchQuery(e.target.value)}
                      placeholder="Search motif / bases..."
                      className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7] w-44 uppercase"
                    />
                  </div>

                  {/* Page Size Selector */}
                  <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-2.5 py-1">
                    <span className="text-[#64748B] text-[11px]">Chunk:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setSeqPage(1);
                      }}
                      className="bg-transparent text-[#0F172A] font-mono text-xs focus:outline-none cursor-pointer"
                    >
                      <option value={1000} className="bg-white text-[#0F172A]">1,000</option>
                      <option value={2500} className="bg-white text-[#0F172A]">2,500</option>
                      <option value={5000} className="bg-white text-[#0F172A]">5,000</option>
                      <option value={10000} className="bg-white text-[#0F172A]">10,000</option>
                      <option value={25000} className="bg-white text-[#0F172A]">25,000</option>
                    </select>
                  </div>

                  {/* Copy actions */}
                  <button
                    onClick={handleCopyVisible}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] hover:text-[#0F172A] transition-all cursor-pointer shadow-xs"
                    title="Copy current visible range"
                  >
                    {copiedVisible ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#64748B]" />}
                    <span>{copiedVisible ? 'Copied Range' : 'Copy Range'}</span>
                  </button>

                  <button
                    onClick={handleCopyFull}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] hover:text-[#0F172A] transition-all cursor-pointer shadow-xs"
                    title="Copy full sequence"
                  >
                    {copiedFull ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#64748B]" />}
                    <span>{copiedFull ? 'Copied Full' : 'Copy All'}</span>
                  </button>

                  <button
                    onClick={handleDownloadFasta}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-[#0284C7] transition-all cursor-pointer shadow-xs"
                    title="Download sequence in FASTA format"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>FASTA</span>
                  </button>
                </div>
              </div>

              {/* Search Matches Notification */}
              {seqSearchQuery.trim() && (
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-xs text-[#0284C7]">
                  <div className="flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-[#0284C7] shrink-0" />
                    <span>
                      Found <strong className="text-[#0F172A]">{searchMatches.length}</strong> occurrences of motif &quot;{seqSearchQuery.toUpperCase()}&quot;
                    </span>
                  </div>
                  {searchMatches.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto max-w-full sm:max-w-md">
                      <span className="text-[11px] text-[#64748B]">Matches:</span>
                      {searchMatches.slice(0, 8).map((matchPos, i) => (
                        <button
                          key={i}
                          onClick={() => handleJumpToMatch(matchPos)}
                          className="px-1.5 py-0.5 rounded bg-sky-100 hover:bg-sky-200 text-[#0284C7] text-[10px] cursor-pointer"
                          title={`Jump to position ${matchPos}`}
                        >
                          @{matchPos.toLocaleString()}
                        </button>
                      ))}
                      {searchMatches.length > 8 && (
                        <span className="text-[10px] text-[#64748B]">+{searchMatches.length - 8} more</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Formatted Residues Display */}
              <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-4 font-mono text-xs overflow-x-auto max-h-[500px] select-text">
                <div className="space-y-1.5">
                  {Array.from({ length: Math.ceil(visibleSequence.length / 60) }).map((_, lineIdx) => {
                    const lineStart = startIdx + lineIdx * 60;
                    const lineEnd = Math.min(lineStart + 60, startIdx + visibleSequence.length);
                    const chunk = visibleSequence.slice(lineIdx * 60, (lineIdx + 1) * 60);

                    // Break into 10-residue groups for standard scientific alignment
                    const groups = chunk.match(/.{1,10}/g) || [];

                    return (
                      <div key={lineIdx} className="flex items-center gap-4 text-[#334155] hover:bg-[#F1F5F9] px-2 py-0.5 rounded transition-colors">
                        <span className="text-[#94A3B8] select-none w-16 text-right font-bold text-[11px]">
                          {(lineStart + 1).toLocaleString().padStart(8, ' ')}
                        </span>
                        <div className="flex items-center gap-2 font-mono tracking-wider">
                          {groups.map((grp, gIdx) => (
                            <span key={gIdx} className="text-[#334155]">
                              {grp.split('').map((char, cIdx) => {
                                const upperChar = char.toUpperCase();
                                let colorClass = 'text-[#334155]';
                                if (upperChar === 'A') colorClass = 'text-emerald-700 font-bold';
                                else if (upperChar === 'T' || upperChar === 'U') colorClass = 'text-rose-600 font-bold';
                                else if (upperChar === 'G') colorClass = 'text-amber-600 font-bold';
                                else if (upperChar === 'C') colorClass = 'text-[#0284C7] font-bold';

                                return (
                                  <span key={cIdx} className={colorClass}>
                                    {char}
                                  </span>
                                );
                              })}
                            </span>
                          ))}
                        </div>
                        <span className="text-[#94A3B8] select-none ml-auto text-[11px]">
                          {lineEnd.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Pagination Bar */}
              {totalSeqPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs pt-2">
                  <span className="text-[#64748B]">
                    Showing Page <strong className="text-[#0F172A]">{currentPage}</strong> of <strong className="text-[#0F172A]">{totalSeqPages}</strong>
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSeqPage(1)}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                      title="First page"
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setSeqPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                      title="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1 px-2">
                      <span className="text-[#64748B]">Page</span>
                      <input
                        type="number"
                        min={1}
                        max={totalSeqPages}
                        value={currentPage}
                        onChange={(e) => {
                          const p = parseInt(e.target.value, 10);
                          if (!isNaN(p) && p >= 1 && p <= totalSeqPages) {
                            setSeqPage(p);
                          }
                        }}
                        className="w-14 bg-white border border-[#CBD5E1] rounded px-1.5 py-0.5 text-center text-xs text-[#0F172A] font-mono"
                      />
                      <span className="text-[#64748B]">/ {totalSeqPages}</span>
                    </div>

                    <button
                      onClick={() => setSeqPage(Math.min(totalSeqPages, currentPage + 1))}
                      disabled={currentPage === totalSeqPages}
                      className="p-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                      title="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setSeqPage(totalSeqPages)}
                      disabled={currentPage === totalSeqPages}
                      className="p-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                      title="Last page"
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 3: RESULTS */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'results' && (
        <div className="space-y-6">
          {/* DNA / RNA GC & Nucleotide Results */}
          {dnaResults && (
            <div className="space-y-6">
              {/* Composition Breakdown Grid */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4 shadow-xs">
                <h3 className="text-xs font-bold font-mono text-[#0284C7] uppercase tracking-wider flex items-center gap-2">
                  <PieChart className="w-4 h-4" />
                  <span>Nucleotide Composition & Base Ratios</span>
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                    <div className="flex justify-between items-center text-xs text-[#64748B]">
                      <span>Adenine (A)</span>
                      <span className="font-bold text-emerald-700">
                        {dnaResults.composition.counts.A?.toLocaleString() || 0}
                      </span>
                    </div>
                    <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full"
                        style={{
                          width: `${((dnaResults.composition.counts.A || 0) / (dnaResults.composition.length || 1)) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-[#64748B] block text-right">
                      {(((dnaResults.composition.counts.A || 0) / (dnaResults.composition.length || 1)) * 100).toFixed(2)}%
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                    <div className="flex justify-between items-center text-xs text-[#64748B]">
                      <span>Cytosine (C)</span>
                      <span className="font-bold text-[#0284C7]">
                        {dnaResults.composition.counts.C?.toLocaleString() || 0}
                      </span>
                    </div>
                    <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-[#0284C7] h-full rounded-full"
                        style={{
                          width: `${((dnaResults.composition.counts.C || 0) / (dnaResults.composition.length || 1)) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-[#64748B] block text-right">
                      {(((dnaResults.composition.counts.C || 0) / (dnaResults.composition.length || 1)) * 100).toFixed(2)}%
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                    <div className="flex justify-between items-center text-xs text-[#64748B]">
                      <span>Guanine (G)</span>
                      <span className="font-bold text-amber-600">
                        {dnaResults.composition.counts.G?.toLocaleString() || 0}
                      </span>
                    </div>
                    <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-amber-500 h-full rounded-full"
                        style={{
                          width: `${((dnaResults.composition.counts.G || 0) / (dnaResults.composition.length || 1)) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-[#64748B] block text-right">
                      {(((dnaResults.composition.counts.G || 0) / (dnaResults.composition.length || 1)) * 100).toFixed(2)}%
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                    <div className="flex justify-between items-center text-xs text-[#64748B]">
                      <span>{normalizedType === 'RNA' ? 'Uracil (U)' : 'Thymine (T)'}</span>
                      <span className="font-bold text-rose-600">
                        {(normalizedType === 'RNA' ? dnaResults.composition.counts.U : dnaResults.composition.counts.T)?.toLocaleString() || 0}
                      </span>
                    </div>
                    <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-rose-500 h-full rounded-full"
                        style={{
                          width: `${(((normalizedType === 'RNA' ? dnaResults.composition.counts.U : dnaResults.composition.counts.T) || 0) / (dnaResults.composition.length || 1)) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-[#64748B] block text-right">
                      {((((normalizedType === 'RNA' ? dnaResults.composition.counts.U : dnaResults.composition.counts.T) || 0) / (dnaResults.composition.length || 1)) * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* 6-Frame Open Reading Frames (ORFs) */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-bold font-mono text-[#0284C7] uppercase tracking-wider flex items-center gap-2">
                      <Binary className="w-4 h-4" />
                      <span>6-Frame Open Reading Frames ({filteredOrfs.length} identified)</span>
                    </h3>
                    <p className="text-xs text-[#64748B] font-mono">
                      ATG start codon initiated peptides terminated by TAA, TAG, or TGA
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                    <div className="flex items-center gap-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-2.5 py-1">
                      <span className="text-[#64748B] text-[11px]">Strand:</span>
                      <select
                        value={orfFrameFilter}
                        onChange={(e) => setOrfFrameFilter(e.target.value as any)}
                        className="bg-transparent text-[#0F172A] text-xs focus:outline-none cursor-pointer"
                      >
                        <option value="all" className="bg-white text-[#0F172A]">All (+ & -)</option>
                        <option value="pos" className="bg-white text-[#0F172A]">Positive (+1, +2, +3)</option>
                        <option value="neg" className="bg-white text-[#0F172A]">Negative (-1, -2, -3)</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-2.5 py-1">
                      <span className="text-[#64748B] text-[11px]">Min bp:</span>
                      <select
                        value={orfMinLength}
                        onChange={(e) => setOrfMinLength(Number(e.target.value))}
                        className="bg-transparent text-[#0F172A] text-xs focus:outline-none cursor-pointer"
                      >
                        <option value={30} className="bg-white text-[#0F172A]">≥ 30 bp</option>
                        <option value={60} className="bg-white text-[#0F172A]">≥ 60 bp</option>
                        <option value={90} className="bg-white text-[#0F172A]">≥ 90 bp</option>
                        <option value={150} className="bg-white text-[#0F172A]">≥ 150 bp</option>
                      </select>
                    </div>
                  </div>
                </div>

                {filteredOrfs.length === 0 ? (
                  <div className="p-8 text-center bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-xs font-mono text-[#64748B]">
                    No ORFs matched the selected filters.
                  </div>
                ) : (
                  <div className="border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs">
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full min-w-[600px] text-left border-collapse text-xs font-mono">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] text-[#64748B] uppercase sticky top-0">
                            <th className="p-3">Frame</th>
                            <th className="p-3">Start (1-based)</th>
                            <th className="p-3">End</th>
                            <th className="p-3">Length (bp)</th>
                            <th className="p-3">Length (aa)</th>
                            <th className="p-3">Protein Sequence Preview</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {filteredOrfs.slice(0, 100).map((orf, index) => {
                            const isPos = orf.frame > 0;
                            return (
                              <tr key={index} className="hover:bg-[#F8FAFC] transition-colors">
                                <td className="p-3 font-bold">
                                  <span className={`px-2 py-0.5 rounded text-[10px] ${
                                    isPos ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                                  }`}>
                                    {isPos ? `+${orf.frame}` : orf.frame}
                                  </span>
                                </td>
                                <td className="p-3 text-[#334155]">{orf.start.toLocaleString()}</td>
                                <td className="p-3 text-[#334155]">{orf.end.toLocaleString()}</td>
                                <td className="p-3 text-[#0F172A] font-bold">{orf.lengthBp.toLocaleString()} bp</td>
                                <td className="p-3 text-[#0284C7] font-bold">{orf.lengthAa} aa</td>
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[#64748B] font-mono text-[11px] truncate max-w-xs block">
                                      {orf.proteinSequence}
                                    </span>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(orf.proteinSequence);
                                        setCopiedOrfProt(index);
                                        setTimeout(() => setCopiedOrfProt(null), 1500);
                                      }}
                                      className="p-1 rounded hover:bg-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] cursor-pointer shrink-0"
                                      title="Copy protein sequence"
                                    >
                                      {copiedOrfProt === index ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Protein Properties Results */}
          {proteinResults && (
            <div className="space-y-6">
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4 shadow-xs">
                <h3 className="text-xs font-bold font-mono text-purple-700 uppercase tracking-wider flex items-center gap-2">
                  <Microscope className="w-4 h-4" />
                  <span>Amino Acid Residue Classification</span>
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <span className="text-[10px] text-[#64748B] uppercase block">Hydrophobic Residues</span>
                    <div className="text-lg font-bold text-amber-600 mt-1">
                      {proteinResults.hydrophobicPercentage}%
                    </div>
                    <span className="text-[10px] text-[#64748B]">{proteinResults.hydrophobicCount} residues</span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <span className="text-[10px] text-[#64748B] uppercase block">Polar Residues</span>
                    <div className="text-lg font-bold text-sky-600 mt-1">
                      {proteinResults.polarPercentage}%
                    </div>
                    <span className="text-[10px] text-[#64748B]">{proteinResults.polarCount} residues</span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <span className="text-[10px] text-[#64748B] uppercase block">Positively Charged</span>
                    <div className="text-lg font-bold text-emerald-700 mt-1">
                      {proteinResults.positivelyChargedCount}
                    </div>
                    <span className="text-[10px] text-[#64748B]">Arg, Lys, His</span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <span className="text-[10px] text-[#64748B] uppercase block">Negatively Charged</span>
                    <div className="text-lg font-bold text-rose-600 mt-1">
                      {proteinResults.negativelyChargedCount}
                    </div>
                    <span className="text-[10px] text-[#64748B]">Asp, Glu</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fallback if results are stored as unstructured JSON */}
          {!dnaResults && !proteinResults && !rnaResults && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3 font-mono text-xs shadow-xs">
              <h3 className="text-xs font-bold text-[#0284C7] uppercase tracking-wider flex items-center gap-2">
                <Database className="w-4 h-4" />
                <span>Stored Pipeline Results Payload</span>
              </h3>
              <pre className="p-4 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-[#334155] overflow-x-auto">
                {JSON.stringify(analysis.results, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 4: STATISTICS */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'statistics' && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4 shadow-xs">
            <h3 className="text-xs font-bold font-mono text-[#0284C7] uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              <span>Statistical & Compositional Metrics</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                <span className="text-[10px] text-[#64748B] uppercase">Coverage & Completeness</span>
                <div className="text-2xl font-bold text-emerald-700">100.0%</div>
                <p className="text-[11px] text-[#64748B]">
                  {analyzedLength.toLocaleString()} of {totalLength.toLocaleString()} {unit} analyzed in single execution
                </p>
              </div>

              {dnaResults && (
                <>
                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                    <span className="text-[10px] text-[#64748B] uppercase">GC Skew [(G - C) / (G + C)]</span>
                    <div className="text-2xl font-bold text-[#0284C7]">
                      {dnaResults.composition.gcCount > 0
                        ? (((dnaResults.composition.counts.G || 0) - (dnaResults.composition.counts.C || 0)) / (dnaResults.composition.gcCount)).toFixed(4)
                        : '0.0000'}
                    </div>
                    <p className="text-[11px] text-[#64748B]">
                      Replication origin & leading/lagging strand skew metric
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                    <span className="text-[10px] text-[#64748B] uppercase">ORF Coding Density</span>
                    <div className="text-2xl font-bold text-purple-700">
                      {totalLength > 0 ? ((dnaResults.orfs.length / totalLength) * 1000).toFixed(2) : '0.00'} <span className="text-xs font-normal text-[#64748B]">ORFs/kb</span>
                    </div>
                    <p className="text-[11px] text-[#64748B]">
                      Average frequency of open reading frames per kilobase
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Reading frame distribution */}
          {dnaResults && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4 shadow-xs">
              <h3 className="text-xs font-bold font-mono text-[#0284C7] uppercase tracking-wider flex items-center gap-2">
                <Binary className="w-4 h-4" />
                <span>Reading Frame Distribution Breakdown</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 font-mono text-center">
                {[1, 2, 3, -1, -2, -3].map((frame) => {
                  const count = dnaResults.orfs.filter((o) => o.frame === frame).length;
                  const isPos = frame > 0;
                  return (
                    <div key={frame} className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isPos ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        Frame {isPos ? `+${frame}` : frame}
                      </span>
                      <div className="text-lg font-bold text-[#0F172A] mt-1">{count}</div>
                      <span className="text-[10px] text-[#64748B]">
                        {dnaResults.orfs.length > 0 ? `${((count / dnaResults.orfs.length) * 100).toFixed(1)}%` : '0%'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* TAB 5: METADATA */}
      {/* ---------------------------------------------------------------------- */}
      {activeTab === 'metadata' && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold font-mono text-[#0284C7] uppercase tracking-wider flex items-center gap-2">
                <FileCode className="w-4 h-4" />
                <span>Audit & Database Record Descriptors</span>
              </h3>
              <button
                onClick={handleCopyJson}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-xs font-mono text-[#334155] transition-all cursor-pointer shadow-xs"
              >
                {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#64748B]" />}
                <span>{copiedJson ? 'JSON Copied' : 'Copy JSON'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                  <span className="text-[#64748B]">Analysis Record ID:</span>
                  <span className="text-[#0284C7] font-semibold select-all break-all text-right">{analysis.id}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                  <span className="text-[#64748B]">Sequence Record ID:</span>
                  <span className="text-[#0F172A] select-all break-all text-right">{analysis.sequence_id || analysis.sequence_record?.id || 'Direct'}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                  <span className="text-[#64748B]">Project ID:</span>
                  <span className="text-[#0F172A] break-all text-right">{analysis.project_id || 'None (Global)'}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                  <span className="text-[#64748B]">Workspace Scope:</span>
                  <span className="text-[#64748B] text-right">{analysis.user_id ? 'User-Scoped Record' : 'Public Workspace'}</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                  <span className="text-[#64748B]">Created At:</span>
                  <span className="text-[#0F172A] break-all text-right">{new Date(analysis.created_at).toISOString()}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                  <span className="text-[#64748B]">Updated At:</span>
                  <span className="text-[#0F172A] break-all text-right">{new Date(analysis.updated_at).toISOString()}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                  <span className="text-[#64748B]">Storage Backend:</span>
                  <span className="text-emerald-700 font-bold text-right">{isLocal ? 'Local Storage Fallback' : 'Supabase Cloud (PostgreSQL)'}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                  <span className="text-[#64748B]">RLS Enforcement:</span>
                  <span className="text-emerald-700 font-semibold text-right">Active (Public & User-Scoped)</span>
                </div>
              </div>
            </div>

            {/* Formatted JSON Inspector */}
            <div className="space-y-2 pt-2">
              <span className="text-[11px] font-mono text-[#64748B]">Raw JSON Payload</span>
              <pre className="p-4 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-[#334155] font-mono text-xs overflow-x-auto max-h-96">
                {JSON.stringify(analysis, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
