import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Zap,
  Dna,
  Layers,
  Activity,
  Download,
  Copy,
  Check,
  Filter,
  ArrowRight,
  Sparkles,
  Info,
  Scale,
  FileText
} from 'lucide-react';
import {
  EditedSequenceImpactReport,
  MutationImpactDetail,
  ImpactSeverity
} from '../../../lib/bio/editor/changeImpactEngine';
import { SequenceMutation } from '../../../lib/bio/editor/types';
import { formatNumber } from '../../../lib/utils/formatters';

interface ChangeImpactAnalysisViewProps {
  impactReport: EditedSequenceImpactReport;
  originalSequence: string;
  modifiedSequence: string;
  mutations: SequenceMutation[];
  onNavigateToEditorPos?: (pos: number) => void;
}

export const ChangeImpactAnalysisView: React.FC<ChangeImpactAnalysisViewProps> = ({
  impactReport,
  originalSequence,
  modifiedSequence,
  mutations,
  onNavigateToEditorPos
}) => {
  const [severityFilter, setSeverityFilter] = useState<ImpactSeverity | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [activeDetailId, setActiveDetailId] = useState<string | null>(null);

  // Filter mutations according to severity and search query
  const filteredDetails = useMemo(() => {
    const list = Array.isArray(impactReport?.impactDetails) ? impactReport.impactDetails : [];
    return list.filter((item) => {
      const matchesSeverity = severityFilter === 'ALL' || item.severity === severityFilter;
      const matchesSearch =
        searchQuery.trim() === '' ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.position.toString().includes(searchQuery) ||
        item.effectType.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSeverity && matchesSearch;
    });
  }, [impactReport?.impactDetails, severityFilter, searchQuery]);

  // Overall Severity Styling
  const getSeverityBadge = (severity: ImpactSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return {
          bg: 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]',
          dot: 'bg-[#EF4444]',
          label: 'Critical Risk',
          icon: ShieldAlert
        };
      case 'HIGH':
        return {
          bg: 'bg-[#FFF7ED] border-[#FED7AA] text-[#EA580C]',
          dot: 'bg-[#F97316]',
          label: 'High Impact',
          icon: AlertTriangle
        };
      case 'MODERATE':
        return {
          bg: 'bg-[#FEFCE8] border-[#FEF08A] text-[#CA8A04]',
          dot: 'bg-[#EAB308]',
          label: 'Moderate Impact',
          icon: Zap
        };
      case 'LOW':
        return {
          bg: 'bg-[#F0F9FF] border-[#BAE6FD] text-[#0284C7]',
          dot: 'bg-[#38BDF8]',
          label: 'Low Impact',
          icon: Info
        };
      case 'NEUTRAL':
      default:
        return {
          bg: 'bg-[#F0FDF4] border-[#BBF7D0] text-[#16A34A]',
          dot: 'bg-[#22C55E]',
          label: 'Silent / Neutral',
          icon: CheckCircle2
        };
    }
  };

  // Copy full markdown impact report to clipboard
  const handleCopyReport = () => {
    const reportText = generateMarkdownReport(impactReport, originalSequence, modifiedSequence);
    navigator.clipboard.writeText(reportText);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  // Download JSON report
  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(impactReport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sequence-change-impact-report-${Date.now().toString(36)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isProtein = impactReport.sequenceType === 'PROTEIN';
  const metrics = impactReport.biophysicalMetrics;
  const overallBadge = getSeverityBadge(impactReport.overallSeverity);
  const OverallIcon = overallBadge.icon;

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. EXECUTIVE IMPACT HEADER & SEVERITY HERO                                */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-2xl bg-white/90 border border-[#FECDD3] shadow-[0_4px_20px_rgba(239,68,68,0.06)] space-y-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-5 border-b border-[#FECDD3]">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="p-2 rounded-xl bg-[#FFF1F2] text-[#DC2626] border border-[#FECDD3]">
                <Sparkles className="w-4 h-4" />
              </span>
              <h2 className="text-lg font-bold text-[#0F172A] tracking-tight font-mono">
                Edited Sequence Change Impact Analysis
              </h2>
              <span
                className={`px-3 py-1 rounded-full text-xs font-mono font-bold border flex items-center gap-1.5 ${overallBadge.bg}`}
              >
                <span className={`w-2 h-2 rounded-full ${overallBadge.dot} animate-pulse`} />
                <OverallIcon className="w-3.5 h-3.5" />
                <span>{overallBadge.label}</span>
              </span>
            </div>
            <p className="text-xs text-[#64748B] font-mono">
              Evolutionary Compatibility:{' '}
              <span className="text-[#0F172A] font-semibold">{impactReport.evolutionaryCompatibility}</span>{' '}
              | Analyzed <span className="text-[#DC2626] font-semibold">{impactReport.totalMutations}</span> mutations
              across <span className="text-[#0284C7] font-semibold">{formatNumber(modifiedSequence?.length)}</span> {isProtein ? 'residues' : 'base pairs'}.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleCopyReport}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#FFF1F2] border border-[#FECDD3] text-[#9F1239] text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Copy formatted markdown impact summary"
            >
              {copiedReport ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                  <span className="text-[#16A34A]">Report Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#DC2626]" />
                  <span>Copy Report</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadJson}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#FFF1F2] border border-[#FECDD3] text-[#9F1239] text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Download raw impact report data as JSON"
            >
              <Download className="w-3.5 h-3.5 text-[#DC2626]" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>

        {/* ======================================================================= */}
        {/* 2. BIOPHYSICAL DELTA METRICS GRID (BEFORE VS AFTER)                     */}
        {/* ======================================================================= */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-[#DC2626]" />
              <span>Biophysical & Physicochemical Comparative Deltas</span>
            </h3>
            <span className="text-[11px] font-mono text-[#64748B]">
              Original (v1) → Modified (Target)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Length Card */}
            <div className="p-3.5 rounded-xl bg-[#F0F9FF] border border-[#BAE6FD] space-y-1 shadow-2xs">
              <div className="text-[11px] font-mono text-[#0369A1] font-semibold">Sequence Length</div>
              <div className="text-sm font-bold font-mono text-[#0F172A] flex items-baseline gap-1.5">
                <span>{formatNumber(metrics?.modifiedLength)}</span>
                <span className="text-[10px] text-[#64748B]">{isProtein ? 'aa' : 'bp'}</span>
              </div>
              <div className="text-[10px] font-mono">
                {metrics.lengthDelta === 0 ? (
                  <span className="text-[#64748B]">Δ 0 (Unchanged)</span>
                ) : metrics.lengthDelta > 0 ? (
                  <span className="text-[#16A34A] font-semibold">+{metrics.lengthDelta} {isProtein ? 'aa' : 'bp'}</span>
                ) : (
                  <span className="text-[#DC2626] font-semibold">{metrics.lengthDelta} {isProtein ? 'aa' : 'bp'}</span>
                )}
              </div>
            </div>

            {/* Protein: Molecular Weight / DNA: GC Content */}
            {isProtein ? (
              <div className="p-3.5 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] space-y-1 shadow-2xs">
                <div className="text-[11px] font-mono text-[#EA580C] font-semibold">Molecular Weight</div>
                <div className="text-sm font-bold font-mono text-[#0F172A] flex items-baseline gap-1.5">
                  <span>{((metrics.modifiedMwDa || 0) / 1000).toFixed(2)}</span>
                  <span className="text-[10px] text-[#64748B]">kDa</span>
                </div>
                <div className="text-[10px] font-mono">
                  {metrics.mwDeltaDa !== undefined && (
                    <span className={metrics.mwDeltaDa >= 0 ? 'text-[#EA580C]' : 'text-[#64748B]'}>
                      Δ {metrics.mwDeltaDa > 0 ? `+${metrics.mwDeltaDa.toFixed(1)}` : metrics.mwDeltaDa.toFixed(1)} Da
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] space-y-1 shadow-2xs">
                <div className="text-[11px] font-mono text-[#EA580C] font-semibold">GC Content</div>
                <div className="text-sm font-bold font-mono text-[#0F172A] flex items-baseline gap-1.5">
                  <span>{metrics.modifiedGcPercent?.toFixed(1) || '0.0'}%</span>
                </div>
                <div className="text-[10px] font-mono">
                  {metrics.gcPercentDelta !== undefined && (
                    <span
                      className={
                        Math.abs(metrics.gcPercentDelta) > 2
                          ? 'text-[#EA580C] font-semibold'
                          : 'text-[#64748B]'
                      }
                    >
                      Δ {metrics.gcPercentDelta > 0 ? `+${metrics.gcPercentDelta}` : metrics.gcPercentDelta}%
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Protein: Isoelectric Point / DNA: AT / AU Content */}
            {isProtein ? (
              <div className="p-3.5 rounded-xl bg-[#F5F3FF] border border-[#DDD6FE] space-y-1 shadow-2xs">
                <div className="text-[11px] font-mono text-[#7C3AED] font-semibold">Isoelectric Point (pI)</div>
                <div className="text-sm font-bold font-mono text-[#0F172A] flex items-baseline gap-1.5">
                  <span>{metrics.modifiedPi?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="text-[10px] font-mono">
                  {metrics.piDelta !== undefined && (
                    <span
                      className={
                        Math.abs(metrics.piDelta) >= 0.5
                          ? 'text-[#7C3AED] font-semibold'
                          : 'text-[#64748B]'
                      }
                    >
                      Δ {metrics.piDelta > 0 ? `+${metrics.piDelta}` : metrics.piDelta}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#F5F3FF] border border-[#DDD6FE] space-y-1 shadow-2xs">
                <div className="text-[11px] font-mono text-[#7C3AED] font-semibold">AT/AU Content</div>
                <div className="text-sm font-bold font-mono text-[#0F172A] flex items-baseline gap-1.5">
                  <span>{metrics.modifiedAtPercent?.toFixed(1) || '0.0'}%</span>
                </div>
                <div className="text-[10px] font-mono">
                  {metrics.atPercentDelta !== undefined && (
                    <span className="text-[#64748B]">
                      Δ {metrics.atPercentDelta > 0 ? `+${metrics.atPercentDelta}` : metrics.atPercentDelta}%
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Protein: Net Charge at pH 7.4 / DNA: ORFs Count */}
            {isProtein ? (
              <div className="p-3.5 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] space-y-1 shadow-2xs">
                <div className="text-[11px] font-mono text-[#15803D] font-semibold">Net Charge (pH 7.4)</div>
                <div className="text-sm font-bold font-mono text-[#0F172A] flex items-baseline gap-1.5">
                  <span>
                    {(metrics.modifiedNetCharge || 0) > 0 ? '+' : ''}
                    {metrics.modifiedNetCharge?.toFixed(1) || '0.0'}
                  </span>
                  <span className="text-[10px] text-[#64748B]">e</span>
                </div>
                <div className="text-[10px] font-mono">
                  {metrics.netChargeDelta !== undefined && (
                    <span
                      className={
                        Math.abs(metrics.netChargeDelta) >= 1.0
                          ? 'text-[#16A34A] font-semibold'
                          : 'text-[#64748B]'
                      }
                    >
                      Δ {metrics.netChargeDelta > 0 ? `+${metrics.netChargeDelta}` : metrics.netChargeDelta} e
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] space-y-1 shadow-2xs">
                <div className="text-[11px] font-mono text-[#15803D] font-semibold">Open Reading Frames</div>
                <div className="text-sm font-bold font-mono text-[#0F172A] flex items-baseline gap-1.5">
                  <span>{metrics.modifiedOrfCount ?? 0}</span>
                  <span className="text-[10px] text-[#64748B]">ORFs</span>
                </div>
                <div className="text-[10px] font-mono">
                  {metrics.orfCountDelta !== undefined && (
                    <span
                      className={
                        metrics.orfCountDelta !== 0
                          ? 'text-[#16A34A] font-semibold'
                          : 'text-[#64748B]'
                      }
                    >
                      Δ {metrics.orfCountDelta > 0 ? `+${metrics.orfCountDelta}` : metrics.orfCountDelta}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Protein: GRAVY Hydropathy / DNA: Mutation Density */}
            {isProtein ? (
              <div className="p-3.5 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] space-y-1 shadow-2xs">
                <div className="text-[11px] font-mono text-[#DC2626] font-semibold">GRAVY Hydropathy</div>
                <div className="text-sm font-bold font-mono text-[#0F172A] flex items-baseline gap-1.5">
                  <span>{metrics.modifiedGravy?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="text-[10px] font-mono">
                  {metrics.gravyDelta !== undefined && (
                    <span className="text-[#DC2626] font-semibold">
                      Δ {metrics.gravyDelta > 0 ? `+${metrics.gravyDelta}` : metrics.gravyDelta}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] space-y-1 shadow-2xs">
                <div className="text-[11px] font-mono text-[#DC2626] font-semibold">Mutation Density</div>
                <div className="text-sm font-bold font-mono text-[#0F172A] flex items-baseline gap-1.5">
                  <span>
                    {metrics.originalLength > 0
                      ? ((mutations.length / metrics.originalLength) * 100).toFixed(2)
                      : '0.00'}
                    %
                  </span>
                </div>
                <div className="text-[10px] font-mono text-[#DC2626] font-semibold">
                  {mutations.length} / {metrics.originalLength} bp
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ======================================================================= */}
        {/* 3. STRUCTURAL ALERTS & KEY BIOLOGICAL FINDINGS BANNER                   */}
        {/* ======================================================================= */}
        {((impactReport?.structuralAlerts || []).length > 0 || (impactReport?.keyFindings || []).length > 0) && (
          <div className="space-y-3 pt-2">
            {(impactReport?.structuralAlerts || []).length > 0 && (
              <div className="p-4 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#DC2626]">
                  <AlertTriangle className="w-4 h-4 text-[#EF4444] shrink-0" />
                  <span>High-Priority Biological & Structural Disruptions Detected ({(impactReport?.structuralAlerts || []).length})</span>
                </div>
                <ul className="space-y-1 pl-6 list-disc text-xs text-[#9F1239] font-mono">
                  {(impactReport?.structuralAlerts || []).map((alert, idx) => (
                    <li key={idx}>{alert}</li>
                  ))}
                </ul>
              </div>
            )}

            {(impactReport?.keyFindings || []).length > 0 && (
              <div className="p-3.5 rounded-xl bg-[#F0F9FF] border border-[#BAE6FD] text-xs text-[#0369A1] font-mono flex items-start gap-2.5">
                <Info className="w-4 h-4 text-[#0284C7] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-[#0F172A]">Key Biophysical Observations:</div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[#334155]">
                    {(impactReport?.keyFindings || []).map((finding, idx) => (
                      <li key={idx}>{finding}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. PER-MUTATION DETAILED IMPACT TABLE & CARDS                             */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-2xl bg-white/90 border border-[#FECDD3] shadow-[0_4px_20px_rgba(239,68,68,0.06)] space-y-5">
        {/* Header & Filter Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-[#0F172A] tracking-tight flex items-center gap-2 font-mono">
              <Layers className="w-4 h-4 text-[#DC2626]" />
              <span>Residue-Level Impact Breakdown</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-[#FFF1F2] text-[#DC2626] border border-[#FECDD3]">
                {filteredDetails.length} of {impactReport.impactDetails.length}
              </span>
            </h3>
            <p className="text-xs text-[#64748B] font-mono">
              Individual evaluation of all substitutions, insertions, and deletions.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {/* Search Input */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search pos, residue, effect..."
              className="px-3 py-1.5 rounded-xl bg-white border border-[#CBD5E1] text-xs text-[#0F172A] placeholder-[#94A3B8] font-mono focus:outline-none focus:border-[#EF4444] focus:ring-1 focus:ring-[#EF4444] w-full sm:w-48 shadow-2xs"
            />

            {/* Severity Filter */}
            <div className="flex items-center bg-[#F8FAFC] rounded-xl border border-[#CBD5E1] p-0.5">
              {(['ALL', 'CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'NEUTRAL'] as const).map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all cursor-pointer ${
                    severityFilter === sev
                      ? 'bg-[#DC2626] text-white shadow-xs'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Impact List */}
        {filteredDetails.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] font-mono text-xs">
            No mutation impact records match the current filter or search criteria.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDetails.map((detail) => {
              const badge = getSeverityBadge(detail.severity);
              const BadgeIcon = badge.icon;
              const isExpanded = activeDetailId === detail.mutationId;

              return (
                <div
                  key={detail.mutationId}
                  className={`rounded-xl border transition-all duration-200 ${
                    isExpanded
                      ? 'bg-[#FFF1F2] border-[#FDA4AF] shadow-sm'
                      : 'bg-white hover:bg-[#FFF1F2]/50 border-[#E2E8F0] hover:border-[#FECDD3]'
                  }`}
                >
                  <div
                    onClick={() => setActiveDetailId(isExpanded ? null : detail.mutationId)}
                    className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Position Pin */}
                        <span className="px-2 py-0.5 rounded-md bg-[#F0F9FF] border border-[#BAE6FD] text-[#0284C7] font-mono text-xs font-bold">
                          Pos {detail.position}
                        </span>

                        {/* Title */}
                        <span className="text-xs font-bold font-mono text-[#0F172A]">
                          {detail.title}
                        </span>

                        {/* Severity Pill */}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border flex items-center gap-1 ${badge.bg}`}
                        >
                          <BadgeIcon className="w-3 h-3" />
                          <span>{badge.label}</span>
                        </span>

                        {/* Effect Type Tag */}
                        <span className="px-2 py-0.5 rounded-md bg-[#F8FAFC] text-[#475569] font-mono text-[10px] border border-[#E2E8F0]">
                          {detail.effectType.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <p className="text-xs text-[#334155] font-mono leading-relaxed">
                        {detail.summary}
                      </p>
                    </div>

                    {/* Quick Metrics Badges on the right */}
                    <div className="flex items-center gap-2 shrink-0">
                      {detail.granthamScore !== undefined && (
                        <div
                          className="px-2 py-1 rounded-md bg-[#FFF7ED] border border-[#FED7AA] text-[10px] font-mono text-[#C2410C]"
                          title="Grantham Distance (0-215 scale measuring chemical difference)"
                        >
                          Grantham: <span className="font-bold text-[#EA580C]">{detail.granthamScore}</span>
                        </div>
                      )}

                      {detail.blosum62Score !== undefined && (
                        <div
                          className="px-2 py-1 rounded-md bg-[#F0FDF4] border border-[#BBF7D0] text-[10px] font-mono text-[#15803D]"
                          title="BLOSUM62 matrix alignment score (-4 to +11)"
                        >
                          BLOSUM62:{' '}
                          <span
                            className={`font-bold ${
                              detail.blosum62Score < 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'
                            }`}
                          >
                            {detail.blosum62Score > 0 ? `+${detail.blosum62Score}` : detail.blosum62Score}
                          </span>
                        </div>
                      )}

                      {onNavigateToEditorPos && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateToEditorPos(detail.position);
                          }}
                          className="p-1.5 rounded-lg bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#475569] hover:text-[#0F172A] transition-all cursor-pointer"
                          title="Jump to this position in sequence editor"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Structural Warning Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-[#FECDD3] space-y-3">
                      {detail.structuralWarning && (
                        <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs font-mono text-[#DC2626] flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold">Structural Impact Note:</div>
                            <div>{detail.structuralWarning}</div>
                          </div>
                        </div>
                      )}

                      {detail.codonDetail && (
                        <div className="p-3 rounded-lg bg-white border border-[#E2E8F0] text-xs font-mono text-[#334155] space-y-1">
                          <div className="font-bold text-[#0F172A]">Triplet Codon Translation:</div>
                          <div className="flex items-center gap-3 text-[11px]">
                            <span>
                              Original: <strong className="text-[#0284C7]">{detail.codonDetail.origCodon}</strong> (
                              {detail.codonDetail.origAa})
                            </span>
                            <span>→</span>
                            <span>
                              Mutated: <strong className="text-[#16A34A]">{detail.codonDetail.modCodon}</strong> (
                              {detail.codonDetail.modAa})
                            </span>
                            <span className="text-[#64748B]">(Codon {detail.codonDetail.codonPos})</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// HELPER: Generate Clean Markdown Report
// ============================================================================
function generateMarkdownReport(
  report: EditedSequenceImpactReport,
  origSeq: string,
  modSeq: string
): string {
  const isProtein = report.sequenceType === 'PROTEIN';
  const m = report.biophysicalMetrics;

  let text = `# BioCode Studio - Sequence Change Impact Report\n\n`;
  text += `- **Generated**: ${new Date().toISOString()}\n`;
  text += `- **Sequence Type**: ${report.sequenceType}\n`;
  text += `- **Overall Severity**: ${report.overallSeverity}\n`;
  text += `- **Evolutionary Compatibility**: ${report.evolutionaryCompatibility}\n`;
  text += `- **Total Mutations Analyzed**: ${report.totalMutations}\n\n`;

  text += `## Biophysical Summary\n`;
  text += `- **Length**: Original ${m.originalLength} → Modified ${m.modifiedLength} (Δ ${m.lengthDelta})\n`;
  if (isProtein) {
    text += `- **Molecular Weight**: ${((m.modifiedMwDa || 0) / 1000).toFixed(2)} kDa (Δ ${m.mwDeltaDa || 0} Da)\n`;
    text += `- **Isoelectric Point (pI)**: ${m.modifiedPi?.toFixed(2)} (Δ ${m.piDelta || 0})\n`;
    text += `- **Net Charge (pH 7.4)**: ${m.modifiedNetCharge?.toFixed(1)} e (Δ ${m.netChargeDelta || 0} e)\n`;
    text += `- **GRAVY Hydropathy**: ${m.modifiedGravy?.toFixed(2)} (Δ ${m.gravyDelta || 0})\n`;
  } else {
    text += `- **GC Content**: ${m.modifiedGcPercent?.toFixed(1)}% (Δ ${m.gcPercentDelta || 0}%)\n`;
    text += `- **Open Reading Frames (ORFs)**: ${m.modifiedOrfCount} (Δ ${m.orfCountDelta || 0})\n`;
  }

  if (report.structuralAlerts.length > 0) {
    text += `\n## Structural & Functional Disruptions\n`;
    report.structuralAlerts.forEach((alert) => {
      text += `- ⚠️ ${alert}\n`;
    });
  }

  text += `\n## Mutation-Level Impact Details\n`;
  report.impactDetails.forEach((d) => {
    text += `### Pos ${d.position}: ${d.title} [${d.severity}]\n`;
    text += `${d.summary}\n`;
    if (d.granthamScore !== undefined) text += `- Grantham Distance: ${d.granthamScore}\n`;
    if (d.blosum62Score !== undefined) text += `- BLOSUM62 Score: ${d.blosum62Score}\n`;
    if (d.structuralWarning) text += `- Structural Warning: ${d.structuralWarning}\n`;
    text += `\n`;
  });

  return text;
}
