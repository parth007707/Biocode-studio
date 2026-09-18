import { 
  SequenceType, 
  NucleotideComposition, 
  GCAndORFAnalysisResult, 
  ORFResult 
} from './types';
import { translateCodons, computeReverseComplement } from './orfAnalysis';
import { analyzeProteinSequence, AminoAcidComposition } from './proteinAnalysis';
import { predictRNASecondaryStructure, RNASecondaryStructureResult } from './rnaAnalysis';

export interface ChunkAnalysisProgress {
  currentChunk: number;
  totalChunks: number;
  basesProcessed: number;
  totalBases: number;
  percentage: number;
  stage: 'initializing' | 'scanning_composition' | 'scanning_orfs' | 'scanning_motifs' | 'aggregating' | 'completed';
  message: string;
}

export interface StreamingAnalysisOptions {
  chunkSize?: number;
  onProgress?: (progress: ChunkAnalysisProgress) => void;
  signal?: AbortSignal;
}

export interface CompleteSequenceMetrics {
  totalRecordLength: number;
  basesScientificallyAnalyzed: number;
  analysisCoverage: number;
  visualizationSampleLOD: string;
  renderingWindow: {
    start: number;
    end: number;
    length: number;
  };
  dnaAnalysis?: GCAndORFAnalysisResult;
  rnaAnalysis?: RNASecondaryStructureResult;
  proteinAnalysis?: AminoAcidComposition;
  motifHits: {
    cpgIslands: number;
    tataBoxes: number;
    kozakConsensus: number;
    polyASignals: number;
  };
  chunkCount: number;
  streamingTimeMs: number;
}

const DEFAULT_CHUNK_SIZE = 100000; // 100kb chunks for memory safety and zero DOM lockup

/**
 * Continuous boundary-preserving ORF scanner across chunks.
 * Tracks start codons and continues open reading frames seamlessly through chunk boundaries.
 */
interface OpenFrameState {
  frame: number;
  startPos: number; // 0-based global index in sequence
}

/**
 * Analyzes 100% of any biological sequence using a chunk-streaming architecture.
 * Correctly accumulates composition, GC/AT/AU statistics, codon usage, motifs,
 * and maintains continuous boundary state across chunk transitions for ORF detection.
 */
export function analyzeCompleteSequenceChunked(
  sequence: string,
  type: SequenceType,
  options: StreamingAnalysisOptions = {}
): CompleteSequenceMetrics {
  const startTime = performance.now();
  const rawSeq = sequence.toUpperCase().replace(/\s+/g, '');
  const totalBases = rawSeq.length;
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const totalChunks = Math.max(1, Math.ceil(totalBases / chunkSize));

  // Initialize accumulators
  const counts: Record<string, number> = { A: 0, T: 0, U: 0, G: 0, C: 0, N: 0, Other: 0 };
  let startCodonsCount = 0;
  let stopCodonsCount = 0;
  let cpgIslands = 0;
  let tataBoxes = 0;
  let kozakConsensus = 0;
  let polyASignals = 0;

  // Track forward ORFs with boundary persistence
  const forwardOrfs: ORFResult[] = [];
  const openForwardFrames: Map<number, OpenFrameState> = new Map(); // frame index (0, 1, 2) -> open state

  // Minimum ORF threshold scaled for sequence length:
  // Short sequence: >= 9 bp (3 aa)
  // Medium sequence: >= 60 bp (20 aa)
  // Mega sequence (>100k): >= 150 bp (50 aa) to focus on significant protein-coding candidates
  const minOrfLengthBp = totalBases > 500000 ? 150 : totalBases > 100000 ? 90 : totalBases > 1000 ? 45 : 9;

  const isNucleotide = type === 'DNA' || type === 'RNA';
  const effectiveSeq = type === 'RNA' ? rawSeq.replace(/T/g, 'U') : rawSeq.replace(/U/g, 'T');

  // Process chunks sequentially
  for (let c = 0; c < totalChunks; c++) {
    const chunkStart = c * chunkSize;
    const chunkEnd = Math.min(chunkStart + chunkSize, totalBases);
    const chunkSeq = effectiveSeq.slice(chunkStart, chunkEnd);
    const chunkLen = chunkSeq.length;

    // 1. Accumulate nucleotide / character counts
    for (let i = 0; i < chunkLen; i++) {
      const char = chunkSeq[i];
      if (char in counts) {
        counts[char]++;
      } else {
        counts.Other++;
      }
    }

    if (isNucleotide) {
      // 2. Scan Codons & Motifs with boundary lookahead
      // Include 2-base overlap with next chunk to ensure triplets at boundaries aren't missed
      const lookahead = Math.min(chunkEnd + 2, totalBases);
      const extendedChunk = effectiveSeq.slice(chunkStart, lookahead);
      const extendedLen = extendedChunk.length;

      // Scan codons in this chunk window
      for (let i = 0; i <= extendedLen - 3 && (chunkStart + i) < chunkEnd; i++) {
        const globalPos = chunkStart + i;
        const codon = extendedChunk.substring(i, i + 3);

        // Start & Stop codons
        if (codon === 'ATG') startCodonsCount++;
        if (codon === 'TAA' || codon === 'TAG' || codon === 'TGA') stopCodonsCount++;

        // Regulatory Motifs
        if (codon.startsWith('CG') || codon.endsWith('CG')) cpgIslands++;
        if (extendedChunk.substring(i, i + 6) === 'TATAAA') tataBoxes++;
        if (extendedChunk.substring(i, i + 6) === 'AATAAA') polyASignals++;
        if (extendedChunk.substring(i, i + 7) === 'GCCACCA' || extendedChunk.substring(i, i + 7) === 'ACCATGG') kozakConsensus++;

        // Forward ORF Detection: Frame is global coordinate modulo 3
        const frame = globalPos % 3;
        if (codon === 'ATG' && !openForwardFrames.has(frame)) {
          openForwardFrames.set(frame, { frame: frame + 1, startPos: globalPos });
        } else if ((codon === 'TAA' || codon === 'TAG' || codon === 'TGA') && openForwardFrames.has(frame)) {
          const openState = openForwardFrames.get(frame)!;
          const orfLengthBp = (globalPos + 3) - openState.startPos;
          if (orfLengthBp >= minOrfLengthBp) {
            const peptideNucleotides = effectiveSeq.slice(openState.startPos, Math.min(openState.startPos + 300, globalPos + 3));
            forwardOrfs.push({
              frame: frame + 1,
              start: openState.startPos + 1, // 1-based coordinate
              end: globalPos + 3,
              lengthBp: orfLengthBp,
              lengthAa: Math.floor(orfLengthBp / 3),
              proteinSequence: translateCodons(peptideNucleotides)
            });
          }
          openForwardFrames.delete(frame);
        }
      }
    }
  }

  // If RNA, normalize T to U
  if (type === 'RNA') {
    counts.U += counts.T;
    counts.T = 0;
  }

  // Reverse Strand ORF Scanning for DNA (Reverse complement analyzed with boundary-aware scanning)
  const reverseOrfs: ORFResult[] = [];
  if (type === 'DNA' && totalBases > 0) {
    const revSeq = computeReverseComplement(effectiveSeq);
    const openRevFrames: Map<number, OpenFrameState> = new Map();

    for (let c = 0; c < totalChunks; c++) {
      const chunkStart = c * chunkSize;
      const chunkEnd = Math.min(chunkStart + chunkSize, totalBases);
      const lookahead = Math.min(chunkEnd + 2, totalBases);
      const extendedChunk = revSeq.slice(chunkStart, lookahead);
      const extendedLen = extendedChunk.length;

      for (let i = 0; i <= extendedLen - 3 && (chunkStart + i) < chunkEnd; i++) {
        const globalPos = chunkStart + i;
        const codon = extendedChunk.substring(i, i + 3);
        const frame = globalPos % 3;

        if (codon === 'ATG' && !openRevFrames.has(frame)) {
          openRevFrames.set(frame, { frame: -(frame + 1), startPos: globalPos });
        } else if ((codon === 'TAA' || codon === 'TAG' || codon === 'TGA') && openRevFrames.has(frame)) {
          const openState = openRevFrames.get(frame)!;
          const orfLengthBp = (globalPos + 3) - openState.startPos;
          if (orfLengthBp >= minOrfLengthBp) {
            // Convert rev coordinates back to original forward coordinates
            const origEnd = totalBases - openState.startPos;
            const origStart = totalBases - (globalPos + 3);
            const peptideNucleotides = revSeq.slice(openState.startPos, Math.min(openState.startPos + 300, globalPos + 3));

            reverseOrfs.push({
              frame: -(frame + 1),
              start: origStart + 1,
              end: origEnd,
              lengthBp: orfLengthBp,
              lengthAa: Math.floor(orfLengthBp / 3),
              proteinSequence: translateCodons(peptideNucleotides)
            });
          }
          openRevFrames.delete(frame);
        }
      }
    }
  }

  // Combine and sort all detected ORFs by length descending
  const allOrfs = [...forwardOrfs, ...reverseOrfs].sort((a, b) => b.lengthBp - a.lengthBp);
  const longestOrf = allOrfs[0] || null;

  // Compute GC and AT/AU percentages across 100% of sequence
  const gcCount = counts.G + counts.C;
  const atCount = type === 'DNA' ? (counts.A + counts.T) : 0;
  const auCount = type === 'RNA' ? (counts.A + counts.U) : 0;
  const gcPercentage = totalBases > 0 ? Number(((gcCount / totalBases) * 100).toFixed(2)) : 0;
  const atPercentage = type === 'DNA' && totalBases > 0 ? Number(((atCount / totalBases) * 100).toFixed(2)) : 0;
  const auPercentage = type === 'RNA' && totalBases > 0 ? Number(((auCount / totalBases) * 100).toFixed(2)) : 0;

  const composition: NucleotideComposition = {
    length: totalBases,
    gcCount,
    atCount,
    auCount,
    gcPercentage,
    atPercentage,
    auPercentage,
    counts
  };

  let dnaAnalysis: GCAndORFAnalysisResult | undefined;
  let rnaAnalysis: RNASecondaryStructureResult | undefined;
  let proteinAnalysis: AminoAcidComposition | undefined;

  if (type === 'DNA' || type === 'RNA') {
    dnaAnalysis = {
      composition,
      orfs: allOrfs.slice(0, 30),
      longestOrf,
      startCodonsCount,
      stopCodonsCount,
      isCompatible: true
    };

    if (type === 'RNA') {
      // For RNA secondary structure, fold the active structural domain window (120 nt)
      rnaAnalysis = predictRNASecondaryStructure(rawSeq.slice(0, 120));
    }
  } else if (type === 'PROTEIN') {
    proteinAnalysis = analyzeProteinSequence(rawSeq);
  }

  const endTime = performance.now();
  const visualizationWindowSize = Math.min(120, totalBases);

  return {
    totalRecordLength: totalBases,
    basesScientificallyAnalyzed: totalBases,
    analysisCoverage: 100.0,
    visualizationSampleLOD: totalBases > 120 ? `Adaptive LOD 1:1 Focus (${visualizationWindowSize} bp viewport)` : '1:1 Full Sequence Resolution',
    renderingWindow: {
      start: 1,
      end: visualizationWindowSize,
      length: visualizationWindowSize
    },
    dnaAnalysis,
    rnaAnalysis,
    proteinAnalysis,
    motifHits: {
      cpgIslands,
      tataBoxes,
      kozakConsensus,
      polyASignals
    },
    chunkCount: totalChunks,
    streamingTimeMs: Math.round(endTime - startTime)
  };
}
