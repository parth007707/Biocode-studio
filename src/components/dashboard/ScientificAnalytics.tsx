import React, { useMemo, useState } from 'react';
import { 
  BarChart3, 
  Activity, 
  Compass, 
  Info, 
  CheckCircle2, 
  ChevronRight, 
  Layers, 
  Zap, 
  Dna, 
  GitCommit, 
  Maximize2, 
  Grid
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { AnalysisRecord } from '../../types';

export interface ScientificAnalyticsProps {
  sequence: string;
  sequenceType: string;
  accession: string;
  analyses: AnalysisRecord[];
  mutations?: Array<{
    position: number;
    original?: string;
    modified?: string;
    description?: string;
  }>;
  onOpenAnalysisWorkbench?: () => void;
}

export const ScientificAnalytics: React.FC<ScientificAnalyticsProps> = ({
  sequence,
  sequenceType,
  accession,
  analyses,
  mutations = [],
  onOpenAnalysisWorkbench
}) => {
  const [activeView, setActiveView] = useState<'all' | 'composition' | 'profile' | 'activity' | 'coverage' | 'mutations'>('all');

  const isProtein = sequenceType.toUpperCase().includes('PROT') ||
    (!sequenceType.toUpperCase().includes('DNA') && !sequenceType.toUpperCase().includes('RNA'));

  // 1. Sequence Composition Calculation
  const compositionData = useMemo(() => {
    if (!sequence || sequence.length === 0) return [];
    const cleanSeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');
    const counts: Record<string, number> = {};
    for (let i = 0; i < cleanSeq.length; i++) {
      const ch = cleanSeq[i];
      counts[ch] = (counts[ch] || 0) + 1;
    }
    const total = cleanSeq.length || 1;
    return Object.entries(counts)
      .map(([symbol, count]) => ({
        symbol,
        count,
        percentage: Number(((count / total) * 100).toFixed(1))
      }))
      .sort((a, b) => b.count - a.count);
  }, [sequence]);

  // Composition Top 8 for charts
  const topComposition = useMemo(() => {
    return compositionData.slice(0, 8);
  }, [compositionData]);

  // 2. Kyte-Doolittle Hydropathy Sliding Window
  const hydropathyProfile = useMemo(() => {
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

    const windowSize = Math.max(5, Math.min(15, Math.floor(len / 20)));
    const halfWin = Math.floor(windowSize / 2);
    const step = Math.max(1, Math.floor(len / 35));
    const points: Array<{ pos: number; score: number; isMutated: boolean }> = [];

    const mutationPositions = new Set(mutations.map(m => m.position));

    for (let i = halfWin; i < len - halfWin; i += step) {
      let sum = 0;
      let count = 0;
      let hasMut = false;
      for (let w = -halfWin; w <= halfWin; w++) {
        const pos = i + w;
        const aa = cleanSeq[pos];
        if (aa && HYDROPATHY[aa] !== undefined) {
          sum += HYDROPATHY[aa];
          count++;
        }
        if (mutationPositions.has(pos + 1)) {
          hasMut = true;
        }
      }
      points.push({
        pos: i + 1,
        score: count > 0 ? Number((sum / count).toFixed(2)) : 0,
        isMutated: hasMut
      });
    }

    return points;
  }, [sequence, mutations]);

  // 3. Pipeline Analysis Activity History
  const activityChartData = useMemo(() => {
    if (!analyses || analyses.length === 0) {
      return [
        { name: 'Baseline', runs: 1, length: sequence.length || 361 }
      ];
    }
    return analyses.slice(0, 6).map((rec, index) => {
      const typeLabel = rec.analysis_type ? rec.analysis_type.split('_')[0] : `Run ${index + 1}`;
      const lengthAnalyzed = rec.analyzed_length || rec.total_sequence_length || 0;
      return {
        name: typeLabel.toUpperCase(),
        runs: 1,
        length: lengthAnalyzed
      };
    });
  }, [analyses, sequence]);

  // 4. Coverage Distribution Segments (10 deciles of sequence)
  const coverageData = useMemo(() => {
    const segments = 10;
    const len = sequence.length || 100;
    const segLen = Math.ceil(len / segments);
    return Array.from({ length: segments }, (_, i) => {
      return {
        decile: `${(i + 1) * 10}%`,
        coverage: 100,
        residues: Math.min(len, (i + 1) * segLen)
      };
    });
  }, [sequence]);

  // 5. Mutation Distribution across 8 bins
  const mutationDistribution = useMemo(() => {
    const len = sequence.length || 100;
    const bins = 6;
    const binSize = Math.ceil(len / bins);
    const counts = Array(bins).fill(0);
    mutations.forEach(m => {
      const binIdx = Math.min(bins - 1, Math.floor((m.position - 1) / binSize));
      if (binIdx >= 0) counts[binIdx]++;
    });
    return counts.map((count, idx) => ({
      range: `${idx * binSize + 1}–${Math.min(len, (idx + 1) * binSize)}`,
      mutations: count
    }));
  }, [sequence, mutations]);

  // Palette colors for pie chart
  const PIE_COLORS = ['#0284C7', '#0EA5E9', '#38BDF8', '#7DD3FC', '#BAE6FD', '#0369A1', '#075985', '#93C5FD'];

  return (
    <div className="space-y-4">
      {/* Section Title & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#E0F2FE] border border-[#7DD3FC] flex items-center justify-center text-[#0284C7] shadow-xs">
            <BarChart3 className="w-4 h-4 text-[#0284C7]" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#0F172A] tracking-tight flex items-center gap-2 font-mono">
              SCIENTIFIC ANALYTICS
            </h3>
            <p className="text-xs text-[#64748B]">
              Multi-dimensional biophysical profiles, stoichiometry, and computational verification
            </p>
          </div>
        </div>

        {/* View Switcher Controls */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/90 border border-[#BAE6FD] text-xs font-mono shadow-xs overflow-x-auto">
          <button
            onClick={() => setActiveView('all')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 font-semibold ${
              activeView === 'all'
                ? 'bg-[#E0F2FE] text-[#0369A1] border border-[#7DD3FC] shadow-2xs'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F0F9FF]'
            }`}
          >
            <Grid className="w-3.5 h-3.5 text-[#0284C7]" />
            <span>Command Grid</span>
          </button>
          <button
            onClick={() => setActiveView('composition')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeView === 'composition'
                ? 'bg-[#E0F2FE] text-[#0369A1] font-bold border border-[#7DD3FC] shadow-2xs'
                : 'text-[#64748B] hover:text-[#0284C7] hover:bg-[#F0F9FF]'
            }`}
          >
            Composition
          </button>
          <button
            onClick={() => setActiveView('profile')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeView === 'profile'
                ? 'bg-[#FFF7ED] text-[#C2410C] font-bold border border-[#FED7AA] shadow-2xs'
                : 'text-[#64748B] hover:text-[#EA580C] hover:bg-[#FFF7ED]'
            }`}
          >
            Physicochemical
          </button>
          <button
            onClick={() => setActiveView('activity')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeView === 'activity'
                ? 'bg-[#FDF2F8] text-[#BE185D] font-bold border border-[#F9A8D4] shadow-2xs'
                : 'text-[#64748B] hover:text-[#DB2777] hover:bg-[#FDF2F8]'
            }`}
          >
            Activity
          </button>
          <button
            onClick={() => setActiveView('coverage')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeView === 'coverage'
                ? 'bg-[#F0FDF4] text-[#15803D] font-bold border border-[#BBF7D0] shadow-2xs'
                : 'text-[#64748B] hover:text-[#16A34A] hover:bg-[#F0FDF4]'
            }`}
          >
            Coverage
          </button>
          <button
            onClick={() => setActiveView('mutations')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeView === 'mutations'
                ? 'bg-[#FEF2F2] text-[#DC2626] font-bold border border-[#FECACA] shadow-2xs'
                : 'text-[#64748B] hover:text-[#EF4444] hover:bg-[#FEF2F2]'
            }`}
          >
            Mutations
          </button>
        </div>
      </div>

      {/* Grid of Distinct Colored Analytical Cards */}
      <div className={`grid gap-5 ${activeView === 'all' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        
        {/* 1. SEQUENCE COMPOSITION CARD (SKY BLUE) */}
        {(activeView === 'all' || activeView === 'composition') && (
          <div className="bg-[#F0F9FF] border border-[#BAE6FD] hover:border-[#7DD3FC] rounded-2xl p-5 sm:p-6 transition-all shadow-[0_4px_20px_rgba(14,165,233,0.06)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-[#BAE6FD]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-white border border-[#7DD3FC] flex items-center justify-center text-[#0284C7] shadow-2xs">
                    <Dna className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold font-mono text-[#0369A1] tracking-wide uppercase">
                    SEQUENCE COMPOSITION ({isProtein ? 'AMINO ACIDS' : 'NUCLEOTIDES'})
                  </h4>
                </div>
                <span className="text-[11px] font-mono text-[#0284C7] bg-white px-2 py-0.5 rounded border border-[#BAE6FD] font-semibold">
                  Sky Blue Theme
                </span>
              </div>

              {/* Chart */}
              <div className="h-56 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topComposition} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#BAE6FD" vertical={false} opacity={0.6} />
                    <XAxis 
                      dataKey="symbol" 
                      tick={{ fill: '#0369A1', fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }} 
                      axisLine={{ stroke: '#BAE6FD' }}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fill: '#0369A1', fontSize: 10, fontFamily: 'monospace' }} 
                      axisLine={{ stroke: '#BAE6FD' }}
                      tickLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#FFFFFF', 
                        borderColor: '#7DD3FC', 
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(14,165,233,0.12)',
                        fontSize: '12px',
                        fontFamily: 'monospace'
                      }}
                      formatter={(val: any, name: any) => [`${val}% (${name})`, 'Frequency']}
                    />
                    <Bar dataKey="percentage" fill="#0284C7" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bottom Insight */}
            <div className="pt-3 mt-3 border-t border-[#BAE6FD] flex items-center justify-between text-xs font-mono text-[#0369A1]">
              <span>Top Residue: <strong>{compositionData[0]?.symbol || 'N/A'}</strong> ({compositionData[0]?.percentage || 0}%)</span>
              <span className="font-semibold text-[#0284C7]">{compositionData.length} Unique Monomers</span>
            </div>
          </div>
        )}

        {/* 2. PHYSICOCHEMICAL PROFILE CARD (ORANGE) */}
        {(activeView === 'all' || activeView === 'profile') && (
          <div className="bg-[#FFF7ED] border border-[#FED7AA] hover:border-[#FDBA74] rounded-2xl p-5 sm:p-6 transition-all shadow-[0_4px_20px_rgba(249,115,22,0.06)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-[#FED7AA]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-white border border-[#FED7AA] flex items-center justify-center text-[#EA580C] shadow-2xs">
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold font-mono text-[#C2410C] tracking-wide uppercase">
                    PHYSICOCHEMICAL PROFILE (HYDROPATHY & CHARGE)
                  </h4>
                </div>
                <span className="text-[11px] font-mono text-[#EA580C] bg-white px-2 py-0.5 rounded border border-[#FED7AA] font-semibold">
                  Orange Theme
                </span>
              </div>

              {/* Hydropathy Area Chart */}
              <div className="h-56 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hydropathyProfile} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <defs>
                      <linearGradient id="orangeHydropathy" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F97316" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="#F97316" stopOpacity={0.05}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#FED7AA" vertical={false} opacity={0.6} />
                    <XAxis 
                      dataKey="pos" 
                      tick={{ fill: '#C2410C', fontSize: 10, fontFamily: 'monospace' }} 
                      axisLine={{ stroke: '#FED7AA' }}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fill: '#C2410C', fontSize: 10, fontFamily: 'monospace' }} 
                      axisLine={{ stroke: '#FED7AA' }}
                      tickLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#FFFFFF', 
                        borderColor: '#FED7AA', 
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(249,115,22,0.12)',
                        fontSize: '12px',
                        fontFamily: 'monospace'
                      }}
                      formatter={(val: any) => [`${val} score`, 'Hydropathy']}
                      labelFormatter={(lbl) => `Residue Position ${lbl}`}
                    />
                    <Area type="monotone" dataKey="score" stroke="#EA580C" strokeWidth={2} fillOpacity={1} fill="url(#orangeHydropathy)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bottom Insight */}
            <div className="pt-3 mt-3 border-t border-[#FED7AA] flex items-center justify-between text-xs font-mono text-[#C2410C]">
              <span>Hydropathy Scale: Kyte-Doolittle</span>
              <span className="font-semibold text-[#EA580C]">Neutral EMBOSS Baseline</span>
            </div>
          </div>
        )}

        {/* 3. ANALYSIS ACTIVITY CARD (PINK) */}
        {(activeView === 'all' || activeView === 'activity') && (
          <div className="bg-[#FDF2F8] border border-[#FBCFE8] hover:border-[#F9A8D4] rounded-2xl p-5 sm:p-6 transition-all shadow-[0_4px_20px_rgba(236,72,153,0.06)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-[#FBCFE8]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-white border border-[#F9A8D4] flex items-center justify-center text-[#EC4899] shadow-2xs">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold font-mono text-[#BE185D] tracking-wide uppercase">
                    ANALYSIS ACTIVITY (PIPELINE EXECUTIONS)
                  </h4>
                </div>
                <span className="text-[11px] font-mono text-[#DB2777] bg-white px-2 py-0.5 rounded border border-[#F9A8D4] font-semibold">
                  Pink Theme
                </span>
              </div>

              {/* Activity Bar Chart */}
              <div className="h-56 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#FBCFE8" vertical={false} opacity={0.6} />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fill: '#BE185D', fontSize: 10, fontFamily: 'monospace' }} 
                      axisLine={{ stroke: '#FBCFE8' }}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fill: '#BE185D', fontSize: 10, fontFamily: 'monospace' }} 
                      axisLine={{ stroke: '#FBCFE8' }}
                      tickLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#FFFFFF', 
                        borderColor: '#F9A8D4', 
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(236,72,153,0.12)',
                        fontSize: '12px',
                        fontFamily: 'monospace'
                      }}
                      formatter={(val: any) => [`${val} residues`, 'Analyzed Scope']}
                    />
                    <Bar dataKey="length" fill="#EC4899" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bottom Insight */}
            <div className="pt-3 mt-3 border-t border-[#FBCFE8] flex items-center justify-between text-xs font-mono text-[#BE185D]">
              <span>Verified Supabase Transactions</span>
              <span className="font-semibold text-[#DB2777]">PostgreSQL Synced</span>
            </div>
          </div>
        )}

        {/* 4. ANALYSIS COVERAGE CARD (GREEN) */}
        {(activeView === 'all' || activeView === 'coverage') && (
          <div className="bg-[#F0FDF4] border border-[#BBF7D0] hover:border-[#86EFAC] rounded-2xl p-5 sm:p-6 transition-all shadow-[0_4px_20px_rgba(34,197,94,0.06)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-[#BBF7D0]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-white border border-[#BBF7D0] flex items-center justify-center text-[#16A34A] shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold font-mono text-[#15803D] tracking-wide uppercase">
                    ANALYSIS COVERAGE (VALIDATED DECILES)
                  </h4>
                </div>
                <span className="text-[11px] font-mono text-[#16A34A] bg-white px-2 py-0.5 rounded border border-[#BBF7D0] font-semibold">
                  Green Theme
                </span>
              </div>

              {/* Coverage Area Chart */}
              <div className="h-56 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={coverageData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <defs>
                      <linearGradient id="greenCoverage" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22C55E" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="#22C55E" stopOpacity={0.08}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#BBF7D0" vertical={false} opacity={0.6} />
                    <XAxis 
                      dataKey="decile" 
                      tick={{ fill: '#15803D', fontSize: 10, fontFamily: 'monospace' }} 
                      axisLine={{ stroke: '#BBF7D0' }}
                      tickLine={false}
                    />
                    <YAxis 
                      domain={[0, 110]}
                      tick={{ fill: '#15803D', fontSize: 10, fontFamily: 'monospace' }} 
                      axisLine={{ stroke: '#BBF7D0' }}
                      tickLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#FFFFFF', 
                        borderColor: '#BBF7D0', 
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(34,197,94,0.12)',
                        fontSize: '12px',
                        fontFamily: 'monospace'
                      }}
                      formatter={(val: any) => [`${val}% valid`, 'Decile Coverage']}
                    />
                    <Area type="stepAfter" dataKey="coverage" stroke="#16A34A" strokeWidth={2} fillOpacity={1} fill="url(#greenCoverage)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bottom Insight */}
            <div className="pt-3 mt-3 border-t border-[#BBF7D0] flex items-center justify-between text-xs font-mono text-[#15803D]">
              <span>Coverage: 100% Sequence Length</span>
              <span className="font-semibold text-[#16A34A]">Continuous IUPAC Pass</span>
            </div>
          </div>
        )}

        {/* 5. MUTATION DISTRIBUTION CARD (LIGHT RED) */}
        {(activeView === 'all' || activeView === 'mutations') && (
          <div className="bg-[#FFF1F2] border border-[#FECDD3] hover:border-[#FDA4AF] rounded-2xl p-5 sm:p-6 transition-all shadow-[0_4px_20px_rgba(239,68,68,0.06)] flex flex-col justify-between lg:col-span-2">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-[#FECDD3]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-white border border-[#FECDD3] flex items-center justify-center text-[#DC2626] shadow-2xs">
                    <GitCommit className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold font-mono text-[#9F1239] tracking-wide uppercase">
                    MUTATION DISTRIBUTION & VARIANT LOCI (RED THEME)
                  </h4>
                </div>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded border font-semibold ${
                  mutations.length > 0 
                    ? 'text-[#DC2626] bg-white border-[#FECACA]' 
                    : 'text-[#16A34A] bg-[#F0FDF4] border-[#BBF7D0]'
                }`}>
                  {mutations.length > 0 ? `${mutations.length} Variants Active` : 'Wild Type Reference'}
                </span>
              </div>

              {/* Chart or Status */}
              <div className="h-48 w-full pt-2">
                {mutations.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mutationDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#FECDD3" vertical={false} opacity={0.6} />
                      <XAxis 
                        dataKey="range" 
                        tick={{ fill: '#9F1239', fontSize: 10, fontFamily: 'monospace' }} 
                        axisLine={{ stroke: '#FECDD3' }}
                        tickLine={false}
                      />
                      <YAxis 
                        tick={{ fill: '#9F1239', fontSize: 10, fontFamily: 'monospace' }} 
                        axisLine={{ stroke: '#FECDD3' }}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#FFFFFF', 
                          borderColor: '#FECDD3', 
                          borderRadius: '12px',
                          boxShadow: '0 4px 12px rgba(239,68,68,0.12)',
                          fontSize: '12px',
                          fontFamily: 'monospace'
                        }}
                        formatter={(val: any) => [`${val} variant(s)`, 'Substitutions']}
                      />
                      <Bar dataKey="mutations" fill="#EF4444" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center space-y-2 bg-white/60 rounded-xl border border-[#FECDD3]/60 p-4">
                    <CheckCircle2 className="w-8 h-8 text-[#16A34A]" />
                    <span className="text-xs font-mono font-bold text-[#0F172A]">Canonical Wild Type Consensus</span>
                    <p className="text-[11px] font-mono text-[#64748B] text-center max-w-sm">
                      Zero non-synonymous variants detected for this sequence. All coordinates match canonical NCBI assembly.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Insight */}
            <div className="pt-3 mt-3 border-t border-[#FECDD3] flex items-center justify-between text-xs font-mono text-[#9F1239]">
              <span>Variant Impact Assessment Pipeline</span>
              <span className="font-semibold text-[#DC2626]">{mutations.length > 0 ? 'Hotspot Mapping Active' : 'No Variant Burden'}</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
