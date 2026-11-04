import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Dna,
  Edit3,
  RotateCcw,
  RotateCw,
  RefreshCw,
  X,
  Play,
  AlertTriangle,
  CheckCircle2,
  ListTree,
  GitCompare,
  Plus,
  Trash2,
  ArrowRight,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Hash,
  Layers,
  FileCode,
  FileText,
  ShieldAlert,
  Info,
  Eye,
  Copy,
  Check,
  Download,
  AlertCircle,
  Activity,
  Zap,
  Scale
} from 'lucide-react';
import {
  SequenceMutation,
  MutationSummary,
  SequenceValidationReport,
  SequenceDiffSegment,
  AnalysisJob,
  AnalysisJobState
} from '../../../lib/bio/editor/types';
import {
  validateResiduesForType,
  detectWorkingSequenceType,
  applySubstitution,
  applyInsertion,
  applyDeletion,
  computeMutationStats,
  computeFastSequenceDiff,
  computeMutationsFromSequences
} from '../../../lib/bio/editor/mutationEngine';
import {
  evaluateSequenceChangeImpact,
  EditedSequenceImpactReport
} from '../../../lib/bio/editor/changeImpactEngine';
import { parseBiologicalInput } from '../../../lib/bio/sequenceParser';
import { runAnalysisJobAsync } from '../../../lib/bio/editor/analysisJobRunner';
import { AnalysisJobProgressPanel } from './AnalysisJobProgressPanel';
import { ChangeImpactAnalysisView } from './ChangeImpactAnalysisView';
import { AnalysisImpactComparisonView } from './AnalysisImpactComparisonView';
import {
  generateComparativeAnalysisReport,
  ComparativeAnalysisReport
} from '../../../lib/bio/editor/comparativeAnalysisEngine';
import { formatNumber } from '../../../lib/utils/formatters';
import { Sequence3DViewer, Mutation3DViewer } from '../../visualization3d';
import { useBioSequence } from '../../../context/BioSequenceContext';

interface SequenceEditorWorkspaceProps {
  originalSequence: string;
  sequenceType: 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN';
  sourceAccession?: string;
  sourceRecordId?: string | null;
  sourceMetadata?: any;
  currentPipeline?: string;
  versionNumber?: number;
  initialMutations?: SequenceMutation[];
  onClose: () => void;
  onAnalysisCompleted: (resultPayload: any, versionJob: AnalysisJob) => void;
  onCompareVersions?: (originalSeq: string, modifiedSeq: string, mutations: SequenceMutation[]) => void;
  isAnalyzing?: boolean;
}

export const SequenceEditorWorkspace: React.FC<SequenceEditorWorkspaceProps> = ({
  originalSequence,
  sequenceType: initialSequenceType,
  sourceAccession = 'Active Sequence',
  sourceRecordId = null,
  sourceMetadata,
  currentPipeline = 'Automated Sequence Analysis',
  versionNumber = 1,
  initialMutations = [],
  onClose,
  onAnalysisCompleted,
  onCompareVersions,
  isAnalyzing = false
}) => {
  // Parse original input to separate FASTA header metadata from sequence
  const parsedOriginal = useMemo(() => {
    return parseBiologicalInput(originalSequence || '');
  }, [originalSequence]);

  const cleanOriginalSeq = useMemo(() => {
    const parsedSeq = parsedOriginal?.sequence || '';
    if (parsedSeq) return parsedSeq;
    if (typeof originalSequence === 'string' && originalSequence) {
      return originalSequence.replace(/\s+/g, '').toUpperCase();
    }
    return '';
  }, [parsedOriginal, originalSequence]);

  const headerText = parsedOriginal.header || (sourceAccession !== 'Active Sequence' ? sourceAccession : null);

  // Biological sequence length unit
  const getLengthUnit = (type: string) => {
    if (type === 'PROTEIN') return 'aa';
    if (type === 'RNA') return 'nt';
    if (type === 'DNA') return 'bp';
    return 'residues';
  };

  // Central BioSequence Context
  const {
    sequence: centralSequence,
    originalSequence: centralOrigSeq,
    editSequence: centralEditSequence,
    discardWorkingCopy: centralDiscardWorkingCopy,
    applyWorkingCopy: centralApplyWorkingCopy
  } = useBioSequence();

  // Primary editable sequence (biological residues only, initialized from current working copy or original)
  const [workingSequence, setWorkingSequence] = useState<string>(() => centralSequence || cleanOriginalSeq);

  // Undo / Redo history state stack (limit to max 50 states)
  const MAX_HISTORY_STATES = 50;
  const [history, setHistory] = useState<string[]>([centralSequence || cleanOriginalSeq]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Synchronization when cleanOriginalSeq or centralSequence changes
  useEffect(() => {
    const initial = centralSequence || cleanOriginalSeq;
    if (initial && initial !== workingSequence) {
      setWorkingSequence(initial);
      setHistory([initial]);
      setHistoryIndex(0);
    }
  }, [cleanOriginalSeq, centralSequence]);

  // Synchronize modified working copy to BioSequenceContext in real time
  useEffect(() => {
    if (workingSequence && workingSequence !== centralSequence) {
      const timer = setTimeout(() => {
        centralEditSequence(workingSequence, 'Sequence Editor Edit', currentPipeline);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [workingSequence, centralSequence, centralEditSequence, currentPipeline]);

  // Tab navigation: 'editor' | 'changes' | 'impact' | 'compare' | 'preview'
  const [activeTab, setActiveTab] = useState<'editor' | 'changes' | 'impact' | 'compare' | 'preview'>('editor');

  // Confirmation dialogs
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);

  // Guided Quick Mutation Form State
  const [quickTool, setQuickTool] = useState<'sub' | 'ins' | 'del'>('sub');
  const [subPos, setSubPos] = useState<number>(1);
  const [subBases, setSubBases] = useState<string>('');
  const [insPos, setInsPos] = useState<number>(1);
  const [insBases, setInsBases] = useState<string>('');
  const [delStartPos, setDelStartPos] = useState<number>(1);
  const [delEndPos, setDelEndPos] = useState<number>(1);
  const [guidedFeedback, setGuidedFeedback] = useState<string | null>(null);

  // Large sequence windowing & pagination
  const WINDOW_SIZE = 10000;
  const isLargeSequence = workingSequence.length > 25000;
  const totalWindows = Math.max(1, Math.ceil(workingSequence.length / WINDOW_SIZE));
  const [currentWindowIndex, setCurrentWindowIndex] = useState<number>(0);
  const [jumpPosInput, setJumpPosInput] = useState<string>('');

  // Visible window slice for textarea
  const windowStartCoord = currentWindowIndex * WINDOW_SIZE + 1;
  const windowEndCoord = Math.min(workingSequence.length, (currentWindowIndex + 1) * WINDOW_SIZE);
  const currentWindowSlice = useMemo(() => {
    return workingSequence.substring(currentWindowIndex * WINDOW_SIZE, (currentWindowIndex + 1) * WINDOW_SIZE);
  }, [workingSequence, currentWindowIndex, WINDOW_SIZE]);

  // Debounced Biological Validation & Type Detection (350ms)
  const [debouncedSeq, setDebouncedSeq] = useState<string>(workingSequence);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  useEffect(() => {
    setIsValidating(true);
    const timer = setTimeout(() => {
      setDebouncedSeq(workingSequence);
      setIsValidating(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [workingSequence]);

  // Detected biological type & mixed T/U check
  const detectionResult = useMemo(() => {
    const sample = debouncedSeq.length > 25000 ? debouncedSeq.slice(0, 5000) : debouncedSeq;
    return detectWorkingSequenceType(sample, initialSequenceType);
  }, [debouncedSeq, initialSequenceType]);

  const activeBioType = detectionResult.detectedType || initialSequenceType;
  const unitLabel = getLengthUnit(activeBioType);

  // Full validation report
  const validationReport = useMemo(() => {
    if (debouncedSeq.length > 25000) {
      const sample = currentWindowSlice + (debouncedSeq.length > 10000 ? debouncedSeq.slice(0, 2000) : '');
      return validateResiduesForType(sample, activeBioType);
    }
    return validateResiduesForType(debouncedSeq, activeBioType);
  }, [debouncedSeq, currentWindowSlice, activeBioType]);

  // Derived Mutations through alignment diff
  const mutations: SequenceMutation[] = useMemo(() => {
    return computeMutationsFromSequences(cleanOriginalSeq, debouncedSeq, activeBioType);
  }, [cleanOriginalSeq, debouncedSeq, activeBioType]);

  // Mutation statistics
  const mutationStats: MutationSummary = useMemo(() => {
    return computeMutationStats(mutations, cleanOriginalSeq.length, workingSequence.length);
  }, [mutations, cleanOriginalSeq.length, workingSequence.length]);

  // Real-Time Biological Change Impact Evaluation
  const impactReport: EditedSequenceImpactReport = useMemo(() => {
    return evaluateSequenceChangeImpact(
      cleanOriginalSeq,
      debouncedSeq,
      activeBioType,
      mutations
    );
  }, [cleanOriginalSeq, debouncedSeq, activeBioType, mutations]);

  // Exact change flag
  const hasChanges = workingSequence !== cleanOriginalSeq;

  // STEP 5: Development Diagnostics Logging (runs once on editor mount)
  useEffect(() => {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      console.log('[SequenceEditorWorkspace Initialization State]', {
        originalSequenceLength: cleanOriginalSeq?.length ?? 0,
        workingSequenceLength: workingSequence?.length ?? 0,
        sequenceType: activeBioType,
        totalLength: workingSequence?.length ?? 0,
        rangeStart: windowStartCoord,
        rangeEnd: windowEndCoord,
        mutationCount: mutations?.length ?? 0
      });
    }
  }, []);

  // Jump to specific coordinate from impact or change table
  const handleJumpToEditorCoordinate = useCallback((pos: number) => {
    if (pos >= 1 && pos <= workingSequence.length) {
      const winIdx = Math.floor((pos - 1) / WINDOW_SIZE);
      setCurrentWindowIndex(winIdx);
      setActiveTab('editor');
      setSubPos(pos);
      setGuidedFeedback(`Navigated to position ${pos} in Sequence Editor.`);
      setTimeout(() => setGuidedFeedback(null), 3000);
    }
  }, [workingSequence.length, WINDOW_SIZE]);

  // Push new state to undo/redo history
  const pushHistoryState = useCallback((newSeq: string) => {
    if (newSeq === workingSequence) return;

    setHistory((prevHistory) => {
      const nextHistory = prevHistory.slice(0, historyIndex + 1);
      const updated = [...nextHistory, newSeq];
      if (updated.length > MAX_HISTORY_STATES) {
        updated.shift();
      }
      return updated;
    });

    setHistoryIndex((prevIndex) => {
      const nextLength = Math.min(prevIndex + 2, MAX_HISTORY_STATES);
      return nextLength - 1;
    });

    setWorkingSequence(newSeq);
  }, [workingSequence, historyIndex, MAX_HISTORY_STATES]);

  // Handle Undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      const targetSeq = history[prevIdx];
      setHistoryIndex(prevIdx);
      setWorkingSequence(targetSeq);
    }
  }, [historyIndex, history]);

  // Handle Redo
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      const targetSeq = history[nextIdx];
      setHistoryIndex(nextIdx);
      setWorkingSequence(targetSeq);
    }
  }, [historyIndex, history]);

  // Global Keyboard Shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === 'z' || e.key === 'Z') {
          if (e.shiftKey) {
            e.preventDefault();
            handleRedo();
          } else {
            e.preventDefault();
            handleUndo();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Reset Handler
  const handleReset = () => {
    if (hasChanges) {
      setShowResetConfirm(true);
    } else {
      executeReset();
    }
  };

  const executeReset = () => {
    centralDiscardWorkingCopy();
    setWorkingSequence(cleanOriginalSeq);
    setHistory([cleanOriginalSeq]);
    setHistoryIndex(0);
    setShowResetConfirm(false);
    setGuidedFeedback('Sequence restored to original immutable record.');
    setTimeout(() => setGuidedFeedback(null), 3000);
  };

  // Cancel Handler
  const handleCancelClick = () => {
    if (hasChanges) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const executeDiscardAndClose = () => {
    centralDiscardWorkingCopy();
    setWorkingSequence(cleanOriginalSeq);
    setShowDiscardConfirm(false);
    onClose();
  };

  // Direct sequence textarea change
  const handleWindowTextChange = (rawInput: string) => {
    const cleanedText = rawInput.replace(/[\r\n\t\s]/g, '').toUpperCase();
    const prefix = workingSequence.substring(0, currentWindowIndex * WINDOW_SIZE);
    const suffix = workingSequence.substring((currentWindowIndex + 1) * WINDOW_SIZE);
    const newFullSeq = prefix + cleanedText + suffix;

    pushHistoryState(newFullSeq);
  };

  // Quick Guided Mutation Handlers
  const handleApplySubstitution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subBases.trim()) return;
    const cleanBases = subBases.trim().toUpperCase();
    const targetPos = Math.max(1, Math.min(workingSequence.length, Number(subPos) || 1));

    const { newSequence, mutation } = applySubstitution(workingSequence, targetPos, cleanBases);
    pushHistoryState(newSequence);
    centralEditSequence(newSequence, `Sub pos ${targetPos}: ${mutation.original} → ${cleanBases}`, currentPipeline);
    setGuidedFeedback(`Applied substitution at pos ${targetPos}: ${mutation.original} → ${cleanBases}`);
    setSubBases('');
    setTimeout(() => setGuidedFeedback(null), 3500);
  };

  const handleApplyInsertion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!insBases.trim()) return;
    const cleanBases = insBases.trim().toUpperCase();
    const targetPos = Math.max(1, Math.min(workingSequence.length + 1, Number(insPos) || 1));

    const { newSequence } = applyInsertion(workingSequence, targetPos, cleanBases);
    pushHistoryState(newSequence);
    centralEditSequence(newSequence, `Ins pos ${targetPos}: ${cleanBases}`, currentPipeline);
    setGuidedFeedback(`Inserted ${cleanBases.length} residues at position ${targetPos}`);
    setInsBases('');
    setTimeout(() => setGuidedFeedback(null), 3500);
  };

  const handleApplyDeletion = (e: React.FormEvent) => {
    e.preventDefault();
    const startP = Math.max(1, Math.min(workingSequence.length, Number(delStartPos) || 1));
    const endP = Math.max(startP, Math.min(workingSequence.length, Number(delEndPos) || startP));

    const { newSequence, mutation } = applyDeletion(workingSequence, startP, endP);
    pushHistoryState(newSequence);
    centralEditSequence(newSequence, `Del pos ${startP}..${endP}`, currentPipeline);
    setGuidedFeedback(`Deleted residues ${startP}..${endP} (${mutation.original.length} ${unitLabel})`);
    setTimeout(() => setGuidedFeedback(null), 3500);
  };

  // Jump to coordinate
  const handleJumpToPosition = () => {
    const pos = parseInt(jumpPosInput, 10);
    if (!isNaN(pos) && pos >= 1 && pos <= workingSequence.length) {
      const winIdx = Math.floor((pos - 1) / WINDOW_SIZE);
      setCurrentWindowIndex(winIdx);
      setJumpPosInput('');
    }
  };

  // Copy FASTA or modified sequence
  const handleCopyFASTA = () => {
    const headerLine = headerText ? `>${headerText} [modified]` : `>${sourceAccession}_modified`;
    const fastaContent = `${headerLine}\n${workingSequence}`;
    navigator.clipboard.writeText(fastaContent);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  // Export FASTA as file download
  const handleExportFASTA = () => {
    const headerLine = headerText ? `>${headerText} [modified]` : `>${sourceAccession}_modified`;
    const fastaContent = `${headerLine}\n${workingSequence}\n`;
    const blob = new Blob([fastaContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sourceAccession || 'sequence'}_modified.fasta`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Analysis Job Execution & Snapshot State
  const [activeJob, setActiveJob] = useState<AnalysisJob | null>(null);
  const cancelRequestedRef = useRef<boolean>(false);

  // Full Comparative Analysis Report (Original V1 vs Modified V2)
  const comparativeReport: ComparativeAnalysisReport = useMemo(() => {
    return generateComparativeAnalysisReport({
      originalSequence: cleanOriginalSeq,
      modifiedSequence: debouncedSeq,
      sequenceType: (activeBioType as 'DNA' | 'RNA' | 'PROTEIN') || 'DNA',
      pipeline: currentPipeline,
      mutations,
      sourceMetadata,
      parentAnalysisId: sourceRecordId,
      versionNumber: versionNumber + 1,
      originalResults: sourceMetadata?.originalResults || null,
      modifiedResults: activeJob?.results || null
    });
  }, [
    cleanOriginalSeq,
    debouncedSeq,
    activeBioType,
    currentPipeline,
    mutations,
    sourceMetadata,
    sourceRecordId,
    versionNumber,
    activeJob?.results
  ]);

  // Trigger analysis pipeline with modified sequence as an isolated snapshot
  const handleTriggerAnalysis = async () => {
    // Prevent duplicate triggers if currently busy or invalid
    const isCurrentlyRunning = activeJob && ['QUEUED', 'VALIDATING', 'ANALYZING', 'BUILDING_VISUALIZATION', 'GENERATING_RESULTS', 'SAVING'].includes(activeJob.status);
    if (isCurrentlyRunning) {
      console.warn('[RUN_ANALYSIS] Trigger ignored: Analysis job is already running:', activeJob.id);
      return;
    }

    if (!validationReport.isValid || !hasChanges) {
      console.warn('[RUN_ANALYSIS] Trigger blocked: validationReport.isValid =', validationReport.isValid, 'hasChanges =', hasChanges);
      return;
    }

    // Snapshot working sequence at the exact moment of triggering
    const analysisSequenceSnapshot = workingSequence;
    const targetVersionNumber = versionNumber + 1;

    console.log(`[RUN_ANALYSIS] User triggered Run Analysis: length=${analysisSequenceSnapshot.length} | type=${activeBioType} | targetVersion=v${targetVersionNumber} | changes=${mutationStats.totalChanges}`);

    const newJobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newJob: AnalysisJob = {
      id: newJobId,
      sourceAnalysisId: sourceRecordId,
      parentSequenceId: headerText || sourceAccession,
      sequenceSnapshot: analysisSequenceSnapshot,
      header: headerText,
      sequenceType: activeBioType,
      pipeline: currentPipeline,
      versionNumber: targetVersionNumber,
      mutationSummary: mutationStats,
      mutations: [...mutations],
      status: 'QUEUED',
      progress: 5,
      currentStageMessage: 'Queued for biological analysis...',
      createdAt: new Date().toISOString()
    };

    setActiveJob(newJob);
    cancelRequestedRef.current = false;

    try {
      const execResult = await runAnalysisJobAsync({
        job: newJob,
        sourceMetadata,
        onProgress: (updatedJob) => {
          setActiveJob(updatedJob);
        },
        shouldCancel: () => cancelRequestedRef.current
      });

      // Update state to completed job
      setActiveJob(execResult.job);
    } catch (err: any) {
      if (err?.name === 'CancellationError' || err?.message === 'ANALYSIS_CANCELLED_BY_USER') {
        setActiveJob((prev) =>
          prev
            ? {
                ...prev,
                status: 'CANCELLED',
                currentStageMessage: 'Analysis cancelled by user.',
                error: 'Analysis cancelled.'
              }
            : null
        );
      } else {
        setActiveJob((prev) =>
          prev
            ? {
                ...prev,
                status: 'FAILED',
                currentStageMessage: 'Analysis pipeline failed.',
                error: err?.message || 'Pipeline execution failed.'
              }
            : null
        );
      }
    }
  };

  // Safe Cancel Handler
  const handleCancelAnalysis = () => {
    cancelRequestedRef.current = true;
    if (activeJob) {
      setActiveJob({
        ...activeJob,
        status: 'CANCELLED',
        currentStageMessage: 'Analysis job was cancelled by user.',
        error: 'Analysis cancelled.'
      });
    }
  };

  // Retry failed or cancelled job
  const handleRetryAnalysis = () => {
    handleTriggerAnalysis();
  };

  // View completed results in main workbench
  const handleViewResults = () => {
    if (activeJob && activeJob.results) {
      onAnalysisCompleted(activeJob.results, activeJob);
    }
  };

  // Compare original vs modified in workbench or diff tab
  const handleCompareWithOriginal = () => {
    if (onCompareVersions) {
      onCompareVersions(cleanOriginalSeq, workingSequence, mutations);
    } else {
      setActiveTab('compare');
      setActiveJob(null);
    }
  };

  // Return to editor from job panel
  const handleReturnToEditor = () => {
    setActiveJob(null);
  };

  // Diff segments for Compare tab (windowed for high performance)
  const [diffWindowPage, setDiffWindowPage] = useState<number>(0);
  const DIFF_PAGE_SIZE = 2500;
  const diffWindowStart = diffWindowPage * DIFF_PAGE_SIZE + 1;
  const diffWindowEnd = Math.min(Math.max(cleanOriginalSeq.length, workingSequence.length), (diffWindowPage + 1) * DIFF_PAGE_SIZE);
  const diffTotalPages = Math.max(1, Math.ceil(Math.max(cleanOriginalSeq.length, workingSequence.length) / DIFF_PAGE_SIZE));

  const diffSegments: SequenceDiffSegment[] = useMemo(() => {
    if (activeTab !== 'compare') return [];
    return computeFastSequenceDiff(cleanOriginalSeq, workingSequence, diffWindowStart, diffWindowEnd);
  }, [activeTab, cleanOriginalSeq, workingSequence, diffWindowStart, diffWindowEnd]);

  // Analysis Readiness Text
  const getReadinessBanner = () => {
    if (!validationReport.isValid) {
      return {
        status: 'INVALID',
        title: 'Correct sequence errors before analysis',
        message: validationReport.errorSummary || 'Sequence contains biological alphabet violations.',
        color: 'border-red-500/30 bg-red-500/10 text-red-300'
      };
    }
    if (hasChanges) {
      return {
        status: 'READY_MODIFIED',
        title: 'Modified sequence ready for re-analysis',
        message: `${mutations.length} modification${mutations.length === 1 ? '' : 's'} recorded. Ready to trigger biological pipelines.`,
        color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      };
    }
    return {
      status: 'READY_ORIGINAL',
      title: 'Original sequence ready for analysis',
      message: 'No edits detected. The active sequence matches the original record.',
      color: 'border-blue-500/30 bg-blue-500/10 text-blue-300'
    };
  };

  const readiness = getReadinessBanner();

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden flex flex-col my-4">
      {/* ========================================================================= */}
      {/* 1. WORKSPACE HEADER & DRAFT STATUS                                        */}
      {/* ========================================================================= */}
      <div className="p-4 md:p-5 bg-slate-50 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-[#0284C7]">
            <Edit3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-base font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
                <span>Sequence Editor &amp; Mutation Tracker</span>
              </h3>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-[#0F172A] border border-[#CBD5E1]">
                {activeBioType}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-50 text-[#0284C7] border border-sky-200 font-semibold">
                Target: {sourceAccession}
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              Live biological residue mutation tracking with full undo/redo, guided substitution, and diff comparison.
            </p>
          </div>
        </div>

        {/* Draft State Badge & Actions */}
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-2 border ${
            hasChanges
              ? 'bg-amber-50 text-amber-800 border-amber-300'
              : 'bg-emerald-50 text-emerald-800 border-emerald-300'
          }`}>
            <span className={`w-2 h-2 rounded-full ${hasChanges ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            <span>{hasChanges ? `● Modified Sequence (${mutations.length} mutations)` : '● Original Sequence'}</span>
          </div>

          <button
            type="button"
            onClick={handleCancelClick}
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-slate-200 transition-colors cursor-pointer"
            title="Cancel & Close Sequence Editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TAB CONTROLS                                                           */}
      {/* ========================================================================= */}
      <div className="px-5 pt-3 bg-slate-100/70 border-b border-[#E2E8F0] flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'editor'
                ? 'bg-white text-[#0284C7] border-[#E2E8F0] border-b-white shadow-2xs font-bold'
                : 'text-[#64748B] hover:text-[#0F172A] border-transparent hover:bg-slate-200/50'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Editor</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('changes')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'changes'
                ? 'bg-white text-[#0284C7] border-[#E2E8F0] border-b-white shadow-2xs font-bold'
                : 'text-[#64748B] hover:text-[#0F172A] border-transparent hover:bg-slate-200/50'
            }`}
          >
            <ListTree className="w-3.5 h-3.5" />
            <span>Sequence Changes</span>
            {mutations.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-100 text-amber-800 font-bold border border-amber-300">
                {mutations.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('compare')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'compare'
                ? 'bg-white text-[#0284C7] border-[#E2E8F0] border-b-white shadow-2xs font-bold'
                : 'text-[#64748B] hover:text-[#0F172A] border-transparent hover:bg-slate-200/50'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>Compare Diff</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'preview'
                ? 'bg-white text-[#0284C7] border-[#E2E8F0] border-b-white shadow-2xs font-bold'
                : 'text-[#64748B] hover:text-[#0F172A] border-transparent hover:bg-slate-200/50'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Modified Preview</span>
            {validationReport.isValid ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-red-600" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('impact')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'impact'
                ? 'bg-white text-[#0284C7] border-[#E2E8F0] border-b-white shadow-2xs font-bold'
                : 'text-[#64748B] hover:text-[#0F172A] border-transparent hover:bg-slate-200/50'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Analysis Impact</span>
            {activeJob?.status === 'COMPLETED' ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                V{versionNumber + 1}
              </span>
            ) : hasChanges ? (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            ) : null}
          </button>
        </div>

        {/* Feedback Alert Pill */}
        {guidedFeedback && (
          <div className="text-[11px] font-mono text-emerald-800 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{guidedFeedback}</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN WORKSPACE CONTENT AREA OR ANALYSIS JOB PROGRESS PANEL              */}
      {/* ========================================================================= */}
      <div className="p-5 bg-white space-y-5">
        {/* Active Analysis Job Panel */}
        {activeJob && (
          <div className="mb-4">
            <AnalysisJobProgressPanel
              job={activeJob}
              onCancel={handleCancelAnalysis}
              onRetry={handleRetryAnalysis}
              onViewResults={handleViewResults}
              onCompareWithOriginal={handleCompareWithOriginal}
              onReturnToEditor={handleReturnToEditor}
            />
          </div>
        )}

        {/* Large Sequence Protection Notice */}
        {isLargeSequence && (
          <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900 flex items-start gap-3">
            <Layers className="w-4 h-4 shrink-0 text-[#0284C7] mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold font-mono">Large Sequence Editing Mode Active</span>
              <p className="text-sky-800/80 text-[11px] leading-relaxed">
                Total Length: <span className="font-bold">{formatNumber(workingSequence?.length)}</span> {unitLabel}. Rendering in chunked {formatNumber(WINDOW_SIZE)} {unitLabel} windows to maintain 60fps interaction.
              </p>
            </div>
          </div>
        )}

        {/* Validation Errors Banner */}
        {!validationReport.isValid && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
              <span>Biological Alphabet Violation Detected</span>
            </div>
            <p className="text-rose-700 text-[11px]">
              {validationReport.errorSummary}
            </p>
            {validationReport.invalidChars.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {validationReport.invalidChars.map((item) => (
                  <span
                    key={item.char}
                    className="px-2 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-800 text-[11px] font-mono font-bold"
                  >
                    Char &apos;{item.char}&apos; at pos {item.positions.slice(0, 5).join(', ')}{item.positions.length > 5 ? '...' : ''} ({item.count}x)
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* TAB 1: EDITOR & QUICK GUIDED MUTATIONS WITH LIVE 3D PREVIEW             */}
        {/* ----------------------------------------------------------------------- */}
        {activeTab === 'editor' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT COLUMN: Sequence Editor, Mutation Tools, & Range (~58%) */}
            <div className="lg:col-span-7 space-y-5">
              {/* Quick Guided Mutation Palette */}
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                    <Sparkles className="w-3.5 h-3.5 text-[#0284C7]" />
                    <span>Precision Mutation Tools</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQuickTool('sub')}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                        quickTool === 'sub'
                          ? 'bg-sky-100 text-[#0284C7] border border-sky-300 font-bold'
                          : 'text-[#64748B] hover:text-[#0F172A] bg-white border border-[#CBD5E1]'
                      }`}
                    >
                      ● Substitute
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickTool('ins')}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                        quickTool === 'ins'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
                          : 'text-[#64748B] hover:text-[#0F172A] bg-white border border-[#CBD5E1]'
                      }`}
                    >
                      + Insert
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickTool('del')}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                        quickTool === 'del'
                          ? 'bg-rose-100 text-rose-800 border border-rose-300 font-bold'
                          : 'text-[#64748B] hover:text-[#0F172A] bg-white border border-[#CBD5E1]'
                      }`}
                    >
                      − Delete
                    </button>
                  </div>
                </div>

                {/* Substitution Tool */}
                {quickTool === 'sub' && (
                  <form onSubmit={handleApplySubstitution} className="flex flex-wrap items-end gap-3 text-xs">
                    <div className="space-y-1">
                      <label className="text-[11px] text-[#475569] font-mono block font-semibold">1-Based Position</label>
                      <input
                        type="number"
                        min={1}
                        max={workingSequence.length}
                        value={subPos}
                        onChange={(e) => setSubPos(parseInt(e.target.value, 10) || 1)}
                        className="w-28 bg-white border border-[#CBD5E1] rounded-lg px-3 py-1.5 font-mono text-[#0F172A] text-xs focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7] outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-[#475569] font-mono block font-semibold">Current Base(s)</label>
                      <div className="h-8 px-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center font-mono text-amber-800 font-bold">
                        {workingSequence[subPos - 1] || '–'}
                      </div>
                    </div>

                    <div className="space-y-1 flex-1 min-w-[140px]">
                      <label className="text-[11px] text-[#475569] font-mono block font-semibold">New Residue(s)</label>
                      <input
                        type="text"
                        placeholder={activeBioType === 'PROTEIN' ? 'e.g. V or GLY' : 'e.g. T or ATCG'}
                        value={subBases}
                        onChange={(e) => setSubBases(e.target.value.toUpperCase())}
                        className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-1.5 font-mono text-[#0F172A] text-xs focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7] outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!subBases.trim()}
                      className="px-4 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white font-medium text-xs font-mono transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer h-8 shadow-xs"
                    >
                      Apply Substitution
                    </button>
                  </form>
                )}

                {/* Insertion Tool */}
                {quickTool === 'ins' && (
                  <form onSubmit={handleApplyInsertion} className="flex flex-wrap items-end gap-3 text-xs">
                    <div className="space-y-1">
                      <label className="text-[11px] text-[#475569] font-mono block font-semibold">Insert at Position</label>
                      <input
                        type="number"
                        min={1}
                        max={workingSequence.length + 1}
                        value={insPos}
                        onChange={(e) => setInsPos(parseInt(e.target.value, 10) || 1)}
                        className="w-28 bg-white border border-[#CBD5E1] rounded-lg px-3 py-1.5 font-mono text-[#0F172A] text-xs focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7] outline-none"
                      />
                    </div>

                    <div className="space-y-1 flex-1 min-w-[180px]">
                      <label className="text-[11px] text-[#475569] font-mono block font-semibold">Residues to Insert</label>
                      <input
                        type="text"
                        placeholder={activeBioType === 'PROTEIN' ? 'e.g. K or MKWVTF' : 'e.g. G or ATCGGCTA'}
                        value={insBases}
                        onChange={(e) => setInsBases(e.target.value.toUpperCase())}
                        className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-1.5 font-mono text-[#0F172A] text-xs focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7] outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!insBases.trim()}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs font-mono transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer h-8 shadow-xs"
                    >
                      Apply Insertion
                    </button>
                  </form>
                )}

                {/* Deletion Tool */}
                {quickTool === 'del' && (
                  <form onSubmit={handleApplyDeletion} className="flex flex-wrap items-end gap-3 text-xs">
                    <div className="space-y-1">
                      <label className="text-[11px] text-[#475569] font-mono block font-semibold">Start Position</label>
                      <input
                        type="number"
                        min={1}
                        max={workingSequence.length}
                        value={delStartPos}
                        onChange={(e) => setDelStartPos(parseInt(e.target.value, 10) || 1)}
                        className="w-28 bg-white border border-[#CBD5E1] rounded-lg px-3 py-1.5 font-mono text-[#0F172A] text-xs focus:border-rose-500 outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-[#475569] font-mono block font-semibold">End Position</label>
                      <input
                        type="number"
                        min={delStartPos}
                        max={workingSequence.length}
                        value={delEndPos}
                        onChange={(e) => setDelEndPos(parseInt(e.target.value, 10) || delStartPos)}
                        className="w-28 bg-white border border-[#CBD5E1] rounded-lg px-3 py-1.5 font-mono text-[#0F172A] text-xs focus:border-rose-500 outline-none"
                      />
                    </div>

                    <div className="space-y-1 flex-1 min-w-[120px]">
                      <label className="text-[11px] text-[#475569] font-mono block font-semibold">Residues to Delete</label>
                      <div className="h-8 px-3 rounded-lg bg-rose-50 border border-rose-200 flex items-center font-mono text-rose-800 text-[11px] truncate font-bold">
                        {workingSequence.substring(delStartPos - 1, delEndPos) || '–'}
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs font-mono transition-all cursor-pointer h-8 shadow-xs"
                    >
                      Apply Deletion
                    </button>
                  </form>
                )}
              </div>

              {/* Range Navigation Controls for Large Sequences */}
              {totalWindows > 1 && (
                <div className="flex items-center justify-between bg-[#F8FAFC] px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-xs font-mono flex-wrap gap-2">
                  <div className="text-[#334155]">
                    Viewing positions:{' '}
                    <span className="text-[#0284C7] font-bold">
                      {formatNumber(windowStartCoord)} – {formatNumber(windowEndCoord)}
                    </span>{' '}
                    of <span className="text-[#64748B]">{formatNumber(workingSequence?.length)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentWindowIndex === 0}
                      onClick={() => setCurrentWindowIndex(i => Math.max(0, i - 1))}
                      className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#0F172A] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Previous Range</span>
                    </button>

                    <span className="text-[#64748B]">
                      {currentWindowIndex + 1} / {totalWindows}
                    </span>

                    <button
                      type="button"
                      disabled={currentWindowIndex >= totalWindows - 1}
                      onClick={() => setCurrentWindowIndex(i => Math.min(totalWindows - 1, i + 1))}
                      className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#0F172A] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                    >
                      <span>Next Range</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-1 ml-2">
                      <input
                        type="number"
                        placeholder="Go to pos..."
                        value={jumpPosInput}
                        onChange={(e) => setJumpPosInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleJumpToPosition()}
                        className="w-24 bg-white border border-[#CBD5E1] rounded px-2 py-1 text-[11px] text-[#0F172A] focus:border-[#0284C7] outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleJumpToPosition}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-[#CBD5E1] text-[11px] text-[#0F172A] font-medium"
                      >
                        Jump
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Read-Only Header Metadata Display */}
              {headerText && (
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 flex items-center justify-between gap-3 text-xs font-mono">
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="w-4 h-4 text-[#0284C7] shrink-0" />
                    <span className="text-[#64748B] font-semibold">Header:</span>
                    <span className="text-[#0F172A] font-medium truncate">{headerText}</span>
                  </div>
                  <span className="text-[10px] text-[#475569] bg-white px-2.5 py-0.5 rounded border border-[#CBD5E1] shrink-0 font-medium">
                    Read-Only FASTA Metadata
                  </span>
                </div>
              )}

              {/* Direct Working Sequence Editor Area */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#475569]">
                  <span className="font-mono flex items-center gap-1.5 font-semibold text-[#0F172A]">
                    <FileCode className="w-3.5 h-3.5 text-[#0284C7]" />
                    Working Sequence Draft (Direct Resizable Editor)
                  </span>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="font-bold text-[#0284C7] bg-sky-50 px-2.5 py-0.5 rounded-md border border-sky-200 shadow-2xs">
                      Character Count: {currentWindowSlice.length.toLocaleString()} {activeBioType === 'PROTEIN' ? 'aa' : 'bp'}
                    </span>
                    <span className="text-[#64748B] hidden sm:inline">
                      Allowed: {validationReport.allowedAlphabet.join(', ')}
                    </span>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    rows={8}
                    value={currentWindowSlice}
                    onChange={(e) => handleWindowTextChange(e.target.value)}
                    placeholder="Paste or type biological sequence residues here..."
                    className="w-full bg-white border border-[#CBD5E1] rounded-xl p-4 text-xs font-mono text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7] leading-relaxed tracking-wider resize-y shadow-inner"
                    spellCheck={false}
                  />
                  <div className="mt-1 flex items-center justify-between text-[11px] font-mono text-[#64748B] px-1">
                    <span>
                      Draft Input Length: <strong className="text-[#0F172A]">{currentWindowSlice.length.toLocaleString()}</strong> characters
                    </span>
                    <span>
                      Full Workspace Length: <strong className="text-[#0284C7]">{workingSequence.length.toLocaleString()}</strong> {activeBioType === 'PROTEIN' ? 'aa' : 'bp'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Live 3D Biological Visualization (~42%) */}
            <div className="lg:col-span-5 flex flex-col space-y-3 sticky top-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono text-[#0284C7] flex items-center gap-1.5 uppercase tracking-wide">
                  <Activity className="w-3.5 h-3.5 text-[#0284C7]" />
                  <span>Live 3D Structure Preview</span>
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${
                  isValidating
                    ? 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}>
                  {isValidating ? 'Structure Updating...' : 'Structure Updated'}
                </span>
              </div>

              <div className="h-[340px] rounded-2xl overflow-hidden border border-[#E2E8F0] shadow-md bg-[#F8FAFC]">
                <Sequence3DViewer
                  sequence={workingSequence}
                  sequenceType={activeBioType}
                  accession={sourceAccession}
                  mutations={mutations}
                  syncStatus={isValidating ? 'UPDATING' : 'SYNCED'}
                  height="100%"
                  className="w-full h-full"
                />
              </div>

              <div className="bg-[#F8FAFC] rounded-xl p-3 border border-[#E2E8F0] text-[11px] font-mono text-[#475569] space-y-1">
                <div className="flex items-center justify-between">
                  <span>Modified Length:</span>
                  <strong className="text-[#0F172A]">{workingSequence.length} {unitLabel}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Tracked Mutations:</span>
                  <strong className={mutations.length > 0 ? "text-amber-700" : "text-[#64748B]"}>{mutations.length} sites</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Structural Engine:</span>
                  <span className="text-emerald-700 font-semibold">Live Procedural Synced</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* TAB 2: SEQUENCE CHANGES & MUTATION AUDIT LOG + 3D MUTATION TRACKER       */}
        {/* ----------------------------------------------------------------------- */}
        {activeTab === 'changes' && (
          <div className="space-y-5">
            {/* Live 3D Mutation Tracker Visualization */}
            {mutations.length > 0 && (
              <Mutation3DViewer
                wildTypeSequence={originalSequence}
                mutantSequence={workingSequence}
                mutations={mutations}
                height={300}
                className="mb-2 shadow-xl"
              />
            )}

            {/* Live Mutation KPI Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] text-center shadow-2xs">
                <span className="text-[10px] uppercase font-mono text-[#64748B] block">Total Changes</span>
                <span className="text-base font-bold text-[#0F172A] font-mono">{mutationStats.totalChanges}</span>
              </div>

              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] text-center shadow-2xs">
                <span className="text-[10px] uppercase font-mono text-[#64748B] block">Substitutions</span>
                <span className="text-base font-bold text-amber-700 font-mono">{mutationStats.substitutions}</span>
              </div>

              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] text-center shadow-2xs">
                <span className="text-[10px] uppercase font-mono text-[#64748B] block">Insertions</span>
                <span className="text-base font-bold text-emerald-700 font-mono">{mutationStats.insertions}</span>
              </div>

              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] text-center shadow-2xs">
                <span className="text-[10px] uppercase font-mono text-[#64748B] block">Deletions</span>
                <span className="text-base font-bold text-rose-700 font-mono">{mutationStats.deletions}</span>
              </div>

              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] text-center shadow-2xs">
                <span className="text-[10px] uppercase font-mono text-[#64748B] block">Original Length</span>
                <span className="text-base font-bold text-[#334155] font-mono">{formatNumber(mutationStats?.originalLength)} {unitLabel}</span>
              </div>

              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] text-center shadow-2xs">
                <span className="text-[10px] uppercase font-mono text-[#64748B] block">Modified Length</span>
                <span className="text-base font-bold text-[#0284C7] font-mono">{formatNumber(mutationStats?.modifiedLength)} {unitLabel}</span>
              </div>

              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] text-center shadow-2xs">
                <span className="text-[10px] uppercase font-mono text-[#64748B] block">Net Change</span>
                <span className={`text-base font-bold font-mono ${
                  mutationStats.netLengthChange > 0 
                    ? 'text-emerald-700' 
                    : mutationStats.netLengthChange < 0 
                    ? 'text-rose-700' 
                    : 'text-[#64748B]'
                }`}>
                  {mutationStats.netLengthChange > 0 ? `+${mutationStats.netLengthChange}` : mutationStats.netLengthChange} {unitLabel}
                </span>
              </div>
            </div>

            {/* Mutation Summary Table */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0] text-xs font-semibold text-[#0F172A]">
                <div className="flex items-center gap-2">
                  <ListTree className="w-4 h-4 text-[#0284C7]" />
                  <span>Mutation Alignment Table</span>
                </div>
                <span className="text-[11px] font-mono text-[#64748B]">
                  {mutations.length} detected modifications
                </span>
              </div>

              {mutations.length === 0 ? (
                <div className="py-8 text-center text-[#64748B] text-xs font-mono space-y-1">
                  <p className="text-[#0F172A] font-semibold">No sequence modifications detected.</p>
                  <p className="text-[11px] text-[#64748B]">
                    Use the Editor tab to introduce sequence substitutions, insertions, or deletions.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-[#475569] text-[11px]">
                        <th className="py-2.5 px-3">Position</th>
                        <th className="py-2.5 px-3">Original</th>
                        <th className="py-2.5 px-3">Modified</th>
                        <th className="py-2.5 px-3">Change Type</th>
                        <th className="py-2.5 px-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] bg-white">
                      {mutations.map((mut) => (
                        <tr key={mut.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 text-[#0284C7] font-bold">
                            {mut.position}
                          </td>
                          <td className="py-2.5 px-3 text-[#334155]">
                            {mut.original || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-emerald-700 font-bold">
                            {mut.modified || '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                              mut.operation === 'substitution'
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : mut.operation === 'insertion'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-rose-50 text-rose-800 border-rose-300'
                            }`}>
                              {mut.operation}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[#475569] text-[11px]">
                            {mut.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* TAB 3: COMPARE DIFF (ORIGINAL VS MODIFIED)                             */}
        {/* ----------------------------------------------------------------------- */}
        {activeTab === 'compare' && (
          <div className="space-y-4">
            {/* Diff Legend & Pagination */}
            <div className="flex items-center justify-between bg-[#F8FAFC] px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-xs font-mono flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="text-[#64748B]">Diff Legend:</span>
                <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                  <span className="w-2.5 h-2.5 bg-emerald-200 border border-emerald-500 rounded-xs" /> Inserted
                </span>
                <span className="flex items-center gap-1 text-amber-700 font-semibold">
                  <span className="w-2.5 h-2.5 bg-amber-200 border border-amber-500 rounded-xs" /> Replaced
                </span>
                <span className="flex items-center gap-1 text-rose-700 font-semibold">
                  <span className="w-2.5 h-2.5 bg-rose-200 border border-rose-500 rounded-xs" /> Deleted
                </span>
              </div>

              {diffTotalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={diffWindowPage === 0}
                    onClick={() => setDiffWindowPage(p => Math.max(0, p - 1))}
                    className="px-2 py-1 rounded bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#0F172A] disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="text-[#64748B]">
                    Pos {diffWindowStart}..{diffWindowEnd} ({diffWindowPage + 1}/{diffTotalPages})
                  </span>
                  <button
                    type="button"
                    disabled={diffWindowPage >= diffTotalPages - 1}
                    onClick={() => setDiffWindowPage(p => Math.min(diffTotalPages - 1, p + 1))}
                    className="px-2 py-1 rounded bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#0F172A] disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {/* Color-Coded Diff Rendering View */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 font-mono text-xs leading-relaxed space-y-4 shadow-2xs">
              {/* Original Sequence Line */}
              <div>
                <span className="text-[11px] text-[#64748B] font-bold block mb-1 uppercase tracking-wider">
                  ORIGINAL SEQUENCE ({sourceAccession})
                </span>
                <div className="bg-white p-3 rounded-lg border border-[#CBD5E1] text-[#0F172A] break-all select-all max-h-48 overflow-y-auto custom-scrollbar shadow-inner">
                  {diffSegments.length === 0 ? (
                    <span className="text-[#94A3B8]">No diff segments to display.</span>
                  ) : (
                    diffSegments.map((seg) => {
                      if (seg.type === 'delete') {
                        return (
                          <span
                            key={seg.id}
                            className="bg-rose-100 text-rose-800 line-through px-0.5 rounded-xs font-bold border border-rose-200"
                            title={`Deleted at pos ${seg.origStart}..${seg.origEnd}: ${seg.originalText}`}
                          >
                            {seg.originalText}
                          </span>
                        );
                      }
                      if (seg.type === 'replace') {
                        return (
                          <span
                            key={seg.id}
                            className="bg-amber-100 text-amber-800 px-0.5 rounded-xs font-bold border border-amber-200"
                            title={`Replaced at pos ${seg.origStart}..${seg.origEnd}: ${seg.originalText} → ${seg.modifiedText}`}
                          >
                            {seg.originalText}
                          </span>
                        );
                      }
                      if (seg.type === 'insert') {
                        return null; // insertion only on modified line
                      }
                      return (
                        <span key={seg.id} className="text-[#475569]">
                          {seg.originalText}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Modified Sequence Line */}
              <div>
                <span className="text-[11px] text-[#0284C7] font-bold block mb-1 uppercase tracking-wider">
                  MODIFIED WORKING DRAFT (Version {versionNumber + 1})
                </span>
                <div className="bg-white p-3 rounded-lg border border-[#CBD5E1] text-[#0F172A] break-all select-all max-h-48 overflow-y-auto custom-scrollbar shadow-inner">
                  {diffSegments.length === 0 ? (
                    <span className="text-[#94A3B8]">No diff segments to display.</span>
                  ) : (
                    diffSegments.map((seg) => {
                      if (seg.type === 'insert') {
                        return (
                          <span
                            key={seg.id}
                            className="bg-emerald-100 text-emerald-800 px-0.5 rounded-xs font-bold border border-emerald-200"
                            title={`Inserted at pos ${seg.modStart}: ${seg.modifiedText}`}
                          >
                            {seg.modifiedText}
                          </span>
                        );
                      }
                      if (seg.type === 'replace') {
                        return (
                          <span
                            key={seg.id}
                            className="bg-amber-100 text-amber-800 px-0.5 rounded-xs font-bold border border-amber-200"
                            title={`Replaced from ${seg.originalText} at pos ${seg.modStart}: ${seg.modifiedText}`}
                          >
                            {seg.modifiedText}
                          </span>
                        );
                      }
                      if (seg.type === 'delete') {
                        return null;
                      }
                      return (
                        <span key={seg.id} className="text-[#0F172A]">
                          {seg.modifiedText}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* TAB 4: MODIFIED PREVIEW & ANALYSIS READINESS                             */}
        {/* ----------------------------------------------------------------------- */}
        {activeTab === 'preview' && (
          <div className="space-y-5">
            {/* Header Metadata Display */}
            {headerText && (
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs font-mono shadow-2xs">
                <div className="flex items-center gap-2 truncate">
                  <FileText className="w-4 h-4 text-[#0284C7] shrink-0" />
                  <span className="text-[#64748B] font-semibold">Header:</span>
                  <span className="text-[#0F172A] font-medium truncate">{headerText}</span>
                </div>
                <span className="text-[10px] text-[#475569] bg-white px-2.5 py-0.5 rounded border border-[#CBD5E1] shrink-0 font-medium">
                  FASTA Header
                </span>
              </div>
            )}

            {/* Stat Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0] shadow-2xs">
                <span className="text-[10px] uppercase font-mono text-[#64748B] block">Original Length</span>
                <span className="text-base font-bold text-[#0F172A] font-mono">
                  {formatNumber(cleanOriginalSeq?.length)} {unitLabel}
                </span>
              </div>

              <div className="bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0] shadow-2xs">
                <span className="text-[10px] uppercase font-mono text-[#64748B] block">Modified Length</span>
                <span className="text-base font-bold text-[#0284C7] font-mono">
                  {formatNumber(workingSequence?.length)} {unitLabel}
                </span>
              </div>

              <div className="bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0] shadow-2xs">
                <span className="text-[10px] uppercase font-mono text-[#64748B] block">Net Change</span>
                <span className={`text-base font-bold font-mono ${
                  mutationStats.netLengthChange > 0 
                    ? 'text-emerald-700' 
                    : mutationStats.netLengthChange < 0 
                    ? 'text-rose-700' 
                    : 'text-[#64748B]'
                }`}>
                  {mutationStats.netLengthChange > 0 ? `+${mutationStats.netLengthChange}` : mutationStats.netLengthChange} {unitLabel}
                </span>
              </div>

              <div className="bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0] shadow-2xs">
                <span className="text-[10px] uppercase font-mono text-[#64748B] block">Biological Type</span>
                <span className="text-base font-bold text-purple-700 font-mono">
                  {activeBioType}
                </span>
              </div>

              <div className="bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0] shadow-2xs">
                <span className="text-[10px] uppercase font-mono text-[#64748B] block">Validation</span>
                <span className={`text-base font-bold font-mono flex items-center gap-1.5 ${
                  validationReport.isValid ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  {validationReport.isValid ? (
                    <>
                      <span>VALID</span>
                      <Check className="w-4 h-4 text-emerald-600" />
                    </>
                  ) : (
                    <>
                      <span>INVALID</span>
                      <X className="w-4 h-4 text-rose-600" />
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Validation Panel */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0] text-xs font-semibold text-[#0F172A]">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#0284C7]" />
                  <span>Sequence Validation &amp; Quality Check</span>
                </div>
                <span className="text-[11px] font-mono text-[#64748B]">
                  Debounced IUPAC Compliance
                </span>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex items-center gap-2 text-[#334155] flex-wrap">
                  <span className="text-[#64748B]">Biological Type:</span>
                  <span className="text-[#0F172A] font-bold">{activeBioType}</span>
                  <span className="text-[#64748B] ml-4">Sequence Length:</span>
                  <span className="text-[#0284C7] font-bold">{formatNumber(workingSequence?.length)} {unitLabel}</span>
                  <span className="text-[#64748B] ml-4">Validation Status:</span>
                  <span className={`font-bold ${validationReport.isValid ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {validationReport.validationStatus}
                  </span>
                </div>

                {validationReport.isValid ? (
                  <div className="space-y-1 pt-1 text-emerald-800 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>✓ Valid biological sequence</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>✓ Ready for analysis</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 pt-1 text-rose-800 text-[11px]">
                    <div className="flex items-center gap-1.5 font-bold text-rose-700">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                      <span>✕ Invalid biological characters detected</span>
                    </div>
                    {validationReport.invalidChars.length > 0 && (
                      <div className="text-rose-900">
                        <span className="text-rose-700 font-semibold">Invalid characters: </span>
                        {validationReport.invalidChars.map(c => `'${c.char}'`).join(', ')}
                        <span className="text-rose-700 font-semibold ml-3">Positions: </span>
                        {validationReport.invalidChars.flatMap(c => c.positions).slice(0, 15).join(', ')}
                      </div>
                    )}
                    {validationReport.errorSummary && (
                      <p className="text-rose-700 text-[10px]">
                        {validationReport.errorSummary}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Compact Change Summary with Jump Link */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 flex items-center justify-between flex-wrap gap-3 shadow-2xs">
              <div className="space-y-1 text-xs font-mono">
                <div className="text-[#0F172A] font-semibold flex items-center gap-2">
                  <ListTree className="w-3.5 h-3.5 text-[#0284C7]" />
                  <span>{mutations.length} modification{mutations.length === 1 ? '' : 's'} detected</span>
                </div>
                <div className="text-[11px] text-[#64748B] flex items-center gap-3">
                  <span>{mutationStats.substitutions} substitution{mutationStats.substitutions === 1 ? '' : 's'}</span>
                  <span>•</span>
                  <span>{mutationStats.insertions} insertion{mutationStats.insertions === 1 ? '' : 's'}</span>
                  <span>•</span>
                  <span>{mutationStats.deletions} deletion{mutationStats.deletions === 1 ? '' : 's'}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('changes')}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#0F172A] text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <span>View Full Mutation Table</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Analysis Readiness State Banner */}
            <div className={`p-4 rounded-xl border text-xs font-mono space-y-1 ${readiness.color}`}>
              <div className="font-bold flex items-center gap-2">
                {validationReport.isValid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                )}
                <span>{readiness.title}</span>
              </div>
              <p className="text-[11px] opacity-90">
                {readiness.message}
              </p>
            </div>

            {/* Formatted Sequence Preview */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-mono text-[#475569]">
                <span className="flex items-center gap-1.5 font-semibold text-[#0F172A]">
                  <FileCode className="w-3.5 h-3.5 text-[#0284C7]" />
                  Modified Sequence Preview
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyFASTA}
                    className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#0F172A] text-[11px] font-mono flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                  >
                    {copiedNotification ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-[#64748B]" />}
                    <span>{copiedNotification ? 'Copied FASTA!' : 'Copy FASTA'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportFASTA}
                    className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#0F172A] text-[11px] font-mono flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                  >
                    <Download className="w-3 h-3 text-[#64748B]" />
                    <span>Download .fasta</span>
                  </button>
                </div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-[#CBD5E1] font-mono text-xs text-[#0F172A] break-all select-all max-h-48 overflow-y-auto custom-scrollbar leading-relaxed shadow-inner">
                {workingSequence || <span className="text-[#94A3B8]">Empty sequence</span>}
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* TAB 5: ANALYSIS IMPACT & ORIGINAL VS MODIFIED STRUCTURAL COMPARISON     */}
        {/* ----------------------------------------------------------------------- */}
        {activeTab === 'impact' && (
          <div className="space-y-6">
            {activeJob?.status === 'COMPLETED' ? (
              <AnalysisImpactComparisonView
                report={comparativeReport}
                originalSequence={cleanOriginalSeq}
                modifiedSequence={workingSequence}
                mutations={mutations}
                onRestoreVersion={(vNum) => {
                  if (vNum === 1) {
                    handleReset();
                  }
                }}
                onJumpToCoordinate={handleJumpToEditorCoordinate}
              />
            ) : (
              <div className="space-y-6">
                {/* Pipeline Execution Required Prompt */}
                <div className="bg-[#F8FAFC] border border-amber-300 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="flex items-start justify-between flex-wrap gap-4">
                    <div className="space-y-1.5 max-w-2xl">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-amber-800 font-mono text-xs font-bold">
                          Modified Analysis Pending
                        </span>
                        <span className="text-xs text-[#64748B] font-mono">
                          {mutations.length} modification{mutations.length === 1 ? '' : 's'} staged
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[#0F172A] tracking-tight">
                        Generate Version {versionNumber + 1} Comparative Analysis
                      </h3>
                      <p className="text-xs text-[#334155] leading-relaxed font-mono">
                        Run the verified biological analysis pipeline to calculate real metrics (Length, GC%, AT%, ORFs, physicochemical parameters) and generate the full side-by-side structural comparison.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isAnalyzing || !validationReport.isValid || !hasChanges}
                      onClick={handleTriggerAnalysis}
                      className="px-6 py-3 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold text-xs font-mono transition-all shadow-md shadow-sky-600/20 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                    >
                      {isAnalyzing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 fill-white" />
                      )}
                      <span>Run Analysis Pipeline (Version {versionNumber + 1})</span>
                    </button>
                  </div>
                </div>

                {/* Projected Change Impact Assessment */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono text-[#64748B] px-1">
                    <span className="flex items-center gap-1.5 text-[#0F172A] font-semibold">
                      <Zap className="w-3.5 h-3.5 text-amber-600" />
                      Pre-Analysis Change Impact Evaluation
                    </span>
                    <span>Algorithmic biophysical projection</span>
                  </div>

                  <ChangeImpactAnalysisView
                    impactReport={impactReport}
                    originalSequence={cleanOriginalSeq}
                    modifiedSequence={workingSequence}
                    mutations={mutations}
                    onNavigateToEditorPos={handleJumpToEditorCoordinate}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. PROFESSIONAL EDITING ACTION BAR                                        */}
      {/* ========================================================================= */}
      <div className="p-4 md:p-5 bg-slate-50 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-4">
        {/* Left: Undo, Redo, Reset, Cancel */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={historyIndex <= 0}
            onClick={handleUndo}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#0F172A] text-xs font-mono font-medium transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
            title="Undo (Ctrl/Cmd+Z)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>

          <button
            type="button"
            disabled={historyIndex >= history.length - 1}
            onClick={handleRedo}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#0F172A] text-xs font-mono font-medium transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
            title="Redo (Ctrl/Cmd+Shift+Z)"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Redo</span>
          </button>

          <button
            type="button"
            disabled={!hasChanges}
            onClick={handleReset}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#475569] text-xs font-mono font-medium transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
            title="Reset sequence to original immutable record"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleCancelClick}
            className="px-3 py-2 rounded-xl text-[#64748B] hover:text-[#0F172A] text-xs font-mono font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>

        {/* Right: Metrics & Primary Action Button */}
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-[11px] font-mono text-[#64748B]">
              Original: <span className="text-[#0F172A] font-bold">{formatNumber(cleanOriginalSeq?.length)} {unitLabel}</span> | Modified: <span className="text-[#0284C7] font-bold">{formatNumber(workingSequence?.length)} {unitLabel}</span>
            </div>
            <div className="text-[10px] font-mono text-[#64748B]">
              Recorded Changes: <span className="text-emerald-700 font-bold">{mutations.length}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={isAnalyzing || !validationReport.isValid || !hasChanges}
            onClick={handleTriggerAnalysis}
            className="px-6 py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold text-xs font-mono transition-all shadow-md shadow-sky-600/20 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title={
              !hasChanges
                ? 'No sequence modifications to analyze.'
                : !validationReport.isValid
                ? 'Correct sequence errors before analysis.'
                : 'Queue modified sequence for biological re-analysis'
            }
          >
            {isAnalyzing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-white" />
            )}
            <span>Re-analyze Modified Sequence</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. CONFIRMATION DIALOG: DISCARD ON CANCEL                                 */}
      {/* ========================================================================= */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="text-base font-bold text-[#0F172A]">Unsaved Sequence Modifications</h4>
            </div>

            <p className="text-xs text-[#334155] leading-relaxed">
              You have unsaved sequence modifications. Discarding will revert all edits and close the editor without analyzing.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#0F172A] text-xs font-medium transition-colors cursor-pointer"
              >
                Continue Editing
              </button>
              <button
                type="button"
                onClick={executeDiscardAndClose}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. CONFIRMATION DIALOG: RESET SEQUENCE                                    */}
      {/* ========================================================================= */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="text-base font-bold text-[#0F172A]">Reset Sequence to Original?</h4>
            </div>

            <p className="text-xs text-[#334155] leading-relaxed">
              This will discard all current edits, reset your history, and restore the sequence to the original immutable biological record.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#0F172A] text-xs font-medium transition-colors cursor-pointer"
              >
                Keep Current Edits
              </button>
              <button
                type="button"
                onClick={executeReset}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
