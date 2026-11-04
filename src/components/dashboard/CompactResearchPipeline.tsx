import React from 'react';
import { Dna, Activity, Box, GitCommit, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';

interface CompactResearchPipelineProps {
  onNavigate: (stage: 'sequence' | 'analysis' | 'structure' | 'variants' | 'ai') => void;
  activeStage?: 'sequence' | 'analysis' | 'structure' | 'variants' | 'ai';
}

export const CompactResearchPipeline: React.FC<CompactResearchPipelineProps> = ({
  onNavigate,
}) => {
  const stages = [
    {
      id: 'sequence' as const,
      num: '01',
      title: 'Sequence',
      status: 'Ready',
      icon: Dna,
      color: '#20AEEA', // Sky Blue
      bgLight: 'bg-[#E4F6FF]',
      borderHover: 'hover:border-[#20AEEA]'
    },
    {
      id: 'analysis' as const,
      num: '02',
      title: 'Analysis',
      status: 'Complete',
      icon: Activity,
      color: '#F97316', // Orange
      bgLight: 'bg-[#FFF1E8]',
      borderHover: 'hover:border-[#F97316]'
    },
    {
      id: 'structure' as const,
      num: '03',
      title: 'Structure',
      status: 'Available',
      icon: Box,
      color: '#7C3AED', // Purple
      bgLight: 'bg-[#F1ECFF]',
      borderHover: 'hover:border-[#7C3AED]'
    },
    {
      id: 'variants' as const,
      num: '04',
      title: 'Variants',
      status: 'Ready',
      icon: GitCommit,
      color: '#EF4444', // Red
      bgLight: 'bg-[#FEECEC]',
      borderHover: 'hover:border-[#EF4444]'
    },
    {
      id: 'ai' as const,
      num: '05',
      title: 'BioAI',
      status: 'Available',
      icon: Sparkles,
      color: '#EC4899', // Pink
      bgLight: 'bg-[#FCE7F3]',
      borderHover: 'hover:border-[#EC4899]'
    },
  ];

  return (
    <section className="space-y-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-[750] font-mono uppercase tracking-wider text-[#102A43] flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#7C3AED] shadow-xs" />
          <span>RESEARCH PIPELINE</span>
        </h2>
        <span className="text-xs font-mono font-semibold text-[#58728A] hidden sm:inline">
          In Silico Analytical Pipeline
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        {stages.map((stg, idx) => {
          const Icon = stg.icon;
          return (
            <React.Fragment key={stg.id}>
              <div
                onClick={() => onNavigate(stg.id)}
                className={`flex-1 bg-white border border-[#D9EAF5] ${stg.borderHover} rounded-xl p-4 flex flex-col justify-between transition-all duration-200 shadow-[0_4px_18px_rgba(50,120,170,0.06)] hover:shadow-[0_8px_24px_rgba(50,120,170,0.12)] hover:-translate-y-0.5 group cursor-pointer active:scale-[0.99] relative overflow-hidden`}
              >
                {/* Colored Top Accent Bar */}
                <div
                  className="absolute top-0 left-0 right-0 h-1"
                  style={{ backgroundColor: stg.color }}
                />

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-mono font-bold text-[#304A63] bg-[#F4FAFF] px-2 py-0.5 rounded border border-[#D9EAF5] shadow-2xs">
                    {stg.num}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-lg ${stg.bgLight} flex items-center justify-center transition-transform group-hover:scale-110 shadow-2xs`}
                    style={{ color: stg.color }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="pt-3 space-y-1">
                  <h4 className="text-xs font-[750] font-mono uppercase tracking-wider text-[#102A43] group-hover:text-[#087FBE] transition-colors">
                    {stg.title}
                  </h4>
                  <div 
                    className="flex items-center gap-1.5 text-xs font-mono font-[650]"
                    style={{ color: stg.color }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{stg.status}</span>
                  </div>
                </div>
              </div>

              {idx < stages.length - 1 && (
                <div className="hidden lg:flex items-center justify-center text-[#58728A] shrink-0">
                  <ArrowRight className="w-4 h-4 text-[#38536B]" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
};
