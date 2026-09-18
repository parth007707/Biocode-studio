import React from 'react';
import { Clock, Activity, Dna, Box, GitCommit, Database, ArrowUpRight, Sparkles } from 'lucide-react';
import { AnalysisRecord } from '../../types';

export interface ResearchTimelineProps {
  analyses: AnalysisRecord[];
  onSelectAnalysis: (id: string) => void;
  onViewAllHistory: () => void;
}

export const ResearchTimeline: React.FC<ResearchTimelineProps> = ({
  analyses,
  onSelectAnalysis,
  onViewAllHistory
}) => {
  const formatTimestamp = (dateStr?: string) => {
    if (!dateStr) return 'Recent';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return 'Recent';
    }
  };

  const getEventCategory = (analysis: AnalysisRecord) => {
    const type = (analysis.analysis_type || '').toLowerCase();
    if (type.includes('mutation') || type.includes('variant') || (analysis.results && analysis.results.mutationsCount > 0)) {
      return {
        label: 'MUTATION VARIANT',
        color: 'red',
        icon: GitCommit,
        badgeClass: 'bg-red-500/15 text-red-300 border-red-500/30'
      };
    }
    if (type.includes('amino acid') || type.includes('composition') || type.includes('gc') || type.includes('orf')) {
      return {
        label: 'COMPUTATION',
        color: 'orange',
        icon: Activity,
        badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30'
      };
    }
    if (type.includes('structure') || type.includes('fold') || type.includes('alpha')) {
      return {
        label: 'STRUCTURAL',
        color: 'sky',
        icon: Box,
        badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30'
      };
    }
    if (type.includes('association') || type.includes('import')) {
      return {
        label: 'SEQUENCE INGEST',
        color: 'sky',
        icon: Dna,
        badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30'
      };
    }
    return {
      label: 'BIOLOGICAL PIPELINE',
      color: 'sky',
      icon: Activity,
      badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30'
    };
  };

  const displayList = analyses.slice(0, 6);

  return (
    <div className="bg-[#0B132B]/90 border border-slate-800 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm shadow-xl flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                RESEARCH TIMELINE & AUDIT LOG
              </h3>
              <p className="text-xs text-slate-400">
                Chronological laboratory activity & computational pipeline runs
              </p>
            </div>
          </div>

          <button
            onClick={onViewAllHistory}
            className="text-xs font-mono text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>View All ({analyses.length})</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {displayList.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-mono text-xs">
            No pipeline executions logged yet. Process a sequence to populate audit timeline.
          </div>
        ) : (
          <div className="space-y-2.5">
            {displayList.map((item, idx) => {
              const cat = getEventCategory(item);
              const CatIcon = cat.icon;
              const accession = item.sequence_record?.accession || (item as any).accession || 'Target Sequence';
              const organism = item.sequence_record?.organism || 'Homo sapiens';
              const length = item.total_sequence_length || item.sequence_record?.total_length || item.analyzed_length;

              return (
                <div
                  key={item.id || idx}
                  onClick={() => onSelectAnalysis(item.id)}
                  className="p-3 rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-slate-800/80 hover:border-sky-500/30 transition-all cursor-pointer group flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 group-hover:border-slate-700">
                      <CatIcon className={`w-4 h-4 ${cat.color === 'red' ? 'text-red-400' : cat.color === 'orange' ? 'text-orange-400' : 'text-sky-400'}`} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white truncate group-hover:text-sky-300 transition-colors">
                          {accession}
                        </span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border uppercase font-semibold shrink-0 ${cat.badgeClass}`}>
                          {cat.label}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5 font-sans">
                        {item.analysis_type} {length ? `(${length} ${item.sequence_type?.includes('Prot') ? 'aa' : 'bp'})` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-mono text-slate-400">
                      {formatTimestamp(item.created_at)}
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 justify-end mt-0.5">
                      <span className="w-1 h-1 rounded-full bg-emerald-400" />
                      Verified
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-500">
        <span className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>Persistent Audit Trace</span>
        </span>
        <span className="text-slate-400">
          Showing 6 most recent records
        </span>
      </div>
    </div>
  );
};
