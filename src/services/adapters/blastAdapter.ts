import { DatabaseSourceId, DatabaseSearchResult } from './types';

export interface BLASTQueryParams {
  program: 'blastn' | 'blastp' | 'blastx' | 'tblastn' | 'tblastx';
  database: 'nr' | 'nt' | 'refseq_rna' | 'refseq_protein' | 'swissprot' | 'pdb';
  sequence: string;
  expectThreshold?: number;
  wordSize?: number;
  matrix?: 'BLOSUM62' | 'BLOSUM45' | 'BLOSUM80' | 'PAM30' | 'PAM70';
  maxTargetSeqs?: number;
}

export interface BLASTJobStatus {
  rid: string;
  rtoe?: number;
  status: 'WAITING' | 'READY' | 'UNKNOWN' | 'FAILED';
  submittedAt: string;
}

export interface BLASTHit {
  id: string;
  definition: string;
  accession: string;
  length: number;
  bitScore: number;
  eValue: number;
  identityPercentage: number;
  alignmentLength: number;
}

class BLASTAdapter {
  private readonly baseUrl = 'https://blast.ncbi.nlm.nih.gov/Blast.cgi';

  public buildSubmitUrl(params: BLASTQueryParams): string {
    const url = new URL(this.baseUrl);
    url.searchParams.set('CMD', 'Put');
    url.searchParams.set('PROGRAM', params.program);
    url.searchParams.set('DATABASE', params.database);
    url.searchParams.set('QUERY', params.sequence.trim());
    if (params.expectThreshold) url.searchParams.set('EXPECT', String(params.expectThreshold));
    if (params.matrix) url.searchParams.set('MATRIX_NAME', params.matrix);
    return url.toString();
  }

  public async submitJob(params: BLASTQueryParams): Promise<BLASTJobStatus> {
    // Scaffold submission to NCBI BLAST QBLAST URL API
    const rid = 'RID_' + Math.random().toString(36).substring(2, 9).toUpperCase();
    return {
      rid,
      status: 'WAITING',
      rtoe: 20,
      submittedAt: new Date().toISOString()
    };
  }

  public async checkStatus(rid: string): Promise<BLASTJobStatus> {
    return {
      rid,
      status: 'READY',
      submittedAt: new Date().toISOString()
    };
  }

  public async search(params: BLASTQueryParams): Promise<DatabaseSearchResult<BLASTHit>> {
    const startTime = performance.now();
    return {
      sourceId: params.program === 'blastn' ? 'blast-nucleotide' : 'blast-protein',
      query: params.sequence.slice(0, 40) + '...',
      totalCount: 0,
      status: 'ready_for_api_key',
      message: `BLAST ${params.program.toUpperCase()} query scaffold initialized. Ready for NCBI QBLAST pipeline execution.`,
      items: [],
      executionTimeMs: Math.round(performance.now() - startTime)
    };
  }
}

export const blastAdapter = new BLASTAdapter();
