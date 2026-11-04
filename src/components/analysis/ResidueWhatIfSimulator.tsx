import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Check,
  Play,
  Loader2,
  Clock,
  Plus,
  Trash2,
  Edit2,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useBioSequence } from '../../context/BioSequenceContext';
import {
  WhatIfChangeType,
  WhatIfSimulationResult,
  PendingWhatIfChange,
  simulateMultipleSequenceChanges,
  simulateSequenceChange,
  validateWhatIfInput,
  validateMultipleWhatIfChanges,
  DNA_ALPHABET,
  RNA_ALPHABET,
  PROTEIN_ALPHABET
} from '../../lib/bio/whatIfSimulator';

interface ResidueWhatIfSimulatorProps {
  onApplied?: () => void;
  onClose?: () => void;
}

type SimulationStatus = 'idle' | 'running' | 'complete' | 'failed';

const DNA_BASES = [
  { code: 'A', name: 'Adenine (Purine)', color: 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100 font-bold' },
  { code: 'C', name: 'Cytosine (Pyrimidine)', color: 'bg-sky-50 text-sky-900 border-sky-300 hover:bg-sky-100 font-bold' },
  { code: 'G', name: 'Guanine (Purine)', color: 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 font-bold' },
  { code: 'T', name: 'Thymine (Pyrimidine)', color: 'bg-rose-50 text-rose-900 border-rose-300 hover:bg-rose-100 font-bold' }
];

const RNA_BASES = [
  { code: 'A', name: 'Adenine (Purine)', color: 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100 font-bold' },
  { code: 'C', name: 'Cytosine (Pyrimidine)', color: 'bg-sky-50 text-sky-900 border-sky-300 hover:bg-sky-100 font-bold' },
  { code: 'G', name: 'Guanine (Purine)', color: 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 font-bold' },
  { code: 'U', name: 'Uracil (Pyrimidine)', color: 'bg-purple-50 text-purple-900 border-purple-300 hover:bg-purple-100 font-bold' }
];

const PROTEIN_AA = [
  { code: 'A', name: 'Alanine', category: 'Aliphatic', color: 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100' },
  { code: 'R', name: 'Arginine', category: 'Basic (+)', color: 'bg-purple-50 text-purple-900 border-purple-300 hover:bg-purple-100 font-bold' },
  { code: 'N', name: 'Asparagine', category: 'Polar', color: 'bg-sky-50 text-sky-900 border-sky-300 hover:bg-sky-100' },
  { code: 'D', name: 'Aspartic Acid', category: 'Acidic (-)', color: 'bg-pink-50 text-pink-900 border-pink-300 hover:bg-pink-100 font-bold' },
  { code: 'C', name: 'Cysteine', category: 'Special / Disulfide', color: 'bg-cyan-50 text-cyan-900 border-cyan-300 hover:bg-cyan-100' },
  { code: 'Q', name: 'Glutamine', category: 'Polar', color: 'bg-sky-50 text-sky-900 border-sky-300 hover:bg-sky-100' },
  { code: 'E', name: 'Glutamic Acid', category: 'Acidic (-)', color: 'bg-pink-50 text-pink-900 border-pink-300 hover:bg-pink-100 font-bold' },
  { code: 'G', name: 'Glycine', category: 'Special / Flexible', color: 'bg-slate-50 text-slate-900 border-slate-300 hover:bg-slate-100' },
  { code: 'H', name: 'Histidine', category: 'Basic (+)', color: 'bg-purple-50 text-purple-900 border-purple-300 hover:bg-purple-100 font-bold' },
  { code: 'I', name: 'Isoleucine', category: 'Aliphatic', color: 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100' },
  { code: 'L', name: 'Leucine', category: 'Aliphatic', color: 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100' },
  { code: 'K', name: 'Lysine', category: 'Basic (+)', color: 'bg-purple-50 text-purple-900 border-purple-300 hover:bg-purple-100 font-bold' },
  { code: 'M', name: 'Methionine', category: 'Aliphatic', color: 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100' },
  { code: 'F', name: 'Phenylalanine', category: 'Aromatic', color: 'bg-amber-100 text-amber-950 border-amber-400 hover:bg-amber-200' },
  { code: 'P', name: 'Proline', category: 'Special / Kink', color: 'bg-orange-50 text-orange-900 border-orange-300 hover:bg-orange-100' },
  { code: 'S', name: 'Serine', category: 'Polar', color: 'bg-sky-50 text-sky-900 border-sky-300 hover:bg-sky-100' },
  { code: 'T', name: 'Threonine', category: 'Polar', color: 'bg-sky-50 text-sky-900 border-sky-300 hover:bg-sky-100' },
  { code: 'W', name: 'Tryptophan', category: 'Aromatic', color: 'bg-amber-100 text-amber-950 border-amber-400 hover:bg-amber-200' },
  { code: 'Y', name: 'Tyrosine', category: 'Aromatic', color: 'bg-sky-100 text-sky-950 border-sky-400 hover:bg-sky-200' },
  { code: 'V', name: 'Valine', category: 'Aliphatic', color: 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100' }
];

export const ResidueWhatIfSimulator: React.FC<ResidueWhatIfSimulatorProps> = ({ onApplied, onClose }) => {
  const {
    sequence,
    originalSequence,
    sequenceType,
    accession,
    length,
    versionLabel,
    editSequence,
    simulationResult: contextSimResult,
    setWhatIfSimulation,
    clearWhatIfSimulation
  } = useBioSequence();

  // Active sequence in workspace
  const cleanActiveSeq = useMemo(() => {
    if (sequence) return sequence.toUpperCase().replace(/[^A-Z*]/g, '');
    if (originalSequence) return originalSequence.toUpperCase().replace(/[^A-Z*]/g, '');
    return '';
  }, [sequence, originalSequence]);

  const seqLen = cleanActiveSeq.length || length || 1;
  const isProtein = sequenceType === 'PROTEIN';
  const isRna = sequenceType === 'RNA';
  const isDna = sequenceType === 'DNA' || (!isProtein && !isRna);

  const activePalette = useMemo(() => {
    if (isProtein) return PROTEIN_AA;
    if (isRna) return RNA_BASES;
    return DNA_BASES;
  }, [isProtein, isRna]);

  // Initial position coordinate (e.g. 175 for p53 or middle)
  const defaultInitialPos = useMemo(() => {
    if (seqLen >= 175) return 175;
    return Math.max(1, Math.min(100, Math.floor(seqLen / 2) || 1));
  }, [seqLen]);

  // Form State for pending edit/input
  const [position, setPosition] = useState<number>(defaultInitialPos);
  const [positionInput, setPositionInput] = useState<string>(String(defaultInitialPos));
  const [mutationMode, setMutationMode] = useState<WhatIfChangeType>('substitution');

  // Automatically read current residue/base from active sequence at the given position
  const currentResidue = useMemo(() => {
    if (!cleanActiveSeq || position < 1 || position > cleanActiveSeq.length) return '';
    return cleanActiveSeq[position - 1] || '';
  }, [cleanActiveSeq, position]);

  // Candidate replacement residue/base
  const [candidateResidue, setCandidateResidue] = useState<string>('K');

  // Insertion parameters
  const [insertionPos, setInsertionPos] = useState<number>(defaultInitialPos);
  const [insertionResidues, setInsertionResidues] = useState<string>('K');

  // Deletion parameters
  const [deletionStart, setDeletionStart] = useState<number>(defaultInitialPos);
  const [deletionEnd, setDeletionEnd] = useState<number>(defaultInitialPos);

  // Multi-Change State: Pending Changes List
  const [pendingChanges, setPendingChanges] = useState<PendingWhatIfChange[]>([]);
  const [editingChangeId, setEditingChangeId] = useState<string | null>(null);
  const [showAllChanges, setShowAllChanges] = useState<boolean>(false);

  // Simulation Status
  const [simulationStatus, setSimulationStatus] = useState<SimulationStatus>(
    contextSimResult ? 'complete' : 'idle'
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationFailureDetails, setValidationFailureDetails] = useState<any | null>(null);
  const [simulationResult, setSimulationResult] = useState<WhatIfSimulationResult | null>(contextSimResult);
  const [applySuccessMsg, setApplySuccessMsg] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState<boolean>(false);

  // Synchronize simulation result with context if changed externally
  useEffect(() => {
    if (contextSimResult) {
      setSimulationResult(contextSimResult);
      setSimulationStatus('complete');
      if (contextSimResult.changes && contextSimResult.changes.length > 0 && pendingChanges.length === 0) {
        setPendingChanges(contextSimResult.changes);
      }
    } else if (!contextSimResult && simulationStatus === 'complete') {
      setSimulationResult(null);
      setSimulationStatus('idle');
    }
  }, [contextSimResult]);

  // Synchronize candidate defaults whenever current residue or sequence type changes
  useEffect(() => {
    if (isProtein) {
      if (currentResidue === 'R') setCandidateResidue('K');
      else if (currentResidue === 'K') setCandidateResidue('R');
      else if (currentResidue === 'A') setCandidateResidue('G');
      else if (currentResidue === 'L') setCandidateResidue('P');
      else if (currentResidue === 'G') setCandidateResidue('D');
      else setCandidateResidue('A');
      setInsertionResidues('K');
    } else if (isRna) {
      if (currentResidue === 'A') setCandidateResidue('U');
      else if (currentResidue === 'U') setCandidateResidue('A');
      else if (currentResidue === 'G') setCandidateResidue('C');
      else setCandidateResidue('G');
      setInsertionResidues('U');
    } else {
      // DNA
      if (currentResidue === 'A') setCandidateResidue('G');
      else if (currentResidue === 'T') setCandidateResidue('C');
      else if (currentResidue === 'G') setCandidateResidue('A');
      else setCandidateResidue('T');
      setInsertionResidues('G');
    }
  }, [currentResidue, isProtein, isRna]);

  // Synchronize position inputs
  const handlePositionChange = (valStr: string) => {
    setPositionInput(valStr);
    const p = parseInt(valStr, 10);
    if (!isNaN(p) && p >= 1 && p <= seqLen) {
      setPosition(p);
      setDeletionStart(p);
      setDeletionEnd(p);
      setInsertionPos(p);
      setValidationError(null);
      setValidationFailureDetails(null);
    }
  };

  // ---------------------------------------------------------------------------
  // 1. ADD / UPDATE CHANGE IN PENDING LIST
  // ---------------------------------------------------------------------------
  const handleAddOrUpdateChange = () => {
    const targetPos = parseInt(positionInput, 10) || position;

    // Validate the current single change inputs first
    const singleValidation = validateWhatIfInput({
      sequence: cleanActiveSeq,
      sequenceType,
      mode: mutationMode,
      position: targetPos,
      currentResidue,
      candidateResidue,
      insertionPos,
      insertionResidues,
      deletionStart,
      deletionEnd
    });

    if (!singleValidation.isValid) {
      setValidationError(singleValidation.error || 'Invalid modification inputs.');
      return;
    }

    let changeObj: PendingWhatIfChange;

    if (mutationMode === 'substitution') {
      const orig = currentResidue || cleanActiveSeq[targetPos - 1] || '';
      const mod = candidateResidue.trim().toUpperCase();
      changeObj = {
        id: editingChangeId || `sub_${Date.now()}_${targetPos}`,
        position: targetPos,
        type: 'substitution',
        originalResidue: orig,
        modifiedResidue: mod,
        description: `${orig}${targetPos}${mod}`
      };
    } else if (mutationMode === 'insertion') {
      const ins = insertionResidues.trim().toUpperCase();
      changeObj = {
        id: editingChangeId || `ins_${Date.now()}_${insertionPos}`,
        position: insertionPos,
        type: 'insertion',
        insertedSequence: ins,
        description: `Ins +${ins} @${insertionPos}`
      };
    } else {
      const delSpan = cleanActiveSeq.slice(deletionStart - 1, deletionEnd);
      changeObj = {
        id: editingChangeId || `del_${Date.now()}_${deletionStart}`,
        position: deletionStart,
        type: 'deletion',
        deletionEnd,
        deletedSequence: delSpan,
        description: `Del -${delSpan} (${deletionStart}..${deletionEnd})`
      };
    }

    if (editingChangeId) {
      setPendingChanges((prev) => prev.map((c) => (c.id === editingChangeId ? changeObj : c)));
      setEditingChangeId(null);
    } else {
      // Prevent duplicate exact substitution at same position
      const existingIdx = pendingChanges.findIndex((c) => c.position === changeObj.position && c.type === changeObj.type);
      if (existingIdx >= 0) {
        setPendingChanges((prev) => prev.map((c, i) => (i === existingIdx ? changeObj : c)));
      } else {
        setPendingChanges((prev) => [...prev, changeObj]);
      }
    }

    setValidationError(null);
    setValidationFailureDetails(null);
    if (simulationStatus === 'failed') setSimulationStatus('idle');
  };

  // Load a change into form for editing
  const handleEditChange = (change: PendingWhatIfChange) => {
    setEditingChangeId(change.id);
    setMutationMode(change.type);
    setPosition(change.position);
    setPositionInput(String(change.position));

    if (change.type === 'substitution') {
      if (change.modifiedResidue) setCandidateResidue(change.modifiedResidue);
    } else if (change.type === 'insertion') {
      setInsertionPos(change.position);
      if (change.insertedSequence) setInsertionResidues(change.insertedSequence);
    } else if (change.type === 'deletion') {
      setDeletionStart(change.position);
      if (change.deletionEnd) setDeletionEnd(change.deletionEnd);
    }
  };

  // Remove a change from pending list
  const handleRemoveChange = (id: string) => {
    setPendingChanges((prev) => prev.filter((c) => c.id !== id));
    if (editingChangeId === id) setEditingChangeId(null);
    setValidationError(null);
    setValidationFailureDetails(null);
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setEditingChangeId(null);
    setValidationError(null);
    setValidationFailureDetails(null);
  };

  // ---------------------------------------------------------------------------
  // 2. EXECUTE SIMULATION (ALL CHANGES TOGETHER, NON-DESTRUCTIVE)
  // ---------------------------------------------------------------------------
  const handleSimulateAll = () => {
    // If pending changes list is empty, but user filled out form, auto-package form inputs
    let changesToSimulate = [...pendingChanges];

    if (changesToSimulate.length === 0) {
      const targetPos = parseInt(positionInput, 10) || position;
      const singleValidation = validateWhatIfInput({
        sequence: cleanActiveSeq,
        sequenceType,
        mode: mutationMode,
        position: targetPos,
        currentResidue,
        candidateResidue,
        insertionPos,
        insertionResidues,
        deletionStart,
        deletionEnd
      });

      if (!singleValidation.isValid) {
        setSimulationStatus('failed');
        setValidationError(singleValidation.error || 'Validation error in simulation inputs.');
        return;
      }

      let singleChange: PendingWhatIfChange;
      if (mutationMode === 'substitution') {
        const orig = currentResidue || cleanActiveSeq[targetPos - 1] || '';
        const mod = candidateResidue.trim().toUpperCase();
        singleChange = {
          id: `sub_${Date.now()}_${targetPos}`,
          position: targetPos,
          type: 'substitution',
          originalResidue: orig,
          modifiedResidue: mod,
          description: `${orig}${targetPos}${mod}`
        };
      } else if (mutationMode === 'insertion') {
        const ins = insertionResidues.trim().toUpperCase();
        singleChange = {
          id: `ins_${Date.now()}_${insertionPos}`,
          position: insertionPos,
          type: 'insertion',
          insertedSequence: ins,
          description: `Ins +${ins} @${insertionPos}`
        };
      } else {
        const delSpan = cleanActiveSeq.slice(deletionStart - 1, deletionEnd);
        singleChange = {
          id: `del_${Date.now()}_${deletionStart}`,
          position: deletionStart,
          type: 'deletion',
          deletionEnd,
          deletedSequence: delSpan,
          description: `Del -${delSpan} (${deletionStart}..${deletionEnd})`
        };
      }

      changesToSimulate = [singleChange];
      setPendingChanges([singleChange]);
    }

    // Run comprehensive validation on all changes before simulation
    const multiVal = validateMultipleWhatIfChanges(cleanActiveSeq, sequenceType, changesToSimulate);
    if (!multiVal.isValid) {
      setSimulationStatus('failed');
      setValidationError(multiVal.error || 'Validation failed for one or more pending changes.');
      setValidationFailureDetails(multiVal.details || null);
      setSimulationResult(null);
      clearWhatIfSimulation();
      return;
    }

    setValidationError(null);
    setValidationFailureDetails(null);
    setSimulationStatus('running');

    try {
      // Simulate all changes non-destructively
      const result = simulateMultipleSequenceChanges({
        sequence: cleanActiveSeq,
        sequenceType,
        changes: changesToSimulate
      });

      setSimulationResult(result);
      setSimulationStatus('complete');
      setWhatIfSimulation(result);
    } catch (err: any) {
      setSimulationStatus('failed');
      setValidationError(err?.message || 'Simulation execution failed.');
      setSimulationResult(null);
      clearWhatIfSimulation();
    }
  };

  // ---------------------------------------------------------------------------
  // 3. DISCARD ALL CHANGES & RESTORE V1
  // ---------------------------------------------------------------------------
  const handleDiscardAll = () => {
    setPendingChanges([]);
    setEditingChangeId(null);
    setSimulationResult(null);
    setSimulationStatus('idle');
    setValidationError(null);
    setValidationFailureDetails(null);
    setApplySuccessMsg(null);
    clearWhatIfSimulation();
    if (onClose) onClose();
  };

  // ---------------------------------------------------------------------------
  // 4. APPLY ALL CHANGES TO WORKING COPY (ONE EDIT SESSION = ONE NEW VERSION)
  // ---------------------------------------------------------------------------
  const handleApplyAllChanges = async () => {
    if (!simulationResult) return;

    setIsApplying(true);
    try {
      const changeCount = simulationResult.mutations.length || pendingChanges.length || 1;
      const desc = simulationResult.summary.description || `${changeCount} changes applied`;

      console.log('[WHAT_IF] Original length:', cleanActiveSeq.length);
      console.log('[WHAT_IF] Simulated length:', simulationResult.simulatedSequence.length);
      console.log('[WHAT_IF] Changes:', simulationResult.mutations.map((m) => m.description || `${m.original}${m.position}${m.modified}`).join(', ') || desc);
      console.log('[WHAT_IF] Applying changes:', desc);

      console.log('[WHAT_IF] Analysis recalculation started:');
      const ok = await editSequence(simulationResult.simulatedSequence, desc);

      if (ok) {
        console.log('[WHAT_IF] Working copy updated:', `${simulationResult.simulatedSequence.length} residues`);
        console.log('[WHAT_IF] Apply completed: true');
        setApplySuccessMsg(`All ${changeCount} change(s) successfully applied to working copy. Baseline V1 preserved.`);
        setSimulationResult(null);
        setSimulationStatus('idle');
        setPendingChanges([]);
        clearWhatIfSimulation();
        if (onApplied) onApplied();
        if (onClose) onClose();
        setTimeout(() => setApplySuccessMsg(null), 4500);
      } else {
        console.log('[WHAT_IF] Apply completed: false');
        setValidationError('Failed to apply simulated sequence to working copy.');
      }
    } catch (err: any) {
      console.error('[WHAT_IF] Apply error:', err);
      setValidationError(`Apply failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 md:p-7 space-y-6 shadow-xs font-sans">
      {/* ------------------------------------------------------------- */}
      {/* HEADER & SIMULATION STATUS INDICATOR                          */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 shadow-2xs">
            <Sparkles className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold font-mono text-[#0F172A] tracking-wider uppercase">
                What-If Simulator
              </h3>
              {/* Status Badge */}
              <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-md border font-bold flex items-center gap-1.5 ${
                simulationStatus === 'complete'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : simulationStatus === 'running'
                  ? 'bg-sky-50 text-sky-800 border-sky-300 animate-pulse'
                  : simulationStatus === 'failed'
                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}>
                {simulationStatus === 'complete' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                {simulationStatus === 'running' && <Loader2 className="w-3 h-3 animate-spin text-sky-600" />}
                {simulationStatus === 'failed' && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                {simulationStatus === 'idle' && <Clock className="w-3 h-3 text-slate-500" />}
                <span>
                  {simulationStatus === 'complete'
                    ? 'Simulation Complete ✓'
                    : simulationStatus === 'running'
                    ? 'Simulating Changes...'
                    : simulationStatus === 'failed'
                    ? 'Simulation Blocked'
                    : 'Ready to Simulate'}
                </span>
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              Active Target: <strong className="text-[#0F172A] font-mono">{accession || 'Target'}</strong> ({seqLen} {isProtein ? 'aa' : 'bp'}) · {versionLabel}
            </p>
          </div>
        </div>

        {/* Change Type Tabs */}
        <div className="flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-1 font-mono text-xs">
          {[
            { id: 'substitution' as const, label: 'Substitution' },
            { id: 'insertion' as const, label: 'Insertion' },
            { id: 'deletion' as const, label: 'Deletion' }
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => {
                setMutationMode(mode.id);
                setValidationError(null);
                setValidationFailureDetails(null);
                if (simulationStatus === 'failed') setSimulationStatus('idle');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                mutationMode === mode.id
                  ? 'bg-purple-600 text-white shadow-xs font-bold'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Success Notification */}
      {applySuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 flex items-center justify-between font-mono animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-bold">{applySuccessMsg}</span>
          </div>
          <span className="text-[10px] text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
            Working Copy Updated
          </span>
        </div>
      )}

      {/* Detailed Validation Error Banner (Requirement 6) */}
      {validationError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-900 space-y-1.5 font-mono animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <strong className="text-sm font-bold">Validation Error:</strong>
          </div>
          <p className="text-xs text-rose-800 leading-relaxed font-semibold pl-6">
            {validationError}
          </p>
          {validationFailureDetails && (
            <div className="ml-6 mt-2 p-2.5 bg-white border border-rose-200 rounded-lg text-[11px] grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Change #</span>
                <span className="font-bold text-slate-800">{validationFailureDetails.changeNumber}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Position</span>
                <span className="font-bold text-slate-800">{validationFailureDetails.position}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Expected</span>
                <span className="font-bold text-rose-700">{validationFailureDetails.expected}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Actual in Seq</span>
                <span className="font-bold text-rose-700">{validationFailureDetails.actual}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. INPUT CONTROLS                                             */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 md:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold font-mono text-[#0F172A] uppercase tracking-wider">
            {editingChangeId ? 'Edit Sequence Modification' : 'Configure Sequence Modification'}
          </span>
          {editingChangeId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-mono cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel Edit</span>
            </button>
          )}
        </div>

        {mutationMode === 'substitution' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
            {/* Position Coordinate */}
            <div className="space-y-1.5">
              <label className="block font-bold text-[#0F172A]">
                Position (1 .. {seqLen})
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={seqLen}
                  value={positionInput}
                  onChange={(e) => handlePositionChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBD5E1] text-[#0F172A] font-bold text-xs focus:outline-none focus:border-purple-600 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => handlePositionChange(String(Math.max(1, position - 1)))}
                  className="px-2.5 py-2 rounded-xl bg-white border border-[#CBD5E1] text-[#0F172A] hover:bg-slate-100 font-bold cursor-pointer"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => handlePositionChange(String(Math.min(seqLen, position + 1)))}
                  className="px-2.5 py-2 rounded-xl bg-white border border-[#CBD5E1] text-[#0F172A] hover:bg-slate-100 font-bold cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            {/* Current Residue (Automatically Read from Active Sequence) */}
            <div className="space-y-1.5">
              <label className="block font-bold text-[#0F172A]">
                Current Residue / Base
              </label>
              <div className="px-3 py-2 rounded-xl bg-white border border-[#CBD5E1] text-[#0F172A] font-bold flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-purple-100 text-purple-900 flex items-center justify-center font-bold">
                    {currentResidue || '—'}
                  </span>
                  <span>{activePalette.find((p) => p.code === currentResidue)?.name || currentResidue || 'None'}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">Pos {position}</span>
              </div>
            </div>

            {/* New Residue / Base */}
            <div className="space-y-1.5">
              <label className="block font-bold text-[#0F172A]">
                New Residue / Base
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={candidateResidue}
                  onChange={(e) => {
                    setCandidateResidue(e.target.value);
                    setValidationError(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBD5E1] text-[#0F172A] font-bold text-xs focus:outline-none focus:border-purple-600 shadow-2xs cursor-pointer"
                >
                  {activePalette.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
                <span className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                  {candidateResidue}
                </span>
              </div>
            </div>
          </div>
        )}

        {mutationMode === 'insertion' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
            <div className="space-y-1.5">
              <label className="block font-bold text-[#0F172A]">
                Insert Before Position (1 .. {seqLen + 1})
              </label>
              <input
                type="number"
                min={1}
                max={seqLen + 1}
                value={insertionPos}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) setInsertionPos(v);
                }}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBD5E1] text-[#0F172A] font-bold text-xs focus:outline-none focus:border-purple-600 shadow-2xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block font-bold text-[#0F172A]">
                Residues / Bases to Insert
              </label>
              <input
                type="text"
                value={insertionResidues}
                onChange={(e) => {
                  setInsertionResidues(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''));
                  setValidationError(null);
                }}
                placeholder={isProtein ? 'e.g. K, R, GGGS' : 'e.g. AATT, GATC'}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBD5E1] text-[#0F172A] font-bold text-xs focus:outline-none focus:border-purple-600 shadow-2xs uppercase"
              />
            </div>
          </div>
        )}

        {mutationMode === 'deletion' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
            <div className="space-y-1.5">
              <label className="block font-bold text-[#0F172A]">
                Deletion Start Position (1 .. {seqLen})
              </label>
              <input
                type="number"
                min={1}
                max={seqLen}
                value={deletionStart}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) {
                    setDeletionStart(v);
                    if (v > deletionEnd) setDeletionEnd(v);
                  }
                }}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBD5E1] text-[#0F172A] font-bold text-xs focus:outline-none focus:border-purple-600 shadow-2xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block font-bold text-[#0F172A]">
                Deletion End Position (1 .. {seqLen})
              </label>
              <input
                type="number"
                min={deletionStart}
                max={seqLen}
                value={deletionEnd}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) setDeletionEnd(v);
                }}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBD5E1] text-[#0F172A] font-bold text-xs focus:outline-none focus:border-purple-600 shadow-2xs"
              />
            </div>
          </div>
        )}

        {/* Add / Update Change Button */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] font-mono text-slate-500">
            {mutationMode === 'substitution'
              ? `Preview change: ${currentResidue}${position} → ${candidateResidue}`
              : mutationMode === 'insertion'
              ? `Preview insertion: +${insertionResidues} @ pos ${insertionPos}`
              : `Preview deletion: -${cleanActiveSeq.slice(deletionStart - 1, deletionEnd)} (${deletionStart}..${deletionEnd})`}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddOrUpdateChange}
              className="px-4 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-300 font-mono font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              {editingChangeId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{editingChangeId ? 'Update Change' : '+ Add Change'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. CHANGE LIST: MODIFICATIONS TABLE (Requirement 3 & 7)        */}
      {/* ------------------------------------------------------------- */}
      {pendingChanges.length > 0 && (
        <div className="space-y-3 font-mono">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                MODIFICATIONS
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-300">
                {pendingChanges.length} change{pendingChanges.length === 1 ? '' : 's'}
              </span>
            </div>

            {pendingChanges.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllChanges(!showAllChanges)}
                className="text-xs text-purple-700 hover:text-purple-900 flex items-center gap-1 cursor-pointer font-bold"
              >
                <span>{showAllChanges ? 'Collapse List' : `View All Changes (${pendingChanges.length})`}</span>
                {showAllChanges ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          <div className={`border border-[#E2E8F0] rounded-xl overflow-hidden shadow-2xs ${
            !showAllChanges && pendingChanges.length > 5 ? 'max-h-64 overflow-y-auto' : ''
          }`}>
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[#475569] border-b border-[#E2E8F0]">
                <tr>
                  <th className="p-3">Pos</th>
                  <th className="p-3">Before</th>
                  <th className="p-3">After</th>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] bg-white">
                {pendingChanges.map((change, idx) => (
                  <tr
                    key={change.id || idx}
                    className={`hover:bg-[#F8FAFC] transition-colors ${
                      editingChangeId === change.id ? 'bg-purple-50/50' : ''
                    }`}
                  >
                    <td className="p-3 font-bold text-slate-900">{change.position}</td>
                    <td className="p-3 font-bold text-rose-700">
                      {change.type === 'substitution'
                        ? change.originalResidue || '—'
                        : change.type === 'deletion'
                        ? change.deletedSequence || '—'
                        : '—'}
                    </td>
                    <td className="p-3 font-bold text-emerald-700">
                      {change.type === 'substitution'
                        ? change.modifiedResidue || '—'
                        : change.type === 'insertion'
                        ? `+${change.insertedSequence}`
                        : '—'}
                    </td>
                    <td className="p-3">
                      <span className="capitalize font-semibold text-slate-600">
                        {change.type}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-1.5">
                      <button
                        type="button"
                        onClick={() => handleEditChange(change)}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer transition-colors"
                        title="Edit modification parameters"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveChange(change.id)}
                        className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold cursor-pointer transition-colors"
                        title="Remove modification"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. SIMULATE BUTTON                                            */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
        <span className="text-xs font-mono text-[#64748B]">
          {pendingChanges.length > 0
            ? `Ready to simulate ${pendingChanges.length} modification${pendingChanges.length === 1 ? '' : 's'} on temporary copy.`
            : 'Click Add Change or Simulate to test sequence mutations non-destructively.'}
        </span>

        <div className="flex items-center gap-2">
          {pendingChanges.length > 0 && (
            <button
              type="button"
              onClick={handleDiscardAll}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-mono text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Changes</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSimulateAll}
            disabled={simulationStatus === 'running'}
            className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-mono text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
          >
            {simulationStatus === 'running' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-white" />
            )}
            <span>
              {pendingChanges.length > 1
                ? `Simulate ${pendingChanges.length} Changes`
                : 'Simulate Changes'}
            </span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. SIMULATION RESULTS PANEL (Requirement 8 & 9)                */}
      {/* ------------------------------------------------------------- */}
      {simulationResult && (
        <div className="space-y-6 pt-4 border-t border-[#E2E8F0] animate-fadeIn font-mono">
          {/* Status Header */}
          <div className="p-4 rounded-2xl bg-[#0F172A] text-white space-y-3 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h4 className="text-sm font-bold tracking-wider text-emerald-400 uppercase">
                  SIMULATION COMPLETE ✓
                </h4>
              </div>
              <span className="text-xs text-purple-300 font-bold px-2.5 py-0.5 rounded-md bg-purple-950 border border-purple-700">
                {simulationResult.mutations.length} change{simulationResult.mutations.length === 1 ? '' : 's'} simulated
              </span>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">ORIGINAL BASELINE:</span>
                <span className="font-bold text-white">V1 ({simulationResult.originalSequence.length} {isProtein ? 'aa' : 'bp'})</span>
              </div>
              <div className="text-center">
                <span className="text-slate-400 block text-[10px]">STATUS:</span>
                <span className="font-bold text-purple-300">Temporary Working Copy (In-Silico)</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px]">SIMULATED SEQUENCE:</span>
                <span className="font-bold text-emerald-400">Working Copy ({simulationResult.simulatedSequence.length} {isProtein ? 'aa' : 'bp'})</span>
              </div>
            </div>

            {/* List of All Changes Detected (Requirement 9) */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <span className="text-[11px] text-slate-300 block font-bold">
                {simulationResult.mutations.length} Changes Detected:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {simulationResult.mutations.map((mut, idx) => (
                  <div key={idx} className="bg-slate-800/80 border border-slate-700 p-2 rounded-lg flex items-center justify-between">
                    <span className="text-slate-400 font-bold">{mut.position}</span>
                    <span className="text-white font-bold">
                      <span className="text-rose-400">{mut.original || '—'}</span>
                      <span className="mx-1 text-slate-500">→</span>
                      <span className="text-emerald-400">{mut.modified || '—'}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------------- */}
          {/* 5. WHAT-IF CONSEQUENCES (BIOPHYSICAL COMPARISON, Req 10,13) */}
          {/* ----------------------------------------------------------- */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                WHAT-IF RESULT: BIOPHYSICAL &amp; SEQUENCE CONSEQUENCES
              </h4>
              <span className="text-[10px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 font-bold">
                Sequence-Derived Simulation Preview
              </span>
            </div>

            {isProtein && simulationResult.metrics.protein && (
              <div className="space-y-4">
                <div className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-[#F1F5F9] text-[#475569] border-b border-[#E2E8F0]">
                      <tr>
                        <th className="p-3">Biophysical Metric</th>
                        <th className="p-3">Before (V1)</th>
                        <th className="p-3">After (Simulated)</th>
                        <th className="p-3">Delta / Impact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      <tr>
                        <td className="p-3 font-semibold text-[#0F172A]">Sequence Length</td>
                        <td className="p-3">{simulationResult.metrics.protein.original.length} aa</td>
                        <td className="p-3 font-bold text-purple-700">{simulationResult.metrics.protein.simulated.length} aa</td>
                        <td className="p-3">
                          {simulationResult.metrics.protein.deltas.lengthDelta === 0
                            ? '0 (Net neutral)'
                            : `${simulationResult.metrics.protein.deltas.lengthDelta > 0 ? '+' : ''}${simulationResult.metrics.protein.deltas.lengthDelta} aa`}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-[#0F172A]">Molecular Weight</td>
                        <td className="p-3">{simulationResult.metrics.protein.original.molecularWeightKDa.toFixed(2)} kDa</td>
                        <td className="p-3 font-bold text-purple-700">{simulationResult.metrics.protein.simulated.molecularWeightKDa.toFixed(2)} kDa</td>
                        <td className="p-3">
                          {simulationResult.metrics.protein.deltas.mwKDaDelta > 0 ? '+' : ''}
                          {simulationResult.metrics.protein.deltas.mwKDaDelta.toFixed(3)} kDa
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-[#0F172A]">Isoelectric Point (pI)</td>
                        <td className="p-3">{simulationResult.metrics.protein.original.isoelectricPoint.toFixed(2)}</td>
                        <td className="p-3 font-bold text-purple-700">{simulationResult.metrics.protein.simulated.isoelectricPoint.toFixed(2)}</td>
                        <td className="p-3">
                          {simulationResult.metrics.protein.deltas.piDelta > 0 ? '+' : ''}
                          {simulationResult.metrics.protein.deltas.piDelta.toFixed(2)}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-[#0F172A]">GRAVY Hydropathy</td>
                        <td className="p-3">{simulationResult.metrics.protein.original.gravyScore.toFixed(3)}</td>
                        <td className="p-3 font-bold text-purple-700">{simulationResult.metrics.protein.simulated.gravyScore.toFixed(3)}</td>
                        <td className="p-3">
                          {simulationResult.metrics.protein.deltas.gravyDelta > 0 ? '+' : ''}
                          {simulationResult.metrics.protein.deltas.gravyDelta.toFixed(3)}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-[#0F172A]">Net Charge at pH 7.4</td>
                        <td className="p-3">{simulationResult.metrics.protein.original.netChargeAtPh74.toFixed(2)}</td>
                        <td className="p-3 font-bold text-purple-700">{simulationResult.metrics.protein.simulated.netChargeAtPh74.toFixed(2)}</td>
                        <td className="p-3">
                          {simulationResult.metrics.protein.deltas.netChargeAtPh74Delta > 0 ? '+' : ''}
                          {simulationResult.metrics.protein.deltas.netChargeAtPh74Delta.toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Composition Deltas */}
                {simulationResult.metrics.protein.deltas.compositionDeltas &&
                  Object.keys(simulationResult.metrics.protein.deltas.compositionDeltas).length > 0 && (
                    <div className="bg-white p-3.5 rounded-xl border border-[#E2E8F0] space-y-2">
                      <span className="text-[11px] font-bold text-[#0F172A] block uppercase">
                        Amino Acid Composition Deltas:
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {Object.entries(simulationResult.metrics.protein.deltas.compositionDeltas).map(([aa, d]) => (
                          <span
                            key={aa}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                              d > 0
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-rose-50 text-rose-800 border-rose-300'
                            }`}
                          >
                            {PROTEIN_AA.find((p) => p.code === aa)?.name || aa} ({aa}): {d > 0 ? `+${d}` : d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}

            {!isProtein && simulationResult.metrics.nucleotide && (
              <div className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white text-xs">
                <table className="w-full text-left">
                  <thead className="bg-[#F1F5F9] text-[#475569] border-b border-[#E2E8F0]">
                    <tr>
                      <th className="p-3">Nucleotide Metric</th>
                      <th className="p-3">Before (V1)</th>
                      <th className="p-3">After (Simulated)</th>
                      <th className="p-3">Delta / Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    <tr>
                      <td className="p-3 font-semibold text-[#0F172A]">Length</td>
                      <td className="p-3">{simulationResult.metrics.nucleotide.original.composition.length} bp</td>
                      <td className="p-3 font-bold text-purple-700">{simulationResult.metrics.nucleotide.simulated.composition.length} bp</td>
                      <td className="p-3">
                        {simulationResult.metrics.nucleotide.deltas.lengthDelta > 0 ? '+' : ''}
                        {simulationResult.metrics.nucleotide.deltas.lengthDelta} bp
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-[#0F172A]">GC Fraction</td>
                      <td className="p-3">{simulationResult.metrics.nucleotide.original.composition.gcPercentage}%</td>
                      <td className="p-3 font-bold text-purple-700">{simulationResult.metrics.nucleotide.simulated.composition.gcPercentage}%</td>
                      <td className="p-3">
                        {simulationResult.metrics.nucleotide.deltas.gcDelta > 0 ? '+' : ''}
                        {simulationResult.metrics.nucleotide.deltas.gcDelta.toFixed(2)}%
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-[#0F172A]">Open Reading Frames</td>
                      <td className="p-3">{simulationResult.metrics.nucleotide.original.orfs?.length || 0}</td>
                      <td className="p-3 font-bold text-purple-700">{simulationResult.metrics.nucleotide.simulated.orfs?.length || 0}</td>
                      <td className="p-3">
                        {simulationResult.metrics.nucleotide.deltas.orfCountDelta > 0 ? '+' : ''}
                        {simulationResult.metrics.nucleotide.deltas.orfCountDelta} frames
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Scientific Status & Unsupported Disclaimer (Requirement 13) */}
            <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 text-[11px] text-purple-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <Info className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>3D Structure Preview Status:</span>
              </div>
              <p className="text-purple-800 leading-relaxed">
                Sequence-Derived Simulation Preview. Clinical, disease, and functional consequences are <strong>not calculated</strong> (no unsupported claims made).
              </p>
            </div>
          </div>

          {/* ----------------------------------------------------------- */}
          {/* 6. COMMIT CONTROLS: APPLY ALL OR DISCARD ALL (Req 14, 15)   */}
          {/* ----------------------------------------------------------- */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl">
            <span className="text-xs text-[#64748B]">
              Apply all {simulationResult.mutations.length} changes to create a single modified working copy.
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiscardAll}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 border border-slate-300 text-slate-700 hover:text-rose-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Discard Changes</span>
              </button>

              <button
                type="button"
                onClick={handleApplyAllChanges}
                disabled={isApplying}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              >
                {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Apply All Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
