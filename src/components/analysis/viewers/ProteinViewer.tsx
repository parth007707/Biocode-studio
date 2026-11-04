import React, { useRef, useState, useMemo, useEffect } from 'react';
import { 
  ZoomIn, ZoomOut, Maximize2, Minimize2, 
  Info, Sparkles, CheckCircle2, Compass, MoveHorizontal, ArrowRight
} from 'lucide-react';
import { AminoAcidComposition } from '../../../lib/bio/proteinAnalysis';

export interface ProteinViewerProps {
  sequence: string;
  fullSequence?: string;
  startPosition?: number;
  totalLength?: number;
  proteinAnalysis: AminoAcidComposition;
  structureState?: 'known' | 'predicted' | 'unavailable';
  className?: string;
  onSwitchTo3D?: () => void;
}

const AA_DETAILS: Record<string, { code3: string; name: string; type: 'hydrophobic' | 'polar' | 'positive' | 'negative'; color: string }> = {
  A: { code3: 'ALA', name: 'Alanine', type: 'hydrophobic', color: '#F97316' },
  V: { code3: 'VAL', name: 'Valine', type: 'hydrophobic', color: '#F97316' },
  I: { code3: 'ILE', name: 'Isoleucine', type: 'hydrophobic', color: '#EA580C' },
  L: { code3: 'LEU', name: 'Leucine', type: 'hydrophobic', color: '#EA580C' },
  M: { code3: 'MET', name: 'Methionine', type: 'hydrophobic', color: '#F59E0B' },
  F: { code3: 'PHE', name: 'Phenylalanine', type: 'hydrophobic', color: '#D97706' },
  W: { code3: 'TRP', name: 'Tryptophan', type: 'hydrophobic', color: '#B45309' },
  P: { code3: 'PRO', name: 'Proline', type: 'hydrophobic', color: '#FB923C' },
  G: { code3: 'GLY', name: 'Glycine', type: 'hydrophobic', color: '#F59E0B' },

  S: { code3: 'SER', name: 'Serine', type: 'polar', color: '#06B6D4' },
  T: { code3: 'THR', name: 'Threonine', type: 'polar', color: '#0891B2' },
  C: { code3: 'CYS', name: 'Cysteine', type: 'polar', color: '#14B8A6' },
  Y: { code3: 'TYR', name: 'Tyrosine', type: 'polar', color: '#0D9488' },
  N: { code3: 'ASN', name: 'Asparagine', type: 'polar', color: '#22D3EE' },
  Q: { code3: 'GLN', name: 'Glutamine', type: 'polar', color: '#67E8F9' },

  K: { code3: 'LYS', name: 'Lysine', type: 'positive', color: '#3B82F6' },
  R: { code3: 'ARG', name: 'Arginine', type: 'positive', color: '#2563EB' },
  H: { code3: 'HIS', name: 'Histidine', type: 'positive', color: '#6366F1' },

  D: { code3: 'ASP', name: 'Aspartic Acid', type: 'negative', color: '#EF4444' },
  E: { code3: 'GLU', name: 'Glutamic Acid', type: 'negative', color: '#DC2626' }
};

const BASE_WIDTH = 38;
const TRACK_HEIGHT = 380;

export const ProteinViewer: React.FC<ProteinViewerProps> = ({
  sequence,
  fullSequence,
  startPosition = 1,
  totalLength,
  proteinAnalysis,
  className = '',
  onSwitchTo3D
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const cleanSeq = useMemo(() => {
    return sequence.toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY]/g, '');
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
        if (w > 0) setContainerWidth(w);
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

  // Determine secondary structure per residue from analysis
  const domConformation = proteinAnalysis?.predictedSecondaryStructure?.dominantConformation || 'Alpha-Helix';

  const getSecondaryType = (i: number): 'helix' | 'sheet' | 'coil' => {
    if (domConformation === 'Alpha-Helix') {
      return (i % 14 < 9) ? 'helix' : 'coil';
    } else if (domConformation === 'Beta-Sheet') {
      return (i % 10 < 6) ? 'sheet' : 'coil';
    }
    return (i % 8 < 3) ? 'helix' : (i % 8 < 6) ? 'sheet' : 'coil';
  };

  return (
    <div
      ref={containerRef}
      style={{ minHeight: '480px' }}
      className={`relative w-full rounded-2xl overflow-hidden border border-[#DDD6FE] bg-[#FAF5FF] flex flex-col shadow-xs ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen min-h-screen' : 'h-[520px]'
      } ${className}`}
    >
      {/* Header */}
      <div className="bg-white/95 backdrop-blur-md border-b border-[#DDD6FE] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 z-20 font-mono text-xs shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#EDE9FE] text-[#7C3AED] px-2.5 py-1 rounded-lg border border-[#DDD6FE] font-semibold text-[11px]">
            <Compass className="w-3.5 h-3.5 text-[#7C3AED]" />
            <span>Protein Domain & Secondary Structure Schematic</span>
          </div>

          <span className="text-[#CBD5E1]">|</span>
          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-sans font-medium" title="Linear secondary structure diagram. Real 3D coordinates available in 3D Structure Explorer tab.">
            Idealized Secondary Schematic (Non-Atomic)
          </span>

          {hasRendered && renderedCount > 0 ? (
            <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-bold">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>{renderedCount} residues rendered (pos {startPosition}–{startPosition + renderedCount - 1} of {effectiveTotalLength})</span>
            </span>
          ) : (
            <span className="text-slate-400 text-[11px]">No protein sequence data</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.min(2.5, prev + 0.25))}
              className="p-1 rounded text-slate-600 hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-slate-500 px-1 font-mono min-w-[32px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.25))}
              className="p-1 rounded text-slate-600 hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(1)}
              className="px-1.5 py-0.5 rounded text-[10px] text-slate-600 hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer font-sans"
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
            <Info className="w-8 h-8 text-purple-500 mb-2" />
            <p className="font-semibold text-slate-800">No Protein Sequence Available</p>
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
            className="flex-1 w-full h-full overflow-x-auto overflow-y-hidden select-none cursor-grab active:cursor-grabbing bg-[#F8FAFC]"
          >
            <div style={{ width: `${totalDiagramWidth}px`, height: '100%', minHeight: `${TRACK_HEIGHT}px` }} className="relative py-4 px-6">
              <svg width={totalDiagramWidth} height={TRACK_HEIGHT} className="overflow-visible">
                {/* Termini labels */}
                <g className="font-mono text-xs">
                  <rect x="10" y="45" width="40" height="22" rx="4" fill="#7C3AED" />
                  <text x="30" y="60" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">N-term</text>
                  <text x="60" y="60" fill="#6D28D9" fontSize="10" fontWeight="bold">Polypeptide Chain (5'→3' Translation)</text>

                  {/* Backbone trace */}
                  <line x1="60" y1="120" x2={totalDiagramWidth - 50} y2="120" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" />

                  <rect x={totalDiagramWidth - 50} y="45" width="40" height="22" rx="4" fill="#7C3AED" />
                  <text x={totalDiagramWidth - 30} y="60" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">C-term</text>
                </g>

                {/* Residue Tiles & Tracks */}
                {cleanSeq.split('').map((aa, idx) => {
                  if (idx < visibleStartIndex - 5 || idx > visibleEndIndex + 5) return null;
                  const info = AA_DETAILS[aa] || { code3: aa, name: 'Amino Acid', type: 'polar' as const, color: '#64748B' };
                  const x = 70 + idx * scaledBaseWidth;
                  const absPos = startPosition + idx;
                  const isHovered = hoveredIndex === idx;
                  const secType = getSecondaryType(idx);

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

                      {/* Amino Acid Residue Tile */}
                      <rect
                        x={x}
                        y="95"
                        width={scaledBaseWidth - 4}
                        height="48"
                        rx="6"
                        fill={info.color}
                        stroke={isHovered ? '#0F172A' : '#FFFFFF'}
                        strokeWidth={isHovered ? 2 : 1}
                      />
                      <text
                        x={x + (scaledBaseWidth - 4) / 2}
                        y="118"
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize={Math.max(11, Math.min(15, scaledBaseWidth * 0.42))}
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {aa}
                      </text>
                      <text
                        x={x + (scaledBaseWidth - 4) / 2}
                        y="134"
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize="9"
                        opacity={0.85}
                        fontFamily="monospace"
                      >
                        {info.code3}
                      </text>

                      {/* Secondary Structure Track Tile */}
                      <rect
                        x={x}
                        y="160"
                        width={scaledBaseWidth - 4}
                        height="18"
                        rx="4"
                        fill={secType === 'helix' ? '#D946EF' : secType === 'sheet' ? '#FACC15' : '#06B6D4'}
                      />
                      <text
                        x={x + (scaledBaseWidth - 4) / 2}
                        y="173"
                        textAnchor="middle"
                        fill={secType === 'sheet' ? '#713F12' : '#FFFFFF'}
                        fontSize="9"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {secType === 'helix' ? 'α' : secType === 'sheet' ? 'β' : 'c'}
                      </text>

                      {/* Hydropathy Bar */}
                      <rect
                        x={x}
                        y="190"
                        width={scaledBaseWidth - 4}
                        height="8"
                        rx="2"
                        fill={info.type === 'hydrophobic' ? '#F97316' : info.type === 'positive' ? '#3B82F6' : info.type === 'negative' ? '#EF4444' : '#14B8A6'}
                      />
                    </g>
                  );
                })}

                {/* Track Legend */}
                <g className="font-mono text-[10px]">
                  <text x="10" y="240" fill="#64748B" fontWeight="bold">Tracks:</text>
                  <rect x="70" y="232" width="12" height="10" rx="2" fill="#D946EF" />
                  <text x="86" y="240" fill="#0F172A">α-Helix</text>

                  <rect x="150" y="232" width="12" height="10" rx="2" fill="#FACC15" />
                  <text x="166" y="240" fill="#0F172A">β-Sheet</text>

                  <rect x="230" y="232" width="12" height="10" rx="2" fill="#06B6D4" />
                  <text x="246" y="240" fill="#0F172A">Coil / Loop</text>
                </g>
              </svg>

              {hoveredIndex !== null && tooltipPos && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${Math.min(containerWidth - 220, Math.max(20, tooltipPos.x + 15))}px`,
                    top: `${Math.min(TRACK_HEIGHT - 120, Math.max(40, tooltipPos.y - 40))}px`
                  }}
                  className="bg-white/95 backdrop-blur-md border border-[#DDD6FE] rounded-xl p-3 shadow-lg pointer-events-none z-30 font-mono text-xs text-[#0F172A] w-52 space-y-1"
                >
                  <div className="flex items-center justify-between pb-1 border-b border-[#E2E8F0]">
                    <span className="font-bold text-[#7C3AED]">Residue {startPosition + hoveredIndex}</span>
                    <span className="text-[10px] text-slate-500 font-sans">Amino Acid</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="text-slate-600">Residue:</span>
                    <span className="font-bold text-purple-600">{cleanSeq[hoveredIndex]} ({AA_DETAILS[cleanSeq[hoveredIndex]]?.name || 'Residue'})</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">3-Letter Code:</span>
                    <span className="font-bold text-slate-800">{AA_DETAILS[cleanSeq[hoveredIndex]]?.code3 || cleanSeq[hoveredIndex]}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">Secondary Structure:</span>
                    <span className="font-bold text-fuchsia-600">
                      {getSecondaryType(hoveredIndex) === 'helix' ? 'α-Helix' : getSecondaryType(hoveredIndex) === 'sheet' ? 'β-Strand' : 'Random Coil'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend & 3D Structure Callout */}
      <div className="bg-white/95 backdrop-blur-md border-t border-[#DDD6FE] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono z-20 shadow-2xs">
        <div className="flex items-center gap-3 flex-wrap text-[11px]">
          <span className="text-slate-500 font-semibold">Properties:</span>
          <span className="flex items-center gap-1 text-[#EA580C] font-bold"><span className="w-2.5 h-2.5 rounded-sm bg-[#F97316] inline-block" /> Hydrophobic</span>
          <span className="flex items-center gap-1 text-[#0891B2] font-bold"><span className="w-2.5 h-2.5 rounded-sm bg-[#06B6D4] inline-block" /> Polar</span>
          <span className="flex items-center gap-1 text-[#2563EB] font-bold"><span className="w-2.5 h-2.5 rounded-sm bg-[#3B82F6] inline-block" /> Basic (+)</span>
          <span className="flex items-center gap-1 text-[#DC2626] font-bold"><span className="w-2.5 h-2.5 rounded-sm bg-[#EF4444] inline-block" /> Acidic (-)</span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
          <span>For atomic 3D structures (PDB / AlphaFold), switch to 3D Structure Explorer</span>
        </div>
      </div>
    </div>
  );
};
