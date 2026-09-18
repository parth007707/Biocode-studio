import { DatabaseSourceId, DatabaseSearchResult } from './types';

export interface UniProtQueryParams {
  query: string;
  reviewedOnly?: boolean; // Swiss-Prot reviewed vs TrEMBL
  organism?: string;
  size?: number;
  format?: 'json' | 'fasta' | 'tsv';
}

export interface UniProtEntrySummary {
  primaryAccession: string;
  uniProtkbId: string;
  proteinName: string;
  geneName?: string;
  organismName: string;
  sequenceLength: number;
  reviewed: boolean;
}

class UniProtAdapter {
  private readonly baseUrl = 'https://rest.uniprot.org/uniprotkb';

  public buildSearchUrl(params: UniProtQueryParams): string {
    let q = params.query.trim();
    if (params.reviewedOnly) {
      q = `(${q}) AND (reviewed:true)`;
    }
    if (params.organism) {
      q = `(${q}) AND (organism_name:"${params.organism}")`;
    }

    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('query', q);
    url.searchParams.set('size', String(params.size || 25));
    url.searchParams.set('format', params.format || 'json');
    return url.toString();
  }

  public buildFetchFastaUrl(accession: string): string {
    return `${this.baseUrl}/${accession}.fasta`;
  }

  public async search(params: UniProtQueryParams): Promise<DatabaseSearchResult<UniProtEntrySummary>> {
    const startTime = performance.now();
    try {
      const url = this.buildSearchUrl(params);
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        throw new Error(`UniProt API HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const results: any[] = data.results || [];

      const items: UniProtEntrySummary[] = results.map((r) => {
        const proteinDesc = r.proteinDescription?.recommendedName?.fullName?.value 
          || r.proteinDescription?.submissionNames?.[0]?.fullName?.value 
          || 'Uncharacterized protein';
        const gene = r.genes?.[0]?.geneName?.value;

        return {
          primaryAccession: r.primaryAccession,
          uniProtkbId: r.uniProtkbId,
          proteinName: proteinDesc,
          geneName: gene,
          organismName: r.organism?.scientificName || 'Unknown organism',
          sequenceLength: r.sequence?.length || 0,
          reviewed: r.entryType === 'UniProtKB reviewed (Swiss-Prot)'
        };
      });

      return {
        sourceId: 'uniprot-protein',
        query: params.query,
        totalCount: items.length,
        status: items.length > 0 ? 'success' : 'empty',
        items,
        executionTimeMs: Math.round(performance.now() - startTime),
        message: `Retrieved ${items.length} UniProtKB entries`
      };
    } catch (err: any) {
      return {
        sourceId: 'uniprot-protein',
        query: params.query,
        totalCount: 0,
        status: 'error',
        message: err.message || 'Failed to query UniProt REST API',
        items: [],
        executionTimeMs: Math.round(performance.now() - startTime)
      };
    }
  }

  public async fetchFasta(accession: string): Promise<string> {
    const url = this.buildFetchFastaUrl(accession);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch UniProt FASTA for ${accession}: HTTP ${res.status}`);
    }
    return await res.text();
  }
}

export const uniprotAdapter = new UniProtAdapter();
