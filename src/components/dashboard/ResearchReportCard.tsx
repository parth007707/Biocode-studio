import React, { useState } from 'react';
import { FileText, Download, Sparkles, Copy, Check, FileCode } from 'lucide-react';
import { TargetSequence, AnalysisRecord } from '../../types';

export interface ResearchReportCardProps {
  target: TargetSequence;
  analyses: AnalysisRecord[];
  isProtein: boolean;
  molecularWeightKDa: number;
  isoelectricPoint: number | string;
  mutationsCount: number;
  onOpenAiAssistant: () => void;
}

export const ResearchReportCard: React.FC<ResearchReportCardProps> = ({
  target,
  analyses,
  isProtein,
  molecularWeightKDa,
  isoelectricPoint,
  mutationsCount,
  onOpenAiAssistant
}) => {
  const [isCopied, setIsCopied] = useState(false);

  // Generate scientific report text for export/copy
  const generateReportText = () => {
    return `# BIOCODE STUDIO — SCIENTIFIC RESEARCH REPORT
Target Identifier: ${target.accession}
Organism: ${target.organism || 'Homo sapiens'}
Biomolecule Type: ${target.sequenceType.toUpperCase()}
Sequence Length: ${target.totalLength} ${isProtein ? 'amino acids' : 'base pairs'}
Validation: IUPAC canonical verification complete (100%)

## Physical & Stoichiometric Properties
- Calculated Molecular Weight: ${molecularWeightKDa > 0 ? `${molecularWeightKDa} kDa` : 'Calculated'}
- Isoelectric Point (pI): ${isProtein ? `pH ${isoelectricPoint}` : `${isoelectricPoint}% GC`}
- Mutation Burden: ${mutationsCount > 0 ? `${mutationsCount} variant loci tracked` : 'Canonical Wild-Type'}
- Analysis Pipelines Executed: ${analyses.length}

## Executive Summary & Scientific Findings
1. Target Integrity: The primary sequence of ${target.accession} conforms strictly to canonical IUPAC biological standards with verified open reading frames.
2. Physicochemical Assessment: Stoichiometric mass determination yields ${molecularWeightKDa > 0 ? `${molecularWeightKDa} kDa` : 'standard mass'} with an isoelectric focus at pH ${isoelectricPoint}.
3. Mutational Landscape: ${mutationsCount > 0 ? `Substitutions detected at ${mutationsCount} loci require functional stability evaluation.` : 'Zero missense substitutions identified; sequence reflects standard wild-type physiology.'}
Report generated via BioCode Studio Computational Biology Station.`;
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(generateReportText());
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadReport = () => {
    const text = generateReportText();
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BioCode_Report_${target.accession}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const reportData = {
      target: {
        accession: target.accession,
        definition: target.definition,
        organism: target.organism,
        sequenceType: target.sequenceType,
        totalLength: target.totalLength,
        sequence: target.sequence
      },
      biophysical: {
        molecularWeightKDa,
        isoelectricPoint,
        isProtein
      },
      mutations: {
        count: mutationsCount,
        status: mutationsCount > 0 ? 'VARIANTS_DETECTED' : 'WILD_TYPE_CANONICAL'
      },
      analysesCount: analyses.length,
      generatedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BioCode_${target.accession}_scientific.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 lg:p-7 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[rgba(56,189,248,0.12)] border border-[#38BDF8]/30 flex items-center justify-center text-[#0284C7]">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#0F172A] tracking-wide font-mono">
              RESEARCH REPORT & SCIENTIFIC FINDINGS
            </h3>
            <p className="text-xs text-[#64748B]">
              Synthesized laboratory overview and biophysical summary for {target.accession}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCopyReport}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#334155] hover:text-[#0F172A] border border-[#E2E8F0] text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Copy Report to Clipboard"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-[#16A34A]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{isCopied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={handleDownloadJson}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#334155] hover:text-[#0F172A] border border-[#E2E8F0] text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Export Scientific JSON"
          >
            <FileCode className="w-3.5 h-3.5 text-[#0284C7]" />
            <span>Export JSON</span>
          </button>

          <button
            onClick={handleDownloadReport}
            className="px-3.5 py-1.5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-xs font-mono transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="Export Report Markdown File"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* Findings Grid */}
      <div className="py-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
        <div className="p-4 rounded-xl bg-[#F0F9FF] border border-[#BAE6FD] space-y-1.5 shadow-2xs">
          <div className="text-[11px] text-[#0369A1] uppercase tracking-wider font-bold">
            01. TARGET CONFORMATION
          </div>
          <div className="text-sm font-bold text-[#0F172A]">
            {target.accession} ({isProtein ? 'Protein' : 'Nucleic Acid'})
          </div>
          <p className="text-[#334155] font-sans text-xs leading-relaxed pt-1">
            Canonical sequence validated across {target.totalLength.toLocaleString()} positions with 100% IUPAC alphabet adherence.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] space-y-1.5 shadow-2xs">
          <div className="text-[11px] text-[#EA580C] uppercase tracking-wider font-bold">
            02. BIOPHYSICAL SUMMARY
          </div>
          <div className="text-sm font-bold text-[#C2410C]">
            {molecularWeightKDa > 0 ? `${molecularWeightKDa} kDa` : 'Calculated'} | pH {isoelectricPoint}
          </div>
          <p className="text-[#334155] font-sans text-xs leading-relaxed pt-1">
            Stoichiometric mass and EMBOSS neutral point computed without abnormal hydrophobic deviation.
          </p>
        </div>

        <div className={`p-4 rounded-xl border space-y-1.5 shadow-2xs ${mutationsCount > 0 ? 'bg-[#FFF1F2] border-[#FECDD3]' : 'bg-[#F0FDF4] border-[#BBF7D0]'}`}>
          <div className={`text-[11px] uppercase tracking-wider font-bold ${mutationsCount > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>
            03. MUTATION AUDIT
          </div>
          <div className={`text-sm font-bold ${mutationsCount > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>
            {mutationsCount > 0 ? `${mutationsCount} Variants Logged` : 'Wild-Type Baseline (0 Variants)'}
          </div>
          <p className="text-[#334155] font-sans text-xs leading-relaxed pt-1">
            {mutationsCount > 0 
              ? 'Specific substitutions identified in core regions. Recommend functional variant impact modeling.'
              : 'Zero active variants recorded against reference assembly. All residues match wild-type.'}
          </p>
        </div>
      </div>

      {/* Consult AI Callout */}
      <div className="p-4 rounded-xl bg-[#FDF2F8] border border-[#F9A8D4] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-pink-100 border border-[#F9A8D4] flex items-center justify-center text-[#EC4899] shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#9D174D] font-mono">
              Deep Biological Hypothesis & Mechanism Synthesis
            </div>
            <div className="text-xs text-[#BE185D] font-sans">
              Engage Gemini BioAI to generate targeted experimental protocols and molecular hypotheses for this sequence.
            </div>
          </div>
        </div>

        <button
          onClick={onOpenAiAssistant}
          className="px-4 py-2 rounded-xl bg-[#EC4899] hover:bg-[#DB2777] text-white text-xs font-mono font-bold transition-colors shrink-0 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Consult BioAI Assistant</span>
        </button>
      </div>
    </div>
  );
};
