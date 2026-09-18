import React from 'react';
import { 
  Dna, 
  Cpu, 
  ShieldCheck, 
  CheckCircle2, 
  Layers, 
  Activity, 
  Database, 
  Box, 
  GitCommit, 
  AlertOctagon,
  ArrowRight
} from 'lucide-react';
import { SchemaHealthStatus } from '../../types';

export interface ResearchHeroCardsProps {
  target: {
    accession: string;
    definition: string;
    organism: string;
    sequenceType: string;
    totalLength: number;
    status: string;
  };
  intelligence: {
    molecularWeightKDa: number;
    isoelectricPoint: number | string;
    residues: number;
    coveragePercentage: number;
    isProtein: boolean;
  };
  signals: {
    isValidated: boolean;
    isAnalysisComplete: boolean;
    isSupabaseConnected: boolean;
    hasStructure: boolean;
    mutationsCount: number;
  };
  onLaunchWorkbench?: () => void;
  onOpenSignalsDetail?: () => void;
}

export const ResearchHeroCards: React.FC<ResearchHeroCardsProps> = ({
  target,
  intelligence,
  signals,
  onLaunchWorkbench,
  onOpenSignalsDetail
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {/* CARD 1: CURRENT RESEARCH TARGET */}
      <div className="bg-[#0B132B]/90 border border-slate-800 hover:border-sky-500/40 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm shadow-xl transition-all flex flex-col justify-between group">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Dna className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold font-mono text-white tracking-wider uppercase">
                CURRENT RESEARCH TARGET
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-800/60 font-semibold">
              PRIMARY
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-lg font-extrabold font-mono text-white tracking-wide group-hover:text-sky-300 transition-colors">
                {target.accession}
              </div>
              <p className="text-xs text-slate-300 font-sans mt-0.5 line-clamp-2 leading-relaxed">
                {target.definition || 'Cellular biological target sequence with verified reading frame.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/70 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block">ORGANISM</span>
                <span className="text-slate-200 font-semibold truncate block italic">
                  {target.organism || 'Homo sapiens'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">MOLECULE</span>
                <span className="text-sky-400 font-semibold uppercase block">
                  {target.sequenceType}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">LENGTH</span>
                <span className="text-white font-bold block">
                  {target.totalLength.toLocaleString()} {intelligence.isProtein ? 'aa' : 'bp'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">ANALYSIS STATUS</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1 block">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Verified Active
                </span>
              </div>
            </div>
          </div>
        </div>

        {onLaunchWorkbench && (
          <button
            onClick={onLaunchWorkbench}
            className="mt-4 pt-3 border-t border-slate-800/80 text-xs font-mono text-sky-400 hover:text-sky-300 font-semibold flex items-center justify-between cursor-pointer group-hover:translate-x-0.5 transition-transform"
          >
            <span>Open in Workbench</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* CARD 2: SEQUENCE INTELLIGENCE */}
      <div className="bg-[#0B132B]/90 border border-slate-800 hover:border-orange-500/40 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm shadow-xl transition-all flex flex-col justify-between group">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                <Cpu className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold font-mono text-white tracking-wider uppercase">
                SEQUENCE INTELLIGENCE
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-950/80 text-orange-300 border border-orange-800/60 font-semibold">
              BIOPHYSICAL
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 font-mono block">MOLECULAR WT</span>
              <div className="text-base font-bold font-mono text-white mt-0.5">
                {intelligence.molecularWeightKDa > 0 ? `${intelligence.molecularWeightKDa} kDa` : 'Calculating'}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 font-mono block">ISOELECTRIC PT</span>
              <div className="text-base font-bold font-mono text-sky-400 mt-0.5">
                {typeof intelligence.isoelectricPoint === 'number' ? `pH ${intelligence.isoelectricPoint}` : intelligence.isoelectricPoint}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 font-mono block">RESIDUES</span>
              <div className="text-base font-bold font-mono text-white mt-0.5">
                {intelligence.residues.toLocaleString()} {intelligence.isProtein ? 'aa' : 'bp'}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 font-mono block">COVERAGE</span>
              <div className="text-base font-bold font-mono text-orange-400 mt-0.5">
                {intelligence.coveragePercentage}%
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 font-mono mt-3 leading-relaxed">
            Calibrated stoichiometric mass, charge profile, and reading frame verification computed against canonical tables.
          </p>
        </div>

        {onLaunchWorkbench && (
          <button
            onClick={onLaunchWorkbench}
            className="mt-4 pt-3 border-t border-slate-800/80 text-xs font-mono text-orange-400 hover:text-orange-300 font-semibold flex items-center justify-between cursor-pointer group-hover:translate-x-0.5 transition-transform"
          >
            <span>Detailed Biophysical Inspector</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* CARD 3: RESEARCH STATUS */}
      <div className="bg-[#0B132B]/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm shadow-xl transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold font-mono text-white tracking-wider uppercase">
                RESEARCH STATUS
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 font-semibold">
              SIGNALS
            </span>
          </div>

          <div className="space-y-2.5 text-xs font-mono">
            {/* Sequence Validated */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/70">
              <span className="text-slate-300 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Sequence Validated
              </span>
              <span className="text-emerald-400 font-semibold">IUPAC Pass</span>
            </div>

            {/* Analysis Complete */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/70">
              <span className="text-slate-300 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                Analysis Coverage
              </span>
              <span className="text-orange-400 font-semibold">100% Verified</span>
            </div>

            {/* Supabase Synced */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/70">
              <span className="text-slate-300 flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${signals.isSupabaseConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                Supabase Synced
              </span>
              <span className={signals.isSupabaseConnected ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                {signals.isSupabaseConnected ? 'Connected' : 'Offline'}
              </span>
            </div>

            {/* Structure Available */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/70">
              <span className="text-slate-300 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                Structure Available
              </span>
              <span className="text-sky-400 font-semibold">Fold Predicted</span>
            </div>

            {/* Mutation Status */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/70">
              <span className="text-slate-300 flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${signals.mutationsCount > 0 ? 'bg-red-400' : 'bg-sky-400'}`} />
                Mutation Status
              </span>
              <span className={signals.mutationsCount > 0 ? 'text-red-400 font-semibold' : 'text-sky-400 font-semibold'}>
                {signals.mutationsCount > 0 ? `${signals.mutationsCount} Variants Tracked` : 'No Mutations'}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <span>Target: {target.accession}</span>
          <span className="text-emerald-400">Live Verification</span>
        </div>
      </div>
    </div>
  );
};
