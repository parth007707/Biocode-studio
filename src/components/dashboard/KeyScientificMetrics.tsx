import React from 'react';
import { Scale, Zap, Dna, CheckCircle2 } from 'lucide-react';

export interface KeyScientificMetricsProps {
  molecularWeightKDa: number;
  molecularWeightDa: number;
  isoelectricPoint: number | string;
  residues: number;
  sequenceType: string;
  coveragePercentage: number;
}

export const KeyScientificMetrics: React.FC<KeyScientificMetricsProps> = ({
  molecularWeightKDa,
  molecularWeightDa,
  isoelectricPoint,
  residues,
  sequenceType,
  coveragePercentage
}) => {
  const isProtein = sequenceType.toUpperCase().includes('PROT') ||
    (!sequenceType.toUpperCase().includes('DNA') && !sequenceType.toUpperCase().includes('RNA'));
  const unit = isProtein ? 'aa' : 'bp';

  const cards = [
    {
      id: 'mw',
      title: 'Molecular Weight',
      value: molecularWeightKDa > 0 ? molecularWeightKDa.toFixed(2) : '--',
      unit: 'kDa',
      description: molecularWeightDa > 0 ? `${molecularWeightDa.toLocaleString()} Da mass` : 'Stoichiometric mass',
      icon: Scale,
      // Sky blue accent
      topBorder: 'border-t-2 border-t-[#38BDF8]',
      textColor: 'text-[#38BDF8]',
      iconColor: 'text-[#38BDF8]',
      iconBg: 'bg-[#08283D] border border-[#0EA5E9]/40',
      glow: 'shadow-[0_2px_12px_rgba(56,189,248,0.06)]'
    },
    {
      id: 'pi',
      title: isProtein ? 'Isoelectric Point' : 'GC Content',
      value: isProtein 
        ? (typeof isoelectricPoint === 'number' ? isoelectricPoint.toFixed(2) : isoelectricPoint || '5.65')
        : (typeof isoelectricPoint === 'number' ? `${isoelectricPoint.toFixed(1)}` : isoelectricPoint),
      unit: isProtein ? 'pH' : '%',
      description: isProtein ? 'EMBOSS neutral charge' : 'Nucleotide base ratio',
      icon: Zap,
      // Orange accent
      topBorder: 'border-t-2 border-t-[#FB923C]',
      textColor: 'text-[#FB923C]',
      iconColor: 'text-[#FB923C]',
      iconBg: 'bg-[#2A1B0C] border border-[#F97316]/40',
      glow: 'shadow-[0_2px_12px_rgba(251,146,60,0.06)]'
    },
    {
      id: 'residues',
      title: 'Residues',
      value: residues > 0 ? residues.toLocaleString() : '--',
      unit: unit,
      description: `${sequenceType.toUpperCase()} sequence length`,
      icon: Dna,
      // Purple accent
      topBorder: 'border-t-2 border-t-[#A78BFA]',
      textColor: 'text-[#A78BFA]',
      iconColor: 'text-[#A78BFA]',
      iconBg: 'bg-[#1D1635] border border-[#8B5CF6]/40',
      glow: 'shadow-[0_2px_12px_rgba(167,139,250,0.06)]'
    },
    {
      id: 'coverage',
      title: 'Analysis Coverage',
      value: coveragePercentage > 0 ? `${coveragePercentage}` : '100',
      unit: '%',
      description: 'Complete sequence analyzed',
      icon: CheckCircle2,
      // Green accent
      topBorder: 'border-t-2 border-t-[#4ADE80]',
      textColor: 'text-[#4ADE80]',
      iconColor: 'text-[#4ADE80]',
      iconBg: 'bg-[#166534]/30 border border-[#22C55E]/40',
      glow: 'shadow-[0_2px_12px_rgba(74,222,128,0.06)]'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.id}
            className={`bg-[#0F223A] hover:bg-[#122A45] border border-[#1E3A5F] ${c.topBorder} rounded-2xl p-4 sm:p-5 transition-all ${c.glow} flex flex-col justify-between`}
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-medium text-[#94A3B8]">
                {c.title}
              </span>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${c.iconBg}`}>
                <Icon className={`w-3.5 h-3.5 ${c.iconColor}`} />
              </div>
            </div>

            <div className="my-1">
              <div className="flex items-baseline gap-1.5 font-mono">
                <span className={`text-2xl sm:text-3xl font-bold tracking-tight ${c.textColor}`}>
                  {c.value}
                </span>
                <span className="text-xs font-semibold text-[#94A3B8]">
                  {c.unit}
                </span>
              </div>
            </div>

            <div className="pt-2 mt-2 border-t border-[#1E3A5F]/60 text-[11px] text-[#64748B] font-mono truncate">
              {c.description}
            </div>
          </div>
        );
      })}
    </div>
  );
};
