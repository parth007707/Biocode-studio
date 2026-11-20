import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RotateCcw, Play, Pause, ZoomIn, ZoomOut, Check, RefreshCw, Crosshair, Box, Layers, AlertTriangle } from 'lucide-react';
import { SequenceType } from '../../lib/bio/types';
import { SequenceMutation } from '../../lib/bio/editor/types';
import { parseBiologicalInput } from '../../lib/bio/sequenceParser';
import { ViewerRepresentation, ViewerColorScheme } from './types';
import { resolveMacromolecularStructure, computeClientSequenceHash } from '../../lib/bio/structure3d/structureResolver';
import { ResolvedStructure3D, AtomicCoordinate, Residue3D } from '../../lib/bio/structure3d/types';
import { calculateDistanceAngstrom } from '../../lib/bio/structure3d/distanceEngine';

const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return true;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
})();

export interface Sequence3DViewerProps {
  sequence: string;
  originalSequence?: string;
  sequenceType?: SequenceType | string;
  accession?: string;
  mutations?: SequenceMutation[];
  selectedResSeq?: number | null;
  onSelectResidue?: (resSeq: number, residue: string) => void;
  initialRepresentation?: ViewerRepresentation;
  initialColorScheme?: ViewerColorScheme;
  syncStatus?: 'SYNCED' | 'UPDATING' | 'OUTDATED' | 'UNAVAILABLE';
  showControls?: boolean;
  className?: string;
  height?: number | string;
  title?: string;
}

// CPK Element Colors
const CPK_COLORS: Record<string, number> = {
  C: 0x94a3b8, // Carbon: Slate
  N: 0x3b82f6, // Nitrogen: Blue
  O: 0xef4444, // Oxygen: Red
  S: 0xfacc15, // Sulfur: Yellow
  P: 0xf97316, // Phosphorus: Orange
  H: 0xf8fafc, // Hydrogen: White
};

// Secondary Structure Colors
const SECONDARY_COLORS: Record<string, number> = {
  helix: 0xd946ef,
  sheet: 0xfacc15,
  coil: 0x06b6d4,
  turn: 0x10b981
};

export const Sequence3DViewer: React.FC<Sequence3DViewerProps> = ({
  sequence,
  originalSequence,
  sequenceType = 'PROTEIN',
  accession = 'Sequence',
  mutations = [],
  selectedResSeq: controlledSelectedResSeq = null,
  onSelectResidue,
  initialRepresentation = 'ball_stick',
  initialColorScheme = 'element',
  syncStatus = 'SYNCED',
  showControls = true,
  className = '',
  height = '100%',
  title
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [representation, setRepresentation] = useState<ViewerRepresentation>(initialRepresentation || 'ball_stick');
  const [colorScheme, setColorScheme] = useState<ViewerColorScheme>(initialColorScheme || 'element');
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [structure, setStructure] = useState<ResolvedStructure3D | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingPhase, setLoadingPhase] = useState<string>('Resolving structure...');
  const [selectedAtom, setSelectedAtom] = useState<{ atom: AtomicCoordinate; residue: Residue3D } | null>(null);
  const [hoveredResidue, setHoveredResidue] = useState<Residue3D | null>(null);

  // Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const prevMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const raycasterRef = useRef(new THREE.Raycaster());
  const mousePosRef = useRef(new THREE.Vector2());

  const autoRotateRef = useRef<boolean>(autoRotate);
  autoRotateRef.current = autoRotate;
  const onSelectResidueRef = useRef(onSelectResidue);
  onSelectResidueRef.current = onSelectResidue;
  const lastFittedStructureRef = useRef<ResolvedStructure3D | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const parsedInput = useMemo(() => parseBiologicalInput(sequence), [sequence]);
  const cleanSeq = useMemo(() => parsedInput.sequence.replace(/[^A-Z]/g, ''), [parsedInput]);
  const normSeqType: SequenceType = String(sequenceType).toUpperCase().includes('PROT')
    ? 'PROTEIN'
    : String(sequenceType).toUpperCase().includes('RNA')
    ? 'RNA'
    : 'DNA';

  // 1. SEQUENCE-TO-STRUCTURE PIPELINE: Resolve Real Coordinates
  useEffect(() => {
    if (!cleanSeq || cleanSeq.length < 4) {
      setStructure(null);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setLoadingPhase('Resolving biological coordinates...');

    const timer = setTimeout(async () => {
      try {
        const resolved = await resolveMacromolecularStructure({
          sequence: parsedInput.header ? `>${parsedInput.header}\n${cleanSeq}` : cleanSeq,
          originalSequence,
          sequenceType: normSeqType,
          accessionOrPdbId: accession,
          mutations,
          title: title || `${accession} 3D Structure`,
          onProgress: (p) => {
            if (!isCancelled) setLoadingPhase(p);
          }
        });

        if (!isCancelled) {
          setStructure(resolved);
          setIsLoading(false);
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('[Sequence3DViewer] Structure resolution error:', err);
          setIsLoading(false);
        }
      }
    }, 150);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [cleanSeq, parsedInput.header, originalSequence, normSeqType, accession, mutations, title]);

  // Helper: add bond cylinder
  const addBondCylinder = (
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number },
    center: [number, number, number],
    geo: THREE.CylinderGeometry,
    mat: THREE.Material,
    group: THREE.Group
  ) => {
    const v1 = new THREE.Vector3(p1.x - center[0], p1.y - center[1], p1.z - center[2]);
    const v2 = new THREE.Vector3(p2.x - center[0], p2.y - center[1], p2.z - center[2]);
    const dist = v1.distanceTo(v2);

    const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
    const orientation = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);

    orientation.lookAt(v1, v2, up);
    orientation.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(mid);
    mesh.scale.set(1, dist, 1);
    mesh.quaternion.setFromRotationMatrix(orientation);
    group.add(mesh);
  };

  const clearGroupResources = useCallback((rootGroup: THREE.Group) => {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();

    while (rootGroup.children.length > 0) {
      const obj = rootGroup.children[0];
      rootGroup.remove(obj);
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => materials.add(m));
          } else {
            materials.add(mesh.material);
          }
        }
      });
    }

    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  }, []);

  // Build Real Macromolecular 3D Geometry
  const buildGeometry = useCallback(() => {
    if (!sceneRef.current || !modelGroupRef.current) return;
    const rootGroup = modelGroupRef.current;

    clearGroupResources(rootGroup);

    if (!structure || !structure.allAtoms || structure.allAtoms.length === 0) return;

    const center = structure.boundingBox.center;
    const chains = structure.chains || [];
    const isNucleic = structure.macromoleculeType === 'DNA' || structure.macromoleculeType === 'RNA';

    // -------------------------------------------------------------
    // REPRESENTATION 1: ADVANCED BALL & STICK (Atomic Coordinates + Bonds)
    // -------------------------------------------------------------
    if (representation === 'ball_stick') {
      const atomSphereGeo = new THREE.SphereGeometry(0.48, 14, 14);
      const bondGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 8);
      const bondMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.35,
        metalness: 0.2
      });

      for (const chain of chains) {
        const residues = chain.residues;

        residues.forEach((res) => {
          const isResMutated = Boolean(res.isMutated);
          const isResSelected = controlledSelectedResSeq === res.resSeq || selectedAtom?.residue.resSeq === res.resSeq;

          // Render Individual Colored Atoms
          res.atoms.forEach((atom) => {
            if (Number.isFinite(atom.x) && Number.isFinite(atom.y) && Number.isFinite(atom.z)) {
              const elemKey = atom.element || atom.name.replace(/[0-9\s]/g, '')[0] || 'C';
              const cpkColor = CPK_COLORS[elemKey] || 0x94a3b8;

              const atomMat = new THREE.MeshStandardMaterial({
                color: isResSelected ? 0x38bdf8 : isResMutated ? 0xef4444 : cpkColor,
                roughness: 0.25,
                metalness: 0.15,
                emissive: isResMutated ? 0xdc2626 : isResSelected ? 0x0284c7 : 0x000000,
                emissiveIntensity: isResMutated ? 0.75 : isResSelected ? 0.6 : 0
              });

              const mesh = new THREE.Mesh(atomSphereGeo, atomMat);
              mesh.position.set(atom.x - center[0], atom.y - center[1], atom.z - center[2]);
              (mesh as any).userData = { atom, residue: res, chainId: chain.id };
              rootGroup.add(mesh);
            }
          });

          // Render Real Covalent Chemical Bonds within Residue (Distance-Based)
          const atoms = res.atoms;
          let addedCovalentBonds = false;
          if (atoms.length > 1) {
            for (let i = 0; i < atoms.length; i++) {
              for (let j = i + 1; j < atoms.length; j++) {
                const dist = calculateDistanceAngstrom(atoms[i], atoms[j]);
                const isDisulfide = atoms[i].element === 'S' && atoms[j].element === 'S' && dist <= 2.2;
                if ((dist >= 0.95 && dist <= 1.95) || isDisulfide) {
                  addBondCylinder(atoms[i], atoms[j], center, bondGeo, bondMat, rootGroup);
                  addedCovalentBonds = true;
                }
              }
            }
          }

          // Fallback backbone bonds if side-chains are not populated in coordinates
          if (!addedCovalentBonds) {
            if (isNucleic) {
              const pAtom = res.atoms.find(a => a.name === 'P');
              const c4Atom = res.atoms.find(a => a.name === "C4'");
              const baseAtom = res.atoms.find(a => a.name === 'N1' || a.name === 'N9');
              if (pAtom && c4Atom) addBondCylinder(pAtom, c4Atom, center, bondGeo, bondMat, rootGroup);
              if (c4Atom && baseAtom) addBondCylinder(c4Atom, baseAtom, center, bondGeo, bondMat, rootGroup);
            } else {
              if (res.n && res.ca) addBondCylinder(res.n, res.ca, center, bondGeo, bondMat, rootGroup);
              if (res.ca && res.c) addBondCylinder(res.ca, res.c, center, bondGeo, bondMat, rootGroup);
              if (res.c && res.o) addBondCylinder(res.c, res.o, center, bondGeo, bondMat, rootGroup);
            }
          }
        });

        // Inter-residue connectivity (Peptide bonds or phosphodiester bonds)
        if (isNucleic) {
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
          for (let i = 0; i < residues.length - 1; i++) {
            const curr = residues[i];
            const next = residues[i + 1];
            if (curr.c && next.n) {
              const dist = calculateDistanceAngstrom(curr.c, next.n);
              if (dist < 2.2) {
                addBondCylinder(curr.c, next.n, center, bondGeo, bondMat, rootGroup);
              }
            }
          }
        }
      }

      // Duplex Base Pairing in Ball & Stick
      if (isNucleic && chains.length >= 2) {
        const chainA = chains[0];
        const chainB = chains[1];
        const minLen = Math.min(chainA.residues.length, chainB.residues.length);
        const pairBondGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 8);
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

    // -------------------------------------------------------------
    // REPRESENTATION 2: CARTOON / RIBBON OR BACKBONE
    // -------------------------------------------------------------
    else if (representation === 'ribbon' || representation === 'backbone') {
      const radius = representation === 'ribbon' ? 0.65 : 0.28;

      for (const chain of chains) {
        const residues = chain.residues;
        const guidePoints: THREE.Vector3[] = [];

        for (const res of residues) {
          const guide = isNucleic
            ? (res.atoms.find(a => a.name === "C4'") || res.atoms.find(a => a.name === 'P') || res.ca)
            : (res.ca || res.atoms[0]);
          if (guide && Number.isFinite(guide.x)) {
            guidePoints.push(new THREE.Vector3(guide.x - center[0], guide.y - center[1], guide.z - center[2]));
          }
        }

        if (guidePoints.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(guidePoints, false, 'centripetal', 0.5);
          const tubeGeo = new THREE.TubeGeometry(curve, Math.max(16, guidePoints.length * 6), radius, 10, false);
          const tubeMat = new THREE.MeshStandardMaterial({
            color: isNucleic ? (chain.id === 'B' ? 0x0284c7 : 0x38bdf8) : 0xd946ef,
            roughness: 0.35,
            metalness: 0.15
          });
          const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
          rootGroup.add(tubeMesh);
        }

        // Mutation highlight markers
        const sphereGeo = new THREE.SphereGeometry(0.85, 14, 14);
        residues.forEach((res) => {
          if (res.isMutated && res.ca) {
            const mutMat = new THREE.MeshStandardMaterial({
              color: 0xef4444,
              emissive: 0xdc2626,
              emissiveIntensity: 0.8
            });
            const mutMesh = new THREE.Mesh(sphereGeo, mutMat);
            mutMesh.position.set(res.ca.x - center[0], res.ca.y - center[1], res.ca.z - center[2]);
            (mutMesh as any).userData = { residue: res };
            rootGroup.add(mutMesh);
          }
        });
      }
    }

    // -------------------------------------------------------------
    // REPRESENTATION 3: SPACE FILL (Van der Waals Spheres)
    // -------------------------------------------------------------
    else {
      const vdwGeo = new THREE.SphereGeometry(1.2, 14, 14);
      for (const chain of chains) {
        chain.residues.forEach((res) => {
          res.atoms.forEach((atom) => {
            if (Number.isFinite(atom.x)) {
              const elemKey = atom.element || 'C';
              const mat = new THREE.MeshStandardMaterial({
                color: res.isMutated ? 0xef4444 : (CPK_COLORS[elemKey] || 0x94a3b8),
                roughness: 0.35
              });
              const mesh = new THREE.Mesh(vdwGeo, mat);
              mesh.position.set(atom.x - center[0], atom.y - center[1], atom.z - center[2]);
              (mesh as any).userData = { atom, residue: res };
              rootGroup.add(mesh);
            }
          });
        });
      }
    }

    // Fit camera to bounding box whenever a new structure arrives
    if (cameraRef.current && lastFittedStructureRef.current !== structure) {
      lastFittedStructureRef.current = structure;
      const radius = Math.max(structure.boundingBox.radius, 15);
      const fov = cameraRef.current.fov * (Math.PI / 180);
      const targetDist = radius / Math.tan(fov / 2) * 1.35;
      cameraRef.current.position.set(0, 0, Math.max(targetDist, 25));
      cameraRef.current.lookAt(0, 0, 0);
    }
  }, [structure, representation, controlledSelectedResSeq, selectedAtom, clearGroupResources]);

  const buildGeometryRef = useRef(buildGeometry);
  buildGeometryRef.current = buildGeometry;

  // Setup Three.js WebGL Scene ONCE on mount inside an isolated empty host div
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const heightPx = container.clientHeight || 300;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true
      });
    } catch (err: any) {
      setWebglError(err?.message || 'WebGL initialization failed.');
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070d18); // Dark scientific visualization canvas
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 1000);
    camera.position.set(0, 0, 60);
    cameraRef.current = camera;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setSize(width, heightPx);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    rendererRef.current = renderer;

    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    if (renderer.domElement.parentNode !== container) {
      container.appendChild(renderer.domElement);
    }

    // Studio Environment Reflection via RoomEnvironment (skipped under software WebGL to avoid CPU stall)
    let envTarget: THREE.WebGLRenderTarget | null = null;
    if (!isSoftwareGl) {
      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const roomEnv = new RoomEnvironment();
        envTarget = pmrem.fromScene(roomEnv, 0.04);
        scene.environment = envTarget.texture;
        roomEnv.dispose();
        pmrem.dispose();
      } catch {}
    }

    // Scientific 3D Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(30, 45, 40);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.7);
    fillLight.position.set(-30, -20, -25);
    scene.add(fillLight);

    const group = new THREE.Group();
    group.rotation.set(0.12, 0.25, 0);
    modelGroupRef.current = group;
    scene.add(group);

    buildGeometryRef.current();

    // Render loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      if (autoRotateRef.current && modelGroupRef.current && !isDraggingRef.current) {
        modelGroupRef.current.rotation.y += 0.005;
      }

      renderer.render(scene, camera);
    };
    animate();

    // Mouse Controls
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !modelGroupRef.current) return;
      const deltaX = e.clientX - prevMouseRef.current.x;
      const deltaY = e.clientY - prevMouseRef.current.y;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };

      modelGroupRef.current.rotation.y += deltaX * 0.01;
      modelGroupRef.current.rotation.x += deltaY * 0.01;
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (!cameraRef.current) return;
      e.preventDefault();
      cameraRef.current.position.z += e.deltaY * 0.05;
      cameraRef.current.position.z = Math.max(8, Math.min(250, cameraRef.current.position.z));
    };

    const onClick = (e: MouseEvent) => {
      if (!container || !cameraRef.current || !modelGroupRef.current) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      mousePosRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mousePosRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mousePosRef.current, cameraRef.current);
      const hits = raycasterRef.current.intersectObjects(modelGroupRef.current.children, true);
      if (hits.length > 0) {
        const hit = hits[0].object as any;
        const res = hit.userData?.residue as Residue3D | undefined;
        const atom = (hit.userData?.atom || res?.atoms[0]) as AtomicCoordinate | undefined;
        if (res && atom) {
          setSelectedAtom({ atom, residue: res });
          onSelectResidueRef.current?.(res.resSeq, res.code1);
        }
      }
    };

    const domElement = renderer.domElement;
    let pinchDistance = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        prevMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        isDraggingRef.current = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchDistance = Math.hypot(dx, dy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isDraggingRef.current && modelGroupRef.current) {
        e.preventDefault();
        const deltaX = e.touches[0].clientX - prevMouseRef.current.x;
        const deltaY = e.touches[0].clientY - prevMouseRef.current.y;
        prevMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        modelGroupRef.current.rotation.y += deltaX * 0.01;
        modelGroupRef.current.rotation.x += deltaY * 0.01;
      } else if (e.touches.length === 2 && cameraRef.current) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (pinchDistance > 0) {
          const delta = pinchDistance - dist;
          cameraRef.current.position.z = Math.max(8, Math.min(250, cameraRef.current.position.z + delta * 0.15));
        }
        pinchDistance = dist;
      }
    };

    const onTouchEnd = () => {
      isDraggingRef.current = false;
      pinchDistance = 0;
    };

    domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    domElement.addEventListener('wheel', onWheel, { passive: false });
    domElement.addEventListener('click', onClick);
    domElement.addEventListener('touchstart', onTouchStart, { passive: true });
    domElement.addEventListener('touchmove', onTouchMove, { passive: false });
    domElement.addEventListener('touchend', onTouchEnd);

    let resizeRaf: number | null = null;
    let lastW = width;
    let lastH = heightPx;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        const h = Math.floor(entry.contentRect.height);
        if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) {
          lastW = w;
          lastH = h;
          if (resizeRaf) cancelAnimationFrame(resizeRaf);
          resizeRaf = requestAnimationFrame(() => {
            if (rendererRef.current && cameraRef.current) {
              cameraRef.current.aspect = w / h;
              cameraRef.current.updateProjectionMatrix();
              rendererRef.current.setSize(w, h, false);
            }
          });
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeObserver.disconnect();
      domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      domElement.removeEventListener('wheel', onWheel);
      domElement.removeEventListener('click', onClick);
      domElement.removeEventListener('touchstart', onTouchStart);
      domElement.removeEventListener('touchmove', onTouchMove);
      domElement.removeEventListener('touchend', onTouchEnd);
      if (modelGroupRef.current) {
        clearGroupResources(modelGroupRef.current);
      }
      envTarget?.dispose();
      renderer.dispose();
      if (domElement.parentNode === container) {
        container.removeChild(domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      modelGroupRef.current = null;
    };
  }, [clearGroupResources]);

  // Rebuild molecular geometry cleanly whenever structure or style changes
  useEffect(() => {
    buildGeometry();
  }, [buildGeometry]);

  const handleResetCamera = () => {
    if (cameraRef.current && modelGroupRef.current && structure) {
      modelGroupRef.current.rotation.set(0.12, 0.25, 0);
      const radius = Math.max(structure.boundingBox.radius, 15);
      const fov = cameraRef.current.fov * (Math.PI / 180);
      const targetDist = radius / Math.tan(fov / 2) * 1.35;
      cameraRef.current.position.set(0, 0, Math.max(targetDist, 25));
      cameraRef.current.lookAt(0, 0, 0);
    }
  };

  const handleZoom = (delta: number) => {
    if (cameraRef.current) {
      cameraRef.current.position.z = Math.max(6, Math.min(200, cameraRef.current.position.z + delta));
    }
  };

  const isStructureUnavailable = !isLoading && (!structure || structure.structureType === 'UNAVAILABLE' || (structure.allAtoms?.length ?? 0) === 0);

  const provenanceBadge = structure
    ? structure.structureType === 'EXPERIMENTAL'
      ? { label: `PDB: ${structure.sourceId || 'RCSB'} (${structure.resolutionText || 'Experimental'})`, color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' }
      : structure.structureType === 'PREDICTED'
      ? { label: `PREDICTED: ${structure.sourceId || structure.sourceName || 'AlphaFold / ESMFold'}`, color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' }
      : structure.structureType === 'PARTIAL'
      ? { label: `PARTIAL: ${structure.sourceId || 'RCSB'} (${structure.coverageInfo?.coveragePercent || 0}%)`, color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' }
      : { label: 'UNAVAILABLE', color: 'bg-slate-700/60 text-slate-300 border-slate-600' }
    : null;

  return (
    <div className={`relative flex flex-col rounded-2xl overflow-hidden bg-[#070d18] border border-[#1e293b] shadow-xl ${className}`}>
      {/* Top Header Information & Status */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#0b1528]/90 backdrop-blur-md border-b border-[#1e293b] text-xs font-mono z-10 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-sky-400" />
          <span className="font-bold text-white tracking-wide truncate max-w-[180px] sm:max-w-xs">
            {title || `${accession} (${normSeqType})`}
          </span>
          <span className="text-[10px] text-slate-400 hidden sm:inline">
            · {cleanSeq.length} {normSeqType === 'PROTEIN' ? 'aa' : 'bp'}
          </span>
        </div>

        {/* Provenance & Sync Status Badges */}
        <div className="flex items-center gap-2">
          {provenanceBadge && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${provenanceBadge.color}`}>
              {provenanceBadge.label}
            </span>
          )}
          {isLoading ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 bg-sky-500/20 text-sky-300 border border-sky-500/30">
              <RefreshCw className="w-3 h-3 animate-spin text-sky-400" />
              <span>Resolving</span>
            </span>
          ) : isStructureUnavailable ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>Unavailable</span>
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Check className="w-3 h-3 text-emerald-400" />
              <span>Verified</span>
            </span>
          )}
        </div>
      </div>

      {/* WebGL Canvas Viewport: isolated empty host div + sibling loading/error/unavailable overlays */}
      <div
        style={{ height }}
        className="w-full flex-1 min-h-[260px] relative select-none"
      >
        <div
          ref={mountRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />
        {isLoading && (
          <div className="absolute inset-0 bg-[#070d18]/80 flex flex-col items-center justify-center space-y-2 z-20 text-sky-400 font-mono text-xs pointer-events-none">
            <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
            <span>{loadingPhase}</span>
          </div>
        )}
        {isStructureUnavailable && !webglError && (
          <div className="absolute inset-0 bg-[#070d18]/92 flex flex-col items-center justify-center p-5 text-center z-20 text-slate-300 font-mono text-xs space-y-2">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            <p className="font-bold text-white">No Verified 3D Structure Available</p>
            <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
              {structure?.confidenceInfo?.description || 'No matching experimental RCSB PDB or AlphaFold DB coordinates were found for this sequence.'}
            </p>
          </div>
        )}
        {webglError && (
          <div className="absolute inset-0 bg-[#070d18] flex flex-col items-center justify-center p-4 text-center z-20 text-slate-300 font-mono text-xs">
            <AlertTriangle className="w-5 h-5 text-amber-400 mb-1.5" />
            <span>{webglError}</span>
          </div>
        )}
      </div>

      {/* Floating Selected Atom / Residue Inspector Pill */}
      {selectedAtom && (
        <div className="absolute top-12 left-2.5 sm:left-3 bg-[#0b1528]/95 border border-sky-500/50 rounded-xl p-2.5 text-xs font-mono text-white shadow-2xl backdrop-blur-md z-20 space-y-1 max-w-[calc(100%-1.25rem)] sm:max-w-xs">
          <div className="flex items-center justify-between gap-2 border-b border-slate-700 pb-1">
            <span className="text-sky-400 font-bold">Atom {selectedAtom.atom.name}</span>
            <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">Chain {selectedAtom.atom.chainId}</span>
          </div>
          <div className="text-[11px] text-slate-300">
            Residue: <strong className="text-white">{selectedAtom.residue.name} {selectedAtom.residue.resSeq}</strong> ({selectedAtom.residue.code1})
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            Coordinates: x={selectedAtom.atom.x.toFixed(2)}, y={selectedAtom.atom.y.toFixed(2)}, z={selectedAtom.atom.z.toFixed(2)}
          </div>
          {selectedAtom.residue.isMutated && (
            <div className="text-[10px] font-bold text-rose-400 bg-rose-500/20 px-1.5 py-0.5 rounded border border-rose-500/30">
              MUTATED RESIDUE
            </div>
          )}
        </div>
      )}

      {/* Bottom Floating Control Bar */}
      {showControls && (
        <div className="sm:absolute sm:bottom-2.5 sm:left-2.5 sm:right-2.5 flex items-center justify-between gap-2 p-1.5 sm:rounded-xl bg-[#0b1528]/90 backdrop-blur-md border-t sm:border border-[#1e293b] text-xs font-mono z-10 flex-wrap">
          {/* Representation Selector */}
          <div className="flex items-center gap-1 flex-wrap">
            {(['ball_stick', 'ribbon', 'backbone', 'space_fill'] as ViewerRepresentation[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRepresentation(mode)}
                className={`px-2 py-1 rounded text-[10px] uppercase font-semibold transition-all cursor-pointer ${
                  representation === mode
                    ? 'bg-sky-600 text-white shadow-xs font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {mode === 'ball_stick' ? 'Ball & Stick' : mode === 'space_fill' ? 'Space Fill' : mode}
              </button>
            ))}
          </div>

          {/* Interactive Tools: Rotate, Zoom, Center, Reset */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAutoRotate(!autoRotate)}
              className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                autoRotate ? 'bg-sky-500/20 text-sky-400' : 'text-slate-400 hover:text-white'
              }`}
              title={autoRotate ? 'Pause Rotation' : 'Auto Rotate'}
            >
              {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => handleZoom(-4)}
              className="p-1.5 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom(4)}
              className="p-1.5 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetCamera}
              className="p-1.5 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Reset View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
