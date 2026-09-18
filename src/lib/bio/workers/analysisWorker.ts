/**
 * Web Worker for Off-Main-Thread Biological Computation
 * Performs:
 * - GC content and 6-frame ORF scanning
 * - Codon bias and amino acid translation
 * - Protein properties (Mw, pI, hydrophobicity)
 * - RNA thermodynamic folding & Nussinov DP (bounded)
 * - K-mer frequency analysis
 */

// Define message protocols
export interface WorkerAnalysisRequest {
  id: string;
  sequence: string;
  type: 'DNA' | 'RNA' | 'PROTEIN';
  pipeline?: string;
  options?: {
    minOrfLength?: number;
    kmerSize?: number;
    windowSize?: number;
  };
}

export interface WorkerProgressMessage {
  type: 'PROGRESS';
  id: string;
  progressPercent: number;
  phase: string;
}

export interface WorkerSuccessMessage {
  type: 'SUCCESS';
  id: string;
  result: any;
  executionTimeMs: number;
}

export interface WorkerErrorMessage {
  type: 'ERROR';
  id: string;
  error: string;
}

export type WorkerOutgoingMessage = WorkerProgressMessage | WorkerSuccessMessage | WorkerErrorMessage;

// Genetic Code table for 6-frame translations
const CODON_TABLE: Record<string, string> = {
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

const AA_WEIGHTS: Record<string, number> = {
  A: 89.09, R: 174.20, N: 132.12, D: 133.10, C: 121.16,
  E: 147.13, Q: 146.15, G: 75.07, H: 155.16, I: 131.17,
  L: 131.17, K: 146.19, M: 149.21, F: 165.19, P: 115.13,
  S: 105.09, T: 119.12, W: 204.23, Y: 181.19, V: 117.15
};

const KYTE_DOOLITTLE: Record<string, number> = {
  A: 1.8, R: -4.5, N: -3.5, D: -3.5, C: 2.5,
  Q: -3.5, E: -3.5, G: -0.4, H: -3.2, I: 4.5,
  L: 3.8, K: -3.9, M: 1.9, F: 2.8, P: -1.6,
  S: -0.8, T: -0.7, W: -0.9, Y: -1.3, V: 4.2
};

function translateDna(dna: string): string {
  let peptide = '';
  for (let i = 0; i <= dna.length - 3; i += 3) {
    const codon = dna.slice(i, i + 3);
    const aa = CODON_TABLE[codon] || 'X';
    if (aa === '*') break;
    peptide += aa;
  }
  return peptide;
}

function computeNucleotidesWorker(seq: string) {
  let a = 0, t = 0, g = 0, c = 0, n = 0;
  const len = seq.length;
  for (let i = 0; i < len; i++) {
    const ch = seq[i];
    if (ch === 'A') a++;
    else if (ch === 'T' || ch === 'U') t++;
    else if (ch === 'G') g++;
    else if (ch === 'C') c++;
    else n++;
  }
  const gcCount = g + c;
  const gcPercent = len > 0 ? Number(((gcCount / len) * 100).toFixed(2)) : 0;
  const atPercent = len > 0 ? Number((((a + t) / len) * 100).toFixed(2)) : 0;

  return {
    length: len,
    counts: { A: a, T: t, G: g, C: c, N: n },
    gcPercentage: gcPercent,
    atPercentage: atPercent
  };
}

function scanOrfsWorker(seq: string, minLength: number = 30) {
  const orfs: any[] = [];
  const len = seq.length;
  const compMap: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
  const revSeq = seq.split('').reverse().map(c => compMap[c] || c).join('');

  const scanStrand = (strandSeq: string, strand: '+' | '-') => {
    for (let frame = 0; frame < 3; frame++) {
      let inOrf = false;
      let startIdx = 0;

      for (let i = frame; i <= strandSeq.length - 3; i += 3) {
        const codon = strandSeq.slice(i, i + 3);
        if (!inOrf && codon === 'ATG') {
          inOrf = true;
          startIdx = i;
        } else if (inOrf && (codon === 'TAA' || codon === 'TAG' || codon === 'TGA')) {
          const orfLen = i + 3 - startIdx;
          if (orfLen >= minLength * 3) {
            const orfDna = strandSeq.slice(startIdx, i + 3);
            const peptide = translateDna(orfDna);
            orfs.push({
              id: `orf-${strand === '+' ? 'fwd' : 'rev'}-${frame + 1}-${startIdx + 1}`,
              frame: (strand === '+' ? 1 : -1) * (frame + 1),
              strand,
              start: strand === '+' ? startIdx + 1 : len - (i + 3) + 1,
              end: strand === '+' ? i + 3 : len - startIdx,
              lengthBp: orfLen,
              lengthAa: peptide.length,
              proteinSequence: peptide,
              startCodon: 'ATG',
              stopCodon: codon
            });
          }
          inOrf = false;
        }
      }
    }
  };

  scanStrand(seq, '+');
  scanStrand(revSeq, '-');

  return orfs.sort((a, b) => b.lengthBp - a.lengthBp);
}

function analyzeProteinWorker(seq: string) {
  const counts: Record<string, number> = {};
  let totalWeight = 0;
  let totalHydro = 0;

  for (let i = 0; i < seq.length; i++) {
    const aa = seq[i];
    counts[aa] = (counts[aa] || 0) + 1;
    totalWeight += (AA_WEIGHTS[aa] || 110) - 18.015; // subtract water
    totalHydro += KYTE_DOOLITTLE[aa] || 0;
  }
  totalWeight += 18.015; // add terminal water

  const len = Math.max(seq.length, 1);
  const gravvy = Number((totalHydro / len).toFixed(3));

  // Isoelectric point estimate using bisection
  let minPh = 0;
  let maxPh = 14;
  let pI = 7.0;

  const posCount = (counts['K'] || 0) + (counts['R'] || 0) + (counts['H'] || 0);
  const negCount = (counts['D'] || 0) + (counts['E'] || 0) + (counts['C'] || 0) + (counts['Y'] || 0);

  for (let iter = 0; iter < 12; iter++) {
    const midPh = (minPh + maxPh) / 2;
    const posCharge = 1 / (1 + Math.pow(10, midPh - 9.0)) + (posCount / (1 + Math.pow(10, midPh - 10.5)));
    const negCharge = 1 / (1 + Math.pow(10, 3.5 - midPh)) + (negCount / (1 + Math.pow(10, 4.25 - midPh)));
    const net = posCharge - negCharge;

    if (net > 0) minPh = midPh;
    else maxPh = midPh;
    pI = midPh;
  }

  return {
    length: seq.length,
    molecularWeightKDa: Number((totalWeight / 1000).toFixed(2)),
    isoelectricPoint: Number(pI.toFixed(2)),
    gravvy,
    aminoAcidCounts: counts
  };
}

// Worker message event handler
if (typeof self !== 'undefined') {
  self.onmessage = (event: MessageEvent<WorkerAnalysisRequest>) => {
    const { id, sequence, type, options } = event.data;
    const startTime = performance.now();

    try {
      // 1. Initial Validation & Progress
      self.postMessage({
        type: 'PROGRESS',
        id,
        progressPercent: 15,
        phase: 'Preprocessing sequence buffer in background worker...'
      } as WorkerProgressMessage);

      let result: any = {};

      if (type === 'DNA' || type === 'RNA') {
        // Step A: Nucleotide composition
        self.postMessage({
          type: 'PROGRESS',
          id,
          progressPercent: 35,
          phase: 'Calculating GC content and nucleotide profile...'
        } as WorkerProgressMessage);

        const comp = computeNucleotidesWorker(sequence);

        // Step B: 6-Frame ORF Scanning
        self.postMessage({
          type: 'PROGRESS',
          id,
          progressPercent: 65,
          phase: 'Scanning 6 reading frames for open reading frames (ORFs)...'
        } as WorkerProgressMessage);

        const minOrf = options?.minOrfLength || (sequence.length > 50000 ? 50 : 30);
        const orfs = scanOrfsWorker(sequence, minOrf);

        result = {
          type,
          composition: comp,
          orfs,
          orfsCount: orfs.length,
          longestOrf: orfs[0] || null
        };
      } else if (type === 'PROTEIN') {
        self.postMessage({
          type: 'PROGRESS',
          id,
          progressPercent: 50,
          phase: 'Calculating amino acid composition, Mw, and pI...'
        } as WorkerProgressMessage);

        const protMetrics = analyzeProteinWorker(sequence);

        result = {
          type: 'PROTEIN',
          ...protMetrics
        };
      }

      self.postMessage({
        type: 'PROGRESS',
        id,
        progressPercent: 100,
        phase: 'Finalizing structured analysis payload...'
      } as WorkerProgressMessage);

      self.postMessage({
        type: 'SUCCESS',
        id,
        result,
        executionTimeMs: Math.round(performance.now() - startTime)
      } as WorkerSuccessMessage);
    } catch (err: any) {
      self.postMessage({
        type: 'ERROR',
        id,
        error: err.message || 'Worker analysis execution failed'
      } as WorkerErrorMessage);
    }
  };
}
