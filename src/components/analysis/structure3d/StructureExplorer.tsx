import React, { useState, useEffect, useMemo } from 'react';
import { 
  ResolvedStructure3D, 
  RepresentationMode, 
  ColorScheme 
} from '../../../lib/bio/structure3d/types';
import { 
  resolveMacromolecularStructure, 
  computeClientSequenceHash 
} from '../../../lib/bio/structure3d/structureResolver';
import { Scientific3DStructureViewer } from './Scientific3DStructureViewer';
import { SequenceType } from '../../../lib/bio/types';
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
  Database,
  CheckCircle2
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
  className?: string;
}

export const StructureExplorer: React.FC<StructureExplorerProps> = ({
  sequence,
  sequenceType = 'PROTEIN',
  accession = '',
  sequenceId = 'seq_active',
  sequenceVersion = 'v1',
  originalSequence,
  simulatedSequence,
  simulationResult,
  mutations = [],
  className = ''
}) => {
  const cleanSeq = useMemo(() => sequence.toUpperCase().replace(/[^A-Z]/g, ''), [sequence]);
  const displayAccession = accession || (sequenceType === 'PROTEIN' ? 'Active Target Protein' : 'Active Target Sequence');

  const [structureModel, setStructureModel] = useState<ResolvedStructure3D | null>(null);
  const [status, setStatus] = useState<'SYNCHRONIZED' | 'COMPUTING' | 'FAILED' | 'UNAVAILABLE'>('COMPUTING');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [representation, setRepresentation] = useState<RepresentationMode>('ball_and_stick');
  const [colorScheme, setColorScheme] = useState<ColorScheme>('element');
  const [resetViewTrigger, setResetViewTrigger] = useState<number>(0);
  const [centerTrigger, setCenterTrigger] = useState<number>(0);
  const [zoomInTrigger, setZoomInTrigger] = useState<number>(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState<number>(0);
  const [selectedResSeq, setSelectedResSeq] = useState<number | null>(null);

  // Resolve structure when sequence or accession changes
  useEffect(() => {
    if (!cleanSeq || cleanSeq.length < 4) {
      setStructureModel(null);
      setStatus('UNAVAILABLE');
      setErrorMessage('Sequence length insufficient (< 4 residues) for 3D structure resolution.');
      return;
    }

    setStatus('COMPUTING');
    let isCancelled = false;

    const t = setTimeout(async () => {
      try {
        const resolved = await resolveMacromolecularStructure({
          sequence: cleanSeq,
          sequenceType,
          accessionOrPdbId: accession,
          sequenceId,
          sequenceVersion: sequenceVersion || 'v1',
          sequenceHash: computeClientSequenceHash(cleanSeq),
          mutations: mutations || [],
          allowSequenceDerivedFallback: true,
          title: `3D Structure (${displayAccession})`
        });

        if (isCancelled) return;

        if (resolved.structureType === 'UNAVAILABLE') {
          setStructureModel(null);
          setStatus('UNAVAILABLE');
          setErrorMessage(resolved.confidenceInfo?.description || 'No verified 3D structure available for this sequence.');
        } else {
          setStructureModel(resolved);
          setStatus('SYNCHRONIZED');
          setErrorMessage(null);
        }
      } catch (err: any) {
        if (isCancelled) return;
        setStatus('FAILED');
        setErrorMessage(err?.message || 'Failed to resolve molecular structure coordinates.');
      }
    }, 150);

    return () => {
      isCancelled = true;
      clearTimeout(t);
    };
  }, [cleanSeq, sequenceType, accession, sequenceId, sequenceVersion, displayAccession]);

  const isExperimental = structureModel?.structureType === 'EXPERIMENTAL';
  const isPredicted = structureModel?.structureType === 'PREDICTED';
  const isUnavailable = status === 'UNAVAILABLE' || status === 'FAILED' || !structureModel || structureModel.structureType === 'UNAVAILABLE';

  const statusLabel = isUnavailable
    ? 'Unavailable'
    : isExperimental
    ? 'Experimental Structure'
    : isPredicted
    ? 'Predicted Model'
    : 'Sequence-Derived Model';

  const sourceName = isUnavailable
    ? 'None'
    : structureModel?.sourceName || (isExperimental ? 'RCSB PDB' : 'AlphaFold / Prediction Model');

  return (
    <div className={`bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs flex flex-col font-sans text-[#0F172A] ${className}`}>
      {/* Top Header: 3D Molecular Structure & Small Status Indicator + Source Provenance Label */}
      <div className="bg-white border-b border-[#E2E8F0] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                  : 'text-emerald-700 bg-emerald-50 border-emerald-200'
              }`}>
                {status === 'COMPUTING' ? (
                  <Loader2 className="w-3 h-3 animate-spin text-sky-600" />
                ) : (
                  <span className={`w-1.5 h-1.5 rounded-full ${isUnavailable ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                )}
                <span>{status === 'COMPUTING' ? 'Resolving 3D Coordinates...' : statusLabel}</span>
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono mt-0.5 text-slate-500">
              <span className="font-semibold text-[#0F172A]">{displayAccession}</span>
              <span>·</span>
              <span>{cleanSeq.length} {sequenceType === 'PROTEIN' ? 'aa' : 'bp'}</span>
              <span>·</span>
              <span className="text-sky-700 font-semibold">Source: {sourceName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main 3D Viewport / Canvas Container */}
      <div className="relative w-full h-[520px] min-h-[480px] bg-[#F8FAFC] flex items-center justify-center overflow-hidden">
        {status === 'COMPUTING' ? (
          <div className="p-8 flex flex-col items-center justify-center space-y-3 max-w-sm mx-auto text-center z-20">
            <div className="w-12 h-12 rounded-2xl bg-white border border-[#CBD5E1] flex items-center justify-center text-sky-600 shadow-sm animate-spin">
              <RefreshCw className="w-6 h-6 text-sky-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-bold font-mono text-[#0F172A] uppercase tracking-wider">
                Retrieving 3D Coordinates
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                Querying RCSB PDB &amp; AlphaFold Structure Database...
              </p>
            </div>
          </div>
        ) : isUnavailable ? (
          <div className="p-8 flex flex-col items-center justify-center space-y-4 max-w-md mx-auto text-center z-20">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold font-mono text-[#0F172A]">
                No verified 3D structure available for this sequence.
              </h3>
              <p className="text-xs text-slate-600 font-mono leading-relaxed">
                {errorMessage || 'No experimentally determined PDB coordinates or validated prediction model exist for this sequence construct.'}
              </p>
            </div>
            <div className="text-[11px] font-mono text-slate-400 bg-white border border-[#CBD5E1] rounded-xl px-3 py-2">
              Biological Integrity Policy: BioCode Studio only displays genuine verified structure coordinates.
            </div>
          </div>
        ) : (
          <div className="w-full h-full relative bg-[#F8FAFC]">
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
              className="w-full h-full min-h-[480px]"
              enableControls={false}
              key={`${structureModel.id}_viewer`}
            />

            {/* Bottom Viewport Toolbar: Representation & Color Scheme */}
            <div className="absolute bottom-3 left-3 right-3 z-20 bg-white/95 backdrop-blur-md border border-[#CBD5E1] p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono text-[#0F172A] shadow-md">
              <div className="flex items-center gap-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg p-0.5">
                {[
                  { id: 'ball_and_stick' as const, label: 'Ball & Stick' },
                  { id: 'ribbon' as const, label: 'Cartoon / Ribbon' },
                  { id: 'backbone_trace' as const, label: 'Backbone' },
                  { id: 'space_fill' as const, label: 'Space Fill' }
                ].map((m) => (
                  <button
                    key={m.id}
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
                  <option value="element">CPK Elements</option>
                  <option value="secondary_structure">Secondary Structure</option>
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
