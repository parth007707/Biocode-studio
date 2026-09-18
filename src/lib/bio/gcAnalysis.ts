import { NucleotideComposition, SequenceType } from './types';

export function computeNucleotideComposition(seq: string, type: SequenceType): NucleotideComposition {
  const length = seq.length;
  const counts: Record<string, number> = { A: 0, T: 0, U: 0, G: 0, C: 0, N: 0, Other: 0 };

  for (let i = 0; i < length; i++) {
    const c = seq[i].toUpperCase();
    if (c in counts) {
      counts[c]++;
    } else {
      counts.Other++;
    }
  }

  // If RNA, normalize any cDNA Thymines (T) to Uracil (U) for biological accuracy
  if (type === 'RNA') {
    counts.U += counts.T;
    counts.T = 0;
  }

  const gcCount = counts.G + counts.C;
  const atCount = type === 'DNA' ? (counts.A + counts.T) : 0;
  const auCount = type === 'RNA' ? (counts.A + counts.U) : 0;

  const gcPercentage = length > 0 ? Number(((gcCount / length) * 100).toFixed(2)) : 0;
  const atPercentage = type === 'DNA' && length > 0 ? Number(((atCount / length) * 100).toFixed(2)) : 0;
  const auPercentage = type === 'RNA' && length > 0 ? Number(((auCount / length) * 100).toFixed(2)) : 0;

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
