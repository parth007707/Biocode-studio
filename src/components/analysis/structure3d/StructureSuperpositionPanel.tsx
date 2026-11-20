import React from 'react';
import { StructureSuperpositionResult } from '../../../lib/bio/structure3d/types';
import { Activity, Layers, ArrowRight, ShieldCheck, AlertTriangle } from 'lucide-react';

interface StructureSuperpositionPanelProps {
  result: StructureSuperpositionResult;
  originalTitle?: string;
  modifiedTitle?: string;
  onFocusResidue?: (index: number) => void;
  className?: string;
}

export const StructureSuperpositionPanel: React.FC<StructureSuperpositionPanelProps> = ({
  result,
  originalTitle = 'Version 1 (Original)',
  modifiedTitle = 'Version 2 (Modified)',
  onFocusResidue,
  className = ''
}) => {
  const { rmsd, alignedResiduesCount, mutationShifts } = result;

  // Determine structural stability / impact category
  let stabilityLabel = 'High Structural Conservation';
  let stabilityColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  if (rmsd > 3.0) {
    stabilityLabel = 'Major Conformational Rearrangement';
    stabilityColor = 'text-red-400 border-red-500/30 bg-red-500/10';
  } else if (rmsd > 1.5) {
    stabilityLabel = 'Moderate Backbone Deviation';
    stabilityColor = 'text-amber-400 border-amber-500/30 bg-amber-500/10';
  }

  return (
    <div className={`bg-[#0B0F17] border border-slate-800 rounded-2xl p-3.5 sm:p-5 space-y-4 font-sans ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
          <h4 className="text-xs font-bold text-white tracking-wide uppercase font-mono">
            3D Structural Superposition & Backbone RMSD
          </h4>
        </div>

        <div className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold flex flex-wrap items-center gap-1.5 ${stabilityColor}`}>
          <Activity className="w-3.5 h-3.5" />
          <span>RMSD: {rmsd.toFixed(2)} Å</span>
          <span className="text-[10px] opacity-80">({stabilityLabel})</span>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
        <div className="bg-[#161B22] border border-slate-800 rounded-xl p-3 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase">Superimposed Pairs</span>
          <div className="text-base font-bold text-white">{alignedResiduesCount} Residues</div>
          <p className="text-[10px] text-slate-500 font-sans">C-Alpha coordinate alignment</p>
        </div>

        <div className="bg-[#161B22] border border-slate-800 rounded-xl p-3 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase">Mutation Shift Sites</span>
          <div className="text-base font-bold text-amber-400 font-mono">
            {mutationShifts.length} Localized Shifts
          </div>
          <p className="text-[10px] text-slate-500 font-sans">Perturbations &gt; 0.5 Å</p>
        </div>

        <div className="bg-[#161B22] border border-slate-800 rounded-xl p-3 space-y-1">
          <span className="text-[10px] text-slate-400 uppercase">Max Spatial Shift</span>
          <div className="text-base font-bold text-purple-400 font-mono">
            {mutationShifts.length > 0
              ? `${Math.max(...mutationShifts.map((s) => s.caDeltaAngstrom)).toFixed(2)} Å`
              : '0.00 Å'}
          </div>
          <p className="text-[10px] text-slate-500 font-sans">Peak backbone displacement</p>
        </div>
      </div>

      {/* Mutation Shift Table */}
      {mutationShifts.length > 0 ? (
        <div className="space-y-2">
          <span className="text-[11px] font-mono font-bold text-slate-300 uppercase">
            Residue-Level Displacement Vectors
          </span>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-800 bg-[#07090D] divide-y divide-slate-800/60 font-mono text-xs">
            {mutationShifts.map((shift, idx) => (
              <div
                key={idx}
                onClick={() => onFocusResidue?.(shift.residueIndex)}
                className="p-2.5 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-800/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-mono text-[10px] w-6">#{shift.residueIndex + 1}</span>
                  <span className="text-slate-300 font-bold">{shift.originalResName}</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-emerald-400 font-bold">{shift.modifiedResName}</span>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-slate-400">
                    Δ: <strong className="text-white">{shift.caDeltaAngstrom.toFixed(2)} Å</strong>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      shift.significance === 'SEVERE'
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : shift.significance === 'SIGNIFICANT'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}
                  >
                    {shift.significance}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-[#161B22] border border-slate-800 rounded-xl p-4 text-center text-xs font-mono text-slate-400">
          <ShieldCheck className="w-6 h-6 text-emerald-400 mx-auto mb-1.5" />
          <span>Backbone geometry aligns with zero spatial steric perturbation across active chain.</span>
        </div>
      )}
    </div>
  );
};
