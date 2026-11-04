import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Layers, RotateCcw, Sparkles, Thermometer, Zap, Activity } from 'lucide-react';

interface Analysis3DVisualizationProps {
  mode: 'composition' | 'hydropathy' | 'charge' | 'secondary';
  sequence: string;
  analysisData?: any;
  height?: number | string;
  className?: string;
}

export const Analysis3DVisualization: React.FC<Analysis3DVisualizationProps> = ({
  mode,
  sequence,
  analysisData,
  height = 280,
  className = ''
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{ label: string; value: string | number } | null>(null);

  const cleanSeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const heightPx = typeof height === 'number' ? height : container.clientHeight || 280;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 1000);
    camera.position.set(0, 5, 22);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setSize(width, heightPx);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(10, 20, 15);
    scene.add(dir);

    // -----------------------------------------------------------------
    // Mode 1: 3D AMINO ACID / NUCLEOTIDE COMPOSITION TOPOLOGY
    // -----------------------------------------------------------------
    if (mode === 'composition') {
      const counts: Record<string, number> = {};
      for (const char of cleanSeq) {
        counts[char] = (counts[char] || 0) + 1;
      }
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 16);
      const total = cleanSeq.length || 1;

      entries.forEach(([char, count], idx) => {
        const theta = (idx / entries.length) * Math.PI * 2;
        const radius = 5.5;
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;
        const barHeight = Math.max(0.5, (count / total) * 18);

        // Cylinder Pillar
        const geom = new THREE.CylinderGeometry(0.35, 0.35, barHeight, 12);
        geom.translate(0, barHeight / 2, 0);
        const col = new THREE.Color().setHSL((idx / entries.length), 0.8, 0.5);
        const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, metalness: 0.2 });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(x, 0, z);
        group.add(mesh);

        // Residue sphere top
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 12, 12),
          new THREE.MeshStandardMaterial({ color: col, roughness: 0.2, emissive: col, emissiveIntensity: 0.2 })
        );
        sphere.position.set(x, barHeight, z);
        group.add(sphere);
      });

      // Central Base Platform
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(4.5, 6.5, 32),
        new THREE.MeshBasicMaterial({ color: 0x1e3a5f, side: THREE.DoubleSide, transparent: true, opacity: 0.4 })
      );
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

    // -----------------------------------------------------------------
    // Mode 2: 3D HYDROPATHY TOPOLOGY LANDSCAPE (Kyte-Doolittle)
    // -----------------------------------------------------------------
    } else if (mode === 'hydropathy') {
      const points: THREE.Vector3[] = [];
      const sampleLimit = Math.min(cleanSeq.length, 120);
      const kdValues: Record<string, number> = {
        I: 4.5, V: 4.2, L: 3.8, F: 2.8, C: 2.5, M: 1.9, A: 1.8, G: -0.4, T: -0.7,
        S: -0.8, W: -0.9, Y: -1.3, P: -1.6, H: -3.2, E: -3.5, Q: -3.5, D: -3.5,
        N: -3.5, K: -3.9, R: -4.5
      };

      for (let i = 0; i < sampleLimit; i++) {
        const char = cleanSeq[i];
        const kd = kdValues[char] ?? 0;
        const x = (i - sampleLimit / 2) * 0.25;
        const y = kd * 0.8; // Peak = Hydrophobic, Valley = Hydrophilic
        const z = Math.sin(i * 0.3) * 1.5;
        points.push(new THREE.Vector3(x, y, z));

        // Sphere indicator
        const isHydrophobic = kd > 0;
        const col = isHydrophobic ? 0xf97316 : 0x0284c7; // Orange vs Sky Blue
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.24, 8, 8),
          new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 })
        );
        sphere.position.set(x, y, z);
        group.add(sphere);
      }

      if (points.length > 2) {
        const curve = new THREE.CatmullRomCurve3(points);
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(curve, sampleLimit * 2, 0.16, 8, false),
          new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.3 })
        );
        group.add(tube);
      }

      // Neutral zero line indicator
      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-sampleLimit * 0.13, 0, 0),
        new THREE.Vector3(sampleLimit * 0.13, 0, 0)
      ]);
      const zeroLine = new THREE.Line(lineGeom, new THREE.LineDashedMaterial({ color: 0x64748b, dashSize: 0.5, gapSize: 0.3 }));
      group.add(zeroLine);

    // -----------------------------------------------------------------
    // Mode 3: 3D CHARGE DISTRIBUTION SURFACE (+ vs -)
    // -----------------------------------------------------------------
    } else {
      const chargeLimit = Math.min(cleanSeq.length, 100);
      for (let i = 0; i < chargeLimit; i++) {
        const char = cleanSeq[i];
        const isPositive = ['K', 'R', 'H'].includes(char);
        const isNegative = ['D', 'E'].includes(char);
        const theta = (i / chargeLimit) * Math.PI * 4;
        const r = 4.0;
        const x = Math.cos(theta) * r;
        const y = (i - chargeLimit / 2) * 0.22;
        const z = Math.sin(theta) * r;

        const col = isPositive ? 0x2563eb : isNegative ? 0xdc2626 : 0x94a3b8;
        const size = isPositive || isNegative ? 0.36 : 0.18;

        const node = new THREE.Mesh(
          new THREE.SphereGeometry(size, 10, 10),
          new THREE.MeshStandardMaterial({
            color: col,
            emissive: isPositive ? 0x1d4ed8 : isNegative ? 0xb91c1c : 0x000000,
            emissiveIntensity: isPositive || isNegative ? 0.4 : 0
          })
        );
        node.position.set(x, y, z);
        group.add(node);
      }
    }

    // Animation Loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      if (group) {
        group.rotation.y += 0.005;
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
  }, [mode, cleanSeq, height]);

  return (
    <div className={`relative rounded-xl border border-[#1E3A5F] bg-[#071426] overflow-hidden ${className}`}>
      <div className="absolute top-2.5 left-3 z-10 flex items-center gap-2 text-[11px] font-mono text-white">
        <Sparkles className="w-3.5 h-3.5 text-[#38BDF8]" />
        <span className="font-bold uppercase tracking-wider">
          {mode === 'composition' ? '3D Residue Topology Map' : mode === 'hydropathy' ? '3D Kyte-Doolittle Hydrophobic Landscape' : '3D Electrostatic Region Distribution'}
        </span>
      </div>

      <div ref={mountRef} style={{ height }} className="w-full cursor-grab active:cursor-grabbing" />

      {/* Legend */}
      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] font-mono text-slate-400 bg-[#0B1B31]/80 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-[#1E3A5F]">
        {mode === 'composition' && (
          <span>Pillars represent relative amino acid / base abundance across the sequence</span>
        )}
        {mode === 'hydropathy' && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-orange-400">● Peaks: Hydrophobic (Membrane-core)</span>
            <span className="flex items-center gap-1 text-sky-400">● Valleys: Hydrophilic (Solvent-exposed)</span>
          </div>
        )}
        {mode === 'charge' && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-blue-400">● Blue: Basic (+)</span>
            <span className="flex items-center gap-1 text-red-400">● Red: Acidic (-)</span>
            <span className="flex items-center gap-1 text-slate-400">● Slate: Neutral</span>
          </div>
        )}
      </div>
    </div>
  );
};
