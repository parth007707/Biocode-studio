import React from 'react';
import { Dna, Box, Sparkles, Database, ArrowRight } from 'lucide-react';

interface QuickResearchActionsProps {
  onOpenSequenceAnalysis: () => void;
  onOpenStructureExplorer: () => void;
  onOpenBioAi: () => void;
  onOpenDatabaseExplorer: () => void;
}

export const QuickResearchActions: React.FC<QuickResearchActionsProps> = ({
  onOpenSequenceAnalysis,
  onOpenStructureExplorer,
  onOpenBioAi,
  onOpenDatabaseExplorer,
}) => {
  const actions = [
    {
      id: 'sequence-analysis',
      title: 'SEQUENCE ANALYSIS',
      description: 'Analyze nucleotide and amino acid primary structures with biological metrics.',
      buttonText: 'Open Workbench',
      icon: Dna,
      accentColor: '#0EA5E9',
      cardClass: 'border-sky-200 hover:border-sky-400 bg-sky-50/30 hover:bg-sky-50/50 shadow-sm hover:shadow-md',
      iconBg: 'bg-sky-100 text-sky-700 border border-sky-200 shadow-2xs',
      buttonClass: 'bg-sky-600 hover:bg-sky-700 text-white shadow-xs',
      badgeClass: 'bg-sky-100 text-sky-800 border border-sky-200',
      titleColor: 'text-slate-900 group-hover:text-sky-700',
      onClick: onOpenSequenceAnalysis,
    },
    {
      id: 'structure-explorer',
      title: 'STRUCTURE EXPLORER',
      description: 'Explore 3D macromolecular structures with ribbon and surface representations.',
      buttonText: 'Open Structure',
      icon: Box,
      accentColor: '#8B5CF6',
      cardClass: 'border-purple-200 hover:border-purple-400 bg-purple-50/30 hover:bg-purple-50/50 shadow-sm hover:shadow-md',
      iconBg: 'bg-purple-100 text-purple-700 border border-purple-200 shadow-2xs',
      buttonClass: 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs',
      badgeClass: 'bg-purple-100 text-purple-800 border border-purple-200',
      titleColor: 'text-slate-900 group-hover:text-purple-700',
      onClick: onOpenStructureExplorer,
    },
    {
      id: 'bioai-assistant',
      title: 'BIOAI ASSISTANT',
      description: 'Ask scientific research questions grounded in your project sequences.',
      buttonText: 'Ask BioAI',
      icon: Sparkles,
      accentColor: '#EC4899',
      cardClass: 'border-pink-200 hover:border-pink-400 bg-pink-50/30 hover:bg-pink-50/50 shadow-sm hover:shadow-md',
      iconBg: 'bg-pink-100 text-pink-700 border border-pink-200 shadow-2xs',
      buttonClass: 'bg-pink-600 hover:bg-pink-700 text-white shadow-xs',
      badgeClass: 'bg-pink-100 text-pink-800 border border-pink-200',
      titleColor: 'text-slate-900 group-hover:text-pink-700',
      onClick: onOpenBioAi,
    },
    {
      id: 'database-explorer',
      title: 'DATABASE EXPLORER',
      description: 'Search and load verified genomic & proteomic records from Cloud Supabase.',
      buttonText: 'Explore Data',
      icon: Database,
      accentColor: '#22C55E',
      cardClass: 'border-emerald-200 hover:border-emerald-400 bg-emerald-50/30 hover:bg-emerald-50/50 shadow-sm hover:shadow-md',
      iconBg: 'bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-2xs',
      buttonClass: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs',
      badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      titleColor: 'text-slate-900 group-hover:text-emerald-700',
      onClick: onOpenDatabaseExplorer,
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-[800] font-mono uppercase tracking-wider text-slate-800 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sky-500 shadow-xs" />
          <span>QUICK ACTIONS</span>
        </h2>
        <span className="text-[11px] font-mono font-semibold text-slate-500 hidden sm:inline">
          Specialized Computational Engines
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <div
              key={act.id}
              className={`bg-white border rounded-2xl p-4 sm:p-5 transition-all duration-200 flex flex-col justify-between group cursor-pointer hover:-translate-y-1 ${act.cardClass}`}
              onClick={act.onClick}
            >
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className={`w-11 h-11 rounded-xl ${act.iconBg} flex items-center justify-center transition-transform duration-200 group-hover:scale-105`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-bold ${act.badgeClass}`}>
                    ENGINE
                  </span>
                </div>

                <div>
                  <h3 className={`text-sm font-[800] font-mono uppercase tracking-wide transition-colors ${act.titleColor}`}>
                    {act.title}
                  </h3>
                  <p className="text-xs text-slate-600 font-mono font-medium mt-1 leading-snug">
                    {act.description}
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    act.onClick();
                  }}
                  className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${act.buttonClass}`}
                >
                  <span>{act.buttonText}</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
