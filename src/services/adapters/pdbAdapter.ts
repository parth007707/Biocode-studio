import { DatabaseSourceId, DatabaseSearchResult } from './types';

export interface PDBQueryParams {
  macromoleculeType: 'dna' | 'rna' | 'protein' | 'all';
  query: string;
  maxResolution?: number; // e.g. 2.5 Angstroms
  experimentalMethod?: 'X-RAY DIFFRACTION' | 'ELECTRON MICROSCOPY' | 'SOLUTION NMR' | 'ALL';
  limit?: number;
}

export interface PDBEntrySummary {
  pdbId: string;
  title: string;
  releaseDate?: string;
  resolution?: number;
  experimentalMethod?: string;
  polymerType?: string;
  organism?: string;
}

class RCSBPDBAdapter {
  private readonly searchApiUrl = 'https://search.rcsb.org/rcsbsearch/v2/query';
  private readonly dataApiUrl = 'https://data.rcsb.org/rest/v1/core/entry';

  public buildSearchQueryJson(params: PDBQueryParams): object {
    const nodes: any[] = [
      {
        type: 'terminal',
        service: 'text',
        parameters: {
          value: params.query.trim()
        }
      }
    ];

    if (params.macromoleculeType !== 'all') {
      let entityType = 'Protein';
      if (params.macromoleculeType === 'dna') entityType = 'DNA';
      if (params.macromoleculeType === 'rna') entityType = 'RNA';

      nodes.push({
        type: 'terminal',
        service: 'text',
        parameters: {
          attribute: 'rcsb_entry_info.polymer_composition',
          operator: 'exact_match',
          value: entityType
        }
      });
    }

    return {
      query: {
        type: 'group',
        logical_operator: 'and',
        nodes
      },
      return_type: 'entry',
      request_options: {
        paginate: {
          start: 0,
          rows: params.limit || 20
        },
        scoring_strategy: 'combined'
      }
    };
  }

  public buildStructureFileUrl(pdbId: string, format: 'pdb' | 'cif' | 'fasta' = 'fasta'): string {
    if (format === 'fasta') {
      return `https://www.rcsb.org/fasta/entry/${pdbId.toUpperCase()}`;
    }
    return `https://files.rcsb.org/download/${pdbId.toUpperCase()}.${format}`;
  }

  public async search(params: PDBQueryParams): Promise<DatabaseSearchResult<PDBEntrySummary>> {
    const startTime = performance.now();
    try {
      const queryBody = this.buildSearchQueryJson(params);
      const res = await fetch(this.searchApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queryBody)
      });

      if (!res.ok) {
        if (res.status === 204) {
          // No Content / empty results
          return {
            sourceId: `pdb-${params.macromoleculeType}` as DatabaseSourceId,
            query: params.query,
            totalCount: 0,
            status: 'empty',
            items: [],
            executionTimeMs: Math.round(performance.now() - startTime),
            message: `No PDB structures found matching "${params.query}"`
          };
        }
        throw new Error(`RCSB PDB API HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const resultList: any[] = data.result_set || [];
      const totalCount = data.total_count || resultList.length;

      const items: PDBEntrySummary[] = resultList.map((entry) => ({
        pdbId: entry.identifier,
        title: `PDB Structure Entry ${entry.identifier}`,
        polymerType: params.macromoleculeType.toUpperCase()
      }));

      return {
        sourceId: `pdb-${params.macromoleculeType}` as DatabaseSourceId,
        query: params.query,
        totalCount,
        status: items.length > 0 ? 'success' : 'empty',
        items,
        executionTimeMs: Math.round(performance.now() - startTime),
        message: `Found ${totalCount.toLocaleString()} macromolecular structural models in RCSB PDB`
      };
    } catch (err: any) {
      return {
        sourceId: `pdb-${params.macromoleculeType}` as DatabaseSourceId,
        query: params.query,
        totalCount: 0,
        status: 'error',
        message: err.message || 'Failed to query RCSB PDB Search API',
        items: [],
        executionTimeMs: Math.round(performance.now() - startTime)
      };
    }
  }

  public async fetchFasta(pdbId: string): Promise<string> {
    const url = this.buildStructureFileUrl(pdbId, 'fasta');
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch FASTA for PDB ${pdbId}: HTTP ${res.status}`);
    }
    return await res.text();
  }
}

export const pdbAdapter = new RCSBPDBAdapter();
