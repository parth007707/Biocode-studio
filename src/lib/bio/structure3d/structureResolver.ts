import { ResolvedStructure3D } from './types';
import { SequenceType } from '../types';
import { parsePDBText } from './pdbParser';
import {
  generateDnaStructure3D,
  generateRnaStructure3D,
  generateProteinStructure3D
} from './structureGenerator';
import { SequenceMutation } from '../editor/types';

// High-resolution scientific reference structures bundled for instant offline / fallback resolution
import { CRAMBIN_1CRN_PDB } from './presets/crambin1crn';
import { BDNA_1BNA_PDB } from './presets/bdna1bna';
import { TRNA_1EHZ_PDB } from './presets/trna1ehz';

export interface StructureResolutionOptions {
  sequence: string;
  sequenceType: SequenceType;
  accessionOrPdbId?: string;
  mutations?: SequenceMutation[];
  title?: string;
  useCache?: boolean;
}

const structureCache = new Map<string, ResolvedStructure3D>();

/**
 * Fetch experimental PDB from RCSB PDB REST / download servers
 */
export async function fetchPdbFromRcsb(pdbId: string): Promise<ResolvedStructure3D | null> {
  const cleanId = pdbId.trim().toUpperCase();
  if (!cleanId || cleanId.length !== 4) return null;

  const cacheKey = `rcsb:${cleanId}`;
  if (structureCache.has(cacheKey)) {
    return structureCache.get(cacheKey)!;
  }

  try {
    const url = `https://files.rcsb.org/download/${cleanId}.pdb`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[RCSB PDB] Failed to fetch PDB file for ${cleanId}: HTTP ${res.status}`);
      return null;
    }
    const pdbText = await res.text();
    const resolved = parsePDBText(pdbText, cleanId);
    structureCache.set(cacheKey, resolved);
    return resolved;
  } catch (err) {
    console.error(`[RCSB PDB] Error downloading structure ${cleanId}:`, err);
    return null;
  }
}

/**
 * Main Resolution Engine: Resolves or predicts full 3D macromolecular structure
 */
export async function resolveMacromolecularStructure(
  options: StructureResolutionOptions
): Promise<ResolvedStructure3D> {
  const { sequence, sequenceType, accessionOrPdbId, mutations = [], title } = options;

  // 1. Check if an explicit 4-letter PDB code is passed or embedded in accession
  const pdbCodeMatch = accessionOrPdbId?.match(/\b([0-9][a-zA-Z0-9]{3})\b/);
  if (pdbCodeMatch) {
    const candidatePdbId = pdbCodeMatch[1].toUpperCase();

    // Check bundled presets first
    if (candidatePdbId === '1CRN') {
      const parsed = parsePDBText(CRAMBIN_1CRN_PDB, '1CRN');
      tagMutationsOnStructure(parsed, mutations);
      return parsed;
    } else if (candidatePdbId === '1BNA') {
      const parsed = parsePDBText(BDNA_1BNA_PDB, '1BNA');
      tagMutationsOnStructure(parsed, mutations);
      return parsed;
    } else if (candidatePdbId === '1EHZ') {
      const parsed = parsePDBText(TRNA_1EHZ_PDB, '1EHZ');
      tagMutationsOnStructure(parsed, mutations);
      return parsed;
    }

    // Try fetching from RCSB PDB
    const fetched = await fetchPdbFromRcsb(candidatePdbId);
    if (fetched) {
      tagMutationsOnStructure(fetched, mutations);
      return fetched;
    }
  }

  // 2. Ab Initio Physics-Informed Generator based on Sequence Type
  let generatedStructure: ResolvedStructure3D;

  if (sequenceType === 'DNA') {
    generatedStructure = generateDnaStructure3D(sequence, title);
  } else if (sequenceType === 'RNA') {
    generatedStructure = generateRnaStructure3D(sequence, undefined, title);
  } else {
    // Protein default
    generatedStructure = generateProteinStructure3D(sequence, undefined, title);
  }

  // 3. Tag mutation annotations onto the 3D residue nodes
  tagMutationsOnStructure(generatedStructure, mutations);

  return generatedStructure;
}

/**
 * Annotate residue nodes with mutation tracking metadata
 */
export function tagMutationsOnStructure(
  structure: ResolvedStructure3D,
  mutations: SequenceMutation[]
): void {
  if (!mutations || mutations.length === 0) return;

  const chain = structure.chains[0];
  if (!chain) return;

  for (const mut of mutations) {
    // 1-based coordinate in mutation
    const targetIdx = mut.position - 1;
    const res = chain.residues.find((r) => r.index === targetIdx || r.resSeq === mut.position);
    if (res) {
      res.isMutated = true;
      const op = mut.operation.toUpperCase();
      res.mutationType = (op === 'INSERTION' || op === 'DELETION') ? op : 'SUBSTITUTION';
      res.mutationLabel = mut.operation === 'substitution'
        ? `${mut.original}${mut.position}${mut.modified}`
        : `${mut.operation} at pos ${mut.position}`;
    }
  }
}
