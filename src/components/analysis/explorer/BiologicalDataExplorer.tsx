import React, { useState } from 'react';
import { 
  DatabaseCategory, 
  DatabaseSourceId, 
  DatabaseSourceMeta,
  SequenceSourceMetadata
} from '../../../services/adapters/types';
import { 
  DATABASE_CATEGORIES, 
  DATABASE_SOURCES 
} from './databaseRegistry';
import { DirectorySidebar } from './DirectorySidebar';
import { GlobalSearchBar } from './GlobalSearchBar';
import { CategoryHubView } from './CategoryHubView';
import { DatabaseSourceView } from './DatabaseSourceView';
import { FastaImportView } from './FastaImportView';
import { PanelLeftOpen, Globe, FileUp, Dna } from 'lucide-react';

interface BiologicalDataExplorerProps {
  onOpenWorkbench: (initialSequence?: string, identifierOrMeta?: string | SequenceSourceMetadata) => void;
}

export const BiologicalDataExplorer: React.FC<BiologicalDataExplorerProps> = ({
  onOpenWorkbench
}) => {
  const [selectedCategory, setSelectedCategory] = useState<DatabaseCategory>('NCBI');
  const [selectedSourceId, setSelectedSourceId] = useState<DatabaseSourceId | null>('ncbi-nucleotide');
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<DatabaseCategory | 'ALL'>('ALL');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileDirectoryOpen, setIsMobileDirectoryOpen] = useState<boolean>(false);

  // Determine current active view
  const currentSourceMeta: DatabaseSourceMeta | undefined = DATABASE_SOURCES.find(
    (s) => s.id === selectedSourceId
  );

  const handleGlobalSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!globalSearchQuery.trim()) return;

    if (activeCategoryFilter === 'UniProt' || globalSearchQuery.toUpperCase().startsWith('P') || globalSearchQuery.toUpperCase().startsWith('Q')) {
      setSelectedCategory('UniProt');
      setSelectedSourceId('uniprot-protein');
    } else if (activeCategoryFilter === 'RCSB_PDB' || (globalSearchQuery.length === 4 && /\d[A-Z0-9]{3}/i.test(globalSearchQuery))) {
      setSelectedCategory('RCSB_PDB');
      setSelectedSourceId('pdb-protein');
    } else if (activeCategoryFilter === 'BLAST') {
      setSelectedCategory('BLAST');
      setSelectedSourceId('blast-nucleotide');
    } else {
      setSelectedCategory('NCBI');
      setSelectedSourceId('ncbi-nucleotide');
    }
  };

  const handleSelectCategory = (cat: DatabaseCategory) => {
    setSelectedCategory(cat);
    if (cat === 'CUSTOM_SEQUENCE') {
      onOpenWorkbench();
    } else if (cat === 'FASTA_IMPORT') {
      setSelectedSourceId('fasta-import');
    } else {
      const firstSource = DATABASE_SOURCES.find((s) => s.category === cat);
      if (firstSource) {
        setSelectedSourceId(firstSource.id);
      }
    }
    setIsMobileDirectoryOpen(false);
  };

  const handleSelectSource = (sourceId: DatabaseSourceId) => {
    setSelectedSourceId(sourceId);
    const meta = DATABASE_SOURCES.find((s) => s.id === sourceId);
    if (meta) {
      setSelectedCategory(meta.category);
    }
    setIsMobileDirectoryOpen(false);
  };

  const handleApplyPresetQuery = (query: string, sourceId: DatabaseSourceId) => {
    setGlobalSearchQuery(query);
    setSelectedSourceId(sourceId);
    const meta = DATABASE_SOURCES.find((s) => s.id === sourceId);
    if (meta) {
      setSelectedCategory(meta.category);
    }
  };

  const handleChangeSource = () => {
    setSelectedSourceId(null);
  };

  const mainCategories = DATABASE_CATEGORIES.filter(
    (c) => c.id !== 'FASTA_IMPORT' && c.id !== 'CUSTOM_SEQUENCE'
  );

  return (
    <div id="biological-data-explorer" className="flex flex-col md:flex-row h-full w-full min-w-0 lg:overflow-hidden bg-[#F8FAFC]">
      {/* Mobile Quick Repository Bar + Drawer Trigger */}
      <div className="md:hidden bg-white border-b border-[#E2E8F0] px-3 py-2 flex flex-wrap items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setIsMobileDirectoryOpen(true)}
          className="px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-semibold text-[#0F172A] flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <PanelLeftOpen className="w-3.5 h-3.5 text-[#0284C7]" />
          <span>Sources</span>
        </button>

        {mainCategories.map((cat) => {
          const isActive = selectedCategory === cat.id && selectedSourceId !== 'fasta-import';
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleSelectCategory(cat.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isActive
                  ? 'bg-sky-50 text-[#0284C7] border border-sky-200 font-semibold'
                  : 'bg-[#F8FAFC] text-[#475569] border border-[#E2E8F0]'
              }`}
            >
              {cat.name}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            setSelectedCategory('FASTA_IMPORT');
            setSelectedSourceId('fasta-import');
          }}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
            selectedSourceId === 'fasta-import'
              ? 'bg-sky-50 text-[#0284C7] border border-sky-200 font-semibold'
              : 'bg-[#F8FAFC] text-[#475569] border border-[#E2E8F0]'
          }`}
        >
          <FileUp className="w-3 h-3 text-[#0284C7]" />
          <span>FASTA</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenWorkbench()}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1 bg-sky-50 text-[#0284C7] border border-sky-200 cursor-pointer"
        >
          <Dna className="w-3 h-3" />
          <span>Custom</span>
        </button>
      </div>

      {/* Left-Side Directory Panel (Desktop/Tablet sidebar + Mobile drawer) */}
      <DirectorySidebar
        selectedCategory={selectedCategory}
        selectedSourceId={selectedSourceId}
        onSelectCategory={handleSelectCategory}
        onSelectSource={handleSelectSource}
        onOpenWorkbench={() => {
          setIsMobileDirectoryOpen(false);
          onOpenWorkbench();
        }}
        onOpenFastaImport={() => {
          setSelectedCategory('FASTA_IMPORT');
          setSelectedSourceId('fasta-import');
          setIsMobileDirectoryOpen(false);
        }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileDirectoryOpen}
        onCloseMobile={() => setIsMobileDirectoryOpen(false)}
      />

      {/* Main Content Area: Automatically expands when sidebar is collapsed */}
      <div className="flex-1 flex flex-col min-w-0 h-full lg:overflow-hidden bg-[#F8FAFC]">
        {/* Render Global Search Bar on Hub View */}
        {!selectedSourceId && (
          <GlobalSearchBar
            query={globalSearchQuery}
            onQueryChange={setGlobalSearchQuery}
            onSearchSubmit={handleGlobalSearchSubmit}
            activeCategoryFilter={activeCategoryFilter}
            onSelectCategoryFilter={(cat) => {
              setActiveCategoryFilter(cat);
              if (cat !== 'ALL') {
                handleSelectCategory(cat);
              }
            }}
            isSearching={isSearching}
          />
        )}

        {/* Dynamic Panel Content - Single Clean Scroll Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-w-0">
          {selectedSourceId === 'fasta-import' || selectedCategory === 'FASTA_IMPORT' ? (
            <FastaImportView
              onAnalyzeInWorkbench={(fastaString) => {
                onOpenWorkbench(fastaString);
              }}
            />
          ) : selectedSourceId && currentSourceMeta ? (
            <DatabaseSourceView
              key={currentSourceMeta.id}
              source={currentSourceMeta}
              selectedCategory={selectedCategory}
              onSelectCategory={handleSelectCategory}
              onSelectSource={handleSelectSource}
              initialQuery={globalSearchQuery}
              onChangeSource={handleChangeSource}
              onOpenWorkbenchWithSequence={(fastaSeq, id) => {
                onOpenWorkbench(fastaSeq, id);
              }}
              onOpenFastaImport={() => {
                setSelectedCategory('FASTA_IMPORT');
                setSelectedSourceId('fasta-import');
              }}
              onOpenCustomWorkbench={() => onOpenWorkbench()}
            />
          ) : (
            <CategoryHubView
              onSelectCategory={handleSelectCategory}
              onSelectSource={handleSelectSource}
              onOpenWorkbench={() => onOpenWorkbench()}
              onOpenFastaImport={() => {
                setSelectedCategory('FASTA_IMPORT');
                setSelectedSourceId('fasta-import');
              }}
              onApplyQuery={handleApplyPresetQuery}
            />
          )}
        </div>
      </div>
    </div>
  );
};
