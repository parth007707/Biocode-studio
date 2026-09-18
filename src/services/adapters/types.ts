export type DatabaseCategory = 'NCBI' | 'BLAST' | 'UniProt' | 'RCSB_PDB' | 'FASTA_IMPORT' | 'CUSTOM_SEQUENCE';

export type DatabaseSourceId = 
  // NCBI Sources
  | 'ncbi-nucleotide'
  | 'ncbi-protein'
  | 'ncbi-gene'
  | 'ncbi-genome'
  | 'ncbi-assembly'
  | 'ncbi-taxonomy'
  // BLAST Sources
  | 'blast-nucleotide'
  | 'blast-protein'
  // UniProt Sources
  | 'uniprot-protein'
  // RCSB PDB Sources
  | 'pdb-dna'
  | 'pdb-rna'
  | 'pdb-protein'
  // Import & Custom
  | 'fasta-import'
  | 'custom-sequence';

export interface DatabaseSourceMeta {
  id: DatabaseSourceId;
  name: string;
  category: DatabaseCategory;
  categoryLabel: string;
  description: string;
  badge: string;
  apiProvider: string;
  endpointUrl: string;
  docUrl: string;
  supportedFormats: string[];
  sampleQueries: {
    label: string;
    query: string;
    description: string;
  }[];
  queryFields: {
    name: string;
    label: string;
    type: 'text' | 'select' | 'number';
    placeholder?: string;
    defaultValue?: string | number;
    options?: { label: string; value: string }[];
  }[];
}

export interface DatabaseSearchResult<T = any> {
  sourceId: DatabaseSourceId;
  query: string;
  constructedQuery?: string;
  totalCount: number;
  status: 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'ready_for_api_key';
  message?: string;
  items: T[];
  executionTimeMs?: number;
}

export interface SequenceSourceMetadata {
  source: string; // 'NCBI' | 'UniProt' | 'RCSB_PDB' | 'BLAST' | 'FASTA File' | 'Direct Input'
  database?: string; // e.g. 'nucleotide', 'protein', 'Swiss-Prot'
  accession: string;
  version?: string;
  title?: string;
  definition?: string;
  organism?: string;
  molecule_type?: string; // 'mRNA' | 'ncRNA' | 'genomic DNA' | 'genomic RNA' | 'protein' | 'peptide' | string
  moleculeType?: string;
  sequence_type?: string; // 'Genomic DNA' | 'mRNA Transcript' | 'Non-Coding RNA' | 'Genomic RNA (Viral)' | 'Protein' | 'Coding Sequence (CDS)' | string
  sequenceType?: string;
  total_length?: number;
  totalLength?: number;
  topology?: string; // 'linear' | 'circular'
  strand?: string; // 'single-stranded' | 'double-stranded' | 'single polypeptide chain'
  feature_annotations?: Array<{ type: string; location: string; description?: string }>;
  rangeStart?: number;
  rangeEnd?: number;
  subLength?: number;
  isPartialRange?: boolean;
  analysisScope?: 'Complete Sequence' | 'Selected Region';
  basesAnalyzed?: number;
  coveragePercentage?: number;
  precomputedAnalysis?: any;
}

export interface BiologicalRecordSummary {
  uid: string;
  accession: string;
  title: string;
  organism?: string;
  sequenceType?: string;
  sourceDb: string;
  category: DatabaseCategory;
  length?: number;
  createDate?: string;
  updateDate?: string;
  description?: string;
  taxId?: string;
  previewFirst200?: string;
  previewLast200?: string;
}
