import { SequenceSourceMetadata } from '../../services/adapters/types';

export type SequenceType = 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN';

export type VisualizationMode = 'DNA_3D' | 'RNA_3D' | 'PROTEIN_3D' | 'NONE';

export type EngineType = 'DNA_ENGINE' | 'RNA_ENGINE' | 'PROTEIN_ENGINE' | 'NONE';

export type AnalysisPipelineType =
  | 'GC_CONTENT'
  | 'ORF_PROFILING'
  | 'REVERSE_COMPLEMENT'
  | 'TRANSLATION'
  | 'MUTATION_SCAN'
  | 'CODON_ANALYSIS'
  | 'AMINO_ACID_COMPOSITION'
  | 'MOLECULAR_PROPERTIES'
  | 'HYDROPHOBICITY_ANALYSIS';

export interface SequenceIntelligenceResult {
  rawInput: string;
  cleanedSequence: string;
  fastaHeader: string | null;
  detectedType: SequenceType;
  confidence: number;
  length: number;
  isValid: boolean;
  validationErrors: string[];
  engine: EngineType;
  visualizationMode: VisualizationMode;
  availableAnalyses: AnalysisPipelineType[];
  metadata?: SequenceSourceMetadata | null;
  biologicalClassification?: {
    molecule_type: string;
    sequence_type: string;
    strand: string;
    topology: string;
  };
}

export interface NucleotideComposition {
  length: number;
  gcCount: number;
  atCount: number;
  auCount: number;
  gcPercentage: number;
  atPercentage: number;
  auPercentage: number;
  counts: Record<string, number>;
}

export interface ORFResult {
  frame: number; // +1, +2, +3, -1, -2, -3
  start: number; // 1-based coordinate
  end: number;
  lengthBp: number;
  lengthAa: number;
  proteinSequence: string;
}

export interface GCAndORFAnalysisResult {
  composition: NucleotideComposition;
  orfs: ORFResult[];
  longestOrf: ORFResult | null;
  startCodonsCount: number;
  stopCodonsCount: number;
  isCompatible: boolean;
  incompatibilityReason?: string;
}
