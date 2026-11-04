import { SequenceType } from '../../lib/bio/types';
import { SequenceMutation } from '../../lib/bio/editor/types';

export type ViewerRepresentation = 'ribbon' | 'backbone' | 'ball_stick' | 'space_fill' | 'surface';

export type ViewerColorScheme = 
  | 'secondary_structure' 
  | 'hydrophobicity' 
  | 'charge' 
  | 'rainbow' 
  | 'element' 
  | 'mutation';

export interface StructureSyncState {
  status: 'SYNCED' | 'UPDATING' | 'OUTDATED' | 'UNAVAILABLE' | 'ERROR';
  label: string;
  sequenceHash?: string;
  lastUpdated?: string;
}

export interface ResidueInfo3D {
  resSeq: number;
  resName: string;
  chainID: string;
  secondaryStructure?: 'helix' | 'sheet' | 'coil' | 'turn';
  hydrophobicity?: number;
  charge?: number;
  isMutated?: boolean;
  mutation?: SequenceMutation;
}

export interface MutationComparisonData {
  mutation: SequenceMutation;
  wildTypeResidue: string;
  mutantResidue: string;
  position: number;
  chargeShift: number; // e.g. +1, -1, 0
  hydrophobicityShift: number;
  predictedImpact: 'Benign' | 'Moderate' | 'Severe' | 'Destabilizing';
}

export type AiOrbState = 'idle' | 'analyzing' | 'processing' | 'generating' | 'error';
