import { NucleotideComposition, SequenceType } from './types';

export function computeNucleotideComposition(seq: string, type: SequenceType): NucleotideComposition {
  const length = seq.length;
  const counts: Record<string, number> = { A: 0, T: 0, U: 0, G: 0, C: 0, N: 0, Other: 0 };

  let weightedGc = 0;
  let weightedAt = 0;
  let validBases = 0;

  for (let i = 0; i < length; i++) {
    const c = seq[i].toUpperCase();
    if (c in counts) {
      counts[c]++;
    } else {
      counts.Other++;
    }

    if (c === 'G' || c === 'C') {
      weightedGc += 1;
      validBases++;
    } else if (c === 'A' || c === 'T' || c === 'U') {
      weightedAt += 1;
      validBases++;
    } else if (c === 'S') { // Strong (G or C)
      weightedGc += 1;
      validBases++;
    } else if (c === 'W') { // Weak (A or T/U)
      weightedAt += 1;
      validBases++;
    } else if (c === 'R' || c === 'Y' || c === 'M' || c === 'K') { // 50% GC, 50% AT
      weightedGc += 0.5;
      weightedAt += 0.5;
      validBases++;
    } else if (c === 'B' || c === 'V') { // 66.7% GC
      weightedGc += 0.67;
      weightedAt += 0.33;
      validBases++;
    } else if (c === 'D' || c === 'H') { // 33.3% GC
      weightedGc += 0.33;
      weightedAt += 0.67;
      validBases++;
    }
  }

  // If RNA, normalize any cDNA Thymines (T) to Uracil (U) for biological accuracy
  if (type === 'RNA') {
    counts.U += counts.T;
    counts.T = 0;
  }

  const gcCount = Math.round(weightedGc);
  const atCount = type === 'DNA' ? Math.round(weightedAt) : 0;
  const auCount = type === 'RNA' ? Math.round(weightedAt) : 0;

  const denominator = validBases > 0 ? validBases : length;
  const gcPercentage = denominator > 0 ? Number(((weightedGc / denominator) * 100).toFixed(2)) : 0;
  const atPercentage = type === 'DNA' && denominator > 0 ? Number(((weightedAt / denominator) * 100).toFixed(2)) : 0;
  const auPercentage = type === 'RNA' && denominator > 0 ? Number(((weightedAt / denominator) * 100).toFixed(2)) : 0;

  return {
    length,
    gcCount,
    atCount,
    auCount,
    gcPercentage,
    atPercentage,
    auPercentage,
    counts
  };
}
