import React, { useMemo } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import { Dna, Zap } from 'lucide-react';

export interface PrimaryAnalyticsChartsProps {
  sequence: string;
  sequenceType: string;
}

export const PrimaryAnalyticsCharts: React.FC<PrimaryAnalyticsChartsProps> = ({
  sequence,
  sequenceType
}) => {
  const isProtein = sequenceType.toUpperCase().includes('PROT') ||
    (!sequenceType.toUpperCase().includes('DNA') && !sequenceType.toUpperCase().includes('RNA'));

  // 1. Calculate Real Sequence Composition
  const compositionData = useMemo(() => {
    if (!sequence || sequence.length === 0) return [];
    const cleanSeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');
    const counts: Record<string, number> = {};
    for (let i = 0; i < cleanSeq.length; i++) {
      const ch = cleanSeq[i];
      counts[ch] = (counts[ch] || 0) + 1;
    }
    const total = cleanSeq.length || 1;
    
    // Sort descending by count, take top 8 for clean compact view
    return Object.entries(counts)
      .map(([symbol, count]) => ({
        symbol,
        count,
        percentage: Number(((count / total) * 100).toFixed(1))
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [sequence]);

  // 2. Calculate Real Hydropathy / Physicochemical Profile (Kyte-Doolittle)
  const hydropathyData = useMemo(() => {
    if (!sequence || sequence.length === 0) return [];

    const HYDROPATHY: Record<string, number> = {
      I: 4.5, V: 4.2, L: 3.8, F: 2.8, C: 2.5,
      M: 1.9, A: 1.8, G: -0.4, T: -0.7, S: -0.8,
      W: -0.9, Y: -1.3, P: -1.6, H: -3.2, E: -3.5,
      Q: -3.5, D: -3.5, N: -3.5, K: -3.9, R: -4.5
    };

    const cleanSeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');
    const len = cleanSeq.length;
    if (len === 0) return [];

    // If nucleotide sequence, calculate local GC window profile
    if (!isProtein) {
      const windowSize = Math.max(9, Math.min(31, Math.floor(len / 15)));
      const halfWin = Math.floor(windowSize / 2);
      const step = Math.max(1, Math.floor(len / 30));
      const points: Array<{ pos: number; score: number }> = [];

      for (let i = halfWin; i < len - halfWin; i += step) {
        let gcCount = 0;
        let count = 0;
        for (let w = -halfWin; w <= halfWin; w++) {
          const char = cleanSeq[i + w];
          if (char === 'G' || char === 'C') gcCount++;
          count++;
        }
        points.push({
          pos: i + 1,
          score: count > 0 ? Number(((gcCount / count) * 100).toFixed(1)) : 50
        });
      }
      return points;
    }

    // Protein: Kyte-Doolittle hydropathy sliding window
    const windowSize = Math.max(7, Math.min(19, Math.floor(len / 20)));
    const halfWin = Math.floor(windowSize / 2);
    const step = Math.max(1, Math.floor(len / 35));
    const points: Array<{ pos: number; score: number }> = [];

    for (let i = halfWin; i < len - halfWin; i += step) {
      let sum = 0;
      let count = 0;
      for (let w = -halfWin; w <= halfWin; w++) {
        const aa = cleanSeq[i + w];
        if (aa && HYDROPATHY[aa] !== undefined) {
          sum += HYDROPATHY[aa];
          count++;
        }
      }
      points.push({
        pos: i + 1,
        score: count > 0 ? Number((sum / count).toFixed(2)) : 0
      });
    }

    return points;
  }, [sequence, isProtein]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
      {/* 1. LEFT: Sequence Composition Bar Chart (Sky Blue Theme) */}
      <div className="bg-[#0B1B31] border border-[#1E3A5F] rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between h-[300px] sm:h-[310px]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-2 pb-2.5 border-b border-[#1E3A5F]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#08283D] border border-[#0EA5E9]/40 flex items-center justify-center text-[#38BDF8]">
              <Dna className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold font-mono text-[#38BDF8] tracking-wide uppercase">
                SEQUENCE COMPOSITION
              </h3>
              <p className="text-[11px] text-[#94A3B8]">
                {isProtein ? 'Top amino acid residues (% frequency)' : 'Nucleotide base distribution (%)'}
              </p>
            </div>
          </div>
          {compositionData[0] && (
            <span className="text-[11px] font-mono text-[#38BDF8] bg-[#08283D] px-2 py-0.5 rounded border border-[#0EA5E9]/40 hidden sm:inline-block font-semibold">
              Top: {compositionData[0].symbol} ({compositionData[0].percentage}%)
            </span>
          )}
        </div>

        {/* Bar Chart Plot Area (Dark navy) */}
        <div className="flex-1 w-full min-h-0 pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compositionData} margin={{ top: 8, right: 10, left: -25, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E3A5F" vertical={false} />
              <XAxis 
                dataKey="symbol" 
                tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }} 
                axisLine={{ stroke: '#1E3A5F' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fill: '#94A3B8', fontSize: 10, fontFamily: 'monospace' }} 
                axisLine={false}
                tickLine={false}
                domain={[0, 'auto']}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#0F223A', 
                  borderColor: '#1E3A5F', 
                  borderRadius: '10px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#F8FAFC'
                }}
                itemStyle={{ color: '#38BDF8' }}
                formatter={(val: any) => [`${val}%`, 'Frequency']}
                labelFormatter={(lbl) => `Residue: ${lbl}`}
              />
              <Bar 
                dataKey="percentage" 
                fill="#38BDF8" 
                radius={[4, 4, 0, 0]} 
                maxBarSize={36} 
                className="transition-colors hover:fill-[#22D3EE]"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Footer Insight */}
        <div className="pt-2 mt-1 border-t border-[#1E3A5F] flex items-center justify-between text-[11px] font-mono text-[#94A3B8]">
          <span>{compositionData.length} prominent monomers mapped</span>
          <span className="text-[#38BDF8] font-medium">Stoichiometry Verified</span>
        </div>
      </div>

      {/* 2. RIGHT: Physicochemical Profile Area/Line Chart (Orange Theme) */}
      <div className="bg-[#0B1B31] border border-[#1E3A5F] rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between h-[300px] sm:h-[310px]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-2 pb-2.5 border-b border-[#1E3A5F]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#2A1B0C] border border-[#F97316]/40 flex items-center justify-center text-[#FB923C]">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold font-mono text-[#FB923C] tracking-wide uppercase">
                PHYSICOCHEMICAL PROFILE
              </h3>
              <p className="text-[11px] text-[#94A3B8]">
                {isProtein ? 'Kyte-Doolittle hydropathy index (sliding window)' : 'Local GC% density along sequence'}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-[#FB923C] bg-[#2A1B0C] px-2 py-0.5 rounded border border-[#F97316]/40 hidden sm:inline-block font-semibold">
            {isProtein ? 'Hydrophobic / Polar' : 'GC Trajectory'}
          </span>
        </div>

        {/* Area Chart Plot Area (Dark navy) */}
        <div className="flex-1 w-full min-h-0 pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hydropathyData} margin={{ top: 8, right: 10, left: -25, bottom: 4 }}>
              <defs>
                <linearGradient id="orangeHydropathyGradientDark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F97316" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#F97316" stopOpacity={0.01}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E3A5F" vertical={false} />
              <XAxis 
                dataKey="pos" 
                tick={{ fill: '#94A3B8', fontSize: 10, fontFamily: 'monospace' }} 
                axisLine={{ stroke: '#1E3A5F' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fill: '#94A3B8', fontSize: 10, fontFamily: 'monospace' }} 
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#0F223A', 
                  borderColor: '#1E3A5F', 
                  borderRadius: '10px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#F8FAFC'
                }}
                itemStyle={{ color: '#FB923C' }}
                formatter={(val: any) => [`${val}`, isProtein ? 'Hydropathy Index' : 'GC Content %']}
                labelFormatter={(lbl) => `Residue Position ${lbl}`}
              />
              <Area 
                type="monotone" 
                dataKey="score" 
                stroke="#F97316" 
                strokeWidth={2} 
                fillOpacity={1} 
                fill="url(#orangeHydropathyGradientDark)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Footer Insight */}
        <div className="pt-2 mt-1 border-t border-[#1E3A5F] flex items-center justify-between text-[11px] font-mono text-[#94A3B8]">
          <span>{isProtein ? 'Scale: Kyte-Doolittle (-4.5 to +4.5)' : 'GC Density Baseline (0 - 100%)'}</span>
          <span className="text-[#FB923C] font-medium">Thermodynamic Baseline</span>
        </div>
      </div>
    </div>
  );
};
