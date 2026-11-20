/**
 * Shared Biological Translation & Pairwise Sequence Alignment Utilities
 * Used by both server structure resolution and client coordinate mapping.
 */

const STANDARD_CODON_TABLE: Record<string, string> = {
  TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L',
  CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
  ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M',
  GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
  TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S',
  CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T',
  GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*',
  CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
  AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K',
  GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
  TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W',
  CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R',
  GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G',
};

/**
 * Translate a coding DNA or mRNA sequence (5' -> 3') into a 1-letter amino acid sequence.
 * Stops at the first in-frame termination codon (*).
 */
export function translateCodingNucleotideSequence(cdsSequence: string): string {
  const dna = cdsSequence.toUpperCase().replace(/U/g, 'T').replace(/[^ATCGN]/g, '');
  let protein = '';
  for (let i = 0; i + 2 < dna.length; i += 3) {
    const codon = dna.slice(i, i + 3);
    const aa = STANDARD_CODON_TABLE[codon];
    if (!aa) {
      protein += 'X';
      continue;
    }
    if (aa === '*') {
      break;
    }
    protein += aa;
  }
  return protein;
}

/**
 * Group sorted 1-based missing residue indices into human-readable ranges (e.g. ["1–95", "290–393"]).
 */
export function formatResidueRanges(positions: number[], totalLength?: number): string[] {
  if (!positions || positions.length === 0) return [];
  const sorted = Array.from(new Set(positions)).sort((a, b) => a - b);
  const ranges: Array<{ start: number; end: number }> = [];

  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push({ start, end });
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push({ start, end });

  return ranges.map((r) => {
    const label = r.start === r.end ? `${r.start}` : `${r.start}–${r.end}`;
    if (r.start === 1 && totalLength && r.end < totalLength) {
      return `${label} (N-terminal unmodeled)`;
    }
    if (totalLength && r.end === totalLength && r.start > 1) {
      return `${label} (C-terminal unmodeled)`;
    }
    return `${label} (internal gap)`;
  });
}

export interface ChainSequenceAlignment {
  chainId: string;
  alignedLength: number;
  exactMatches: number;
  /** Percentage identity (0 - 100) over aligned residue pairs */
  sequenceIdentity: number;
  /** Number of target sequence residues covered by coordinates in this chain */
  coveredResiduesCount: number;
  totalTargetLength: number;
  /** Percentage of total target sequence covered (0 - 100) */
  coveragePercent: number;
  targetStart: number;
  targetEnd: number;
  chainResStart: number;
  chainResEnd: number;
  /** Map from 1-based target sequence index -> PDB residue resSeq */
  targetToChainResSeq: Record<number, number>;
  /** 1-based target positions lacking coordinates in this chain */
  missingPositions: number[];
  /** Human-readable missing regions */
  missingRegions: string[];
  score: number;
}

export function reverseComplementNucleotide(seq: string, isRna: boolean = false): string {
  const map: Record<string, string> = isRna
    ? { A: 'U', U: 'A', T: 'A', G: 'C', C: 'G', N: 'N' }
    : { A: 'T', T: 'A', U: 'A', G: 'C', C: 'G', N: 'N' };
  const clean = seq.toUpperCase().replace(/[^ATCUGN]/g, '');
  let out = '';
  for (let i = clean.length - 1; i >= 0; i--) {
    out += map[clean[i]] || 'N';
  }
  return out;
}

export function computeSequenceDiffMutations(
  originalSeq: string,
  modifiedSeq: string
): Array<{
  position: number;
  original: string;
  modified: string;
  operation: 'substitution' | 'insertion' | 'deletion';
  description: string;
  lengthChange: number;
}> {
  const orig = originalSeq.toUpperCase().replace(/[^A-Z]/g, '');
  const mod = modifiedSeq.toUpperCase().replace(/[^A-Z]/g, '');
  if (!orig || !mod || orig === mod) return [];

  const diffs: Array<{
    position: number;
    original: string;
    modified: string;
    operation: 'substitution' | 'insertion' | 'deletion';
    description: string;
    lengthChange: number;
  }> = [];

  if (orig.length === mod.length) {
    for (let i = 0; i < orig.length; i++) {
      if (orig[i] !== mod[i]) {
        diffs.push({
          position: i + 1,
          original: orig[i],
          modified: mod[i],
          operation: 'substitution',
          description: `Substitution ${orig[i]}${i + 1}${mod[i]}`,
          lengthChange: 0
        });
      }
    }
    return diffs;
  }

  // Length differs (insertions / deletions present, possibly combined with substitutions)
  let i = 0;
  let j = 0;
  while (i < orig.length && j < mod.length) {
    if (orig[i] === mod[j]) {
      i++;
      j++;
      continue;
    }
    // Check if the next characters align without a shift (local substitution)
    const lookaheadWindow = Math.min(8, orig.length - i - 1, mod.length - j - 1);
    let nextSameMatches = 0;
    for (let k = 1; k <= lookaheadWindow; k++) {
      if (orig[i + k] === mod[j + k]) nextSameMatches++;
    }
    if (lookaheadWindow >= 2 && nextSameMatches >= Math.ceil(lookaheadWindow * 0.6)) {
      diffs.push({
        position: i + 1,
        original: orig[i],
        modified: mod[j],
        operation: 'substitution',
        description: `Substitution ${orig[i]}${i + 1}${mod[j]}`,
        lengthChange: 0
      });
      i++;
      j++;
      continue;
    }
    // Otherwise record indel boundary and exit loop
    const remDelta = (mod.length - j) - (orig.length - i);
    diffs.push({
      position: j + 1,
      original: orig.slice(i, i + 1) || '-',
      modified: mod.slice(j, j + 1) || '-',
      operation: remDelta >= 0 ? 'insertion' : 'deletion',
      description: remDelta >= 0
        ? `Insertion of ${Math.max(1, remDelta)} residue(s) starting at position ${j + 1}`
        : `Deletion of ${Math.abs(remDelta)} residue(s) starting at position ${j + 1}`,
      lengthChange: remDelta
    });
    return diffs;
  }

  // Trailing insertion or deletion at C-terminus / 3' end
  if (i < orig.length || j < mod.length) {
    const remDelta = (mod.length - j) - (orig.length - i);
    diffs.push({
      position: j + 1,
      original: orig.slice(i, i + 1) || '-',
      modified: mod.slice(j, j + 1) || '-',
      operation: remDelta >= 0 ? 'insertion' : 'deletion',
      description: remDelta >= 0
        ? `Insertion of ${remDelta} residue(s) at position ${j + 1}`
        : `Deletion of ${Math.abs(remDelta)} residue(s) at position ${j + 1}`,
      lengthChange: remDelta
    });
  }
  return diffs;
}

/**
 * Semi-global pairwise alignment (end-gaps free on target/query sequence so partial PDB
 * fragments align accurately against full-length biological sequences).
 */
export function alignTargetToChainSequence(
  targetSequence: string,
  chainId: string,
  chainSequence: string,
  chainResSeqs: number[],
  polymerMode: 'PROTEIN' | 'DNA' | 'RNA' = 'PROTEIN'
): ChainSequenceAlignment {
  const target = targetSequence.toUpperCase().replace(/[^A-Z]/g, '');
  const chain = chainSequence.toUpperCase().replace(/[^A-Z]/g, '');
  const n = target.length;
  const m = chain.length;

  if (n === 0 || m === 0 || chainResSeqs.length !== m) {
    return {
      chainId,
      alignedLength: 0,
      exactMatches: 0,
      sequenceIdentity: 0,
      coveredResiduesCount: 0,
      totalTargetLength: n,
      coveragePercent: 0,
      targetStart: 0,
      targetEnd: 0,
      chainResStart: 0,
      chainResEnd: 0,
      targetToChainResSeq: {},
      missingPositions: Array.from({ length: n }, (_, i) => i + 1),
      missingRegions: n > 0 ? [`1–${n}`] : [],
      score: 0
    };
  }

  const normChar = (ch: string): string => {
    if (polymerMode === 'DNA' && ch === 'U') return 'T';
    if (polymerMode === 'RNA' && ch === 'T') return 'U';
    return ch;
  };

  // Smith-Waterman local alignment with strong match reward & modest gap penalty
  // so partial domain structures or short bound peptides align at their exact biological locus.
  const MATCH = 4;
  const MISMATCH = -4;
  const AMBIG_PENALTY = -1;
  const GAP = -5;

  const cols = m + 1;
  const H = new Int32Array((n + 1) * cols);
  // Traceback direction: 0 = stop, 1 = diag, 2 = up (gap in chain), 3 = left (gap in target)
  const trace = new Uint8Array((n + 1) * cols);

  let bestScore = 0;
  let bestI = 0;
  let bestJ = 0;

  for (let i = 1; i <= n; i++) {
    const ti = normChar(target[i - 1]);
    const rowOff = i * cols;
    const prevRowOff = (i - 1) * cols;

    for (let j = 1; j <= m; j++) {
      const cj = normChar(chain[j - 1]);
      const pairScore = ti === 'X' || cj === 'X'
        ? AMBIG_PENALTY
        : (ti === cj ? MATCH : MISMATCH);
      const diagScore = H[prevRowOff + (j - 1)] + pairScore;
      const upScore = H[prevRowOff + j] + GAP;
      const leftScore = H[rowOff + (j - 1)] + GAP;

      let val = 0;
      let dir = 0;
      if (diagScore > val) {
        val = diagScore;
        dir = 1;
      }
      if (upScore > val) {
        val = upScore;
        dir = 2;
      }
      if (leftScore > val) {
        val = leftScore;
        dir = 3;
      }

      H[rowOff + j] = val;
      trace[rowOff + j] = dir;

      if (val > bestScore) {
        bestScore = val;
        bestI = i;
        bestJ = j;
      }
    }
  }

  const targetToChainResSeq: Record<number, number> = {};
  const matchedTargetPositions: number[] = [];
  const matchedChainResSeqs: number[] = [];
  let alignedLength = 0;
  let exactMatches = 0;

  let i = bestI;
  let j = bestJ;
  while (i > 0 && j > 0 && trace[i * cols + j] !== 0) {
    const dir = trace[i * cols + j];
    if (dir === 1) {
      alignedLength++;
      if (normChar(target[i - 1]) === normChar(chain[j - 1]) && target[i - 1] !== 'X') {
        exactMatches++;
      }
      const resSeq = chainResSeqs[j - 1];
      targetToChainResSeq[i] = resSeq;
      matchedTargetPositions.push(i);
      matchedChainResSeqs.push(resSeq);
      i--;
      j--;
    } else if (dir === 2) {
      i--;
    } else {
      j--;
    }
  }

  matchedTargetPositions.sort((a, b) => a - b);
  matchedChainResSeqs.sort((a, b) => a - b);

  const coveredSet = new Set(matchedTargetPositions);
  const missingPositions: number[] = [];
  for (let pos = 1; pos <= n; pos++) {
    if (!coveredSet.has(pos)) missingPositions.push(pos);
  }

  const coveredResiduesCount = matchedTargetPositions.length;
  const sequenceIdentity = alignedLength > 0 ? Number(((exactMatches / alignedLength) * 100).toFixed(1)) : 0;
  const coveragePercent = n > 0 ? Number(((coveredResiduesCount / n) * 100).toFixed(1)) : 0;

  return {
    chainId,
    alignedLength,
    exactMatches,
    sequenceIdentity,
    coveredResiduesCount,
    totalTargetLength: n,
    coveragePercent,
    targetStart: matchedTargetPositions[0] || 0,
    targetEnd: matchedTargetPositions[matchedTargetPositions.length - 1] || 0,
    chainResStart: matchedChainResSeqs[0] || 0,
    chainResEnd: matchedChainResSeqs[matchedChainResSeqs.length - 1] || 0,
    targetToChainResSeq,
    missingPositions,
    missingRegions: formatResidueRanges(missingPositions, n),
    score: bestScore
  };
}
