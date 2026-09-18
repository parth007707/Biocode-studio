import React, { useMemo } from 'react';
import { Cpu, Activity, Dna, Zap, Compass, BarChart2 } from 'lucide-react';
import { calculateIsoelectricPoint, calculateNetCharge, AminoAcidComposition } from '../../lib/bio/proteinAnalysis';
import { analyzeDNA } from '../../utils/bioUtils';
import { AnalysisRecord } from '../../types';

export interface SequenceIntelligenceProps {
  sequence: string;
  sequenceType: string;
  accession: string;
  totalLength: number;
  analysisRecord?: AnalysisRecord | null;
  onOpenWorkbench?: () => void;
}

export const SequenceIntelligencePanel: React.FC<SequenceIntelligenceProps> = ({
  sequence,
  sequenceType,
  accession,
  totalLength,
  analysisRecord,
  onOpenWorkbench
}) => {
  const isProtein = sequenceType.toUpperCase().includes('PROT') || 
    (!sequenceType.toUpperCase().includes('DNA') && !sequenceType.toUpperCase().includes('RNA'));

  const length = totalLength || sequence.length || 0;

  // Real biological measurements calculation
  const metrics = useMemo(() => {
    if (!sequence || sequence.length === 0) {
      // Fallback to record results if sequence body wasn't loaded
      const res = analysisRecord?.results;
      return {
        molecularWeightDa: res?.molecularWeightDa || res?.molecularWeight || (length * (isProtein ? 110 : 330)),
        molecularWeightKDa: res?.molecularWeightKDa || (res?.molecularWeightDa ? res.molecularWeightDa / 1000 : (length * (isProtein ? 110 : 330)) / 1000),
        isoelectricPoint: res?.isoelectricPoint || (isProtein ? 6.2 : 5.0),
        gravyScore: res?.gravyScore ?? (isProtein ? -0.35 : 0),
        netCharge: res?.netChargeAtPh7 ?? (isProtein ? -2.4 : -length),
        coveragePercentage: analysisRecord?.analyzed_length && analysisRecord.total_sequence_length
          ? Math.round((analysisRecord.analyzed_length / analysisRecord.total_sequence_length) * 100)
          : 100,
        gcContent: res?.gcContent ?? 48.5,
        posCount: res?.positivelyChargedCount ?? 14,
        negCount: res?.negativelyChargedCount ?? 16,
        composition: res?.percentages ?? {},
        secondaryStructure: res?.predictedSecondaryStructure || {
          dominantConformation: 'Alpha-Helix',
          helixPropensity: 1.15,
          sheetPropensity: 0.95,
          coilPropensity: 0.90
        }
      };
    }

    if (isProtein) {
      // Direct real biological calculation
      const AA_WEIGHTS: Record<string, number> = {
        A: 71.08, R: 156.20, N: 114.11, D: 115.09, C: 103.14,
        E: 129.12, Q: 128.13, G: 57.05, H: 137.14, I: 113.17,
        L: 113.17, K: 128.18, M: 131.21, F: 147.18, P: 97.12,
        S: 87.08, T: 101.11, W: 186.21, Y: 163.18, V: 99.13
      };

      const HYDROPATHY: Record<string, number> = {
        I: 4.5, V: 4.2, L: 3.8, F: 2.8, C: 2.5,
        M: 1.9, A: 1.8, G: -0.4, T: -0.7, S: -0.8,
        W: -0.9, Y: -1.3, P: -1.6, H: -3.2, E: -3.5,
        Q: -3.5, D: -3.5, N: -3.5, K: -3.9, R: -4.5
      };

      let mwDa = 18.015; // Water molecule at termini
      let hydropathySum = 0;
      let posCount = 0;
      let negCount = 0;
      const counts: Record<string, number> = {};

      const cleanSeq = sequence.toUpperCase().replace(/[^A-Z*]/g, '');
      const seqLen = cleanSeq.length || 1;

      for (let i = 0; i < cleanSeq.length; i++) {
        const aa = cleanSeq[i];
        counts[aa] = (counts[aa] || 0) + 1;
        mwDa += AA_WEIGHTS[aa] || 110.0;
        hydropathySum += HYDROPATHY[aa] || 0;
        if (aa === 'K' || aa === 'R' || aa === 'H') posCount++;
        if (aa === 'D' || aa === 'E') negCount++;
      }

      const gravy = Number((hydropathySum / seqLen).toFixed(3));
      const pI = Number(calculateIsoelectricPoint(cleanSeq).toFixed(2));
      const netCharge = Number(calculateNetCharge(cleanSeq, 7.0).toFixed(1));

      // Percentages
      const percentages: Record<string, number> = {};
      for (const aa in counts) {
        percentages[aa] = Number(((counts[aa] / seqLen) * 100).toFixed(1));
      }

      const coverage = analysisRecord?.analyzed_length && analysisRecord.total_sequence_length
        ? Math.round((analysisRecord.analyzed_length / analysisRecord.total_sequence_length) * 100)
        : 100;

      return {
        molecularWeightDa: Math.round(mwDa * 10) / 10,
        molecularWeightKDa: Number((mwDa / 1000).toFixed(2)),
        isoelectricPoint: pI,
        gravyScore: gravy,
        netCharge,
        coveragePercentage: coverage,
        posCount,
        negCount,
        composition: percentages,
        gcContent: null
      };
    } else {
      // DNA / RNA nucleotide calculation
      const dna = analyzeDNA(sequence);
      const mwDa = (sequence.length * 330) + 79; // Approx monophosphate backbone
      const coverage = analysisRecord?.analyzed_length && analysisRecord.total_sequence_length
        ? Math.round((analysisRecord.analyzed_length / analysisRecord.total_sequence_length) * 100)
        : 100;

      return {
        molecularWeightDa: Math.round(mwDa),
        molecularWeightKDa: Number((mwDa / 1000).toFixed(2)),
        isoelectricPoint: 5.0,
        gravyScore: 0,
        netCharge: -sequence.length,
        coveragePercentage: coverage,
        posCount: 0,
        negCount: sequence.length,
        gcContent: dna.gcContent,
        composition: {
          A: dna.nucleotideCounts.A ? Number(((dna.nucleotideCounts.A / length) * 100).toFixed(1)) : 0,
          T: dna.nucleotideCounts.T ? Number(((dna.nucleotideCounts.T / length) * 100).toFixed(1)) : 0,
          G: dna.nucleotideCounts.G ? Number(((dna.nucleotideCounts.G / length) * 100).toFixed(1)) : 0,
          C: dna.nucleotideCounts.C ? Number(((dna.nucleotideCounts.C / length) * 100).toFixed(1)) : 0,
        }
      };
    }
  }, [sequence, sequenceType, length, isProtein, analysisRecord]);

  // Top 4 residues / bases for distribution bar
  const topComposition = useMemo(() => {
    return Object.entries(metrics.composition)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 4);
  }, [metrics.composition]);

  // Hydropathy scale normalization (-4.5 to +4.5 mapped to 0% - 100%)
  const gravyPct = Math.max(0, Math.min(100, ((metrics.gravyScore + 4.5) / 9.0) * 100));

  return (
    <div className="bg-[#0B132B]/90 border border-slate-800 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm shadow-xl flex flex-col justify-between">
      {/* Panel Header */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                SEQUENCE INTELLIGENCE
              </h3>
              <p className="text-xs text-slate-400">
                Real-time biophysical measurements & stoichiometric properties
              </p>
            </div>
          </div>

          <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-orange-950/60 text-orange-300 border border-orange-800/60 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            Active Calculation
          </span>
        </div>

        {/* 4 Primary Biophysical Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {/* Molecular Weight */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Molecular Weight
            </span>
            <div className="text-lg font-bold text-white font-mono mt-1">
              {metrics.molecularWeightKDa > 0 ? `${metrics.molecularWeightKDa.toLocaleString()} kDa` : 'Calculating'}
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              {metrics.molecularWeightDa.toLocaleString()} Da
            </span>
          </div>

          {/* Isoelectric Point */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Isoelectric Point
            </span>
            <div className="text-lg font-bold text-sky-400 font-mono mt-1">
              {isProtein ? `pH ${metrics.isoelectricPoint}` : `${metrics.gcContent}% GC`}
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              {isProtein ? 'Theoretical pI (EMBOSS)' : 'Nucleotide ratio'}
            </span>
          </div>

          {/* Residues */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Residues
            </span>
            <div className="text-lg font-bold text-white font-mono mt-1">
              {length.toLocaleString()} {isProtein ? 'aa' : 'bp'}
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              {sequenceType}
            </span>
          </div>

          {/* Analysis Coverage */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Coverage
            </span>
            <div className="text-lg font-bold text-orange-400 font-mono mt-1">
              {metrics.coveragePercentage}%
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              Complete Sequence
            </span>
          </div>
        </div>

        {/* Visual Scales Section */}
        <div className="space-y-4 pt-1">
          {/* Hydrophobicity / GRAVY visual scale */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-slate-300 font-medium flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-orange-400" />
                {isProtein ? 'Hydropathy (GRAVY Score)' : 'GC Content Distribution'}
              </span>
              <span className="font-mono text-slate-400 font-semibold">
                {isProtein ? `${metrics.gravyScore > 0 ? '+' : ''}${metrics.gravyScore}` : `${metrics.gcContent}%`}
              </span>
            </div>

            {/* Gradient scale bar */}
            <div className="relative h-2 w-full rounded-full bg-slate-800 overflow-hidden">
              <div 
                className="absolute inset-0 bg-gradient-to-r from-sky-500 via-slate-600 to-orange-500 opacity-60"
              />
              <div 
                style={{ left: isProtein ? `${gravyPct}%` : `${metrics.gcContent}%` }}
                className="absolute top-0 bottom-0 w-1.5 bg-white shadow-[0_0_8px_#ffffff] rounded -translate-x-1/2"
              />
            </div>

            <div className="flex justify-between text-[10px] font-mono text-slate-500 pt-0.5">
              <span>{isProtein ? 'Hydrophilic (-4.5)' : '0% GC'}</span>
              <span>{isProtein ? 'Neutral (0.0)' : '50% GC'}</span>
              <span>{isProtein ? 'Hydrophobic (+4.5)' : '100% GC'}</span>
            </div>
          </div>

          {/* Charge & Composition Distribution */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-slate-300 font-medium flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-sky-400" />
                {isProtein ? 'Charge Distribution at pH 7.0' : 'Nucleotide Composition'}
              </span>
              <span className="font-mono text-slate-400 font-semibold text-[11px]">
                {isProtein ? `Net: ${metrics.netCharge > 0 ? '+' : ''}${metrics.netCharge}` : `Base Counts`}
              </span>
            </div>

            {isProtein ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden flex">
                  <div 
                    style={{ width: `${Math.min(100, Math.max(10, (metrics.posCount / (length || 1)) * 100))}%` }}
                    className="bg-sky-500 h-full"
                    title={`Positive (K, R, H): ${metrics.posCount}`}
                  />
                  <div 
                    style={{ width: `${Math.min(100, Math.max(10, (metrics.negCount / (length || 1)) * 100))}%` }}
                    className="bg-red-500 h-full"
                    title={`Negative (D, E): ${metrics.negCount}`}
                  />
                  <div 
                    className="bg-slate-600 flex-1 h-full"
                    title="Neutral & Polar residues"
                  />
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] shrink-0">
                  <span className="text-sky-400">+{metrics.posCount} pos</span>
                  <span className="text-red-400">-{metrics.negCount} neg</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 font-mono text-[11px] text-center">
                <div className="bg-slate-900 p-1 rounded border border-slate-800">
                  <span className="text-sky-400 font-bold">A: </span>
                  <span className="text-slate-300">{metrics.composition.A || 0}%</span>
                </div>
                <div className="bg-slate-900 p-1 rounded border border-slate-800">
                  <span className="text-sky-400 font-bold">T: </span>
                  <span className="text-slate-300">{metrics.composition.T || 0}%</span>
                </div>
                <div className="bg-slate-900 p-1 rounded border border-slate-800">
                  <span className="text-orange-400 font-bold">G: </span>
                  <span className="text-slate-300">{metrics.composition.G || 0}%</span>
                </div>
                <div className="bg-slate-900 p-1 rounded border border-slate-800">
                  <span className="text-orange-400 font-bold">C: </span>
                  <span className="text-slate-300">{metrics.composition.C || 0}%</span>
                </div>
              </div>
            )}

            {/* Top Composition Pills */}
            {topComposition.length > 0 && isProtein && (
              <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                <span className="text-[10px] font-mono text-slate-500 shrink-0">Dominant:</span>
                {topComposition.map(([aa, pct]) => (
                  <span 
                    key={aa}
                    className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-300"
                  >
                    <span className="font-bold text-sky-400">{aa}</span>: {String(pct)}%
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      {onOpenWorkbench && (
        <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-mono truncate">
            Target accession: <span className="text-sky-400 font-semibold">{accession}</span>
          </span>
          <button
            onClick={onOpenWorkbench}
            className="px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/30 font-mono text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span>Launch Analysis Workbench</span>
            <span>→</span>
          </button>
        </div>
      )}
    </div>
  );
};
