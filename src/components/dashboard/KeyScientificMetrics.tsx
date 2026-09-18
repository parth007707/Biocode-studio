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

  const metrics = [
    {
      id: 'mw',
      label: 'MOLECULAR WEIGHT',
      value: molecularWeightKDa > 0 ? molecularWeightKDa.toFixed(2) : '--',
      unit: 'kDa',
      subtext: molecularWeightDa > 0 ? `${molecularWeightDa.toLocaleString()} Da` : 'Stoichiometric mass',
      icon: Scale,
      cardBg: 'bg-[#F0F9FF] border-[#BAE6FD] hover:border-[#7DD3FC] shadow-[0_4px_16px_rgba(14,165,233,0.06)]',
      labelColor: 'text-[#0369A1]',
      valueColor: 'text-[#0284C7]',
      unitColor: 'text-[#0EA5E9]',
      dividerColor: 'border-[#BAE6FD]',
      iconColor: 'text-[#0284C7]',
      badgeColor: 'bg-white text-[#0284C7] border border-[#BAE6FD]',
      accentIndicator: 'bg-[#0EA5E9]'
    },
    {
      id: 'pi',
      label: isProtein ? 'ISOELECTRIC POINT' : 'GC CONTENT',
      value: isProtein 
        ? (typeof isoelectricPoint === 'number' ? isoelectricPoint.toFixed(2) : isoelectricPoint || '5.65')
        : (typeof isoelectricPoint === 'number' ? `${isoelectricPoint.toFixed(1)}` : isoelectricPoint),
      unit: isProtein ? 'pH' : '%',
      subtext: isProtein ? 'EMBOSS neutral charge' : 'Nucleotide base ratio',
      icon: Zap,
      cardBg: 'bg-[#FDF2F8] border-[#F9A8D4] hover:border-[#F472B6] shadow-[0_4px_16px_rgba(236,72,153,0.06)]',
      labelColor: 'text-[#9D174D]',
      valueColor: 'text-[#DB2777]',
      unitColor: 'text-[#EC4899]',
      dividerColor: 'border-[#F9A8D4]',
      iconColor: 'text-[#EC4899]',
      badgeColor: 'bg-white text-[#EC4899] border border-[#F9A8D4]',
      accentIndicator: 'bg-[#EC4899]'
    },
    {
      id: 'length',
      label: isProtein ? 'RESIDUES' : 'SEQUENCE LENGTH',
      value: residues > 0 ? residues.toLocaleString() : '--',
      unit: isProtein ? 'aa' : 'bp',
      subtext: `${sequenceType.toUpperCase()} reading frame`,
      icon: Dna,
      cardBg: 'bg-[#F5F3FF] border-[#DDD6FE] hover:border-[#C4B5FD] shadow-[0_4px_16px_rgba(139,92,246,0.06)]',
      labelColor: 'text-[#6D28D9]',
      valueColor: 'text-[#7C3AED]',
      unitColor: 'text-[#8B5CF6]',
      dividerColor: 'border-[#DDD6FE]',
      iconColor: 'text-[#8B5CF6]',
      badgeColor: 'bg-white text-[#8B5CF6] border border-[#DDD6FE]',
      accentIndicator: 'bg-[#8B5CF6]'
    },
    {
      id: 'coverage',
      label: 'COVERAGE',
      value: coveragePercentage > 0 ? `${coveragePercentage}` : '100',
      unit: '%',
      subtext: 'Complete sequence analyzed',
      icon: CheckCircle2,
      cardBg: 'bg-[#F0FDF4] border-[#BBF7D0] hover:border-[#86EFAC] shadow-[0_4px_16px_rgba(34,197,94,0.06)]',
      labelColor: 'text-[#15803D]',
      valueColor: 'text-[#16A34A]',
      unitColor: 'text-[#22C55E]',
      dividerColor: 'border-[#BBF7D0]',
      iconColor: 'text-[#16A34A]',
      badgeColor: 'bg-white text-[#16A34A] border border-[#BBF7D0]',
      accentIndicator: 'bg-[#22C55E]'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <div
            key={m.id}
            className={`border rounded-2xl p-5 transition-all hover:scale-[1.01] flex flex-col justify-between ${m.cardBg}`}
          >
            {/* Top Label & Icon */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className={`text-[11px] font-mono font-bold tracking-wider uppercase ${m.labelColor}`}>
                {m.label}
              </span>
              <div className={`p-1.5 rounded-lg shrink-0 shadow-2xs ${m.badgeColor}`}>
                <Icon className={`w-4 h-4 ${m.iconColor}`} />
              </div>
            </div>

            {/* Large Value & Unit */}
            <div className="my-1 flex items-baseline gap-1.5 flex-wrap">
              <span className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${m.valueColor}`}>
                {m.value}
              </span>
              <span className={`text-xs font-mono font-bold ${m.unitColor}`}>
                {m.unit}
              </span>
            </div>

            {/* Small Contextual Description */}
            <div className={`pt-2 mt-2 border-t text-[11px] font-mono flex items-center justify-between ${m.dividerColor} ${m.labelColor}`}>
              <span className="opacity-90">{m.subtext}</span>
              <span className={`w-2 h-2 rounded-full ${m.accentIndicator}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
};
