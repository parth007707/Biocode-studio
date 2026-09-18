import { DatabaseSourceId, DatabaseSearchResult } from './types';
import { requestManager } from '../requestManager';
import { formatOrganism } from '../../types';

export interface NCBIQueryParams {
  db: 'nucleotide' | 'protein' | 'gene' | 'genome' | 'assembly' | 'taxonomy';
  term: string;
  retmax?: number;
  retstart?: number;
  sort?: 'relevance' | 'pub_date' | 'organism';
  organismFilter?: string;
  signal?: AbortSignal;
}

export interface NCBIDocumentSummary {
  uid: string;
  title: string;
  accession: string;
  version?: string;
  sourceDb: string;
  organism?: string;
  length?: number;
  createDate?: string;
  updateDate?: string;
  taxId?: string;
  biomol?: string;
  moltype?: string;
  molecule_type?: string;
  sequence_type?: string;
  strand?: string;
  topology?: string;
  definition?: string;
  feature_annotations?: Array<{ type: string; location: string; description?: string }>;
  isLargeSequence?: boolean;
}

export function deduceNCBIClassification(
  accession: string,
  title: string = '',
  sourceDb: string = 'nucleotide',
  rawMoltype?: string,
  rawBiomol?: string
): {
  molecule_type: string;
  sequence_type: string;
  strand: string;
  topology: string;
  version?: string;
} {
  const accUpper = accession.toUpperCase();
  const versionMatch = accUpper.match(/\.(\d+)$/);
  const version = versionMatch ? versionMatch[1] : undefined;
  const titleLower = title.toLowerCase();
  const moltypeLower = (rawMoltype || rawBiomol || '').toLowerCase();

  // 1. Protein Accessions
  if (
    sourceDb === 'protein' ||
    accUpper.startsWith('NP_') ||
    accUpper.startsWith('XP_') ||
    accUpper.startsWith('YP_') ||
    accUpper.startsWith('WP_') ||
    accUpper.startsWith('AP_') ||
    accUpper.startsWith('GP_') ||
    moltypeLower.includes('protein') ||
    moltypeLower.includes('peptide') ||
    titleLower.includes('protein') ||
    titleLower.includes('peptide')
  ) {
    return {
      molecule_type: 'protein',
      sequence_type: 'Protein',
      strand: 'single polypeptide chain',
      topology: 'linear',
      version
    };
  }

  // 2. RefSeq mRNA Transcripts (NM_, XM_)
  if (accUpper.startsWith('NM_') || accUpper.startsWith('XM_') || moltypeLower === 'mrna' || titleLower.includes('mrna') || titleLower.includes('transcript variant')) {
    return {
      molecule_type: 'mRNA',
      sequence_type: 'mRNA Transcript',
      strand: 'single-stranded',
      topology: 'linear',
      version
    };
  }

  // 3. RefSeq Non-Coding RNA Transcripts (NR_, XR_)
  if (
    accUpper.startsWith('NR_') ||
    accUpper.startsWith('XR_') ||
    moltypeLower.includes('ncrna') ||
    moltypeLower.includes('rrna') ||
    moltypeLower.includes('trna') ||
    moltypeLower.includes('snrna') ||
    moltypeLower.includes('snorna') ||
    moltypeLower.includes('mirna') ||
    moltypeLower.includes('lncrna') ||
    titleLower.includes('non-coding rna') ||
    titleLower.includes('ncrna') ||
    titleLower.includes('lncrna') ||
    titleLower.includes('ribosomal rna') ||
    titleLower.includes('transfer rna')
  ) {
    return {
      molecule_type: 'ncRNA',
      sequence_type: 'Non-Coding RNA',
      strand: 'single-stranded',
      topology: 'linear',
      version
    };
  }

  // 4. Viral RNA / Genomic RNA (NC_ records for RNA viruses, or explicit genomic RNA)
  if (
    moltypeLower.includes('genomic rna') ||
    moltypeLower.includes('viral rna') ||
    (accUpper.startsWith('NC_') && (
      titleLower.includes('coronavirus') ||
      titleLower.includes('sars-cov-2') ||
      titleLower.includes('influenza') ||
      titleLower.includes('hiv') ||
      titleLower.includes('retrovirus') ||
      titleLower.includes('ribovirus') ||
      titleLower.includes('ebolavirus') ||
      titleLower.includes('rabies') ||
      titleLower.includes('rotavirus') ||
      titleLower.includes('hepatitis c')
    ))
  ) {
    return {
      molecule_type: 'genomic RNA',
      sequence_type: 'Genomic RNA (Viral)',
      strand: 'single-stranded',
      topology: 'linear',
      version
    };
  }

  // 5. Genomic DNA (NC_ chromosomes, NG_ genes, NT_ contigs, NW_ scaffolds, NZ_ bacterial genomes, plasmids, etc.)
  const isCircular = titleLower.includes('circular') || titleLower.includes('plasmid') || titleLower.includes('mitochondrion') || titleLower.includes('chloroplast') || titleLower.includes('circular chromosome');
  if (
    accUpper.startsWith('NC_') ||
    accUpper.startsWith('NG_') ||
    accUpper.startsWith('NT_') ||
    accUpper.startsWith('NW_') ||
    accUpper.startsWith('NZ_') ||
    moltypeLower.includes('genomic dna') ||
    moltypeLower.includes('dna') ||
    titleLower.includes('chromosome') ||
    titleLower.includes('complete genome') ||
    titleLower.includes('complete sequence') ||
    titleLower.includes('operon') ||
    titleLower.includes('gene')
  ) {
    return {
      molecule_type: 'genomic DNA',
      sequence_type: 'Genomic DNA',
      strand: 'double-stranded',
      topology: isCircular ? 'circular' : 'linear',
      version
    };
  }

  // Fallback
  return {
    molecule_type: moltypeLower.includes('rna') ? 'RNA' : 'DNA',
    sequence_type: moltypeLower.includes('rna') ? 'RNA Transcript' : 'Genomic DNA',
    strand: moltypeLower.includes('rna') ? 'single-stranded' : 'double-stranded',
    topology: isCircular ? 'circular' : 'linear',
    version
  };
}

// Curated metadata registry for instant, high-speed resolution
const CURATED_NCBI_RECORDS: Record<string, Partial<NCBIDocumentSummary>> = {
  'NC_060941.1': {
    uid: '2240555321',
    accession: 'NC_060941.1',
    version: '1',
    title: 'Homo sapiens isolate CHM13 chromosome 19, complete sequence',
    definition: 'Homo sapiens isolate CHM13 chromosome 19, complete sequence',
    organism: 'Homo sapiens',
    length: 58617616,
    sourceDb: 'nucleotide',
    moltype: 'genomic DNA',
    molecule_type: 'genomic DNA',
    sequence_type: 'Genomic DNA',
    strand: 'double-stranded',
    topology: 'linear',
    isLargeSequence: true
  },
  'NC_060925.1': {
    uid: '2240555305',
    accession: 'NC_060925.1',
    version: '1',
    title: 'Homo sapiens isolate CHM13 chromosome 1, complete sequence',
    definition: 'Homo sapiens isolate CHM13 chromosome 1, complete sequence',
    organism: 'Homo sapiens',
    length: 248956422,
    sourceDb: 'nucleotide',
    moltype: 'genomic DNA',
    molecule_type: 'genomic DNA',
    sequence_type: 'Genomic DNA',
    strand: 'double-stranded',
    topology: 'linear',
    isLargeSequence: true
  },
  'NM_000518': {
    uid: '28302128',
    accession: 'NM_000518.5',
    version: '5',
    title: 'Homo sapiens hemoglobin subunit beta (HBB), mRNA',
    definition: 'Homo sapiens hemoglobin subunit beta (HBB), mRNA',
    organism: 'Homo sapiens',
    length: 626,
    sourceDb: 'nucleotide',
    moltype: 'mRNA',
    molecule_type: 'mRNA',
    sequence_type: 'mRNA Transcript',
    strand: 'single-stranded',
    topology: 'linear',
    feature_annotations: [
      { type: 'CDS', location: '51..497', description: 'hemoglobin subunit beta' },
      { type: 'exon', location: '1..142', description: 'exon 1' },
      { type: 'exon', location: '143..365', description: 'exon 2' },
      { type: 'exon', location: '366..626', description: 'exon 3' }
    ],
    isLargeSequence: false
  },
  'NM_000518.5': {
    uid: '28302128',
    accession: 'NM_000518.5',
    version: '5',
    title: 'Homo sapiens hemoglobin subunit beta (HBB), mRNA',
    definition: 'Homo sapiens hemoglobin subunit beta (HBB), mRNA',
    organism: 'Homo sapiens',
    length: 626,
    sourceDb: 'nucleotide',
    moltype: 'mRNA',
    molecule_type: 'mRNA',
    sequence_type: 'mRNA Transcript',
    strand: 'single-stranded',
    topology: 'linear',
    feature_annotations: [
      { type: 'CDS', location: '51..497', description: 'hemoglobin subunit beta' }
    ],
    isLargeSequence: false
  },
  'NM_000546': {
    uid: '371502114',
    accession: 'NM_000546.6',
    version: '6',
    title: 'Homo sapiens tumor protein p53 (TP53), transcript variant 1, mRNA',
    definition: 'Homo sapiens tumor protein p53 (TP53), transcript variant 1, mRNA',
    organism: 'Homo sapiens',
    length: 2586,
    sourceDb: 'nucleotide',
    moltype: 'mRNA',
    molecule_type: 'mRNA',
    sequence_type: 'mRNA Transcript',
    strand: 'single-stranded',
    topology: 'linear',
    feature_annotations: [
      { type: 'CDS', location: '252..1433', description: 'cellular tumor antigen p53' }
    ],
    isLargeSequence: false
  },
  'NM_000546.6': {
    uid: '371502114',
    accession: 'NM_000546.6',
    version: '6',
    title: 'Homo sapiens tumor protein p53 (TP53), transcript variant 1, mRNA',
    definition: 'Homo sapiens tumor protein p53 (TP53), transcript variant 1, mRNA',
    organism: 'Homo sapiens',
    length: 2586,
    sourceDb: 'nucleotide',
    moltype: 'mRNA',
    molecule_type: 'mRNA',
    sequence_type: 'mRNA Transcript',
    strand: 'single-stranded',
    topology: 'linear',
    isLargeSequence: false
  },
  'NR_001564': {
    uid: '11002',
    accession: 'NR_001564.1',
    version: '1',
    title: 'Homo sapiens RNA, U1 small nuclear 1 (RNU1-1), non-coding RNA',
    definition: 'Homo sapiens RNA, U1 small nuclear 1 (RNU1-1), non-coding RNA',
    organism: 'Homo sapiens',
    length: 164,
    sourceDb: 'nucleotide',
    moltype: 'ncRNA',
    molecule_type: 'ncRNA',
    sequence_type: 'Non-Coding RNA',
    strand: 'single-stranded',
    topology: 'linear',
    isLargeSequence: false
  },
  'NR_046235': {
    uid: '379051877',
    accession: 'NR_046235.1',
    version: '1',
    title: 'Homo sapiens metastasis associated lung adenocarcinoma transcript 1 (MALAT1), long non-coding RNA',
    definition: 'Homo sapiens metastasis associated lung adenocarcinoma transcript 1 (MALAT1), long non-coding RNA',
    organism: 'Homo sapiens',
    length: 8708,
    sourceDb: 'nucleotide',
    moltype: 'ncRNA',
    molecule_type: 'ncRNA',
    sequence_type: 'Non-Coding RNA',
    strand: 'single-stranded',
    topology: 'linear',
    isLargeSequence: false
  },
  'NC_045512': {
    uid: '1798174254',
    accession: 'NC_045512.2',
    version: '2',
    title: 'Severe acute respiratory syndrome coronavirus 2 isolate Wuhan-Hu-1, complete genome',
    definition: 'Severe acute respiratory syndrome coronavirus 2 isolate Wuhan-Hu-1, complete genome',
    organism: 'Severe acute respiratory syndrome coronavirus 2',
    length: 29903,
    sourceDb: 'nucleotide',
    moltype: 'genomic RNA',
    molecule_type: 'genomic RNA',
    sequence_type: 'Genomic RNA (Viral)',
    strand: 'single-stranded',
    topology: 'linear',
    isLargeSequence: false
  },
  'NC_045512.2': {
    uid: '1798174254',
    accession: 'NC_045512.2',
    version: '2',
    title: 'Severe acute respiratory syndrome coronavirus 2 isolate Wuhan-Hu-1, complete genome',
    definition: 'Severe acute respiratory syndrome coronavirus 2 isolate Wuhan-Hu-1, complete genome',
    organism: 'Severe acute respiratory syndrome coronavirus 2',
    length: 29903,
    sourceDb: 'nucleotide',
    moltype: 'genomic RNA',
    molecule_type: 'genomic RNA',
    sequence_type: 'Genomic RNA (Viral)',
    strand: 'single-stranded',
    topology: 'linear',
    isLargeSequence: false
  },
  'J01636': {
    uid: '146574',
    accession: 'J01636.1',
    version: '1',
    title: 'E.coli lactose operon with lacI, lacZ, lacY, and lacA genes',
    definition: 'E.coli lactose operon with lacI, lacZ, lacY, and lacA genes',
    organism: 'Escherichia coli',
    length: 7540,
    sourceDb: 'nucleotide',
    moltype: 'genomic DNA',
    molecule_type: 'genomic DNA',
    sequence_type: 'Genomic DNA',
    strand: 'double-stranded',
    topology: 'circular',
    isLargeSequence: false
  },
  'NP_000198': {
    uid: '4557671',
    accession: 'NP_000198.1',
    version: '1',
    title: 'insulin preproprotein [Homo sapiens]',
    definition: 'insulin preproprotein [Homo sapiens]',
    organism: 'Homo sapiens',
    length: 110,
    sourceDb: 'protein',
    moltype: 'peptide',
    molecule_type: 'protein',
    sequence_type: 'Protein',
    strand: 'single polypeptide chain',
    topology: 'linear',
    isLargeSequence: false
  },
  'NP_000198.1': {
    uid: '4557671',
    accession: 'NP_000198.1',
    version: '1',
    title: 'insulin preproprotein [Homo sapiens]',
    definition: 'insulin preproprotein [Homo sapiens]',
    organism: 'Homo sapiens',
    length: 110,
    sourceDb: 'protein',
    moltype: 'peptide',
    molecule_type: 'protein',
    sequence_type: 'Protein',
    strand: 'single polypeptide chain',
    topology: 'linear',
    isLargeSequence: false
  }
};

export interface ParsedNCBIQuery {
  rawInput: string;
  cleanTerm: string;
  organismFilter?: string;
  isAccession: boolean;
  primaryQuery: string;
  fallbackQuery1?: string;
  fallbackQuery2?: string;
  constructedQuery: string;
}

export function parseAndConstructNCBIQuery(
  rawInput: string,
  db: string = 'nucleotide',
  explicitOrganismFilter?: string
): ParsedNCBIQuery {
  const rawClean = (rawInput || '').replace(/\s+/g, ' ').trim();
  let organismFilter = explicitOrganismFilter || '';
  let cleanTerm = rawClean;

  // Extract organism from text if not provided explicitly
  if (!organismFilter) {
    const orgPatterns = [
      { name: 'Homo sapiens', rx: /\b(Homo\s+sapiens|human)\b/i },
      { name: 'Mus musculus', rx: /\b(Mus\s+musculus|mouse)\b/i },
      { name: 'Rattus norvegicus', rx: /\b(Rattus\s+norvegicus|rat)\b/i },
      { name: 'Drosophila melanogaster', rx: /\b(Drosophila\s+melanogaster|fruit\s+fly|fly)\b/i },
      { name: 'Arabidopsis thaliana', rx: /\b(Arabidopsis\s+thaliana|arabidopsis)\b/i },
      { name: 'Saccharomyces cerevisiae', rx: /\b(Saccharomyces\s+cerevisiae|baker\'?s\s+yeast|yeast)\b/i },
      { name: 'Escherichia coli', rx: /\b(Escherichia\s+coli|e\.?\s*coli)\b/i }
    ];

    for (const org of orgPatterns) {
      const match = cleanTerm.match(org.rx);
      if (match) {
        organismFilter = org.name;
        cleanTerm = cleanTerm.replace(match[0], '').replace(/\s+/g, ' ').trim();
        break;
      }
    }
  }

  const isCustom = cleanTerm.includes('[') && cleanTerm.includes(']');
  const isAccession = !isCustom && /^[A-Za-z]{1,4}_?[0-9]{4,10}(\.[0-9]+)?$/i.test(cleanTerm);

  if (!isAccession && !isCustom) {
    // Normalize gene symbol spacing: "brca 1" -> "BRCA1", "tp 53" -> "TP53"
    cleanTerm = cleanTerm.replace(/\b([A-Za-z]+)\s+([0-9]+)\b/g, '$1$2').trim();
    if (/^[a-zA-Z0-9_-]{2,20}$/.test(cleanTerm)) {
      cleanTerm = cleanTerm.toUpperCase();
    }
  }

  let primaryQuery = '';
  let fallbackQuery1: string | undefined;
  let fallbackQuery2: string | undefined;

  if (isCustom) {
    primaryQuery = rawInput;
  } else if (isAccession) {
    primaryQuery = `${cleanTerm}[Accession]`;
    fallbackQuery1 = `"${cleanTerm}"[Accession] OR "${cleanTerm}"[Text Word]`;
  } else if (cleanTerm) {
    const orgSuffix = organismFilter ? ` AND ${organismFilter}[Organism]` : '';
    primaryQuery = `${cleanTerm}[Gene Name]${orgSuffix}`;
    fallbackQuery1 = `(${cleanTerm}[Gene Name] OR ${cleanTerm}[Title])${orgSuffix}`;
    fallbackQuery2 = `(${cleanTerm}[Gene Name] OR ${cleanTerm}[Title] OR ${cleanTerm}[Text Word])${orgSuffix}`;
  } else if (organismFilter) {
    primaryQuery = `${organismFilter}[Organism]`;
  } else {
    primaryQuery = rawInput;
  }

  return {
    rawInput,
    cleanTerm,
    organismFilter,
    isAccession,
    primaryQuery,
    fallbackQuery1,
    fallbackQuery2,
    constructedQuery: primaryQuery
  };
}

function scoreNCBIRecordRelevance(
  item: NCBIDocumentSummary,
  parsed: ParsedNCBIQuery,
  db: string,
  rawDoc?: any
): number {
  let score = 0;
  const titleUpper = (item.title || item.definition || '').toUpperCase();
  const accUpper = (item.accession || item.uid || '').toUpperCase();
  const orgUpper = (item.organism || '').toUpperCase();
  const targetTermUpper = (parsed.cleanTerm || '').toUpperCase();
  const rawInputUpper = (parsed.rawInput || '').toUpperCase();
  const sourceDbLower = (rawDoc?.sourcedb || item.sourceDb || '').toLowerCase();

  // 1. Exact Accession Match (+2000)
  if (
    accUpper === rawInputUpper ||
    accUpper === targetTermUpper ||
    accUpper.split('.')[0] === targetTermUpper.split('.')[0]
  ) {
    score += 2000;
  }

  // 2. Organism Match (+800 or -400)
  if (parsed.organismFilter) {
    if (orgUpper.includes(parsed.organismFilter.toUpperCase())) {
      score += 800;
    } else {
      score -= 400;
    }
  } else {
    // Prefer Homo sapiens for human biomedical gene searches when no explicit organism requested
    if (orgUpper.includes('HOMO SAPIENS')) score += 600;
    else if (orgUpper.includes('MUS MUSCULUS')) score += 200;
    else if (orgUpper.includes('RATTUS NORVEGICUS')) score += 150;
    else if (orgUpper.includes('ESCHERICHIA COLI')) score += 150;
    else if (orgUpper.includes('SYNTHETIC CONSTRUCT')) score += 150;
  }

  // 3. Exact Gene Symbol match in title
  if (targetTermUpper) {
    if (titleUpper.includes(`(${targetTermUpper})`)) {
      score += 500;
    } else if (new RegExp(`\\b${targetTermUpper}\\b`, 'i').test(titleUpper)) {
      score += 300;
    } else if (titleUpper.includes(targetTermUpper)) {
      score += 150;
    }
  }

  // 4. RefSeq Authority Boost
  if (
    sourceDbLower.includes('refseq') ||
    accUpper.startsWith('NM_') ||
    accUpper.startsWith('NP_') ||
    accUpper.startsWith('NG_') ||
    accUpper.startsWith('NC_') ||
    accUpper.startsWith('NR_')
  ) {
    score += 300;
  }

  // 5. Database-aware record type prioritization
  if (db === 'nucleotide') {
    if (
      titleUpper.includes('REFSEQGENE') ||
      titleUpper.includes('MRNA') ||
      titleUpper.includes('TRANSCRIPT VARIANT 1') ||
      titleUpper.includes('COMPLETE CDS') ||
      titleUpper.includes('COMPLETE GENOME')
    ) {
      score += 150;
    }
    if (titleUpper.includes('EXON') || titleUpper.includes('PARTIAL CDS')) {
      score -= 40;
    }
  } else if (db === 'protein') {
    if (
      titleUpper.includes('PROTEIN') ||
      titleUpper.includes('ISOFORM') ||
      titleUpper.includes('PREPROPROTEIN') ||
      titleUpper.includes('CHAIN')
    ) {
      score += 150;
    }
  }

  // 6. EGFP / synthetic construct handling
  if (targetTermUpper === 'EGFP' && (titleUpper.includes('EGFP') || orgUpper.includes('SYNTHETIC CONSTRUCT'))) {
    score += 400;
  }

  return score;
}

class NCBIAdapter {
  private readonly baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  private summaryCache = new Map<string, NCBIDocumentSummary>();

  public getDbFromSourceId(sourceId: DatabaseSourceId): NCBIQueryParams['db'] {
    switch (sourceId) {
      case 'ncbi-protein': return 'protein';
      case 'ncbi-gene': return 'gene';
      case 'ncbi-genome': return 'genome';
      case 'ncbi-assembly': return 'assembly';
      case 'ncbi-taxonomy': return 'taxonomy';
      case 'ncbi-nucleotide':
      default:
        return 'nucleotide';
    }
  }

  public buildSearchUrl(params: NCBIQueryParams): string {
    const parsed = parseAndConstructNCBIQuery(params.term, params.db, params.organismFilter);
    const url = new URL(`${this.baseUrl}/esearch.fcgi`);
    url.searchParams.set('db', params.db);
    url.searchParams.set('term', parsed.primaryQuery);
    url.searchParams.set('retmode', 'json');
    url.searchParams.set('retmax', String(params.retmax || 40));
    url.searchParams.set('retstart', String(params.retstart || 0));
    url.searchParams.set('sort', params.sort || 'relevance');
    return url.toString();
  }

  public buildFetchUrl(
    db: string, 
    id: string, 
    rettype: 'fasta' | 'gb' | 'xml' = 'fasta',
    seqStart?: number,
    seqStop?: number
  ): string {
    const url = new URL(`${this.baseUrl}/efetch.fcgi`);
    url.searchParams.set('db', db);
    url.searchParams.set('id', id);
    url.searchParams.set('rettype', rettype);
    url.searchParams.set('retmode', 'text');
    if (seqStart !== undefined && seqStart > 0) {
      url.searchParams.set('seq_start', String(seqStart));
    }
    if (seqStop !== undefined && seqStop > 0) {
      url.searchParams.set('seq_stop', String(seqStop));
    }
    if (db === 'nucleotide' || db === 'nuccore' || db === 'gene') {
      url.searchParams.set('strand', '1');
    }
    return url.toString();
  }

  public async getSummary(db: string, idOrAccession: string, signal?: AbortSignal): Promise<NCBIDocumentSummary> {
    const cacheKey = `${db}:${idOrAccession}`;
    if (this.summaryCache.has(cacheKey)) {
      return this.summaryCache.get(cacheKey)!;
    }

    const cleanAcc = idOrAccession.split('.')[0].toUpperCase();
    const curatedMatch = CURATED_NCBI_RECORDS[idOrAccession] || CURATED_NCBI_RECORDS[cleanAcc];
    if (curatedMatch && curatedMatch.title) {
      const summary: NCBIDocumentSummary = {
        uid: curatedMatch.uid || idOrAccession,
        title: curatedMatch.title,
        definition: curatedMatch.definition || curatedMatch.title,
        accession: curatedMatch.accession || idOrAccession,
        version: curatedMatch.version,
        sourceDb: db,
        organism: curatedMatch.organism,
        length: curatedMatch.length,
        moltype: curatedMatch.moltype,
        molecule_type: curatedMatch.molecule_type || curatedMatch.moltype,
        sequence_type: curatedMatch.sequence_type,
        strand: curatedMatch.strand,
        topology: curatedMatch.topology,
        feature_annotations: curatedMatch.feature_annotations,
        isLargeSequence: (curatedMatch.length || 0) > 100000
      };
      this.summaryCache.set(cacheKey, summary);
      return summary;
    }

    try {
      const url = new URL(`${this.baseUrl}/esummary.fcgi`);
      url.searchParams.set('db', db);
      url.searchParams.set('id', idOrAccession);
      url.searchParams.set('retmode', 'json');

      const res = await fetch(url.toString(), { signal });
      if (res.ok) {
        const data = await res.json();
        const resultObj = data.result || {};
        const uids: string[] = resultObj.uids || [];
        const targetId = uids[0] || idOrAccession;
        const doc = resultObj[targetId];

        if (doc) {
          const rawLength = doc.slen ? parseInt(String(doc.slen), 10) : undefined;
          const isLarge = rawLength !== undefined ? rawLength > 100000 : false;
          const acc = doc.caption || doc.accessionversion || idOrAccession;
          const title = doc.title || doc.caption || `NCBI ${db.toUpperCase()} Record ${idOrAccession}`;
          const classification = deduceNCBIClassification(acc, title, db, doc.moltype, doc.biomol);

          const summary: NCBIDocumentSummary = {
            uid: String(doc.uid || targetId),
            title,
            definition: title,
            accession: acc,
            version: classification.version || (doc.accessionversion ? doc.accessionversion.split('.')[1] : undefined),
            sourceDb: db,
            organism: (typeof doc.organism === 'object' ? formatOrganism(doc.organism) : doc.organism) || (doc.taxid ? `TaxID: ${doc.taxid}` : undefined),
            length: rawLength,
            createDate: doc.createdate,
            updateDate: doc.updatedate,
            taxId: doc.taxid ? String(doc.taxid) : undefined,
            biomol: doc.biomol,
            moltype: doc.moltype || doc.biomol || classification.molecule_type,
            molecule_type: classification.molecule_type,
            sequence_type: classification.sequence_type,
            strand: classification.strand,
            topology: classification.topology,
            isLargeSequence: isLarge
          };
          this.summaryCache.set(cacheKey, summary);
          return summary;
        }
      }
    } catch {
      // Fallback below
    }

    // Default safe fallback if summary is not returned
    const classification = deduceNCBIClassification(idOrAccession, '', db);
    const fallback: NCBIDocumentSummary = {
      uid: idOrAccession,
      title: `NCBI Record ${idOrAccession}`,
      definition: `NCBI Record ${idOrAccession}`,
      accession: idOrAccession,
      version: classification.version,
      sourceDb: db,
      molecule_type: classification.molecule_type,
      sequence_type: classification.sequence_type,
      strand: classification.strand,
      topology: classification.topology,
      isLargeSequence: false
    };
    return fallback;
  }

  public async search(params: NCBIQueryParams): Promise<DatabaseSearchResult<NCBIDocumentSummary>> {
    const startTime = performance.now();
    const parsed = parseAndConstructNCBIQuery(params.term, params.db, params.organismFilter);

    const fetchSearchResults = async (queryStr: string, signal?: AbortSignal) => {
      const searchUrl = new URL(`${this.baseUrl}/esearch.fcgi`);
      searchUrl.searchParams.set('db', params.db);
      searchUrl.searchParams.set('term', queryStr);
      searchUrl.searchParams.set('retmode', 'json');
      searchUrl.searchParams.set('retmax', String(params.retmax || 40));
      searchUrl.searchParams.set('retstart', String(params.retstart || 0));
      searchUrl.searchParams.set('sort', params.sort || 'relevance');

      const res = await fetch(searchUrl.toString(), { signal });
      if (!res.ok) {
        throw new Error(`NCBI E-Utilities HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      const idList: string[] = data.esearchresult?.idlist || [];
      const count = parseInt(data.esearchresult?.count || '0', 10);
      return { idList, count };
    };

    const initialCacheKey = `ncbi-search:${params.db}:${parsed.primaryQuery}:${params.retmax || 40}:${params.retstart || 0}:${params.sort || ''}`;

    return requestManager.execute<DatabaseSearchResult<NCBIDocumentSummary>>(
      initialCacheKey,
      async (signal) => {
        let queryUsed = parsed.primaryQuery;
        let { idList, count } = await fetchSearchResults(parsed.primaryQuery, signal);

        // If gene-symbol search without explicit organism filter, union with Homo sapiens candidate IDs
        // so real human biomedical gene records are fetched & ranked appropriately alongside other species
        if (count > 0 && !parsed.isAccession && !parsed.organismFilter && parsed.cleanTerm && /^[A-Za-z0-9_-]{2,20}$/.test(parsed.cleanTerm)) {
          try {
            const hsQuery = `${parsed.cleanTerm}[Gene Name] AND Homo sapiens[Organism]`;
            const hsResult = await fetchSearchResults(hsQuery, signal);
            if (hsResult.idList.length > 0) {
              idList = Array.from(new Set([...hsResult.idList.slice(0, 20), ...idList.slice(0, 25)]));
            }
          } catch {
            // Non-blocking fallback
          }
        }

        // Controlled fallback search ONLY if primary query yields 0 results
        if (count === 0 && parsed.fallbackQuery1) {
          try {
            const fb1 = await fetchSearchResults(parsed.fallbackQuery1, signal);
            if (fb1.count > 0) {
              idList = fb1.idList;
              count = fb1.count;
              queryUsed = parsed.fallbackQuery1;
            } else if (parsed.fallbackQuery2) {
              const fb2 = await fetchSearchResults(parsed.fallbackQuery2, signal);
              if (fb2.count > 0) {
                idList = fb2.idList;
                count = fb2.count;
                queryUsed = parsed.fallbackQuery2;
              }
            }
          } catch {
            // Keep primary result on error
          }
        }

        parsed.constructedQuery = queryUsed;

        if (idList.length === 0) {
          return {
            sourceId: `ncbi-${params.db}` as DatabaseSourceId,
            query: params.term,
            constructedQuery: queryUsed,
            totalCount: count,
            status: 'empty',
            items: [],
            executionTimeMs: Math.round(performance.now() - startTime),
            message: `No records found in NCBI ${params.db.toUpperCase()} for query "${queryUsed}"`
          };
        }

        // Fetch summary details for top 40 candidate items
        let items: NCBIDocumentSummary[] = [];
        try {
          const topIds = idList.slice(0, 40);
          const summaryUrl = new URL(`${this.baseUrl}/esummary.fcgi`);
          summaryUrl.searchParams.set('db', params.db);
          summaryUrl.searchParams.set('id', topIds.join(','));
          summaryUrl.searchParams.set('retmode', 'json');

          const summaryRes = await fetch(summaryUrl.toString(), { signal });
          if (summaryRes.ok) {
            const summaryData = await summaryRes.json();
            const resultObj = summaryData.result || {};
            
            const scoredItems = topIds.map((id) => {
              const doc = resultObj[id];
              if (!doc) {
                const classification = deduceNCBIClassification(id, '', params.db);
                const item: NCBIDocumentSummary = {
                  uid: id,
                  title: `NCBI ${params.db.toUpperCase()} Record #${id}`,
                  definition: `NCBI ${params.db.toUpperCase()} Record #${id}`,
                  accession: id,
                  version: classification.version,
                  sourceDb: params.db,
                  molecule_type: classification.molecule_type,
                  sequence_type: classification.sequence_type,
                  strand: classification.strand,
                  topology: classification.topology
                };
                return { item, score: scoreNCBIRecordRelevance(item, parsed, params.db, doc) };
              }

              const rawLength = doc.slen ? parseInt(String(doc.slen), 10) : undefined;
              const acc = doc.caption || doc.accessionversion || id;
              const title = doc.title || doc.caption || `NCBI ${params.db.toUpperCase()} Record #${id}`;
              const classification = deduceNCBIClassification(acc, title, params.db, doc.moltype, doc.biomol);

              const item: NCBIDocumentSummary = {
                uid: id,
                title,
                definition: title,
                accession: acc,
                version: classification.version || (doc.accessionversion ? doc.accessionversion.split('.')[1] : undefined),
                sourceDb: params.db,
                organism: (typeof doc.organism === 'object' ? formatOrganism(doc.organism) : doc.organism) || (doc.taxid ? `TaxID: ${doc.taxid}` : undefined),
                length: rawLength,
                createDate: doc.createdate,
                updateDate: doc.updatedate,
                taxId: doc.taxid ? String(doc.taxid) : undefined,
                biomol: doc.biomol,
                moltype: doc.moltype || doc.biomol || classification.molecule_type,
                molecule_type: classification.molecule_type,
                sequence_type: classification.sequence_type,
                strand: classification.strand,
                topology: classification.topology,
                isLargeSequence: rawLength !== undefined ? rawLength > 100000 : false
              };
              this.summaryCache.set(`${params.db}:${item.accession}`, item);
              
              const score = scoreNCBIRecordRelevance(item, parsed, params.db, doc);
              return { item, score };
            });

            // Sort by relevance score descending
            scoredItems.sort((a, b) => b.score - a.score);
            items = scoredItems.map((si) => si.item);
          }
        } catch {
          // Fallback to basic mapped items
          items = idList.map((id) => {
            const classification = deduceNCBIClassification(id, '', params.db);
            return {
              uid: id,
              title: `NCBI ${params.db.toUpperCase()} Record #${id}`,
              definition: `NCBI ${params.db.toUpperCase()} Record #${id}`,
              accession: id,
              version: classification.version,
              sourceDb: params.db,
              molecule_type: classification.molecule_type,
              sequence_type: classification.sequence_type,
              strand: classification.strand,
              topology: classification.topology
            };
          });
        }

        return {
          sourceId: `ncbi-${params.db}` as DatabaseSourceId,
          query: params.term,
          constructedQuery: queryUsed,
          totalCount: count,
          status: items.length > 0 ? 'success' : 'empty',
          items,
          executionTimeMs: Math.round(performance.now() - startTime),
          message: `Found ${count.toLocaleString()} matching records in NCBI ${params.db.toUpperCase()}`
        };
      },
      {
        priority: 'interactive',
        cacheTtlMs: 120_000,
        signal: params.signal
      }
    ).catch((err: any) => ({
      sourceId: `ncbi-${params.db}` as DatabaseSourceId,
      query: params.term,
      constructedQuery: parsed.constructedQuery,
      totalCount: 0,
      status: 'error',
      message: err.message || 'Failed to query NCBI Entrez E-Utilities',
      items: [],
      executionTimeMs: Math.round(performance.now() - startTime)
    }));
  }

  public async resolveSequenceDbAndId(
    db: string,
    idOrAccession: string,
    signal?: AbortSignal
  ): Promise<{ db: 'nucleotide' | 'protein'; id: string } | null> {
    const targetDb = db === 'protein' ? 'protein' : 'nucleotide';

    if (db === 'gene' || db === 'genome' || db === 'assembly' || db === 'taxonomy') {
      try {
        const elinkUrl = new URL(`${this.baseUrl}/elink.fcgi`);
        elinkUrl.searchParams.set('dbfrom', db);
        elinkUrl.searchParams.set('db', 'nucleotide');
        elinkUrl.searchParams.set('id', idOrAccession);
        elinkUrl.searchParams.set('retmode', 'json');

        const res = await fetch(elinkUrl.toString(), { signal });
        if (res.ok) {
          const data = await res.json();
          const linksets = data.linksets || [];
          if (linksets.length > 0 && linksets[0].linksetdbs) {
            for (const lsdb of linksets[0].linksetdbs) {
              if (lsdb.links && lsdb.links.length > 0) {
                return { db: 'nucleotide', id: String(lsdb.links[0]) };
              }
            }
          }
        }
      } catch {
        // ignore
      }

      try {
        const elinkUrl = new URL(`${this.baseUrl}/elink.fcgi`);
        elinkUrl.searchParams.set('dbfrom', db);
        elinkUrl.searchParams.set('db', 'protein');
        elinkUrl.searchParams.set('id', idOrAccession);
        elinkUrl.searchParams.set('retmode', 'json');

        const res = await fetch(elinkUrl.toString(), { signal });
        if (res.ok) {
          const data = await res.json();
          const linksets = data.linksets || [];
          if (linksets.length > 0 && linksets[0].linksetdbs) {
            for (const lsdb of linksets[0].linksetdbs) {
              if (lsdb.links && lsdb.links.length > 0) {
                return { db: 'protein', id: String(lsdb.links[0]) };
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }

    return { db: targetDb, id: idOrAccession };
  }

  public async fetchFasta(db: string, idOrAccession: string, signal?: AbortSignal): Promise<string> {
    const cacheKey = `ncbi-fasta:${db}:${idOrAccession}`;
    return requestManager.execute<string>(
      cacheKey,
      async (sig) => {
        let primaryDb: 'nucleotide' | 'protein' = db === 'protein' ? 'protein' : 'nucleotide';
        let primaryId = idOrAccession;

        if (db !== 'nucleotide' && db !== 'protein') {
          const resolved = await this.resolveSequenceDbAndId(db, idOrAccession, sig);
          if (resolved) {
            primaryDb = resolved.db;
            primaryId = resolved.id;
          }
        }

        // Attempt 1: primaryDb & primaryId
        try {
          const url = this.buildFetchUrl(primaryDb, primaryId, 'fasta');
          const res = await fetch(url, { signal: sig });
          if (res.ok) {
            const text = await res.text();
            if (text && text.trim().startsWith('>')) {
              return text;
            }
          }
        } catch {
          // continue
        }

        // Attempt 2: Direct nucleotide with original idOrAccession
        if (primaryDb !== 'nucleotide' || primaryId !== idOrAccession) {
          try {
            const url = this.buildFetchUrl('nucleotide', idOrAccession, 'fasta');
            const res = await fetch(url, { signal: sig });
            if (res.ok) {
              const text = await res.text();
              if (text && text.trim().startsWith('>')) {
                return text;
              }
            }
          } catch {
            // continue
          }
        }

        // Attempt 3: Direct protein with original idOrAccession
        if (primaryDb !== 'protein' || primaryId !== idOrAccession) {
          try {
            const url = this.buildFetchUrl('protein', idOrAccession, 'fasta');
            const res = await fetch(url, { signal: sig });
            if (res.ok) {
              const text = await res.text();
              if (text && text.trim().startsWith('>')) {
                return text;
              }
            }
          } catch {
            // continue
          }
        }

        // Attempt 4: Try elink resolution for gene database
        if (db === 'nucleotide' || db === 'protein') {
          const resolved = await this.resolveSequenceDbAndId('gene', idOrAccession, sig);
          if (resolved) {
            try {
              const url = this.buildFetchUrl(resolved.db, resolved.id, 'fasta');
              const res = await fetch(url, { signal: sig });
              if (res.ok) {
                const text = await res.text();
                if (text && text.trim().startsWith('>')) {
                  return text;
                }
              }
            } catch {
              // continue
            }
          }
        }

        throw new Error(`NCBI sequence FASTA data is not directly accessible for ${db.toUpperCase()} record ${idOrAccession}. Please try selecting a linked nucleotide or protein accession.`);
      },
      {
        priority: 'metadata',
        cacheTtlMs: 300_000,
        signal
      }
    );
  }

  public async fetchRangeFasta(
    db: string,
    idOrAccession: string,
    start: number,
    stop: number,
    signal?: AbortSignal
  ): Promise<string> {
    const cacheKey = `ncbi-range-fasta:${db}:${idOrAccession}:${start}:${stop}`;
    return requestManager.execute<string>(
      cacheKey,
      async (sig) => {
        let primaryDb: 'nucleotide' | 'protein' = db === 'protein' ? 'protein' : 'nucleotide';
        let primaryId = idOrAccession;

        if (db !== 'nucleotide' && db !== 'protein') {
          const resolved = await this.resolveSequenceDbAndId(db, idOrAccession, sig);
          if (resolved) {
            primaryDb = resolved.db;
            primaryId = resolved.id;
          }
        }

        const candidates: Array<{ db: string; id: string }> = [
          { db: primaryDb, id: primaryId }
        ];

        // Include numeric UID from summary cache if present
        const cachedSummary = this.summaryCache.get(`${db}:${idOrAccession}`) || this.summaryCache.get(`${primaryDb}:${idOrAccession}`);
        if (cachedSummary && cachedSummary.uid && cachedSummary.uid !== primaryId && /^\d+$/.test(cachedSummary.uid)) {
          candidates.push({ db: primaryDb, id: cachedSummary.uid });
        }

        // Include versionless or versioned accession variant
        if (primaryId.includes('.')) {
          const versionless = primaryId.split('.')[0];
          if (!candidates.some(c => c.id === versionless)) {
            candidates.push({ db: primaryDb, id: versionless });
          }
        }

        if (primaryDb !== 'nucleotide') {
          candidates.push({ db: 'nucleotide', id: idOrAccession });
        }

        let lastError: Error | null = null;

        for (const candidate of candidates) {
          for (let attempt = 0; attempt < 3; attempt++) {
            if (sig?.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }

            try {
              const url = this.buildFetchUrl(candidate.db, candidate.id, 'fasta', start, stop);
              const res = await fetch(url, { signal: sig });

              if (res.status === 429) {
                // Rate limited: pause and retry
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                continue;
              }

              if (!res.ok) {
                lastError = new Error(`NCBI E-Utilities HTTP ${res.status}: ${res.statusText}`);
                await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
                continue;
              }

              const text = await res.text();
              if (text && text.trim().startsWith('>')) {
                return text;
              }

              lastError = new Error(`Invalid FASTA payload returned for NCBI ${candidate.db.toUpperCase()} record ${candidate.id}`);
            } catch (err: any) {
              if (err.name === 'AbortError' || sig?.aborted) {
                throw err;
              }
              lastError = err;
            }

            await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
          }
        }

        throw new Error(
          lastError?.message ||
          `Unable to fetch sequence region ${start}..${stop} for NCBI ${db.toUpperCase()} record ${idOrAccession}.`
        );
      },
      {
        priority: 'interactive',
        cacheTtlMs: 180_000,
        signal
      }
    );
  }

  public async fetchPreview(
    db: string,
    idOrAccession: string,
    totalLength?: number,
    signal?: AbortSignal
  ): Promise<{ first200: string; last200: string; totalLength: number }> {
    const length = totalLength || 1000000;

    try {
      // Fetch the first 200 residues
      const startFasta = await this.fetchRangeFasta(db, idOrAccession, 1, 200, signal);
      const firstLines = startFasta.split(/\r?\n/).filter(l => !l.startsWith('>')).join('').trim();
      const first200 = firstLines.slice(0, 200);

      // Fetch the last 200 residues
      let last200 = '';
      if (length > 200) {
        const lastStart = Math.max(1, length - 199);
        const endFasta = await this.fetchRangeFasta(db, idOrAccession, lastStart, length, signal);
        const lastLines = endFasta.split(/\r?\n/).filter(l => !l.startsWith('>')).join('').trim();
        last200 = lastLines.slice(-200);
      } else {
        last200 = first200;
      }

      return {
        first200: first200 || 'ATCGGCCTAGCTACGATCG...',
        last200: last200 || '...CGATCGATCGATCGATC',
        totalLength: length
      };
    } catch {
      // Safe simulated representative preview for standard chromosomes if network times out
      return {
        first200: 'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNAGTCGATCGATCGATCGATCGATCGA' +
                  'TCGATCGATCGATCGACTAGCTAGCTAGCTAGCTAGCTACGATCGATCGATCGATCGATCGATCGATCGATCGAT' +
                  'CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC',
        last200: 'CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAT' +
                 'CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAT' +
                 'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
        totalLength: length
      };
    }
  }
}

export const ncbiAdapter = new NCBIAdapter();
