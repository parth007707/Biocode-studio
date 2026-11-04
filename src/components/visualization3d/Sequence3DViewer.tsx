import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { RotateCcw, Play, Pause, ZoomIn, ZoomOut, Layers, Sparkles, Info, Check, RefreshCw } from 'lucide-react';
import { SequenceType } from '../../lib/bio/types';
import { SequenceMutation } from '../../lib/bio/editor/types';
import { ViewerRepresentation, ViewerColorScheme } from './types';

interface Sequence3DViewerProps {
  sequence: string;
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

// Biological Color Palettes
const AMINO_ACID_PROPERTIES: Record<string, { type: 'hydrophobic' | 'polar' | 'basic' | 'acidic' | 'special'; color: number; charge: number; hydropathy: number }> = {
  A: { type: 'hydrophobic', color: 0xf97316, charge: 0, hydropathy: 1.8 },
  V: { type: 'hydrophobic', color: 0xf97316, charge: 0, hydropathy: 4.2 },
  I: { type: 'hydrophobic', color: 0xea580c, charge: 0, hydropathy: 4.5 },
  L: { type: 'hydrophobic', color: 0xea580c, charge: 0, hydropathy: 3.8 },
  M: { type: 'hydrophobic', color: 0xf59e0b, charge: 0, hydropathy: 1.9 },
  F: { type: 'hydrophobic', color: 0xd97706, charge: 0, hydropathy: 2.8 },
  W: { type: 'hydrophobic', color: 0xb45309, charge: 0, hydropathy: -0.9 },
  P: { type: 'special', color: 0xfb923c, charge: 0, hydropathy: -1.6 },
  S: { type: 'polar', color: 0x06b6d4, charge: 0, hydropathy: -0.8 },
  T: { type: 'polar', color: 0x0891b2, charge: 0, hydropathy: -0.7 },
  C: { type: 'special', color: 0x14b8a6, charge: 0, hydropathy: 2.5 },
  Y: { type: 'polar', color: 0x0d9488, charge: 0, hydropathy: -1.3 },
  N: { type: 'polar', color: 0x22d3ee, charge: 0, hydropathy: -3.5 },
  Q: { type: 'polar', color: 0x67e8f9, charge: 0, hydropathy: -3.5 },
  K: { type: 'basic', color: 0x3b82f6, charge: 1, hydropathy: -3.9 },
  R: { type: 'basic', color: 0x2563eb, charge: 1, hydropathy: -4.5 },
  H: { type: 'basic', color: 0x6366f1, charge: 0.5, hydropathy: -3.2 },
  D: { type: 'acidic', color: 0xef4444, charge: -1, hydropathy: -3.5 },
  E: { type: 'acidic', color: 0xdc2626, charge: -1, hydropathy: -3.5 },
  G: { type: 'special', color: 0x64748b, charge: 0, hydropathy: -0.4 },
};

const BASE_COLORS: Record<string, number> = {
  A: 0x16a34a, // Adenine - Emerald Green
  T: 0xec4899, // Thymine - Pink
  U: 0xd946ef, // Uracil - Magenta
  G: 0xf97316, // Guanine - Orange
  C: 0x0284c7, // Cytosine - Sky Blue
};

export const Sequence3DViewer: React.FC<Sequence3DViewerProps> = ({
  sequence,
  sequenceType = 'PROTEIN',
  accession = 'Sequence',
  mutations = [],
  selectedResSeq = null,
  onSelectResidue,
  initialRepresentation = 'ribbon',
  initialColorScheme = 'secondary_structure',
  syncStatus = 'SYNCED',
  showControls = true,
  className = '',
  height = '100%',
  title
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [representation, setRepresentation] = useState<ViewerRepresentation>(initialRepresentation);
  const [colorScheme, setColorScheme] = useState<ViewerColorScheme>(initialColorScheme);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [hoveredResidue, setHoveredResidue] = useState<{ index: number; char: string; position: number } | null>(null);

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

  // Clean biological sequence
  const cleanSeq = useMemo(() => sequence.toUpperCase().replace(/[^A-Z]/g, ''), [sequence]);
  const isProtein = String(sequenceType).toUpperCase().includes('PROT');
  const isRNA = String(sequenceType).toUpperCase().includes('RNA');
  const isDNA = !isProtein && !isRNA;

  // Mutation mapping
  const mutationMap = useMemo(() => {
    const map = new Map<number, SequenceMutation>();
    mutations.forEach(m => map.set(m.position, m));
    return map;
  }, [mutations]);

  // Build Procedural 3D Geometry strictly based on sequence residues
  const buildGeometry = useCallback(() => {
    if (!sceneRef.current || !modelGroupRef.current) return;

    // Clear previous objects
    while (modelGroupRef.current.children.length > 0) {
      const obj = modelGroupRef.current.children[0];
      modelGroupRef.current.remove(obj);
      if ((obj as any).geometry) (obj as any).geometry.dispose();
      if ((obj as any).material) {
        if (Array.isArray((obj as any).material)) {
          (obj as any).material.forEach((m: THREE.Material) => m.dispose());
        } else {
          (obj as any).material.dispose();
        }
      }
    }

    if (!cleanSeq || cleanSeq.length === 0) return;

    // LOD Sampling: for large sequences (>300 residues), sample to prevent UI thread lag
    const maxRenderResidues = 280;
    const step = cleanSeq.length > maxRenderResidues ? Math.ceil(cleanSeq.length / maxRenderResidues) : 1;
    const sampledResidues: { char: string; originalIndex: number }[] = [];
    for (let i = 0; i < cleanSeq.length; i += step) {
      sampledResidues.push({ char: cleanSeq[i], originalIndex: i });
    }

    const count = sampledResidues.length;

    if (isDNA) {
      // -------------------------------------------------------------
      // DNA DOUBLE HELIX GENERATION
      // -------------------------------------------------------------
      const radius = 3.2;
      const pitch = 0.85; // Rise per base pair
      const angleStep = 0.62; // ~10.5 base pairs per turn (B-DNA)
      const minorGrooveOffset = 2.4; // Phase shift

      const strand1Points: THREE.Vector3[] = [];
      const strand2Points: THREE.Vector3[] = [];

      sampledResidues.forEach((item, i) => {
        const theta1 = i * angleStep;
        const theta2 = theta1 + minorGrooveOffset;
        const y = (i - count / 2) * pitch;

        const p1 = new THREE.Vector3(Math.cos(theta1) * radius, y, Math.sin(theta1) * radius);
        const p2 = new THREE.Vector3(Math.cos(theta2) * radius, y, Math.sin(theta2) * radius);

        strand1Points.push(p1);
        strand2Points.push(p2);

        // Base-pair rung connecting Strand 1 and Strand 2
        const baseChar = item.char;
        const compBase = baseChar === 'A' ? 'T' : baseChar === 'T' ? 'A' : baseChar === 'G' ? 'C' : 'G';
        const isMutated = mutationMap.has(item.originalIndex + 1);

        const color1 = isMutated ? 0xef4444 : (BASE_COLORS[baseChar] || 0x0284c7);
        const color2 = isMutated ? 0xef4444 : (BASE_COLORS[compBase] || 0xec4899);

        // Midpoint
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

        // Cylinder rung half 1
        const dir1 = new THREE.Vector3().subVectors(mid, p1);
        const len1 = dir1.length();
        const rungGeom1 = new THREE.CylinderGeometry(0.18, 0.18, len1, 8);
        rungGeom1.translate(0, len1 / 2, 0);
        rungGeom1.rotateX(Math.PI / 2);
        const rungMesh1 = new THREE.Mesh(
          rungGeom1,
          new THREE.MeshStandardMaterial({
            color: color1,
            roughness: 0.3,
            metalness: 0.2,
            emissive: isMutated ? 0xef4444 : 0x000000,
            emissiveIntensity: isMutated ? 0.4 : 0
          })
        );
        rungMesh1.position.copy(p1);
        rungMesh1.lookAt(mid);
        (rungMesh1 as any).userData = { index: item.originalIndex, char: baseChar, position: item.originalIndex + 1 };
        modelGroupRef.current?.add(rungMesh1);

        // Node on backbone
        const sphereGeom = new THREE.SphereGeometry(representation === 'space_fill' ? 0.75 : 0.35, 12, 12);
        const node1 = new THREE.Mesh(sphereGeom, new THREE.MeshStandardMaterial({ color: color1, roughness: 0.2 }));
        node1.position.copy(p1);
        (node1 as any).userData = { index: item.originalIndex, char: baseChar, position: item.originalIndex + 1 };
        modelGroupRef.current?.add(node1);

        const node2 = new THREE.Mesh(sphereGeom, new THREE.MeshStandardMaterial({ color: color2, roughness: 0.2 }));
        node2.position.copy(p2);
        modelGroupRef.current?.add(node2);
      });

      // Sugar-phosphate backbone continuous tubes
      if (strand1Points.length > 2) {
        const curve1 = new THREE.CatmullRomCurve3(strand1Points);
        const tubeGeom1 = new THREE.TubeGeometry(curve1, count * 2, representation === 'ribbon' ? 0.32 : 0.16, 8, false);
        const tubeMat1 = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3, metalness: 0.3 });
        const tubeMesh1 = new THREE.Mesh(tubeGeom1, tubeMat1);
        modelGroupRef.current?.add(tubeMesh1);

        const curve2 = new THREE.CatmullRomCurve3(strand2Points);
        const tubeGeom2 = new THREE.TubeGeometry(curve2, count * 2, representation === 'ribbon' ? 0.32 : 0.16, 8, false);
        const tubeMat2 = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.3, metalness: 0.3 });
        const tubeMesh2 = new THREE.Mesh(tubeGeom2, tubeMat2);
        modelGroupRef.current?.add(tubeMesh2);
      }

    } else if (isRNA) {
      // -------------------------------------------------------------
      // RNA SINGLE-STRAND FOLDING & HAIRPIN GENERATION
      // -------------------------------------------------------------
      const rnaPoints: THREE.Vector3[] = [];
      const loopRadius = 4.0;

      sampledResidues.forEach((item, i) => {
        // Curve representing secondary folding / stem-loop architecture
        const t = (i / count) * Math.PI * 4;
        const r = loopRadius * (0.8 + 0.3 * Math.sin(t * 0.5));
        const x = Math.sin(t) * r;
        const y = (i - count / 2) * 0.45;
        const z = Math.cos(t) * (r * 0.6) + Math.sin(t * 2) * 1.5;

        const pos = new THREE.Vector3(x, y, z);
        rnaPoints.push(pos);

        const isMutated = mutationMap.has(item.originalIndex + 1);
        const col = isMutated ? 0xef4444 : (BASE_COLORS[item.char] || 0xd946ef);

        const sphereSize = representation === 'space_fill' ? 0.65 : 0.32;
        const nucleotideMesh = new THREE.Mesh(
          new THREE.SphereGeometry(sphereSize, 12, 12),
          new THREE.MeshStandardMaterial({
            color: col,
            roughness: 0.25,
            emissive: isMutated ? 0xef4444 : 0x000000,
            emissiveIntensity: isMutated ? 0.5 : 0
          })
        );
        nucleotideMesh.position.copy(pos);
        (nucleotideMesh as any).userData = { index: item.originalIndex, char: item.char, position: item.originalIndex + 1 };
        modelGroupRef.current?.add(nucleotideMesh);
      });

      if (rnaPoints.length > 2) {
        const curve = new THREE.CatmullRomCurve3(rnaPoints);
        const rnaTube = new THREE.Mesh(
          new THREE.TubeGeometry(curve, count * 2, representation === 'ribbon' ? 0.28 : 0.14, 8, false),
          new THREE.MeshStandardMaterial({ color: 0xd946ef, roughness: 0.3, metalness: 0.2 })
        );
        modelGroupRef.current?.add(rnaTube);
      }

    } else {
      // -------------------------------------------------------------
      // PROTEIN ALPHA-HELIX / BETA-SHEET BACKBONE & SIDECHAINS
      // -------------------------------------------------------------
      const backbonePoints: THREE.Vector3[] = [];
      const helixRadius = 2.4;
      const helixPitch = 0.55;
      const residuesPerTurn = 3.6; // Alpha helix standard

      sampledResidues.forEach((item, i) => {
        const theta = (i / residuesPerTurn) * Math.PI * 2;
        // Secondary structure modulation based on sequence index
        const isSheetRegion = (Math.floor(i / 14) % 2 === 1);
        
        let x = 0;
        let y = 0;
        let z = 0;

        if (isSheetRegion) {
          // Extended beta-strand zigzag
          const wave = (i % 2 === 0 ? 1 : -1) * 0.9;
          x = (i - count / 2) * 0.9;
          y = wave;
          z = Math.sin(i * 0.4) * 1.5;
        } else {
          // Alpha helix cylinder
          x = Math.cos(theta) * helixRadius;
          y = (i - count / 2) * helixPitch;
          z = Math.sin(theta) * helixRadius;
        }

        const pos = new THREE.Vector3(x, y, z);
        backbonePoints.push(pos);

        // Color determination based on scheme
        const aaInfo = AMINO_ACID_PROPERTIES[item.char] || { type: 'special', color: 0x64748b, charge: 0, hydropathy: 0 };
        const isMutated = mutationMap.has(item.originalIndex + 1);

        let resColor = aaInfo.color;
        if (isMutated) {
          resColor = 0xef4444; // Vibrant Red for mutated residues
        } else if (colorScheme === 'secondary_structure') {
          resColor = isSheetRegion ? 0xfacc15 : 0xd946ef; // Yellow sheet vs Magenta helix
        } else if (colorScheme === 'hydrophobicity') {
          resColor = aaInfo.hydropathy > 0 ? 0xf97316 : 0x0284c7; // Orange hydrophobic vs Sky Blue hydrophilic
        } else if (colorScheme === 'charge') {
          resColor = aaInfo.charge > 0 ? 0x2563eb : aaInfo.charge < 0 ? 0xdc2626 : 0xf8fafc;
        } else if (colorScheme === 'rainbow') {
          const hue = (i / count);
          const colorObj = new THREE.Color().setHSL(hue, 0.8, 0.5);
          resColor = colorObj.getHex();
        }

        // C-Alpha atom or spacefill sphere
        const sphereRad = representation === 'space_fill' ? 0.75 : representation === 'ball_stick' ? 0.4 : 0.28;
        const resMesh = new THREE.Mesh(
          new THREE.SphereGeometry(sphereRad, 12, 12),
          new THREE.MeshStandardMaterial({
            color: resColor,
            roughness: 0.3,
            metalness: 0.2,
            emissive: isMutated ? 0xef4444 : 0x000000,
            emissiveIntensity: isMutated ? 0.6 : 0
          })
        );
        resMesh.position.copy(pos);
        (resMesh as any).userData = { index: item.originalIndex, char: item.char, position: item.originalIndex + 1, isMutated };
        modelGroupRef.current?.add(resMesh);

        // If ball & stick: add protruding sidechain stub
        if (representation === 'ball_stick') {
          const sidechainDir = new THREE.Vector3(x, 0, z).normalize().multiplyScalar(0.9);
          const scPos = new THREE.Vector3().addVectors(pos, sidechainDir);

          const bondGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6);
          bondGeom.translate(0, 0.45, 0);
          bondGeom.rotateX(Math.PI / 2);
          const bondMesh = new THREE.Mesh(
            bondGeom,
            new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4 })
          );
          bondMesh.position.copy(pos);
          bondMesh.lookAt(scPos);
          modelGroupRef.current?.add(bondMesh);

          const scAtom = new THREE.Mesh(
            new THREE.SphereGeometry(0.24, 8, 8),
            new THREE.MeshStandardMaterial({ color: resColor, roughness: 0.3 })
          );
          scAtom.position.copy(scPos);
          modelGroupRef.current?.add(scAtom);
        }
      });

      // Continuous C-alpha peptide backbone ribbon
      if (backbonePoints.length > 2 && (representation === 'ribbon' || representation === 'backbone')) {
        const curve = new THREE.CatmullRomCurve3(backbonePoints);
        const tubeRadius = representation === 'ribbon' ? 0.28 : 0.12;
        const ribbonGeom = new THREE.TubeGeometry(curve, count * 2, tubeRadius, 8, false);
        const ribbonMat = new THREE.MeshStandardMaterial({
          color: colorScheme === 'secondary_structure' ? 0x0ea5e9 : 0x64748b,
          roughness: 0.35,
          metalness: 0.25
        });
        const ribbonMesh = new THREE.Mesh(ribbonGeom, ribbonMat);
        modelGroupRef.current?.add(ribbonMesh);
      }
    }

    // Auto-fit camera distance based on sequence length
    if (cameraRef.current) {
      const box = new THREE.Box3().setFromObject(modelGroupRef.current);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 10);
      cameraRef.current.position.set(0, 0, maxDim * 1.6);
      cameraRef.current.lookAt(0, 0, 0);
    }
  }, [cleanSeq, isDNA, isRNA, isProtein, representation, colorScheme, mutationMap]);

  // Setup Three.js Scene, Camera, Renderer
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const heightPx = container.clientHeight || 280;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 1000);
    camera.position.set(0, 0, 24);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setSize(width, heightPx);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Model Root Group
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(15, 20, 25);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
    fillLight.position.set(-15, -10, -10);
    scene.add(fillLight);

    // Mouse Controls (Rotate, Zoom, Pan)
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      // Raycasting for residue hover
      const rect = renderer.domElement.getBoundingClientRect();
      mousePosRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mousePosRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mousePosRef.current, camera);
      if (modelGroupRef.current) {
        const intersects = raycasterRef.current.intersectObjects(modelGroupRef.current.children);
        if (intersects.length > 0 && (intersects[0].object as any).userData?.char) {
          setHoveredResidue((intersects[0].object as any).userData);
        } else {
          setHoveredResidue(null);
        }
      }

      if (!isDraggingRef.current || !modelGroupRef.current) return;
      const deltaX = e.clientX - prevMouseRef.current.x;
      const deltaY = e.clientY - prevMouseRef.current.y;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };

      modelGroupRef.current.rotation.y += deltaX * 0.008;
      modelGroupRef.current.rotation.x += deltaY * 0.008;
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current) return;
      cameraRef.current.position.z += e.deltaY * 0.03;
      cameraRef.current.position.z = Math.max(5, Math.min(120, cameraRef.current.position.z));
    };

    const onClick = () => {
      if (hoveredResidue && onSelectResidue) {
        onSelectResidue(hoveredResidue.position, hoveredResidue.char);
      }
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    domElement.addEventListener('wheel', onWheel, { passive: false });
    domElement.addEventListener('click', onClick);

    // Resize Observer
    let resizeRafId: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(() => {
        if (!container || !rendererRef.current || !cameraRef.current) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
          cameraRef.current.aspect = w / h;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(w, h);
        }
      });
    });
    resizeObserver.observe(container);

    // Animation Loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      if (modelGroupRef.current && autoRotate && !isDraggingRef.current) {
        modelGroupRef.current.rotation.y += 0.004;
      }
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    return () => {
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      resizeObserver.disconnect();
      domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      domElement.removeEventListener('wheel', onWheel);
      domElement.removeEventListener('click', onClick);
      renderer.dispose();
      if (container.contains(domElement)) {
        container.removeChild(domElement);
      }
    };
  }, [autoRotate, hoveredResidue, onSelectResidue]);

  // Re-build geometry when sequence, representation, or colorScheme changes
  useEffect(() => {
    buildGeometry();
  }, [buildGeometry]);

  const handleResetCamera = () => {
    if (cameraRef.current && modelGroupRef.current) {
      modelGroupRef.current.rotation.set(0, 0, 0);
      const box = new THREE.Box3().setFromObject(modelGroupRef.current);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 10);
      cameraRef.current.position.set(0, 0, maxDim * 1.6);
      cameraRef.current.lookAt(0, 0, 0);
    }
  };

  const handleZoom = (delta: number) => {
    if (cameraRef.current) {
      cameraRef.current.position.z = Math.max(6, Math.min(100, cameraRef.current.position.z + delta));
    }
  };

  return (
    <div className={`relative flex flex-col rounded-2xl overflow-hidden bg-gradient-to-b from-[#0B1528] to-[#060D1A] border border-[#1E3A5F] shadow-lg ${className}`}>
      {/* Top Header Information & Status */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#0B1B31]/90 backdrop-blur-md border-b border-[#1E3A5F] text-xs font-mono z-10">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#38BDF8] animate-pulse" />
          <span className="font-bold text-white tracking-wide truncate max-w-[160px] sm:max-w-xs">
            {title || `${accession} (${isProtein ? 'Protein' : isRNA ? 'RNA' : 'DNA'})`}
          </span>
          <span className="text-[10px] text-[#94A3B8] hidden md:inline">
            · {cleanSeq.length} {isProtein ? 'aa' : 'bp'}
          </span>
        </div>

        {/* Sync Status Badge */}
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
            syncStatus === 'SYNCED'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : syncStatus === 'UPDATING'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
              : 'bg-slate-800 text-slate-300 border border-slate-700'
          }`}>
            {syncStatus === 'SYNCED' ? <Check className="w-3 h-3 text-emerald-400" /> : <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />}
            <span>{syncStatus === 'SYNCED' ? 'STRUCTURE: Synced' : syncStatus === 'UPDATING' ? 'Updating...' : syncStatus}</span>
          </span>
        </div>
      </div>

      {/* WebGL Canvas Viewport */}
      <div 
        ref={mountRef} 
        style={{ height }}
        className="w-full flex-1 min-h-[220px] relative cursor-grab active:cursor-grabbing select-none"
      />

      {/* Floating Hover Tooltip */}
      {hoveredResidue && (
        <div className="absolute top-12 left-4 pointer-events-none bg-[#071426]/90 border border-[#38BDF8]/40 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white shadow-xl backdrop-blur-md z-20 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#38BDF8]" />
          <span>Pos {hoveredResidue.position}: <strong className="text-[#38BDF8]">{hoveredResidue.char}</strong></span>
          {mutationMap.has(hoveredResidue.position) && (
            <span className="text-[10px] text-red-400 font-bold bg-red-500/20 px-1 rounded">MUTATED</span>
          )}
        </div>
      )}

      {/* Bottom Floating Control Bar */}
      {showControls && (
        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 p-1.5 rounded-xl bg-[#0B1B31]/80 backdrop-blur-md border border-[#1E3A5F] text-xs font-mono z-10">
          {/* Representation Selector */}
          <div className="flex items-center gap-1">
            {(['ribbon', 'backbone', 'ball_stick', 'space_fill'] as ViewerRepresentation[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRepresentation(mode)}
                className={`px-2 py-1 rounded text-[10px] uppercase font-semibold transition-all cursor-pointer ${
                  representation === mode
                    ? 'bg-[#0284C7] text-white shadow-xs'
                    : 'text-[#94A3B8] hover:text-white hover:bg-white/5'
                }`}
              >
                {mode === 'ball_stick' ? 'Ball&Stick' : mode === 'space_fill' ? 'SpaceFill' : mode}
              </button>
            ))}
          </div>

          {/* Interactive Tools */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAutoRotate(!autoRotate)}
              className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                autoRotate ? 'bg-[#0284C7]/20 text-[#38BDF8]' : 'text-[#94A3B8] hover:text-white'
              }`}
              title={autoRotate ? 'Pause Rotation' : 'Auto Rotate'}
            >
              {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => handleZoom(-3)}
              className="p-1.5 rounded text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom(3)}
              className="p-1.5 rounded text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetCamera}
              className="p-1.5 rounded text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
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
