import React, { useState, useEffect, useRef } from 'react';
import { formatOrganism } from '../../../types';
import { 
  DatabaseCategory,
  DatabaseSourceId,
  DatabaseSourceMeta, 
  DatabaseSearchResult,
  SequenceSourceMetadata
} from '../../../services/adapters/types';
import { 
  ncbiAdapter, 
  blastAdapter, 
  uniprotAdapter, 
  pdbAdapter 
} from '../../../services/adapters';
import { 
  DATABASE_CATEGORIES, 
  DATABASE_SOURCES 
} from './databaseRegistry';
import { 
  Search, 
  ExternalLink, 
  ArrowRight, 
  Dna, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Layers, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Info, 
  Database, 
  BookOpen, 
  Filter, 
  RefreshCw,
  X,
  Sliders,
  FileUp,
  ChevronRight
} from 'lucide-react';
import { LargeSequenceModal } from './LargeSequenceModal';
import { FullSequenceProgressModal } from './FullSequenceProgressModal';
import { processFullBiologicalRecord, ChunkedProgressReport } from '../../../lib/bio/chunkedSequenceProcessor';
import { parseAndValidateFasta } from '../../../lib/bio/sequenceParser';
import { sequenceLoader } from '../../../services/bio/sequenceLoader';

interface DatabaseSourceViewProps {
  source: DatabaseSourceMeta;
  selectedCategory?: DatabaseCategory;
  onSelectCategory?: (category: DatabaseCategory) => void;
  onSelectSource?: (sourceId: DatabaseSourceId) => void;
  initialQuery?: string;
  onChangeSource?: () => void;
  onOpenWorkbenchWithSequence: (sequenceFasta: string, metaOrId?: string | SequenceSourceMetadata) => void;
  onOpenFastaImport?: () => void;
  onOpenCustomWorkbench?: () => void;
}

export const DatabaseSourceView: React.FC<DatabaseSourceViewProps> = ({
  source,
  selectedCategory,
  onSelectCategory,
  onSelectSource,
  initialQuery = '',
  onChangeSource,
  onOpenWorkbenchWithSequence,
  onOpenFastaImport,
  onOpenCustomWorkbench
}) => {
  // Search query & secondary filters state
  const [searchTerm, setSearchTerm] = useState<string>(initialQuery);
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  
  // Floating dropdown menus state
  const [isSourceDropdownOpen, setIsSourceDropdownOpen] = useState<boolean>(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState<boolean>(false);
  const [isSourceInfoOpen, setIsSourceInfoOpen] = useState<boolean>(false);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState<boolean>(false);
  const [isExamplesOpen, setIsExamplesOpen] = useState<boolean>(false);

  // Search execution state
  const [searchResult, setSearchResult] = useState<DatabaseSearchResult | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [isFetchingFasta, setIsFetchingFasta] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Full Sequence Progress Modal state
  const [isProcessingCompleteRecord, setIsProcessingCompleteRecord] = useState<boolean>(false);
  const [progressData, setProgressData] = useState<ChunkedProgressReport | null>(null);
  const [processingRecordMeta, setProcessingRecordMeta] = useState<{
    accession: string;
    title: string;
    organism?: string;
    sourceDb?: string;
    category?: string;
    totalLength?: number;
  } | null>(null);

  // Large Sequence Modal state (for Select Region)
  const [largeSequenceRecord, setLargeSequenceRecord] = useState<{
    uid?: string;
    accession: string;
    title: string;
    organism?: string;
    sequenceType?: string;
    totalLength?: number;
    sourceDb?: string;
    category?: string;
  } | null>(null);

  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const sourceDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const examplesDropdownRef = useRef<HTMLDivElement>(null);

  // Close floating dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sourceDropdownRef.current && !sourceDropdownRef.current.contains(event.target as Node)) {
        setIsSourceDropdownOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
      if (examplesDropdownRef.current && !examplesDropdownRef.current.contains(event.target as Node)) {
        setIsExamplesOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialize filter defaults whenever source changes
  useEffect(() => {
    const defaults: Record<string, any> = {};
    source.queryFields.forEach((field) => {
      if (field.name !== 'term' && field.name !== 'query' && field.name !== 'sequence') {
        defaults[field.name] = field.defaultValue !== undefined ? field.defaultValue : '';
      }
    });
    setFilterValues(defaults);
    setSearchTerm(initialQuery);
    setSearchResult(null);
    setErrorMessage(null);
    setIsSourceInfoOpen(false);
    setIsAdvancedFiltersOpen(false);
    setIsExamplesOpen(false);
    setIsSourceDropdownOpen(false);
    setIsCategoryDropdownOpen(false);
    setLargeSequenceRecord(null);
    setIsProcessingCompleteRecord(false);

    return () => {
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
      if (streamAbortControllerRef.current) {
        streamAbortControllerRef.current.abort();
      }
    };
  }, [source.id, initialQuery]);

  const handleFilterChange = (fieldName: string, value: any) => {
    setFilterValues((prev) => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const handleApplySampleQuery = (query: string) => {
    setSearchTerm(query);
    setIsExamplesOpen(false);
    executeSearchWithTerm(query);
  };

  const executeSearchWithTerm = async (queryTerm: string) => {
    if (!queryTerm.trim()) {
      setErrorMessage('Please enter a sequence, gene, accession ID, or search term.');
      return;
    }

    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortControllerRef.current = controller;

    setErrorMessage(null);
    setIsExecuting(true);

    try {
      let result: DatabaseSearchResult;

      if (source.category === 'NCBI') {
        const db = ncbiAdapter.getDbFromSourceId(source.id);
        result = await ncbiAdapter.search({
          db,
          term: queryTerm,
          retmax: 20,
          sort: filterValues.sort,
          organismFilter: filterValues.organism,
          signal: controller.signal
        });
      } else if (source.category === 'BLAST') {
        const isProtein = source.id === 'blast-protein';
        const program = isProtein ? 'blastp' : 'blastn';
        const database = isProtein ? (filterValues.database || 'nr') : (filterValues.database || 'nt');

        result = await blastAdapter.search({
          program,
          database,
          sequence: queryTerm,
          expectThreshold: filterValues.expect ? parseFloat(filterValues.expect) : 10
        });
      } else if (source.category === 'UniProt') {
        result = await uniprotAdapter.search({
          query: queryTerm,
          size: 20,
          reviewedOnly: filterValues.reviewedOnly,
          organism: filterValues.organism
        });
      } else if (source.category === 'RCSB_PDB') {
        let macromoleculeType: 'dna' | 'rna' | 'protein' | 'all' = 'all';
        if (source.id === 'pdb-dna') macromoleculeType = 'dna';
        else if (source.id === 'pdb-rna') macromoleculeType = 'rna';
        else if (source.id === 'pdb-protein') macromoleculeType = 'protein';

        result = await pdbAdapter.search({
          query: queryTerm,
          macromoleculeType,
          maxResolution: filterValues.maxResolution ? parseFloat(filterValues.maxResolution) : undefined,
          limit: 20
        });
      } else {
        throw new Error(`Unsupported source category: ${source.category}`);
      }

      setSearchResult(result);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[DatabaseSourceView] Search request aborted.');
        return;
      }
      console.error('[DatabaseSourceView] Search failed:', err);
      setErrorMessage(err.message || 'Database search request failed. Please check network connectivity.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearchWithTerm(searchTerm);
  };

  const handleCancelFullProcessing = () => {
    if (streamAbortControllerRef.current) {
      streamAbortControllerRef.current.abort();
    }
    setIsProcessingCompleteRecord(false);
    setProgressData(null);
    setProcessingRecordMeta(null);
    setIsFetchingFasta(null);
  };

  const handleAnalyzeComplete = async (item: any) => {
    const accession = item.accession || item.uid || item.primaryAccession || item.pdbId || item.id;
    const title = item.title || item.proteinName || item.definition || `Record ${accession}`;
    const organism = item.organismName || item.organism;
    const rawLength = item.sequenceLength || item.length;
    const db = source.category === 'NCBI' ? ncbiAdapter.getDbFromSourceId(source.id) : 'nucleotide';
    const seqType = item.polymerType || (source.category === 'UniProt' ? 'Protein' : 'Nucleotide');

    if (streamAbortControllerRef.current) {
      streamAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    streamAbortControllerRef.current = abortController;

    // If record is a whole chromosome or massive genomic assembly (> 250,000 bp),
    // show its true length and offer region selection with explicit start/end coordinates.
    let effectiveLength = rawLength;
    if (!effectiveLength && source.category === 'NCBI') {
      try {
        const summary = await ncbiAdapter.getSummary(db, accession, abortController.signal);
        if (summary?.length) {
          effectiveLength = summary.length;
        }
      } catch {
        // non-blocking
      }
    }

    if (effectiveLength && effectiveLength > 250000) {
      handleSelectRegion({
        ...item,
        length: effectiveLength,
        sequenceLength: effectiveLength,
        totalLength: effectiveLength
      });
      return;
    }

    const isLarge = (effectiveLength !== undefined && effectiveLength > 10000) || source.category === 'NCBI';

    if (isLarge) {
      setIsProcessingCompleteRecord(true);
      setProcessingRecordMeta({
        accession,
        title,
        organism,
        sourceDb: db,
        category: source.category,
        totalLength: effectiveLength
      });
      setProgressData({
        stage: 'downloading',
        currentChunk: 1,
        totalChunks: 10,
        basesProcessed: 0,
        totalBases: effectiveLength || 100000,
        percentage: 5,
        message: 'Connecting to biological data stream...'
      });
    }

    setIsFetchingFasta(accession);
    try {
      const loadRes = await sequenceLoader.loadTarget({
        accession,
        source: source.category === 'NCBI' ? 'NCBI' : source.category === 'UniProt' ? 'UNIPROT' : source.category === 'RCSB_PDB' ? 'RCSB_PDB' : 'AUTO',
        sequenceType: seqType === 'Protein' ? 'PROTEIN' : 'AUTO',
        definition: title,
        organism,
        signal: abortController.signal
      });

      if (!loadRes.success || !loadRes.sequence) {
        throw new Error(loadRes.error || `Unable to fetch valid FASTA sequence for accession ${accession}`);
      }

      setIsProcessingCompleteRecord(false);
      setIsFetchingFasta(null);

      const fastaString = loadRes.rawFasta || `>${loadRes.accession} ${loadRes.definition}\n${loadRes.sequence}`;

      onOpenWorkbenchWithSequence(fastaString, {
        source: source.name,
        database: source.category,
        accession: loadRes.accession,
        title: loadRes.definition,
        organism: loadRes.organism,
        isPartialRange: false,
        totalLength: loadRes.length,
        sequenceType: loadRes.sequenceType
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[DatabaseSourceView] Full sequence processing cancelled by user.');
      } else {
        console.error('[DatabaseSourceView] Failed to process full sequence:', err);
        if (err?.message && (err.message.includes('large chromosome/genomic record') || err.message.includes('Select Region'))) {
          handleSelectRegion({
            ...item,
            length: effectiveLength || 84276897
          });
        }
        setErrorMessage(`Failed to complete sequence analysis for ${accession}: ${err.message}`);
      }
      setIsProcessingCompleteRecord(false);
      setIsFetchingFasta(null);
    }
  };

  const handleSelectRegion = (item: any) => {
    const accession = item.accession || item.uid || item.primaryAccession || item.pdbId || item.id;
    const title = item.title || item.proteinName || item.definition || `Record ${accession}`;
    const organism = item.organismName || item.organism || 'Homo sapiens';
    const rawLength = item.sequenceLength || item.length || 1000000;
    const db = source.category === 'NCBI' ? ncbiAdapter.getDbFromSourceId(source.id) : 'nucleotide';
    const seqType = item.sequence_type || item.sequenceType || item.moltype || item.polymerType || (source.category === 'UniProt' ? 'Protein' : 'Genomic DNA');

    setLargeSequenceRecord({
      uid: item.uid,
      accession,
      title,
      organism,
      sequenceType: seqType,
      totalLength: rawLength,
      sourceDb: db,
      category: source.category
    });
  };

  const getSourceEmoji = (cat: DatabaseCategory) => {
    switch (cat) {
      case 'NCBI': return '🔬';
      case 'BLAST': return '◯';
      case 'UniProt': return '📖';
      case 'RCSB_PDB': return '🧬';
      default: return '🗄';
    }
  };

  const mainCategories = DATABASE_CATEGORIES.filter(
    (c) => c.id !== 'FASTA_IMPORT' && c.id !== 'CUSTOM_SEQUENCE'
  );

  const currentCategoryInfo = DATABASE_CATEGORIES.find((c) => c.id === source.category);
  const currentCategorySources = currentCategoryInfo ? currentCategoryInfo.sources : [];

  // Determine secondary filter fields (excluding primary search term)
  const secondaryFilterFields = source.queryFields.filter(
    (f) => f.name !== 'term' && f.name !== 'query' && f.name !== 'sequence'
  );

  const activeFilterCount = Object.keys(filterValues).filter((k) => {
    const val = filterValues[k];
    return val !== '' && val !== undefined && val !== 'relevance' && val !== 'ALL';
  }).length;

  const formatLengthDisplay = (len: number, unit: string = 'bp') => {
    if (len >= 1000000) return `${(len / 1000000).toFixed(2)} Mb`;
    if (len >= 1000) return `${(len / 1000).toFixed(1)} kb`;
    return `${len.toLocaleString()} ${unit}`;
  };

  return (
    <div id="database-source-view" className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Large Sequence Analysis Modal */}
      {largeSequenceRecord && (
        <LargeSequenceModal
          isOpen={!!largeSequenceRecord}
          onClose={() => setLargeSequenceRecord(null)}
          record={largeSequenceRecord}
          onSelectRangeAndLoad={(slicedFasta, meta) => {
            onOpenWorkbenchWithSequence(slicedFasta, meta);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* 1. COMPACT UNIFIED SOURCE & CATEGORY SELECTOR BAR */}
      {/* ========================================================================= */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 md:p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Dual Dropdown Selectors: Data Source & Category */}
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            {/* Data Source Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#64748B] whitespace-nowrap">Data Source:</span>
              <div className="relative" ref={sourceDropdownRef}>
                <button
                  type="button"
                  id="data-source-selector-btn"
                  onClick={() => {
                    setIsSourceDropdownOpen(!isSourceDropdownOpen);
                    setIsCategoryDropdownOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] hover:border-[#94A3B8] text-xs font-semibold text-[#0F172A] transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
                >
                  <span>{getSourceEmoji(source.category)}</span>
                  <span>{source.category === 'RCSB_PDB' ? 'RCSB PDB' : source.category}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
                </button>

                {/* Floating Dropdown Overlay */}
                {isSourceDropdownOpen && (
                  <div className="absolute left-0 mt-1.5 w-56 bg-white border border-[#E2E8F0] rounded-xl p-1.5 shadow-xl z-50 animate-in fade-in duration-100">
                    <div className="px-2 py-1 text-[10px] font-mono uppercase text-[#64748B] font-bold border-b border-[#E2E8F0] mb-1">
                      Select Primary Source
                    </div>
                    {mainCategories.map((cat) => {
                      const isCatActive = source.category === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            if (onSelectCategory) {
                              onSelectCategory(cat.id);
                            }
                            if (onSelectSource && cat.sources.length > 0) {
                              onSelectSource(cat.sources[0].id);
                            }
                            setIsSourceDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                            isCatActive
                              ? 'bg-sky-50 text-[#0284C7] font-semibold'
                              : 'text-[#334155] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{getSourceEmoji(cat.id)}</span>
                            <span>{cat.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-[#94A3B8]">
                            {cat.sources.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Category / Sub-Source Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#64748B] whitespace-nowrap">Category:</span>
              <div className="relative" ref={categoryDropdownRef}>
                <button
                  type="button"
                  id="category-selector-btn"
                  onClick={() => {
                    setIsCategoryDropdownOpen(!isCategoryDropdownOpen);
                    setIsSourceDropdownOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] hover:border-[#94A3B8] text-xs font-semibold text-[#0284C7] transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
                >
                  <span className="truncate max-w-[160px]">{source.name}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                </button>

                {/* Floating Dropdown Overlay */}
                {isCategoryDropdownOpen && (
                  <div className="absolute left-0 mt-1.5 w-64 bg-white border border-[#E2E8F0] rounded-xl p-1.5 shadow-xl z-50 animate-in fade-in duration-100">
                    <div className="px-2 py-1 text-[10px] font-mono uppercase text-[#64748B] font-bold border-b border-[#E2E8F0] mb-1">
                      {source.category} Search Categories
                    </div>
                    {currentCategorySources.map((s) => {
                      const isSubActive = source.id === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            if (onSelectSource) {
                              onSelectSource(s.id);
                            }
                            setIsCategoryDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                            isSubActive
                              ? 'bg-sky-50 text-[#0284C7] font-semibold'
                              : 'text-[#334155] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                          }`}
                        >
                          <span className="truncate">{s.name}</span>
                          {isSubActive && <CheckCircle2 className="w-3 h-3 text-[#0284C7] shrink-0 ml-1" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Info & Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {onOpenFastaImport && (
              <button
                type="button"
                onClick={onOpenFastaImport}
                title="Import FASTA file"
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#334155] hover:text-[#0F172A] bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <FileUp className="w-3.5 h-3.5 text-[#0284C7]" />
                <span className="hidden md:inline">FASTA</span>
              </button>
            )}

            {onOpenCustomWorkbench && (
              <button
                type="button"
                onClick={onOpenCustomWorkbench}
                title="Direct Workbench"
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Dna className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden md:inline">Workbench</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsSourceInfoOpen(!isSourceInfoOpen)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#475569] hover:text-[#0F172A] bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Info</span>
              {isSourceInfoOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Collapsible Source Information Panel */}
        {isSourceInfoOpen && (
          <div className="pt-2.5 border-t border-[#E2E8F0] grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs font-mono text-[#475569] animate-in fade-in duration-150">
            <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
              <span className="text-[10px] uppercase tracking-wider text-[#64748B] block">API Adapter</span>
              <span className="text-[#0284C7] font-semibold truncate block">{source.apiProvider}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
              <span className="text-[10px] uppercase tracking-wider text-[#64748B] block">Supported Formats</span>
              <div className="flex flex-wrap gap-1">
                {source.supportedFormats.map((fmt, idx) => (
                  <span key={idx} className="bg-white text-[#334155] border border-[#CBD5E1] px-1.5 py-0.2 rounded text-[10px]">
                    {fmt}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#64748B] block">Documentation</span>
                <span className="text-[#0F172A] text-[11px]">Official Reference</span>
              </div>
              <a
                href={source.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#0F172A] rounded text-xs flex items-center gap-1 transition-colors"
              >
                <span>Docs</span>
                <ExternalLink className="w-3 h-3 text-[#64748B]" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. PROMINENT SEARCH INPUT & SEARCH HEADER */}
      {/* ========================================================================= */}
      <form onSubmit={handleSearchSubmit} className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[#0F172A] tracking-tight">
              {source.name} Search
            </h3>
            <span className="text-[10px] font-mono text-[#0284C7] bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
              {source.badge}
            </span>
          </div>
          <p className="text-xs text-[#64748B] hidden sm:block truncate max-w-md">
            {source.description}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0284C7]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search sequence, gene, accession or organism..."
              className="w-full bg-white border border-[#CBD5E1] rounded-xl pl-10 pr-20 py-2.5 md:py-3 text-xs md:text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]/30 transition-all font-mono shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-12 top-1/2 -translate-y-1/2 p-1 text-[#94A3B8] hover:text-[#0F172A]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[#64748B] bg-[#F1F5F9] px-1.5 py-0.5 rounded border border-[#E2E8F0]">
              ↵
            </span>
          </div>

          <button
            type="submit"
            disabled={isExecuting || !searchTerm.trim()}
            className="px-4 md:px-5 py-2.5 md:py-3 bg-[#0284C7] hover:bg-[#0369a1] disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-all flex items-center gap-2 shrink-0 shadow-xs cursor-pointer"
          >
            {isExecuting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4 text-white stroke-[2.5]" />
                <span>Search</span>
              </>
            )}
          </button>
        </div>

        {/* ========================================================================= */}
        {/* 3. OPTIONAL ADVANCED FILTERS & COMPACT EXAMPLES TOGGLE */}
        {/* ========================================================================= */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-2">
            {/* Try Example Dropdown ▾ */}
            {source.sampleQueries.length > 0 && (
              <div className="relative" ref={examplesDropdownRef}>
                <button
                  type="button"
                  id="try-example-btn"
                  onClick={() => setIsExamplesOpen(!isExamplesOpen)}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#334155] hover:text-[#0F172A] transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#0284C7]" />
                  <span>Try Example</span>
                  {isExamplesOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3 text-[#64748B]" />}
                </button>

                {/* Floating Examples Menu */}
                {isExamplesOpen && (
                  <div className="absolute left-0 mt-1.5 w-72 md:w-88 bg-white border border-[#E2E8F0] rounded-xl p-2 shadow-xl z-50 space-y-1 animate-in fade-in duration-100">
                    <div className="px-2.5 py-1 text-[10px] uppercase font-mono text-[#64748B] font-bold border-b border-[#E2E8F0]">
                      Standard Reference Accessions
                    </div>
                    {source.sampleQueries.map((sample, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleApplySampleQuery(sample.query)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F8FAFC] transition-colors flex items-center justify-between group cursor-pointer"
                      >
                        <div className="min-w-0 pr-2">
                          <span className="font-mono text-xs text-[#0284C7] font-semibold group-hover:text-[#0369a1] block truncate">
                            {sample.query}
                          </span>
                          <span className="text-[11px] text-[#64748B] block truncate">
                            {sample.label}
                          </span>
                        </div>
                        <ArrowRight className="w-3 h-3 text-[#94A3B8] group-hover:text-[#0284C7] shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Advanced Filters ▾ */}
            {secondaryFilterFields.length > 0 && (
              <button
                type="button"
                id="advanced-filters-btn"
                onClick={() => setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                  isAdvancedFiltersOpen || activeFilterCount > 0
                    ? 'bg-sky-50 text-[#0284C7] border border-sky-200 font-semibold'
                    : 'bg-white hover:bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A] border border-[#CBD5E1]'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Advanced Filters</span>
                {activeFilterCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#0284C7] text-white text-[10px] font-bold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
                {isAdvancedFiltersOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>

          <span className="text-[11px] font-mono text-[#64748B] hidden sm:inline-block">
            Adapter: <span className="text-[#0F172A] font-semibold">{source.id}</span>
          </span>
        </div>

        {/* Collapsible Advanced Filters Section */}
        {isAdvancedFiltersOpen && secondaryFilterFields.length > 0 && (
          <div className="p-4 bg-white border border-[#E2E8F0] rounded-xl space-y-3 shadow-xs animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-xs font-mono text-[#64748B] border-b border-[#E2E8F0] pb-2">
              <span className="font-semibold text-[#0F172A] uppercase tracking-wider text-[11px]">
                Search Constraints &amp; Filters
              </span>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const defaults: Record<string, any> = {};
                    source.queryFields.forEach((field) => {
                      if (field.name !== 'term' && field.name !== 'query' && field.name !== 'sequence') {
                        defaults[field.name] = field.defaultValue !== undefined ? field.defaultValue : '';
                      }
                    });
                    setFilterValues(defaults);
                  }}
                  className="text-[#64748B] hover:text-[#0284C7] flex items-center gap-1 text-[11px] cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {secondaryFilterFields.map((field) => (
                <div key={field.name} className="space-y-1">
                  <label className="block text-[11px] font-medium text-[#334155]">
                    {field.label}
                  </label>

                  {field.type === 'text' && (
                    <input
                      type="text"
                      value={filterValues[field.name] || ''}
                      onChange={(e) => handleFilterChange(field.name, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-3 py-1.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono"
                    />
                  )}

                  {field.type === 'select' && (
                    <select
                      value={filterValues[field.name] || field.defaultValue}
                      onChange={(e) => handleFilterChange(field.name, e.target.value)}
                      className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs text-[#0F172A] focus:outline-none focus:border-[#38BDF8] font-mono cursor-pointer"
                    >
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {field.type === 'number' && (
                    <input
                      type="number"
                      value={filterValues[field.name] || ''}
                      onChange={(e) => handleFilterChange(field.name, e.target.value)}
                      className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-3 py-1.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </form>

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. RESULTS SECTION: SHOWN ONLY AFTER SEARCH IS PERFORMED */}
      {/* ========================================================================= */}
      {searchResult ? (
        <div className="space-y-3.5">
          {/* Results Summary Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                Search Results
              </h4>
              <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                {searchResult.totalCount.toLocaleString()} Matches
              </span>
            </div>

            {searchResult.executionTimeMs !== undefined && (
              <span className="text-[11px] font-mono text-[#64748B] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {searchResult.executionTimeMs}ms
              </span>
            )}
          </div>

          {/* If 0 results found */}
          {searchResult.items.length === 0 ? (
            <div className="p-8 text-center bg-white border border-[#E2E8F0] rounded-xl text-[#64748B] space-y-2 shadow-xs">
              <p className="text-xs font-mono">
                No matching biological records found in {source.name} for &quot;{searchResult.query}&quot;.
              </p>
              <p className="text-[11px] text-[#94A3B8]">
                Try adjusting your search query, clearing filters, or testing a curated reference accession.
              </p>
            </div>
          ) : (
            /* Compact Result Cards */
            <div className="space-y-2.5">
              {searchResult.items.map((item: any, idx: number) => {
                const accession = item.accession || item.uid || item.primaryAccession || item.pdbId || item.id || `rec-${idx}`;
                const title = item.title || item.proteinName || item.definition || `Record ${accession}`;
                const organism = formatOrganism(item.organismName || item.organism);
                const length = item.sequenceLength || item.length;
                const unit = source.category === 'UniProt' ? 'aa' : 'bp';
                const isLarge = item.isLargeSequence || (length !== undefined && length > 100000);
                const seqType = item.polymerType || item.moltype || (source.category === 'UniProt' ? 'Protein' : source.category === 'RCSB_PDB' ? '3D Structure' : 'Nucleotide');

                return (
                  <div
                    key={idx}
                    className="p-3.5 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#CBD5E1] rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors shadow-2xs"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-[#0284C7] bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                          {accession}
                        </span>

                        <span className="text-[10px] font-mono text-[#475569] bg-[#F1F5F9] px-1.5 py-0.5 rounded">
                          {source.category}
                        </span>

                        <span className="text-[10px] font-mono text-[#64748B] bg-[#F1F5F9] px-1.5 py-0.5 rounded">
                          {seqType}
                        </span>

                        {length !== undefined && length > 0 && (
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                              isLarge
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-[#F1F5F9] text-[#475569]'
                            }`}
                          >
                            {formatLengthDisplay(length, unit)}
                            {isLarge ? ' (Large Sequence)' : ''}
                          </span>
                        )}

                        {organism && (
                          <span className="text-[11px] italic text-[#64748B] truncate">
                            {organism}
                          </span>
                        )}

                        {item.reviewed !== undefined && (
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                            item.reviewed 
                              ? 'bg-teal-50 text-teal-700 border border-teal-200 font-semibold' 
                              : 'bg-[#F1F5F9] text-[#64748B]'
                          }`}>
                            {item.reviewed ? 'Swiss-Prot Reviewed' : 'TrEMBL'}
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-medium text-[#0F172A] line-clamp-2 leading-relaxed">
                        {title}
                      </p>
                    </div>

                    {/* Step 5: Two Clear Actions — Analyze Complete Sequence (Primary) & Select Region (Secondary) */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0 self-end md:self-center">
                      {/* Secondary Action: Select Region */}
                      <button
                        type="button"
                        onClick={() => handleSelectRegion(item)}
                        disabled={isFetchingFasta === accession}
                        className="px-3 py-1.5 text-xs font-mono font-medium rounded-lg bg-white hover:bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A] border border-[#CBD5E1] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                        title="Specify coordinate bounds for targeted loci analysis"
                      >
                        <Sliders className="w-3.5 h-3.5 text-[#64748B]" />
                        <span>Select Region</span>
                      </button>

                      {/* Primary Action: Analyze Complete Sequence (Green/Teal) */}
                      <button
                        type="button"
                        onClick={() => handleAnalyzeComplete(item)}
                        disabled={isFetchingFasta === accession}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isFetchingFasta === accession ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            <span>Processing...</span>
                          </>
                        ) : (
                          <>
                            <Dna className="w-3.5 h-3.5 text-white" />
                            <span>Analyze Complete Sequence</span>
                            <ArrowRight className="w-3 h-3 text-white" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Empty State / Initial Guided State Before Search */
        !isExecuting && (
          <div className="p-8 md:p-10 text-center bg-white border border-dashed border-[#CBD5E1] rounded-2xl space-y-3 shadow-2xs">
            <div className="w-10 h-10 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center mx-auto text-[#64748B]">
              <span className="text-lg">{getSourceEmoji(source.category)}</span>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-[#0F172A]">
                Ready to search {source.name}
              </h4>
              <p className="text-xs text-[#64748B] max-w-md mx-auto leading-relaxed">
                Enter a gene name, accession identifier, or biological sequence above to query live records directly from {source.apiProvider}.
              </p>
            </div>
          </div>
        )
      )}

      {/* Full Sequence Progress Modal */}
      {processingRecordMeta && (
        <FullSequenceProgressModal
          isOpen={isProcessingCompleteRecord}
          onCancel={handleCancelFullProcessing}
          record={processingRecordMeta}
          progress={progressData}
        />
      )}

      {/* Select Region Modal */}
      {largeSequenceRecord && (
        <LargeSequenceModal
          isOpen={!!largeSequenceRecord}
          onClose={() => setLargeSequenceRecord(null)}
          record={largeSequenceRecord}
          onSelectRangeAndLoad={(fasta, meta) => {
            onOpenWorkbenchWithSequence(fasta, meta);
            setLargeSequenceRecord(null);
          }}
        />
      )}
    </div>
  );
};
