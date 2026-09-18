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

  // Primary editable sequence (biological residues only)
  const [workingSequence, setWorkingSequence] = useState<string>(cleanOriginalSeq);

  // Undo / Redo history state stack (limit to max 50 states)
  const MAX_HISTORY_STATES = 50;
  const [history, setHistory] = useState<string[]>([cleanOriginalSeq]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Synchronization when cleanOriginalSeq changes
  useEffect(() => {
    setWorkingSequence(cleanOriginalSeq);
    setHistory([cleanOriginalSeq]);
    setHistoryIndex(0);
  }, [cleanOriginalSeq]);

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
    <div className="bg-[#111622] border-2 border-emerald-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-4">
      {/* ========================================================================= */}
      {/* 1. WORKSPACE HEADER & DRAFT STATUS                                        */}
      {/* ========================================================================= */}
      <div className="p-4 md:p-5 bg-[#0B0F17] border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Edit3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Sequence Editor &amp; Mutation Tracker</span>
              </h3>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {activeBioType}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-cyan-300 border border-cyan-500/20">
                Target: {sourceAccession}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live biological residue mutation tracking with full undo/redo, guided substitution, and diff comparison.
            </p>
          </div>
        </div>

        {/* Draft State Badge & Actions */}
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-2 border ${
            hasChanges
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse'
              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          }`}>
            <span className={`w-2 h-2 rounded-full ${hasChanges ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <span>{hasChanges ? `● Modified Sequence (${mutations.length} mutations)` : '● Original Sequence'}</span>
          </div>

          <button
            type="button"
            onClick={handleCancelClick}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Cancel & Close Sequence Editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TAB CONTROLS                                                           */}
      {/* ========================================================================= */}
      <div className="px-5 pt-3 bg-[#0E131F] border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'editor'
                ? 'bg-[#161B22] text-emerald-400 border-slate-700 border-b-[#161B22]'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/40'
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
                ? 'bg-[#161B22] text-emerald-400 border-slate-700 border-b-[#161B22]'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/40'
            }`}
          >
            <ListTree className="w-3.5 h-3.5" />
            <span>Sequence Changes</span>
            {mutations.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 font-bold">
                {mutations.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('compare')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'compare'
                ? 'bg-[#161B22] text-emerald-400 border-slate-700 border-b-[#161B22]'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/40'
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
                ? 'bg-[#161B22] text-emerald-400 border-slate-700 border-b-[#161B22]'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/40'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Modified Preview</span>
            {validationReport.isValid ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-red-400" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('impact')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'impact'
                ? 'bg-[#161B22] text-emerald-400 border-slate-700 border-b-[#161B22]'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/40'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Analysis Impact</span>
            {activeJob?.status === 'COMPLETED' ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 font-bold">
                V{versionNumber + 1}
              </span>
            ) : hasChanges ? (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            ) : null}
          </button>
        </div>

        {/* Feedback Alert Pill */}
        {guidedFeedback && (
          <div className="text-[11px] font-mono text-emerald-300 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{guidedFeedback}</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN WORKSPACE CONTENT AREA OR ANALYSIS JOB PROGRESS PANEL              */}
      {/* ========================================================================= */}
      <div className="p-5 bg-[#161B22] space-y-5">
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
          <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 flex items-start gap-3">
            <Layers className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold font-mono">Large Sequence Editing Mode Active</span>
              <p className="text-cyan-200/80 text-[11px] leading-relaxed">
                Total Length: <span className="font-bold">{formatNumber(workingSequence?.length)}</span> {unitLabel}. Rendering in chunked {formatNumber(WINDOW_SIZE)} {unitLabel} windows to maintain 60fps interaction.
              </p>
            </div>
          </div>
        )}

        {/* Validation Errors Banner */}
        {!validationReport.isValid && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
              <span>Biological Alphabet Violation Detected</span>
            </div>
            <p className="text-red-300/90 text-[11px]">
              {validationReport.errorSummary}
            </p>
            {validationReport.invalidChars.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {validationReport.invalidChars.map((item) => (
                  <span
                    key={item.char}
                    className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-200 text-[11px] font-mono"
                  >
                    Char &apos;{item.char}&apos; at pos {item.positions.slice(0, 5).join(', ')}{item.positions.length > 5 ? '...' : ''} ({item.count}x)
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* TAB 1: EDITOR & QUICK GUIDED MUTATIONS                                  */}
        {/* ----------------------------------------------------------------------- */}
        {activeTab === 'editor' && (
          <div className="space-y-5">
            {/* Quick Guided Mutation Palette */}
            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Precision Mutation Tools</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQuickTool('sub')}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                      quickTool === 'sub'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-slate-400 hover:text-white bg-slate-800/50'
                    }`}
                  >
                    ● Substitute
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickTool('ins')}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                      quickTool === 'ins'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-slate-400 hover:text-white bg-slate-800/50'
                    }`}
                  >
                    + Insert
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickTool('del')}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                      quickTool === 'del'
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : 'text-slate-400 hover:text-white bg-slate-800/50'
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
                    <label className="text-[11px] text-slate-400 font-mono block">1-Based Position</label>
                    <input
                      type="number"
                      min={1}
                      max={workingSequence.length}
                      value={subPos}
                      onChange={(e) => setSubPos(parseInt(e.target.value, 10) || 1)}
                      className="w-28 bg-[#161B22] border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-white text-xs focus:border-emerald-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400 font-mono block">Current Base(s)</label>
                    <div className="h-8 px-3 rounded-lg bg-slate-800/60 border border-slate-700 flex items-center font-mono text-amber-300 font-bold">
                      {workingSequence[subPos - 1] || '–'}
                    </div>
                  </div>

                  <div className="space-y-1 flex-1 min-w-[140px]">
                    <label className="text-[11px] text-slate-400 font-mono block">New Residue(s)</label>
                    <input
                      type="text"
                      placeholder={activeBioType === 'PROTEIN' ? 'e.g. V or GLY' : 'e.g. T or ATCG'}
                      value={subBases}
                      onChange={(e) => setSubBases(e.target.value.toUpperCase())}
                      className="w-full bg-[#161B22] border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-white text-xs focus:border-emerald-500 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!subBases.trim()}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs font-mono transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer h-8"
                  >
                    Apply Substitution
                  </button>
                </form>
              )}

              {/* Insertion Tool */}
              {quickTool === 'ins' && (
                <form onSubmit={handleApplyInsertion} className="flex flex-wrap items-end gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400 font-mono block">Insert at Position</label>
                    <input
                      type="number"
                      min={1}
                      max={workingSequence.length + 1}
                      value={insPos}
                      onChange={(e) => setInsPos(parseInt(e.target.value, 10) || 1)}
                      className="w-28 bg-[#161B22] border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-white text-xs focus:border-emerald-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1 flex-1 min-w-[180px]">
                    <label className="text-[11px] text-slate-400 font-mono block">Residues to Insert</label>
                    <input
                      type="text"
                      placeholder={activeBioType === 'PROTEIN' ? 'e.g. K or MKWVTF' : 'e.g. G or ATCGGCTA'}
                      value={insBases}
                      onChange={(e) => setInsBases(e.target.value.toUpperCase())}
                      className="w-full bg-[#161B22] border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-white text-xs focus:border-emerald-500 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!insBases.trim()}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs font-mono transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer h-8"
                  >
                    Apply Insertion
                  </button>
                </form>
              )}

              {/* Deletion Tool */}
              {quickTool === 'del' && (
                <form onSubmit={handleApplyDeletion} className="flex flex-wrap items-end gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400 font-mono block">Start Position</label>
                    <input
                      type="number"
                      min={1}
                      max={workingSequence.length}
                      value={delStartPos}
                      onChange={(e) => setDelStartPos(parseInt(e.target.value, 10) || 1)}
                      className="w-28 bg-[#161B22] border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-white text-xs focus:border-red-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400 font-mono block">End Position</label>
                    <input
                      type="number"
                      min={delStartPos}
                      max={workingSequence.length}
                      value={delEndPos}
                      onChange={(e) => setDelEndPos(parseInt(e.target.value, 10) || delStartPos)}
                      className="w-28 bg-[#161B22] border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-white text-xs focus:border-red-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1 flex-1 min-w-[120px]">
                    <label className="text-[11px] text-slate-400 font-mono block">Residues to Delete</label>
                    <div className="h-8 px-3 rounded-lg bg-red-950/30 border border-red-800/40 flex items-center font-mono text-red-300 text-[11px] truncate">
                      {workingSequence.substring(delStartPos - 1, delEndPos) || '–'}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-xs font-mono transition-all cursor-pointer h-8"
                  >
                    Apply Deletion
                  </button>
                </form>
              )}
            </div>

            {/* Range Navigation Controls for Large Sequences */}
            {totalWindows > 1 && (
              <div className="flex items-center justify-between bg-[#0B0F17] px-4 py-2.5 rounded-xl border border-slate-800 text-xs font-mono flex-wrap gap-2">
                <div className="text-slate-300">
                  Viewing positions:{' '}
                  <span className="text-emerald-400 font-bold">
                    {formatNumber(windowStartCoord)} – {formatNumber(windowEndCoord)}
                  </span>{' '}
                  of <span className="text-slate-400">{formatNumber(workingSequence?.length)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentWindowIndex === 0}
                    onClick={() => setCurrentWindowIndex(i => Math.max(0, i - 1))}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous Range</span>
                  </button>

                  <span className="text-slate-500">
                    {currentWindowIndex + 1} / {totalWindows}
                  </span>

                  <button
                    type="button"
                    disabled={currentWindowIndex >= totalWindows - 1}
                    onClick={() => setCurrentWindowIndex(i => Math.min(totalWindows - 1, i + 1))}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
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
                      className="w-24 bg-[#161B22] border border-slate-700 rounded px-2 py-1 text-[11px] text-white focus:border-emerald-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleJumpToPosition}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300"
                    >
                      Jump
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Read-Only Header Metadata Display */}
            {headerText && (
              <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2 truncate">
                  <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-slate-400 font-semibold">Header:</span>
                  <span className="text-slate-200 font-medium truncate">{headerText}</span>
                </div>
                <span className="text-[10px] text-slate-500 bg-slate-800/80 px-2.5 py-0.5 rounded border border-slate-700 shrink-0 font-medium">
                  Read-Only FASTA Metadata
                </span>
              </div>
            )}

            {/* Direct Working Sequence Editor Area */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                  Working Sequence Draft (Direct Resizable Editor)
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  Allowed: {validationReport.allowedAlphabet.join(', ')}
                </span>
              </div>

              <div className="relative">
                <textarea
                  rows={8}
                  value={currentWindowSlice}
                  onChange={(e) => handleWindowTextChange(e.target.value)}
                  placeholder="Paste or type biological sequence residues here..."
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 leading-relaxed tracking-wider resize-y"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* TAB 2: SEQUENCE CHANGES & MUTATION AUDIT LOG                            */}
        {/* ----------------------------------------------------------------------- */}
        {activeTab === 'changes' && (
          <div className="space-y-5">
            {/* Live Mutation KPI Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
              <div className="bg-[#0B0F17] p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Total Changes</span>
                <span className="text-base font-bold text-white font-mono">{mutationStats.totalChanges}</span>
              </div>

              <div className="bg-[#0B0F17] p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Substitutions</span>
                <span className="text-base font-bold text-amber-400 font-mono">{mutationStats.substitutions}</span>
              </div>

              <div className="bg-[#0B0F17] p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Insertions</span>
                <span className="text-base font-bold text-emerald-400 font-mono">{mutationStats.insertions}</span>
              </div>

              <div className="bg-[#0B0F17] p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Deletions</span>
                <span className="text-base font-bold text-red-400 font-mono">{mutationStats.deletions}</span>
              </div>

              <div className="bg-[#0B0F17] p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Original Length</span>
                <span className="text-base font-bold text-slate-300 font-mono">{formatNumber(mutationStats?.originalLength)} {unitLabel}</span>
              </div>

              <div className="bg-[#0B0F17] p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Modified Length</span>
                <span className="text-base font-bold text-cyan-300 font-mono">{formatNumber(mutationStats?.modifiedLength)} {unitLabel}</span>
              </div>

              <div className="bg-[#0B0F17] p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Net Change</span>
                <span className={`text-base font-bold font-mono ${
                  mutationStats.netLengthChange > 0 
                    ? 'text-emerald-400' 
                    : mutationStats.netLengthChange < 0 
                    ? 'text-red-400' 
                    : 'text-slate-400'
                }`}>
                  {mutationStats.netLengthChange > 0 ? `+${mutationStats.netLengthChange}` : mutationStats.netLengthChange} {unitLabel}
                </span>
              </div>
            </div>

            {/* Mutation Summary Table */}
            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-semibold text-slate-300">
                <div className="flex items-center gap-2">
                  <ListTree className="w-4 h-4 text-emerald-400" />
                  <span>Mutation Alignment Table</span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  {mutations.length} detected modifications
                </span>
              </div>

              {mutations.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs font-mono space-y-1">
                  <p className="text-slate-400 font-semibold">No sequence modifications detected.</p>
                  <p className="text-[11px] text-slate-600">
                    Use the Editor tab to introduce sequence substitutions, insertions, or deletions.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                        <th className="py-2.5 px-3">Position</th>
                        <th className="py-2.5 px-3">Original</th>
                        <th className="py-2.5 px-3">Modified</th>
                        <th className="py-2.5 px-3">Change Type</th>
                        <th className="py-2.5 px-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {mutations.map((mut) => (
                        <tr key={mut.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-2.5 px-3 text-cyan-300 font-bold">
                            {mut.position}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {mut.original || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-emerald-300 font-bold">
                            {mut.modified || '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                              mut.operation === 'substitution'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : mut.operation === 'insertion'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-red-500/15 text-red-300 border-red-500/30'
                            }`}>
                              {mut.operation}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-[11px]">
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
            <div className="flex items-center justify-between bg-[#0B0F17] px-4 py-2.5 rounded-xl border border-slate-800 text-xs font-mono flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="text-slate-400">Diff Legend:</span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2.5 h-2.5 bg-emerald-500/30 border border-emerald-500 rounded-xs" /> Inserted
                </span>
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="w-2.5 h-2.5 bg-amber-500/30 border border-amber-500 rounded-xs" /> Replaced
                </span>
                <span className="flex items-center gap-1 text-red-400">
                  <span className="w-2.5 h-2.5 bg-red-500/30 border border-red-500 rounded-xs" /> Deleted
                </span>
              </div>

              {diffTotalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={diffWindowPage === 0}
                    onClick={() => setDiffWindowPage(p => Math.max(0, p - 1))}
                    className="px-2 py-1 rounded bg-slate-800 text-slate-300 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="text-slate-400">
                    Pos {diffWindowStart}..{diffWindowEnd} ({diffWindowPage + 1}/{diffTotalPages})
                  </span>
                  <button
                    type="button"
                    disabled={diffWindowPage >= diffTotalPages - 1}
                    onClick={() => setDiffWindowPage(p => Math.min(diffTotalPages - 1, p + 1))}
                    className="px-2 py-1 rounded bg-slate-800 text-slate-300 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {/* Color-Coded Diff Rendering View */}
            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 font-mono text-xs leading-relaxed space-y-4">
              {/* Original Sequence Line */}
              <div>
                <span className="text-[11px] text-slate-500 font-bold block mb-1 uppercase tracking-wider">
                  ORIGINAL SEQUENCE ({sourceAccession})
                </span>
                <div className="bg-[#161B22] p-3 rounded-lg border border-slate-800/80 break-all select-all max-h-48 overflow-y-auto custom-scrollbar">
                  {diffSegments.length === 0 ? (
                    <span className="text-slate-500">No diff segments to display.</span>
                  ) : (
                    diffSegments.map((seg) => {
                      if (seg.type === 'delete') {
                        return (
                          <span
                            key={seg.id}
                            className="bg-red-500/30 text-red-300 line-through px-0.5 rounded-xs font-bold"
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
                            className="bg-amber-500/30 text-amber-300 px-0.5 rounded-xs font-bold"
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
                        <span key={seg.id} className="text-slate-400">
                          {seg.originalText}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Modified Sequence Line */}
              <div>
                <span className="text-[11px] text-emerald-400 font-bold block mb-1 uppercase tracking-wider">
                  MODIFIED WORKING DRAFT (Version {versionNumber + 1})
                </span>
                <div className="bg-[#161B22] p-3 rounded-lg border border-slate-800/80 break-all select-all max-h-48 overflow-y-auto custom-scrollbar">
                  {diffSegments.length === 0 ? (
                    <span className="text-slate-500">No diff segments to display.</span>
                  ) : (
                    diffSegments.map((seg) => {
                      if (seg.type === 'insert') {
                        return (
                          <span
                            key={seg.id}
                            className="bg-emerald-500/30 text-emerald-300 px-0.5 rounded-xs font-bold"
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
                            className="bg-amber-500/30 text-amber-300 px-0.5 rounded-xs font-bold"
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
                        <span key={seg.id} className="text-slate-200">
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
              <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2 truncate">
                  <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-slate-400 font-semibold">Header:</span>
                  <span className="text-slate-200 font-medium truncate">{headerText}</span>
                </div>
                <span className="text-[10px] text-slate-400 bg-slate-800 px-2.5 py-0.5 rounded border border-slate-700 shrink-0">
                  FASTA Header
                </span>
              </div>
            )}

            {/* Stat Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-[#0B0F17] p-3.5 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Original Length</span>
                <span className="text-base font-bold text-slate-200 font-mono">
                  {formatNumber(cleanOriginalSeq?.length)} {unitLabel}
                </span>
              </div>

              <div className="bg-[#0B0F17] p-3.5 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Modified Length</span>
                <span className="text-base font-bold text-cyan-300 font-mono">
                  {formatNumber(workingSequence?.length)} {unitLabel}
                </span>
              </div>

              <div className="bg-[#0B0F17] p-3.5 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Net Change</span>
                <span className={`text-base font-bold font-mono ${
                  mutationStats.netLengthChange > 0 
                    ? 'text-emerald-400' 
                    : mutationStats.netLengthChange < 0 
                    ? 'text-red-400' 
                    : 'text-slate-400'
                }`}>
                  {mutationStats.netLengthChange > 0 ? `+${mutationStats.netLengthChange}` : mutationStats.netLengthChange} {unitLabel}
                </span>
              </div>

              <div className="bg-[#0B0F17] p-3.5 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Biological Type</span>
                <span className="text-base font-bold text-emerald-400 font-mono">
                  {activeBioType}
                </span>
              </div>

              <div className="bg-[#0B0F17] p-3.5 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Validation</span>
                <span className={`text-base font-bold font-mono flex items-center gap-1.5 ${
                  validationReport.isValid ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {validationReport.isValid ? (
                    <>
                      <span>VALID</span>
                      <Check className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>INVALID</span>
                      <X className="w-4 h-4" />
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Validation Panel */}
            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-semibold text-slate-300">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-emerald-400" />
                  <span>Sequence Validation &amp; Quality Check</span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  Debounced IUPAC Compliance
                </span>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-slate-500">Biological Type:</span>
                  <span className="text-white font-bold">{activeBioType}</span>
                  <span className="text-slate-500 ml-4">Sequence Length:</span>
                  <span className="text-cyan-300 font-bold">{formatNumber(workingSequence?.length)} {unitLabel}</span>
                  <span className="text-slate-500 ml-4">Validation Status:</span>
                  <span className={`font-bold ${validationReport.isValid ? 'text-emerald-400' : 'text-red-400'}`}>
                    {validationReport.validationStatus}
                  </span>
                </div>

                {validationReport.isValid ? (
                  <div className="space-y-1 pt-1 text-emerald-300 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>✓ Valid biological sequence</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>✓ Ready for analysis</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 pt-1 text-red-300 text-[11px]">
                    <div className="flex items-center gap-1.5 font-bold text-red-400">
                      <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                      <span>✕ Invalid biological characters detected</span>
                    </div>
                    {validationReport.invalidChars.length > 0 && (
                      <div className="text-red-200">
                        <span className="text-red-400 font-semibold">Invalid characters: </span>
                        {validationReport.invalidChars.map(c => `'${c.char}'`).join(', ')}
                        <span className="text-red-400 font-semibold ml-3">Positions: </span>
                        {validationReport.invalidChars.flatMap(c => c.positions).slice(0, 15).join(', ')}
                      </div>
                    )}
                    {validationReport.errorSummary && (
                      <p className="text-red-400/90 text-[10px]">
                        {validationReport.errorSummary}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Compact Change Summary with Jump Link */}
            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="space-y-1 text-xs font-mono">
                <div className="text-slate-300 font-semibold flex items-center gap-2">
                  <ListTree className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{mutations.length} modification{mutations.length === 1 ? '' : 's'} detected</span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-3">
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
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>View Full Mutation Table</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Analysis Readiness State Banner */}
            <div className={`p-4 rounded-xl border text-xs font-mono space-y-1 ${readiness.color}`}>
              <div className="font-bold flex items-center gap-2">
                {validationReport.isValid ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                <span>{readiness.title}</span>
              </div>
              <p className="text-[11px] opacity-90">
                {readiness.message}
              </p>
            </div>

            {/* Formatted Sequence Preview */}
            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                  Modified Sequence Preview
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyFASTA}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {copiedNotification ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedNotification ? 'Copied FASTA!' : 'Copy FASTA'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportFASTA}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download .fasta</span>
                  </button>
                </div>
              </div>

              <div className="bg-[#161B22] p-3 rounded-lg border border-slate-800 font-mono text-xs text-slate-200 break-all select-all max-h-48 overflow-y-auto custom-scrollbar leading-relaxed">
                {workingSequence || <span className="text-slate-600">Empty sequence</span>}
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
                <div className="bg-[#0B0F17] border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex items-start justify-between flex-wrap gap-4">
                    <div className="space-y-1.5 max-w-2xl">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold">
                          Modified Analysis Pending
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {mutations.length} modification{mutations.length === 1 ? '' : 's'} staged
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-white tracking-tight">
                        Generate Version {versionNumber + 1} Comparative Analysis
                      </h3>
                      <p className="text-xs text-slate-300 leading-relaxed font-mono">
                        Run the verified biological analysis pipeline to calculate real metrics (Length, GC%, AT%, ORFs, physicochemical parameters) and generate the full side-by-side structural comparison.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isAnalyzing || !validationReport.isValid || !hasChanges}
                      onClick={handleTriggerAnalysis}
                      className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs font-mono transition-all shadow-lg shadow-emerald-900/40 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
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
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
                    <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
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
      <div className="p-4 md:p-5 bg-[#0B0F17] border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Undo, Redo, Reset, Cancel */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={historyIndex <= 0}
            onClick={handleUndo}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-medium transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Undo (Ctrl/Cmd+Z)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>

          <button
            type="button"
            disabled={historyIndex >= history.length - 1}
            onClick={handleRedo}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-medium transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Redo (Ctrl/Cmd+Shift+Z)"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Redo</span>
          </button>

          <button
            type="button"
            disabled={!hasChanges}
            onClick={handleReset}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-medium transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Reset sequence to original immutable record"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleCancelClick}
            className="px-3 py-2 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-mono font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>

        {/* Right: Metrics & Primary Action Button */}
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-[11px] font-mono text-slate-400">
              Original: <span className="text-slate-200 font-bold">{formatNumber(cleanOriginalSeq?.length)} {unitLabel}</span> | Modified: <span className="text-cyan-300 font-bold">{formatNumber(workingSequence?.length)} {unitLabel}</span>
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Recorded Changes: <span className="text-emerald-400 font-bold">{mutations.length}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={isAnalyzing || !validationReport.isValid || !hasChanges}
            onClick={handleTriggerAnalysis}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs font-mono transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="text-base font-bold text-white">Unsaved Sequence Modifications</h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              You have unsaved sequence modifications. Discarding will revert all edits and close the editor without analyzing.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
              >
                Continue Editing
              </button>
              <button
                type="button"
                onClick={executeDiscardAndClose}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="text-base font-bold text-white">Reset Sequence to Original?</h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This will discard all current edits, reset your history, and restore the sequence to the original immutable biological record.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
              >
                Keep Current Edits
              </button>
              <button
                type="button"
                onClick={executeReset}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors cursor-pointer"
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
