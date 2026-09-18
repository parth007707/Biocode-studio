import {
  SequenceIntelligenceResult,
  EngineType,
  VisualizationMode,
  AnalysisPipelineType
} from './types';
import { parseSequence } from './sequenceParser';
import { detectSequence } from './sequenceDetector';
import { validateSequence } from './sequenceValidator';
import { SequenceSourceMetadata } from '../../services/adapters/types';

export function routeSequenceAutomation(
  input: string,
  metadata?: SequenceSourceMetadata | null
): SequenceIntelligenceResult {
  const parsed = parseSequence(input);
  const detection = detectSequence(parsed.cleanedSequence, metadata, parsed.fastaHeader);
  const validation = validateSequence(parsed, detection);

  let engine: EngineType = 'NONE';
  let visualizationMode: VisualizationMode = 'NONE';
  let availableAnalyses: AnalysisPipelineType[] = [];

  if (validation.isValid) {
    switch (detection.detectedType) {
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
    molecule_type: metadata.molecule_type || metadata.moleculeType || (detection.detectedType === 'PROTEIN' ? 'protein' : detection.detectedType === 'RNA' ? 'RNA' : 'DNA'),
    sequence_type: metadata.sequence_type || metadata.sequenceType || (detection.detectedType === 'PROTEIN' ? 'Protein' : detection.detectedType === 'RNA' ? 'RNA Transcript' : 'Genomic DNA'),
    strand: metadata.strand || (detection.detectedType === 'PROTEIN' ? 'single polypeptide chain' : detection.detectedType === 'RNA' ? 'single-stranded' : 'double-stranded'),
    topology: metadata.topology || 'linear'
  } : undefined);

  return {
    rawInput: input,
    cleanedSequence: parsed.cleanedSequence,
    fastaHeader: parsed.fastaHeader,
    detectedType: validation.isValid ? detection.detectedType : 'UNKNOWN',
    confidence: validation.isValid ? detection.confidence : 0,
    length: parsed.cleanedSequence.length,
    isValid: validation.isValid,
    validationErrors: validation.validationErrors,
    engine,
    visualizationMode,
    availableAnalyses,
    metadata,
    biologicalClassification
  };
}
