import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  ZoomIn, ZoomOut, Maximize2, Minimize2,
  Info, CheckCircle2, Compass
} from 'lucide-react';

export interface DNAViewerProps {
  sequence: string;
  fullSequence?: string;
  startPosition?: number;
  totalLength?: number;
  className?: string;
}

const BASE_COLORS: Record<string, { bg: string; text: string; hex: number; name: string }> = {
  A: { bg: '#EF4444', text: '#FFFFFF', hex: 0xef4444, name: 'Adenine' },
  T: { bg: '#3B82F6', text: '#FFFFFF', hex: 0x3b82f6, name: 'Thymine' },
  G: { bg: '#10B981', text: '#FFFFFF', hex: 0x10b981, name: 'Guanine' },
  C: { bg: '#F59E0B', text: '#FFFFFF', hex: 0xf59e0b, name: 'Cytosine' },
  N: { bg: '#64748B', text: '#FFFFFF', hex: 0x64748b, name: 'Unknown' }
};

const COMPLEMENT: Record<string, string> = {
  A: 'T',
  T: 'A',
  G: 'C',
  C: 'G',
  N: 'N'
};

const BASE_WIDTH = 34; // Pixel width per base pair in 2D linear schematic
const TRACK_HEIGHT = 380;

export const DNAViewer: React.FC<DNAViewerProps> = ({
  sequence,
  fullSequence,
  startPosition = 1,
  totalLength,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Clean sequence
  const cleanSeq = useMemo(() => {
    return sequence.toUpperCase().replace(/[^ATCGN]/g, '');
  }, [sequence]);

  const seqLength = cleanSeq.length;
  const effectiveTotalLength = totalLength || (fullSequence ? fullSequence.length : seqLength);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 0.6x to 2.5x
  const [hasRendered, setHasRendered] = useState<boolean>(() => seqLength > 0);
  const [renderedCount, setRenderedCount] = useState<number>(() => seqLength);

  // Hover state
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Calculate GC content for this segment
  const gcCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < cleanSeq.length; i++) {
      if (cleanSeq[i] === 'G' || cleanSeq[i] === 'C') count++;
    }
    return count;
  }, [cleanSeq]);

  const gcPercent = seqLength > 0 ? Math.round((gcCount / seqLength) * 100) : 0;

  // Viewport virtualization for 2D schematic
  const [scrollLeft, setScrollLeft] = useState<number>(0);
  const [containerWidth, setContainerWidth] = useState<number>(800);

  // Update container width on resize
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

  // Update rendered status when cleanSeq is valid and mounted
  useEffect(() => {
    if (seqLength > 0) {
      setHasRendered(true);
      setRenderedCount(seqLength);
    } else {
      setHasRendered(false);
      setRenderedCount(0);
    }
  }, [seqLength]);

  // Handle scroll for virtualization
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  // Virtualized slice calculation
  const scaledBaseWidth = BASE_WIDTH * zoomLevel;
  const totalDiagramWidth = Math.max(containerWidth, seqLength * scaledBaseWidth + 120);

  const visibleStartIndex = Math.max(0, Math.floor((scrollLeft - 80) / scaledBaseWidth));
  const visibleEndIndex = Math.min(seqLength, Math.ceil((scrollLeft + containerWidth + 80) / scaledBaseWidth));

  // Zoom handlers for 2D schematic
  const handleZoom = (direction: 'in' | 'out' | 'fit') => {
    if (direction === 'in') {
      setZoomLevel(prev => Math.min(2.5, prev + 0.25));
    } else if (direction === 'out') {
      setZoomLevel(prev => Math.max(0.5, prev - 0.25));
    } else {
      setZoomLevel(1);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-2xl overflow-hidden border border-[#BAE6FD] bg-[#F0F9FF] flex flex-col shadow-xs ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen min-h-screen' : 'min-h-[300px] sm:min-h-[420px] lg:min-h-[480px] h-[340px] sm:h-[440px] lg:h-[520px]'
      } ${className}`}
    >
      {/* ------------------------------------------------------------- */}
      {/* TOP SCIENTIFIC HEADER & CONTROL BAR                          */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white/95 backdrop-blur-md border-b border-[#BAE6FD] px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 z-20 font-mono text-xs shadow-2xs">
        {/* Left: Mode Title & Rendered Status */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#E0F2FE] text-[#0284C7] px-2.5 py-1 rounded-lg border border-[#BAE6FD] font-semibold text-[11px]">
            <Compass className="w-3.5 h-3.5 text-[#0284C7]" />
            <span>Linear Diagram Schematic</span>
          </div>

          <span className="text-[#CBD5E1]">|</span>

          {/* Rendered Count Badge - ONLY displayed when visualization has been produced */}
          {hasRendered && renderedCount > 0 ? (
            <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-bold">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>{renderedCount} bp rendered (pos {startPosition}–{startPosition + renderedCount - 1} of {effectiveTotalLength})</span>
            </span>
          ) : (
            <span className="text-slate-400 text-[11px]">
              No sequence data to render
            </span>
          )}
        </div>

        {/* Right: Zoom & Fullscreen Controls */}
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

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg border border-[#CBD5E1] bg-white text-slate-600 hover:text-[#0F172A] hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen View'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* PRIMARY VIEWPORT: 2D LINEAR DIAGRAM                           */}
      {/* ------------------------------------------------------------- */}
      <div className="relative flex-1 w-full h-full overflow-hidden flex flex-col">
        {seqLength === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 font-mono text-xs">
            <Info className="w-8 h-8 text-sky-500 mb-2" />
            <p className="font-semibold text-slate-800">No DNA Sequence Available</p>
            <p className="text-slate-400 mt-1">Please provide or load a valid DNA sequence (A, T, C, G).</p>
          </div>
        ) : (
          // =========================================================
          // 2D VIRTUALIZED LINEAR SCHEMATIC (SVG CANVAS)
          // =========================================================
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 w-full h-full overflow-x-auto overflow-y-hidden select-none cursor-grab active:cursor-grabbing bg-[#F8FAFC]"
          >
            <div style={{ width: `${totalDiagramWidth}px`, height: '100%', minHeight: `${TRACK_HEIGHT}px` }} className="relative py-4 px-6">
              <svg
                width={totalDiagramWidth}
                height={TRACK_HEIGHT}
                className="overflow-visible"
              >
                <defs>
                  {/* Subtle drop shadow for nucleotide tiles */}
                  <filter id="tileShadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#0F172A" floodOpacity="0.08" />
                  </filter>
                </defs>

                {/* 1. Track Labels & 5' / 3' Orientation Markers */}
                <g className="font-mono text-xs">
                  {/* Top Strand: 5' -> 3' */}
                  <rect x="10" y="45" width="34" height="22" rx="4" fill="#0284C7" />
                  <text x="27" y="60" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">5'</text>
                  <text x="52" y="60" fill="#0369A1" fontSize="10" fontWeight="bold">Sense Strand (Coding)</text>

                  {/* Backbone Top Line */}
                  <line
                    x1="60"
                    y1="90"
                    x2={totalDiagramWidth - 40}
                    y2="90"
                    stroke="#0284C7"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />

                  {/* Hydrogen Bond Mid-Line Track Indicator */}
                  <line
                    x1="60"
                    y1="165"
                    x2={totalDiagramWidth - 40}
                    y2="165"
                    stroke="#E2E8F0"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />

                  {/* Backbone Bottom Line */}
                  <line
                    x1="60"
                    y1="240"
                    x2={totalDiagramWidth - 40}
                    y2="240"
                    stroke="#059669"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />

                  {/* Bottom Strand: 3' -> 5' */}
                  <rect x="10" y="265" width="34" height="22" rx="4" fill="#059669" />
                  <text x="27" y="280" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">3'</text>
                  <text x="52" y="280" fill="#047857" fontSize="10" fontWeight="bold">Antisense Strand (Complementary)</text>

                  {/* Far Ends 3' and 5' Labels */}
                  <rect x={totalDiagramWidth - 44} y="45" width="34" height="22" rx="4" fill="#0284C7" />
                  <text x={totalDiagramWidth - 27} y="60" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">3'</text>

                  <rect x={totalDiagramWidth - 44} y="265" width="34" height="22" rx="4" fill="#059669" />
                  <text x={totalDiagramWidth - 27} y="280" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">5'</text>
                </g>

                {/* 2. Base Pair Tiles, Coordinates & Hydrogen Bond Rungs */}
                {cleanSeq.split('').map((base, idx) => {
                  // Virtualization culling: only render if within visible window (+/- 5 bases buffer)
                  if (idx < visibleStartIndex - 5 || idx > visibleEndIndex + 5) {
                    return null;
                  }

                  const compBase = COMPLEMENT[base] || 'N';
                  const baseConfig = BASE_COLORS[base] || BASE_COLORS.N;
                  const compConfig = BASE_COLORS[compBase] || BASE_COLORS.N;
                  const isHovered = hoveredIndex === idx;

                  const x = 70 + idx * scaledBaseWidth;
                  const absPos = startPosition + idx;
                  const numHbonds = (base === 'G' && compBase === 'C') || (base === 'C' && compBase === 'G') ? 3 : 2;

                  return (
                    <g
                      key={idx}
                      onMouseEnter={(e) => {
                        setHoveredIndex(idx);
                        const rect = containerRef.current?.getBoundingClientRect();
                        if (rect) {
                          setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                        }
                      }}
                      onMouseLeave={() => setHoveredIndex(null)}
                      className="cursor-pointer transition-opacity"
                    >
                      {/* Coordinate Ruler Number (every 10 bp, or first/last) */}
                      {(absPos % 10 === 0 || idx === 0 || idx === seqLength - 1) && (
                        <g>
                          <line x1={x + scaledBaseWidth / 2} y1="18" x2={x + scaledBaseWidth / 2} y2="28" stroke="#94A3B8" strokeWidth="1.5" />
                          <text
                            x={x + scaledBaseWidth / 2}
                            y="14"
                            textAnchor="middle"
                            fill="#64748B"
                            fontSize="9"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {absPos}
                          </text>
                        </g>
                      )}

                      {/* Small tick mark on ruler */}
                      {absPos % 5 === 0 && absPos % 10 !== 0 && (
                        <line x1={x + scaledBaseWidth / 2} y1="22" x2={x + scaledBaseWidth / 2} y2="28" stroke="#CBD5E1" strokeWidth="1" />
                      )}

                      {/* Top Base Tile (5' -> 3') */}
                      <rect
                        x={x}
                        y="76"
                        width={scaledBaseWidth - 4}
                        height="28"
                        rx="5"
                        fill={baseConfig.bg}
                        stroke={isHovered ? '#0F172A' : '#FFFFFF'}
                        strokeWidth={isHovered ? 2 : 1}
                        filter="url(#tileShadow)"
                      />
                      <text
                        x={x + (scaledBaseWidth - 4) / 2}
                        y="95"
                        textAnchor="middle"
                        fill={baseConfig.text}
                        fontSize={Math.max(10, Math.min(14, scaledBaseWidth * 0.45))}
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {base}
                      </text>

                      {/* Hydrogen Bond Rung (Connecting Top & Bottom Base) */}
                      <g stroke={isHovered ? '#0284C7' : '#94A3B8'} strokeWidth={isHovered ? 2 : 1.5} strokeDasharray="2 2">
                        {numHbonds === 3 ? (
                          <>
                            <line x1={x + scaledBaseWidth * 0.25} y1="110" x2={x + scaledBaseWidth * 0.25} y2="220" />
                            <line x1={x + scaledBaseWidth * 0.50} y1="110" x2={x + scaledBaseWidth * 0.50} y2="220" stroke={isHovered ? '#059669' : '#64748B'} />
                            <line x1={x + scaledBaseWidth * 0.75} y1="110" x2={x + scaledBaseWidth * 0.75} y2="220" />
                          </>
                        ) : (
                          <>
                            <line x1={x + scaledBaseWidth * 0.35} y1="110" x2={x + scaledBaseWidth * 0.35} y2="220" />
                            <line x1={x + scaledBaseWidth * 0.65} y1="110" x2={x + scaledBaseWidth * 0.65} y2="220" />
                          </>
                        )}
                      </g>

                      {/* Hydrogen Bond Indicator Dot in the center */}
                      <circle
                        cx={x + (scaledBaseWidth - 4) / 2}
                        cy="165"
                        r={isHovered ? 4 : 2.5}
                        fill={numHbonds === 3 ? '#10B981' : '#3B82F6'}
                      />

                      {/* Bottom Base Tile (3' -> 5' Complement) */}
                      <rect
                        x={x}
                        y="226"
                        width={scaledBaseWidth - 4}
                        height="28"
                        rx="5"
                        fill={compConfig.bg}
                        stroke={isHovered ? '#0F172A' : '#FFFFFF'}
                        strokeWidth={isHovered ? 2 : 1}
                        filter="url(#tileShadow)"
                      />
                      <text
                        x={x + (scaledBaseWidth - 4) / 2}
                        y="245"
                        textAnchor="middle"
                        fill={compConfig.text}
                        fontSize={Math.max(10, Math.min(14, scaledBaseWidth * 0.45))}
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {compBase}
                      </text>

                      {/* Bottom Coordinate Tick */}
                      <text
                        x={x + (scaledBaseWidth - 4) / 2}
                        y="275"
                        textAnchor="middle"
                        fill="#94A3B8"
                        fontSize="8"
                        fontFamily="monospace"
                      >
                        {absPos}
                      </text>

                      {/* GC Status Bar at bottom */}
                      <rect
                        x={x}
                        y="300"
                        width={scaledBaseWidth - 4}
                        height="6"
                        rx="2"
                        fill={base === 'G' || base === 'C' ? '#10B981' : '#93C5FD'}
                      />
                    </g>
                  );
                })}

                {/* 3. GC Content Track Legend */}
                <g className="font-mono text-[10px]">
                  <text x="10" y="325" fill="#64748B" fontWeight="bold">GC Track:</text>
                  <rect x="70" y="316" width="12" height="10" rx="2" fill="#10B981" />
                  <text x="86" y="325" fill="#0F172A">G-C Pair (3 H-Bonds)</text>
                  <rect x="220" y="316" width="12" height="10" rx="2" fill="#93C5FD" />
                  <text x="236" y="325" fill="#0F172A">A-T Pair (2 H-Bonds)</text>
                  <text x="370" y="325" fill="#0284C7" fontWeight="bold">Window GC: {gcPercent}%</text>
                </g>
              </svg>

              {/* Floating Tooltip for Hovered Base Pair */}
              {hoveredIndex !== null && tooltipPos && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${Math.max(8, Math.min(containerWidth - 220, tooltipPos.x + 15))}px`,
                    top: `${Math.min(TRACK_HEIGHT - 120, Math.max(40, tooltipPos.y - 60))}px`
                  }}
                  className="bg-white/95 backdrop-blur-md border border-[#BAE6FD] rounded-xl p-3 shadow-lg pointer-events-none z-30 font-mono text-xs text-[#0F172A] w-52 space-y-1"
                >
                  <div className="flex items-center justify-between pb-1 border-b border-[#E2E8F0]">
                    <span className="font-bold text-[#0284C7]">Position {startPosition + hoveredIndex}</span>
                    <span className="text-[10px] text-slate-500 font-sans">DNA Base Pair</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="text-slate-600">Sense (5'→3'):</span>
                    <span className="font-bold text-red-600">{cleanSeq[hoveredIndex]} ({BASE_COLORS[cleanSeq[hoveredIndex]]?.name})</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">Antisense (3'→5'):</span>
                    <span className="font-bold text-blue-600">{COMPLEMENT[cleanSeq[hoveredIndex]]} ({BASE_COLORS[COMPLEMENT[cleanSeq[hoveredIndex]]]?.name})</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">Hydrogen Bonds:</span>
                    <span className="font-bold text-emerald-600">
                      {cleanSeq[hoveredIndex] === 'G' || cleanSeq[hoveredIndex] === 'C' ? '3 H-bonds (Strong)' : '2 H-bonds'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* BOTTOM LEGEND & BASE COLOR KEY                                */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white/95 backdrop-blur-md border-t border-[#BAE6FD] px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-xs font-mono z-20 shadow-2xs">
        <div className="flex items-center gap-3 flex-wrap text-[11px]">
          <span className="text-slate-500 font-semibold">Nucleotides:</span>
          <span className="flex items-center gap-1 text-[#DC2626] font-bold">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#EF4444] inline-block" /> A (Adenine)
          </span>
          <span className="flex items-center gap-1 text-[#2563EB] font-bold">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#3B82F6] inline-block" /> T (Thymine)
          </span>
          <span className="flex items-center gap-1 text-[#059669] font-bold">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#10B981] inline-block" /> G (Guanine)
          </span>
          <span className="flex items-center gap-1 text-[#D97706] font-bold">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#F59E0B] inline-block" /> C (Cytosine)
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>Antiparallel Double Strands (5'→3' & 3'→5')</span>
          <span>·</span>
          <span>Watson-Crick Pairing</span>
        </div>
      </div>
    </div>
  );
};
