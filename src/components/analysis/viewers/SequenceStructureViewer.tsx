import React, { useState } from 'react';
import { SequenceType, GCAndORFAnalysisResult } from '../../../lib/bio/types';
import { RNASecondaryStructureResult, predictRNASecondaryStructure } from '../../../lib/bio/rnaAnalysis';
import { AminoAcidComposition, analyzeProteinSequence } from '../../../lib/bio/proteinAnalysis';
import { DNAViewer } from './DNAViewer';
import { RNAViewer } from './RNAViewer';
import { ProteinViewer } from './ProteinViewer';
import { StructureExplorer } from '../structure3d/StructureExplorer';
import { StructureStudioModal } from '../structure3d/StructureStudioModal';
import { AlertCircle, ChevronLeft, ChevronRight, Sparkles, Maximize2, Layers } from 'lucide-react';
import { SequenceMutation } from '../../../lib/bio/editor/types';
import { WhatIfSimulationResult } from '../../../lib/bio/whatIfSimulator';

import { ResolvedStructure3D } from '../../../lib/bio/structure3d/types';

export interface SequenceStructureViewerProps {
  sequence: string;
  sequenceType: SequenceType;
  dnaAnalysis?: GCAndORFAnalysisResult | null;
  rnaAnalysis?: RNASecondaryStructureResult | null;
  proteinAnalysis?: AminoAcidComposition | null;
  totalRecordLength?: number;
  mutations?: SequenceMutation[];
  accessionOrPdbId?: string;
  originalSequence?: string;
  simulatedSequence?: string | null;
  simulationResult?: WhatIfSimulationResult | null;
  sequenceVersion?: string;
  onStructureResolved?: (structure: ResolvedStructure3D | null) => void;
  className?: string;
}

export const SequenceStructureViewer: React.FC<SequenceStructureViewerProps> = ({
  sequence,
  sequenceType,
  dnaAnalysis,
  rnaAnalysis,
  proteinAnalysis,
  totalRecordLength,
  mutations = [],
  accessionOrPdbId,
  originalSequence,
  simulatedSequence,
  simulationResult,
  sequenceVersion = 'v1',
  onStructureResolved,
  className = ''
}) => {
  const fullLength = sequence.length;
  const isLarge = fullLength > 120;

  // Viewport mode: 'scientific_engine' (3D Structure Explorer) or 'classic_viewer' (Linear Diagram)
  const [engineMode, setEngineMode] = useState<'scientific_engine' | 'classic_viewer'>('scientific_engine');
  const [isStudioModalOpen, setIsStudioModalOpen] = useState<boolean>(false);

  // Region / Window selection state for Linear Diagram view on large sequences
  const DEFAULT_WINDOW_SIZE = 120;
  const [windowStart, setWindowStart] = useState<number>(0);
  const [windowSize, setWindowSize] = useState<number>(Math.min(DEFAULT_WINDOW_SIZE, fullLength || DEFAULT_WINDOW_SIZE));

  const safeStart = Math.max(0, Math.min(windowStart, Math.max(0, fullLength - windowSize)));
  const safeEnd = Math.min(safeStart + windowSize, fullLength);
  const activeWindowSequence = sequence.slice(safeStart, safeEnd) || sequence.slice(0, DEFAULT_WINDOW_SIZE);

  const handleJump = (target: 'start' | 'center' | 'end' | 'longestOrf') => {
    if (target === 'start') {
      setWindowStart(0);
    } else if (target === 'center') {
      setWindowStart(Math.max(0, Math.floor((fullLength - windowSize) / 2)));
    } else if (target === 'end') {
      setWindowStart(Math.max(0, fullLength - windowSize));
    } else if (target === 'longestOrf' && dnaAnalysis?.longestOrf) {
      const orfStart = Math.max(0, dnaAnalysis.longestOrf.start - 1);
      setWindowStart(Math.min(orfStart, Math.max(0, fullLength - windowSize)));
    }
  };

  const handleStep = (direction: 'prev' | 'next') => {
    const stepSize = Math.max(1, Math.floor(windowSize * 0.75));
    if (direction === 'prev') {
      setWindowStart((prev) => Math.max(0, prev - stepSize));
    } else {
      setWindowStart((prev) => Math.min(Math.max(0, fullLength - windowSize), prev + stepSize));
    }
  };

  return (
    <div className={`flex flex-col space-y-3 w-full ${className}`}>
      {/* 3D Mode Selector & Header Navigation Bar */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs font-mono shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode Switcher */}
          <div className="flex flex-wrap items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-0.5 max-w-full">
            <button
              type="button"
              onClick={() => setEngineMode('scientific_engine')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                engineMode === 'scientific_engine'
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-200" />
              <span>3D Structure Explorer</span>
            </button>
            <button
              type="button"
              onClick={() => setEngineMode('classic_viewer')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-semibold transition-all cursor-pointer ${
                engineMode === 'classic_viewer'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <span>Linear Diagram</span>
            </button>
          </div>

          {/* Region / Viewport Indicator when viewing Linear Diagram of Large Sequences */}
          {engineMode === 'classic_viewer' && isLarge && (
            <span className="text-slate-500 text-[11px] hidden sm:inline font-mono">
              Region: <strong className="text-[#0F172A]">{safeStart + 1}</strong>..
              <strong className="text-[#0F172A]">{safeEnd}</strong> ({safeEnd - safeStart} of {fullLength.toLocaleString()})
            </span>
          )}
        </div>

        {/* Quick Locality Jump Buttons (Linear Diagram) & Studio Opener */}
        <div className="flex items-center gap-1.5 self-stretch sm:self-auto justify-between sm:justify-end flex-wrap">
          {engineMode === 'classic_viewer' && isLarge && (
            <>
              <div className="flex items-center gap-0.5 bg-slate-50 border border-[#CBD5E1] rounded p-0.5 text-[10px]">
                {[120, 240, 500].filter(s => s <= fullLength).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setWindowSize(size);
                      setWindowStart(prev => Math.min(prev, Math.max(0, fullLength - size)));
                    }}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${
                      windowSize === size ? 'bg-white text-sky-700 font-bold shadow-2xs' : 'text-slate-600 hover:text-[#0F172A]'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleStep('prev')}
                disabled={safeStart === 0}
                className="p-1 rounded bg-white hover:bg-slate-50 border border-[#CBD5E1] disabled:opacity-30 text-slate-600 transition-colors cursor-pointer shadow-2xs"
                title="Shift Window Left"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => handleJump('start')}
                className={`px-2 py-0.5 rounded text-[10px] font-sans transition-colors cursor-pointer shadow-2xs ${
                  safeStart === 0 ? 'bg-sky-600 text-white font-medium' : 'bg-white border border-[#CBD5E1] text-slate-600 hover:text-[#0F172A]'
                }`}
              >
                5&apos; Head
              </button>

              <button
                type="button"
                onClick={() => handleJump('center')}
                className="px-2 py-0.5 rounded text-[10px] font-sans bg-white border border-[#CBD5E1] text-slate-600 hover:text-[#0F172A] transition-colors cursor-pointer shadow-2xs"
              >
                Center
              </button>

              <button
                type="button"
                onClick={() => handleJump('end')}
                className={`px-2 py-0.5 rounded text-[10px] font-sans transition-colors cursor-pointer shadow-2xs ${
                  safeEnd === fullLength ? 'bg-sky-600 text-white font-medium' : 'bg-white border border-[#CBD5E1] text-slate-600 hover:text-[#0F172A]'
                }`}
              >
                3&apos; Tail
              </button>

              {dnaAnalysis?.longestOrf && (
                <button
                  type="button"
                  onClick={() => handleJump('longestOrf')}
                  className="px-2 py-0.5 rounded text-[10px] font-sans bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer shadow-2xs"
                  title={`Jump to Longest ORF (${dnaAnalysis.longestOrf.start}..${dnaAnalysis.longestOrf.end})`}
                >
                  ORF ({dnaAnalysis.longestOrf.lengthBp} bp)
                </button>
              )}

              <button
                type="button"
                onClick={() => handleStep('next')}
                disabled={safeEnd >= fullLength}
                className="p-1 rounded bg-white hover:bg-slate-50 border border-[#CBD5E1] disabled:opacity-30 text-slate-600 transition-colors cursor-pointer shadow-2xs"
                title="Shift Window Right"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {/* Launch Full 3D Structure Resolution Studio */}
          <button
            type="button"
            onClick={() => setIsStudioModalOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-sans font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Open Full 3D Structure Resolution Studio with Ramachandran validation, Superposition & RMSD"
          >
            <Maximize2 className="w-3 h-3" />
            <span>3D Studio</span>
          </button>
        </div>
      </div>

      {/* Primary Structure Viewport */}
      {engineMode === 'scientific_engine' ? (
        <StructureExplorer
          sequence={sequence}
          sequenceType={sequenceType}
          accession={accessionOrPdbId || ''}
          sequenceVersion={sequenceVersion}
          originalSequence={originalSequence}
          simulatedSequence={simulatedSequence}
          simulationResult={simulationResult}
          mutations={mutations}
          onStructureResolved={onStructureResolved}
          className="w-full flex-1"
        />
      ) : (
        (() => {
          switch (sequenceType) {
            case 'DNA':
              return (
                <DNAViewer
                  sequence={activeWindowSequence}
                  fullSequence={sequence}
                  startPosition={safeStart + 1}
                  totalLength={fullLength}
                  className="w-full flex-1"
                />
              );

            case 'RNA': {
              const activeRnaAnalysis = rnaAnalysis || predictRNASecondaryStructure(activeWindowSequence);
              return (
                <RNAViewer
                  sequence={activeWindowSequence}
                  fullSequence={sequence}
                  startPosition={safeStart + 1}
                  totalLength={fullLength}
                  rnaAnalysis={activeRnaAnalysis}
                  className="w-full flex-1"
                />
              );
            }

            case 'PROTEIN': {
              const activeProteinAnalysis = proteinAnalysis || (sequence.length > 0 ? analyzeProteinSequence(activeWindowSequence) : null);
              if (activeProteinAnalysis) {
                return (
                  <ProteinViewer
                    sequence={activeWindowSequence}
                    fullSequence={sequence}
                    startPosition={safeStart + 1}
                    totalLength={fullLength}
                    proteinAnalysis={activeProteinAnalysis}
                    structureState={activeWindowSequence.length >= 4 ? 'predicted' : 'unavailable'}
                    className="w-full flex-1"
                    onSwitchTo3D={() => setEngineMode('scientific_engine')}
                  />
                );
              }
              return (
                <div className="w-full h-[300px] sm:h-[420px] lg:h-[480px] min-h-[280px] sm:min-h-[420px] rounded-2xl border border-[#CBD5E1] bg-[#F8FAFC] flex items-center justify-center text-[#64748B] text-xs font-mono">
                  Loading protein structural model...
                </div>
              );
            }

            default:
              return (
                <div className="w-full h-[300px] sm:h-[420px] lg:h-[480px] min-h-[280px] sm:min-h-[420px] rounded-2xl border border-[#CBD5E1] bg-[#F8FAFC] flex flex-col items-center justify-center p-6 sm:p-8 text-center text-[#64748B] text-xs">
                  <AlertCircle className="w-8 h-8 text-[#FB923C] mb-2" />
                  <p className="font-semibold text-[#0F172A]">No structural model available for unrecognized sequence</p>
                  <p className="text-[#64748B] mt-1">Please enter a valid DNA, RNA, or Protein sequence.</p>
                </div>
              );
          }
        })()
      )}

      {/* 3D Structure Resolution Studio Modal */}
      <StructureStudioModal
        isOpen={isStudioModalOpen}
        onClose={() => setIsStudioModalOpen(false)}
        sequence={sequence}
        sequenceType={sequenceType}
        accessionOrPdbId={accessionOrPdbId}
        mutations={mutations}
        originalSequence={originalSequence}
      />
    </div>
  );
};
