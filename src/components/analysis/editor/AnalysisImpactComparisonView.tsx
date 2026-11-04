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
  onApplyChanges?: () => void;
  onDiscardChanges?: () => void;
  isModified?: boolean;
}

export const AnalysisImpactComparisonView: React.FC<AnalysisImpactComparisonViewProps> = ({
  report,
  originalSequence,
  modifiedSequence,
  mutations,
  onRestoreVersion,
  onJumpToCoordinate,
  onApplyChanges,
  onDiscardChanges,
  isModified
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
        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-50 border border-rose-200 text-rose-700 font-bold flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Shift
        </span>
      );
    }
    if (item.significance === 'increased') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-sky-50 border border-sky-200 text-sky-700 font-medium">
          Delta
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 border border-slate-200 text-slate-600">
        Neutral
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. VERSIONED COMPARISON SUMMARY BANNER                                     */}
      {/* ========================================================================= */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-[#E2E8F0] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shrink-0">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-[#0F172A] tracking-tight">
                  Original (V1) vs Modified (V2) Analysis Impact
                </h3>
                <span className="px-2.5 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-[11px] font-mono font-bold">
                  {report.sequenceType}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-mono font-bold">
                  {report.structuralMappings.length} Mutation{report.structuralMappings.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-xs text-[#64748B] font-mono mt-0.5">
                Pipeline: <span className="text-[#0F172A] font-medium">{report.pipeline}</span> • Verified biological metrics comparison
              </p>
            </div>
          </div>

          {/* Quick Version Restoration Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {isModified && onDiscardChanges && (
              <button
                type="button"
                onClick={onDiscardChanges}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-[#CBD5E1] text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Discard working changes and restore original V1 sequence"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Discard Changes</span>
              </button>
            )}
            {isModified && onApplyChanges && (
              <button
                type="button"
                onClick={onApplyChanges}
                className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Apply changes and create next committed version"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply Changes (Create V{report.versionMetadata.version2.versionNumber})</span>
              </button>
            )}
            {!isModified && onRestoreVersion && (
              <>
                <button
                  type="button"
                  onClick={() => onRestoreVersion(1)}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-[#0F172A] border border-[#CBD5E1] text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Switch and restore original immutable sequence (Version 1)"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Restore V1 (Original)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRestoreVersion(report.versionMetadata.version2.versionNumber)}
                  className="px-3.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-300 text-xs font-mono font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Switch to modified working draft (Version 2)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                  <span>Select V2 (Modified)</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleExportJSON}
              className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-[#CBD5E1] text-xs transition-colors cursor-pointer shadow-2xs"
              title="Download Full Comparative Analysis JSON"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Two-Column Version Details Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          {/* Version 1 (Original) */}
          <div className="bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0] space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-slate-200/80 text-slate-800 font-bold text-[11px]">
                VERSION 1: ORIGINAL
              </span>
              <span className="text-slate-500 text-[11px]">Immutable Master</span>
            </div>
            <div className="space-y-1 text-slate-700 text-[11px]">
              <div>Length: <strong className="text-[#0F172A]">{formatNumber(report?.originalLength)} {report?.unitLabel || 'residues'}</strong></div>
              <div>Status: <span className="text-emerald-600 font-semibold">Baseline Verified</span></div>
              <div className="text-slate-500 truncate">Summary: {report?.originalAnalysis?.summary || 'Standard Baseline'}</div>
            </div>
          </div>

          {/* Version 2 (Modified) */}
          <div className="bg-[#F0F9FF] p-4 rounded-xl border border-sky-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-bold text-[11px] border border-sky-200">
                VERSION 2: MODIFIED
              </span>
              <span className="text-sky-700 text-[11px] font-bold">
                {(report?.lengthDelta ?? 0) > 0 ? `+${report?.lengthDelta}` : (report?.lengthDelta ?? 0)} {report?.unitLabel || 'residues'}
              </span>
            </div>
            <div className="space-y-1 text-slate-700 text-[11px]">
              <div>Length: <strong className="text-sky-900">{formatNumber(report?.modifiedLength)} {report?.unitLabel || 'residues'}</strong></div>
              <div>Mutations: <span className="text-sky-700 font-semibold">{report?.structuralMappings?.length || 0} changes applied</span></div>
              <div className="text-slate-500 truncate">Summary: {report?.modifiedAnalysis?.summary || 'Modified Sequence Results'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. REAL CALCULATED COMPARATIVE METRICS TABLE                               */}
      {/* ========================================================================= */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 md:p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-[#E2E8F0]">
          <div className="space-y-0.5">
            <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-2 font-mono">
              <Activity className="w-4 h-4 text-sky-600" />
              <span>Calculated Biological Metrics &amp; Shifts</span>
            </h4>
            <p className="text-slate-500 text-xs">
              Direct mathematical differences derived from the execution pipeline. Never interpolated or mocked.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 bg-[#F8FAFC] p-1 rounded-xl border border-[#E2E8F0] text-[11px] font-mono">
              {['all', 'primary', 'composition', 'structure', 'physicochemical'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg capitalize transition-colors cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-sky-600 text-white font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
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
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-[#CBD5E1] text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            >
              {copiedTable ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedTable ? 'Copied TSV' : 'Copy Table'}</span>
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={metricSearch}
            onChange={(e) => setMetricSearch(e.target.value)}
            placeholder="Filter metrics by name (e.g. GC Content, Length, ORF, Molecular Weight)..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-[#CBD5E1] rounded-xl text-xs font-mono text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* Metrics Comparison Table */}
        <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-slate-600 text-[11px] uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Metric</th>
                <th className="py-3 px-4 text-slate-700">Original (Version 1)</th>
                <th className="py-3 px-4 text-sky-800">Modified (Version 2)</th>
                <th className="py-3 px-4 text-sky-700">Calculated Difference</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] bg-white">
              {filteredMetrics.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    No comparative metrics match your filter query.
                  </td>
                </tr>
              ) : (
                filteredMetrics.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-[#0F172A]">
                      <div className="flex flex-col">
                        <span>{item.name}</span>
                        {item.description && (
                          <span className="text-[10px] text-slate-500 font-normal font-sans">
                            {item.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {String(item.originalValue)}
                    </td>
                    <td className="py-3 px-4 text-sky-700 font-bold">
                      {String(item.modifiedValue)}
                    </td>
                    <td className="py-3 px-4 font-bold">
                      <span
                        className={`${
                          item.differenceText.startsWith('+')
                            ? 'text-emerald-600'
                            : item.differenceText.startsWith('-')
                            ? 'text-amber-600'
                            : 'text-slate-500'
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
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 md:p-6 space-y-5 shadow-xs">
        {/* Section Header & Mode Toggle */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[#E2E8F0]">
          <div className="space-y-0.5">
            <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-2 font-mono">
              <Layers className="w-4 h-4 text-sky-600" />
              <span>Original vs Modified Structural View</span>
            </h4>
            <p className="text-slate-500 text-xs">
              Adaptive spatial modeling, secondary geometry, and localized mutation mapping.
            </p>
          </div>

          {/* Three View Modes: Original, Modified, Compare */}
          <div className="flex items-center gap-1 bg-[#F8FAFC] p-1 rounded-xl border border-[#E2E8F0] text-xs font-mono">
            <button
              type="button"
              onClick={() => setStructuralMode('original')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                structuralMode === 'original'
                  ? 'bg-sky-600 text-white font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Original
            </button>
            <button
              type="button"
              onClick={() => setStructuralMode('modified')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                structuralMode === 'modified'
                  ? 'bg-sky-600 text-white font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Modified
            </button>
            <button
              type="button"
              onClick={() => setStructuralMode('compare')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                structuralMode === 'compare'
                  ? 'bg-sky-600 text-white font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Compare
            </button>
          </div>
        </div>

        {/* Structure Resolution Status Banner (Requirement 4) */}
        <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-sky-100 border border-sky-200 text-sky-800 font-bold text-[11px]">
                {report.structureResolution.title}
              </span>
              {report.structureResolution.approximationLabel && (
                <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-200 text-amber-800 text-[10px]">
                  {report.structureResolution.approximationLabel}
                </span>
              )}
            </div>
            <span className="text-slate-500 text-[11px]">
              LOD Viewport: {report.structureResolution.viewportWindowSize} {report.unitLabel} Window
            </span>
          </div>

          <p className="text-slate-700 text-[11px] leading-relaxed">
            {report.structureResolution.description}
          </p>

          {report.structureResolution.warningNote && (
            <div className="flex items-center gap-1.5 text-amber-700 text-[11px] pt-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
              <span>{report.structureResolution.warningNote}</span>
            </div>
          )}
        </div>

        {/* Mutation-to-Structure / Locus Mapping Table (Requirement 5) */}
        {report.structuralMappings.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-500">
              <span className="flex items-center gap-1.5 text-slate-800 font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                Mutation to Structural &amp; Genomic Locus Mapping
              </span>
              <span className="text-[11px] text-slate-400">
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
                      ? 'bg-sky-50/80 border-sky-300 shadow-sm'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-sky-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[#0F172A] text-xs flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-sky-500" />
                      {mapping.label}
                    </span>
                    <span className="text-[10px] text-slate-600 bg-white border border-[#CBD5E1] px-2 py-0.5 rounded">
                      Pos {formatNumber(mapping?.position)}
                    </span>
                  </div>

                  {mapping.isMapped ? (
                    <div className="space-y-0.5 text-[11px] text-slate-700">
                      <div className="text-sky-700 font-medium truncate">
                        {mapping.mappedFeatureName} ({mapping.mappedFeatureRange})
                      </div>
                      <div className="text-slate-500 text-[10px] truncate">
                        {mapping.structuralContext}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-amber-700 italic">
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
              <div className="text-xs font-mono text-slate-600 flex items-center justify-between font-medium">
                <span>Original Sequence Structural View (Version 1)</span>
                <span className="text-[11px] text-slate-500">{formatNumber(originalSequence?.length)} {report?.unitLabel || 'residues'}</span>
              </div>
              <SequenceStructureViewer
                sequence={originalSequence || ''}
                originalSequence={originalSequence || ''}
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
              <div className="text-xs font-mono text-sky-700 flex items-center justify-between font-semibold">
                <span>Modified Sequence Structural View (Version 2)</span>
                <span className="text-[11px] text-sky-600">{formatNumber(modifiedSequence?.length)} {report?.unitLabel || 'residues'}</span>
              </div>
              <SequenceStructureViewer
                sequence={modifiedSequence || ''}
                originalSequence={originalSequence || ''}
                mutations={mutations as any}
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
                <div className="text-xs font-mono text-slate-700 font-bold flex items-center justify-between bg-[#F8FAFC] p-2.5 rounded-xl border border-[#E2E8F0]">
                  <span>Version 1: Original Model</span>
                  <span className="text-[11px] text-slate-500">{formatNumber(originalSequence?.length)} {report?.unitLabel || 'residues'}</span>
                </div>
                <SequenceStructureViewer
                  sequence={originalSequence || ''}
                  originalSequence={originalSequence || ''}
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
                <div className="text-xs font-mono text-sky-800 font-bold flex items-center justify-between bg-[#F0F9FF] p-2.5 rounded-xl border border-sky-200">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                    Version 2: Modified Model
                  </span>
                  <span className="text-[11px] text-sky-700 font-bold">{formatNumber(modifiedSequence?.length)} {report?.unitLabel || 'residues'}</span>
                </div>
                <SequenceStructureViewer
                  sequence={modifiedSequence || ''}
                  originalSequence={originalSequence || ''}
                  sequenceType={report?.sequenceType || 'PROTEIN'}
                  dnaAnalysis={report?.modifiedAnalysis?.dnaAnalysis}
                  rnaAnalysis={report?.modifiedAnalysis?.rnaAnalysis}
                  proteinAnalysis={report?.modifiedAnalysis?.proteinAnalysis}
                  totalRecordLength={modifiedSequence?.length || 0}
                  mutations={mutations as any}
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
