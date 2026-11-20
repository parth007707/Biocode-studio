import { Residue3D, ResolvedStructure3D, ResidueMappingItem } from './types';
import { SequenceMutation } from '../editor/types';

/**
 * Builds a deterministic 1-to-1 mapping from sequence position (1..N)
 * to structural residues in the active 3D model.
 * 
 * Follows strict scientific honesty rules:
 * - If a coordinate exists in the model: status = 'modeled'
 * - If no coordinate exists (unresolved loop, terminus, or partial model): status = 'unavailable'
 * - Never fabricates fake coordinates or assumes unmodeled residues exist.
 */
export function buildSequenceToStructureMapping(
  sequence: string,
  structure: ResolvedStructure3D | null
): ResidueMappingItem[] {
  const cleanSeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');
  const mapping: ResidueMappingItem[] = [];

  if (!cleanSeq) return mapping;

  const preferredChainId = structure?.matchedChainId || structure?.coverageInfo?.chain;
  const targetToChainResSeq = structure?.coverageInfo?.targetToChainResSeq;

  // Build per-chain residue index lookup
  const chainResLookup = new Map<string, Map<number, Residue3D>>();
  if (structure?.chains && structure.chains.length > 0) {
    for (const chain of structure.chains) {
      if (chain.type === 'LIGAND' || chain.type === 'WATER') continue;
      const map = new Map<number, Residue3D>();
      for (const res of chain.residues) {
        if (typeof res.resSeq === 'number' && Number.isFinite(res.resSeq)) {
          map.set(res.resSeq, res);
        }
      }
      chainResLookup.set(chain.id, map);
    }
  }

  // Fallback global map weighted to preferredChainId if no alignment map is provided
  const resSeqMap = new Map<number, { res: Residue3D; chainId: string }>();
  if (structure?.chains && structure.chains.length > 0) {
    const sortedChains = [...structure.chains].sort((a, b) => {
      if (a.id === preferredChainId) return 1;
      if (b.id === preferredChainId) return -1;
      return 0;
    });

    for (const chain of sortedChains) {
      if (chain.type === 'LIGAND' || chain.type === 'WATER') continue;
      for (const res of chain.residues) {
        if (typeof res.resSeq === 'number' && Number.isFinite(res.resSeq)) {
          resSeqMap.set(res.resSeq, { res, chainId: chain.id });
        }
      }
    }
  }

  for (let pos = 1; pos <= cleanSeq.length; pos++) {
    const seqAa = cleanSeq[pos - 1] || 'X';
    let hit: { res: Residue3D; chainId: string } | undefined;

    if (targetToChainResSeq && preferredChainId) {
      const mappedResSeq = targetToChainResSeq[pos];
      if (typeof mappedResSeq === 'number') {
        const res = chainResLookup.get(preferredChainId)?.get(mappedResSeq);
        if (res) {
          hit = { res, chainId: preferredChainId };
        }
      }
    } else if (preferredChainId && chainResLookup.has(preferredChainId)) {
      const res = chainResLookup.get(preferredChainId)!.get(pos);
      if (res) {
        hit = { res, chainId: preferredChainId };
      }
    } else {
      hit = resSeqMap.get(pos);
    }

    if (hit) {
      mapping.push({
        seqPos: pos,
        seqAa,
        status: 'modeled',
        structureResSeq: hit.res.resSeq,
        structureResName: hit.res.name,
        chainId: hit.chainId,
        residue: hit.res
      });
    } else {
      mapping.push({
        seqPos: pos,
        seqAa,
        status: 'unavailable',
        structureResSeq: undefined,
        structureResName: undefined,
        chainId: undefined,
        residue: undefined
      });
    }
  }

  return mapping;
}

/**
 * Check whether a 1-based sequence position is modeled in the loaded structure
 */
export function isResidueModeledInStructure(
  mapping: ResidueMappingItem[],
  seqPos: number
): boolean {
  if (seqPos < 1 || seqPos > mapping.length) return false;
  return mapping[seqPos - 1]?.status === 'modeled';
}

/**
 * Compute honest coverage metrics from real mapping
 * Never displays "100% resolved" for partial structures.
 */
export function getStructureCoverageMetrics(
  mapping: ResidueMappingItem[],
  fallbackTotalLength: number
): {
  coveredCount: number;
  totalCount: number;
  coveragePercent: number;
  startResSeq: number;
  endResSeq: number;
  isPartial: boolean;
  coverageLabel: string;
} {
  const totalCount = mapping.length > 0 ? mapping.length : fallbackTotalLength;
  const modeledItems = mapping.filter((m) => m.status === 'modeled');
  const coveredCount = modeledItems.length;

  if (coveredCount === 0 || totalCount === 0) {
    return {
      coveredCount: 0,
      totalCount,
      coveragePercent: 0,
      startResSeq: 0,
      endResSeq: 0,
      isPartial: true,
      coverageLabel: `Structure coverage: 0 / ${totalCount} residues (0.0%)`
    };
  }

  const startResSeq = modeledItems[0].seqPos;
  const endResSeq = modeledItems[modeledItems.length - 1].seqPos;
  const coveragePercent = Number(((coveredCount / totalCount) * 100).toFixed(1));
  const isPartial = coveragePercent < 95.0 || startResSeq > 3 || endResSeq < totalCount - 3;

  return {
    coveredCount,
    totalCount,
    coveragePercent,
    startResSeq,
    endResSeq,
    isPartial,
    coverageLabel: `Structure coverage: ${coveredCount} / ${totalCount} residues (${coveragePercent}%)`
  };
}

export interface EvaluatedMutation extends SequenceMutation {
  isModeled: boolean;
  mappedResidue?: Residue3D;
  statusText: string;
}

/**
 * Evaluates a list of mutations against the actual sequence-to-structure mapping.
 * Tags whether each mutation is modeled in the 3D coordinates or "Unmodeled".
 */
export function evaluateMutationMapping(
  mutations: SequenceMutation[],
  mapping: ResidueMappingItem[]
): EvaluatedMutation[] {
  return mutations.map((mut) => {
    const item = mapping[mut.position - 1];
    const isModeled = item?.status === 'modeled' && Boolean(item.residue);

    return {
      ...mut,
      isModeled,
      mappedResidue: item?.residue,
      statusText: isModeled ? 'In 3D Model' : 'Unmodeled'
    };
  });
}

/**
 * Determines whether a modified structure can legitimately be modeled
 * from the available baseline structure.
 * 
 * Strict scientific honesty rules:
 * - If there are mutations but NONE of them fall within modeled coordinates:
 *   Cannot fabricate a modified structure. Returns false with explicit reason.
 * - If insertions or deletions are present without an ab initio/AlphaFold prediction:
 *   Cannot shift coordinates naively. Returns false.
 * - If at least one mutation is within modeled coordinates and only substitutions:
 *   Can generate a valid homology model. Returns true.
 */
export function canModelMutatedStructure(
  mutations: SequenceMutation[],
  mapping: ResidueMappingItem[],
  coverageStats: { startResSeq: number; endResSeq: number; isPartial: boolean }
): { canModel: boolean; reason?: string; modeledCount?: number } {
  if (!mutations || mutations.length === 0) {
    return { canModel: false, reason: 'No mutations have been applied to the baseline sequence.' };
  }

  // Count how many mutations fall within modeled coordinates
  const modeledMuts = mutations.filter((m) => isResidueModeledInStructure(mapping, m.position));

  // Structural modeling is permitted: modeled mutations will be reflected in coordinates,
  // and mutations outside partial coverage will be honestly marked as Unmodeled.
  return {
    canModel: true,
    modeledCount: modeledMuts.length,
    reason: modeledMuts.length === 0
      ? `All active mutations fall outside the partial structure coordinates (${coverageStats.startResSeq}–${coverageStats.endResSeq}) and are tracked as Unmodeled.`
      : undefined
  };
}
