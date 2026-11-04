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

  public async fetchFasta(accession: string, signal?: AbortSignal, timeoutMs: number = 10000): Promise<string> {
    const cleanAcc = accession.trim().toUpperCase();
    const url = this.buildFetchFastaUrl(cleanAcc);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`UniProt API request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const combinedSignal = signal
      ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : signal)
      : controller.signal;

    try {
      const res = await fetch(url, { signal: combinedSignal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`Failed to fetch UniProt FASTA for ${cleanAcc}: HTTP ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      if (!text || !text.trim()) {
        throw new Error(`Empty FASTA response received from UniProt for ${cleanAcc}`);
      }
      return text;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError' && controller.signal.aborted && (!signal || !signal.aborted)) {
        throw new Error(`UniProt request for ${cleanAcc} timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }

  public async fetchEntryByAccession(
    accession: string,
    signal?: AbortSignal
  ): Promise<{ metadata: UniProtEntrySummary; fasta: string } | null> {
    const cleanAcc = accession.trim().toUpperCase();
    try {
      // 1. Fetch FASTA
      const fasta = await this.fetchFasta(cleanAcc, signal);

      // 2. Try fetching JSON metadata (or construct from FASTA header)
      let metadata: UniProtEntrySummary;
      try {
        const jsonUrl = `${this.baseUrl}/${cleanAcc}.json`;
        const res = await fetch(jsonUrl, { headers: { Accept: 'application/json' }, signal });
        if (res.ok) {
          const r = await res.json();
          const proteinDesc =
            r.proteinDescription?.recommendedName?.fullName?.value ||
            r.proteinDescription?.submissionNames?.[0]?.fullName?.value ||
            'Uncharacterized protein';
          const gene = r.genes?.[0]?.geneName?.value;
          metadata = {
            primaryAccession: r.primaryAccession || cleanAcc,
            uniProtkbId: r.uniProtkbId || cleanAcc,
            proteinName: proteinDesc,
            geneName: gene,
            organismName: r.organism?.scientificName || 'Homo sapiens',
            sequenceLength: r.sequence?.length || 0,
            reviewed: r.entryType === 'UniProtKB reviewed (Swiss-Prot)'
          };
        } else {
          throw new Error('JSON not available');
        }
      } catch {
        // Fallback: extract from FASTA header
        const firstLine = fasta.split('\n')[0] || '';
        const nameMatch = firstLine.match(/>sp\|[^|]+\|(\S+)\s+(.+?)\s+OS=/i) || firstLine.match(/>\S+\s+(.+)/);
        const orgMatch = firstLine.match(/OS=([^=]+?)(?:\s+OX=|\s+GN=|\s+PE=|$)/i);
        const seqOnly = fasta.split('\n').filter((l) => !l.startsWith('>')).join('').replace(/\s+/g, '');

        metadata = {
          primaryAccession: cleanAcc,
          uniProtkbId: cleanAcc,
          proteinName: nameMatch ? nameMatch[2] || nameMatch[1] : `UniProt ${cleanAcc}`,
          organismName: orgMatch ? orgMatch[1].trim() : 'Homo sapiens',
          sequenceLength: seqOnly.length,
          reviewed: firstLine.startsWith('>sp|')
        };
      }

      return { metadata, fasta };
    } catch (err: any) {
      console.warn(`[UniProtAdapter] fetchEntryByAccession failed for ${cleanAcc}:`, err);
      throw err;
    }
  }
}

export const uniprotAdapter = new UniProtAdapter();
