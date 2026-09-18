import React, { useState } from 'react';
import { RamachandranStats, RamachandranPoint } from '../../../lib/bio/structure3d/types';
import { Sparkles, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface RamachandranPlotProps {
  stats: RamachandranStats;
  selectedResSeq?: number | null;
  onSelectResidue?: (resSeq: number) => void;
  className?: string;
}

export const RamachandranPlot: React.FC<RamachandranPlotProps> = ({
  stats,
  selectedResSeq,
  onSelectResidue,
  className = ''
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<RamachandranPoint | null>(null);

  // Canvas coordinate mapping (-180..180 -> 0..300)
  const PLOT_SIZE = 280;
  const toCanvasX = (phi: number) => ((phi + 180) / 360) * PLOT_SIZE;
  const toCanvasY = (psi: number) => ((180 - psi) / 360) * PLOT_SIZE;

  return (
    <div className={`bg-[#0B0F17] border border-slate-800 rounded-2xl p-4 space-y-3 font-sans ${className}`}>
      {/* Header & Quality Metrics */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-400" />
          <h4 className="text-xs font-bold text-white tracking-wide uppercase font-mono">
            Ramachandran Φ / Ψ Torsion Distribution
          </h4>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="flex items-center gap-1 text-emerald-400 font-semibold" title="Core Favored Conformations">
            <CheckCircle className="w-3 h-3" />
            {stats.favoredPercent}% Favored ({stats.favoredCount})
          </span>
          <span className="flex items-center gap-1 text-amber-400 font-semibold" title="Allowed Conformations">
            <Info className="w-3 h-3" />
            {stats.allowedPercent}% Allowed ({stats.allowedCount})
          </span>
          {stats.outlierCount > 0 && (
            <span className="flex items-center gap-1 text-red-400 font-semibold" title="Steric Clashes / Outliers">
              <AlertTriangle className="w-3 h-3" />
              {stats.outlierPercent}% Outliers ({stats.outlierCount})
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-6 justify-center">
        {/* Interactive 2D Scatter Canvas */}
        <div className="relative border border-slate-800 rounded-xl overflow-hidden bg-[#07090D] shrink-0 shadow-inner">
          <svg width={PLOT_SIZE} height={PLOT_SIZE} className="select-none">
            {/* Background Region Contours */}
            {/* Alpha-Helix Favored Region */}
            <rect
              x={toCanvasX(-100)}
              y={toCanvasY(-10)}
              width={toCanvasX(-30) - toCanvasX(-100)}
              height={toCanvasY(-70) - toCanvasY(-10)}
              fill="rgba(168, 85, 247, 0.15)"
              stroke="rgba(168, 85, 247, 0.4)"
              strokeDasharray="3 3"
              rx={6}
            />
            {/* Beta-Sheet Favored Region */}
            <rect
              x={toCanvasX(-160)}
              y={toCanvasY(175)}
              width={toCanvasX(-80) - toCanvasX(-160)}
              height={toCanvasY(90) - toCanvasY(175)}
              fill="rgba(245, 158, 11, 0.15)"
              stroke="rgba(245, 158, 11, 0.4)"
              strokeDasharray="3 3"
              rx={6}
            />
            {/* Left-Handed Alpha Helix */}
            <rect
              x={toCanvasX(30)}
              y={toCanvasY(70)}
              width={toCanvasX(90) - toCanvasX(30)}
              height={toCanvasY(10) - toCanvasY(70)}
              fill="rgba(6, 182, 212, 0.12)"
              stroke="rgba(6, 182, 212, 0.3)"
              strokeDasharray="3 3"
              rx={4}
            />

            {/* Grid Axes: X=0 (Phi=0), Y=0 (Psi=0) */}
            <line x1={0} y1={PLOT_SIZE / 2} x2={PLOT_SIZE} y2={PLOT_SIZE / 2} stroke="#334155" strokeWidth={1} />
            <line x1={PLOT_SIZE / 2} y1={0} x2={PLOT_SIZE / 2} y2={PLOT_SIZE} stroke="#334155" strokeWidth={1} />

            {/* Axis Labels */}
            <text x={PLOT_SIZE - 25} y={PLOT_SIZE / 2 - 6} fill="#64748B" fontSize={9} fontFamily="monospace">
              Φ (+)
            </text>
            <text x={10} y={PLOT_SIZE / 2 - 6} fill="#64748B" fontSize={9} fontFamily="monospace">
              Φ (-)
            </text>
            <text x={PLOT_SIZE / 2 + 6} y={15} fill="#64748B" fontSize={9} fontFamily="monospace">
              Ψ (+)
            </text>
            <text x={PLOT_SIZE / 2 + 6} y={PLOT_SIZE - 8} fill="#64748B" fontSize={9} fontFamily="monospace">
              Ψ (-)
            </text>

            {/* Region Annotations */}
            <text x={toCanvasX(-145)} y={toCanvasY(135)} fill="#F59E0B" fontSize={9} opacity={0.7} fontFamily="monospace" fontWeight="bold">
              β-Sheet
            </text>
            <text x={toCanvasX(-90)} y={toCanvasY(-35)} fill="#A855F7" fontSize={9} opacity={0.7} fontFamily="monospace" fontWeight="bold">
              α-Helix
            </text>

            {/* Scatter Data Points */}
            {stats.points.map((pt, idx) => {
              const cx = toCanvasX(pt.phi);
              const cy = toCanvasY(pt.psi);
              const isSelected = selectedResSeq === pt.resSeq;
              const isHovered = hoveredPoint?.resSeq === pt.resSeq;

              let fillColor = '#10B981'; // Favored (emerald)
              if (pt.region === 'allowed') fillColor = '#F59E0B'; // Allowed (amber)
              if (pt.region === 'outlier') fillColor = '#EF4444'; // Outlier (red)

              return (
                <circle
                  key={idx}
                  cx={cx}
                  cy={cy}
                  r={isSelected ? 6 : isHovered ? 5 : 3}
                  fill={fillColor}
                  stroke={isSelected ? '#FFFFFF' : '#000000'}
                  strokeWidth={isSelected || isHovered ? 2 : 0.8}
                  opacity={isSelected || isHovered ? 1 : 0.8}
                  className="cursor-pointer transition-all hover:scale-125"
                  onMouseEnter={() => setHoveredPoint(pt)}
                  onMouseLeave={() => setHoveredPoint(null)}
                  onClick={() => onSelectResidue?.(pt.resSeq)}
                />
              );
            })}
          </svg>

          {/* Hover Tooltip Overlay */}
          {hoveredPoint && (
            <div className="absolute bottom-2 left-2 right-2 bg-slate-900/90 backdrop-blur-xs border border-slate-700 rounded-lg p-2 text-[11px] font-mono text-slate-200 flex items-center justify-between shadow-lg">
              <span className="font-bold text-white">{hoveredPoint.residue}</span>
              <span>Φ: {hoveredPoint.phi}° | Ψ: {hoveredPoint.psi}°</span>
              <span className={`font-semibold capitalize ${
                hoveredPoint.region === 'favored' ? 'text-emerald-400' : hoveredPoint.region === 'allowed' ? 'text-amber-400' : 'text-red-400'
              }`}>
                {hoveredPoint.region}
              </span>
            </div>
          )}
        </div>

        {/* Legend and Structural Geometry Guidelines */}
        <div className="flex-1 space-y-3 text-xs font-mono text-slate-300">
          <div className="bg-[#161B22] border border-slate-800/80 rounded-xl p-3 space-y-2">
            <span className="text-[11px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Conformational Quality Score
            </span>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              Steric validation of backbone dihedral angles ($\phi/\psi$) based on the stereochemical energy landscape. Structure exhibits high physiological fidelity when &gt;90% of non-glycine residues reside in favored conformational envelopes.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
              <div className="text-emerald-400 font-bold text-sm">{stats.favoredPercent}%</div>
              <div className="text-slate-400">Favored</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
              <div className="text-amber-400 font-bold text-sm">{stats.allowedPercent}%</div>
              <div className="text-slate-400">Allowed</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2">
              <div className="text-red-400 font-bold text-sm">{stats.outlierCount}</div>
              <div className="text-slate-400">Clashes</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
