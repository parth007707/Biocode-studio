import React, { useState, useEffect } from 'react';
import { BiologicalDataExplorer } from './explorer/BiologicalDataExplorer';
import { SequenceWorkbench } from './SequenceWorkbench';
import { Database, Dna, ArrowLeft, Globe, Terminal, Sparkles } from 'lucide-react';
import { SequenceSourceMetadata } from '../../services/adapters/types';

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
  const [viewMode, setViewMode] = useState<'explorer' | 'workbench'>(
    initialWorkbenchData?.sequence ? 'workbench' : 'explorer'
  );
  const [activeSequence, setActiveSequence] = useState<string>(initialWorkbenchData?.sequence || '');
  const [sourceIdentifier, setSourceIdentifier] = useState<string | null>(
    initialWorkbenchData?.metadata?.accession || null
  );
  const [sourceMetadata, setSourceMetadata] = useState<SequenceSourceMetadata | undefined>(
    initialWorkbenchData?.metadata || undefined
  );
  const [initialPipeline, setInitialPipeline] = useState<string | undefined>(
    initialWorkbenchData?.pipeline || undefined
  );
  const [initialAnalysisResult, setInitialAnalysisResult] = useState<any>(
    initialWorkbenchData?.savedResults || undefined
  );

  useEffect(() => {
    if (initialWorkbenchData?.sequence) {
      setActiveSequence(initialWorkbenchData.sequence);
      setSourceMetadata(initialWorkbenchData.metadata);
      setSourceIdentifier(initialWorkbenchData.metadata?.accession || 'Imported Sequence');
      setInitialPipeline(initialWorkbenchData.pipeline);
      setInitialAnalysisResult(initialWorkbenchData.savedResults);
      setViewMode('workbench');
    }
  }, [initialWorkbenchData]);

  const handleOpenWorkbench = (
    initialSeq: string = '',
    identifierOrMeta?: string | SequenceSourceMetadata,
    pipeline?: string,
    savedResults?: any
  ) => {
    if (initialSeq) {
      setActiveSequence(initialSeq);
    }
    if (pipeline) {
      setInitialPipeline(pipeline);
    }
    if (savedResults) {
      setInitialAnalysisResult(savedResults);
    }
    if (identifierOrMeta) {
      if (typeof identifierOrMeta === 'string') {
        setSourceIdentifier(identifierOrMeta);
        setSourceMetadata(undefined);
      } else {
        setSourceMetadata(identifierOrMeta);
        setSourceIdentifier(
          identifierOrMeta.isPartialRange
            ? `${identifierOrMeta.accession} (Range: ${identifierOrMeta.rangeStart?.toLocaleString()}..${identifierOrMeta.rangeEnd?.toLocaleString()})`
            : identifierOrMeta.accession
        );
      }
    } else {
      setSourceIdentifier(null);
      setSourceMetadata(undefined);
    }
    setViewMode('workbench');
  };

  const handleBackToExplorer = () => {
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

          <span className="text-[#CBD5E1]">/</span>

          <button
            type="button"
            onClick={() => setViewMode('workbench')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${
              viewMode === 'workbench'
                ? 'bg-[rgba(56,189,248,0.12)] text-[#0284C7] border border-[#38BDF8]/30 font-semibold shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] border border-transparent'
            }`}
          >
            <Dna className="w-3.5 h-3.5" />
            <span>Sequence Analysis Workbench</span>
            {activeSequence && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] animate-pulse" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-3">
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
        {viewMode === 'explorer' ? (
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
