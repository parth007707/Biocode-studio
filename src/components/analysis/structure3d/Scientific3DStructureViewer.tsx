import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ResolvedStructure3D,
  RepresentationMode,
  ColorScheme,
  AtomicCoordinate,
  Residue3D
} from '../../../lib/bio/structure3d/types';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCw,
  Crosshair,
  RotateCcw,
  Atom
} from 'lucide-react';

export interface Scientific3DStructureViewerProps {
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
  backgroundColor?: string | number;
}

const CPK_LIGHT_THEME: Record<string, number> = {
  C: 0x334155,  // Crisp charcoal slate against white canvas
  N: 0x2563eb,  // Royal blue
  O: 0xdc2626,  // Crimson red
  S: 0xd97706,  // Warm amber
  P: 0xea580c,  // Vivid orange
  H: 0x94a3b8,  // Cool silver
  ZN: 0x0d9488, // Teal metal
  MG: 0x16a34a, // Emerald
  FE: 0xb45309, // Rust
  CA: 0x059669, // Jade
  CL: 0x15803d,
  F: 0x0891b2,
  BR: 0x991b1b
};

const COVALENT_RADII: Record<string, number> = {
  H: 0.31, C: 0.76, N: 0.71, O: 0.66, S: 1.05, P: 1.07,
  F: 0.57, CL: 1.02, BR: 1.20, I: 1.39, ZN: 1.22, FE: 1.32, MG: 1.41
};

const VDW_RADII: Record<string, number> = {
  H: 1.10, C: 1.65, N: 1.50, O: 1.45, S: 1.75, P: 1.78, ZN: 1.39, FE: 1.40, MG: 1.55
};

const CHAIN_PALETTE = [
  0x0284c7, // Sky blue
  0x0d9488, // Teal
  0x6366f1, // Indigo
  0xd97706, // Amber
  0xdb2777, // Rose
  0x16a34a  // Emerald
];

function getAtomColorHex(
  atom: AtomicCoordinate,
  res: Residue3D | undefined,
  colorScheme: ColorScheme,
  totalResIndex: number,
  totalResidues: number,
  chainIndex: number,
  selectedResSeq: number | null | undefined,
  isPrimaryChain: boolean
): number {
  if (selectedResSeq !== null && selectedResSeq !== undefined && atom.resSeq === selectedResSeq && isPrimaryChain) {
    return 0xf59e0b; // Selected residue highlight (Amber)
  }
  if (res?.isMutated || colorScheme === 'mutation_delta') {
    if (res?.isMutated) return 0xef4444; // Mutated residue (Red)
    if (colorScheme === 'mutation_delta') return 0x94a3b8;
  }

  switch (colorScheme) {
    case 'chain': {
      return CHAIN_PALETTE[chainIndex % CHAIN_PALETTE.length];
    }
    case 'residue': {
      const code1 = (res?.code1 || '').toUpperCase();
      const rn = (atom.residueName || '').toUpperCase();
      // Nucleic acid base coloring
      if (['DA', 'DT', 'DG', 'DC', 'DU', 'A', 'T', 'G', 'C', 'U', 'PSU', 'H2U', '5MU', 'BRU', '5IU', 'IU', 'M2G', 'OMG', '7MG', '2MG', 'OMC', '5MC', '1MA', 'AMP', 'GMP', 'CMP', 'ADE', 'THY', 'GUA', 'CYT', 'URA'].includes(rn)) {
        if (code1 === 'A') return 0xef4444; // Adenine red
        if (code1 === 'T') return 0x3b82f6; // Thymine blue
        if (code1 === 'U') return 0xa855f7; // Uracil purple
        if (code1 === 'G') return 0x10b981; // Guanine emerald
        if (code1 === 'C') return 0xf59e0b; // Cytosine amber
        return 0x64748b;
      }
      // Amino acid biochemical classification coloring
      if (['R', 'K', 'H'].includes(code1)) return 0x2563eb; // Positive
      if (['D', 'E'].includes(code1)) return 0xdc2626; // Negative
      if (['A', 'V', 'I', 'L', 'M', 'F', 'W', 'P'].includes(code1)) return 0xd97706; // Hydrophobic
      if (['S', 'T', 'N', 'Q', 'Y', 'C'].includes(code1)) return 0x0d9488; // Polar
      return 0x64748b;
    }
    case 'element': {
      const el = (atom.element || 'C').toUpperCase();
      if (el === 'C' && !isPrimaryChain) {
        return 0x64748b; // Slightly softer carbon for partner/DNA chains
      }
      return CPK_LIGHT_THEME[el] ?? CHAIN_PALETTE[chainIndex % CHAIN_PALETTE.length];
    }
    case 'secondary_structure': {
      if (res?.secondaryStructure === 'helix') return 0xe11d48; // Rose-red alpha helix
      if (res?.secondaryStructure === 'sheet') return 0xd97706; // Gold beta sheet
      return isPrimaryChain ? 0x0284c7 : 0x64748b; // Sky-blue loop / slate partner
    }
    case 'hydrophobicity': {
      const h = res?.hydrophobicity ?? 0;
      if (h >= 2.0) return 0xd97706;
      if (h >= 0) return 0xf59e0b;
      if (h >= -2.5) return 0x38bdf8;
      return 0x1d4ed8;
    }
    case 'plddt_bfactor': {
      const val = atom.tempFactor;
      if (val >= 90) return 0x0369a1; // Very high confidence (dark blue)
      if (val >= 70) return 0x0ea5e9; // Confident (sky blue)
      if (val >= 50) return 0xfacc15; // Low (yellow)
      return 0xf97316; // Very low / flexible (orange)
    }
    case 'electrostatics': {
      const rn = (atom.residueName || '').toUpperCase();
      if (rn === 'ARG' || rn === 'LYS' || rn === 'HIS') return 0x2563eb;
      if (rn === 'ASP' || rn === 'GLU') return 0xdc2626;
      return 0x64748b;
    }
    case 'rainbow_spectrum': {
      const t = totalResidues > 1 ? Math.max(0, Math.min(1, totalResIndex / (totalResidues - 1))) : 0;
      const color = new THREE.Color().setHSL((1 - t) * 0.68, 0.82, 0.45);
      return color.getHex();
    }
    default:
      return CPK_LIGHT_THEME[(atom.element || 'C').toUpperCase()] ?? 0x334155;
  }
}

/**
 * Spatial hash grid O(N) covalent bond detection on finite atomic coordinates
 */
function computeCovalentBonds(atoms: AtomicCoordinate[]): Array<[number, number]> {
  const bonds: Array<[number, number]> = [];
  if (atoms.length < 2) return bonds;

  const CELL_SIZE = 2.4;
  const grid = new Map<string, number[]>();

  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const gx = Math.floor(a.x / CELL_SIZE);
    const gy = Math.floor(a.y / CELL_SIZE);
    const gz = Math.floor(a.z / CELL_SIZE);
    const key = `${gx},${gy},${gz}`;
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(i);
  }

  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const rA = COVALENT_RADII[a.element] ?? 0.77;
    const gx = Math.floor(a.x / CELL_SIZE);
    const gy = Math.floor(a.y / CELL_SIZE);
    const gz = Math.floor(a.z / CELL_SIZE);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            const b = atoms[j];
            if (a.chainId !== b.chainId) continue;
            if (Math.abs(a.resSeq - b.resSeq) > 1 && !a.isHetatm && !b.isHetatm) continue;

            const ddx = b.x - a.x;
            const ddy = b.y - a.y;
            const ddz = b.z - a.z;
            const distSq = ddx * ddx + ddy * ddy + ddz * ddz;
            const rB = COVALENT_RADII[b.element] ?? 0.77;
            const maxBond = rA + rB + 0.45;
            if (distSq >= 0.16 && distSq <= maxBond * maxBond) {
              bonds.push([i, j]);
            }
          }
        }
      }
    }
  }
  return bonds;
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  });
}

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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const moleculeGroupRef = useRef<THREE.Group | null>(null);
  const envTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const defaultCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 70));
  const defaultTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const atomMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const renderedAtomsRef = useRef<AtomicCoordinate[]>([]);

  const [representation, setRepresentation] = useState<RepresentationMode>(controlledRepresentation || initialRepresentation);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(controlledColorScheme || initialColorScheme);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [inspectedAtom, setInspectedAtom] = useState<AtomicCoordinate | null>(null);
  const [renderStats, setRenderStats] = useState<{ atoms: number; bonds: number; chains: number }>({
    atoms: 0,
    bonds: 0,
    chains: 0
  });

  useEffect(() => {
    if (controlledRepresentation) setRepresentation(controlledRepresentation);
  }, [controlledRepresentation]);

  useEffect(() => {
    if (controlledColorScheme) setColorScheme(controlledColorScheme);
  }, [controlledColorScheme]);

  const resolvedBgHex = typeof backgroundColor === 'number'
    ? backgroundColor
    : parseInt(String(backgroundColor).replace('#', ''), 16) || 0xf8fafc;

  // 1. Initialize Three.js WebGLRenderer, Camera, Studio Lighting, RoomEnvironment & OrbitControls
  useEffect(() => {
    const domEl = containerRef.current;
    if (!domEl) return;

    // Probe software WebGL environment before creating main renderer
    let isSoftwareGl = false;
    try {
      const probeCanvas = document.createElement('canvas');
      const gl2 = probeCanvas.getContext('webgl2');
      if (gl2) {
        const dbg = gl2.getExtension('WEBGL_debug_renderer_info');
        const rStr = dbg ? String(gl2.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
        isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rStr);
        gl2.getExtension('WEBGL_lose_context')?.loseContext();
      }
    } catch {}

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false
      });
    } catch (err: any) {
      setWebglError(err?.message || 'WebGL initialization failed in this browser.');
      return;
    }

    const width = Math.max(domEl.clientWidth, 1);
    const height = Math.max(domEl.clientHeight, 260);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    rendererRef.current = renderer;

    if (renderer.domElement.parentNode !== domEl) {
      domEl.appendChild(renderer.domElement);
    }
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(resolvedBgHex);
    sceneRef.current = scene;

    // Clean studio environment lighting via RoomEnvironment (skipped under software WebGL to prevent GPU stall)
    if (!isSoftwareGl) {
      try {
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        const roomEnv = new RoomEnvironment();
        const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
        scene.environment = envTarget.texture;
        envTargetRef.current = envTarget;
        roomEnv.dispose();
        pmremGenerator.dispose();
      } catch {}
    }

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.35);
    keyLight.position.set(40, 60, 50);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.65);
    fillLight.position.set(-50, -30, 40);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf8fafc, 0.45);
    rimLight.position.set(0, 40, -60);
    scene.add(rimLight);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 2500);
    camera.position.set(0, 0, 75);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.minDistance = 6;
    controls.maxDistance = 600;
    controlsRef.current = controls;

    const moleculeGroup = new THREE.Group();
    scene.add(moleculeGroup);
    moleculeGroupRef.current = moleculeGroup;

    let animFrameId = 0;
    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    let lastWidth = width;
    let lastHeight = height;
    let resizeRafId = 0;

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = Math.max(containerRef.current.clientWidth, 1);
      const h = Math.max(containerRef.current.clientHeight, 260);
      if (w === lastWidth && h === lastHeight) return;
      lastWidth = w;
      lastHeight = h;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    const scheduleResize = () => {
      if (resizeRafId) cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(handleResize);
    };
    window.addEventListener('resize', scheduleResize);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => scheduleResize())
      : null;
    if (resizeObserver) resizeObserver.observe(domEl);

    return () => {
      cancelAnimationFrame(animFrameId);
      if (resizeRafId) cancelAnimationFrame(resizeRafId);
      window.removeEventListener('resize', scheduleResize);
      resizeObserver?.disconnect();
      controls.dispose();
      if (moleculeGroupRef.current) {
        disposeObject3D(moleculeGroupRef.current);
      }
      envTargetRef.current?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === domEl) {
        domEl.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      moleculeGroupRef.current = null;
    };
  }, [resolvedBgHex]);

  // 2. Build Three.js Geometry from Real Validated Coordinates
  useEffect(() => {
    const group = moleculeGroupRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!group || !camera || !controls || !structure) return;

    // Clear previous geometry cleanly
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      disposeObject3D(child);
    }
    atomMeshRef.current = null;
    renderedAtomsRef.current = [];

    // Filter finite atomic coordinates strictly
    const finiteAtoms = (structure.allAtoms || []).filter(
      (a) => Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z)
    );
    if (finiteAtoms.length === 0) {
      setRenderStats({ atoms: 0, bonds: 0, chains: 0 });
      return;
    }

    // Center coordinates around geometric centroid for stable camera orbit & zoom
    let sumX = 0, sumY = 0, sumZ = 0;
    for (const a of finiteAtoms) {
      sumX += a.x; sumY += a.y; sumZ += a.z;
    }
    const cx = sumX / finiteAtoms.length;
    const cy = sumY / finiteAtoms.length;
    const cz = sumZ / finiteAtoms.length;

    let maxRadiusSq = 1;
    for (const a of finiteAtoms) {
      const dx = a.x - cx, dy = a.y - cy, dz = a.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > maxRadiusSq) maxRadiusSq = d2;
    }
    const boundingRadius = Math.max(8, Math.sqrt(maxRadiusSq));

    const primaryChainId = structure.matchedChainId || structure.coverageInfo?.chain;

    // Residue lookup for color schemes
    const residueLookup = new Map<string, { res: Residue3D; seqIdx: number; totalInChain: number; chainIdx: number }>();
    structure.chains.forEach((chain, chainIdx) => {
      chain.residues.forEach((res, resIdx) => {
        residueLookup.set(`${chain.id}:${res.resSeq}`, {
          res,
          seqIdx: resIdx,
          totalInChain: chain.residues.length,
          chainIdx
        });
      });
    });

    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();
    let totalBondsRendered = 0;

    // Choose representation rendering pipeline
    if (representation === 'ball_and_stick' || representation === 'space_fill' || representation === 'wireframe') {
      const atomsToRender = finiteAtoms;
      renderedAtomsRef.current = atomsToRender;

      const isSpaceFill = representation === 'space_fill';
      const isWireframe = representation === 'wireframe';

      const sphereGeo = new THREE.SphereGeometry(1, isSpaceFill ? 20 : 14, isSpaceFill ? 16 : 12);
      const atomMat = new THREE.MeshStandardMaterial({
        roughness: isSpaceFill ? 0.35 : 0.3,
        metalness: 0.08
      });

      const atomMesh = new THREE.InstancedMesh(sphereGeo, atomMat, atomsToRender.length);
      for (let i = 0; i < atomsToRender.length; i++) {
        const a = atomsToRender[i];
        const info = residueLookup.get(`${a.chainId}:${a.resSeq}`);
        const isPrimary = !primaryChainId || a.chainId === primaryChainId;
        const el = (a.element || 'C').toUpperCase();
        const r = isSpaceFill
          ? (VDW_RADII[el] ?? 1.55) * 0.85
          : isWireframe
          ? 0.16
          : (el === 'H' ? 0.22 : a.isHetatm ? 0.42 : 0.33);

        dummy.position.set(a.x - cx, a.y - cy, a.z - cz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(r);
        dummy.updateMatrix();
        atomMesh.setMatrixAt(i, dummy.matrix);

        const hex = getAtomColorHex(
          a,
          info?.res,
          colorScheme,
          info?.seqIdx ?? 0,
          info?.totalInChain ?? 1,
          info?.chainIdx ?? 0,
          selectedResSeq,
          isPrimary
        );
        tmpColor.setHex(hex);
        atomMesh.setColorAt(i, tmpColor);
      }
      atomMesh.instanceMatrix.needsUpdate = true;
      if (atomMesh.instanceColor) atomMesh.instanceColor.needsUpdate = true;
      atomMesh.computeBoundingSphere();
      group.add(atomMesh);
      atomMeshRef.current = atomMesh;

      if (!isSpaceFill) {
        const bonds = computeCovalentBonds(atomsToRender);
        totalBondsRendered = bonds.length;
        if (bonds.length > 0) {
          const bondGeo = new THREE.CylinderGeometry(isWireframe ? 0.07 : 0.12, isWireframe ? 0.07 : 0.12, 1, 8, 1);
          const bondMat = new THREE.MeshStandardMaterial({
            roughness: 0.45,
            metalness: 0.05
          });
          const bondMesh = new THREE.InstancedMesh(bondGeo, bondMat, bonds.length);
          const up = new THREE.Vector3(0, 1, 0);
          const pA = new THREE.Vector3();
          const pB = new THREE.Vector3();
          const dir = new THREE.Vector3();
          const mid = new THREE.Vector3();
          const quat = new THREE.Quaternion();

          for (let bIdx = 0; bIdx < bonds.length; bIdx++) {
            const [iA, iB] = bonds[bIdx];
            const a = atomsToRender[iA];
            const b = atomsToRender[iB];
            pA.set(a.x - cx, a.y - cy, a.z - cz);
            pB.set(b.x - cx, b.y - cy, b.z - cz);
            dir.subVectors(pB, pA);
            const len = dir.length();
            if (len < 0.01) continue;
            mid.addVectors(pA, pB).multiplyScalar(0.5);
            quat.setFromUnitVectors(up, dir.normalize());

            dummy.position.copy(mid);
            dummy.quaternion.copy(quat);
            dummy.scale.set(1, len, 1);
            dummy.updateMatrix();
            bondMesh.setMatrixAt(bIdx, dummy.matrix);

            const info = residueLookup.get(`${a.chainId}:${a.resSeq}`);
            const isPrimary = !primaryChainId || a.chainId === primaryChainId;
            const hex = colorScheme === 'element'
              ? (isPrimary ? 0x94a3b8 : 0xcbd5e1)
              : getAtomColorHex(a, info?.res, colorScheme, info?.seqIdx ?? 0, info?.totalInChain ?? 1, info?.chainIdx ?? 0, selectedResSeq, isPrimary);
            tmpColor.setHex(hex);
            bondMesh.setColorAt(bIdx, tmpColor);
          }
          bondMesh.instanceMatrix.needsUpdate = true;
          if (bondMesh.instanceColor) bondMesh.instanceColor.needsUpdate = true;
          bondMesh.computeBoundingSphere();
          group.add(bondMesh);
        }
      }
    } else {
      // Cartoon / Ribbon / Backbone Trace / Surface representation
      const isBackboneTrace = representation === 'backbone_trace';
      const isSurfaceStyle = representation === 'surface';

      structure.chains.forEach((chain, chainIdx) => {
        const isPrimary = !primaryChainId || chain.id === primaryChainId;
        const backboneResidues = chain.residues.filter((r) => r.ca && Number.isFinite(r.ca.x));
        if (backboneResidues.length < 2) return;

        // Split chain into contiguous structural segments (to avoid straight lines across missing density gaps > 7 Å)
        const segments: Residue3D[][] = [];
        let currentSeg: Residue3D[] = [backboneResidues[0]];
        for (let i = 1; i < backboneResidues.length; i++) {
          const prev = backboneResidues[i - 1].ca!;
          const curr = backboneResidues[i].ca!;
          const dx = curr.x - prev.x, dy = curr.y - prev.y, dz = curr.z - prev.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const maxStep = chain.type === 'PROTEIN' ? 6.5 : 10.0;
          if (dist > maxStep) {
            if (currentSeg.length >= 2) segments.push(currentSeg);
            currentSeg = [backboneResidues[i]];
          } else {
            currentSeg.push(backboneResidues[i]);
          }
        }
        if (currentSeg.length >= 2) segments.push(currentSeg);

        // Render each contiguous polymer segment with smooth Catmull-Rom spline TubeGeometry & per-vertex biological coloring
        for (const seg of segments) {
          const points = seg.map((r) => new THREE.Vector3(r.ca!.x - cx, r.ca!.y - cy, r.ca!.z - cz));
          const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.45);
          const tubularSegments = Math.min(2400, Math.max(seg.length * 4, 24));
          const radialSegments = isBackboneTrace ? 6 : 12;
          const radius = isBackboneTrace
            ? 0.24
            : isSurfaceStyle
            ? 1.55
            : chain.type === 'PROTEIN'
            ? (isPrimary ? 0.56 : 0.40)
            : 0.65;

          const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);

          // Apply smooth per-vertex coloring along curve parameter t
          const posAttr = tubeGeo.attributes.position;
          const colors = new Float32Array(posAttr.count * 3);
          const ringVertexCount = radialSegments + 1;

          for (let v = 0; v < posAttr.count; v++) {
            const segIdx = Math.min(tubularSegments, Math.floor(v / ringVertexCount));
            const t = segIdx / tubularSegments;
            const resFloat = t * (seg.length - 1);
            const res = seg[Math.min(seg.length - 1, Math.round(resFloat))];
            const repAtom = res.ca || res.atoms[0];

            let hex = CHAIN_PALETTE[chainIdx % CHAIN_PALETTE.length];
            if (repAtom) {
              if (colorScheme === 'element') {
                // In ribbon/cartoon mode, element fallback colors by chain/secondary structure so chains are visually distinguishable
                if (res.isMutated) hex = 0xef4444;
                else if (selectedResSeq && res.resSeq === selectedResSeq && isPrimary) hex = 0xf59e0b;
                else if (!isPrimary) hex = chain.type === 'DNA' || chain.type === 'RNA' ? 0x0d9488 : 0x94a3b8;
                else if (res.secondaryStructure === 'helix') hex = 0x0284c7;
                else if (res.secondaryStructure === 'sheet') hex = 0x0369a1;
                else hex = 0x38bdf8;
              } else {
                hex = getAtomColorHex(
                  repAtom,
                  res,
                  colorScheme,
                  res.index,
                  chain.residues.length,
                  chainIdx,
                  selectedResSeq,
                  isPrimary
                );
              }
            }

            tmpColor.setHex(hex);
            colors[v * 3] = tmpColor.r;
            colors[v * 3 + 1] = tmpColor.g;
            colors[v * 3 + 2] = tmpColor.b;
          }

          tubeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          const mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: isSurfaceStyle ? 0.6 : 0.32,
            metalness: 0.06,
            transparent: isSurfaceStyle || (!isPrimary && structure.chains.length > 1),
            opacity: isSurfaceStyle ? 0.85 : (!isPrimary && structure.chains.length > 1 ? 0.72 : 1.0)
          });

          const mesh = new THREE.Mesh(tubeGeo, mat);
          mesh.userData = { chainId: chain.id, residues: seg };
          group.add(mesh);
          totalBondsRendered += seg.length - 1;
        }

        // For nucleic acids in ribbon mode, draw base rungs from backbone P/C4' toward glycosidic N1/N9
        if (chain.type === 'DNA' || chain.type === 'RNA') {
          const basePairs: Array<{ p1: THREE.Vector3; p2: THREE.Vector3; res: Residue3D; resIdx: number }> = [];
          chain.residues.forEach((res, resIdx) => {
            if (res.ca && res.n) {
              basePairs.push({
                p1: new THREE.Vector3(res.ca.x - cx, res.ca.y - cy, res.ca.z - cz),
                p2: new THREE.Vector3(res.n.x - cx, res.n.y - cy, res.n.z - cz),
                res,
                resIdx
              });
            }
          });
          if (basePairs.length > 0) {
            const rungGeo = new THREE.CylinderGeometry(0.16, 0.16, 1, 8, 1);
            const rungMat = new THREE.MeshStandardMaterial({ roughness: 0.4 });
            const rungMesh = new THREE.InstancedMesh(rungGeo, rungMat, basePairs.length);
            const up = new THREE.Vector3(0, 1, 0);
            const dir = new THREE.Vector3();
            const mid = new THREE.Vector3();
            const quat = new THREE.Quaternion();
            basePairs.forEach((bp, idx) => {
              dir.subVectors(bp.p2, bp.p1);
              const len = dir.length();
              if (len < 0.05) return;
              mid.addVectors(bp.p1, bp.p2).multiplyScalar(0.5);
              quat.setFromUnitVectors(up, dir.normalize());
              dummy.position.copy(mid);
              dummy.quaternion.copy(quat);
              dummy.scale.set(1, len, 1);
              dummy.updateMatrix();
              rungMesh.setMatrixAt(idx, dummy.matrix);

              const repAtom = bp.res.n || bp.res.ca || bp.res.atoms[0];
              const hex = (colorScheme === 'secondary_structure' || colorScheme === 'element')
                ? getAtomColorHex(repAtom, bp.res, 'residue', bp.resIdx, chain.residues.length, chainIdx, selectedResSeq, isPrimary)
                : getAtomColorHex(repAtom, bp.res, colorScheme, bp.resIdx, chain.residues.length, chainIdx, selectedResSeq, isPrimary);
              tmpColor.setHex(hex);
              rungMesh.setColorAt(idx, tmpColor);
            });
            rungMesh.instanceMatrix.needsUpdate = true;
            if (rungMesh.instanceColor) rungMesh.instanceColor.needsUpdate = true;
            rungMesh.computeBoundingSphere();
            group.add(rungMesh);
          }
        }
      });

      // Render bound ligands / cofactors (e.g. Zn2+ in 1TUP) and mutated residue Cα spheres cleanly in all modes
      const caAtomsToPick = finiteAtoms.filter((a) => a.name === 'CA' || a.name === "C4'" || a.isHetatm);
      renderedAtomsRef.current = caAtomsToPick;
      if (caAtomsToPick.length > 0) {
        const nodeGeo = new THREE.SphereGeometry(1, 12, 10);
        const nodeMat = new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.1 });
        const nodeMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, caAtomsToPick.length);
        caAtomsToPick.forEach((a, i) => {
          const info = residueLookup.get(`${a.chainId}:${a.resSeq}`);
          const isPrimary = !primaryChainId || a.chainId === primaryChainId;
          const isHighlighted = Boolean(info?.res?.isMutated || (selectedResSeq && a.resSeq === selectedResSeq && isPrimary) || a.isHetatm);
          const scale = isHighlighted ? (a.isHetatm ? 0.65 : 0.95) : (isBackboneTrace ? 0.38 : 0.12);

          dummy.position.set(a.x - cx, a.y - cy, a.z - cz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(scale);
          dummy.updateMatrix();
          nodeMesh.setMatrixAt(i, dummy.matrix);

          const hex = getAtomColorHex(
            a,
            info?.res,
            colorScheme,
            info?.seqIdx ?? 0,
            info?.totalInChain ?? 1,
            info?.chainIdx ?? 0,
            selectedResSeq,
            isPrimary
          );
          tmpColor.setHex(hex);
          nodeMesh.setColorAt(i, tmpColor);
        });
        nodeMesh.instanceMatrix.needsUpdate = true;
        if (nodeMesh.instanceColor) nodeMesh.instanceColor.needsUpdate = true;
        nodeMesh.computeBoundingSphere();
        group.add(nodeMesh);
        atomMeshRef.current = nodeMesh;
      }
    }

    // Fit camera cleanly to bounding radius
    const fovRad = (camera.fov * Math.PI) / 180;
    const fitDist = Math.max(18, (boundingRadius / Math.sin(fovRad / 2)) * 1.18);
    defaultTargetRef.current.set(0, 0, 0);
    defaultCamPosRef.current.set(0, boundingRadius * 0.25, fitDist);

    controls.target.copy(defaultTargetRef.current);
    camera.position.copy(defaultCamPosRef.current);
    controls.update();

    setRenderStats({
      atoms: finiteAtoms.length,
      bonds: totalBondsRendered,
      chains: structure.chains.length
    });
  }, [structure, representation, colorScheme, selectedResSeq]);

  // Camera control trigger handlers
  const handleResetView = useCallback(() => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    ctrl.target.copy(defaultTargetRef.current);
    cam.position.copy(defaultCamPosRef.current);
    ctrl.update();
  }, []);

  const handleCenterView = useCallback(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    ctrl.target.set(0, 0, 0);
    ctrl.update();
  }, []);

  const handleZoom = useCallback((factor: number) => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    const offset = cam.position.clone().sub(ctrl.target);
    const newLen = Math.max(6, Math.min(600, offset.length() * factor));
    offset.setLength(newLen);
    cam.position.copy(ctrl.target).add(offset);
    ctrl.update();
  }, []);

  useEffect(() => {
    if (resetTrigger && resetTrigger > 0) handleResetView();
  }, [resetTrigger, handleResetView]);

  useEffect(() => {
    if (centerTrigger && centerTrigger > 0) handleCenterView();
  }, [centerTrigger, handleCenterView]);

  useEffect(() => {
    if (zoomInTrigger && zoomInTrigger > 0) handleZoom(0.78);
  }, [zoomInTrigger, handleZoom]);

  useEffect(() => {
    if (zoomOutTrigger && zoomOutTrigger > 0) handleZoom(1.28);
  }, [zoomOutTrigger, handleZoom]);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
      controlsRef.current.autoRotateSpeed = 1.8;
    }
  }, [autoRotate]);

  // Click raycasting to inspect atomic coordinates
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const domEl = rendererRef.current?.domElement;
    const cam = cameraRef.current;
    const mesh = atomMeshRef.current;
    if (!domEl || !cam || !mesh) return;

    const rect = domEl.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, cam);
    const hits = raycaster.intersectObject(mesh, false);
    if (hits.length > 0 && hits[0].instanceId !== undefined) {
      const atom = renderedAtomsRef.current[hits[0].instanceId];
      if (atom) {
        setInspectedAtom(atom);
        onSelectResidue?.(atom.resSeq);
      }
    }
  }, [onSelectResidue]);

  const toggleFullscreen = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={wrapperRef}
      data-engine="threejs"
      data-atoms-rendered={renderStats.atoms}
      data-chains-rendered={renderStats.chains}
      className={`relative w-full h-full bg-[#F8FAFC] flex flex-col overflow-hidden select-none ${className}`}
    >
      {webglError ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#F8FAFC] text-slate-700 font-mono text-xs">
          <p className="font-bold text-slate-900 mb-1">WebGL Renderer Unavailable</p>
          <p>{webglError}</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          onClick={handleCanvasClick}
          className="w-full h-full min-h-[260px] sm:min-h-[380px] lg:min-h-[460px] flex-1 bg-[#F8FAFC] cursor-grab active:cursor-grabbing"
        />
      )}

      {/* Built-in Floating Control Toolbar (used in modal or standalone views) */}
      {enableControls && (
        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-30 flex items-center gap-0.5 sm:gap-1 bg-white/95 backdrop-blur-md p-1 rounded-lg border border-[#CBD5E1] text-slate-700 shadow-md">
          <button
            type="button"
            onClick={() => handleZoom(0.78)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleZoom(1.28)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleCenterView}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            title="Center Target"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setAutoRotate((p) => !p)}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${autoRotate ? 'bg-sky-600 text-white' : 'hover:bg-slate-100 text-slate-700'}`}
            title="Toggle Auto-Rotation"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            title="Reset Camera View"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Selected Atom / Coordinate Inspector Badge */}
      {inspectedAtom && (
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-20 max-w-[calc(100%-1rem)] sm:max-w-md bg-white/95 backdrop-blur-md border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-slate-800 shadow-sm flex items-center gap-2">
          <Atom className="w-3.5 h-3.5 text-sky-600 shrink-0" />
          <span className="truncate">
            <strong>Chain {inspectedAtom.chainId}</strong> · {inspectedAtom.residueName} {inspectedAtom.resSeq} · {inspectedAtom.name} ({inspectedAtom.element}) · ({inspectedAtom.x.toFixed(2)}, {inspectedAtom.y.toFixed(2)}, {inspectedAtom.z.toFixed(2)}) Å
          </span>
          <button
            type="button"
            onClick={() => setInspectedAtom(null)}
            className="text-slate-400 hover:text-slate-700 ml-1 cursor-pointer shrink-0"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};
