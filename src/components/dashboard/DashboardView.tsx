import React, { useState, useEffect, useMemo } from 'react';
import { 
  Loader2,
  Terminal,
  CheckCircle2,
} from 'lucide-react';
import { NavItem, AnalysisRecord, SchemaHealthStatus, SequenceRecord, AiContextData, TargetSequence } from '../../types';
import { bioService } from '../../services/bioService';
import { isSupabaseConfigured } from '../../lib/supabase/client';
import { SqlMigrationModal } from '../database/SqlMigrationModal';
import { useBioSequence } from '../../context/BioSequenceContext';

import { WorkspaceHeroSection } from './WorkspaceHeroSection';
import { QuickResearchActions } from './QuickResearchActions';
import { ActiveResearchWorkspace } from './ActiveResearchWorkspace';
import { RecentResearchActivity } from './RecentResearchActivity';

interface DashboardViewProps {
  setActiveTab: (tab: NavItem) => void;
  user: any;
  onOpenAuth: () => void;
  onSelectAnalysis?: (id: string) => void;
  onOpenWorkbench?: (
    sequence: string,
    metadata?: any,
    pipeline?: string,
    savedResults?: any,
    projectId?: string,
    sequenceId?: string
  ) => void;
  onOpenAiWithContext?: (context: AiContextData) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ 
  setActiveTab, 
  user, 
  onSelectAnalysis,
  onOpenWorkbench,
  onOpenAiWithContext
}) => {
  const [recentAnalyses, setRecentAnalyses] = useState<AnalysisRecord[]>([]);
  const [availableSequences, setAvailableSequences] = useState<SequenceRecord[]>([]);
  const [selectedSequence, setSelectedSequence] = useState<SequenceRecord | null>(null);
  const [schemaStatus, setSchemaStatus] = useState<SchemaHealthStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    loadDashboardData(isMounted);
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const loadDashboardData = async (isMounted: boolean = true) => {
    setLoading(true);
    try {
      const [analyses, health, sequences] = await Promise.all([
        bioService.getAnalyses(user?.id),
        bioService.checkSchemaHealth(true),
        bioService.getSequenceRecords(user?.id)
      ]);

      if (isMounted) {
        setRecentAnalyses(analyses);
        setSchemaStatus(health);
        setAvailableSequences(sequences);

        if (sequences.length > 0) {
          const preferred = sequences.find(s => s.accession === 'NP_000537') 
            || sequences.find(s => s.sequence_type?.toLowerCase().includes('prot'))
            || sequences[0];
          setSelectedSequence(preferred);
        }
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  };

  const {
    accession: centralAccession,
    definition: centralDefinition,
    organism: centralOrganism,
    sequence: centralSequence,
    sequenceType: centralSequenceType,
    length: centralLength,
    loadSequence: centralLoadSequence
  } = useBioSequence();

  const handleSelectSequence = (seq: SequenceRecord) => {
    setSelectedSequence(seq);
    if (seq.sequence) {
      centralLoadSequence(seq.sequence, {
        accession: seq.accession,
        definition: seq.definition || '',
        organism: seq.organism || '',
        sequenceType: seq.sequence_type || 'PROTEIN',
        id: seq.id
      });
    }
  };

  // Find matching analysis for the active sequence
  const activeAnalysis = useMemo(() => {
    if (!selectedSequence) return recentAnalyses[0] || null;
    return recentAnalyses.find(
      a => a.sequence_record?.accession === selectedSequence.accession ||
           a.sequence_record?.id === selectedSequence.id
    ) || null;
  }, [selectedSequence, recentAnalyses]);

  // Target biological parameters synchronized with Central BioSequence Store
  const currentTarget: TargetSequence = useMemo(() => {
    return {
      accession: centralAccession || selectedSequence?.accession || 'NP_000537',
      definition: centralDefinition || selectedSequence?.definition || 'Cellular biological target sequence',
      organism: centralOrganism || selectedSequence?.organism || 'Homo sapiens',
      sequenceType: centralSequenceType || selectedSequence?.sequence_type || 'Protein',
      totalLength: centralLength || selectedSequence?.total_length || 393,
      sequence: centralSequence || selectedSequence?.sequence || 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGPDEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTAKSVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHHERCSDSDGLAPPQHLIRVEGNLRVEYLDDRNTFRHSVVVPYEPPEVGSDCTTIHYNYMCNSSCMGGMNRRPILTIITLEDSSGNLLGRNSFEVRVCACPGRDRRTEEENLRKKGEPHHELPPGSTKRALPNNTSSSPQPKKKPLDGEYFTLQIRGRERFEMFRELNEALELKDAQAGKEPGGSRAHSSHLKSKKGQSTSRHKKLMFKTEGPDSD',
      id: selectedSequence?.id || 'central_target'
    };
  }, [centralAccession, centralDefinition, centralOrganism, centralSequenceType, centralLength, centralSequence, selectedSequence]);

  // Navigation handlers
  const handleLaunchWorkbench = (pipeline?: string) => {
    if (onOpenWorkbench) {
      onOpenWorkbench(
        currentTarget.sequence,
        {
          accession: currentTarget.accession,
          organism: currentTarget.organism,
          definition: currentTarget.definition,
          sequenceType: currentTarget.sequenceType
        },
        pipeline || 'Amino Acid Composition & Charge',
        activeAnalysis?.results,
        undefined,
        currentTarget.id
      );
    } else {
      setActiveTab('analysis');
    }
  };

  const handleOpenFullAi = () => {
    if (onOpenAiWithContext) {
      onOpenAiWithContext({
        type: 'sequence',
        sequenceId: currentTarget.accession,
        accession: currentTarget.accession,
        organism: currentTarget.organism,
        sequenceType: currentTarget.sequenceType,
        sequenceData: currentTarget.sequence,
        sequenceLength: currentTarget.totalLength
      });
    } else {
      setActiveTab('ai-assistant');
    }
  };

  const handleWorkflowNavigate = (stage: 'sequence' | 'analysis' | 'structure' | 'variants' | 'ai') => {
    if (stage === 'ai') {
      handleOpenFullAi();
      return;
    }

    const pipelineMap: Record<string, string> = {
      sequence: 'Sequence Verification',
      analysis: 'Amino Acid Composition & Charge',
      structure: 'Structural Assessment',
      variants: 'Variant Analysis'
    };

    handleLaunchWorkbench(pipelineMap[stage]);
  };

  if (loading && recentAnalyses.length === 0) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center space-y-4 bg-scientific-grid">
        <div className="w-12 h-12 rounded-2xl bg-white border border-sky-200 flex items-center justify-center text-sky-600 shadow-sm">
          <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-mono font-bold text-slate-800">Loading Research Workspace...</p>
          <p className="text-xs text-slate-500 font-mono">Synchronizing biological targets &amp; active analyses</p>
        </div>
      </div>
    );
  }

  const isConnected = schemaStatus?.connected ?? isSupabaseConfigured;

  return (
    <div className="min-h-full bg-scientific-grid text-slate-900">
      {/* Maximum 1400px Centered Content Container */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 py-6 space-y-7">
        
        {/* ======================================================== */}
        {/* 1. TOP HEADER / STATUS BAR                               */}
        {/* ======================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse shadow-xs shrink-0" />
              <h1 className="text-2xl sm:text-3xl font-[700] font-display tracking-tight text-slate-900">
                Bio<span className="text-sky-600">Code Studio</span>
              </h1>
            </div>
            <div className="text-xs sm:text-sm font-[600] text-sky-700 font-sans tracking-wide">
              Research Command Center
            </div>
            <p className="text-xs sm:text-sm text-slate-600 font-sans font-[400] max-w-2xl">
              Computational biology workspace for sequence analysis, structure exploration and AI-assisted research.
            </p>
          </div>

          {/* Compact Top-Right Controls */}
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap font-sans text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 font-[600] shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isConnected ? 'Supabase Connected' : 'Database Ready'}</span>
            </span>

            <button
              type="button"
              onClick={() => setIsMigrationModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 font-[600] transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-[0.99]"
              title="Open Database Health & Migration Diagnostics"
            >
              <Terminal className="w-3.5 h-3.5 text-sky-600" />
              <span>DB Logs</span>
            </button>

            <span className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-200 text-[11px] font-[600] hidden md:inline shadow-2xs">
              Research Session: Active
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. HERO SECTION — COMPUTATIONAL BIOLOGY WORKSPACE       */}
        {/* ======================================================== */}
        <WorkspaceHeroSection
          onStartAnalysis={() => handleLaunchWorkbench()}
          onAskBioAi={handleOpenFullAi}
          onExploreSequence={() => setActiveTab('analysis')}
          currentTarget={currentTarget}
        />

        {/* ======================================================== */}
        {/* 3. ACTIVE RESEARCH TARGET — CLEAN HORIZONTAL SECTION     */}
        {/* ======================================================== */}
        <ActiveResearchWorkspace
          currentTarget={currentTarget}
          availableSequences={availableSequences}
          onSelectSequence={handleSelectSequence}
          onContinueAnalysis={() => handleLaunchWorkbench()}
          onOpenStructure={() => handleWorkflowNavigate('structure')}
          onAskBioAi={handleOpenFullAi}
        />

        {/* ======================================================== */}
        {/* 4. QUICK ACTIONS — 4 VISUALLY DISTINCT COMPUTATIONAL ENGINES */}
        {/* ======================================================== */}
        <QuickResearchActions
          onOpenSequenceAnalysis={() => handleLaunchWorkbench()}
          onOpenStructureExplorer={() => handleWorkflowNavigate('structure')}
          onOpenBioAi={handleOpenFullAi}
          onOpenDatabaseExplorer={() => setActiveTab('analysis')}
        />

        {/* ======================================================== */}
        {/* 5. RECENT RESEARCH — REAL ACTIVITIES + VELOCITY CHART    */}
        {/* ======================================================== */}
        <RecentResearchActivity
          analyses={recentAnalyses}
          onSelectAnalysis={(id) => {
            if (onSelectAnalysis) {
              onSelectAnalysis(id);
            } else {
              setActiveTab('history');
            }
          }}
          onViewAllHistory={() => setActiveTab('history')}
        />

      </div>

      {/* SQL Migration & Diagnostic Modal */}
      <SqlMigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
        missingTables={schemaStatus?.missingTables}
      />
    </div>
  );
};
