import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Project } from '../../types';
import { FolderKanban, Dna, Activity, Layers, Sparkles } from 'lucide-react';

interface ProjectGraph3DProps {
  projects: Project[];
  activeProjectId?: string | null;
  onSelectProject?: (id: string) => void;
  height?: number | string;
  className?: string;
}

export const ProjectGraph3D: React.FC<ProjectGraph3DProps> = ({
  projects = [],
  activeProjectId = null,
  onSelectProject,
  height = 240,
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
    const heightPx = typeof height === 'number' ? height : container.clientHeight || 240;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / heightPx, 0.1, 100);
    camera.position.set(0, 3, 16);
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
    const dLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dLight.position.set(10, 15, 10);
    scene.add(dLight);

    // Root Hub Node (Workspace Root)
    const rootGeom = new THREE.SphereGeometry(0.8, 16, 16);
    const rootMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.3, emissive: 0x6d28d9, emissiveIntensity: 0.4 });
    const rootMesh = new THREE.Mesh(rootGeom, rootMat);
    rootMesh.position.set(0, 0, 0);
    group.add(rootMesh);

    // Connect Project Nodes
    const displayProjects = projects.slice(0, 6);
    const count = displayProjects.length || 1;

    displayProjects.forEach((proj, idx) => {
      const theta = (idx / count) * Math.PI * 2;
      const radius = 5.2;
      const x = Math.cos(theta) * radius;
      const y = Math.sin(idx * 1.2) * 1.2;
      const z = Math.sin(theta) * radius;

      const isSelected = activeProjectId === proj.id;
      const projGeom = new THREE.SphereGeometry(isSelected ? 0.75 : 0.5, 16, 16);
      const projMat = new THREE.MeshStandardMaterial({
        color: isSelected ? 0xec4899 : 0x0284c7,
        roughness: 0.25,
        emissive: isSelected ? 0xdb2777 : 0x0369a1,
        emissiveIntensity: isSelected ? 0.8 : 0.2
      });
      const projMesh = new THREE.Mesh(projGeom, projMat);
      projMesh.position.set(x, y, z);
      (projMesh as any).userData = { id: proj.id, name: proj.name };
      group.add(projMesh);

      // Connecting pipeline
      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(x, y, z)
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: isSelected ? 0xec4899 : 0x1e3a5f,
        transparent: true,
        opacity: isSelected ? 0.9 : 0.4
      });
      group.add(new THREE.Line(lineGeom, lineMat));

      // Sub-nodes (Sequences & Analyses)
      const subTheta1 = theta + 0.3;
      const subPos1 = new THREE.Vector3(x + Math.cos(subTheta1) * 1.5, y + 0.6, z + Math.sin(subTheta1) * 1.5);
      const subMesh1 = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0x10b981 })
      );
      subMesh1.position.copy(subPos1);
      group.add(subMesh1);

      const subLineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y, z),
        subPos1
      ]);
      group.add(new THREE.Line(subLineGeom, new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.5 })));
    });

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
  }, [projects, activeProjectId, height]);

  return (
    <div className={`relative rounded-xl border border-purple-500/20 bg-[#0A0F1D] overflow-hidden ${className}`}>
      <div className="absolute top-2.5 left-3 z-10 flex items-center justify-between right-3 text-[11px] font-mono text-white">
        <div className="flex items-center gap-1.5 text-purple-400 font-bold">
          <FolderKanban className="w-3.5 h-3.5" />
          <span>3D Research Project Knowledge Graph</span>
        </div>
        <span className="text-[10px] text-slate-400">
          {projects.length} Active Workspaces
        </span>
      </div>

      <div ref={mountRef} style={{ height }} className="w-full cursor-grab active:cursor-grabbing" />

      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] font-mono text-slate-400 bg-[#0B1528]/80 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-slate-800">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-purple-400">● Purple: Workspace Hub</span>
          <span className="flex items-center gap-1 text-sky-400">● Blue: Project Nodes</span>
          <span className="flex items-center gap-1 text-emerald-400">● Green: Stored Sequences</span>
        </div>
      </div>
    </div>
  );
};
