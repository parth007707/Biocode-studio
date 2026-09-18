import React, { useState, useEffect } from 'react';
import { SequenceType, GCAndORFAnalysisResult } from '../../../lib/bio/types';
import { RNASecondaryStructureResult, predictRNASecondaryStructure } from '../../../lib/bio/rnaAnalysis';
import { AminoAcidComposition, analyzeProteinSequence } from '../../../lib/bio/proteinAnalysis';
import { DNAViewer } from './DNAViewer';
import { RNAViewer } from './RNAViewer';
import { ProteinViewer } from './ProteinViewer';
import { Scientific3DStructureViewer } from '../structure3d/Scientific3DStructureViewer';
import { StructureStudioModal } from '../structure3d/StructureStudioModal';
import { resolveMacromolecularStructure } from '../../../lib/bio/structure3d/structureResolver';
import { ResolvedStructure3D } from '../../../lib/bio/structure3d/types';
import { AlertCircle, Sliders, ChevronLeft, ChevronRight, Sparkles, Layers, Zap, Maximize2, RefreshCw } from 'lucide-react';
import { SequenceMutation } from '../../../lib/bio/editor/types';

interface SequenceStructureViewerProps {
  sequence: string;
  sequenceType: SequenceType;
  dnaAnalysis?: GCAndORFAnalysisResult | null;
  rnaAnalysis?: RNASecondaryStructureResult | null;
  proteinAnalysis?: AminoAcidComposition | null;
  totalRecordLength?: number;
  mutations?: SequenceMutation[];
  accessionOrPdbId?: string;
  originalSequence?: string;
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
  className = ''
}) => {
  const fullLength = sequence.length;
  const effectiveTotal = totalRecordLength || fullLength;
  const isLarge = fullLength > 120;

  // Viewport mode: 'scientific_engine' (3D Resolution Model) or 'classic_viewer'
  const [engineMode, setEngineMode] = useState<'scientific_engine' | 'classic_viewer'>('scientific_engine');
  const [isStudioModalOpen, setIsStudioModalOpen] = useState<boolean>(false);
  const [resolvedStructure, setResolvedStructure] = useState<ResolvedStructure3D | null>(null);
  const [isResolving, setIsResolving] = useState<boolean>(false);

  // Window selection state for 3D level-of-detail viewport
  const DEFAULT_WINDOW_SIZE = 120;
  const [windowStart, setWindowStart] = useState<number>(0); // 0-based
  const [windowSize, setWindowSize] = useState<number>(Math.min(DEFAULT_WINDOW_SIZE, fullLength || DEFAULT_WINDOW_SIZE));

  // Extract the active window slice for the 3D WebGL renderer
  const safeStart = Math.max(0, Math.min(windowStart, Math.max(0, fullLength - windowSize)));
  const safeEnd = Math.min(safeStart + windowSize, fullLength);
  const activeWindowSequence = sequence.slice(safeStart, safeEnd) || sequence.slice(0, DEFAULT_WINDOW_SIZE);

  // Resolve 3D macromolecular structure whenever active window or sequence changes
  useEffect(() => {
    let isMounted = true;
    const resolve = async () => {
      if (!activeWindowSequence || activeWindowSequence.length < 3) return;
      setIsResolving(true);
      try {
        const res = await resolveMacromolecularStructure({
          sequence: activeWindowSequence,
          sequenceType,
          accessionOrPdbId,
          mutations,
          title: `${sequenceType} 3D Resolution Viewport (${safeStart + 1}..${safeEnd} bp)`
        });
        if (isMounted) {
          setResolvedStructure(res);
        }
      } catch (err) {
        console.error('[SequenceStructureViewer] Structure resolution error:', err);
      } finally {
        if (isMounted) setIsResolving(false);
      }
    };

    resolve();
    return () => {
      isMounted = false;
    };
  }, [activeWindowSequence, sequenceType, accessionOrPdbId, mutations]);

  // Jump to specific genomic / structural regions
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
    const stepSize = Math.floor(windowSize * 0.75);
    if (direction === 'prev') {
      setWindowStart((prev) => Math.max(0, prev - stepSize));
    } else {
      setWindowStart((prev) => Math.min(Math.max(0, fullLength - windowSize), prev + stepSize));
    }
  };

  return (
    <div className="space-y-3">
      {/* 3D WebGL Level-of-Detail & Rendering Window Navigation Bar */}
      <div className="bg-[#111622] border border-slate-800 rounded-xl p-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs font-mono">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode Switcher */}
          <div className="flex items-center bg-[#07090D] border border-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setEngineMode('scientific_engine')}
              className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                engineMode === 'scientific_engine'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-purple-200" />
              <span>Scientific 3D Engine</span>
            </button>
            <button
              type="button"
              onClick={() => setEngineMode('classic_viewer')}
              className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold transition-all cursor-pointer ${
                engineMode === 'classic_viewer'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Classic Model</span>
            </button>
          </div>

          {isLarge && (
            <span className="text-slate-400 text-[11px] hidden sm:inline">
              Viewport: <strong className="text-slate-200">{safeStart + 1}</strong>..
              <strong className="text-slate-200">{safeEnd}</strong> bp ({safeEnd - safeStart} bp)
            </span>
          )}
        </div>

        {/* Quick Locality Jump Buttons & Studio Opener */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto flex-wrap">
          {isLarge && (
            <>
              <button
                type="button"
                onClick={() => handleStep('prev')}
                disabled={safeStart === 0}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 transition-colors cursor-pointer"
                title="Shift Window Left"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => handleJump('start')}
                className={`px-2 py-0.5 rounded text-[10px] font-sans transition-colors cursor-pointer ${
                  safeStart === 0 ? 'bg-emerald-600 text-white font-medium' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                5' Head
              </button>

              <button
                type="button"
                onClick={() => handleJump('center')}
                className="px-2 py-0.5 rounded text-[10px] font-sans bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                Center
              </button>

              {dnaAnalysis?.longestOrf && (
                <button
                  type="button"
                  onClick={() => handleJump('longestOrf')}
                  className="px-2 py-0.5 rounded text-[10px] font-sans bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30 transition-colors cursor-pointer"
                  title={`Jump to Longest ORF (bp ${dnaAnalysis.longestOrf.start}..${dnaAnalysis.longestOrf.end})`}
                >
                  ORF-1
                </button>
              )}

              <button
                type="button"
                onClick={() => handleJump('end')}
                className={`px-2 py-0.5 rounded text-[10px] font-sans transition-colors cursor-pointer ${
                  safeEnd === fullLength ? 'bg-emerald-600 text-white font-medium' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                3' Tail
              </button>

              <button
                type="button"
                onClick={() => handleStep('next')}
                disabled={safeEnd >= fullLength}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 transition-colors cursor-pointer"
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
            className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-sans font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Open Full 3D Structure Resolution Studio with Ramachandran validation, Superposition & RMSD"
          >
            <Maximize2 className="w-3 h-3" />
            <span>3D Studio</span>
          </button>
        </div>
      </div>

      {/* Render the specific biological structure viewer */}
      {engineMode === 'scientific_engine' ? (
        resolvedStructure ? (
          <div className="relative h-[480px]">
            <Scientific3DStructureViewer
              structure={resolvedStructure}
              className={className}
            />
          </div>
        ) : (
          <div className="w-full h-[480px] rounded-2xl border border-slate-800 bg-[#0A0E17] flex flex-col items-center justify-center text-slate-400 text-xs font-mono">
            <RefreshCw className="w-6 h-6 animate-spin text-purple-400 mb-2" />
            <span>Resolving 3D structural coordinates...</span>
          </div>
        )
      ) : (
        (() => {
          switch (sequenceType) {
            case 'DNA':
              return <DNAViewer sequence={activeWindowSequence} className={className} />;

            case 'RNA': {
              const activeRnaAnalysis = rnaAnalysis || predictRNASecondaryStructure(activeWindowSequence);
              return <RNAViewer sequence={activeWindowSequence} rnaAnalysis={activeRnaAnalysis} className={className} />;
            }

            case 'PROTEIN': {
              const activeProteinAnalysis = proteinAnalysis || (sequence.length > 0 ? analyzeProteinSequence(activeWindowSequence) : null);
              if (activeProteinAnalysis) {
                return (
                  <ProteinViewer
                    sequence={activeWindowSequence}
                    proteinAnalysis={activeProteinAnalysis}
                    structureState={activeWindowSequence.length >= 4 ? 'predicted' : 'unavailable'}
                    className={className}
                  />
                );
              }
              return (
                <div className="w-full h-[450px] rounded-2xl border border-slate-800 bg-[#0A0E17] flex items-center justify-center text-slate-400 text-xs">
                  Loading protein structural model...
                </div>
              );
            }

            default:
              return (
                <div className="w-full h-[450px] rounded-2xl border border-slate-800 bg-[#0A0E17] flex flex-col items-center justify-center p-8 text-center text-slate-400 text-xs">
                  <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
                  <p className="font-semibold text-slate-200">No 3D structural model available for unrecognized sequence</p>
                  <p className="text-slate-500 mt-1">Please enter a valid DNA, RNA, or Protein sequence.</p>
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

