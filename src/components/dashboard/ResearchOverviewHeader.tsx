import React from 'react';
import { ChevronDown, Activity, Sparkles } from 'lucide-react';
import { TargetSequence } from '../../types';

export interface ResearchOverviewHeaderProps {
  currentTarget: TargetSequence;
  availableSequences: TargetSequence[];
  onSelectSequence: (accession: string) => void;
  onAnalyzeSequence: () => void;
  onAskBioAi: () => void;
  isAnalysisComplete?: boolean;
}

export const ResearchOverviewHeader: React.FC<ResearchOverviewHeaderProps> = ({
  currentTarget,
  availableSequences,
  onSelectSequence,
  onAnalyzeSequence,
  onAskBioAi,
  isAnalysisComplete = true
}) => {
  const isProtein = currentTarget.sequenceType.toUpperCase().includes('PROT') ||
    (!currentTarget.sequenceType.toUpperCase().includes('DNA') && !currentTarget.sequenceType.toUpperCase().includes('RNA'));
  const unit = isProtein ? 'aa' : 'bp';

  return (
    <div className="bg-[#0B1B31] border border-[#1E3A5F] border-t-2 border-t-[#38BDF8] rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden transition-all">
      {/* Subtle Sky Blue Glow near top-left */}
      <div className="absolute top-0 left-0 w-64 h-32 bg-[#38BDF8]/5 rounded-full blur-2xl pointer-events-none -ml-10 -mt-10" />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
        {/* Left: Title & Active Sequence Info */}
        <div className="space-y-3 min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#38BDF8]" />
              <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-[#38BDF8]">
                RESEARCH OVERVIEW
              </h2>
            </div>

            {/* Sequence Switcher Dropdown */}
            {availableSequences.length > 1 && (
              <div className="relative inline-block">
                <select
                  value={currentTarget.accession}
                  onChange={(e) => onSelectSequence(e.target.value)}
                  className="appearance-none bg-[#0F223A] hover:bg-[#122A45] text-[#38BDF8] text-xs font-mono font-medium py-1.5 pl-3 pr-7 rounded-lg border border-[#1E3A5F] hover:border-[#38BDF8]/40 focus:outline-none focus:border-[#38BDF8] transition-colors cursor-pointer shadow-xs"
                  title="Switch Active Research Sequence"
                >
                  {availableSequences.map((seq, idx) => (
                    <option 
                      key={seq.id ? `seq-${seq.id}` : `seq-${seq.accession}-${idx}`} 
                      value={seq.accession}
                      className="bg-[#0F223A] text-[#F8FAFC]"
                    >
                      {seq.accession} — {seq.organism || 'Homo sapiens'}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[#38BDF8] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Active Sequence Spec */}
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-xs text-[#94A3B8] font-mono">Active Sequence:</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-mono text-[#38BDF8] tracking-tight">
                {currentTarget.accession}
              </h1>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-[#64748B]">/</span>
                <span className="font-semibold text-[#F8FAFC]">{currentTarget.sequenceType}</span>
                <span className="text-[#64748B]">/</span>
                <span className="italic text-[#94A3B8]">{currentTarget.organism || 'Homo sapiens'}</span>
                <span className="text-[#64748B]">/</span>
                <span className="font-bold text-[#F8FAFC]">{currentTarget.totalLength.toLocaleString()} {unit}</span>
              </div>
            </div>

            {currentTarget.definition && (
              <p className="text-xs text-[#94A3B8] truncate mt-1 max-w-2xl font-sans" title={currentTarget.definition}>
                {currentTarget.definition}
              </p>
            )}
          </div>

          {/* Compact 2-Item Status Indicators */}
          <div className="flex items-center gap-4 text-xs font-mono pt-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
              <span className="font-medium text-[#4ADE80]">Sequence Validated</span>
            </span>
            <span className="text-[#1E3A5F]">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isAnalysisComplete ? 'bg-[#22C55E]' : 'bg-[#F97316]'}`} />
              <span className={`font-medium ${isAnalysisComplete ? 'text-[#4ADE80]' : 'text-[#FB923C]'}`}>
                {isAnalysisComplete ? 'Analysis Complete' : 'Analysis Pending'}
              </span>
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-row sm:flex-row lg:flex-col gap-2.5 shrink-0 justify-end lg:justify-center">
          {/* Analyze Sequence (Sky Blue) */}
          <button
            onClick={onAnalyzeSequence}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0EA5E9] text-white font-mono font-bold text-xs transition-all shadow-[0_0_15px_rgba(14,165,233,0.25)] flex items-center justify-center gap-2 cursor-pointer border border-[#38BDF8]/40 active:scale-[0.98]"
          >
            <Activity className="w-4 h-4 text-white" />
            <span>Analyze Sequence</span>
          </button>

          {/* Ask BioAI (Pink) */}
          <button
            onClick={onAskBioAi}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-[#9D174D]/25 hover:bg-[#9D174D]/45 text-[#F472B6] border border-[#EC4899]/50 font-mono font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(236,72,153,0.15)] active:scale-[0.98]"
          >
            <Sparkles className="w-4 h-4 text-[#EC4899]" />
            <span>Ask BioAI</span>
          </button>
        </div>
      </div>
    </div>
  );
};
