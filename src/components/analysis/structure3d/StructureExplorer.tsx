import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ResolvedStructure3D, 
  RepresentationMode, 
  ColorScheme,
  StructureStatusState
} from '../../../lib/bio/structure3d/types';
import { 
  resolveMacromolecularStructure, 
  computeClientSequenceHash 
} from '../../../lib/bio/structure3d/structureResolver';
import { 
  buildSequenceToStructureMapping, 
  getStructureCoverageMetrics, 
  evaluateMutationMapping, 
  canModelMutatedStructure,
  isResidueModeledInStructure
} from '../../../lib/bio/structure3d/residueMapping';
import { Scientific3DStructureViewer } from './Scientific3DStructureViewer';
import { SequenceType } from '../../../lib/bio/types';
import { SequenceMutation } from '../../../lib/bio/editor/types';
import { computeMutationsFromSequences } from '../../../lib/bio/editor/mutationEngine';
import { WhatIfSimulationResult } from '../../../lib/bio/whatIfSimulator';
import { useBioSequence } from '../../../context/BioSequenceContext';
import { diagnoseStructurePipeline } from '../../../lib/bio/structure3d/structureDiagnostics';

const EMPTY_MUTATIONS: SequenceMutation[] = [];
import { 
  Box, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  RefreshCw, 
  Sparkles, 
  Info, 
  Maximize2, 
  Database,
  Sliders,
  RotateCcw,
  ExternalLink,
  Activity,
  ArrowRight,
  Layers,
  Compass,
  Crosshair,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

export interface StructureExplorerProps {
  sequence: string;
  sequenceType?: SequenceType;
  accession?: string;
  sequenceId?: string;
  sequenceVersion?: string;
  originalSequence?: string;
  simulatedSequence?: string | null;
  simulationResult?: WhatIfSimulationResult | null;
  mutations?: SequenceMutation[];
  onOpenAiWithContext?: (context: any) => void;
  className?: string;
}

const AA_NAMES: Record<string, string> = {
  A: 'Alanine', R: 'Arginine', N: 'Asparagine', D: 'Aspartic Acid', C: 'Cysteine',
  Q: 'Glutamine', E: 'Glutamic Acid', G: 'Glycine', H: 'Histidine', I: 'Isoleucine',
  L: 'Leucine', K: 'Lysine', M: 'Methionine', F: 'Phenylalanine', P: 'Proline',
  S: 'Serine', T: 'Threonine', W: 'Tryptophan', Y: 'Tyrosine', V: 'Valine'
};

export const StructureExplorer: React.FC<StructureExplorerProps> = ({
  sequence,
  sequenceType = 'PROTEIN',
  accession = '',
  sequenceId = 'seq_active',
  sequenceVersion = 'v1',
  originalSequence,
  simulatedSequence,
  simulationResult,
  mutations = [],
  className = ''
}) => {
  // Shared context What-If simulation state (Single Source of Truth)
  const {
    simulatedSequence: contextSimSeq,
    simulationResult: contextSimResult
  } = useBioSequence();

  const activeSimResult = simulationResult !== undefined ? simulationResult : contextSimResult;

  const cleanSeq = useMemo(() => sequence.toUpperCase().replace(/[^A-Z]/g, ''), [sequence]);
  const origCleanSeq = useMemo(() => {
    return originalSequence ? originalSequence.toUpperCase().replace(/[^A-Z]/g, '') : cleanSeq;
  }, [originalSequence, cleanSeq]);

  const displayAccession = accession || (sequenceType === 'PROTEIN' ? 'Active Target Protein' : 'Active Target Sequence');

  // Derive explicit point mutations for the active sequence (substitutions, insertions, deletions)
  const detectedMutations = useMemo(() => {
    if (mutations && mutations.length > 0) return mutations;
    if (!originalSequence) return EMPTY_MUTATIONS;

    const origClean = originalSequence.toUpperCase().replace(/[^A-Z]/g, '');
    const currentClean = cleanSeq;
    if (origClean && currentClean && origClean !== currentClean) {
      return computeMutationsFromSequences(origClean, currentClean, sequenceType);
    }
    return EMPTY_MUTATIONS;
  }, [mutations, originalSequence, cleanSeq, sequenceType]);

  const detectedMutationsKey = useMemo(() => {
    if (!detectedMutations || detectedMutations.length === 0) return '';
    return detectedMutations
      .map(m => `${m.position}:${m.original}>${m.modified}:${m.operation}`)
      .join(';');
  }, [detectedMutations]);

  const hasWorkingModifications = Boolean(
    (mutations && mutations.length > 0) || 
    (cleanSeq && origCleanSeq && cleanSeq !== origCleanSeq)
  );

  // Toggle state: [ Original ] vs [ Simulated / Modified ] (Requirements 5 & 14)
  const [previewMode, setPreviewMode] = useState<'simulated' | 'original' | 'modified'>(() => {
    if (activeSimResult) return 'simulated';
    if (hasWorkingModifications) return 'modified';
    return 'original';
  });

  // TWO INDEPENDENT STRUCTURE MODELS (Requirements 8, 9, 10)
  const [originalStructureModel, setOriginalStructureModel] = useState<ResolvedStructure3D | null>(null);
  const [originalStatus, setOriginalStatus] = useState<'SYNCHRONIZED' | 'COMPUTING' | 'FAILED' | 'UNAVAILABLE'>('COMPUTING');
  const [originalError, setOriginalError] = useState<string | null>(null);

  const [modifiedStructureModel, setModifiedStructureModel] = useState<ResolvedStructure3D | null>(null);
  const [modifiedStatus, setModifiedStatus] = useState<'SYNCHRONIZED' | 'COMPUTING' | 'FAILED' | 'UNAVAILABLE'>('SYNCHRONIZED');
  const [modifiedError, setModifiedError] = useState<string | null>(null);
  const [modifiedUnavailableReason, setModifiedUnavailableReason] = useState<string | null>(null);

  const [loadingPhase, setLoadingPhase] = useState<string>('Preparing active sequence...');
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  // Visualization Controls State
  const [representation, setRepresentation] = useState<RepresentationMode>('ribbon');
  const [colorScheme, setColorScheme] = useState<ColorScheme>('secondary_structure');
  const [selectedResSeq, setSelectedResSeq] = useState<number | null>(
    activeSimResult ? activeSimResult.summary.position : null
  );
  const [resetViewTrigger, setResetViewTrigger] = useState<number>(0);
  const [centerTrigger, setCenterTrigger] = useState<number>(0);
  const [zoomInTrigger, setZoomInTrigger] = useState<number>(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState<number>(0);

  const prevSimRef = useRef<any>(activeSimResult);
  const prevModRef = useRef<boolean>(hasWorkingModifications);

  useEffect(() => {
    if (activeSimResult !== prevSimRef.current) {
      prevSimRef.current = activeSimResult;
      if (activeSimResult) {
        setPreviewMode('simulated');
        setSelectedResSeq(activeSimResult.summary.position);
      } else if (hasWorkingModifications) {
        setPreviewMode('modified');
        setSelectedResSeq(detectedMutations.length > 0 ? detectedMutations[0].position : null);
      } else {
        setPreviewMode('original');
        setSelectedResSeq(null);
      }
    } else if (hasWorkingModifications !== prevModRef.current) {
      prevModRef.current = hasWorkingModifications;
      if (hasWorkingModifications && !activeSimResult) {
        setPreviewMode('modified');
        if (detectedMutations.length > 0) {
          setSelectedResSeq(detectedMutations[0].position);
        }
      } else if (!hasWorkingModifications && !activeSimResult) {
        setPreviewMode('original');
        setSelectedResSeq(null);
      }
    }
  }, [activeSimResult, hasWorkingModifications, detectedMutationsKey]);

  // Determine which sequence variant to resolve and display
  const isSimulationActive = Boolean(activeSimResult && previewMode === 'simulated');

  const targetModSeq = useMemo(() => {
    if (isSimulationActive && activeSimResult) {
      return activeSimResult.simulatedSequence.toUpperCase().replace(/[^A-Z]/g, '');
    }
    return cleanSeq;
  }, [isSimulationActive, activeSimResult, cleanSeq]);

  const targetMutations = useMemo(() => {
    if (isSimulationActive && activeSimResult) {
      if (activeSimResult.mutations && activeSimResult.mutations.length > 0) {
        return activeSimResult.mutations;
      }
      return [activeSimResult.mutation];
    }
    if (previewMode === 'original') {
      return EMPTY_MUTATIONS;
    }
    return detectedMutations;
  }, [isSimulationActive, activeSimResult, previewMode, detectedMutations]);

  const targetMutationsKey = useMemo(() => {
    if (!targetMutations || targetMutations.length === 0) return '';
    return targetMutations
      .map(m => `${m.position}:${m.original}>${m.modified}:${m.operation}`)
      .join(';');
  }, [targetMutations]);

  const isOriginalMode = previewMode === 'original';
  const targetSeq = isOriginalMode ? origCleanSeq : targetModSeq;
  const targetVersion = useMemo(() => {
    if (isSimulationActive) {
      return 'What-If Simulation Preview';
    }
    if (previewMode === 'original') {
      return 'V1 (Original Master)';
    }
    return sequenceVersion || 'V1 (Working Copy)';
  }, [isSimulationActive, previewMode, sequenceVersion]);

  // Timer Ref for Elapsed Time
  const startTimeRef = useRef<number>(0);

  // 1. RESOLVE ORIGINAL BASELINE STRUCTURE MODEL (Requirement 1 & 8)
  useEffect(() => {
    if (!origCleanSeq || origCleanSeq.length < 4) {
      setOriginalStructureModel(null);
      setOriginalStatus('UNAVAILABLE');
      return;
    }

    setOriginalStatus(prev => prev === 'COMPUTING' ? prev : 'COMPUTING');
    let isCancelled = false;

    const t = setTimeout(async () => {
      try {
        const resolved = await resolveMacromolecularStructure({
          sequence: origCleanSeq,
          sequenceType,
          accessionOrPdbId: accession,
          sequenceId: `${sequenceId}_orig`,
          sequenceVersion: 'V1 (Original Master)',
          sequenceHash: computeClientSequenceHash(origCleanSeq),
          mutations: [],
          allowSequenceDerivedFallback: true,
          title: `Baseline 3D Structure (${displayAccession})`
        });
        if (isCancelled) return;

        // Trace pipeline diagnostics for current target ID non-blockingly
        diagnoseStructurePipeline({
          targetId: accession || sequenceId || 'orig_target',
          sequence: origCleanSeq,
          sequenceType,
          existingStructure: resolved
        }).catch(e => console.warn('[Structure Diagnostics]', e));

        if (resolved.structureType === 'UNAVAILABLE') {
          setOriginalStructureModel(null);
          setOriginalStatus('UNAVAILABLE');
          setOriginalError(resolved.confidenceInfo?.description || 'No 3D experimental or computational coordinates available for this sequence.');
        } else {
          setOriginalStructureModel(resolved);
          setOriginalStatus('SYNCHRONIZED');
          setOriginalError(null);
        }
      } catch (err: any) {
        if (isCancelled) return;
        setOriginalStatus('FAILED');
        setOriginalError(err?.message || 'Failed to resolve original structure.');
      }
    }, 200);

    return () => {
      isCancelled = true;
      clearTimeout(t);
    };
  }, [origCleanSeq, sequenceType, accession, sequenceId, displayAccession]);

  // 2. RESOLVE MODIFIED STRUCTURE MODEL (Requirements 1, 3, 5, 6, 7, 9, 10, 15)
  // Complete workflow: Original Sequence -> Original Structure -> Modified Sequence -> Generate/obtain model -> Mutated Structure -> Compare
  const hasModifications = Boolean(hasWorkingModifications || isSimulationActive);
  const origModelId = originalStructureModel?.id || originalStructureModel?.sourceId || '';

  useEffect(() => {
    if (!hasModifications) {
      setModifiedStructureModel(prev => prev ? null : prev);
      setModifiedStatus(prev => prev === 'SYNCHRONIZED' ? prev : 'SYNCHRONIZED');
      setModifiedUnavailableReason(prev => prev ? null : prev);
      return;
    }

    if (targetModSeq.length < 4) {
      setModifiedStructureModel(prev => prev ? null : prev);
      setModifiedStatus(prev => prev === 'UNAVAILABLE' ? prev : 'UNAVAILABLE');
      setModifiedUnavailableReason('Sequence length is insufficient (< 4 residues) to model tertiary fold.');
      return;
    }

    if (originalStatus === 'COMPUTING') {
      setModifiedStatus('COMPUTING');
      setLoadingPhase('Waiting for baseline structure...');
      return;
    }

    // Clean asynchronous structure-generation states:
    setModifiedStatus(prev => prev === 'COMPUTING' ? prev : 'COMPUTING');
    setLoadingPhase('Preparing modified structure...');
    let isCancelled = false;

    const phaseTimer1 = setTimeout(() => {
      if (!isCancelled) setLoadingPhase('Generating structural model...');
    }, 250);

    const phaseTimer2 = setTimeout(() => {
      if (!isCancelled) setLoadingPhase('Loading coordinates...');
    }, 600);

    const t = setTimeout(async () => {
      try {
        const resolved = await resolveMacromolecularStructure({
          sequence: targetModSeq,
          sequenceType,
          accessionOrPdbId: accession,
          sequenceId: `${sequenceId}_mod`,
          sequenceVersion: isSimulationActive ? 'What-If Simulation Preview' : (sequenceVersion || 'V2 (Modified)'),
          sequenceHash: computeClientSequenceHash(targetModSeq) + `_mut_${targetMutations.length}`,
          mutations: targetMutations,
          allowSequenceDerivedFallback: true,
          originalSequence: origCleanSeq,
          templatePdbId: originalStructureModel?.sourceId,
          templatePdbText: originalStructureModel?.rawPdbText,
          title: isSimulationActive
            ? `What-If Simulation Preview (${activeSimResult?.summary.description})`
            : `Modified 3D Structure (${displayAccession})`,
          onProgress: (phase) => {
            if (!isCancelled) setLoadingPhase(phase);
          }
        });
        if (isCancelled) return;

        // Trace pipeline diagnostics for current target ID non-blockingly
        diagnoseStructurePipeline({
          targetId: `${accession || sequenceId}_mod`,
          sequence: targetModSeq,
          sequenceType,
          mutations: targetMutations,
          existingStructure: resolved
        }).catch(e => console.warn('[Structure Diagnostics]', e));

        if (resolved.structureType === 'UNAVAILABLE') {
          setModifiedStructureModel(null);
          setModifiedStatus('UNAVAILABLE');
          setModifiedUnavailableReason(
            resolved.confidenceInfo?.description ||
            'Structural prediction/modeling is required for this modified sequence. No template or prediction coordinates available.'
          );
        } else {
          setLoadingPhase('Structure ready');
          setModifiedStructureModel(resolved);
          setModifiedStatus('SYNCHRONIZED');
          setModifiedUnavailableReason(null);
        }
      } catch (err: any) {
        if (isCancelled) return;
        setModifiedStatus('FAILED');
        setModifiedError(err?.message || 'Failed to resolve modified structure.');
      }
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(phaseTimer1);
      clearTimeout(phaseTimer2);
      clearTimeout(t);
    };
  }, [hasModifications, targetModSeq, sequenceType, accession, sequenceId, sequenceVersion, isSimulationActive, activeSimResult, targetMutationsKey, displayAccession, origCleanSeq, origModelId, originalStatus]);


  // Active Structure Selection (Stored Separately: originalStructureModel vs modifiedStructureModel)
  const activeStructure = isOriginalMode ? originalStructureModel : modifiedStructureModel;
  const activeStatus = isOriginalMode ? originalStatus : modifiedStatus;
  const isModifiedUnavailable = !isOriginalMode && (modifiedStatus === 'UNAVAILABLE' || (!modifiedStructureModel && hasModifications && modifiedStatus !== 'COMPUTING'));

  // Sequence to structure residue mapping (Requirement 3 & 4)
  const residueMapping = useMemo(() => {
    return buildSequenceToStructureMapping(targetSeq, activeStructure);
  }, [targetSeq, activeStructure]);

  // Real Coverage Metrics (Requirement 2 & 9)
  const coverageMetrics = useMemo(() => {
    return getStructureCoverageMetrics(residueMapping, targetSeq.length);
  }, [residueMapping, targetSeq.length]);

  // Evaluated Mutations mapped to structure (Requirement 4 & 7)
  const evaluatedMutations = useMemo(() => {
    return evaluateMutationMapping(targetMutations, residueMapping);
  }, [targetMutations, residueMapping]);

  // Classification Categories (Requirement 8 & 16)
  // Structure Status: Generating | Ready | Partial | Unavailable
  const isPartialStatus = coverageMetrics.isPartial && coverageMetrics.coveredCount > 0;
  
  type DisplayStructureStatus = 'Generating' | 'Ready' | 'Partial' | 'Unavailable';

  const currentDisplayStatus: DisplayStructureStatus = useMemo(() => {
    if (activeStatus === 'COMPUTING') {
      return 'Generating';
    }
    if (isModifiedUnavailable || activeStatus === 'UNAVAILABLE' || activeStatus === 'FAILED' || !activeStructure || activeStructure.structureType === 'UNAVAILABLE') {
      return 'Unavailable';
    }
    if (isPartialStatus) {
      return 'Partial';
    }
    return 'Ready';
  }, [activeStatus, isModifiedUnavailable, activeStructure, isPartialStatus]);

  let structureStatus: StructureStatusState;
  if (isModifiedUnavailable || activeStatus === 'UNAVAILABLE' || !activeStructure || activeStructure.structureType === 'UNAVAILABLE') {
    structureStatus = 'UNAVAILABLE';
  } else if (isPartialStatus) {
    structureStatus = 'PARTIAL';
  } else if (activeStructure.structureType === 'EXPERIMENTAL') {
    structureStatus = 'EXPERIMENTAL';
  } else if (activeStructure.structureType === 'PREDICTED') {
    structureStatus = 'PREDICTED';
  } else if (activeStructure.structureType === 'PARTIAL') {
    structureStatus = 'PARTIAL';
  } else {
    structureStatus = 'SEQUENCE_DERIVED';
  }

  const isExperimental = structureStatus === 'EXPERIMENTAL';
  const isPredicted = structureStatus === 'PREDICTED';
  const isSequenceDerived = structureStatus === 'SEQUENCE_DERIVED';
  const isUnavailable = structureStatus === 'UNAVAILABLE';

  const startRes = coverageMetrics.startResSeq;
  const endRes = coverageMetrics.endResSeq;
  const totalSeqLen = coverageMetrics.totalCount;
  const covPercent = coverageMetrics.coveragePercent;

  // Structure Information Fields (Strict Scientific Labeling)
  const statusLabel = isUnavailable
    ? (isModifiedUnavailable ? 'Modified structure unavailable' : 'Structure Unavailable')
    : isPartialStatus
    ? (activeStructure?.structureType === 'EXPERIMENTAL'
        ? `Partial Experimental Structure (${covPercent}%)`
        : `Partial Structure (${covPercent}%)`)
    : isExperimental
    ? 'Experimental Structure'
    : isPredicted
    ? 'Predicted Structure'
    : 'Sequence-Derived Visualization';

  const sourceLabel = isUnavailable
    ? 'None'
    : isExperimental
    ? (activeStructure?.sourceName || 'RCSB PDB')
    : isPredicted
    ? (activeStructure?.sourceName || 'Homology Mutation Model')
    : isPartialStatus
    ? (activeStructure?.sourceName || 'Partial Structure Model')
    : 'Algorithmic Secondary Fold Engine';

  const structureIdLabel = isUnavailable
    ? 'None'
    : activeStructure?.sourceId || activeStructure?.pdbId || (isExperimental ? 'PDB Entry' : isPredicted ? 'Predicted Model' : isPartialStatus ? 'PARTIAL-MODEL' : 'SEQ-MODEL');

  const chainLabel = isUnavailable
    ? 'None'
    : activeStructure?.coverageInfo?.chain
    ? `Chain ${activeStructure.coverageInfo.chain}`
    : activeStructure?.chains?.[0]?.id
    ? `Chain ${activeStructure.chains[0].id}`
    : 'Chain A';

  const coverageLabel = isUnavailable
    ? 'None'
    : isSequenceDerived
    ? 'Unresolved (Sequence-Derived Visualization)'
    : coverageMetrics.coverageLabel;

  const resolutionLabel = isUnavailable
    ? 'None'
    : activeStructure?.resolutionText ||
      (activeStructure?.resolutionAngstrom ? `${activeStructure.resolutionAngstrom} Å` : (isPredicted ? 'Prediction Model' : 'Not applicable'));

  // Check whether simulated mutated residue is mapped/covered in 3D (Requirement 4)
  const simMutPos = activeSimResult ? activeSimResult.summary.position : null;
  const isMutResidueCovered = useMemo(() => {
    if (!simMutPos) return false;
    return isResidueModeledInStructure(residueMapping, simMutPos);
  }, [simMutPos, residueMapping]);

  const hasMutations = Boolean(activeSimResult || detectedMutations.length > 0);

  return (
    <div className={`bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs flex flex-col font-sans text-[#0F172A] ${className}`}>
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP HEADER: 3D MOLECULAR STRUCTURE & STATUS                */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white border-b border-[#E2E8F0] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shadow-2xs shrink-0">
            <Box className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold font-mono tracking-tight text-[#0F172A]">
                3D Molecular Structure
              </h2>
              {/* Structure Status Badge (Requirement 16: Generating | Ready | Partial | Unavailable) */}
              <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border font-bold flex items-center gap-1.5 ${
                currentDisplayStatus === 'Generating'
                  ? 'text-sky-800 bg-sky-50 border-sky-300 animate-pulse'
                  : currentDisplayStatus === 'Unavailable'
                  ? 'text-slate-700 bg-slate-100 border-slate-300'
                  : currentDisplayStatus === 'Partial'
                  ? 'text-amber-800 bg-amber-50 border-amber-300'
                  : 'text-emerald-700 bg-emerald-50 border-emerald-200'
              }`}>
                {currentDisplayStatus === 'Generating' ? (
                  <Loader2 className="w-3 h-3 animate-spin text-sky-600" />
                ) : (
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    currentDisplayStatus === 'Unavailable'
                      ? 'bg-slate-400'
                      : currentDisplayStatus === 'Partial'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`} />
                )}
                <span>
                  {currentDisplayStatus === 'Generating'
                    ? 'Structure Status: Generating'
                    : currentDisplayStatus === 'Unavailable'
                    ? 'Structure Status: Unavailable'
                    : currentDisplayStatus === 'Partial'
                    ? `Structure Status: Partial (${covPercent}%)`
                    : 'Structure Status: Ready'}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono mt-0.5 text-slate-500">
              <span className="font-semibold text-[#0F172A]">{displayAccession}</span>
              <span>·</span>
              <span>{targetSeq.length} {sequenceType === 'PROTEIN' ? 'aa' : 'bp'}</span>
              <span>·</span>
              <span className="text-slate-400">{targetVersion}</span>
            </div>
          </div>
        </div>

        {/* Original vs Mutated Toggle if mutations exist */}
        {hasMutations && (
          <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-1 font-mono text-xs self-start sm:self-auto shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setPreviewMode('original');
                setSelectedResSeq(null);
              }}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                previewMode === 'original'
                  ? 'bg-sky-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              Original Structure
            </button>
            <button
              type="button"
              onClick={() => {
                setPreviewMode(activeSimResult ? 'simulated' : 'modified');
                if (simMutPos) setSelectedResSeq(simMutPos);
                else if (detectedMutations[0]) setSelectedResSeq(detectedMutations[0].position);
              }}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                previewMode !== 'original'
                  ? 'bg-purple-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              {activeSimResult ? 'Simulated Structure' : 'Mutated Structure'}
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. NOTICE BANNERS & CHANGED RESIDUE HIGHLIGHT (Req 3,4,7,12)  */}
      {/* ------------------------------------------------------------- */}
      {isSimulationActive && (
        <div className="bg-purple-50 border-b border-purple-200 px-5 py-2.5 text-xs font-mono text-purple-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-purple-600 shrink-0" />
            <span>
              Experimental structure represents V1; simulated V2 structure is derived in-silico.
            </span>
          </div>
          <span className="text-[10px] text-purple-700 bg-purple-100 px-2 py-0.5 rounded border border-purple-200 hidden sm:inline font-bold">
            In-Silico Simulation
          </span>
        </div>
      )}

      {/* Changed Residue Highlight Banner */}
      {targetMutations.length > 0 && previewMode !== 'original' && (
        <div className="bg-rose-50/70 border-b border-rose-200 px-5 py-2.5 text-xs font-mono flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <span className="font-bold text-[#0F172A]">
              {targetMutations.length} Changed Residue{targetMutations.length > 1 ? 's' : ''} Mapped:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {evaluatedMutations.map((m) => {
                const isSel = selectedResSeq === m.position;
                return (
                  <button
                    key={m.id || `mut_chip_${m.position}`}
                    type="button"
                    onClick={() => {
                      if (m.isModeled) {
                        setSelectedResSeq(m.position);
                        setColorScheme('mutation_delta');
                      }
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1 shadow-2xs ${
                      isSel
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : m.isModeled
                        ? 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                        : 'bg-amber-50 text-amber-800 border-amber-200 opacity-80'
                    }`}
                    title={
                      m.isModeled
                        ? `Focus 3D View on Residue ${m.position}`
                        : `Residue ${m.position} is outside structure coverage (${startRes}–${endRes})`
                    }
                  >
                    <span>{m.original}{m.position}{m.modified}</span>
                    {!m.isModeled && <span className="text-[9px] text-amber-600 font-normal">(Unmodeled)</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded border font-mono font-bold bg-white text-sky-700 border-sky-200 shadow-2xs">
            {evaluatedMutations.filter((m) => m.isModeled).length}/{evaluatedMutations.length} in 3D Model
          </span>
        </div>
      )}

      {/* When simulation/mutation exists but user toggled to [ Original ] view */}
      {hasMutations && previewMode === 'original' && (
        <div className="bg-sky-50/70 border-b border-sky-200 px-5 py-2.5 text-xs font-mono text-sky-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-sky-600 shrink-0" />
            <span>Displaying Original V1 Baseline Structure (Unmodified).</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setPreviewMode(activeSimResult ? 'simulated' : 'modified');
              if (simMutPos) setSelectedResSeq(simMutPos);
              else if (detectedMutations[0]) setSelectedResSeq(detectedMutations[0].position);
            }}
            className="text-sky-700 hover:underline font-bold text-[11px] cursor-pointer"
          >
            Switch to Mutated View →
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. PARTIAL STRUCTURE COVERAGE & RESIDUE TRACK                 */}
      {/* ------------------------------------------------------------- */}
      {(isPartialStatus || isExperimental || isPredicted) && coverageMetrics.coveredCount > 0 && (
        <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] p-4 sm:p-5 space-y-3 font-mono">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isPartialStatus ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <h4 className="font-bold uppercase tracking-wider text-[#0F172A]">
                {previewMode === 'original' ? 'ORIGINAL STRUCTURE' : 'MODIFIED STRUCTURE'}
              </h4>
              <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${
                isPartialStatus
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}>
                Coverage: {coverageMetrics.coveredCount} / {totalSeqLen} residues ({covPercent}%)
              </span>
            </div>

            <div className="text-[11px] text-slate-500">
              Residues <strong className="text-sky-700">{startRes}–{endRes}</strong> of <strong className="text-[#0F172A]">{totalSeqLen}</strong> in Model ({coverageMetrics.coveredCount} residues, {covPercent}%)
            </div>
          </div>

          {/* Interactive Horizontal Sequence Coverage Bar */}
          <div className="space-y-1.5">
            <div className="w-full h-7 bg-white border border-[#CBD5E1] rounded-lg relative overflow-hidden flex shadow-2xs">
              {/* N-terminal Unmodeled Region */}
              {startRes > 1 && (
                <div 
                  style={{ width: `${((startRes - 1) / totalSeqLen) * 100}%` }}
                  className="h-full bg-slate-100 border-r border-[#CBD5E1] relative flex items-center justify-center text-[10px] text-slate-500 select-none"
                  title={`Unmodeled N-terminal region: 1–${startRes - 1}`}
                >
                  <span className="truncate px-1 hidden sm:inline">1–{startRes - 1} Unmodeled</span>
                </div>
              )}

              {/* Resolved Core Domain in 3D */}
              <div
                style={{ width: `${((endRes - startRes + 1) / totalSeqLen) * 100}%` }}
                className={`h-full relative flex items-center justify-center text-[11px] font-bold select-none transition-all ${
                  isSimulationActive || previewMode !== 'original'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs'
                    : isExperimental
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs'
                    : isPartialStatus
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-xs'
                    : 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white shadow-xs'
                }`}
                title={`3D Structure Coverage: Residues ${startRes}–${endRes}`}
              >
                <span className="truncate px-2">
                  Atomic Model Coverage ({startRes}–{endRes})
                </span>
              </div>

              {/* C-terminal Unmodeled Region */}
              {endRes < totalSeqLen && (
                <div 
                  style={{ width: `${((totalSeqLen - endRes) / totalSeqLen) * 100}%` }}
                  className="h-full bg-slate-100 border-l border-[#CBD5E1] relative flex items-center justify-center text-[10px] text-slate-500 select-none"
                  title={`Unmodeled C-terminal region: ${endRes + 1}–${totalSeqLen}`}
                >
                  <span className="truncate px-1 hidden sm:inline">{endRes + 1}–{totalSeqLen} Unmodeled</span>
                </div>
              )}

              {/* Mutation Pin Overlays: only for modeled mutations */}
              {evaluatedMutations.filter((m) => m.isModeled).map((m) => {
                const pct = Math.max(0, Math.min(100, (m.position / totalSeqLen) * 100));
                return (
                  <div
                    key={`pin_${m.position}`}
                    style={{ left: `${pct}%` }}
                    onClick={() => {
                      setSelectedResSeq(m.position);
                      setColorScheme('mutation_delta');
                    }}
                    className="absolute top-0 bottom-0 w-2.5 -ml-1.5 cursor-pointer z-10 flex flex-col items-center justify-between hover:scale-125"
                    title={`Mutation: ${m.original}${m.position}${m.modified} (In 3D Model)`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-white shadow-md animate-pulse" />
                    <span className="w-0.5 h-full bg-rose-500" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sequence-Derived Notice Banner (Requirement 1 & 9: Strict scientific integrity) */}
      {isSequenceDerived && !isUnavailable && (
        <div className="bg-sky-50/70 border-b border-sky-200 px-5 py-2.5 text-xs font-mono text-sky-900 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-sky-600 shrink-0" />
            <span>
              <strong>Sequence-Derived Visualization:</strong> Algorithmic secondary fold model for exploratory sequence visualization. Not experimentally determined coordinates.
            </span>
          </div>
          <span className="text-[10px] text-sky-700 bg-white px-2 py-0.5 rounded border border-sky-200 font-bold shrink-0 shadow-2xs">
            Secondary Structure Model
          </span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. MAIN 3D STRUCTURE VIEWPORT                                 */}
      {/* ------------------------------------------------------------- */}
      <div className="relative w-full h-[480px] min-h-[440px] bg-[#F8FAFC] flex items-center justify-center overflow-hidden">
        {activeStatus === 'COMPUTING' ? (
          <div className="p-8 flex flex-col items-center justify-center space-y-4 max-w-md mx-auto text-center z-20">
            <div className="w-14 h-14 rounded-2xl bg-white border border-[#CBD5E1] flex items-center justify-center text-sky-600 shadow-md animate-spin">
              <RefreshCw className="w-7 h-7 text-sky-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold font-mono text-[#0F172A] tracking-wider uppercase">
                {isSimulationActive ? 'PREPARING WHAT-IF STRUCTURE PREVIEW' : 'RESOLVING 3D MACROMOLECULE'}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {loadingPhase}
              </p>
            </div>
            <div className="text-[11px] font-mono text-sky-700 bg-sky-50 px-3 py-1 rounded-md border border-sky-200">
              Elapsed time: <span className="font-bold">{elapsedTime}s</span>
            </div>
          </div>
        ) : activeStatus === 'FAILED' ? (
          <div className="p-8 flex flex-col items-center justify-center space-y-4 max-w-md mx-auto text-center z-20">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-md">
              <AlertTriangle className="w-7 h-7 text-rose-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold font-mono text-rose-700 tracking-wider uppercase">
                STRUCTURE RESOLUTION FAILED
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {isOriginalMode ? (originalError || 'Unable to resolve molecular coordinates for this sequence.') : (modifiedError || 'Unable to resolve modified coordinates.')}
              </p>
            </div>
            <button
              onClick={() => {
                setOriginalStatus('COMPUTING');
                setModifiedStatus('COMPUTING');
              }}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Prediction</span>
            </button>
          </div>
        ) : isModifiedUnavailable ? (
          <div className="p-8 flex flex-col items-center justify-center space-y-3 max-w-md mx-auto text-center z-20">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-sm font-bold font-mono text-[#0F172A]">
              Modified structure unavailable
            </h3>
            <p className="text-xs text-slate-600 font-mono max-w-sm font-semibold">
              Structural prediction/modeling is required for this modified sequence.
            </p>
            {modifiedUnavailableReason && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 max-w-sm font-mono text-left">
                {modifiedUnavailableReason}
              </p>
            )}
            {originalStructureModel && (
              <button
                type="button"
                onClick={() => {
                  setPreviewMode('original');
                  setSelectedResSeq(null);
                }}
                className="mt-2 px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono font-bold transition-all cursor-pointer shadow-xs"
              >
                View Original Structure ({startRes}–{endRes}) →
              </button>
            )}
          </div>
        ) : activeStructure && !isUnavailable ? (
          <div className="w-full h-full min-h-[440px] relative">
            <Scientific3DStructureViewer
              structure={activeStructure}
              representation={representation}
              colorScheme={isSimulationActive || (previewMode !== 'original' && targetMutations.length > 0) ? (colorScheme === 'secondary_structure' ? 'secondary_structure' : colorScheme) : colorScheme}
              onSelectResidue={(seq) => setSelectedResSeq(seq)}
              selectedResSeq={selectedResSeq}
              resetTrigger={resetViewTrigger}
              centerTrigger={centerTrigger}
              zoomInTrigger={zoomInTrigger}
              zoomOutTrigger={zoomOutTrigger}
              className="w-full h-full min-h-[440px]"
              enableControls={false}
              key={`${activeStructure.id}_${previewMode}_${targetVersion}`}
            />
          </div>
        ) : (
          <div className="p-8 flex flex-col items-center justify-center space-y-3 max-w-md mx-auto text-center z-20">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-sm font-bold font-mono text-[#0F172A]">
              STRUCTURE UNAVAILABLE
            </h3>
            <p className="text-xs text-slate-500 font-mono">
              {isOriginalMode ? (originalError || 'Sequence length is insufficient or does not contain valid residues to derive stereochemical coordinates.') : (modifiedError || 'Structure unavailable for this sequence.')}
            </p>
          </div>
        )}

        {/* ----------------------------------------------------------- */}
        {/* 5. MOLECULAR VIEWPORT CONTROLS                              */}
        {/* ----------------------------------------------------------- */}
        {activeStructure && !isUnavailable && (
          <div className="bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono z-10 absolute bottom-0 left-0 right-0">
            {/* Representation Modes */}
            <div className="flex items-center gap-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-1 shadow-2xs">
              {[
                { id: 'ribbon' as const, label: 'Cartoon / Ribbon' },
                { id: 'backbone_trace' as const, label: 'Backbone' },
                { id: 'ball_and_stick' as const, label: 'Ball & Stick' },
                { id: 'space_fill' as const, label: 'Space Fill' }
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setRepresentation(m.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    representation === m.id
                      ? 'bg-sky-600 text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Actions: Center Model, Reset View, Zoom, Color Scheme */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setZoomInTrigger((p) => p + 1)}
                className="p-1.5 rounded-xl bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#0F172A] text-xs font-mono font-medium transition-all cursor-pointer shadow-2xs"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5 text-slate-600" />
              </button>

              <button
                type="button"
                onClick={() => setZoomOutTrigger((p) => p + 1)}
                className="p-1.5 rounded-xl bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#0F172A] text-xs font-mono font-medium transition-all cursor-pointer shadow-2xs"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5 text-slate-600" />
              </button>

              <button
                type="button"
                onClick={() => setCenterTrigger((p) => p + 1)}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#0F172A] text-xs font-mono font-medium transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Center Model in Viewport"
              >
                <Crosshair className="w-3.5 h-3.5 text-sky-600" />
                <span>Center</span>
              </button>

              <button
                type="button"
                onClick={() => setResetViewTrigger((p) => p + 1)}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#0F172A] text-xs font-mono font-medium transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Reset Camera View to Default Frustum"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Reset View</span>
              </button>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 text-[11px] hidden sm:inline">Coloring:</span>
                <select
                  value={colorScheme}
                  onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
                  className="bg-white border border-[#CBD5E1] text-[#0F172A] text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-sky-500 cursor-pointer shadow-2xs"
                >
                  <option value="secondary_structure">Secondary Structure</option>
                  <option value="mutation_delta">Mutation Highlight (Red)</option>
                  <option value="hydrophobicity">Hydrophobicity</option>
                  <option value="plddt_bfactor">B-Factor / pLDDT</option>
                  <option value="electrostatics">Electrostatics</option>
                  <option value="rainbow_spectrum">Rainbow (N → C)</option>
                  <option value="element">CPK Elements</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 6. MUTATION DETAILS CARD (Requirement 4 & 12)                 */}
      {/* ------------------------------------------------------------- */}
      {targetMutations.length > 0 && (
        <div className="bg-[#F8FAFC] border-t border-[#E2E8F0] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <h4 className="text-xs font-bold font-mono text-rose-700 uppercase tracking-wider">
                {isSimulationActive ? 'SIMULATED MUTATION PREVIEW' : `MUTATION VISUALIZATION (${targetMutations.length} Tracked)`}
              </h4>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              Highlighted in <strong className="text-rose-600">RED</strong> in 3D Canvas
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 font-mono">
            {evaluatedMutations.map((m) => {
              const origName = AA_NAMES[m.original?.toUpperCase() || ''] || m.original || 'Wild-type';
              const newName = AA_NAMES[m.modified?.toUpperCase() || ''] || m.modified || 'Substituted';
              const label = `${m.original || 'X'}${m.position}${m.modified || 'Y'}`;

              return (
                <div 
                  key={m.id || `mut_${m.position}`}
                  onClick={() => {
                    if (m.isModeled) {
                      setSelectedResSeq(m.position);
                      setColorScheme('mutation_delta');
                    }
                  }}
                  className={`bg-white hover:bg-slate-50 border rounded-xl p-3 cursor-pointer transition-all space-y-1 shadow-2xs ${
                    m.isModeled
                      ? 'border-rose-300 hover:border-rose-400'
                      : 'border-amber-200 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-700">Mutation: {label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      m.isModeled
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {m.isModeled ? `Pos ${m.position} (In 3D Model)` : `Pos ${m.position} (Unmodeled)`}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 font-sans">
                    Original: <strong className="text-[#0F172A]">{origName} ({m.original})</strong>
                  </div>
                  <div className="text-[11px] text-slate-600 font-sans">
                    Simulated: <strong className="text-emerald-700">{newName} ({m.modified})</strong>
                  </div>
                  {!m.isModeled && (
                    <div className="text-[10px] text-amber-700 font-mono mt-1 pt-1 border-t border-amber-100">
                      Unmodeled: outside 3D coordinates ({startRes}–{endRes})
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 7. STRUCTURE INFORMATION & PROVENANCE DISCLOSURE               */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white border-t border-[#E2E8F0] p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Structure Information */}
        <div className="space-y-3 font-mono text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-[#E2E8F0]">
            <Database className="w-4 h-4 text-sky-600" />
            <h4 className="font-bold text-[#0F172A] uppercase tracking-wider">
              STRUCTURE INFORMATION
            </h4>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Structure Classification</span>
              <span className={`font-bold inline-flex items-center gap-1.5 mt-0.5 px-2 py-0.5 rounded border text-[11px] ${
                isUnavailable
                  ? 'text-slate-700 bg-slate-100 border-slate-300'
                  : isPartialStatus
                  ? 'text-amber-800 bg-amber-50 border-amber-300'
                  : isExperimental 
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200' 
                  : isPredicted
                  ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                  : 'text-sky-700 bg-sky-50 border-sky-200'
              }`}>
                {isUnavailable
                  ? '● STRUCTURE UNAVAILABLE'
                  : isPartialStatus
                  ? `● PARTIAL STRUCTURE (${covPercent}%)`
                  : isExperimental
                  ? '● EXPERIMENTAL STRUCTURE'
                  : isPredicted
                  ? '● PREDICTED STRUCTURE'
                  : '● SEQUENCE-DERIVED MODEL'}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Source & Archive</span>
              <span className="font-bold text-[#0F172A] block mt-0.5">
                {isSimulationActive
                  ? 'What-If Simulation Engine'
                  : activeStructure?.sourceName || (isExperimental ? 'RCSB PDB' : 'Sequence-Derived Model')}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Resolution / Method</span>
              <span className="font-bold text-[#0F172A] block mt-0.5">
                {isSimulationActive
                  ? 'In-Silico Simulation'
                  : activeStructure?.resolutionText || activeStructure?.experimentalMethod || 'In-Silico Secondary Fold'}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Sequence Coverage</span>
              <span className="font-bold text-sky-700 block mt-0.5">
                {isSequenceDerived
                  ? 'Unresolved (Sequence-Derived)'
                  : coverageMetrics.coverageLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Sequence / Structure Synchronization Status */}
        <div className="space-y-3 font-mono text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-[#E2E8F0]">
            <Activity className="w-4 h-4 text-sky-600" />
            <h4 className="font-bold text-[#0F172A] uppercase tracking-wider">
              SYNCHRONIZATION & PROVENANCE
            </h4>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between bg-[#F8FAFC] p-2.5 rounded-xl border border-[#E2E8F0]">
              <span className="text-slate-600">Target Sequence Version:</span>
              <span className="font-bold text-[#0F172A]">{targetVersion}</span>
            </div>

            <div className="flex items-center justify-between bg-[#F8FAFC] p-2.5 rounded-xl border border-[#E2E8F0]">
              <span className="text-slate-600">Structure Sync State:</span>
              <span className="font-bold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Synchronized</span>
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[11px] text-slate-600 leading-relaxed">
              {isSimulationActive ? (
                <span>
                  <strong>What-If Simulation Preview:</strong> Structure corresponds to temporary simulated sequence. V1 master baseline remains protected and unchanged.
                </span>
              ) : isExperimental ? (
                <span>
                  <strong>Verified Experimental PDB:</strong> Real crystallographic or cryo-EM coordinates synchronized with active sequence from RCSB Protein Data Bank.
                </span>
              ) : (
                <span>
                  <strong>Computational Model:</strong> Stereochemical fold derived computationally. Experimental crystal structure is not available for this sequence.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
