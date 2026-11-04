import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Dna, RefreshCw, Play, Pause, RotateCcw, Sparkles } from 'lucide-react';

interface HeroDnaAnimationProps {
  className?: string;
}

export const HeroDnaAnimation: React.FC<HeroDnaAnimationProps> = ({ className = '' }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hasWebGlError, setHasWebGlError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [force3dOnMobile, setForce3dOnMobile] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  // References for animation control
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  // Check user environment on mount (reduced-motion and mobile)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(motionQuery.matches);

      const handleMotionChange = (e: MediaQueryListEvent) => {
        setPrefersReducedMotion(e.matches);
      };
      motionQuery.addEventListener('change', handleMotionChange);

      const checkMobile = () => {
        const isSmallScreen = window.innerWidth < 640;
        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        setIsMobileDevice(isSmallScreen || isMobileUA);
      };

      checkMobile();
      window.addEventListener('resize', checkMobile);

      return () => {
        motionQuery.removeEventListener('change', handleMotionChange);
        window.removeEventListener('resize', checkMobile);
      };
    }
  }, []);

  const shouldShowStaticFallback = (prefersReducedMotion || (isMobileDevice && !force3dOnMobile)) && !hasWebGlError;

  // Initialize Three.js when eligible
  useEffect(() => {
    if (shouldShowStaticFallback) {
      setIsLoading(false);
      return;
    }

    const container = mountRef.current;
    if (!container) return;

    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let animationFrameId: number;
    let isVisible = true;
    let isTabActive = true;

    // Track disposables for clean unmounting
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const materialsToDispose: THREE.Material[] = [];

    try {
      // 1. Scene setup
      scene = new THREE.Scene();

      const width = container.clientWidth || 380;
      const height = container.clientHeight || 280;

      camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
      camera.position.set(0, 0, 17);

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power'
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      // 2. Clean scientific studio lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.15);
      scene.add(ambientLight);

      const keyLightSky = new THREE.DirectionalLight(0x20aeea, 1.5);
      keyLightSky.position.set(7, 12, 9);
      scene.add(keyLightSky);

      const fillLightPink = new THREE.DirectionalLight(0xec4899, 1.2);
      fillLightPink.position.set(-7, -6, -5);
      scene.add(fillLightPink);

      const rimLightPurple = new THREE.DirectionalLight(0x7c3aed, 0.65);
      rimLightPurple.position.set(0, -10, 6);
      scene.add(rimLightPurple);

      // 3. DNA Double Helix Group
      const dnaGroup = new THREE.Group();
      scene.add(dnaGroup);

      const numBases = 28;
      const radius = 2.35;
      const length = 12.0;
      const turns = 2.1;
      const majorMinorShift = 2.35; // radians shift for authentic B-DNA major/minor grooving

      // Shared geometries
      const nodeGeometry = new THREE.SphereGeometry(0.24, 16, 16);
      const halfRungGeometry = new THREE.CylinderGeometry(0.045, 0.045, 1, 8);
      const bondDotGeometry = new THREE.SphereGeometry(0.08, 10, 10);
      geometriesToDispose.push(nodeGeometry, halfRungGeometry, bondDotGeometry);

      // Materials: Sky Blue Strand A, Pink Strand B
      const strand1Material = new THREE.MeshStandardMaterial({
        color: 0x20aeea, // Sky Blue
        roughness: 0.22,
        metalness: 0.12,
      });

      const strand2Material = new THREE.MeshStandardMaterial({
        color: 0xec4899, // Pink
        roughness: 0.22,
        metalness: 0.12,
      });

      // Scientific Base Pair Rung Materials (Adenine-Thymine & Guanine-Cytosine pairings)
      const matPurple = new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.35, transparent: true, opacity: 0.9 });
      const matGreen = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.35, transparent: true, opacity: 0.9 });
      const matSky = new THREE.MeshStandardMaterial({ color: 0x0b8fcc, roughness: 0.35, transparent: true, opacity: 0.9 });
      const matOrange = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.35, transparent: true, opacity: 0.9 });
      const matHydrogen = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });

      materialsToDispose.push(
        strand1Material,
        strand2Material,
        matPurple,
        matGreen,
        matSky,
        matOrange,
        matHydrogen
      );

      const strand1Points: THREE.Vector3[] = [];
      const strand2Points: THREE.Vector3[] = [];

      // Construct Nodes & Base Pair Rungs
      for (let i = 0; i < numBases; i++) {
        const progress = i / (numBases - 1);
        const y = (progress - 0.5) * length;
        const angle1 = progress * Math.PI * 2 * turns;
        const angle2 = angle1 + majorMinorShift;

        // Position on Strand 1 (Sky Blue)
        const x1 = Math.cos(angle1) * radius;
        const z1 = Math.sin(angle1) * radius;
        const p1 = new THREE.Vector3(x1, y, z1);
        strand1Points.push(p1);

        const node1 = new THREE.Mesh(nodeGeometry, strand1Material);
        node1.position.copy(p1);
        dnaGroup.add(node1);

        // Position on Strand 2 (Pink)
        const x2 = Math.cos(angle2) * radius;
        const z2 = Math.sin(angle2) * radius;
        const p2 = new THREE.Vector3(x2, y, z2);
        strand2Points.push(p2);

        const node2 = new THREE.Mesh(nodeGeometry, strand2Material);
        node2.position.copy(p2);
        dnaGroup.add(node2);

        // Central midpoint of base pair
        const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

        // Select complementary base pair colors: Pair A (Purple/Green) or Pair B (Sky/Orange)
        const isPairA = i % 2 === 0;
        const matSide1 = isPairA ? matPurple : matSky;
        const matSide2 = isPairA ? matGreen : matOrange;

        // Half Rung 1 (p1 to midPoint)
        const rung1Length = p1.distanceTo(midPoint);
        const halfRung1 = new THREE.Mesh(halfRungGeometry, matSide1);
        halfRung1.position.copy(new THREE.Vector3().addVectors(p1, midPoint).multiplyScalar(0.5));
        halfRung1.scale.set(1, rung1Length, 1);

        const dir1 = new THREE.Vector3().subVectors(midPoint, p1).normalize();
        const quat1 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir1);
        halfRung1.setRotationFromQuaternion(quat1);
        dnaGroup.add(halfRung1);

        // Half Rung 2 (midPoint to p2)
        const rung2Length = midPoint.distanceTo(p2);
        const halfRung2 = new THREE.Mesh(halfRungGeometry, matSide2);
        halfRung2.position.copy(new THREE.Vector3().addVectors(midPoint, p2).multiplyScalar(0.5));
        halfRung2.scale.set(1, rung2Length, 1);

        const dir2 = new THREE.Vector3().subVectors(p2, midPoint).normalize();
        const quat2 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir2);
        halfRung2.setRotationFromQuaternion(quat2);
        dnaGroup.add(halfRung2);

        // Central Hydrogen Bond Indicator Node
        const bondDot = new THREE.Mesh(bondDotGeometry, matHydrogen);
        bondDot.position.copy(midPoint);
        dnaGroup.add(bondDot);
      }

      // Continuous Sugar-Phosphate Backbone Ribbons (Tube Geometries)
      if (strand1Points.length > 2 && strand2Points.length > 2) {
        const curve1 = new THREE.CatmullRomCurve3(strand1Points);
        const tubeGeo1 = new THREE.TubeGeometry(curve1, 64, 0.065, 8, false);
        const tube1 = new THREE.Mesh(tubeGeo1, strand1Material);
        geometriesToDispose.push(tubeGeo1);
        dnaGroup.add(tube1);

        const curve2 = new THREE.CatmullRomCurve3(strand2Points);
        const tubeGeo2 = new THREE.TubeGeometry(curve2, 64, 0.065, 8, false);
        const tube2 = new THREE.Mesh(tubeGeo2, strand2Material);
        geometriesToDispose.push(tubeGeo2);
        dnaGroup.add(tube2);
      }

      // 4. Ambient Floating Molecular Particles (Solvent / Counter-ions)
      const particleCount = 20;
      const particleGeo = new THREE.SphereGeometry(0.075, 8, 8);
      geometriesToDispose.push(particleGeo);
      const particleColorHexes = [0x20aeea, 0xec4899, 0xf97316, 0x16a34a, 0x7c3aed];

      const particles: {
        mesh: THREE.Mesh;
        speed: number;
        origY: number;
        radius: number;
        angle: number;
        wobbleSpeed: number;
      }[] = [];

      for (let p = 0; p < particleCount; p++) {
        const pMat = new THREE.MeshBasicMaterial({
          color: particleColorHexes[p % particleColorHexes.length],
          transparent: true,
          opacity: 0.7
        });
        materialsToDispose.push(pMat);

        const pMesh = new THREE.Mesh(particleGeo, pMat);
        const pRadius = 3.2 + Math.random() * 2.6;
        const pAngle = Math.random() * Math.PI * 2;
        const pY = (Math.random() - 0.5) * (length + 2.0);

        pMesh.position.set(Math.cos(pAngle) * pRadius, pY, Math.sin(pAngle) * pRadius);
        scene.add(pMesh);

        particles.push({
          mesh: pMesh,
          speed: 0.002 + Math.random() * 0.0035,
          origY: pY,
          radius: pRadius,
          angle: pAngle,
          wobbleSpeed: 0.02 + Math.random() * 0.03
        });
      }

      // Natural scientific helical inclination
      dnaGroup.rotation.z = THREE.MathUtils.degToRad(15);
      dnaGroup.rotation.x = THREE.MathUtils.degToRad(8);

      setIsLoading(false);

      // Mouse Parallax Interaction
      let mouseX = 0;
      let mouseY = 0;
      let targetRotX = dnaGroup.rotation.x;

      const handleMouseMove = (e: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const normY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
          mouseX = normX * 0.22;
          mouseY = normY * 0.18;
        }
      };

      container.addEventListener('mousemove', handleMouseMove);

      // Visibility Observer (Pause when off-screen)
      const intersectionObserver = new IntersectionObserver(([entry]) => {
        isVisible = entry.isIntersecting;
      }, { threshold: 0.05 });
      intersectionObserver.observe(container);

      // Tab Visibility Handler
      const handleVisibilityChange = () => {
        isTabActive = document.visibilityState === 'visible';
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      // 5. Animation Loop
      let lastTime = performance.now();

      const animate = (currentTime: number) => {
        animationFrameId = requestAnimationFrame(animate);

        if (!isVisible || !isTabActive) return;

        const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
        lastTime = currentTime;

        if (!isPausedRef.current) {
          dnaGroup.rotation.y += delta * 0.55;

          // Gentle mouse parallax easing
          targetRotX = THREE.MathUtils.degToRad(8) - mouseY * 0.3;
          dnaGroup.rotation.x += (targetRotX - dnaGroup.rotation.x) * 0.05;
          dnaGroup.rotation.z = THREE.MathUtils.degToRad(15) + mouseX * 0.15;

          // Animate floating particles
          particles.forEach((part) => {
            part.angle += part.speed;
            part.mesh.position.x = Math.cos(part.angle) * part.radius;
            part.mesh.position.z = Math.sin(part.angle) * part.radius;
            part.mesh.position.y = part.origY + Math.sin(currentTime * 0.0015 + part.origY) * 0.3;
          });
        }

        renderer.render(scene, camera);
      };

      animate(performance.now());

      // 6. Resize Observer
      let resizeRafId: number | null = null;
      const resizeObserver = new ResizeObserver((entries) => {
        if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
        resizeRafId = requestAnimationFrame(() => {
          for (const entry of entries) {
            const { width: newWidth, height: newHeight } = entry.contentRect;
            if (newWidth > 0 && newHeight > 0) {
              camera.aspect = newWidth / newHeight;
              camera.updateProjectionMatrix();
              renderer.setSize(newWidth, newHeight);
            }
          }
        });
      });
      resizeObserver.observe(container);

      // Cleanup on unmount
      return () => {
        cancelAnimationFrame(animationFrameId);
        if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
        intersectionObserver.disconnect();
        resizeObserver.disconnect();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        container.removeEventListener('mousemove', handleMouseMove);

        geometriesToDispose.forEach(g => g.dispose());
        materialsToDispose.forEach(m => m.dispose());

        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer.dispose();
      };
    } catch (err) {
      console.warn('[HeroDnaAnimation] WebGL initialization fallback activated:', err);
      setHasWebGlError(true);
      setIsLoading(false);
    }
  }, [shouldShowStaticFallback, force3dOnMobile]);

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  // Static Scientific Fallback Graphic (SVG with Sky Blue & Pink Nodes and Base Pairing)
  if (shouldShowStaticFallback || hasWebGlError) {
    return (
      <div className={`relative w-full h-full min-h-[260px] sm:min-h-[300px] flex flex-col items-center justify-center p-4 bg-white/90 rounded-2xl border border-[#D9EAF5] shadow-xs select-none ${className}`}>
        {/* Soft atmospheric gradient */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-[#E4F6FF]/40 via-transparent to-[#FCE7F3]/30 pointer-events-none" />

        {/* Procedural High-Fidelity Biological SVG Double Helix */}
        <div className="relative z-10 w-full max-w-[280px] h-[190px] flex items-center justify-center">
          <svg viewBox="0 0 300 200" className="w-full h-full overflow-visible drop-shadow-xs">
            <defs>
              <linearGradient id="strandSky" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#20AEEA" />
                <stop offset="100%" stopColor="#0B8FCC" />
              </linearGradient>
              <linearGradient id="strandPink" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#EC4899" />
                <stop offset="100%" stopColor="#D9368B" />
              </linearGradient>
            </defs>

            {/* Base pair connecting rungs */}
            {[
              { x: 30, y1: 50, y2: 150, c1: '#7C3AED', c2: '#16A34A' },
              { x: 60, y1: 70, y2: 130, c1: '#20AEEA', c2: '#F97316' },
              { x: 90, y1: 100, y2: 100, c1: '#7C3AED', c2: '#16A34A' },
              { x: 120, y1: 130, y2: 70, c1: '#20AEEA', c2: '#F97316' },
              { x: 150, y1: 150, y2: 50, c1: '#7C3AED', c2: '#16A34A' },
              { x: 180, y1: 130, y2: 70, c1: '#20AEEA', c2: '#F97316' },
              { x: 210, y1: 100, y2: 100, c1: '#7C3AED', c2: '#16A34A' },
              { x: 240, y1: 70, y2: 130, c1: '#20AEEA', c2: '#F97316' },
              { x: 270, y1: 50, y2: 150, c1: '#7C3AED', c2: '#16A34A' },
            ].map((rung, idx) => {
              const midY = (rung.y1 + rung.y2) / 2;
              return (
                <g key={idx}>
                  <line x1={rung.x} y1={rung.y1} x2={rung.x} y2={midY} stroke={rung.c1} strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.85" />
                  <line x1={rung.x} y1={midY} x2={rung.x} y2={rung.y2} stroke={rung.c2} strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.85" />
                  <circle cx={rung.x} cy={midY} r="2" fill="#FFFFFF" stroke="#D9EAF5" strokeWidth="1" />
                </g>
              );
            })}

            {/* Continuous Helix Ribbons */}
            <path
              d="M 20,40 Q 90,130 150,150 T 280,40"
              fill="none"
              stroke="url(#strandSky)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              d="M 20,160 Q 90,70 150,50 T 280,160"
              fill="none"
              stroke="url(#strandPink)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />

            {/* Sky Blue Nodes (Strand 1) */}
            {[
              { x: 30, y: 50 }, { x: 60, y: 70 }, { x: 90, y: 100 },
              { x: 120, y: 130 }, { x: 150, y: 150 }, { x: 180, y: 130 },
              { x: 210, y: 100 }, { x: 240, y: 70 }, { x: 270, y: 50 }
            ].map((node, i) => (
              <circle key={`sky-${i}`} cx={node.x} cy={node.y} r="5.5" fill="#20AEEA" stroke="#FFFFFF" strokeWidth="1.5" />
            ))}

            {/* Pink Nodes (Strand 2) */}
            {[
              { x: 30, y: 150 }, { x: 60, y: 130 }, { x: 90, y: 100 },
              { x: 120, y: 70 }, { x: 150, y: 50 }, { x: 180, y: 70 },
              { x: 210, y: 100 }, { x: 240, y: 130 }, { x: 270, y: 150 }
            ].map((node, i) => (
              <circle key={`pink-${i}`} cx={node.x} cy={node.y} r="5.5" fill="#EC4899" stroke="#FFFFFF" strokeWidth="1.5" />
            ))}

            {/* Subtle floating particles */}
            <circle cx="45" cy="25" r="2.5" fill="#16A34A" opacity="0.6" />
            <circle cx="105" cy="175" r="2" fill="#F97316" opacity="0.7" />
            <circle cx="200" cy="30" r="3" fill="#7C3AED" opacity="0.5" />
            <circle cx="260" cy="180" r="2" fill="#20AEEA" opacity="0.6" />
          </svg>
        </div>

        {/* Fallback Information & Controls */}
        <div className="relative z-10 text-center space-y-1.5 mt-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#E4F6FF] text-[#0B8FCC] text-[10px] font-mono font-semibold border border-[#20AEEA]/20">
            <Dna className="w-3 h-3 text-[#20AEEA]" />
            <span>
              {hasWebGlError
                ? 'WebGL Acceleration Fallback'
                : prefersReducedMotion
                ? 'Static Mode (Reduced-Motion)'
                : 'Mobile Optimized Diagram'}
            </span>
          </div>

          <p className="text-[11px] text-[#526B82] max-w-xs font-mono">
            Procedural B-DNA double helix with complementary base pairings.
          </p>

          {isMobileDevice && !force3dOnMobile && !hasWebGlError && (
            <button
              type="button"
              onClick={() => setForce3dOnMobile(true)}
              className="mt-1 px-3 py-1 rounded-lg bg-[#20AEEA] hover:bg-[#0B8FCC] text-white text-[11px] font-mono font-medium transition-all shadow-xs cursor-pointer flex items-center gap-1.5 mx-auto active:scale-95"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Launch 3D WebGL</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full min-h-[260px] sm:min-h-[300px] flex items-center justify-center overflow-hidden select-none ${className}`}>
      {/* 3D WebGL Canvas Container */}
      <div 
        ref={mountRef} 
        className="w-full h-full cursor-grab active:cursor-grabbing flex items-center justify-center"
        title="Interactive Procedural DNA Double Helix"
      />

      {/* Atmospheric Radial Gradient Backdrop */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-64 h-64 rounded-full bg-gradient-to-tr from-[#E4F6FF]/60 via-[#FCE7F3]/25 to-transparent blur-2xl" />
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-xs">
          <div className="flex items-center gap-2 text-xs font-mono text-[#0B8FCC]">
            <RefreshCw className="w-4 h-4 animate-spin text-[#20AEEA]" />
            <span>Initializing 3D Simulation...</span>
          </div>
        </div>
      )}

      {/* Interactive Controls Bar in Top-Right Corner */}
      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
        <button
          type="button"
          onClick={togglePause}
          className="p-1.5 rounded-lg bg-white/85 hover:bg-white border border-[#D9EAF5] text-[#526B82] hover:text-[#102A43] shadow-xs cursor-pointer transition-all active:scale-95"
          title={isPaused ? 'Resume 3D Rotation' : 'Pause 3D Rotation'}
          aria-label={isPaused ? 'Resume animation' : 'Pause animation'}
        >
          {isPaused ? <Play className="w-3.5 h-3.5 fill-[#20AEEA] text-[#20AEEA]" /> : <Pause className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Scientific Model Footnote */}
      <div className="absolute bottom-2.5 right-3 pointer-events-none z-10 flex items-center gap-1.5">
        <span className="text-[10px] font-mono text-[#526B82] bg-white/85 backdrop-blur-xs px-2 py-0.5 rounded-md border border-[#D9EAF5] shadow-2xs">
          Visual Introduction · Procedural 3D Helix
        </span>
      </div>
    </div>
  );
};
