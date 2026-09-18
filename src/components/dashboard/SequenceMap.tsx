import React, { useState, useMemo } from 'react';
import { Layers, Activity, AlertOctagon, ZoomIn, ZoomOut, Info } from 'lucide-react';

export interface SequenceRegion {
  name: string;
  start: number; // 1-based
  end: number;
  type: 'backbone' | 'domain' | 'mutation' | 'signal' | 'active_site';
  color: 'sky' | 'orange' | 'red';
  description?: string;
}

export interface SequenceMapProps {
  sequence: string;
  accession: string;
  sequenceType: string;
  totalLength: number;
  mutations?: Array<{
    position: number;
    original?: string;
    modified?: string;
    description?: string;
  }>;
  onSelectPosition?: (pos: number) => void;
  onOpenAnalysis?: () => void;
}

export const SequenceMap: React.FC<SequenceMapProps> = ({
  sequence,
  accession,
  sequenceType,
  totalLength,
  mutations = [],
  onSelectPosition,
  onOpenAnalysis
}) => {
  const [hoveredPos, setHoveredPos] = useState<number | null>(null);
  const [activeRegion, setActiveRegion] = useState<SequenceRegion | null>(null);

  const length = totalLength || sequence.length || 100;
  const isProtein = sequenceType.toUpperCase().includes('PROT') || (!sequenceType.toUpperCase().includes('DNA') && !sequenceType.toUpperCase().includes('RNA'));

  // Derive biological regions based on sequence and known annotations
  const regions: SequenceRegion[] = useMemo(() => {
    const list: SequenceRegion[] = [];

    if (isProtein) {
      // If p53 (NP_000537)
      if (accession.includes('000537') || length === 361) {
        list.push({
          name: 'Transactivation Domain (TAD)',
          start: 1,
          end: Math.min(42, length),
          type: 'domain',
          color: 'orange',
          description: 'Regulates transcription activation and binds MDM2 / p300.'
        });
        list.push({
          name: 'Proline-Rich Domain (PRD)',
          start: 61,
          end: Math.min(94, length),
          type: 'backbone',
          color: 'sky',
          description: 'Mediates apoptotic signaling and protein interactions.'
        });
        list.push({
          name: 'Core DNA-Binding Domain (DBD)',
          start: 102,
          end: Math.min(292, length),
          type: 'domain',
          color: 'orange',
          description: 'Central sequence-specific DNA binding catalytic region; mutational hotspot in oncology.'
        });
        list.push({
          name: 'Tetramerization Domain (OD)',
          start: 325,
          end: Math.min(356, length),
          type: 'domain',
          color: 'orange',
          description: 'Responsible for homotetrameric assembly and physiological stability.'
        });
      } else if (accession.includes('000198') || length === 110) {
        // Preproinsulin
        list.push({
          name: 'Signal Peptide',
          start: 1,
          end: 24,
          type: 'signal',
          color: 'sky',
          description: 'Directs translocation to the endoplasmic reticulum.'
        });
        list.push({
          name: 'B Chain',
          start: 25,
          end: 54,
          type: 'domain',
          color: 'orange',
          description: 'Active mature insulin polypeptide subunit.'
        });
        list.push({
          name: 'C-Peptide (Connecting)',
          start: 55,
          end: 89,
          type: 'backbone',
          color: 'sky',
          description: 'Proteolytic linkage cleaved during prohormone maturation.'
        });
        list.push({
          name: 'A Chain',
          start: 90,
          end: 110,
          type: 'domain',
          color: 'orange',
          description: 'Active mature insulin polypeptide subunit.'
        });
      } else if (accession.includes('AAB08058') || length === 265) {
        // GFP
        list.push({
          name: 'N-Terminal Cap',
          start: 1,
          end: 30,
          type: 'backbone',
          color: 'sky',
          description: 'Structural N-terminal flanking segment.'
        });
        list.push({
          name: 'Fluorophore Core (Thr65-Tyr66-Gly67)',
          start: 60,
          end: 75,
          type: 'domain',
          color: 'orange',
          description: 'Catalytic autocatalytic tripeptide responsible for fluorescence emission (509 nm).'
        });
        list.push({
          name: '11-Stranded Beta Barrel',
          start: 76,
          end: 230,
          type: 'domain',
          color: 'orange',
          description: 'Rigid beta-can protective shield enclosing chromophore.'
        });
      } else {
        // Generic protein domain distribution
        const signalEnd = Math.max(15, Math.min(28, Math.floor(length * 0.15)));
        const coreStart = signalEnd + 1;
        const coreEnd = Math.floor(length * 0.75);

        list.push({
          name: 'N-Terminal Signal / Flank',
          start: 1,
          end: signalEnd,
          type: 'signal',
          color: 'sky',
          description: 'Hydrophobic N-terminal leader segment.'
        });
        list.push({
          name: 'Core Catalytic / Structural Fold',
          start: coreStart,
          end: coreEnd,
          type: 'domain',
          color: 'orange',
          description: 'Primary computational region of interest.'
        });
        list.push({
          name: 'C-Terminal Tail',
          start: coreEnd + 1,
          end: length,
          type: 'backbone',
          color: 'sky',
          description: 'Flexible regulatory or anchoring terminus.'
        });
      }
    } else {
      // Nucleotide (DNA/RNA)
      const promoterEnd = Math.min(60, Math.floor(length * 0.2));
      const cdsEnd = Math.floor(length * 0.85);

      list.push({
        name: '5\' Regulatory / Promoter Region',
        start: 1,
        end: promoterEnd,
        type: 'backbone',
        color: 'sky',
        description: 'Upstream transcription initiation boundary.'
      });
      list.push({
        name: 'Coding Sequence (CDS / Exon Frame)',
        start: promoterEnd + 1,
        end: cdsEnd,
        type: 'domain',
        color: 'orange',
        description: 'Primary open reading frame undergoing translation.'
      });
      list.push({
        name: '3\' UTR Regulatory Segment',
        start: cdsEnd + 1,
        end: length,
        type: 'backbone',
        color: 'sky',
        description: 'Polyadenylation and post-transcriptional signal region.'
      });
    }

    return list;
  }, [accession, length, isProtein]);

  // Generate tick markers
  const ticks = useMemo(() => {
    if (length <= 50) return [1, Math.round(length / 2), length];
    if (length <= 200) return [1, 50, 100, 150, length].filter(t => t <= length);
    if (length <= 500) return [1, 100, 200, 300, 400, length].filter(t => t <= length);
    if (length <= 2000) return [1, 500, 1000, 1500, length].filter(t => t <= length);
    return [1, Math.round(length * 0.25), Math.round(length * 0.5), Math.round(length * 0.75), length];
  }, [length]);

  const activeResidue = hoveredPos && sequence && sequence[hoveredPos - 1] 
    ? sequence[hoveredPos - 1] 
    : null;

  const activeMutation = hoveredPos 
    ? mutations.find(m => m.position === hoveredPos)
    : null;

  return (
    <div className="bg-white/90 border border-[#BAE6FD] rounded-2xl p-5 relative overflow-hidden shadow-[0_4px_20px_rgba(14,165,233,0.05)]">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#F0F9FF] border border-[#BAE6FD] flex items-center justify-center text-[#0284C7] shrink-0 shadow-xs">
            <Layers className="w-4 h-4 text-[#0284C7]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-[#0F172A] tracking-wide font-mono">
                BIOLOGICAL SEQUENCE MAP
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#F0F9FF] text-[#0284C7] border border-[#BAE6FD] font-semibold">
                1 ── {length.toLocaleString()} {isProtein ? 'aa' : 'bp'}
              </span>
            </div>
            <p className="text-xs text-[#64748B]">
              Interactive coordinate ribbon with domain annotations and variant loci
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] font-mono shrink-0 bg-[#F0F9FF]/80 px-3 py-1.5 rounded-xl border border-[#BAE6FD]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#38BDF8] inline-block" />
            <span className="text-[#0369A1] font-semibold">Sequence Backbone</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#F97316] inline-block" />
            <span className="text-[#C2410C] font-semibold">Domain / Motif</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#EF4444] inline-block" />
            <span className="text-[#DC2626] font-semibold">Mutation / Variant</span>
          </div>
        </div>
      </div>

      {/* Interactive Sequence Track */}
      <div className="space-y-2 mt-2">
        {/* Main Ribbon Container */}
        <div 
          className="relative h-12 bg-[#F1F5F9] rounded-xl border border-[#CBD5E1] p-1.5 flex items-center overflow-hidden group cursor-crosshair"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const fraction = Math.max(0, Math.min(1, clickX / rect.width));
            const pos = Math.max(1, Math.min(length, Math.round(fraction * length)));
            setHoveredPos(pos);
            const found = regions.find(r => pos >= r.start && pos <= r.end);
            setActiveRegion(found || null);
          }}
          onMouseLeave={() => {
            setHoveredPos(null);
            setActiveRegion(null);
          }}
          onClick={() => {
            if (hoveredPos && onSelectPosition) {
              onSelectPosition(hoveredPos);
            }
          }}
        >
          {/* Subtle background grid pattern */}
          <div 
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage: 'repeating-linear-gradient(90deg, #E2E8F0 0, #E2E8F0 1px, transparent 0, transparent 20px)'
            }}
          />

          {/* Region Blocks */}
          <div className="relative w-full h-7 flex items-center rounded-lg overflow-hidden gap-0.5">
            {regions.map((reg, idx) => {
              const startPct = ((reg.start - 1) / length) * 100;
              const widthPct = Math.max(1, ((reg.end - reg.start + 1) / length) * 100);

              const bgClass = reg.color === 'sky'
                ? 'bg-sky-100 border-[#38BDF8] text-[#0369A1] hover:bg-sky-200'
                : reg.color === 'orange'
                ? 'bg-pink-100 border-[#F9A8D4] text-[#BE185D] hover:bg-pink-200'
                : 'bg-red-100 border-[#FECACA] text-[#DC2626] hover:bg-red-200';

              return (
                <div
                  key={idx}
                  style={{
                    position: 'absolute',
                    left: `${startPct}%`,
                    width: `${widthPct}%`,
                    height: '100%'
                  }}
                  className={`border-y border-x rounded flex items-center justify-center px-1 text-[10px] font-mono font-medium transition-all ${bgClass}`}
                  title={`${reg.name} (${reg.start} - ${reg.end})`}
                >
                  <span className="truncate select-none font-semibold">
                    {widthPct > 8 ? reg.name : widthPct > 4 ? reg.name.substring(0, 3) : ''}
                  </span>
                </div>
              );
            })}

            {/* Mutation / Variant Markers */}
            {mutations.map((mut, mIdx) => {
              const mutPosPct = ((mut.position - 1) / length) * 100;
              return (
                <div
                  key={`mut-${mIdx}`}
                  style={{ left: `${mutPosPct}%` }}
                  className="absolute top-0 bottom-0 w-1.5 bg-[#EF4444] z-10 rounded-full shadow-xs hover:scale-125 transition-transform"
                  title={`Mutation at pos ${mut.position}: ${mut.original || '?'} → ${mut.modified || '?'}`}
                >
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#EF4444] animate-ping opacity-75" />
                </div>
              );
            })}

            {/* Hover Cursor Needle */}
            {hoveredPos !== null && (
              <div
                style={{ left: `${((hoveredPos - 1) / length) * 100}%` }}
                className="absolute top-0 bottom-0 w-0.5 bg-[#0F172A] z-20 pointer-events-none shadow-xs"
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#0F172A] shadow-xs" />
              </div>
            )}
          </div>
        </div>

        {/* Coordinate Axis Ticks */}
        <div className="relative w-full h-5 font-mono text-[10px] text-[#64748B] select-none">
          {ticks.map((tick) => {
            const tickPct = ((tick - 1) / length) * 100;
            return (
              <div
                key={tick}
                style={{ left: `${tickPct}%` }}
                className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
              >
                <div className="w-px h-1.5 bg-[#CBD5E1] mb-0.5" />
                <span className="text-[#64748B] font-semibold">{tick}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Inspector Bar */}
      <div className="mt-3 p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="px-2.5 py-1 rounded bg-white font-mono text-xs border border-[#E2E8F0] flex items-center gap-1.5 shadow-2xs">
            <span className="text-[#64748B]">RESIDUE:</span>
            <span className="text-[#0284C7] font-bold">
              {hoveredPos ? `${activeResidue || 'Position'} [${hoveredPos}]` : `Target: 1 ── ${length}`}
            </span>
          </div>

          <div className="text-[#334155] font-mono text-[11px] truncate max-w-md">
            {activeMutation ? (
              <span className="text-[#DC2626] font-semibold flex items-center gap-1">
                <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                Variant Loci: Pos {activeMutation.position} ({activeMutation.original} → {activeMutation.modified})
              </span>
            ) : activeRegion ? (
              <span>
                <span className={activeRegion.color === 'orange' ? 'text-[#BE185D] font-semibold' : 'text-[#0284C7] font-semibold'}>
                  {activeRegion.name}
                </span>{' '}
                <span className="text-[#64748B]">({activeRegion.start}-{activeRegion.end}):</span>{' '}
                <span className="text-[#475569]">{activeRegion.description}</span>
              </span>
            ) : (
              <span className="text-[#64748B]">
                Hover along the coordinate track to inspect loci, annotated domains, and variant positions.
              </span>
            )}
          </div>
        </div>

        {onOpenAnalysis && (
          <button
            onClick={onOpenAnalysis}
            className="text-[11px] font-mono text-[#0284C7] hover:text-[#0369A1] font-semibold transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <span>Analyze Full Sequence</span>
            <span>→</span>
          </button>
        )}
      </div>
    </div>
  );
};
