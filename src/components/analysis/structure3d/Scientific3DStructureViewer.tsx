import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import {
  ResolvedStructure3D,
  RepresentationMode,
  ColorScheme,
  AtomicCoordinate,
  Residue3D,
  MeasurementItem
} from '../../../lib/bio/structure3d/types';
import { calculateDistanceAngstrom } from '../../../lib/bio/structure3d/distanceEngine';
import {
  RotateCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  RefreshCw,
  Camera,
  Layers,
  Sparkles,
  Sliders,
  Ruler,
  Crosshair,
  Download,
  Info,
  Activity,
  Check,
  AlertCircle
} from 'lucide-react';

interface Scientific3DStructureViewerProps {
  structure: ResolvedStructure3D;
  initialRepresentation?: RepresentationMode;
  initialColorScheme?: ColorScheme;
  representation?: RepresentationMode;
  colorScheme?: ColorScheme;
  onSelectResidue?: (resSeq: number) => void;
  selectedResSeq?: number | null;
  className?: string;
  enableControls?: boolean;
  resetTrigger?: number;
  centerTrigger?: number;
  zoomInTrigger?: number;
  zoomOutTrigger?: number;
  backgroundColor?: number;
}

// Hydrophobicity colors (Kyte-Doolittle)
const HYDROPHOBIC_COLORS: Record<string, number> = {
  A: 0xf97316, V: 0xf97316, I: 0xea580c, L: 0xea580c, M: 0xf59e0b, F: 0xd97706, W: 0xb45309, P: 0xfb923c,
  S: 0x06b6d4, T: 0x0891b2, C: 0x14b8a6, Y: 0x0d9488, N: 0x22d3ee, Q: 0x67e8f9,
  K: 0x3b82f6, R: 0x2563eb, H: 0x6366f1,
  D: 0xef4444, E: 0xdc2626
};

// Chemical element colors (CPK standard)
const CPK_COLORS: Record<string, number> = {
  C: 0x94a3b8, // Slate
  N: 0x3b82f6, // Blue
  O: 0xef4444, // Red
  S: 0xfacc15, // Yellow
  P: 0xf97316, // Orange
  H: 0xf8fafc  // White
};

// Secondary structure colors
const SECONDARY_COLORS: Record<string, number> = {
  helix: 0xd946ef, // Magenta
  sheet: 0xfacc15, // Amber / Gold
  coil: 0x06b6d4,  // Cyan
  turn: 0x10b981   // Emerald
};

// pLDDT AlphaFold Confidence Colors
const getPLddtColor = (plddt: number): number => {
  if (plddt >= 90) return 0x1d4ed8; // Very high (>90) - Dark Blue
  if (plddt >= 70) return 0x38bdf8; // Confident (70-90) - Light Blue
  if (plddt >= 50) return 0xfacc15; // Low (50-70) - Yellow
  return 0xf97316; // Very low (<50) - Orange
};

export const Scientific3DStructureViewer: React.FC<Scientific3DStructureViewerProps> = ({
  structure,
  initialRepresentation = 'ribbon',
  initialColorScheme = 'secondary_structure',
  representation: controlledRepresentation,
  colorScheme: controlledColorScheme,
  onSelectResidue,
  selectedResSeq,
  className = '',
  enableControls = true,
  resetTrigger,
  centerTrigger,
  zoomInTrigger,
  zoomOutTrigger,
  backgroundColor = 0xf8fafc
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [representation, setRepresentation] = useState<RepresentationMode>(controlledRepresentation || initialRepresentation);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(controlledColorScheme || initialColorScheme);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [slabClipping, setSlabClipping] = useState<number>(100); // 0 to 100%
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [pickedAtoms, setPickedAtoms] = useState<AtomicCoordinate[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementItem[]>([]);
  const [hoveredResidue, setHoveredResidue] = useState<Residue3D | null>(null);
  const [selectedResidueData, setSelectedResidueData] = useState<Residue3D | null>(null);
  const [copiedPdb, setCopiedPdb] = useState<boolean>(false);
  const [coordinateError, setCoordinateError] = useState<string | null>(null);

  // Sync controlled representation and colorScheme
  useEffect(() => {
    if (controlledRepresentation && controlledRepresentation !== representation) {
      setRepresentation(controlledRepresentation);
    }
  }, [controlledRepresentation]);

  useEffect(() => {
    if (controlledColorScheme && controlledColorScheme !== colorScheme) {
      setColorScheme(controlledColorScheme);
    }
  }, [controlledColorScheme]);

  // Three.js Scene References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const macromoleculeGroupRef = useRef<THREE.Group | null>(null);
  const measurementGroupRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const hasFittedRef = useRef<boolean>(false);

  // Raycasting & Interaction Refs
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const isDraggingRef = useRef<boolean>(false);
  const prevMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Get color for an atom / residue based on active scheme
  const getResidueColor = (res: Residue3D, totalResidues: number, atom?: AtomicCoordinate): number => {
    if (colorScheme === 'mutation_delta') {
      if (res.isMutated) return 0xef4444; // Vibrant Red mutation highlight
      return 0x334155; // Dark slate non-mutated
    }

    if (colorScheme === 'secondary_structure') {
      const ss = res.secondaryStructure || 'coil';
      return SECONDARY_COLORS[ss] || 0x06b6d4;
    }

    if (colorScheme === 'hydrophobicity') {
      return HYDROPHOBIC_COLORS[res.code1] || 0x64748b;
    }

    if (colorScheme === 'plddt_bfactor') {
      const score = res.pLddt ?? (res.bFactorAvg <= 100 ? res.bFactorAvg : 75);
      return getPLddtColor(score);
    }

    if (colorScheme === 'electrostatics') {
      if (res.code1 === 'K' || res.code1 === 'R' || res.code1 === 'H') return 0x3b82f6; // Basic (+)
      if (res.code1 === 'D' || res.code1 === 'E') return 0xef4444; // Acidic (-)
      return 0x94a3b8; // Neutral
    }

    if (colorScheme === 'rainbow_spectrum') {
      const hue = (res.index / Math.max(1, totalResidues)) * 0.75; // Blue to Red
      const color = new THREE.Color();
      color.setHSL(hue, 0.85, 0.55);
      return color.getHex();
    }

    if (colorScheme === 'element' && atom) {
      return CPK_COLORS[atom.element] || 0x94a3b8;
    }

    return 0x10b981;
  };

  // Re-build 3D objects in Three.js whenever structure, representation, or color scheme changes
  const buildStructureGeometry = () => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (macromoleculeGroupRef.current) {
      scene.remove(macromoleculeGroupRef.current);
    }

    const rootGroup = new THREE.Group();
    macromoleculeGroupRef.current = rootGroup;
    scene.add(rootGroup);

    const chains = structure.chains;
    if (!chains || chains.length === 0) {
      console.warn('[3DViewer] No chains present in structure:', structure.id);
      setCoordinateError('No molecular chains present in structure record.');
      return;
    }

    const allAtoms = structure.allAtoms || [];
    if (allAtoms.length === 0) {
      console.warn('[3DViewer] No atomic coordinates in structure:', structure.id);
      setCoordinateError('No 3D atomic coordinates available in target record.');
      return;
    }

    const validAtoms = allAtoms.filter(a => Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z));
    if (validAtoms.length === 0) {
      console.warn('[3DViewer] All coordinates contain non-finite numbers:', structure.id);
      setCoordinateError('Coordinate array contains invalid non-finite values.');
      return;
    }

    setCoordinateError(null);

    const allResidues = chains.flatMap((c) => c.residues);
    const center = structure.boundingBox?.center || [0, 0, 0];
    const isStructureNucleic = structure.macromoleculeType === 'DNA' || structure.macromoleculeType === 'RNA';

    console.log(`[3DViewer] Building 3D geometry for ${structure.id} (${structure.macromoleculeType || 'Macromolecule'}, mode=${representation}, atoms=${allAtoms.length}, residues=${allResidues.length})...`);

    // 1. CARTOON / RIBBON / BACKBONE / WIREFRAME
    if (representation === 'ribbon' || representation === 'backbone_trace' || representation === 'wireframe') {
      const radius = representation === 'ribbon' ? 0.65 : representation === 'wireframe' ? 0.45 : 0.25;
      const radialSegments = representation === 'ribbon' ? 12 : representation === 'wireframe' ? 8 : 8;

      for (const chain of chains) {
        const residues = chain.residues;
        if (!residues || residues.length === 0) continue;
        const totalRes = residues.length;
        const hasProteinAtoms = residues.some(r => r.ca || r.atoms.some(a => a.name === 'CA'));
        const hasNucleicAtoms = residues.some(r => r.atoms.some(a => a.name === "C4'" || a.name === 'P'));
        const isChainNucleic = hasNucleicAtoms || (!hasProteinAtoms && (chain.type === 'DNA' || chain.type === 'RNA'));
        // Nucleic acids have 6.0-7.8 Å guide atom distances (P-P or C4'-C4'); proteins have ~3.8 Å (CA-CA)
        const maxGapDist = isChainNucleic ? 9.5 : 6.0;

        const segments: { points: THREE.Vector3[]; residues: Residue3D[] }[] = [];
        let curSegment: { points: THREE.Vector3[]; residues: Residue3D[] } = { points: [], residues: [] };

        for (let i = 0; i < residues.length; i++) {
          const res = residues[i];
          const guideAtom = isChainNucleic
            ? (res.atoms.find(a => a.name === "C4'") || res.atoms.find(a => a.name === 'P') || res.ca || res.atoms[0])
            : (res.ca || res.atoms.find(a => a.name === 'CA') || res.atoms.find(a => a.name === "C4'") || res.atoms[0]);

          if (!guideAtom || !Number.isFinite(guideAtom.x) || !Number.isFinite(guideAtom.y) || !Number.isFinite(guideAtom.z)) {
            continue;
          }

          const pt = new THREE.Vector3(
            guideAtom.x - center[0],
            guideAtom.y - center[1],
            guideAtom.z - center[2]
          );

          if (curSegment.points.length > 0) {
            const prevPt = curSegment.points[curSegment.points.length - 1];
            if (prevPt.distanceTo(pt) > maxGapDist) {
              // Real gap/break in coordinates
              if (curSegment.points.length >= 2) {
                segments.push(curSegment);
              } else if (curSegment.points.length === 1) {
                // Single isolated residue bead
                const p = curSegment.points[0];
                const r = curSegment.residues[0];
                const beadGeo = new THREE.SphereGeometry(radius * 1.5, 12, 12);
                const beadMat = new THREE.MeshStandardMaterial({
                  color: getResidueColor(r, totalRes),
                  roughness: 0.35,
                  metalness: 0.15
                });
                const beadMesh = new THREE.Mesh(beadGeo, beadMat);
                beadMesh.position.copy(p);
                (beadMesh as any).userData = { residue: r, chainId: chain.id };
                rootGroup.add(beadMesh);
              }
              curSegment = { points: [], residues: [] };
            }
          }
          curSegment.points.push(pt);
          curSegment.residues.push(res);
        }
        if (curSegment.points.length >= 2) {
          segments.push(curSegment);
        } else if (curSegment.points.length === 1) {
          const p = curSegment.points[0];
          const r = curSegment.residues[0];
          const beadGeo = new THREE.SphereGeometry(radius * 1.5, 12, 12);
          const beadMat = new THREE.MeshStandardMaterial({
            color: getResidueColor(r, totalRes),
            roughness: 0.35,
            metalness: 0.15
          });
          const beadMesh = new THREE.Mesh(beadGeo, beadMat);
          beadMesh.position.copy(p);
          (beadMesh as any).userData = { residue: r, chainId: chain.id };
          rootGroup.add(beadMesh);
        }

        for (const seg of segments) {
          const segPoints = seg.points;
          const segResidues = seg.residues;
          const curve = new THREE.CatmullRomCurve3(segPoints, false, 'centripetal', 0.5);
          const tubularSegments = Math.max(16, segPoints.length * 6);
          const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);

          const count = tubeGeo.attributes.position.count;
          const colors = new Float32Array(count * 3);
          const col = new THREE.Color();

          for (let i = 0; i < count; i++) {
            const t = i / count;
            const resIdx = Math.min(segResidues.length - 1, Math.floor(t * segResidues.length));
            const res = segResidues[resIdx];
            if (chain.type === 'DNA') {
              col.setHex(chain.id === 'B' ? 0x0284c7 : 0x38bdf8);
            } else if (chain.type === 'RNA') {
              col.setHex(0x10b981);
            } else {
              const hex = getResidueColor(res, totalRes);
              col.setHex(hex);
            }
            colors[i * 3] = col.r;
            colors[i * 3 + 1] = col.g;
            colors[i * 3 + 2] = col.b;
          }

          tubeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

          const tubeMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.35,
            metalness: 0.15,
            wireframe: representation === 'wireframe',
            side: THREE.DoubleSide
          });

          const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
          tubeMesh.castShadow = true;
          tubeMesh.receiveShadow = true;
          (tubeMesh as any).userData = { chainId: chain.id };
          rootGroup.add(tubeMesh);
        }

        // For nucleic acids in Cartoon/Ribbon mode: add base rungs (connecting backbone to base ring)
        if (isChainNucleic && representation === 'ribbon') {
          const rungMat = new THREE.MeshStandardMaterial({
            color: chain.type === 'RNA' ? 0x34d399 : 0x0ea5e9,
            roughness: 0.35,
            metalness: 0.1
          });
          const rungGeo = new THREE.CylinderGeometry(0.18, 0.18, 1, 8);
          for (const res of residues) {
            const sugarAtom = res.atoms.find(a => a.name === "C4'") || res.ca;
            const baseAtom = res.atoms.find(a => a.name === 'N1' || a.name === 'N9');
            if (sugarAtom && baseAtom) {
              addBondCylinder(sugarAtom, baseAtom, center, rungGeo, rungMat, rootGroup);
            }
          }
        }

        // Add mutation highlight rings on this chain
        const sphereGeo = new THREE.SphereGeometry(0.85, 16, 16);
        residues.forEach((res) => {
          if (res.isMutated && res.ca) {
            const mutColor = new THREE.Color(0xef4444);
            const mutMat = new THREE.MeshStandardMaterial({
              color: mutColor,
              emissive: 0xdc2626,
              emissiveIntensity: 0.8,
              roughness: 0.2
            });
            const mutMesh = new THREE.Mesh(sphereGeo, mutMat);
            mutMesh.position.set(res.ca.x - center[0], res.ca.y - center[1], res.ca.z - center[2]);
            (mutMesh as any).userData = { residue: res };
            rootGroup.add(mutMesh);
          }
        });
      }

      // Duplex nucleic acids: connect paired bases across Chain A and Chain B
      if (isStructureNucleic && representation === 'ribbon' && chains.length >= 2) {
        const chainA = chains[0];
        const chainB = chains[1];
        const minLen = Math.min(chainA.residues.length, chainB.residues.length);
        const pairBondGeo = new THREE.CylinderGeometry(0.14, 0.14, 1, 8);
        const pairBondMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4 });
        for (let i = 0; i < minLen; i++) {
          const baseA = chainA.residues[i].atoms.find(a => a.name === 'N1' || a.name === 'N9');
          const baseB = chainB.residues[i].atoms.find(a => a.name === 'N1' || a.name === 'N9');
          if (baseA && baseB) {
            const dist = calculateDistanceAngstrom(baseA, baseB);
            if (dist < 6.0) {
              addBondCylinder(baseA, baseB, center, pairBondGeo, pairBondMat, rootGroup);
            }
          }
        }
      }
    }

    // 2. BALL AND STICK (Atomic precision across all chains)
    if (representation === 'ball_and_stick') {
      const atomSphereGeo = new THREE.SphereGeometry(0.45, 14, 14);
      const bondGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 8);
      const bondMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4 });

      for (const chain of chains) {
        const residues = chain.residues;
        const totalRes = residues.length;
        const hasProteinAtoms = residues.some(r => r.ca || r.atoms.some(a => a.name === 'CA'));
        const hasNucleicAtoms = residues.some(r => r.atoms.some(a => a.name === "C4'" || a.name === 'P'));
        const isChainNucleic = hasNucleicAtoms || (!hasProteinAtoms && (chain.type === 'DNA' || chain.type === 'RNA'));

        residues.forEach((res) => {
          const hex = getResidueColor(res, totalRes);
          const atomMat = new THREE.MeshStandardMaterial({
            color: hex,
            roughness: 0.3,
            metalness: 0.2,
            emissive: res.isMutated ? 0xf59e0b : 0x000000,
            emissiveIntensity: res.isMutated ? 0.5 : 0
          });

          res.atoms.forEach((atom) => {
            if (Number.isFinite(atom.x) && Number.isFinite(atom.y) && Number.isFinite(atom.z)) {
              const mesh = new THREE.Mesh(atomSphereGeo, atomMat);
              mesh.position.set(atom.x - center[0], atom.y - center[1], atom.z - center[2]);
              (mesh as any).userData = { atom, residue: res };
              rootGroup.add(mesh);
            }
          });

          if (isChainNucleic) {
            // Nucleic Acid Intra-Residue Bonds: P -> C4', C4' -> base
            const pAtom = res.atoms.find(a => a.name === 'P');
            const c4Atom = res.atoms.find(a => a.name === "C4'");
            const baseAtom = res.atoms.find(a => a.name === 'N1' || a.name === 'N9');
            if (pAtom && c4Atom) addBondCylinder(pAtom, c4Atom, center, bondGeo, bondMat, rootGroup);
            if (c4Atom && baseAtom) addBondCylinder(c4Atom, baseAtom, center, bondGeo, bondMat, rootGroup);
          } else {
            // Protein Backbone Intra-Residue Bonds (N -> CA -> C -> O)
            if (res.n && res.ca) addBondCylinder(res.n, res.ca, center, bondGeo, bondMat, rootGroup);
            if (res.ca && res.c) addBondCylinder(res.ca, res.c, center, bondGeo, bondMat, rootGroup);
            if (res.c && res.o) addBondCylinder(res.c, res.o, center, bondGeo, bondMat, rootGroup);
          }
        });

        if (isChainNucleic) {
          // Nucleic Acid Inter-Residue Phosphodiester Bonds (C4'_i -> P_{i+1})
          for (let i = 0; i < residues.length - 1; i++) {
            const currC4 = residues[i].atoms.find(a => a.name === "C4'");
            const nextP = residues[i + 1].atoms.find(a => a.name === 'P');
            if (currC4 && nextP) {
              const dist = calculateDistanceAngstrom(currC4, nextP);
              if (dist < 8.5) {
                addBondCylinder(currC4, nextP, center, bondGeo, bondMat, rootGroup);
              }
            }
          }
        } else {
          // Peptide Inter-Residue Bonds (C_i -> N_{i+1})
          for (let i = 0; i < residues.length - 1; i++) {
            const curr = residues[i];
            const next = residues[i + 1];
            if (curr.c && next.n) {
              const dist = calculateDistanceAngstrom(curr.c, next.n);
              if (dist < 2.0) {
                addBondCylinder(curr.c, next.n, center, bondGeo, bondMat, rootGroup);
              }
            }
          }
        }
      }

      // Duplex base pairing in Ball & Stick
      if (isStructureNucleic && chains.length >= 2) {
        const chainA = chains[0];
        const chainB = chains[1];
        const minLen = Math.min(chainA.residues.length, chainB.residues.length);
        for (let i = 0; i < minLen; i++) {
          const baseA = chainA.residues[i].atoms.find(a => a.name === 'N1' || a.name === 'N9');
          const baseB = chainB.residues[i].atoms.find(a => a.name === 'N1' || a.name === 'N9');
          if (baseA && baseB) {
            const dist = calculateDistanceAngstrom(baseA, baseB);
            if (dist < 6.0) {
              addBondCylinder(baseA, baseB, center, bondGeo, bondMat, rootGroup);
            }
          }
        }
      }
    }

    // 3. SPACE FILLING (Full Van der Waals CPK spheres across all chains)
    if (representation === 'space_fill' || representation === 'surface') {
      const vdwSphereGeo = new THREE.SphereGeometry(1.25, 14, 14);

      for (const chain of chains) {
        const residues = chain.residues;
        const totalRes = residues.length;

        residues.forEach((res) => {
          const hex = getResidueColor(res, totalRes);
          const sphereMat = new THREE.MeshStandardMaterial({
            color: hex,
            roughness: 0.45,
            metalness: 0.1,
            opacity: representation === 'surface' ? 0.85 : 1.0,
            transparent: representation === 'surface'
          });

          res.atoms.forEach((atom) => {
            const mesh = new THREE.Mesh(vdwSphereGeo, sphereMat);
            mesh.position.set(atom.x - center[0], atom.y - center[1], atom.z - center[2]);
            (mesh as any).userData = { atom, residue: res };
            rootGroup.add(mesh);
          });
        });
      }
    }

    // Add Disulfide Bridges
    if (structure.disulfideBonds.length > 0) {
      const ssBondMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xeab308, emissiveIntensity: 0.5 });
      const ssBondGeo = new THREE.CylinderGeometry(0.2, 0.2, 1, 8);

      structure.disulfideBonds.forEach((ss) => {
        const r1 = allResidues.find((r) => r.resSeq === ss.res1);
        const r2 = allResidues.find((r) => r.resSeq === ss.res2);
        if (r1?.ca && r2?.ca) {
          addBondCylinder(r1.ca, r2.ca, center, ssBondGeo, ssBondMat, rootGroup);
        }
      });
    }

    // Add Ligand / Cofactor Spheres
    if (structure.ligands.length > 0) {
      const ligGeo = new THREE.SphereGeometry(0.9, 16, 16);
      const ligMat = new THREE.MeshStandardMaterial({ color: 0xec4899, emissive: 0xbe185d, emissiveIntensity: 0.6 });

      structure.ligands.forEach((lig) => {
        lig.atoms.forEach((a) => {
          const mesh = new THREE.Mesh(ligGeo, ligMat);
          mesh.position.set(a.x - center[0], a.y - center[1], a.z - center[2]);
          (mesh as any).userData = { atom: a, ligand: lig };
          rootGroup.add(mesh);
        });
      });
    }

    // Add Mutation Highlight Beacons (visible across all representations)
    const mutSphereGeo = new THREE.SphereGeometry(1.1, 16, 16);
    const mutMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.9,
      roughness: 0.2
    });

    allResidues.forEach((res) => {
      if (res.isMutated) {
        const anchor = res.ca || res.atoms[0];
        if (anchor) {
          const mutMesh = new THREE.Mesh(mutSphereGeo, mutMat);
          mutMesh.position.set(anchor.x - center[0], anchor.y - center[1], anchor.z - center[2]);
          (mutMesh as any).userData = { residue: res };
          rootGroup.add(mutMesh);
        }
      }
    });

    // Add Selected Residue Beacon Ring
    if (selectedResSeq) {
      const selRes = allResidues.find((r) => r.resSeq === selectedResSeq);
      const anchor = selRes?.ca || selRes?.atoms[0];
      if (anchor) {
        const ringGeo = new THREE.TorusGeometry(1.5, 0.18, 12, 24);
        const ringMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.95,
          roughness: 0.15
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(anchor.x - center[0], anchor.y - center[1], anchor.z - center[2]);
        rootGroup.add(ringMesh);
      }
    }
  };

  // Helper to place a 3D cylinder between two points
  const addBondCylinder = (
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number },
    center: [number, number, number],
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    group: THREE.Group
  ) => {
    const v1 = new THREE.Vector3(p1.x - center[0], p1.y - center[1], p1.z - center[2]);
    const v2 = new THREE.Vector3(p2.x - center[0], p2.y - center[1], p2.z - center[2]);
    const dist = v1.distanceTo(v2);

    const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
    const orientation = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3().subVectors(v2, v1).normalize();

    orientation.lookAt(v1, v2, up);
    orientation.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(mid);
    mesh.scale.set(1, dist, 1);
    mesh.quaternion.setFromRotationMatrix(orientation);
    group.add(mesh);
  };

  // Dynamic Bounding Box & Sphere Fit-to-View Calculator
  const fitModelToView = useCallback((centerOnly = false) => {
    if (!containerRef.current || !cameraRef.current || !macromoleculeGroupRef.current) return;
    const container = containerRef.current;
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 500;
    if (w <= 0 || h <= 0) return;

    const group = macromoleculeGroupRef.current;
    // Reset group transforms to measure exact object bounds
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    group.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    box.getCenter(center);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const radius = Math.max(sphere.radius, 15);

    // Center model geometry so its true bounding center is at origin (0, 0, 0)
    group.position.set(-center.x, -center.y, -center.z);

    if (measurementGroupRef.current) {
      measurementGroupRef.current.position.set(-center.x, -center.y, -center.z);
    }

    // Default pleasant isometric view angle
    group.rotation.set(0.12, 0.25, 0);
    if (measurementGroupRef.current) {
      measurementGroupRef.current.rotation.set(0.12, 0.25, 0);
    }

    if (centerOnly) {
      cameraRef.current.lookAt(0, 0, 0);
      if (rendererRef.current && sceneRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      return;
    }

    // Camera frustum calculation to fit entire bounding sphere with 35% margin
    const fov = cameraRef.current.fov * (Math.PI / 180);
    const aspect = w / h;
    const fovH = 2 * Math.atan(Math.tan(fov / 2) * aspect);

    const distV = radius / Math.tan(fov / 2);
    const distH = radius / Math.tan(fovH / 2);
    const targetDistance = Math.max(distV, distH) * 1.30; // Guaranteed padding to prevent clipping

    cameraRef.current.position.set(0, 0, Math.max(targetDistance, 25));
    cameraRef.current.near = 0.1;
    cameraRef.current.far = 4000;
    cameraRef.current.aspect = aspect;
    cameraRef.current.lookAt(0, 0, 0);
    cameraRef.current.updateProjectionMatrix();

    if (rendererRef.current && sceneRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, []);

  // Listen to external reset/center triggers
  useEffect(() => {
    if (resetTrigger !== undefined && resetTrigger > 0) {
      fitModelToView(false);
    }
  }, [resetTrigger, fitModelToView]);

  useEffect(() => {
    if (centerTrigger !== undefined && centerTrigger > 0) {
      fitModelToView(true);
    }
  }, [centerTrigger, fitModelToView]);

  useEffect(() => {
    if (zoomInTrigger !== undefined && zoomInTrigger > 0 && cameraRef.current) {
      cameraRef.current.position.z = Math.max(8, cameraRef.current.position.z * 0.82);
      cameraRef.current.updateProjectionMatrix();
    }
  }, [zoomInTrigger]);

  useEffect(() => {
    if (zoomOutTrigger !== undefined && zoomOutTrigger > 0 && cameraRef.current) {
      cameraRef.current.position.z = Math.min(350, cameraRef.current.position.z * 1.22);
      cameraRef.current.updateProjectionMatrix();
    }
  }, [zoomOutTrigger]);

  // Setup Three.js WebGL Renderer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    // Light clean background for BioCode Studio theme
    scene.background = new THREE.Color(backgroundColor);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 60);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // Studio 4-Point Biological Lighting for clear contrast on light canvas
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(30, 45, 40);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x0284c7, 0.7); // Subtle sky-blue biological fill
    fillLight.position.set(-35, -20, -25);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x9333ea, 0.5); // Subtle purple rim
    rimLight.position.set(0, -40, 20);
    scene.add(rimLight);

    // Measurement Line Group
    const measGroup = new THREE.Group();
    measurementGroupRef.current = measGroup;
    scene.add(measGroup);

    // Build the initial macromolecular geometry
    hasFittedRef.current = false;
    buildStructureGeometry();

    // Perform initial bounding-box calculation and fit
    setTimeout(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        fitModelToView(false);
        hasFittedRef.current = true;
      }
    }, 50);

    // Render Animation Loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      if (autoRotate && macromoleculeGroupRef.current && !isDraggingRef.current) {
        macromoleculeGroupRef.current.rotation.y += 0.004;
        if (measurementGroupRef.current) {
          measurementGroupRef.current.rotation.y = macromoleculeGroupRef.current.rotation.y;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // Robust ResizeObserver for container resizing (transitions, responsive grid, flex reflow)
    let resizeRafId: number | null = null;
    const resizeObserver = new ResizeObserver((entries) => {
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(() => {
        for (const entry of entries) {
          const { width: w, height: h } = entry.contentRect;
          if (w > 0 && h > 0 && rendererRef.current && cameraRef.current) {
            cameraRef.current.aspect = w / h;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(w, h, true);
            rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, 2));

            if (!hasFittedRef.current || Math.abs(cameraRef.current.aspect - (w / h)) > 0.02) {
              fitModelToView(false);
              hasFittedRef.current = true;
            }
          }
        }
      });
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      renderer.dispose();
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [structure, backgroundColor, fitModelToView]);

  // Re-render geometry when visualization controls change without remounting
  useEffect(() => {
    buildStructureGeometry();
    fitModelToView(false);
  }, [representation, colorScheme, selectedResSeq, fitModelToView]);

  // Mouse / Touch Interaction Handlers (Orbit, Pan, Pick)
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    prevMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !macromoleculeGroupRef.current) return;

    if (isDraggingRef.current) {
      const deltaX = e.clientX - prevMousePosRef.current.x;
      const deltaY = e.clientY - prevMousePosRef.current.y;
      prevMousePosRef.current = { x: e.clientX, y: e.clientY };

      if (e.buttons === 1 && (e.shiftKey || e.metaKey)) {
        // Shift + Left click drag: Pan
        macromoleculeGroupRef.current.position.x += deltaX * 0.05;
        macromoleculeGroupRef.current.position.y -= deltaY * 0.05;
        if (measurementGroupRef.current) {
          measurementGroupRef.current.position.x += deltaX * 0.05;
          measurementGroupRef.current.position.y -= deltaY * 0.05;
        }
      } else if (e.buttons === 1) {
        // Left click drag: Rotate
        macromoleculeGroupRef.current.rotation.y += deltaX * 0.01;
        macromoleculeGroupRef.current.rotation.x += deltaY * 0.01;
        if (measurementGroupRef.current) {
          measurementGroupRef.current.rotation.y = macromoleculeGroupRef.current.rotation.y;
          measurementGroupRef.current.rotation.x = macromoleculeGroupRef.current.rotation.x;
        }
      } else if (e.buttons === 2) {
        // Right click drag: Pan
        macromoleculeGroupRef.current.position.x += deltaX * 0.05;
        macromoleculeGroupRef.current.position.y -= deltaY * 0.05;
        if (measurementGroupRef.current) {
          measurementGroupRef.current.position.x += deltaX * 0.05;
          measurementGroupRef.current.position.y -= deltaY * 0.05;
        }
      }
    } else {
      // Raycasting for hover tooltip
      const rect = containerRef.current.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(
        macromoleculeGroupRef.current.children,
        true
      );

      if (intersects.length > 0) {
        const hit = intersects[0].object as any;
        if (hit.userData?.residue) {
          setHoveredResidue(hit.userData.residue);
        } else {
          setHoveredResidue(null);
        }
      } else {
        setHoveredResidue(null);
      }
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!cameraRef.current) return;
    cameraRef.current.position.z += e.deltaY * 0.05;
    cameraRef.current.position.z = Math.max(10, Math.min(250, cameraRef.current.position.z));
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !macromoleculeGroupRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const intersects = raycasterRef.current.intersectObjects(
      macromoleculeGroupRef.current.children,
      true
    );

    if (intersects.length > 0) {
      const hit = intersects[0].object as any;
      const res = hit.userData?.residue as Residue3D | undefined;
      const atom = (hit.userData?.atom || res?.atoms[0]) as AtomicCoordinate | undefined;

      if (res) {
        setSelectedResidueData(res);
        onSelectResidue?.(res.resSeq);
      }

      // Measurement mode handling
      if (isMeasuring && atom && res) {
        const nextPicked = [...pickedAtoms, atom];
        if (nextPicked.length === 2) {
          const [a1, a2] = nextPicked;
          const dist = calculateDistanceAngstrom(a1, a2);
          const newMeas: MeasurementItem = {
            id: `meas-${Date.now()}`,
            type: 'distance',
            atoms: [
              { atom: a1, residueLabel: `${a1.residueName} ${a1.resSeq} (${a1.name})` },
              { atom: a2, residueLabel: `${a2.residueName} ${a2.resSeq} (${a2.name})` }
            ],
            value: Math.round(dist * 100) / 100,
            unit: 'Å',
            label: `${a1.residueName}${a1.resSeq} ↔ ${a2.residueName}${a2.resSeq}`,
            color: '#10B981'
          };
          setMeasurements((prev) => [newMeas, ...prev]);
          setPickedAtoms([]);
        } else {
          setPickedAtoms(nextPicked);
        }
      }
    }
  };

  // Take high-resolution snapshot
  const handleCaptureSnapshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${structure.id}_3D_Structure_Resolution.png`;
    a.click();
  };

  // Download raw PDB coordinate file
  const handleDownloadPdb = () => {
    const text = structure.rawPdbText || generatePdbStringFromStructure(structure);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${structure.id}.pdb`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResetCamera = () => {
    fitModelToView(false);
  };

  return (
    <div
      className={`relative w-full rounded-2xl border border-slate-800 bg-[#07090D] overflow-hidden flex flex-col font-sans select-none ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : className
      }`}
    >
      {/* 3D Visualizer Top Control Ribbon */}
      {enableControls && (
        <div className="bg-[#0B0F17]/90 backdrop-blur-md border-b border-slate-800 p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono z-10">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Resolution Source Badge */}
            <span className="px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{structure.id}</span>
              {structure.resolutionAngstrom && (
                <span className="text-[10px] opacity-80">({structure.resolutionAngstrom} Å)</span>
              )}
            </span>

            {/* Representation Mode Selector */}
            <div className="flex items-center bg-[#161B22] border border-slate-800 rounded-xl p-0.5">
              {(['ribbon', 'ball_and_stick', 'space_fill', 'backbone_trace'] as RepresentationMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setRepresentation(mode)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer capitalize ${
                    representation === mode
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* Color Scheme Selector */}
            <div className="flex items-center bg-[#161B22] border border-slate-800 rounded-xl p-0.5">
              {(
                [
                  { id: 'secondary_structure', label: 'Secondary' },
                  { id: 'hydrophobicity', label: 'Hydrophobic' },
                  { id: 'plddt_bfactor', label: 'pLDDT / B-Factor' },
                  { id: 'rainbow_spectrum', label: 'Rainbow N➔C' },
                  { id: 'mutation_delta', label: 'Mutation Delta' }
                ] as { id: ColorScheme; label: string }[]
              ).map((cs) => (
                <button
                  key={cs.id}
                  type="button"
                  onClick={() => setColorScheme(cs.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    colorScheme === cs.id
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cs.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Tools & Snapshot */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsMeasuring(!isMeasuring)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                isMeasuring
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse'
                  : 'bg-[#161B22] text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
              title="Distance measurement tool"
            >
              <Ruler className="w-3.5 h-3.5" />
              <span>{isMeasuring ? 'Measuring (Click 2 atoms)' : 'Measure'}</span>
            </button>

            <button
              type="button"
              onClick={() => setAutoRotate(!autoRotate)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                autoRotate
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-[#161B22] text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title={autoRotate ? 'Pause Rotation' : 'Resume Rotation'}
            >
              {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={handleResetCamera}
              className="p-1.5 rounded-lg bg-[#161B22] hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title="Reset Camera View"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleCaptureSnapshot}
              className="p-1.5 rounded-lg bg-[#161B22] hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title="Export 4K PNG Snapshot"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleDownloadPdb}
              className="p-1.5 rounded-lg bg-[#161B22] hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title="Download PDB coordinate file"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg bg-[#161B22] hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Main Interactive Three.js WebGL Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
        onDoubleClick={() => fitModelToView(false)}
        onContextMenu={(e) => e.preventDefault()}
        className="flex-1 w-full min-h-[420px] cursor-grab active:cursor-grabbing relative"
      />

      {/* Coordinate Error Overlay if coordinates missing or invalid */}
      {coordinateError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-white/95 z-30 font-mono">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-3 shadow-xs">
            <AlertCircle className="w-6 h-6 text-amber-600" />
          </div>
          <h3 className="text-sm font-bold text-[#0F172A] mb-1 uppercase tracking-wider">Coordinates Unavailable</h3>
          <p className="text-xs text-slate-500 max-w-sm">{coordinateError}</p>
        </div>
      )}

      {/* Hover & Active Selection Diagnostics Floating Card */}
      {(hoveredResidue || selectedResidueData) && (
        <div className="absolute bottom-4 left-4 max-w-sm bg-white/95 backdrop-blur-md border border-[#CBD5E1] rounded-xl p-3 text-xs font-mono text-[#0F172A] shadow-xl z-20 space-y-1.5 pointer-events-none">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-[#0F172A] text-sm">
              {(hoveredResidue || selectedResidueData)?.name} #{(hoveredResidue || selectedResidueData)?.resSeq} (Chain {(hoveredResidue || selectedResidueData)?.chainId})
            </span>
            {(hoveredResidue || selectedResidueData)?.isMutated && (
              <span className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
                {(hoveredResidue || selectedResidueData)?.mutationLabel || 'MUTATION'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-600">
            <div>
              Conformation: <strong className="text-[#0F172A] capitalize">{(hoveredResidue || selectedResidueData)?.secondaryStructure || 'Loop'}</strong>
            </div>
            <div>
              pLDDT / B-Factor: <strong className="text-emerald-600 font-bold">{(hoveredResidue || selectedResidueData)?.pLddt ?? (hoveredResidue || selectedResidueData)?.bFactorAvg}</strong>
            </div>
            {(hoveredResidue || selectedResidueData)?.phi !== undefined && (
              <div>
                Φ: <strong className="text-purple-700">{(hoveredResidue || selectedResidueData)?.phi}°</strong>
              </div>
            )}
            {(hoveredResidue || selectedResidueData)?.psi !== undefined && (
              <div>
                Ψ: <strong className="text-purple-700">{(hoveredResidue || selectedResidueData)?.psi}°</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Color Scheme Guide Legend */}
      <div className="bg-white/90 backdrop-blur-xs border-t border-[#E2E8F0] px-4 py-2 flex items-center justify-between flex-wrap gap-2 text-[11px] font-mono text-slate-600 z-10">
        <div className="flex items-center gap-3">
          <span className="text-slate-400 uppercase font-bold text-[10px]">Legend:</span>
          {colorScheme === 'secondary_structure' && (
            <>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-fuchsia-500" /> α-Helix</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> β-Sheet</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> Loop / Coil</span>
            </>
          )}
          {colorScheme === 'mutation_delta' && (
            <>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" /> Modified Residue</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Unaltered Scaffold</span>
            </>
          )}
          {colorScheme === 'plddt_bfactor' && (
            <>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-700" /> &gt;90 (High)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-400" /> 70-90 (Confident)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-400" /> 50-70 (Low)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> &lt;50 (Very Low)</span>
            </>
          )}
        </div>

        <div className="text-[10px] text-slate-500">
          Rotate: Drag | Pan: Right-Click or Shift+Drag | Zoom: Scroll | Reset: Double-Click
        </div>
      </div>
    </div>
  );
};

function generatePdbStringFromStructure(struct: ResolvedStructure3D): string {
  let out = `HEADER    ${struct.macromoleculeType} GENERATED MODEL            ${struct.id}\n`;
  out += `TITLE     ${struct.title}\n`;
  struct.allAtoms.forEach((a) => {
    const x = a.x.toFixed(3).padStart(8, ' ');
    const y = a.y.toFixed(3).padStart(8, ' ');
    const z = a.z.toFixed(3).padStart(8, ' ');
    const resSeq = String(a.resSeq).padStart(4, ' ');
    const atomId = String(a.id).padStart(5, ' ');
    const atomName = a.name.padEnd(4, ' ');
    const resName = a.residueName.padStart(3, ' ');
    out += `ATOM  ${atomId} ${atomName} ${resName} ${a.chainId}${resSeq}    ${x}${y}${z}  1.00 ${a.tempFactor.toFixed(2).padStart(5, ' ')}           ${a.element}\n`;
  });
  out += 'TER\nEND\n';
  return out;
}
