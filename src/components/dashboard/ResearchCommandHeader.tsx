import React, { useState } from 'react';
import { 
  Dna, 
  ChevronDown, 
  Activity, 
  Box, 
  GitCommit, 
  ExternalLink, 
  CheckCircle2, 
  ShieldCheck, 
  Layers, 
  Sparkles,
  Database
} from 'lucide-react';
import { SequenceRecord, AnalysisRecord } from '../../types';

export interface ResearchCommandHeaderProps {
  currentTarget: {
    accession: string;
    definition: string;
    organism: string;
    sequenceType: string;
    totalLength: number;
    sequence: string;
    id?: string;
  };
  availableSequences: SequenceRecord[];
  onSelectSequence: (seq: SequenceRecord) => void;
  onLaunchWorkbench: () => void;
  onLaunchStructure: () => void;
  onLaunchVariants: () => void;
  isSupabaseConnected: boolean;
}

export const ResearchCommandHeader: React.FC<ResearchCommandHeaderProps> = ({
  currentTarget,
  availableSequences,
  onSelectSequence,
  onLaunchWorkbench,
  onLaunchStructure,
  onLaunchVariants,
  isSupabaseConnected
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const isProtein = currentTarget.sequenceType.toUpperCase().includes('PROT') ||
    (!currentTarget.sequenceType.toUpperCase().includes('DNA') && !currentTarget.sequenceType.toUpperCase().includes('RNA'));

  return (
    <div className="relative rounded-3xl bg-gradient-to-b from-[#0F1B38] via-[#0B132B] to-[#070C1A] border border-sky-500/20 p-6 md:p-8 shadow-2xl overflow-hidden">
      {/* High-tech biological coordinate matrix background */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: 'radial-gradient(#38bdf8 1px, transparent 1px), radial-gradient(#38bdf8 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0, 12px 12px'
        }}
      />
      
      {/* Subtle Sky Blue corner glow */}
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />

      {/* Main Command Center Header */}
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-start justify-between gap-6 pb-6 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
              STATION ACTIVE
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              {isSupabaseConnected ? 'Supabase Synchronized' : 'Local Storage Cache'}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            BIOLOGICAL RESEARCH COMMAND CENTER
          </h1>
          <p className="text-slate-300 text-sm sm:text-base mt-1 max-w-2xl font-normal leading-relaxed">
            Analyze sequences, structures, variants and biological evidence in one unified computational workspace.
          </p>
        </div>

        {/* Target Switcher & Actions */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Target Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700 font-mono text-xs cursor-pointer transition-colors shadow-sm"
              title="Select active biological target"
            >
              <Dna className="w-4 h-4 text-sky-400" />
              <div className="text-left">
                <span className="text-[10px] text-slate-400 block leading-none">ACTIVE TARGET</span>
                <span className="font-bold text-sky-300">{currentTarget.accession}</span>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 max-h-80 overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2 text-[10px] font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  Switch Target ({availableSequences.length} Loaded)
                </div>
                {availableSequences.map((seq, idx) => (
                  <button
                    key={seq.id ? `cmd-seq-${seq.id}` : `cmd-seq-${seq.accession}-${idx}`}
                    onClick={() => {
                      onSelectSequence(seq);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-colors flex flex-col gap-0.5 cursor-pointer ${
                      seq.accession === currentTarget.accession
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{seq.accession}</span>
                      <span className="text-[10px] text-slate-400">{seq.total_length} {seq.sequence_type?.includes('Prot') ? 'aa' : 'bp'}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 truncate font-sans">
                      {seq.definition || seq.organism || 'Biological Sequence'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Launch Workbench Button */}
          <button
            onClick={onLaunchWorkbench}
            className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold font-mono text-xs flex items-center gap-2 transition-colors cursor-pointer shadow-lg shadow-sky-500/25"
          >
            <Activity className="w-4 h-4" />
            <span>Launch Workbench</span>
          </button>
        </div>
      </div>

      {/* Active Target Banner Details */}
      <div className="relative z-10 pt-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 shadow-inner">
            <Dna className="w-6 h-6" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-bold font-mono text-white tracking-wide">
                {currentTarget.accession}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-sky-950/80 text-sky-300 border border-sky-800/60 font-semibold">
                {currentTarget.sequenceType.toUpperCase()}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                {currentTarget.totalLength.toLocaleString()} {isProtein ? 'RESIDUES' : 'BASE PAIRS'}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                100% ANALYZED
              </span>
            </div>

            <p className="text-sm text-slate-300 font-sans mt-1.5 line-clamp-1">
              {currentTarget.definition || 'Cellular biological target sequence with verified reading frame.'}
            </p>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Organism: <span className="text-slate-300 italic">{currentTarget.organism || 'Homo sapiens'}</span>
            </p>
          </div>
        </div>

        {/* Quick Launch Action Pills */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={onLaunchStructure}
            className="px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-sky-300 hover:text-white border border-slate-700/80 text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Box className="w-3.5 h-3.5 text-sky-400" />
            <span>3D Folding</span>
          </button>
          <button
            onClick={onLaunchVariants}
            className="px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-red-300 hover:text-white border border-slate-700/80 text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <GitCommit className="w-3.5 h-3.5 text-red-400" />
            <span>Variants Track</span>
          </button>
        </div>
      </div>
    </div>
  );
};
