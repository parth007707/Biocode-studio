export interface ParsedSequence {
  header: string | null;
  rawSequence: string;
  cleanSequence: string;
  sequenceType: 'DNA' | 'RNA' | 'Protein' | 'Unknown';
  length: number;
}

export interface ORFResult {
  frame: number; // +1, +2, +3, -1, -2, -3
  start: number; // 1-based coordinate in sequence
  end: number;
  lengthBp: number;
  lengthAa: number;
  proteinSequence: string;
}

export interface DNAAnalysisResult {
  length: number;
  gcContent: number;
  nucleotideCounts: Record<string, number>;
  reverseComplement: string;
  orfs: ORFResult[];
}

const GENETIC_CODE: Record<string, string> = {
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
  GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G'
};

export function parseSequenceInput(input: string): ParsedSequence {
  const lines = input.split(/\r?\n/);
  let header: string | null = null;
  const seqLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('>')) {
      if (!header) {
        header = trimmed.substring(1).trim();
      }
    } else {
      seqLines.push(trimmed);
    }
  }

  const rawSequence = seqLines.join('');
  // Remove all whitespace, numbers, non-alphabetic chars except standard IUPAC codes
  const cleanSequence = rawSequence.replace(/[^A-Za-z*]/g, '').toUpperCase();
  const sequenceType = detectSequenceType(cleanSequence);

  return {
    header,
    rawSequence,
    cleanSequence,
    sequenceType,
    length: cleanSequence.length
  };
}

export function detectSequenceType(seq: string): 'DNA' | 'RNA' | 'Protein' | 'Unknown' {
  if (!seq || seq.length === 0) return 'Unknown';

  // Check for protein-specific amino acids that don't occur in DNA/RNA (E, F, I, P, Q, Z, etc.)
  const proteinOnlyChars = /[EFIPQZ]/i;
  if (proteinOnlyChars.test(seq)) {
    return 'Protein';
  }

  // Check for RNA (contains U, no T)
  const hasU = /U/.test(seq);
  const hasT = /T/.test(seq);
  if (hasU && !hasT) {
    return 'RNA';
  }

  // Check if mostly ACGTN and IUPAC DNA codes
  const dnaChars = /^[ACGTNRYWSKMBDHV]+$/i;
  if (dnaChars.test(seq)) {
    return 'DNA';
  }

  // Fallback heuristic based on amino acid alphabet vs nucleotide
  const aminoAcidChars = /^[ACDEFGHIKLMNPQRSTVWY*]+$/i;
  if (aminoAcidChars.test(seq) && seq.length > 5) {
    // If it has letters like E, Q, P, I, F which are common in proteins
    return 'Protein';
  }

  return 'DNA';
}

export function computeComplement(seq: string, isRna: boolean = false): string {
  const complementMap: Record<string, string> = isRna ? {
    A: 'U', U: 'A', G: 'C', C: 'G', N: 'N'
  } : {
    A: 'T', T: 'A', G: 'C', C: 'G', N: 'N',
    R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K',
    B: 'V', D: 'H', H: 'D', V: 'B'
  };

  let comp = '';
  for (let i = 0; i < seq.length; i++) {
    const char = seq[i];
    comp += complementMap[char] || char;
  }
  return comp;
}

export function computeReverseComplement(seq: string, isRna: boolean = false): string {
  const comp = computeComplement(seq, isRna);
  return comp.split('').reverse().join('');
}

export function translateCodons(dna: string): string {
  let protein = '';
  for (let i = 0; i < dna.length - 2; i += 3) {
    const codon = dna.substring(i, i + 3);
    protein += GENETIC_CODE[codon] || 'X';
  }
  return protein;
}

export function analyzeDNA(seq: string): DNAAnalysisResult {
  const length = seq.length;
  const counts: Record<string, number> = { A: 0, T: 0, G: 0, C: 0, N: 0, Other: 0 };

  for (let i = 0; i < length; i++) {
    const c = seq[i];
    if (c in counts) {
      counts[c]++;
    } else {
      counts.Other++;
    }
  }

  const gcCount = counts.G + counts.C;
  const gcContent = length > 0 ? Number(((gcCount / length) * 100).toFixed(2)) : 0;
  const reverseComplement = computeReverseComplement(seq, false);

  // ORF Detection (find start codon ATG, stop codon TAA/TAG/TGA)
  const orfs: ORFResult[] = [];
  const minOrfLengthBp = 30; // Minimum 10 amino acids

  // Check 3 forward frames
  for (let frame = 0; frame < 3; frame++) {
    let currentStart = -1;
    for (let i = frame; i < length - 2; i += 3) {
      const codon = seq.substring(i, i + 3);
      if (codon === 'ATG' && currentStart === -1) {
        currentStart = i; // 0-based start index
      } else if ((codon === 'TAA' || codon === 'TAG' || codon === 'TGA') && currentStart !== -1) {
        const orfBp = i + 3 - currentStart;
        if (orfBp >= minOrfLengthBp) {
          const nucleotideSub = seq.substring(currentStart, i + 3);
          orfs.push({
            frame: frame + 1,
            start: currentStart + 1, // 1-based coordinate
            end: i + 3,
            lengthBp: orfBp,
            lengthAa: Math.floor(orfBp / 3),
            proteinSequence: translateCodons(nucleotideSub)
          });
        }
        currentStart = -1;
      }
    }
  }

  // Check 3 reverse frames
  const revSeq = reverseComplement;
  const revLength = revSeq.length;
  for (let frame = 0; frame < 3; frame++) {
    let currentStart = -1;
    for (let i = frame; i < revLength - 2; i += 3) {
      const codon = revSeq.substring(i, i + 3);
      if (codon === 'ATG' && currentStart === -1) {
        currentStart = i;
      } else if ((codon === 'TAA' || codon === 'TAG' || codon === 'TGA') && currentStart !== -1) {
        const orfBp = i + 3 - currentStart;
        if (orfBp >= minOrfLengthBp) {
          // Map back to original forward coordinates
          const origEnd = length - currentStart;
          const origStart = length - (i + 3);
          const nucleotideSub = revSeq.substring(currentStart, i + 3);
          orfs.push({
            frame: -(frame + 1),
            start: origStart + 1,
            end: origEnd,
            lengthBp: orfBp,
            lengthAa: Math.floor(orfBp / 3),
            proteinSequence: translateCodons(nucleotideSub)
          });
        }
        currentStart = -1;
      }
    }
  }

  // Sort ORFs by length descending
  orfs.sort((a, b) => b.lengthBp - a.lengthBp);

  return {
    length,
    gcContent,
    nucleotideCounts: counts,
    reverseComplement,
    orfs: orfs.slice(0, 15) // Keep top 15 ORFs
  };
}
