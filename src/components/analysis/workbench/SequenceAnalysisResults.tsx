import React, { useState, useMemo } from 'react';
import {
  Dna,
  Activity,
  Zap,
  Sparkles,
  RotateCcw,
  Check,
  Loader2,
  Layers,
  ChevronUp,
  ChevronDown,
  Copy,
  Info,
  FlaskConical,
  Download,
  FileText
} from 'lucide-react';
import { SequenceStructureViewer } from '../viewers/SequenceStructureViewer';
import { formatNumber } from '../../../lib/utils/formatters';
import { NormalizedWorkbenchState, SequenceMutation } from '../../../lib/bio';
import {
  generateDNAInterpretation,
  generateRNAInterpretation,
  generateProteinInterpretation,
  ScientificInterpretation
} from '../../../lib/bio/scientificInterpretation';
import { predictRNASecondaryStructure } from '../../../lib/bio/rnaAnalysis';

interface SequenceAnalysisResultsProps {
  accession: string;
  definition?: string;
  sequenceType: string;
  organism: string;
  length: number;
  unit: string;
  sequence: string;
  originalSequence: string;
  simulatedSequence?: string;
  simulationResult?: any;
  versionNumber: number;
  isModified: boolean;
  mutations: SequenceMutation[];
  activeAnalysisResult: NormalizedWorkbenchState | null;
  originalAnalysisResult: NormalizedWorkbenchState | null;
  biologicalRole: string;
  isSaving: boolean;
  copiedSeq: boolean;
  onCopySequence: (seq: string) => void;
  onDiscardChanges: () => void;
  onApplyChanges: () => void;
  onExportPDF: () => void;
  onExportJSON: () => void;
}

export const SequenceAnalysisResults: React.FC<SequenceAnalysisResultsProps> = ({
  accession,
  definition,
  sequenceType,
  organism,
  length,
  unit,
  sequence,
  originalSequence,
  simulatedSequence,
  simulationResult,
  versionNumber,
  isModified,
  mutations,
  activeAnalysisResult,
  originalAnalysisResult,
  biologicalRole,
  isSaving,
  copiedSeq,
  onCopySequence,
  onDiscardChanges,
  onApplyChanges,
  onExportPDF,
  onExportJSON
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDetailedSummary, setShowDetailedSummary] = useState(false);

  // Derive Scientific Interpretation matching biophysical characteristics
  const interpretation: ScientificInterpretation | null = useMemo(() => {
    const normType = (activeAnalysisResult?.type || (sequenceType === 'UNKNOWN' ? 'PROTEIN' : sequenceType)).toUpperCase();
    if (normType === 'RNA') {
      const rna = activeAnalysisResult?.rnaAnalysis || predictRNASecondaryStructure(sequence);
      return generateRNAInterpretation(
        rna,
        { source: 'NCBI', accession, organism, sequence_type: 'RNA', molecule_type: 'mRNA' },
        sequence,
        activeAnalysisResult?.dnaAnalysis
      );
    } else if (normType === 'DNA') {
      if (activeAnalysisResult?.dnaAnalysis) {
        return generateDNAInterpretation(
          sequence,
          activeAnalysisResult.dnaAnalysis,
          { source: 'NCBI', accession, organism, sequence_type: 'DNA' }
        );
      }
    } else if (normType === 'PROTEIN') {
      if (activeAnalysisResult?.proteinAnalysis) {
        return generateProteinInterpretation(
          activeAnalysisResult.proteinAnalysis,
          { source: 'NCBI', accession, organism, sequence_type: 'PROTEIN' }
        );
      }
    }
    return null;
  }, [activeAnalysisResult, sequence, sequenceType, accession, organism]);

  // Determine standard 3D Structure status badge
  const isPdbExperimental = Boolean(
    (accession && accession.length === 4 && /^[0-9][a-zA-Z0-9]{3}$/i.test(accession)) ||
    accession === 'NP_000537' || accession === 'NP_000509' || accession === 'NP_000198' || 
    accession === 'NP_000546' || accession === 'YP_009724390' || accession === 'P04637' ||
    accession === 'P68871' || accession === 'P01308' || accession === 'P38398'
  );
  const structureStatusBadge = simulationResult
    ? 'Simulated Structure'
    : isModified
    ? 'Modified Structure'
    : isPdbExperimental
    ? 'Experimental Structure'
    : 'Sequence-Derived Visualization';

  const structureBadgeClass = simulationResult || isModified
    ? 'bg-purple-900/50 text-purple-300 border-purple-500/50'
    : isPdbExperimental
    ? 'bg-emerald-900/50 text-emerald-300 border-emerald-500/50'
    : 'bg-sky-900/50 text-sky-300 border-sky-500/50';

  const normType = (activeAnalysisResult?.type || (sequenceType === 'UNKNOWN' ? 'PROTEIN' : sequenceType)).toUpperCase();

  // Top KPI 1 & 2 Cards matching the screenshot
  let kpi1Title = 'GC / AU RATIO';
  let kpi1Value = '43.8% / 56.3%';
  let kpi1Subtext = '2 Secondary Stems';

  let kpi2Title = 'EST. FOLDING FREE ENERGY';
  let kpi2Value = '-3.9 kcal/mol';
  let kpi2Subtext = '2 Hairpin Loops';

  if (normType === 'RNA') {
    const rna = activeAnalysisResult?.rnaAnalysis || predictRNASecondaryStructure(sequence);
    kpi1Title = 'GC / AU RATIO';
    kpi1Value = `${rna.gcPercentage}% / ${rna.auPercentage}%`;
    kpi1Subtext = `${rna.stemCount} Secondary Stem${rna.stemCount === 1 ? '' : 's'}`;

    kpi2Title = 'EST. FOLDING FREE ENERGY';
    kpi2Value = `${rna.estimatedFreeEnergyKcal} kcal/mol`;
    kpi2Subtext = `${rna.loopCount} Hairpin Loop${rna.loopCount === 1 ? '' : 's'}`;
  } else if (normType === 'DNA') {
    const dna = activeAnalysisResult?.dnaAnalysis;
    const gc = dna?.composition.gcPercentage ?? 50.0;
    const at = dna?.composition.atPercentage ?? 50.0;
    const len = length || 1;
    const estTm = len < 14
      ? (dna ? ((dna.composition.counts['A'] + dna.composition.counts['T']) * 2 + (dna.composition.counts['G'] + dna.composition.counts['C']) * 4) : 60)
      : (dna ? Number((64.9 + 41 * (dna.composition.gcCount - 16.4) / len).toFixed(1)) : 65);

    kpi1Title = 'GC / AT RATIO';
    kpi1Value = `${gc}% / ${at}%`;
    kpi1Subtext = `${dna?.orfs?.length ?? 0} Detected ORFs`;

    kpi2Title = 'EST. MELTING TEMP (Tm)';
    kpi2Value = `~${estTm}°C`;
    kpi2Subtext = 'B-DNA Duplex Stability';
  } else {
    // Protein
    const prot = activeAnalysisResult?.proteinAnalysis;
    kpi1Title = 'HYDROPATHY / pI';
    kpi1Value = `GRAVY ${prot?.gravyScore ?? '0.00'} · pI ${prot?.isoelectricPoint ?? '7.00'}`;
    kpi1Subtext = (prot?.gravyScore ?? 0) < 0 ? 'Hydrophilic Polypeptide' : 'Hydrophobic Polypeptide';

    kpi2Title = 'MOLECULAR WEIGHT';
    kpi2Value = `${prot?.molecularWeightKDa ?? 0} kDa`;
    kpi2Subtext = `${prot?.length ?? length} Amino Acids`;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ========================================================================= */}
      {/* RESTORED TWO-COLUMN MODULE: 3D STRUCTURE (LEFT) + SCIENTIFIC (RIGHT)       */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* LEFT COLUMN: 3D BIOLOGICAL STRUCTURE VISUALIZATION */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <Dna className="w-4 h-4 text-[#0284C7]" />
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-[#0F172A]">
                3D Biological Structure Visualization
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-[#64748B] hidden sm:inline">
                Interactive WebGL Canvas (Orbit / Zoom / Rotate)
              </span>
              <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold border ${structureBadgeClass}`}>
                {structureStatusBadge}
              </span>
            </div>
          </div>

          {/* 3D Structure Viewer Engine Container */}
          <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] shadow-2xs overflow-hidden min-h-[480px] flex-1 flex flex-col relative">
            <SequenceStructureViewer
              sequence={sequence}
              sequenceType={
                activeAnalysisResult?.type || (sequenceType === 'UNKNOWN' ? 'PROTEIN' : (sequenceType as any))
              }
              dnaAnalysis={activeAnalysisResult?.dnaAnalysis}
              rnaAnalysis={activeAnalysisResult?.rnaAnalysis}
              proteinAnalysis={activeAnalysisResult?.proteinAnalysis}
              totalRecordLength={length}
              mutations={mutations}
              originalSequence={originalSequence}
              simulatedSequence={simulatedSequence}
              simulationResult={simulationResult}
              accessionOrPdbId={accession}
              sequenceVersion={`v${versionNumber}`}
              className="w-full h-full flex-1"
            />
          </div>

          <div className="text-[11px] font-mono text-[#64748B] flex items-center justify-between pt-1">
            <span>Interactive Three.js · PDB / AlphaFold Coordinates</span>
            <span className="text-[#0284C7] font-semibold">{accession}</span>
          </div>
        </div>

        {/* RIGHT COLUMN: SCIENTIFIC INTERPRETATION (BIOPHYSICAL ANALYSIS) */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 text-[#0F172A]">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0284C7]" />
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-[#0F172A]">
                Scientific Interpretation
              </h3>
            </div>
            <span className="text-[11px] font-mono font-semibold text-[#0284C7]">
              Biophysical Analysis
            </span>
          </div>

          {/* Top Row: Two KPI metric cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#64748B] block font-bold">
                {kpi1Title}
              </span>
              <span className="text-lg font-mono font-bold text-[#0284C7] block">
                {kpi1Value}
              </span>
              <span className="text-[10px] font-mono text-[#64748B] block">
                {kpi1Subtext}
              </span>
            </div>
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#64748B] block font-bold">
                {kpi2Title}
              </span>
              <span className="text-lg font-mono font-bold text-[#0284C7] block">
                {kpi2Value}
              </span>
              <span className="text-[10px] font-mono text-[#64748B] block">
                {kpi2Subtext}
              </span>
            </div>
          </div>

          {/* Executive Evaluation Card */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 space-y-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#0284C7] block">
              Executive Evaluation
            </span>
            <p className="text-xs text-[#334155] leading-relaxed font-sans">
              {interpretation?.executiveSummary || `Analyzed ${length} ${unit} sequence construct (${accession}). Exhibiting balanced molecular properties under physiological parameters.`}
            </p>
          </div>

          {/* Biophysical Characteristics Card */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#0284C7] block">
              Biophysical Characteristics
            </span>
            <ul className="space-y-1.5 text-xs text-[#334155] font-sans">
              {(interpretation?.biophysicalInsights || [
                `Length: ${length} ${unit} with physiological solvent accessibility.`,
                `Equilibrium stability sustained by canonical secondary hydrogen bonding.`
              ]).map((insight, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-[#0284C7] font-bold leading-tight">•</span>
                  <span className="leading-relaxed">{insight}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Structural & Functional Predictions Card */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#0284C7] block">
              Structural &amp; Functional Predictions
            </span>
            <ul className="space-y-1.5 text-xs text-[#334155] font-sans">
              {((interpretation?.structuralImplications || []).concat(interpretation?.functionalPredictions || [])).length > 0 ? (
                interpretation?.structuralImplications.concat(interpretation?.functionalPredictions || []).map((pred, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-[#0284C7] font-bold leading-tight">•</span>
                    <span className="leading-relaxed">{pred}</span>
                  </li>
                ))
              ) : (
                <li className="flex items-start gap-2">
                  <span className="text-[#0284C7] font-bold leading-tight">•</span>
                  <span className="leading-relaxed">Biological model displays canonical stereochemical geometry.</span>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Collapsible toggle for Detailed Sequence Identity & Composition Table */}
      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={() => setShowDetailedSummary(!showDetailedSummary)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#CBD5E1] text-slate-700 hover:text-[#0F172A] hover:bg-slate-50 text-xs font-mono font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <Activity className="w-3.5 h-3.5 text-[#0284C7]" />
          <span>{showDetailedSummary ? 'Hide Detailed Sequence Composition Table' : 'Show Detailed Sequence Composition & Metadata Table'}</span>
          {showDetailedSummary ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
        </button>
      </div>

      {/* Detailed Sequence Summary Section (Collapsible) */}
      {showDetailedSummary && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#0284C7]" />
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-[#0F172A]">
                Sequence Summary &amp; Composition Breakdown
              </h3>
            </div>
            <span className="text-[11px] font-mono text-[#64748B]">Synchronized Analysis</span>
          </div>

          {/* 1. Core Identity & Definition */}
          {definition && (
            <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
              <span className="text-[10px] uppercase text-[#64748B] block font-mono">Sequence Name / Definition</span>
              <span className="font-bold text-[#0F172A] block text-xs mt-0.5">{definition}</span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
            <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
              <span className="text-[10px] uppercase text-[#64748B] block">Sequence ID</span>
              <span className="font-bold text-[#0F172A] truncate block">{accession}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
              <span className="text-[10px] uppercase text-[#64748B] block">Type</span>
              <span className="font-bold text-purple-700 block">{sequenceType}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
              <span className="text-[10px] uppercase text-[#64748B] block">Organism</span>
              <span className="font-bold text-[#0F172A] truncate block">{organism}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
              <span className="text-[10px] uppercase text-[#64748B] block">Length</span>
              <span className="font-bold text-[#0284C7] block">
                {formatNumber(length)} {unit}
              </span>
            </div>
          </div>

          {/* 2. Molecular Weight, pI, GRAVY, GC / AT */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
            {sequenceType === 'Protein' || sequenceType === 'PROTEIN' ? (
              <>
                <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
                  <span className="text-[10px] uppercase text-[#64748B] block">Molecular Weight</span>
                  <span className="font-bold text-purple-700 block">
                    {activeAnalysisResult?.proteinAnalysis?.molecularWeightKDa || '—'} kDa
                  </span>
                  <span className="text-[10px] text-[#64748B] block">
                    {activeAnalysisResult?.proteinAnalysis?.molecularWeightDa?.toLocaleString() || '—'} Da
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
                  <span className="text-[10px] uppercase text-[#64748B] block">Isoelectric Point (pI)</span>
                  <span className="font-bold text-[#0284C7] block">
                    {activeAnalysisResult?.proteinAnalysis?.isoelectricPoint || '—'}
                  </span>
                  <span className="text-[10px] text-[#64748B] block">
                    Net: {activeAnalysisResult?.proteinAnalysis?.netChargeAtPh7 !== undefined ? (activeAnalysisResult.proteinAnalysis.netChargeAtPh7 > 0 ? `+${activeAnalysisResult.proteinAnalysis.netChargeAtPh7}` : activeAnalysisResult.proteinAnalysis.netChargeAtPh7) : '—'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
                  <span className="text-[10px] uppercase text-[#64748B] block">GRAVY Hydropathy</span>
                  <span className="font-bold text-emerald-700 block">
                    {activeAnalysisResult?.proteinAnalysis?.gravyScore ?? '—'}
                  </span>
                  <span className="text-[10px] text-[#64748B] block">
                    {(activeAnalysisResult?.proteinAnalysis?.gravyScore ?? 0) < 0 ? 'Hydrophilic' : 'Hydrophobic'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
                  <span className="text-[10px] uppercase text-[#64748B] block">GC / AT Content</span>
                  <span className="font-bold text-slate-500 block">N/A</span>
                  <span className="text-[10px] text-[#64748B] block">Polypeptide chain</span>
                </div>
              </>
            ) : (
              <>
                <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
                  <span className="text-[10px] uppercase text-[#64748B] block">GC Content</span>
                  <span className="font-bold text-emerald-700 block">
                    {activeAnalysisResult?.dnaAnalysis?.composition.gcPercentage || 0}%
                  </span>
                  <span className="text-[10px] text-[#64748B] block">
                    {activeAnalysisResult?.dnaAnalysis?.composition.gcCount || 0} bp
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
                  <span className="text-[10px] uppercase text-[#64748B] block">AT Content</span>
                  <span className="font-bold text-[#0284C7] block">
                    {activeAnalysisResult?.dnaAnalysis?.composition.atPercentage || 0}%
                  </span>
                  <span className="text-[10px] text-[#64748B] block">
                    {activeAnalysisResult?.dnaAnalysis?.composition.atCount || 0} bp
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
                  <span className="text-[10px] uppercase text-[#64748B] block">Open Reading Frames</span>
                  <span className="font-bold text-purple-700 block">
                    {activeAnalysisResult?.dnaAnalysis?.orfs?.length || 0} ORFs
                  </span>
                  <span className="text-[10px] text-[#64748B] block">Direct translation</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
                  <span className="text-[10px] uppercase text-[#64748B] block">Estimated Mass</span>
                  <span className="font-bold text-slate-800 block">
                    {((length * 330) / 1000).toFixed(1)} kDa
                  </span>
                  <span className="text-[10px] text-[#64748B] block">Single strand</span>
                </div>
              </>
            )}
          </div>

          {/* 3. Composition */}
          <div className="space-y-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#475569] block">
              {sequenceType === 'Protein' || sequenceType === 'PROTEIN'
                ? 'Residue Composition'
                : 'Nucleotide Composition'}
            </span>
            {(sequenceType === 'Protein' || sequenceType === 'PROTEIN') && activeAnalysisResult?.proteinAnalysis ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                {Object.entries(activeAnalysisResult.proteinAnalysis.percentages || {})
                  .slice(0, 4)
                  .map(([aa, pct]) => {
                    const count = activeAnalysisResult.proteinAnalysis?.counts?.[aa] || 0;
                    return (
                      <div key={aa} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-2 space-y-1">
                        <div className="flex justify-between font-bold text-[11px]">
                          <span>{aa}</span>
                          <span className="text-[#0284C7]">
                            {pct}% ({count})
                          </span>
                        </div>
                        <div className="w-full bg-[#E2E8F0] h-1.5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full"
                            style={{ width: `${Math.min(pct * 3, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : activeAnalysisResult?.dnaAnalysis ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                {Object.entries(activeAnalysisResult.dnaAnalysis.composition.counts || {}).map(([base, count]) => {
                  const pct = length > 0 ? Number(((count / length) * 100).toFixed(1)) : 0;
                  return (
                    <div key={base} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-2 space-y-1">
                      <div className="flex justify-between font-bold text-[11px]">
                        <span className="text-[#0284C7]">{base}</span>
                        <span className="text-[#64748B]">{pct}%</span>
                      </div>
                      <div className="w-full bg-[#E2E8F0] h-1.5 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* 4. Biological Role */}
          <div className="space-y-1.5 pt-2 border-t border-[#E2E8F0]">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#475569] flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>Biological Role &amp; Functional Context</span>
            </span>
            <p className="text-xs text-[#334155] leading-relaxed bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
              {biologicalRole}
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION: CHANGES & COMPARISONS (WHEN WORKING COPY IS MODIFIED)             */}
      {/* ========================================================================= */}
      {isModified && (
        <div className="space-y-4 bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-amber-100 text-amber-800 border border-amber-300">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-xs font-mono text-[#0F172A] uppercase tracking-wider">
                    Active Modifications ({mutations.length} Detected vs V1)
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                    Working Copy
                  </span>
                </div>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Working copy contains unapplied sequence changes. Apply to commit Version {versionNumber + 1} or Discard to restore V1.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
              <button
                type="button"
                onClick={onDiscardChanges}
                className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-slate-300 text-slate-700 hover:text-rose-700 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Discard Changes</span>
              </button>
              <button
                type="button"
                onClick={onApplyChanges}
                disabled={isSaving}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:scale-95"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Apply Changes → V{versionNumber + 1}</span>
              </button>
            </div>
          </div>

          {/* Changed Residues List */}
          {mutations.length > 0 && (
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 space-y-2 font-mono text-xs">
              <span className="text-[11px] font-bold text-[#475569] uppercase tracking-wider block">
                Changed Residues ({mutations.length} Applied):
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {mutations.map((m, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-md bg-white border border-purple-200 text-purple-900 font-bold shadow-2xs text-xs flex items-center gap-1.5"
                  >
                    <span className="text-slate-400 font-normal">Pos {m.position}:</span>
                    <span className="text-rose-600">{m.original || '—'}</span>
                    <span className="text-slate-400">→</span>
                    <span className="text-emerald-600 font-extrabold">{m.modified || '—'}</span>
                    {m.operation !== 'substitution' && (
                      <span className="text-[10px] text-slate-500 capitalize">({m.operation})</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Analysis-Level Differences Table */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider font-mono">
              Comparative Analysis (Original V1 vs Modified Working Copy)
            </span>
            <div className="border border-[#E2E8F0] rounded-xl overflow-hidden font-mono text-xs">
              <table className="w-full text-left">
                <thead className="bg-[#F8FAFC] text-[#475569] border-b border-[#E2E8F0]">
                  <tr>
                    <th className="p-3">Metric</th>
                    <th className="p-3">Original V1</th>
                    <th className="p-3">Modified Working Copy</th>
                    <th className="p-3">Difference / Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] bg-white">
                  {sequenceType === 'Protein' || sequenceType === 'PROTEIN' ? (
                    <>
                      <tr className="hover:bg-[#F8FAFC]">
                        <td className="p-3 font-bold text-[#0F172A]">Sequence Length</td>
                        <td className="p-3 text-[#64748B]">{originalSequence.length} aa</td>
                        <td className="p-3 font-bold text-[#0284C7]">{sequence.length} aa</td>
                        <td className="p-3 text-slate-700">
                          {sequence.length - originalSequence.length === 0
                            ? '0 (Net length conserved)'
                            : `${sequence.length - originalSequence.length > 0 ? '+' : ''}${sequence.length - originalSequence.length} aa`}
                        </td>
                      </tr>
                      <tr className="hover:bg-[#F8FAFC]">
                        <td className="p-3 font-bold text-[#0F172A]">Molecular Weight</td>
                        <td className="p-3 text-[#64748B]">
                          {originalAnalysisResult?.proteinAnalysis?.molecularWeightKDa || '—'} kDa
                        </td>
                        <td className="p-3 font-bold text-[#0284C7]">
                          {activeAnalysisResult?.proteinAnalysis?.molecularWeightKDa || '—'} kDa
                        </td>
                        <td className="p-3 text-slate-700">
                          {originalAnalysisResult?.proteinAnalysis && activeAnalysisResult?.proteinAnalysis
                            ? `${(activeAnalysisResult.proteinAnalysis.molecularWeightKDa - originalAnalysisResult.proteinAnalysis.molecularWeightKDa).toFixed(3)} kDa`
                            : 'Calculated live'}
                        </td>
                      </tr>
                      <tr className="hover:bg-[#F8FAFC]">
                        <td className="p-3 font-bold text-[#0F172A]">Isoelectric Point (pI)</td>
                        <td className="p-3 text-[#64748B]">
                          {originalAnalysisResult?.proteinAnalysis?.isoelectricPoint || '—'}
                        </td>
                        <td className="p-3 font-bold text-[#0284C7]">
                          {activeAnalysisResult?.proteinAnalysis?.isoelectricPoint || '—'}
                        </td>
                        <td className="p-3 text-slate-700">
                          {originalAnalysisResult?.proteinAnalysis && activeAnalysisResult?.proteinAnalysis
                            ? `${(activeAnalysisResult.proteinAnalysis.isoelectricPoint - originalAnalysisResult.proteinAnalysis.isoelectricPoint).toFixed(2)}`
                            : 'Calculated live'}
                        </td>
                      </tr>
                      <tr className="hover:bg-[#F8FAFC]">
                        <td className="p-3 font-bold text-[#0F172A]">GRAVY Score</td>
                        <td className="p-3 text-[#64748B]">
                          {originalAnalysisResult?.proteinAnalysis?.gravyScore || '—'}
                        </td>
                        <td className="p-3 font-bold text-[#0284C7]">
                          {activeAnalysisResult?.proteinAnalysis?.gravyScore || '—'}
                        </td>
                        <td className="p-3 text-slate-700">
                          {originalAnalysisResult?.proteinAnalysis && activeAnalysisResult?.proteinAnalysis
                            ? `${(activeAnalysisResult.proteinAnalysis.gravyScore - originalAnalysisResult.proteinAnalysis.gravyScore).toFixed(3)}`
                            : 'Calculated live'}
                        </td>
                      </tr>
                    </>
                  ) : (
                    <>
                      <tr className="hover:bg-[#F8FAFC]">
                        <td className="p-3 font-bold text-[#0F172A]">Sequence Length</td>
                        <td className="p-3 text-[#64748B]">{originalSequence.length} bp</td>
                        <td className="p-3 font-bold text-[#0284C7]">{sequence.length} bp</td>
                        <td className="p-3 text-slate-700">{sequence.length - originalSequence.length} bp</td>
                      </tr>
                      <tr className="hover:bg-[#F8FAFC]">
                        <td className="p-3 font-bold text-[#0F172A]">GC Content %</td>
                        <td className="p-3 text-[#64748B]">
                          {originalAnalysisResult?.dnaAnalysis?.composition?.gcPercentage || '—'}%
                        </td>
                        <td className="p-3 font-bold text-[#0284C7]">
                          {activeAnalysisResult?.dnaAnalysis?.composition?.gcPercentage || '—'}%
                        </td>
                        <td className="p-3 text-slate-700">
                          {originalAnalysisResult?.dnaAnalysis && activeAnalysisResult?.dnaAnalysis
                            ? `${(activeAnalysisResult.dnaAnalysis.composition.gcPercentage - originalAnalysisResult.dnaAnalysis.composition.gcPercentage).toFixed(2)}%`
                            : 'Calculated live'}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION: DETAILED COMPOSITION & COMPUTED INSIGHTS                          */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Composition Breakdown */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 md:p-6 shadow-xs space-y-4">
          <h4 className="text-xs font-bold text-[#0F172A] tracking-wider uppercase font-mono flex items-center justify-between">
            <span>
              {sequenceType === 'Protein' || sequenceType === 'PROTEIN'
                ? 'Complete Amino Acid Breakdown'
                : 'Complete Nucleotide Breakdown'}
            </span>
            <span className="text-[10px] text-[#64748B] font-normal">{length} Total</span>
          </h4>

          {(sequenceType === 'Protein' || sequenceType === 'PROTEIN') && activeAnalysisResult?.proteinAnalysis && (
            <div className="space-y-3 font-mono text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {Object.entries(activeAnalysisResult.proteinAnalysis.percentages || {})
                  .slice(0, 8)
                  .map(([aa, pct]) => {
                    const count = activeAnalysisResult.proteinAnalysis?.counts?.[aa] || 0;
                    return (
                      <div key={aa} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-2.5">
                        <div className="flex justify-between text-[11px] mb-1 font-bold">
                          <span>{aa}</span>
                          <span className="text-[#64748B]">
                            {pct}% ({count})
                          </span>
                        </div>
                        <div className="w-full bg-[#E2E8F0] h-1.5 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {activeAnalysisResult?.dnaAnalysis && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
              {Object.entries(activeAnalysisResult.dnaAnalysis.composition.counts || {}).map(([base, count]) => {
                const pct = length > 0 ? Number(((count / length) * 100).toFixed(1)) : 0;
                return (
                  <div key={base} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 space-y-1.5">
                    <div className="flex justify-between font-bold">
                      <span className="text-[#0284C7]">{base}</span>
                      <span className="text-[#64748B]">{pct}%</span>
                    </div>
                    <div className="text-[10px] text-[#64748B]">{count.toLocaleString()} bp</div>
                    <div className="w-full bg-[#E2E8F0] h-1.5 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Computed Insights */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 md:p-6 shadow-xs space-y-4">
          <h4 className="text-xs font-bold text-[#0F172A] tracking-wider uppercase font-mono flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#0284C7]" />
            <span>Computed Biophysical Insights</span>
          </h4>

          <div className="space-y-2.5 text-xs text-[#334155] font-sans">
            {(sequenceType === 'Protein' || sequenceType === 'PROTEIN') && activeAnalysisResult?.proteinAnalysis ? (
              <ul className="space-y-2">
                <li className="flex items-start gap-2 p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] shrink-0 mt-1.5" />
                  <div>
                    <strong className="text-[#0F172A]">Isoelectric Point (pI): </strong>
                    <span>
                      {activeAnalysisResult.proteinAnalysis.isoelectricPoint} —{' '}
                      {activeAnalysisResult.proteinAnalysis.isoelectricPoint < 7
                        ? 'Calculated acidic isoelectric behavior at physiological pH.'
                        : activeAnalysisResult.proteinAnalysis.isoelectricPoint > 7
                        ? 'Calculated basic isoelectric behavior at physiological pH.'
                        : 'Calculated neutral isoelectric point.'}
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-2 p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] shrink-0 mt-1.5" />
                  <div>
                    <strong className="text-[#0F172A]">GRAVY Hydropathy: </strong>
                    <span>
                      {activeAnalysisResult.proteinAnalysis.gravyScore} —{' '}
                      {activeAnalysisResult.proteinAnalysis.gravyScore < 0
                        ? 'Negative index indicates overall hydrophilic properties.'
                        : 'Positive index indicates overall hydrophobic character.'}
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-2 p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] shrink-0 mt-1.5" />
                  <div>
                    <strong className="text-[#0F172A]">Molecular Mass: </strong>
                    <span>
                      Total molecular weight computed at {activeAnalysisResult.proteinAnalysis.molecularWeightKDa} kDa across{' '}
                      {length} amino acid residues.
                    </span>
                  </div>
                </li>
              </ul>
            ) : activeAnalysisResult?.dnaAnalysis ? (
              <ul className="space-y-2">
                <li className="flex items-start gap-2 p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] shrink-0 mt-1.5" />
                  <div>
                    <strong className="text-[#0F172A]">GC Fraction: </strong>
                    <span>
                      {activeAnalysisResult.dnaAnalysis.composition.gcPercentage}% (
                      {activeAnalysisResult.dnaAnalysis.composition.gcPercentage > 50
                        ? 'G+C rich nucleotide profile'
                        : 'A+T rich nucleotide profile'}
                      ).
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-2 p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] shrink-0 mt-1.5" />
                  <div>
                    <strong className="text-[#0F172A]">Reading Frames: </strong>
                    <span>
                      {activeAnalysisResult.dnaAnalysis.orfs?.length || 0} Open Reading Frame(s) detected with canonical start/stop codons.
                    </span>
                  </div>
                </li>
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION: SCIENTIFIC SEQUENCE REPORT & ARTIFACT EXPORT                     */}
      {/* ========================================================================= */}
      <div className="bg-white border border-[#CBD5E1] rounded-3xl p-6 sm:p-10 shadow-sm space-y-8 font-sans">
        <div className="border-b-2 border-slate-900 pb-5 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="w-5 h-5 text-[#0284C7]" />
              <span className="text-xs font-mono font-bold tracking-widest text-[#0284C7] uppercase">
                BioCode Studio · Computational Sequence Intelligence
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold font-display text-slate-900 tracking-tight">
              SEQUENCE ANALYSIS REPORT
            </h2>
            <p className="text-xs text-slate-600 font-sans mt-0.5">
              Publication-ready computational summary of the active biological sequence
            </p>
          </div>

          <div className="text-right font-mono text-xs text-slate-600 space-y-0.5">
            <div>
              Report Date: <strong className="text-slate-900">{new Date().toLocaleDateString()}</strong>
            </div>
            <div>
              Active Target: <strong className="text-[#0284C7]">{accession}</strong>
            </div>
            <div>
              Status:{' '}
              <span className="font-bold text-emerald-700">
                {isModified ? `V${versionNumber} (Working Copy)` : `V${versionNumber} (Committed)`}
              </span>
            </div>
          </div>
        </div>

        {/* Document Export Action Bar */}
        <div className="pt-2 flex items-center justify-between flex-wrap gap-4">
          <div className="text-xs text-slate-500 font-mono">
            Export matching computational report artifact:
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <button
              type="button"
              onClick={onExportJSON}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-semibold flex items-center gap-2 cursor-pointer shadow-2xs transition-colors"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              onClick={onExportPDF}
              className="px-5 py-2.5 rounded-xl bg-[#0284C7] hover:bg-sky-600 text-white font-bold flex items-center gap-2 cursor-pointer shadow-xs transition-colors active:scale-95"
            >
              <FileText className="w-4 h-4 text-white" />
              <span>Export Report PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION: ADVANCED ANALYSIS & RAW SEQUENCE TOOLS (COLLAPSIBLE)              */}
      {/* ========================================================================= */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full p-4 text-left flex items-center justify-between bg-slate-50/70 hover:bg-slate-100/70 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2 text-xs font-bold font-mono text-[#0F172A]">
            <Layers className="w-4 h-4 text-[#0284C7]" />
            <span>Advanced Analysis &amp; Raw Sequence Tools</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-[#64748B] font-mono">
            <span>{showAdvanced ? 'Hide' : 'Show'}</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showAdvanced && (
          <div className="p-6 border-t border-[#E2E8F0] space-y-6">
            <div className="space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#0F172A] font-bold">
                  Raw Canonical Sequence ({length} residues)
                </span>
                <button
                  type="button"
                  onClick={() => onCopySequence(sequence)}
                  className="text-xs text-[#0284C7] hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedSeq ? 'Copied' : 'Copy Sequence'}</span>
                </button>
              </div>
              <div className="bg-[#F8FAFC] p-4 rounded-xl border border-[#CBD5E1] text-[#0F172A] break-all leading-relaxed max-h-48 overflow-y-auto select-all">
                {sequence.match(/.{1,10}/g)?.join(' ') || sequence}
              </div>
            </div>

            {activeAnalysisResult?.dnaAnalysis && (
              <div className="space-y-3 font-mono text-xs">
                <h5 className="font-bold text-[#0F172A] uppercase tracking-wider">
                  Open Reading Frames (ORFs) Detail
                </h5>
                <div className="border border-[#E2E8F0] rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAFC] text-[#475569] border-b border-[#E2E8F0]">
                      <tr>
                        <th className="p-2.5">Frame</th>
                        <th className="p-2.5">Start (bp)</th>
                        <th className="p-2.5">End (bp)</th>
                        <th className="p-2.5">Length</th>
                        <th className="p-2.5">Polypeptide</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] bg-white">
                      {(activeAnalysisResult.dnaAnalysis.orfs || []).map((orf, idx) => (
                        <tr key={idx} className="hover:bg-[#F8FAFC]">
                          <td className="p-2.5 text-emerald-700 font-bold">
                            {orf.frame > 0 ? `+${orf.frame}` : orf.frame}
                          </td>
                          <td className="p-2.5 text-[#334155]">{orf.start}</td>
                          <td className="p-2.5 text-[#334155]">{orf.end}</td>
                          <td className="p-2.5 text-[#334155]">
                            {orf.lengthBp} bp ({orf.lengthAa} aa)
                          </td>
                          <td className="p-2.5 text-[#64748B] truncate max-w-xs">{orf.proteinSequence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
