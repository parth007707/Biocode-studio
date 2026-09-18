import React, { useState, useMemo } from 'react';
import {
  GitCompare,
  Activity,
  Layers,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
  Download,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Eye,
  RotateCcw,
  Sliders,
  Filter,
  Search,
  ExternalLink,
  Zap,
  ArrowRight,
  FileText
} from 'lucide-react';
import {
  ComparativeAnalysisReport,
  MetricComparisonItem,
  MutationStructuralMapping
} from '../../../lib/bio/editor/comparativeAnalysisEngine';
import { SequenceMutation } from '../../../lib/bio/editor/types';
import { formatNumber } from '../../../lib/utils/formatters';
import { SequenceStructureViewer } from '../viewers/SequenceStructureViewer';

interface AnalysisImpactComparisonViewProps {
  report: ComparativeAnalysisReport;
  originalSequence: string;
  modifiedSequence: string;
  mutations: SequenceMutation[];
  onRestoreVersion?: (versionNum: number) => void;
  onJumpToCoordinate?: (pos: number) => void;
}

export const AnalysisImpactComparisonView: React.FC<AnalysisImpactComparisonViewProps> = ({
  report,
  originalSequence,
  modifiedSequence,
  mutations,
  onRestoreVersion,
  onJumpToCoordinate
}) => {
  // Structural View Mode: 'original' | 'modified' | 'compare'
  const [structuralMode, setStructuralMode] = useState<'original' | 'modified' | 'compare'>('compare');

  // Metrics Table Filter & Search
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [metricSearch, setMetricSearch] = useState<string>('');
  const [copiedTable, setCopiedTable] = useState<boolean>(false);

  // Selected mutation for locus highlighting
  const [selectedMutationId, setSelectedMutationId] = useState<string | null>(
    (Array.isArray(report?.structuralMappings) ? report.structuralMappings : [])[0]?.mutationId || null
  );

  // Filtered metrics list
  const filteredMetrics = useMemo(() => {
    const list = Array.isArray(report?.metrics) ? report.metrics : [];
    return list.filter((m) => {
      const matchCat = selectedCategory === 'all' || m.category === selectedCategory;
      const matchSearch =
        metricSearch.trim() === '' ||
        m.name.toLowerCase().includes(metricSearch.toLowerCase()) ||
        String(m.originalValue).toLowerCase().includes(metricSearch.toLowerCase()) ||
        String(m.modifiedValue).toLowerCase().includes(metricSearch.toLowerCase()) ||
        m.differenceText.toLowerCase().includes(metricSearch.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [report?.metrics, selectedCategory, metricSearch]);

  const handleCopyMetrics = () => {
    const list = Array.isArray(report?.metrics) ? report.metrics : [];
    const header = ['Metric', 'Original (V1)', 'Modified (V2)', 'Difference', 'Category'];
    const rows = list.map((m) => [
      m.name,
      String(m.originalValue),
      String(m.modifiedValue),
      m.differenceText,
      m.category
    ]);
    const tsv = [header.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(tsv);
    setCopiedTable(true);
    setTimeout(() => setCopiedTable(false), 2000);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `biocode_comparative_analysis_v1_vs_v2_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getSignificanceBadge = (item: MetricComparisonItem) => {
    if (item.significance === 'critical') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-red-500/15 border border-red-500/30 text-red-300 font-bold flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Shift
        </span>
      );
    }
    if (item.significance === 'increased') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-medium">
          Delta
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-400">
        Neutral
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. VERSIONED COMPARISON SUMMARY BANNER                                     */}
      {/* ========================================================================= */}
      <div className="bg-[#0B0F17] border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Original (V1) vs Modified (V2) Analysis Impact
                </h3>
                <span className="px-2.5 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[11px] font-mono font-bold">
                  {report.sequenceType}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-bold">
                  {report.structuralMappings.length} Mutation{report.structuralMappings.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Pipeline: <span className="text-slate-200">{report.pipeline}</span> • Verified biological metrics comparison
              </p>
            </div>
          </div>

          {/* Quick Version Restoration Controls */}
          <div className="flex items-center gap-2">
            {onRestoreVersion && (
              <>
                <button
                  type="button"
                  onClick={() => onRestoreVersion(1)}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Switch and restore original immutable sequence (Version 1)"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span>Restore V1 (Original)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRestoreVersion(report.versionMetadata.version2.versionNumber)}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Switch to modified working draft (Version 2)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Select V2 (Modified)</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleExportJSON}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs transition-colors cursor-pointer"
              title="Download Full Comparative Analysis JSON"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Two-Column Version Details Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          {/* Version 1 (Original) */}
          <div className="bg-[#161B22] p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold text-[11px]">
                VERSION 1: ORIGINAL
              </span>
              <span className="text-slate-500 text-[11px]">Immutable Master</span>
            </div>
            <div className="space-y-1 text-slate-300 text-[11px]">
              <div>Length: <strong className="text-white">{formatNumber(report?.originalLength)} {report?.unitLabel || 'residues'}</strong></div>
              <div>Status: <span className="text-emerald-400">Baseline Verified</span></div>
              <div className="text-slate-400 truncate">Summary: {report?.originalAnalysis?.summary || 'Standard Baseline'}</div>
            </div>
          </div>

          {/* Version 2 (Modified) */}
          <div className="bg-[#161B22] p-4 rounded-xl border border-emerald-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[11px] border border-emerald-500/30">
                VERSION 2: MODIFIED
              </span>
              <span className="text-emerald-400 text-[11px] font-bold">
                {(report?.lengthDelta ?? 0) > 0 ? `+${report?.lengthDelta}` : (report?.lengthDelta ?? 0)} {report?.unitLabel || 'residues'}
              </span>
            </div>
            <div className="space-y-1 text-slate-300 text-[11px]">
              <div>Length: <strong className="text-cyan-300">{formatNumber(report?.modifiedLength)} {report?.unitLabel || 'residues'}</strong></div>
              <div>Mutations: <span className="text-emerald-400">{report?.structuralMappings?.length || 0} changes applied</span></div>
              <div className="text-slate-400 truncate">Summary: {report?.modifiedAnalysis?.summary || 'Modified Sequence Results'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. REAL CALCULATED COMPARATIVE METRICS TABLE                               */}
      {/* ========================================================================= */}
      <div className="bg-[#0B0F17] border border-slate-800 rounded-2xl p-5 md:p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-slate-800/80">
          <div className="space-y-0.5">
            <h4 className="text-sm font-bold text-white flex items-center gap-2 font-mono">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Calculated Biological Metrics &amp; Shifts</span>
            </h4>
            <p className="text-slate-400 text-xs">
              Direct mathematical differences derived from the execution pipeline. Never interpolated or mocked.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 bg-[#161B22] p-1 rounded-xl border border-slate-800 text-[11px] font-mono">
              {['all', 'primary', 'composition', 'structure', 'physicochemical'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg capitalize transition-colors cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Copy Table Button */}
            <button
              type="button"
              onClick={handleCopyMetrics}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {copiedTable ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedTable ? 'Copied TSV' : 'Copy Table'}</span>
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={metricSearch}
            onChange={(e) => setMetricSearch(e.target.value)}
            placeholder="Filter metrics by name (e.g. GC Content, Length, ORF, Molecular Weight)..."
            className="w-full pl-10 pr-4 py-2 bg-[#161B22] border border-slate-800 rounded-xl text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Metrics Comparison Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#161B22] border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Metric</th>
                <th className="py-3 px-4 text-slate-300">Original (Version 1)</th>
                <th className="py-3 px-4 text-emerald-300">Modified (Version 2)</th>
                <th className="py-3 px-4 text-cyan-300">Calculated Difference</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-[#0B0F17]">
              {filteredMetrics.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    No comparative metrics match your filter query.
                  </td>
                </tr>
              ) : (
                filteredMetrics.map((item) => (
                  <tr key={item.id} className="hover:bg-[#161B22]/70 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-200">
                      <div className="flex flex-col">
                        <span>{item.name}</span>
                        {item.description && (
                          <span className="text-[10px] text-slate-500 font-normal font-sans">
                            {item.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-medium">
                      {String(item.originalValue)}
                    </td>
                    <td className="py-3 px-4 text-cyan-200 font-bold">
                      {String(item.modifiedValue)}
                    </td>
                    <td className="py-3 px-4 font-bold">
                      <span
                        className={`${
                          item.differenceText.startsWith('+')
                            ? 'text-emerald-400'
                            : item.differenceText.startsWith('-')
                            ? 'text-amber-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {item.differenceText}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {getSignificanceBadge(item)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. STRUCTURAL RESOLUTION & ORIGINAL VS MODIFIED STRUCTURAL COMPARISON     */}
      {/* ========================================================================= */}
      <div className="bg-[#0B0F17] border border-slate-800 rounded-2xl p-5 md:p-6 space-y-5 shadow-xl">
        {/* Section Header & Mode Toggle */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-800">
          <div className="space-y-0.5">
            <h4 className="text-sm font-bold text-white flex items-center gap-2 font-mono">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Original vs Modified Structural View</span>
            </h4>
            <p className="text-slate-400 text-xs">
              Adaptive spatial modeling, secondary geometry, and localized mutation mapping.
            </p>
          </div>

          {/* Three View Modes: Original, Modified, Compare */}
          <div className="flex items-center gap-1 bg-[#161B22] p-1 rounded-xl border border-slate-800 text-xs font-mono">
            <button
              type="button"
              onClick={() => setStructuralMode('original')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                structuralMode === 'original'
                  ? 'bg-slate-700 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Original
            </button>
            <button
              type="button"
              onClick={() => setStructuralMode('modified')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                structuralMode === 'modified'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Modified
            </button>
            <button
              type="button"
              onClick={() => setStructuralMode('compare')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                structuralMode === 'compare'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Compare
            </button>
          </div>
        </div>

        {/* Structure Resolution Status Banner (Requirement 4) */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-bold text-[11px]">
                {report.structureResolution.title}
              </span>
              {report.structureResolution.approximationLabel && (
                <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px]">
                  {report.structureResolution.approximationLabel}
                </span>
              )}
            </div>
            <span className="text-slate-500 text-[11px]">
              LOD Viewport: {report.structureResolution.viewportWindowSize} {report.unitLabel} Window
            </span>
          </div>

          <p className="text-slate-300 text-[11px] leading-relaxed">
            {report.structureResolution.description}
          </p>

          {report.structureResolution.warningNote && (
            <div className="flex items-center gap-1.5 text-amber-400/90 text-[11px] pt-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{report.structureResolution.warningNote}</span>
            </div>
          )}
        </div>

        {/* Mutation-to-Structure / Locus Mapping Table (Requirement 5) */}
        {report.structuralMappings.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Mutation to Structural &amp; Genomic Locus Mapping
              </span>
              <span className="text-[11px] text-slate-500">
                Click any locus to navigate to exact sequence position
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 font-mono text-xs">
              {(Array.isArray(report?.structuralMappings) ? report.structuralMappings : []).map((mapping) => (
                <div
                  key={mapping.mutationId}
                  onClick={() => {
                    setSelectedMutationId(mapping.mutationId);
                    if (onJumpToCoordinate && mapping.position) {
                      onJumpToCoordinate(mapping.position);
                    }
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedMutationId === mapping.mutationId
                      ? 'bg-emerald-500/10 border-emerald-500/50 shadow-md shadow-emerald-950'
                      : 'bg-[#161B22] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white text-xs flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      {mapping.label}
                    </span>
                    <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                      Pos {formatNumber(mapping?.position)}
                    </span>
                  </div>

                  {mapping.isMapped ? (
                    <div className="space-y-0.5 text-[11px] text-slate-300">
                      <div className="text-cyan-300 font-medium truncate">
                        {mapping.mappedFeatureName} ({mapping.mappedFeatureRange})
                      </div>
                      <div className="text-slate-400 text-[10px] truncate">
                        {mapping.structuralContext}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-amber-400 italic">
                      {mapping.unmappedReason || 'Structural mapping unavailable for this sequence position.'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3D / Structure Viewports */}
        <div className="pt-2">
          {structuralMode === 'original' && (
            <div className="space-y-2">
              <div className="text-xs font-mono text-slate-400 flex items-center justify-between">
                <span>Original Sequence Structural View (Version 1)</span>
                <span className="text-[11px] text-slate-500">{formatNumber(originalSequence?.length)} {report?.unitLabel || 'residues'}</span>
              </div>
              <SequenceStructureViewer
                sequence={originalSequence || ''}
                sequenceType={report?.sequenceType || 'PROTEIN'}
                dnaAnalysis={report?.originalAnalysis?.dnaAnalysis}
                rnaAnalysis={report?.originalAnalysis?.rnaAnalysis}
                proteinAnalysis={report?.originalAnalysis?.proteinAnalysis}
                totalRecordLength={originalSequence?.length || 0}
                className="w-full"
              />
            </div>
          )}

          {structuralMode === 'modified' && (
            <div className="space-y-2">
              <div className="text-xs font-mono text-emerald-300 flex items-center justify-between font-semibold">
                <span>Modified Sequence Structural View (Version 2)</span>
                <span className="text-[11px] text-cyan-400">{formatNumber(modifiedSequence?.length)} {report?.unitLabel || 'residues'}</span>
              </div>
              <SequenceStructureViewer
                sequence={modifiedSequence || ''}
                sequenceType={report?.sequenceType || 'PROTEIN'}
                dnaAnalysis={report?.modifiedAnalysis?.dnaAnalysis}
                rnaAnalysis={report?.modifiedAnalysis?.rnaAnalysis}
                proteinAnalysis={report?.modifiedAnalysis?.proteinAnalysis}
                totalRecordLength={modifiedSequence?.length || 0}
                className="w-full"
              />
            </div>
          )}

          {structuralMode === 'compare' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Original Column */}
              <div className="space-y-2">
                <div className="text-xs font-mono text-slate-300 font-bold flex items-center justify-between bg-[#161B22] p-2.5 rounded-xl border border-slate-800">
                  <span>Version 1: Original Model</span>
                  <span className="text-[11px] text-slate-400">{formatNumber(originalSequence?.length)} {report?.unitLabel || 'residues'}</span>
                </div>
                <SequenceStructureViewer
                  sequence={originalSequence || ''}
                  sequenceType={report?.sequenceType || 'PROTEIN'}
                  dnaAnalysis={report?.originalAnalysis?.dnaAnalysis}
                  rnaAnalysis={report?.originalAnalysis?.rnaAnalysis}
                  proteinAnalysis={report?.originalAnalysis?.proteinAnalysis}
                  totalRecordLength={originalSequence?.length || 0}
                  className="w-full"
                />
              </div>

              {/* Modified Column */}
              <div className="space-y-2">
                <div className="text-xs font-mono text-emerald-300 font-bold flex items-center justify-between bg-[#161B22] p-2.5 rounded-xl border border-emerald-500/30">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    Version 2: Modified Model
                  </span>
                  <span className="text-[11px] text-cyan-300 font-bold">{formatNumber(modifiedSequence?.length)} {report?.unitLabel || 'residues'}</span>
                </div>
                <SequenceStructureViewer
                  sequence={modifiedSequence || ''}
                  sequenceType={report?.sequenceType || 'PROTEIN'}
                  dnaAnalysis={report?.modifiedAnalysis?.dnaAnalysis}
                  rnaAnalysis={report?.modifiedAnalysis?.rnaAnalysis}
                  proteinAnalysis={report?.modifiedAnalysis?.proteinAnalysis}
                  totalRecordLength={modifiedSequence?.length || 0}
                  mutations={mutations as any}
                  originalSequence={originalSequence}
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
