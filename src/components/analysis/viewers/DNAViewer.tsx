import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RotateCw, ZoomIn, ZoomOut, Maximize2, Minimize2, Play, Pause, RefreshCw, Eye } from 'lucide-react';

interface DNAViewerProps {
  sequence: string;
  className?: string;
}

const BASE_COLORS: Record<string, number> = {
  A: 0xef4444, // Red / Adenine
  T: 0x3b82f6, // Blue / Thymine
  G: 0x10b981, // Emerald / Guanine
  C: 0xf59e0b, // Amber / Cytosine
  N: 0x64748b  // Slate / Unknown
};

const COMPLEMENT: Record<string, string> = {
  A: 'T',
  T: 'A',
  G: 'C',
  C: 'G',
  N: 'N'
};

export const DNAViewer: React.FC<DNAViewerProps> = ({ sequence, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [colorMode, setColorMode] = useState<'base' | 'strand' | 'element'>('base');
  const [hoveredBase, setHoveredBase] = useState<{ index: number; base5: string; base3: string } | null>(null);

  // References for Three.js state
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const cleanSeq = sequence.toUpperCase().replace(/[^ATCGN]/g, '') || 'ATGCATGCATGC';
  // Render up to 100 bp in 3D for optimal high-frame-rate rendering
  const displaySeq = cleanSeq.slice(0, 120);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 450;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f9ff);
    sceneRef.current = scene;

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 45);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(20, 40, 30);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.8);
    dirLight2.position.set(-20, -30, -20);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0x34d399, 1.2, 80);
    pointLight.position.set(0, 0, 15);
    scene.add(pointLight);

    // 5. Build 3D Double Helix
    const rootGroup = new THREE.Group();
    groupRef.current = rootGroup;
    scene.add(rootGroup);

    const numBases = displaySeq.length;
    const bpPitch = 1.1; // Distance between base pairs along Y axis
    const helixRadius = 4.2;
    const anglePerBp = 0.60; // ~10.5 bp per full turn (2 * PI / 10.5 ≈ 0.60)
    const minorGrooveShift = 2.2; // Major/minor groove angular difference

    const strand1Points: THREE.Vector3[] = [];
    const strand2Points: THREE.Vector3[] = [];

    const sphereGeo = new THREE.SphereGeometry(0.55, 16, 16);
    const bondCylinderGeo = new THREE.CylinderGeometry(0.18, 0.18, 1, 12);

    for (let i = 0; i < numBases; i++) {
      const b1 = displaySeq[i];
      const b2 = COMPLEMENT[b1] || 'N';

      const y = (i - numBases / 2) * bpPitch;
      const angle1 = i * anglePerBp;
      const angle2 = angle1 + Math.PI + (minorGrooveShift - Math.PI / 2);

      const p1 = new THREE.Vector3(Math.cos(angle1) * helixRadius, y, Math.sin(angle1) * helixRadius);
      const p2 = new THREE.Vector3(Math.cos(angle2) * helixRadius, y, Math.sin(angle2) * helixRadius);

      strand1Points.push(p1);
      strand2Points.push(p2);

      // Sugar-phosphate backbone nodes
      const nodeMat1 = new THREE.MeshStandardMaterial({
        color: colorMode === 'strand' ? 0x10b981 : 0x0ea5e9,
        roughness: 0.2,
        metalness: 0.3
      });
      const nodeMat2 = new THREE.MeshStandardMaterial({
        color: colorMode === 'strand' ? 0x06b6d4 : 0x8b5cf6,
        roughness: 0.2,
        metalness: 0.3
      });

      const node1 = new THREE.Mesh(sphereGeo, nodeMat1);
      node1.position.copy(p1);
      rootGroup.add(node1);

      const node2 = new THREE.Mesh(sphereGeo, nodeMat2);
      node2.position.copy(p2);
      rootGroup.add(node2);

      // Nitrogenous Base pair rungs (Half-rung 1 for Base 1, Half-rung 2 for Base 2)
      const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

      const color1 = colorMode === 'base' ? (BASE_COLORS[b1] || 0x64748b) : 0x10b981;
      const color2 = colorMode === 'base' ? (BASE_COLORS[b2] || 0x64748b) : 0x06b6d4;

      // Base 1 cylinder (p1 to midpoint)
      const mat1 = new THREE.MeshStandardMaterial({ color: color1, roughness: 0.3, metalness: 0.2 });
      const dist1 = p1.distanceTo(midPoint);
      const rung1 = new THREE.Mesh(bondCylinderGeo, mat1);
      rung1.scale.set(1, dist1, 1);
      rung1.position.copy(new THREE.Vector3().addVectors(p1, midPoint).multiplyScalar(0.5));
      rung1.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(midPoint, p1).normalize());
      rootGroup.add(rung1);

      // Base 2 cylinder (midpoint to p2)
      const mat2 = new THREE.MeshStandardMaterial({ color: color2, roughness: 0.3, metalness: 0.2 });
      const dist2 = midPoint.distanceTo(p2);
      const rung2 = new THREE.Mesh(bondCylinderGeo, mat2);
      rung2.scale.set(1, dist2, 1);
      rung2.position.copy(new THREE.Vector3().addVectors(midPoint, p2).multiplyScalar(0.5));
      rung2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(p2, midPoint).normalize());
      rootGroup.add(rung2);

      // Hydrogen bond sphere at midpoint
      const hBondMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const hBondMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), hBondMat);
      hBondMesh.position.copy(midPoint);
      rootGroup.add(hBondMesh);
    }

    // Connect strands with smooth 3D spline tubes
    if (strand1Points.length > 1) {
      const curve1 = new THREE.CatmullRomCurve3(strand1Points);
      const tubeGeo1 = new THREE.TubeGeometry(curve1, numBases * 4, 0.25, 8, false);
      const tubeMat1 = new THREE.MeshStandardMaterial({
        color: colorMode === 'strand' ? 0x059669 : 0x0284c7,
        roughness: 0.25,
        metalness: 0.2
      });
      const tubeMesh1 = new THREE.Mesh(tubeGeo1, tubeMat1);
      rootGroup.add(tubeMesh1);

      const curve2 = new THREE.CatmullRomCurve3(strand2Points);
      const tubeGeo2 = new THREE.TubeGeometry(curve2, numBases * 4, 0.25, 8, false);
      const tubeMat2 = new THREE.MeshStandardMaterial({
        color: colorMode === 'strand' ? 0x0891b2 : 0x7c3aed,
        roughness: 0.25,
        metalness: 0.2
      });
      const tubeMesh2 = new THREE.Mesh(tubeGeo2, tubeMat2);
      rootGroup.add(tubeMesh2);
    }

    // Centering and initial rotation
    rootGroup.rotation.x = 0.2;
    rootGroup.rotation.z = 0.15;

    // Adjust camera distance based on sequence length
    const targetZ = Math.max(30, numBases * 0.75 + 15);
    camera.position.set(0, 0, targetZ);

    // 6. Interaction handling (Drag orbit & Zoom)
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

    // 7. Render animation loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      if (autoRotate && rootGroup && !isDragging) {
        rootGroup.rotation.y += 0.008;
      }
      renderer.render(scene, camera);
    };
    animate();

    // 8. Resize Observer
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
  }, [displaySeq, autoRotate, colorMode]);

  const handleReset = () => {
    if (groupRef.current && cameraRef.current) {
      groupRef.current.rotation.set(0.2, 0, 0.15);
      const targetZ = Math.max(30, displaySeq.length * 0.75 + 15);
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
      className={`relative w-full rounded-2xl overflow-hidden border border-[#BAE6FD] bg-[#F0F9FF] flex flex-col shadow-[0_4px_24px_rgba(14,165,233,0.06)] ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen' : 'h-[500px]'
      } ${className}`}
    >
      {/* 3D Canvas Viewport */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-[#BAE6FD] text-xs text-[#0F172A] shadow-md font-mono">
          <span className="w-2 h-2 rounded-full bg-[#0284C7] animate-pulse" />
          <span className="font-bold text-[#0369A1]">B-DNA Double Helix</span>
          <span className="text-[#CBD5E1]">|</span>
          <span className="font-mono text-[11px] text-[#64748B]">{displaySeq.length} bp rendered</span>
        </div>

        {/* View Controls */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-[#BAE6FD] shadow-md">
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              autoRotate ? 'bg-[#E0F2FE] text-[#0284C7]' : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
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

      {/* Base Legend & Color Mode */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none text-xs">
        <div className="pointer-events-auto flex items-center gap-2.5 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-[#BAE6FD] shadow-md font-mono text-[11px]">
          <span className="text-[#64748B] font-mono font-semibold text-xs">Bases:</span>
          <span className="flex items-center gap-1 text-[#DC2626] font-bold">
            <span className="w-2 h-2 rounded-full bg-[#DC2626] inline-block" /> A
          </span>
          <span className="flex items-center gap-1 text-[#0284C7] font-bold">
            <span className="w-2 h-2 rounded-full bg-[#0284C7] inline-block" /> T
          </span>
          <span className="flex items-center gap-1 text-[#16A34A] font-bold">
            <span className="w-2 h-2 rounded-full bg-[#16A34A] inline-block" /> G
          </span>
          <span className="flex items-center gap-1 text-[#D97706] font-bold">
            <span className="w-2 h-2 rounded-full bg-[#D97706] inline-block" /> C
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-[#BAE6FD] shadow-md text-[11px] font-mono text-[#334155]">
          <button
            onClick={() => setColorMode('base')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              colorMode === 'base' ? 'bg-[#0284C7] text-white font-bold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#E0F2FE]'
            }`}
          >
            By Base
          </button>
          <button
            onClick={() => setColorMode('strand')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              colorMode === 'strand' ? 'bg-[#0284C7] text-white font-bold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#E0F2FE]'
            }`}
          >
            By Strand
          </button>
        </div>
      </div>
    </div>
  );
};
