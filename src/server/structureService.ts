import crypto from 'crypto';
import {
  translateCodingNucleotideSequence,
  alignTargetToChainSequence,
  reverseComplementNucleotide,
  computeSequenceDiffMutations,
  ChainSequenceAlignment
} from '../lib/bio/structure3d/alignment';
import { parseStructureText } from '../lib/bio/structure3d/pdbParser';
import { parseBiologicalInput } from '../lib/bio/sequenceParser';
import { detectSequence } from '../lib/bio/sequenceDetector';
import { StructureCandidateSummary } from '../lib/bio/structure3d/types';

export interface ResolveStructureParams {
  sequence: string;
  sequenceId?: string;
  sequenceVersion?: string;
  sequenceHash?: string;
  accession?: string;
  sequenceType?: string;
  preferredPdbId?: string;
  allowSequenceDerivedFallback?: boolean;
  mutations?: Array<{
    position: number;
    original?: string;
    modified?: string;
    operation?: string;
    description?: string;
    lengthChange?: number;
  }>;
  originalSequence?: string;
  templatePdbId?: string;
  templatePdbText?: string;
  autoPredict?: boolean;
}

export interface StructureCoverageResult {
  startResSeq: number;
  endResSeq: number;
  coveredResiduesCount: number;
  totalSequenceLength: number;
  coveragePercent: number;
  isPartial: boolean;
  unresolvedRegions: string[];
  chain: string;
  sequenceIdentity: number;
  coverageLabel: string;
  targetToChainResSeq?: Record<number, number>;
}

export interface StructureResolutionResult {
  id: string;
  sequenceId: string;
  sequenceVersion: string;
  sequenceHash: string;
  sequenceLength: number;
  detectedPolymerType?: 'PROTEIN' | 'DNA' | 'RNA' | 'UNKNOWN';
  structureFormat: 'PDB' | 'mmCIF';
  structureType: 'EXPERIMENTAL' | 'PREDICTED' | 'PARTIAL' | 'SEQUENCE_DERIVED' | 'UNAVAILABLE';
  classification: 'Experimental' | 'Predicted' | 'Unavailable';
  source: string;
  sourceId?: string;
  matchedChainId?: string;
  sequenceIdentity?: number;
  resolution?: string;
  experimentalMethod?: string;
  predictionMethod?: string;
  confidence?: {
    metric: string;
    value: number | string;
    description: string;
  };
  coverageInfo?: StructureCoverageResult;
  missingRegions?: string[];
  parsedAtomCount: number;
  invalidAtomCount: number;
  parsedResiduesCount: number;
  candidateStructures?: StructureCandidateSummary[];
  targetProteinSequence?: string;
  translatedFromNucleotide?: boolean;
  nucleotideAccession?: string;
  ncbiProteinAccession?: string;
  uniprotAccession?: string;
  modificationRelation?: {
    hasOriginalComparison: boolean;
    diffCount: number;
    modeledDiffCount: number;
    hasIndels: boolean;
    note?: string;
  };
  predictionAvailable?: boolean;
  predictionReason?: string;
  pdbText: string;
  chainsCount: number;
  residuesCount: number;
  mutationsTracked: number;
  status: 'SYNCHRONIZED' | 'OUTDATED';
  generatedAt: string;
}

export interface StructurePredictionJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  phase: string;
  progress: number;
  sequenceHash: string;
  sequenceLength: number;
  params: ResolveStructureParams;
  structure?: StructureResolutionResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory deterministic structure cache
const structureCache = new Map<string, StructureResolutionResult>();

// In-memory prediction job queue
const jobQueue = new Map<string, StructurePredictionJob>();

const HTTP_HEADERS = {
  'User-Agent': 'BioCodeStudio/1.0 (computational-biology-workbench)',
  'Accept': 'application/json'
};

/**
 * Deterministic SHA-256 calculation for biological sequences
 */
export function calculateSequenceHash(sequence: string): string {
  const parsed = parseBiologicalInput(sequence || '');
  const clean = (parsed.sequence || sequence).toUpperCase().replace(/[^A-Z]/g, '');
  return crypto.createHash('sha256').update(clean).digest('hex');
}

function extractAccessionFromHeader(header: string): string | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  const uniProtPipe = trimmed.match(/\b(?:sp|tr)\|([A-Z0-9]{6,10})\|/i);
  if (uniProtPipe) return uniProtPipe[1].toUpperCase();
  const refPipe = trimmed.match(/\bref\|([A-Z]{2}_[0-9]+(?:\.[0-9]+)?)\|/i);
  if (refPipe) return refPipe[1].toUpperCase();
  const refSeqMatch = trimmed.match(/\b((?:NP|XP|YP|WP|AP|NM|XM|NR|XR|NC|NG)_[0-9]+(?:\.[0-9]+)?)\b/i);
  if (refSeqMatch) return refSeqMatch[1].toUpperCase();
  const pdbMatch = trimmed.match(/\b(?:pdb[:|\s]+)?([0-9][A-Z0-9]{3})(?:_[A-Z0-9])?\b/i);
  if (pdbMatch && trimmed.toLowerCase().includes('pdb')) return pdbMatch[1].toUpperCase();
  const firstToken = trimmed.split(/[\s|]+/)[0];
  if (firstToken && /^([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}|[A-Z]{3}[0-9]{5,}(?:\.[0-9]+)?)$/i.test(firstToken)) {
    return firstToken.toUpperCase();
  }
  return undefined;
}

function classifyUniversalInput(
  rawSequence: string,
  rawSequenceType?: string,
  rawAccession?: string
): {
  header: string;
  cleanSeq: string;
  accession: string;
  polymerType: 'PROTEIN' | 'DNA' | 'RNA' | 'UNKNOWN';
  invalidReason?: string;
} {
  const parsed = parseBiologicalInput(rawSequence || '');
  const rawBody = (parsed.sequence || rawSequence || '').toUpperCase().replace(/[^A-Z*]/g, '');
  const cleanSeq = rawBody.replace(/\*/g, '').replace(/[^A-Z]/g, '');
  const derivedAcc = rawAccession?.trim() || extractAccessionFromHeader(parsed.header) || '';
  const accUpper = derivedAcc.toUpperCase();

  const det = detectSequence(cleanSeq, derivedAcc ? { source: 'Direct Input', accession: derivedAcc } : null, parsed.header);
  const requested = (rawSequenceType || '').toUpperCase().trim();

  // Reject biologically invalid mixed T/U nucleic sequences that have no protein-exclusive residues
  if (det.isMixedTU && !/[EFILPQZJO]/i.test(cleanSeq)) {
    return {
      header: parsed.header,
      cleanSeq,
      accession: derivedAcc,
      polymerType: 'UNKNOWN',
      invalidReason: det.reason
    };
  }

  let polymerType: 'PROTEIN' | 'DNA' | 'RNA' = 'PROTEIN';

  if (requested === 'DNA' || requested === 'RNA' || requested === 'PROTEIN') {
    // Trust explicit type UNLESS intrinsic biology contradicts it (e.g., protein-exclusive AA in DNA, or pure RNA/DNA pasted with default 'PROTEIN')
    if ((requested === 'DNA' || requested === 'RNA') && /[EFILPQZJO]/i.test(cleanSeq)) {
      polymerType = 'PROTEIN';
    } else if (requested === 'PROTEIN' && det.detectedType === 'RNA' && !/^(NP_|XP_|YP_|WP_|AP_)/.test(accUpper)) {
      polymerType = 'RNA';
    } else if (
      requested === 'PROTEIN' &&
      det.detectedType === 'DNA' &&
      cleanSeq.length >= 6 &&
      !/^(NP_|XP_|YP_|WP_|AP_)/.test(accUpper) &&
      !/^([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2})$/.test(accUpper)
    ) {
      polymerType = 'DNA';
    } else {
      polymerType = requested as 'PROTEIN' | 'DNA' | 'RNA';
    }
  } else {
    polymerType = det.detectedType === 'DNA' || det.detectedType === 'RNA' ? det.detectedType : 'PROTEIN';
  }

  return {
    header: parsed.header,
    cleanSeq,
    accession: derivedAcc,
    polymerType
  };
}

// ============================================================================
// 1. NCBI METADATA, CDS EXTRACTION & TRANSLATION
// ============================================================================

interface NcbiCdsInfo {
  nucleotideAccession: string;
  proteinAccession?: string;
  geneSymbol?: string;
  product?: string;
  cdsIntervals: Array<{ start: number; end: number }>;
  translatedProteinSeq: string;
}

/**
 * Fetch NCBI Feature Table + FASTA (when needed) for an mRNA/nucleotide accession
 * and extract + translate the annotated Coding Sequence (CDS).
 */
async function fetchNcbiCdsAnnotation(
  accession: string,
  suppliedNucleotideSeq: string
): Promise<NcbiCdsInfo | null> {
  const cleanAcc = accession.trim().split(/\s+/)[0];
  if (!cleanAcc) return null;

  try {
    const ftUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=${encodeURIComponent(cleanAcc)}&rettype=ft&retmode=text`;
    const ftRes = await fetch(ftUrl, { headers: HTTP_HEADERS });
    if (!ftRes.ok) return null;
    const ftText = await ftRes.text();
    if (!ftText || !ftText.includes('CDS')) return null;

    const lines = ftText.split(/\r?\n/);
    const cdsIntervals: Array<{ start: number; end: number }> = [];
    let proteinAccession: string | undefined;
    let geneSymbol: string | undefined;
    let product: string | undefined;
    let currentFeature: string | null = null;

    for (const line of lines) {
      if (!line.trim() || line.startsWith('>')) continue;

      if (!line.startsWith('\t')) {
        const parts = line.split('\t');
        const start = parseInt((parts[0] || '').replace(/[<>]/g, ''), 10);
        const end = parseInt((parts[1] || '').replace(/[<>]/g, ''), 10);
        const feat = (parts[2] || '').trim();

        if (feat) {
          currentFeature = feat;
          if (feat === 'CDS' && Number.isFinite(start) && Number.isFinite(end)) {
            cdsIntervals.push({ start, end });
          }
        } else if (currentFeature === 'CDS' && Number.isFinite(start) && Number.isFinite(end)) {
          // Continuation interval for multi-exon CDS
          cdsIntervals.push({ start, end });
        }
      } else {
        const trimmed = line.replace(/^\t+/, '');
        const tabIdx = trimmed.indexOf('\t');
        const key = tabIdx >= 0 ? trimmed.slice(0, tabIdx).trim() : trimmed.trim();
        const val = tabIdx >= 0 ? trimmed.slice(tabIdx + 1).trim() : '';

        if (currentFeature === 'gene' && key === 'gene' && !geneSymbol && val) {
          geneSymbol = val;
        } else if (currentFeature === 'CDS') {
          if (key === 'protein_id' && val && !proteinAccession) {
            const m = val.match(/ref\|([^|]+)\|/) || val.match(/^([A-Z]{2,3}_[0-9]+(?:\.[0-9]+)?|[A-Z]{3}[0-9]{5,}(?:\.[0-9]+)?)$/);
            proteinAccession = m ? m[1] : val.replace(/^.*\|([^|]+)\|?$/, '$1');
          } else if (key === 'product' && val && !product) {
            product = val;
          }
        }
      }
    }

    if (cdsIntervals.length === 0) return null;

    // Ensure we have full nucleotide transcript to slice exact CDS coordinates cleanly
    let transcriptSeq = suppliedNucleotideSeq.toUpperCase().replace(/[^ATCGUN]/g, '').replace(/U/g, 'T');
    const maxCoord = Math.max(...cdsIntervals.map(iv => Math.max(iv.start, iv.end)));

    if (transcriptSeq.length < maxCoord) {
      try {
        const faUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=${encodeURIComponent(cleanAcc)}&rettype=fasta&retmode=text`;
        const faRes = await fetch(faUrl, { headers: HTTP_HEADERS });
        if (faRes.ok) {
          const faText = await faRes.text();
          const parsedSeq = faText
            .split(/\r?\n/)
            .filter(l => !l.startsWith('>'))
            .join('')
            .toUpperCase()
            .replace(/U/g, 'T')
            .replace(/[^ATCGN]/g, '');
          if (parsedSeq.length >= maxCoord) {
            transcriptSeq = parsedSeq;
          }
        }
      } catch {}
    }

    let cdsNucleotides = '';
    for (const iv of cdsIntervals) {
      if (iv.start <= iv.end && iv.end <= transcriptSeq.length) {
        cdsNucleotides += transcriptSeq.slice(iv.start - 1, iv.end);
      }
    }

    let translatedProteinSeq = cdsNucleotides.length >= 9
      ? translateCodingNucleotideSequence(cdsNucleotides)
      : '';

    // Cross-fetch NCBI protein FASTA if CDS coordinates weren't complete in supplied fragment
    if (translatedProteinSeq.length < 10 && proteinAccession) {
      try {
        const protRes = await fetch(
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=protein&id=${encodeURIComponent(proteinAccession)}&rettype=fasta&retmode=text`,
          { headers: HTTP_HEADERS }
        );
        if (protRes.ok) {
          const protFa = await protRes.text();
          translatedProteinSeq = protFa
            .split(/\r?\n/)
            .filter(l => !l.startsWith('>'))
            .join('')
            .toUpperCase()
            .replace(/[^A-Z]/g, '');
        }
      } catch {}
    }

    if (!translatedProteinSeq) return null;

    return {
      nucleotideAccession: cleanAcc,
      proteinAccession,
      geneSymbol,
      product,
      cdsIntervals,
      translatedProteinSeq
    };
  } catch (err) {
    console.warn('[StructureService] NCBI CDS annotation fetch warning:', err);
    return null;
  }
}

// ============================================================================
// 2. UNIPROT MAPPING (ACCESSION, REFSEQ XREF & PDB CROSS-REFERENCES)
// ============================================================================

interface UniProtPdbXref {
  pdbId: string;
  method?: string;
  resolution?: string;
  resolutionNumeric?: number;
  chains?: string;
  spanLength: number;
}

interface UniProtRecordSummary {
  accession: string;
  entryName?: string;
  proteinName?: string;
  organism?: string;
  canonicalSequence: string;
  pdbXrefs: UniProtPdbXref[];
}

function parseUniProtChainSpan(chainsText?: string): number {
  if (!chainsText) return 0;
  // Example: "A/B/C=94-312" or "B=15-29" or "A=1-393, B=1-50"
  let maxSpan = 0;
  const matches = chainsText.matchAll(/(\d+)\s*-\s*(\d+)/g);
  for (const m of matches) {
    const start = parseInt(m[1], 10);
    const end = parseInt(m[2], 10);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      maxSpan = Math.max(maxSpan, end - start + 1);
    }
  }
  return maxSpan;
}

function extractUniProtSummary(entry: any): UniProtRecordSummary | null {
  if (!entry || !entry.primaryAccession) return null;
  const xrefs: UniProtPdbXref[] = [];
  for (const xr of entry.uniProtKBCrossReferences || []) {
    if (xr.database === 'PDB' && xr.id) {
      const props: Record<string, string> = {};
      for (const p of xr.properties || []) {
        if (p.key && p.value) props[p.key] = p.value;
      }
      const resStr = props.Resolution;
      const resNum = resStr ? parseFloat(resStr) : undefined;
      xrefs.push({
        pdbId: String(xr.id).toUpperCase(),
        method: props.Method,
        resolution: resStr && resStr !== '-' ? resStr.replace(/\s*A$/, ' Å') : undefined,
        resolutionNumeric: Number.isFinite(resNum) ? resNum : undefined,
        chains: props.Chains,
        spanLength: parseUniProtChainSpan(props.Chains)
      });
    }
  }

  // Prefer higher chain span & better resolution
  xrefs.sort((a, b) => {
    if (b.spanLength !== a.spanLength) return b.spanLength - a.spanLength;
    return (a.resolutionNumeric ?? 99) - (b.resolutionNumeric ?? 99);
  });

  return {
    accession: String(entry.primaryAccession).toUpperCase(),
    entryName: entry.uniProtkbId,
    proteinName: entry.proteinDescription?.recommendedName?.fullName?.value,
    organism: entry.organism?.scientificName,
    canonicalSequence: String(entry.sequence?.value || '').toUpperCase().replace(/[^A-Z]/g, ''),
    pdbXrefs: xrefs
  };
}

async function resolveUniProtRecord(
  accessionsToTry: string[],
  proteinSeq: string
): Promise<UniProtRecordSummary | null> {
  // 1. Direct UniProt accession or entry name check (e.g. P68871 or HBB_HUMAN)
  for (const acc of accessionsToTry) {
    const clean = acc.trim().toUpperCase();
    const isUpAcc = /^([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2})$/.test(clean);
    const isUpEntryName = /^[A-Z0-9]{2,6}_[A-Z0-9]{2,6}$/.test(clean) && !clean.startsWith('NM_') && !clean.startsWith('NP_') && !clean.startsWith('NC_') && !clean.startsWith('NR_') && !clean.startsWith('XM_') && !clean.startsWith('XP_');
    if (isUpAcc || isUpEntryName) {
      try {
        const url = isUpAcc
          ? `https://rest.uniprot.org/uniprotkb/${encodeURIComponent(clean)}.json?fields=accession,id,protein_name,organism_name,sequence,xref_pdb,xref_refseq`
          : `https://rest.uniprot.org/uniprotkb/search?query=id:${encodeURIComponent(clean)}&fields=accession,id,protein_name,organism_name,sequence,xref_pdb,xref_refseq&format=json&size=1`;
        const res = await fetch(url, { headers: HTTP_HEADERS });
        if (res.ok) {
          const data = await res.json();
          const entry = isUpAcc ? data : data.results?.[0];
          const parsed = extractUniProtSummary(entry);
          if (parsed) return parsed;
        }
      } catch {}
    }
  }

  // 2. RefSeq / NCBI / EMBL cross-reference query (reviewed Swiss-Prot prioritized)
  for (const acc of accessionsToTry) {
    const clean = acc.trim();
    const accNoVer = clean.split('.')[0];
    if (!clean || clean.length < 4) continue;
    try {
      const q = `((xref:refseq-${clean}) OR (xref:refseq-${accNoVer}) OR (xref:embl-${clean}) OR (xref:embl-${accNoVer})) AND reviewed:true`;
      const url = `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(q)}&fields=accession,id,reviewed,protein_name,organism_name,sequence,xref_pdb,xref_refseq&format=json&size=3`;
      const res = await fetch(url, { headers: HTTP_HEADERS });
      if (res.ok) {
        const data = await res.json();
        const hit = data.results?.[0];
        const parsed = extractUniProtSummary(hit);
        if (parsed) return parsed;
      }

      // Retry without reviewed constraint if only TrEMBL exists
      const qAny = `(xref:refseq-${clean}) OR (xref:refseq-${accNoVer}) OR (xref:embl-${clean}) OR (xref:embl-${accNoVer})`;
      const resAny = await fetch(
        `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(qAny)}&fields=accession,id,reviewed,protein_name,organism_name,sequence,xref_pdb,xref_refseq&format=json&size=3`,
        { headers: HTTP_HEADERS }
      );
      if (resAny.ok) {
        const dataAny = await resAny.json();
        const parsedAny = extractUniProtSummary(dataAny.results?.[0]);
        if (parsedAny) return parsedAny;
      }
    } catch {}
  }

  // 3. Fallback: RCSB polymer entity -> UniProt ID via protein sequence search
  if (proteinSeq.length >= 25) {
    const rcsbHits = await searchRcsbExperimentalMatches(proteinSeq, 'protein', 3);
    if (rcsbHits.length > 0) {
      const top = rcsbHits[0];
      try {
        const entRes = await fetch(
          `https://data.rcsb.org/rest/v1/core/polymer_entity/${top.pdbId}/${top.entityId || '1'}`,
          { headers: HTTP_HEADERS }
        );
        if (entRes.ok) {
          const ent = await entRes.json();
          const upIds: string[] = ent.rcsb_polymer_entity_container_identifiers?.uniprot_ids || [];
          if (upIds[0]) {
            const upRes = await fetch(
              `https://rest.uniprot.org/uniprotkb/${encodeURIComponent(upIds[0])}.json?fields=accession,id,protein_name,organism_name,sequence,xref_pdb,xref_refseq`,
              { headers: HTTP_HEADERS }
            );
            if (upRes.ok) {
              const parsed = extractUniProtSummary(await upRes.json());
              if (parsed) return parsed;
            }
          }
        }
      } catch {}
    }
  }

  return null;
}

// ============================================================================
// 3. RCSB PDB & ALPHAFOLD DB SEARCH AND COORDINATE DOWNLOAD
// ============================================================================

async function searchAlphaFoldDb(uniprotId: string): Promise<{
  pdbUrl: string;
  cifUrl?: string;
  modelEntityId: string;
  globalMetricValue: number;
  toolUsed: string;
} | null> {
  try {
    const res = await fetch(
      `https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(uniprotId)}`,
      { headers: HTTP_HEADERS }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data[0] && (data[0].pdbUrl || data[0].cifUrl)) {
      return {
        pdbUrl: data[0].pdbUrl,
        cifUrl: data[0].cifUrl,
        modelEntityId: data[0].modelEntityId || `AF-${uniprotId}-F1`,
        globalMetricValue: Number(data[0].globalMetricValue) || 0,
        toolUsed: data[0].toolUsed || 'AlphaFold Monomer v2.0 pipeline'
      };
    }
    return null;
  } catch (err) {
    console.warn('[StructureService] AlphaFold DB lookup warning:', err);
    return null;
  }
}

async function searchRcsbExperimentalMatches(
  cleanSeq: string,
  seqType: 'protein' | 'dna' | 'rna' = 'protein',
  rows: number = 8
): Promise<Array<{ pdbId: string; entityId: string; score?: number }>> {
  const parseRcsbResultSet = (data: any): Array<{ pdbId: string; entityId: string; score?: number }> => {
    const out: Array<{ pdbId: string; entityId: string; score?: number }> = [];
    for (const item of data?.result_set || []) {
      const [pdbId, entityId] = String(item.identifier || '').split('_');
      if (pdbId && pdbId.length === 4) {
        out.push({
          pdbId: pdbId.toUpperCase(),
          entityId: entityId || '1',
          score: item.score
        });
      }
    }
    return out;
  };

  try {
    const adaptiveEvalue = cleanSeq.length < 40 ? 25 : cleanSeq.length < 80 ? 1.0 : 0.05;
    const seqQuery = {
      query: {
        type: 'group',
        logical_operator: 'and',
        nodes: [
          {
            type: 'terminal',
            service: 'sequence',
            parameters: {
              evalue_cutoff: adaptiveEvalue,
              identity_cutoff: 0.70,
              sequence_type: seqType,
              value: cleanSeq
            }
          },
          {
            type: 'terminal',
            service: 'text',
            parameters: {
              attribute: 'exptl.method',
              operator: 'in',
              value: ['X-RAY DIFFRACTION', 'CRYO-ELECTRON MICROSCOPY', 'SOLUTION NMR']
            }
          }
        ]
      },
      request_options: {
        sort: [{ sort_by: 'score', direction: 'desc' }],
        paginate: { start: 0, rows }
      },
      return_type: 'polymer_entity'
    };

    const res = await fetch('https://search.rcsb.org/rcsbsearch/v2/query', {
      method: 'POST',
      headers: {
        ...HTTP_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(seqQuery)
    });

    if (res.ok && res.status !== 204) {
      const text = await res.text();
      if (text && text.trim()) {
        const hits = parseRcsbResultSet(JSON.parse(text));
        if (hits.length > 0) return hits;
      }
    }

    // Fallback to RCSB seqmotif search for short peptides & synthetic DNA/RNA oligomers (6–60 nt/aa)
    // where MMseqs2 sequence search returns 204 due to minimum k-mer/word thresholds.
    if (cleanSeq.length >= 6 && cleanSeq.length <= 60) {
      const motifQuery = {
        query: {
          type: 'group',
          logical_operator: 'and',
          nodes: [
            {
              type: 'terminal',
              service: 'seqmotif',
              parameters: {
                value: cleanSeq,
                pattern_type: 'simple',
                sequence_type: seqType
              }
            },
            {
              type: 'terminal',
              service: 'text',
              parameters: {
                attribute: 'exptl.method',
                operator: 'in',
                value: ['X-RAY DIFFRACTION', 'CRYO-ELECTRON MICROSCOPY', 'SOLUTION NMR']
              }
            }
          ]
        },
        request_options: {
          sort: [{ sort_by: 'score', direction: 'desc' }],
          paginate: { start: 0, rows }
        },
        return_type: 'polymer_entity'
      };

      const mRes = await fetch('https://search.rcsb.org/rcsbsearch/v2/query', {
        method: 'POST',
        headers: {
          ...HTTP_HEADERS,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(motifQuery)
      });

      if (mRes.ok && mRes.status !== 204) {
        const mText = await mRes.text();
        if (mText && mText.trim()) {
          return parseRcsbResultSet(JSON.parse(mText));
        }
      }
    }

    return [];
  } catch (err) {
    console.warn('[StructureService] RCSB sequence search warning:', err);
    return [];
  }
}

async function fetchRcsbEntryDetails(pdbId: string): Promise<{
  title?: string;
  resolution?: string;
  method?: string;
}> {
  try {
    const res = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${pdbId.toUpperCase()}`, {
      headers: HTTP_HEADERS
    });
    if (!res.ok) return {};
    const d = await res.json();
    const resVal = d.rcsb_entry_info?.resolution_combined?.[0];
    const resolution = typeof resVal === 'number' ? `${resVal.toFixed(2)} Å` : undefined;
    const method = d.exptl?.[0]?.method || d.rcsb_entry_info?.experimental_method;
    const title = d.struct?.title;
    return { title, resolution, method };
  } catch {
    return {};
  }
}

async function downloadRcsbCoordinates(pdbId: string): Promise<{
  text: string;
  format: 'PDB' | 'mmCIF';
} | null> {
  const upperId = pdbId.trim().toUpperCase();
  // Try .pdb first, then .cif mmCIF fallback for large complexes / modern deposits
  try {
    const pdbRes = await fetch(`https://files.rcsb.org/download/${upperId}.pdb`, {
      headers: { 'User-Agent': HTTP_HEADERS['User-Agent'] }
    });
    if (pdbRes.ok) {
      const text = await pdbRes.text();
      if (text.includes('ATOM') || text.includes('HETATM')) {
        return { text, format: 'PDB' };
      }
    }
  } catch {}

  try {
    const cifRes = await fetch(`https://files.rcsb.org/download/${upperId}.cif`, {
      headers: { 'User-Agent': HTTP_HEADERS['User-Agent'] }
    });
    if (cifRes.ok) {
      const text = await cifRes.text();
      if (text.includes('_atom_site.')) {
        return { text, format: 'mmCIF' };
      }
    }
  } catch {}

  return null;
}

// ============================================================================
// 4. MUTATION MODELING ON VERIFIED COORDINATES
// ============================================================================

const AA_1TO3: Record<string, string> = {
  A: 'ALA', R: 'ARG', N: 'ASN', D: 'ASP', C: 'CYS',
  Q: 'GLN', E: 'GLU', G: 'GLY', H: 'HIS', I: 'ILE',
  L: 'LEU', K: 'LYS', M: 'MET', F: 'PHE', P: 'PRO',
  S: 'SER', T: 'THR', W: 'TRP', Y: 'TYR', V: 'VAL'
};

const AA_ATOMS: Record<string, Set<string>> = {
  ALA: new Set(['N', 'CA', 'C', 'O', 'CB']),
  ARG: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG', 'CD', 'NE', 'CZ', 'NH1', 'NH2']),
  ASN: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG', 'OD1', 'ND2']),
  ASP: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG', 'OD1', 'OD2']),
  CYS: new Set(['N', 'CA', 'C', 'O', 'CB', 'SG']),
  GLN: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG', 'CD', 'OE1', 'NE2']),
  GLU: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG', 'CD', 'OE1', 'OE2']),
  GLY: new Set(['N', 'CA', 'C', 'O']),
  HIS: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG', 'ND1', 'CD2', 'CE1', 'NE2']),
  ILE: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG1', 'CG2', 'CD1']),
  LEU: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG', 'CD1', 'CD2']),
  LYS: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG', 'CD', 'CE', 'NZ']),
  MET: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG', 'SD', 'CE']),
  PHE: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG', 'CD1', 'CD2', 'CE1', 'CE2', 'CZ']),
  PRO: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG', 'CD']),
  SER: new Set(['N', 'CA', 'C', 'O', 'CB', 'OG']),
  THR: new Set(['N', 'CA', 'C', 'O', 'CB', 'OG1', 'CG2']),
  TRP: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG', 'CD1', 'CD2', 'NE1', 'CE2', 'CE3', 'CZ2', 'CZ3', 'CH2']),
  TYR: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG', 'CD1', 'CD2', 'CE1', 'CE2', 'CZ', 'OH']),
  VAL: new Set(['N', 'CA', 'C', 'O', 'CB', 'CG1', 'CG2'])
};

function applyMutationsToPdb(
  basePdbText: string,
  mutations: Array<{ position: number; modified?: string; original?: string; operation?: string; lengthChange?: number }>,
  templateId: string,
  targetChain?: string,
  targetToChainResSeq?: Record<number, number>
): { pdbText: string; modeledCount: number; modeledPositions: number[] } {
  if (!mutations || mutations.length === 0) {
    return { pdbText: basePdbText, modeledCount: 0, modeledPositions: [] };
  }

  // Translate 1-based sequence mutation positions to PDB resSeq using alignment map when present
  const pdbPosToTargetPos = new Map<number, number>();
  const subByPdbResSeq = new Map<number, { targetPos: number; code3: string }>();
  const deletedPdbResSeqs = new Set<number>();

  for (const m of mutations) {
    const pdbResSeq = targetToChainResSeq?.[m.position] ?? m.position;
    pdbPosToTargetPos.set(pdbResSeq, m.position);
    const op = (m.operation || 'substitution').toLowerCase();
    if (op === 'deletion') {
      deletedPdbResSeqs.add(pdbResSeq);
    } else if (op === 'substitution' && m.modified) {
      subByPdbResSeq.set(pdbResSeq, {
        targetPos: m.position,
        code3: AA_1TO3[m.modified.toUpperCase()] || 'ALA'
      });
    }
  }

  const lines = basePdbText.split('\n');
  const modifiedLines: string[] = [
    `HEADER    COMPARATIVE MUTATION MODEL                    ${new Date().toISOString().slice(0, 10)}`,
    `TITLE     MUTATED MODEL BASED ON TEMPLATE: ${templateId}`,
    `REMARK   4 TEMPLATE COORDINATES: ${templateId}`
  ];

  const modeledTargetPositions = new Set<number>();

  for (const line of lines) {
    if (line.startsWith('HEADER') || line.startsWith('TITLE')) continue;

    if (line.startsWith('ATOM  ') || line.startsWith('HETATM')) {
      const lineChain = line.substring(21, 22).trim() || 'A';
      const origResSeq = parseInt(line.substring(22, 26).trim(), 10);

      if (Number.isFinite(origResSeq) && (!targetChain || lineChain === targetChain)) {
        if (deletedPdbResSeqs.has(origResSeq)) {
          const tp = pdbPosToTargetPos.get(origResSeq);
          if (tp !== undefined) modeledTargetPositions.add(tp);
          continue;
        }

        const sub = subByPdbResSeq.get(origResSeq);
        if (sub) {
          modeledTargetPositions.add(sub.targetPos);
          const atomName = line.substring(12, 16).trim();
          const validAtoms = AA_ATOMS[sub.code3];
          if (validAtoms && !validAtoms.has(atomName)) {
            continue;
          }
          modifiedLines.push(line.substring(0, 17) + sub.code3.padEnd(3, ' ') + line.substring(20));
          continue;
        }
      }
    }
    modifiedLines.push(line);
  }

  const modeledPositions = Array.from(modeledTargetPositions).sort((a, b) => a - b);
  return {
    pdbText: modifiedLines.join('\n'),
    modeledCount: modeledPositions.length,
    modeledPositions
  };
}

// ============================================================================
// 5. CHAIN ALIGNMENT & COORDINATE EVALUATION
// ============================================================================

function evaluateCoordinateStructure(
  coordText: string,
  format: 'PDB' | 'mmCIF',
  structureId: string,
  targetSequence: string,
  expectedPolymerType: 'PROTEIN' | 'DNA' | 'RNA'
): {
  parsedAtomCount: number;
  invalidAtomCount: number;
  parsedResiduesCount: number;
  chainsCount: number;
  matchedChainLength: number;
  usedReverseComplement?: boolean;
  bestAlignment: ChainSequenceAlignment | null;
} {
  const parsed = parseStructureText(coordText, structureId, format);
  const matchingChains = parsed.chains.filter(c => {
    if (expectedPolymerType === 'PROTEIN') return c.type === 'PROTEIN';
    return c.type === 'DNA' || c.type === 'RNA';
  });

  const candidateChains = matchingChains.length > 0 ? matchingChains : parsed.chains;
  let bestAlignment: ChainSequenceAlignment | null = null;
  let matchedChainLength = 0;
  let usedReverseComplement = false;

  for (const chain of candidateChains) {
    if (!chain.residues || chain.residues.length === 0) continue;
    const chainSeq = chain.residues.map(r => r.code1).join('');
    const chainResSeqs = chain.residues.map(r => r.resSeq);
    const aln = alignTargetToChainSequence(targetSequence, chain.id, chainSeq, chainResSeqs, expectedPolymerType);

    if (!bestAlignment || aln.score > bestAlignment.score) {
      bestAlignment = aln;
      matchedChainLength = chain.residues.length;
      usedReverseComplement = false;
    }
  }

  // For DNA duplexes, also check reverse complement if forward strand did not reach strong alignment
  if (
    expectedPolymerType === 'DNA' &&
    (!bestAlignment || bestAlignment.sequenceIdentity < 75 || bestAlignment.alignedLength < Math.min(targetSequence.length, 8))
  ) {
    const rcSeq = reverseComplementNucleotide(targetSequence, false);
    for (const chain of candidateChains) {
      if (!chain.residues || chain.residues.length === 0) continue;
      const chainSeq = chain.residues.map(r => r.code1).join('');
      const chainResSeqs = chain.residues.map(r => r.resSeq);
      const aln = alignTargetToChainSequence(rcSeq, chain.id, chainSeq, chainResSeqs, 'DNA');
      if (!bestAlignment || aln.score > bestAlignment.score) {
        bestAlignment = aln;
        matchedChainLength = chain.residues.length;
        usedReverseComplement = true;
      }
    }
  }

  return {
    parsedAtomCount: parsed.parsedAtomCount ?? parsed.allAtoms.length,
    invalidAtomCount: parsed.invalidAtomCount ?? 0,
    parsedResiduesCount: parsed.parsedResiduesCount ?? parsed.chains.reduce((s, c) => s + c.residues.length, 0),
    chainsCount: parsed.chains.length,
    matchedChainLength,
    usedReverseComplement,
    bestAlignment
  };
}

// ============================================================================
// 6. MASTER REAL STRUCTURE RESOLUTION ENGINE
// ============================================================================

export async function resolveStructureForSequence(
  params: ResolveStructureParams
): Promise<StructureResolutionResult> {
  const {
    sequence,
    sequenceId = 'seq_unknown',
    sequenceVersion = 'v1',
    accession: rawAccession,
    sequenceType: rawSequenceType,
    preferredPdbId,
    mutations: rawMutations = [],
    originalSequence,
    templatePdbId,
    templatePdbText,
    autoPredict = false
  } = params;

  const classified = classifyUniversalInput(sequence, rawSequenceType, rawAccession);
  const cleanSeq = classified.cleanSeq;
  const accession = classified.accession;
  const parsedOrig = originalSequence ? parseBiologicalInput(originalSequence) : null;
  const cleanOrigSeq = (parsedOrig?.sequence || originalSequence || cleanSeq).toUpperCase().replace(/[^A-Z]/g, '');
  const seqHash = calculateSequenceHash(cleanSeq);
  const origHash = calculateSequenceHash(cleanOrigSeq);
  const requestedId = (preferredPdbId || templatePdbId || '').trim().toUpperCase();

  // Compute mutations automatically if originalSequence differs and caller didn't pass explicit mutation array
  const effectiveMutations = (rawMutations && rawMutations.length > 0)
    ? rawMutations
    : (cleanOrigSeq && cleanSeq && cleanOrigSeq !== cleanSeq
        ? computeSequenceDiffMutations(cleanOrigSeq, cleanSeq)
        : []);

  const hasIndels = effectiveMutations.some(m => {
    const op = (m.operation || 'substitution').toLowerCase();
    return op === 'insertion' || op === 'deletion' || (typeof m.lengthChange === 'number' && m.lengthChange !== 0);
  });
  const mutSig = effectiveMutations.map(m => `${m.position}:${m.original || ''}>${m.modified || ''}:${m.operation || 'sub'}`).join('|');

  if (classified.polymerType === 'UNKNOWN') {
    return buildUnavailableResult(
      sequenceId,
      sequenceVersion,
      seqHash,
      cleanSeq.length,
      classified.invalidReason || 'Unable to classify sequence into DNA, RNA, or Protein.'
    );
  }

  const sequenceType = classified.polymerType;
  const cacheKey = `${seqHash}_${origHash}_${mutSig}_${sequenceVersion}_${sequenceType}_${accession || ''}_${requestedId}_${autoPredict ? 'pred' : 'nopred'}`;
  if (structureCache.has(cacheKey)) {
    const cached = structureCache.get(cacheKey)!;
    return { ...cached, status: 'SYNCHRONIZED' };
  }

  console.log(
    `[StructureService] Resolving genuine structure for ${accession || sequenceId} (type=${sequenceType}, len=${cleanSeq.length}, diffs=${effectiveMutations.length}, preferred=${requestedId || 'auto'})`
  );

  if (!cleanSeq || cleanSeq.length < 4) {
    return buildUnavailableResult(sequenceId, sequenceVersion, seqHash, cleanSeq.length,
      'Sequence length (< 4 residues) is too short for macromolecular structure resolution.');
  }

  // Step 1: If nucleotide (DNA/RNA), search experimental NA PDBs first (up to 5000 nt),
  // OR resolve annotated NCBI coding sequence (CDS) -> encoded protein structure.
  let targetProteinSeq = sequenceType === 'PROTEIN' ? cleanSeq : '';
  let targetPolymerType: 'PROTEIN' | 'DNA' | 'RNA' = sequenceType === 'PROTEIN' ? 'PROTEIN' : (sequenceType === 'RNA' ? 'RNA' : 'DNA');
  let ncbiCdsInfo: NcbiCdsInfo | null = null;
  let comparisonBaseSeq = sequenceType === 'PROTEIN' ? cleanOrigSeq : '';

  if (sequenceType === 'DNA' || sequenceType === 'RNA') {
    const cleanAcc = accession?.trim() || '';
    const isAccessionPdbCode = /^[0-9][A-Z0-9]{3}$/i.test(cleanAcc);

    // 1A. Search RCSB PDB directly for genuine DNA / RNA experimental structures
    if (cleanOrigSeq.length >= 6 && cleanOrigSeq.length <= 5000) {
      const naMatches = await searchRcsbExperimentalMatches(cleanOrigSeq, sequenceType === 'RNA' ? 'rna' : 'dna', 8);
      const naCandidatesToTry: string[] = [];
      if (/^[0-9][A-Z0-9]{3}$/i.test(requestedId)) naCandidatesToTry.push(requestedId);
      if (isAccessionPdbCode && !naCandidatesToTry.includes(cleanAcc.toUpperCase())) {
        naCandidatesToTry.push(cleanAcc.toUpperCase());
      }
      for (const hit of naMatches) {
        if (!naCandidatesToTry.includes(hit.pdbId) && naCandidatesToTry.length < 5) {
          naCandidatesToTry.push(hit.pdbId);
        }
      }

      const naCandidateSummaries: StructureCandidateSummary[] = naMatches.map(m => ({
        id: m.pdbId,
        source: 'RCSB PDB',
        classification: 'Experimental'
      }));

      let bestNaResult: StructureResolutionResult | null = null;
      let bestNaRank = -1;

      for (const pdbId of naCandidatesToTry) {
        const dl = await downloadRcsbCoordinates(pdbId);
        if (!dl) continue;
        const evalRes = evaluateCoordinateStructure(dl.text, dl.format, pdbId, cleanOrigSeq, sequenceType);
        const aln = evalRes.bestAlignment;
        if (evalRes.parsedAtomCount === 0 || !aln) continue;

        const minAligned = Math.min(cleanOrigSeq.length, 8);
        if (aln.sequenceIdentity < 75 || aln.alignedLength < minAligned) continue;

        const compactness = aln.alignedLength / Math.max(aln.alignedLength, evalRes.matchedChainLength || aln.alignedLength);
        const rankScore = aln.coveredResiduesCount * (aln.sequenceIdentity / 100) * (0.5 + 0.5 * compactness);

        if (requestedId === pdbId || rankScore > bestNaRank) {
          bestNaRank = rankScore;
          const details = await fetchRcsbEntryDetails(pdbId);
          const isPartial = aln.coveragePercent < 95;
          bestNaResult = {
            id: `struct_${pdbId}_ch${aln.chainId}_${seqHash.slice(0, 8)}`,
            sequenceId,
            sequenceVersion,
            sequenceHash: seqHash,
            sequenceLength: cleanSeq.length,
            detectedPolymerType: sequenceType,
            structureFormat: dl.format,
            structureType: isPartial ? 'PARTIAL' : 'EXPERIMENTAL',
            classification: 'Experimental',
            source: 'RCSB PDB',
            sourceId: pdbId,
            matchedChainId: aln.chainId,
            sequenceIdentity: aln.sequenceIdentity,
            resolution: details.resolution,
            experimentalMethod: details.method || 'X-ray Diffraction',
            confidence: {
              metric: 'Sequence Alignment',
              value: `${aln.sequenceIdentity}% identity · ${aln.coveragePercent}% coverage`,
              description: `${details.title ? `${details.title}. ` : ''}Experimental ${sequenceType} chain ${aln.chainId}${evalRes.usedReverseComplement ? ' (complementary strand)' : ''}.`
            },
            coverageInfo: {
              startResSeq: aln.targetStart || 1,
              endResSeq: aln.targetEnd || cleanSeq.length,
              coveredResiduesCount: aln.coveredResiduesCount,
              totalSequenceLength: cleanSeq.length,
              coveragePercent: aln.coveragePercent,
              isPartial,
              unresolvedRegions: aln.missingRegions,
              chain: aln.chainId,
              sequenceIdentity: aln.sequenceIdentity,
              coverageLabel: `Chain ${aln.chainId}: ${aln.coveredResiduesCount} / ${cleanSeq.length} nt (${aln.coveragePercent}% coverage, ${aln.sequenceIdentity}% identity)`,
              targetToChainResSeq: aln.targetToChainResSeq
            },
            missingRegions: aln.missingRegions,
            parsedAtomCount: evalRes.parsedAtomCount,
            invalidAtomCount: evalRes.invalidAtomCount,
            parsedResiduesCount: evalRes.parsedResiduesCount,
            candidateStructures: naCandidateSummaries,
            modificationRelation: cleanOrigSeq !== cleanSeq ? {
              hasOriginalComparison: true,
              diffCount: effectiveMutations.length,
              modeledDiffCount: 0,
              hasIndels,
              note: 'Aligned to baseline nucleic acid template; experimental coordinate editing is read-only for nucleotide bases.'
            } : undefined,
            pdbText: dl.text,
            chainsCount: evalRes.chainsCount,
            residuesCount: evalRes.parsedResiduesCount,
            mutationsTracked: effectiveMutations.length,
            status: 'SYNCHRONIZED',
            generatedAt: new Date().toISOString()
          };
          if (requestedId === pdbId) break;
        }
      }

      if (bestNaResult) {
        structureCache.set(cacheKey, bestNaResult);
        return bestNaResult;
      }
    }

    // 1B. If no direct NA crystal/NMR structure exists and an NCBI coding nucleotide accession is supplied,
    // retrieve annotated CDS & translate to resolve the encoded protein structure.
    if (cleanAcc && !isAccessionPdbCode && !/^(NR_|XR_)/i.test(cleanAcc)) {
      ncbiCdsInfo = await fetchNcbiCdsAnnotation(cleanAcc, cleanOrigSeq);
      if (ncbiCdsInfo && ncbiCdsInfo.translatedProteinSeq.length >= 10) {
        targetProteinSeq = ncbiCdsInfo.translatedProteinSeq;
        comparisonBaseSeq = ncbiCdsInfo.translatedProteinSeq;
        targetPolymerType = 'PROTEIN';
        console.log(
          `[StructureService] Translated NCBI CDS (${ncbiCdsInfo.nucleotideAccession} -> ${ncbiCdsInfo.proteinAccession || 'ORF'}): ${targetProteinSeq.length} aa`
        );
      }
    }
  }

  // If template coordinates were explicitly passed with mutations
  if (templatePdbText && effectiveMutations.length > 0 && targetProteinSeq) {
    const evalTpl = evaluateCoordinateStructure(templatePdbText, 'PDB', templatePdbId || 'TEMPLATE', comparisonBaseSeq || targetProteinSeq, 'PROTEIN');
    const aln = evalTpl.bestAlignment;
    const { pdbText: mutatedPdbText, modeledCount, modeledPositions } = applyMutationsToPdb(
      templatePdbText, effectiveMutations, templatePdbId || 'TEMPLATE', aln?.chainId, aln?.targetToChainResSeq
    );
    const covered = aln?.coveredResiduesCount ?? evalTpl.parsedResiduesCount;
    const totalLen = targetProteinSeq.length;
    const covPct = totalLen > 0 ? Number(((covered / totalLen) * 100).toFixed(1)) : 0;
    const missingRegions = aln?.missingRegions || [];
    const resObj: StructureResolutionResult = {
      id: `struct_${templatePdbId || 'tpl'}_mut_${seqHash.slice(0, 8)}`,
      sequenceId,
      sequenceVersion,
      sequenceHash: seqHash,
      sequenceLength: totalLen,
      detectedPolymerType: sequenceType,
      structureFormat: 'PDB',
      structureType: 'PREDICTED',
      classification: 'Predicted',
      source: `Template Mutagenesis (${templatePdbId || 'RCSB PDB'})`,
      sourceId: `${templatePdbId || 'MODEL'}-MOD`,
      matchedChainId: aln?.chainId || 'A',
      sequenceIdentity: aln?.sequenceIdentity ?? 100,
      predictionMethod: `Comparative Point Mutagenesis on verified coordinates (${templatePdbId || 'Template'})`,
      confidence: {
        metric: 'Mutagenesis Coverage',
        value: `${modeledCount}/${effectiveMutations.length} mutations within coordinates`,
        description: modeledCount > 0
          ? `Modeled mutations at positions: ${modeledPositions.join(', ')}.`
          : `All ${effectiveMutations.length} mutations fall outside modeled structure coordinates.`
      },
      coverageInfo: {
        startResSeq: aln?.targetStart || 1,
        endResSeq: aln?.targetEnd || covered,
        coveredResiduesCount: covered,
        totalSequenceLength: totalLen,
        coveragePercent: covPct,
        isPartial: covPct < 95,
        unresolvedRegions: missingRegions,
        chain: aln?.chainId || 'A',
        sequenceIdentity: aln?.sequenceIdentity ?? 100,
        coverageLabel: `Chain ${aln?.chainId || 'A'}: ${covered} / ${totalLen} aa (${covPct}% coverage)`,
        targetToChainResSeq: aln?.targetToChainResSeq
      },
      missingRegions,
      parsedAtomCount: evalTpl.parsedAtomCount,
      invalidAtomCount: evalTpl.invalidAtomCount,
      parsedResiduesCount: evalTpl.parsedResiduesCount,
      targetProteinSequence: targetProteinSeq,
      modificationRelation: {
        hasOriginalComparison: true,
        diffCount: effectiveMutations.length,
        modeledDiffCount: modeledCount,
        hasIndels,
        note: hasIndels ? 'Template coordinates retained; insertions/deletions require de novo folding for full backbone remodeling.' : undefined
      },
      pdbText: mutatedPdbText,
      chainsCount: evalTpl.chainsCount,
      residuesCount: evalTpl.parsedResiduesCount,
      mutationsTracked: modeledCount,
      status: 'SYNCHRONIZED',
      generatedAt: new Date().toISOString()
    };
    structureCache.set(cacheKey, resObj);
    return resObj;
  }

  // If no protein sequence could be identified for nucleotide target (e.g. non-coding DNA/RNA with no PDB match)
  if (!targetProteinSeq || targetProteinSeq.length < 10) {
    return buildUnavailableResult(
      sequenceId,
      sequenceVersion,
      seqHash,
      cleanSeq.length,
      `No experimentally determined ${sequenceType} structure exists in RCSB PDB for this sequence, and no annotated coding region (CDS) was found.`,
      false,
      'On-demand de novo folding supports protein sequences (10–400 amino acids).'
    );
  }

  // Step 2: Map protein accession/sequence -> UniProt (to collect authoritative PDB + AlphaFold cross-refs)
  const accessionsToTry: string[] = [];
  if (accession && !/^[0-9][A-Z0-9]{3}$/i.test(accession.trim())) {
    accessionsToTry.push(accession.trim());
  }
  if (ncbiCdsInfo?.proteinAccession) {
    accessionsToTry.push(ncbiCdsInfo.proteinAccession);
  }

  const uniProtRecord = await resolveUniProtRecord(accessionsToTry, comparisonBaseSeq || targetProteinSeq);
  const candidateUniProtId = uniProtRecord?.accession;

  // Step 3: Collect candidate experimental PDB entries + AlphaFold model
  const candidateList: StructureCandidateSummary[] = [];
  const seenCandidateIds = new Set<string>();

  const addCandidate = (c: StructureCandidateSummary) => {
    if (!seenCandidateIds.has(c.id)) {
      seenCandidateIds.add(c.id);
      candidateList.push(c);
    }
  };

  // Explicit 4-char PDB code in accession or requestedId
  if (/^[0-9][A-Z0-9]{3}$/i.test(requestedId)) {
    addCandidate({ id: requestedId, source: 'RCSB PDB', classification: 'Experimental' });
  }
  if (accession && /^[0-9][A-Z0-9]{3}$/i.test(accession.trim())) {
    addCandidate({ id: accession.trim().toUpperCase(), source: 'RCSB PDB', classification: 'Experimental' });
  }

  // Top RCSB sequence search hits
  const rcsbSearchHits = await searchRcsbExperimentalMatches(comparisonBaseSeq || targetProteinSeq, 'protein', 6);
  for (const hit of rcsbSearchHits) {
    addCandidate({ id: hit.pdbId, source: 'RCSB PDB', classification: 'Experimental' });
  }

  // UniProt PDB cross-references: select top overall spans + best resolution representatives per domain region
  if (uniProtRecord?.pdbXrefs) {
    // Sort a copy by best resolution for domain-diverse sampling (N-term TAD, core DBD, C-term oligomerization, etc.)
    const domainBinsSeen = new Map<number, number>();
    const resSorted = [...uniProtRecord.pdbXrefs].sort(
      (a, b) => (a.resolutionNumeric ?? 99) - (b.resolutionNumeric ?? 99)
    );

    // First include top 10 by largest span coverage
    for (const xr of uniProtRecord.pdbXrefs.slice(0, 10)) {
      addCandidate({
        id: xr.pdbId,
        source: 'RCSB PDB',
        classification: 'Experimental',
        method: xr.method,
        resolution: xr.resolution,
        chainSpan: xr.chains
      });
    }

    // Then include up to 2 best-resolution representatives from each 30-aa structural region bin
    for (const xr of resSorted) {
      const startMatch = xr.chains?.match(/(\d+)\s*-/);
      const startPos = startMatch ? parseInt(startMatch[1], 10) : 0;
      const bin = Math.floor(startPos / 30);
      const count = domainBinsSeen.get(bin) || 0;
      if (count < 2 && candidateList.length < 25) {
        domainBinsSeen.set(bin, count + 1);
        addCandidate({
          id: xr.pdbId,
          source: 'RCSB PDB',
          classification: 'Experimental',
          method: xr.method,
          resolution: xr.resolution,
          chainSpan: xr.chains
        });
      }
    }

    // Always include explicitly requested cross-ref
    for (const xr of uniProtRecord.pdbXrefs) {
      if (xr.pdbId === requestedId) {
        addCandidate({
          id: xr.pdbId,
          source: 'RCSB PDB',
          classification: 'Experimental',
          method: xr.method,
          resolution: xr.resolution,
          chainSpan: xr.chains
        });
      }
    }
  }

  // Query AlphaFold DB when UniProt accession is known
  const afMeta = candidateUniProtId ? await searchAlphaFoldDb(candidateUniProtId) : null;
  if (afMeta) {
    addCandidate({
      id: afMeta.modelEntityId,
      source: 'AlphaFold DB',
      classification: 'Predicted',
      method: afMeta.toolUsed,
      confidenceScore: afMeta.globalMetricValue
    });
  }

  // Determine which candidate to download & align first:
  // If requestedId explicitly targets AlphaFold (AF-...) -> download AlphaFold directly
  const isAlphaFoldRequested = requestedId.startsWith('AF-') && afMeta;

  if (!isAlphaFoldRequested) {
    // Prioritize requested PDB, otherwise evaluate top RCSB/UniProt PDB candidates sorted by alignment quality & coverage
    const pdbIdsToTry: string[] = [];
    if (requestedId && !requestedId.startsWith('AF-')) {
      pdbIdsToTry.push(requestedId);
    } else {
      for (const c of candidateList) {
        if (c.source === 'RCSB PDB' && pdbIdsToTry.length < 6) {
          pdbIdsToTry.push(c.id);
        }
      }
    }

    let bestPdbResult: StructureResolutionResult | null = null;
    let bestRankScore = -1;

    for (const pdbId of pdbIdsToTry) {
      const dl = await downloadRcsbCoordinates(pdbId);
      if (!dl) continue;

      const evalRes = evaluateCoordinateStructure(
        dl.text,
        dl.format,
        pdbId,
        comparisonBaseSeq || targetProteinSeq,
        'PROTEIN'
      );

      if (evalRes.parsedAtomCount === 0 || !evalRes.bestAlignment) continue;
      const aln = evalRes.bestAlignment;

      // Reject unrelated structures (< 70% sequence identity or < min aligned residues)
      const minAligned = Math.min((comparisonBaseSeq || targetProteinSeq).length, 8);
      if (aln.sequenceIdentity < 70 || aln.alignedLength < minAligned) continue;

      // Score candidates when auto-selecting (balance coverage * identity * chain compactness)
      const compactness = aln.alignedLength / Math.max(aln.alignedLength, evalRes.matchedChainLength || aln.alignedLength);
      const rankScore = aln.coveredResiduesCount * (aln.sequenceIdentity / 100) * (0.75 + 0.25 * compactness);
      if (requestedId === pdbId || rankScore > bestRankScore) {
        bestRankScore = rankScore;
        const details = await fetchRcsbEntryDetails(pdbId);
        const xrefMatch = uniProtRecord?.pdbXrefs.find(x => x.pdbId === pdbId);

        let finalText = dl.text;
        let modeledCount = 0;
        let modeledPositions: number[] = [];
        const hasMutations = effectiveMutations.length > 0 && dl.format === 'PDB';
        if (hasMutations) {
          const mutRes = applyMutationsToPdb(dl.text, effectiveMutations, pdbId, aln.chainId, aln.targetToChainResSeq);
          finalText = mutRes.pdbText;
          modeledCount = mutRes.modeledCount;
          modeledPositions = mutRes.modeledPositions;
        }

        const isPartial = aln.coveragePercent < 95;
        const cdsNote = ncbiCdsInfo
          ? ` Encoded protein product (${ncbiCdsInfo.proteinAccession || 'CDS'}) translated from ${ncbiCdsInfo.nucleotideAccession}.`
          : '';

        bestPdbResult = {
          id: `struct_${pdbId}_ch${aln.chainId}_${seqHash.slice(0, 8)}`,
          sequenceId,
          sequenceVersion,
          sequenceHash: seqHash,
          sequenceLength: targetProteinSeq.length,
          detectedPolymerType: sequenceType,
          structureFormat: dl.format,
          structureType: hasMutations ? 'PREDICTED' : (isPartial ? 'PARTIAL' : 'EXPERIMENTAL'),
          classification: hasMutations ? 'Predicted' : 'Experimental',
          source: 'RCSB PDB',
          sourceId: pdbId,
          matchedChainId: aln.chainId,
          sequenceIdentity: aln.sequenceIdentity,
          resolution: details.resolution || xrefMatch?.resolution,
          experimentalMethod: details.method || xrefMatch?.method || 'X-ray Diffraction',
          predictionMethod: hasMutations
            ? `Comparative Mutation Model on PDB ${pdbId} Chain ${aln.chainId}`
            : undefined,
          confidence: hasMutations
            ? {
                metric: 'Mutagenesis Coverage',
                value: `${modeledCount}/${effectiveMutations.length} mutations in Chain ${aln.chainId}`,
                description: modeledCount > 0
                  ? `Mutations modeled at sequence positions ${modeledPositions.join(', ')}.${cdsNote}`
                  : `All mutations fall outside resolved residues (${aln.targetStart}–${aln.targetEnd}).${cdsNote}`
              }
            : {
                metric: 'Sequence Alignment',
                value: `${aln.sequenceIdentity}% identity · ${aln.coveragePercent}% coverage`,
                description: `${details.title || `Aligned target protein (${targetProteinSeq.length} aa) against PDB ${pdbId} Chain ${aln.chainId}.`}${cdsNote}`
              },
          coverageInfo: {
            startResSeq: aln.targetStart || aln.chainResStart,
            endResSeq: Math.min(aln.targetEnd || aln.chainResEnd, targetProteinSeq.length),
            coveredResiduesCount: Math.min(aln.coveredResiduesCount, targetProteinSeq.length),
            totalSequenceLength: targetProteinSeq.length,
            coveragePercent: Number(((Math.min(aln.coveredResiduesCount, targetProteinSeq.length) / Math.max(1, targetProteinSeq.length)) * 100).toFixed(1)),
            isPartial,
            unresolvedRegions: aln.missingRegions,
            chain: aln.chainId,
            sequenceIdentity: aln.sequenceIdentity,
            coverageLabel: `Chain ${aln.chainId}: ${Math.min(aln.coveredResiduesCount, targetProteinSeq.length)} / ${targetProteinSeq.length} residues (${Number(((Math.min(aln.coveredResiduesCount, targetProteinSeq.length) / Math.max(1, targetProteinSeq.length)) * 100).toFixed(1))}%)`,
            targetToChainResSeq: aln.targetToChainResSeq
          },
          missingRegions: aln.missingRegions,
          parsedAtomCount: evalRes.parsedAtomCount,
          invalidAtomCount: evalRes.invalidAtomCount,
          parsedResiduesCount: evalRes.parsedResiduesCount,
          candidateStructures: candidateList,
          targetProteinSequence: targetProteinSeq,
          translatedFromNucleotide: Boolean(ncbiCdsInfo),
          nucleotideAccession: ncbiCdsInfo?.nucleotideAccession,
          ncbiProteinAccession: ncbiCdsInfo?.proteinAccession,
          uniprotAccession: candidateUniProtId,
          modificationRelation: effectiveMutations.length > 0 || cleanOrigSeq !== cleanSeq ? {
            hasOriginalComparison: cleanOrigSeq !== cleanSeq || effectiveMutations.length > 0,
            diffCount: effectiveMutations.length,
            modeledDiffCount: modeledCount,
            hasIndels,
            note: hasIndels ? 'Template contains insertions/deletions vs modified sequence; on-demand prediction can fold full modified chain.' : undefined
          } : undefined,
          pdbText: finalText,
          chainsCount: evalRes.chainsCount,
          residuesCount: evalRes.parsedResiduesCount,
          mutationsTracked: effectiveMutations.length > 0 ? modeledCount : 0,
          status: 'SYNCHRONIZED',
          generatedAt: new Date().toISOString()
        };

        if (requestedId === pdbId) break;
      }
    }

    if (bestPdbResult) {
      structureCache.set(cacheKey, bestPdbResult);
      return bestPdbResult;
    }
  }

  // Step 4: Retrieve AlphaFold DB structure if available (fallback when no PDB selected/found or explicitly requested)
  if (afMeta) {
    try {
      let coordText = '';
      let format: 'PDB' | 'mmCIF' = 'PDB';
      if (afMeta.pdbUrl) {
        const res = await fetch(afMeta.pdbUrl, { headers: { 'User-Agent': HTTP_HEADERS['User-Agent'] } });
        if (res.ok) {
          const txt = await res.text();
          if (txt.includes('ATOM')) coordText = txt;
        }
      }
      if (!coordText && afMeta.cifUrl) {
        const res = await fetch(afMeta.cifUrl, { headers: { 'User-Agent': HTTP_HEADERS['User-Agent'] } });
        if (res.ok) {
          const txt = await res.text();
          if (txt.includes('_atom_site.')) {
            coordText = txt;
            format = 'mmCIF';
          }
        }
      }

      if (coordText) {
        const evalAf = evaluateCoordinateStructure(
          coordText,
          format,
          afMeta.modelEntityId,
          comparisonBaseSeq || targetProteinSeq,
          'PROTEIN'
        );
        if (evalAf.parsedAtomCount > 0 && evalAf.bestAlignment && evalAf.bestAlignment.sequenceIdentity >= 70) {
          const aln = evalAf.bestAlignment;
          let finalText = coordText;
          let modeledCount = 0;
          if (effectiveMutations.length > 0 && format === 'PDB') {
            const mutRes = applyMutationsToPdb(coordText, effectiveMutations, afMeta.modelEntityId, aln.chainId, aln.targetToChainResSeq);
            finalText = mutRes.pdbText;
            modeledCount = mutRes.modeledCount;
          }

          const isPartial = aln.coveragePercent < 95;
          const cdsNote = ncbiCdsInfo
            ? ` Encoded protein product (${ncbiCdsInfo.proteinAccession || 'CDS'}) translated from ${ncbiCdsInfo.nucleotideAccession}.`
            : '';
          const afResult: StructureResolutionResult = {
            id: `struct_${afMeta.modelEntityId}_${seqHash.slice(0, 8)}`,
            sequenceId,
            sequenceVersion,
            sequenceHash: seqHash,
            sequenceLength: targetProteinSeq.length,
            detectedPolymerType: sequenceType,
            structureFormat: format,
            structureType: 'PREDICTED',
            classification: 'Predicted',
            source: 'AlphaFold DB',
            sourceId: afMeta.modelEntityId,
            matchedChainId: aln.chainId,
            sequenceIdentity: aln.sequenceIdentity,
            predictionMethod: afMeta.toolUsed,
            confidence: {
              metric: 'Mean pLDDT',
              value: `${afMeta.globalMetricValue.toFixed(1)} / 100`,
              description: `AlphaFold DB full-chain predicted model (${aln.sequenceIdentity}% identity, ${aln.coveragePercent}% coverage).${cdsNote}`
            },
            coverageInfo: {
              startResSeq: aln.targetStart || aln.chainResStart,
              endResSeq: Math.min(aln.targetEnd || aln.chainResEnd, targetProteinSeq.length),
              coveredResiduesCount: Math.min(aln.coveredResiduesCount, targetProteinSeq.length),
              totalSequenceLength: targetProteinSeq.length,
              coveragePercent: Number(((Math.min(aln.coveredResiduesCount, targetProteinSeq.length) / Math.max(1, targetProteinSeq.length)) * 100).toFixed(1)),
              isPartial,
              unresolvedRegions: aln.missingRegions,
              chain: aln.chainId,
              sequenceIdentity: aln.sequenceIdentity,
              coverageLabel: `Chain ${aln.chainId}: ${Math.min(aln.coveredResiduesCount, targetProteinSeq.length)} / ${targetProteinSeq.length} residues (${Number(((Math.min(aln.coveredResiduesCount, targetProteinSeq.length) / Math.max(1, targetProteinSeq.length)) * 100).toFixed(1))}%)`,
              targetToChainResSeq: aln.targetToChainResSeq
            },
            missingRegions: aln.missingRegions,
            parsedAtomCount: evalAf.parsedAtomCount,
            invalidAtomCount: evalAf.invalidAtomCount,
            parsedResiduesCount: evalAf.parsedResiduesCount,
            candidateStructures: candidateList,
            targetProteinSequence: targetProteinSeq,
            translatedFromNucleotide: Boolean(ncbiCdsInfo),
            nucleotideAccession: ncbiCdsInfo?.nucleotideAccession,
            ncbiProteinAccession: ncbiCdsInfo?.proteinAccession,
            uniprotAccession: candidateUniProtId,
            modificationRelation: effectiveMutations.length > 0 || cleanOrigSeq !== cleanSeq ? {
              hasOriginalComparison: true,
              diffCount: effectiveMutations.length,
              modeledDiffCount: modeledCount,
              hasIndels
            } : undefined,
            pdbText: finalText,
            chainsCount: evalAf.chainsCount,
            residuesCount: evalAf.parsedResiduesCount,
            mutationsTracked: modeledCount,
            status: 'SYNCHRONIZED',
            generatedAt: new Date().toISOString()
          };

          structureCache.set(cacheKey, afResult);
          return afResult;
        }
      }
    } catch (err) {
      console.warn('[StructureService] Failed to download AlphaFold coordinates:', err);
    }
  }

  // Step 5: Optional configured prediction fallback when requested automatically OR report honest Unavailable status
  const canRunEsmFold = targetPolymerType === 'PROTEIN' && targetProteinSeq.length >= 10 && targetProteinSeq.length <= 400;
  if (autoPredict && canRunEsmFold) {
    try {
      const predicted = await invokeConfiguredPredictionService(
        targetProteinSeq,
        sequenceId,
        sequenceVersion,
        seqHash
      );
      if (predicted && predicted.parsedAtomCount > 0) {
        predicted.detectedPolymerType = sequenceType;
        predicted.translatedFromNucleotide = Boolean(ncbiCdsInfo);
        predicted.nucleotideAccession = ncbiCdsInfo?.nucleotideAccession;
        predicted.ncbiProteinAccession = ncbiCdsInfo?.proteinAccession;
        structureCache.set(cacheKey, predicted);
        return predicted;
      }
    } catch (err) {
      console.warn('[StructureService] Configured prediction service auto-fallback failed:', err);
    }
  }

  const unavail = buildUnavailableResult(
    sequenceId,
    sequenceVersion,
    seqHash,
    targetProteinSeq.length,
    canRunEsmFold
      ? 'No matching experimental structure (RCSB PDB) or precomputed AlphaFold DB entry was found. On-demand structure prediction is available for protein sequences (10–400 residues).'
      : 'No matching experimental structure (RCSB PDB) or AlphaFold DB entry was found for this sequence.',
    canRunEsmFold,
    canRunEsmFold ? 'ESMFold v1 / Configured Prediction Service (10–400 aa)' : 'Sequence exceeds single-chain prediction limit (400 aa) or is not a protein.',
    targetProteinSeq
  );
  unavail.detectedPolymerType = sequenceType;

  structureCache.set(cacheKey, unavail);
  return unavail;
}

function buildUnavailableResult(
  sequenceId: string,
  sequenceVersion: string,
  seqHash: string,
  sequenceLength: number,
  description: string,
  predictionAvailable: boolean = false,
  predictionReason?: string,
  targetProteinSequence?: string
): StructureResolutionResult {
  return {
    id: `struct_unavail_${seqHash.slice(0, 8)}`,
    sequenceId,
    sequenceVersion,
    sequenceHash: seqHash,
    sequenceLength,
    structureFormat: 'PDB',
    structureType: 'UNAVAILABLE',
    classification: 'Unavailable',
    source: 'None',
    confidence: {
      metric: 'Status',
      value: 'No verified structure available',
      description
    },
    parsedAtomCount: 0,
    invalidAtomCount: 0,
    parsedResiduesCount: 0,
    predictionAvailable,
    predictionReason,
    targetProteinSequence,
    pdbText: '',
    chainsCount: 0,
    residuesCount: 0,
    mutationsTracked: 0,
    status: 'SYNCHRONIZED',
    generatedAt: new Date().toISOString()
  };
}

// ============================================================================
// 7. GENUINE ON-DEMAND PREDICTION WORKFLOW (CONFIGURABLE / ESMFold v1 API)
// ============================================================================

async function invokeConfiguredPredictionService(
  proteinSeq: string,
  sequenceId: string,
  sequenceVersion: string,
  seqHash: string
): Promise<StructureResolutionResult> {
  const endpointUrl = process.env.STRUCTURE_PREDICTION_API_URL?.trim() || 'https://api.esmatlas.com/foldSequence/v1/pdb/';
  const apiKey = process.env.STRUCTURE_PREDICTION_API_KEY?.trim();

  const headers: Record<string, string> = {
    'User-Agent': HTTP_HEADERS['User-Agent']
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  let esmRes = await fetch(endpointUrl, {
    method: 'POST',
    headers,
    body: proteinSeq,
    signal: AbortSignal.timeout(25000)
  });

  if (!esmRes.ok && [502, 503, 504].includes(esmRes.status)) {
    await new Promise((r) => setTimeout(r, 1500));
    esmRes = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: proteinSeq,
      signal: AbortSignal.timeout(25000)
    });
  }

  if (!esmRes.ok) {
    throw new Error(`Structure prediction service returned HTTP ${esmRes.status}`);
  }

  const pdbText = await esmRes.text();
  if (!pdbText.includes('ATOM') && !pdbText.includes('_atom_site.')) {
    throw new Error('Prediction service response did not contain valid ATOM coordinates.');
  }

  const format: 'PDB' | 'mmCIF' = pdbText.trimStart().startsWith('data_') || pdbText.includes('_atom_site.') ? 'mmCIF' : 'PDB';
  const evalRes = evaluateCoordinateStructure(pdbText, format, 'ESMFOLD-PRED', proteinSeq, 'PROTEIN');
  if (evalRes.parsedAtomCount === 0) {
    throw new Error('Predicted coordinate payload contained zero valid finite atoms.');
  }
  const aln = evalRes.bestAlignment;
  const isCustomEndpoint = endpointUrl !== 'https://api.esmatlas.com/foldSequence/v1/pdb/';

  return {
    id: `struct_pred_${seqHash.slice(0, 8)}`,
    sequenceId,
    sequenceVersion,
    sequenceHash: seqHash,
    sequenceLength: proteinSeq.length,
    detectedPolymerType: 'PROTEIN',
    structureFormat: format,
    structureType: 'PREDICTED',
    classification: 'Predicted',
    source: isCustomEndpoint ? 'Configured Prediction Service' : 'ESMFold v1 (Meta AI)',
    sourceId: `ESM-${seqHash.slice(0, 6).toUpperCase()}`,
    matchedChainId: aln?.chainId || 'A',
    sequenceIdentity: aln?.sequenceIdentity ?? 100,
    predictionMethod: isCustomEndpoint ? `External Folding Service (${endpointUrl})` : 'ESMFold v1 Language Model Structure Prediction',
    confidence: {
      metric: 'Prediction Engine',
      value: isCustomEndpoint ? 'Configured Predictor (De Novo)' : 'ESMFold v1 (De Novo)',
      description: `Predicted 3D coordinates computed from ${proteinSeq.length} amino acid sequence.`
    },
    coverageInfo: aln ? {
      startResSeq: aln.targetStart || 1,
      endResSeq: aln.targetEnd || proteinSeq.length,
      coveredResiduesCount: aln.coveredResiduesCount,
      totalSequenceLength: proteinSeq.length,
      coveragePercent: aln.coveragePercent,
      isPartial: aln.coveragePercent < 95,
      unresolvedRegions: aln.missingRegions,
      chain: aln.chainId,
      sequenceIdentity: aln.sequenceIdentity,
      coverageLabel: `Chain ${aln.chainId}: ${aln.coveredResiduesCount} / ${proteinSeq.length} aa (${aln.coveragePercent}%)`,
      targetToChainResSeq: aln.targetToChainResSeq
    } : undefined,
    missingRegions: aln?.missingRegions || [],
    parsedAtomCount: evalRes.parsedAtomCount,
    invalidAtomCount: evalRes.invalidAtomCount,
    parsedResiduesCount: evalRes.parsedResiduesCount,
    targetProteinSequence: proteinSeq,
    pdbText,
    chainsCount: evalRes.chainsCount,
    residuesCount: evalRes.parsedResiduesCount,
    mutationsTracked: 0,
    status: 'SYNCHRONIZED',
    generatedAt: new Date().toISOString()
  };
}

export function startStructurePredictionJob(params: ResolveStructureParams): StructurePredictionJob {
  const classified = classifyUniversalInput(params.sequence || '', params.sequenceType, params.accession);
  const cleanSeq = classified.cleanSeq;
  const seqHash = calculateSequenceHash(cleanSeq);
  const jobId = `job_struct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const now = new Date().toISOString();
  const job: StructurePredictionJob = {
    jobId,
    status: 'processing',
    phase: 'Checking RCSB PDB & AlphaFold DB before de novo prediction...',
    progress: 25,
    sequenceHash: seqHash,
    sequenceLength: cleanSeq.length,
    params,
    createdAt: now,
    updatedAt: now
  };

  jobQueue.set(jobId, job);

  setTimeout(async () => {
    try {
      const existing = await resolveStructureForSequence(params);
      if (existing.structureType !== 'UNAVAILABLE') {
        job.status = 'completed';
        job.progress = 100;
        job.phase = `Verified structure retrieved (${existing.sourceId})`;
        job.structure = existing;
        job.updatedAt = new Date().toISOString();
        return;
      }

      const protSeq = existing.targetProteinSequence || cleanSeq;
      const isProt = classified.polymerType === 'PROTEIN' || Boolean(existing.targetProteinSequence);
      if (!isProt || protSeq.length < 10 || protSeq.length > 400) {
        job.status = 'failed';
        job.progress = 100;
        job.error = 'Structure prediction supports protein sequences between 10 and 400 residues.';
        job.phase = 'Prediction unsupported for sequence length/type';
        job.updatedAt = new Date().toISOString();
        return;
      }

      job.progress = 60;
      job.phase = 'Running genuine ESMFold v1 3D inference...';
      job.updatedAt = new Date().toISOString();

      const predicted = await invokeConfiguredPredictionService(
        protSeq,
        params.sequenceId || 'seq_pred',
        params.sequenceVersion || 'v1',
        seqHash
      );

      job.status = 'completed';
      job.progress = 100;
      job.phase = 'Predicted 3D coordinates generated';
      job.structure = predicted;
      job.updatedAt = new Date().toISOString();
    } catch (err: any) {
      job.status = 'failed';
      job.progress = 100;
      job.error = err?.message || 'Failed to predict structure for sequence';
      job.phase = 'Prediction failed';
      job.updatedAt = new Date().toISOString();
    }
  }, 50);

  return job;
}

export function getStructurePredictionJob(jobId: string): StructurePredictionJob | null {
  return jobQueue.get(jobId) || null;
}
