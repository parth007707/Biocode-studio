import React from 'react';
import { CheckCircle2, ShieldCheck, Database, Box, AlertCircle, AlertOctagon, Terminal } from 'lucide-react';
import { SchemaHealthStatus } from '../../types';

export interface ResearchSignalsProps {
  isValidated: boolean;
  isAnalysisComplete: boolean;
  schemaStatus: SchemaHealthStatus | null;
  hasStructure: boolean;
  mutationsCount: number;
  accession: string;
}

export const ResearchSignals: React.FC<ResearchSignalsProps> = ({
  isValidated,
  isAnalysisComplete,
  schemaStatus,
  hasStructure,
  mutationsCount,
  accession
}) => {
  const isSupabaseConnected = schemaStatus?.state === 'CONNECTED';

  const signals = [
    {
      id: 'validation',
      label: 'Sequence Validated',
      status: isValidated ? 'VALIDATED' : 'CHECKING',
      value: isValidated ? 'IUPAC Standards Pass' : 'Validation Pending',
      color: isValidated ? 'emerald' : 'amber',
      indicator: 'green',
      icon: ShieldCheck,
      description: 'Zero non-canonical symbols; reading frame verified'
    },
    {
      id: 'analysis',
      label: 'Analysis Coverage',
      status: isAnalysisComplete ? 'COMPLETED' : 'PARTIAL',
      value: isAnalysisComplete ? 'Pipelines Completed' : 'Pipelines Pending',
      color: isAnalysisComplete ? 'orange' : 'slate',
      indicator: 'orange',
      icon: CheckCircle2,
      description: 'Physical & stoichiometric calculations verified'
    },
    {
      id: 'database',
      label: 'Supabase Cloud Sync',
      status: isSupabaseConnected ? 'SYNCED' : 'OFFLINE',
      value: isSupabaseConnected ? 'PostgreSQL Canonical RLS' : 'Local Fallback Cache',
      color: isSupabaseConnected ? 'emerald' : 'amber',
      indicator: isSupabaseConnected ? 'green' : 'amber',
      icon: Database,
      description: isSupabaseConnected ? 'Real-time cloud database persistent' : 'Session cache only'
    },
    {
      id: 'structure',
      label: 'Structural Conformation',
      status: hasStructure ? 'AVAILABLE' : 'PREDICTED',
      value: hasStructure ? '3D Coordinates Ready' : 'Secondary Fold Modeled',
      color: 'sky',
      indicator: 'sky',
      icon: Box,
      description: 'Alpha-helix / beta-sheet spatial distribution'
    },
    {
      id: 'mutations',
      label: 'Mutation Status',
      status: mutationsCount > 0 ? `${mutationsCount} VARIANTS` : 'CONSERVED',
      value: mutationsCount > 0 ? `${mutationsCount} Variant Loci Tracked` : 'No Mutations Detected',
      color: mutationsCount > 0 ? 'red' : 'sky',
      indicator: mutationsCount > 0 ? 'red' : 'sky',
      icon: mutationsCount > 0 ? AlertOctagon : CheckCircle2,
      description: mutationsCount > 0 ? 'Substitutions logged against canonical version' : 'Sequence matches wild-type baseline'
    }
  ];

  return (
    <div className="bg-[#0B132B]/90 border border-slate-800 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          <h3 className="text-xs font-bold text-white tracking-wider uppercase font-mono">
            RESEARCH SIGNALS & VERIFICATION HUD
          </h3>
        </div>
        <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
          Target: {accession}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {signals.map((sig) => {
          const Icon = sig.icon;

          // Indicator bullet style: Green strictly for success/connected, Sky for sequence/structure, Orange for analysis, Red for mutations
          const bulletColor = sig.indicator === 'green'
            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
            : sig.indicator === 'orange'
            ? 'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.7)]'
            : sig.indicator === 'red'
            ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]'
            : 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]';

          const textColor = sig.indicator === 'green'
            ? 'text-emerald-400'
            : sig.indicator === 'orange'
            ? 'text-orange-400'
            : sig.indicator === 'red'
            ? 'text-red-400'
            : 'text-sky-400';

          return (
            <div 
              key={sig.id}
              className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-colors flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <span className="text-[11px] font-medium text-slate-300 truncate">
                  {sig.label}
                </span>
                <span className={`w-2 h-2 rounded-full shrink-0 ${bulletColor}`} />
              </div>

              <div className={`text-xs font-bold font-mono ${textColor} truncate`}>
                {sig.value}
              </div>

              <p className="text-[10px] text-slate-500 font-mono mt-1 leading-tight line-clamp-2">
                {sig.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
