import { 
  SequenceMutation, 
  MutationSummary, 
  SequenceValidationReport, 
  InvalidCharacterFinding,
  SequenceDiffSegment 
} from './types';
import { parseBiologicalInput } from '../sequenceParser';

// Standard Biological Alphabets
export const DNA_ALLOWED_SET = new Set(['A', 'T', 'G', 'C', 'N', 'R', 'Y', 'S', 'W', 'K', 'M', 'B', 'D', 'H', 'V']);
export const RNA_ALLOWED_SET = new Set(['A', 'U', 'G', 'C', 'N', 'R', 'Y', 'S', 'W', 'K', 'M', 'B', 'D', 'H', 'V']);
export const PROTEIN_ALLOWED_SET = new Set([
  'A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L',
  'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'Y',
  // Common ambiguity and special amino acids
  'B', 'Z', 'X', 'U', 'O', '*'
]);

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return 'mut-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
}

/**
 * Detect biological sequence type from clean residues
 */
export function detectWorkingSequenceType(
  rawSequence: string,
  preferredType?: 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN'
): {
  detectedType: 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN';
  isMixedTU: boolean;
  hasInvalidChars: boolean;
} {
  const safeRaw = rawSequence || '';
  const sequence = safeRaw.trim().startsWith('>')
    ? parseBiologicalInput(safeRaw).sequence
    : safeRaw.replace(/\s+/g, '').toUpperCase();

  if (!sequence) {
    return { detectedType: preferredType || 'UNKNOWN', isMixedTU: false, hasInvalidChars: false };
  }

  const hasT = sequence.includes('T');
  const hasU = sequence.includes('U');
  const isMixedTU = hasT && hasU;

  // Protein-specific unique amino acids (never present in standard DNA/RNA)
  const proteinOnlyLetters = /[EFILPQVWYZOM]/;
  const hasProteinUnique = proteinOnlyLetters.test(sequence);

  if (preferredType === 'PROTEIN' && !isMixedTU) {
    return { detectedType: 'PROTEIN', isMixedTU: false, hasInvalidChars: false };
  }

  if (hasProteinUnique && !isMixedTU) {
    return { detectedType: 'PROTEIN', isMixedTU: false, hasInvalidChars: false };
  }

  if (isMixedTU) {
    return { detectedType: 'UNKNOWN', isMixedTU: true, hasInvalidChars: true };
  }

  if (hasU && !hasT) {
    return { detectedType: 'RNA', isMixedTU: false, hasInvalidChars: false };
  }

  if (hasT && !hasU) {
    return { detectedType: 'DNA', isMixedTU: false, hasInvalidChars: false };
  }

  return { detectedType: preferredType || 'DNA', isMixedTU: false, hasInvalidChars: false };
}

/**
 * Validate characters of working sequence against biological type rules.
 * Highlights invalid characters with their exact 1-based coordinates.
 */
export function validateResiduesForType(
  rawSequence: string,
  type: 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN'
): SequenceValidationReport & { validationStatus: 'VALID' | 'WARNING' | 'INVALID'; isMixedTU: boolean } {
  // Never validate FASTA header metadata as biological sequence
  const safeRaw = rawSequence || '';
  const sequence = safeRaw.trim().startsWith('>')
    ? parseBiologicalInput(safeRaw).sequence
    : safeRaw.replace(/\s+/g, '').toUpperCase();

  const hasT = sequence.includes('T');
  const hasU = sequence.includes('U');
  const isMixedTU = hasT && hasU && (type === 'DNA' || type === 'RNA' || type === 'UNKNOWN');

  let allowedSet: Set<string>;
  let allowedList: string[];

  if (type === 'DNA') {
    allowedSet = DNA_ALLOWED_SET;
    allowedList = ['A', 'T', 'G', 'C', 'N', 'IUPAC'];
  } else if (type === 'RNA') {
    allowedSet = RNA_ALLOWED_SET;
    allowedList = ['A', 'U', 'G', 'C', 'N', 'IUPAC'];
  } else if (type === 'PROTEIN') {
    allowedSet = PROTEIN_ALLOWED_SET;
    allowedList = ['A-Z (Standard 20 Amino Acids)'];
  } else {
    // Unknown: accept general union
    allowedSet = new Set([...DNA_ALLOWED_SET, ...RNA_ALLOWED_SET, ...PROTEIN_ALLOWED_SET]);
    allowedList = ['A-Z'];
  }

  const invalidMap = new Map<string, number[]>();
  let totalInvalidCount = 0;

  for (let i = 0; i < sequence.length; i++) {
    const char = sequence[i];
    if (!allowedSet.has(char)) {
      totalInvalidCount++;
      const pos = i + 1; // 1-based
      const existing = invalidMap.get(char) || [];
      if (existing.length < 50) {
        existing.push(pos);
      }
      invalidMap.set(char, existing);
    }
  }

  const invalidChars: InvalidCharacterFinding[] = [];
  invalidMap.forEach((positions, char) => {
    invalidChars.push({
      char,
      count: positions.length,
      positions
    });
  });

  const isValid = totalInvalidCount === 0 && !isMixedTU && sequence.length > 0;
  let validationStatus: 'VALID' | 'WARNING' | 'INVALID' = isValid ? 'VALID' : 'INVALID';
  let errorSummary: string | undefined;

  if (isMixedTU) {
    validationStatus = 'INVALID';
    errorSummary = 'Biologically invalid: Sequence contains both Thymine (T) and Uracil (U). DNA and RNA nucleotide alphabets cannot be combined.';
  } else if (totalInvalidCount > 0) {
    validationStatus = 'INVALID';
    const distinctChars = invalidChars.map(c => `'${c.char}'`).join(', ');
    errorSummary = `Invalid biological characters detected for ${type}: ${distinctChars} (${totalInvalidCount} occurrences). Please correct these residues before analysis.`;
  } else if (sequence.length === 0) {
    validationStatus = 'WARNING';
    errorSummary = 'Sequence is empty.';
  }

  return {
    isValid,
    validationStatus,
    sequenceType: type,
    allowedAlphabet: allowedList,
    invalidChars,
    totalInvalidCount,
    errorSummary,
    isMixedTU
  };
}

/**
 * Apply Substitution Mutation:
 * Replaces residue(s) starting at 1-based position with new residue(s).
 */
export function applySubstitution(
  sequence: string,
  position: number, // 1-based
  newResidues: string
): { newSequence: string; mutation: SequenceMutation } {
  const zeroIndex = Math.max(0, position - 1);
  const replaceLength = newResidues.length;
  const original = sequence.substring(zeroIndex, zeroIndex + replaceLength);
  const modified = newResidues.toUpperCase();

  const newSequence = sequence.substring(0, zeroIndex) + modified + sequence.substring(zeroIndex + replaceLength);

  const mutation: SequenceMutation = {
    id: generateUUID(),
    operation: 'substitution',
    position,
    endPosition: position + replaceLength - 1,
    original,
    modified,
    lengthChange: modified.length - original.length,
    timestamp: new Date().toISOString(),
    description: `Position ${position}${replaceLength > 1 ? `–${position + replaceLength - 1}` : ''}: ${original} → ${modified}`
  };

  return { newSequence, mutation };
}

/**
 * Apply Insertion Mutation:
 * Inserts new residue(s) right at 1-based position.
 */
export function applyInsertion(
  sequence: string,
  position: number, // 1-based
  insertedResidues: string
): { newSequence: string; mutation: SequenceMutation } {
  const zeroIndex = Math.min(Math.max(0, position - 1), sequence.length);
  const modified = insertedResidues.toUpperCase();

  const newSequence = sequence.substring(0, zeroIndex) + modified + sequence.substring(zeroIndex);

  const mutation: SequenceMutation = {
    id: generateUUID(),
    operation: 'insertion',
    position,
    original: '',
    modified,
    lengthChange: modified.length,
    timestamp: new Date().toISOString(),
    description: `Position ${position}: Inserted ${modified}`
  };

  return { newSequence, mutation };
}

/**
 * Apply Deletion Mutation:
 * Deletes residues from startPos to endPos (inclusive, 1-based).
 */
export function applyDeletion(
  sequence: string,
  startPos: number, // 1-based
  endPos: number // 1-based
): { newSequence: string; mutation: SequenceMutation } {
  const startIdx = Math.max(0, startPos - 1);
  const endIdx = Math.min(sequence.length, endPos);
  const original = sequence.substring(startIdx, endIdx);

  const newSequence = sequence.substring(0, startIdx) + sequence.substring(endIdx);

  const mutation: SequenceMutation = {
    id: generateUUID(),
    operation: 'deletion',
    position: startPos,
    endPosition: endPos,
    original,
    modified: '',
    lengthChange: -original.length,
    timestamp: new Date().toISOString(),
    description: startPos === endPos
      ? `Position ${startPos}: Deleted ${original}`
      : `Positions ${startPos}–${endPos}: Deleted ${original}`
  };

  return { newSequence, mutation };
}

/**
 * Compute aggregate mutation statistics
 */
export function computeMutationStats(
  mutations: SequenceMutation[],
  originalLength: number,
  modifiedLength: number
): MutationSummary {
  let substitutions = 0;
  let insertions = 0;
  let deletions = 0;

  for (const m of mutations) {
    if (m.operation === 'substitution') substitutions++;
    else if (m.operation === 'insertion') insertions++;
    else if (m.operation === 'deletion') deletions++;
  }

  return {
    totalChanges: mutations.length,
    substitutions,
    insertions,
    deletions,
    originalLength,
    modifiedLength,
    netLengthChange: modifiedLength - originalLength
  };
}

/**
 * Fast & Safe Sequence Diff Computation:
 * Converts original & modified sequences into visual segments.
 * For huge sequences (> 50,000 bp), operates with windowed limits to guarantee 60fps responsiveness.
 */
export function computeFastSequenceDiff(
  original: string,
  modified: string,
  windowStart: number = 1,
  windowEnd: number = 5000
): SequenceDiffSegment[] {
  // If sequences are identical
  if (original === modified) {
    const sub = original.substring(windowStart - 1, windowEnd);
    if (!sub) return [];
    return [{
      id: 'diff-0',
      type: 'equal',
      originalText: sub,
      modifiedText: sub,
      origStart: windowStart,
      origEnd: windowStart + sub.length - 1,
      modStart: windowStart,
      modEnd: windowStart + sub.length - 1
    }];
  }

  // Windowed sub-slice to protect memory and render times
  const origSlice = original.substring(Math.max(0, windowStart - 1), windowEnd);
  const modSlice = modified.substring(Math.max(0, windowStart - 1), windowEnd);

  const segments: SequenceDiffSegment[] = [];
  let i = 0;
  let j = 0;
  const lenO = origSlice.length;
  const lenM = modSlice.length;
  let segId = 0;

  while (i < lenO || j < lenM) {
    if (i < lenO && j < lenM && origSlice[i] === modSlice[j]) {
      // Collect matching block
      const startI = i;
      const startJ = j;
      while (i < lenO && j < lenM && origSlice[i] === modSlice[j]) {
        i++;
        j++;
      }
      const matchText = origSlice.substring(startI, i);
      segments.push({
        id: `seg-${segId++}`,
        type: 'equal',
        originalText: matchText,
        modifiedText: matchText,
        origStart: windowStart + startI,
        origEnd: windowStart + i - 1,
        modStart: windowStart + startJ,
        modEnd: windowStart + j - 1
      });
    } else {
      // Find mismatch block
      const startI = i;
      const startJ = j;

      // Look ahead up to 30 residues for resynchronization
      let foundSync = false;
      let advanceI = 0;
      let advanceJ = 0;

      for (let k = 1; k <= 30; k++) {
        if (i + k < lenO && j + k < lenM && origSlice[i + k] === modSlice[j + k]) {
          advanceI = k;
          advanceJ = k;
          foundSync = true;
          break;
        }
        if (i + k < lenO && origSlice[i + k] === modSlice[j]) {
          advanceI = k;
          advanceJ = 0;
          foundSync = true;
          break;
        }
        if (j + k < lenM && origSlice[i] === modSlice[j + k]) {
          advanceI = 0;
          advanceJ = k;
          foundSync = true;
          break;
        }
      }

      if (foundSync) {
        const delText = origSlice.substring(startI, startI + advanceI);
        const insText = modSlice.substring(startJ, startJ + advanceJ);
        i += advanceI;
        j += advanceJ;

        if (delText.length > 0 && insText.length > 0) {
          segments.push({
            id: `seg-${segId++}`,
            type: 'replace',
            originalText: delText,
            modifiedText: insText,
            origStart: windowStart + startI,
            origEnd: windowStart + startI + delText.length - 1,
            modStart: windowStart + startJ,
            modEnd: windowStart + startJ + insText.length - 1
          });
        } else if (delText.length > 0) {
          segments.push({
            id: `seg-${segId++}`,
            type: 'delete',
            originalText: delText,
            modifiedText: '',
            origStart: windowStart + startI,
            origEnd: windowStart + startI + delText.length - 1,
            modStart: windowStart + startJ,
            modEnd: windowStart + startJ
          });
        } else if (insText.length > 0) {
          segments.push({
            id: `seg-${segId++}`,
            type: 'insert',
            originalText: '',
            modifiedText: insText,
            origStart: windowStart + startI,
            origEnd: windowStart + startI,
            modStart: windowStart + startJ,
            modEnd: windowStart + startJ + insText.length - 1
          });
        }
      } else {
        // Single residue mismatch / replacement
        const origChar = i < lenO ? origSlice[i] : '';
        const modChar = j < lenM ? modSlice[j] : '';
        if (origChar && modChar) {
          segments.push({
            id: `seg-${segId++}`,
            type: 'replace',
            originalText: origChar,
            modifiedText: modChar,
            origStart: windowStart + i,
            origEnd: windowStart + i,
            modStart: windowStart + j,
            modEnd: windowStart + j
          });
          i++;
          j++;
        } else if (origChar) {
          segments.push({
            id: `seg-${segId++}`,
            type: 'delete',
            originalText: origChar,
            modifiedText: '',
            origStart: windowStart + i,
            origEnd: windowStart + i,
            modStart: windowStart + j,
            modEnd: windowStart + j
          });
          i++;
        } else if (modChar) {
          segments.push({
            id: `seg-${segId++}`,
            type: 'insert',
            originalText: '',
            modifiedText: modChar,
            origStart: windowStart + i,
            origEnd: windowStart + i,
            modStart: windowStart + j,
            modEnd: windowStart + j
          });
          j++;
        }
      }
    }
  }

  return segments;
}

/**
 * Fast sequence reconstruction from an immutable original sequence and mutation operations.
 */
export function applyMutationsToSequence(
  originalSequence: string,
  mutations: SequenceMutation[]
): string {
  if (!originalSequence) return '';
  if (!mutations || mutations.length === 0) return originalSequence;

  // Apply mutations in coordinate order
  const sorted = [...mutations].sort((a, b) => a.position - b.position);
  let currentSeq = originalSequence;
  let offset = 0;

  for (const m of sorted) {
    if (m.operation === 'substitution') {
      const zeroIdx = Math.max(0, m.position - 1 + offset);
      const replaceLen = m.original ? m.original.length : 1;
      const mod = m.modified ? m.modified.toUpperCase() : '';
      currentSeq = currentSeq.substring(0, zeroIdx) + mod + currentSeq.substring(zeroIdx + replaceLen);
      offset += mod.length - replaceLen;
    } else if (m.operation === 'insertion') {
      const zeroIdx = Math.min(Math.max(0, m.position - 1 + offset), currentSeq.length);
      const mod = m.modified ? m.modified.toUpperCase() : '';
      currentSeq = currentSeq.substring(0, zeroIdx) + mod + currentSeq.substring(zeroIdx);
      offset += mod.length;
    } else if (m.operation === 'deletion') {
      const startIdx = Math.max(0, m.position - 1 + offset);
      const delLen = m.original ? m.original.length : (m.endPosition ? Math.max(1, m.endPosition - m.position + 1) : 1);
      const endIdx = Math.min(currentSeq.length, startIdx + delLen);
      currentSeq = currentSeq.substring(0, startIdx) + currentSeq.substring(endIdx);
      offset -= (endIdx - startIdx);
    }
  }

  return currentSeq;
}

/**
 * Derives accurate SequenceMutation records comparing originalSequence vs workingSequence.
 * Automatically aligns residues to detect substitutions, insertions, and deletions.
 * Uses fast mismatch boundary detection for large sequences.
 */
export function computeMutationsFromSequences(
  originalRaw: string,
  modifiedRaw: string,
  sequenceType: 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN' = 'PROTEIN'
): SequenceMutation[] {
  const origRaw = originalRaw || '';
  const modRaw = modifiedRaw || '';

  const original = origRaw.trim().startsWith('>')
    ? parseBiologicalInput(origRaw).sequence
    : origRaw.replace(/\s+/g, '').toUpperCase();

  const modified = modRaw.trim().startsWith('>')
    ? parseBiologicalInput(modRaw).sequence
    : modRaw.replace(/\s+/g, '').toUpperCase();

  if (original === modified || !modified) {
    return [];
  }

  // Fast mismatch boundary detection for large sequences
  let firstMismatch = 0;
  while (firstMismatch < original.length && firstMismatch < modified.length && original[firstMismatch] === modified[firstMismatch]) {
    firstMismatch++;
  }

  if (firstMismatch >= original.length && firstMismatch >= modified.length) {
    return [];
  }

  let lastMismatchOrig = original.length - 1;
  let lastMismatchMod = modified.length - 1;
  while (lastMismatchOrig >= firstMismatch && lastMismatchMod >= firstMismatch && original[lastMismatchOrig] === modified[lastMismatchMod]) {
    lastMismatchOrig--;
    lastMismatchMod--;
  }

  // Define narrow diff window around mismatches (adding 10bp padding)
  const windowStart = Math.max(1, firstMismatch + 1 - 10);
  const windowEnd = Math.max(windowStart + 1, Math.max(lastMismatchOrig + 1 + 10, lastMismatchMod + 1 + 10));

  const diffs = computeFastSequenceDiff(original, modified, windowStart, windowEnd);
  const mutations: SequenceMutation[] = [];
  const now = new Date().toISOString();

  for (const seg of diffs) {
    if (seg.type === 'equal') continue;

    if (seg.type === 'replace') {
      // If equal lengths, break down or record per residue
      if (seg.originalText.length === seg.modifiedText.length) {
        for (let k = 0; k < seg.originalText.length; k++) {
          const origChar = seg.originalText[k];
          const modChar = seg.modifiedText[k];
          if (origChar !== modChar) {
            const pos = seg.origStart + k;
            mutations.push({
              id: generateUUID(),
              operation: 'substitution',
              position: pos,
              original: origChar,
              modified: modChar,
              lengthChange: 0,
              timestamp: now,
              description: sequenceType === 'PROTEIN'
                ? `Position ${pos}: ${origChar} → ${modChar} (Amino Acid Substitution)`
                : `Position ${pos}: ${origChar} → ${modChar} (Substitution)`
            });
          }
        }
      } else {
        // Multi-residue replacement: record as substitution / replacement
        const origLen = seg.originalText.length;
        const modLen = seg.modifiedText.length;
        mutations.push({
          id: generateUUID(),
          operation: 'substitution',
          position: seg.origStart,
          endPosition: seg.origEnd,
          original: seg.originalText,
          modified: seg.modifiedText,
          lengthChange: modLen - origLen,
          timestamp: now,
          description: `Positions ${seg.origStart}–${seg.origEnd}: ${seg.originalText} → ${seg.modifiedText}`
        });
      }
    } else if (seg.type === 'insert') {
      const pos = seg.origStart > 0 ? seg.origStart : 1;
      mutations.push({
        id: generateUUID(),
        operation: 'insertion',
        position: pos,
        original: '',
        modified: seg.modifiedText,
        lengthChange: seg.modifiedText.length,
        timestamp: now,
        description: `Position ${pos > 1 ? `after ${pos - 1}` : '1'}: Inserted ${seg.modifiedText}`
      });
    } else if (seg.type === 'delete') {
      mutations.push({
        id: generateUUID(),
        operation: 'deletion',
        position: seg.origStart,
        endPosition: seg.origEnd,
        original: seg.originalText,
        modified: '',
        lengthChange: -seg.originalText.length,
        timestamp: now,
        description: seg.origStart === seg.origEnd
          ? `Position ${seg.origStart}: Deleted ${seg.originalText}`
          : `Positions ${seg.origStart}–${seg.origEnd}: Deleted ${seg.originalText}`
      });
    }

    if (mutations.length >= 300) {
      break;
    }
  }

  return mutations;
}

