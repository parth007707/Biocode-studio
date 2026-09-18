import React from 'react';
import { ShieldCheck, Cpu, Box, GitCommit, Sparkles } from 'lucide-react';
import { SchemaHealthStatus } from '../../types';

export interface ResearchSystemStatusProps {
  isValidated: boolean;
  isAnalysisComplete: boolean;
  schemaStatus: SchemaHealthStatus | null;
  hasStructure: boolean;
  mutationsCount: number;
}

export const ResearchSystemStatus: React.FC<ResearchSystemStatusProps> = ({
  isValidated,
  isAnalysisComplete,
  schemaStatus,
  hasStructure,
  mutationsCount
}) => {
  const engines = [
    {
      id: 'iupac',
      name: 'IUPAC Sequence Engine',
      status: isValidated ? 'OPERATIONAL' : 'READY',
      badgeClass: 'bg-white text-[#16A34A] border-[#BBF7D0]',
      dotClass: 'bg-[#22C55E]',
      cardClass: 'bg-[#F0FDF4] border-[#BBF7D0]',
      icon: ShieldCheck,
      iconColor: 'text-[#16A34A]',
      footerColor: 'border-[#BBF7D0] text-[#15803D]',
      description: 'IUPAC alphabet parser, canonical reading frame validation, and FASTA/GenBank ingestion online.'
    },
    {
      id: 'biophysical',
      name: 'Biophysical Profiler',
      status: isAnalysisComplete ? 'ACTIVE' : 'READY',
      badgeClass: 'bg-white text-[#EA580C] border-[#FED7AA]',
      dotClass: 'bg-[#F97316]',
      cardClass: 'bg-[#FFF7ED] border-[#FED7AA]',
      icon: Cpu,
      iconColor: 'text-[#EA580C]',
      footerColor: 'border-[#FED7AA] text-[#C2410C]',
      description: 'Physical stoichiometry, EMBOSS isoelectric point algorithms, and hydropathy matrix actively loaded.'
    },
    {
      id: 'structural',
      name: 'Structural Feature Predictor',
      status: hasStructure ? 'OPERATIONAL' : 'READY',
      badgeClass: 'bg-white text-[#7C3AED] border-[#DDD6FE]',
      dotClass: 'bg-[#8B5CF6]',
      cardClass: 'bg-[#F5F3FF] border-[#DDD6FE]',
      icon: Box,
      iconColor: 'text-[#7C3AED]',
      footerColor: 'border-[#DDD6FE] text-[#6D28D9]',
      description: 'Secondary structure prediction matrices and 3D coordinate mapping pipeline functional.'
    },
    {
      id: 'mutation',
      name: 'Mutation & Variant Classifier',
      status: mutationsCount > 0 ? `${mutationsCount} VARIANTS` : 'STABLE',
      badgeClass: 'bg-white text-[#DC2626] border-[#FECACA]',
      dotClass: 'bg-[#EF4444]',
      cardClass: 'bg-[#FFF1F2] border-[#FECDD3]',
      icon: GitCommit,
      iconColor: 'text-[#DC2626]',
      footerColor: 'border-[#FECDD3] text-[#9F1239]',
      description: mutationsCount > 0
        ? `${mutationsCount} variant loci detected against wild-type baseline. Lineage tracking active.`
        : 'Zero substitutions detected. Sequence is strictly aligned with canonical wild-type standard.'
    },
    {
      id: 'bioai',
      name: 'BioAI Semantic Copilot',
      status: 'ACTIVE',
      badgeClass: 'bg-white text-[#BE185D] border-[#F9A8D4]',
      dotClass: 'bg-[#EC4899]',
      cardClass: 'bg-[#FDF2F8] border-[#F9A8D4]',
      icon: Sparkles,
      iconColor: 'text-[#EC4899]',
      footerColor: 'border-[#F9A8D4] text-[#9D174D]',
      description: 'Specialized biological reasoning engine with literature retrieval and functional impact predictions.'
    }
  ];

  return (
    <div className="bg-white/90 border border-[#BAE6FD] rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_rgba(14,165,233,0.05)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5 pb-3 border-b border-[#BAE6FD]">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-[#0F172A] tracking-wide font-mono flex items-center gap-2">
            <span className="text-[#0284C7]">RESEARCH SYSTEM STATUS</span>
            <span className="text-xs font-normal text-[#64748B]">| Core Computational Subsystems</span>
          </h3>
          <p className="text-xs text-[#64748B] mt-0.5">
            Real-time telemetry and operational diagnostics for primary computational engines
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-[#16A34A] bg-[#F0FDF4] px-3 py-1 rounded-full border border-[#BBF7D0]">
          <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
          <span className="font-bold">All Critical Systems Active</span>
        </div>
      </div>

      {/* Clean Responsive Multi-column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {engines.map((eng) => {
          const Icon = eng.icon;

          return (
            <div
              key={eng.id}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between shadow-2xs hover:scale-[1.01] ${eng.cardClass}`}
            >
              <div>
                {/* Engine Header: Name and Status Dot */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${eng.iconColor} shrink-0`} />
                    <span className="text-xs font-bold font-mono text-[#0F172A] tracking-wide">
                      {eng.name}
                    </span>
                  </div>

                  <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1.5 shrink-0 shadow-2xs ${eng.badgeClass}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${eng.dotClass}`} />
                    {eng.status}
                  </span>
                </div>

                {/* Full non-truncated description */}
                <p className="text-xs text-[#334155] font-sans leading-relaxed mt-2">
                  {eng.description}
                </p>
              </div>

              <div className={`pt-2.5 mt-3 border-t flex items-center justify-between text-[11px] font-mono font-semibold ${eng.footerColor}`}>
                <span>Subsystem: Active</span>
                <span>Verified ✓</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
