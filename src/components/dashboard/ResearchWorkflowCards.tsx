import React from 'react';
import { Dna, Activity, Box, GitCommit, Sparkles, ArrowRight } from 'lucide-react';

export interface ResearchWorkflowCardsProps {
  onNavigate: (stage: 'sequence' | 'analysis' | 'structure' | 'variants' | 'ai') => void;
  hasSequence: boolean;
  hasAnalysis: boolean;
  hasStructure: boolean;
  variantsCount: number;
}

export const ResearchWorkflowCards: React.FC<ResearchWorkflowCardsProps> = ({
  onNavigate,
  hasSequence,
  hasAnalysis,
  hasStructure,
  variantsCount
}) => {
  const steps = [
    {
      id: 'sequence' as const,
      num: '01',
      title: 'SEQUENCE',
      status: hasSequence ? 'Validated' : 'Ready',
      icon: Dna,
      cardBg: 'bg-[#08283D] hover:bg-[#0c344f]',
      borderColor: 'border-[#0EA5E9]/50 hover:border-[#0EA5E9]',
      numColor: 'text-[#38BDF8]',
      iconColor: 'text-[#38BDF8]',
      statusColor: 'text-[#4ADE80] bg-[#166534]/30 border-[#22C55E]/40'
    },
    {
      id: 'analysis' as const,
      num: '02',
      title: 'ANALYSIS',
      status: hasAnalysis ? 'Complete' : 'Ready',
      icon: Activity,
      cardBg: 'bg-[#2A1B0C] hover:bg-[#382412]',
      borderColor: 'border-[#F97316]/50 hover:border-[#F97316]',
      numColor: 'text-[#FB923C]',
      iconColor: 'text-[#FB923C]',
      statusColor: hasAnalysis 
        ? 'text-[#4ADE80] bg-[#166534]/30 border-[#22C55E]/40' 
        : 'text-[#FB923C] bg-[#9A3412]/30 border-[#F97316]/40'
    },
    {
      id: 'structure' as const,
      num: '03',
      title: 'STRUCTURE',
      status: hasStructure ? 'Available' : 'Ready',
      icon: Box,
      cardBg: 'bg-[#1D1635] hover:bg-[#271e47]',
      borderColor: 'border-[#8B5CF6]/50 hover:border-[#8B5CF6]',
      numColor: 'text-[#A78BFA]',
      iconColor: 'text-[#A78BFA]',
      statusColor: 'text-[#A78BFA] bg-[#5B21B6]/30 border-[#8B5CF6]/40'
    },
    {
      id: 'variants' as const,
      num: '04',
      title: 'VARIANTS',
      status: variantsCount > 0 ? `${variantsCount} Logged` : 'Wild Type',
      icon: GitCommit,
      cardBg: 'bg-[#301315] hover:bg-[#401a1c]',
      borderColor: 'border-[#EF4444]/50 hover:border-[#EF4444]',
      numColor: 'text-[#F87171]',
      iconColor: 'text-[#F87171]',
      statusColor: variantsCount > 0 
        ? 'text-[#F87171] bg-[#991B1B]/30 border-[#EF4444]/40' 
        : 'text-[#4ADE80] bg-[#166534]/30 border-[#22C55E]/40'
    },
    {
      id: 'ai' as const,
      num: '05',
      title: 'BIOAI',
      status: 'Ready',
      icon: Sparkles,
      cardBg: 'bg-[#301326] hover:bg-[#401a33]',
      borderColor: 'border-[#EC4899]/50 hover:border-[#EC4899]',
      numColor: 'text-[#F472B6]',
      iconColor: 'text-[#F472B6]',
      statusColor: 'text-[#F472B6] bg-[#9D174D]/30 border-[#EC4899]/40'
    }
  ];

  return (
    <div className="bg-[#0B1B31] border border-[#1E3A5F] rounded-2xl p-5 shadow-lg space-y-3.5">
      <div className="flex items-center justify-between pb-2 border-b border-[#1E3A5F]">
        <h3 className="text-xs font-bold font-mono text-[#38BDF8] uppercase tracking-wider">
          RESEARCH WORKFLOW
        </h3>
        <span className="text-[11px] text-[#94A3B8] font-mono">
          Click stage to transition module
        </span>
      </div>

      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 lg:gap-3">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isLast = idx === steps.length - 1;

          return (
            <React.Fragment key={step.id}>
              {/* Compact Step Card with domain-specific subtle dark-tinted colors */}
              <button
                type="button"
                onClick={() => onNavigate(step.id)}
                className={`flex-1 text-left border rounded-xl p-3.5 sm:p-4 transition-all duration-150 cursor-pointer shadow-md active:scale-[0.98] group ${step.cardBg} ${step.borderColor}`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className={`text-xs font-mono font-bold ${step.numColor}`}>
                    {step.num}
                  </span>
                  <Icon className={`w-4 h-4 ${step.iconColor} transition-transform group-hover:scale-110`} />
                </div>

                <div className="font-mono font-bold text-xs text-[#F8FAFC] tracking-wider mb-2">
                  {step.title}
                </div>

                <div className="inline-block">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-medium ${step.statusColor}`}>
                    {step.status}
                  </span>
                </div>
              </button>

              {/* Arrow separator (horizontal on md+, none on last) */}
              {!isLast && (
                <div className="hidden md:flex items-center justify-center shrink-0 px-0.5 text-[#1E3A5F]">
                  <ArrowRight className="w-4 h-4 text-[#1E3A5F] group-hover:text-[#38BDF8]" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
