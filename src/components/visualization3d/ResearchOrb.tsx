import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { AiOrbState } from './types';
import { Sparkles, Brain, Cpu } from 'lucide-react';

interface ResearchOrbProps {
  state?: AiOrbState;
  size?: number;
  className?: string;
  label?: string;
}

export const ResearchOrb: React.FC<ResearchOrbProps> = ({
  state = 'idle',
  size = 64,
  className = '',
  label
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const coreMeshRef = useRef<THREE.Mesh | null>(null);
  const ring1Ref = useRef<THREE.Line | null>(null);
  const ring2Ref = useRef<THREE.Line | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = size;
    const height = size;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 7.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Molecular Intelligence Core Sphere (Pink / Sky Blue)
    const coreGeom = new THREE.IcosahedronGeometry(1.2, 2);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xec4899,
      roughness: 0.2,
      metalness: 0.4,
      wireframe: true,
      emissive: 0xdb2777,
      emissiveIntensity: 0.4
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    scene.add(core);
    coreMeshRef.current = core;

    // Molecular Orbital Rings
    const createRing = (radius: number, color: number) => {
      const points: THREE.Vector3[] = [];
      const segments = 48;
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius));
      }
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 });
      return new THREE.Line(geom, mat);
    };

    const ring1 = createRing(1.85, 0x38bdf8);
    ring1.rotation.x = Math.PI / 4;
    scene.add(ring1);
    ring1Ref.current = ring1;

    const ring2 = createRing(2.2, 0xa855f7);
    ring2.rotation.z = Math.PI / 3;
    scene.add(ring2);
    ring2Ref.current = ring2;

    // Floating Quantum Electrons / Residue Particles
    const particleCount = 28;
    const particleGeom = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 2.2 + Math.random() * 0.8;
      particlePos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      particlePos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      particlePos[i * 3 + 2] = r * Math.cos(phi);
    }
    particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.12, transparent: true, opacity: 0.85 });
    const particles = new THREE.Points(particleGeom, particleMat);
    scene.add(particles);
    particlesRef.current = particles;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const pointLight = new THREE.PointLight(0xec4899, 2, 10);
    pointLight.position.set(2, 2, 2);
    scene.add(pointLight);

    let t = 0;
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      t += 0.02;

      const speedMultiplier = state === 'generating' ? 3.0 : state === 'analyzing' ? 2.0 : 1.0;

      if (core) {
        core.rotation.y += 0.012 * speedMultiplier;
        core.rotation.x += 0.008 * speedMultiplier;
        const scale = 1.0 + Math.sin(t * 2 * speedMultiplier) * 0.08;
        core.scale.set(scale, scale, scale);
      }

      if (ring1) {
        ring1.rotation.y += 0.018 * speedMultiplier;
        ring1.rotation.z += 0.006 * speedMultiplier;
      }

      if (ring2) {
        ring2.rotation.x += 0.015 * speedMultiplier;
        ring2.rotation.y -= 0.01 * speedMultiplier;
      }

      if (particles) {
        particles.rotation.y -= 0.008 * speedMultiplier;
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
  }, [size, state]);

  // Adjust materials based on AI state
  useEffect(() => {
    if (!coreMeshRef.current) return;
    const mat = coreMeshRef.current.material as THREE.MeshStandardMaterial;

    if (state === 'generating') {
      mat.color.setHex(0xec4899);
      mat.emissive.setHex(0xec4899);
      mat.emissiveIntensity = 0.8;
    } else if (state === 'analyzing' || state === 'processing') {
      mat.color.setHex(0x38bdf8);
      mat.emissive.setHex(0x0284c7);
      mat.emissiveIntensity = 0.6;
    } else {
      mat.color.setHex(0xa855f7);
      mat.emissive.setHex(0x7c3aed);
      mat.emissiveIntensity = 0.3;
    }
  }, [state]);

  const getStateDescription = () => {
    if (state === 'analyzing') return 'Analyzing biological context...';
    if (state === 'generating') return 'BioAI synthesizing response...';
    if (state === 'processing') return 'Validating database grounding...';
    return 'BioAI Scientific Engine';
  };

  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      <div 
        ref={mountRef} 
        style={{ width: size, height: size }} 
        className="shrink-0 relative flex items-center justify-center"
      />
      {label !== undefined && (
        <div className="flex flex-col text-left">
          <span className="text-[11px] font-mono font-bold text-white flex items-center gap-1.5">
            <span>{label || 'BioAI Orbital'}</span>
            <span className={`w-1.5 h-1.5 rounded-full ${
              state === 'generating' ? 'bg-[#EC4899] animate-ping' : state === 'analyzing' ? 'bg-[#38BDF8] animate-pulse' : 'bg-emerald-400'
            }`} />
          </span>
          <span className="text-[10px] text-slate-400 font-sans">
            {getStateDescription()}
          </span>
        </div>
      )}
    </div>
  );
};
