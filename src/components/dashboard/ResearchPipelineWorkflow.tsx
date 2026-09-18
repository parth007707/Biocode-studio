import React from 'react';
import { Dna, Activity, Box, GitCommit, Sparkles, ChevronRight, ArrowRight, ArrowDown } from 'lucide-react';

export interface ResearchPipelineWorkflowProps {
  onNavigate: (stage: 'sequence' | 'analysis' | 'structure' | 'variants' | 'ai') => void;
  hasSequence: boolean;
  hasAnalysis: boolean;
  hasStructure: boolean;
  variantsCount: number;
  accession: string;
}

export const ResearchPipelineWorkflow: React.FC<ResearchPipelineWorkflowProps> = ({
  onNavigate,
  hasSequence,
  hasAnalysis,
  hasStructure,
  variantsCount,
  accession
}) => {
  const stages = [
    {
      id: 'sequence' as const,
      num: '01',
      name: 'SEQUENCE',
      status: hasSequence ? 'COMPLETED' : 'READY',
      isComplete: hasSequence,
      cardBg: 'bg-[#F0F9FF] border-[#BAE6FD] hover:border-[#7DD3FC]',
      numColor: 'text-[#0284C7]',
      nameColor: 'text-[#0369A1]',
      statusColor: hasSequence 
        ? 'text-[#16A34A] bg-[#F0FDF4] border-[#BBF7D0]' 
        : 'text-[#0369A1] bg-white border-[#BAE6FD]',
      description: 'Ingestion & IUPAC canonical verification',
      icon: Dna,
      iconColor: 'text-[#0284C7]',
      btnColor: 'text-[#0284C7] hover:text-[#0369A1]',
      dividerColor: 'border-[#BAE6FD]'
    },
    {
      id: 'analysis' as const,
      num: '02',
      name: 'ANALYSIS',
      status: hasAnalysis ? 'COMPLETED' : 'READY',
      isComplete: hasAnalysis,
      cardBg: 'bg-[#FFF7ED] border-[#FED7AA] hover:border-[#FDBA74]',
      numColor: 'text-[#EA580C]',
      nameColor: 'text-[#C2410C]',
      statusColor: hasAnalysis 
        ? 'text-[#16A34A] bg-[#F0FDF4] border-[#BBF7D0]' 
        : 'text-[#C2410C] bg-white border-[#FED7AA]',
      description: 'Physical MW, pI, & stoichiometric profiles',
      icon: Activity,
      iconColor: 'text-[#EA580C]',
      btnColor: 'text-[#EA580C] hover:text-[#C2410C]',
      dividerColor: 'border-[#FED7AA]'
    },
    {
      id: 'structure' as const,
      num: '03',
      name: 'STRUCTURE',
      status: hasStructure ? 'COMPLETED' : 'READY',
      isComplete: hasStructure,
      cardBg: 'bg-[#F5F3FF] border-[#DDD6FE] hover:border-[#C4B5FD]',
      numColor: 'text-[#7C3AED]',
      nameColor: 'text-[#6D28D9]',
      statusColor: hasStructure 
        ? 'text-[#16A34A] bg-[#F0FDF4] border-[#BBF7D0]' 
        : 'text-[#6D28D9] bg-white border-[#DDD6FE]',
      description: '3D spatial folding & secondary elements',
      icon: Box,
      iconColor: 'text-[#7C3AED]',
      btnColor: 'text-[#7C3AED] hover:text-[#6D28D9]',
      dividerColor: 'border-[#DDD6FE]'
    },
    {
      id: 'variants' as const,
      num: '04',
      name: 'VARIANTS',
      status: variantsCount > 0 ? `${variantsCount} VARIANTS` : 'COMPLETED',
      isComplete: true,
      cardBg: 'bg-[#FFF1F2] border-[#FECDD3] hover:border-[#FDA4AF]',
      numColor: 'text-[#DC2626]',
      nameColor: 'text-[#9F1239]',
      statusColor: variantsCount > 0 
        ? 'text-[#DC2626] bg-white border-[#FECACA]' 
        : 'text-[#16A34A] bg-[#F0FDF4] border-[#BBF7D0]',
      description: variantsCount > 0 ? `${variantsCount} point substitutions tracked` : 'Sequence matches canonical wild-type',
      icon: GitCommit,
      iconColor: 'text-[#DC2626]',
      btnColor: 'text-[#DC2626] hover:text-[#9F1239]',
      dividerColor: 'border-[#FECDD3]'
    },
    {
      id: 'ai' as const,
      num: '05',
      name: 'BIOAI',
      status: 'GROUNDED',
      isComplete: true,
      cardBg: 'bg-[#FDF2F8] border-[#F9A8D4] hover:border-[#F472B6]',
      numColor: 'text-[#DB2777]',
      nameColor: 'text-[#BE185D]',
      statusColor: 'text-[#BE185D] bg-white border-[#F9A8D4]',
      description: 'Grounded biological hypothesis generation',
      icon: Sparkles,
      iconColor: 'text-[#EC4899]',
      btnColor: 'text-[#EC4899] hover:text-[#BE185D]',
      dividerColor: 'border-[#F9A8D4]'
    }
  ];

  return (
    <div className="bg-white/80 border border-[#BAE6FD] rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_rgba(14,165,233,0.05)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5 pb-3 border-b border-[#BAE6FD]">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-[#0F172A] tracking-wide font-mono flex items-center gap-2">
            <span className="text-[#0284C7]">COMPUTATIONAL RESEARCH PIPELINE</span>
            <span className="text-xs font-normal text-[#64748B]">| Integrated Stages</span>
          </h3>
          <p className="text-xs text-[#64748B] mt-0.5">
            End-to-end biological sequence workflow from ingestion to AI synthesis
          </p>
        </div>
        <span className="text-xs font-mono text-[#64748B] bg-[#F0F9FF] px-2.5 py-1 rounded-lg border border-[#BAE6FD]">
          Target: <strong className="text-[#0284C7]">{accession}</strong>
        </span>
      </div>

      {/* Pipeline Container: Horizontal on Desktop, Vertical on Tablet/Mobile */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 lg:gap-2">
        {stages.map((stage, idx) => {
          const Icon = stage.icon;
          const isLast = idx === stages.length - 1;

          return (
            <React.Fragment key={stage.id}>
              {/* Compact Color-coded Stage Node */}
              <div className={`flex-1 border rounded-xl p-4 transition-all flex flex-col justify-between group shadow-2xs hover:scale-[1.02] ${stage.cardBg}`}>
                <div>
                  {/* Top: Stage Number, Name & Icon */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-mono font-extrabold ${stage.numColor}`}>
                        {stage.num}
                      </span>
                      <span className={`text-xs font-bold font-mono tracking-wider ${stage.nameColor}`}>
                        {stage.name}
                      </span>
                    </div>
                    <Icon className={`w-4 h-4 ${stage.iconColor} shrink-0 transition-transform group-hover:scale-110`} />
                  </div>

                  {/* Status Pill */}
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border font-semibold inline-flex items-center gap-1 ${stage.statusColor}`}>
                      {stage.isComplete && <span className="text-[#16A34A]">✓</span>}
                      {stage.status}
                    </span>
                  </div>

                  {/* Short Description */}
                  <p className="text-[11px] text-[#334155] font-sans leading-snug line-clamp-2">
                    {stage.description}
                  </p>
                </div>

                {/* Open Module Action Button */}
                <button
                  onClick={() => onNavigate(stage.id)}
                  className={`mt-3 pt-2.5 border-t flex items-center justify-between text-[11px] font-mono transition-colors cursor-pointer w-full text-left font-bold ${stage.dividerColor} ${stage.btnColor}`}
                >
                  <span>Open Stage</span>
                  <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              </div>

              {/* Connector Arrow */}
              {!isLast && (
                <div className="flex justify-center items-center py-1 lg:py-0 shrink-0 text-[#7DD3FC]">
                  <span className="hidden lg:inline">
                    <ArrowRight className="w-4 h-4 text-[#0284C7]" />
                  </span>
                  <span className="inline lg:hidden">
                    <ArrowDown className="w-4 h-4 text-[#0284C7]" />
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
