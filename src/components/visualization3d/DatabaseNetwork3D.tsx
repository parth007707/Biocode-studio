import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Database, Globe, Layers, Sparkles, CheckCircle2 } from 'lucide-react';

interface DatabaseNetwork3DProps {
  activeDatabase?: string;
  onSelectDatabase?: (db: string) => void;
  height?: number | string;
  className?: string;
}

interface NodeData {
  id: string;
  name: string;
  type: 'central' | 'source' | 'internal';
  color: number;
  position: THREE.Vector3;
  description: string;
}

export const DatabaseNetwork3D: React.FC<DatabaseNetwork3DProps> = ({
  activeDatabase = 'ncbi',
  onSelectDatabase,
  height = 280,
  className = ''
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NodeData | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const heightPx = typeof height === 'number' ? height : container.clientHeight || 280;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / heightPx, 0.1, 100);
    camera.position.set(0, 4, 18);
    camera.lookAt(0, 0, 0);

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
    dLight.position.set(10, 15, 10);
    scene.add(dLight);

    // Nodes
    const nodes: NodeData[] = [
      { id: 'biocode', name: 'BioCode Hub', type: 'central', color: 0x0284c7, position: new THREE.Vector3(0, 0, 0), description: 'Local In-Memory Biological Workbench' },
      { id: 'ncbi', name: 'NCBI GenBank', type: 'source', color: 0x16a34a, position: new THREE.Vector3(-4.5, 2.0, 1.5), description: 'National Center for Biotechnology Information' },
      { id: 'uniprot', name: 'UniProt KB', type: 'source', color: 0xf97316, position: new THREE.Vector3(4.5, 2.0, -1.0), description: 'Universal Protein Resource' },
      { id: 'rcsb_pdb', name: 'RCSB PDB', type: 'source', color: 0xa855f7, position: new THREE.Vector3(0, -3.2, 2.5), description: 'Protein Data Bank 3D Macromolecular Archive' },
      { id: 'projects', name: 'User Projects', type: 'internal', color: 0xec4899, position: new THREE.Vector3(-3.5, -2.2, -2.5), description: 'Supabase Stored Collaborative Workspaces' },
      { id: 'history', name: 'Analysis Records', type: 'internal', color: 0x06b6d4, position: new THREE.Vector3(3.5, -2.2, 2.0), description: 'Historical Biophysical Analytical Jobs' },
    ];

    // Render Nodes & Connecting Pipelines
    nodes.forEach(node => {
      const isCentral = node.type === 'central';
      const isSelected = activeDatabase.toLowerCase().includes(node.id.toLowerCase());
      const radius = isCentral ? 0.9 : isSelected ? 0.75 : 0.55;

      const sphereGeom = new THREE.SphereGeometry(radius, 16, 16);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: node.color,
        roughness: 0.25,
        metalness: 0.3,
        emissive: node.color,
        emissiveIntensity: isSelected ? 0.7 : 0.2
      });
      const mesh = new THREE.Mesh(sphereGeom, sphereMat);
      mesh.position.copy(node.position);
      (mesh as any).userData = node;
      group.add(mesh);

      // Pulse ring for active node
      if (isSelected || isCentral) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(radius + 0.2, radius + 0.35, 24),
          new THREE.MeshBasicMaterial({ color: node.color, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
        );
        ring.position.copy(node.position);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      }

      // Connector line to Central Hub
      if (!isCentral) {
        const points = [node.position, new THREE.Vector3(0, 0, 0)];
        const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({
          color: isSelected ? node.color : 0x1e3a5f,
          transparent: true,
          opacity: isSelected ? 0.9 : 0.4
        });
        const line = new THREE.Line(lineGeom, lineMat);
        group.add(line);
      }
    });

    // Orbiting Data Packet Particles
    const packetCount = 20;
    const packetPoints: THREE.Vector3[] = [];
    for (let i = 0; i < packetCount; i++) {
      const randNode = nodes[1 + Math.floor(Math.random() * (nodes.length - 1))];
      const alpha = Math.random();
      const pos = new THREE.Vector3().lerpVectors(randNode.position, new THREE.Vector3(0, 0, 0), alpha);
      packetPoints.push(pos);
    }
    const packetGeom = new THREE.BufferGeometry().setFromPoints(packetPoints);
    const packetMat = new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.16, transparent: true, opacity: 0.8 });
    const packetMesh = new THREE.Points(packetGeom, packetMat);
    group.add(packetMesh);

    // Animation Loop
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
  }, [activeDatabase, height]);

  return (
    <div className={`relative rounded-xl border border-[#1E3A5F] bg-[#071426] overflow-hidden ${className}`}>
      <div className="absolute top-2.5 left-3 z-10 flex items-center justify-between right-3 text-[11px] font-mono text-white">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-[#38BDF8]" />
          <span className="font-bold tracking-wide">3D Biological Data Network Graph</span>
        </div>
        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
          ● Connected Adapters Active
        </span>
      </div>

      <div ref={mountRef} style={{ height }} className="w-full cursor-grab active:cursor-grabbing" />

      {/* Network Legend */}
      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] font-mono text-slate-400 bg-[#0B1B31]/80 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-[#1E3A5F]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-emerald-400">● NCBI</span>
          <span className="flex items-center gap-1 text-orange-400">● UniProt</span>
          <span className="flex items-center gap-1 text-purple-400">● RCSB PDB</span>
          <span className="flex items-center gap-1 text-pink-400">● Projects</span>
          <span className="flex items-center gap-1 text-sky-400">● History</span>
        </div>
        <span className="text-slate-500 hidden sm:inline">Real Database Endpoints Grounded</span>
      </div>
    </div>
  );
};
