import { ResolvedStructure3D } from './types';
import { SequenceType } from '../types';
import { parsePDBText } from './pdbParser';
import { SequenceMutation } from '../editor/types';
import { generateProteinStructure3D, generateDnaStructure3D, generateRnaStructure3D, generateMutatedHomologyPdb } from './structureGenerator';
import { buildSequenceToStructureMapping } from './residueMapping';

export interface StructureResolutionOptions {
  sequence: string;
  sequenceType: SequenceType;
  accessionOrPdbId?: string;
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
}

// Client-side cache keyed by sequenceHash
const structureCache = new Map<string, ResolvedStructure3D>();

/**
 * Fast client-side hash calculation for sequence cache keys
 */
export function computeClientSequenceHash(sequence: string): string {
  const clean = sequence.toUpperCase().replace(/[^A-Z]/g, '');
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    const char = clean.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16)}_${clean.length}`;
}

/**
 * Main Resolution Engine: Communicates with backend structure prediction & PDB service
 * Always derived from active biological sequence
 */
export async function resolveMacromolecularStructure(
  options: StructureResolutionOptions
): Promise<ResolvedStructure3D> {
  const { 
    sequence, 
    sequenceType, 
    accessionOrPdbId, 
    sequenceId = 'seq_active',
    sequenceVersion = 'v1', 
    mutations = [], 
    title,
    useCache = true,
    allowSequenceDerivedFallback = true,
    onProgress,
    originalSequence,
    templatePdbId,
    templatePdbText
  } = options;

  const cleanSeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');
  const normalizedSeqType: SequenceType = ((sequenceType as string) || 'PROTEIN').toUpperCase().trim() as SequenceType;
  const seqHash = computeClientSequenceHash(cleanSeq);
  const cacheKey = `${seqHash}_${sequenceVersion}_${mutations.length}_${accessionOrPdbId || ''}_${normalizedSeqType}_${templatePdbId || ''}_${allowSequenceDerivedFallback}`;

  if (useCache && structureCache.has(cacheKey)) {
    const cached = structureCache.get(cacheKey)!;
    return cached;
  }

  onProgress?.('Preparing active sequence...');

  try {
    onProgress?.('Querying RCSB PDB & Structure Engine...');
    
    // Call the dedicated backend structure service
    const response = await fetch('/api/structure/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sequence: cleanSeq,
        sequenceId,
        sequenceVersion,
        sequenceHash: seqHash,
        accession: accessionOrPdbId,
        sequenceType: normalizedSeqType,
        allowSequenceDerivedFallback,
        originalSequence,
        templatePdbId,
        templatePdbText,
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
      onProgress?.('Resolving atomic coordinates...');
      const data = await response.json();
      if (data.ok && data.structure) {
        // CASE: STRUCTURE UNAVAILABLE
        if (data.structure.structureType === 'UNAVAILABLE') {
          // If we have template PDB text locally, perform client-side comparative mutagenesis
          if (templatePdbText && mutations.length > 0) {
            onProgress?.('Generating structural model from template...');
            const { pdbText: mutatedPdb, modeledCount, modeledPositions } = generateMutatedHomologyPdb(
              templatePdbText,
              mutations,
              templatePdbId || 'TEMPLATE'
            );
            const parsed = parsePDBText(mutatedPdb, `${templatePdbId || 'MODEL'}-MOD`);
            const startRes = parsed.chains?.[0]?.residues?.[0]?.resSeq || 1;
            const endRes = parsed.chains?.[0]?.residues?.[parsed.chains[0].residues.length - 1]?.resSeq || cleanSeq.length;
            const coveredCount = parsed.chains?.[0]?.residues?.length || 0;
            const covPct = Number(((coveredCount / cleanSeq.length) * 100).toFixed(1));
            const isPartial = covPct < 95.0 || startRes > 3 || endRes < cleanSeq.length - 3;
            parsed.structureType = 'PREDICTED';
            parsed.sourceName = `Homology Mutation Model (Template: ${templatePdbId || 'Base Structure'})`;
            parsed.sourceId = `${templatePdbId || 'MODEL'}-MOD`;
            parsed.predictionMethod = `Template-Based Homology Modeling (Point Mutagenesis on ${templatePdbId || 'Template Coordinates'})`;
            parsed.coverageInfo = {
              startResSeq: startRes,
              endResSeq: endRes,
              coveredResiduesCount: coveredCount,
              totalSequenceLength: cleanSeq.length,
              coveragePercent: covPct,
              isPartial,
              unresolvedRegions: [],
              chain: parsed.chains?.[0]?.id || 'A'
            };
            parsed.confidenceInfo = {
              metric: 'Homology Modeling',
              value: `Template ${templatePdbId || 'Model'} (${modeledCount}/${mutations.length} mutations in 3D model)`,
              description: modeledCount > 0
                ? `Derived from template crystal structure with ${modeledCount} mutation(s) modeled inside coordinates (${modeledPositions.join(', ')}). ${mutations.length - modeledCount} mutation(s) are outside structure coverage (Unmodeled).`
                : `Derived from template structure. All ${mutations.length} mutations fall outside the partial structure coordinates (${startRes}–${endRes}) and are tracked honestly as Unmodeled.`
            };
            parsed.sequenceId = sequenceId;
            parsed.sequenceVersion = sequenceVersion;
            parsed.sequenceHash = seqHash;
            parsed.sequenceLength = cleanSeq.length;
            parsed.isOutdated = false;
            parsed.residueMapping = buildSequenceToStructureMapping(cleanSeq, parsed);
            tagMutationsOnStructure(parsed, mutations);
            structureCache.set(cacheKey, parsed);
            onProgress?.('Structure Ready');
            return parsed;
          }

          // If sequence-derived schematic fallback is allowed and length is within reasonable visual boundary
          if (allowSequenceDerivedFallback && cleanSeq.length >= 4 && cleanSeq.length <= 4000) {
            onProgress?.('Generating idealized molecular schematic...');
            let schematic: ResolvedStructure3D;
            if (normalizedSeqType === 'DNA') {
              schematic = generateDnaStructure3D(cleanSeq, accessionOrPdbId ? `B-DNA Helix (${accessionOrPdbId})` : 'B-DNA Double Helix Model');
              schematic.structureType = 'SEQUENCE_DERIVED';
              schematic.sourceName = 'Idealized B-DNA Molecular Schematic';
              schematic.sourceId = 'B-DNA-SCHEMATIC';
              schematic.predictionMethod = 'Idealized Double Helix Geometric Schematic (Right-Handed B-Form)';
              schematic.confidenceInfo = {
                metric: 'Model Provenance',
                value: 'Idealized Molecular Schematic (Non-Experimental)',
                description: 'Idealized stereochemical schematic for visualization. This is NOT an experimentally determined 3D structure or predicted folded conformation. A sequence alone does not determine exact 3D structure without experimental crystallization.'
              };
              schematic.coverageInfo = {
                startResSeq: 1,
                endResSeq: cleanSeq.length,
                coveredResiduesCount: cleanSeq.length,
                totalSequenceLength: cleanSeq.length,
                coveragePercent: 100,
                isPartial: false,
                unresolvedRegions: [],
                chain: 'A/B'
              };
            } else if (normalizedSeqType === 'RNA') {
              schematic = generateRnaStructure3D(cleanSeq, undefined, accessionOrPdbId ? `RNA Fold (${accessionOrPdbId})` : 'RNA Tertiary Folded Model');
              schematic.structureType = 'SEQUENCE_DERIVED';
              schematic.sourceName = 'Idealized A-Form RNA Molecular Schematic';
              schematic.sourceId = 'RNA-SCHEMATIC';
              schematic.predictionMethod = 'Idealized RNA Tertiary Fold Schematic (A-Form)';
              schematic.confidenceInfo = {
                metric: 'Model Provenance',
                value: 'Idealized Molecular Schematic (Non-Experimental)',
                description: 'Idealized stereochemical schematic for visualization. This is NOT an experimentally determined 3D structure or predicted folded conformation. A sequence alone does not determine exact 3D structure.'
              };
              schematic.coverageInfo = {
                startResSeq: 1,
                endResSeq: cleanSeq.length,
                coveredResiduesCount: cleanSeq.length,
                totalSequenceLength: cleanSeq.length,
                coveragePercent: 100,
                isPartial: false,
                unresolvedRegions: [],
                chain: 'A'
              };
            } else {
              schematic = generateProteinStructure3D(cleanSeq, undefined, accessionOrPdbId ? `Protein Fold (${accessionOrPdbId})` : 'Sequence-Derived Protein Model');
              schematic.structureType = 'SEQUENCE_DERIVED';
              schematic.sourceName = 'Sequence-Derived Molecular Schematic (Not Experimental)';
              schematic.sourceId = 'SEQ-SCHEMATIC';
              schematic.predictionMethod = 'Algorithmic Secondary Structure Fold (Ramachandran-Constrained Backbone)';
              schematic.confidenceInfo = {
                metric: 'Model Provenance',
                value: 'Idealized Molecular Schematic',
                description: 'Algorithmic secondary fold model for exploratory sequence visualization. Not an experimentally determined 3D structure or predicted folded conformation. A sequence alone does not determine exact 3D structure.'
              };
              schematic.coverageInfo = {
                startResSeq: 1,
                endResSeq: cleanSeq.length,
                coveredResiduesCount: cleanSeq.length,
                totalSequenceLength: cleanSeq.length,
                coveragePercent: 100,
                isPartial: false,
                unresolvedRegions: [],
                chain: 'A'
              };
            }
            schematic.sequenceId = sequenceId;
            schematic.sequenceVersion = sequenceVersion;
            schematic.sequenceHash = seqHash;
            schematic.sequenceLength = cleanSeq.length;
            schematic.isOutdated = false;
            schematic.residueMapping = buildSequenceToStructureMapping(cleanSeq, schematic);
            tagMutationsOnStructure(schematic, mutations);
            structureCache.set(cacheKey, schematic);
            onProgress?.('Structure Ready');
            return schematic;
          }

          const unavail: ResolvedStructure3D = {
            id: data.structure.id || `struct_unavail_${seqHash.slice(0, 8)}`,
            title: `Structure Unavailable (${accessionOrPdbId || 'Custom Target'})`,
            source: 'none' as any,
            macromoleculeType: normalizedSeqType,
            structureType: 'UNAVAILABLE',
            sourceName: 'None',
            confidenceInfo: data.structure.confidence,
            chains: [],
            allAtoms: [],
            ligands: [],
            disulfideBonds: [],
            secondaryStructureSummary: { helixCount: 0, sheetCount: 0, coilCount: 0, helixPercent: 0, sheetPercent: 0, coilPercent: 0 },
            sequenceId,
            sequenceVersion,
            sequenceHash: seqHash,
            sequenceLength: cleanSeq.length,
            isOutdated: false,
            boundingBox: { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], size: [0, 0, 0], radius: 0 }
          };
          structureCache.set(cacheKey, unavail);
          onProgress?.('Structure Unavailable');
          return unavail;
        }

        // CASE: REAL PDB COORDINATES LOADED
        if (data.structure.pdbText) {
          onProgress?.('Rendering 3D macromolecular canvas...');
          const parsed = parsePDBText(
            data.structure.pdbText,
            data.structure.sourceId || accessionOrPdbId || '3D_MODEL'
          );

          // Populate genuine provenance and synchronization metadata
          parsed.structureType = data.structure.structureType;
          parsed.sourceName = data.structure.source;
          parsed.sourceId = data.structure.sourceId;
          parsed.resolutionText = data.structure.resolution;
          parsed.experimentalMethod = data.structure.experimentalMethod;
          parsed.predictionMethod = data.structure.predictionMethod;
          parsed.confidenceInfo = data.structure.confidence;
          parsed.coverageInfo = data.structure.coverageInfo;
          parsed.sequenceId = sequenceId;
          parsed.sequenceVersion = sequenceVersion;
          parsed.sequenceHash = data.structure.sequenceHash || seqHash;
          parsed.sequenceLength = cleanSeq.length;
          parsed.isOutdated = false;
          parsed.generatedAt = data.structure.generatedAt || new Date().toISOString();

          // Construct genuine sequence position -> structure residue mapping
          parsed.residueMapping = buildSequenceToStructureMapping(cleanSeq, parsed);

          // Tag tracked mutations
          tagMutationsOnStructure(parsed, mutations);

          structureCache.set(cacheKey, parsed);
          onProgress?.('Structure Ready');
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('[StructureResolver] Backend resolution error, falling back to client engine:', err);
    if (templatePdbText && mutations.length > 0) {
      onProgress?.('Generating structural model from template...');
      const { pdbText: mutatedPdb, modeledCount, modeledPositions } = generateMutatedHomologyPdb(
        templatePdbText,
        mutations,
        templatePdbId || 'TEMPLATE'
      );
      const parsed = parsePDBText(mutatedPdb, `${templatePdbId || 'MODEL'}-MOD`);
      const startRes = parsed.chains?.[0]?.residues?.[0]?.resSeq || 1;
      const endRes = parsed.chains?.[0]?.residues?.[parsed.chains[0].residues.length - 1]?.resSeq || cleanSeq.length;
      const coveredCount = parsed.chains?.[0]?.residues?.length || 0;
      const covPct = Number(((coveredCount / cleanSeq.length) * 100).toFixed(1));
      const isPartial = covPct < 95.0 || startRes > 3 || endRes < cleanSeq.length - 3;

      parsed.structureType = 'PREDICTED';
      parsed.sourceName = `Homology Mutation Model (Template: ${templatePdbId || 'Base Structure'})`;
      parsed.sourceId = `${templatePdbId || 'MODEL'}-MOD`;
      parsed.predictionMethod = `Template-Based Homology Modeling (Point Mutagenesis on ${templatePdbId || 'Template Coordinates'})`;
      parsed.coverageInfo = {
        startResSeq: startRes,
        endResSeq: endRes,
        coveredResiduesCount: coveredCount,
        totalSequenceLength: cleanSeq.length,
        coveragePercent: covPct,
        isPartial,
        unresolvedRegions: [],
        chain: parsed.chains?.[0]?.id || 'A'
      };
      parsed.confidenceInfo = {
        metric: 'Homology Modeling',
        value: `Template ${templatePdbId || 'Model'} (${modeledCount}/${mutations.length} mutations in 3D model)`,
        description: modeledCount > 0
          ? `Derived from template crystal structure with ${modeledCount} mutation(s) modeled inside coordinates (${modeledPositions.join(', ')}). ${mutations.length - modeledCount} mutation(s) are outside structure coverage (Unmodeled).`
          : `Derived from template structure. All ${mutations.length} mutations fall outside the partial structure coordinates (${startRes}–${endRes}) and are tracked honestly as Unmodeled.`
      };
      parsed.sequenceId = sequenceId;
      parsed.sequenceVersion = sequenceVersion;
      parsed.sequenceHash = seqHash;
      parsed.sequenceLength = cleanSeq.length;
      parsed.isOutdated = false;
      parsed.residueMapping = buildSequenceToStructureMapping(cleanSeq, parsed);
      tagMutationsOnStructure(parsed, mutations);
      structureCache.set(cacheKey, parsed);
      onProgress?.('Structure Ready');
      return parsed;
    }
  }

  // Client Fallback: If 4-character PDB code is specified, fetch directly from RCSB
  const pdbCodeMatch = accessionOrPdbId?.match(/\b([0-9][a-zA-Z0-9]{3})\b/);
  if (pdbCodeMatch) {
    const candidatePdbId = pdbCodeMatch[1].toUpperCase();
    try {
      onProgress?.(`Fetching PDB ${candidatePdbId} from RCSB...`);
      const url = `https://files.rcsb.org/download/${candidatePdbId}.pdb`;
      const res = await fetch(url);
      if (res.ok) {
        const pdbText = await res.text();
        const parsed = parsePDBText(pdbText, candidatePdbId);
        parsed.structureType = 'EXPERIMENTAL';
        parsed.sourceName = 'RCSB PDB';
        parsed.sourceId = candidatePdbId;
        parsed.sequenceId = sequenceId;
        parsed.sequenceVersion = sequenceVersion;
        parsed.sequenceHash = seqHash;
        parsed.sequenceLength = cleanSeq.length;
        parsed.isOutdated = false;
        tagMutationsOnStructure(parsed, mutations);
        structureCache.set(cacheKey, parsed);
        onProgress?.('Structure Ready');
        return parsed;
      }
    } catch {}
  }

  // If user did NOT allow sequence-derived fallback, return UNAVAILABLE
  if (!allowSequenceDerivedFallback) {
    const unavail: ResolvedStructure3D = {
      id: `struct_unavail_${seqHash.slice(0, 8)}`,
      title: `Structure Unavailable (${accessionOrPdbId || 'Custom Target'})`,
      source: 'none' as any,
      macromoleculeType: normalizedSeqType,
      structureType: 'UNAVAILABLE',
      sourceName: 'None',
      confidenceInfo: {
        metric: 'Status',
        value: 'Structure Unavailable',
        description: 'No experimentally determined or supported predicted structure is available for this sequence.'
      },
      chains: [],
      allAtoms: [],
      ligands: [],
      disulfideBonds: [],
      secondaryStructureSummary: { helixCount: 0, sheetCount: 0, coilCount: 0, helixPercent: 0, sheetPercent: 0, coilPercent: 0 },
      sequenceId,
      sequenceVersion,
      sequenceHash: seqHash,
      sequenceLength: cleanSeq.length,
      isOutdated: false,
      boundingBox: { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], size: [0, 0, 0], radius: 0 }
    };
    structureCache.set(cacheKey, unavail);
    onProgress?.('Structure Unavailable');
    return unavail;
  }

  // Final fallback: Sequence-derived visualization (ONLY when explicitly allowed)
  onProgress?.('Generating sequence-derived 3D model...');
  let parsed: ResolvedStructure3D;
  if (normalizedSeqType === 'DNA') {
    parsed = generateDnaStructure3D(cleanSeq, accessionOrPdbId ? `DNA Helix (${accessionOrPdbId})` : 'B-DNA Double Helix Model');
    parsed.structureType = 'SEQUENCE_DERIVED';
    parsed.sourceName = 'Algorithmic B-DNA Geometric Engine';
    parsed.sourceId = 'B-DNA Double Helix';
    parsed.predictionMethod = 'Stereochemical Double Helix Generation (Right-Handed B-Form)';
    parsed.coverageInfo = {
      startResSeq: 1,
      endResSeq: cleanSeq.length,
      coveredResiduesCount: cleanSeq.length,
      totalSequenceLength: cleanSeq.length,
      coveragePercent: 100,
      isPartial: false,
      unresolvedRegions: [],
      chain: 'A/B'
    };
  } else if (normalizedSeqType === 'RNA') {
    parsed = generateRnaStructure3D(cleanSeq, undefined, accessionOrPdbId ? `RNA Fold (${accessionOrPdbId})` : 'RNA Tertiary Folded Model');
    parsed.structureType = 'SEQUENCE_DERIVED';
    parsed.sourceName = 'RNA Secondary Structure 3D Fold Engine';
    parsed.sourceId = 'A-Form RNA Fold';
    parsed.predictionMethod = 'Thermodynamic Secondary Fold with A-Form Coordinates';
    parsed.coverageInfo = {
      startResSeq: 1,
      endResSeq: cleanSeq.length,
      coveredResiduesCount: cleanSeq.length,
      totalSequenceLength: cleanSeq.length,
      coveragePercent: 100,
      isPartial: false,
      unresolvedRegions: [],
      chain: 'A'
    };
  } else {
    parsed = generateProteinStructure3D(cleanSeq, undefined, accessionOrPdbId ? `Protein Fold (${accessionOrPdbId})` : 'Sequence-Derived Protein Model');
    parsed.structureType = 'SEQUENCE_DERIVED';
    parsed.sourceName = 'Algorithmic Geometric Engine';
    parsed.sourceId = 'Ramachandran-Constrained Model';
    parsed.predictionMethod = 'Algorithmic Secondary Structure Fold (Ramachandran-Constrained Backbone)';
    parsed.confidenceInfo = {
      metric: 'Model Type',
      value: 'Sequence-Derived Visualization',
      description: 'Algorithmic geometric model based on secondary structure propensities. Not an experimental crystal structure or predicted structure.'
    };
    parsed.coverageInfo = {
      startResSeq: 1,
      endResSeq: cleanSeq.length,
      coveredResiduesCount: cleanSeq.length,
      totalSequenceLength: cleanSeq.length,
      coveragePercent: 100,
      isPartial: false,
      unresolvedRegions: [],
      chain: 'A'
    };
  }

  parsed.sequenceId = sequenceId;
  parsed.sequenceVersion = sequenceVersion;
  parsed.sequenceHash = seqHash;
  parsed.sequenceLength = cleanSeq.length;
  parsed.isOutdated = false;
  tagMutationsOnStructure(parsed, mutations);
  structureCache.set(cacheKey, parsed);
  onProgress?.('Structure Ready');
  return parsed;
}

/**
 * Direct RCSB PDB fetch helper for custom user lookups
 */
export async function fetchPdbFromRcsb(pdbId: string): Promise<ResolvedStructure3D | null> {
  const cleanId = pdbId.trim().toUpperCase();
  try {
    const url = `https://files.rcsb.org/download/${cleanId}.pdb`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const pdbText = await res.text();
    if (!pdbText.includes('ATOM') && !pdbText.includes('HETATM')) return null;
    const parsed = parsePDBText(pdbText, cleanId);
    parsed.structureType = 'EXPERIMENTAL';
    parsed.sourceName = 'RCSB PDB Archive';
    parsed.sourceId = cleanId;
    parsed.experimentalMethod = 'X-ray Diffraction / Cryo-EM';
    parsed.isOutdated = false;
    return parsed;
  } catch (err) {
    console.error(`[fetchPdbFromRcsb] Failed to fetch ${cleanId}:`, err);
    return null;
  }
}

/**
 * Annotate residue nodes with mutation tracking metadata (highlighted in RED in viewer)
 * Follows strict scientific honesty:
 * Only tags a residue if resSeq strictly equals mutation position.
 * Never matches by array index (which causes partial structures to tag wrong residues).
 */
export function tagMutationsOnStructure(
  structure: ResolvedStructure3D,
  mutations: SequenceMutation[]
): void {
  if (!structure.chains || structure.chains.length === 0) return;

  // Clean all previous mutation flags first
  for (const chain of structure.chains) {
    for (const res of chain.residues) {
      res.isMutated = false;
      res.mutationType = undefined;
      res.mutationLabel = undefined;
    }
  }

  if (!mutations || mutations.length === 0) return;

  for (const chain of structure.chains) {
    for (const mut of mutations) {
      // ONLY match if PDB residue number matches the biological sequence position
      const res = chain.residues.find((r) => r.resSeq === mut.position);
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
