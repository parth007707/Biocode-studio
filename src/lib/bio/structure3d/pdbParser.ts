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

// Nucleic acid 3-letter / 2-letter / 1-letter & modified nucleotide map
const NA_MAP: Record<string, string> = {
  DA: 'A', DT: 'T', DG: 'G', DC: 'C', DI: 'G',
  A: 'A', T: 'T', G: 'G', C: 'C', U: 'U', I: 'G',
  RA: 'A', RU: 'U', RG: 'G', RC: 'C', RI: 'G',
  ADE: 'A', THY: 'T', GUA: 'G', CYT: 'C', URA: 'U',
  // Common modified RNA/DNA residues in experimental X-ray / NMR / Cryo-EM PDBs (e.g. tRNA, rRNA)
  PSU: 'U', H2U: 'U', '5MU': 'U', BRU: 'U', '5IU': 'U', IU: 'U',
  M2G: 'G', OMG: 'G', '7MG': 'G', YG: 'G', '2MG': 'G', GMP: 'G',
  OMC: 'C', '5MC': 'C', CMP: 'C',
  '1MA': 'A', MIA: 'A', AMP: 'A',
  UMP: 'U', TMP: 'T'
};

const DNA_EXPLICIT_RESIDUES = new Set(['DA', 'DT', 'DG', 'DC', 'DI', 'T', 'THY', 'TMP', 'BRU', '5IU', 'IU']);

function classifyNucleicChainType(residues: Residue3D[]): 'DNA' | 'RNA' {
  const hasU = residues.some((r) => r.code1 === 'U' || r.name === 'U' || r.name === 'RU' || r.name === 'PSU' || r.name === 'H2U');
  const hasDnaMarker = residues.some((r) => DNA_EXPLICIT_RESIDUES.has(r.name) || (r.name.startsWith('D') && NA_MAP[r.name] !== undefined));
  if (hasDnaMarker && !hasU) return 'DNA';
  if (hasU) return 'RNA';
  // Modern wwPDB uses A/C/G/U for RNA and DA/DC/DG/DT for DNA
  return 'RNA';
}

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

  let invalidAtomCount = 0;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const line of lines) {
    const recordType = line.substring(0, 6).trim();

    if (recordType === 'ENDMDL') {
      // For multi-model NMR ensembles, stop after Model 1 once atoms are loaded
      if (allAtoms.length > 0) break;
      continue;
    }

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

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        invalidAtomCount++;
        continue;
      }

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
        if (atomName === 'CA' || atomName === "C4'") res.ca = atom;
        else if (atomName === 'P' && !res.ca) res.ca = atom;
        if (atomName === 'C' || atomName === "C3'") res.c = atom;
        if (atomName === 'N' || atomName === 'N9' || (atomName === 'N1' && !res.n)) res.n = atom;
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

      // Ramachandran Point & dihedral secondary structure inference when HELIX/SHEET records absent
      if (res.phi !== undefined && res.psi !== undefined) {
        if (rawHelices.length === 0 && rawSheets.length === 0) {
          if (res.phi >= -95 && res.phi <= -35 && res.psi >= -70 && res.psi <= -15) {
            res.secondaryStructure = 'helix';
            totalHelices++;
            totalCoils = Math.max(0, totalCoils - 1);
          } else if (res.phi >= -165 && res.phi <= -75 && res.psi >= 90 && res.psi <= 175) {
            res.secondaryStructure = 'sheet';
            totalSheets++;
            totalCoils = Math.max(0, totalCoils - 1);
          }
        }
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
    const chainType = isNA ? classifyNucleicChainType(sortedResidues) : 'PROTEIN';
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

  // Macromolecule type determination based on majority residue count
  let proteinResCount = 0;
  let dnaResCount = 0;
  let rnaResCount = 0;
  for (const c of chains) {
    if (c.type === 'PROTEIN') proteinResCount += c.residues.length;
    else if (c.type === 'DNA') dnaResCount += c.residues.length;
    else if (c.type === 'RNA') rnaResCount += c.residues.length;
  }
  let dominantType: SequenceType = 'PROTEIN';
  if (proteinResCount >= dnaResCount && proteinResCount >= rnaResCount && proteinResCount > 0) {
    dominantType = 'PROTEIN';
  } else if (dnaResCount >= rnaResCount && dnaResCount > 0) {
    dominantType = 'DNA';
  } else if (rnaResCount > 0) {
    dominantType = 'RNA';
  }

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
    parsedAtomCount: allAtoms.length,
    invalidAtomCount,
    parsedResiduesCount: totalResidues,
    structureFormat: 'PDB',
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

/**
 * Tokenize an mmCIF line handling single-quoted, double-quoted, and unquoted whitespace tokens
 */
function tokenizeMMCIFLine(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const len = line.length;
  while (i < len) {
    while (i < len && (line[i] === ' ' || line[i] === '\t')) i++;
    if (i >= len) break;
    if (line[i] === "'" || line[i] === '"') {
      const q = line[i++];
      const start = i;
      while (i < len && !(line[i] === q && (i + 1 >= len || line[i + 1] === ' ' || line[i + 1] === '\t'))) i++;
      tokens.push(line.slice(start, i));
      if (i < len && line[i] === q) i++;
    } else {
      const start = i;
      while (i < len && line[i] !== ' ' && line[i] !== '\t') i++;
      tokens.push(line.slice(start, i));
    }
  }
  return tokens;
}

/**
 * Parse standard mmCIF (.cif) macromolecular coordinate files from RCSB PDB / AlphaFold DB
 */
export function parseMMCIFText(cifText: string, customId?: string): ResolvedStructure3D {
  const lines = cifText.split(/\r?\n/);
  let pdbId = customId || '';
  let title = 'Biological Macromolecular Complex';
  let experimentalMethod = 'X-RAY DIFFRACTION';
  let resolutionAngstrom: number | undefined;

  const residuesByChainAndSeq: Map<string, Map<number, Residue3D>> = new Map();
  const rawHelices: { chainId: string; startSeq: number; endSeq: number }[] = [];
  const rawSheets: { chainId: string; startSeq: number; endSeq: number }[] = [];
  const allAtoms: AtomicCoordinate[] = [];
  const ligands: Ligand3D[] = [];
  let invalidAtomCount = 0;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  let inLoop = false;
  let loopColumns: string[] = [];
  let loopCategory = '';
  let inMultilineText = false;

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    if (raw.startsWith(';')) {
      inMultilineText = !inMultilineText;
      continue;
    }
    if (inMultilineText) continue;

    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      if (inLoop && line.startsWith('#')) {
        inLoop = false;
        loopColumns = [];
        loopCategory = '';
      }
      continue;
    }

    if (line.startsWith('_entry.id') && !pdbId) {
      const toks = tokenizeMMCIFLine(line);
      if (toks[1]) pdbId = toks[1];
      continue;
    }
    if (line.startsWith('_struct.title')) {
      const toks = tokenizeMMCIFLine(line);
      if (toks[1]) title = toks[1];
      continue;
    }
    if (line.startsWith('_exptl.method')) {
      const toks = tokenizeMMCIFLine(line);
      if (toks[1]) experimentalMethod = toks[1];
      continue;
    }
    if (line.startsWith('_refine.ls_d_res_high') || line.startsWith('_em_3d_reconstruction.resolution')) {
      const toks = tokenizeMMCIFLine(line);
      const val = toks[1] ? parseFloat(toks[1]) : NaN;
      if (Number.isFinite(val)) resolutionAngstrom = val;
      continue;
    }

    if (line === 'loop_') {
      inLoop = true;
      loopColumns = [];
      loopCategory = '';
      continue;
    }

    if (inLoop && line.startsWith('_')) {
      const colName = line.split(/\s+/)[0];
      loopColumns.push(colName);
      if (colName.startsWith('_atom_site.')) loopCategory = 'atom_site';
      else if (colName.startsWith('_struct_conf.')) loopCategory = 'struct_conf';
      else if (colName.startsWith('_struct_sheet_range.')) loopCategory = 'struct_sheet_range';
      continue;
    }

    if (inLoop && (line.startsWith('_') || line.startsWith('data_'))) {
      inLoop = false;
      loopColumns = [];
      loopCategory = '';
      continue;
    }

    if (inLoop && loopCategory === 'struct_conf') {
      const vals = tokenizeMMCIFLine(line);
      if (vals.length >= loopColumns.length) {
        const getCol = (name: string): string => {
          const ci = loopColumns.indexOf(name);
          return ci >= 0 ? vals[ci] : '';
        };
        const confType = getCol('_struct_conf.conf_type_id').toUpperCase();
        if (confType.includes('HELX')) {
          const chainId = getCol('_struct_conf.beg_auth_asym_id') || getCol('_struct_conf.beg_label_asym_id') || 'A';
          const startSeq = parseInt(getCol('_struct_conf.beg_auth_seq_id') || getCol('_struct_conf.beg_label_seq_id'), 10);
          const endSeq = parseInt(getCol('_struct_conf.end_auth_seq_id') || getCol('_struct_conf.end_label_seq_id'), 10);
          if (Number.isFinite(startSeq) && Number.isFinite(endSeq)) {
            rawHelices.push({ chainId, startSeq, endSeq });
          }
        }
      }
      continue;
    }

    if (inLoop && loopCategory === 'struct_sheet_range') {
      const vals = tokenizeMMCIFLine(line);
      if (vals.length >= loopColumns.length) {
        const getCol = (name: string): string => {
          const ci = loopColumns.indexOf(name);
          return ci >= 0 ? vals[ci] : '';
        };
        const chainId = getCol('_struct_sheet_range.beg_auth_asym_id') || getCol('_struct_sheet_range.beg_label_asym_id') || 'A';
        const startSeq = parseInt(getCol('_struct_sheet_range.beg_auth_seq_id') || getCol('_struct_sheet_range.beg_label_seq_id'), 10);
        const endSeq = parseInt(getCol('_struct_sheet_range.end_auth_seq_id') || getCol('_struct_sheet_range.end_label_seq_id'), 10);
        if (Number.isFinite(startSeq) && Number.isFinite(endSeq)) {
          rawSheets.push({ chainId, startSeq, endSeq });
        }
      }
      continue;
    }

    if (inLoop && loopCategory === 'atom_site') {
      const vals = tokenizeMMCIFLine(line);
      if (vals.length < loopColumns.length) continue;

      const getCol = (name: string): string => {
        const ci = loopColumns.indexOf(name);
        return ci >= 0 ? vals[ci] : '';
      };

      const groupPdb = getCol('_atom_site.group_PDB') || 'ATOM';
      const modelNum = getCol('_atom_site.pdbx_PDB_model_num');
      if (modelNum && modelNum !== '1' && modelNum !== '.') continue; // First model only for NMR ensembles

      const resName = getCol('_atom_site.label_comp_id') || getCol('_atom_site.auth_comp_id');
      if (resName === 'HOH' || resName === 'WAT') continue;

      const x = parseFloat(getCol('_atom_site.Cartn_x'));
      const y = parseFloat(getCol('_atom_site.Cartn_y'));
      const z = parseFloat(getCol('_atom_site.Cartn_z'));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        invalidAtomCount++;
        continue;
      }

      const atomId = parseInt(getCol('_atom_site.id'), 10) || (allAtoms.length + 1);
      const atomName = getCol('_atom_site.label_atom_id') || getCol('_atom_site.auth_atom_id') || 'CA';
      const chainId = getCol('_atom_site.auth_asym_id') || getCol('_atom_site.label_asym_id') || 'A';
      const resSeqRaw = getCol('_atom_site.auth_seq_id') || getCol('_atom_site.label_seq_id');
      const resSeq = parseInt(resSeqRaw, 10);
      if (!Number.isFinite(resSeq)) continue;

      const occupancy = parseFloat(getCol('_atom_site.occupancy')) || 1.0;
      const tempFactor = parseFloat(getCol('_atom_site.B_iso_or_equiv')) || 20.0;
      const element = (getCol('_atom_site.type_symbol') || atomName.replace(/[0-9\s]/g, '')[0] || 'C').toUpperCase();
      const isHet = groupPdb === 'HETATM';

      const atom: AtomicCoordinate = {
        id: atomId,
        name: atomName,
        element,
        residueName: resName,
        chainId,
        resSeq,
        x, y, z,
        occupancy,
        tempFactor,
        isHetatm: isHet
      };
      allAtoms.push(atom);

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;

      if (!isHet || AA_3TO1[resName] || NA_MAP[resName]) {
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
        if (atomName === 'CA' || atomName === "C4'") res.ca = atom;
        else if (atomName === 'P' && !res.ca) res.ca = atom;
        if (atomName === 'C' || atomName === "C3'") res.c = atom;
        if (atomName === 'N' || atomName === 'N9' || (atomName === 'N1' && !res.n)) res.n = atom;
        if (atomName === 'O' || atomName === "O3'") res.o = atom;
      } else {
        let existingLig = ligands.find((l) => l.name === resName && l.resSeq === resSeq && l.chainId === chainId);
        if (!existingLig) {
          existingLig = { name: resName, resSeq, chainId, formula: resName, atoms: [], center: [x, y, z] };
          ligands.push(existingLig);
        }
        existingLig.atoms.push(atom);
      }
    }
  }

  for (const lig of ligands) {
    if (lig.atoms.length > 0) {
      let sx = 0, sy = 0, sz = 0;
      for (const a of lig.atoms) { sx += a.x; sy += a.y; sz += a.z; }
      lig.center = [sx / lig.atoms.length, sy / lig.atoms.length, sz / lig.atoms.length];
    }
  }

  const chains: Chain3D[] = [];
  let totalHelices = 0, totalSheets = 0, totalCoils = 0, totalResidues = 0;
  const ramachandranPoints: RamachandranPoint[] = [];

  residuesByChainAndSeq.forEach((resMap, chainId) => {
    const sortedResidues = Array.from(resMap.values()).sort((a, b) => a.resSeq - b.resSeq);
    sortedResidues.forEach((res, i) => {
      res.index = i;
      totalResidues++;
      if (res.atoms.length > 0) {
        res.bFactorAvg = Math.round((res.atoms.reduce((s, a) => s + a.tempFactor, 0) / res.atoms.length) * 10) / 10;
      }
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

      const prevRes = sortedResidues[i - 1];
      const nextRes = sortedResidues[i + 1];
      if (prevRes?.c && res.n && res.ca && res.c) {
        res.phi = Math.round(computeDihedralAngle([prevRes.c.x, prevRes.c.y, prevRes.c.z], [res.n.x, res.n.y, res.n.z], [res.ca.x, res.ca.y, res.ca.z], [res.c.x, res.c.y, res.c.z]) * 10) / 10;
      }
      if (res.n && res.ca && res.c && nextRes?.n) {
        res.psi = Math.round(computeDihedralAngle([res.n.x, res.n.y, res.n.z], [res.ca.x, res.ca.y, res.ca.z], [res.c.x, res.c.y, res.c.z], [nextRes.n.x, nextRes.n.y, nextRes.n.z]) * 10) / 10;
      }
      if (res.phi !== undefined && res.psi !== undefined) {
        if (rawHelices.length === 0 && rawSheets.length === 0) {
          if (res.phi >= -95 && res.phi <= -35 && res.psi >= -70 && res.psi <= -15) {
            res.secondaryStructure = 'helix';
            totalHelices++;
            totalCoils = Math.max(0, totalCoils - 1);
          } else if (res.phi >= -165 && res.phi <= -75 && res.psi >= 90 && res.psi <= 175) {
            res.secondaryStructure = 'sheet';
            totalSheets++;
            totalCoils = Math.max(0, totalCoils - 1);
          }
        }
        ramachandranPoints.push({
          resSeq: res.resSeq,
          residue: `${res.name} ${res.resSeq}`,
          chainId,
          phi: res.phi,
          psi: res.psi,
          region: classifyRamachandranRegion(res.phi, res.psi, res.code1)
        });
      }
    });

    const isNA = sortedResidues.some((r) => NA_MAP[r.name] !== undefined);
    const chainType = isNA ? classifyNucleicChainType(sortedResidues) : 'PROTEIN';
    chains.push({
      id: chainId,
      type: chainType,
      residues: sortedResidues,
      sequence: sortedResidues.map((r) => r.code1).join('')
    });
  });

  let ramaStats: RamachandranStats | undefined;
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

  if (minX === Infinity) {
    minX = -10; maxX = 10; minY = -10; maxY = 10; minZ = -10; maxZ = 10;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ;

  let proteinResCount = 0, dnaResCount = 0, rnaResCount = 0;
  for (const c of chains) {
    if (c.type === 'PROTEIN') proteinResCount += c.residues.length;
    else if (c.type === 'DNA') dnaResCount += c.residues.length;
    else if (c.type === 'RNA') rnaResCount += c.residues.length;
  }
  let dominantType: SequenceType = 'PROTEIN';
  if (proteinResCount >= dnaResCount && proteinResCount >= rnaResCount && proteinResCount > 0) dominantType = 'PROTEIN';
  else if (dnaResCount >= rnaResCount && dnaResCount > 0) dominantType = 'DNA';
  else if (rnaResCount > 0) dominantType = 'RNA';

  const helixPercent = totalResidues > 0 ? Math.round((totalHelices / totalResidues) * 1000) / 10 : 0;
  const sheetPercent = totalResidues > 0 ? Math.round((totalSheets / totalResidues) * 1000) / 10 : 0;
  const coilPercent = Math.max(0, Math.round((100 - helixPercent - sheetPercent) * 10) / 10);

  return {
    id: pdbId || 'MODEL-CIF',
    title: title.trim() || 'Macromolecular Structure',
    source: 'RCSB_PDB',
    macromoleculeType: dominantType,
    resolutionAngstrom,
    experimentalMethod,
    pdbId: pdbId || undefined,
    chains,
    allAtoms,
    ligands,
    disulfideBonds: [],
    secondaryStructureSummary: {
      helixCount: totalHelices,
      sheetCount: totalSheets,
      coilCount: totalCoils,
      helixPercent,
      sheetPercent,
      coilPercent
    },
    ramachandranStats: ramaStats,
    parsedAtomCount: allAtoms.length,
    invalidAtomCount,
    parsedResiduesCount: totalResidues,
    structureFormat: 'mmCIF',
    boundingBox: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
      center: [cx, cy, cz],
      size: [sx, sy, sz],
      radius: Math.sqrt(sx * sx + sy * sy + sz * sz) / 2
    },
    rawPdbText: cifText
  };
}

/**
 * Unified coordinate file parser supporting both PDB and mmCIF formats
 */
export function parseStructureText(
  text: string,
  customId?: string,
  format?: 'PDB' | 'mmCIF'
): ResolvedStructure3D {
  const trimmed = (text || '').trimStart();
  const isCif = format === 'mmCIF' || trimmed.startsWith('data_') || trimmed.includes('_atom_site.Cartn_x');
  return isCif ? parseMMCIFText(text, customId) : parsePDBText(text, customId);
}
