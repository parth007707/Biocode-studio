import { SequenceType, GCAndORFAnalysisResult } from './types';
import { SequenceMutation } from './editor/types';
import { computeMutationsFromSequences } from './editor/mutationEngine';
import { 
  analyzeProteinSequence, 
  AminoAcidComposition, 
  calculateNetCharge 
} from './proteinAnalysis';
import { analyzeGCAndORF } from './orfAnalysis';

export type WhatIfChangeType = 'substitution' | 'insertion' | 'deletion';

export const DNA_ALPHABET = new Set(['A', 'C', 'G', 'T']);
export const RNA_ALPHABET = new Set(['A', 'C', 'G', 'U']);
export const PROTEIN_ALPHABET = new Set([
  'A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L',
  'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'Y'
]);

/**
 * Standardized Change Object representing an individual sequence modification
 */
export interface PendingWhatIfChange {
  id: string;
  position: number;
  type: WhatIfChangeType;
  originalResidue?: string;
  modifiedResidue?: string;
  insertedSequence?: string;
  deletedSequence?: string;
  deletionEnd?: number;
  description?: string;
}

export interface WhatIfValidationParams {
  sequence: string;
  sequenceType: SequenceType | string;
  mode: WhatIfChangeType;
  position: number;
  currentResidue?: string;
  candidateResidue?: string;
  insertionPos?: number;
  insertionResidues?: string;
  deletionStart?: number;
  deletionEnd?: number;
}

export interface WhatIfValidationResult {
  isValid: boolean;
  error?: string;
}

export interface MultiChangeValidationResult {
  isValid: boolean;
  failedIndex?: number;
  failedChange?: PendingWhatIfChange;
  error?: string;
  details?: {
    changeNumber: number;
    position: number;
    expected: string;
    actual: string;
    reason: string;
  };
}

export interface ProteinBiophysicalComparison {
  original: AminoAcidComposition & { netChargeAtPh74: number };
  simulated: AminoAcidComposition & { netChargeAtPh74: number };
  deltas: {
    lengthDelta: number;
    mwKDaDelta: number;
    piDelta: number;
    gravyDelta: number;
    netChargeAtPh7Delta: number;
    netChargeAtPh74Delta: number;
    compositionDeltas?: Record<string, number>;
  };
}

export interface NucleotideBiophysicalComparison {
  original: GCAndORFAnalysisResult;
  simulated: GCAndORFAnalysisResult;
  deltas: {
    lengthDelta: number;
    gcDelta: number;
    atDelta: number;
    orfCountDelta: number;
  };
}

export interface LocalizedWindow {
  hasLeadingEllipsis: boolean;
  hasTrailingEllipsis: boolean;
  prefix: string;
  origTarget: string;
  simTarget: string;
  suffix: string;
  centerPos: number;
}

export interface WhatIfSimulationResult {
  originalSequence: string;
  simulatedSequence: string;
  mutation: SequenceMutation;
  mutations: SequenceMutation[];
  changes: PendingWhatIfChange[];
  summary: {
    originalResidue: string;
    simulatedResidue: string;
    position: number;
    changeType: WhatIfChangeType;
    netLengthChange: number;
    description: string;
    totalChanges: number;
  };
  metrics: {
    sequenceType: SequenceType;
    protein?: ProteinBiophysicalComparison;
    nucleotide?: NucleotideBiophysicalComparison;
  };
  localizedWindow: LocalizedWindow;
}

/**
 * Validates a single What-If Simulator input before running in-silico simulation.
 */
export function validateWhatIfInput(params: WhatIfValidationParams): WhatIfValidationResult {
  const cleanSeq = params.sequence ? params.sequence.toUpperCase().replace(/[^A-Z*]/g, '') : '';
  if (!cleanSeq || cleanSeq.length === 0) {
    return { isValid: false, error: 'No active biological sequence loaded in workspace.' };
  }

  const rawType = (params.sequenceType || 'DNA').toUpperCase();
  const isProtein = rawType === 'PROTEIN';
  const isRna = rawType === 'RNA';
  const isDna = !isProtein && !isRna;

  if (params.mode === 'substitution') {
    const pos = params.position;
    if (isNaN(pos) || pos < 1 || pos > cleanSeq.length) {
      return {
        isValid: false,
        error: `Position ${pos} is outside sequence bounds (1 .. ${cleanSeq.length}).`
      };
    }

    const actualChar = cleanSeq[pos - 1];
    if (params.currentResidue && params.currentResidue.trim()) {
      const exp = params.currentResidue.trim().toUpperCase();
      if (exp !== actualChar) {
        return {
          isValid: false,
          error: `Position ${pos} contains ${actualChar}, but the selected current residue is ${exp}.`
        };
      }
    }

    const cand = (params.candidateResidue || '').trim().toUpperCase();
    if (!cand) {
      return { isValid: false, error: 'Please select or enter a replacement residue/base.' };
    }

    if (isDna && !DNA_ALPHABET.has(cand)) {
      return {
        isValid: false,
        error: `'${cand}' is not a valid nucleotide for a DNA sequence.`
      };
    }

    if (isRna && !RNA_ALPHABET.has(cand)) {
      return {
        isValid: false,
        error: `'${cand}' is not a valid nucleotide for an RNA sequence.`
      };
    }

    if (isProtein && !PROTEIN_ALPHABET.has(cand)) {
      return {
        isValid: false,
        error: `'${cand}' is not a valid standard amino acid for a protein sequence.`
      };
    }

    if (cand === actualChar) {
      return {
        isValid: false,
        error: `Candidate '${cand}' is identical to current residue at position ${pos}. No sequence change would occur.`
      };
    }
  } else if (params.mode === 'insertion') {
    const insPos = params.insertionPos ?? params.position;
    if (isNaN(insPos) || insPos < 1 || insPos > cleanSeq.length + 1) {
      return {
        isValid: false,
        error: `Insertion position ${insPos} is outside valid bounds (1 .. ${cleanSeq.length + 1}).`
      };
    }

    const ins = (params.insertionResidues || '').trim().toUpperCase();
    if (!ins) {
      return { isValid: false, error: 'Please enter at least one residue or base to insert.' };
    }

    for (const char of ins) {
      if (isDna && !DNA_ALPHABET.has(char)) {
        return {
          isValid: false,
          error: `'${char}' is not a valid nucleotide for a DNA sequence.`
        };
      }
      if (isRna && !RNA_ALPHABET.has(char)) {
        return {
          isValid: false,
          error: `'${char}' is not a valid nucleotide for an RNA sequence.`
        };
      }
      if (isProtein && !PROTEIN_ALPHABET.has(char)) {
        return {
          isValid: false,
          error: `'${char}' is not a valid amino acid code for a protein sequence.`
        };
      }
    }
  } else if (params.mode === 'deletion') {
    const start = params.deletionStart ?? params.position;
    const end = params.deletionEnd ?? params.position;

    if (isNaN(start) || start < 1 || start > cleanSeq.length) {
      return {
        isValid: false,
        error: `Deletion start position ${start} is outside sequence bounds (1 .. ${cleanSeq.length}).`
      };
    }
    if (isNaN(end) || end < start || end > cleanSeq.length) {
      return {
        isValid: false,
        error: `Deletion end position (${end}) must be between ${start} and ${cleanSeq.length}.`
      };
    }
    if (end - start + 1 >= cleanSeq.length) {
      return { isValid: false, error: 'Cannot delete the entire sequence.' };
    }
  }

  return { isValid: true };
}

/**
 * Validates a list of multiple pending What-If changes.
 * Reports precisely which change failed if any check fails.
 */
export function validateMultipleWhatIfChanges(
  sequence: string,
  sequenceType: SequenceType | string,
  changes: PendingWhatIfChange[]
): MultiChangeValidationResult {
  const cleanSeq = sequence ? sequence.toUpperCase().replace(/[^A-Z*]/g, '') : '';
  if (!cleanSeq || cleanSeq.length === 0) {
    return {
      isValid: false,
      error: 'No active biological sequence loaded in workspace.'
    };
  }

  if (!changes || changes.length === 0) {
    return {
      isValid: false,
      error: 'No sequence changes specified to simulate. Add at least one change.'
    };
  }

  const rawType = (sequenceType || 'DNA').toUpperCase();
  const isProtein = rawType === 'PROTEIN';
  const isRna = rawType === 'RNA';
  const isDna = !isProtein && !isRna;

  const seenSubstitutionPositions = new Map<number, number>();

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const changeNum = i + 1;
    const pos = change.position;

    if (isNaN(pos) || pos < 1) {
      return {
        isValid: false,
        failedIndex: i,
        failedChange: change,
        error: `Change ${changeNum}: Position ${pos} is invalid. Biological positions must be ≥ 1.`,
        details: {
          changeNumber: changeNum,
          position: pos,
          expected: 'Valid 1-based coordinate',
          actual: String(pos),
          reason: 'Position must be a positive integer.'
        }
      };
    }

    if (change.type === 'substitution') {
      if (pos > cleanSeq.length) {
        return {
          isValid: false,
          failedIndex: i,
          failedChange: change,
          error: `Change ${changeNum}: Position ${pos} is outside sequence bounds (1 .. ${cleanSeq.length}).`,
          details: {
            changeNumber: changeNum,
            position: pos,
            expected: `1 .. ${cleanSeq.length}`,
            actual: String(pos),
            reason: 'Position exceeds total sequence length.'
          }
        };
      }

      const actualRes = cleanSeq[pos - 1];
      if (change.originalResidue && change.originalResidue.trim()) {
        const exp = change.originalResidue.trim().toUpperCase();
        if (exp !== actualRes) {
          return {
            isValid: false,
            failedIndex: i,
            failedChange: change,
            error: `Change ${changeNum} (Position ${pos}): Expected '${exp}', but sequence contains '${actualRes}'. Status: Invalid change.`,
            details: {
              changeNumber: changeNum,
              position: pos,
              expected: exp,
              actual: actualRes,
              reason: `Position ${pos} contains ${actualRes}, but the selected current residue is ${exp}.`
            }
          };
        }
      }

      const mod = (change.modifiedResidue || '').trim().toUpperCase();
      if (!mod) {
        return {
          isValid: false,
          failedIndex: i,
          failedChange: change,
          error: `Change ${changeNum} (Position ${pos}): No replacement residue/base specified.`,
          details: {
            changeNumber: changeNum,
            position: pos,
            expected: 'Valid residue/base character',
            actual: 'Empty',
            reason: 'Missing replacement residue.'
          }
        };
      }

      if (isDna && !DNA_ALPHABET.has(mod)) {
        return {
          isValid: false,
          failedIndex: i,
          failedChange: change,
          error: `Change ${changeNum} (Position ${pos}): '${mod}' is not a valid nucleotide for a DNA sequence.`,
          details: {
            changeNumber: changeNum,
            position: pos,
            expected: 'A, C, G, or T',
            actual: mod,
            reason: `'${mod}' is not a valid nucleotide for a DNA sequence.`
          }
        };
      }

      if (isRna && !RNA_ALPHABET.has(mod)) {
        return {
          isValid: false,
          failedIndex: i,
          failedChange: change,
          error: `Change ${changeNum} (Position ${pos}): '${mod}' is not a valid nucleotide for an RNA sequence.`,
          details: {
            changeNumber: changeNum,
            position: pos,
            expected: 'A, C, G, or U',
            actual: mod,
            reason: `'${mod}' is not a valid nucleotide for an RNA sequence.`
          }
        };
      }

      if (isProtein && !PROTEIN_ALPHABET.has(mod)) {
        return {
          isValid: false,
          failedIndex: i,
          failedChange: change,
          error: `Change ${changeNum} (Position ${pos}): '${mod}' is not a valid standard amino acid for a protein sequence.`,
          details: {
            changeNumber: changeNum,
            position: pos,
            expected: 'Standard 20 amino acids',
            actual: mod,
            reason: `'${mod}' is not a valid standard amino acid for a protein sequence.`
          }
        };
      }

      if (mod === actualRes) {
        return {
          isValid: false,
          failedIndex: i,
          failedChange: change,
          error: `Change ${changeNum} (Position ${pos}): Replacement '${mod}' is identical to original residue. No change would occur.`,
          details: {
            changeNumber: changeNum,
            position: pos,
            expected: `Non-${actualRes} residue`,
            actual: mod,
            reason: 'Identical substitution requested.'
          }
        };
      }

      if (seenSubstitutionPositions.has(pos)) {
        const prevNum = seenSubstitutionPositions.get(pos);
        return {
          isValid: false,
          failedIndex: i,
          failedChange: change,
          error: `Change ${changeNum} conflicts with Change ${prevNum}: Multiple substitutions at position ${pos}.`,
          details: {
            changeNumber: changeNum,
            position: pos,
            expected: 'Unique position',
            actual: `Duplicate position ${pos}`,
            reason: `Conflicting change at position ${pos}.`
          }
        };
      }
      seenSubstitutionPositions.set(pos, changeNum);
    } else if (change.type === 'insertion') {
      if (pos > cleanSeq.length + 1) {
        return {
          isValid: false,
          failedIndex: i,
          failedChange: change,
          error: `Change ${changeNum}: Insertion position ${pos} is outside bounds (1 .. ${cleanSeq.length + 1}).`,
          details: {
            changeNumber: changeNum,
            position: pos,
            expected: `1 .. ${cleanSeq.length + 1}`,
            actual: String(pos),
            reason: 'Insertion position exceeds sequence length + 1.'
          }
        };
      }

      const ins = (change.insertedSequence || '').trim().toUpperCase();
      if (!ins) {
        return {
          isValid: false,
          failedIndex: i,
          failedChange: change,
          error: `Change ${changeNum} (Position ${pos}): No sequence specified to insert.`,
          details: {
            changeNumber: changeNum,
            position: pos,
            expected: 'Valid sequence string',
            actual: 'Empty',
            reason: 'Missing inserted sequence.'
          }
        };
      }

      for (const char of ins) {
        if (isDna && !DNA_ALPHABET.has(char)) {
          return {
            isValid: false,
            failedIndex: i,
            failedChange: change,
            error: `Change ${changeNum}: '${char}' in inserted sequence is not a valid DNA nucleotide.`,
            details: {
              changeNumber: changeNum,
              position: pos,
              expected: 'A, C, G, or T',
              actual: char,
              reason: `'${char}' is not a valid nucleotide for a DNA sequence.`
            }
          };
        }
        if (isRna && !RNA_ALPHABET.has(char)) {
          return {
            isValid: false,
            failedIndex: i,
            failedChange: change,
            error: `Change ${changeNum}: '${char}' in inserted sequence is not a valid RNA nucleotide.`,
            details: {
              changeNumber: changeNum,
              position: pos,
              expected: 'A, C, G, or U',
              actual: char,
              reason: `'${char}' is not a valid nucleotide for an RNA sequence.`
            }
          };
        }
        if (isProtein && !PROTEIN_ALPHABET.has(char)) {
          return {
            isValid: false,
            failedIndex: i,
            failedChange: change,
            error: `Change ${changeNum}: '${char}' in inserted sequence is not a valid amino acid.`,
            details: {
              changeNumber: changeNum,
              position: pos,
              expected: 'Standard 20 amino acids',
              actual: char,
              reason: `'${char}' is not a valid amino acid code for a protein sequence.`
            }
          };
        }
      }
    } else if (change.type === 'deletion') {
      const start = pos;
      const end = change.deletionEnd ?? pos;

      if (start > cleanSeq.length) {
        return {
          isValid: false,
          failedIndex: i,
          failedChange: change,
          error: `Change ${changeNum}: Deletion start position ${start} is outside bounds (1 .. ${cleanSeq.length}).`,
          details: {
            changeNumber: changeNum,
            position: start,
            expected: `1 .. ${cleanSeq.length}`,
            actual: String(start),
            reason: 'Deletion start exceeds sequence length.'
          }
        };
      }

      if (end < start || end > cleanSeq.length) {
        return {
          isValid: false,
          failedIndex: i,
          failedChange: change,
          error: `Change ${changeNum}: Deletion end position (${end}) must be between ${start} and ${cleanSeq.length}.`,
          details: {
            changeNumber: changeNum,
            position: end,
            expected: `${start} .. ${cleanSeq.length}`,
            actual: String(end),
            reason: 'Invalid deletion end coordinate.'
          }
        };
      }

      if (end - start + 1 >= cleanSeq.length) {
        return {
          isValid: false,
          failedIndex: i,
          failedChange: change,
          error: `Change ${changeNum}: Cannot delete the entire sequence.`,
          details: {
            changeNumber: changeNum,
            position: start,
            expected: `Less than ${cleanSeq.length} residues`,
            actual: String(end - start + 1),
            reason: 'Complete sequence deletion.'
          }
        };
      }
    }
  }

  return { isValid: true };
}

/**
 * Applies pending changes to the original sequence non-destructively.
 * Applies changes from highest position to lowest position so that
 * biological 1-based coordinates of earlier positions remain exact and unshifted.
 */
export function applyPendingChangesToSequence(
  sequence: string,
  changes: PendingWhatIfChange[]
): string {
  const cleanSeq = sequence.toUpperCase().replace(/[^A-Z*]/g, '');
  if (!changes || changes.length === 0) return cleanSeq;

  // Sort changes in descending order of position
  const sortedChanges = [...changes].sort((a, b) => {
    const posA = a.type === 'deletion' && a.deletionEnd ? a.deletionEnd : a.position;
    const posB = b.type === 'deletion' && b.deletionEnd ? b.deletionEnd : b.position;
    return posB - posA;
  });

  let workingSeq = cleanSeq;

  for (const ch of sortedChanges) {
    const pos = ch.position;
    if (ch.type === 'substitution') {
      const mod = (ch.modifiedResidue || '').trim().toUpperCase();
      if (pos >= 1 && pos <= workingSeq.length) {
        workingSeq = workingSeq.slice(0, pos - 1) + mod + workingSeq.slice(pos);
      }
    } else if (ch.type === 'insertion') {
      const ins = (ch.insertedSequence || '').trim().toUpperCase();
      if (pos >= 1 && pos <= workingSeq.length + 1) {
        workingSeq = workingSeq.slice(0, pos - 1) + ins + workingSeq.slice(pos - 1);
      }
    } else if (ch.type === 'deletion') {
      const start = pos;
      const end = ch.deletionEnd ?? pos;
      if (start >= 1 && end <= workingSeq.length && end >= start) {
        workingSeq = workingSeq.slice(0, start - 1) + workingSeq.slice(end);
      }
    }
  }

  return workingSeq;
}

/**
 * Computes localized sequence window around a change site (±10 residues).
 */
export function computeLocalizedWindow(
  sequence: string,
  mode: WhatIfChangeType,
  pos: number,
  origTarget: string,
  simTarget: string,
  deletionEnd?: number,
  radius: number = 8
): LocalizedWindow {
  const centerPos = mode === 'deletion' ? pos : pos;
  const startIdx = Math.max(0, centerPos - 1 - radius);
  const endIdx = Math.min(sequence.length, (mode === 'deletion' && deletionEnd ? deletionEnd : centerPos) + radius);

  const prefix = sequence.slice(startIdx, centerPos - 1);
  const suffix = sequence.slice(mode === 'deletion' && deletionEnd ? deletionEnd : centerPos, endIdx);

  return {
    hasLeadingEllipsis: startIdx > 0,
    hasTrailingEllipsis: endIdx < sequence.length,
    prefix,
    origTarget,
    simTarget,
    suffix,
    centerPos
  };
}

/**
 * Executes What-If in-silico simulation for one or MANY changes.
 * Non-destructive: Does NOT mutate input sequence string.
 */
export function simulateMultipleSequenceChanges(params: {
  sequence: string;
  originalSequence?: string;
  sequenceType: SequenceType | string;
  changes: PendingWhatIfChange[];
}): WhatIfSimulationResult {
  const rawInput = params.sequence || params.originalSequence || '';
  const cleanSeq = rawInput.toUpperCase().replace(/[^A-Z*]/g, '');
  const rawType = (params.sequenceType || 'DNA').toUpperCase();
  const sequenceType: SequenceType = rawType === 'PROTEIN' ? 'PROTEIN' : rawType === 'RNA' ? 'RNA' : 'DNA';
  const isProtein = sequenceType === 'PROTEIN';

  const validation = validateMultipleWhatIfChanges(cleanSeq, sequenceType, params.changes);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Validation failed for one or more pending changes.');
  }

  // Generate simulated sequence by applying all changes
  const simulatedSequence = applyPendingChangesToSequence(cleanSeq, params.changes);

  // Detect real mutations between original baseline and simulated sequence
  const detectedMutations = computeMutationsFromSequences(cleanSeq, simulatedSequence, sequenceType);

  // If detectedMutations is empty (no change), create default
  const primaryMutation: SequenceMutation = detectedMutations[0] || {
    id: 'sim_default',
    position: params.changes[0]?.position || 1,
    operation: params.changes[0]?.type || 'substitution',
    original: params.changes[0]?.originalResidue || cleanSeq[0] || '',
    modified: params.changes[0]?.modifiedResidue || '',
    lengthChange: simulatedSequence.length - cleanSeq.length,
    timestamp: new Date().toISOString(),
    description: `${params.changes.length} change(s) simulated`
  };

  const netLengthChange = simulatedSequence.length - cleanSeq.length;

  // Build summary description
  let summaryDesc = '';
  if (detectedMutations.length === 1) {
    const m = detectedMutations[0];
    summaryDesc = m.operation === 'substitution'
      ? `${m.original}${m.position}${m.modified}`
      : m.description || `${m.operation} @${m.position}`;
  } else {
    const labels = detectedMutations.map((m) =>
      m.operation === 'substitution'
        ? `${m.original}${m.position}${m.modified}`
        : m.description || `${m.operation}@${m.position}`
    );
    summaryDesc = `${detectedMutations.length} changes (${labels.slice(0, 4).join(', ')}${labels.length > 4 ? ` +${labels.length - 4} more` : ''})`;
  }

  // Localized window around primary mutation
  const firstChange = params.changes[0];
  const localizedWindow = computeLocalizedWindow(
    cleanSeq,
    firstChange?.type || 'substitution',
    firstChange?.position || 1,
    firstChange?.originalResidue || '',
    firstChange?.modifiedResidue || firstChange?.insertedSequence || '',
    firstChange?.deletionEnd
  );

  // Biophysical Recalculations
  if (isProtein) {
    const origAnalysis = analyzeProteinSequence(cleanSeq);
    const origCharge74 = calculateNetCharge(cleanSeq, 7.4);
    const origWith74 = { ...origAnalysis, netChargeAtPh74: Number(origCharge74.toFixed(2)) };

    const simAnalysis = analyzeProteinSequence(simulatedSequence);
    const simCharge74 = calculateNetCharge(simulatedSequence, 7.4);
    const simWith74 = { ...simAnalysis, netChargeAtPh74: Number(simCharge74.toFixed(2)) };

    // Composition deltas
    const compositionDeltas: Record<string, number> = {};
    for (const aa of Array.from(PROTEIN_ALPHABET)) {
      const origCount = origAnalysis.counts[aa] || 0;
      const simCount = simAnalysis.counts[aa] || 0;
      if (origCount !== simCount) {
        compositionDeltas[aa] = simCount - origCount;
      }
    }

    const proteinComparison: ProteinBiophysicalComparison = {
      original: origWith74,
      simulated: simWith74,
      deltas: {
        lengthDelta: simAnalysis.length - origAnalysis.length,
        mwKDaDelta: Number((simAnalysis.molecularWeightKDa - origAnalysis.molecularWeightKDa).toFixed(3)),
        piDelta: Number((simAnalysis.isoelectricPoint - origAnalysis.isoelectricPoint).toFixed(2)),
        gravyDelta: Number((simAnalysis.gravyScore - origAnalysis.gravyScore).toFixed(3)),
        netChargeAtPh7Delta: Number((simAnalysis.netChargeAtPh7 - origAnalysis.netChargeAtPh7).toFixed(2)),
        netChargeAtPh74Delta: Number((simWith74.netChargeAtPh74 - origWith74.netChargeAtPh74).toFixed(2)),
        compositionDeltas
      }
    };

    return {
      originalSequence: cleanSeq,
      simulatedSequence,
      mutation: primaryMutation,
      mutations: detectedMutations,
      changes: params.changes,
      summary: {
        originalResidue: firstChange?.originalResidue || cleanSeq[firstChange?.position - 1] || '',
        simulatedResidue: firstChange?.modifiedResidue || firstChange?.insertedSequence || '',
        position: firstChange?.position || 1,
        changeType: firstChange?.type || 'substitution',
        netLengthChange,
        description: summaryDesc,
        totalChanges: detectedMutations.length
      },
      metrics: {
        sequenceType: 'PROTEIN',
        protein: proteinComparison
      },
      localizedWindow
    };
  } else {
    // DNA or RNA
    const origNucleotide = analyzeGCAndORF(cleanSeq, sequenceType);
    const simNucleotide = analyzeGCAndORF(simulatedSequence, sequenceType);

    const origOrfCount = origNucleotide.orfs?.length || 0;
    const simOrfCount = simNucleotide.orfs?.length || 0;

    const nucleotideComparison: NucleotideBiophysicalComparison = {
      original: origNucleotide,
      simulated: simNucleotide,
      deltas: {
        lengthDelta: simNucleotide.composition.length - origNucleotide.composition.length,
        gcDelta: Number((simNucleotide.composition.gcPercentage - origNucleotide.composition.gcPercentage).toFixed(2)),
        atDelta: Number((simNucleotide.composition.atPercentage - origNucleotide.composition.atPercentage).toFixed(2)),
        orfCountDelta: simOrfCount - origOrfCount
      }
    };

    return {
      originalSequence: cleanSeq,
      simulatedSequence,
      mutation: primaryMutation,
      mutations: detectedMutations,
      changes: params.changes,
      summary: {
        originalResidue: firstChange?.originalResidue || cleanSeq[firstChange?.position - 1] || '',
        simulatedResidue: firstChange?.modifiedResidue || firstChange?.insertedSequence || '',
        position: firstChange?.position || 1,
        changeType: firstChange?.type || 'substitution',
        netLengthChange,
        description: summaryDesc,
        totalChanges: detectedMutations.length
      },
      metrics: {
        sequenceType,
        nucleotide: nucleotideComparison
      },
      localizedWindow
    };
  }
}

/**
 * Backward compatible single-change simulator.
 */
export function simulateSequenceChange(params: WhatIfValidationParams): WhatIfSimulationResult {
  const cleanSeq = params.sequence.toUpperCase().replace(/[^A-Z*]/g, '');
  let singleChange: PendingWhatIfChange;

  if (params.mode === 'substitution') {
    const pos = params.position;
    const origChar = cleanSeq[pos - 1] || params.currentResidue || '';
    const newChar = (params.candidateResidue || '').trim().toUpperCase();
    singleChange = {
      id: `sub_${pos}_${origChar}_${newChar}`,
      position: pos,
      type: 'substitution',
      originalResidue: origChar,
      modifiedResidue: newChar,
      description: `${origChar}${pos}${newChar}`
    };
  } else if (params.mode === 'insertion') {
    const insPos = params.insertionPos ?? params.position;
    const ins = (params.insertionResidues || '').trim().toUpperCase();
    singleChange = {
      id: `ins_${insPos}_${ins}`,
      position: insPos,
      type: 'insertion',
      insertedSequence: ins,
      description: `Insertion: +${ins} @${insPos}`
    };
  } else {
    const start = params.deletionStart ?? params.position;
    const end = params.deletionEnd ?? params.position;
    const deletedSpan = cleanSeq.slice(start - 1, end);
    singleChange = {
      id: `del_${start}_${end}`,
      position: start,
      type: 'deletion',
      deletionEnd: end,
      deletedSequence: deletedSpan,
      description: `Deletion: -${deletedSpan} (${start}..${end})`
    };
  }

  return simulateMultipleSequenceChanges({
    sequence: params.sequence,
    sequenceType: params.sequenceType,
    changes: [singleChange]
  });
}
