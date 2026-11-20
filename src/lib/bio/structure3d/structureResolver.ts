import { ResolvedStructure3D } from './types';
import { SequenceType } from '../types';
import { parseStructureText } from './pdbParser';
import { parseBiologicalInput } from '../sequenceParser';
import { SequenceMutation } from '../editor/types';
import { buildSequenceToStructureMapping } from './residueMapping';

export interface StructureResolutionOptions {
  sequence: string;
  sequenceType: SequenceType;
  accessionOrPdbId?: string;
  preferredPdbId?: string;
  sequenceId?: string;
  sequenceVersion?: string;
  sequenceHash?: string;
  mutations?: SequenceMutation[];
  title?: string;
  useCache?: boolean;
  allowSequenceDerivedFallback?: boolean;
  onProgress?: (status: string) => void;
  originalSequence?: string;
  templatePdbId?: string;
  templatePdbText?: string;
  autoPredict?: boolean;
}

const structureCache = new Map<string, ResolvedStructure3D>();

export function computeClientSequenceHash(sequence: string): string {
  const parsed = parseBiologicalInput(sequence);
  const clean = parsed.sequence.replace(/[^A-Z]/g, '');
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    const char = clean.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16)}_${clean.length}`;
}

function extractAccessionFromFastaHeader(header: string): string | undefined {
  if (!header) return undefined;
  const spMatch = header.match(/\b(?:sp|tr)\|([A-Z0-9]{6,10})\|/i);
  if (spMatch) return spMatch[1].toUpperCase();
  const ncbiMatch = header.match(/\b((?:NM|NP|XM|XP|NR|XR|NC|WP|YP|AP)_[0-9]+(?:\.[0-9]+)?)\b/i);
  if (ncbiMatch) return ncbiMatch[1].toUpperCase();
  const pdbMatch = header.match(/\bpdb\|([0-9][A-Z0-9]{3})/i);
  if (pdbMatch) return pdbMatch[1].toUpperCase();
  return undefined;
}

/**
 * Hydrate a backend StructureResolutionResult payload into a full parsed ResolvedStructure3D
 * with validated atomic coordinates, alignment metrics, and sequence-to-residue mapping.
 */
function hydrateServerStructure(
  serverStruct: any,
  cleanSeq: string,
  normalizedSeqType: SequenceType,
  sequenceId: string,
  sequenceVersion: string,
  seqHash: string,
  accessionOrPdbId: string | undefined,
  mutations: SequenceMutation[]
): ResolvedStructure3D {
  if (!serverStruct || serverStruct.structureType === 'UNAVAILABLE' || !serverStruct.pdbText) {
    return {
      id: serverStruct?.id || `struct_unavail_${seqHash.slice(0, 8)}`,
      title: `No verified structure available (${accessionOrPdbId || 'Target'})`,
      source: 'RCSB_PDB',
      macromoleculeType: (serverStruct?.detectedPolymerType && serverStruct.detectedPolymerType !== 'UNKNOWN')
        ? serverStruct.detectedPolymerType
        : normalizedSeqType,
      structureType: 'UNAVAILABLE',
      classification: 'Unavailable',
      sourceName: 'None',
      confidenceInfo: serverStruct?.confidence || {
        metric: 'Status',
        value: 'No verified structure available',
        description: 'No matching experimental structure (RCSB PDB) or AlphaFold DB model was found.'
      },
      predictionAvailable: Boolean(serverStruct?.predictionAvailable),
      predictionReason: serverStruct?.predictionReason,
      targetProteinSequence: serverStruct?.targetProteinSequence,
      translatedFromNucleotide: Boolean(serverStruct?.translatedFromNucleotide),
      nucleotideAccession: serverStruct?.nucleotideAccession,
      ncbiProteinAccession: serverStruct?.ncbiProteinAccession,
      uniprotAccession: serverStruct?.uniprotAccession,
      modificationRelation: serverStruct?.modificationRelation,
      candidateStructures: serverStruct?.candidateStructures || [],
      chains: [],
      allAtoms: [],
      ligands: [],
      disulfideBonds: [],
      secondaryStructureSummary: {
        helixCount: 0, sheetCount: 0, coilCount: 0,
        helixPercent: 0, sheetPercent: 0, coilPercent: 0
      },
      parsedAtomCount: 0,
      invalidAtomCount: 0,
      parsedResiduesCount: 0,
      sequenceId,
      sequenceVersion,
      sequenceHash: seqHash,
      sequenceLength: cleanSeq.length,
      isOutdated: false,
      boundingBox: { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], size: [0, 0, 0], radius: 0 }
    };
  }

  const parsed = parseStructureText(
    serverStruct.pdbText,
    serverStruct.sourceId || accessionOrPdbId || '3D_MODEL',
    serverStruct.structureFormat
  );

  parsed.structureType = serverStruct.structureType;
  parsed.classification = serverStruct.classification || (serverStruct.structureType === 'PREDICTED' ? 'Predicted' : 'Experimental');
  parsed.source = serverStruct.source === 'AlphaFold DB'
    ? 'ALPHAFOLD_DB'
    : (serverStruct.source?.includes('ESMFold') || serverStruct.source?.includes('Prediction Service')
      ? 'AB_INITIO_PREDICTION'
      : 'RCSB_PDB');
  parsed.sourceName = serverStruct.source;
  parsed.sourceId = serverStruct.sourceId;
  parsed.matchedChainId = serverStruct.matchedChainId || serverStruct.coverageInfo?.chain;
  parsed.sequenceIdentity = serverStruct.sequenceIdentity ?? serverStruct.coverageInfo?.sequenceIdentity;
  parsed.missingRegions = serverStruct.missingRegions || serverStruct.coverageInfo?.unresolvedRegions || [];
  parsed.candidateStructures = serverStruct.candidateStructures || [];
  parsed.targetProteinSequence = serverStruct.targetProteinSequence;
  parsed.translatedFromNucleotide = Boolean(serverStruct.translatedFromNucleotide);
  parsed.nucleotideAccession = serverStruct.nucleotideAccession;
  parsed.ncbiProteinAccession = serverStruct.ncbiProteinAccession;
  parsed.uniprotAccession = serverStruct.uniprotAccession;
  parsed.modificationRelation = serverStruct.modificationRelation;
  parsed.predictionAvailable = serverStruct.predictionAvailable;
  parsed.predictionReason = serverStruct.predictionReason;
  parsed.resolutionText = serverStruct.resolution;
  parsed.experimentalMethod = serverStruct.experimentalMethod || parsed.experimentalMethod;
  parsed.predictionMethod = serverStruct.predictionMethod;
  parsed.confidenceInfo = serverStruct.confidence;
  if (serverStruct.confidence?.metric === 'pLDDT' && typeof serverStruct.confidence?.value === 'number') {
    parsed.pLddtAvg = serverStruct.confidence.value;
  }
  parsed.coverageInfo = serverStruct.coverageInfo;
  parsed.sequenceId = sequenceId;
  parsed.sequenceVersion = sequenceVersion;
  parsed.sequenceHash = serverStruct.sequenceHash || seqHash;
  parsed.sequenceLength = serverStruct.sequenceLength || cleanSeq.length;
  parsed.isOutdated = false;
  parsed.generatedAt = serverStruct.generatedAt || new Date().toISOString();

  const mappingTargetSeq = serverStruct.targetProteinSequence || cleanSeq;
  parsed.residueMapping = buildSequenceToStructureMapping(mappingTargetSeq, parsed);
  tagMutationsOnStructure(parsed, mutations);

  return parsed;
}

/**
 * Main Resolution Engine: Queries genuine RCSB PDB / AlphaFold DB / UniProt / NCBI CDS backend.
 * Never fabricates idealized helices or artificial coordinates.
 */
export async function resolveMacromolecularStructure(
  options: StructureResolutionOptions
): Promise<ResolvedStructure3D> {
  const {
    sequence,
    sequenceType,
    accessionOrPdbId,
    preferredPdbId,
    sequenceId = 'seq_active',
    sequenceVersion = 'v1',
    mutations = [],
    useCache = true,
    onProgress,
    originalSequence,
    templatePdbId,
    templatePdbText,
    autoPredict = false
  } = options;

  const parsedInput = parseBiologicalInput(sequence);
  const cleanSeq = parsedInput.sequence.replace(/[^A-Z]/g, '');
  const resolvedAccession = accessionOrPdbId?.trim() || extractAccessionFromFastaHeader(parsedInput.header);
  const normalizedSeqType: SequenceType = ((sequenceType as string) || 'PROTEIN').toUpperCase().trim() as SequenceType;
  const seqHash = computeClientSequenceHash(cleanSeq);
  const cleanOrig = originalSequence ? parseBiologicalInput(originalSequence).sequence.replace(/[^A-Z]/g, '') : '';
  const origHash = cleanOrig ? computeClientSequenceHash(cleanOrig) : '';
  const mutSig = (mutations || [])
    .map((m) => `${m.position}:${m.original || ''}>${m.modified || ''}:${m.operation || ''}`)
    .join(';');
  const cacheKey = `${seqHash}_${sequenceVersion}_${mutSig}_${origHash}_${resolvedAccession || ''}_${preferredPdbId || ''}_${normalizedSeqType}_${templatePdbId || ''}_${autoPredict ? 'pred' : 'nopred'}`;

  if (useCache && structureCache.has(cacheKey)) {
    return structureCache.get(cacheKey)!;
  }

  onProgress?.('Querying NCBI CDS, UniProt, RCSB PDB & AlphaFold DB...');

  try {
    const apiBase = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost:3000';
    const resolveApiUrl = `${apiBase}/api/structure/resolve`;

    const response = await fetch(resolveApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequence: parsedInput.header ? `>${parsedInput.header}\n${cleanSeq}` : cleanSeq,
        sequenceId,
        sequenceVersion,
        sequenceHash: seqHash,
        accession: resolvedAccession,
        preferredPdbId,
        sequenceType: normalizedSeqType,
        allowSequenceDerivedFallback: false,
        originalSequence: cleanOrig || undefined,
        templatePdbId,
        templatePdbText,
        autoPredict,
        mutations: mutations.map(m => ({
          position: m.position,
          original: m.original,
          modified: m.modified,
          operation: m.operation,
          description: m.description,
          lengthChange: m.lengthChange
        }))
      })
    });

    if (response.ok) {
      onProgress?.('Parsing atomic coordinates & validating alignment...');
      const data = await response.json();
      if (data.ok && data.structure) {
        const hydrated = hydrateServerStructure(
          data.structure,
          cleanSeq,
          normalizedSeqType,
          sequenceId,
          sequenceVersion,
          seqHash,
          resolvedAccession,
          mutations
        );
        structureCache.set(cacheKey, hydrated);
        onProgress?.(hydrated.structureType === 'UNAVAILABLE' ? 'No verified structure available' : 'Structure Ready');
        return hydrated;
      }
    }
  } catch (err) {
    console.warn('[StructureResolver] Backend structure resolution error:', err);
  }

  // Fallback direct RCSB PDB fetch ONLY if target is an explicit 4-character PDB ID
  const explicitId = (preferredPdbId || resolvedAccession || '').trim();
  const pdbCodeMatch = explicitId.match(/^([0-9][a-zA-Z0-9]{3})$/i);
  if (pdbCodeMatch) {
    const candidatePdbId = pdbCodeMatch[1].toUpperCase();
    const direct = await fetchPdbFromRcsb(candidatePdbId);
    if (direct) {
      structureCache.set(cacheKey, direct);
      return direct;
    }
  }

  const unavail = hydrateServerStructure(null, cleanSeq, normalizedSeqType, sequenceId, sequenceVersion, seqHash, resolvedAccession, mutations);
  onProgress?.('No verified structure available');
  return unavail;
}

/**
 * Trigger genuine on-demand ESMFold v1 prediction workflow when verified structures are unavailable.
 */
export async function runOnDemandStructurePrediction(
  options: StructureResolutionOptions
): Promise<ResolvedStructure3D> {
  const parsedInput = parseBiologicalInput(options.sequence);
  const cleanSeq = parsedInput.sequence.replace(/[^A-Z]/g, '');
  const resolvedAccession = options.accessionOrPdbId?.trim() || extractAccessionFromFastaHeader(parsedInput.header);
  const normalizedSeqType: SequenceType = ((options.sequenceType as string) || 'PROTEIN').toUpperCase().trim() as SequenceType;
  const seqHash = computeClientSequenceHash(cleanSeq);
  const apiBase = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost:3000';

  options.onProgress?.('Submitting prediction job...');
  const startRes = await fetch(`${apiBase}/api/structure/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sequence: cleanSeq,
      sequenceId: options.sequenceId || 'seq_pred',
      sequenceVersion: options.sequenceVersion || 'v1',
      accession: resolvedAccession,
      sequenceType: normalizedSeqType
    })
  });

  if (!startRes.ok) {
    throw new Error(`Failed to start prediction job (HTTP ${startRes.status})`);
  }

  const { job } = await startRes.json();
  const jobId = job?.jobId;
  if (!jobId) {
    throw new Error('Prediction job did not return a job identifier.');
  }

  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise(r => setTimeout(r, 1000));
    const pollRes = await fetch(`${apiBase}/api/structure/jobs/${encodeURIComponent(jobId)}`);
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    const currentJob = pollData.job;
    if (currentJob?.phase) options.onProgress?.(currentJob.phase);
    if (currentJob?.status === 'completed' && currentJob.structure) {
      return hydrateServerStructure(
        currentJob.structure,
        cleanSeq,
        normalizedSeqType,
        options.sequenceId || 'seq_pred',
        options.sequenceVersion || 'v1',
        seqHash,
        options.accessionOrPdbId,
        options.mutations || []
      );
    }
    if (currentJob?.status === 'failed') {
      throw new Error(currentJob.error || 'Structure prediction job failed.');
    }
  }

  throw new Error('Structure prediction timed out waiting for ESMFold response.');
}

/**
 * Direct RCSB PDB / mmCIF fetch helper for explicit PDB lookups
 */
export async function fetchPdbFromRcsb(pdbId: string): Promise<ResolvedStructure3D | null> {
  const cleanId = pdbId.trim().toUpperCase();
  try {
    const pdbRes = await fetch(`https://files.rcsb.org/download/${cleanId}.pdb`);
    if (pdbRes.ok) {
      const pdbText = await pdbRes.text();
      if (pdbText.includes('ATOM') || pdbText.includes('HETATM')) {
        const parsed = parseStructureText(pdbText, cleanId, 'PDB');
        parsed.structureType = 'EXPERIMENTAL';
        parsed.classification = 'Experimental';
        parsed.sourceName = 'RCSB PDB';
        parsed.sourceId = cleanId;
        parsed.experimentalMethod = parsed.experimentalMethod || 'X-ray Diffraction / Cryo-EM';
        parsed.isOutdated = false;
        return parsed;
      }
    }
    const cifRes = await fetch(`https://files.rcsb.org/download/${cleanId}.cif`);
    if (cifRes.ok) {
      const cifText = await cifRes.text();
      if (cifText.includes('_atom_site.')) {
        const parsed = parseStructureText(cifText, cleanId, 'mmCIF');
        parsed.structureType = 'EXPERIMENTAL';
        parsed.classification = 'Experimental';
        parsed.sourceName = 'RCSB PDB';
        parsed.sourceId = cleanId;
        parsed.isOutdated = false;
        return parsed;
      }
    }
    return null;
  } catch (err) {
    console.error(`[fetchPdbFromRcsb] Failed to fetch ${cleanId}:`, err);
    return null;
  }
}

/**
 * Annotate residue nodes with mutation tracking metadata using alignment mapping when available
 */
export function tagMutationsOnStructure(
  structure: ResolvedStructure3D,
  mutations: SequenceMutation[]
): void {
  if (!structure.chains || structure.chains.length === 0) return;

  for (const chain of structure.chains) {
    for (const res of chain.residues) {
      res.isMutated = false;
      res.mutationType = undefined;
      res.mutationLabel = undefined;
    }
  }

  if (!mutations || mutations.length === 0) return;

  const preferredChain = structure.matchedChainId || structure.coverageInfo?.chain;
  const targetToChainResSeq = structure.coverageInfo?.targetToChainResSeq;

  for (const chain of structure.chains) {
    if (preferredChain && chain.id !== preferredChain) continue;
    for (const mut of mutations) {
      const pdbResSeq = targetToChainResSeq?.[mut.position] ?? mut.position;
      const res = chain.residues.find((r) => r.resSeq === pdbResSeq);
      if (res) {
        res.isMutated = true;
        const op = (mut.operation || 'substitution').toUpperCase();
        res.mutationType = (op === 'INSERTION' || op === 'DELETION') ? (op as any) : 'SUBSTITUTION';
        res.mutationLabel = mut.operation === 'substitution'
          ? `${mut.original || ''}${mut.position}${mut.modified || ''}`
          : `${mut.operation} at pos ${mut.position}`;
      }
    }
  }
}
