import React from 'react';
import { Dna, ChevronDown, CheckCircle2, ShieldCheck, Activity, Box, GitCommit, Sparkles, ArrowRight } from 'lucide-react';
import { TargetSequence } from '../../types';

export interface ResearchTargetCardProps {
  currentTarget: TargetSequence;
  availableSequences: TargetSequence[];
  onSelectSequence: (accession: string) => void;
  onLaunchWorkbench: () => void;
  onLaunchStructure: () => void;
  onLaunchVariants: () => void;
  onLaunchBioAi: () => void;
  isAnalysisComplete: boolean;
  mutationsCount: number;
}

export const ResearchTargetCard: React.FC<ResearchTargetCardProps> = ({
  currentTarget,
  availableSequences,
  onSelectSequence,
  onLaunchWorkbench,
  onLaunchStructure,
  onLaunchVariants,
  onLaunchBioAi,
  isAnalysisComplete,
  mutationsCount
}) => {
  const isProtein = currentTarget.sequenceType.toUpperCase().includes('PROT') ||
    (!currentTarget.sequenceType.toUpperCase().includes('DNA') && !currentTarget.sequenceType.toUpperCase().includes('RNA'));

  return (
    <div 
      className="border border-[#7DD3FC] rounded-2xl p-5 sm:p-6 lg:p-7 relative overflow-hidden shadow-[0_4px_25px_rgba(14,165,233,0.08)] transition-all"
      style={{
        background: 'linear-gradient(135deg, #E0F2FE 0%, #F0F9FF 100%)'
      }}
    >
      {/* Background Subtle Accent Glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#38BDF8]/20 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-[#BAE6FD] relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white border border-[#7DD3FC] flex items-center justify-center text-[#0284C7] shadow-xs">
            <Dna className="w-4 h-4 text-[#0284C7]" />
          </div>
          <div>
            <span className="text-xs font-bold font-mono tracking-widest text-[#0F172A] uppercase">
              ACTIVE RESEARCH TARGET
            </span>
            <span className="text-xs text-[#0369A1] block sm:inline sm:ml-2 font-medium">
              Canonical Biological Focus
            </span>
          </div>
        </div>

        {/* Sequence Switcher Dropdown */}
        <div className="relative">
          <select
            value={currentTarget.accession}
            onChange={(e) => onSelectSequence(e.target.value)}
            className="w-full sm:w-auto appearance-none bg-white hover:bg-[#F0F9FF] text-[#0F172A] text-xs font-mono font-medium py-2 pl-3.5 pr-8 rounded-xl border border-[#7DD3FC] focus:outline-none focus:border-[#0284C7] transition-colors cursor-pointer shadow-xs"
          >
            {availableSequences.map((seq, idx) => (
              <option 
                key={seq.id ? `target-opt-${seq.id}` : `target-opt-${seq.accession}-${idx}`} 
                value={seq.accession} 
                className="bg-white text-[#0F172A]"
              >
                {seq.accession} — {seq.organism || 'Homo sapiens'} ({seq.sequenceType.toUpperCase()})
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-[#0284C7] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Main Target Details Grid */}
      <div className="py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center relative z-10">
        {/* Large Sequence Identification (Sky Blue anchor) */}
        <div className="lg:col-span-5 space-y-2">
          <div className="flex items-baseline gap-3 flex-wrap">
            <div className="relative inline-block">
              <div className="absolute -inset-1 rounded-lg bg-[#38BDF8]/30 blur-md pointer-events-none" />
              <h2 className="relative text-2xl sm:text-3xl lg:text-4xl font-extrabold font-mono text-[#0284C7] tracking-tight">
                {currentTarget.accession}
              </h2>
            </div>
            <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-white text-[#0284C7] border border-[#7DD3FC] uppercase shadow-2xs">
              {currentTarget.sequenceType}
            </span>
          </div>

          <p className="text-sm text-[#1E293B] leading-relaxed font-sans max-w-xl font-medium">
            {currentTarget.definition || 'cellular tumor antigen p53 isoform a [Homo sapiens]'}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-[#475569] pt-1">
            <span>
              Organism: <strong className="text-[#0F172A] italic font-semibold">{currentTarget.organism || 'Homo sapiens'}</strong>
            </span>
            <span className="text-[#7DD3FC]">•</span>
            <span>
              Length: <strong className="text-[#0F172A] font-bold">{currentTarget.totalLength.toLocaleString()}</strong> {isProtein ? 'aa' : 'bp'}
            </span>
          </div>
        </div>

        {/* Target Status Panel */}
        <div className="lg:col-span-4 bg-white/90 rounded-xl p-4 border border-[#BAE6FD] space-y-2.5 shadow-xs">
          <div className="text-[11px] font-mono text-[#0369A1] uppercase tracking-wider font-bold">
            STATUS & VERIFICATION
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-[#334155] flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />
                Sequence Validated
              </span>
              <span className="text-[#16A34A] font-semibold bg-[#F0FDF4] px-2 py-0.5 rounded border border-[#BBF7D0]">IUPAC Pass</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#334155] flex items-center gap-1.5 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" />
                Analysis Complete
              </span>
              <span className={isAnalysisComplete ? 'text-[#16A34A] font-semibold bg-[#F0FDF4] px-2 py-0.5 rounded border border-[#BBF7D0]' : 'text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200'}>
                {isAnalysisComplete ? 'Verified' : 'Available'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#334155] flex items-center gap-1.5 font-medium">
                <GitCommit className="w-3.5 h-3.5 text-[#DC2626]" />
                Mutation Loci
              </span>
              <span className={mutationsCount > 0 ? 'text-[#DC2626] font-semibold bg-[#FEF2F2] px-2 py-0.5 rounded border border-[#FECACA]' : 'text-[#0284C7] font-semibold bg-[#F0F9FF] px-2 py-0.5 rounded border border-[#BAE6FD]'}>
                {mutationsCount > 0 ? `${mutationsCount} Tracked` : 'Wild Type'}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="lg:col-span-3 flex flex-col sm:flex-row lg:flex-col gap-2.5 justify-center">
          <button
            onClick={onLaunchWorkbench}
            className="w-full py-2.5 px-4 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-xs font-mono transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <Activity className="w-4 h-4 text-white" />
            <span>Launch Workbench</span>
          </button>

          <button
            onClick={onLaunchBioAi}
            className="w-full py-2.5 px-4 rounded-xl bg-[#FDF2F8] hover:bg-[#FCE7F3] text-[#BE185D] border border-[#F9A8D4] font-semibold text-xs font-mono transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#EC4899]" />
            <span>Consult BioAI</span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={onLaunchStructure}
              className="flex-1 py-2 px-3 rounded-lg bg-[#F5F3FF] hover:bg-[#EDE9FE] text-[#7C3AED] border border-[#DDD6FE] text-[11px] font-mono font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Box className="w-3.5 h-3.5 text-[#8B5CF6]" />
              <span>3D Fold</span>
            </button>
            <button
              onClick={onLaunchVariants}
              className="flex-1 py-2 px-3 rounded-lg bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA] text-[11px] font-mono font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <GitCommit className="w-3.5 h-3.5 text-[#EF4444]" />
              <span>Variants</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
