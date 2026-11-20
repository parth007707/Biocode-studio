import React from 'react';
import { ArrowRight, History } from 'lucide-react';
import { AnalysisRecord } from '../../types';

export interface RecentAnalysisSectionProps {
  analyses: AnalysisRecord[];
  onSelectAnalysis: (id: string) => void;
  onViewAllHistory: () => void;
  onAnalyzeNew?: () => void;
}

export const RecentAnalysisSection: React.FC<RecentAnalysisSectionProps> = ({
  analyses,
  onSelectAnalysis,
  onViewAllHistory,
  onAnalyzeNew
}) => {
  const records = analyses.slice(0, 5);

  const formatAnalysisType = (type: string) => {
    if (!type) return 'Sequence Analysis';
    const clean = type.replace(/_/g, ' ');
    if (clean.toLowerCase().includes('amino')) return 'Amino Acid Composition';
    if (clean.toLowerCase().includes('physic') || clean.toLowerCase().includes('charge')) return 'Biophysical Properties';
    if (clean.toLowerCase().includes('struct')) return 'Structural Assessment';
    if (clean.toLowerCase().includes('variant') || clean.toLowerCase().includes('mutat')) return 'Variant Analysis';
    if (clean.toLowerCase().includes('gc') || clean.toLowerCase().includes('orf')) return 'GC & ORF Detection';
    return clean.replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Recent';
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return 'Recent';
      
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return 'Recent';
    }
  };

  const getStatusColor = (statusStr: string) => {
    const s = statusStr.toLowerCase();
    if (s.includes('fail') || s.includes('err')) {
      return { dot: 'bg-[#EF4444]', text: 'text-[#F87171]' };
    }
    if (s.includes('run') || s.includes('proc')) {
      return { dot: 'bg-[#0EA5E9]', text: 'text-[#38BDF8]' };
    }
    if (s.includes('warn') || s.includes('pend')) {
      return { dot: 'bg-[#F97316]', text: 'text-[#FB923C]' };
    }
    return { dot: 'bg-[#22C55E]', text: 'text-[#4ADE80]' };
  };

  return (
    <div className="bg-[#0B1B31] border border-[#1E3A5F] rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#1E3A5F]">
        <div>
          <h3 className="text-xs sm:text-sm font-bold font-mono text-[#38BDF8] uppercase tracking-wider flex items-center gap-2">
            <History className="w-4 h-4 text-[#38BDF8]" />
            RECENT ANALYSIS
          </h3>
          <p className="text-[11px] text-[#94A3B8]">
            Latest computational pipeline executions & database records
          </p>
        </div>

        <button
          onClick={onViewAllHistory}
          className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-[#38BDF8] hover:text-[#7DD3FC] transition-colors cursor-pointer group"
        >
          <span>View Analysis History</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
        </button>
      </div>

      {/* Table Content */}
      {records.length === 0 ? (
        <div className="py-8 text-center space-y-3">
          <p className="text-xs text-[#94A3B8] font-mono">
            No analysis records found in database yet.
          </p>
          {onAnalyzeNew && (
            <button
              onClick={onAnalyzeNew}
              className="px-3.5 py-1.5 rounded-lg bg-[#0284C7] text-white text-xs font-mono font-medium hover:bg-[#0EA5E9] transition-colors cursor-pointer"
            >
              Run First Analysis
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#1E3A5F]">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="bg-[#122A45] border-b border-[#1E3A5F] text-[#94A3B8] text-[11px] uppercase tracking-wider">
                <th className="py-2.5 px-4 font-semibold">Analysis</th>
                <th className="py-2.5 px-4 font-semibold">Sequence</th>
                <th className="py-2.5 px-4 font-semibold">Type</th>
                <th className="py-2.5 px-4 font-semibold">Status</th>
                <th className="py-2.5 px-4 font-semibold text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E3A5F] bg-[#0B1B31] text-[#F8FAFC]">
              {records.map((rec) => {
                const accession = rec.sequence_record?.accession || rec.input_source || 'Custom Sequence';
                const seqType = rec.sequence_type || rec.sequence_record?.sequence_type || 'Protein';
                const status = rec.status || 'Complete';
                const statusStyle = getStatusColor(status);

                return (
                  <tr 
                    key={rec.id}
                    onClick={() => onSelectAnalysis(rec.id)}
                    className="hover:bg-[#102A45] transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-semibold text-[#38BDF8] group-hover:underline">
                      {formatAnalysisType(rec.analysis_type)}
                    </td>
                    <td className="py-3 px-4 text-[#F8FAFC] font-bold">
                      {accession}
                    </td>
                    <td className="py-3 px-4 text-[#94A3B8]">
                      {seqType}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 text-[11px]">
                        <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                        <span className={`font-medium ${statusStyle.text}`}>
                          {status}
                        </span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-[#94A3B8] text-[11px]">
                      {formatDate(rec.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
