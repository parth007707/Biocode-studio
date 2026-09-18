import {
  ResolvedStructure3D,
  AtomicCoordinate,
  Residue3D,
  Chain3D,
  Ligand3D,
  DisulfideBond3D,
  RamachandranStats,
  RamachandranPoint
} from './types';
import { SequenceType } from '../types';

// Standard 3-letter to 1-letter amino acid code map
const AA_3TO1: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C',
  GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P',
  SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
  SEC: 'U', PYL: 'O', MSE: 'M'
};

// Nucleic acid 3-letter / 2-letter / 1-letter map
const NA_MAP: Record<string, string> = {
  DA: 'A', DT: 'T', DG: 'G', DC: 'C',
  A: 'A', T: 'T', G: 'G', C: 'C', U: 'U',
  RA: 'A', RU: 'U', RG: 'G', RC: 'C'
};

// Hydropathy scale (Kyte-Doolittle)
const HYDROPATHY: Record<string, number> = {
  I: 4.5, V: 4.2, L: 3.8, F: 2.8, C: 2.5,
  M: 1.9, A: 1.8, G: -0.4, T: -0.7, S: -0.8,
  W: -0.9, Y: -1.3, P: -1.6, H: -3.2, E: -3.5,
  Q: -3.5, D: -3.5, N: -3.5, K: -3.9, R: -4.5
};

/**
 * Calculate vector difference: a - b
 */
function vecSub(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Vector cross product
 */
function vecCross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

/**
 * Vector dot product
 */
function vecDot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Vector norm
 */
function vecNorm(a: [number, number, number]): number {
  return Math.sqrt(vecDot(a, a));
}

/**
 * Vector normalize
 */
function vecNormalize(a: [number, number, number]): [number, number, number] {
  const len = vecNorm(a);
  if (len === 0) return [0, 0, 0];
  return [a[0] / len, a[1] / len, a[2] / len];
}

/**
 * Compute 4-point dihedral torsion angle in degrees (-180 to 180)
 * Points: p1 -> p2 -> p3 -> p4
 */
export function computeDihedralAngle(
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number],
  p4: [number, number, number]
): number {
  const b1 = vecSub(p2, p1);
  const b2 = vecSub(p3, p2);
  const b3 = vecSub(p4, p3);

  const n1 = vecCross(b1, b2);
  const n2 = vecCross(b2, b3);

  const n1Norm = vecNormalize(n1);
  const n2Norm = vecNormalize(n2);
  const b2Norm = vecNormalize(b2);

  const m1 = vecCross(n1Norm, b2Norm);

  const x = vecDot(n1Norm, n2Norm);
  const y = vecDot(m1, n2Norm);

  const rad = Math.atan2(y, x);
  return (rad * 180) / Math.PI;
}

/**
 * Classify Ramachandran region for general non-glycine residues
 */
function classifyRamachandranRegion(phi: number, psi: number, resName: string): 'favored' | 'allowed' | 'outlier' {
  if (resName === 'G') {
    // Glycine has much broader allowed regions
    if ((phi > -180 && phi < 180 && psi > -180 && psi < 180)) {
      if ((phi >= -160 && phi <= -40 && psi >= -80 && psi <= 80) ||
          (phi >= 40 && phi <= 160 && psi >= -80 && psi <= 80) ||
          (phi >= -160 && phi <= -40 && psi >= 100 && psi <= 180) ||
          (phi >= 40 && phi <= 160 && psi >= -180 && psi <= -100)) {
        return 'favored';
      }
      return 'allowed';
    }
  }

  // Alpha-helix favored region
  const isAlphaFavored = phi >= -100 && phi <= -30 && psi >= -70 && psi <= -10;
  // Beta-sheet favored region
  const isBetaFavored = phi >= -160 && phi <= -80 && psi >= 90 && psi <= 175;
  // Left-handed alpha helix
  const isLeftHelixFavored = phi >= 30 && phi <= 90 && psi >= 10 && psi <= 70;

  if (isAlphaFavored || isBetaFavored || isLeftHelixFavored) {
    return 'favored';
  }

  // Allowed envelope
  const isAlphaAllowed = phi >= -140 && phi <= -20 && psi >= -90 && psi <= 20;
  const isBetaAllowed = phi >= -180 && phi <= -60 && psi >= 60 && psi <= 180;
  const isLeftHelixAllowed = phi >= 20 && phi <= 110 && psi >= -10 && psi <= 90;

  if (isAlphaAllowed || isBetaAllowed || isLeftHelixAllowed) {
    return 'allowed';
  }

  return 'outlier';
}

/**
 * Parse standard PDB text format
 */
export function parsePDBText(pdbText: string, customId?: string): ResolvedStructure3D {
  const lines = pdbText.split('\n');
  
  let title = 'Biological Macromolecular Complex';
  let organism = '';
  let resolutionAngstrom: number | undefined = undefined;
  let experimentalMethod = 'X-RAY DIFFRACTION';
  let rFree: number | undefined = undefined;
  let rWork: number | undefined = undefined;
  let pdbId = customId || '';

  const atomMap: Map<number, AtomicCoordinate> = new Map();
  const residuesByChainAndSeq: Map<string, Map<number, Residue3D>> = new Map();
  const rawHelices: { chainId: string; startSeq: number; endSeq: number }[] = [];
  const rawSheets: { chainId: string; startSeq: number; endSeq: number }[] = [];
  const rawDisulfides: DisulfideBond3D[] = [];
  const ligands: Ligand3D[] = [];
  const allAtoms: AtomicCoordinate[] = [];

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const line of lines) {
    const recordType = line.substring(0, 6).trim();

    if (recordType === 'HEADER') {
      const headerPdbId = line.substring(62, 66).trim();
      if (headerPdbId && !pdbId) pdbId = headerPdbId;
    } else if (recordType === 'TITLE') {
      const lineTitle = line.substring(10, 80).trim();
      if (title === 'Biological Macromolecular Complex') {
        title = lineTitle;
      } else {
        title += ' ' + lineTitle;
      }
    } else if (recordType === 'EXPDTA') {
      experimentalMethod = line.substring(10, 70).trim();
    } else if (recordType === 'SOURCE') {
      if (line.includes('ORGANISM_SCIENTIFIC:')) {
        const parts = line.split('ORGANISM_SCIENTIFIC:');
        if (parts[1]) organism = parts[1].replace(/;.*$/, '').trim();
      }
    } else if (recordType === 'REMARK') {
      const remarkNum = parseInt(line.substring(7, 10).trim(), 10);
      if (remarkNum === 2) {
        // RESOLUTION. 1.80 ANGSTROMS.
        const resMatch = line.match(/([0-9]+\.[0-9]+)\s+ANGSTROMS/i);
        if (resMatch && resMatch[1]) {
          resolutionAngstrom = parseFloat(resMatch[1]);
        }
      } else if (remarkNum === 3) {
        const rFreeMatch = line.match(/FREE R VALUE\s*:\s*([0-9]+\.[0-9]+)/i);
        if (rFreeMatch && rFreeMatch[1]) rFree = parseFloat(rFreeMatch[1]);
        const rWorkMatch = line.match(/R VALUE\s*\(WORKING SET\)\s*:\s*([0-9]+\.[0-9]+)/i);
        if (rWorkMatch && rWorkMatch[1]) rWork = parseFloat(rWorkMatch[1]);
      }
    } else if (recordType === 'HELIX') {
      const chainId = line.substring(19, 20).trim() || 'A';
      const startSeq = parseInt(line.substring(21, 25).trim(), 10);
      const endSeq = parseInt(line.substring(33, 37).trim(), 10);
      if (!isNaN(startSeq) && !isNaN(endSeq)) {
        rawHelices.push({ chainId, startSeq, endSeq });
      }
    } else if (recordType === 'SHEET') {
      const chainId = line.substring(21, 22).trim() || 'A';
      const startSeq = parseInt(line.substring(22, 26).trim(), 10);
      const endSeq = parseInt(line.substring(33, 37).trim(), 10);
      if (!isNaN(startSeq) && !isNaN(endSeq)) {
        rawSheets.push({ chainId, startSeq, endSeq });
      }
    } else if (recordType === 'SSBOND') {
      const chain1 = line.substring(15, 16).trim() || 'A';
      const res1 = parseInt(line.substring(17, 21).trim(), 10);
      const chain2 = line.substring(29, 30).trim() || 'A';
      const res2 = parseInt(line.substring(31, 35).trim(), 10);
      const distStr = line.substring(73, 78).trim();
      const dist = distStr ? parseFloat(distStr) : 2.05;
      if (!isNaN(res1) && !isNaN(res2)) {
        rawDisulfides.push({ res1, res2, chain1, chain2, distAngstrom: dist });
      }
    } else if (recordType === 'ATOM' || recordType === 'HETATM') {
      const atomId = parseInt(line.substring(6, 11).trim(), 10);
      const atomName = line.substring(12, 16).trim();
      const resName = line.substring(17, 20).trim();
      const chainId = line.substring(21, 22).trim() || 'A';
      const resSeq = parseInt(line.substring(22, 26).trim(), 10);
      const x = parseFloat(line.substring(30, 38).trim());
      const y = parseFloat(line.substring(38, 46).trim());
      const z = parseFloat(line.substring(46, 54).trim());
      const occupancy = parseFloat(line.substring(54, 60).trim()) || 1.0;
      const tempFactor = parseFloat(line.substring(60, 66).trim()) || 20.0;
      let element = line.substring(76, 78).trim();
      if (!element) {
        element = atomName.replace(/[0-9\s]/g, '')[0] || 'C';
      }

      if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

      const isHet = recordType === 'HETATM';

      // Skip standard water molecules from macromolecule residue map to keep structures crisp
      if (resName === 'HOH' || resName === 'WAT') {
        continue;
      }

      const atom: AtomicCoordinate = {
        id: atomId,
        name: atomName,
        element: element.toUpperCase(),
        residueName: resName,
        chainId,
        resSeq,
        x,
        y,
        z,
        occupancy,
        tempFactor,
        isHetatm: isHet
      };

      allAtoms.push(atom);
      atomMap.set(atomId, atom);

      // Update Bounding Box
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;

      if (!isHet || AA_3TO1[resName] || NA_MAP[resName]) {
        // Group into chain and residue
        if (!residuesByChainAndSeq.has(chainId)) {
          residuesByChainAndSeq.set(chainId, new Map());
        }
        const chainResMap = residuesByChainAndSeq.get(chainId)!;
        if (!chainResMap.has(resSeq)) {
          const code1 = AA_3TO1[resName] || NA_MAP[resName] || 'X';
          chainResMap.set(resSeq, {
            index: chainResMap.size,
            resSeq,
            name: resName,
            code1,
            chainId,
            atoms: [],
            hydrophobicity: HYDROPATHY[code1] || 0,
            bFactorAvg: tempFactor,
            pLddt: tempFactor <= 100 ? tempFactor : undefined
          });
        }

        const res = chainResMap.get(resSeq)!;
        res.atoms.push(atom);
        if (atomName === 'CA' || atomName === "C4'" || atomName === 'P') res.ca = atom;
        if (atomName === 'C' || atomName === "C3'") res.c = atom;
        if (atomName === 'N' || atomName === 'N1' || atomName === 'N9') res.n = atom;
        if (atomName === 'O' || atomName === "O3'") res.o = atom;
      } else {
        // Ligand / cofactor
        let existingLigand = ligands.find((l) => l.name === resName && l.resSeq === resSeq && l.chainId === chainId);
        if (!existingLigand) {
          existingLigand = {
            name: resName,
            resSeq,
            chainId,
            formula: resName,
            atoms: [],
            center: [x, y, z]
          };
          ligands.push(existingLigand);
        }
        existingLigand.atoms.push(atom);
      }
    }
  }

  // Finalize Ligand Centers
  for (const lig of ligands) {
    if (lig.atoms.length > 0) {
      let sx = 0, sy = 0, sz = 0;
      for (const a of lig.atoms) {
        sx += a.x; sy += a.y; sz += a.z;
      }
      lig.center = [sx / lig.atoms.length, sy / lig.atoms.length, sz / lig.atoms.length];
    }
  }

  // Construct Chains
  const chains: Chain3D[] = [];
  let totalHelices = 0;
  let totalSheets = 0;
  let totalCoils = 0;
  let totalResidues = 0;

  const ramachandranPoints: RamachandranPoint[] = [];

  residuesByChainAndSeq.forEach((resMap, chainId) => {
    const sortedResidues = Array.from(resMap.values()).sort((a, b) => a.resSeq - b.resSeq);
    
    // Assign index, secondary structure & dihedral angles
    sortedResidues.forEach((res, i) => {
      res.index = i;
      totalResidues++;

      // Average B-Factor for residue
      if (res.atoms.length > 0) {
        const sumB = res.atoms.reduce((sum, a) => sum + a.tempFactor, 0);
        res.bFactorAvg = Math.round((sumB / res.atoms.length) * 10) / 10;
      }

      // Check explicit HELIX and SHEET records
      const inHelix = rawHelices.some((h) => h.chainId === chainId && res.resSeq >= h.startSeq && res.resSeq <= h.endSeq);
      const inSheet = rawSheets.some((s) => s.chainId === chainId && res.resSeq >= s.startSeq && res.resSeq <= s.endSeq);

      if (inHelix) {
        res.secondaryStructure = 'helix';
        totalHelices++;
      } else if (inSheet) {
        res.secondaryStructure = 'sheet';
        totalSheets++;
      } else {
        res.secondaryStructure = 'coil';
        totalCoils++;
      }

      // Calculate Phi (C_{i-1} -> N_i -> CA_i -> C_i)
      const prevRes = sortedResidues[i - 1];
      const nextRes = sortedResidues[i + 1];

      if (prevRes?.c && res.n && res.ca && res.c) {
        res.phi = Math.round(
          computeDihedralAngle(
            [prevRes.c.x, prevRes.c.y, prevRes.c.z],
            [res.n.x, res.n.y, res.n.z],
            [res.ca.x, res.ca.y, res.ca.z],
            [res.c.x, res.c.y, res.c.z]
          ) * 10
        ) / 10;
      }

      // Calculate Psi (N_i -> CA_i -> C_i -> N_{i+1})
      if (res.n && res.ca && res.c && nextRes?.n) {
        res.psi = Math.round(
          computeDihedralAngle(
            [res.n.x, res.n.y, res.n.z],
            [res.ca.x, res.ca.y, res.ca.z],
            [res.c.x, res.c.y, res.c.z],
            [nextRes.n.x, nextRes.n.y, nextRes.n.z]
          ) * 10
        ) / 10;
      }

      // Ramachandran Point
      if (res.phi !== undefined && res.psi !== undefined) {
        const region = classifyRamachandranRegion(res.phi, res.psi, res.code1);
        ramachandranPoints.push({
          resSeq: res.resSeq,
          residue: `${res.name} ${res.resSeq}`,
          chainId,
          phi: res.phi,
          psi: res.psi,
          region
        });
      }
    });

    const isNA = sortedResidues.some((r) => NA_MAP[r.name] !== undefined);
    const chainType = isNA ? (sortedResidues.some((r) => r.code1 === 'U') ? 'RNA' : 'DNA') : 'PROTEIN';
    const sequence = sortedResidues.map((r) => r.code1).join('');

    chains.push({
      id: chainId,
      type: chainType,
      residues: sortedResidues,
      sequence
    });
  });

  // Calculate Ramachandran Statistics
  let ramaStats: RamachandranStats | undefined = undefined;
  if (ramachandranPoints.length > 0) {
    const favored = ramachandranPoints.filter((p) => p.region === 'favored').length;
    const allowed = ramachandranPoints.filter((p) => p.region === 'allowed').length;
    const outliers = ramachandranPoints.filter((p) => p.region === 'outlier').length;
    const total = ramachandranPoints.length;

    ramaStats = {
      favoredCount: favored,
      allowedCount: allowed,
      outlierCount: outliers,
      favoredPercent: Math.round((favored / total) * 1000) / 10,
      allowedPercent: Math.round((allowed / total) * 1000) / 10,
      outlierPercent: Math.round((outliers / total) * 1000) / 10,
      points: ramachandranPoints
    };
  }

  // Handle fallback bounding box if no atoms were parsed
  if (minX === Infinity) {
    minX = -10; maxX = 10;
    minY = -10; maxY = 10;
    minZ = -10; maxZ = 10;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const sx = maxX - minX;
  const sy = maxY - minY;
  const sz = maxZ - minZ;
  const radius = Math.sqrt(sx * sx + sy * sy + sz * sz) / 2;

  // Macromolecule type determination
  let dominantType: SequenceType = 'PROTEIN';
  if (chains.some((c) => c.type === 'DNA')) dominantType = 'DNA';
  else if (chains.some((c) => c.type === 'RNA')) dominantType = 'RNA';

  const helixPercent = totalResidues > 0 ? Math.round((totalHelices / totalResidues) * 1000) / 10 : 0;
  const sheetPercent = totalResidues > 0 ? Math.round((totalSheets / totalResidues) * 1000) / 10 : 0;
  const coilPercent = Math.max(0, Math.round((100 - helixPercent - sheetPercent) * 10) / 10);

  return {
    id: pdbId || 'MODEL-1',
    title: title.trim() || 'Macromolecular Structure',
    source: 'RCSB_PDB',
    macromoleculeType: dominantType,
    organism: organism || undefined,
    resolutionAngstrom,
    experimentalMethod,
    rFree,
    rWork,
    pdbId: pdbId || undefined,
    chains,
    allAtoms,
    ligands,
    disulfideBonds: rawDisulfides,
    secondaryStructureSummary: {
      helixCount: totalHelices,
      sheetCount: totalSheets,
      coilCount: totalCoils,
      helixPercent,
      sheetPercent,
      coilPercent
    },
    ramachandranStats: ramaStats,
    boundingBox: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
      center: [cx, cy, cz],
      size: [sx, sy, sz],
      radius
    },
    rawPdbText: pdbText
  };
}
