import {
  GCAndORFAnalysisResult,
  AminoAcidComposition,
  RNASecondaryStructureResult,
  ScientificInterpretation,
  analyzeGCAndORF,
  predictRNASecondaryStructure,
  analyzeProteinSequence,
  generateDNAInterpretation,
  generateRNAInterpretation,
  generateProteinInterpretation,
  detectSequence,
  parseBiologicalInput,
  SequenceMutation
} from '../index';

export interface NormalizedWorkbenchState {
  type: 'DNA' | 'RNA' | 'PROTEIN';
  pipeline: string;
  header: string | null;
  sequence: string;
  reverseComplement?: string;
  timestamp: string;
  versionNumber: number;

  mutations: SequenceMutation[];
  residueData: any[];
  chartData: any[];
  structureData: any;
  metadata: any;

  dnaAnalysis: GCAndORFAnalysisResult | null;
  rnaAnalysis: RNASecondaryStructureResult | null;
  proteinAnalysis: AminoAcidComposition | null;
  interpretation: ScientificInterpretation;
}

/**
 * Safely normalizes any raw or historical Supabase analysis record,
 * legacy analysis payload, or partial result into a complete, guaranteed Workbench state.
 */
export function normalizeAnalysisRecord(
  rawInput: any,
  fallbackSequence: string = '',
  fallbackMetadata: any = null
): NormalizedWorkbenchState {
  try {
    // 1. Extract and clean sequence
    let rawSeqCandidate = '';
    if (typeof rawInput === 'string') {
      rawSeqCandidate = rawInput;
    } else if (rawInput && typeof rawInput === 'object') {
      rawSeqCandidate =
        rawInput.sequence ||
        rawInput.raw_sequence ||
        rawInput.fullSequence ||
        rawInput.sequence_record?.sequence ||
        '';
    }
    if (!rawSeqCandidate) {
      rawSeqCandidate = fallbackSequence || '';
    }

    const parsed = parseBiologicalInput(rawSeqCandidate);
    const cleanSeq = (parsed.sequence || rawSeqCandidate).trim().toUpperCase();

    // 2. Detect sequence type
    let rawType = rawInput?.type || rawInput?.sequence_type || rawInput?.category;
    if (rawType === 'NUCLEOTIDE' || rawType === 'GENOMIC') rawType = 'DNA';
    let seqType: 'DNA' | 'RNA' | 'PROTEIN' =
      rawType === 'DNA' || rawType === 'RNA' || rawType === 'PROTEIN'
        ? rawType
        : (detectSequence(cleanSeq).detectedType as any) || 'DNA';

    // 3. Extract arrays with strict safety guards
    const mutations: SequenceMutation[] = Array.isArray(rawInput?.mutations)
      ? rawInput.mutations
      : Array.isArray(rawInput?.activeMutations)
      ? rawInput.activeMutations
      : [];

    const residueData: any[] = Array.isArray(rawInput?.residueData)
      ? rawInput.residueData
      : Array.isArray(rawInput?.residues)
      ? rawInput.residues
      : [];

    const chartData: any[] = Array.isArray(rawInput?.chartData)
      ? rawInput.chartData
      : Array.isArray(rawInput?.charts)
      ? rawInput.charts
      : [];

    const structureData: any = rawInput?.structureData || rawInput?.structure || null;

    const metadata: any = rawInput?.metadata || rawInput?.sequence_record || fallbackMetadata || {};

    const header: string | null =
      rawInput?.header ||
      rawInput?.sequence_record?.definition ||
      rawInput?.sequence_record?.accession ||
      parsed.header ||
      null;

    const pipeline: string =
      rawInput?.pipeline ||
      rawInput?.analysis_type ||
      (seqType === 'PROTEIN'
        ? 'Amino Acid Composition & Charge'
        : seqType === 'RNA'
        ? 'Codon Usage & Bias Analysis'
        : 'GC Content & ORF Profiling');

    const timestamp: string =
      rawInput?.timestamp ||
      (rawInput?.created_at ? new Date(rawInput.created_at).toLocaleTimeString() : new Date().toLocaleTimeString());

    const versionNumber: number = typeof rawInput?.versionNumber === 'number' ? rawInput.versionNumber : 1;

    // 4. Normalize or compute biophysical analysis objects
    let dnaRes: GCAndORFAnalysisResult | null = null;
    let rnaRes: RNASecondaryStructureResult | null = null;
    let protRes: AminoAcidComposition | null = null;

    if (seqType === 'DNA') {
      if (cleanSeq.length > 0) {
        try {
          dnaRes = analyzeGCAndORF(cleanSeq, 'DNA');
        } catch (err) {
          console.error('[Normalization Warning] Failed to compute DNA analysis:', err);
        }
      }
      if (!dnaRes && rawInput?.dnaAnalysis) {
        dnaRes = {
          composition: rawInput.dnaAnalysis.composition || {
            length: cleanSeq.length,
            gcCount: 0,
            atCount: 0,
            gcPercentage: 0,
            atPercentage: 0,
            counts: { A: 0, T: 0, G: 0, C: 0 }
          },
          orfs: Array.isArray(rawInput.dnaAnalysis.orfs) ? rawInput.dnaAnalysis.orfs : [],
          longestOrf: rawInput.dnaAnalysis.longestOrf || null,
          startCodonsCount: rawInput.dnaAnalysis.startCodonsCount || 0,
          stopCodonsCount: rawInput.dnaAnalysis.stopCodonsCount || 0,
          isCompatible: true
        };
      }
    } else if (seqType === 'RNA') {
      if (cleanSeq.length > 0) {
        try {
          rnaRes = predictRNASecondaryStructure(cleanSeq);
        } catch (err) {
          console.error('[Normalization Warning] Failed to compute RNA analysis:', err);
        }
      }
      if (!rnaRes && rawInput?.rnaAnalysis) {
        rnaRes = {
          sequence: cleanSeq,
          length: cleanSeq.length,
          gcPercentage: rawInput.rnaAnalysis.gcPercentage || 0,
          auPercentage: rawInput.rnaAnalysis.auPercentage || 0,
          purinePercentage: rawInput.rnaAnalysis.purinePercentage || 0,
          pyrimidinePercentage: rawInput.rnaAnalysis.pyrimidinePercentage || 0,
          dotBracket: rawInput.rnaAnalysis.dotBracket || '',
          pairs: Array.isArray(rawInput.rnaAnalysis.pairs) ? rawInput.rnaAnalysis.pairs : [],
          stemCount: Array.isArray(rawInput.rnaAnalysis.stems) ? rawInput.rnaAnalysis.stems.length : 0,
          loopCount: Array.isArray(rawInput.rnaAnalysis.hairpins) ? rawInput.rnaAnalysis.hairpins.length : 0,
          estimatedFreeEnergyKcal: rawInput.rnaAnalysis.estimatedFreeEnergyKcal || 0,
          stems: Array.isArray(rawInput.rnaAnalysis.stems)
            ? rawInput.rnaAnalysis.stems.map((s: any) => ({
                ...s,
                basePairs: Array.isArray(s?.basePairs) ? s.basePairs : []
              }))
            : [],
          hairpins: Array.isArray(rawInput.rnaAnalysis.hairpins) ? rawInput.rnaAnalysis.hairpins : []
        };
      }
    } else if (seqType === 'PROTEIN') {
      if (cleanSeq.length > 0) {
        try {
          protRes = analyzeProteinSequence(cleanSeq);
        } catch (err) {
          console.error('[Normalization Warning] Failed to compute Protein analysis:', err);
        }
      }
      if (!protRes && rawInput?.proteinAnalysis) {
        protRes = {
          length: cleanSeq.length,
          molecularWeightDa: rawInput.proteinAnalysis.molecularWeightDa || 0,
          molecularWeightKDa: rawInput.proteinAnalysis.molecularWeightKDa || 0,
          isoelectricPoint: rawInput.proteinAnalysis.isoelectricPoint || 7.0,
          gravyScore: rawInput.proteinAnalysis.gravyScore || 0,
          netChargeAtPh7: rawInput.proteinAnalysis.netChargeAtPh7 || 0,
          hydrophobicCount: rawInput.proteinAnalysis.hydrophobicCount || 0,
          hydrophobicPercentage: rawInput.proteinAnalysis.hydrophobicPercentage || 0,
          polarCount: rawInput.proteinAnalysis.polarCount || 0,
          polarPercentage: rawInput.proteinAnalysis.polarPercentage || 0,
          positivelyChargedCount: rawInput.proteinAnalysis.positivelyChargedCount || 0,
          negativelyChargedCount: rawInput.proteinAnalysis.negativelyChargedCount || 0,
          counts: rawInput.proteinAnalysis.counts || {},
          percentages: rawInput.proteinAnalysis.percentages || {},
          predictedSecondaryStructure: rawInput.proteinAnalysis.predictedSecondaryStructure || {
            helixPropensity: 0,
            sheetPropensity: 0,
            coilPropensity: 0,
            dominantConformation: 'Mixed'
          }
        };
      }
    }

    // 5. Build or sanitize interpretation object
    let interpretation: ScientificInterpretation;
    const rawInterp = rawInput?.interpretation;

    if (rawInterp && Array.isArray(rawInterp.biophysicalInsights) && Array.isArray(rawInterp.structuralImplications)) {
      interpretation = {
        title: rawInterp.title || `${seqType} Analysis Report`,
        category: seqType,
        executiveSummary: rawInterp.executiveSummary || rawInterp.summary || 'Sequence analysis record loaded.',
        biophysicalInsights: Array.isArray(rawInterp.biophysicalInsights) ? rawInterp.biophysicalInsights : [],
        structuralImplications: Array.isArray(rawInterp.structuralImplications) ? rawInterp.structuralImplications : [],
        functionalPredictions: Array.isArray(rawInterp.functionalPredictions) ? rawInterp.functionalPredictions : [],
        confidenceDisclaimer:
          rawInterp.confidenceDisclaimer || 'Automated biophysical calculation derived from primary sequence data.'
      };
    } else {
      // Generate standard scientific interpretation
      if (seqType === 'PROTEIN' && protRes) {
        interpretation = generateProteinInterpretation(protRes, metadata);
      } else if (seqType === 'RNA' && rnaRes) {
        interpretation = generateRNAInterpretation(rnaRes, metadata, cleanSeq, dnaRes);
      } else if (dnaRes) {
        interpretation = generateDNAInterpretation(cleanSeq, dnaRes, metadata);
      } else {
        interpretation = {
          title: rawInterp?.title || `${seqType} Analysis Record`,
          category: seqType,
          executiveSummary:
            rawInterp?.summary || rawInput?.result_summary || 'Loaded sequence analysis record.',
          biophysicalInsights: Array.isArray(rawInterp?.keyFindings)
            ? rawInterp.keyFindings
            : [`Sequence length: ${cleanSeq.length} ${seqType === 'PROTEIN' ? 'residues' : 'bp'}`],
          structuralImplications: Array.isArray(rawInterp?.recommendations)
            ? rawInterp.recommendations
            : ['Secondary structure fold computation available in workbench.'],
          functionalPredictions: [],
          confidenceDisclaimer: 'Sequence metrics generated from database record.'
        };
      }
    }

    // Ensure all array fields on interpretation are non-null arrays
    interpretation.biophysicalInsights = Array.isArray(interpretation.biophysicalInsights)
      ? interpretation.biophysicalInsights
      : [];
    interpretation.structuralImplications = Array.isArray(interpretation.structuralImplications)
      ? interpretation.structuralImplications
      : [];
    interpretation.functionalPredictions = Array.isArray(interpretation.functionalPredictions)
      ? interpretation.functionalPredictions
      : [];

    return {
      type: seqType,
      pipeline,
      header,
      sequence: cleanSeq,
      timestamp,
      versionNumber,
      mutations,
      residueData,
      chartData,
      structureData,
      metadata,
      dnaAnalysis: dnaRes,
      rnaAnalysis: rnaRes,
      proteinAnalysis: protRes,
      interpretation
    };
  } catch (err: any) {
    console.error('[Normalization Fatal Error] Property undefined or invalid structure during record normalization:', {
      error: err?.message || err,
      stack: err?.stack,
      rawInput
    });
    // Fallback safe return
    const fallbackSeq = (fallbackSequence || '').trim().toUpperCase();
    const detected = detectSequence(fallbackSeq).detectedType;
    const fallbackType: 'DNA' | 'RNA' | 'PROTEIN' = detected === 'UNKNOWN' ? 'PROTEIN' : (detected as any);
    return {
      type: fallbackType,
      pipeline: 'Sequence Analysis',
      header: 'Loaded Sequence',
      sequence: fallbackSeq,
      timestamp: new Date().toLocaleTimeString(),
      versionNumber: 1,
      mutations: [],
      residueData: [],
      chartData: [],
      structureData: null,
      metadata: fallbackMetadata || {},
      dnaAnalysis: null,
      rnaAnalysis: null,
      proteinAnalysis: null,
      interpretation: {
        title: `${fallbackType} Analysis`,
        category: fallbackType,
        executiveSummary: 'Sequence loaded with fallback normalization.',
        biophysicalInsights: [`Sequence length: ${fallbackSeq.length}`],
        structuralImplications: [],
        functionalPredictions: [],
        confidenceDisclaimer: 'Fallback interpretation generated after normalization alert.'
      }
    };
  }
}
