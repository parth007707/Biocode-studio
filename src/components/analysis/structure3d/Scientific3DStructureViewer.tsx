import React, { useEffect, useRef, useState, useMemo } from 'react';
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
  onSelectResidue?: (resSeq: number) => void;
  selectedResSeq?: number | null;
  className?: string;
  enableControls?: boolean;
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
  onSelectResidue,
  selectedResSeq,
  className = '',
  enableControls = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [representation, setRepresentation] = useState<RepresentationMode>(initialRepresentation);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(initialColorScheme);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [slabClipping, setSlabClipping] = useState<number>(100); // 0 to 100%
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [pickedAtoms, setPickedAtoms] = useState<AtomicCoordinate[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementItem[]>([]);
  const [hoveredResidue, setHoveredResidue] = useState<Residue3D | null>(null);
  const [selectedResidueData, setSelectedResidueData] = useState<Residue3D | null>(null);
  const [copiedPdb, setCopiedPdb] = useState<boolean>(false);

  // Three.js Scene References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const macromoleculeGroupRef = useRef<THREE.Group | null>(null);
  const measurementGroupRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Raycasting & Interaction Refs
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const isDraggingRef = useRef<boolean>(false);
  const prevMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Get color for an atom / residue based on active scheme
  const getResidueColor = (res: Residue3D, totalResidues: number, atom?: AtomicCoordinate): number => {
    if (colorScheme === 'mutation_delta') {
      if (res.isMutated) return 0xfacc15; // Golden glowing mutation
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

    const chain = structure.chains[0];
    if (!chain || chain.residues.length === 0) return;

    const residues = chain.residues;
    const totalRes = residues.length;
    const center = structure.boundingBox.center;

    // 1. CARTOON / RIBBON REPRESENTATION (Smooth CatmullRom Spline Backbone)
    if (representation === 'ribbon' || representation === 'backbone_trace') {
      const backbonePoints: THREE.Vector3[] = [];
      const residueMapping: Residue3D[] = [];

      for (const res of residues) {
        const guideAtom = res.ca || res.atoms[0];
        if (guideAtom) {
          backbonePoints.push(
            new THREE.Vector3(
              guideAtom.x - center[0],
              guideAtom.y - center[1],
              guideAtom.z - center[2]
            )
          );
          residueMapping.push(res);
        }
      }

      if (backbonePoints.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(backbonePoints, false, 'catmullrom', 0.5);
        const tubularSegments = Math.max(30, backbonePoints.length * 8);
        const radius = representation === 'ribbon' ? 0.65 : 0.22;
        const radialSegments = representation === 'ribbon' ? 12 : 6;

        const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);

        // Vertex Coloring for Tube
        const count = tubeGeo.attributes.position.count;
        const colors = new Float32Array(count * 3);
        const col = new THREE.Color();

        for (let i = 0; i < count; i++) {
          const t = i / count;
          const resIdx = Math.min(totalRes - 1, Math.floor(t * totalRes));
          const res = residues[resIdx];
          const hex = getResidueColor(res, totalRes);
          col.setHex(hex);
          colors[i * 3] = col.r;
          colors[i * 3 + 1] = col.g;
          colors[i * 3 + 2] = col.b;
        }

        tubeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const tubeMat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.35,
          metalness: 0.15,
          side: THREE.DoubleSide
        });

        const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
        tubeMesh.castShadow = true;
        tubeMesh.receiveShadow = true;
        rootGroup.add(tubeMesh);
      }

      // Add mutation highlight rings
      const sphereGeo = new THREE.SphereGeometry(0.85, 16, 16);
      residues.forEach((res) => {
        if (res.isMutated && res.ca) {
          const mutColor = new THREE.Color(0xfacc15);
          const mutMat = new THREE.MeshStandardMaterial({
            color: mutColor,
            emissive: 0xf59e0b,
            emissiveIntensity: 0.6,
            roughness: 0.2
          });
          const mutMesh = new THREE.Mesh(sphereGeo, mutMat);
          mutMesh.position.set(res.ca.x - center[0], res.ca.y - center[1], res.ca.z - center[2]);
          (mutMesh as any).userData = { residue: res };
          rootGroup.add(mutMesh);
        }
      });
    }

    // 2. BALL AND STICK (Atomic precision)
    if (representation === 'ball_and_stick') {
      const atomSphereGeo = new THREE.SphereGeometry(0.45, 14, 14);
      const bondGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 8);
      const bondMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4 });

      // Render Atoms
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
          const mesh = new THREE.Mesh(atomSphereGeo, atomMat);
          mesh.position.set(atom.x - center[0], atom.y - center[1], atom.z - center[2]);
          (mesh as any).userData = { atom, residue: res };
          rootGroup.add(mesh);
        });

        // Backbone Intra-Residue Bonds (N -> CA -> C -> O)
        if (res.n && res.ca) addBondCylinder(res.n, res.ca, center, bondGeo, bondMat, rootGroup);
        if (res.ca && res.c) addBondCylinder(res.ca, res.c, center, bondGeo, bondMat, rootGroup);
        if (res.c && res.o) addBondCylinder(res.c, res.o, center, bondGeo, bondMat, rootGroup);
      });

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

    // 3. SPACE FILLING (Full Van der Waals CPK spheres)
    if (representation === 'space_fill' || representation === 'surface') {
      const vdwSphereGeo = new THREE.SphereGeometry(1.25, 14, 14);

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

    // Add Disulfide Bridges
    if (structure.disulfideBonds.length > 0) {
      const ssBondMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xeab308, emissiveIntensity: 0.5 });
      const ssBondGeo = new THREE.CylinderGeometry(0.2, 0.2, 1, 8);

      structure.disulfideBonds.forEach((ss) => {
        const r1 = residues.find((r) => r.resSeq === ss.res1);
        const r2 = residues.find((r) => r.resSeq === ss.res2);
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

  // Setup Three.js WebGL Renderer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090d);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    const radius = structure.boundingBox.radius || 25;
    camera.position.set(0, 0, Math.max(35, radius * 2.4));
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

    // Studio 3-Point Biological Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(30, 45, 40);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
    fillLight.position.set(-35, -20, -25);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xa855f7, 0.7);
    rimLight.position.set(0, -40, 20);
    scene.add(rimLight);

    // Measurement Line Group
    const measGroup = new THREE.Group();
    measurementGroupRef.current = measGroup;
    scene.add(measGroup);

    // Build the initial macromolecular geometry
    buildStructureGeometry();

    // Render Animation Loop
    let rot = 0;
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      if (autoRotate && macromoleculeGroupRef.current) {
        macromoleculeGroupRef.current.rotation.y += 0.005;
        if (measurementGroupRef.current) {
          measurementGroupRef.current.rotation.y = macromoleculeGroupRef.current.rotation.y;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      renderer.dispose();
    };
  }, [structure]);

  // Re-render geometry when visualization controls change
  useEffect(() => {
    buildStructureGeometry();
  }, [representation, colorScheme]);

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

      if (e.buttons === 1) {
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
    if (!cameraRef.current || !macromoleculeGroupRef.current) return;
    const radius = structure.boundingBox.radius || 25;
    cameraRef.current.position.set(0, 0, Math.max(35, radius * 2.4));
    macromoleculeGroupRef.current.rotation.set(0, 0, 0);
    macromoleculeGroupRef.current.position.set(0, 0, 0);
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
        onContextMenu={(e) => e.preventDefault()}
        className="flex-1 w-full min-h-[420px] cursor-grab active:cursor-grabbing relative"
      />

      {/* Hover & Active Selection Diagnostics Floating Card */}
      {(hoveredResidue || selectedResidueData) && (
        <div className="absolute bottom-4 left-4 max-w-sm bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 text-xs font-mono text-slate-200 shadow-2xl z-20 space-y-1.5 pointer-events-none">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-white text-sm">
              {(hoveredResidue || selectedResidueData)?.name} #{(hoveredResidue || selectedResidueData)?.resSeq} (Chain {(hoveredResidue || selectedResidueData)?.chainId})
            </span>
            {(hoveredResidue || selectedResidueData)?.isMutated && (
              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                {(hoveredResidue || selectedResidueData)?.mutationLabel || 'MUTATION'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400">
            <div>
              Conformation: <strong className="text-slate-200 capitalize">{(hoveredResidue || selectedResidueData)?.secondaryStructure || 'Loop'}</strong>
            </div>
            <div>
              pLDDT / B-Factor: <strong className="text-emerald-400">{(hoveredResidue || selectedResidueData)?.pLddt ?? (hoveredResidue || selectedResidueData)?.bFactorAvg}</strong>
            </div>
            {(hoveredResidue || selectedResidueData)?.phi !== undefined && (
              <div>
                Φ: <strong className="text-purple-300">{(hoveredResidue || selectedResidueData)?.phi}°</strong>
              </div>
            )}
            {(hoveredResidue || selectedResidueData)?.psi !== undefined && (
              <div>
                Ψ: <strong className="text-purple-300">{(hoveredResidue || selectedResidueData)?.psi}°</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Color Scheme Guide Legend */}
      <div className="bg-[#0B0F17]/80 backdrop-blur-xs border-t border-slate-800/80 px-4 py-2 flex items-center justify-between flex-wrap gap-2 text-[11px] font-mono text-slate-400 z-10">
        <div className="flex items-center gap-3">
          <span className="text-slate-500 uppercase font-bold text-[10px]">Active Legend:</span>
          {colorScheme === 'secondary_structure' && (
            <>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-fuchsia-500" /> α-Helix</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> β-Sheet</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-cyan-400" /> Loop / Coil</span>
            </>
          )}
          {colorScheme === 'mutation_delta' && (
            <>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" /> Modified Residue</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-600" /> Unaltered Scaffold</span>
            </>
          )}
          {colorScheme === 'plddt_bfactor' && (
            <>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-700" /> &gt;90 (Very High)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-400" /> 70-90 (Confident)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-400" /> 50-70 (Low)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> &lt;50 (Very Low)</span>
            </>
          )}
        </div>

        <div className="text-[10px] text-slate-500">
          Left-Click: Rotate | Right-Click: Pan | Scroll: Zoom | Click: Inspect
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
