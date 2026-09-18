export type MutationOperation = 'substitution' | 'insertion' | 'deletion';

export interface SequenceMutation {
  id: string;
  operation: MutationOperation;
  position: number; // 1-based start coordinate in the sequence
  endPosition?: number; // 1-based end coordinate (for range deletions/replacements)
  original: string; // original character(s) or empty string for insertion
  modified: string; // modified character(s) or empty string for deletion
  lengthChange: number; // e.g. 0 for substitution, +4 for insertion, -5 for deletion
  timestamp: string; // ISO timestamp
  description?: string; // Human readable summary (e.g. "Position 45: A → G")
}

export interface MutationSummary {
  totalChanges: number;
  substitutions: number;
  insertions: number;
  deletions: number;
  originalLength: number;
  modifiedLength: number;
  netLengthChange: number;
}

export interface InvalidCharacterFinding {
  char: string;
  count: number;
  positions: number[]; // 1-based positions in working sequence
}

export interface SequenceValidationReport {
  isValid: boolean;
  sequenceType: 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN';
  allowedAlphabet: string[];
  invalidChars: InvalidCharacterFinding[];
  totalInvalidCount: number;
  errorSummary?: string;
}

export interface SequenceDiffSegment {
  id: string;
  type: 'equal' | 'delete' | 'insert' | 'replace';
  originalText: string;
  modifiedText: string;
  origStart: number; // 1-based coordinate
  origEnd: number;
  modStart: number;
  modEnd: number;
}

export interface SequenceVersionRecord {
  id: string;
  sequence_record_id?: string | null;
  parent_version_id?: string | null;
  version_number: number;
  sequence_data: string;
  changes: SequenceMutation[];
  original_length: number;
  modified_length: number;
  total_changes: number;
  status: 'Completed' | 'Pending' | 'Draft';
  metadata?: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export type AnalysisJobState =
  | 'IDLE'
  | 'QUEUED'
  | 'VALIDATING'
  | 'ANALYZING'
  | 'BUILDING_VISUALIZATION'
  | 'GENERATING_RESULTS'
  | 'SAVING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'idle'
  | 'validating'
  | 'queued'
  | 'analyzing'
  | 'building_visualization'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface AnalysisJob {
  id: string;
  sourceAnalysisId?: string | null;
  parentSequenceId: string;
  sequenceSnapshot: string;
  header: string | null;
  sequenceType: 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN';
  pipeline: string;
  versionNumber: number;
  mutationSummary: MutationSummary;
  mutations: SequenceMutation[];
  status: AnalysisJobState;
  progress: number; // 0 - 100
  currentStageMessage: string;
  results?: any;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AnalysisVersionRecord {
  versionNumber: number;
  sequence: string;
  header: string | null;
  sequenceType: 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN';
  pipeline: string;
  mutationSummary: MutationSummary;
  mutations: SequenceMutation[];
  results: any;
  createdAt: string;
  sourceVersion?: number;
  analysisId?: string;
}
