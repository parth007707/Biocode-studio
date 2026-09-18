import { ORFResult, GCAndORFAnalysisResult, SequenceType } from './types';
import { computeNucleotideComposition } from './gcAnalysis';

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

export function translateCodons(dna: string): string {
  let protein = '';
  for (let i = 0; i < dna.length - 2; i += 3) {
    const codon = dna.substring(i, i + 3);
    protein += GENETIC_CODE[codon] || 'X';
  }
  return protein;
}

export function computeComplement(seq: string): string {
  const complementMap: Record<string, string> = {
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

export function computeReverseComplement(seq: string): string {
  const comp = computeComplement(seq);
  return comp.split('').reverse().join('');
}

export function analyzeGCAndORF(seq: string, type: SequenceType): GCAndORFAnalysisResult {
  const composition = computeNucleotideComposition(seq, type);

  if (type === 'PROTEIN') {
    return {
      composition,
      orfs: [],
      longestOrf: null,
      startCodonsCount: 0,
      stopCodonsCount: 0,
      isCompatible: false,
      incompatibilityReason: 'GC Content & ORF Profiling pipeline requires a nucleotide sequence (DNA or RNA), not an amino acid protein sequence.'
    };
  }

  if (type !== 'DNA' && type !== 'RNA') {
    return {
      composition,
      orfs: [],
      longestOrf: null,
      startCodonsCount: 0,
      stopCodonsCount: 0,
      isCompatible: false,
      incompatibilityReason: 'Invalid or unknown sequence type for nucleotide profiling.'
    };
  }

  const analysisSeq = type === 'RNA' ? seq.replace(/U/g, 'T') : seq;
  const length = analysisSeq.length;

  let startCodonsCount = 0;
  let stopCodonsCount = 0;

  for (let i = 0; i <= length - 3; i++) {
    const codon = analysisSeq.substring(i, i + 3);
    if (codon === 'ATG') startCodonsCount++;
    if (codon === 'TAA' || codon === 'TAG' || codon === 'TGA') stopCodonsCount++;
  }

  const orfs: ORFResult[] = [];
  const minOrfLengthBp = length > 500000 ? 150 : length > 100000 ? 90 : length > 5000 ? 45 : 9;

  // Forward frames (+1, +2, +3)
  for (let frame = 0; frame < 3; frame++) {
    let currentStart = -1;
    for (let i = frame; i < length - 2; i += 3) {
      const codon = analysisSeq.substring(i, i + 3);
      if (codon === 'ATG' && currentStart === -1) {
        currentStart = i;
      } else if ((codon === 'TAA' || codon === 'TAG' || codon === 'TGA') && currentStart !== -1) {
        const orfBp = i + 3 - currentStart;
        if (orfBp >= minOrfLengthBp) {
          const peptideNucleotides = analysisSeq.substring(currentStart, Math.min(currentStart + 300, i + 3));
          orfs.push({
            frame: frame + 1,
            start: currentStart + 1,
            end: i + 3,
            lengthBp: orfBp,
            lengthAa: Math.floor(orfBp / 3),
            proteinSequence: translateCodons(peptideNucleotides)
          });
        }
        currentStart = -1;
      }
    }
  }

  // Reverse frames (-1, -2, -3) for DNA
  if (type === 'DNA') {
    const revSeq = computeReverseComplement(analysisSeq);
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
            const origEnd = length - currentStart;
            const origStart = length - (i + 3);
            const peptideNucleotides = revSeq.substring(currentStart, Math.min(currentStart + 300, i + 3));
            orfs.push({
              frame: -(frame + 1),
              start: origStart + 1,
              end: origEnd,
              lengthBp: orfBp,
              lengthAa: Math.floor(orfBp / 3),
              proteinSequence: translateCodons(peptideNucleotides)
            });
          }
          currentStart = -1;
        }
      }
    }
  }

  orfs.sort((a, b) => b.lengthBp - a.lengthBp);
  const longestOrf = orfs.length > 0 ? orfs[0] : null;

  return {
    composition,
    orfs: orfs.slice(0, 30),
    longestOrf,
    startCodonsCount,
    stopCodonsCount,
    isCompatible: true
  };
}
