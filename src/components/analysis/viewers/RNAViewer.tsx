import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  ZoomIn, ZoomOut, Maximize2, Minimize2,
  Info, CheckCircle2, Compass
} from 'lucide-react';
import { RNASecondaryStructureResult } from '../../../lib/bio/rnaAnalysis';

export interface RNAViewerProps {
  sequence: string;
  fullSequence?: string;
  startPosition?: number;
  totalLength?: number;
  rnaAnalysis: RNASecondaryStructureResult;
  className?: string;
}

const RNA_BASE_COLORS: Record<string, { bg: string; text: string; hex: number; name: string }> = {
  A: { bg: '#EF4444', text: '#FFFFFF', hex: 0xef4444, name: 'Adenine' },
  U: { bg: '#A855F7', text: '#FFFFFF', hex: 0xa855f7, name: 'Uracil' },
  G: { bg: '#10B981', text: '#FFFFFF', hex: 0x10b981, name: 'Guanine' },
  C: { bg: '#F59E0B', text: '#FFFFFF', hex: 0xf59e0b, name: 'Cytosine' },
  N: { bg: '#64748B', text: '#FFFFFF', hex: 0x64748b, name: 'Unknown' }
};

const BASE_WIDTH = 34;
const TRACK_HEIGHT = 380;

export const RNAViewer: React.FC<RNAViewerProps> = ({
  sequence,
  fullSequence,
  startPosition = 1,
  totalLength,
  rnaAnalysis,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const cleanSeq = useMemo(() => {
    return sequence.toUpperCase().replace(/[^ACGUN]/g, '');
  }, [sequence]);

  const seqLength = cleanSeq.length;
  const effectiveTotalLength = totalLength || (fullSequence ? fullSequence.length : seqLength);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [hasRendered, setHasRendered] = useState<boolean>(() => seqLength > 0);
  const [renderedCount, setRenderedCount] = useState<number>(() => seqLength);

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const [scrollLeft, setScrollLeft] = useState<number>(0);
  const [containerWidth, setContainerWidth] = useState<number>(800);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        if (w > 0) setContainerWidth((prev) => (prev === w ? prev : w));
      }
    };
    updateDimensions();

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(updateDimensions);
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (seqLength > 0) {
      setHasRendered(true);
      setRenderedCount(seqLength);
    } else {
      setHasRendered(false);
      setRenderedCount(0);
    }
  }, [seqLength]);

  const scaledBaseWidth = BASE_WIDTH * zoomLevel;
  const totalDiagramWidth = Math.max(containerWidth, seqLength * scaledBaseWidth + 120);
  const visibleStartIndex = Math.max(0, Math.floor((scrollLeft - 80) / scaledBaseWidth));
  const visibleEndIndex = Math.min(seqLength, Math.ceil((scrollLeft + containerWidth + 80) / scaledBaseWidth));

  // Map of pairs for fast lookup
  const pairMap = useMemo(() => {
    const map = new Map<number, { to: number; type: string }>();
    if (rnaAnalysis && rnaAnalysis.pairs) {
      for (const p of rnaAnalysis.pairs) {
        if (p.from < seqLength && p.to < seqLength) {
          map.set(p.from, { to: p.to, type: p.type });
          map.set(p.to, { to: p.from, type: p.type });
        }
      }
    }
    return map;
  }, [rnaAnalysis, seqLength]);

  const handleZoom = (direction: 'in' | 'out' | 'fit') => {
    if (direction === 'in') setZoomLevel(prev => Math.min(2.5, prev + 0.25));
    else if (direction === 'out') setZoomLevel(prev => Math.max(0.5, prev - 0.25));
    else setZoomLevel(1);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-2xl overflow-hidden border border-[#A7F3D0] bg-[#F0FDF4] flex flex-col shadow-xs ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen min-h-screen' : 'min-h-[300px] sm:min-h-[420px] lg:min-h-[480px] h-[340px] sm:h-[440px] lg:h-[520px]'
      } ${className}`}
    >
      {/* Top Header */}
      <div className="bg-white/95 backdrop-blur-md border-b border-[#A7F3D0] px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 z-20 font-mono text-xs shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#DCFCE7] text-[#059669] px-2.5 py-1 rounded-lg border border-[#A7F3D0] font-semibold text-[11px]">
            <Compass className="w-3.5 h-3.5 text-[#059669]" />
            <span>RNA Linear Sequence &amp; Pairing Schematic</span>
          </div>

          <span className="text-[#CBD5E1]">|</span>

          {hasRendered && renderedCount > 0 ? (
            <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-bold">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>{renderedCount} nt rendered (pos {startPosition}–{startPosition + renderedCount - 1} of {effectiveTotalLength})</span>
            </span>
          ) : (
            <span className="text-slate-400 text-[11px]">No RNA sequence data</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => handleZoom('in')}
              className="p-1 rounded text-slate-600 hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-slate-500 px-1 font-mono min-w-[32px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => handleZoom('out')}
              className="p-1 rounded text-slate-600 hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom('fit')}
              className="px-1.5 py-0.5 rounded text-[10px] text-slate-600 hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer font-sans"
              title="Reset Zoom to 100%"
            >
              1x
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg border border-[#CBD5E1] bg-white text-slate-600 hover:text-[#0F172A] hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Viewport */}
      <div className="relative flex-1 w-full h-full overflow-hidden flex flex-col">
        {seqLength === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 font-mono text-xs">
            <Info className="w-8 h-8 text-emerald-500 mb-2" />
            <p className="font-semibold text-slate-800">No RNA Sequence Available</p>
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
            className="flex-1 w-full h-full overflow-x-auto overflow-y-hidden select-none cursor-grab active:cursor-grabbing bg-[#F8FAFC]"
          >
            <div style={{ width: `${totalDiagramWidth}px`, height: '100%', minHeight: `${TRACK_HEIGHT}px` }} className="relative py-4 px-6">
              <svg width={totalDiagramWidth} height={TRACK_HEIGHT} className="overflow-visible">
                {/* Strand Labels */}
                <g className="font-mono text-xs">
                  <rect x="10" y="45" width="34" height="22" rx="4" fill="#059669" />
                  <text x="27" y="60" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">5'</text>
                  <text x="52" y="60" fill="#047857" fontSize="10" fontWeight="bold">Single-Stranded RNA Transcript</text>

                  <line x1="60" y1="140" x2={totalDiagramWidth - 40} y2="140" stroke="#059669" strokeWidth="3" strokeLinecap="round" />

                  <rect x={totalDiagramWidth - 44} y="45" width="34" height="22" rx="4" fill="#059669" />
                  <text x={totalDiagramWidth - 27} y="60" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">3'</text>
                </g>

                {/* Secondary Structure Pairing Arcs */}
                {rnaAnalysis && rnaAnalysis.pairs && rnaAnalysis.pairs.map((p, idx) => {
                  if (p.from >= seqLength || p.to >= seqLength) return null;
                  const x1 = 70 + p.from * scaledBaseWidth + (scaledBaseWidth - 4) / 2;
                  const x2 = 70 + p.to * scaledBaseWidth + (scaledBaseWidth - 4) / 2;
                  const midX = (x1 + x2) / 2;
                  const arcHeight = Math.min(100, Math.abs(x2 - x1) * 0.4 + 25);
                  const isHovered = hoveredIndex === p.from || hoveredIndex === p.to;

                  return (
                    <path
                      key={idx}
                      d={`M ${x1} 126 Q ${midX} ${126 - arcHeight} ${x2} 126`}
                      fill="none"
                      stroke={isHovered ? '#DC2626' : p.type === 'GC' ? '#10B981' : p.type === 'AU' ? '#A855F7' : '#0284C7'}
                      strokeWidth={isHovered ? 2.5 : 1.8}
                      strokeDasharray={p.type === 'GU' ? '3 3' : undefined}
                      opacity={0.85}
                    />
                  );
                })}

                {/* Nucleotide Tiles */}
                {cleanSeq.split('').map((base, idx) => {
                  if (idx < visibleStartIndex - 5 || idx > visibleEndIndex + 5) return null;
                  const cfg = RNA_BASE_COLORS[base] || RNA_BASE_COLORS.N;
                  const x = 70 + idx * scaledBaseWidth;
                  const absPos = startPosition + idx;
                  const isHovered = hoveredIndex === idx;
                  const paired = pairMap.get(idx);

                  return (
                    <g
                      key={idx}
                      onMouseEnter={(e) => {
                        setHoveredIndex(idx);
                        const rect = containerRef.current?.getBoundingClientRect();
                        if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                      }}
                      onMouseLeave={() => setHoveredIndex(null)}
                      className="cursor-pointer"
                    >
                      {/* Coordinate */}
                      {(absPos % 10 === 0 || idx === 0 || idx === seqLength - 1) && (
                        <g>
                          <line x1={x + scaledBaseWidth / 2} y1="18" x2={x + scaledBaseWidth / 2} y2="28" stroke="#94A3B8" strokeWidth="1.5" />
                          <text x={x + scaledBaseWidth / 2} y="14" textAnchor="middle" fill="#64748B" fontSize="9" fontFamily="monospace" fontWeight="bold">
                            {absPos}
                          </text>
                        </g>
                      )}

                      {/* Base Tile */}
                      <rect
                        x={x}
                        y="126"
                        width={scaledBaseWidth - 4}
                        height="28"
                        rx="5"
                        fill={cfg.bg}
                        stroke={isHovered ? '#0F172A' : '#FFFFFF'}
                        strokeWidth={isHovered ? 2 : 1}
                      />
                      <text
                        x={x + (scaledBaseWidth - 4) / 2}
                        y="145"
                        textAnchor="middle"
                        fill={cfg.text}
                        fontSize={Math.max(10, Math.min(14, scaledBaseWidth * 0.45))}
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {base}
                      </text>

                      {/* Pairing Indicator Dot */}
                      {paired && (
                        <circle
                          cx={x + (scaledBaseWidth - 4) / 2}
                          cy="165"
                          r="3"
                          fill="#A855F7"
                        />
                      )}
                    </g>
                  );
                })}

                {/* Secondary Structure Legend */}
                <g className="font-mono text-[10px]">
                  <text x="10" y="240" fill="#64748B" fontWeight="bold">Secondary Structure:</text>
                  <circle cx="150" cy="237" r="4" fill="#A855F7" />
                  <text x="160" y="240" fill="#0F172A">Base-Paired Stem Residue (Connecting Arc)</text>
                  <text x="420" y="240" fill="#059669" fontWeight="bold">Total Pairs: {rnaAnalysis?.pairs?.length || 0}</text>
                </g>
              </svg>

              {hoveredIndex !== null && tooltipPos && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${Math.max(8, Math.min(containerWidth - 220, tooltipPos.x + 15))}px`,
                    top: `${Math.min(TRACK_HEIGHT - 100, Math.max(40, tooltipPos.y - 40))}px`
                  }}
                  className="bg-white/95 backdrop-blur-md border border-[#A7F3D0] rounded-xl p-3 shadow-lg pointer-events-none z-30 font-mono text-xs text-[#0F172A] w-52 space-y-1"
                >
                  <div className="flex items-center justify-between pb-1 border-b border-[#E2E8F0]">
                    <span className="font-bold text-[#059669]">Position {startPosition + hoveredIndex}</span>
                    <span className="text-[10px] text-slate-500 font-sans">RNA Nucleotide</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="text-slate-600">Base:</span>
                    <span className="font-bold text-purple-600">{cleanSeq[hoveredIndex]} ({RNA_BASE_COLORS[cleanSeq[hoveredIndex]]?.name})</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">Secondary Structure:</span>
                    <span className="font-bold text-teal-600">
                      {pairMap.has(hoveredIndex) ? `Paired with nt ${startPosition + pairMap.get(hoveredIndex)!.to}` : 'Unpaired Loop'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-white/95 backdrop-blur-md border-t border-[#A7F3D0] px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-xs font-mono z-20 shadow-2xs">
        <div className="flex items-center gap-3 flex-wrap text-[11px]">
          <span className="text-slate-500 font-semibold">Ribonucleotides:</span>
          <span className="flex items-center gap-1 text-[#DC2626] font-bold"><span className="w-2.5 h-2.5 rounded-sm bg-[#EF4444] inline-block" /> A</span>
          <span className="flex items-center gap-1 text-[#9333EA] font-bold"><span className="w-2.5 h-2.5 rounded-sm bg-[#A855F7] inline-block" /> U (Uracil)</span>
          <span className="flex items-center gap-1 text-[#059669] font-bold"><span className="w-2.5 h-2.5 rounded-sm bg-[#10B981] inline-block" /> G</span>
          <span className="flex items-center gap-1 text-[#D97706] font-bold"><span className="w-2.5 h-2.5 rounded-sm bg-[#F59E0B] inline-block" /> C</span>
        </div>
        <span className="text-[11px] text-slate-500">Single-Stranded RNA Structure</span>
      </div>
    </div>
  );
};
