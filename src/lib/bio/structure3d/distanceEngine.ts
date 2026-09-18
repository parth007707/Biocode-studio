import {
  AtomicCoordinate,
  Residue3D,
  ResolvedStructure3D,
  StructureSuperpositionResult,
  MeasurementItem
} from './types';

/**
 * Euclidean distance between two 3D coordinates in Angstroms (Å)
 */
export function calculateDistanceAngstrom(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 3-point angle calculation (BAC angle: B -> A -> C) in degrees
 */
export function calculateAngleDegrees(
  pA: { x: number; y: number; z: number },
  pB: { x: number; y: number; z: number },
  pC: { x: number; y: number; z: number }
): number {
  const vAB = { x: pB.x - pA.x, y: pB.y - pA.y, z: pB.z - pA.z };
  const vAC = { x: pC.x - pA.x, y: pC.y - pA.y, z: pC.z - pA.z };

  const dot = vAB.x * vAC.x + vAB.y * vAC.y + vAB.z * vAC.z;
  const magAB = Math.sqrt(vAB.x * vAB.x + vAB.y * vAB.y + vAB.z * vAB.z);
  const magAC = Math.sqrt(vAC.x * vAC.x + vAC.y * vAC.y + vAC.z * vAC.z);

  if (magAB === 0 || magAC === 0) return 0;
  const cosTheta = Math.max(-1, Math.min(1, dot / (magAB * magAC)));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

/**
 * Calculate Root Mean Square Deviation (RMSD) between original and modified structure
 * on matching C-Alpha / backbone coordinates.
 */
export function calculateStructureSuperpositionRMSD(
  original: ResolvedStructure3D,
  modified: ResolvedStructure3D
): StructureSuperpositionResult {
  const origResidues = original.chains[0]?.residues || [];
  const modResidues = modified.chains[0]?.residues || [];

  const minLen = Math.min(origResidues.length, modResidues.length);
  if (minLen === 0) {
    return {
      rmsd: 0,
      alignedResiduesCount: 0,
      mutationShifts: []
    };
  }

  // Calculate centroids of C-Alpha atoms
  let sumOrigX = 0, sumOrigY = 0, sumOrigZ = 0;
  let sumModX = 0, sumModY = 0, sumModZ = 0;
  let validCount = 0;

  for (let i = 0; i < minLen; i++) {
    const rO = origResidues[i];
    const rM = modResidues[i];
    const caO = rO.ca || rO.atoms[0];
    const caM = rM.ca || rM.atoms[0];

    if (caO && caM) {
      sumOrigX += caO.x; sumOrigY += caO.y; sumOrigZ += caO.z;
      sumModX += caM.x; sumModY += caM.y; sumModZ += caM.z;
      validCount++;
    }
  }

  if (validCount === 0) {
    return { rmsd: 0, alignedResiduesCount: 0, mutationShifts: [] };
  }

  const origCentroid = { x: sumOrigX / validCount, y: sumOrigY / validCount, z: sumOrigZ / validCount };
  const modCentroid = { x: sumModX / validCount, y: sumModY / validCount, z: sumModZ / validCount };

  // Calculate shift & RMSD
  let sumSqDiff = 0;
  const mutationShifts: StructureSuperpositionResult['mutationShifts'] = [];

  for (let i = 0; i < minLen; i++) {
    const rO = origResidues[i];
    const rM = modResidues[i];
    const caO = rO.ca || rO.atoms[0];
    const caM = rM.ca || rM.atoms[0];

    if (caO && caM) {
      // Centered coordinates
      const cxO = caO.x - origCentroid.x;
      const cyO = caO.y - origCentroid.y;
      const czO = caO.z - origCentroid.z;

      const cxM = caM.x - modCentroid.x;
      const cyM = caM.y - modCentroid.y;
      const czM = caM.z - modCentroid.z;

      const dx = cxO - cxM;
      const dy = cyO - cyM;
      const dz = czO - czM;
      const distSq = dx * dx + dy * dy + dz * dz;
      sumSqDiff += distSq;

      const deltaAngstrom = Math.round(Math.sqrt(distSq) * 100) / 100;
      let significance: 'MINIMAL' | 'MODERATE' | 'SIGNIFICANT' | 'SEVERE' = 'MINIMAL';
      if (deltaAngstrom > 3.0) significance = 'SEVERE';
      else if (deltaAngstrom > 1.5) significance = 'SIGNIFICANT';
      else if (deltaAngstrom > 0.6) significance = 'MODERATE';

      if (rO.code1 !== rM.code1 || deltaAngstrom > 0.5) {
        mutationShifts.push({
          residueIndex: i,
          originalResName: `${rO.name} (${rO.code1})`,
          modifiedResName: `${rM.name} (${rM.code1})`,
          caDeltaAngstrom: deltaAngstrom,
          significance
        });
      }
    }
  }

  const rmsd = Math.round(Math.sqrt(sumSqDiff / validCount) * 100) / 100;

  return {
    rmsd,
    alignedResiduesCount: validCount,
    mutationShifts
  };
}
