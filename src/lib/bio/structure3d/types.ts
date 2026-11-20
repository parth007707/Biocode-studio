import { SequenceType } from '../types';

export type StructureStatusState = 
  | 'EXPERIMENTAL' 
  | 'PREDICTED' 
  | 'PARTIAL' 
  | 'SEQUENCE_DERIVED' 
  | 'UNAVAILABLE';

export interface ResidueMappingItem {
  seqPos: number; // 1-based sequence position
  seqAa: string; // 1-letter amino acid code
  status: 'modeled' | 'unavailable';
  structureResSeq?: number;
  structureResName?: string;
  chainId?: string;
  residue?: Residue3D;
}

export type StructureResolutionSource = 
  | 'RCSB_PDB' 
  | 'ALPHAFOLD_DB' 
  | 'AB_INITIO_PREDICTION' 
  | 'HOMOLOGY_MODEL'
  | 'USER_UPLOAD';

export type RepresentationMode = 
  | 'ribbon' 
  | 'ball_and_stick' 
  | 'space_fill' 
  | 'backbone_trace' 
  | 'surface'
  | 'wireframe';

export type ColorScheme = 
  | 'secondary_structure' 
  | 'chain'
  | 'residue'
  | 'element'
  | 'hydrophobicity' 
  | 'plddt_bfactor' 
  | 'electrostatics' 
  | 'rainbow_spectrum' 
  | 'mutation_delta';

export interface AtomicCoordinate {
  id: number;
  name: string;
  element: string;
  residueName: string;
  chainId: string;
  resSeq: number;
  x: number;
  y: number;
  z: number;
  occupancy: number;
  tempFactor: number; // B-factor or pLDDT (0-100)
  charge?: number;
  isHetatm?: boolean;
}

export interface Residue3D {
  index: number; // 0-based in sequence
  resSeq: number; // PDB residue number
  name: string; // 3-letter code (e.g. ALA, GLY, DA, DG, A, U)
  code1: string; // 1-letter code (e.g. A, G, C, T, U)
  chainId: string;
  atoms: AtomicCoordinate[];
  ca?: AtomicCoordinate; // C-alpha (or C4' / P for nucleic acids)
  c?: AtomicCoordinate;  // Backbone C (or C3' for nucleic acids)
  n?: AtomicCoordinate;  // Backbone N (or N1/N9 for nucleic acids)
  o?: AtomicCoordinate;  // Backbone O (or O3' for nucleic acids)
  secondaryStructure?: 'helix' | 'sheet' | 'coil' | 'turn';
  phi?: number; // Dihedral angle in degrees (-180 to 180)
  psi?: number; // Dihedral angle in degrees (-180 to 180)
  omega?: number;
  hydrophobicity: number; // -4.5 to +4.5
  bFactorAvg: number;
  pLddt?: number; // AlphaFold confidence (0 to 100)
  isMutated?: boolean;
  mutationType?: 'SUBSTITUTION' | 'INSERTION' | 'DELETION';
  mutationLabel?: string;
}

export interface Chain3D {
  id: string;
  type: 'PROTEIN' | 'DNA' | 'RNA' | 'LIGAND' | 'WATER';
  residues: Residue3D[];
  sequence: string;
}

export interface Ligand3D {
  name: string;
  resSeq: number;
  chainId: string;
  formula: string;
  atoms: AtomicCoordinate[];
  center: [number, number, number];
  role?: string;
}

export interface DisulfideBond3D {
  res1: number;
  res2: number;
  chain1: string;
  chain2: string;
  distAngstrom: number;
}

export interface RamachandranPoint {
  resSeq: number;
  residue: string;
  chainId: string;
  phi: number;
  psi: number;
  region: 'favored' | 'allowed' | 'outlier';
}

export interface RamachandranStats {
  favoredCount: number;
  allowedCount: number;
  outlierCount: number;
  favoredPercent: number;
  allowedPercent: number;
  outlierPercent: number;
  points: RamachandranPoint[];
}

export interface MeasurementItem {
  id: string;
  type: 'distance' | 'angle' | 'dihedral';
  atoms: {
    atom: AtomicCoordinate;
    residueLabel: string;
  }[];
  value: number; // distance in Å, angle in degrees
  unit: 'Å' | '°';
  label: string;
  color: string;
}

export interface StructureCoverageInfo {
  startResSeq: number;
  endResSeq: number;
  coveredResiduesCount: number;
  totalSequenceLength: number;
  coveragePercent: number;
  isPartial: boolean;
  unresolvedRegions: string[];
  chain: string;
  sequenceIdentity?: number;
  coverageLabel?: string;
  targetToChainResSeq?: Record<number, number>;
}

export interface StructureCandidateSummary {
  id: string;
  source: 'RCSB PDB' | 'AlphaFold DB';
  classification: 'Experimental' | 'Predicted';
  method?: string;
  resolution?: string;
  confidenceScore?: number;
  chainSpan?: string;
  title?: string;
}

export interface ResolvedStructure3D {
  id: string;
  title: string;
  source: StructureResolutionSource;
  macromoleculeType: SequenceType;
  organism?: string;
  resolutionAngstrom?: number;
  experimentalMethod?: string;
  rFree?: number;
  rWork?: number;
  doi?: string;
  pdbId?: string;
  chains: Chain3D[];
  allAtoms: AtomicCoordinate[];
  ligands: Ligand3D[];
  disulfideBonds: DisulfideBond3D[];
  secondaryStructureSummary: {
    helixCount: number;
    sheetCount: number;
    coilCount: number;
    helixPercent: number;
    sheetPercent: number;
    coilPercent: number;
  };
  ramachandranStats?: RamachandranStats;
  pLddtAvg?: number;
  structureType?: StructureStatusState;
  classification?: 'Experimental' | 'Predicted' | 'Unavailable';
  matchedChainId?: string;
  sequenceIdentity?: number;
  missingRegions?: string[];
  parsedAtomCount?: number;
  invalidAtomCount?: number;
  parsedResiduesCount?: number;
  structureFormat?: 'PDB' | 'mmCIF';
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
  residueMapping?: ResidueMappingItem[];
  coverageInfo?: StructureCoverageInfo;
  sequenceId?: string;
  sequenceVersion?: string;
  sequenceHash?: string;
  sequenceLength?: number;
  predictionMethod?: string;
  confidenceInfo?: {
    metric: string;
    value: number | string;
    description: string;
  };
  sourceName?: string;
  sourceId?: string;
  resolutionText?: string;
  isOutdated?: boolean;
  generatedAt?: string;
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    size: [number, number, number];
    radius: number;
  };
  rawPdbText?: string;
}

export interface StructureSuperpositionResult {
  rmsd: number; // Root Mean Square Deviation in Angstroms
  alignedResiduesCount: number;
  transformMatrix?: number[]; // 4x4 matrix
  mutationShifts: {
    residueIndex: number;
    originalResName: string;
    modifiedResName: string;
    caDeltaAngstrom: number;
    significance: 'MINIMAL' | 'MODERATE' | 'SIGNIFICANT' | 'SEVERE';
  }[];
}
