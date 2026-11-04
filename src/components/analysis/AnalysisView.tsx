import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BiologicalDataExplorer } from './explorer/BiologicalDataExplorer';
import { SequenceWorkbench } from './SequenceWorkbench';
import { Database, Dna, ArrowLeft, Globe, Terminal, Sparkles, ShieldAlert, CheckCircle2, X } from 'lucide-react';
import { SequenceSourceMetadata } from '../../services/adapters/types';
import { validateBiologicalSequence } from '../../lib/bio';
import { useBioSequence } from '../../context/BioSequenceContext';

interface AnalysisViewProps {
  user: any;
  onOpenAuth: () => void;
  initialWorkbenchData?: {
    sequence: string;
    metadata?: any;
    pipeline?: string;
    savedResults?: any;
    projectId?: string;
    sequenceId?: string;
  } | null;
  onOpenAiWithContext?: (context: any) => void;
}

export const AnalysisView: React.FC<AnalysisViewProps> = ({ user, onOpenAuth, initialWorkbenchData, onOpenAiWithContext }) => {
  const { 
    clearActiveSequence, 
    sequenceType: centralSequenceType, 
    hasActiveSequence, 
    sequence: centralSequence,
    accession: centralAccession,
    sourceMetadata: centralSourceMetadata,
    loadSequence: centralLoadSequence,
    loadTarget
  } = useBioSequence();
  // Canonical sequence, accession, and metadata directly from central BioSequenceContext
  const activeSequence = centralSequence || initialWorkbenchData?.sequence || '';
  const sourceIdentifier = centralAccession || initialWorkbenchData?.metadata?.accession || null;
  const sourceMetadata = centralSourceMetadata || initialWorkbenchData?.metadata || undefined;
  const hasActiveTarget = Boolean(activeSequence || hasActiveSequence || centralSequence);

  const [viewMode, setViewMode] = useState<'explorer' | 'workbench'>(
    initialWorkbenchData?.sequence ? 'workbench' : (hasActiveSequence && centralSequence ? 'workbench' : 'explorer')
  );
  const [initialPipeline, setInitialPipeline] = useState<string | undefined>(
    initialWorkbenchData?.pipeline || undefined
  );
  const [initialAnalysisResult, setInitialAnalysisResult] = useState<any>(
    initialWorkbenchData?.savedResults || undefined
  );

  const sequenceValidation = useMemo(() => {
    if (!activeSequence) return null;
    const targetType = (centralSequenceType as any) || (sourceMetadata?.sequenceType as any) || (sourceMetadata?.sequence_type as any);
    return validateBiologicalSequence(activeSequence, targetType);
  }, [activeSequence, centralSequenceType, sourceMetadata?.sequenceType, sourceMetadata?.sequence_type]);

  const loadedInitialDataRef = useRef<any>(null);
  useEffect(() => {
    if (initialWorkbenchData?.sequence && initialWorkbenchData !== loadedInitialDataRef.current) {
      loadedInitialDataRef.current = initialWorkbenchData;
      setInitialPipeline(initialWorkbenchData.pipeline);
      setInitialAnalysisResult(initialWorkbenchData.savedResults);
      centralLoadSequence(
        initialWorkbenchData.sequence,
        initialWorkbenchData.metadata,
        initialWorkbenchData.savedResults,
        initialWorkbenchData.pipeline
      );
      setViewMode('workbench');
    } else if (!centralSequence && !hasActiveSequence && !initialWorkbenchData) {
      setViewMode('explorer');
    }
  }, [initialWorkbenchData, centralSequence, hasActiveSequence, centralLoadSequence]);

  const handleOpenWorkbench = async (
    initialSeq: string = '',
    identifierOrMeta?: string | SequenceSourceMetadata,
    pipeline?: string,
    savedResults?: any
  ) => {
    let metaObj: Partial<SequenceSourceMetadata> | undefined = undefined;
    if (identifierOrMeta) {
      if (typeof identifierOrMeta === 'string') {
        metaObj = { accession: identifierOrMeta };
      } else {
        metaObj = identifierOrMeta;
      }
    }

    if (pipeline) {
      setInitialPipeline(pipeline);
    }
    if (savedResults) {
      setInitialAnalysisResult(savedResults);
    }

    if (initialSeq && initialSeq.trim().length > 0) {
      centralLoadSequence(initialSeq, metaObj, savedResults, pipeline);
    } else if (metaObj?.accession) {
      // If opened with an accession without pre-loaded sequence, load via shared loader
      await loadTarget({
        accession: metaObj.accession,
        source: metaObj.database === 'NCBI' ? 'NCBI' : 'AUTO',
        sequenceType: (metaObj.sequenceType as any) || 'AUTO',
        definition: metaObj.title,
        organism: metaObj.organism,
        metadata: metaObj
      });
    }

    setViewMode('workbench');
  };

  const handleBackToExplorer = () => {
    setViewMode('explorer');
  };

  const handleCloseWorkspace = () => {
    // 1. Clear active sequence and working in-memory state in context & localStorage
    clearActiveSequence();

    // 2. Clear local pipeline and results state
    setInitialPipeline(undefined);
    setInitialAnalysisResult(undefined);

    // 3. Clear query parameters if any (without full page reload, staying on /sequence-analysis)
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/sequence-analysis');
    }

    // 4. Navigate directly to Biological Data Explorer
    setViewMode('explorer');
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-[#F8FAFC]">
      {/* Top Mode Switcher Bar */}
      <div className="h-12 border-b border-[#E2E8F0] bg-white px-6 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('explorer')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${
              viewMode === 'explorer'
                ? 'bg-[rgba(56,189,248,0.12)] text-[#0284C7] border border-[#38BDF8]/30 font-semibold shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] border border-transparent'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Biological Data Explorer</span>
          </button>

          {hasActiveTarget && (
            <>
              <span className="text-[#CBD5E1]">/</span>

              <div className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setViewMode('workbench')}
                  className={`px-3 py-1.5 rounded-l-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${
                    viewMode === 'workbench'
                      ? 'bg-[rgba(56,189,248,0.12)] text-[#0284C7] border border-[#38BDF8]/30 border-r-0 font-semibold shadow-xs'
                      : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] border border-transparent'
                  }`}
                >
                  <Dna className="w-3.5 h-3.5" />
                  <span>Sequence Analysis Workbench</span>
                  {activeSequence && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] animate-pulse" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCloseWorkspace}
                  title="Close Workspace / Clear Active Target"
                  className={`px-2 py-1.5 rounded-r-lg text-xs transition-all flex items-center justify-center cursor-pointer ${
                    viewMode === 'workbench'
                      ? 'bg-[rgba(56,189,248,0.12)] text-[#64748B] hover:text-rose-600 hover:bg-rose-50 border border-[#38BDF8]/30 border-l-0'
                      : 'text-[#94A3B8] hover:text-rose-600 hover:bg-[#F1F5F9] border border-transparent'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {sequenceValidation && !sequenceValidation.isValid && viewMode === 'workbench' && (
            <span className="text-[11px] font-mono text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 font-semibold flex items-center gap-1 shadow-2xs">
              <ShieldAlert className="w-3 h-3 text-rose-600" />
              <span>{sequenceValidation.totalInvalidCount} invalid character(s) flagged</span>
            </span>
          )}

          {sequenceValidation && sequenceValidation.isValid && viewMode === 'workbench' && activeSequence && (
            <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold flex items-center gap-1 shadow-2xs">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>{sequenceValidation.targetType} Validated</span>
            </span>
          )}

          {sourceIdentifier && viewMode === 'workbench' && (
            <span className="text-[11px] font-mono text-[#0284C7] bg-[rgba(56,189,248,0.12)] px-2 py-0.5 rounded border border-[#38BDF8]/30 truncate max-w-xs font-semibold">
              Loaded: {sourceIdentifier}
            </span>
          )}
          <span className="text-[11px] font-mono text-[#94A3B8] hidden sm:inline-block">
            BioCode Studio Intelligence Router
          </span>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'explorer' || !hasActiveTarget ? (
          <BiologicalDataExplorer
            onOpenWorkbench={(seq, meta) => handleOpenWorkbench(seq, meta)}
          />
        ) : (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <SequenceWorkbench
              user={user}
              initialSequence={activeSequence}
              sourceMetadata={sourceMetadata}
              initialPipeline={initialPipeline}
              initialAnalysisResult={initialAnalysisResult}
              currentProjectId={initialWorkbenchData?.projectId}
              currentSequenceId={initialWorkbenchData?.sequenceId}
              onBackToExplorer={handleBackToExplorer}
              onOpenAiWithContext={onOpenAiWithContext}
            />
          </div>
        )}
      </div>
    </div>
  );
};
