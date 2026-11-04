import {
  SequenceIntelligenceResult,
  EngineType,
  VisualizationMode,
  AnalysisPipelineType,
  SequenceType
} from './types';
import { parseSequence } from './sequenceParser';
import { detectSequence } from './sequenceDetector';
import { validateSequence } from './sequenceValidator';
import { SequenceSourceMetadata } from '../../services/adapters/types';

export function routeSequenceAutomation(
  input: string,
  metadata?: SequenceSourceMetadata | null,
  explicitType?: SequenceType
): SequenceIntelligenceResult {
  const parsed = parseSequence(input);
  const detection = detectSequence(parsed.cleanedSequence, metadata, parsed.fastaHeader);
  
  // Single Source of Truth for Sequence Type:
  // 1. Explicit canonical type passed from context/workbench
  // 2. Metadata sequenceType / sequence_type (e.g. 'DNA', 'RNA', 'PROTEIN')
  // 3. Intrinsic detection result
  const canonicalType: SequenceType = (explicitType && explicitType !== 'UNKNOWN')
    ? explicitType
    : (metadata?.sequenceType && (metadata.sequenceType as string) !== 'UNKNOWN' && (metadata.sequenceType as string) !== 'Nucleotide'
        ? (metadata.sequenceType as SequenceType)
        : (metadata?.sequence_type && (metadata.sequence_type as string) !== 'UNKNOWN' && (metadata.sequence_type as string) !== 'Nucleotide'
            ? (metadata.sequence_type.toUpperCase().includes('PROT') ? 'PROTEIN' : metadata.sequence_type.toUpperCase().includes('RNA') ? 'RNA' : 'DNA')
            : detection.detectedType));

  const validation = validateSequence(parsed, detection, canonicalType);

  let engine: EngineType = 'NONE';
  let visualizationMode: VisualizationMode = 'NONE';
  let availableAnalyses: AnalysisPipelineType[] = [];

  const effectiveType = canonicalType !== 'UNKNOWN' ? canonicalType : detection.detectedType;

  if (validation.isValid) {
    switch (effectiveType) {
      case 'DNA':
        engine = 'DNA_ENGINE';
        visualizationMode = 'DNA_3D';
        availableAnalyses = [
          'GC_CONTENT',
          'ORF_PROFILING',
          'REVERSE_COMPLEMENT',
          'TRANSLATION',
          'MUTATION_SCAN'
        ];
        break;

      case 'RNA':
        engine = 'RNA_ENGINE';
        visualizationMode = 'RNA_3D';
        availableAnalyses = [
          'GC_CONTENT',
          'ORF_PROFILING',
          'TRANSLATION',
          'CODON_ANALYSIS'
        ];
        break;

      case 'PROTEIN':
        engine = 'PROTEIN_ENGINE';
        visualizationMode = 'PROTEIN_3D';
        availableAnalyses = [
          'AMINO_ACID_COMPOSITION',
          'MOLECULAR_PROPERTIES',
          'HYDROPHOBICITY_ANALYSIS'
        ];
        break;

      default:
        engine = 'NONE';
        visualizationMode = 'NONE';
        availableAnalyses = [];
        break;
    }
  }

  // Merge biologicalClassification if available from detection or metadata
  const biologicalClassification = detection.biologicalClassification || (metadata ? {
    molecule_type: metadata.molecule_type || metadata.moleculeType || (effectiveType === 'PROTEIN' ? 'protein' : effectiveType === 'RNA' ? 'RNA' : 'DNA'),
    sequence_type: metadata.sequence_type || metadata.sequenceType || (effectiveType === 'PROTEIN' ? 'Protein' : effectiveType === 'RNA' ? 'RNA Transcript' : 'Genomic DNA'),
    strand: metadata.strand || (effectiveType === 'PROTEIN' ? 'single polypeptide chain' : effectiveType === 'RNA' ? 'single-stranded' : 'double-stranded'),
    topology: metadata.topology || 'linear'
  } : undefined);

  return {
    rawInput: input,
    cleanedSequence: parsed.cleanedSequence,
    fastaHeader: parsed.fastaHeader,
    detectedType: effectiveType,
    confidence: validation.isValid ? (detection.confidence || 1.0) : 0,
    length: parsed.cleanedSequence.length,
    isValid: validation.isValid,
    validationErrors: validation.validationErrors,
    validationDetails: validation.validationDetails,
    engine,
    visualizationMode,
    availableAnalyses,
    metadata,
    biologicalClassification
  };
}
