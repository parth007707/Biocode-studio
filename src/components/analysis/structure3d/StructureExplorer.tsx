import React, { useState, useEffect, useMemo } from 'react';
import {
  ResolvedStructure3D,
  RepresentationMode,
  ColorScheme
} from '../../../lib/bio/structure3d/types';
import {
  resolveMacromolecularStructure,
  runOnDemandStructurePrediction,
  computeClientSequenceHash
} from '../../../lib/bio/structure3d/structureResolver';
import { Scientific3DStructureViewer } from './Scientific3DStructureViewer';
import { SequenceType } from '../../../lib/bio/types';
import { parseBiologicalInput } from '../../../lib/bio/sequenceParser';
import { SequenceMutation } from '../../../lib/bio/editor/types';
import { WhatIfSimulationResult } from '../../../lib/bio/whatIfSimulator';
import {
  Box,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Crosshair,
  RotateCcw,
  Sparkles
} from 'lucide-react';

export interface StructureExplorerProps {
  sequence: string;
  sequenceType?: SequenceType;
  accession?: string;
  sequenceId?: string;
  sequenceVersion?: string;
  originalSequence?: string;
  simulatedSequence?: string | null;
  simulationResult?: WhatIfSimulationResult | null;
  mutations?: SequenceMutation[];
  onOpenAiWithContext?: (context: any) => void;
  onStructureResolved?: (structure: ResolvedStructure3D | null) => void;
  className?: string;
}

export const StructureExplorer: React.FC<StructureExplorerProps> = ({
  sequence,
  sequenceType = 'PROTEIN',
  accession = '',
  sequenceId = 'seq_active',
  sequenceVersion = 'v1',
  originalSequence,
  mutations = [],
  onStructureResolved,
  className = ''
}) => {
  const parsedInput = useMemo(() => parseBiologicalInput(sequence), [sequence]);
  const cleanSeq = useMemo(() => parsedInput.sequence.replace(/[^A-Z]/g, ''), [parsedInput]);
  const effectiveAccession = useMemo(() => {
    if (accession && accession.trim()) return accession.trim();
    const hdr = parsedInput.header || '';
    const sp = hdr.match(/\b(?:sp|tr)\|([A-Z0-9]{6,10})\|/i);
    if (sp) return sp[1].toUpperCase();
    const ncbi = hdr.match(/\b((?:NM|NP|XM|XP|NR|XR|NC|WP|YP|AP)_[0-9]+(?:\.[0-9]+)?)\b/i);
    if (ncbi) return ncbi[1].toUpperCase();
    return '';
  }, [accession, parsedInput.header]);
  const displayAccession = effectiveAccession || (sequenceType === 'PROTEIN' ? 'Active Target Protein' : 'Active Target Sequence');

  const [structureModel, setStructureModel] = useState<ResolvedStructure3D | null>(null);
  const [unavailableMeta, setUnavailableMeta] = useState<ResolvedStructure3D | null>(null);
  const [status, setStatus] = useState<'SYNCHRONIZED' | 'COMPUTING' | 'FAILED' | 'UNAVAILABLE'>('COMPUTING');
  const [progressText, setProgressText] = useState<string>('Querying RCSB PDB, AlphaFold DB & UniProt...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [isPredicting, setIsPredicting] = useState<boolean>(false);

  const [representation, setRepresentation] = useState<RepresentationMode>('ribbon');
  const [colorScheme, setColorScheme] = useState<ColorScheme>('secondary_structure');
  const [resetViewTrigger, setResetViewTrigger] = useState<number>(0);
  const [centerTrigger, setCenterTrigger] = useState<number>(0);
  const [zoomInTrigger, setZoomInTrigger] = useState<number>(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState<number>(0);
  const [selectedResSeq, setSelectedResSeq] = useState<number | null>(null);

  const mutationsKey = useMemo(
    () => (mutations || []).map((m) => `${m.position}:${m.original}>${m.modified}:${m.operation}`).join(';'),
    [mutations]
  );

  // Reset selected candidate whenever sequence or accession fundamentally changes
  useEffect(() => {
    setSelectedCandidateId('');
  }, [cleanSeq, accession, sequenceType]);

  // Resolve real macromolecular coordinates from RCSB PDB / AlphaFold DB / UniProt / NCBI CDS
  useEffect(() => {
    if (!cleanSeq || cleanSeq.length < 4) {
      setStructureModel(null);
      setUnavailableMeta(null);
      setStatus('UNAVAILABLE');
      setErrorMessage('Sequence length insufficient (< 4 residues) for 3D structure resolution.');
      onStructureResolved?.(null);
      return;
    }

    setStatus('COMPUTING');
    let isCancelled = false;

    const t = setTimeout(async () => {
      try {
        const resolved = await resolveMacromolecularStructure({
          sequence: parsedInput.header ? `>${parsedInput.header}\n${cleanSeq}` : cleanSeq,
          sequenceType,
          accessionOrPdbId: effectiveAccession,
          preferredPdbId: selectedCandidateId || undefined,
          sequenceId,
          sequenceVersion: sequenceVersion || 'v1',
          sequenceHash: computeClientSequenceHash(cleanSeq),
          originalSequence,
          mutations: mutations || [],
          allowSequenceDerivedFallback: false,
          onProgress: (msg) => {
            if (!isCancelled) setProgressText(msg);
          },
          title: `3D Structure (${displayAccession})`
        });

        if (isCancelled) return;

        if (resolved.structureType === 'UNAVAILABLE' || (resolved.allAtoms?.length ?? 0) === 0) {
          setStructureModel(null);
          setUnavailableMeta(resolved);
          setStatus('UNAVAILABLE');
          setErrorMessage(resolved.confidenceInfo?.description || 'No verified structure available for this sequence.');
          onStructureResolved?.(resolved);
        } else {
          setStructureModel(resolved);
          setUnavailableMeta(null);
          setStatus('SYNCHRONIZED');
          setErrorMessage(null);
          onStructureResolved?.(resolved);
        }
      } catch (err: any) {
        if (isCancelled) return;
        setStructureModel(null);
        setStatus('FAILED');
        setErrorMessage(err?.message || 'Failed to retrieve molecular structure coordinates.');
        onStructureResolved?.(null);
      }
    }, 120);

    return () => {
      isCancelled = true;
      clearTimeout(t);
    };
  }, [cleanSeq, parsedInput.header, sequenceType, effectiveAccession, selectedCandidateId, sequenceId, sequenceVersion, originalSequence, mutationsKey, displayAccession]);

  const handleRunPrediction = async () => {
    setIsPredicting(true);
    setStatus('COMPUTING');
    setProgressText('Submitting genuine ESMFold v1 prediction job...');
    try {
      const predicted = await runOnDemandStructurePrediction({
        sequence: cleanSeq,
        sequenceType,
        accessionOrPdbId: effectiveAccession,
        sequenceId,
        sequenceVersion,
        mutations,
        onProgress: (msg) => setProgressText(msg)
      });
      if (predicted.structureType !== 'UNAVAILABLE' && (predicted.allAtoms?.length ?? 0) > 0) {
        setStructureModel(predicted);
        setUnavailableMeta(null);
        setStatus('SYNCHRONIZED');
        setErrorMessage(null);
        onStructureResolved?.(predicted);
      } else {
        setStatus('UNAVAILABLE');
        setErrorMessage('Structure prediction did not return valid coordinates.');
      }
    } catch (err: any) {
      setStatus('UNAVAILABLE');
      setErrorMessage(err?.message || 'On-demand prediction failed.');
    } finally {
      setIsPredicting(false);
    }
  };

  const isUnavailable = status === 'UNAVAILABLE' || status === 'FAILED' || !structureModel || structureModel.structureType === 'UNAVAILABLE';
  const isPredicted = structureModel?.classification === 'Predicted' || structureModel?.structureType === 'PREDICTED';
  const isPartial = Boolean(structureModel?.coverageInfo?.isPartial);

  const statusLabel = isUnavailable
    ? 'No Verified Structure'
    : isPredicted
    ? 'Predicted Structure'
    : isPartial
    ? 'Partial Experimental Structure'
    : 'Experimental Structure';

  const sourceLabel = isUnavailable
    ? 'None'
    : `${structureModel?.sourceName || 'RCSB PDB'}${structureModel?.sourceId ? ` · ${structureModel.sourceId}` : ''}`;

  const cov = structureModel?.coverageInfo;
  const matchedChain = structureModel?.matchedChainId || cov?.chain;
  const seqIdentity = structureModel?.sequenceIdentity ?? cov?.sequenceIdentity;
  const missingRegions = structureModel?.missingRegions || cov?.unresolvedRegions || [];
  const candidates = structureModel?.candidateStructures || [];
  const parsedAtoms = structureModel?.parsedAtomCount ?? structureModel?.allAtoms?.length ?? 0;
  const parsedResidues = structureModel?.parsedResiduesCount ?? (structureModel?.chains?.reduce((s, c) => s + c.residues.length, 0) ?? 0);

  return (
    <div className={`bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs flex flex-col font-sans text-[#0F172A] ${className}`}>
      {/* Header: Status + Source Provenance + Optional Candidate Switcher */}
      <div className="bg-white border-b border-[#E2E8F0] px-3.5 sm:px-5 py-3 sm:py-3.5 flex flex-col gap-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shadow-2xs shrink-0">
              <Box className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold font-mono tracking-tight text-[#0F172A]">
                  3D Molecular Structure Explorer
                </h2>
                <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border font-bold flex items-center gap-1.5 ${
                  status === 'COMPUTING'
                    ? 'text-sky-800 bg-sky-50 border-sky-300'
                    : isUnavailable
                    ? 'text-slate-700 bg-slate-100 border-slate-300'
                    : isPredicted
                    ? 'text-sky-800 bg-sky-50 border-sky-200'
                    : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                }`}>
                  {status === 'COMPUTING' ? (
                    <Loader2 className="w-3 h-3 animate-spin text-sky-600" />
                  ) : (
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isUnavailable ? 'bg-slate-400' : isPredicted ? 'bg-sky-500' : 'bg-emerald-500'
                    }`} />
                  )}
                  <span>{status === 'COMPUTING' ? 'Retrieving Coordinates...' : statusLabel}</span>
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono mt-0.5 text-slate-500 flex-wrap">
                <span className="font-semibold text-[#0F172A]">{displayAccession}</span>
                <span>·</span>
                <span>{cleanSeq.length.toLocaleString()} {sequenceType === 'PROTEIN' ? 'aa' : 'nt'}</span>
                <span>·</span>
                <span className="text-sky-700 font-semibold">Source: {sourceLabel}</span>
              </div>
            </div>
          </div>

          {/* Verified Candidate Structure Selector (e.g. 1TUP / 1YCR / AF-P04637-F1) */}
          {!isUnavailable && candidates.length > 1 && (
            <div className="flex items-center gap-1.5 self-start sm:self-center">
              <span className="text-[11px] font-mono text-slate-500">Entry:</span>
              <select
                value={selectedCandidateId || structureModel?.sourceId || ''}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
                className="bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] text-xs font-mono rounded-lg px-2 py-1 focus:outline-none focus:border-sky-500 cursor-pointer"
                aria-label="Select verified structure entry"
              >
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} ({c.source === 'AlphaFold DB' ? 'AlphaFold Predicted' : `${c.classification}${c.resolution ? `, ${c.resolution}` : ''}`})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Scientific Coverage, Chain, Identity & Missing Residues Strip */}
        {!isUnavailable && status === 'SYNCHRONIZED' && structureModel && (
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-600">
            <span>
              <strong className="text-slate-800">ID:</strong> {structureModel.sourceId || 'N/A'}
            </span>
            <span>
              <strong className="text-slate-800">Class:</strong> {structureModel.classification || (isPredicted ? 'Predicted' : 'Experimental')}
              {structureModel.resolutionText ? ` (${structureModel.resolutionText})` : ''}
            </span>
            {matchedChain && (
              <span>
                <strong className="text-slate-800">Chain:</strong> {matchedChain}
              </span>
            )}
            {seqIdentity !== undefined && (
              <span>
                <strong className="text-slate-800">Identity:</strong> {seqIdentity.toFixed(1)}%
              </span>
            )}
            {cov && (
              <span>
                <strong className="text-slate-800">Coverage:</strong> {cov.coveredResiduesCount} / {cov.totalSequenceLength} ({cov.coveragePercent.toFixed(1)}%)
              </span>
            )}
            <span>
              <strong className="text-slate-800">Coords:</strong> {parsedAtoms.toLocaleString()} atoms · {parsedResidues} residues ({structureModel.structureFormat || 'PDB'})
            </span>
            {missingRegions.length > 0 && (
              <div className="w-full text-[11px] text-amber-800 bg-amber-50/70 border border-amber-200/80 rounded-lg px-2.5 py-1 mt-1">
                <strong>Missing / Unmodeled Residues:</strong> {missingRegions.join('; ')}
              </div>
            )}
            {structureModel.translatedFromNucleotide && (
              <div className="w-full text-[11px] text-sky-800 bg-sky-50/70 border border-sky-200/80 rounded-lg px-2.5 py-1 mt-1">
                <strong>CDS Translation Mapping:</strong> Encoded polypeptide resolved from annotated coding region
                {structureModel.ncbiProteinAccession ? ` (${structureModel.ncbiProteinAccession})` : ''}
                {structureModel.uniprotAccession ? ` · UniProt ${structureModel.uniprotAccession}` : ''}.
              </div>
            )}
            {structureModel.modificationRelation?.note && (
              <div className="w-full text-[11px] text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1 mt-1">
                <strong>Sequence Comparison:</strong> {structureModel.modificationRelation.note}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Three.js 3D Viewport */}
      <div className="relative w-full min-h-[320px] sm:h-[440px] lg:h-[520px] sm:min-h-[420px] bg-[#F8FAFC] flex items-center justify-center overflow-hidden">
        {status === 'COMPUTING' ? (
          <div className="p-6 sm:p-8 flex flex-col items-center justify-center space-y-3 max-w-sm mx-auto text-center z-20">
            <div className="w-12 h-12 rounded-2xl bg-white border border-[#CBD5E1] flex items-center justify-center text-sky-600 shadow-sm animate-spin">
              <RefreshCw className="w-6 h-6 text-sky-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-bold font-mono text-[#0F172A] uppercase tracking-wider">
                Retrieving 3D Coordinates
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">{progressText}</p>
            </div>
          </div>
        ) : isUnavailable ? (
          <div className="p-5 sm:p-8 flex flex-col items-center justify-center space-y-4 max-w-md mx-auto text-center z-20">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold font-mono text-[#0F172A]">
                No verified structure available
              </h3>
              <p className="text-xs text-slate-600 font-mono leading-relaxed">
                {errorMessage || 'No matching experimentally determined PDB structure or AlphaFold DB model is available for this sequence.'}
              </p>
            </div>

            {unavailableMeta?.predictionAvailable && (
              <button
                type="button"
                disabled={isPredicting}
                onClick={handleRunPrediction}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-mono font-semibold shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                {isPredicting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>Predict 3D Coordinates via ESMFold v1</span>
              </button>
            )}

            <div className="text-[11px] font-mono text-slate-500 bg-white border border-[#CBD5E1] rounded-xl px-3 py-2">
              {unavailableMeta?.predictionReason || 'Artificial coordinates and synthetic helices are disabled.'}
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col sm:block relative bg-[#F8FAFC]">
            {/* Top Right Floating Viewport Controls */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-lg border border-[#CBD5E1] text-slate-700 shadow-md">
              <button
                type="button"
                onClick={() => setZoomInTrigger((p) => p + 1)}
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomOutTrigger((p) => p + 1)}
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCenterTrigger((p) => p + 1)}
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
                title="Center Model in Viewport"
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setResetViewTrigger((p) => p + 1)}
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
                title="Reset Camera View to Default"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <Scientific3DStructureViewer
              structure={structureModel}
              representation={representation}
              colorScheme={colorScheme}
              onSelectResidue={(seq) => setSelectedResSeq(seq)}
              selectedResSeq={selectedResSeq}
              resetTrigger={resetViewTrigger}
              centerTrigger={centerTrigger}
              zoomInTrigger={zoomInTrigger}
              zoomOutTrigger={zoomOutTrigger}
              backgroundColor={0xf8fafc}
              className="w-full flex-1 sm:h-full min-h-[260px] sm:min-h-[420px] lg:min-h-[480px]"
              enableControls={false}
              key={`${structureModel.id}_three_viewer`}
            />

            {/* Bottom Viewport Toolbar: Representation & Color Scheme */}
            <div className="sm:absolute sm:bottom-3 sm:left-3 sm:right-3 z-20 m-2 sm:m-0 bg-white/95 backdrop-blur-md border border-[#CBD5E1] p-2 sm:p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#0F172A] shadow-md">
              <div className="flex flex-wrap items-center gap-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg p-0.5 max-w-full">
                {[
                  { id: 'ribbon' as const, label: 'Cartoon / Ribbon' },
                  { id: 'ball_and_stick' as const, label: 'Ball & Stick' },
                  { id: 'backbone_trace' as const, label: 'Backbone' },
                  { id: 'space_fill' as const, label: 'Space Fill' }
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setRepresentation(m.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      representation === m.id
                        ? 'bg-sky-600 text-white shadow-2xs font-bold'
                        : 'text-slate-700 hover:text-[#0F172A]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 text-[11px] hidden sm:inline">Coloring:</span>
                <select
                  value={colorScheme}
                  onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
                  className="bg-white border border-[#CBD5E1] text-[#0F172A] text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-sky-500 cursor-pointer shadow-2xs"
                >
                  <option value="secondary_structure">Secondary Structure</option>
                  <option value="chain">Chain ID</option>
                  <option value="residue">Residue / Base Type</option>
                  <option value="element">CPK Elements</option>
                  <option value="hydrophobicity">Hydrophobicity</option>
                  <option value="plddt_bfactor">B-Factor / pLDDT</option>
                  <option value="electrostatics">Electrostatics</option>
                  <option value="rainbow_spectrum">Rainbow (N → C)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
