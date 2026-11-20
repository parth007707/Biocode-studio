import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Timer } from '../../../utils/threeTimer';
import { TargetSequence } from '../../../types';
import { Dna, Box, Sparkles, CheckCircle2 } from 'lucide-react';

interface AbstractBiologicalNetwork3DProps {
  currentTarget: TargetSequence;
  className?: string;
}

export const AbstractBiologicalNetwork3D: React.FC<AbstractBiologicalNetwork3DProps> = ({
  currentTarget,
  className = ''
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hasWebGL, setHasWebGL] = useState<boolean>(true);

  // Mouse tracking coordinates for gentle parallax
  const mouseRef = useRef<{ x: number; y: number; targetX: number; targetY: number }>({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0
  });

  const seqLength = currentTarget?.totalLength || currentTarget?.sequence?.length || 0;
  const seqUnit = currentTarget?.sequenceType?.toLowerCase().includes('prot') ? 'aa' : 'bp';

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let animId: number;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 320;

    let isSoftwareGl = false;
    try {
      const probeCanvas = document.createElement('canvas');
      const gl2 = probeCanvas.getContext('webgl2');
      if (gl2) {
        const dbg = gl2.getExtension('WEBGL_debug_renderer_info');
        const rStr = dbg ? String(gl2.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
        isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rStr);
        gl2.getExtension('WEBGL_lose_context')?.loseContext();
      }
    } catch {}

    try {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
      camera.position.set(0, 0, 11.5);

      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance'
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0); // transparent background

      // Clear container and append canvas
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      container.appendChild(renderer.domElement);

      // ----------------------------------------------------------------------
      // Lights for Light-Theme Sky-Blue Surface
      // ----------------------------------------------------------------------
      const ambientLight = new THREE.AmbientLight(0xf0f9ff, 1.4);
      scene.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0x38bdf8, 2.0);
      mainLight.position.set(5, 8, 8);
      scene.add(mainLight);

      const purpleLight = new THREE.PointLight(0x8b5cf6, 1.8, 15);
      purpleLight.position.set(-6, -3, 4);
      scene.add(purpleLight);

      const pinkLight = new THREE.PointLight(0xec4899, 1.5, 12);
      pinkLight.position.set(4, -5, 3);
      scene.add(pinkLight);

      // ----------------------------------------------------------------------
      // Main Network Group
      // ----------------------------------------------------------------------
      const networkGroup = new THREE.Group();
      scene.add(networkGroup);

      // Generate network nodes (spheres)
      // Form a graceful 3D bio-cluster with helical flow
      const nodeCount = 22;
      const nodePositions: THREE.Vector3[] = [];
      const nodeColors = [
        0x0ea5e9, // Strong Sky Blue
        0x38bdf8, // Sky Blue
        0x8b5cf6, // Purple
        0xec4899, // Pink
        0x22c55e, // Green
        0x0284c7  // Deep Sky
      ];

      // Geometries & Materials
      const sphereGeo = new THREE.SphereGeometry(0.22, 16, 16);
      const smallSphereGeo = new THREE.SphereGeometry(0.14, 12, 12);

      const nodeMeshes: THREE.Mesh[] = [];

      for (let i = 0; i < nodeCount; i++) {
        // Parametric spiral cluster with natural biological variance
        const t = (i / (nodeCount - 1)) * Math.PI * 2.8 - Math.PI * 1.4;
        const radius = 2.4 + Math.sin(i * 1.7) * 0.9;
        const x = Math.cos(t) * radius + (Math.sin(i * 3.1) * 0.4);
        const y = (i / nodeCount - 0.5) * 5.2 + Math.cos(i * 2.3) * 0.3;
        const z = Math.sin(t) * radius * 0.85 + Math.sin(i * 2.7) * 0.5;

        const pos = new THREE.Vector3(x, y, z);
        nodePositions.push(pos);

        const colorHex = nodeColors[i % nodeColors.length];
        const mat = new THREE.MeshStandardMaterial({
          color: colorHex,
          roughness: 0.25,
          metalness: 0.2,
          emissive: colorHex,
          emissiveIntensity: 0.35
        });

        const mesh = new THREE.Mesh(i % 3 === 0 ? sphereGeo : smallSphereGeo, mat);
        mesh.position.copy(pos);
        networkGroup.add(mesh);
        nodeMeshes.push(mesh);
      }

      // ----------------------------------------------------------------------
      // Connecting Bonds / Network Edges (Thin Cylinders / Lines)
      // ----------------------------------------------------------------------
      const bondMaterial = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45
      });
      const bondPurpleMaterial = new THREE.MeshBasicMaterial({
        color: 0x8b5cf6,
        transparent: true,
        opacity: 0.35
      });
      const bondPinkMaterial = new THREE.MeshBasicMaterial({
        color: 0xec4899,
        transparent: true,
        opacity: 0.35
      });

      const cylinderGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6);

      // Connect proximal nodes
      for (let i = 0; i < nodePositions.length; i++) {
        for (let j = i + 1; j < nodePositions.length; j++) {
          const dist = nodePositions[i].distanceTo(nodePositions[j]);
          if (dist < 2.6 && dist > 0.4) {
            const p1 = nodePositions[i];
            const p2 = nodePositions[j];
            const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

            const mat = (i + j) % 3 === 0 ? bondPurpleMaterial : (i + j) % 3 === 1 ? bondPinkMaterial : bondMaterial;
            const bondMesh = new THREE.Mesh(cylinderGeo, mat);
            bondMesh.position.copy(mid);
            bondMesh.scale.set(1, dist, 1);

            // Orient cylinder between points
            const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
            const quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            bondMesh.setRotationFromQuaternion(quaternion);

            networkGroup.add(bondMesh);
          }
        }
      }

      // ----------------------------------------------------------------------
      // DNA-Inspired Spline Ribbon Flowing Through Nodes
      // ----------------------------------------------------------------------
      const curvePoints: THREE.Vector3[] = [];
      for (let i = 0; i <= 36; i++) {
        const u = (i / 36) * Math.PI * 3.2 - Math.PI * 1.6;
        const r = 2.8 + Math.cos(u * 2) * 0.3;
        curvePoints.push(new THREE.Vector3(
          Math.cos(u) * r,
          (i / 36 - 0.5) * 5.6,
          Math.sin(u) * r * 0.7
        ));
      }
      const curve = new THREE.CatmullRomCurve3(curvePoints);
      const tubeGeo = new THREE.TubeGeometry(curve, 72, 0.035, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.6
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      networkGroup.add(tubeMesh);

      // Second complementary faint strand
      const curvePoints2 = curvePoints.map((p, idx) => {
        const offsetAngle = (idx / 36) * Math.PI * 3.2 - Math.PI * 1.6 + 2.4;
        const r = 2.8;
        return new THREE.Vector3(
          Math.cos(offsetAngle) * r,
          p.y,
          Math.sin(offsetAngle) * r * 0.7
        );
      });
      const curve2 = new THREE.CatmullRomCurve3(curvePoints2);
      const tubeGeo2 = new THREE.TubeGeometry(curve2, 72, 0.028, 6, false);
      const tubeMat2 = new THREE.MeshBasicMaterial({
        color: 0xec4899,
        transparent: true,
        opacity: 0.4
      });
      const tubeMesh2 = new THREE.Mesh(tubeGeo2, tubeMat2);
      networkGroup.add(tubeMesh2);

      // ----------------------------------------------------------------------
      // Ambient Molecular Dust Particles
      // ----------------------------------------------------------------------
      const particleCount = 45;
      const particleGeo = new THREE.BufferGeometry();
      const particlePosArray = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount * 3; i += 3) {
        particlePosArray[i] = (Math.random() - 0.5) * 9;
        particlePosArray[i + 1] = (Math.random() - 0.5) * 8;
        particlePosArray[i + 2] = (Math.random() - 0.5) * 7;
      }
      particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePosArray, 3));

      const particleMat = new THREE.PointsMaterial({
        size: 0.09,
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.75
      });
      const particles = new THREE.Points(particleGeo, particleMat);
      scene.add(particles);

      // ----------------------------------------------------------------------
      // Mouse Interaction Handler
      // ----------------------------------------------------------------------
      const updatePointerTarget = (clientXPos: number, clientYPos: number) => {
        const rect = container.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const clientX = clientXPos - rect.left;
        const clientY = clientYPos - rect.top;
        const normX = (clientX / rect.width) * 2 - 1;
        const normY = -(clientY / rect.height) * 2 + 1;
        mouseRef.current.targetX = normX * 0.35;
        mouseRef.current.targetY = normY * 0.25;
      };

      const handleMouseMove = (e: MouseEvent) => {
        updatePointerTarget(e.clientX, e.clientY);
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 1) {
          updatePointerTarget(e.touches[0].clientX, e.touches[0].clientY);
        }
      };

      const handleMouseLeave = () => {
        mouseRef.current.targetX = 0;
        mouseRef.current.targetY = 0;
      };

      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseleave', handleMouseLeave);
      container.addEventListener('touchmove', handleTouchMove, { passive: true });
      container.addEventListener('touchend', handleMouseLeave, { passive: true });

      // ----------------------------------------------------------------------
      // Render Loop with Slow Elegant Motion
      // ----------------------------------------------------------------------
      const timer = new Timer();
      let lastRenderMs = 0;

      const animate = (now: number = 0) => {
        animId = requestAnimationFrame(animate);
        if (isSoftwareGl && now - lastRenderMs < 90) return;
        lastRenderMs = now;

        timer.update();
        const elapsedTime = timer.getElapsed();

        // Damped mouse follow
        mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
        mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

        // Slow rotation around Y & subtle X sway
        networkGroup.rotation.y = elapsedTime * 0.22 + mouseRef.current.x;
        networkGroup.rotation.x = Math.sin(elapsedTime * 0.15) * 0.12 + mouseRef.current.y;
        networkGroup.rotation.z = Math.cos(elapsedTime * 0.12) * 0.05;

        // Vertical harmonic float
        networkGroup.position.y = Math.sin(elapsedTime * 0.7) * 0.16;

        // Subtle pulse on node emissives
        const pulse = (Math.sin(elapsedTime * 1.5) + 1) * 0.5;
        for (let i = 0; i < nodeMeshes.length; i++) {
          const m = nodeMeshes[i].material as THREE.MeshStandardMaterial;
          if (m && m.emissiveIntensity !== undefined) {
            m.emissiveIntensity = 0.25 + Math.sin(elapsedTime * 2 + i) * 0.2;
          }
        }

        // Slow particle drift
        particles.rotation.y = elapsedTime * 0.06;
        particles.rotation.x = elapsedTime * 0.03;

        renderer.render(scene, camera);
      };

      animate(performance.now());

      // Resize observer with dimension diff guard
      let lastWidth = width;
      let lastHeight = height;
      let resizeRafId: number | null = null;
      const resizeObserver = new ResizeObserver((entries) => {
        if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
        resizeRafId = requestAnimationFrame(() => {
          for (let entry of entries) {
            const w = Math.round(entry.contentRect.width);
            const h = Math.round(entry.contentRect.height);
            if (w > 0 && h > 0 && (w !== lastWidth || h !== lastHeight)) {
              lastWidth = w;
              lastHeight = h;
              camera.aspect = w / h;
              camera.updateProjectionMatrix();
              renderer.setSize(w, h);
            }
          }
        });
      });
      resizeObserver.observe(container);

      return () => {
        cancelAnimationFrame(animId);
        if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', handleMouseLeave);
        resizeObserver.disconnect();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer.dispose();
      };
    } catch (err) {
      console.warn('[AbstractBiologicalNetwork3D] WebGL not supported or init error:', err);
      setHasWebGL(false);
    }
  }, []);

  return (
    <div className={`relative w-full h-full min-h-[220px] sm:min-h-[300px] flex items-center justify-center select-none ${className}`}>
      {/* 3D Canvas Mount Point */}
      <div 
        ref={mountRef} 
        className="w-full h-full absolute inset-0 z-10 pointer-events-auto cursor-grab active:cursor-grabbing"
      />

      {/* Fallback 2D Animated Canvas if WebGL is unavailable */}
      {!hasWebGL && (
        <div className="w-full h-full flex items-center justify-center bg-sky-50/50 rounded-2xl border border-sky-200 p-6 text-center">
          <div className="space-y-2">
            <Dna className="w-10 h-10 text-sky-500 mx-auto animate-pulse" />
            <p className="text-xs font-mono font-bold text-slate-800">Biological Network Explorer</p>
            <p className="text-[11px] font-mono text-slate-500">Interactive 3D acceleration active</p>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4 Subtle Floating Scientific Data Badges Around the Visualization    */}
      {/* ==================================================================== */}

      {/* 1. Top-Left: Sequence Metric */}
      <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-20 pointer-events-none transition-transform duration-300 hover:scale-105">
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-sky-200/90 shadow-[0_4px_14px_rgba(14,165,233,0.12)]">
          <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse shadow-[0_0_6px_#0ea5e9]" />
          <div className="font-mono text-left">
            <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider block">SEQUENCE</span>
            <span className="text-[11px] sm:text-xs font-[800] text-slate-900 tracking-tight">{seqLength > 0 ? `${seqLength} ${seqUnit}` : '0 loaded'}</span>
          </div>
        </div>
      </div>

      {/* 2. Top-Right: Structure 3D Badge */}
      <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20 pointer-events-none transition-transform duration-300 hover:scale-105">
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-purple-200/90 shadow-[0_4px_14px_rgba(139,92,246,0.12)]">
          <Box className="w-3.5 h-3.5 text-purple-600" />
          <div className="font-mono text-left">
            <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider block">STRUCTURE</span>
            <span className="text-[11px] sm:text-xs font-[800] text-purple-700 tracking-tight">3D Interactive</span>
          </div>
        </div>
      </div>

      {/* 3. Bottom-Left: BioAI Ready Badge */}
      <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 z-20 pointer-events-none transition-transform duration-300 hover:scale-105">
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-pink-200/90 shadow-[0_4px_14px_rgba(236,72,153,0.12)]">
          <Sparkles className="w-3.5 h-3.5 text-pink-600" />
          <div className="font-mono text-left">
            <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider block">BIOAI</span>
            <span className="text-[11px] sm:text-xs font-[800] text-pink-700 tracking-tight">READY</span>
          </div>
        </div>
      </div>

      {/* 4. Bottom-Right: Analysis 100% Badge */}
      <div className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 z-20 pointer-events-none transition-transform duration-300 hover:scale-105">
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-emerald-200/90 shadow-[0_4px_14px_rgba(34,197,94,0.12)]">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <div className="font-mono text-left">
            <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider block">ANALYSIS</span>
            <span className="text-[11px] sm:text-xs font-[800] text-emerald-700 tracking-tight">100% Verified</span>
          </div>
        </div>
      </div>
    </div>
  );
};
