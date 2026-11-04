import React, { useState } from 'react';
import { TargetSequence, SequenceRecord } from '../../types';
import { CheckCircle2, ChevronDown, Play, Box, Sparkles, Layers, Dna } from 'lucide-react';

interface ActiveResearchWorkspaceProps {
  currentTarget: TargetSequence;
  availableSequences: SequenceRecord[];
  onSelectSequence: (seq: SequenceRecord) => void;
  onContinueAnalysis: () => void;
  onOpenStructure?: () => void;
  onAskBioAi?: () => void;
}

export const ActiveResearchWorkspace: React.FC<ActiveResearchWorkspaceProps> = ({
  currentTarget,
  availableSequences,
  onSelectSequence,
  onContinueAnalysis,
  onOpenStructure,
  onAskBioAi,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const cleanSeq = currentTarget.sequence?.toUpperCase().replace(/[^A-Z]/g, '') || '';
  const seqLength = currentTarget.totalLength || cleanSeq.length || 393;
  const isProtein = currentTarget.sequenceType?.toLowerCase().includes('prot') ?? true;

  // Preview slice for sequence ribbon (48 residues)
  const ribbonSlice = cleanSeq.slice(0, 48) || 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDD';

  const getResidueColor = (char: string) => {
    if (isProtein) {
      if (['A', 'V', 'I', 'L', 'M', 'F', 'W', 'P'].includes(char)) return 'bg-amber-50 text-amber-800 border-amber-200'; // Hydrophobic (Orange/Amber)
      if (['S', 'T', 'C', 'Y', 'N', 'Q'].includes(char)) return 'bg-sky-50 text-sky-800 border-sky-200'; // Polar (Sky Blue)
      if (['K', 'R', 'H'].includes(char)) return 'bg-purple-50 text-purple-800 border-purple-200'; // Basic (Purple)
      if (['D', 'E'].includes(char)) return 'bg-pink-50 text-pink-800 border-pink-200'; // Acidic (Pink)
      return 'bg-slate-50 text-slate-700 border-slate-200';
    } else {
      if (char === 'A') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      if (char === 'T' || char === 'U') return 'bg-pink-50 text-pink-800 border-pink-200';
      if (char === 'G') return 'bg-amber-50 text-amber-800 border-amber-200';
      if (char === 'C') return 'bg-sky-50 text-sky-800 border-sky-200';
      return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-[700] font-display uppercase tracking-wider text-sky-700 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" />
          <span>ACTIVE RESEARCH TARGET</span>
        </h2>
        <span className="text-[11px] font-sans font-medium text-slate-500 hidden sm:inline">
          In-Memory Workspace Target · Synced
        </span>
      </div>

      <div className="bg-white border border-sky-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Target Metadata & Actions (Left ~60%) */}
          <div className="lg:col-span-7 space-y-4 font-sans">
            {/* Clean Horizontal Target Metrics Bar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-2xl sm:text-3xl font-[700] font-mono text-slate-900 tracking-tight">
                  {currentTarget.accession}
                </span>

                <span className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-800 text-xs font-sans font-medium">
                  {currentTarget.organism}
                </span>

                <span className="px-2.5 py-1 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-xs font-sans font-[600]">
                  {currentTarget.sequenceType}
                </span>

                <span className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-900 text-xs font-display font-[700]">
                  {seqLength} <span className="font-sans font-normal text-slate-600">{isProtein ? 'aa' : 'bp'}</span>
                </span>

                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-300 font-[600] font-sans shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Sequence Validated</span>
                </span>
                
                <span className="inline-flex items-center gap-1.5 text-xs text-sky-800 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-300 font-[600] font-sans shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                  <span>Analysis Complete</span>
                </span>
              </div>

              {/* Target Switcher Dropdown */}
              {availableSequences.length > 1 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-sans font-[600] text-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                  >
                    <span>Switch Target</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-30 font-sans text-xs max-h-56 overflow-y-auto">
                      {availableSequences.map((seq) => (
                        <button
                          key={seq.id || seq.accession}
                          onClick={() => {
                            onSelectSequence(seq);
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors ${
                            seq.accession === currentTarget.accession ? 'bg-sky-50 text-sky-700 font-[600] border-l-2 border-sky-500' : 'text-slate-700 font-normal'
                          }`}
                        >
                          <span className="truncate font-mono font-[600]">{seq.accession}</span>
                          <span className="text-[10px] font-medium text-slate-500">{seq.total_length || seq.sequence?.length} {isProtein ? 'aa' : 'bp'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Target Definition */}
            <p className="text-xs sm:text-sm text-slate-600 font-sans font-[400] truncate max-w-xl">
              {currentTarget.definition}
            </p>

            {/* Action Trigger Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1 font-sans">
              <button
                type="button"
                onClick={onContinueAnalysis}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white text-xs font-[600] tracking-wide transition-all flex items-center gap-2 cursor-pointer shadow-[0_4px_12px_rgba(14,165,233,0.3)] hover:-translate-y-0.5 active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>CONTINUE ANALYSIS</span>
              </button>

              {onOpenStructure && (
                <button
                  type="button"
                  onClick={onOpenStructure}
                  className="px-4 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-[600] tracking-wide transition-all flex items-center gap-2 cursor-pointer shadow-2xs hover:-translate-y-0.5 active:scale-95"
                >
                  <Box className="w-3.5 h-3.5 text-purple-600" />
                  <span>3D STRUCTURE</span>
                </button>
              )}

              {onAskBioAi && (
                <button
                  type="button"
                  onClick={onAskBioAi}
                  className="px-4 py-2.5 rounded-xl bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-700 text-xs font-[600] tracking-wide transition-all flex items-center gap-2 cursor-pointer shadow-2xs hover:-translate-y-0.5 active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5 text-pink-600" />
                  <span>ASK BIOAI</span>
                </button>
              )}
            </div>
          </div>

          {/* Sequence Ribbon Visual Preview (Right ~40%) */}
          <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-sans text-slate-600">
              <span className="flex items-center gap-1.5 font-[600] text-slate-800 font-display">
                <Layers className="w-3.5 h-3.5 text-sky-600" />
                <span>Sequence Map</span>
              </span>
              <span className="font-mono font-[600] text-sky-700">1..{Math.min(cleanSeq.length, 48)} of {seqLength}</span>
            </div>

            {/* Tile Ribbon Display */}
            <div className="grid grid-cols-12 gap-1 font-mono text-[10px] font-bold select-all">
              {ribbonSlice.split('').map((char, idx) => (
                <div
                  key={idx}
                  className={`h-7 rounded flex items-center justify-center border transition-transform hover:scale-110 shadow-2xs ${getResidueColor(char)}`}
                  title={`Position ${idx + 1}: ${char}`}
                >
                  {char}
                </div>
              ))}
            </div>

            {/* Ribbon Legend */}
            <div className="flex items-center justify-between text-[10px] font-sans font-medium text-slate-500 pt-1.5 border-t border-slate-200">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Hydrophobic
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-500" /> Polar
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-purple-500" /> Basic
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-pink-500" /> Acidic
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
