import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  Sparkles, 
  Wand2, 
  Trash2, 
  Copy, 
  Check, 
  Info, 
  ChevronDown, 
  ChevronUp, 
  Hash, 
  FileCode,
  Zap,
  ArrowRight
} from 'lucide-react';
import { 
  SequenceValidationDetails, 
  InvalidCharacterFindingDetail,
  SequenceType 
} from '../../lib/bio/types';

interface SequenceValidationLayerProps {
  validationDetails?: SequenceValidationDetails;
  rawInput: string;
  detectedType: SequenceType;
  onSanitizeSequence: (sanitized: string) => void;
  onConvertUtoT?: () => void;
  onConvertTtoU?: () => void;
}

export const SequenceValidationLayer: React.FC<SequenceValidationLayerProps> = ({
  validationDetails,
  rawInput,
  detectedType,
  onSanitizeSequence,
  onConvertUtoT,
  onConvertTtoU
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [selectedCharFilter, setSelectedCharFilter] = useState<string | null>(null);
  const [copiedClean, setCopiedClean] = useState<boolean>(false);

  if (!rawInput.trim() || !validationDetails) {
    return null;
  }

  const {
    isValid,
    validationStatus,
    totalInvalidCount,
    distinctInvalidCount,
    invalidFindings,
    hasNumbers,
    hasSymbols,
    hasNonNucleotideChars,
    hasNonProteinChars,
    hasMixedTU,
    mixedTUPositions,
    errors,
    warnings,
    sanitizedCleanSequence,
    sanitizedDnaSequence,
    sanitizedRnaSequence,
    sanitizedProteinSequence,
    validResidueCount,
    totalInputLength
  } = validationDetails;

  const handleCopyClean = () => {
    if (!sanitizedCleanSequence) return;
    navigator.clipboard.writeText(sanitizedCleanSequence);
    setCopiedClean(true);
    setTimeout(() => setCopiedClean(false), 2000);
  };

  // If sequence is completely valid, render an affirmative verification ribbon
  if (isValid) {
    return (
      <div className="rounded-xl p-3 bg-emerald-50/80 border border-emerald-200 text-xs font-mono text-emerald-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <div>
            <span className="font-bold text-emerald-900">Sequence Validation Passed:</span>{' '}
            <span>
              100% verified {detectedType} composition ({validResidueCount.toLocaleString()} residues). Zero non-biological or invalid characters detected.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300">
            {detectedType} OK
          </span>
        </div>
      </div>
    );
  }

  // When invalid characters or biological conflicts exist
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 space-y-3.5 shadow-xs transition-all animate-fadeIn">
      {/* Top Validation Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold font-mono text-rose-900">
                Invalid Biological Characters Flagged
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-200 text-rose-900 border border-rose-300 font-mono">
                {totalInvalidCount} invalid residue{totalInvalidCount === 1 ? '' : 's'} ({distinctInvalidCount} distinct)
              </span>
              {hasMixedTU && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 font-mono">
                  Mixed T/U Conflict
                </span>
              )}
            </div>
            <p className="text-[11px] text-rose-700/90 font-mono mt-0.5">
              Automated character inspection detected non-nucleotide, non-protein, numeric, or symbolic entries that would invalidate analytical calculations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onSanitizeSequence(
              detectedType === 'PROTEIN' 
                ? sanitizedProteinSequence 
                : detectedType === 'RNA' 
                ? sanitizedRnaSequence 
                : sanitizedDnaSequence || sanitizedCleanSequence
            )}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-mono text-xs font-bold transition-all shadow-xs cursor-pointer"
            title="Automatically strip all non-biological and invalid characters"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Auto-Sanitize</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="p-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 transition-colors cursor-pointer"
            title={isExpanded ? 'Collapse validation details' : 'Expand validation details'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expandable Detailed Character Breakdown */}
      {isExpanded && (
        <div className="space-y-3 pt-1 border-t border-rose-200/80">
          {/* Categorized Findings Chips */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-rose-800 font-bold block">
              Flagged Characters &amp; Coordinates:
            </span>

            <div className="flex flex-wrap gap-2">
              {invalidFindings.map((finding) => {
                const isSelected = selectedCharFilter === finding.char;
                let badgeColor = 'bg-rose-100 text-rose-800 border-rose-300';
                if (finding.category === 'NUMERIC') {
                  badgeColor = 'bg-amber-100 text-amber-900 border-amber-300';
                } else if (finding.category === 'SYMBOL') {
                  badgeColor = 'bg-purple-100 text-purple-900 border-purple-300';
                } else if (finding.category === 'NON_NUCLEOTIDE') {
                  badgeColor = 'bg-rose-100 text-rose-900 border-rose-300';
                }

                return (
                  <button
                    key={finding.char}
                    type="button"
                    onClick={() => setSelectedCharFilter(isSelected ? null : finding.char)}
                    className={`px-2.5 py-1 rounded-xl border text-xs font-mono font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                      isSelected 
                        ? 'ring-2 ring-rose-500 bg-white font-bold text-rose-900 shadow-xs' 
                        : `${badgeColor} hover:bg-white`
                    }`}
                    title={finding.description}
                  >
                    <span className="font-bold text-sm bg-white/80 px-1.5 py-0.2 rounded border border-rose-200">
                      {finding.char === ' ' ? '␣' : finding.char}
                    </span>
                    <span className="text-[11px] font-bold">{finding.count}×</span>
                    <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-black/5">
                      {finding.categoryLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Position Indices Details for Selected or All Characters */}
          <div className="p-3 bg-white/90 rounded-xl border border-rose-200 text-xs font-mono space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[#64748B]">
              <span className="font-bold text-[#0F172A] flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-rose-600" />
                <span>Sequence Coordinate Locations (1-based index)</span>
              </span>
              <span>
                {selectedCharFilter ? `Filter: '${selectedCharFilter}'` : 'Showing all flagged residues'}
              </span>
            </div>

            <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1 divide-y divide-rose-100 text-[11px]">
              {invalidFindings
                .filter(f => !selectedCharFilter || f.char === selectedCharFilter)
                .map((f) => (
                  <div key={f.char} className="pt-1.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                        '{f.char}'
                      </span>
                      <span className="text-[#334155]">{f.description}</span>
                    </div>
                    <div className="flex items-center gap-1 overflow-x-auto max-w-sm text-right shrink-0">
                      <span className="text-[#94A3B8] text-[10px]">Pos:</span>
                      {f.positions.slice(0, 10).map((pos, pIdx) => (
                        <span key={pIdx} className="px-1 py-0.2 rounded bg-rose-50 text-rose-700 font-mono text-[10px] border border-rose-200">
                          @{pos.toLocaleString()}
                        </span>
                      ))}
                      {f.positions.length > 10 && (
                        <span className="text-[10px] text-[#94A3B8]">+{f.positions.length - 10} more</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Remediation & Quick Fix Actions Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-xs">
            <div className="flex items-center gap-2 text-[11px] text-rose-800">
              <span>Valid biological residues ready:</span>
              <strong className="text-emerald-700 font-bold">{validResidueCount.toLocaleString()}</strong>
              <span className="text-[#94A3B8]">/ {totalInputLength.toLocaleString()} total</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {hasMixedTU && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (onConvertUtoT) onConvertUtoT();
                      else onSanitizeSequence(sanitizedDnaSequence);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-[11px] font-bold cursor-pointer transition-colors"
                  >
                    Resolve to DNA (U → T)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (onConvertTtoU) onConvertTtoU();
                      else onSanitizeSequence(sanitizedRnaSequence);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300 text-[11px] font-bold cursor-pointer transition-colors"
                  >
                    Resolve to RNA (T → U)
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleCopyClean}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#F1F5F9] text-[#334155] border border-[#CBD5E1] text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                title="Copy sanitized clean sequence to clipboard"
              >
                {copiedClean ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-[#64748B]" />}
                <span>{copiedClean ? 'Copied Clean' : 'Copy Clean'}</span>
              </button>

              <button
                type="button"
                onClick={() => onSanitizeSequence(sanitizedCleanSequence)}
                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <Wand2 className="w-3 h-3" />
                <span>Strip {totalInvalidCount} Invalid Residues</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
