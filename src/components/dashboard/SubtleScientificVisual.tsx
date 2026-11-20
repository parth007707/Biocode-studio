import React, { useEffect, useRef, useState } from 'react';
import { TargetSequence } from '../../types';
import { Activity, Dna, Sparkles, CheckCircle2 } from 'lucide-react';

interface SubtleScientificVisualProps {
  currentTarget: TargetSequence;
  className?: string;
}

export const SubtleScientificVisual: React.FC<SubtleScientificVisualProps> = ({
  currentTarget,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pulseCount, setPulseCount] = useState<number>(0);

  const cleanSeq = currentTarget.sequence?.toUpperCase().replace(/[^A-Z]/g, '') || '';
  const displaySlice = cleanSeq.slice(0, 24);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const render = () => {
      time += 0.02;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const centerY = height * 0.46;
      const amplitude = 32;
      const frequency = 0.025;
      const numPoints = 28;
      const spacing = (width - 60) / (numPoints - 1);

      // Draw faint connecting base-pair rungs
      for (let i = 0; i < numPoints; i++) {
        const x = 30 + i * spacing;
        const phase = time + i * 0.28;
        const y1 = centerY + Math.sin(phase) * amplitude;
        const y2 = centerY - Math.sin(phase) * amplitude;

        const depth = Math.cos(phase);
        const alpha = Math.max(0.12, (depth + 1) / 2 * 0.45);

        // Rung line
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.strokeStyle = `rgba(14, 165, 233, ${alpha * 0.6})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Node 1 (Strand A: Sky Blue / Cyan)
        const radius1 = 2.5 + depth * 1.0;
        ctx.beginPath();
        ctx.arc(x, y1, Math.max(1.8, radius1), 0, Math.PI * 2);
        ctx.fillStyle = depth > 0 ? '#0EA5E9' : 'rgba(56, 189, 248, 0.6)';
        ctx.fill();

        // Node 2 (Strand B: Pink / Purple accent)
        const radius2 = 2.5 - depth * 1.0;
        ctx.beginPath();
        ctx.arc(x, y2, Math.max(1.8, radius2), 0, Math.PI * 2);
        ctx.fillStyle = depth < 0 ? '#EC4899' : 'rgba(236, 72, 153, 0.6)';
        ctx.fill();
      }

      // Draw Strand 1 Sine Wave
      ctx.beginPath();
      for (let i = 0; i < numPoints; i++) {
        const x = 30 + i * spacing;
        const phase = time + i * 0.28;
        const y = centerY + Math.sin(phase) * amplitude;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw Strand 2 Sine Wave
      ctx.beginPath();
      for (let i = 0; i < numPoints; i++) {
        const x = 30 + i * spacing;
        const phase = time + i * 0.28;
        const y = centerY - Math.sin(phase) * amplitude;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className={`relative w-full h-full flex flex-col justify-between p-5 bg-gradient-to-br from-white via-sky-50/40 to-pink-50/30 rounded-2xl border border-sky-100 shadow-sm overflow-hidden select-none ${className}`}>
      {/* Soft atmospheric gradient accents */}
      <div className="absolute -top-16 -right-16 w-44 h-44 bg-sky-200/35 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-44 h-44 bg-pink-200/30 rounded-full blur-2xl pointer-events-none" />

      {/* Top Header: Scientific Metadata Badges */}
      <div className="relative z-10 flex items-center justify-between gap-2 border-b border-slate-200/70 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-sky-100/90 text-sky-700 flex items-center justify-center shadow-2xs">
            <Dna className="w-4 h-4" />
          </span>
          <div>
            <div className="text-xs font-[800] font-mono text-slate-900 tracking-tight flex items-center gap-1.5">
              <span>{currentTarget.accession || 'No Active Target'}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="text-[10px] font-mono text-slate-500 font-medium">
              {currentTarget.organism || 'Ready'} · {currentTarget.sequenceType || 'Sequence'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 shadow-2xs">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Target Synced</span>
          </span>
        </div>
      </div>

      {/* Center: Abstract Double-Helix Waves Canvas */}
      <div className="relative z-10 w-full h-[150px] my-auto flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={440}
          height={150}
          className="w-full h-full max-w-full"
        />
        <div className="absolute bottom-1 right-2 text-[9px] font-mono font-bold text-sky-600/80 bg-white/80 px-2 py-0.5 rounded border border-sky-100 shadow-2xs pointer-events-none">
          CANONICAL B-FORM
        </div>
      </div>

      {/* Bottom: Live Sequence Ribbon + Scientific Metrics */}
      <div className="relative z-10 space-y-2 pt-2 border-t border-slate-200/70">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="font-bold text-slate-700 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-pink-500" />
            <span>Residue Locus Stream</span>
          </span>
          <span className="text-[10px] font-semibold text-slate-500">
            {currentTarget.totalLength || cleanSeq.length} residues
          </span>
        </div>

        {/* Small sequence chips */}
        <div className="flex items-center gap-1 overflow-hidden font-mono text-[10px] font-bold">
          {displaySlice.split('').slice(0, 16).map((char, i) => {
            const isHydrophobic = ['A', 'V', 'I', 'L', 'M', 'F', 'W', 'P'].includes(char);
            const isBasic = ['K', 'R', 'H'].includes(char);
            const isAcidic = ['D', 'E'].includes(char);

            let colorClasses = 'bg-sky-50 text-sky-700 border-sky-200';
            if (isHydrophobic) colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
            else if (isBasic) colorClasses = 'bg-purple-50 text-purple-700 border-purple-200';
            else if (isAcidic) colorClasses = 'bg-pink-50 text-pink-700 border-pink-200';

            return (
              <span
                key={i}
                className={`w-5 h-6 rounded flex items-center justify-center border shadow-2xs shrink-0 ${colorClasses}`}
                title={`Residue ${i + 1}: ${char}`}
              >
                {char}
              </span>
            );
          })}
          <span className="text-slate-400 font-bold px-1">...</span>
        </div>
      </div>
    </div>
  );
};
