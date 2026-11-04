import { ResolvedStructure3D, AtomicCoordinate, ResidueMappingItem } from './types';
import { SequenceType } from '../types';
import { SequenceMutation } from '../editor/types';
import { resolveMacromolecularStructure } from './structureResolver';
import { buildSequenceToStructureMapping } from './residueMapping';
import { dbLogger } from '../../../services/dbLogger';

export interface StructurePipelineDiagnosticOptions {
  targetId: string;
  sequence?: string;
  sequenceType?: SequenceType;
  mutations?: SequenceMutation[];
  rawPdbText?: string;
  existingStructure?: ResolvedStructure3D | null;
  allowSequenceDerivedFallback?: boolean;
}

export interface StructurePipelineDiagnosticReport {
  targetId: string;
  timestamp: string;
  sequenceLength: number;
  retrievalSource: string;
  rawResponseSummary: {
    ok: boolean;
    status?: number;
    source?: string;
    sourceId?: string;
    structureType?: string;
    experimentalMethod?: string;
    resolution?: string;
    pdbTextBytes: number;
    rawPayload?: any;
    ncbiSummary?: {
      accession?: string;
      title?: string;
      organism?: string;
      length?: number;
      moltype?: string;
    };
    rcsbSummary?: {
      pdbId?: string;
      title?: string;
      experimentalMethod?: string;
      resolution?: number;
    };
  };
  coordinateValidation: {
    isValid: boolean;
    totalAtoms: number;
    validFiniteAtoms: number;
    nonFiniteAtomsCount: number;
    emptyArray: boolean;
    chainsCount: number;
    residuesCount: number;
    bounds: {
      min: [number, number, number];
      max: [number, number, number];
      center: [number, number, number];
      radius: number;
    };
  };
  residueMappingReport: {
    isValid: boolean;
    totalSeqLength: number;
    mappedResiduesCount: number;
    unmappedResiduesCount: number;
    coveragePercent: number;
    mismatches: Array<{
      position: number;
      seqChar: string;
      pdbResSeq: number;
      pdbChar: string;
      pdbResName: string;
    }>;
    missingPositions: number[];
    unmappedMutations: Array<{
      position: number;
      label: string;
      reason: string;
    }>;
  };
  errors: string[];
  warnings: string[];
  renderingReady: boolean;
}

/**
 * Diagnostic utility function to trace the structure data retrieval pipeline for a given target ID.
 * - Logs raw API responses from RCSB/NCBI/Server endpoints
 * - Validates coordinate data structure (checking for empty arrays or non-finite values)
 * - Reports specific residue mapping failures before the Three.js rendering stage
 */
export async function diagnoseStructurePipeline(
  options: StructurePipelineDiagnosticOptions
): Promise<StructurePipelineDiagnosticReport> {
  const startTime = Date.now();
  const {
    targetId,
    sequence = '',
    sequenceType = 'PROTEIN',
    mutations = [],
    rawPdbText,
    existingStructure,
    allowSequenceDerivedFallback = true
  } = options;

  const errors: string[] = [];
  const warnings: string[] = [];
  const timestamp = new Date().toISOString();
  const cleanSeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');

  console.log(`[StructurePipelineDiagnostics] Starting pipeline trace for targetId="${targetId}" (seqLen=${cleanSeq.length})...`);

  let resolvedStruct: ResolvedStructure3D | null = existingStructure || null;
  let rawSummary: StructurePipelineDiagnosticReport['rawResponseSummary'] = {
    ok: false,
    pdbTextBytes: rawPdbText ? rawPdbText.length : 0
  };
  let retrievalSource = 'Unknown';

  // --------------------------------------------------------------------------
  // STEP 1: Trace Data Retrieval Pipeline & Log Raw API Responses (RCSB / NCBI)
  // --------------------------------------------------------------------------

  // Check if target ID is an NCBI accession pattern (NP_, NM_, NC_, XP_, NG_, NR_, etc.)
  const isNcbiAccession = /^(NP_|NM_|NC_|XP_|NG_|NR_|WP_|AP_|GP_|[0-9]{5,10})/i.test(targetId);
  if (isNcbiAccession) {
    console.log(`[StructurePipelineDiagnostics] Target ID "${targetId}" identified as NCBI Accession. Querying NCBI E-Utilities...`);
    try {
      const ncbiDb = sequenceType === 'PROTEIN' || targetId.toUpperCase().startsWith('NP_') ? 'protein' : 'nucleotide';
      const ncbiUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=${ncbiDb}&id=${encodeURIComponent(targetId)}&retmode=json`;
      
      const ncbiRes = await fetch(ncbiUrl);
      if (ncbiRes.ok) {
        const ncbiJson = await ncbiRes.json();
        console.log(`[StructurePipelineDiagnostics] Raw NCBI API Response received:`, ncbiJson);
        const resultObj = ncbiJson.result || {};
        const uids: string[] = resultObj.uids || [];
        const doc = uids[0] ? resultObj[uids[0]] : null;

        if (doc) {
          rawSummary.ncbiSummary = {
            accession: doc.caption || doc.accessionversion || targetId,
            title: doc.title || doc.caption,
            organism: typeof doc.organism === 'string' ? doc.organism : doc.organism?.name,
            length: doc.slen ? parseInt(String(doc.slen), 10) : undefined,
            moltype: doc.moltype || doc.biomol
          };
          console.log(`[StructurePipelineDiagnostics] Logged NCBI record metadata for ${targetId}: "${rawSummary.ncbiSummary.title}" (${rawSummary.ncbiSummary.organism || 'Organism unknown'})`);
        }
      } else {
        warnings.push(`NCBI E-Utilities query for ${targetId} returned HTTP ${ncbiRes.status}`);
      }
    } catch (ncbiErr: any) {
      warnings.push(`NCBI E-Utilities fetch error for ${targetId}: ${ncbiErr?.message || String(ncbiErr)}`);
    }
  }

  // Check if target ID contains or matches a 4-character PDB ID pattern
  const pdbMatch = targetId.match(/\b([0-9][a-zA-Z0-9]{3})\b/);
  if (pdbMatch) {
    const candidatePdbId = pdbMatch[1].toUpperCase();
    console.log(`[StructurePipelineDiagnostics] Target ID contains PDB candidate "${candidatePdbId}". Querying RCSB Data API...`);
    try {
      const rcsbDataUrl = `https://data.rcsb.org/rest/v1/core/entry/${candidatePdbId}`;
      const rcsbRes = await fetch(rcsbDataUrl);
      if (rcsbRes.ok) {
        const rcsbJson = await rcsbRes.json();
        console.log(`[StructurePipelineDiagnostics] Raw RCSB PDB Data API Response received for ${candidatePdbId}:`, rcsbJson);
        
        const structTitle = rcsbJson.struct?.title || rcsbJson.citation?.[0]?.title;
        const expMethod = rcsbJson.exptl?.[0]?.method;
        const resolution = rcsbJson.rcsb_entry_info?.resolution_combined?.[0];

        rawSummary.rcsbSummary = {
          pdbId: candidatePdbId,
          title: structTitle,
          experimentalMethod: expMethod,
          resolution: typeof resolution === 'number' ? resolution : undefined
        };
        console.log(`[StructurePipelineDiagnostics] Logged RCSB PDB metadata for ${candidatePdbId}: "${structTitle}" Method=${expMethod || 'N/A'}, Resolution=${resolution ? `${resolution}Å` : 'N/A'}`);
      }
    } catch (rcsbErr: any) {
      warnings.push(`RCSB PDB Data API fetch error for ${candidatePdbId}: ${rcsbErr?.message || String(rcsbErr)}`);
    }
  }

  // Handle pre-resolved structure vs on-demand resolution
  if (resolvedStruct) {
    retrievalSource = `Pre-resolved Structure (${resolvedStruct.sourceName || resolvedStruct.source})`;
    rawSummary = {
      ...rawSummary,
      ok: true,
      status: 200,
      source: resolvedStruct.source,
      sourceId: resolvedStruct.sourceId,
      structureType: resolvedStruct.structureType,
      experimentalMethod: resolvedStruct.experimentalMethod,
      resolution: resolvedStruct.resolutionText,
      pdbTextBytes: rawPdbText?.length || resolvedStruct.rawPdbText?.length || 0,
      rawPayload: {
        id: resolvedStruct.id,
        title: resolvedStruct.title,
        chainsCount: resolvedStruct.chains?.length || 0,
        allAtomsCount: resolvedStruct.allAtoms?.length || 0
      }
    };
  } else {
    try {
      console.log(`[StructurePipelineDiagnostics] Requesting /api/structure/resolve endpoint for targetId="${targetId}"...`);
      const apiRes = await fetch('/api/structure/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequence: cleanSeq,
          sequenceId: targetId,
          accession: targetId,
          sequenceType,
          allowSequenceDerivedFallback,
          mutations
        })
      });

      if (apiRes.ok) {
        const payload = await apiRes.json();
        console.log(`[StructurePipelineDiagnostics] Raw API Response received from /api/structure/resolve:`, payload);
        rawSummary = {
          ...rawSummary,
          ok: payload.ok ?? false,
          status: apiRes.status,
          source: payload.structure?.source,
          sourceId: payload.structure?.sourceId,
          structureType: payload.structure?.structureType,
          experimentalMethod: payload.structure?.experimentalMethod,
          resolution: payload.structure?.resolution,
          pdbTextBytes: payload.structure?.pdbText?.length || 0,
          rawPayload: payload
        };
        retrievalSource = payload.structure?.source || 'Server API';
      } else {
        warnings.push(`Server API endpoint /api/structure/resolve returned HTTP status ${apiRes.status}`);
      }
    } catch (apiErr: any) {
      warnings.push(`Server API fetch failed: ${apiErr?.message || String(apiErr)}.`);
    }

    // Direct RCSB file download trace if primary resolve did not yield OK
    if (!rawSummary.ok && pdbMatch) {
      const candidatePdbId = pdbMatch[1].toUpperCase();
      console.log(`[StructurePipelineDiagnostics] Querying RCSB PDB Archive file directly for ${candidatePdbId}...`);
      try {
        const rcsbFileRes = await fetch(`https://files.rcsb.org/download/${candidatePdbId}.pdb`);
        if (rcsbFileRes.ok) {
          const pdbTxt = await rcsbFileRes.text();
          console.log(`[StructurePipelineDiagnostics] Raw RCSB PDB File Response received: ${pdbTxt.length} bytes.`);
          rawSummary = {
            ...rawSummary,
            ok: true,
            status: rcsbFileRes.status,
            source: 'RCSB PDB Archive Direct',
            sourceId: candidatePdbId,
            structureType: 'EXPERIMENTAL',
            pdbTextBytes: pdbTxt.length
          };
          retrievalSource = 'RCSB PDB Direct Download';
        } else {
          errors.push(`Direct RCSB PDB query for ${candidatePdbId} returned HTTP ${rcsbFileRes.status}`);
        }
      } catch (rcsbErr: any) {
        errors.push(`RCSB PDB direct fetch error: ${rcsbErr?.message || String(rcsbErr)}`);
      }
    }

    // Perform full resolution to inspect final 3D macromolecular object
    try {
      resolvedStruct = await resolveMacromolecularStructure({
        sequence: cleanSeq,
        sequenceType,
        accessionOrPdbId: targetId,
        sequenceId: targetId,
        mutations,
        allowSequenceDerivedFallback
      });
      retrievalSource = resolvedStruct.sourceName || resolvedStruct.source || retrievalSource;
    } catch (resErr: any) {
      errors.push(`Macromolecular structure resolution failed: ${resErr?.message || String(resErr)}`);
    }
  }

  // --------------------------------------------------------------------------
  // STEP 2: Validate Coordinate Data Structure (Checking empty arrays & non-finite values)
  // --------------------------------------------------------------------------
  const allAtoms: AtomicCoordinate[] = resolvedStruct?.allAtoms || [];
  const chains = resolvedStruct?.chains || [];
  const totalAtoms = allAtoms.length;
  const emptyArray = totalAtoms === 0;

  let validFiniteAtoms = 0;
  let nonFiniteAtomsCount = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  if (emptyArray) {
    errors.push('Coordinate data validation failed: allAtoms array is empty (0 atomic coordinates found).');
  } else {
    for (let i = 0; i < allAtoms.length; i++) {
      const a = allAtoms[i];
      const isFiniteX = Number.isFinite(a.x) && !Number.isNaN(a.x);
      const isFiniteY = Number.isFinite(a.y) && !Number.isNaN(a.y);
      const isFiniteZ = Number.isFinite(a.z) && !Number.isNaN(a.z);

      if (isFiniteX && isFiniteY && isFiniteZ) {
        validFiniteAtoms++;
        if (a.x < minX) minX = a.x;
        if (a.y < minY) minY = a.y;
        if (a.z < minZ) minZ = a.z;
        if (a.x > maxX) maxX = a.x;
        if (a.y > maxY) maxY = a.y;
        if (a.z > maxZ) maxZ = a.z;
      } else {
        nonFiniteAtomsCount++;
      }
    }

    if (nonFiniteAtomsCount > 0) {
      errors.push(`Coordinate data structure contains ${nonFiniteAtomsCount} non-finite/NaN coordinate value(s).`);
    }
  }

  const bounds = {
    min: [minX === Infinity ? 0 : minX, minY === Infinity ? 0 : minY, minZ === Infinity ? 0 : minZ] as [number, number, number],
    max: [maxX === -Infinity ? 0 : maxX, maxY === -Infinity ? 0 : maxY, maxZ === -Infinity ? 0 : maxZ] as [number, number, number],
    center: [
      minX === Infinity ? 0 : (minX + maxX) / 2,
      minY === Infinity ? 0 : (minY + maxY) / 2,
      minZ === Infinity ? 0 : (minZ + maxZ) / 2
    ] as [number, number, number],
    radius: Math.sqrt(
      Math.pow((maxX - minX) / 2, 2) +
      Math.pow((maxY - minY) / 2, 2) +
      Math.pow((maxZ - minZ) / 2, 2)
    ) || 0
  };

  const residuesCount = chains.reduce((acc, c) => acc + (c.residues?.length || 0), 0);

  const coordinateValidation = {
    isValid: !emptyArray && nonFiniteAtomsCount === 0 && validFiniteAtoms > 0,
    totalAtoms,
    validFiniteAtoms,
    nonFiniteAtomsCount,
    emptyArray,
    chainsCount: chains.length,
    residuesCount,
    bounds
  };

  // --------------------------------------------------------------------------
  // STEP 3: Report Specific Residue Mapping Failures Before Three.js Stage
  // --------------------------------------------------------------------------
  const mismatches: StructurePipelineDiagnosticReport['residueMappingReport']['mismatches'] = [];
  const missingPositions: number[] = [];
  const unmappedMutations: StructurePipelineDiagnosticReport['residueMappingReport']['unmappedMutations'] = [];

  let mappedResiduesCount = 0;
  
  // Obtain sequence-to-structure mapping array
  const mappingItems: ResidueMappingItem[] = buildSequenceToStructureMapping(cleanSeq, resolvedStruct);

  if (cleanSeq.length > 0 && resolvedStruct) {
    for (let pos = 1; pos <= cleanSeq.length; pos++) {
      const seqChar = cleanSeq[pos - 1];
      const mappedItem = mappingItems[pos - 1];

      if (mappedItem && mappedItem.status === 'modeled') {
        mappedResiduesCount++;
        const resObj = mappedItem.residue;
        const resCode1 = resObj?.code1 || mappedItem.seqAa;

        // Check for amino acid single-letter mismatch between sequence and PDB residue
        if (resCode1 && resCode1.toUpperCase() !== seqChar.toUpperCase() && resCode1 !== 'X') {
          mismatches.push({
            position: pos,
            seqChar,
            pdbResSeq: mappedItem.structureResSeq || pos,
            pdbChar: resCode1,
            pdbResName: mappedItem.structureResName || resObj?.name || 'UNK'
          });
        }
      } else {
        missingPositions.push(pos);
      }
    }

    // Verify tracked mutations against structure coordinates
    for (const mut of mutations) {
      const mappedItem = mappingItems[mut.position - 1];
      if (!mappedItem || mappedItem.status !== 'modeled') {
        unmappedMutations.push({
          position: mut.position,
          label: `${mut.original || ''}${mut.position}${mut.modified || ''}`,
          reason: `Position ${mut.position} is outside 3D structure coordinate coverage (Unresolved/Unmodeled region)`
        });
      }
    }
  }

  if (mismatches.length > 0) {
    warnings.push(`Detected ${mismatches.length} residue code mismatch(es) between sequence and structure.`);
  }
  if (unmappedMutations.length > 0) {
    warnings.push(`${unmappedMutations.length} tracked mutation(s) fall outside structure coordinates.`);
  }

  const coveragePercent = cleanSeq.length > 0
    ? Number(((mappedResiduesCount / cleanSeq.length) * 100).toFixed(1))
    : 0;

  const residueMappingReport = {
    isValid: cleanSeq.length === 0 || mappedResiduesCount > 0,
    totalSeqLength: cleanSeq.length,
    mappedResiduesCount,
    unmappedResiduesCount: cleanSeq.length - mappedResiduesCount,
    coveragePercent,
    mismatches,
    missingPositions,
    unmappedMutations
  };

  // Three.js rendering readiness evaluation
  const renderingReady = coordinateValidation.isValid && coordinateValidation.chainsCount > 0 && coordinateValidation.validFiniteAtoms > 0;

  const durationMs = Date.now() - startTime;

  const report: StructurePipelineDiagnosticReport = {
    targetId,
    timestamp,
    sequenceLength: cleanSeq.length,
    retrievalSource,
    rawResponseSummary: rawSummary,
    coordinateValidation,
    residueMappingReport,
    errors,
    warnings,
    renderingReady
  };

  // Format and emit console log report with clear diagnostic tags
  console.log(`[StructurePipelineDiagnostics] Pipeline report for targetId="${targetId}" completed in ${durationMs}ms:`, {
    retrievalSource,
    renderingReady,
    atoms: `${coordinateValidation.validFiniteAtoms}/${coordinateValidation.totalAtoms}`,
    nonFiniteAtoms: coordinateValidation.nonFiniteAtomsCount,
    coverage: `${coveragePercent}% (${mappedResiduesCount}/${cleanSeq.length} residues)`,
    mismatches: mismatches.length,
    unmappedMutations: unmappedMutations.length,
    errorsCount: errors.length,
    warningsCount: warnings.length
  });

  // Log to DB Logger for debugging transparency
  try {
    dbLogger.log({
      operation: 'HEALTH_CHECK',
      status: errors.length > 0 ? 'FAILED' : 'SUCCESS',
      message: `[StructureDiagnostics] Traced ${targetId} -> Source: ${retrievalSource}, RenderingReady: ${renderingReady}, Atoms: ${coordinateValidation.validFiniteAtoms}, Coverage: ${coveragePercent}%`,
      details: report
    });
  } catch {}

  return report;
}
