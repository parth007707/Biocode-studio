import React from 'react';
import { Dna, Play } from 'lucide-react';

interface StaticDnaFallbackProps {
  className?: string;
  onEnable3D?: () => void;
  reason?: 'reduced-motion' | 'mobile' | 'error' | 'manual';
}

export const StaticDnaFallback: React.FC<StaticDnaFallbackProps> = ({
  className = '',
  onEnable3D,
  reason = 'mobile'
}) => {
  return (
    <div
      className={`relative w-full h-full min-h-[260px] sm:min-h-[300px] flex flex-col items-center justify-center p-4 bg-[#071426]/90 rounded-2xl border border-[#38BDF8]/20 shadow-[0_4px_24px_rgba(0,0,0,0.4)] select-none ${className}`}
      role="img"
      aria-label="Static 2D scientific diagram of a DNA double helix"
    >
      {/* Soft atmospheric gradient */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-[#38BDF8]/10 via-transparent to-[#EC4899]/10 pointer-events-none" />

      {/* Procedural High-Fidelity Biological SVG Double Helix */}
      <div className="relative z-10 w-full max-w-[280px] h-[190px] flex items-center justify-center">
        <svg viewBox="0 0 300 200" className="w-full h-full overflow-visible drop-shadow-[0_0_12px_rgba(56,189,248,0.25)]">
          <defs>
            <linearGradient id="staticStrandSky" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#0EA5E9" />
            </linearGradient>
            <linearGradient id="staticStrandPink" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#EC4899" />
              <stop offset="100%" stopColor="#BE185D" />
            </linearGradient>
          </defs>

          {/* Base-Pair Connecting Rungs (Purple/Green and Sky/Orange base-pair complementary bonding) */}
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
                <line
                  x1={rung.x}
                  y1={rung.y1}
                  x2={rung.x}
                  y2={midY}
                  stroke={rung.c1}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeOpacity="0.85"
                />
                <line
                  x1={rung.x}
                  y1={midY}
                  x2={rung.x}
                  y2={rung.y2}
                  stroke={rung.c2}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeOpacity="0.85"
                />
                <circle cx={rung.x} cy={midY} r="2.5" fill="#FFFFFF" stroke="#D9EAF5" strokeWidth="1" />
              </g>
            );
          })}

          {/* Continuous Helix Ribbons */}
          <path
            d="M 20,40 Q 90,130 150,150 T 280,40"
            fill="none"
            stroke="url(#staticStrandSky)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M 20,160 Q 90,70 150,50 T 280,160"
            fill="none"
            stroke="url(#staticStrandPink)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* Sky Blue Nodes (Strand 1) */}
          {[
            { x: 30, y: 50 }, { x: 60, y: 70 }, { x: 90, y: 100 },
            { x: 120, y: 130 }, { x: 150, y: 150 }, { x: 180, y: 130 },
            { x: 210, y: 100 }, { x: 240, y: 70 }, { x: 270, y: 50 }
          ].map((node, i) => (
            <circle
              key={`sky-node-${i}`}
              cx={node.x}
              cy={node.y}
              r="5.5"
              fill="#20AEEA"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          ))}

          {/* Pink Nodes (Strand 2) */}
          {[
            { x: 30, y: 150 }, { x: 60, y: 130 }, { x: 90, y: 100 },
            { x: 120, y: 70 }, { x: 150, y: 50 }, { x: 180, y: 70 },
            { x: 210, y: 100 }, { x: 240, y: 130 }, { x: 270, y: 150 }
          ].map((node, i) => (
            <circle
              key={`pink-node-${i}`}
              cx={node.x}
              cy={node.y}
              r="5.5"
              fill="#EC4899"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          ))}

          {/* Floating Solvent & Ion particles */}
          <circle cx="45" cy="25" r="2.5" fill="#16A34A" opacity="0.65" />
          <circle cx="105" cy="175" r="2.5" fill="#F97316" opacity="0.7" />
          <circle cx="200" cy="30" r="3" fill="#7C3AED" opacity="0.55" />
          <circle cx="260" cy="180" r="2.5" fill="#20AEEA" opacity="0.65" />
        </svg>
      </div>

      {/* Fallback Information & Controls */}
      <div className="relative z-10 text-center space-y-1.5 mt-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#0B1930] text-[#38BDF8] text-[10px] font-mono font-semibold border border-[#38BDF8]/30 shadow-2xs">
          <Dna className="w-3 h-3 text-[#38BDF8]" />
          <span>
            {reason === 'error'
              ? 'WebGL Fallback Active'
              : reason === 'reduced-motion'
              ? 'Static Mode (Reduced-Motion)'
              : 'Mobile Optimized Diagram'}
          </span>
        </div>

        <p className="text-[11px] text-[#94A3B8] max-w-xs font-mono">
          Procedural B-DNA double helix with complementary base pairings.
        </p>

        {onEnable3D && reason !== 'reduced-motion' && (
          <button
            type="button"
            onClick={onEnable3D}
            className="mt-1 px-3 py-1 rounded-lg bg-[#0EA5E9] hover:bg-[#38BDF8] text-white text-[11px] font-mono font-medium transition-all shadow-[0_0_12px_rgba(14,165,233,0.3)] cursor-pointer flex items-center gap-1.5 mx-auto active:scale-95"
          >
            <Play className="w-3 h-3 fill-white" />
            <span>Launch 3D WebGL</span>
          </button>
        )}
      </div>
    </div>
  );
};
