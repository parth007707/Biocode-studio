import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Sparkles,
  Download,
  Copy,
  Check,
  Dna,
  Zap,
  Activity,
  Layers,
  ArrowLeft,
  Globe,
  Database,
  Edit3,
  GitCompare,
  RotateCcw,
  Plus,
  ChevronDown,
  ChevronUp,
  Eye,
  ArrowRight,
  Info,
  ShieldCheck,
  FlaskConical,
  Scale,
  X
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
  parseBiologicalInput,
  normalizeAnalysisRecord,
  NormalizedWorkbenchState
} from '../../lib/bio';
import { SequenceStructureViewer } from './viewers/SequenceStructureViewer';
import { SequenceEditorWorkspace } from './editor/SequenceEditorWorkspace';
import { generateComparativeAnalysisReport, ComparativeAnalysisReport } from '../../lib/bio/editor/comparativeAnalysisEngine';
import { evaluateSequenceChangeImpact, EditedSequenceImpactReport } from '../../lib/bio/editor/changeImpactEngine';
import { BioErrorBoundary } from '../common/BioErrorBoundary';
import { formatNumber } from '../../lib/utils/formatters';
import { SequenceSourceMetadata } from '../../services/adapters/types';
import { uniprotAdapter, ncbiAdapter } from '../../services/adapters';
import { bioService } from '../../services/bioService';
import { SqlMigrationModal } from '../database/SqlMigrationModal';
import { useBioSequence } from '../../context/BioSequenceContext';
import { ResidueWhatIfSimulator } from './ResidueWhatIfSimulator';
import { generateScientificPdfReport } from '../../utils/pdfReportGenerator';
import { NewSequenceModal } from './NewSequenceModal';
import { LoadSequenceModal } from './LoadSequenceModal';
import { SequenceTopWorkspace } from './workbench/SequenceTopWorkspace';
import { SequenceAnalysisResults } from './workbench/SequenceAnalysisResults';

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

const AA_THREE_LETTER_MAP: Record<string, { code: string; three: string; name: string; category: string }> = {
  A: { code: 'A', three: 'Ala', name: 'Alanine', category: 'Aliphatic / Hydrophobic' },
  R: { code: 'R', three: 'Arg', name: 'Arginine', category: 'Basic (+)' },
  N: { code: 'N', three: 'Asn', name: 'Asparagine', category: 'Polar Neutral' },
  D: { code: 'D', three: 'Asp', name: 'Aspartic Acid', category: 'Acidic (-)' },
  C: { code: 'C', three: 'Cys', name: 'Cysteine', category: 'Special / Thiol' },
  E: { code: 'E', three: 'Glu', name: 'Glutamic Acid', category: 'Acidic (-)' },
  Q: { code: 'Q', three: 'Gln', name: 'Glutamine', category: 'Polar Neutral' },
  G: { code: 'G', three: 'Gly', name: 'Glycine', category: 'Special / Flexible' },
  H: { code: 'H', three: 'His', name: 'Histidine', category: 'Basic (+)' },
  I: { code: 'I', three: 'Ile', name: 'Isoleucine', category: 'Aliphatic / Hydrophobic' },
  L: { code: 'L', three: 'Leu', name: 'Leucine', category: 'Aliphatic / Hydrophobic' },
  K: { code: 'K', three: 'Lys', name: 'Lysine', category: 'Basic (+)' },
  M: { code: 'M', three: 'Met', name: 'Methionine', category: 'Aliphatic / Hydrophobic' },
  F: { code: 'F', three: 'Phe', name: 'Phenylalanine', category: 'Aromatic' },
  P: { code: 'P', three: 'Pro', name: 'Proline', category: 'Special / Cyclic Kink' },
  S: { code: 'S', three: 'Ser', name: 'Serine', category: 'Polar Neutral' },
  T: { code: 'T', three: 'Thr', name: 'Threonine', category: 'Polar Neutral' },
  W: { code: 'W', three: 'Trp', name: 'Tryptophan', category: 'Aromatic' },
  Y: { code: 'Y', three: 'Tyr', name: 'Tyrosine', category: 'Aromatic / Polar' },
  V: { code: 'V', three: 'Val', name: 'Valine', category: 'Aliphatic / Hydrophobic' },
};

export const SequenceWorkbench: React.FC<SequenceWorkbenchProps> = ({
  user,
  initialSequence,
  sourceMetadata,
  initialPipeline,
  initialAnalysisResult,
  currentProjectId,
  currentSequenceId,
  onBackToExplorer,
  onOpenAiWithContext
}) => {
  // Centralized BioSequence Context Store (Single Source of Truth)
  const {
    sequenceId: centralSequenceId,
    accession: centralAccession,
    definition: centralDefinition,
    organism: centralOrganism,
    sequence: centralSequence,
    sequenceType: centralSequenceType,
    length: centralLength,
    versionNumber: centralVersionNumber,
    versionLabel: centralVersionLabel,
    isModified: centralIsModified,
    hasActiveSequence,
    originalSequence: centralOriginalSequence,
    simulatedSequence: centralSimulatedSequence,
    simulationResult: centralSimulationResult,
    analysisResults: centralAnalysisResults,
    analysisStatus: centralAnalysisStatus,
    analysisMessage: centralAnalysisMessage,
    structureState: centralStructureState,
    mutations: centralMutations,
    mutationSummary: centralMutationSummary,
    versionHistory: centralVersionHistory,
    impactReport: centralImpactReport,
    comparativeReport: centralComparativeReport,
    isLoadingTarget,
    loadingAccession,
    targetLoadingError,
    loadTarget,
    loadSequence: centralLoadSequence,
    createNewSequence: centralCreateNewSequence,
    clearActiveSequence: centralClearActiveSequence,
    editSequence: centralEditSequence,
    applyWorkingCopy: centralApplyWorkingCopy,
    discardWorkingCopy: centralDiscardWorkingCopy,
    restoreVersion: centralRestoreVersion,
    reanalyzeCurrentSequence: centralReanalyze
  } = useBioSequence();

  // Local Sequence Intelligence Hook
  const {
    rawInput,
    detectedType,
    availableAnalyses,
    isValid,
    validationErrors,
    validationDetails,
    confidence,
    length,
    fastaHeader,
    cleanedSequence,
    updateSequence
  } = useSequenceIntelligence(
    centralSequence || initialSequence || '',
    sourceMetadata,
    (centralSequenceType as any) || (sourceMetadata?.sequenceType as any)
  );

  const [selectedPipeline, setSelectedPipeline] = useState<string>(
    initialPipeline || 'Amino Acid Composition & Charge'
  );
  const [running, setRunning] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState<boolean>(false);
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState<boolean>(false);
  const [copiedSeq, setCopiedSeq] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showRawDiff, setShowRawDiff] = useState(false);
  const [showAllMutations, setShowAllMutations] = useState(false);

  // Sequence Editor Modal State
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);

  // Step 1 & Final: Initial sequence-first screen state
  const [hasRunAnalysis, setHasRunAnalysis] = useState<boolean>(false);
  const [isWhatIfModalOpen, setIsWhatIfModalOpen] = useState<boolean>(false);

  // Reset to initial sequence view when target sequence changes
  const prevSeqIdRef = useRef<string>(centralSequenceId);
  useEffect(() => {
    if (prevSeqIdRef.current !== centralSequenceId) {
      prevSeqIdRef.current = centralSequenceId;
      setHasRunAnalysis(false);
    }
  }, [centralSequenceId]);

  // Load initialSequence ONLY on initial mount if central sequence store is empty
  const initialLoadDoneRef = useRef<boolean>(false);
  useEffect(() => {
    if (!centralSequence && initialSequence && !initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      centralLoadSequence(
        initialSequence,
        sourceMetadata,
        initialAnalysisResult,
        initialPipeline
      );
    }
  }, [initialSequence, centralSequence, sourceMetadata, initialAnalysisResult, initialPipeline, centralLoadSequence]);

  // Keep local intelligence in sync with central sequence without feedback loop
  useEffect(() => {
    if (centralSequence && centralSequence !== rawInput) {
      updateSequence(centralSequence);
    }
  }, [centralSequence, rawInput, updateSequence]);

  // Active Normalized Analysis Record for working copy
  const activeAnalysisResult: NormalizedWorkbenchState | null = useMemo(() => {
    if (centralAnalysisResults) return centralAnalysisResults;
    if (cleanedSequence) {
      try {
        return normalizeAnalysisRecord(initialAnalysisResult, cleanedSequence, sourceMetadata);
      } catch (e) {
        return null;
      }
    }
    return null;
  }, [centralAnalysisResults, cleanedSequence, initialAnalysisResult, sourceMetadata]);

  // Original V1 Analysis Record for Baseline Comparisons
  const originalAnalysisResult: NormalizedWorkbenchState | null = useMemo(() => {
    const v1Item = centralVersionHistory.find((v) => v.versionNumber === 1);
    if (v1Item?.analysisResults) return v1Item.analysisResults;
    if (centralOriginalSequence) {
      try {
        if (centralSequenceType === 'PROTEIN') {
          const prot = analyzeProteinSequence(centralOriginalSequence);
          return {
            type: 'PROTEIN',
            pipeline: selectedPipeline,
            header: centralAccession || 'Original Master',
            sequence: centralOriginalSequence,
            dnaAnalysis: null,
            rnaAnalysis: null,
            proteinAnalysis: prot,
            interpretation: generateProteinInterpretation(prot, sourceMetadata),
            status: 'synchronized',
            message: 'Baseline V1',
            lastUpdated: new Date().toISOString()
          };
        } else {
          const dna = analyzeGCAndORF(centralOriginalSequence, centralSequenceType === 'RNA' ? 'RNA' : 'DNA');
          return {
            type: centralSequenceType === 'RNA' ? 'RNA' : 'DNA',
            pipeline: selectedPipeline,
            header: centralAccession || 'Original Master',
            sequence: centralOriginalSequence,
            dnaAnalysis: dna,
            rnaAnalysis: null,
            proteinAnalysis: null,
            interpretation: generateDNAInterpretation(centralOriginalSequence, dna, sourceMetadata),
            status: 'synchronized',
            message: 'Baseline V1',
            lastUpdated: new Date().toISOString()
          };
        }
      } catch (e) {
        return null;
      }
    }
    return null;
  }, [centralVersionHistory, centralOriginalSequence, centralSequenceType, selectedPipeline, centralAccession, sourceMetadata]);

  // Derived Change Impact Report
  const computedImpactReport: EditedSequenceImpactReport | null = useMemo(() => {
    if (centralImpactReport) return centralImpactReport;
    if (!centralIsModified || !centralOriginalSequence || !centralSequence) return null;
    return evaluateSequenceChangeImpact(centralOriginalSequence, centralSequence, centralSequenceType, centralMutations);
  }, [centralImpactReport, centralIsModified, centralOriginalSequence, centralSequence, centralSequenceType, centralMutations]);

  // Comparative Analysis Report
  const computedComparativeReport: ComparativeAnalysisReport | null = useMemo(() => {
    if (centralComparativeReport) return centralComparativeReport;
    if (!centralIsModified || !centralOriginalSequence || !centralSequence) return null;
    return generateComparativeAnalysisReport({
      originalSequence: centralOriginalSequence,
      modifiedSequence: centralSequence,
      sequenceType: (centralSequenceType === 'UNKNOWN' ? 'PROTEIN' : centralSequenceType) as 'DNA' | 'RNA' | 'PROTEIN',
      pipeline: selectedPipeline,
      mutations: centralMutations,
      sourceMetadata,
      versionNumber: centralVersionNumber,
      originalResults: originalAnalysisResult,
      modifiedResults: activeAnalysisResult
    });
  }, [centralComparativeReport, centralIsModified, centralOriginalSequence, centralSequence, centralSequenceType, selectedPipeline, centralMutations, sourceMetadata, centralVersionNumber, originalAnalysisResult, activeAnalysisResult]);

  /**
   * Run Analysis Pipeline Action
   */
  const handleRunAnalysis = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!isValid || (validationDetails && validationDetails.totalInvalidCount > 0)) {
      setErrorMsg(validationErrors[0] || 'Please resolve all flagged invalid characters before executing analysis.');
      return;
    }

    setRunning(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await centralReanalyze(selectedPipeline);
      setSuccessMsg('Analysis pipeline executed and results synchronized.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to execute analysis pipeline.');
    } finally {
      setRunning(false);
    }
  };

  /**
   * Handler when user finishes edit in SequenceEditorWorkspace
   */
  const handleEditorAnalysisCompleted = async (resultPayload: any, versionJob: any) => {
    const seq = versionJob?.sequenceSnapshot || versionJob?.sequence || cleanedSequence;
    const desc = versionJob?.mutations?.length > 0 ? `${versionJob.mutations.length} mutation(s) applied` : 'Sequence Edited';
    await centralEditSequence(seq, desc, selectedPipeline);
    setIsEditorOpen(false);
  };

  const handleRestoreVersion = (verNum: number) => {
    centralRestoreVersion(verNum);
    setSuccessMsg(`Restored Version ${verNum}. Downstream reports and structure recalculated.`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleCopySequence = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSeq(true);
    setTimeout(() => setCopiedSeq(false), 2000);
  };

  const handleExportJSON = () => {
    if (!activeAnalysisResult) return;
    const exportData = {
      reportTitle: 'Biological Sequence Analysis Report',
      generatedAt: new Date().toISOString(),
      sequenceInformation: {
        accession: centralAccession || 'Custom Target',
        definition: centralDefinition || 'Biological Target',
        organism: centralOrganism || 'Homo sapiens',
        sequenceType: centralSequenceType,
        version: centralVersionNumber,
        versionLabel: centralIsModified ? `Version ${centralVersionNumber} (Working Copy / Uncommitted)` : `Version ${centralVersionNumber} (Committed)`,
        length: centralLength,
        validationStatus: isValid ? 'Passed' : 'Flagged Invalid'
      },
      sequence: centralSequence,
      originalSequence: centralOriginalSequence,
      mutations: centralMutations,
      molecularProperties: centralSequenceType === 'PROTEIN' ? {
        molecularWeightKDa: activeAnalysisResult.proteinAnalysis?.molecularWeightKDa || null,
        molecularWeightDa: activeAnalysisResult.proteinAnalysis?.molecularWeightDa || null,
        isoelectricPoint: activeAnalysisResult.proteinAnalysis?.isoelectricPoint || null,
        gravyScore: activeAnalysisResult.proteinAnalysis?.gravyScore || null,
        netChargeAtPh7: activeAnalysisResult.proteinAnalysis?.netChargeAtPh7 || null,
        peptideBonds: centralLength > 0 ? centralLength - 1 : 0
      } : {
        gcPercentage: activeAnalysisResult.dnaAnalysis?.composition.gcPercentage || null,
        atPercentage: activeAnalysisResult.dnaAnalysis?.composition.atPercentage || null,
        gcCount: activeAnalysisResult.dnaAnalysis?.composition.gcCount || null,
        atCount: activeAnalysisResult.dnaAnalysis?.composition.atCount || null,
        phosphodiesterBonds: centralLength > 0 ? centralLength - 1 : 0,
        orfsCount: activeAnalysisResult.dnaAnalysis?.orfs?.length || 0
      },
      composition: centralSequenceType === 'PROTEIN' 
        ? activeAnalysisResult.proteinAnalysis?.counts || {}
        : activeAnalysisResult.dnaAnalysis?.composition.counts || {},
      comparativeMetrics: computedComparativeReport?.metrics || [],
      structureStatus: centralIsModified ? 'Predicted Model' : centralStructureState.message || 'Synchronized'
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `biocode_report_${centralAccession || 'sequence'}_v${centralVersionNumber}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportPDF = () => {
    generateScientificPdfReport({
      accession: centralAccession || 'Custom Target',
      definition: centralDefinition || 'Biological Target',
      organism: centralOrganism || 'Homo sapiens',
      sequence: centralSequence,
      originalSequence: centralOriginalSequence,
      sequenceType: centralSequenceType,
      versionNumber: centralVersionNumber,
      versionLabel: centralIsModified ? `Version ${centralVersionNumber} (Working Copy / Uncommitted)` : `Version ${centralVersionNumber} (Committed)`,
      isModified: centralIsModified,
      mutations: centralMutations,
      analysisResults: activeAnalysisResult,
      impactReport: computedImpactReport,
      structureInfo: {
        source: centralStructureState?.sourceName || (centralIsModified ? 'BioCode Procedural / AlphaFold Homology Prediction Engine' : 'BioCode Structure Engine'),
        method: centralStructureState?.structureType === 'EXPERIMENTAL' ? 'X-ray Diffraction / Cryo-EM Experimental Model' : '3D Secondary & Tertiary Backbone Conformational Folding Algorithm',
        limitations: centralStructureState?.structureType === 'EXPERIMENTAL'
          ? 'Experimentally determined structure model retrieved from RCSB PDB database.' 
          : 'PREDICTED / PARTIAL IN-SILICO MODEL — NOT EXPERIMENTALLY VERIFIED BY X-RAY CRYSTALLOGRAPHY OR CRYO-EM. Intended for qualitative research assessment only.',
        isPredicted: centralStructureState?.structureType !== 'EXPERIMENTAL'
      }
    });
  };

  // Derived Protein Charge Group Counts
  const proteinChargeCounts = useMemo(() => {
    if (centralSequenceType !== 'PROTEIN' || !activeAnalysisResult?.proteinAnalysis?.counts) {
      return { positive: 0, negative: 0, cysCount: 0 };
    }
    const counts = activeAnalysisResult.proteinAnalysis.counts;
    const positive = (counts['R'] || 0) + (counts['K'] || 0) + (counts['H'] || 0);
    const negative = (counts['D'] || 0) + (counts['E'] || 0);
    const cysCount = counts['C'] || 0;
    return { positive, negative, cysCount };
  }, [centralSequenceType, activeAnalysisResult]);

  // Biological Sequence Header & Display Formatting
  const displayAccession = centralAccession || sourceMetadata?.accession || 'Custom Target';
  const displayDefinition = centralDefinition || (sourceMetadata as any)?.title || sourceMetadata?.definition || 'Biological Target';
  const displayType = centralSequenceType === 'PROTEIN' ? 'PROTEIN' : centralSequenceType === 'RNA' ? 'RNA' : 'DNA';
  const displayOrganism = centralOrganism || sourceMetadata?.organism || 'Homo sapiens';
  const displayLength = centralLength || (centralOriginalSequence ? centralOriginalSequence.length : (sourceMetadata?.totalLength || 0));
  const displayUnit = centralSequenceType === 'PROTEIN' ? 'aa' : 'bp';
  const displayVersion = centralIsModified 
    ? `Version ${centralVersionNumber} — Working Copy`
    : `Version ${centralVersionNumber} — Original`;

  const seqToDisplay = centralSequence || centralOriginalSequence || initialSequence || '';

  // Formatted biological sequence display with line numbers and 60-char wrapped blocks
  const formattedSequenceDisplay = useMemo(() => {
    if (!seqToDisplay) return <span className="text-[#94A3B8] italic">No sequence data available</span>;
    const MAX_CHAR_RENDER = 30000;
    const isCapped = seqToDisplay.length > MAX_CHAR_RENDER;
    const visibleSeq = isCapped ? seqToDisplay.slice(0, MAX_CHAR_RENDER) : seqToDisplay;
    const rows: { start: number; text: string }[] = [];
    for (let i = 0; i < visibleSeq.length; i += 60) {
      rows.push({
        start: i + 1,
        text: visibleSeq.slice(i, i + 60)
      });
    }
    return (
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.start} className="flex gap-4 items-baseline">
            <span className="text-[#64748B] select-none text-[11px] w-12 text-right shrink-0 font-mono">
              {r.start}
            </span>
            <span className="text-[#E2E8F0] tracking-wider break-all font-mono select-text">
              {r.text}
            </span>
          </div>
        ))}
        {isCapped && (
          <div className="p-2 mt-2 rounded bg-amber-950/60 border border-amber-800 text-amber-300 text-[11px] font-mono">
            Showing first {MAX_CHAR_RENDER.toLocaleString()} of {seqToDisplay.length.toLocaleString()} residues.
          </div>
        )}
      </div>
    );
  }, [seqToDisplay]);

  const handleExecuteRunAnalysis = async () => {
    if (!isValid || (validationDetails && validationDetails.totalInvalidCount > 0)) {
      setErrorMsg(validationErrors[0] || 'Please resolve all flagged invalid characters before executing analysis.');
      return;
    }

    setRunning(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const computed = await centralReanalyze(selectedPipeline);
      setHasRunAnalysis(true);

      // Persist completed analysis run to visitor-isolated storage / Supabase
      if (seqToDisplay) {
        const resultToSave = computed || activeAnalysisResult;
        const unitLabel = displayType === 'PROTEIN' ? 'aa' : 'bp';
        bioService.saveCompletedAnalysis(user?.id, {
          sequenceInfo: {
            accession: displayAccession,
            definition: displayDefinition,
            organism: displayOrganism,
            sequence_type: displayType === 'PROTEIN' ? 'Protein' : displayType === 'RNA' ? 'RNA Transcript' : 'Genomic DNA',
            sequence: seqToDisplay,
            total_length: seqToDisplay.length,
            source: sourceMetadata?.source || 'BioCode Sequence Workbench'
          },
          analysisInfo: {
            analysis_type: selectedPipeline,
            sequence_type: displayType,
            project_id: currentProjectId || undefined,
            result_summary: `${selectedPipeline} · ${seqToDisplay.length.toLocaleString()} ${unitLabel}${centralIsModified ? ` (v${centralVersionNumber}, ${centralMutations.length} mutation${centralMutations.length === 1 ? '' : 's'})` : ''}`,
            results: resultToSave || {}
          }
        }).catch((saveErr) => {
          console.warn('[SequenceWorkbench] Non-blocking analysis persistence notice:', saveErr);
        });
      }

      setSuccessMsg('Analysis completed and synchronized.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to execute analysis pipeline.');
    } finally {
      setRunning(false);
    }
  };

  const handleTriggerBioAI = () => {
    if (onOpenAiWithContext) {
      onOpenAiWithContext({
        type: 'sequence',
        accession: displayAccession,
        definition: displayDefinition,
        organism: displayOrganism,
        sequenceType: centralSequenceType,
        sequenceLength: displayLength,
        sequenceData: seqToDisplay,
        originalSequence: centralOriginalSequence || initialSequence || centralSequence || '',
        simulatedSequence: centralIsModified ? centralSequence : undefined,
        isSimulated: centralIsModified,
        mutations: centralMutations,
        mutationSummary: centralMutationSummary,
        selectedAnalysis: selectedPipeline,
        versionInfo: centralVersionLabel
      });
    }
  };

  const displayBiologicalRole = useMemo(() => {
    if ((sourceMetadata as any)?.description) return (sourceMetadata as any).description;
    const knownRoleMap: Record<string, string> = {
      'NP_000537': 'Master tumor suppressor gene transcription factor regulating apoptosis and cell cycle arrest.',
      'NP_000546': 'Tumor suppressor involved in homologous recombination DNA repair (RING domain region).',
      'NP_000198': 'Key metabolic peptide hormone regulating carbohydrate and fat metabolism.',
      'YP_009724390': 'Receptor-binding domain (RBD) interacting with human ACE2 host receptor.',
      'NP_000509': 'Adult hemoglobin beta chain responsible for oxygen transport in erythrocytes.',
      'NC_005816': 'Yersinia pestis plasmid pPCP1 whole genome encoding pesticin and virulence determinants.'
    };
    if (displayAccession && knownRoleMap[displayAccession]) {
      return knownRoleMap[displayAccession];
    }
    if (activeAnalysisResult?.interpretation?.executiveSummary) {
      return activeAnalysisResult.interpretation.executiveSummary;
    }
    if (centralDefinition) {
      return centralDefinition;
    }
    return centralSequenceType === 'PROTEIN' 
      ? 'Catalytic, structural, or regulatory polypeptide synthesized from biological translation.'
      : 'Nucleotide polymer directing hereditary and cellular transcriptional functions.';
  }, [sourceMetadata, displayAccession, activeAnalysisResult, centralDefinition, centralSequenceType]);

  const handleRetryLoadTarget = async () => {
    if (!displayAccession) return;
    setErrorMsg(null);
    setRunning(true);
    try {
      const res = await loadTarget({
        accession: displayAccession,
        source: sourceMetadata?.database === 'NCBI' ? 'NCBI' : 'AUTO',
        sequenceType: (centralSequenceType === 'UNKNOWN' ? 'AUTO' : centralSequenceType) as any,
        definition: displayDefinition,
        organism: displayOrganism,
        metadata: sourceMetadata
      });
      if (!res.success) {
        setErrorMsg(res.error || `Failed to fetch sequence for ${displayAccession}`);
      }
    } catch (e: any) {
      setErrorMsg(e.message || `Failed to fetch sequence for ${displayAccession}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto font-sans">
      {/* Top Breadcrumb Bar */}
      {onBackToExplorer && (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E2E8F0]">
          <button
            type="button"
            onClick={onBackToExplorer}
            className="flex items-center gap-2 text-xs font-semibold text-[#0284C7] hover:text-sky-600 transition-colors cursor-pointer group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Biological Data Explorer</span>
          </button>

          <span className="text-[11px] font-mono text-[#64748B] flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
            <span>NCBI / UniProt / RCSB PDB Active</span>
          </span>
        </div>
      )}

      {/* Global Notifications */}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FINAL DESIGN: SINGLE CONTINUOUS VERTICAL RESEARCH WORKSPACE (NO TABS)     */}
      {/* ========================================================================= */}
      {/* SECTION 1, 2, 3: Sequence at top, Full-width sequence viewer, Action Bar */}
      <SequenceTopWorkspace
        accession={displayAccession}
        definition={displayDefinition}
        sequenceType={displayType}
        organism={displayOrganism}
        length={displayLength}
        unit={displayUnit}
        versionLabel={displayVersion}
        sequence={seqToDisplay}
        isModified={centralIsModified}
        mutationCount={centralMutations.length}
        originalSequence={centralOriginalSequence}
        copied={copiedSeq}
        running={running}
        hasRunAnalysis={hasRunAnalysis}
        isLoadingSequence={isLoadingTarget || (running && !seqToDisplay)}
        sequenceError={targetLoadingError || errorMsg}
        sourceMetadata={sourceMetadata}
        onRetryLoad={handleRetryLoadTarget}
        onCopySequence={handleCopySequence}
        onOpenLoadModal={() => setIsLoadModalOpen(true)}
        onOpenNewModal={() => {
          if (onBackToExplorer) onBackToExplorer();
          else setIsNewModalOpen(true);
        }}
        onOpenEditor={() => setIsEditorOpen(true)}
        onOpenWhatIf={() => setIsWhatIfModalOpen(true)}
        onTriggerBioAI={handleTriggerBioAI}
        onRunAnalysis={handleExecuteRunAnalysis}
        onSanitizeSequence={(sanitizedSeq) => {
          centralEditSequence(sanitizedSeq, 'Sanitized non-IUPAC FASTA characters');
          setSuccessMsg('FASTA sequence sanitized successfully. Removed invalid residues.');
          setTimeout(() => setSuccessMsg(null), 3000);
        }}
      />

      {/* SECTION 4, 5, etc.: AFTER RUN ANALYSIS OR WHEN MODIFIED (REVEALED BELOW IN VERTICAL WORKFLOW) */}
      {(hasRunAnalysis || centralIsModified) && (
        <SequenceAnalysisResults
          accession={displayAccession}
          definition={displayDefinition}
          sequenceType={displayType}
          organism={displayOrganism}
          length={displayLength}
          unit={displayUnit}
          sequence={centralSequence}
          originalSequence={centralOriginalSequence || initialSequence || centralSequence || ''}
          simulatedSequence={centralSimulatedSequence}
          simulationResult={centralSimulationResult}
          versionNumber={centralVersionNumber}
          isModified={centralIsModified}
          mutations={centralMutations}
          activeAnalysisResult={activeAnalysisResult}
          originalAnalysisResult={originalAnalysisResult}
          biologicalRole={displayBiologicalRole}
          isSaving={isSaving}
          copiedSeq={copiedSeq}
          onCopySequence={handleCopySequence}
          onDiscardChanges={() => {
            centralDiscardWorkingCopy();
            setSuccessMsg('Working copy discarded. Restored original sequence.');
            setTimeout(() => setSuccessMsg(null), 3000);
          }}
          onApplyChanges={async () => {
            setIsSaving(true);
            const ok = await centralApplyWorkingCopy(undefined, selectedPipeline, currentProjectId || undefined);
            setIsSaving(false);
            if (ok) {
              setSuccessMsg(`Changes applied! Created Version ${centralVersionNumber + 1}.`);
              setTimeout(() => setSuccessMsg(null), 3500);
            }
          }}
          onExportPDF={handleExportPDF}
          onExportJSON={handleExportJSON}
        />
      )}

      {/* What-If Simulator Modal */}
      {isWhatIfModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-5xl max-h-[92dvh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="flex items-center justify-between gap-2 p-3.5 sm:p-4 md:px-6 border-b border-[#E2E8F0] bg-slate-50 sticky top-0 z-10">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                <h3 className="font-bold text-sm text-[#0F172A] font-mono">What-If Simulator</h3>
                <span className="text-xs text-[#64748B] font-mono truncate">({displayAccession})</span>
              </div>
              <button
                type="button"
                onClick={() => setIsWhatIfModalOpen(false)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
                title="Close What-If Simulator"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3.5 sm:p-4 md:p-6">
              <BioErrorBoundary moduleName="Residue What-If Simulator" onReset={() => setIsWhatIfModalOpen(false)}>
                <ResidueWhatIfSimulator
                  onApplied={() => {
                    setIsWhatIfModalOpen(false);
                    setHasRunAnalysis(true);
                    setSuccessMsg('What-If mutations applied to working copy.');
                    setTimeout(() => setSuccessMsg(null), 3000);
                  }}
                  onClose={() => setIsWhatIfModalOpen(false)}
                />
              </BioErrorBoundary>
            </div>
          </div>
        </div>
      )}

      {/* Sequence Editor Modal */}
      {isEditorOpen && (
        <BioErrorBoundary moduleName="Sequence Editor Workspace" onReset={() => setIsEditorOpen(false)}>
          <SequenceEditorWorkspace
            originalSequence={centralOriginalSequence || initialSequence || cleanedSequence || ''}
            sequenceType={(centralSequenceType as 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN') || 'PROTEIN'}
            sourceAccession={centralAccession}
            sourceRecordId={centralAccession}
            sourceMetadata={sourceMetadata}
            currentPipeline={selectedPipeline}
            versionNumber={centralVersionNumber}
            initialMutations={centralMutations}
            onClose={() => setIsEditorOpen(false)}
            onAnalysisCompleted={handleEditorAnalysisCompleted}
            isAnalyzing={running}
          />
        </BioErrorBoundary>
      )}

      {/* Load Sequence Modal */}
      <LoadSequenceModal
        isOpen={isLoadModalOpen}
        onClose={() => setIsLoadModalOpen(false)}
        onOpenExplorer={onBackToExplorer}
      />

      {/* New Custom Sequence Modal */}
      <NewSequenceModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
      />

      {/* SQL Migration Modal */}
      <SqlMigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
      />
    </div>
  );
};
