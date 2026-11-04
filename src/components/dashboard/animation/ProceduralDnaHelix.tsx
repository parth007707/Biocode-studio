import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface ProceduralDnaHelixProps {
  isPaused?: boolean;
}

export const ProceduralDnaHelix: React.FC<ProceduralDnaHelixProps> = ({ isPaused = false }) => {
  const dnaGroupRef = useRef<THREE.Group>(null);
  const particlesGroupRef = useRef<THREE.Group>(null);

  const numBases = 28;
  const radius = 2.35;
  const length = 12.0;
  const turns = 2.1;
  const majorMinorShift = 2.35; // radians shift for authentic B-DNA major/minor grooving

  // Procedural computation of Helix structure
  const {
    nodesStrand1,
    nodesStrand2,
    rungs,
    tube1Geo,
    tube2Geo,
    particles
  } = useMemo(() => {
    const s1Nodes: THREE.Vector3[] = [];
    const s2Nodes: THREE.Vector3[] = [];
    const rungList: {
      p1: THREE.Vector3;
      p2: THREE.Vector3;
      mid: THREE.Vector3;
      mat1Color: string;
      mat2Color: string;
    }[] = [];

    for (let i = 0; i < numBases; i++) {
      const progress = i / (numBases - 1);
      const y = (progress - 0.5) * length;
      const angle1 = progress * Math.PI * 2 * turns;
      const angle2 = angle1 + majorMinorShift;

      const p1 = new THREE.Vector3(Math.cos(angle1) * radius, y, Math.sin(angle1) * radius);
      const p2 = new THREE.Vector3(Math.cos(angle2) * radius, y, Math.sin(angle2) * radius);
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

      s1Nodes.push(p1);
      s2Nodes.push(p2);

      const isPairA = i % 2 === 0;
      rungList.push({
        p1,
        p2,
        mid,
        mat1Color: isPairA ? '#7C3AED' : '#0B8FCC', // Purple or Sky Blue
        mat2Color: isPairA ? '#16A34A' : '#F97316'  // Green or Orange
      });
    }

    // Continuous Sugar-Phosphate Backbone Tubes
    const curve1 = new THREE.CatmullRomCurve3(s1Nodes);
    const tube1 = new THREE.TubeGeometry(curve1, 64, 0.065, 8, false);

    const curve2 = new THREE.CatmullRomCurve3(s2Nodes);
    const tube2 = new THREE.TubeGeometry(curve2, 64, 0.065, 8, false);

    // Floating particles data
    const particleColors = ['#20AEEA', '#EC4899', '#F97316', '#16A34A', '#7C3AED'];
    const pList = Array.from({ length: 20 }).map((_, idx) => ({
      color: particleColors[idx % particleColors.length],
      radius: 3.2 + Math.random() * 2.6,
      angle: Math.random() * Math.PI * 2,
      origY: (Math.random() - 0.5) * (length + 2.0),
      speed: 0.002 + Math.random() * 0.0035
    }));

    return {
      nodesStrand1: s1Nodes,
      nodesStrand2: s2Nodes,
      rungs: rungList,
      tube1Geo: tube1,
      tube2Geo: tube2,
      particles: pList
    };
  }, []);

  // Shared geometry instances for high rendering performance
  const nodeGeo = useMemo(() => new THREE.SphereGeometry(0.24, 14, 14), []);
  const halfRungGeo = useMemo(() => new THREE.CylinderGeometry(0.045, 0.045, 1, 8), []);
  const bondDotGeo = useMemo(() => new THREE.SphereGeometry(0.08, 8, 8), []);
  const particleGeo = useMemo(() => new THREE.SphereGeometry(0.075, 8, 8), []);

  // Animation frame loop with smooth rotation and subtle parallax
  useFrame((state, delta) => {
    if (!dnaGroupRef.current) return;

    if (!isPaused) {
      // Rotation around Y
      dnaGroupRef.current.rotation.y += delta * 0.55;

      // Mouse Parallax easing
      const targetRotX = THREE.MathUtils.degToRad(8) - state.pointer.y * 0.25;
      const targetRotZ = THREE.MathUtils.degToRad(15) + state.pointer.x * 0.2;
      dnaGroupRef.current.rotation.x = THREE.MathUtils.lerp(dnaGroupRef.current.rotation.x, targetRotX, 0.05);
      dnaGroupRef.current.rotation.z = THREE.MathUtils.lerp(dnaGroupRef.current.rotation.z, targetRotZ, 0.05);

      // Animate floating particles
      if (particlesGroupRef.current) {
        const time = state.clock.getElapsedTime();
        particlesGroupRef.current.children.forEach((child, idx) => {
          const p = particles[idx];
          if (p) {
            p.angle += p.speed;
            child.position.x = Math.cos(p.angle) * p.radius;
            child.position.z = Math.sin(p.angle) * p.radius;
            child.position.y = p.origY + Math.sin(time * 1.5 + p.origY) * 0.25;
          }
        });
      }
    }
  });

  return (
    <>
      {/* Lights */}
      <ambientLight intensity={1.15} />
      <directionalLight position={[7, 12, 9]} intensity={1.5} color="#20AEEA" />
      <directionalLight position={[-7, -6, -5]} intensity={1.2} color="#EC4899" />
      <directionalLight position={[0, -10, 6]} intensity={0.65} color="#7C3AED" />

      {/* Main DNA Double Helix */}
      <group
        ref={dnaGroupRef}
        rotation={[THREE.MathUtils.degToRad(8), 0, THREE.MathUtils.degToRad(15)]}
      >
        {/* Continuous Backbone Ribbon 1 (Sky Blue) */}
        <mesh geometry={tube1Geo}>
          <meshStandardMaterial color="#20AEEA" roughness={0.22} metalness={0.12} />
        </mesh>

        {/* Continuous Backbone Ribbon 2 (Pink) */}
        <mesh geometry={tube2Geo}>
          <meshStandardMaterial color="#EC4899" roughness={0.22} metalness={0.12} />
        </mesh>

        {/* Strand 1 Nodes (Sky Blue) */}
        {nodesStrand1.map((pos, idx) => (
          <mesh key={`s1-${idx}`} position={pos} geometry={nodeGeo}>
            <meshStandardMaterial color="#20AEEA" roughness={0.22} metalness={0.12} />
          </mesh>
        ))}

        {/* Strand 2 Nodes (Pink) */}
        {nodesStrand2.map((pos, idx) => (
          <mesh key={`s2-${idx}`} position={pos} geometry={nodeGeo}>
            <meshStandardMaterial color="#EC4899" roughness={0.22} metalness={0.12} />
          </mesh>
        ))}

        {/* Base Pair Connecting Rungs */}
        {rungs.map((rung, idx) => {
          // Half 1: p1 to mid
          const rung1Length = rung.p1.distanceTo(rung.mid);
          const mid1 = new THREE.Vector3().addVectors(rung.p1, rung.mid).multiplyScalar(0.5);
          const dir1 = new THREE.Vector3().subVectors(rung.mid, rung.p1).normalize();
          const quat1 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir1);
          const euler1 = new THREE.Euler().setFromQuaternion(quat1);

          // Half 2: mid to p2
          const rung2Length = rung.mid.distanceTo(rung.p2);
          const mid2 = new THREE.Vector3().addVectors(rung.mid, rung.p2).multiplyScalar(0.5);
          const dir2 = new THREE.Vector3().subVectors(rung.p2, rung.mid).normalize();
          const quat2 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir2);
          const euler2 = new THREE.Euler().setFromQuaternion(quat2);

          return (
            <group key={`rung-${idx}`}>
              {/* Half 1 */}
              <mesh
                position={mid1}
                rotation={euler1}
                scale={[1, rung1Length, 1]}
                geometry={halfRungGeo}
              >
                <meshStandardMaterial
                  color={rung.mat1Color}
                  roughness={0.35}
                  transparent
                  opacity={0.9}
                />
              </mesh>

              {/* Half 2 */}
              <mesh
                position={mid2}
                rotation={euler2}
                scale={[1, rung2Length, 1]}
                geometry={halfRungGeo}
              >
                <meshStandardMaterial
                  color={rung.mat2Color}
                  roughness={0.35}
                  transparent
                  opacity={0.9}
                />
              </mesh>

              {/* Hydrogen Bond indicator dot */}
              <mesh position={rung.mid} geometry={bondDotGeo}>
                <meshBasicMaterial color="#FFFFFF" transparent opacity={0.85} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* Floating Solvent & Ion Particles */}
      <group ref={particlesGroupRef}>
        {particles.map((p, idx) => (
          <mesh
            key={`part-${idx}`}
            position={[Math.cos(p.angle) * p.radius, p.origY, Math.sin(p.angle) * p.radius]}
            geometry={particleGeo}
          >
            <meshBasicMaterial color={p.color} transparent opacity={0.7} />
          </mesh>
        ))}
      </group>
    </>
  );
};
