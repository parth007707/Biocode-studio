import React from 'react';
import { Dna, Activity, Box, GitCommit, Sparkles, ChevronRight } from 'lucide-react';

export interface ResearchWorkflowProps {
  onNavigate: (stage: 'sequence' | 'analysis' | 'structure' | 'variants' | 'ai') => void;
  hasSequence: boolean;
  hasAnalysis: boolean;
  hasStructure: boolean;
  variantsCount: number;
  hasAiInsight: boolean;
  accession: string;
}

export const ResearchWorkflow: React.FC<ResearchWorkflowProps> = ({
  onNavigate,
  hasSequence,
  hasAnalysis,
  hasStructure,
  variantsCount,
  hasAiInsight,
  accession
}) => {
  const steps = [
    {
      id: 'sequence' as const,
      name: 'SEQUENCE',
      status: hasSequence ? 'LOADED' : 'PENDING',
      subtitle: accession || 'Import Target',
      icon: Dna,
      color: 'sky',
      activeColorClass: 'text-sky-400 bg-sky-500/10 border-sky-500/30 hover:bg-sky-500/20',
      badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      description: 'FASTA / GenBank ingestion & reading frame verification'
    },
    {
      id: 'analysis' as const,
      name: 'ANALYSIS',
      status: hasAnalysis ? 'CALCULATED' : 'READY',
      subtitle: hasAnalysis ? 'Properties Ready' : 'Run Pipeline',
      icon: Activity,
      color: 'orange',
      activeColorClass: 'text-orange-400 bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20',
      badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
      description: 'MW, pI, ORF, GC%, GRAVY stoichiometric analysis'
    },
    {
      id: 'structure' as const,
      name: 'STRUCTURE',
      status: hasStructure ? 'AVAILABLE' : 'PREDICTED',
      subtitle: 'Conformational Fold',
      icon: Box,
      color: 'sky',
      activeColorClass: 'text-sky-400 bg-sky-500/10 border-sky-500/30 hover:bg-sky-500/20',
      badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      description: '3D spatial folding & secondary structure elements'
    },
    {
      id: 'variants' as const,
      name: 'VARIANTS',
      status: variantsCount > 0 ? `${variantsCount} LOGGED` : 'CANONICAL',
      subtitle: variantsCount > 0 ? `${variantsCount} Variants` : 'Wild Type',
      icon: GitCommit,
      color: variantsCount > 0 ? 'red' : 'sky',
      activeColorClass: variantsCount > 0 
        ? 'text-red-400 bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
        : 'text-sky-400 bg-sky-500/10 border-sky-500/30 hover:bg-sky-500/20',
      badgeClass: variantsCount > 0 
        ? 'bg-red-500/20 text-red-300 border-red-500/40'
        : 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      description: 'Point substitutions, lineage tracking & version comparison'
    },
    {
      id: 'ai' as const,
      name: 'BIOAI INSIGHT',
      status: 'GROUNDED',
      subtitle: 'Gemini 3.1 Flash Lite',
      icon: Sparkles,
      color: 'orange',
      activeColorClass: 'text-orange-400 bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20',
      badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
      description: 'Hypothesis generation & biological mechanism synthesis'
    }
  ];

  return (
    <div className="bg-[#0B132B]/90 border border-slate-800 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-white tracking-wider uppercase font-mono">
              COMPUTATIONAL RESEARCH PIPELINE WORKFLOW
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
              Interactive Nodes
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Click any workflow stage to transition directly to that scientific analysis module
          </p>
        </div>

        <span className="text-[11px] font-mono text-sky-400 hidden sm:block">
          Active: <span className="font-semibold text-white">{accession}</span>
        </span>
      </div>

      {/* Sequential Pipeline Nodes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div key={step.id} className="relative group">
              <button
                onClick={() => onNavigate(step.id)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between h-full group-hover:-translate-y-0.5 shadow-sm ${step.activeColorClass}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono opacity-60 font-semibold">
                        0{idx + 1}
                      </span>
                      <span className="text-xs font-bold font-mono tracking-wider">
                        {step.name}
                      </span>
                    </div>
                    <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
                  </div>

                  <div className="flex items-center gap-1.5 my-1">
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border font-semibold ${step.badgeClass}`}>
                      {step.status}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-white truncate mt-1">
                    {step.subtitle}
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono opacity-80 group-hover:opacity-100">
                  <span className="text-slate-400">Open Module</span>
                  <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
