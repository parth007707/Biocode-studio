import React, { useMemo } from 'react';
import { AnalysisRecord } from '../../types';
import { History, Activity, ArrowRight, CheckCircle2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

interface RecentResearchActivityProps {
  analyses: AnalysisRecord[];
  onSelectAnalysis: (id: string) => void;
  onViewAllHistory: () => void;
}

export const RecentResearchActivity: React.FC<RecentResearchActivityProps> = ({
  analyses,
  onSelectAnalysis,
  onViewAllHistory,
}) => {
  // Take last 4 real records (compact, 3-5 records)
  const recentList = useMemo(() => analyses.slice(0, 4), [analyses]);

  // Generate mini chart data from real records
  const activityChartData = useMemo(() => {
    if (analyses.length === 0) return [];

    const daysMap = new Map<string, number>();
    const sorted = [...analyses].reverse();

    sorted.forEach((item) => {
      const d = item.created_at ? new Date(item.created_at) : new Date();
      const label = d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
      daysMap.set(label, (daysMap.get(label) || 0) + 1);
    });

    const entries = Array.from(daysMap.entries()).slice(-6);
    if (entries.length === 0) {
      return [{ day: 'Today', count: 1 }];
    }
    return entries.map(([day, count]) => ({ day, count }));
  }, [analyses]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-[800] font-mono uppercase tracking-wider text-slate-800 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 shadow-xs" />
          <span>RECENT RESEARCH &amp; ACTIVITY</span>
        </h2>

        <button
          type="button"
          onClick={onViewAllHistory}
          className="text-xs font-mono font-bold text-sky-700 hover:text-sky-800 flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <span>View All History</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Real Activity List (~65%) */}
        <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="text-xs font-[800] font-mono uppercase text-slate-800 tracking-wide pb-2 border-b border-slate-100 flex items-center justify-between">
            <span>Recent Analysis Records</span>
            <span className="text-[10px] text-slate-500 font-semibold lowercase">last 3–5 runs</span>
          </div>

          {recentList.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center text-center space-y-2 text-slate-500">
              <History className="w-8 h-8 text-sky-600" />
              <p className="text-sm font-bold font-mono text-slate-800">
                No recent research activity.
              </p>
              <p className="text-xs max-w-sm text-slate-500 font-mono">
                Your research activity will appear here once sequences are analyzed or saved.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentList.map((rec) => {
                const accession = rec.sequence_record?.accession || 'NP_000537';
                const seqType = rec.sequence_record?.sequence_type || 'Protein';
                const dateStr = rec.created_at 
                  ? new Date(rec.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : 'Recent';

                return (
                  <div
                    key={rec.id}
                    onClick={() => onSelectAnalysis(rec.id)}
                    className="py-3 px-2 flex items-center justify-between gap-4 hover:bg-slate-50 rounded-xl transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                        <Activity className="w-4 h-4 text-sky-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold font-mono text-slate-900 group-hover:text-sky-700 transition-colors truncate">
                            {rec.analysis_type || rec.result_summary || 'Sequence Analysis'}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 shadow-2xs">
                            {accession}
                          </span>
                        </div>
                        <div className="text-xs font-mono font-medium text-slate-500 mt-0.5">
                          {rec.analysis_scope || 'Standard Analysis'} · {seqType}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
                      <span className="text-xs font-medium text-slate-500 hidden sm:inline">
                        {dateStr}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-300 font-bold shadow-2xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Completed</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Small Research Activity Chart (~35%) */}
        <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="text-xs font-[800] font-mono uppercase text-slate-800 tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-500 shadow-xs" />
              <span>RESEARCH ACTIVITY</span>
            </h3>
            <p className="text-xs font-mono font-medium text-slate-500">
              Daily analysis distribution
            </p>
          </div>

          <div className="h-44 w-full pt-3">
            {activityChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <XAxis 
                    dataKey="day" 
                    tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }} 
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis 
                    allowDecimals={false}
                    tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }} 
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#CBD5E1',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: '#0F172A',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
                    }}
                    cursor={{ fill: 'rgba(14, 165, 233, 0.08)' }}
                  />
                  <Bar dataKey="count" fill="#0EA5E9" radius={[4, 4, 0, 0]} name="Analyses" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-mono font-semibold">
                No activity recorded
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono font-semibold text-slate-600">
            <span>Total Recorded: <strong className="text-sky-700 font-bold">{analyses.length}</strong></span>
            <span className="text-emerald-700 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Synced</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
