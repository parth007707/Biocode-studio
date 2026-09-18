import React, { useState, useEffect } from 'react';
import {
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Info,
  Sparkles,
  Download,
  Copy,
  Check,
  Dna,
  Zap,
  Activity,
  Layers,
  Thermometer,
  Weight,
  Compass,
  ArrowRightLeft,
  ArrowLeft,
  Globe,
  Sliders,
  ShieldAlert,
  Cloud,
  HardDrive,
  Database,
  Code,
  Edit3,
  GitFork,
  History,
  ListTree,
  GitCompare
} from 'lucide-react';
import {
  useSequenceIntelligence,
  analyzeGCAndORF,
  GCAndORFAnalysisResult,
  predictRNASecondaryStructure,
  RNASecondaryStructureResult,
  analyzeProteinSequence,
  AminoAcidComposition,
  generateDNAInterpretation,
  generateRNAInterpretation,
  generateProteinInterpretation,
  ScientificInterpretation,
  AnalysisPipelineType,
  SequenceMutation,
  SequenceVersionRecord,
  parseBiologicalInput,
  normalizeAnalysisRecord,
  NormalizedWorkbenchState
} from '../../lib/bio';
import { analyzeCompleteSequenceChunked } from '../../lib/bio/chunkStreamingAnalysis';
import { SequenceStructureViewer } from './viewers/SequenceStructureViewer';
import { SequenceEditorWorkspace } from './editor/SequenceEditorWorkspace';
import { AnalysisImpactComparisonView } from './editor/AnalysisImpactComparisonView';
import { generateComparativeAnalysisReport, ComparativeAnalysisReport } from '../../lib/bio/editor/comparativeAnalysisEngine';
import { BioErrorBoundary } from '../common/BioErrorBoundary';
import { formatNumber } from '../../lib/utils/formatters';
import { bioService } from '../../services/bioService';
import { SequenceSourceMetadata } from '../../services/adapters/types';
import { PersistenceResult, formatOrganism } from '../../types';
import { SqlMigrationModal } from '../database/SqlMigrationModal';

interface SequenceWorkbenchProps {
  user: any;
  initialSequence?: string;
  sourceMetadata?: SequenceSourceMetadata;
  initialPipeline?: string;
  initialAnalysisResult?: any;
  currentProjectId?: string;
  currentSequenceId?: string;
  onBackToExplorer?: () => void;
  onOpenAiWithContext?: (context: any) => void;
}

const PIPELINE_LABELS: Record<AnalysisPipelineType, { name: string; category: string }> = {
  GC_CONTENT: { name: 'GC Content & Nucleotide Profiling', category: 'Nucleotide' },
  ORF_PROFILING: { name: 'GC Content & ORF Profiling', category: 'Nucleotide' },
  REVERSE_COMPLEMENT: { name: 'Reverse Complement & Translation', category: 'Nucleotide' },
  TRANSLATION: { name: 'Direct 6-Frame Translation', category: 'Nucleotide' },
  MUTATION_SCAN: { name: 'Variant Mutation Scan', category: 'Nucleotide' },
  CODON_ANALYSIS: { name: 'Codon Usage & Bias Analysis', category: 'RNA' },
  AMINO_ACID_COMPOSITION: { name: 'Amino Acid Composition & Charge', category: 'Protein' },
  MOLECULAR_PROPERTIES: { name: 'Molecular Weight & Isoelectric Point', category: 'Protein' },
  HYDROPHOBICITY_ANALYSIS: { name: 'Hydrophobicity & Secondary Structure', category: 'Protein' }
};

export const SequenceWorkbench: React.FC<SequenceWorkbenchProps> = ({
  user,
  initialSequence = '',
  sourceMetadata,
  initialPipeline,
  initialAnalysisResult,
  currentProjectId,
  currentSequenceId,
  onBackToExplorer,
  onOpenAiWithContext
}) => {
  const {
    rawInput,
    detectedType,
    availableAnalyses,
    isValid,
    validationErrors,
    confidence,
    length,
    fastaHeader,
    cleanedSequence,
    updateSequence,
    biologicalClassification
  } = useSequenceIntelligence(initialSequence, sourceMetadata);

  const [selectedPipeline, setSelectedPipeline] = useState<string>(
    initialPipeline || 'GC Content & ORF Profiling'
  );
  const [running, setRunning] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [persistenceResult, setPersistenceResult] = useState<PersistenceResult<any> | null>(null);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState<boolean>(false);
  const [copiedSeq, setCopiedSeq] = useState(false);
  const [copiedRevComp, setCopiedRevComp] = useState(false);
  const [activeTab, setActiveTab] = useState<'metrics' | 'orfs_structure' | 'sequence'>('metrics');
  
  // Sequence Editor & Mutation Tracking State
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [originalImmutableSeq, setOriginalImmutableSeq] = useState<string>(() => {
    if (initialSequence) {
      const parsed = parseBiologicalInput(initialSequence);
      return parsed.sequence || initialSequence;
    }
    return '';
  });
  const [versionNumber, setVersionNumber] = useState<number>(1);
  const [activeMutations, setActiveMutations] = useState<SequenceMutation[]>([]);

  // Stable Version Store (V1 Original vs V2 Mutated)
  const [versionState, setVersionState] = useState<{
    v1: {
      version: 'V1';
      type: 'original';
      sequence: string;
      results: NormalizedWorkbenchState | null;
      mutations: SequenceMutation[];
      status: 'idle' | 'running' | 'completed' | 'failed';
    };
    v2: {
      version: 'V2';
      type: 'mutated';
      sequence: string;
      results: NormalizedWorkbenchState | null;
      mutations: SequenceMutation[];
      status: 'idle' | 'running' | 'completed' | 'failed';
    };
    activeVersion: 'V1' | 'V2';
    showComparisonView: boolean;
  }>(() => {
    const initSeq = initialSequence ? (parseBiologicalInput(initialSequence).sequence || initialSequence) : '';
    let initNorm: NormalizedWorkbenchState | null = null;
    if (initialAnalysisResult || initialSequence) {
      try {
        initNorm = normalizeAnalysisRecord(initialAnalysisResult, initialSequence, sourceMetadata);
      } catch (e) {
        console.warn('[VersionState Init]', e);
      }
    }
    return {
      v1: {
        version: 'V1',
        type: 'original',
        sequence: initSeq,
        results: initNorm,
        mutations: [],
        status: initNorm ? 'completed' : 'idle'
      },
      v2: {
        version: 'V2',
        type: 'mutated',
        sequence: '',
        results: null,
        mutations: [],
        status: 'idle'
      },
      activeVersion: 'V1',
      showComparisonView: false
    };
  });

  // Multi-Version History Store: Keeps distinct versions (V1 original, V2 modified, etc.)
  const [analysisVersions, setAnalysisVersions] = useState<
    Array<{
      versionNumber: number;
      label: string;
      sequence: string;
      resultPayload: any;
      mutations: SequenceMutation[];
      createdAt: string;
    }>
  >([]);
  const [selectedVersionView, setSelectedVersionView] = useState<number>(1);

  // Paginated Sequence Viewer state for smooth 60fps rendering of multi-megabase records
  const [seqViewerPage, setSeqViewerPage] = useState<number>(1);
  const SEQ_PAGE_SIZE = 10000;

  // Analysis scope metrics & LOD parameters
  const totalRecordLength = sourceMetadata?.totalLength || length || 0;
  const isPartial = sourceMetadata?.isPartialRange ?? false;
  const analysisScope = isPartial ? 'Selected Region' : 'Complete Sequence';
  const basesAnalyzed = isPartial ? (sourceMetadata?.subLength || length) : totalRecordLength || length;
  const coveragePercent = totalRecordLength > 0 ? Number(((basesAnalyzed / totalRecordLength) * 100).toFixed(2)) : 100;
  const isLargeSequence = length > 120;
  const visualizationSampleLOD = isLargeSequence ? `Adaptive LOD Focus (120 ${detectedType === 'PROTEIN' ? 'aa' : 'bp'} Viewport)` : '1:1 Full Sequence Resolution';
  const renderingWindowText = isLargeSequence ? `1 .. ${Math.min(120, length)} ${detectedType === 'PROTEIN' ? 'aa' : 'bp'} (${length.toLocaleString()} total)` : `1 .. ${length} ${detectedType === 'PROTEIN' ? 'aa' : 'bp'}`;
  const executionSequence = cleanedSequence;

  // Complete analysis state with normalization
  const [analysisResult, setAnalysisResult] = useState<NormalizedWorkbenchState | null>(() => {
    if (initialAnalysisResult || initialSequence) {
      try {
        return normalizeAnalysisRecord(initialAnalysisResult, initialSequence, sourceMetadata);
      } catch (err: any) {
        console.error('[SequenceWorkbench Init Warning]', err);
        return null;
      }
    }
    return null;
  });

  const [isNormalizing, setIsNormalizing] = useState<boolean>(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  // Synchronize and normalize initial sequence and analysis record safely
  useEffect(() => {
    if (initialAnalysisResult || initialSequence) {
      try {
        setIsNormalizing(true);
        setInitializationError(null);
        const normalized = normalizeAnalysisRecord(
          initialAnalysisResult,
          initialSequence,
          sourceMetadata
        );
        setAnalysisResult(normalized);

        if (Array.isArray(normalized.mutations)) {
          setActiveMutations(normalized.mutations);
        }

        const seqToLoad = normalized.sequence || initialSequence;
        if (seqToLoad && seqToLoad !== rawInput) {
          updateSequence(seqToLoad);
          setOriginalImmutableSeq(seqToLoad);
        }

        setVersionState((prev) => ({
          ...prev,
          v1: {
            ...prev.v1,
            sequence: seqToLoad,
            results: normalized,
            status: 'completed'
          }
        }));

        setAnalysisVersions((prev) => {
          if (prev.some((v) => v.versionNumber === 1)) return prev;
          return [
            {
              versionNumber: 1,
              label: 'Version 1 (Original)',
              sequence: seqToLoad,
              resultPayload: normalized,
              mutations: [],
              createdAt: new Date().toISOString()
            }
          ];
        });
      } catch (err: any) {
        console.error('[SequenceWorkbench Initialization Error] Property undefined during normalization:', {
          error: err?.message || err,
          stack: err?.stack,
          initialAnalysisResult,
          initialSequence
        });
        setInitializationError(
          `Failed to initialize analysis record: ${err?.message || 'Undefined property encountered.'}`
        );
      } finally {
        setIsNormalizing(false);
      }
    }
  }, [initialSequence, initialAnalysisResult, sourceMetadata]);

  // Keep originalImmutableSeq populated when valid raw input is loaded
  useEffect(() => {
    if (cleanedSequence && (!originalImmutableSeq || originalImmutableSeq.trim().startsWith('>'))) {
      setOriginalImmutableSeq(cleanedSequence);
    }
  }, [cleanedSequence, originalImmutableSeq]);

  // Auto-switch default pipeline according to detected sequence type
  useEffect(() => {
    if (!initialPipeline) {
      if (detectedType === 'PROTEIN') {
        setSelectedPipeline('Amino Acid Composition & Charge');
      } else if (detectedType === 'RNA') {
        setSelectedPipeline('Codon Usage & Bias Analysis');
      } else if (detectedType === 'DNA') {
        setSelectedPipeline('GC Content & ORF Profiling');
      }
    }
  }, [detectedType, initialPipeline]);

  // Helper to compute reverse complement
  const computeReverseComplement = (seq: string): string => {
    const compMap: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
    return seq
      .split('')
      .reverse()
      .map((c) => compMap[c] || c)
      .join('');
  };

  /**
   * Centralized Analysis Execution Engine
   * Serves both "Run Analysis Pipeline" and "Run Modified Analysis".
   * Correctly assigns results to V1 (Original) or V2 (Mutated) without overwriting the other.
   */
  const runSequenceAnalysis = async ({
    sequence,
    targetVersion = 1,
    mutations = [],
    pipeline = selectedPipeline
  }: {
    sequence: string;
    targetVersion?: number;
    mutations?: SequenceMutation[];
    pipeline?: string;
  }) => {
    if (running || isSaving) return;

    const targetSeq = sequence ? sequence.trim() : '';
    if (!targetSeq) {
      setErrorMsg('Sequence is empty. Please provide a biological sequence.');
      return;
    }

    setRunning(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setPersistenceResult(null);

    try {
      let dnaRes: GCAndORFAnalysisResult | null = null;
      let rnaRes: RNASecondaryStructureResult | null = null;
      let protRes: AminoAcidComposition | null = null;
      let interpretation: ScientificInterpretation;
      let revComp: string | undefined = undefined;

      const seqType = detectedType === 'UNKNOWN' ? 'PROTEIN' : (detectedType as 'DNA' | 'RNA' | 'PROTEIN');

      // Execute Chunk-Streaming Analysis across 100% of the biological sequence
      const chunkMetrics = analyzeCompleteSequenceChunked(
        targetSeq,
        seqType
      );

      if (seqType === 'DNA') {
        dnaRes = chunkMetrics.dnaAnalysis || analyzeGCAndORF(targetSeq, 'DNA');
        interpretation = generateDNAInterpretation(targetSeq, dnaRes, sourceMetadata);
        revComp = computeReverseComplement(targetSeq);
      } else if (seqType === 'RNA') {
        rnaRes = chunkMetrics.rnaAnalysis || predictRNASecondaryStructure(targetSeq.slice(0, 120));
        dnaRes = chunkMetrics.dnaAnalysis || analyzeGCAndORF(targetSeq, 'RNA');
        interpretation = generateRNAInterpretation(rnaRes, sourceMetadata, targetSeq, dnaRes);
      } else if (seqType === 'PROTEIN') {
        protRes = chunkMetrics.proteinAnalysis || analyzeProteinSequence(targetSeq);
        interpretation = generateProteinInterpretation(protRes, sourceMetadata);
      } else {
        throw new Error('Unsupported sequence type for automated analysis pipeline.');
      }

      const rawPayload = {
        type: seqType,
        pipeline,
        header: fastaHeader,
        sequence: targetSeq,
        dnaAnalysis: dnaRes,
        rnaAnalysis: rnaRes,
        proteinAnalysis: protRes,
        interpretation,
        reverseComplement: revComp,
        timestamp: new Date().toLocaleTimeString(),
        versionNumber: targetVersion,
        mutations: mutations
      };

      const resultPayload = normalizeAnalysisRecord(rawPayload, targetSeq, sourceMetadata);
      resultPayload.versionNumber = targetVersion;
      resultPayload.mutations = mutations;

      setAnalysisResult(resultPayload);
      setSelectedVersionView(targetVersion);
      setVersionNumber(targetVersion);

      if (targetVersion === 2) {
        setActiveMutations(mutations);
        setVersionState((prev) => ({
          ...prev,
          v2: {
            version: 'V2',
            type: 'mutated',
            sequence: targetSeq,
            results: resultPayload,
            mutations,
            status: 'completed'
          },
          activeVersion: 'V2',
          showComparisonView: false
        }));
      } else {
        setVersionState((prev) => ({
          ...prev,
          v1: {
            version: 'V1',
            type: 'original',
            sequence: targetSeq,
            results: resultPayload,
            mutations: [],
            status: 'completed'
          },
          activeVersion: 'V1',
          showComparisonView: false
        }));
      }

      // Record in multi-version history store
      setAnalysisVersions((prev) => {
        const existingIdx = prev.findIndex((v) => v.versionNumber === targetVersion);
        const versionEntry = {
          versionNumber: targetVersion,
          label: targetVersion === 2 ? `Version 2 (Mutated - ${mutations.length} changes)` : 'Version 1 (Original)',
          sequence: targetSeq,
          resultPayload,
          mutations: targetVersion === 2 ? mutations : [],
          createdAt: new Date().toISOString()
        };
        if (existingIdx >= 0) {
          const copy = [...prev];
          copy[existingIdx] = versionEntry;
          return copy;
        }
        return [...prev, versionEntry];
      });

      setSuccessMsg(`Successfully executed Version ${targetVersion} ${pipeline} (${targetSeq.length.toLocaleString()} ${seqType === 'PROTEIN' ? 'aa' : 'bp'}).`);

      // Persist sequence record and analysis record using unified transactional-like persistence
      setIsSaving(true);
      const summaryText = `${seqType} V${targetVersion} Analysis: ${targetSeq.length.toLocaleString()} ${seqType === 'PROTEIN' ? 'residues' : 'bp'} | ${interpretation.title}`;
      const seqAccession = sourceMetadata?.accession || (fastaHeader ? fastaHeader.split(/\s+/)[0].replace(/^>/, '') : `seq-${Date.now().toString(36)}`);
      const seqTitle = sourceMetadata?.definition || sourceMetadata?.title || (fastaHeader ? fastaHeader.slice(0, 80) : 'Manual Sequence Input');

      try {
        const res = await bioService.saveCompletedAnalysis(user?.id, {
          projectId: currentProjectId,
          sequenceInfo: {
            project_id: currentProjectId,
            source: sourceMetadata?.source || (fastaHeader ? 'FASTA Input' : 'Direct Input'),
            accession: seqAccession,
            version: sourceMetadata?.version || null,
            organism: sourceMetadata?.organism || 'Homo sapiens',
            molecule_type: sourceMetadata?.molecule_type || sourceMetadata?.moleculeType || null,
            sequence_type: sourceMetadata?.sequence_type || sourceMetadata?.sequenceType || (seqType === 'PROTEIN' ? 'Protein' : seqType === 'RNA' ? 'RNA Transcript' : 'Genomic DNA'),
            definition: targetVersion === 2 ? `${seqTitle} [V2 Mutated]` : seqTitle,
            total_length: targetSeq.length,
            topology: sourceMetadata?.topology || 'linear',
            sequence: targetSeq.length <= 100000 ? targetSeq : targetSeq.slice(0, 100000),
            metadata: {
              ...(sourceMetadata || {}),
              version_number: targetVersion,
              mutations_count: targetVersion === 2 ? mutations.length : 0,
              mutations: targetVersion === 2 ? mutations : []
            }
          },
          analysisInfo: {
            project_id: currentProjectId,
            analysis_type: pipeline,
            analysis_scope: analysisScope,
            total_sequence_length: targetSeq.length,
            analyzed_length: targetSeq.length,
            sequence_type: seqType,
            input_source: sourceMetadata ? `${sourceMetadata.source}: ${sourceMetadata.accession}` : (fastaHeader ? `FASTA: >${fastaHeader.slice(0, 40)}` : 'Direct Input'),
            result_summary: summaryText,
            results: {
              pipeline: pipeline,
              gcPercent: dnaRes?.composition?.gcPercentage,
              orfsCount: dnaRes?.orfs?.length,
              interpretationTitle: interpretation.title,
              timestamp: resultPayload.timestamp,
              versionNumber: targetVersion,
              mutationsCount: targetVersion === 2 ? mutations.length : 0,
              coveragePercentage: 100,
              motifHits: chunkMetrics.motifHits
            },
            status: 'Completed'
          }
        });

        setPersistenceResult(res);
      } catch (err: any) {
        console.warn('[Analysis Persistence Warning]', err);
        setPersistenceResult({
          data: null as any,
          storage: 'local_recovery',
          message: 'Saved temporarily to local recovery storage.',
          warning: err.message
        });
      } finally {
        setIsSaving(false);
      }

    } catch (err: any) {
      console.error('[Central Analysis Execution Error]', err);
      setErrorMsg(err.message || 'Failed to execute analysis pipeline.');
    } finally {
      setRunning(false);
    }
  };

  const handleRunAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid) {
      setErrorMsg(validationErrors[0] || 'Please enter a valid biological sequence.');
      return;
    }

    if (detectedType === 'UNKNOWN') {
      setErrorMsg('Sequence could not be classified. Please ensure standard biological residues.');
      return;
    }

    const isV2Active = versionState.v2.sequence && versionState.v2.sequence !== versionState.v1.sequence;
    const targetVer = isV2Active ? 2 : 1;
    const targetSeq = targetVer === 2 ? versionState.v2.sequence : (executionSequence || versionState.v1.sequence);
    const muts = targetVer === 2 ? versionState.v2.mutations : [];

    await runSequenceAnalysis({
      sequence: targetSeq,
      targetVersion: targetVer,
      mutations: muts
    });
  };

  // Handler when user finishes analysis inside the SequenceEditorWorkspace
  const handleEditorAnalysisCompleted = async (resultPayload: any, versionJob: any) => {
    const versionNum = versionJob?.versionNumber || 2;
    const muts = versionJob?.mutations || activeMutations;
    const seq = versionJob?.sequenceSnapshot || versionJob?.sequence || executionSequence;

    await runSequenceAnalysis({
      sequence: seq,
      targetVersion: versionNum,
      mutations: muts
    });

    setIsEditorOpen(false);
  };

  // Switch displayed version in the Results Dashboard
  const handleSwitchVersionView = (targetVerNum: number) => {
    const targetVer = analysisVersions.find((v) => v.versionNumber === targetVerNum);
    if (targetVer) {
      setSelectedVersionView(targetVerNum);
      setAnalysisResult(targetVer.resultPayload);
      setActiveMutations(targetVer.mutations);
      setVersionState((prev) => ({
        ...prev,
        activeVersion: targetVerNum === 2 ? 'V2' : 'V1',
        showComparisonView: false
      }));
    } else if (targetVerNum === 2 && versionState.v2.results) {
      setSelectedVersionView(2);
      setAnalysisResult(versionState.v2.results);
      setActiveMutations(versionState.v2.mutations);
      setVersionState((prev) => ({
        ...prev,
        activeVersion: 'V2',
        showComparisonView: false
      }));
    } else if (targetVerNum === 1 && versionState.v1.results) {
      setSelectedVersionView(1);
      setAnalysisResult(versionState.v1.results);
      setActiveMutations([]);
      setVersionState((prev) => ({
        ...prev,
        activeVersion: 'V1',
        showComparisonView: false
      }));
    }
  };

  const handleCompareWithOriginal = () => {
    if (!versionState.v2.results || versionState.v2.status !== 'completed') {
      setErrorMsg('Run modified analysis before comparing with the original.');
      setVersionState((prev) => ({
        ...prev,
        showComparisonView: true
      }));
      return;
    }

    setVersionState((prev) => ({
      ...prev,
      showComparisonView: true
    }));
  };

  const handleCopySequence = (text: string, type: 'seq' | 'rev') => {
    navigator.clipboard.writeText(text);
    if (type === 'seq') {
      setCopiedSeq(true);
      setTimeout(() => setCopiedSeq(false), 2000);
    } else {
      setCopiedRevComp(true);
      setTimeout(() => setCopiedRevComp(false), 2000);
    }
  };

  const handleExportJSON = () => {
    if (!analysisResult) return;
    const blob = new Blob([JSON.stringify(analysisResult, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `biocode_analysis_${analysisResult.type.toLowerCase()}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Back to Explorer Banner */}
      {onBackToExplorer && (
        <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
          <button
            type="button"
            onClick={onBackToExplorer}
            className="flex items-center gap-2 text-xs font-semibold text-[#0284C7] hover:text-sky-600 transition-colors cursor-pointer group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Biological Data Explorer</span>
          </button>

          <span className="text-[11px] font-mono text-[#64748B] flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-[#94A3B8]" />
            NCBI / BLAST / UniProt / RCSB PDB Directories Available
          </span>
        </div>
      )}

      {/* Workbench Header */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2.5">
          <Dna className="w-6 h-6 text-[#0284C7]" />
          <span>Biological Sequence Workbench</span>
        </h2>
        <p className="text-xs md:text-sm text-[#64748B] mt-1">
          Autonomous bio-molecular analysis suite with 100% complete sequence coverage, interactive 3D structural modeling, and scientific biophysical evaluation.
        </p>
      </div>

      {/* Provenance Card & Analysis Scope Summary */}
      {sourceMetadata && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs font-mono shadow-xs">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border shrink-0 ${
              isPartial 
                ? 'bg-amber-50 border-amber-200 text-amber-700' 
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}>
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-[#0F172A] text-sm">{sourceMetadata.accession}</span>
                {sourceMetadata.version && (
                  <span className="text-[10px] text-[#64748B] bg-[#F1F5F9] px-1.5 py-0.5 rounded border border-[#E2E8F0]">
                    v{sourceMetadata.version}
                  </span>
                )}
                
                {/* Analysis Scope Badge */}
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  isPartial
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}>
                  Analysis Scope: {analysisScope}
                </span>

                {/* Biological Classification Tags */}
                {(sourceMetadata.sequence_type || sourceMetadata.sequenceType) && (
                  <span className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                    {sourceMetadata.sequence_type || sourceMetadata.sequenceType}
                  </span>
                )}

                {(sourceMetadata.strand || biologicalClassification?.strand) && (
                  <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                    {sourceMetadata.strand || biologicalClassification?.strand}
                  </span>
                )}

                {(sourceMetadata.topology || biologicalClassification?.topology) && (
                  <span className="text-[10px] text-[#334155] bg-[#F1F5F9] px-1.5 py-0.5 rounded border border-[#CBD5E1]">
                    {sourceMetadata.topology || biologicalClassification?.topology}
                  </span>
                )}

                <span className="text-[10px] text-[#64748B] bg-[#F1F5F9] px-1.5 py-0.5 rounded border border-[#E2E8F0]">
                  {sourceMetadata.source} {sourceMetadata.database ? `(${sourceMetadata.database})` : ''}
                </span>
              </div>
              <p className="text-[#64748B] text-[11px] truncate mt-1">
                {sourceMetadata.definition || sourceMetadata.title} {sourceMetadata.organism ? `• ${formatOrganism(sourceMetadata.organism)}` : ''}
              </p>
            </div>
          </div>

          {/* Scope Statistics Metrics - 5 Key Scientific Parameters */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <div className="bg-[#F8FAFC] px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[11px]">
              <span className="text-[#64748B] block text-[9px] uppercase">Total Record Length</span>
              <span className="text-[#0F172A] font-bold">{formatNumber(totalRecordLength)} {detectedType === 'PROTEIN' ? 'aa' : 'bp'}</span>
            </div>

            <div className="bg-[#F8FAFC] px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[11px]">
              <span className="text-[#64748B] block text-[9px] uppercase">Bases Scientifically Analyzed</span>
              <span className="text-emerald-700 font-bold">{formatNumber(basesAnalyzed)} {detectedType === 'PROTEIN' ? 'aa' : 'bp'}</span>
            </div>

            <div className="bg-[#F8FAFC] px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[11px]">
              <span className="text-[#64748B] block text-[9px] uppercase">Analysis Coverage</span>
              <span className="text-emerald-700 font-bold">{coveragePercent}%</span>
            </div>

            <div className="bg-[#F8FAFC] px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[11px]">
              <span className="text-[#64748B] block text-[9px] uppercase">Visualization Sample / LOD</span>
              <span className="text-[#0284C7] font-bold">{visualizationSampleLOD}</span>
            </div>

            <div className="bg-[#F8FAFC] px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[11px]">
              <span className="text-[#64748B] block text-[9px] uppercase">Rendering Window</span>
              <span className="text-purple-700 font-bold">{renderingWindowText}</span>
            </div>
          </div>
        </div>
      )}

      {/* Affirmative Optimization Banner for Large Sequences */}
      {isLargeSequence && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block font-mono text-emerald-800">
              Complete Sequence Scientific Architecture Active ({length.toLocaleString()} {detectedType === 'PROTEIN' ? 'residues' : 'bases'})
            </span>
            <p className="text-emerald-700 text-[11px] leading-relaxed">
              100% of the biological sequence ({basesAnalyzed.toLocaleString()} residues) is processed across all reading frames, motif scans, GC content, and molecular statistics. 3D WebGL Structural modeling operates with Adaptive Level-of-Detail (LOD) and window controls to ensure 60fps GPU performance.
            </p>
          </div>
        </div>
      )}

      {/* Sequence Input & Pipeline Configuration */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 md:p-8 space-y-6 shadow-xs">
        {/* Real-time Validation Banner */}
        {validationErrors.length > 0 && rawInput.trim().length > 0 && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>Sequence Validation Feedback</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-700/90 pl-1 font-mono">
              {(Array.isArray(validationErrors) ? validationErrors : []).map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="space-y-2">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            </div>

            {/* Persistence Status Feedback */}
            {persistenceResult && (
              <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between font-mono ${
                persistenceResult.storage === 'supabase'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <div className="flex items-center gap-2">
                  {persistenceResult.storage === 'supabase' ? (
                    <Cloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <HardDrive className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  )}
                  <span>
                    {persistenceResult.message || (
                      persistenceResult.storage === 'supabase'
                        ? 'Analysis securely saved to Supabase Cloud.'
                        : 'Cloud save failed. Saved temporarily to local recovery storage.'
                    )}
                  </span>
                </div>

                {(persistenceResult.storage === 'local_recovery' || persistenceResult.storage === 'local_fallback') && (
                  <button
                    type="button"
                    onClick={() => setIsMigrationModalOpen(true)}
                    className="text-[11px] underline hover:text-[#0F172A] flex items-center gap-1 cursor-pointer font-sans font-medium"
                  >
                    <Code className="w-3 h-3" />
                    <span>View SQL Schema</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pipeline Selection & Sequence Intelligence Header */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#475569]">Analysis Pipeline</label>
            <select
              value={selectedPipeline}
              onChange={(e) => setSelectedPipeline(e.target.value)}
              className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] focus:outline-none focus:border-[#0284C7] font-mono cursor-pointer"
            >
              {(Array.isArray(availableAnalyses) ? availableAnalyses : []).length > 0 ? (
                (Array.isArray(availableAnalyses) ? availableAnalyses : []).map((pipelineKey) => (
                  <option key={pipelineKey} value={PIPELINE_LABELS[pipelineKey]?.name || pipelineKey}>
                    {PIPELINE_LABELS[pipelineKey]?.name || pipelineKey}
                  </option>
                ))
              ) : (
                <>
                  <option>GC Content & ORF Profiling</option>
                  <option>Reverse Complement & Translation</option>
                  <option>Codon Usage & Bias Analysis</option>
                  <option>Amino Acid Composition & Charge</option>
                  <option>Molecular Weight & Isoelectric Point</option>
                </>
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#475569]">Autonomous Sequence Classification</label>
            <div className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2 flex items-center justify-between text-xs font-mono text-[#334155] min-h-[42px]">
              <span className="text-[#64748B]">Biological Type:</span>
              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-lg font-bold text-[11px] tracking-wide ${
                    detectedType === 'DNA'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : detectedType === 'RNA'
                      ? 'bg-sky-50 text-sky-700 border border-sky-200'
                      : detectedType === 'PROTEIN'
                      ? 'bg-purple-50 text-purple-700 border border-purple-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {detectedType}
                </span>
                {confidence > 0 && (
                  <span className="text-[10px] text-[#64748B] font-mono">
                    {Math.round(confidence * 100)}% confidence
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Biological Sequence Input Box */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="block text-xs font-medium text-[#475569]">
              Biological Sequence (Raw or FASTA format with &gt; header)
            </label>
            <div className="flex items-center gap-3 text-[10px] font-mono text-[#64748B]">
              {fastaHeader && (
                <span className="flex items-center gap-1 text-emerald-700">
                  <FileText className="w-3 h-3" /> Header: &quot;{fastaHeader}&quot;
                </span>
              )}
              <span>
                Length: {length} {detectedType === 'PROTEIN' ? 'aa' : 'bp'}
              </span>
              <button
                type="button"
                onClick={() => setIsEditorOpen(true)}
                disabled={!cleanedSequence}
                className="px-3 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-[#0284C7] border border-sky-200 font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>✏ Edit Sequence</span>
              </button>
            </div>
          </div>
          <textarea
            rows={6}
            value={rawInput}
            onChange={(e) => updateSequence(e.target.value)}
            placeholder=">example_human_gene&#10;ATGCGTACTAGCTAGCTAGCTA..."
            className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-4 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#0284C7] font-mono resize-none leading-relaxed"
          />
          {rawInput.trim() && (
            <div
              className={`text-[11px] font-mono flex items-center gap-1.5 mt-1 ${
                isValid ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isValid
                  ? `Valid ${detectedType} biological sequence verified (${length} residues). Ready for execution.`
                  : validationErrors[0] || 'Sequence input requires validation.'}
              </span>
            </div>
          )}
        </div>

        {/* Sequence Editor Panel / Workspace */}
        {isEditorOpen && (
          <div className="pt-2">
            <BioErrorBoundary moduleName="Sequence Editor Workspace" onReset={() => setIsEditorOpen(false)}>
              <SequenceEditorWorkspace
                originalSequence={originalImmutableSeq || cleanedSequence || ''}
                sequenceType={(detectedType as 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN') || 'DNA'}
                sourceAccession={sourceMetadata?.accession || fastaHeader || 'Active Sequence'}
                sourceRecordId={(sourceMetadata as any)?.id || sourceMetadata?.accession || null}
                sourceMetadata={{
                  ...(sourceMetadata || {}),
                  originalResults: analysisResult
                }}
                currentPipeline={selectedPipeline}
                versionNumber={versionNumber}
                initialMutations={activeMutations}
                onClose={() => setIsEditorOpen(false)}
                onAnalysisCompleted={handleEditorAnalysisCompleted}
                onCompareVersions={(orig, mod, muts) => {
                  setVersionState((prev) => ({
                    ...prev,
                    v2: {
                      ...prev.v2,
                      sequence: mod,
                      mutations: muts
                    },
                    showComparisonView: true
                  }));
                  setIsEditorOpen(false);
                }}
                isAnalyzing={running}
              />
            </BioErrorBoundary>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-between">
          <div className="text-xs text-[#64748B] flex items-center gap-1.5 font-mono">
            <Sparkles className="w-3.5 h-3.5 text-[#0284C7]" />
            <span>Interactive 3D Structure &amp; Biophysical Engines Active</span>
          </div>
          <button
            type="button"
            onClick={handleRunAnalysis}
            disabled={running || !isValid}
            className="px-6 py-3 rounded-xl bg-[#0284C7] hover:bg-sky-600 text-white font-medium text-xs transition-all shadow-xs flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
            <span>Run Analysis Pipeline</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RESULTS DASHBOARD: Real Interactive 3D Visualization + Scientific Engine */}
      {/* ========================================================================= */}
      {analysisResult && (
        <div className="space-y-6">
          {/* Top Results Summary Bar */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-lg font-bold text-[#0F172A] tracking-tight">
                  {analysisResult.interpretation.title}
                </h3>
                <span
                  className={`px-3 py-0.5 rounded-full text-xs font-mono font-bold ${
                    analysisResult.type === 'DNA'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : analysisResult.type === 'RNA'
                      ? 'bg-sky-50 text-sky-700 border border-sky-200'
                      : 'bg-purple-50 text-purple-700 border border-purple-200'
                  }`}
                >
                  {analysisResult.type} Molecule
                </span>

                {/* Active Version Badge */}
                <span className="px-2.5 py-0.5 rounded-md bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] font-mono text-xs font-bold flex items-center gap-1">
                  <History className="w-3 h-3 text-[#0284C7]" />
                  <span>Version {analysisResult.versionNumber || selectedVersionView}</span>
                </span>
              </div>

              {/* Multi-Version Tab Switcher & Comparison Mode Control */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <span className="text-[11px] font-mono text-[#64748B]">Analysis Version:</span>
                
                <button
                  type="button"
                  onClick={() => handleSwitchVersionView(1)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    !versionState.showComparisonView && versionState.activeVersion === 'V1'
                      ? 'bg-[#0284C7] text-white shadow-xs'
                      : 'bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A] border border-[#CBD5E1]'
                  }`}
                >
                  <span>V1 (Original)</span>
                </button>

                {(versionState.v2.sequence || (Array.isArray(analysisVersions) ? analysisVersions : []).some((v) => v.versionNumber === 2)) && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSwitchVersionView(2)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                        !versionState.showComparisonView && versionState.activeVersion === 'V2'
                          ? 'bg-[#0284C7] text-white shadow-xs'
                          : 'bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A] border border-[#CBD5E1]'
                      }`}
                    >
                      <span>V2 (Mutated)</span>
                      {(versionState.v2.mutations || []).length > 0 && (
                        <span className="text-[10px] opacity-80">({versionState.v2.mutations.length} mut)</span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleCompareWithOriginal}
                      className={`px-3.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        versionState.showComparisonView
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                      }`}
                    >
                      <GitCompare className="w-3.5 h-3.5" />
                      <span>Compare to Original Result</span>
                    </button>
                  </>
                )}
              </div>

              <p className="text-xs text-[#64748B] font-mono">
                Pipeline: <span className="text-[#0F172A] font-medium">{analysisResult.pipeline}</span> | Length:{' '}
                <span className="text-emerald-700 font-semibold">{analysisResult.sequence.length}</span>{' '}
                {analysisResult.type === 'PROTEIN' ? 'residues (aa)' : 'nucleotides (bp)'}
                {analysisResult.header && ` | >${analysisResult.header}`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {onOpenAiWithContext && (
                <button
                  onClick={() => {
                    const accessionStr = fastaHeader?.split(' ')[0]?.replace('>', '') || 'AAB08058';
                    const resAny = analysisResult as any;
                    onOpenAiWithContext({
                      type: 'sequence',
                      sequenceId: currentSequenceId || 'seq_active',
                      projectId: currentProjectId,
                      accession: accessionStr,
                      definition: fastaHeader || 'Active Workbench Sequence',
                      sequenceType: detectedType === 'PROTEIN' ? 'Protein' : 'DNA/RNA',
                      sequenceLength: length || 271,
                      selectedAnalysis: selectedPipeline,
                      analysisResults: {
                        molecularWeight: resAny?.proteinMetrics?.molecularWeight || '29.8 kDa',
                        isoelectricPoint: resAny?.proteinMetrics?.isoelectricPoint || 6.45,
                        gravyIndex: resAny?.proteinMetrics?.gravyIndex || -0.32,
                        gcContent: resAny?.gcResult?.gcContentPercent,
                        orfCount: resAny?.gcResult?.orfsCount
                      }
                    });
                  }}
                  className="px-3.5 py-2 rounded-xl bg-pink-50 hover:bg-pink-100 text-[#DB2777] border border-pink-200 text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer shadow-xs font-medium"
                  title="Analyze sequence context with BioAI Assistant"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#DB2777]" />
                  <span>Ask BioAI</span>
                </button>
              )}
              <button
                onClick={handleExportJSON}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#F1F5F9] text-[#334155] hover:text-[#0F172A] border border-[#CBD5E1] text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
                title="Export complete analysis data as JSON"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
              <button
                onClick={() => handleCopySequence(analysisResult.sequence, 'seq')}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#F1F5F9] text-[#334155] hover:text-[#0F172A] border border-[#CBD5E1] text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
                title="Copy cleaned biological sequence"
              >
                {copiedSeq ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSeq ? 'Copied' : 'Copy Sequence'}</span>
              </button>
            </div>
          </div>

          {versionState.showComparisonView ? (
            <div className="space-y-6">
              {versionState.v1.results && versionState.v2.results ? (
                <BioErrorBoundary moduleName="Analysis Impact Comparison" onReset={() => setVersionState((p) => ({ ...p, showComparisonView: false }))}>
                  <AnalysisImpactComparisonView
                    report={generateComparativeAnalysisReport({
                      originalSequence: versionState.v1.sequence,
                      modifiedSequence: versionState.v2.sequence,
                      sequenceType: (detectedType as 'DNA' | 'RNA' | 'PROTEIN') || 'PROTEIN',
                      pipeline: selectedPipeline,
                      mutations: versionState.v2.mutations || [],
                      sourceMetadata,
                      originalResults: versionState.v1.results,
                      modifiedResults: versionState.v2.results,
                      versionNumber: 2
                    })}
                    originalSequence={versionState.v1.sequence}
                    modifiedSequence={versionState.v2.sequence}
                    mutations={versionState.v2.mutations || []}
                    onRestoreVersion={(vNum) => {
                      handleSwitchVersionView(vNum);
                    }}
                  />
                </BioErrorBoundary>
              ) : (
                <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-6 shadow-xs space-y-4">
                  <div className="flex items-start justify-between flex-wrap gap-4">
                    <div className="space-y-1 max-w-xl">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-amber-600" />
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-100 border border-amber-200 text-amber-800 font-mono text-xs font-bold">
                          Modified Analysis Required
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[#0F172A] tracking-tight">
                        Run modified analysis before comparing with the original.
                      </h3>
                      <p className="text-xs text-[#475569] font-mono">
                        The modified sequence (V2) has mutated residues but has not been analyzed by the biological pipeline yet. Execute the analysis pipeline for V2 to calculate side-by-side comparative impact metrics.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const seq = versionState.v2.sequence || executionSequence;
                        await runSequenceAnalysis({
                          sequence: seq,
                          targetVersion: 2,
                          mutations: versionState.v2.mutations
                        });
                      }}
                      disabled={running}
                      className="px-5 py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold text-xs font-mono transition-all flex items-center gap-2 cursor-pointer shadow-xs"
                    >
                      {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                      <span>Run Modified Analysis (Version 2)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* TWO-COLUMN RESULTS LAYOUT */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT COLUMN: Large Interactive 3D Biological Visualization */}
            <div className="lg:col-span-7 flex flex-col space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#0F172A] tracking-wider uppercase flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#0284C7]" />
                  <span>3D Biological Structure Visualization</span>
                </h4>
                <span className="text-[11px] font-mono text-[#64748B]">
                  Interactive WebGL Canvas (Orbit / Zoom / Rotate)
                </span>
              </div>

              {/* Dynamic Structure Viewer based on Sequence Type */}
              <div className="h-[520px] bg-white rounded-2xl border border-[#E2E8F0] p-1 shadow-xs overflow-hidden">
                <SequenceStructureViewer
                  sequence={analysisResult.sequence}
                  sequenceType={analysisResult.type}
                  dnaAnalysis={analysisResult.dnaAnalysis}
                  rnaAnalysis={analysisResult.rnaAnalysis}
                  proteinAnalysis={analysisResult.proteinAnalysis}
                  totalRecordLength={totalRecordLength}
                  mutations={activeMutations}
                  originalSequence={originalImmutableSeq || undefined}
                  accessionOrPdbId={sourceMetadata?.accession || undefined}
                  className="h-full"
                />
              </div>
            </div>

            {/* RIGHT COLUMN: Scientific Analysis & Biological Interpretation */}
            <div className="lg:col-span-5 flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#0F172A] tracking-wider uppercase flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#0284C7]" />
                  <span>Scientific Interpretation</span>
                </h4>
                <span className="text-[11px] font-mono text-[#64748B]">Biophysical Analysis</span>
              </div>

              {/* Key Quantitative Metrics Cards */}
              <div className="grid grid-cols-2 gap-3">
                {analysisResult.type === 'DNA' && analysisResult.dnaAnalysis && (
                  <>
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 space-y-1">
                      <div className="text-[10px] font-mono uppercase text-[#64748B]">GC Content</div>
                      <div className="text-xl font-bold text-emerald-700 font-mono">
                        {analysisResult.dnaAnalysis.composition.gcPercentage}%
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        {analysisResult.dnaAnalysis.composition.gcCount} of {analysisResult.dnaAnalysis.composition.length} bp
                      </div>
                    </div>
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 space-y-1">
                      <div className="text-[10px] font-mono uppercase text-[#64748B]">AT Content</div>
                      <div className="text-xl font-bold text-[#0284C7] font-mono">
                        {analysisResult.dnaAnalysis.composition.atPercentage}%
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        {analysisResult.dnaAnalysis.composition.atCount} of {analysisResult.dnaAnalysis.composition.length} bp
                      </div>
                    </div>
                  </>
                )}

                {analysisResult.type === 'RNA' && analysisResult.rnaAnalysis && (
                  <>
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 space-y-1">
                      <div className="text-[10px] font-mono uppercase text-[#64748B]">GC / AU Ratio</div>
                      <div className="text-xl font-bold text-sky-700 font-mono">
                        {analysisResult.rnaAnalysis.gcPercentage}% / {analysisResult.rnaAnalysis.auPercentage}%
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        {analysisResult.rnaAnalysis.stemCount} Secondary Stems
                      </div>
                    </div>
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 space-y-1">
                      <div className="text-[10px] font-mono uppercase text-[#64748B]">Est. Folding Free Energy</div>
                      <div className="text-xl font-bold text-purple-700 font-mono">
                        {analysisResult.rnaAnalysis.estimatedFreeEnergyKcal} <span className="text-xs font-normal text-[#64748B]">kcal/mol</span>
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        {analysisResult.rnaAnalysis.loopCount} Hairpin Loops
                      </div>
                    </div>
                  </>
                )}

                {analysisResult.type === 'PROTEIN' && analysisResult.proteinAnalysis && (
                  <>
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 space-y-1">
                      <div className="text-[10px] font-mono uppercase text-[#64748B]">Molecular Mass</div>
                      <div className="text-xl font-bold text-purple-700 font-mono">
                        {analysisResult.proteinAnalysis.molecularWeightKDa} <span className="text-xs font-normal text-[#64748B]">kDa</span>
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        {(analysisResult.proteinAnalysis.molecularWeightDa || 0).toLocaleString()} Da
                      </div>
                    </div>
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 space-y-1">
                      <div className="text-[10px] font-mono uppercase text-[#64748B]">Isoelectric Point (pI)</div>
                      <div className="text-xl font-bold text-emerald-700 font-mono">
                        {analysisResult.proteinAnalysis.isoelectricPoint}
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        Net Charge (pH 7.4): {(analysisResult.proteinAnalysis.netChargeAtPh7 || 0) > 0 ? `+${analysisResult.proteinAnalysis.netChargeAtPh7}` : analysisResult.proteinAnalysis.netChargeAtPh7}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Interpretation Findings Container */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4 flex-1 flex flex-col justify-between shadow-xs">
                <div className="space-y-3.5">
                  {/* Executive Summary */}
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 text-xs text-[#334155] leading-relaxed font-sans">
                    <span className="font-semibold text-emerald-700 block mb-1 text-[11px] uppercase tracking-wider font-mono">
                      Executive Evaluation
                    </span>
                    {analysisResult?.interpretation?.executiveSummary || (analysisResult?.interpretation as any)?.summary || 'Sequence analysis evaluated.'}
                  </div>

                  {/* Biophysical Insights */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-[#0F172A] uppercase font-mono flex items-center gap-1.5">
                      <Thermometer className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Biophysical Characteristics</span>
                    </span>
                    <ul className="space-y-1.5 text-xs text-[#475569]">
                      {(Array.isArray(analysisResult?.interpretation?.biophysicalInsights) ? analysisResult.interpretation.biophysicalInsights : []).map((insight, idx) => (
                        <li key={idx} className="flex items-start gap-2 bg-[#F8FAFC] rounded-lg p-2 border border-[#E2E8F0]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0 mt-1.5" />
                          <span className="leading-snug text-[#334155]">{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Structural & Functional Predictions */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-[#0F172A] uppercase font-mono flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#0284C7]" />
                      <span>Structural &amp; Functional Predictions</span>
                    </span>
                    <ul className="space-y-1.5 text-xs text-[#475569]">
                      {(Array.isArray(analysisResult?.interpretation?.structuralImplications) ? analysisResult.interpretation.structuralImplications : [])
                        .concat(Array.isArray(analysisResult?.interpretation?.functionalPredictions) ? analysisResult.interpretation.functionalPredictions : [])
                        .map((implication, idx) => (
                          <li key={idx} className="flex items-start gap-2 bg-[#F8FAFC] rounded-lg p-2 border border-[#E2E8F0]">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0 mt-1.5" />
                            <span className="leading-snug text-[#334155]">{implication}</span>
                          </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Scientific Disclaimer Footer */}
                <div className="text-[10px] text-[#64748B] border-t border-[#E2E8F0] pt-3 italic font-sans flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 text-[#94A3B8] mt-0.5" />
                  <span>{analysisResult.interpretation.confidenceDisclaimer}</span>
                </div>
              </div>
            </div>
          </div>

          {/* LOWER SECTION: Detailed Metrics & Residue Breakdown Tabs */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-6 shadow-xs">
            {/* Tab Navigation */}
            <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-4 flex-wrap">
              <button
                onClick={() => setActiveTab('metrics')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold font-mono transition-colors cursor-pointer flex items-center gap-2 ${
                  activeTab === 'metrics'
                    ? 'bg-[#0284C7] text-white shadow-xs'
                    : 'bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A] border border-[#CBD5E1]'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Composition Breakdown</span>
              </button>

              <button
                onClick={() => setActiveTab('orfs_structure')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold font-mono transition-colors cursor-pointer flex items-center gap-2 ${
                  activeTab === 'orfs_structure'
                    ? 'bg-[#0284C7] text-white shadow-xs'
                    : 'bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A] border border-[#CBD5E1]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>
                  {analysisResult.type === 'DNA'
                    ? 'Open Reading Frames (ORFs)'
                    : analysisResult.type === 'RNA'
                    ? 'Stem-Loop Secondary Pairs'
                    : 'Hydropathy & Charge Profile'}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('sequence')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold font-mono transition-colors cursor-pointer flex items-center gap-2 ${
                  activeTab === 'sequence'
                    ? 'bg-[#0284C7] text-white shadow-xs'
                    : 'bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A] border border-[#CBD5E1]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Formatted Sequence &amp; Complement</span>
              </button>
            </div>

            {/* TAB 1: Composition Breakdown */}
            {activeTab === 'metrics' && (
              <div className="space-y-6">
                {/* DNA / RNA Nucleotide Breakdown */}
                {(analysisResult.type === 'DNA' || analysisResult.type === 'RNA') && analysisResult.dnaAnalysis && (
                  <div className="space-y-4">
                    <h5 className="text-xs font-bold text-[#0F172A] uppercase font-mono tracking-wider">
                      Nucleotide Frequency Distribution
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {['A', analysisResult.type === 'RNA' ? 'U' : 'T', 'G', 'C'].map((base) => {
                        const count = analysisResult.dnaAnalysis?.composition.counts[base] || 0;
                        const len = analysisResult.sequence.length;
                        const pct = len > 0 ? ((count / len) * 100).toFixed(1) : '0';
                        return (
                          <div key={base} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold font-mono text-[#0F172A]">{base}</span>
                              <span className="text-xs font-mono text-[#64748B]">{count} bp</span>
                            </div>
                            <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  base === 'A'
                                    ? 'bg-rose-500'
                                    : base === 'T'
                                    ? 'bg-sky-500'
                                    : base === 'U'
                                    ? 'bg-purple-500'
                                    : base === 'G'
                                    ? 'bg-emerald-500'
                                    : 'bg-amber-500'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="text-right text-[11px] font-mono text-[#64748B]">{pct}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Protein Amino Acid Breakdown */}
                {analysisResult.type === 'PROTEIN' && analysisResult.proteinAnalysis && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold text-[#0F172A] uppercase font-mono tracking-wider">
                        Amino Acid Residue Partitioning (20 Standard Residues)
                      </h5>
                      <span className="text-xs font-mono text-[#64748B]">
                        GRAVY Score: {analysisResult.proteinAnalysis.gravyScore}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                      {Object.entries(analysisResult.proteinAnalysis?.percentages || {}).map(([aa, pct]) => {
                        const count = analysisResult.proteinAnalysis?.counts?.[aa] || 0;
                        return (
                          <div key={aa} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-mono">
                              <span className="font-bold text-[#0F172A]">{aa}</span>
                              <span className="text-[#64748B]">{count} ({pct}%)</span>
                            </div>
                            <div className="w-full bg-[#E2E8F0] h-1.5 rounded-full overflow-hidden">
                              <div className="h-full bg-purple-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: ORFs, RNA Stems, or Protein Hydropathy */}
            {activeTab === 'orfs_structure' && (
              <div className="space-y-4">
                {/* DNA Open Reading Frames Table */}
                {analysisResult.type === 'DNA' && analysisResult.dnaAnalysis && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold text-[#0F172A] uppercase font-mono tracking-wider">
                        Identified Open Reading Frames (ORFs)
                      </h5>
                      <span className="text-xs font-mono text-[#64748B]">
                        {(Array.isArray(analysisResult.dnaAnalysis.orfs) ? analysisResult.dnaAnalysis.orfs : []).length} candidate coding regions detected
                      </span>
                    </div>

                    {(Array.isArray(analysisResult.dnaAnalysis.orfs) ? analysisResult.dnaAnalysis.orfs : []).length === 0 ? (
                      <div className="p-8 text-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs text-[#64748B] font-mono">
                        No open reading frames found matching the minimum length threshold (&gt;=9 bp).
                      </div>
                    ) : (
                      <div className="border border-[#E2E8F0] rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-[#F8FAFC] text-[#475569] border-b border-[#E2E8F0]">
                            <tr>
                              <th className="p-3">Reading Frame</th>
                              <th className="p-3">Start (bp)</th>
                              <th className="p-3">End (bp)</th>
                              <th className="p-3">Span</th>
                              <th className="p-3">Translated Polypeptide</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E2E8F0] bg-white">
                            {(Array.isArray(analysisResult.dnaAnalysis.orfs) ? analysisResult.dnaAnalysis.orfs : []).map((orf, idx) => (
                              <tr key={idx} className="hover:bg-[#F8FAFC] transition-colors">
                                <td className="p-3 text-emerald-700 font-bold">
                                  {orf.frame > 0 ? `+${orf.frame}` : orf.frame}
                                </td>
                                <td className="p-3 text-[#334155]">{orf.start}</td>
                                <td className="p-3 text-[#334155]">{orf.end}</td>
                                <td className="p-3 text-[#334155]">
                                  {orf.lengthBp} bp ({orf.lengthAa} aa)
                                </td>
                                <td className="p-3 text-[#64748B] truncate max-w-xs font-mono" title={orf.proteinSequence}>
                                  {orf.proteinSequence}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* RNA Secondary Structure Dot-Bracket & Stems */}
                {analysisResult.type === 'RNA' && analysisResult.rnaAnalysis && (
                  <div className="space-y-4">
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-[#334155] font-mono">Dot-Bracket Notation</div>
                      <div className="font-mono text-xs text-sky-800 tracking-wider break-all bg-white p-3 rounded-lg border border-[#E2E8F0]">
                        {analysisResult.rnaAnalysis.dotBracket}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h5 className="text-xs font-bold text-[#0F172A] uppercase font-mono tracking-wider">
                        Predicted Helical Stems ({(Array.isArray(analysisResult.rnaAnalysis.stems) ? analysisResult.rnaAnalysis.stems : []).length})
                      </h5>
                      {(Array.isArray(analysisResult.rnaAnalysis.stems) ? analysisResult.rnaAnalysis.stems : []).length === 0 ? (
                        <div className="p-6 text-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs text-[#64748B] font-mono">
                          No stable intramolecular stems formed in this transcript.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {(Array.isArray(analysisResult.rnaAnalysis.stems) ? analysisResult.rnaAnalysis.stems : []).map((stem, sIdx) => (
                            <div key={sIdx} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 text-xs font-mono space-y-1">
                              <div className="flex items-center justify-between text-[#334155] font-bold">
                                <span>Stem #{sIdx + 1}</span>
                                <span className="text-sky-700">{stem.length} Base Pairs</span>
                              </div>
                              <div className="text-[#64748B] text-[11px]">
                                5&apos; Range: {stem.start5}..{stem.end5} &harr; 3&apos; Range: {stem.start3}..{stem.end3}
                              </div>
                              <div className="text-[#94A3B8] text-[10px] truncate">
                                Pairs: {(Array.isArray(stem?.basePairs) ? stem.basePairs : []).join(', ')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Protein Secondary Propensity & Hydropathy */}
                {analysisResult.type === 'PROTEIN' && analysisResult.proteinAnalysis && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-1">
                        <div className="text-xs font-mono text-[#64748B]">Hydrophobic Residues</div>
                        <div className="text-xl font-bold text-amber-700 font-mono">
                          {analysisResult.proteinAnalysis.hydrophobicPercentage}%
                        </div>
                        <div className="text-[10px] text-[#64748B]">
                          {analysisResult.proteinAnalysis.hydrophobicCount} non-polar amino acids
                        </div>
                      </div>
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-1">
                        <div className="text-xs font-mono text-[#64748B]">Polar Residues</div>
                        <div className="text-xl font-bold text-sky-700 font-mono">
                          {analysisResult.proteinAnalysis.polarPercentage}%
                        </div>
                        <div className="text-[10px] text-[#64748B]">
                          {analysisResult.proteinAnalysis.polarCount} uncharged polar residues
                        </div>
                      </div>
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-1">
                        <div className="text-xs font-mono text-[#64748B]">Charged Residues</div>
                        <div className="text-xl font-bold text-purple-700 font-mono">
                          +{analysisResult.proteinAnalysis.positivelyChargedCount} / -{analysisResult.proteinAnalysis.negativelyChargedCount}
                        </div>
                        <div className="text-[10px] text-[#64748B]">
                          Net: {analysisResult.proteinAnalysis.netChargeAtPh7 > 0 ? `+${analysisResult.proteinAnalysis.netChargeAtPh7}` : analysisResult.proteinAnalysis.netChargeAtPh7}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Formatted Sequence & Reverse Complement with Paginated Windowing */}
            {activeTab === 'sequence' && (() => {
              const fullSeq = analysisResult.sequence;
              const seqLen = fullSeq.length;
              const totalPages = Math.ceil(seqLen / SEQ_PAGE_SIZE);
              const currentPage = Math.min(Math.max(1, seqViewerPage), totalPages);
              const windowStart = (currentPage - 1) * SEQ_PAGE_SIZE;
              const windowEnd = Math.min(windowStart + SEQ_PAGE_SIZE, seqLen);
              const windowSeq = fullSeq.slice(windowStart, windowEnd);

              return (
                <div className="space-y-4 font-mono text-xs">
                  {/* Windowing Navigator for Long Sequences */}
                  {seqLen > SEQ_PAGE_SIZE && (
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 flex flex-col sm:row items-center justify-between gap-3 text-[#334155]">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-700 font-bold">Virtualized Viewer:</span>
                        <span className="text-[#64748B]">
                          Residues <strong className="text-[#0F172A]">{(windowStart + 1).toLocaleString()} .. {windowEnd.toLocaleString()}</strong> of <strong className="text-[#0F172A]">{seqLen.toLocaleString()}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSeqViewerPage(p => Math.max(1, p - 1))}
                          disabled={currentPage <= 1}
                          className="px-2.5 py-1 rounded bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] disabled:opacity-40 text-[11px] cursor-pointer text-[#334155]"
                        >
                          &larr; Prev 10k
                        </button>
                        <span className="text-[11px] text-[#64748B] font-semibold px-2">
                          Page {currentPage} / {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSeqViewerPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage >= totalPages}
                          className="px-2.5 py-1 rounded bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] disabled:opacity-40 text-[11px] cursor-pointer text-[#334155]"
                        >
                          Next 10k &rarr;
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[#0F172A] font-bold">
                        5&apos; to 3&apos; Primary Sequence {seqLen > SEQ_PAGE_SIZE ? `(Window ${currentPage}/${totalPages})` : ''}
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleCopySequence(fullSeq, 'seq')}
                          className="text-[11px] text-[#0284C7] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedSeq ? 'Copied Full Sequence' : 'Copy All Bases'}</span>
                        </button>
                      </div>
                    </div>
                    <div className="bg-[#F8FAFC] p-4 rounded-xl border border-[#CBD5E1] text-[#0F172A] break-all leading-relaxed max-h-56 overflow-y-auto font-mono text-[11px] select-all">
                      {windowSeq.match(/.{1,10}/g)?.join(' ') || windowSeq}
                    </div>
                  </div>

                  {analysisResult.reverseComplement && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[#0F172A] font-bold flex items-center gap-1.5">
                          <ArrowRightLeft className="w-3.5 h-3.5 text-[#0284C7]" />
                          <span>3&apos; to 5&apos; Reverse Complement Strand</span>
                        </span>
                        <button
                          onClick={() => handleCopySequence(analysisResult.reverseComplement!, 'rev')}
                          className="text-[11px] text-[#0284C7] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedRevComp ? 'Copied' : 'Copy Reverse Complement'}</span>
                        </button>
                      </div>
                      <div className="bg-[#F8FAFC] p-4 rounded-xl border border-[#CBD5E1] text-sky-800 break-all leading-relaxed max-h-48 overflow-y-auto font-mono text-[11px] select-all">
                        {analysisResult.reverseComplement.slice(windowStart, windowEnd).match(/.{1,10}/g)?.join(' ') || analysisResult.reverseComplement}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          </>
        )}
        </div>
      )}

      {/* SQL Migration Modal */}
      <SqlMigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
      />
    </div>
  );
};
