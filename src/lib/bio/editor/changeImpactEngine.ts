import {
  SequenceMutation,
  MutationSummary
} from './types';
import { analyzeProteinSequence, AminoAcidComposition } from '../proteinAnalysis';
import { computeNucleotideComposition } from '../gcAnalysis';
import { analyzeGCAndORF } from '../orfAnalysis';

// ============================================================================
// 1. BIOLOGICAL CONSTANTS & MATRICES
// ============================================================================

// Grantham's distance matrix between amino acids (measures chemical difference: composition, polarity, molecular volume)
// Grantham R. Science. 1974;185(4154):862-864.
const GRANTHAM_DISTANCE: Record<string, Record<string, number>> = {
  A: { A: 0, R: 112, N: 111, D: 126, C: 195, Q: 91, E: 107, G: 60, H: 86, I: 94, L: 96, K: 106, M: 84, F: 113, P: 27, S: 99, T: 58, W: 148, Y: 112, V: 64 },
  R: { A: 112, R: 0, N: 86, D: 96, C: 180, Q: 43, E: 54, G: 125, H: 29, I: 97, L: 102, K: 26, M: 91, F: 97, P: 103, S: 110, T: 71, W: 101, Y: 77, V: 96 },
  N: { A: 111, R: 86, N: 0, D: 23, C: 139, Q: 46, E: 42, G: 80, H: 68, I: 149, L: 153, K: 94, M: 142, F: 158, P: 91, S: 46, T: 65, W: 174, Y: 143, V: 133 },
  D: { A: 126, R: 96, N: 23, D: 0, C: 154, Q: 61, E: 45, G: 81, H: 81, I: 168, L: 172, K: 101, M: 160, F: 177, P: 108, S: 65, T: 85, W: 181, Y: 160, V: 152 },
  C: { A: 195, R: 180, N: 139, D: 154, C: 0, Q: 154, E: 170, G: 159, H: 174, I: 198, L: 198, K: 202, M: 196, F: 205, P: 169, S: 112, T: 149, W: 215, Y: 194, V: 192 },
  Q: { A: 91, R: 43, N: 46, D: 61, C: 154, Q: 0, E: 29, G: 87, H: 24, I: 109, L: 113, K: 53, M: 101, F: 116, P: 76, S: 68, T: 42, W: 130, Y: 99, V: 96 },
  E: { A: 107, R: 54, N: 42, D: 45, C: 170, Q: 29, E: 0, G: 98, H: 40, I: 134, L: 138, K: 56, M: 126, F: 140, P: 93, S: 80, T: 65, W: 152, Y: 122, V: 121 },
  G: { A: 60, R: 125, N: 80, D: 81, C: 159, Q: 87, E: 98, G: 0, H: 98, I: 135, L: 138, K: 127, M: 127, F: 153, P: 42, S: 56, T: 59, W: 184, Y: 147, V: 109 },
  H: { A: 86, R: 29, N: 68, D: 81, C: 174, Q: 24, E: 40, G: 98, H: 0, I: 94, L: 99, K: 32, M: 87, F: 100, P: 77, S: 89, T: 47, W: 115, Y: 83, V: 84 },
  I: { A: 94, R: 97, N: 149, D: 168, C: 198, Q: 109, E: 134, G: 135, H: 94, I: 0, L: 5, K: 102, M: 10, F: 21, P: 95, S: 142, T: 89, W: 61, Y: 33, V: 29 },
  L: { A: 96, R: 102, N: 153, D: 172, C: 198, Q: 113, E: 138, G: 138, H: 99, I: 5, L: 0, K: 107, M: 15, F: 22, P: 98, S: 145, T: 92, W: 61, Y: 36, V: 32 },
  K: { A: 106, R: 26, N: 94, D: 101, C: 202, Q: 53, E: 56, G: 127, H: 32, I: 102, L: 107, K: 0, M: 95, F: 102, P: 103, S: 121, T: 78, W: 110, Y: 85, V: 97 },
  M: { A: 84, R: 91, N: 142, D: 160, C: 196, Q: 101, E: 126, G: 127, H: 87, I: 10, L: 15, K: 95, M: 0, F: 18, P: 87, S: 135, T: 81, W: 67, Y: 36, V: 21 },
  F: { A: 113, R: 97, N: 158, D: 177, C: 205, Q: 116, E: 140, G: 153, H: 100, I: 21, L: 22, K: 102, M: 18, F: 0, P: 114, S: 155, T: 103, W: 40, Y: 22, V: 50 },
  P: { A: 27, R: 103, N: 91, D: 108, C: 169, Q: 76, E: 93, G: 42, H: 77, I: 95, L: 98, K: 103, M: 87, F: 114, P: 0, S: 74, T: 38, W: 147, Y: 110, V: 68 },
  S: { A: 99, R: 110, N: 46, D: 65, C: 112, Q: 68, E: 80, G: 56, H: 89, I: 142, L: 145, K: 121, M: 135, F: 155, P: 74, S: 0, T: 58, W: 177, Y: 144, V: 124 },
  T: { A: 58, R: 71, N: 65, D: 85, C: 149, Q: 42, E: 65, G: 59, H: 47, I: 89, L: 92, K: 78, M: 81, F: 103, P: 38, S: 58, T: 0, W: 128, Y: 92, V: 69 },
  W: { A: 148, R: 101, N: 174, D: 181, C: 215, Q: 130, E: 152, G: 184, H: 115, I: 61, L: 61, K: 110, M: 67, F: 40, P: 147, S: 177, T: 128, W: 0, Y: 37, V: 88 },
  Y: { A: 112, R: 77, N: 143, D: 160, C: 194, Q: 99, E: 122, G: 147, H: 83, I: 33, L: 36, K: 85, M: 36, F: 22, P: 110, S: 144, T: 92, W: 37, Y: 0, V: 55 },
  V: { A: 64, R: 96, N: 133, D: 152, C: 192, Q: 96, E: 121, G: 109, H: 84, I: 29, L: 32, K: 97, M: 21, F: 50, P: 68, S: 124, T: 69, W: 88, Y: 55, V: 0 }
};

// BLOSUM62 Log-odds scores for substitution conservative scoring
const BLOSUM62: Record<string, Record<string, number>> = {
  A: { A: 4, R: -1, N: -2, D: -2, C: 0, Q: -1, E: -1, G: 0, H: -2, I: -1, L: -1, K: -1, M: -1, F: -2, P: -1, S: 1, T: 0, W: -3, Y: -2, V: 0 },
  R: { A: -1, R: 5, N: 0, D: -2, C: -3, Q: 1, E: 0, G: -2, H: 0, I: -3, L: -2, K: 2, M: -1, F: -3, P: -2, S: -1, T: -1, W: -3, Y: -2, V: -3 },
  N: { A: -2, R: 0, N: 6, D: 1, C: -3, Q: 0, E: 0, G: 0, H: 1, I: -3, L: -3, K: 0, M: -2, F: -3, P: -2, S: 1, T: 0, W: -4, Y: -2, V: -3 },
  D: { A: -2, R: -2, N: 1, D: 6, C: -3, Q: 0, E: 2, G: -1, H: -1, I: -3, L: -4, K: -1, M: -3, F: -3, P: -1, S: 0, T: -1, W: -4, Y: -3, V: -3 },
  C: { A: 0, R: -3, N: -3, D: -3, C: 9, Q: -3, E: -4, G: -3, H: -3, I: -1, L: -1, K: -3, M: -1, F: -2, P: -3, S: -1, T: -1, W: -2, Y: -2, V: -1 },
  Q: { A: -1, R: 1, N: 0, D: 0, C: -3, Q: 5, E: 2, G: -2, H: 0, I: -3, L: -2, K: 1, M: 0, F: -3, P: -1, S: 0, T: -1, W: -2, Y: -1, V: -2 },
  E: { A: -1, R: 0, N: 0, D: 2, C: -4, Q: 2, E: 5, G: -2, H: 0, I: -3, L: -3, K: 1, M: -2, F: -3, P: -1, S: 0, T: -1, W: -3, Y: -2, V: -2 },
  G: { A: 0, R: -2, N: 0, D: -1, C: -3, Q: -2, E: -2, G: 6, H: -2, I: -4, L: -4, K: -2, M: -3, F: -3, P: -2, S: 0, T: -2, W: -2, Y: -3, V: -3 },
  H: { A: -2, R: 0, N: 1, D: -1, C: -3, Q: 0, E: 0, G: -2, H: 8, I: -3, L: -3, K: -1, M: -2, F: -1, P: -2, S: -1, T: -2, W: -2, Y: 2, V: -3 },
  I: { A: -1, R: -3, N: -3, D: -3, C: -1, Q: -3, E: -3, G: -4, H: -3, I: 4, L: 2, K: -3, M: 1, F: 0, P: -3, S: -2, T: -1, W: -3, Y: -1, V: 3 },
  L: { A: -1, R: -2, N: -3, D: -4, C: -1, Q: -2, E: -3, G: -4, H: -3, I: 2, L: 4, K: -2, M: 2, F: 0, P: -3, S: -2, T: -1, W: -2, Y: -1, V: 1 },
  K: { A: -1, R: 2, N: 0, D: -1, C: -3, Q: 1, E: 1, G: -2, H: -1, I: -3, L: -2, K: 5, M: -1, F: -3, P: -1, S: 0, T: -1, W: -3, Y: -2, V: -2 },
  M: { A: -1, R: -1, N: -2, D: -3, C: -1, Q: 0, E: -2, G: -3, H: -2, I: 1, L: 2, K: -1, M: 5, F: 0, P: -2, S: -1, T: -1, W: -1, Y: -1, V: 1 },
  F: { A: -2, R: -3, N: -3, D: -3, C: -2, Q: -3, E: -3, G: -3, H: -1, I: 0, L: 0, K: -3, M: 0, F: 6, P: -4, S: -2, T: -2, W: 1, Y: 3, V: -1 },
  P: { A: -1, R: -2, N: -2, D: -1, C: -3, Q: -1, E: -1, G: -2, H: -2, I: -3, L: -3, K: -1, M: -2, F: -4, P: 7, S: -1, T: -1, W: -4, Y: -3, V: -2 },
  S: { A: 1, R: -1, N: 1, D: 0, C: -1, Q: 0, E: 0, G: 0, H: -1, I: -2, L: -2, K: 0, M: -1, F: -2, P: -1, S: 4, T: 1, W: -3, Y: -2, V: -2 },
  T: { A: 0, R: -1, N: 0, D: -1, C: -1, Q: -1, E: -1, G: -2, H: -2, I: -1, L: -1, K: -1, M: -1, F: -2, P: -1, S: 1, T: 5, W: -2, Y: -2, V: 0 },
  W: { A: -3, R: -3, N: -4, D: -4, C: -2, Q: -2, E: -3, G: -2, H: -2, I: -3, L: -2, K: -3, M: -1, F: 1, P: -4, S: -3, T: -2, W: 11, Y: 2, V: -3 },
  Y: { A: -2, R: -2, N: -2, D: -3, C: -2, Q: -1, E: -2, G: -3, H: 2, I: -1, L: -1, K: -2, M: -1, F: 3, P: -3, S: -2, T: -2, W: 2, Y: 7, V: -1 },
  V: { A: 0, R: -3, N: -3, D: -3, C: -1, Q: -2, E: -2, G: -3, H: -3, I: 3, L: 1, K: -2, M: 1, F: -1, P: -2, S: -2, T: 0, W: -3, Y: -1, V: 4 }
};

// Genetic Standard Code Table
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

// Key Restriction Endonuclease recognition motifs (6bp+ palindromes & popular enzymes)
const RESTRICTION_SITES: Record<string, string> = {
  EcoRI: 'GAATTC',
  BamHI: 'GGATCC',
  HindIII: 'AAGCTT',
  NotI: 'GCGGCCGC',
  XhoI: 'CTCGAG',
  NdeI: 'CATATG',
  PstI: 'CTGCAG',
  SalI: 'GTCGAC',
  SpeI: 'ACTAGT',
  XbaI: 'TCTAGA',
  SacI: 'GAGCTC',
  KpnI: 'GGTACC',
  SmaI: 'CCCGGG',
  BglII: 'AGATCT',
  NcoI: 'CCATGG'
};

// Amino Acid Physicochemical Classes
const AA_CLASSES: Record<string, { category: string; charge: number; hydropathy: string; volume: string }> = {
  A: { category: 'Aliphatic Non-Polar', charge: 0, hydropathy: 'Hydrophobic', volume: 'Small' },
  R: { category: 'Basic Positively-Charged', charge: 1, hydropathy: 'Hydrophilic', volume: 'Bulky' },
  N: { category: 'Polar Uncharged', charge: 0, hydropathy: 'Hydrophilic', volume: 'Medium' },
  D: { category: 'Acidic Negatively-Charged', charge: -1, hydropathy: 'Hydrophilic', volume: 'Medium' },
  C: { category: 'Special / Disulfide', charge: 0, hydropathy: 'Hydrophobic', volume: 'Small' },
  Q: { category: 'Polar Uncharged', charge: 0, hydropathy: 'Hydrophilic', volume: 'Medium' },
  E: { category: 'Acidic Negatively-Charged', charge: -1, hydropathy: 'Hydrophilic', volume: 'Medium' },
  G: { category: 'Special / Flexible Achiral', charge: 0, hydropathy: 'Neutral', volume: 'Very Small' },
  H: { category: 'Basic / Aromatic', charge: 0.5, hydropathy: 'Polar', volume: 'Medium' },
  I: { category: 'Aliphatic Branched', charge: 0, hydropathy: 'Very Hydrophobic', volume: 'Bulky' },
  L: { category: 'Aliphatic Branched', charge: 0, hydropathy: 'Very Hydrophobic', volume: 'Bulky' },
  K: { category: 'Basic Positively-Charged', charge: 1, hydropathy: 'Hydrophilic', volume: 'Bulky' },
  M: { category: 'Sulfur-Containing Non-Polar', charge: 0, hydropathy: 'Hydrophobic', volume: 'Bulky' },
  F: { category: 'Aromatic Non-Polar', charge: 0, hydropathy: 'Very Hydrophobic', volume: 'Very Bulky' },
  P: { category: 'Special / Conformational Kink', charge: 0, hydropathy: 'Neutral', volume: 'Rigid' },
  S: { category: 'Polar Hydroxyl', charge: 0, hydropathy: 'Hydrophilic', volume: 'Small' },
  T: { category: 'Polar Hydroxyl', charge: 0, hydropathy: 'Neutral', volume: 'Small' },
  W: { category: 'Aromatic Indole Ring', charge: 0, hydropathy: 'Hydrophobic', volume: 'Largest' },
  Y: { category: 'Aromatic Phenol', charge: 0, hydropathy: 'Amphipathic', volume: 'Very Bulky' },
  V: { category: 'Aliphatic Branched', charge: 0, hydropathy: 'Very Hydrophobic', volume: 'Medium' }
};

// ============================================================================
// 2. TYPES & INTERFACES FOR CHANGE IMPACT
// ============================================================================

export type ImpactSeverity = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'NEUTRAL';

export type FunctionalEffectType =
  | 'SYNONYMOUS'
  | 'CONSERVATIVE_MISSENSE'
  | 'RADICAL_MISSENSE'
  | 'NONSENSE_STOP_GAIN'
  | 'STOP_LOSS'
  | 'IN_FRAME_INDEL'
  | 'FRAMESHIFT_INDEL'
  | 'PROLINE_HELIX_DISRUPTOR'
  | 'CYSTEINE_DISULFIDE_DISRUPTOR'
  | 'CHARGE_INVERSION'
  | 'START_CODON_DISRUPTOR'
  | 'RESTRICTION_SITE_ALTERATION';

export interface MutationImpactDetail {
  mutationId: string;
  position: number;
  operation: 'substitution' | 'insertion' | 'deletion';
  originalResidue: string;
  modifiedResidue: string;
  severity: ImpactSeverity;
  effectType: FunctionalEffectType;
  title: string;
  summary: string;
  granthamScore?: number;
  blosum62Score?: number;
  chargeDelta?: number;
  hydropathyDelta?: number;
  structuralWarning?: string;
  codonDetail?: {
    codonPos: number;
    origCodon: string;
    modCodon: string;
    origAa: string;
    modAa: string;
  };
  restrictionSitesGained?: string[];
  restrictionSitesLost?: string[];
}

export interface ComparativeBiophysicalMetrics {
  originalLength: number;
  modifiedLength: number;
  lengthDelta: number;

  // Protein-specific deltas
  originalMwDa?: number;
  modifiedMwDa?: number;
  mwDeltaDa?: number;
  originalPi?: number;
  modifiedPi?: number;
  piDelta?: number;
  originalNetCharge?: number;
  modifiedNetCharge?: number;
  netChargeDelta?: number;
  originalGravy?: number;
  modifiedGravy?: number;
  gravyDelta?: number;

  // Nucleic-specific deltas
  originalGcPercent?: number;
  modifiedGcPercent?: number;
  gcPercentDelta?: number;
  originalAtPercent?: number;
  modifiedAtPercent?: number;
  atPercentDelta?: number;
  originalOrfCount?: number;
  modifiedOrfCount?: number;
  orfCountDelta?: number;
}

export interface EditedSequenceImpactReport {
  sequenceType: 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN';
  overallSeverity: ImpactSeverity;
  severityScore: number; // 0 to 100
  totalMutations: number;
  impactDetails: MutationImpactDetail[];
  biophysicalMetrics: ComparativeBiophysicalMetrics;
  keyFindings: string[];
  structuralAlerts: string[];
  evolutionaryCompatibility: 'High Tolerance' | 'Moderate Tolerance' | 'Significant Perturbation' | 'Severe Disruption';
  generatedAt: string;
}

// ============================================================================
// 3. HELPER COMPUTATION FUNCTIONS
// ============================================================================

export function getGranthamScore(orig: string, mod: string): number | undefined {
  const o = orig.toUpperCase();
  const m = mod.toUpperCase();
  if (GRANTHAM_DISTANCE[o] && GRANTHAM_DISTANCE[o][m] !== undefined) {
    return GRANTHAM_DISTANCE[o][m];
  }
  return undefined;
}

export function getBlosum62Score(orig: string, mod: string): number | undefined {
  const o = orig.toUpperCase();
  const m = mod.toUpperCase();
  if (BLOSUM62[o] && BLOSUM62[o][m] !== undefined) {
    return BLOSUM62[o][m];
  }
  return undefined;
}

/**
 * Scan for restriction enzyme sites in a nucleic sequence
 */
export function findRestrictionSites(sequence: string): Record<string, number[]> {
  const seq = sequence.toUpperCase();
  const hits: Record<string, number[]> = {};

  Object.entries(RESTRICTION_SITES).forEach(([enzyme, motif]) => {
    const positions: number[] = [];
    let idx = seq.indexOf(motif);
    while (idx !== -1) {
      positions.push(idx + 1); // 1-based
      idx = seq.indexOf(motif, idx + 1);
    }
    if (positions.length > 0) {
      hits[enzyme] = positions;
    }
  });

  return hits;
}

// ============================================================================
// 4. MAIN CHANGE IMPACT EVALUATION PIPELINE
// ============================================================================

export function evaluateSequenceChangeImpact(
  originalSeq: string,
  modifiedSeq: string,
  sequenceType: 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN',
  mutations: SequenceMutation[]
): EditedSequenceImpactReport {
  const impactDetails: MutationImpactDetail[] = [];
  const structuralAlerts: string[] = [];
  const keyFindings: string[] = [];

  let criticalCount = 0;
  let highCount = 0;
  let moderateCount = 0;

  // --------------------------------------------------------------------------
  // A. PROTEIN MUTATION EVALUATION
  // --------------------------------------------------------------------------
  if (sequenceType === 'PROTEIN') {
    const origProtein = analyzeProteinSequence(originalSeq);
    const modProtein = analyzeProteinSequence(modifiedSeq);

    mutations.forEach((mut) => {
      const orig = mut.original.toUpperCase();
      const mod = mut.modified.toUpperCase();
      const pos = mut.position;

      // 1. Single substitution
      if (mut.operation === 'substitution' && orig.length === 1 && mod.length === 1) {
        const grantham = getGranthamScore(orig, mod);
        const blosum = getBlosum62Score(orig, mod);
        const origClass = AA_CLASSES[orig];
        const modClass = AA_CLASSES[mod];

        let severity: ImpactSeverity = 'LOW';
        let effectType: FunctionalEffectType = 'CONSERVATIVE_MISSENSE';
        let title = `Substitution ${orig}${pos}${mod}`;
        let summary = `Replaced ${orig} with ${mod} at residue coordinate ${pos}.`;
        let warning: string | undefined = undefined;

        // Check nonsense / stop gain
        if (mod === '*' || mod === 'X') {
          severity = 'CRITICAL';
          effectType = 'NONSENSE_STOP_GAIN';
          title = `Premature Termination ${orig}${pos}* (Nonsense)`;
          summary = `Introduced premature STOP codon at residue ${pos}, truncating the protein by ${originalSeq.length - pos} amino acids.`;
          warning = `Major truncation: removes ${(((originalSeq.length - pos) / originalSeq.length) * 100).toFixed(1)}% of the downstream polypeptide chain.`;
          structuralAlerts.push(`Critical Stop-Gain: Truncation at position ${pos} (${orig} → *)`);
          criticalCount++;
        }
        // Check Cysteine disulfide disruption / creation
        else if (orig === 'C' && mod !== 'C') {
          severity = 'HIGH';
          effectType = 'CYSTEINE_DISULFIDE_DISRUPTOR';
          title = `Disulfide Bridge Loss Cys${pos}${mod}`;
          summary = `Eliminated native Cysteine at residue ${pos}. May permanently destabilize tertiary structure or multimerization.`;
          warning = `Potential disulfide crosslink ablation at Cys${pos}.`;
          structuralAlerts.push(`Cysteine Ablation: Loss of Cys${pos} may break disulfide crosslink stability.`);
          highCount++;
        } else if (orig !== 'C' && mod === 'C') {
          severity = 'MODERATE';
          effectType = 'CYSTEINE_DISULFIDE_DISRUPTOR';
          title = `De Novo Cysteine Gain ${orig}${pos}Cys`;
          summary = `Introduced unpaired Cysteine at position ${pos}. May induce aberrant non-native intermolecular disulfide bridging.`;
          warning = `Risk of oxidative misfolding or aberrant covalent aggregation.`;
          moderateCount++;
        }
        // Check Proline insertion / helix disruption
        else if (mod === 'P' && orig !== 'P') {
          severity = 'HIGH';
          effectType = 'PROLINE_HELIX_DISRUPTOR';
          title = `Rigid Proline Kink ${orig}${pos}Pro`;
          summary = `Introduced rigid pyrrolidine ring of Proline at position ${pos}. Severe steric clash in alpha-helical or beta-sheet domains.`;
          warning = `Known secondary structure breaker: Likely to disrupt local alpha-helices and beta-sheets.`;
          structuralAlerts.push(`Conformational Kink: Proline at pos ${pos} acts as a secondary structure breaker.`);
          highCount++;
        }
        // Check Charge Inversion (Acidic <-> Basic)
        else if (
          origClass &&
          modClass &&
          ((origClass.charge > 0 && modClass.charge < 0) || (origClass.charge < 0 && modClass.charge > 0))
        ) {
          severity = 'HIGH';
          effectType = 'CHARGE_INVERSION';
          title = `Charge Inversion ${orig}${pos}${mod} (${origClass.charge > 0 ? '+ to -' : '- to +'})`;
          summary = `Replaced ${origClass.category} residue with opposite charge ${modClass.category}. Strongly perturbs electrostatic salt bridges.`;
          warning = `Electrostatic inversion from ${origClass.charge > 0 ? '+1' : '-1'} to ${modClass.charge > 0 ? '+1' : '-1'} at position ${pos}.`;
          structuralAlerts.push(`Charge Inversion: ${orig}${pos}${mod} inverts local electrostatic potential.`);
          highCount++;
        }
        // General Grantham / BLOSUM score evaluation
        else if (grantham !== undefined) {
          if (grantham >= 100 || (blosum !== undefined && blosum <= -2)) {
            severity = 'HIGH';
            effectType = 'RADICAL_MISSENSE';
            title = `Radical Missense Mutation ${orig}${pos}${mod}`;
            summary = `High physicochemical divergence (Grantham: ${grantham}, BLOSUM62: ${blosum}). Switches residue from ${origClass?.hydropathy || 'native'} to ${modClass?.hydropathy || 'modified'}.`;
            highCount++;
          } else if (grantham >= 50 || (blosum !== undefined && blosum < 0)) {
            severity = 'MODERATE';
            effectType = 'CONSERVATIVE_MISSENSE';
            title = `Moderate Missense Mutation ${orig}${pos}${mod}`;
            summary = `Moderate chemical change (Grantham: ${grantham}, BLOSUM62: ${blosum}).`;
            moderateCount++;
          } else {
            severity = 'LOW';
            effectType = 'CONSERVATIVE_MISSENSE';
            title = `Conservative Substitution ${orig}${pos}${mod}`;
            summary = `Chemically conservative change with minimal biophysical perturbation (Grantham: ${grantham}, BLOSUM62: +${blosum || 0}).`;
          }
        }

        const chargeDelta = (modClass?.charge || 0) - (origClass?.charge || 0);

        impactDetails.push({
          mutationId: mut.id,
          position: pos,
          operation: 'substitution',
          originalResidue: orig,
          modifiedResidue: mod,
          severity,
          effectType,
          title,
          summary,
          granthamScore: grantham,
          blosum62Score: blosum,
          chargeDelta,
          structuralWarning: warning
        });
      }
      // 2. Insertions or Deletions in Protein
      else {
        const isFrameshift = false; // Protein indels maintain frame but alter spacing
        const lengthChange = mut.lengthChange;
        const severity: ImpactSeverity = Math.abs(lengthChange) > 3 ? 'HIGH' : 'MODERATE';
        const effectType: FunctionalEffectType = 'IN_FRAME_INDEL';
        const title =
          mut.operation === 'insertion'
            ? `Residue Insertion (+${lengthChange} aa at pos ${pos})`
            : `Residue Deletion (${lengthChange} aa at pos ${pos})`;
        const summary =
          mut.operation === 'insertion'
            ? `Inserted ${mut.modified} at coordinate ${pos}, shifting downstream residues by +${lengthChange}.`
            : `Deleted residues ${mut.original} at coordinates ${pos}-${pos + Math.abs(lengthChange) - 1}.`;

        if (Math.abs(lengthChange) > 3) {
          highCount++;
          structuralAlerts.push(`Indel Loop Shift: ${mut.operation} of ${Math.abs(lengthChange)} residues at pos ${pos}.`);
        } else {
          moderateCount++;
        }

        impactDetails.push({
          mutationId: mut.id,
          position: pos,
          operation: mut.operation,
          originalResidue: orig,
          modifiedResidue: mod,
          severity,
          effectType,
          title,
          summary
        });
      }
    });

    // Comparative Metrics
    const mwDelta = Number((modProtein.molecularWeightDa - origProtein.molecularWeightDa).toFixed(2));
    const piDelta = Number((modProtein.isoelectricPoint - origProtein.isoelectricPoint).toFixed(2));
    const netChargeDelta = Number((modProtein.netChargeAtPh7 - origProtein.netChargeAtPh7).toFixed(2));
    const gravyDelta = Number((modProtein.gravyScore - origProtein.gravyScore).toFixed(3));

    if (Math.abs(piDelta) >= 0.5) {
      keyFindings.push(`Significant Isoelectric Point (pI) shift: ${origProtein.isoelectricPoint.toFixed(2)} → ${modProtein.isoelectricPoint.toFixed(2)} (Δ ${piDelta > 0 ? '+' : ''}${piDelta}).`);
    }
    if (Math.abs(netChargeDelta) >= 1.0) {
      keyFindings.push(`Net Charge at pH 7.4 shifted by ${netChargeDelta > 0 ? '+' : ''}${netChargeDelta.toFixed(1)} e (${origProtein.netChargeAtPh7 > 0 ? '+' : ''}${origProtein.netChargeAtPh7.toFixed(1)} → ${modProtein.netChargeAtPh7 > 0 ? '+' : ''}${modProtein.netChargeAtPh7.toFixed(1)}).`);
    }
    if (Math.abs(gravyDelta) >= 0.2) {
      keyFindings.push(`Hydropathy Profile (GRAVY) shifted by ${gravyDelta > 0 ? '+' : ''}${gravyDelta} (${gravyDelta > 0 ? 'increased hydrophobicity' : 'increased polarity'}).`);
    }

    const biophysicalMetrics: ComparativeBiophysicalMetrics = {
      originalLength: origProtein.length,
      modifiedLength: modProtein.length,
      lengthDelta: modProtein.length - origProtein.length,
      originalMwDa: origProtein.molecularWeightDa,
      modifiedMwDa: modProtein.molecularWeightDa,
      mwDeltaDa: mwDelta,
      originalPi: origProtein.isoelectricPoint,
      modifiedPi: modProtein.isoelectricPoint,
      piDelta: piDelta,
      originalNetCharge: origProtein.netChargeAtPh7,
      modifiedNetCharge: modProtein.netChargeAtPh7,
      netChargeDelta: netChargeDelta,
      originalGravy: origProtein.gravyScore,
      modifiedGravy: modProtein.gravyScore,
      gravyDelta: gravyDelta
    };

    // Overall severity scoring
    let overallSeverity: ImpactSeverity = 'NEUTRAL';
    let severityScore = 0;
    if (criticalCount > 0) {
      overallSeverity = 'CRITICAL';
      severityScore = 95;
    } else if (highCount > 0) {
      overallSeverity = 'HIGH';
      severityScore = Math.min(85, 50 + highCount * 15);
    } else if (moderateCount > 0) {
      overallSeverity = 'MODERATE';
      severityScore = Math.min(50, 20 + moderateCount * 10);
    } else if (mutations.length > 0) {
      overallSeverity = 'LOW';
      severityScore = 15;
    }

    const evolutionaryCompatibility =
      overallSeverity === 'CRITICAL'
        ? 'Severe Disruption'
        : overallSeverity === 'HIGH'
        ? 'Significant Perturbation'
        : overallSeverity === 'MODERATE'
        ? 'Moderate Tolerance'
        : 'High Tolerance';

    return {
      sequenceType,
      overallSeverity,
      severityScore,
      totalMutations: mutations.length,
      impactDetails,
      biophysicalMetrics,
      keyFindings,
      structuralAlerts,
      evolutionaryCompatibility,
      generatedAt: new Date().toISOString()
    };
  }

  // --------------------------------------------------------------------------
  // B. NUCLEIC ACID (DNA / RNA) MUTATION EVALUATION
  // --------------------------------------------------------------------------
  const origNuc = computeNucleotideComposition(originalSeq, sequenceType);
  const modNuc = computeNucleotideComposition(modifiedSeq, sequenceType);
  const origOrf = analyzeGCAndORF(originalSeq, sequenceType);
  const modOrf = analyzeGCAndORF(modifiedSeq, sequenceType);

  // Check restriction sites
  const origRestriction = findRestrictionSites(originalSeq);
  const modRestriction = findRestrictionSites(modifiedSeq);

  const allEnzymes = Array.from(new Set([...Object.keys(origRestriction), ...Object.keys(modRestriction)]));
  const sitesGained: string[] = [];
  const sitesLost: string[] = [];

  allEnzymes.forEach((enz) => {
    const origCount = origRestriction[enz]?.length || 0;
    const modCount = modRestriction[enz]?.length || 0;
    if (modCount > origCount) {
      sitesGained.push(`${enz} (+${modCount - origCount} site${modCount - origCount > 1 ? 's' : ''})`);
    } else if (modCount < origCount) {
      sitesLost.push(`${enz} (-${origCount - modCount} site${origCount - modCount > 1 ? 's' : ''})`);
    }
  });

  if (sitesGained.length > 0) {
    keyFindings.push(`Restriction Site Gain: Created new cleavage motifs for ${sitesGained.join(', ')}.`);
  }
  if (sitesLost.length > 0) {
    keyFindings.push(`Restriction Site Loss: Destroyed recognition motifs for ${sitesLost.join(', ')}.`);
  }

  mutations.forEach((mut) => {
    const orig = mut.original.toUpperCase();
    const mod = mut.modified.toUpperCase();
    const pos = mut.position; // 1-based

    // 1. Single nucleotide substitution
    if (mut.operation === 'substitution' && orig.length === 1 && mod.length === 1) {
      // Find Triplet Codon context (in standard frame 1 for coding sequences)
      const codonIndex = Math.floor((pos - 1) / 3);
      const codonStart = codonIndex * 3;
      const codonOffset = (pos - 1) % 3;

      let origCodon = originalSeq.substring(codonStart, codonStart + 3).toUpperCase().replace(/U/g, 'T');
      let modCodon = origCodon.split('');
      if (modCodon.length === 3) {
        modCodon[codonOffset] = mod.replace(/U/g, 'T');
      }
      const modCodonStr = modCodon.join('');

      let origAa = origCodon.length === 3 ? CODON_TABLE[origCodon] || 'X' : '?';
      let modAa = modCodonStr.length === 3 ? CODON_TABLE[modCodonStr] || 'X' : '?';

      let severity: ImpactSeverity = 'LOW';
      let effectType: FunctionalEffectType = 'SYNONYMOUS';
      let title = `Substitution ${orig}${pos}${mod}`;
      let summary = `Replaced nucleotide ${orig} with ${mod} at position ${pos}.`;
      let warning: string | undefined = undefined;

      // Start Codon Disruption (ATG -> other or other -> ATG)
      if (origCodon === 'ATG' && modCodonStr !== 'ATG') {
        severity = 'HIGH';
        effectType = 'START_CODON_DISRUPTOR';
        title = `Start Codon Disruption (ATG${pos} → ${modCodonStr})`;
        summary = `Ablated canonical Methionine / Start initiation codon ATG at position ${codonStart + 1}. Translation initiation may fail.`;
        warning = `Critical translation initiation site disrupted.`;
        structuralAlerts.push(`Start Codon Disruption at pos ${codonStart + 1}`);
        highCount++;
      } else if (origCodon !== 'ATG' && modCodonStr === 'ATG') {
        severity = 'MODERATE';
        title = `De Novo Start Codon (Gain of ATG at pos ${codonStart + 1})`;
        summary = `Generated new potential internal AUG / ATG translation initiation start site.`;
        moderateCount++;
      }
      // Nonsense / Stop gain
      else if (origAa !== '*' && modAa === '*') {
        severity = 'CRITICAL';
        effectType = 'NONSENSE_STOP_GAIN';
        title = `Nonsense Mutation (${origCodon} → ${modCodonStr}, ${origAa} → Stop)`;
        summary = `Introduced premature STOP codon at codon ${codonIndex + 1} (pos ${pos}), truncating coding potential.`;
        warning = `Premature stop codon terminates translation frame.`;
        structuralAlerts.push(`Nonsense Stop-Gain at codon ${codonIndex + 1} (${origAa} → *)`);
        criticalCount++;
      }
      // Stop Loss
      else if (origAa === '*' && modAa !== '*') {
        severity = 'HIGH';
        effectType = 'STOP_LOSS';
        title = `Stop-Loss Mutation (${origCodon} → ${modCodonStr}, Stop → ${modAa})`;
        summary = `Destroyed native translation stop signal, causing downstream read-through elongation.`;
        warning = `Continuous translation read-through past native C-terminus.`;
        structuralAlerts.push(`Stop-Loss Mutation at codon ${codonIndex + 1}`);
        highCount++;
      }
      // Synonymous (Silent)
      else if (origAa === modAa && origAa !== '?' && origAa !== 'X') {
        severity = 'NEUTRAL';
        effectType = 'SYNONYMOUS';
        title = `Synonymous (Silent) Mutation (${origCodon} → ${modCodonStr}, ${origAa} = ${modAa})`;
        summary = `Silent nucleotide substitution. Amino acid translation remains unchanged (${origAa}). May modulate codon usage bias.`;
      }
      // Missense (Non-synonymous)
      else {
        const grantham = getGranthamScore(origAa, modAa);
        if (grantham !== undefined && grantham >= 100) {
          severity = 'HIGH';
          effectType = 'RADICAL_MISSENSE';
          title = `Radical Missense (${origCodon} → ${modCodonStr}, ${origAa} → ${modAa})`;
          summary = `Non-synonymous substitution resulting in radical amino acid exchange ${origAa} → ${modAa} (Grantham distance: ${grantham}).`;
          highCount++;
        } else {
          severity = 'MODERATE';
          effectType = 'CONSERVATIVE_MISSENSE';
          title = `Missense Mutation (${origCodon} → ${modCodonStr}, ${origAa} → ${modAa})`;
          summary = `Non-synonymous substitution resulting in amino acid exchange ${origAa} → ${modAa}.`;
          moderateCount++;
        }
      }

      impactDetails.push({
        mutationId: mut.id,
        position: pos,
        operation: 'substitution',
        originalResidue: orig,
        modifiedResidue: mod,
        severity,
        effectType,
        title,
        summary,
        structuralWarning: warning,
        codonDetail: {
          codonPos: codonIndex + 1,
          origCodon,
          modCodon: modCodonStr,
          origAa,
          modAa
        }
      });
    }
    // 2. Indels (Frameshift vs In-frame)
    else {
      const lengthChange = Math.abs(mut.lengthChange);
      const isFrameshift = lengthChange % 3 !== 0;

      let severity: ImpactSeverity = isFrameshift ? 'CRITICAL' : 'MODERATE';
      let effectType: FunctionalEffectType = isFrameshift ? 'FRAMESHIFT_INDEL' : 'IN_FRAME_INDEL';
      let title = isFrameshift
        ? `Frameshift Indel (${mut.lengthChange > 0 ? `+${lengthChange}` : `-${lengthChange}`} nt at pos ${pos})`
        : `In-Frame Indel (${mut.lengthChange > 0 ? `+${lengthChange}` : `-${lengthChange}`} nt at pos ${pos})`;

      let summary = isFrameshift
        ? `Indel length (${lengthChange} nt) is not divisible by 3. Completely scrambles all downstream translation reading frames and typically generates premature stop codons.`
        : `Indel length (${lengthChange} nt) is an exact codon multiple (+${lengthChange / 3} codons). Preserves downstream reading frame.`;

      let warning = isFrameshift ? `Catastrophic downstream frameshift alterating entire C-terminal protein sequence.` : undefined;

      if (isFrameshift) {
        criticalCount++;
        structuralAlerts.push(`Critical Frameshift at pos ${pos} (${mut.lengthChange > 0 ? '+' : ''}${mut.lengthChange} nt) alters entire downstream frame.`);
      } else {
        moderateCount++;
      }

      impactDetails.push({
        mutationId: mut.id,
        position: pos,
        operation: mut.operation,
        originalResidue: orig,
        modifiedResidue: mod,
        severity,
        effectType,
        title,
        summary,
        structuralWarning: warning
      });
    }
  });

  const gcDelta = Number((modNuc.gcPercentage - origNuc.gcPercentage).toFixed(2));
  const atDelta = Number(((modNuc.atPercentage || modNuc.auPercentage || 0) - (origNuc.atPercentage || origNuc.auPercentage || 0)).toFixed(2));
  const orfDelta = (modOrf.orfs?.length || 0) - (origOrf.orfs?.length || 0);

  if (Math.abs(gcDelta) >= 1.0) {
    keyFindings.push(`GC Content shifted by ${gcDelta > 0 ? '+' : ''}${gcDelta}% (${origNuc.gcPercentage}% → ${modNuc.gcPercentage}%).`);
  }
  if (orfDelta !== 0) {
    keyFindings.push(`Open Reading Frames (ORFs) altered by ${orfDelta > 0 ? '+' : ''}${orfDelta} frame${Math.abs(orfDelta) > 1 ? 's' : ''} (${origOrf.orfs?.length || 0} → ${modOrf.orfs?.length || 0}).`);
  }

  const biophysicalMetrics: ComparativeBiophysicalMetrics = {
    originalLength: originalSeq.length,
    modifiedLength: modifiedSeq.length,
    lengthDelta: modifiedSeq.length - originalSeq.length,
    originalGcPercent: origNuc.gcPercentage,
    modifiedGcPercent: modNuc.gcPercentage,
    gcPercentDelta: gcDelta,
    originalAtPercent: origNuc.atPercentage || origNuc.auPercentage || 0,
    modifiedAtPercent: modNuc.atPercentage || modNuc.auPercentage || 0,
    atPercentDelta: atDelta,
    originalOrfCount: origOrf.orfs?.length || 0,
    modifiedOrfCount: modOrf.orfs?.length || 0,
    orfCountDelta: orfDelta
  };

  let overallSeverity: ImpactSeverity = 'NEUTRAL';
  let severityScore = 0;
  if (criticalCount > 0) {
    overallSeverity = 'CRITICAL';
    severityScore = 95;
  } else if (highCount > 0) {
    overallSeverity = 'HIGH';
    severityScore = Math.min(85, 50 + highCount * 15);
  } else if (moderateCount > 0) {
    overallSeverity = 'MODERATE';
    severityScore = Math.min(50, 20 + moderateCount * 10);
  } else if (mutations.length > 0) {
    overallSeverity = 'LOW';
    severityScore = 15;
  }

  const evolutionaryCompatibility =
    overallSeverity === 'CRITICAL'
      ? 'Severe Disruption'
      : overallSeverity === 'HIGH'
      ? 'Significant Perturbation'
      : overallSeverity === 'MODERATE'
      ? 'Moderate Tolerance'
      : 'High Tolerance';

  return {
    sequenceType,
    overallSeverity,
    severityScore,
    totalMutations: mutations.length,
    impactDetails,
    biophysicalMetrics,
    keyFindings,
    structuralAlerts,
    evolutionaryCompatibility,
    generatedAt: new Date().toISOString()
  };
}
