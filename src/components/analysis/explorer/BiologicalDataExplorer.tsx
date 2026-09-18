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
import { PanelLeftOpen } from 'lucide-react';

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
  };

  const handleSelectSource = (sourceId: DatabaseSourceId) => {
    setSelectedSourceId(sourceId);
    const meta = DATABASE_SOURCES.find((s) => s.id === sourceId);
    if (meta) {
      setSelectedCategory(meta.category);
    }
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

  return (
    <div id="biological-data-explorer" className="flex h-full w-full overflow-hidden bg-[#F8FAFC]">
      {/* Left-Side Directory Panel (Collapsible & Compact) */}
      <DirectorySidebar
        selectedCategory={selectedCategory}
        selectedSourceId={selectedSourceId}
        onSelectCategory={handleSelectCategory}
        onSelectSource={handleSelectSource}
        onOpenWorkbench={() => onOpenWorkbench()}
        onOpenFastaImport={() => {
          setSelectedCategory('FASTA_IMPORT');
          setSelectedSourceId('fasta-import');
        }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* Main Content Area: Automatically expands when sidebar is collapsed */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#F8FAFC]">
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
        <div className="flex-1 overflow-y-auto custom-scrollbar">
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
