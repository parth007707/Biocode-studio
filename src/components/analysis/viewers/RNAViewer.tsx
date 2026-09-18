import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RotateCw, ZoomIn, ZoomOut, Maximize2, Minimize2, Play, Pause, RefreshCw, Layers } from 'lucide-react';
import { RNASecondaryStructureResult } from '../../../lib/bio/rnaAnalysis';

interface RNAViewerProps {
  sequence: string;
  rnaAnalysis: RNASecondaryStructureResult;
  className?: string;
}

const RNA_BASE_COLORS: Record<string, number> = {
  A: 0xef4444, // Red / Adenine
  U: 0xa855f7, // Purple / Uracil
  G: 0x10b981, // Emerald / Guanine
  C: 0xf59e0b  // Amber / Cytosine
};

export const RNAViewer: React.FC<RNAViewerProps> = ({ sequence, rnaAnalysis, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showBasePairs, setShowBasePairs] = useState(true);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const cleanSeq = sequence.toUpperCase().replace(/[^ACGU]/g, '') || 'AUGCAUGCAUGC';
  const displaySeq = cleanSeq.slice(0, 100);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0fdfa);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 45);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight1.position.set(20, 30, 25);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xa855f7, 0.9);
    dirLight2.position.set(-20, -25, -20);
    scene.add(dirLight2);

    const rootGroup = new THREE.Group();
    groupRef.current = rootGroup;
    scene.add(rootGroup);

    const n = displaySeq.length;
    const points: THREE.Vector3[] = [];
    const sphereGeo = new THREE.SphereGeometry(0.55, 16, 16);
    const bondGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 8);

    // Calculate folded 3D coordinates based on secondary structure pairs / hairpins
    // Paired residues are mapped across stem ladders; unpaired loops curve in 3D arc
    const pairMap = new Map<number, number>();
    for (const pair of rnaAnalysis.pairs) {
      if (pair.from < n && pair.to < n) {
        pairMap.set(pair.from, pair.to);
        pairMap.set(pair.to, pair.from);
      }
    }

    // Generate positions: if stems exist, fold into a hairpin stem-loop geometry; otherwise an undulating single-strand helix
    const stemSpacing = 1.4;
    const stemWidth = 3.6;

    for (let i = 0; i < n; i++) {
      let x = 0;
      let y = 0;
      let z = 0;

      if (pairMap.has(i)) {
        const pairedWith = pairMap.get(i)!;
        const stemIndex = Math.min(i, pairedWith);
        const isLeft = i < pairedWith;
        const ladderY = (stemIndex - n / 4) * stemSpacing;

        x = isLeft ? -stemWidth / 2 : stemWidth / 2;
        y = ladderY;
        z = Math.sin(stemIndex * 0.4) * 2.2;
      } else {
        // Unpaired residue (e.g. hairpin loop or flexible tail)
        const angle = (i / n) * Math.PI * 3.5;
        const radius = 5.5 + Math.sin(i * 0.3) * 1.5;
        x = Math.cos(angle) * radius;
        y = (i - n / 2) * 1.2;
        z = Math.sin(angle) * radius;
      }

      const p = new THREE.Vector3(x, y, z);
      points.push(p);

      const base = displaySeq[i];
      const baseColor = RNA_BASE_COLORS[base] || 0x64748b;

      // Base nucleotide bead
      const beadMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.3,
        metalness: 0.2
      });
      const bead = new THREE.Mesh(sphereGeo, beadMat);
      bead.position.copy(p);
      rootGroup.add(bead);
    }

    // Connect RNA phosphodiester single strand backbone
    if (points.length > 1) {
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeo = new THREE.TubeGeometry(curve, n * 5, 0.22, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: 0x06b6d4, // Cyan RNA backbone
        roughness: 0.3,
        metalness: 0.3
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      rootGroup.add(tubeMesh);
    }

    // Render Base Pairing H-bonds between stem pairs
    if (showBasePairs) {
      const addedPairs = new Set<string>();
      for (const pair of rnaAnalysis.pairs) {
        if (pair.from < n && pair.to < n) {
          const key = `${Math.min(pair.from, pair.to)}-${Math.max(pair.from, pair.to)}`;
          if (!addedPairs.has(key)) {
            addedPairs.add(key);
            const p1 = points[pair.from];
            const p2 = points[pair.to];
            if (p1 && p2) {
              const dist = p1.distanceTo(p2);
              const bondMat = new THREE.MeshStandardMaterial({
                color: pair.type === 'GC' ? 0x10b981 : pair.type === 'AU' ? 0xa855f7 : 0x38bdf8,
                roughness: 0.4,
                metalness: 0.1
              });
              const bond = new THREE.Mesh(bondGeo, bondMat);
              bond.scale.set(1, dist, 1);
              bond.position.copy(new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5));
              bond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(p2, p1).normalize());
              rootGroup.add(bond);
            }
          }
        }
      }
    }

    // Adjust camera distance
    const targetZ = Math.max(28, n * 0.65 + 12);
    camera.position.set(0, 0, targetZ);

    // Interaction handling
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !rootGroup) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      rootGroup.rotation.y += deltaX * 0.01;
      rootGroup.rotation.x += deltaY * 0.01;

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!camera) return;
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + e.deltaY * 0.05, 10, 150);
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    domElem.addEventListener('wheel', onWheel, { passive: false });

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      if (autoRotate && rootGroup && !isDragging) {
        rootGroup.rotation.y += 0.007;
      }
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    });
    resizeObserver.observe(container);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      domElem.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      domElem.removeEventListener('wheel', onWheel);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, [displaySeq, autoRotate, showBasePairs, rnaAnalysis]);

  const handleReset = () => {
    if (groupRef.current && cameraRef.current) {
      groupRef.current.rotation.set(0, 0, 0);
      const targetZ = Math.max(28, displaySeq.length * 0.65 + 12);
      cameraRef.current.position.set(0, 0, targetZ);
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    if (cameraRef.current) {
      const step = direction === 'in' ? -5 : 5;
      cameraRef.current.position.z = THREE.MathUtils.clamp(cameraRef.current.position.z + step, 10, 150);
    }
  };

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden border border-[#99F6E4] bg-[#F0FDFA] flex flex-col shadow-[0_4px_24px_rgba(20,184,166,0.06)] ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen' : 'h-[500px]'
      } ${className}`}
    >
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-[#99F6E4] text-xs text-[#0F172A] shadow-md font-mono">
          <span className="w-2 h-2 rounded-full bg-[#0D9488] animate-pulse" />
          <span className="font-bold text-[#0F766E]">Single-Stranded Folded RNA</span>
          <span className="text-[#CBD5E1]">|</span>
          <span className="font-mono text-[11px] text-[#64748B]">
            {rnaAnalysis.stemCount} Stems, {rnaAnalysis.loopCount} Loops
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-[#99F6E4] shadow-md">
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              autoRotate ? 'bg-[#CCFBF1] text-[#0D9488]' : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
            }`}
            title={autoRotate ? 'Pause Rotation' : 'Auto Rotate'}
          >
            {autoRotate ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={() => handleZoom('in')}
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleZoom('out')}
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
            title="Reset Orientation"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Base Legend & Structure Info */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none text-xs">
        <div className="pointer-events-auto flex items-center gap-2.5 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-[#99F6E4] shadow-md font-mono text-[11px]">
          <span className="text-[#64748B] font-mono font-semibold text-xs">Bases:</span>
          <span className="flex items-center gap-1 text-[#DC2626] font-bold">
            <span className="w-2 h-2 rounded-full bg-[#DC2626] inline-block" /> A
          </span>
          <span className="flex items-center gap-1 text-[#7C3AED] font-bold">
            <span className="w-2 h-2 rounded-full bg-[#7C3AED] inline-block" /> U
          </span>
          <span className="flex items-center gap-1 text-[#16A34A] font-bold">
            <span className="w-2 h-2 rounded-full bg-[#16A34A] inline-block" /> G
          </span>
          <span className="flex items-center gap-1 text-[#D97706] font-bold">
            <span className="w-2 h-2 rounded-full bg-[#D97706] inline-block" /> C
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#99F6E4] text-[11px] font-mono text-[#334155] shadow-md">
          <button
            onClick={() => setShowBasePairs(!showBasePairs)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg cursor-pointer transition-colors ${
              showBasePairs ? 'bg-[#0D9488] text-white font-bold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{showBasePairs ? 'Hide H-Bonds' : 'Show H-Bonds'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
