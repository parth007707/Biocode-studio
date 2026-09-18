import React from 'react';
import { Search, Sparkles, Filter, X, ArrowRight } from 'lucide-react';
import { DatabaseCategory } from '../../../services/adapters/types';

interface GlobalSearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSearchSubmit: (e?: React.FormEvent) => void;
  activeCategoryFilter: DatabaseCategory | 'ALL';
  onSelectCategoryFilter: (category: DatabaseCategory | 'ALL') => void;
  isSearching?: boolean;
}

export const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({
  query,
  onQueryChange,
  onSearchSubmit,
  activeCategoryFilter,
  onSelectCategoryFilter,
  isSearching = false
}) => {
  const categories: { id: DatabaseCategory | 'ALL'; label: string }[] = [
    { id: 'ALL', label: 'All Repositories' },
    { id: 'NCBI', label: 'NCBI' },
    { id: 'BLAST', label: 'BLAST' },
    { id: 'UniProt', label: 'UniProt' },
    { id: 'RCSB_PDB', label: 'RCSB PDB' }
  ];

  return (
    <div className="w-full bg-white border-b border-[#E2E8F0] p-4 space-y-3">
      {/* Search Input Bar */}
      <form onSubmit={onSearchSubmit} className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0284C7]" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search databases, genes, organisms, accession IDs..."
            className="w-full bg-[#F8FAFC] focus:bg-white border border-[#CBD5E1] rounded-lg pl-10 pr-24 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#0284C7] focus:ring-1 focus:ring-[#38BDF8]/40 transition-all font-mono shadow-2xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="absolute right-20 top-1/2 -translate-y-1/2 p-1 text-[#94A3B8] hover:text-[#0F172A]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded border border-[#E2E8F0]">
            Enter ↵
          </span>
        </div>

        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="px-4 py-2.5 bg-[#0284C7] hover:bg-[#0369A1] disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-all flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
        >
          {isSearching ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5 text-white" />
          )}
          <span>Search Repository</span>
        </button>
      </form>

      {/* Filter Category Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 custom-scrollbar text-xs">
        <div className="flex items-center gap-1 text-[#64748B] text-[11px] font-medium mr-1 shrink-0">
          <Filter className="w-3 h-3 text-[#94A3B8]" />
          <span>Scope:</span>
        </div>
        {categories.map((cat) => {
          const isActive = activeCategoryFilter === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategoryFilter(cat.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[rgba(56,189,248,0.15)] text-[#0284C7] border border-[#38BDF8]/40 shadow-xs font-semibold'
                  : 'bg-[#F1F5F9] text-[#475569] hover:text-[#0F172A] border border-[#E2E8F0] hover:bg-white'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
