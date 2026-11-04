import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Wand2,
  HelpCircle,
  Eye,
  Info,
  XCircle,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { validateBiologicalSequence } from '../../../lib/bio/sequenceValidator';
import { SequenceType } from '../../../lib/bio/types';

interface RealtimeFastaValidatorProps {
  sequence: string;
  fastaHeader?: string | null;
  sequenceType?: SequenceType;
  onSanitizeSequence?: (cleanSeq: string) => void;
  onConvertTtoU?: () => void;
  onConvertUtoT?: () => void;
}

export const RealtimeFastaValidator: React.FC<RealtimeFastaValidatorProps> = ({
  sequence,
  fastaHeader,
  sequenceType = 'PROTEIN',
  onSanitizeSequence,
  onConvertTtoU,
  onConvertUtoT
}) => {
  const [showPositionDetails, setShowPositionDetails] = useState(false);
  const [highlightMode, setHighlightMode] = useState<'ALL' | 'INVALID_ONLY'>('INVALID_ONLY');

  const validation = useMemo(() => {
    return validateBiologicalSequence(sequence || '', sequenceType);
  }, [sequence, sequenceType]);

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
    errors,
    warnings,
    sanitizedCleanSequence,
    sanitizedDnaSequence,
    sanitizedRnaSequence,
    sanitizedProteinSequence
  } = validation;

  if (!sequence || sequence.trim().length === 0) {
    return (
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-500 flex items-center gap-2">
        <Info className="w-4 h-4 text-slate-400 shrink-0" />
        <span>No sequence loaded for real-time FASTA format validation.</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 sm:p-5 space-y-4 shadow-xs font-sans">
      {/* Real-Time Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-xl flex items-center justify-center shrink-0 ${
              isValid
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : hasMixedTU || totalInvalidCount > 0
                ? 'bg-amber-50 text-amber-600 border border-amber-200 animate-pulse'
                : 'bg-rose-50 text-rose-600 border border-rose-200'
            }`}
          >
            {isValid ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-[#0F172A] font-display">
                Real-Time FASTA &amp; IUPAC Validator
              </h4>
              {!isValid && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  <ShieldAlert className="w-3 h-3 text-amber-600" />
                  {totalInvalidCount} Non-IUPAC / Illegal Char{totalInvalidCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-xs text-[#64748B] mt-0.5 font-mono">
              Target Alphabet: <span className="font-semibold text-[#0284C7]">{sequenceType}</span> | Length: {sequence.length.toLocaleString()} residues
            </p>
          </div>
        </div>

        {/* Quick Action Buttons */}
        {!isValid && onSanitizeSequence && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const targetSanitized =
                  sequenceType === 'DNA'
                    ? sanitizedDnaSequence
                    : sequenceType === 'RNA'
                    ? sanitizedRnaSequence
                    : sequenceType === 'PROTEIN'
                    ? sanitizedProteinSequence
                    : sanitizedCleanSequence;
                onSanitizeSequence(targetSanitized);
              }}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold font-mono flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer active:scale-95"
              title="Automatically remove non-IUPAC characters and sanitize sequence"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Sanitize Sequence</span>
            </button>
          </div>
        )}
      </div>

      {/* FASTA Header Line Inspection */}
      {fastaHeader && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono flex items-center gap-2 text-slate-700">
          <span className="font-bold text-[#0284C7] shrink-0">&gt;</span>
          <span className="truncate font-medium">{fastaHeader}</span>
          <span className="ml-auto text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold shrink-0">
            FASTA Syntax Valid
          </span>
        </div>
      )}

      {/* Validation Issues / Errors Banner */}
      {!isValid && (
        <div className="space-y-2">
          {errors.map((err, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg bg-rose-50/80 border border-rose-200 text-xs font-mono text-rose-900 flex items-start gap-2.5"
            >
              <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold">{err}</span>
              </div>
            </div>
          ))}

          {warnings.map((warn, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-xs font-mono text-amber-900 flex items-start gap-2.5"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{warn}</span>
            </div>
          ))}
        </div>
      )}

      {/* Invalid Character Findings Table */}
      {invalidFindings.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-[#334155] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Non-IUPAC / Invalid Character Breakdown</span>
            </span>
            <button
              type="button"
              onClick={() => setShowPositionDetails(!showPositionDetails)}
              className="text-[11px] font-mono text-[#0284C7] hover:underline cursor-pointer"
            >
              {showPositionDetails ? 'Hide Positions' : 'Show 1-Based Positions'}
            </button>
          </div>

          <div className="overflow-x-auto border border-[#E2E8F0] rounded-lg">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B]">
                <tr>
                  <th className="p-2.5 font-semibold">Character</th>
                  <th className="p-2.5 font-semibold">Category</th>
                  <th className="p-2.5 font-semibold">Count</th>
                  <th className="p-2.5 font-semibold">Description</th>
                  {showPositionDetails && <th className="p-2.5 font-semibold">Positions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {invalidFindings.map((f, idx) => (
                  <tr key={idx} className="hover:bg-amber-50/40">
                    <td className="p-2.5 font-bold text-rose-700 font-mono">
                      <span className="px-1.5 py-0.5 bg-rose-100 border border-rose-300 rounded">
                        '{f.char}'
                      </span>
                    </td>
                    <td className="p-2.5 text-[#334155] font-semibold">{f.categoryLabel}</td>
                    <td className="p-2.5 font-bold text-amber-800">{f.count}×</td>
                    <td className="p-2.5 text-[#475569]">{f.description}</td>
                    {showPositionDetails && (
                      <td className="p-2.5 text-slate-600 truncate max-w-xs font-mono text-[11px]">
                        {f.positions.slice(0, 15).join(', ')}
                        {f.positions.length > 15 ? '...' : ''}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Valid Sequence State Banner */}
      {isValid && (
        <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-lg text-xs font-mono text-emerald-900 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Pristine IUPAC FASTA Sequence: All {sequence.length.toLocaleString()} residues conform to standard {sequenceType} alphabet specifications.
          </span>
        </div>
      )}
    </div>
  );
};
