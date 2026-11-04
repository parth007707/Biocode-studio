import {
  SequenceMutation,
  MutationSummary,
  AnalysisVersionRecord
} from './types';
import { analyzeCompleteSequenceChunked } from '../chunkStreamingAnalysis';
import { GCAndORFAnalysisResult } from '../types';
import { RNASecondaryStructureResult, predictRNASecondaryStructure } from '../rnaAnalysis';
import { AminoAcidComposition, analyzeProteinSequence } from '../proteinAnalysis';
import { formatNumber } from '../../utils/formatters';

// ============================================================================
// 1. COMPARATIVE METRIC TYPES
// ============================================================================

export interface MetricComparisonItem {
  id: string;
  category: 'primary' | 'composition' | 'structure' | 'physicochemical';
  name: string;
  unit: string;
  originalValue: string | number;
  modifiedValue: string | number;
  differenceText: string;
  numericDifference?: number;
  percentChange?: number;
  significance: 'neutral' | 'increased' | 'decreased' | 'critical';
  description?: string;
}

export type StructureResolutionStrategy =
  | 'EXPERIMENTALLY_DETERMINED'
  | 'LIGHTWEIGHT_LOD_REPRESENTATION'
  | 'LARGE_GENOMIC_FEATURE_MAP'
  | 'NO_VALIDATED_3D_STRUCTURE';

export interface StructureResolutionInfo {
  strategy: StructureResolutionStrategy;
  title: string;
  description: string;
  isExperimental: boolean;
  isApproximation: boolean;
  approximationLabel?: string;
  warningNote?: string;
  recommendedViewMode: '3d_lod' | 'genomic_map' | 'secondary_structure' | 'unavailable';
  viewportWindowSize: number;
}

export interface MutationStructuralMapping {
  mutationId: string;
  position: number; // 1-based start
  endPosition?: number;
  operation: 'substitution' | 'insertion' | 'deletion';
  originalResidue: string;
  modifiedResidue: string;
  label: string; // e.g. "G120A" or "Ins 50..52: ACG" or "Del 45..48"
  isMapped: boolean;
  mappedFeatureName?: string; // e.g. "ORF-1 Locus", "Stem-Loop 1", "Window 1 (1..120)"
  mappedFeatureRange?: string; // e.g. "bp 266..21555"
  structuralContext?: string; // e.g. "Alpha Helix Region", "Surface Loop", "Coding ORF"
  unmappedReason?: string;
}

export interface ComparativeAnalysisReport {
  sequenceType: 'DNA' | 'RNA' | 'PROTEIN';
  pipeline: string;
  originalLength: number;
  modifiedLength: number;
  lengthDelta: number;
  isModified: boolean;
  unitLabel: string;
  originalAnalysis: {
    dnaAnalysis?: GCAndORFAnalysisResult | null;
    rnaAnalysis?: RNASecondaryStructureResult | null;
    proteinAnalysis?: AminoAcidComposition | null;
    summary: string;
  };
  modifiedAnalysis: {
    dnaAnalysis?: GCAndORFAnalysisResult | null;
    rnaAnalysis?: RNASecondaryStructureResult | null;
    proteinAnalysis?: AminoAcidComposition | null;
    summary: string;
  };
  metrics: MetricComparisonItem[];
  structureResolution: StructureResolutionInfo;
  structuralMappings: MutationStructuralMapping[];
  versionMetadata: {
    version1: {
      versionNumber: number;
      label: string;
      sequenceLength: number;
      sequence?: string;
      createdAt?: string;
    };
    version2: {
      versionNumber: number;
      label: string;
      sequenceLength: number;
      sequence?: string;
      mutationCount: number;
      parentAnalysisId?: string | null;
      status: string;
      createdAt: string;
    };
  };
}

// ============================================================================
// 2. STRUCTURE RESOLUTION STRATEGY RESOLVER
// ============================================================================

export function resolveStructureStrategy(
  sequence: string,
  sequenceType: 'DNA' | 'RNA' | 'PROTEIN',
  metadata?: any
): StructureResolutionInfo {
  const len = sequence.length;

  // A. Check for known experimental structure (e.g. PDB ID in metadata)
  if (metadata?.pdbId || metadata?.experimentalStructureUrl) {
    return {
      strategy: 'EXPERIMENTALLY_DETERMINED',
      title: 'Experimentally Validated 3D Structure',
      description: `Validated structural model available from PDB reference (${metadata.pdbId || 'Experimental Coordinate Record'}).`,
      isExperimental: true,
      isApproximation: false,
      recommendedViewMode: '3d_lod',
      viewportWindowSize: Math.min(len, 200)
    };
  }

  // C. Very Large Sequence Protection (> 1500 residues/bp) - e.g. SARS-CoV-2 (29,903 bp)
  if (len > 1500) {
    return {
      strategy: 'LARGE_GENOMIC_FEATURE_MAP',
      title: 'Lightweight Genomic Feature & Adaptive 3D Region Representation',
      description:
        'Large biological sequence (>1.5 kb). A full complete atomic 3D model in the browser is prohibited for performance protection. Lightweight ORF/CDS regional mapping and adaptive level-of-detail (LOD) 3D windowing are rendered with marked mutation loci.',
      isExperimental: false,
      isApproximation: true,
      approximationLabel: 'Approximation: Lightweight Genomic LOD Viewport',
      warningNote: 'Approximation only: Atomic full-genome 3D folding is not experimentally resolved in browser runtime.',
      recommendedViewMode: 'genomic_map',
      viewportWindowSize: 120
    };
  }

  // B. Moderate sequence with lightweight 3D/secondary representation
  if (len >= 4 && len <= 1500) {
    return {
      strategy: 'LIGHTWEIGHT_LOD_REPRESENTATION',
      title: 'Lightweight Structural Model & Secondary Geometry',
      description:
        sequenceType === 'PROTEIN'
          ? 'Calculated secondary structure profile (Chou-Fasman / hydropathy backbone representation) with adaptive 3D rendering.'
          : sequenceType === 'RNA'
          ? 'Predicted base-pairing secondary structure (Nussinov-Jacobson RNA folding approximation).'
          : 'Standard B-DNA double-helix spatial representation with base-pair hydrogen bonding.',
      isExperimental: false,
      isApproximation: true,
      approximationLabel: 'Approximation: Algorithmic Secondary Representation',
      recommendedViewMode: '3d_lod',
      viewportWindowSize: Math.min(len, 120)
    };
  }

  // D. Too short or unrecognized
  return {
    strategy: 'NO_VALIDATED_3D_STRUCTURE',
    title: 'No Validated 3D Structure Available',
    description: 'No validated 3D structure is currently available for this complete sequence.',
    isExperimental: false,
    isApproximation: false,
    warningNote: 'No validated 3D structure is currently available for this complete sequence.',
    recommendedViewMode: 'unavailable',
    viewportWindowSize: 0
  };
}

// ============================================================================
// 3. MUTATION TO STRUCTURE / LOCUS MAPPING
// ============================================================================

export function mapMutationsToStructuralLoci(
  mutations: SequenceMutation[],
  dnaAnalysis?: GCAndORFAnalysisResult | null,
  rnaAnalysis?: RNASecondaryStructureResult | null,
  proteinAnalysis?: AminoAcidComposition | null,
  sequenceType: 'DNA' | 'RNA' | 'PROTEIN' = 'DNA'
): MutationStructuralMapping[] {
  return mutations.map((mut) => {
    const pos = mut.position;
    const endPos = mut.endPosition || pos;

    // Generate concise biological label (e.g. G120A, Del 45..48, Ins 100: CCG)
    let label = '';
    if (mut.operation === 'substitution') {
      label = `${mut.original}${pos}${mut.modified}`;
    } else if (mut.operation === 'deletion') {
      label = `Del ${pos}${endPos !== pos ? `..${endPos}` : ''} (${mut.original})`;
    } else {
      label = `Ins ${pos}: ${mut.modified}`;
    }

    // Check if mutation falls inside an ORF (for DNA)
    let isMapped = false;
    let mappedFeatureName: string | undefined;
    let mappedFeatureRange: string | undefined;
    let structuralContext: string | undefined;
    let unmappedReason: string | undefined;

    if (sequenceType === 'DNA' || sequenceType === 'RNA') {
      if (dnaAnalysis?.orfs && dnaAnalysis.orfs.length > 0) {
        const containingOrf = dnaAnalysis.orfs.find((orf) => pos >= orf.start && pos <= orf.end);
        if (containingOrf) {
          isMapped = true;
          mappedFeatureName = `ORF Locus (Frame ${containingOrf.frame > 0 ? `+${containingOrf.frame}` : containingOrf.frame})`;
          const orfLen = containingOrf.lengthBp ?? (containingOrf as any).length ?? 0;
          mappedFeatureRange = `bp ${formatNumber(containingOrf.start || 0)}..${formatNumber(containingOrf.end || 0)} (${formatNumber(orfLen)} bp)`;
          structuralContext = `Coding Region (Codon ${formatNumber(Math.floor((pos - containingOrf.start) / 3) + 1)})`;
        }
      }

      // Check RNA secondary structure stems or hairpins if available
      if (!isMapped && rnaAnalysis) {
        if (rnaAnalysis.stems && rnaAnalysis.stems.length > 0) {
          const stem = rnaAnalysis.stems.find((st) => (pos >= st.start5 && pos <= st.end5) || (pos >= st.start3 && pos <= st.end3));
          if (stem) {
            isMapped = true;
            mappedFeatureName = `RNA Stem Feature (${stem.length} bp)`;
            mappedFeatureRange = `nt ${stem.start5}..${stem.end5} & ${stem.start3}..${stem.end3}`;
            structuralContext = `Base-paired helical stem`;
          }
        }
        if (!isMapped && rnaAnalysis.hairpins && rnaAnalysis.hairpins.length > 0) {
          const hp = rnaAnalysis.hairpins.find((h) => pos >= h.loopStart && pos <= h.loopEnd);
          if (hp) {
            isMapped = true;
            mappedFeatureName = `RNA Hairpin Loop`;
            mappedFeatureRange = `nt ${hp.loopStart}..${hp.loopEnd}`;
            structuralContext = `Single-stranded apical hairpin loop`;
          }
        }
      }

      // Check if position is within valid sequence bounds
      if (!isMapped && pos > 0) {
        isMapped = true;
        const windowIdx = Math.floor((pos - 1) / 120);
        const winStart = windowIdx * 120 + 1;
        const winEnd = (windowIdx + 1) * 120;
        mappedFeatureName = `Adaptive LOD Region`;
        mappedFeatureRange = `bp ${winStart}..${winEnd}`;
        structuralContext = `Intergenic / Non-coding Genomic Backbone`;
      }
    } else if (sequenceType === 'PROTEIN') {
      if (pos > 0) {
        isMapped = true;
        // Simple secondary structure context estimation
        const residue = mut.original.toUpperCase();
        let secondary = 'Coil / Loop';
        if (['A', 'L', 'M', 'K', 'E'].includes(residue)) secondary = 'Alpha Helix Propensity';
        else if (['V', 'I', 'Y', 'F', 'W', 'T'].includes(residue)) secondary = 'Beta Sheet Propensity';
        else if (['P', 'G'].includes(residue)) secondary = 'Turn / Flexible Kink';

        mappedFeatureName = `Residue ${pos}`;
        mappedFeatureRange = `aa ${pos}`;
        structuralContext = `${secondary} (${residue})`;
      }
    }

    if (!isMapped) {
      unmappedReason = 'Structural mapping unavailable for this sequence position.';
    }

    return {
      mutationId: mut.id,
      position: pos,
      endPosition: mut.endPosition,
      operation: mut.operation,
      originalResidue: mut.original,
      modifiedResidue: mut.modified,
      label,
      isMapped,
      mappedFeatureName,
      mappedFeatureRange,
      structuralContext,
      unmappedReason
    };
  });
}

// ============================================================================
// 4. FULL COMPARATIVE ANALYSIS GENERATOR
// ============================================================================

export function generateComparativeAnalysisReport(params: {
  originalSequence: string;
  modifiedSequence: string;
  sequenceType: 'DNA' | 'RNA' | 'PROTEIN';
  pipeline: string;
  mutations: SequenceMutation[];
  sourceMetadata?: any;
  parentAnalysisId?: string | null;
  versionNumber?: number;
  originalResults?: any;
  modifiedResults?: any;
}): ComparativeAnalysisReport {
  const {
    originalSequence,
    modifiedSequence,
    sequenceType,
    pipeline,
    mutations,
    sourceMetadata,
    parentAnalysisId,
    versionNumber = 2,
    originalResults,
    modifiedResults
  } = params;

  const unitLabel = sequenceType === 'PROTEIN' ? 'aa' : sequenceType === 'RNA' ? 'nt' : 'bp';
  const origLen = originalSequence.length;
  const modLen = modifiedSequence.length;
  const lengthDelta = modLen - origLen;

  // Run chunked analysis for both if not passed
  let origDna = originalResults?.dnaAnalysis;
  let origRna = originalResults?.rnaAnalysis;
  let origProt = originalResults?.proteinAnalysis;

  if (!origDna && !origRna && !origProt) {
    if (origLen > 25000) {
      const sampleSeq = originalSequence.slice(0, 10000);
      const res = analyzeCompleteSequenceChunked(sampleSeq, sequenceType);
      origDna = res.dnaAnalysis || null;
      origRna = res.rnaAnalysis || null;
      origProt = res.proteinAnalysis || null;
    } else {
      const res = analyzeCompleteSequenceChunked(originalSequence, sequenceType);
      origDna = res.dnaAnalysis || null;
      origRna = res.rnaAnalysis || (sequenceType === 'RNA' ? predictRNASecondaryStructure(originalSequence.slice(0, 120)) : null);
      origProt = res.proteinAnalysis || (sequenceType === 'PROTEIN' ? analyzeProteinSequence(originalSequence) : null);
    }
  }

  let modDna = modifiedResults?.dnaAnalysis;
  let modRna = modifiedResults?.rnaAnalysis;
  let modProt = modifiedResults?.proteinAnalysis;

  if (!modDna && !modRna && !modProt) {
    if (modLen > 25000) {
      const sampleSeq = modifiedSequence.slice(0, 10000);
      const res = analyzeCompleteSequenceChunked(sampleSeq, sequenceType);
      modDna = res.dnaAnalysis || null;
      modRna = res.rnaAnalysis || null;
      modProt = res.proteinAnalysis || null;
    } else {
      const res = analyzeCompleteSequenceChunked(modifiedSequence, sequenceType);
      modDna = res.dnaAnalysis || null;
      modRna = res.rnaAnalysis || (sequenceType === 'RNA' ? predictRNASecondaryStructure(modifiedSequence.slice(0, 120)) : null);
      modProt = res.proteinAnalysis || (sequenceType === 'PROTEIN' ? analyzeProteinSequence(modifiedSequence) : null);
    }
  }

  // Build comparative metrics list
  const metrics: MetricComparisonItem[] = [];

  // Metric 1: Sequence Length
  const lengthDiffText = lengthDelta === 0 ? '0 (No change)' : `${lengthDelta > 0 ? '+' : ''}${formatNumber(lengthDelta)} ${unitLabel}`;
  metrics.push({
    id: 'seq_length',
    category: 'primary',
    name: 'Sequence Length',
    unit: unitLabel,
    originalValue: `${formatNumber(origLen)} ${unitLabel}`,
    modifiedValue: `${formatNumber(modLen)} ${unitLabel}`,
    differenceText: lengthDiffText,
    numericDifference: lengthDelta,
    percentChange: origLen > 0 ? Number(((lengthDelta / origLen) * 100).toFixed(3)) : 0,
    significance: lengthDelta !== 0 ? (Math.abs(lengthDelta) > 10 ? 'critical' : 'increased') : 'neutral',
    description: 'Total nucleotide or amino acid residue count across the full biological record.'
  });

  if (sequenceType === 'DNA' || sequenceType === 'RNA') {
    const origComp = origDna?.composition;
    const modComp = modDna?.composition;

    // Metric: GC Content
    if (origComp && modComp) {
      const gcDiff = Number((modComp.gcPercentage - origComp.gcPercentage).toFixed(2));
      metrics.push({
        id: 'gc_content',
        category: 'composition',
        name: 'GC Content',
        unit: '%',
        originalValue: `${origComp.gcPercentage.toFixed(2)}%`,
        modifiedValue: `${modComp.gcPercentage.toFixed(2)}%`,
        differenceText: `${gcDiff > 0 ? '+' : ''}${gcDiff.toFixed(2)}%`,
        numericDifference: gcDiff,
        significance: Math.abs(gcDiff) >= 1.0 ? 'critical' : Math.abs(gcDiff) > 0 ? 'increased' : 'neutral',
        description: 'Percentage of Guanine and Cytosine bases affecting thermal stability and melting temperature (Tm).'
      });

      // Metric: AT / AU Content
      const origAt = origComp.atPercentage || (100 - origComp.gcPercentage);
      const modAt = modComp.atPercentage || (100 - modComp.gcPercentage);
      const atDiff = Number((modAt - origAt).toFixed(2));
      metrics.push({
        id: 'at_content',
        category: 'composition',
        name: sequenceType === 'RNA' ? 'AU Content' : 'AT Content',
        unit: '%',
        originalValue: `${origAt.toFixed(2)}%`,
        modifiedValue: `${modAt.toFixed(2)}%`,
        differenceText: `${atDiff > 0 ? '+' : ''}${atDiff.toFixed(2)}%`,
        numericDifference: atDiff,
        significance: Math.abs(atDiff) >= 1.0 ? 'critical' : Math.abs(atDiff) > 0 ? 'increased' : 'neutral',
        description: 'Percentage of Adenine and Thymine/Uracil bases in the sequence.'
      });

      // Safe helper to extract nucleotide base count from composition object or composition.counts
      const getBaseCount = (comp: any, keys: string[]): number => {
        if (!comp) return 0;
        for (const k of keys) {
          if (typeof comp[k] === 'number') return comp[k];
          if (comp.counts && typeof comp.counts[k] === 'number') return comp.counts[k];
          if (comp.counts && typeof comp.counts[k.toUpperCase()] === 'number') return comp.counts[k.toUpperCase()];
        }
        return 0;
      };

      // Metric: Adenine count
      const origA = getBaseCount(origComp, ['a', 'A']);
      const modA = getBaseCount(modComp, ['a', 'A']);
      const aDiff = modA - origA;
      metrics.push({
        id: 'nuc_a',
        category: 'composition',
        name: 'Adenine (A) Count',
        unit: 'bases',
        originalValue: `${formatNumber(origA)} (${origLen > 0 ? ((origA / origLen) * 100).toFixed(2) : '0.00'}%)`,
        modifiedValue: `${formatNumber(modA)} (${modLen > 0 ? ((modA / modLen) * 100).toFixed(2) : '0.00'}%)`,
        differenceText: `${aDiff > 0 ? '+' : ''}${formatNumber(aDiff)} bases`,
        numericDifference: aDiff,
        significance: aDiff !== 0 ? 'increased' : 'neutral'
      });

      // Metric: Thymine / Uracil count
      const tLabel = sequenceType === 'RNA' ? 'Uracil (U)' : 'Thymine (T)';
      const tOrig = getBaseCount(origComp, sequenceType === 'RNA' ? ['u', 'U', 't', 'T'] : ['t', 'T']);
      const tMod = getBaseCount(modComp, sequenceType === 'RNA' ? ['u', 'U', 't', 'T'] : ['t', 'T']);
      const tDiff = tMod - tOrig;
      metrics.push({
        id: 'nuc_t',
        category: 'composition',
        name: `${tLabel} Count`,
        unit: 'bases',
        originalValue: `${formatNumber(tOrig)} (${origLen > 0 ? ((tOrig / origLen) * 100).toFixed(2) : '0.00'}%)`,
        modifiedValue: `${formatNumber(tMod)} (${modLen > 0 ? ((tMod / modLen) * 100).toFixed(2) : '0.00'}%)`,
        differenceText: `${tDiff > 0 ? '+' : ''}${formatNumber(tDiff)} bases`,
        numericDifference: tDiff,
        significance: tDiff !== 0 ? 'increased' : 'neutral'
      });

      // Metric: Guanine count
      const origG = getBaseCount(origComp, ['g', 'G']);
      const modG = getBaseCount(modComp, ['g', 'G']);
      const gDiff = modG - origG;
      metrics.push({
        id: 'nuc_g',
        category: 'composition',
        name: 'Guanine (G) Count',
        unit: 'bases',
        originalValue: `${formatNumber(origG)} (${origLen > 0 ? ((origG / origLen) * 100).toFixed(2) : '0.00'}%)`,
        modifiedValue: `${formatNumber(modG)} (${modLen > 0 ? ((modG / modLen) * 100).toFixed(2) : '0.00'}%)`,
        differenceText: `${gDiff > 0 ? '+' : ''}${formatNumber(gDiff)} bases`,
        numericDifference: gDiff,
        significance: gDiff !== 0 ? 'increased' : 'neutral'
      });

      // Metric: Cytosine count
      const origC = getBaseCount(origComp, ['c', 'C']);
      const modC = getBaseCount(modComp, ['c', 'C']);
      const cDiff = modC - origC;
      metrics.push({
        id: 'nuc_c',
        category: 'composition',
        name: 'Cytosine (C) Count',
        unit: 'bases',
        originalValue: `${formatNumber(origC)} (${origLen > 0 ? ((origC / origLen) * 100).toFixed(2) : '0.00'}%)`,
        modifiedValue: `${formatNumber(modC)} (${modLen > 0 ? ((modC / modLen) * 100).toFixed(2) : '0.00'}%)`,
        differenceText: `${cDiff > 0 ? '+' : ''}${formatNumber(cDiff)} bases`,
        numericDifference: cDiff,
        significance: cDiff !== 0 ? 'increased' : 'neutral'
      });

      // Metric: Purines vs Pyrimidines
      const origPurines = origA + origG;
      const modPurines = modA + modG;
      const purineDiff = modPurines - origPurines;
      metrics.push({
        id: 'purines',
        category: 'composition',
        name: 'Purines (A+G)',
        unit: 'bases',
        originalValue: `${formatNumber(origPurines)} (${origLen > 0 ? ((origPurines / origLen) * 100).toFixed(2) : '0.00'}%)`,
        modifiedValue: `${formatNumber(modPurines)} (${modLen > 0 ? ((modPurines / modLen) * 100).toFixed(2) : '0.00'}%)`,
        differenceText: `${purineDiff > 0 ? '+' : ''}${formatNumber(purineDiff)} bases`,
        numericDifference: purineDiff,
        significance: purineDiff !== 0 ? 'increased' : 'neutral'
      });
    }

    // Metric: ORF Count
    const origOrfCount = origDna?.orfs?.length || 0;
    const modOrfCount = modDna?.orfs?.length || 0;
    const orfCountDiff = modOrfCount - origOrfCount;
    metrics.push({
      id: 'orf_count',
      category: 'structure',
      name: 'Open Reading Frames (ORFs)',
      unit: 'frames',
      originalValue: `${origOrfCount} identified`,
      modifiedValue: `${modOrfCount} identified`,
      differenceText: `${orfCountDiff > 0 ? '+' : ''}${orfCountDiff} ORF${Math.abs(orfCountDiff) === 1 ? '' : 's'}`,
      numericDifference: orfCountDiff,
      significance: orfCountDiff !== 0 ? 'critical' : 'neutral',
      description: 'Potential protein-coding reading frames initiated by standard start codons and terminated by in-frame stop codons.'
    });

    // Metric: Longest ORF
    const origLongest = origDna?.longestOrf;
    const modLongest = modDna?.longestOrf;
    if (origLongest || modLongest) {
      const origOrfLen = origLongest?.lengthBp ?? (origLongest as any)?.length ?? 0;
      const modOrfLen = modLongest?.lengthBp ?? (modLongest as any)?.length ?? 0;
      const orfLenDiff = modOrfLen - origOrfLen;
      metrics.push({
        id: 'longest_orf',
        category: 'structure',
        name: 'Longest Coding Frame',
        unit: 'bp',
        originalValue: origLongest ? `${formatNumber(origOrfLen)} bp (Frame ${origLongest.frame > 0 ? `+${origLongest.frame}` : origLongest.frame})` : 'None',
        modifiedValue: modLongest ? `${formatNumber(modOrfLen)} bp (Frame ${modLongest.frame > 0 ? `+${modLongest.frame}` : modLongest.frame})` : 'None',
        differenceText: `${orfLenDiff > 0 ? '+' : ''}${formatNumber(orfLenDiff)} bp`,
        numericDifference: orfLenDiff,
        significance: orfLenDiff !== 0 ? 'critical' : 'neutral',
        description: 'Primary candidate translated protein product from longest continuous reading frame.'
      });
    }

    // Metric: Molecular Weight estimate for DNA/RNA
    const avgBaseMw = sequenceType === 'RNA' ? 340.5 : 330.0;
    const origMwKda = Number(((origLen * avgBaseMw) / 1000).toFixed(2));
    const modMwKda = Number(((modLen * avgBaseMw) / 1000).toFixed(2));
    const mwDiff = Number((modMwKda - origMwKda).toFixed(2));
    metrics.push({
      id: 'nuc_mw',
      category: 'physicochemical',
      name: 'Estimated Molecular Weight',
      unit: 'kDa',
      originalValue: `${formatNumber(origMwKda)} kDa`,
      modifiedValue: `${formatNumber(modMwKda)} kDa`,
      differenceText: `${mwDiff > 0 ? '+' : ''}${mwDiff.toFixed(2)} kDa`,
      numericDifference: mwDiff,
      significance: mwDiff !== 0 ? 'increased' : 'neutral',
      description: 'Theoretical molecular weight based on average nucleotide monophosphate mass.'
    });
  } else if (sequenceType === 'PROTEIN') {
    // Protein metrics
    if (origProt && modProt) {
      // Molecular Weight
      const origMw = origProt.molecularWeight || 0;
      const modMw = modProt.molecularWeight || 0;
      const mwDiff = Number((modMw - origMw).toFixed(2));
      metrics.push({
        id: 'prot_mw',
        category: 'physicochemical',
        name: 'Molecular Weight',
        unit: 'Da',
        originalValue: `${formatNumber(origMw)} Da (${(origMw / 1000).toFixed(2)} kDa)`,
        modifiedValue: `${formatNumber(modMw)} Da (${(modMw / 1000).toFixed(2)} kDa)`,
        differenceText: `${mwDiff > 0 ? '+' : ''}${formatNumber(mwDiff)} Da`,
        numericDifference: mwDiff,
        significance: mwDiff !== 0 ? 'increased' : 'neutral',
        description: 'Sum of individual amino acid isotopic residue masses minus condensation water.'
      });

      // Isoelectric Point (pI)
      const origPi = origProt.isoelectricPoint || 0;
      const modPi = modProt.isoelectricPoint || 0;
      const piDiff = Number((modPi - origPi).toFixed(3));
      metrics.push({
        id: 'prot_pi',
        category: 'physicochemical',
        name: 'Isoelectric Point (pI)',
        unit: 'pH',
        originalValue: `pH ${origPi.toFixed(2)}`,
        modifiedValue: `pH ${modPi.toFixed(2)}`,
        differenceText: `${piDiff > 0 ? '+' : ''}${piDiff.toFixed(3)} pH`,
        numericDifference: piDiff,
        significance: Math.abs(piDiff) >= 0.2 ? 'critical' : piDiff !== 0 ? 'increased' : 'neutral',
        description: 'Theoretical pH where the net electrical charge of the peptide is zero.'
      });

      // Net Charge at pH 7.4
      const origCharge = origProt.chargeAtPh7 || 0;
      const modCharge = modProt.chargeAtPh7 || 0;
      const chargeDiff = Number((modCharge - origCharge).toFixed(2));
      metrics.push({
        id: 'prot_charge',
        category: 'physicochemical',
        name: 'Net Charge (pH 7.4)',
        unit: 'e',
        originalValue: `${origCharge > 0 ? '+' : ''}${origCharge.toFixed(2)} e`,
        modifiedValue: `${modCharge > 0 ? '+' : ''}${modCharge.toFixed(2)} e`,
        differenceText: `${chargeDiff > 0 ? '+' : ''}${chargeDiff.toFixed(2)} e`,
        numericDifference: chargeDiff,
        significance: Math.abs(chargeDiff) >= 1.0 ? 'critical' : chargeDiff !== 0 ? 'increased' : 'neutral',
        description: 'Formal electrostatic charge under physiological pH (7.4).'
      });

      // Gravy / Hydropathy index
      const origGravy = origProt.hydropathy || origProt.gravy || 0;
      const modGravy = modProt.hydropathy || modProt.gravy || 0;
      const gravyDiff = Number((modGravy - origGravy).toFixed(3));
      metrics.push({
        id: 'prot_gravy',
        category: 'physicochemical',
        name: 'GRAVY Hydropathy Index',
        unit: 'score',
        originalValue: `${origGravy.toFixed(3)} (${origGravy > 0 ? 'Hydrophobic' : 'Hydrophilic'})`,
        modifiedValue: `${modGravy.toFixed(3)} (${modGravy > 0 ? 'Hydrophobic' : 'Hydrophilic'})`,
        differenceText: `${gravyDiff > 0 ? '+' : ''}${gravyDiff.toFixed(3)}`,
        numericDifference: gravyDiff,
        significance: Math.abs(gravyDiff) >= 0.3 ? 'critical' : gravyDiff !== 0 ? 'increased' : 'neutral',
        description: 'Grand Average of Hydropathy score (Kyte-Doolittle scale).'
      });
    }
  }

  // Resolve structure resolution strategy
  const structureResolution = resolveStructureStrategy(modifiedSequence, sequenceType, sourceMetadata);

  // Map mutations to structural loci
  const structuralMappings = mapMutationsToStructuralLoci(
    mutations,
    modDna,
    modRna,
    modProt,
    sequenceType
  );

  const isModified = Boolean(originalSequence && modifiedSequence && originalSequence !== modifiedSequence);

  return {
    sequenceType,
    pipeline,
    originalLength: origLen,
    modifiedLength: modLen,
    lengthDelta,
    isModified,
    unitLabel,
    originalAnalysis: {
      dnaAnalysis: origDna,
      rnaAnalysis: origRna,
      proteinAnalysis: origProt,
      summary: `${formatNumber(origLen)} ${unitLabel} | GC: ${origDna?.composition?.gcPercentage?.toFixed(1) || '--'}% | ORFs: ${origDna?.orfs?.length || 0}`
    },
    modifiedAnalysis: {
      dnaAnalysis: modDna,
      rnaAnalysis: modRna,
      proteinAnalysis: modProt,
      summary: `${formatNumber(modLen)} ${unitLabel} | GC: ${modDna?.composition?.gcPercentage?.toFixed(1) || '--'}% | ORFs: ${modDna?.orfs?.length || 0}`
    },
    metrics,
    structureResolution,
    structuralMappings,
    versionMetadata: {
      version1: {
        versionNumber: 1,
        label: 'Version 1 (Original Sequence)',
        sequenceLength: origLen,
        sequence: originalSequence,
        createdAt: sourceMetadata?.created_at || 'Original Input'
      },
      version2: {
        versionNumber,
        label: `Version ${versionNumber} (Modified - ${mutations.length} mutations)`,
        sequenceLength: modLen,
        sequence: modifiedSequence,
        mutationCount: mutations.length,
        parentAnalysisId,
        status: 'Completed',
        createdAt: new Date().toISOString()
      }
    }
  };
}
