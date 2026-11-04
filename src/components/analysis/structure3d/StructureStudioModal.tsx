import React, { useState, useEffect, useMemo } from 'react';
import {
  ResolvedStructure3D,
  StructureSuperpositionResult,
  RepresentationMode,
  ColorScheme
} from '../../../lib/bio/structure3d/types';
import {
  resolveMacromolecularStructure,
  fetchPdbFromRcsb
} from '../../../lib/bio/structure3d/structureResolver';
import { calculateStructureSuperpositionRMSD } from '../../../lib/bio/structure3d/distanceEngine';
import { Scientific3DStructureViewer } from './Scientific3DStructureViewer';
import { RamachandranPlot } from './RamachandranPlot';
import { StructureSuperpositionPanel } from './StructureSuperpositionPanel';
import { MeasurementInspector } from './MeasurementInspector';
import { SequenceMutation } from '../../../lib/bio/editor/types';
import { SequenceType } from '../../../lib/bio/types';
import {
  X,
  Sparkles,
  Layers,
  Search,
  Download,
  Activity,
  Ruler,
  FileText,
  ShieldCheck,
  RefreshCw,
  Sliders,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

interface StructureStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  sequence: string;
  sequenceType: SequenceType;
  accessionOrPdbId?: string;
  mutations?: SequenceMutation[];
  originalSequence?: string;
}

const EMPTY_MUTATIONS: SequenceMutation[] = [];

export const StructureStudioModal: React.FC<StructureStudioModalProps> = ({
  isOpen,
  onClose,
  sequence,
  sequenceType,
  accessionOrPdbId,
  mutations = EMPTY_MUTATIONS,
  originalSequence
}) => {
  const [activeTab, setActiveTab] = useState<'viewport' | 'ramachandran' | 'superposition' | 'pdb_text'>('viewport');
  const [structure, setStructure] = useState<ResolvedStructure3D | null>(null);
  const [originalStructure, setOriginalStructure] = useState<ResolvedStructure3D | null>(null);
  const [superpositionResult, setSuperpositionResult] = useState<StructureSuperpositionResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchPdbId, setSearchPdbId] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [selectedResSeq, setSelectedResSeq] = useState<number | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const mutationsKey = useMemo(() => {
    if (!mutations || mutations.length === 0) return '';
    return mutations
      .map(m => `${m.position}:${m.original}>${m.modified}:${m.operation}`)
      .join(';');
  }, [mutations]);

  // Load 3D Structure on Mount / Prop Changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const loadStructures = async () => {
      setIsLoading(true);
      try {
        const resolved = await resolveMacromolecularStructure({
          sequence,
          sequenceType,
          accessionOrPdbId,
          mutations,
          title: `BioCode 3D Resolution Model (${sequence.length} ${sequenceType === 'PROTEIN' ? 'aa' : 'bp'})`
        });

        if (!isMounted) return;
        setStructure(resolved);

        // If an original sequence exists and differs, generate original structure and compute RMSD
        if (originalSequence && originalSequence !== sequence) {
          const resolvedOrig = await resolveMacromolecularStructure({
            sequence: originalSequence,
            sequenceType,
            accessionOrPdbId,
            mutations: [],
            title: `Original V1 Reference Structure`
          });
          if (!isMounted) return;
          setOriginalStructure(resolvedOrig);
          const sup = calculateStructureSuperpositionRMSD(resolvedOrig, resolved);
          setSuperpositionResult(sup);
        }
      } catch (err) {
        console.error('[Structure Studio] Resolution error:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadStructures();

    return () => {
      isMounted = false;
    };
  }, [isOpen, sequence, sequenceType, accessionOrPdbId, mutationsKey, originalSequence]);


  if (!isOpen) return null;

  const handleFetchCustomPdb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchPdbId.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      const fetched = await fetchPdbFromRcsb(searchPdbId.trim());
      if (fetched) {
        setStructure(fetched);
        setSearchPdbId('');
      } else {
        setSearchError(`PDB entry "${searchPdbId.toUpperCase()}" not found or download timed out.`);
      }
    } catch (err: any) {
      setSearchError(err?.message || 'Error fetching PDB structure');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in font-sans">
      <div className="bg-[#0B0F17] border border-slate-800 rounded-3xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Top Header Bar */}
        <div className="bg-[#07090D] border-b border-slate-800 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white font-mono tracking-tight">
                  Scientific 3D Structure Resolution Studio
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold">
                  {structure?.source || 'PHYSICS_RESOLVED'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {structure?.title || 'Interactive 3D Macromolecular Visualizer'}
              </p>
            </div>
          </div>

          {/* Quick PDB Search Bar */}
          <form onSubmit={handleFetchCustomPdb} className="hidden md:flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Fetch PDB (e.g. 1CRN, 1BNA, 4HHB)..."
                value={searchPdbId}
                onChange={(e) => setSearchPdbId(e.target.value)}
                className="w-64 pl-9 pr-3 py-1.5 rounded-xl bg-[#161B22] border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-hidden focus:border-purple-500"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-mono font-semibold transition-colors cursor-pointer"
            >
              {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Fetch'}
            </button>
          </form>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-[#161B22] hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {searchError && (
          <div className="bg-red-500/10 border-b border-red-500/30 px-6 py-2 text-xs font-mono text-red-400 flex items-center gap-2">
            <X className="w-3.5 h-3.5" />
            <span>{searchError}</span>
          </div>
        )}

        {/* Studio Navigation Tabs */}
        <div className="bg-[#0B0F17] border-b border-slate-800/80 px-6 py-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('viewport')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'viewport'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>3D WebGL Viewport</span>
            </button>

            {structure?.ramachandranStats && (
              <button
                type="button"
                onClick={() => setActiveTab('ramachandran')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'ramachandran'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Ramachandran Φ/Ψ Plot</span>
              </button>
            )}

            {superpositionResult && (
              <button
                type="button"
                onClick={() => setActiveTab('superposition')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'superposition'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Superposition & RMSD</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('pdb_text')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'pdb_text'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>PDB Coordinates</span>
            </button>
          </div>

          {structure && (
            <div className="hidden lg:flex items-center gap-3 text-xs font-mono text-slate-400">
              <span>Residues: <strong className="text-slate-200">{structure.chains[0]?.residues.length}</strong></span>
              <span>•</span>
              <span>Atoms: <strong className="text-slate-200">{structure.allAtoms.length}</strong></span>
              {structure.resolutionAngstrom && (
                <>
                  <span>•</span>
                  <span>Res: <strong className="text-emerald-400">{structure.resolutionAngstrom} Å</strong></span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Main Content Viewport */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#07090D] flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3 text-slate-400 font-mono text-xs">
              <RefreshCw className="w-8 h-8 animate-spin text-purple-400" />
              <span>Resolving 3D structural coordinates and energy topology...</span>
            </div>
          ) : structure ? (
            <>
              {activeTab === 'viewport' && (
                <div className="flex-1 flex flex-col space-y-4">
                  <div className="flex-1 min-h-[500px]">
                    <Scientific3DStructureViewer
                      structure={structure}
                      selectedResSeq={selectedResSeq}
                      onSelectResidue={(res) => setSelectedResSeq(res)}
                      className="h-full shadow-2xl"
                    />
                  </div>

                  {/* Structural Biophysical Metrics Overview Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                    <div className="bg-[#161B22] border border-slate-800 rounded-2xl p-3 space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase">α-Helix Fraction</span>
                      <div className="text-base font-bold text-fuchsia-400">
                        {structure.secondaryStructureSummary.helixPercent}%
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {structure.secondaryStructureSummary.helixCount} helical segments
                      </span>
                    </div>

                    <div className="bg-[#161B22] border border-slate-800 rounded-2xl p-3 space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase">β-Sheet Fraction</span>
                      <div className="text-base font-bold text-amber-400">
                        {structure.secondaryStructureSummary.sheetPercent}%
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {structure.secondaryStructureSummary.sheetCount} strands
                      </span>
                    </div>

                    <div className="bg-[#161B22] border border-slate-800 rounded-2xl p-3 space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase">Mean pLDDT Score</span>
                      <div className="text-base font-bold text-blue-400">
                        {structure.pLddtAvg || 85.0} / 100
                      </div>
                      <span className="text-[10px] text-slate-400">
                        AlphaFold structural confidence
                      </span>
                    </div>

                    <div className="bg-[#161B22] border border-slate-800 rounded-2xl p-3 space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase">Bounding Diameter</span>
                      <div className="text-base font-bold text-emerald-400">
                        {(structure.boundingBox.radius * 2).toFixed(1)} Å
                      </div>
                      <span className="text-[10px] text-slate-400">
                        Macromolecular envelope
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'ramachandran' && structure.ramachandranStats && (
                <div className="flex-1 flex flex-col justify-center max-w-4xl mx-auto w-full">
                  <RamachandranPlot
                    stats={structure.ramachandranStats}
                    selectedResSeq={selectedResSeq}
                    onSelectResidue={(res) => {
                      setSelectedResSeq(res);
                      setActiveTab('viewport');
                    }}
                  />
                </div>
              )}

              {activeTab === 'superposition' && superpositionResult && (
                <div className="flex-1 flex flex-col justify-center max-w-4xl mx-auto w-full">
                  <StructureSuperpositionPanel
                    result={superpositionResult}
                    onFocusResidue={(idx) => {
                      setSelectedResSeq(idx + 1);
                      setActiveTab('viewport');
                    }}
                  />
                </div>
              )}

              {activeTab === 'pdb_text' && (
                <div className="flex-1 flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400">
                      Standard PDB Atomic Coordinate Record Format
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(structure.rawPdbText || '');
                      }}
                      className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 transition-colors cursor-pointer"
                    >
                      Copy PDB Text
                    </button>
                  </div>
                  <pre className="flex-1 max-h-[500px] overflow-auto p-4 rounded-2xl bg-[#0B0F17] border border-slate-800 text-slate-300 font-mono text-[11px] leading-tight select-text">
                    {structure.rawPdbText || 'No raw PDB record text available.'}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 font-mono text-xs">
              Unable to resolve macromolecular structural coordinates.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
