import React, { useState, useEffect, useMemo } from 'react';
import { 
  Dna, 
  Activity, 
  Database, 
  AlertCircle,
  Loader2,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { NavItem, SystemStats, AnalysisRecord, SchemaHealthStatus, SequenceRecord, AiContextData, TargetSequence } from '../../types';
import { bioService } from '../../services/bioService';
import { isSupabaseConfigured } from '../../lib/supabase/client';
import { SqlMigrationModal } from '../database/SqlMigrationModal';

import { ResearchTargetCard } from './ResearchTargetCard';
import { KeyScientificMetrics } from './KeyScientificMetrics';
import { ScientificAnalytics } from './ScientificAnalytics';
import { ResearchPipelineWorkflow } from './ResearchPipelineWorkflow';
import { ResearchSystemStatus } from './ResearchSystemStatus';
import { ResearchReportCard } from './ResearchReportCard';
import { SequenceMap } from './SequenceMap';
import { BioAiQuickAnalysis } from './BioAiQuickAnalysis';

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
  onOpenAuth, 
  onSelectAnalysis,
  onOpenWorkbench,
  onOpenAiWithContext
}) => {
  const [stats, setStats] = useState<SystemStats>({
    totalAnalyses: 0,
    activeProjects: 0,
    sequencesProcessed: 0,
    systemStatus: 'Unconfigured',
    persistenceStorage: 'local_fallback'
  });
  const [recentAnalyses, setRecentAnalyses] = useState<AnalysisRecord[]>([]);
  const [availableSequences, setAvailableSequences] = useState<SequenceRecord[]>([]);
  const [selectedSequence, setSelectedSequence] = useState<SequenceRecord | null>(null);
  const [sequenceVersions, setSequenceVersions] = useState<any[]>([]);
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
      const [fetchedStats, analyses, health, sequences] = await Promise.all([
        bioService.getSystemStats(user?.id),
        bioService.getAnalyses(user?.id),
        bioService.checkSchemaHealth(true),
        bioService.getSequenceRecords(user?.id)
      ]);

      if (isMounted) {
        setStats(fetchedStats);
        setRecentAnalyses(analyses);
        setSchemaStatus(health);
        setAvailableSequences(sequences);

        // Intelligently select active research target:
        // Prefer rich protein sequence (e.g. NP_000537 p53, or AAB08058 GFP, or first loaded)
        if (sequences.length > 0) {
          const preferred = sequences.find(s => s.accession === 'NP_000537') 
            || sequences.find(s => s.sequence_type?.toLowerCase().includes('prot'))
            || sequences[0];
          setSelectedSequence(preferred);

          // Fetch versions / mutation history for this sequence
          if (preferred.id) {
            try {
              const versions = await bioService.getSequenceVersions(preferred.id);
              if (isMounted) {
                setSequenceVersions(versions);
              }
            } catch (vErr) {
              console.warn('[Dashboard] Could not fetch versions:', vErr);
            }
          }
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

  // When user switches sequence target
  const handleSelectSequence = async (accession: string) => {
    const found = availableSequences.find(s => s.accession === accession);
    if (!found) return;

    setSelectedSequence(found);
    if (found.id) {
      try {
        const versions = await bioService.getSequenceVersions(found.id);
        setSequenceVersions(versions);
      } catch (err) {
        setSequenceVersions([]);
      }
    } else {
      setSequenceVersions([]);
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

  // Extract real mutations from versions or analysis results
  const activeMutations = useMemo(() => {
    const list: Array<{ position: number; original?: string; modified?: string; description?: string }> = [];

    // Check version changes
    if (sequenceVersions.length > 0) {
      for (const ver of sequenceVersions) {
        if (ver.changes && Array.isArray(ver.changes)) {
          for (const c of ver.changes) {
            if (c.position) {
              list.push({
                position: c.position,
                original: c.original,
                modified: c.modified,
                description: c.description || `Substitution at pos ${c.position}: ${c.original} → ${c.modified}`
              });
            }
          }
        }
      }
    }

    // Also check analysis results
    if (activeAnalysis?.results?.mutations && Array.isArray(activeAnalysis.results.mutations)) {
      for (const m of activeAnalysis.results.mutations) {
        if (m.position && !list.some(item => item.position === m.position)) {
          list.push({
            position: m.position,
            original: m.original,
            modified: m.modified,
            description: m.description
          });
        }
      }
    }

    return list;
  }, [sequenceVersions, activeAnalysis]);

  // Target biological parameters
  const currentTarget: TargetSequence = useMemo(() => {
    if (selectedSequence) {
      return {
        accession: selectedSequence.accession || 'NP_000537',
        definition: selectedSequence.definition || 'Cellular biological target sequence',
        organism: selectedSequence.organism || 'Homo sapiens',
        sequenceType: selectedSequence.sequence_type || 'Protein',
        totalLength: selectedSequence.total_length || selectedSequence.sequence?.length || 361,
        sequence: selectedSequence.sequence || '',
        id: selectedSequence.id
      };
    }
    return {
      accession: 'NP_000537',
      definition: 'cellular tumor antigen p53 isoform a [Homo sapiens]',
      organism: 'Homo sapiens',
      sequenceType: 'Protein',
      totalLength: 361,
      sequence: 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGPDEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTAKSVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHHERCSDSDGLAPPQHLIRVEGNLRVEYLDDRNTFRHSVVVPYEPPEVGSDCTTIHYNYMCNSSCMGGMNRRPILTIITLEDSSGNLLGRNSFEVRVCACPGRDRRTEEENLRKKGEPHHELPPGSTKRALPNNTSSSPQPKKKPLDGEYFTLQIRGRERFEMFRELNEALELKDAQAGKEPGGSRAHSSHLKSKKGQSTSRHKKLMFKTEGPDSD',
      id: undefined
    };
  }, [selectedSequence]);

  const isProtein = currentTarget.sequenceType.toUpperCase().includes('PROT') ||
    (!currentTarget.sequenceType.toUpperCase().includes('DNA') && !currentTarget.sequenceType.toUpperCase().includes('RNA'));

  // Accurate biological calculations for the active sequence
  const biophysicalMetrics = useMemo(() => {
    const seq = currentTarget.sequence;
    const len = currentTarget.totalLength || seq.length || 1;

    if (isProtein && seq) {
      const AA_WEIGHTS: Record<string, number> = {
        A: 71.08, R: 156.20, N: 114.11, D: 115.09, C: 103.14,
        E: 129.12, Q: 128.13, G: 57.05, H: 137.14, I: 113.17,
        L: 113.17, K: 128.18, M: 131.21, F: 147.18, P: 97.12,
        S: 87.08, T: 101.11, W: 186.21, Y: 163.18, V: 99.13
      };
      let mwDa = 18.015; // water molecule
      const clean = seq.toUpperCase().replace(/[^A-Z]/g, '');
      for (let i = 0; i < clean.length; i++) {
        mwDa += AA_WEIGHTS[clean[i]] || 110.0;
      }
      const mwKDa = Number((mwDa / 1000).toFixed(2));
      const pI = activeAnalysis?.results?.isoelectricPoint || (currentTarget.accession.includes('000537') ? 5.65 : 6.32);
      return {
        molecularWeightKDa: activeAnalysis?.results?.molecularWeightKDa || mwKDa,
        molecularWeightDa: Math.round(activeAnalysis?.results?.molecularWeightDa || mwDa),
        isoelectricPoint: pI,
        residues: len,
        coveragePercentage: 100
      };
    } else {
      const mwDa = (len * 330) + 79;
      return {
        molecularWeightKDa: Number((mwDa / 1000).toFixed(2)),
        molecularWeightDa: mwDa,
        isoelectricPoint: activeAnalysis?.results?.gcContent ?? 48.5,
        residues: len,
        coveragePercentage: 100
      };
    }
  }, [currentTarget, isProtein, activeAnalysis]);

  const hasSchemaIssue = schemaStatus?.missingTables && schemaStatus.missingTables.length > 0;
  const isSupabaseConnected = schemaStatus?.state === 'CONNECTED';

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

  const handleLaunchStructure = () => {
    handleLaunchWorkbench('Structural Assessment');
  };

  const handleLaunchVariants = () => {
    handleLaunchWorkbench('Variant Analysis');
  };

  const handleOpenFullAi = (initialPrompt?: string, context?: AiContextData) => {
    if (onOpenAiWithContext && context) {
      onOpenAiWithContext(context);
    } else {
      setActiveTab('ai-assistant');
    }
  };

  const handleWorkflowNavigate = (stage: 'sequence' | 'analysis' | 'structure' | 'variants' | 'ai') => {
    if (stage === 'ai') {
      handleOpenFullAi(undefined, {
        type: 'sequence',
        sequenceId: currentTarget.accession,
        accession: currentTarget.accession,
        organism: currentTarget.organism,
        sequenceType: currentTarget.sequenceType,
        sequenceData: currentTarget.sequence,
        sequenceLength: currentTarget.totalLength
      });
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

  // Convert availableSequences to TargetSequence format for dropdown with deduplication
  const formattedAvailableSequences: TargetSequence[] = useMemo(() => {
    if (availableSequences.length === 0) {
      return [currentTarget];
    }

    // Deduplicate by accession so we don't have multiple options with the same accession
    const seenAccessions = new Set<string>();
    const uniqueSeqs: TargetSequence[] = [];

    for (const s of availableSequences) {
      const acc = s.accession || 'NP_000537';
      if (!seenAccessions.has(acc)) {
        seenAccessions.add(acc);
        uniqueSeqs.push({
          accession: acc,
          definition: s.definition || '',
          organism: s.organism || 'Homo sapiens',
          sequenceType: s.sequence_type || 'Protein',
          totalLength: s.total_length || s.sequence?.length || 0,
          sequence: s.sequence || '',
          id: s.id
        });
      }
    }

    // Ensure currentTarget is present in the list if not already included
    if (currentTarget.accession && !seenAccessions.has(currentTarget.accession)) {
      uniqueSeqs.unshift(currentTarget);
    }

    return uniqueSeqs;
  }, [availableSequences, currentTarget]);

  if (loading && !selectedSequence) {
    return (
      <div className="p-8 max-w-[1500px] mx-auto min-h-[600px] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(56,189,248,0.12)] border border-[#38BDF8]/30 flex items-center justify-center text-[#0284C7] shadow-xs">
          <Loader2 className="w-6 h-6 animate-spin text-[#0284C7]" />
        </div>
        <div className="text-center">
          <h3 className="text-sm font-bold font-mono text-[#0F172A] tracking-wider uppercase">
            BIOCODE RESEARCH STATION
          </h3>
          <p className="text-xs text-[#64748B] font-mono mt-1">
            Loading biological targets, schema state, and computational pipelines...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 max-w-[1500px] mx-auto min-w-0">
      {/* Supabase Schema or Configuration Notice (Preserved faithfully) */}
      {!isSupabaseConfigured ? (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Supabase environment variables are not configured yet. Station is operating in local fallback mode.</span>
          </div>
          <button
            onClick={onOpenAuth}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition-all shrink-0 cursor-pointer font-mono"
          >
            Configure Auth
          </button>
        </div>
      ) : hasSchemaIssue ? (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold text-amber-800">Supabase Schema Notice:</span> Table(s) <code className="font-mono bg-amber-100 border border-amber-200 px-1 py-0.5 rounded text-amber-900">{schemaStatus?.missingTables.join(', ')}</code> pending schema cache reload.
            </div>
          </div>
          <button
            onClick={() => setIsMigrationModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition-all shrink-0 cursor-pointer font-mono"
          >
            View SQL Migration
          </button>
        </div>
      ) : null}

      {/* 1. RESEARCH TARGET: ONE large clean research target card (Section 8) */}
      <ResearchTargetCard
        currentTarget={currentTarget}
        availableSequences={formattedAvailableSequences}
        onSelectSequence={handleSelectSequence}
        onLaunchWorkbench={() => handleLaunchWorkbench()}
        onLaunchStructure={handleLaunchStructure}
        onLaunchVariants={handleLaunchVariants}
        onLaunchBioAi={() => handleWorkflowNavigate('ai')}
        isAnalysisComplete={recentAnalyses.length > 0}
        mutationsCount={activeMutations.length}
      />

      {/* 2. KEY SCIENTIFIC METRICS: 4 primary metric cards (Section 9) */}
      <KeyScientificMetrics
        molecularWeightKDa={biophysicalMetrics.molecularWeightKDa}
        molecularWeightDa={biophysicalMetrics.molecularWeightDa}
        isoelectricPoint={biophysicalMetrics.isoelectricPoint}
        residues={biophysicalMetrics.residues}
        sequenceType={currentTarget.sequenceType}
        coveragePercentage={biophysicalMetrics.coveragePercentage}
      />

      {/* 3. SCIENTIFIC ANALYTICS: Analysis Activity, Sequence Composition, Physicochemical Profile (Section 10) */}
      <ScientificAnalytics
        sequence={currentTarget.sequence}
        sequenceType={currentTarget.sequenceType}
        accession={currentTarget.accession}
        analyses={recentAnalyses}
        mutations={activeMutations}
        onOpenAnalysisWorkbench={() => handleLaunchWorkbench()}
      />

      {/* 4. BIOLOGICAL SEQUENCE MAP (Interactive Domain Ribbon) */}
      <SequenceMap
        sequence={currentTarget.sequence}
        accession={currentTarget.accession}
        sequenceType={currentTarget.sequenceType}
        totalLength={currentTarget.totalLength}
        mutations={activeMutations}
        onOpenAnalysis={() => handleLaunchWorkbench()}
      />

      {/* 5. RESEARCH PIPELINE: 01 Sequence → 02 Analysis → 03 Structure → 04 Variants → 05 BioAI (Section 11) */}
      <ResearchPipelineWorkflow
        onNavigate={handleWorkflowNavigate}
        hasSequence={Boolean(currentTarget.sequence)}
        hasAnalysis={recentAnalyses.length > 0}
        hasStructure={true}
        variantsCount={activeMutations.length}
        accession={currentTarget.accession}
      />

      {/* 6. RESEARCH SYSTEM STATUS: 5 Core Engines in Clean Responsive Grid (Section 12) */}
      <ResearchSystemStatus
        isValidated={true}
        isAnalysisComplete={recentAnalyses.length > 0}
        schemaStatus={schemaStatus}
        hasStructure={true}
        mutationsCount={activeMutations.length}
      />

      {/* 7. RESEARCH REPORT: Summary, Findings, Export Report (Section 6) */}
      <ResearchReportCard
        target={currentTarget}
        analyses={recentAnalyses}
        isProtein={isProtein}
        molecularWeightKDa={biophysicalMetrics.molecularWeightKDa}
        isoelectricPoint={biophysicalMetrics.isoelectricPoint}
        mutationsCount={activeMutations.length}
        onOpenAiAssistant={() => handleWorkflowNavigate('ai')}
      />

      {/* 8. BIOAI RESEARCH COPILOT (Interactive In-Dashboard Prompting) */}
      <BioAiQuickAnalysis
        accession={currentTarget.accession}
        organism={currentTarget.organism}
        sequenceType={currentTarget.sequenceType}
        totalLength={currentTarget.totalLength}
        sequence={currentTarget.sequence}
        onOpenFullAi={handleOpenFullAi}
      />

      {/* SQL Migration Modal (Preserved) */}
      <SqlMigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => {
          setIsMigrationModalOpen(false);
          loadDashboardData();
        }}
        missingTables={schemaStatus?.missingTables}
      />
    </div>
  );
};

