import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { SequenceMutation } from '../../lib/bio/editor/types';
import { AlertCircle, ArrowRightLeft, Camera, Check, Compass, GitCommit, Info, RotateCcw, Sparkles } from 'lucide-react';

interface Mutation3DViewerProps {
  wildTypeSequence: string;
  mutantSequence: string;
  mutations: SequenceMutation[];
  selectedMutation?: SequenceMutation | null;
  onSelectMutation?: (m: SequenceMutation) => void;
  className?: string;
  height?: number | string;
}

const AMINO_ACID_NAMES: Record<string, string> = {
  A: 'Alanine (Ala)', R: 'Arginine (Arg)', N: 'Asparagine (Asn)', D: 'Aspartic Acid (Asp)', C: 'Cysteine (Cys)',
  Q: 'Glutamine (Gln)', E: 'Glutamic Acid (Glu)', G: 'Glycine (Gly)', H: 'Histidine (His)', I: 'Isoleucine (Ile)',
  L: 'Leucine (Leu)', K: 'Lysine (Lys)', M: 'Methionine (Met)', F: 'Phenylalanine (Phe)', P: 'Proline (Pro)',
  S: 'Serine (Ser)', T: 'Threonine (Thr)', W: 'Tryptophan (Trp)', Y: 'Tyrosine (Tyr)', V: 'Valine (Val)'
};

export const Mutation3DViewer: React.FC<Mutation3DViewerProps> = ({
  wildTypeSequence,
  mutantSequence,
  mutations,
  selectedMutation,
  onSelectMutation,
  className = '',
  height = 360
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [activeMutation, setActiveMutation] = useState<SequenceMutation | null>(
    selectedMutation || (mutations && mutations.length > 0 ? mutations[0] : null)
  );
  const [viewState, setViewState] = useState<'MUTANT' | 'WILD_TYPE'>('MUTANT');

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mutationTargetPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    if (selectedMutation) {
      setActiveMutation(selectedMutation);
    }
  }, [selectedMutation]);

  const activeSeq = useMemo(() => {
    return viewState === 'WILD_TYPE' ? wildTypeSequence : mutantSequence;
  }, [viewState, wildTypeSequence, mutantSequence]);

  const cleanSeq = useMemo(() => activeSeq.toUpperCase().replace(/[^A-Z]/g, ''), [activeSeq]);

  // Build Procedural 3D structure highlighting mutation site
  const buildMutationStructure = useCallback(() => {
    if (!modelGroupRef.current) return;

    // Clear previous
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

    if (!cleanSeq) return;

    const count = Math.min(cleanSeq.length, 240);
    const backbonePoints: THREE.Vector3[] = [];
    const helixRadius = 3.0;
    const pitch = 0.6;
    const turn = 3.6;

    let targetVec = new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < count; i++) {
      const theta = (i / turn) * Math.PI * 2;
      const x = Math.cos(theta) * helixRadius;
      const y = (i - count / 2) * pitch;
      const z = Math.sin(theta) * helixRadius;
      const pos = new THREE.Vector3(x, y, z);
      backbonePoints.push(pos);

      const posIndex = i + 1;
      const isTargetMutation = activeMutation && activeMutation.position === posIndex;
      const hasAnyMutation = mutations.some(m => m.position === posIndex);

      if (isTargetMutation) {
        targetVec.copy(pos);
      }

      // Residue sphere
      const isHighlighted = isTargetMutation;
      const sphereRadius = isHighlighted ? 0.95 : hasAnyMutation ? 0.55 : 0.28;
      const sphereColor = isHighlighted ? 0xef4444 : hasAnyMutation ? 0xf59e0b : 0x38bdf8;

      const sphereMesh = new THREE.Mesh(
        new THREE.SphereGeometry(sphereRadius, 16, 16),
        new THREE.MeshStandardMaterial({
          color: sphereColor,
          roughness: 0.25,
          emissive: isHighlighted ? 0xef4444 : 0x000000,
          emissiveIntensity: isHighlighted ? 0.8 : 0
        })
      );
      sphereMesh.position.copy(pos);
      modelGroupRef.current.add(sphereMesh);

      // Pulsing Selection Ring for Target Mutation
      if (isHighlighted) {
        const ringGeom = new THREE.TorusGeometry(1.6, 0.08, 8, 24);
        const ringMesh = new THREE.Mesh(
          ringGeom,
          new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.85 })
        );
        ringMesh.position.copy(pos);
        ringMesh.lookAt(new THREE.Vector3(0, 0, 20));
        modelGroupRef.current.add(ringMesh);
      }
    }

    mutationTargetPosRef.current.copy(targetVec);

    // Continuous backbone ribbon
    if (backbonePoints.length > 2) {
      const curve = new THREE.CatmullRomCurve3(backbonePoints);
      const tubeMesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, count * 2, 0.22, 8, false),
        new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.3, metalness: 0.3 })
      );
      modelGroupRef.current.add(tubeMesh);
    }
  }, [cleanSeq, activeMutation, mutations]);

  // Setup Three.js
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const heightPx = typeof height === 'number' ? height : container.clientHeight || 320;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 1000);
    camera.position.set(0, 0, 26);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setSize(width, heightPx);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const group = new THREE.Group();
    scene.add(group);
    modelGroupRef.current = group;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dLight.position.set(10, 20, 20);
    scene.add(dLight);

    const fill = new THREE.DirectionalLight(0xef4444, 0.6);
    fill.position.set(-10, -10, -10);
    scene.add(fill);

    // Render loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      if (group) {
        group.rotation.y += 0.003;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [height]);

  useEffect(() => {
    buildMutationStructure();
  }, [buildMutationStructure]);

  const handleFocusMutation = () => {
    if (cameraRef.current && mutationTargetPosRef.current) {
      const target = mutationTargetPosRef.current;
      cameraRef.current.position.set(target.x, target.y, target.z + 12);
      cameraRef.current.lookAt(target);
    }
  };

  const handleResetCamera = () => {
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0, 26);
      cameraRef.current.lookAt(0, 0, 0);
    }
  };

  return (
    <div className={`rounded-2xl border border-red-500/30 bg-[#0C121E] overflow-hidden flex flex-col font-mono text-xs ${className}`}>
      {/* Header Toolbar */}
      <div className="bg-[#080D16] border-b border-red-500/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-white">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
            <GitCommit className="w-4 h-4" />
          </span>
          <div>
            <span className="font-bold text-sm tracking-wide">3D Mutation Tracker &amp; Focus Engine</span>
            <span className="text-[10px] text-slate-400 block font-sans">
              {mutations.length} identified sequence substitution{mutations.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* Wild Type vs Mutant Comparison Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#131D2E] rounded-lg p-0.5 border border-slate-700">
            <button
              type="button"
              onClick={() => setViewState('WILD_TYPE')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                viewState === 'WILD_TYPE' ? 'bg-[#0284C7] text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              Wild Type
            </button>
            <button
              type="button"
              onClick={() => setViewState('MUTANT')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                viewState === 'MUTANT' ? 'bg-red-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              Mutant Structure
            </button>
          </div>

          <button
            type="button"
            onClick={handleFocusMutation}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 cursor-pointer font-bold"
            title="Focus 3D Camera on Selected Mutation Site"
          >
            <Camera className="w-3.5 h-3.5 text-red-400" />
            <span>Focus Site</span>
          </button>

          <button
            type="button"
            onClick={handleResetCamera}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
            title="Reset Camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main 3D Viewport */}
      <div className="relative w-full" style={{ height }}>
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Active Mutation Comparison Overlay Card */}
        {activeMutation && (
          <div className="absolute top-3 left-3 bg-[#0B1526]/90 border border-red-500/40 rounded-xl p-3 text-white max-w-xs shadow-2xl backdrop-blur-md space-y-2 pointer-events-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="font-bold text-red-400 text-xs flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-red-400" />
                <span>Site #{activeMutation.position}</span>
              </span>
              <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded border border-red-500/30">
                {viewState === 'WILD_TYPE' ? 'WT Residue' : 'Mutant Residue'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-[#121E33] p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[9px] uppercase block">Wild Type</span>
                <span className="font-bold text-sky-400 text-sm">{activeMutation.original}</span>
                <span className="text-[10px] text-slate-400 block truncate">
                  {AMINO_ACID_NAMES[activeMutation.original] || 'Residue'}
                </span>
              </div>

              <div className="bg-[#121E33] p-2 rounded-lg border border-red-500/30">
                <span className="text-slate-400 text-[9px] uppercase block">Mutation</span>
                <span className="font-bold text-red-400 text-sm">{activeMutation.modified}</span>
                <span className="text-[10px] text-slate-400 block truncate">
                  {AMINO_ACID_NAMES[activeMutation.modified] || 'Residue'}
                </span>
              </div>
            </div>

            <p className="text-[10px] text-slate-300 font-sans leading-tight">
              {activeMutation.description || `Substitution at pos ${activeMutation.position}: ${activeMutation.original} → ${activeMutation.modified}`}
            </p>
          </div>
        )}

        {/* Mutation Selection Pill Strip */}
        {mutations.length > 1 && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-1.5 overflow-x-auto p-1.5 bg-[#0B1526]/80 backdrop-blur-md rounded-xl border border-slate-800">
            {mutations.map((m) => (
              <button
                key={m.id || m.position}
                type="button"
                onClick={() => {
                  setActiveMutation(m);
                  if (onSelectMutation) onSelectMutation(m);
                }}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all cursor-pointer shrink-0 ${
                  activeMutation?.position === m.position
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {m.original}{m.position}{m.modified}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
