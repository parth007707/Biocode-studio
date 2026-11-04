import React, { useState } from 'react';
import { TargetSequence } from '../../types';
import { Sequence3DViewer } from '../visualization3d/Sequence3DViewer';
import { ViewerRepresentation } from '../visualization3d/types';
import { Box, Layers, RotateCcw, Play, Pause, Maximize2, Sparkles } from 'lucide-react';

interface MolecularViewSectionProps {
  currentTarget: TargetSequence;
  onExploreInStudio?: () => void;
}

export const MolecularViewSection: React.FC<MolecularViewSectionProps> = ({
  currentTarget,
  onExploreInStudio
}) => {
  const [representation, setRepresentation] = useState<ViewerRepresentation>('ribbon');
  const [autoRotate, setAutoRotate] = useState<boolean>(true);

  return (
    <section className="space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xs font-[750] font-mono uppercase tracking-wider text-[#8B5CF6] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#8B5CF6] shadow-[0_0_8px_#8B5CF6]" />
            <span>MOLECULAR VIEW</span>
          </h2>
          <span className="text-[11px] font-mono text-[#94A3B8] hidden sm:inline">
            · Macromolecular 3D Viewport ({currentTarget.accession})
          </span>
        </div>

        {/* Minimalist 3D Controls Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-[#0B1930]/90 backdrop-blur-md border border-[#38BDF8]/20 rounded-xl shadow-2xs font-mono text-xs">
          {/* Representation Selector */}
          <div className="flex items-center gap-1 border-r border-[#38BDF8]/20 pr-1.5 mr-0.5">
            <button
              type="button"
              onClick={() => setRepresentation('ribbon')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                representation === 'ribbon'
                  ? 'bg-[#8B5CF6] text-white shadow-[0_0_10px_rgba(139,92,246,0.4)]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#071426]'
              }`}
            >
              Ribbon
            </button>
            <button
              type="button"
              onClick={() => setRepresentation('ball_stick')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                representation === 'ball_stick'
                  ? 'bg-[#38BDF8] text-[#050B18] shadow-[0_0_10px_rgba(56,189,248,0.4)]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#071426]'
              }`}
            >
              Ball &amp; Stick
            </button>
            <button
              type="button"
              onClick={() => setRepresentation('space_fill')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                representation === 'space_fill'
                  ? 'bg-[#EC4899] text-white shadow-[0_0_10px_rgba(236,72,153,0.4)]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#071426]'
              }`}
            >
              Space Fill
            </button>
          </div>

          {/* Quick Auto-Rotate Toggle */}
          <button
            type="button"
            onClick={() => setAutoRotate(!autoRotate)}
            className="p-1.5 rounded-lg bg-[#071426] hover:bg-[#0F2445] text-[#38BDF8] border border-[#38BDF8]/20 transition-all cursor-pointer"
            title={autoRotate ? 'Pause Rotation' : 'Auto Rotate'}
          >
            {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-[#38BDF8]" />}
          </button>

          {onExploreInStudio && (
            <button
              type="button"
              onClick={onExploreInStudio}
              className="p-1.5 rounded-lg bg-[#071426] hover:bg-[#0F2445] text-[#8B5CF6] border border-[#8B5CF6]/30 transition-all cursor-pointer ml-0.5"
              title="Expand in Structure Studio"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Large 3D Viewport on Deep Dark Background */}
      <div className="h-[400px] sm:h-[460px] rounded-2xl bg-[#050B18] border border-[#38BDF8]/25 shadow-[0_12px_40px_rgba(0,0,0,0.6),inset_0_0_30px_rgba(139,92,246,0.06)] relative overflow-hidden flex items-center justify-center group">
        <Sequence3DViewer
          sequence={currentTarget.sequence}
          sequenceType={currentTarget.sequenceType}
          accession={currentTarget.accession}
          title={`Molecular View: ${currentTarget.accession}`}
          initialRepresentation={representation}
          syncStatus="SYNCED"
          showControls={true}
          className="w-full h-full"
          height="100%"
        />

        {/* Subtle Scientific Coordinates / Status HUD */}
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none flex items-center gap-2 font-mono text-[10px] text-[#94A3B8] bg-[#071426]/85 backdrop-blur-md px-3 py-1 rounded-lg border border-[#38BDF8]/20 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
          <span>Active Target: <strong className="text-[#38BDF8]">{currentTarget.accession}</strong></span>
          <span className="text-[#64748B]">·</span>
          <span>{currentTarget.organism}</span>
          <span className="text-[#64748B]">·</span>
          <span className="text-[#8B5CF6]">{representation.replace('_', ' ')}</span>
        </div>
      </div>
    </section>
  );
};
