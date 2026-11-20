import React, { useState, useEffect } from 'react';
import { 
  DatabaseCategory, 
  DatabaseSourceId 
} from '../../../services/adapters/types';
import { 
  DATABASE_CATEGORIES, 
  DATABASE_SOURCES 
} from './databaseRegistry';
import { 
  Database, 
  Search, 
  BookOpen, 
  Layers, 
  FileUp, 
  Terminal, 
  ChevronRight, 
  ChevronDown,
  ChevronLeft,
  Globe,
  Dna,
  PanelLeftClose,
  PanelLeftOpen,
  X
} from 'lucide-react';

interface DirectorySidebarProps {
  selectedCategory: DatabaseCategory;
  selectedSourceId: DatabaseSourceId | null;
  onSelectCategory: (cat: DatabaseCategory) => void;
  onSelectSource: (sourceId: DatabaseSourceId) => void;
  onOpenWorkbench: () => void;
  onOpenFastaImport: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const DirectorySidebar: React.FC<DirectorySidebarProps> = ({
  selectedCategory,
  selectedSourceId,
  onSelectCategory,
  onSelectSource,
  onOpenWorkbench,
  onOpenFastaImport,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile
}) => {
  // Strict progressive disclosure accordion: only ONE category is expanded at a time
  const [expandedCategory, setExpandedCategory] = useState<DatabaseCategory | null>(selectedCategory);

  // Sync expanded category when selected category changes externally
  useEffect(() => {
    if (selectedCategory !== 'FASTA_IMPORT' && selectedCategory !== 'CUSTOM_SEQUENCE') {
      setExpandedCategory(selectedCategory);
    }
  }, [selectedCategory]);

  const handleCategoryClick = (catId: DatabaseCategory, sources: any[]) => {
    // If already expanded, collapse it; otherwise expand this category and collapse previous
    if (expandedCategory === catId) {
      setExpandedCategory(null);
    } else {
      setExpandedCategory(catId);
      onSelectCategory(catId);
      if (sources.length > 0) {
        // Automatically select first source if current source does not belong to this category
        const currentSourceMeta = DATABASE_SOURCES.find((s) => s.id === selectedSourceId);
        if (!currentSourceMeta || currentSourceMeta.category !== catId) {
          onSelectSource(sources[0].id);
        }
      }
    }
  };

  const getCategoryIcon = (catId: DatabaseCategory) => {
    switch (catId) {
      case 'NCBI': return Database;
      case 'BLAST': return Search;
      case 'UniProt': return BookOpen;
      case 'RCSB_PDB': return Layers;
      case 'FASTA_IMPORT': return FileUp;
      case 'CUSTOM_SEQUENCE': return Terminal;
      default: return Database;
    }
  };

  const getCategoryEmojiOrSymbol = (catId: DatabaseCategory) => {
    switch (catId) {
      case 'NCBI': return '🔬';
      case 'BLAST': return '◯';
      case 'UniProt': return '📖';
      case 'RCSB_PDB': return '🧬';
      default: return '🗄';
    }
  };

  // Only render the 4 main biological database repositories in the tree
  const mainCategories = DATABASE_CATEGORIES.filter(
    (c) => c.id !== 'FASTA_IMPORT' && c.id !== 'CUSTOM_SEQUENCE'
  );

  if (isCollapsed && !isMobileOpen) {
    return (
      <aside 
        id="directory-sidebar-collapsed"
        className="hidden md:flex w-14 bg-white border-r border-[#E2E8F0] flex-col h-full shrink-0 select-none transition-all duration-200 justify-between items-center py-3"
      >
        <div className="flex flex-col items-center space-y-3 w-full">
          {/* Expand toggle */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Expand Data Sources Panel"
              className="p-2 text-[#64748B] hover:text-[#0284C7] hover:bg-[#F1F5F9] rounded-lg transition-colors cursor-pointer"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}

          <div className="w-8 h-px bg-[#E2E8F0]" />

          {/* Icon-only Category Buttons */}
          <div className="flex flex-col items-center space-y-1.5 w-full px-2">
            {mainCategories.map((category) => {
              const CatIcon = getCategoryIcon(category.id);
              const isActive = selectedCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    if (onToggleCollapse) onToggleCollapse();
                    handleCategoryClick(category.id, category.sources);
                  }}
                  title={`${category.name} (${category.sources.length} sources)`}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer relative group ${
                    isActive
                      ? 'bg-[rgba(56,189,248,0.15)] text-[#0284C7] border border-[#38BDF8]/40 shadow-xs'
                      : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
                  }`}
                >
                  <CatIcon className="w-4 h-4" />
                  {/* Floating tooltip */}
                  <div className="absolute left-full ml-2 px-2 py-1 bg-[#0F172A] border border-[#334155] text-white text-[11px] rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    {category.name}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Quick Tools */}
        <div className="flex flex-col items-center space-y-2 w-full px-2">
          <button
            type="button"
            onClick={onOpenFastaImport}
            title="Import FASTA File"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#0284C7] hover:bg-[#F1F5F9] transition-colors cursor-pointer relative group"
          >
            <FileUp className="w-4 h-4" />
            <div className="absolute left-full ml-2 px-2 py-1 bg-[#0F172A] border border-[#334155] text-white text-[11px] rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              Import FASTA
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenWorkbench}
            title="Custom Sequence Workbench"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#0284C7] bg-[rgba(56,189,248,0.12)] hover:bg-[rgba(56,189,248,0.2)] border border-[#38BDF8]/30 transition-all cursor-pointer relative group"
          >
            <Dna className="w-4 h-4" />
            <div className="absolute left-full ml-2 px-2 py-1 bg-[#0F172A] border border-[#334155] text-white text-[11px] rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              Custom Sequence
            </div>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <>
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] md:hidden"
        />
      )}
      <aside 
        id="directory-sidebar"
        className={`${
          isMobileOpen
            ? 'fixed inset-y-0 left-0 z-50 flex w-64 shadow-2xl'
            : 'hidden md:flex w-56 lg:w-64'
        } bg-white border-r border-[#E2E8F0] flex-col h-full shrink-0 select-none transition-all duration-200`}
      >
        {/* Sidebar Header with Collapse Button */}
        <div className="px-3.5 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="w-4 h-4 text-[#0284C7] shrink-0" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] truncate">
              Data Sources
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-[#0284C7] bg-[rgba(56,189,248,0.12)] px-1.5 py-0.5 rounded border border-[#38BDF8]/30 font-semibold">
              {DATABASE_SOURCES.filter(s => s.category !== 'FASTA_IMPORT' && s.category !== 'CUSTOM_SEQUENCE').length} Repos
            </span>

            {isMobileOpen && onCloseMobile ? (
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close Data Sources Drawer"
                className="md:hidden p-1 text-[#64748B] hover:text-[#0F172A] hover:bg-[#E2E8F0] rounded transition-colors cursor-pointer ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  title="Collapse Data Sources Panel (◀)"
                  className="hidden md:inline-flex p-1 text-[#64748B] hover:text-[#0F172A] hover:bg-[#E2E8F0] rounded transition-colors cursor-pointer ml-1"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              )
            )}
          </div>
        </div>

      {/* Progressive Disclosure Accordion: Fits neatly without forcing vertical scroll */}
      <div className="flex-1 p-2.5 space-y-1.5 overflow-y-auto custom-scrollbar">
        {mainCategories.map((category) => {
          const CatIcon = getCategoryIcon(category.id);
          const isCategoryActive = selectedCategory === category.id;
          const isExpanded = expandedCategory === category.id;
          const symbol = getCategoryEmojiOrSymbol(category.id);

          return (
            <div key={category.id} className="rounded-lg overflow-hidden border border-[#E2E8F0] bg-white transition-colors shadow-2xs">
              {/* Category Header Button */}
              <button
                type="button"
                onClick={() => handleCategoryClick(category.id, category.sources)}
                className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium transition-all cursor-pointer ${
                  isCategoryActive
                    ? 'bg-[rgba(56,189,248,0.12)] text-[#0284C7] font-semibold'
                    : 'text-[#334155] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs">{symbol}</span>
                  <span className="truncate">{category.name}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[9px] font-mono text-[#64748B] bg-[#F1F5F9] px-1.5 py-0.5 rounded">
                    {category.sources.length}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-[#0284C7]" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8]" />
                  )}
                </div>
              </button>

              {/* Sub-sources: ONLY displayed when this single category is expanded */}
              {isExpanded && (
                <div className="px-1.5 py-1 space-y-0.5 border-t border-[#E2E8F0] bg-[#F8FAFC]">
                  {category.sources.map((source) => {
                    const isSourceActive = selectedSourceId === source.id;
                    return (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => {
                          onSelectCategory(category.id);
                          onSelectSource(source.id);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] transition-colors text-left cursor-pointer ${
                          isSourceActive
                            ? 'bg-white text-[#0284C7] font-semibold border-l-2 border-[#0284C7] pl-2 shadow-2xs'
                            : 'text-[#475569] hover:text-[#0F172A] hover:bg-white'
                        }`}
                      >
                        <span className="truncate">{source.name}</span>
                        {isSourceActive && (
                          <ChevronRight className="w-3 h-3 text-[#0284C7] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Compact Action Dock at Bottom */}
      <div className="p-2.5 border-t border-[#E2E8F0] bg-[#F8FAFC] space-y-1.5">
        <button
          type="button"
          onClick={onOpenFastaImport}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#F1F5F9] border border-[#E2E8F0] text-xs text-[#334155] transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <FileUp className="w-3.5 h-3.5 text-[#0284C7]" />
            <span className="font-medium text-[#334155]">Upload FASTA</span>
          </div>
          <span className="text-[10px] font-mono text-[#64748B] group-hover:text-[#0F172A]">Import</span>
        </button>

        <button
          type="button"
          onClick={onOpenWorkbench}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[rgba(56,189,248,0.12)] hover:bg-[rgba(56,189,248,0.2)] border border-[#38BDF8]/30 text-xs text-[#0284C7] font-medium transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <Dna className="w-3.5 h-3.5 text-[#0284C7]" />
            <span>Custom Sequence</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[#0284C7] group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </aside>
    </>
  );
};
