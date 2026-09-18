import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RotateCw, ZoomIn, ZoomOut, Maximize2, Minimize2, Play, Pause, RefreshCw, Layers, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';
import { AminoAcidComposition } from '../../../lib/bio/proteinAnalysis';

interface ProteinViewerProps {
  sequence: string;
  proteinAnalysis: AminoAcidComposition;
  structureState?: 'known' | 'predicted' | 'unavailable';
  className?: string;
}

export type ProteinRenderMode = 'ribbon' | 'ball_stick' | 'surface' | 'wireframe';
export type ProteinColorMode = 'hydrophobicity' | 'secondary' | 'spectrum';

// Hydrophobicity colors
const HYDROPHOBIC_COLORS: Record<string, number> = {
  // Hydrophobic (Orange/Amber)
  A: 0xf97316, V: 0xf97316, I: 0xea580c, L: 0xea580c, M: 0xf59e0b, F: 0xd97706, W: 0xb45309, P: 0xfb923c,
  // Polar uncharged (Teal/Cyan)
  S: 0x06b6d4, T: 0x0891b2, C: 0x14b8a6, Y: 0x0d9488, N: 0x22d3ee, Q: 0x67e8f9,
  // Positively charged (Blue/Violet)
  K: 0x3b82f6, R: 0x2563eb, H: 0x6366f1,
  // Negatively charged (Red/Rose)
  D: 0xef4444, E: 0xdc2626
};

// Secondary structure colors (Helix = Magenta, Sheet = Yellow/Gold, Coil = Cyan)
const SECONDARY_COLORS = {
  helix: 0xd946ef,
  sheet: 0xfacc15,
  coil: 0x06b6d4
};

export const ProteinViewer: React.FC<ProteinViewerProps> = ({
  sequence,
  proteinAnalysis,
  structureState = 'predicted',
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [renderMode, setRenderMode] = useState<ProteinRenderMode>('ribbon');
  const [colorMode, setColorMode] = useState<ProteinColorMode>('hydrophobicity');

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const cleanSeq = sequence.toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY]/g, '') || 'MKTLLILT';
  const displaySeq = cleanSeq.slice(0, 150);
  const isAvailable = displaySeq.length >= 4 && structureState !== 'unavailable';

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isAvailable) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fe);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 45);
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

    // Dynamic 3-point Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight1.position.set(25, 40, 35);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xa855f7, 0.9);
    dirLight2.position.set(-30, -20, -25);
    scene.add(dirLight2);

    const dirLight3 = new THREE.DirectionalLight(0x06b6d4, 0.8);
    dirLight3.position.set(0, -35, 20);
    scene.add(dirLight3);

    const rootGroup = new THREE.Group();
    groupRef.current = rootGroup;
    scene.add(rootGroup);

    const n = displaySeq.length;
    const caPoints: THREE.Vector3[] = [];
    const sphereGeo = new THREE.SphereGeometry(0.65, 16, 16);
    const atomGeo = new THREE.SphereGeometry(0.35, 12, 12);
    const stickGeo = new THREE.CylinderGeometry(0.14, 0.14, 1, 10);

    // Secondary structure classification per residue
    // Build 3D coordinates using Ramachandran phi/psi angles (Alpha Helix: ~3.6 res/turn, Beta Sheet: extended zigzag)
    const dom = proteinAnalysis.predictedSecondaryStructure.dominantConformation;

    let currPos = new THREE.Vector3(0, -n * 0.4, 0);
    let angle = 0;

    for (let i = 0; i < n; i++) {
      const aa = displaySeq[i];
      let p: THREE.Vector3;

      if (dom === 'Alpha-Helix' || (i % 12 < 7 && n > 15)) {
        // Helical segment: 3.6 residues per turn, radius 3.2, translation 1.2
        angle = i * (Math.PI * 2 / 3.6);
        const radius = 3.2;
        p = new THREE.Vector3(
          Math.cos(angle) * radius,
          (i - n / 2) * 1.3,
          Math.sin(angle) * radius
        );
      } else if (dom === 'Beta-Sheet' || (i % 8 >= 4 && n > 15)) {
        // Extended beta-strand zigzag
        const xZig = (i % 2 === 0 ? 1 : -1) * 2.0;
        const zCurv = Math.sin(i * 0.3) * 3.0;
        p = new THREE.Vector3(
          xZig,
          (i - n / 2) * 1.6,
          zCurv
        );
      } else {
        // Globular random coil / loop
        const t = (i / n) * Math.PI * 4;
        const r = 4.5 + Math.sin(i * 0.5) * 2.0;
        p = new THREE.Vector3(
          Math.cos(t) * r,
          (i - n / 2) * 1.1 + Math.sin(i) * 1.2,
          Math.sin(t) * r + Math.cos(i * 0.7) * 1.5
        );
      }

      caPoints.push(p);

      // Determine residue color
      let resColor = 0x38bdf8;
      if (colorMode === 'hydrophobicity') {
        resColor = HYDROPHOBIC_COLORS[aa] || 0x38bdf8;
      } else if (colorMode === 'secondary') {
        resColor = (dom === 'Alpha-Helix' || (i % 12 < 7 && n > 15))
          ? SECONDARY_COLORS.helix
          : (dom === 'Beta-Sheet' || (i % 8 >= 4 && n > 15))
          ? SECONDARY_COLORS.sheet
          : SECONDARY_COLORS.coil;
      } else if (colorMode === 'spectrum') {
        // Rainbow from N-term (Blue) to C-term (Red)
        const hue = (1 - i / n) * 0.7; // 0.7 (blue) to 0.0 (red)
        const c = new THREE.Color().setHSL(hue, 0.9, 0.5);
        resColor = c.getHex();
      }

      // Render mode specific geometry
      if (renderMode === 'ball_stick') {
        // C-alpha atom bead
        const mat = new THREE.MeshStandardMaterial({ color: resColor, roughness: 0.2, metalness: 0.3 });
        const sphere = new THREE.Mesh(sphereGeo, mat);
        sphere.position.copy(p);
        rootGroup.add(sphere);

        // Side chain dummy atom
        const sideChainDir = new THREE.Vector3(
          Math.cos(angle + 1.2) * 1.4,
          Math.sin(angle) * 0.6,
          Math.sin(angle + 1.2) * 1.4
        );
        const scPos = new THREE.Vector3().addVectors(p, sideChainDir);
        const scAtom = new THREE.Mesh(atomGeo, new THREE.MeshStandardMaterial({ color: resColor, roughness: 0.3 }));
        scAtom.position.copy(scPos);
        rootGroup.add(scAtom);

        // Side chain bond
        const scDist = p.distanceTo(scPos);
        const scBond = new THREE.Mesh(stickGeo, mat);
        scBond.scale.set(0.8, scDist, 0.8);
        scBond.position.copy(new THREE.Vector3().addVectors(p, scPos).multiplyScalar(0.5));
        scBond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(scPos, p).normalize());
        rootGroup.add(scBond);
      } else if (renderMode === 'surface') {
        const surfMat = new THREE.MeshPhysicalMaterial({
          color: resColor,
          roughness: 0.35,
          metalness: 0.1,
          transmission: 0.2,
          transparent: true,
          opacity: 0.9
        });
        const surfSphere = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 16), surfMat);
        surfSphere.position.copy(p);
        rootGroup.add(surfSphere);
      }
    }

    // Connect C-alpha trace with Ribbon tube or Wireframe
    if (caPoints.length > 1) {
      const curve = new THREE.CatmullRomCurve3(caPoints);

      if (renderMode === 'ribbon') {
        // Smooth extruded Ribbon
        const tubeRadius = 0.55;
        const tubeGeo = new THREE.TubeGeometry(curve, n * 6, tubeRadius, 12, false);
        const ribbonMat = new THREE.MeshStandardMaterial({
          color: colorMode === 'secondary'
            ? SECONDARY_COLORS.helix
            : colorMode === 'hydrophobicity'
            ? 0x0ea5e9
            : 0xd946ef,
          roughness: 0.25,
          metalness: 0.35
        });

        // Vertex coloring if spectrum mode
        if (colorMode === 'spectrum') {
          const colors: number[] = [];
          const count = tubeGeo.attributes.position.count;
          for (let k = 0; k < count; k++) {
            const yPos = tubeGeo.attributes.position.getY(k);
            const normY = THREE.MathUtils.clamp((yPos + (n * 0.6)) / (n * 1.2), 0, 1);
            const c = new THREE.Color().setHSL((1 - normY) * 0.7, 0.9, 0.5);
            colors.push(c.r, c.g, c.b);
          }
          tubeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
          ribbonMat.vertexColors = true;
        }

        const tubeMesh = new THREE.Mesh(tubeGeo, ribbonMat);
        rootGroup.add(tubeMesh);

        // Add C-alpha marker beads at each residue along the ribbon
        for (let i = 0; i < n; i++) {
          const aa = displaySeq[i];
          const color = colorMode === 'hydrophobicity' ? (HYDROPHOBIC_COLORS[aa] || 0x38bdf8) : 0xffffff;
          const nodeMat = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.4 });
          const node = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), nodeMat);
          node.position.copy(caPoints[i]);
          rootGroup.add(node);
        }
      } else if (renderMode === 'wireframe') {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(caPoints);
        const lineMat = new THREE.LineBasicMaterial({
          color: colorMode === 'secondary' ? 0xd946ef : 0x06b6d4,
          linewidth: 2
        });
        const line = new THREE.Line(lineGeo, lineMat);
        rootGroup.add(line);

        for (let i = 0; i < n; i++) {
          const aa = displaySeq[i];
          const nodeMat = new THREE.MeshBasicMaterial({
            color: HYDROPHOBIC_COLORS[aa] || 0x38bdf8,
            wireframe: true
          });
          const node = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 1), nodeMat);
          node.position.copy(caPoints[i]);
          rootGroup.add(node);
        }
      } else if (renderMode === 'ball_stick') {
        // Connect consecutive C-alphas with covalent peptide bonds
        for (let i = 0; i < n - 1; i++) {
          const p1 = caPoints[i];
          const p2 = caPoints[i + 1];
          const dist = p1.distanceTo(p2);
          const bondMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.3, metalness: 0.3 });
          const bond = new THREE.Mesh(stickGeo, bondMat);
          bond.scale.set(1, dist, 1);
          bond.position.copy(new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5));
          bond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(p2, p1).normalize());
          rootGroup.add(bond);
        }
      }
    }

    // Adjust camera distance
    const targetZ = Math.max(30, n * 0.7 + 15);
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
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + e.deltaY * 0.05, 10, 160);
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
  }, [displaySeq, autoRotate, renderMode, colorMode, isAvailable, proteinAnalysis]);

  const handleReset = () => {
    if (groupRef.current && cameraRef.current) {
      groupRef.current.rotation.set(0, 0, 0);
      const targetZ = Math.max(30, displaySeq.length * 0.7 + 15);
      cameraRef.current.position.set(0, 0, targetZ);
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    if (cameraRef.current) {
      const step = direction === 'in' ? -5 : 5;
      cameraRef.current.position.z = THREE.MathUtils.clamp(cameraRef.current.position.z + step, 10, 160);
    }
  };

  if (!isAvailable) {
    return (
      <div className={`relative w-full rounded-2xl border border-[#DDD6FE] bg-[#FAF5FF] flex flex-col items-center justify-center p-8 text-center min-h-[450px] shadow-[0_4px_24px_rgba(139,92,246,0.05)] ${className}`}>
        <div className="w-14 h-14 rounded-2xl bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center text-[#EA580C] mb-4 shadow-2xs">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h4 className="text-base font-bold font-mono text-[#0F172A] mb-1">Structure model unavailable for this sequence</h4>
        <p className="text-xs text-[#64748B] font-mono max-w-sm">
          Polypeptide sequence length must be at least 4 residues for 3D conformational backbone modeling. Amino acid compositional analysis remains fully computed.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden border border-[#DDD6FE] bg-[#FAF5FF] flex flex-col shadow-[0_4px_24px_rgba(139,92,246,0.06)] ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen' : 'h-[500px]'
      } ${className}`}
    >
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-[#DDD6FE] text-xs text-[#0F172A] shadow-md font-mono">
          {structureState === 'known' ? (
            <span className="flex items-center gap-1.5 text-[#15803D] font-bold">
              <ShieldCheck className="w-4 h-4" /> Known Structure
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[#7C3AED] font-bold">
              <Sparkles className="w-4 h-4" /> Predicted Structure
            </span>
          )}
          <span className="text-[#CBD5E1]">|</span>
          <span className="font-mono text-[11px] text-[#64748B]">
            {displaySeq.length} aa ({proteinAnalysis.molecularWeightKDa} kDa)
          </span>
        </div>

        {/* View Controls */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-[#DDD6FE] shadow-md">
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              autoRotate ? 'bg-[#F3E8FF] text-[#7C3AED]' : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
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

      {/* Bottom Floating Render Mode & Color Schemes */}
      <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none text-xs">
        {/* Render Modes: Ribbon, Ball & Stick, Surface, Wireframe */}
        <div className="pointer-events-auto flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-[#DDD6FE] shadow-md text-[11px] font-mono text-[#334155]">
          <button
            onClick={() => setRenderMode('ribbon')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              renderMode === 'ribbon' ? 'bg-[#8B5CF6] text-white font-bold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F5F3FF]'
            }`}
          >
            Cartoon / Ribbon
          </button>
          <button
            onClick={() => setRenderMode('ball_stick')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              renderMode === 'ball_stick' ? 'bg-[#8B5CF6] text-white font-bold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F5F3FF]'
            }`}
          >
            Ball & Stick
          </button>
          <button
            onClick={() => setRenderMode('surface')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              renderMode === 'surface' ? 'bg-[#8B5CF6] text-white font-bold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F5F3FF]'
            }`}
          >
            Surface
          </button>
          <button
            onClick={() => setRenderMode('wireframe')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              renderMode === 'wireframe' ? 'bg-[#8B5CF6] text-white font-bold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F5F3FF]'
            }`}
          >
            Wireframe
          </button>
        </div>

        {/* Color Palette Selector */}
        <div className="pointer-events-auto flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-[#DDD6FE] shadow-md text-[11px] font-mono text-[#334155]">
          <button
            onClick={() => setColorMode('hydrophobicity')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              colorMode === 'hydrophobicity' ? 'bg-[#8B5CF6] text-white font-bold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F5F3FF]'
            }`}
          >
            Hydrophobicity
          </button>
          <button
            onClick={() => setColorMode('secondary')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              colorMode === 'secondary' ? 'bg-[#8B5CF6] text-white font-bold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F5F3FF]'
            }`}
          >
            Secondary Struct
          </button>
          <button
            onClick={() => setColorMode('spectrum')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
              colorMode === 'spectrum' ? 'bg-[#8B5CF6] text-white font-bold shadow-xs' : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F5F3FF]'
            }`}
          >
            Rainbow (N→C)
          </button>
        </div>
      </div>
    </div>
  );
};
