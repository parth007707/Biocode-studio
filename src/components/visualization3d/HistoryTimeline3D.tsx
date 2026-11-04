import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { AnalysisRecord } from '../../types';
import { History, Activity, Sparkles } from 'lucide-react';

interface HistoryTimeline3DProps {
  analyses: AnalysisRecord[];
  selectedId?: string | null;
  onSelectAnalysis?: (id: string) => void;
  height?: number | string;
  className?: string;
}

export const HistoryTimeline3D: React.FC<HistoryTimeline3DProps> = ({
  analyses = [],
  selectedId = null,
  onSelectAnalysis,
  height = 200,
  className = ''
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const heightPx = typeof height === 'number' ? height : container.clientHeight || 200;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / heightPx, 0.1, 100);
    camera.position.set(0, 0, 16);

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
    const dLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dLight.position.set(5, 10, 15);
    scene.add(dLight);

    const count = Math.min(analyses.length, 12) || 4;
    const timelinePoints: THREE.Vector3[] = [];

    // Chronological sinusoidal helix ribbon
    for (let i = 0; i < count; i++) {
      const x = (i - count / 2) * 2.2;
      const y = Math.sin(i * 0.8) * 1.4;
      const z = Math.cos(i * 0.8) * 1.0;
      const pos = new THREE.Vector3(x, y, z);
      timelinePoints.push(pos);

      const record = analyses[i];
      const isSelected = record && selectedId === record.id;
      const col = isSelected ? 0xec4899 : record ? 0x0284c7 : 0x64748b;

      // Event node sphere
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(isSelected ? 0.6 : 0.38, 14, 14),
        new THREE.MeshStandardMaterial({
          color: col,
          roughness: 0.25,
          emissive: col,
          emissiveIntensity: isSelected ? 0.7 : 0.2
        })
      );
      sphere.position.copy(pos);
      group.add(sphere);

      // Pulse ring for selected
      if (isSelected) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.7, 0.88, 20),
          new THREE.MeshBasicMaterial({ color: 0xec4899, side: THREE.DoubleSide })
        );
        ring.position.copy(pos);
        group.add(ring);
      }
    }

    if (timelinePoints.length > 1) {
      const curve = new THREE.CatmullRomCurve3(timelinePoints);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, count * 3, 0.12, 8, false),
        new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3, metalness: 0.3 })
      );
      group.add(tube);
    }

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      if (group) {
        group.rotation.y = Math.sin(Date.now() * 0.0008) * 0.25;
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
  }, [analyses, selectedId, height]);

  return (
    <div className={`relative rounded-xl border border-sky-500/20 bg-[#071322] overflow-hidden ${className}`}>
      <div className="absolute top-2.5 left-3 z-10 flex items-center justify-between right-3 text-[11px] font-mono text-white">
        <div className="flex items-center gap-1.5 text-sky-400 font-bold">
          <History className="w-3.5 h-3.5" />
          <span>3D Analysis History Chronology Ribbon</span>
        </div>
        <span className="text-[10px] text-slate-400">
          {analyses.length} Saved In-Silico Runs
        </span>
      </div>

      <div ref={mountRef} style={{ height }} className="w-full cursor-grab active:cursor-grabbing" />
    </div>
  );
};
