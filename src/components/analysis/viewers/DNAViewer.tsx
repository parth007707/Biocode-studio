import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { 
  RotateCw, ZoomIn, ZoomOut, Maximize2, Minimize2, Play, Pause, 
  RefreshCw, Info, Layers, MoveHorizontal, CheckCircle2, Compass
} from 'lucide-react';

export interface DNAViewerProps {
  sequence: string;
  fullSequence?: string;
  startPosition?: number;
  totalLength?: number;
  className?: string;
}

const BASE_COLORS: Record<string, { bg: string; text: string; hex: number; name: string }> = {
  A: { bg: '#EF4444', text: '#FFFFFF', hex: 0xef4444, name: 'Adenine' },
  T: { bg: '#3B82F6', text: '#FFFFFF', hex: 0x3b82f6, name: 'Thymine' },
  G: { bg: '#10B981', text: '#FFFFFF', hex: 0x10b981, name: 'Guanine' },
  C: { bg: '#F59E0B', text: '#FFFFFF', hex: 0xf59e0b, name: 'Cytosine' },
  N: { bg: '#64748B', text: '#FFFFFF', hex: 0x64748b, name: 'Unknown' }
};

const COMPLEMENT: Record<string, string> = {
  A: 'T',
  T: 'A',
  G: 'C',
  C: 'G',
  N: 'N'
};

const BASE_WIDTH = 34; // Pixel width per base pair in 2D linear schematic
const TRACK_HEIGHT = 380;

export const DNAViewer: React.FC<DNAViewerProps> = ({
  sequence,
  fullSequence,
  startPosition = 1,
  totalLength,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const threeCanvasRef = useRef<HTMLDivElement>(null);

  // Clean sequence
  const cleanSeq = useMemo(() => {
    return sequence.toUpperCase().replace(/[^ATCGN]/g, '');
  }, [sequence]);

  const seqLength = cleanSeq.length;
  const effectiveTotalLength = totalLength || (fullSequence ? fullSequence.length : seqLength);

  // View state: 'linear_schematic' (2D SVG Linear Diagram) vs '3d_helix' (3D Three.js Molecular Helix)
  const [viewMode, setViewMode] = useState<'linear_schematic' | '3d_helix'>('linear_schematic');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 0.6x to 2.5x
  const [hasRendered, setHasRendered] = useState<boolean>(() => seqLength > 0);
  const [renderedCount, setRenderedCount] = useState<number>(() => seqLength);

  // Hover state
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // 3D Three.js state
  const [autoRotate, setAutoRotate] = useState(true);
  const [colorMode, setColorMode] = useState<'base' | 'strand'>('base');
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Calculate GC content for this segment
  const gcCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < cleanSeq.length; i++) {
      if (cleanSeq[i] === 'G' || cleanSeq[i] === 'C') count++;
    }
    return count;
  }, [cleanSeq]);

  const gcPercent = seqLength > 0 ? Math.round((gcCount / seqLength) * 100) : 0;

  // Viewport virtualization for 2D schematic
  const [scrollLeft, setScrollLeft] = useState<number>(0);
  const [containerWidth, setContainerWidth] = useState<number>(800);

  // Update container width on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        if (w > 0) setContainerWidth(w);
      }
    };
    updateDimensions();

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(updateDimensions);
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Update rendered status when cleanSeq is valid and mounted
  useEffect(() => {
    if (seqLength > 0) {
      setHasRendered(true);
      setRenderedCount(seqLength);
    } else {
      setHasRendered(false);
      setRenderedCount(0);
    }
  }, [seqLength]);

  // Handle scroll for virtualization
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  // Virtualized slice calculation
  const scaledBaseWidth = BASE_WIDTH * zoomLevel;
  const totalDiagramWidth = Math.max(containerWidth, seqLength * scaledBaseWidth + 120);

  const visibleStartIndex = Math.max(0, Math.floor((scrollLeft - 80) / scaledBaseWidth));
  const visibleEndIndex = Math.min(seqLength, Math.ceil((scrollLeft + containerWidth + 80) / scaledBaseWidth));

  // -------------------------------------------------------------------------
  // Three.js 3D Molecular Helix Setup (Only active in '3d_helix' mode)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (viewMode !== '3d_helix') {
      // Clean up Three.js when not in 3D mode
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      return;
    }

    const container = threeCanvasRef.current;
    if (!container || seqLength === 0) return;

    const width = container.clientWidth || containerWidth || 600;
    const height = container.clientHeight || 460;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070d18);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    const targetZ = Math.max(30, Math.min(seqLength, 120) * 0.75 + 20);
    camera.position.set(0, 0, targetZ);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // Studio Biological 4-Point Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight1.position.set(25, 45, 35);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.9);
    dirLight2.position.set(-25, -30, -25);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0x06b6d4, 1.0, 90);
    pointLight.position.set(0, 0, 18);
    scene.add(pointLight);

    // Build Authentic 3D Ball-and-Stick B-DNA Molecular Structure
    const rootGroup = new THREE.Group();
    groupRef.current = rootGroup;
    scene.add(rootGroup);

    const numBases3D = Math.min(seqLength, 120);
    const bpPitch = 1.6;
    const helixRadius = 5.2;
    const anglePerBp = 0.628; // ~36 degrees per base pair (10 bp/turn)
    const minorGrooveShift = 2.4;

    const phosphateSphereGeo = new THREE.SphereGeometry(0.48, 14, 14);
    const sugarSphereGeo = new THREE.SphereGeometry(0.40, 14, 14);
    const baseSphereGeo = new THREE.SphereGeometry(0.46, 14, 14);
    const bondCylinderGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 8);
    const hbCylinderGeo = new THREE.CylinderGeometry(0.08, 0.08, 1, 6);

    const phosphateMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.3, metalness: 0.2 }); // Orange (P)
    const sugarMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.15 }); // Slate (C4'/Sugar)
    const bondMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4 });
    const hBondMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, transparent: true, opacity: 0.75 });

    const prevStrand1P: THREE.Vector3[] = [];
    const prevStrand2P: THREE.Vector3[] = [];

    const addCylinderBetween = (v1: THREE.Vector3, v2: THREE.Vector3, geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
      const dist = v1.distanceTo(v2);
      if (dist < 0.01) return;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(mid);
      mesh.scale.set(1, dist, 1);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(v2, v1).normalize());
      rootGroup.add(mesh);
    };

    for (let i = 0; i < numBases3D; i++) {
      const b1 = cleanSeq[i];
      const b2 = COMPLEMENT[b1] || 'N';

      const y = (i - numBases3D / 2) * bpPitch;
      const angle1 = i * anglePerBp;
      const angle2 = angle1 + Math.PI + (minorGrooveShift - Math.PI / 2);

      // Strand 1: Phosphate (outer), Sugar C4' (mid), Base (core)
      const p1_p = new THREE.Vector3(Math.cos(angle1) * (helixRadius + 1.2), y, Math.sin(angle1) * (helixRadius + 1.2));
      const p1_sugar = new THREE.Vector3(Math.cos(angle1 + 0.15) * helixRadius, y + 0.3, Math.sin(angle1 + 0.15) * helixRadius);
      const p1_base = new THREE.Vector3(Math.cos(angle1 + 0.35) * (helixRadius * 0.45), y + 0.1, Math.sin(angle1 + 0.35) * (helixRadius * 0.45));

      // Strand 2 (Anti-parallel): Phosphate (outer), Sugar C4' (mid), Base (core)
      const p2_p = new THREE.Vector3(Math.cos(angle2) * (helixRadius + 1.2), y, Math.sin(angle2) * (helixRadius + 1.2));
      const p2_sugar = new THREE.Vector3(Math.cos(angle2 + 0.15) * helixRadius, y - 0.3, Math.sin(angle2 + 0.15) * helixRadius);
      const p2_base = new THREE.Vector3(Math.cos(angle2 + 0.35) * (helixRadius * 0.45), y - 0.1, Math.sin(angle2 + 0.35) * (helixRadius * 0.45));

      // Spheres for Strand 1
      const p1PhosMesh = new THREE.Mesh(phosphateSphereGeo, phosphateMat);
      p1PhosMesh.position.copy(p1_p);
      rootGroup.add(p1PhosMesh);

      const p1SugarMesh = new THREE.Mesh(sugarSphereGeo, sugarMat);
      p1SugarMesh.position.copy(p1_sugar);
      rootGroup.add(p1SugarMesh);

      const b1Color = BASE_COLORS[b1]?.hex || 0x64748b;
      const b1Mat = new THREE.MeshStandardMaterial({ color: b1Color, roughness: 0.25, metalness: 0.2 });
      const p1BaseMesh = new THREE.Mesh(baseSphereGeo, b1Mat);
      p1BaseMesh.position.copy(p1_base);
      rootGroup.add(p1BaseMesh);

      // Spheres for Strand 2
      const p2PhosMesh = new THREE.Mesh(phosphateSphereGeo, phosphateMat);
      p2PhosMesh.position.copy(p2_p);
      rootGroup.add(p2PhosMesh);

      const p2SugarMesh = new THREE.Mesh(sugarSphereGeo, sugarMat);
      p2SugarMesh.position.copy(p2_sugar);
      rootGroup.add(p2SugarMesh);

      const b2Color = BASE_COLORS[b2]?.hex || 0x64748b;
      const b2Mat = new THREE.MeshStandardMaterial({ color: b2Color, roughness: 0.25, metalness: 0.2 });
      const p2BaseMesh = new THREE.Mesh(baseSphereGeo, b2Mat);
      p2BaseMesh.position.copy(p2_base);
      rootGroup.add(p2BaseMesh);

      // Intramolecular Covalent Bonds: Phosphate -> Sugar -> Base
      addCylinderBetween(p1_p, p1_sugar, bondCylinderGeo, bondMat);
      addCylinderBetween(p1_sugar, p1_base, bondCylinderGeo, bondMat);

      addCylinderBetween(p2_p, p2_sugar, bondCylinderGeo, bondMat);
      addCylinderBetween(p2_sugar, p2_base, bondCylinderGeo, bondMat);

      // Inter-strand Hydrogen Bonds between Base Pairs across Helix Core
      addCylinderBetween(p1_base, p2_base, hbCylinderGeo, hBondMat);

      // Phosphodiester Backbone linkages connecting adjacent nucleotides
      if (prevStrand1P.length > 0) {
        const lastP1 = prevStrand1P[prevStrand1P.length - 1];
        addCylinderBetween(lastP1, p1_p, bondCylinderGeo, bondMat);
      }
      prevStrand1P.push(p1_p);

      if (prevStrand2P.length > 0) {
        const lastP2 = prevStrand2P[prevStrand2P.length - 1];
        addCylinderBetween(lastP2, p2_p, bondCylinderGeo, bondMat);
      }
      prevStrand2P.push(p2_p);
    }

    rootGroup.rotation.x = 0.2;
    rootGroup.rotation.z = 0.15;

    // Mouse drag orbit
    let isDragging = false;
    let prevMousePos = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !rootGroup) return;
      const deltaX = e.clientX - prevMousePos.x;
      const deltaY = e.clientY - prevMousePos.y;
      rootGroup.rotation.y += deltaX * 0.01;
      rootGroup.rotation.x += deltaY * 0.01;
      prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => { isDragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!camera) return;
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + e.deltaY * 0.05, 10, 180);
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

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0 && renderer && camera) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h, true);
        }
      }
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
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [viewMode, cleanSeq, seqLength, autoRotate, colorMode]);

  // Zoom handlers for 2D schematic
  const handleZoom = (direction: 'in' | 'out' | 'fit') => {
    if (direction === 'in') {
      setZoomLevel(prev => Math.min(2.5, prev + 0.25));
    } else if (direction === 'out') {
      setZoomLevel(prev => Math.max(0.5, prev - 0.25));
    } else {
      setZoomLevel(1);
    }
  };

  const handleReset3D = () => {
    if (groupRef.current && cameraRef.current) {
      groupRef.current.rotation.set(0.2, 0, 0.15);
      const targetZ = Math.max(30, Math.min(seqLength, 120) * 0.75 + 18);
      cameraRef.current.position.set(0, 0, targetZ);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ minHeight: '480px' }}
      className={`relative w-full rounded-2xl overflow-hidden border border-[#BAE6FD] bg-[#F0F9FF] flex flex-col shadow-xs ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen min-h-screen' : 'h-[520px]'
      } ${className}`}
    >
      {/* ------------------------------------------------------------- */}
      {/* TOP SCIENTIFIC HEADER & CONTROL BAR                          */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white/95 backdrop-blur-md border-b border-[#BAE6FD] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 z-20 font-mono text-xs shadow-2xs">
        {/* Left: Mode Title & Rendered Status */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#E0F2FE] text-[#0284C7] px-2.5 py-1 rounded-lg border border-[#BAE6FD] font-semibold text-[11px]">
            <Compass className="w-3.5 h-3.5 text-[#0284C7]" />
            <span>{viewMode === 'linear_schematic' ? 'Linear Diagram Schematic' : '3D Molecular Representation'}</span>
          </div>

          <span className="text-[#CBD5E1]">|</span>

          {/* Scientific Disclaimer Badge */}
          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-sans font-medium" title="Idealized stereochemical schematic. Non-experimental model.">
            Idealized Schematic (Non-Experimental)
          </span>

          {/* Rendered Count Badge - ONLY displayed when visualization has been produced */}
          {hasRendered && renderedCount > 0 ? (
            <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-bold">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>{renderedCount} bp rendered (pos {startPosition}–{startPosition + renderedCount - 1} of {effectiveTotalLength})</span>
            </span>
          ) : (
            <span className="text-slate-400 text-[11px]">
              No sequence data to render
            </span>
          )}
        </div>

        {/* Right: View Mode Toggle & Zoom / Action Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Mode Switcher: 2D Linear Schematic vs 3D Helix */}
          <div className="flex items-center bg-[#F1F5F9] border border-[#CBD5E1] rounded-lg p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode('linear_schematic')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-sans font-semibold flex items-center gap-1 ${
                viewMode === 'linear_schematic'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <MoveHorizontal className="w-3 h-3" />
              <span>2D Linear</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('3d_helix')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-sans font-semibold flex items-center gap-1 ${
                viewMode === '3d_helix'
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>3D Helix</span>
            </button>
          </div>

          {/* Zoom Controls */}
          {viewMode === 'linear_schematic' ? (
            <div className="flex items-center gap-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => handleZoom('in')}
                className="p-1 rounded text-slate-600 hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] text-slate-500 px-1 font-mono min-w-[32px] text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={() => handleZoom('out')}
                className="p-1 rounded text-slate-600 hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleZoom('fit')}
                className="px-1.5 py-0.5 rounded text-[10px] text-slate-600 hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer font-sans"
                title="Reset Zoom to 100%"
              >
                1x
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setAutoRotate(!autoRotate)}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  autoRotate ? 'bg-[#E0F2FE] text-[#0284C7]' : 'text-slate-600 hover:text-[#0F172A]'
                }`}
                title={autoRotate ? 'Pause Rotation' : 'Auto Rotate'}
              >
                {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={handleReset3D}
                className="p-1 rounded text-slate-600 hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
                title="Reset 3D View"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg border border-[#CBD5E1] bg-white text-slate-600 hover:text-[#0F172A] hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen View'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* PRIMARY VIEWPORT: 2D LINEAR DIAGRAM OR 3D HELIX               */}
      {/* ------------------------------------------------------------- */}
      <div className="relative flex-1 w-full h-full overflow-hidden flex flex-col">
        {seqLength === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 font-mono text-xs">
            <Info className="w-8 h-8 text-sky-500 mb-2" />
            <p className="font-semibold text-slate-800">No DNA Sequence Available</p>
            <p className="text-slate-400 mt-1">Please provide or load a valid DNA sequence (A, T, C, G).</p>
          </div>
        ) : viewMode === 'linear_schematic' ? (
          // =========================================================
          // 2D VIRTUALIZED LINEAR SCHEMATIC (SVG CANVAS)
          // =========================================================
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 w-full h-full overflow-x-auto overflow-y-hidden select-none cursor-grab active:cursor-grabbing bg-[#F8FAFC]"
          >
            <div style={{ width: `${totalDiagramWidth}px`, height: '100%', minHeight: `${TRACK_HEIGHT}px` }} className="relative py-4 px-6">
              <svg
                width={totalDiagramWidth}
                height={TRACK_HEIGHT}
                className="overflow-visible"
              >
                <defs>
                  {/* Subtle drop shadow for nucleotide tiles */}
                  <filter id="tileShadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#0F172A" floodOpacity="0.08" />
                  </filter>
                </defs>

                {/* 1. Track Labels & 5' / 3' Orientation Markers */}
                <g className="font-mono text-xs">
                  {/* Top Strand: 5' -> 3' */}
                  <rect x="10" y="45" width="34" height="22" rx="4" fill="#0284C7" />
                  <text x="27" y="60" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">5'</text>
                  <text x="52" y="60" fill="#0369A1" fontSize="10" fontWeight="bold">Sense Strand (Coding)</text>

                  {/* Backbone Top Line */}
                  <line
                    x1="60"
                    y1="90"
                    x2={totalDiagramWidth - 40}
                    y2="90"
                    stroke="#0284C7"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />

                  {/* Hydrogen Bond Mid-Line Track Indicator */}
                  <line
                    x1="60"
                    y1="165"
                    x2={totalDiagramWidth - 40}
                    y2="165"
                    stroke="#E2E8F0"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />

                  {/* Backbone Bottom Line */}
                  <line
                    x1="60"
                    y1="240"
                    x2={totalDiagramWidth - 40}
                    y2="240"
                    stroke="#059669"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />

                  {/* Bottom Strand: 3' -> 5' */}
                  <rect x="10" y="265" width="34" height="22" rx="4" fill="#059669" />
                  <text x="27" y="280" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">3'</text>
                  <text x="52" y="280" fill="#047857" fontSize="10" fontWeight="bold">Antisense Strand (Complementary)</text>

                  {/* Far Ends 3' and 5' Labels */}
                  <rect x={totalDiagramWidth - 44} y="45" width="34" height="22" rx="4" fill="#0284C7" />
                  <text x={totalDiagramWidth - 27} y="60" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">3'</text>

                  <rect x={totalDiagramWidth - 44} y="265" width="34" height="22" rx="4" fill="#059669" />
                  <text x={totalDiagramWidth - 27} y="280" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">5'</text>
                </g>

                {/* 2. Base Pair Tiles, Coordinates & Hydrogen Bond Rungs */}
                {cleanSeq.split('').map((base, idx) => {
                  // Virtualization culling: only render if within visible window (+/- 5 bases buffer)
                  if (idx < visibleStartIndex - 5 || idx > visibleEndIndex + 5) {
                    return null;
                  }

                  const compBase = COMPLEMENT[base] || 'N';
                  const baseConfig = BASE_COLORS[base] || BASE_COLORS.N;
                  const compConfig = BASE_COLORS[compBase] || BASE_COLORS.N;
                  const isHovered = hoveredIndex === idx;

                  const x = 70 + idx * scaledBaseWidth;
                  const absPos = startPosition + idx;
                  const numHbonds = (base === 'G' && compBase === 'C') || (base === 'C' && compBase === 'G') ? 3 : 2;

                  return (
                    <g
                      key={idx}
                      onMouseEnter={(e) => {
                        setHoveredIndex(idx);
                        const rect = containerRef.current?.getBoundingClientRect();
                        if (rect) {
                          setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                        }
                      }}
                      onMouseLeave={() => setHoveredIndex(null)}
                      className="cursor-pointer transition-opacity"
                    >
                      {/* Coordinate Ruler Number (every 10 bp, or first/last) */}
                      {(absPos % 10 === 0 || idx === 0 || idx === seqLength - 1) && (
                        <g>
                          <line x1={x + scaledBaseWidth / 2} y1="18" x2={x + scaledBaseWidth / 2} y2="28" stroke="#94A3B8" strokeWidth="1.5" />
                          <text
                            x={x + scaledBaseWidth / 2}
                            y="14"
                            textAnchor="middle"
                            fill="#64748B"
                            fontSize="9"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {absPos}
                          </text>
                        </g>
                      )}

                      {/* Small tick mark on ruler */}
                      {absPos % 5 === 0 && absPos % 10 !== 0 && (
                        <line x1={x + scaledBaseWidth / 2} y1="22" x2={x + scaledBaseWidth / 2} y2="28" stroke="#CBD5E1" strokeWidth="1" />
                      )}

                      {/* Top Base Tile (5' -> 3') */}
                      <rect
                        x={x}
                        y="76"
                        width={scaledBaseWidth - 4}
                        height="28"
                        rx="5"
                        fill={baseConfig.bg}
                        stroke={isHovered ? '#0F172A' : '#FFFFFF'}
                        strokeWidth={isHovered ? 2 : 1}
                        filter="url(#tileShadow)"
                      />
                      <text
                        x={x + (scaledBaseWidth - 4) / 2}
                        y="95"
                        textAnchor="middle"
                        fill={baseConfig.text}
                        fontSize={Math.max(10, Math.min(14, scaledBaseWidth * 0.45))}
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {base}
                      </text>

                      {/* Hydrogen Bond Rung (Connecting Top & Bottom Base) */}
                      <g stroke={isHovered ? '#0284C7' : '#94A3B8'} strokeWidth={isHovered ? 2 : 1.5} strokeDasharray="2 2">
                        {numHbonds === 3 ? (
                          <>
                            <line x1={x + scaledBaseWidth * 0.25} y1="110" x2={x + scaledBaseWidth * 0.25} y2="220" />
                            <line x1={x + scaledBaseWidth * 0.50} y1="110" x2={x + scaledBaseWidth * 0.50} y2="220" stroke={isHovered ? '#059669' : '#64748B'} />
                            <line x1={x + scaledBaseWidth * 0.75} y1="110" x2={x + scaledBaseWidth * 0.75} y2="220" />
                          </>
                        ) : (
                          <>
                            <line x1={x + scaledBaseWidth * 0.35} y1="110" x2={x + scaledBaseWidth * 0.35} y2="220" />
                            <line x1={x + scaledBaseWidth * 0.65} y1="110" x2={x + scaledBaseWidth * 0.65} y2="220" />
                          </>
                        )}
                      </g>

                      {/* Hydrogen Bond Indicator Dot in the center */}
                      <circle
                        cx={x + (scaledBaseWidth - 4) / 2}
                        cy="165"
                        r={isHovered ? 4 : 2.5}
                        fill={numHbonds === 3 ? '#10B981' : '#3B82F6'}
                      />

                      {/* Bottom Base Tile (3' -> 5' Complement) */}
                      <rect
                        x={x}
                        y="226"
                        width={scaledBaseWidth - 4}
                        height="28"
                        rx="5"
                        fill={compConfig.bg}
                        stroke={isHovered ? '#0F172A' : '#FFFFFF'}
                        strokeWidth={isHovered ? 2 : 1}
                        filter="url(#tileShadow)"
                      />
                      <text
                        x={x + (scaledBaseWidth - 4) / 2}
                        y="245"
                        textAnchor="middle"
                        fill={compConfig.text}
                        fontSize={Math.max(10, Math.min(14, scaledBaseWidth * 0.45))}
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {compBase}
                      </text>

                      {/* Bottom Coordinate Tick */}
                      <text
                        x={x + (scaledBaseWidth - 4) / 2}
                        y="275"
                        textAnchor="middle"
                        fill="#94A3B8"
                        fontSize="8"
                        fontFamily="monospace"
                      >
                        {absPos}
                      </text>

                      {/* GC Status Bar at bottom */}
                      <rect
                        x={x}
                        y="300"
                        width={scaledBaseWidth - 4}
                        height="6"
                        rx="2"
                        fill={base === 'G' || base === 'C' ? '#10B981' : '#93C5FD'}
                      />
                    </g>
                  );
                })}

                {/* 3. GC Content Track Legend */}
                <g className="font-mono text-[10px]">
                  <text x="10" y="325" fill="#64748B" fontWeight="bold">GC Track:</text>
                  <rect x="70" y="316" width="12" height="10" rx="2" fill="#10B981" />
                  <text x="86" y="325" fill="#0F172A">G-C Pair (3 H-Bonds)</text>
                  <rect x="220" y="316" width="12" height="10" rx="2" fill="#93C5FD" />
                  <text x="236" y="325" fill="#0F172A">A-T Pair (2 H-Bonds)</text>
                  <text x="370" y="325" fill="#0284C7" fontWeight="bold">Window GC: {gcPercent}%</text>
                </g>
              </svg>

              {/* Floating Tooltip for Hovered Base Pair */}
              {hoveredIndex !== null && tooltipPos && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${Math.min(containerWidth - 220, Math.max(20, tooltipPos.x + 15))}px`,
                    top: `${Math.min(TRACK_HEIGHT - 120, Math.max(40, tooltipPos.y - 60))}px`
                  }}
                  className="bg-white/95 backdrop-blur-md border border-[#BAE6FD] rounded-xl p-3 shadow-lg pointer-events-none z-30 font-mono text-xs text-[#0F172A] w-52 space-y-1"
                >
                  <div className="flex items-center justify-between pb-1 border-b border-[#E2E8F0]">
                    <span className="font-bold text-[#0284C7]">Position {startPosition + hoveredIndex}</span>
                    <span className="text-[10px] text-slate-500 font-sans">DNA Base Pair</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="text-slate-600">Sense (5'→3'):</span>
                    <span className="font-bold text-red-600">{cleanSeq[hoveredIndex]} ({BASE_COLORS[cleanSeq[hoveredIndex]]?.name})</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">Antisense (3'→5'):</span>
                    <span className="font-bold text-blue-600">{COMPLEMENT[cleanSeq[hoveredIndex]]} ({BASE_COLORS[COMPLEMENT[cleanSeq[hoveredIndex]]]?.name})</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">Hydrogen Bonds:</span>
                    <span className="font-bold text-emerald-600">
                      {cleanSeq[hoveredIndex] === 'G' || cleanSeq[hoveredIndex] === 'C' ? '3 H-bonds (Strong)' : '2 H-bonds'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          // =========================================================
          // 3D MOLECULAR HELIX (THREE.JS WEBGL CANVAS)
          // =========================================================
          <div className="relative flex-1 w-full h-full">
            <div ref={threeCanvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

            {/* 3D Color Mode Toggle */}
            <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-[#BAE6FD] shadow-md text-[11px] font-mono text-[#334155] z-10">
              <button
                type="button"
                onClick={() => setColorMode('base')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  colorMode === 'base' ? 'bg-[#0284C7] text-white font-bold shadow-2xs' : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                By Base
              </button>
              <button
                type="button"
                onClick={() => setColorMode('strand')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  colorMode === 'strand' ? 'bg-[#0284C7] text-white font-bold shadow-2xs' : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                By Strand
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* BOTTOM LEGEND & BASE COLOR KEY                                */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white/95 backdrop-blur-md border-t border-[#BAE6FD] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-mono z-20 shadow-2xs">
        <div className="flex items-center gap-3 flex-wrap text-[11px]">
          <span className="text-slate-500 font-semibold">Nucleotides:</span>
          <span className="flex items-center gap-1 text-[#DC2626] font-bold">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#EF4444] inline-block" /> A (Adenine)
          </span>
          <span className="flex items-center gap-1 text-[#2563EB] font-bold">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#3B82F6] inline-block" /> T (Thymine)
          </span>
          <span className="flex items-center gap-1 text-[#059669] font-bold">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#10B981] inline-block" /> G (Guanine)
          </span>
          <span className="flex items-center gap-1 text-[#D97706] font-bold">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#F59E0B] inline-block" /> C (Cytosine)
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>Antiparallel Double Strands (5'→3' & 3'→5')</span>
          <span>·</span>
          <span>Watson-Crick Pairing</span>
        </div>
      </div>
    </div>
  );
};
