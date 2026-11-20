import React from 'react';
import { MeasurementItem } from '../../../lib/bio/structure3d/types';
import { Ruler, Trash2, Crosshair, Sparkles } from 'lucide-react';

interface MeasurementInspectorProps {
  measurements: MeasurementItem[];
  activeMode: 'distance' | 'angle' | 'dihedral' | null;
  selectedCount: number;
  onClearMeasurements: () => void;
  onDeleteMeasurement: (id: string) => void;
  className?: string;
}

export const MeasurementInspector: React.FC<MeasurementInspectorProps> = ({
  measurements,
  activeMode,
  selectedCount,
  onClearMeasurements,
  onDeleteMeasurement,
  className = ''
}) => {
  return (
    <div className={`bg-[#0B0F17] border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3 font-sans ${className}`}>
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Ruler className="w-3.5 h-3.5 text-emerald-400" />
          <h4 className="text-xs font-bold text-white tracking-wide uppercase font-mono">
            Interactive 3D Measurements
          </h4>
        </div>

        {measurements.length > 0 && (
          <button
            type="button"
            onClick={onClearMeasurements}
            className="text-[11px] font-mono text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            Clear All
          </button>
        )}
      </div>

      {/* Measurement Mode Status Callout */}
      {activeMode && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5 flex items-center justify-between text-xs font-mono text-emerald-300">
          <div className="flex items-center gap-2">
            <Crosshair className="w-3.5 h-3.5 animate-pulse text-emerald-400 shrink-0" />
            <span>
              Click atoms to measure {activeMode} ({selectedCount}/{activeMode === 'distance' ? 2 : activeMode === 'angle' ? 3 : 4} selected)
            </span>
          </div>
        </div>
      )}

      {/* Measurements List */}
      {measurements.length > 0 ? (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {measurements.map((m) => (
            <div
              key={m.id}
              className="bg-[#161B22] border border-slate-800 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-1.5 font-bold text-slate-200">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                  <span className="truncate">{m.label}</span>
                </div>
                <div className="text-[10px] text-slate-500 break-words">
                  {m.atoms.map((a) => a.residueLabel).join(' ➔ ')}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="px-2 py-0.5 rounded-md bg-[#07090D] border border-slate-700 text-emerald-400 font-bold text-xs">
                  {m.value.toFixed(2)} {m.unit}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteMeasurement(m.id)}
                  className="text-slate-500 hover:text-red-400 p-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500 font-mono text-center py-2">
          Select distance measurement mode above and click two atoms in the 3D viewport to compute spatial vector in Å.
        </p>
      )}
    </div>
  );
};
