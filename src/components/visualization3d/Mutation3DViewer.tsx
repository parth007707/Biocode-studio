import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { SequenceMutation } from '../../lib/bio/editor/types';
import { SequenceType } from '../../lib/bio/types';
import { parseBiologicalInput } from '../../lib/bio/sequenceParser';
import { resolveMacromolecularStructure } from '../../lib/bio/structure3d/structureResolver';
import { ResolvedStructure3D } from '../../lib/bio/structure3d/types';
import { AlertTriangle, Camera, GitCommit, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';

interface Mutation3DViewerProps {
  wildTypeSequence: string;
  mutantSequence: string;
  sequenceType?: SequenceType;
  accession?: string;
  mutations: SequenceMutation[];
  selectedMutation?: SequenceMutation | null;
  onSelectMutation?: (m: SequenceMutation) => void;
  className?: string;
  height?: number | string;
}

const RESIDUE_NAMES: Record<string, string> = {
  A: 'Alanine (Ala) / Adenine', R: 'Arginine (Arg)', N: 'Asparagine (Asn)', D: 'Aspartic Acid (Asp)', C: 'Cysteine (Cys) / Cytosine',
  Q: 'Glutamine (Gln)', E: 'Glutamic Acid (Glu)', G: 'Glycine (Gly) / Guanine', H: 'Histidine (His)', I: 'Isoleucine (Ile)',
  L: 'Leucine (Leu)', K: 'Lysine (Lys)', M: 'Methionine (Met)', F: 'Phenylalanine (Phe)', P: 'Proline (Pro)',
  S: 'Serine (Ser)', T: 'Threonine (Thr) / Thymine', W: 'Tryptophan (Trp)', Y: 'Tyrosine (Tyr)', V: 'Valine (Val)',
  U: 'Uracil (U)'
};

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material.dispose();
    }
  });
}

export const Mutation3DViewer: React.FC<Mutation3DViewerProps> = ({
  wildTypeSequence,
  mutantSequence,
  sequenceType = 'PROTEIN',
  accession,
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
  const [structure, setStructure] = useState<ResolvedStructure3D | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [webglError, setWebglError] = useState<string | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mutationTargetPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const defaultCamZRef = useRef<number>(50);
  const isDraggingRef = useRef<boolean>(false);
  const prevMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (selectedMutation) {
      setActiveMutation(selectedMutation);
    } else if (mutations.length > 0 && !activeMutation) {
      setActiveMutation(mutations[0]);
    }
  }, [selectedMutation, mutations, activeMutation]);

  const activeSeq = useMemo(() => {
    const raw = viewState === 'WILD_TYPE' ? wildTypeSequence : mutantSequence;
    return parseBiologicalInput(raw).sequence.replace(/[^A-Z]/g, '');
  }, [viewState, wildTypeSequence, mutantSequence]);

  const cleanWildType = useMemo(
    () => parseBiologicalInput(wildTypeSequence).sequence.replace(/[^A-Z]/g, ''),
    [wildTypeSequence]
  );

  // Resolve real 3D atomic coordinates for Wild Type or Mutant sequence
  useEffect(() => {
    if (!activeSeq || activeSeq.length < 4) {
      setStructure(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const resolved = await resolveMacromolecularStructure({
          sequence: activeSeq,
          originalSequence: viewState === 'MUTANT' ? cleanWildType : undefined,
          sequenceType,
          accessionOrPdbId: accession,
          mutations: viewState === 'MUTANT' ? mutations : [],
          allowSequenceDerivedFallback: false
        });
        if (!cancelled) {
          setStructure(resolved);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setStructure(null);
          setIsLoading(false);
        }
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeSeq, cleanWildType, viewState, sequenceType, accession, mutations]);

  // Build real 3D geometry from resolved PDB/mmCIF coordinates and highlight mutation sites
  const buildMutationStructure = useCallback(() => {
    const group = modelGroupRef.current;
    if (!group) return;

    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
      disposeObject3D(obj);
    }

    if (!structure || structure.structureType === 'UNAVAILABLE' || !structure.allAtoms?.length) {
      return;
    }

    const finiteAtoms = structure.allAtoms.filter(
      (a) => Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z)
    );
    if (finiteAtoms.length === 0) return;

    let sumX = 0, sumY = 0, sumZ = 0;
    for (const a of finiteAtoms) {
      sumX += a.x; sumY += a.y; sumZ += a.z;
    }
    const cx = sumX / finiteAtoms.length;
    const cy = sumY / finiteAtoms.length;
    const cz = sumZ / finiteAtoms.length;

    let maxR2 = 16;
    for (const a of finiteAtoms) {
      const dx = a.x - cx, dy = a.y - cy, dz = a.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > maxR2) maxR2 = d2;
    }
    const radius = Math.sqrt(maxR2);
    defaultCamZRef.current = Math.max(24, radius * 2.4);

    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0, defaultCamZRef.current);
      cameraRef.current.lookAt(0, 0, 0);
    }

    const primaryChainId = structure.matchedChainId || structure.coverageInfo?.chain;
    const targetToChainResSeq = structure.coverageInfo?.targetToChainResSeq;
    const activeTargetResSeq = activeMutation
      ? (targetToChainResSeq?.[activeMutation.position] ?? activeMutation.position)
      : null;

    let foundTargetPos: THREE.Vector3 | null = null;
    const highlightGeo = new THREE.SphereGeometry(0.95, 16, 16);

    for (const chain of structure.chains) {
      const isPrimary = !primaryChainId || chain.id === primaryChainId;
      const backboneResidues = chain.residues.filter((r) => r.ca && Number.isFinite(r.ca.x));
      if (backboneResidues.length >= 2) {
        const points = backboneResidues.map(
          (r) => new THREE.Vector3(r.ca!.x - cx, r.ca!.y - cy, r.ca!.z - cz)
        );
        const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.45);
        const tubeGeo = new THREE.TubeGeometry(curve, Math.min(1800, Math.max(backboneResidues.length * 4, 24)), isPrimary ? 0.52 : 0.36, 10, false);
        const tubeMat = new THREE.MeshStandardMaterial({
          color: isPrimary ? (viewState === 'WILD_TYPE' ? 0x0284c7 : 0x38bdf8) : 0x475569,
          roughness: 0.35,
          metalness: 0.12,
          transparent: !isPrimary,
          opacity: isPrimary ? 1.0 : 0.45
        });
        group.add(new THREE.Mesh(tubeGeo, tubeMat));
      }

      if (!isPrimary) continue;

      for (const res of chain.residues) {
        if (!res.ca) continue;
        const isActiveTarget = activeTargetResSeq !== null && res.resSeq === activeTargetResSeq;
        const isMut = Boolean(res.isMutated) || mutations.some((m) => (targetToChainResSeq?.[m.position] ?? m.position) === res.resSeq);
        if (!isActiveTarget && !isMut) continue;

        const pos = new THREE.Vector3(res.ca.x - cx, res.ca.y - cy, res.ca.z - cz);
        if (isActiveTarget) {
          foundTargetPos = pos.clone();
        }

        const sphereMat = new THREE.MeshStandardMaterial({
          color: isActiveTarget ? 0xef4444 : 0xf59e0b,
          emissive: isActiveTarget ? 0xdc2626 : 0xb45309,
          emissiveIntensity: isActiveTarget ? 0.75 : 0.45,
          roughness: 0.25
        });
        const sphere = new THREE.Mesh(highlightGeo, sphereMat);
        sphere.position.copy(pos);
        sphere.scale.setScalar(isActiveTarget ? 1.25 : 0.85);
        group.add(sphere);

        if (isActiveTarget) {
          const ringGeo = new THREE.TorusGeometry(1.85, 0.1, 10, 28);
          const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.9 });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.copy(pos);
          group.add(ring);
        }
      }
    }

    mutationTargetPosRef.current.copy(foundTargetPos || new THREE.Vector3(0, 0, 0));
  }, [structure, activeMutation, mutations, viewState]);

  // Setup Three.js
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const heightPx = typeof height === 'number' ? height : container.clientHeight || 320;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (err: any) {
      setWebglError(err?.message || 'WebGL unavailable');
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c121e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 1500);
    camera.position.set(0, 0, defaultCamZRef.current);
    cameraRef.current = camera;

    renderer.setSize(width, heightPx);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    if (renderer.domElement.parentNode !== container) {
      container.appendChild(renderer.domElement);
    }
    rendererRef.current = renderer;

    const group = new THREE.Group();
    scene.add(group);
    modelGroupRef.current = group;

    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dLight.position.set(20, 30, 30);
    scene.add(dLight);

    const fill = new THREE.DirectionalLight(0x38bdf8, 0.7);
    fill.position.set(-20, -15, -20);
    scene.add(fill);

    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !group) return;
      group.rotation.y += (e.clientX - prevMouseRef.current.x) * 0.01;
      group.rotation.x += (e.clientY - prevMouseRef.current.y) * 0.01;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { isDraggingRef.current = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.position.z = Math.max(8, Math.min(400, camera.position.z + e.deltaY * 0.06));
    };

    const domEl = renderer.domElement;
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
      if (e.touches.length === 1 && isDraggingRef.current && group) {
        e.preventDefault();
        group.rotation.y += (e.touches[0].clientX - prevMouseRef.current.x) * 0.01;
        group.rotation.x += (e.touches[0].clientY - prevMouseRef.current.y) * 0.01;
        prevMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (pinchDistance > 0) {
          camera.position.z = Math.max(8, Math.min(400, camera.position.z + (pinchDistance - dist) * 0.15));
        }
        pinchDistance = dist;
      }
    };

    const onTouchEnd = () => {
      isDraggingRef.current = false;
      pinchDistance = 0;
    };

    domEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    domEl.addEventListener('wheel', onWheel, { passive: false });
    domEl.addEventListener('touchstart', onTouchStart, { passive: true });
    domEl.addEventListener('touchmove', onTouchMove, { passive: false });
    domEl.addEventListener('touchend', onTouchEnd);

    let resizeRaf: number | null = null;
    let lastW = width;
    let lastH = heightPx;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        const h = Math.floor(entry.contentRect.height);
        if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) {
          lastW = w;
          lastH = h;
          if (resizeRaf) cancelAnimationFrame(resizeRaf);
          resizeRaf = requestAnimationFrame(() => {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h, false);
          });
        }
      }
    });
    ro.observe(container);

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      if (group && !isDraggingRef.current) {
        group.rotation.y += 0.0025;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      ro.disconnect();
      domEl.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      domEl.removeEventListener('wheel', onWheel);
      domEl.removeEventListener('touchstart', onTouchStart);
      domEl.removeEventListener('touchmove', onTouchMove);
      domEl.removeEventListener('touchend', onTouchEnd);
      if (modelGroupRef.current) disposeObject3D(modelGroupRef.current);
      renderer.dispose();
      if (domEl.parentNode === container) {
        container.removeChild(domEl);
      }
    };
  }, [height]);

  useEffect(() => {
    buildMutationStructure();
  }, [buildMutationStructure]);

  const handleFocusMutation = () => {
    if (cameraRef.current && modelGroupRef.current) {
      modelGroupRef.current.rotation.set(0, 0, 0);
      const target = mutationTargetPosRef.current;
      cameraRef.current.position.set(target.x, target.y, target.z + 18);
      cameraRef.current.lookAt(target);
    }
  };

  const handleResetCamera = () => {
    if (cameraRef.current && modelGroupRef.current) {
      modelGroupRef.current.rotation.set(0, 0, 0);
      cameraRef.current.position.set(0, 0, defaultCamZRef.current);
      cameraRef.current.lookAt(0, 0, 0);
    }
  };

  const isUnavailable = !isLoading && (!structure || structure.structureType === 'UNAVAILABLE' || (structure.allAtoms?.length ?? 0) === 0);

  return (
    <div className={`rounded-2xl border border-red-500/30 bg-[#0C121E] overflow-hidden flex flex-col font-mono text-xs ${className}`}>
      {/* Header Toolbar */}
      <div className="bg-[#080D16] border-b border-red-500/20 px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 text-white">
        <div className="flex items-center gap-2 min-w-0">
          <span className="p-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
            <GitCommit className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <span className="font-bold text-xs sm:text-sm tracking-wide block truncate">3D Mutation Tracker &amp; Focus Engine</span>
            <span className="text-[10px] text-slate-400 block font-sans truncate">
              {mutations.length} identified sequence change{mutations.length === 1 ? '' : 's'}
              {structure?.sourceId ? ` · Template ${structure.sourceId}` : ''}
            </span>
          </div>
        </div>

        {/* Wild Type vs Mutant Comparison Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
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
            disabled={isUnavailable}
            onClick={handleFocusMutation}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 flex items-center gap-1.5 cursor-pointer font-bold"
            title="Focus 3D Camera on Selected Mutation Site"
          >
            <Camera className="w-3.5 h-3.5 text-red-400" />
            <span>Focus Site</span>
          </button>

          <button
            type="button"
            disabled={isUnavailable}
            onClick={handleResetCamera}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-400 hover:text-white cursor-pointer"
            title="Reset Camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main 3D Viewport */}
      <div className="relative w-full" style={{ height }}>
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {isLoading && (
          <div className="absolute inset-0 bg-[#0C121E]/85 flex flex-col items-center justify-center space-y-2 z-20 text-sky-400">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span>Resolving verified 3D atomic coordinates...</span>
          </div>
        )}

        {isUnavailable && !webglError && (
          <div className="absolute inset-0 bg-[#0C121E]/95 flex flex-col items-center justify-center p-6 text-center z-20 text-slate-300 space-y-2">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            <div className="font-bold text-white">No Verified 3D Structure Available</div>
            <p className="text-[11px] text-slate-400 max-w-md font-sans">
              No experimental RCSB PDB or AlphaFold DB coordinates matched this sequence, so synthetic 3D coordinates are not displayed.
            </p>
          </div>
        )}

        {webglError && (
          <div className="absolute inset-0 bg-[#0C121E] flex items-center justify-center p-4 text-amber-400">
            {webglError}
          </div>
        )}

        {/* Active Mutation Comparison Overlay Card */}
        {activeMutation && !isUnavailable && !isLoading && (
          <div className="sm:absolute sm:top-3 sm:left-3 m-2.5 sm:m-0 bg-[#0B1526]/95 border border-red-500/40 rounded-xl p-2.5 sm:p-3 text-white sm:max-w-xs shadow-2xl backdrop-blur-md space-y-2 pointer-events-auto z-10">
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
                <span className="font-bold text-sky-400 text-sm">{activeMutation.original || '-'}</span>
                <span className="text-[10px] text-slate-400 block truncate">
                  {RESIDUE_NAMES[activeMutation.original] || 'Residue'}
                </span>
              </div>

              <div className="bg-[#121E33] p-2 rounded-lg border border-red-500/30">
                <span className="text-slate-400 text-[9px] uppercase block">Mutation</span>
                <span className="font-bold text-red-400 text-sm">{activeMutation.modified || '-'}</span>
                <span className="text-[10px] text-slate-400 block truncate">
                  {RESIDUE_NAMES[activeMutation.modified] || 'Residue'}
                </span>
              </div>
            </div>

            <p className="text-[10px] text-slate-300 font-sans leading-tight">
              {activeMutation.description || `Change at pos ${activeMutation.position}: ${activeMutation.original} → ${activeMutation.modified}`}
            </p>
          </div>
        )}

        {/* Mutation Selection Pill Strip */}
        {mutations.length > 1 && !isUnavailable && !isLoading && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-1.5 overflow-x-auto p-1.5 bg-[#0B1526]/80 backdrop-blur-md rounded-xl border border-slate-800 z-10">
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
