import React from 'react';
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
  ArrowRight, 
  Sparkles,
  Dna,
  CheckCircle2
} from 'lucide-react';

interface CategoryHubViewProps {
  onSelectCategory: (category: DatabaseCategory) => void;
  onSelectSource: (sourceId: DatabaseSourceId) => void;
  onOpenWorkbench: (initialSequence?: string) => void;
  onOpenFastaImport: () => void;
  onApplyQuery: (query: string, sourceId: DatabaseSourceId) => void;
}

export const CategoryHubView: React.FC<CategoryHubViewProps> = ({
  onSelectCategory,
  onSelectSource,
  onOpenWorkbench,
  onOpenFastaImport,
  onApplyQuery
}) => {
  const getCategoryIcon = (catId: DatabaseCategory) => {
    switch (catId) {
      case 'NCBI': return Database;
      case 'BLAST': return Search;
      case 'UniProt': return BookOpen;
      case 'RCSB_PDB': return Layers;
      case 'FASTA_IMPORT': return FileUp;
      case 'CUSTOM_SEQUENCE': return Terminal;
    }
  };

  const categories = DATABASE_CATEGORIES.filter(
    (c) => c.id !== 'FASTA_IMPORT' && c.id !== 'CUSTOM_SEQUENCE'
  );

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto">
      {/* 5-Step Workflow Guide Banner */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 md:p-6 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#0284C7] bg-[rgba(56,189,248,0.12)] px-2 py-0.5 rounded border border-[#38BDF8]/30">
                Data Explorer Gateway
              </span>
            </div>
            <h2 className="text-lg md:text-xl font-bold text-[#0F172A] tracking-tight">
              Biological Data Explorer
            </h2>
            <p className="text-xs md:text-sm text-[#475569] leading-relaxed">
              Query verified biological sequence repositories, search by gene or accession ID, and seamlessly transition into the interactive Sequence Analysis Workbench.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenFastaImport}
              className="px-3 py-2 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#334155] text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <FileUp className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>Import FASTA</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenWorkbench()}
              className="px-3.5 py-2 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Dna className="w-3.5 h-3.5 text-white" />
              <span>Open Workbench</span>
            </button>
          </div>
        </div>

        {/* 5-Step Visual Flow */}
        <div className="mt-5 pt-4 border-t border-[#E2E8F0] grid grid-cols-2 md:grid-cols-5 gap-2 text-xs font-mono">
          {[
            { step: '1', title: 'Select Source', desc: 'NCBI, UniProt, PDB' },
            { step: '2', title: 'Search', desc: 'Gene or Accession' },
            { step: '3', title: 'Filters', desc: 'Organism, Methods' },
            { step: '4', title: 'View Results', desc: 'Verified Records' },
            { step: '5', title: 'Workbench', desc: '3D Visualization' }
          ].map((item, idx) => (
            <div key={idx} className="p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-0.5">
              <div className="flex items-center gap-1.5 text-[#0284C7] font-semibold text-[11px]">
                <span className="w-4 h-4 rounded-full bg-[rgba(56,189,248,0.15)] flex items-center justify-center text-[10px]">
                  {item.step}
                </span>
                <span>{item.title}</span>
              </div>
              <span className="text-[10px] text-[#64748B] block truncate">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Database Categories Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#475569]">
            Step 1: Select a Biological Database
          </h3>
          <span className="text-[11px] font-mono text-[#94A3B8]">
            Choose a repository to start searching
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map((category) => {
            const CatIcon = getCategoryIcon(category.id);
            return (
              <div
                key={category.id}
                className="bg-white border border-[#E2E8F0] hover:border-[#38BDF8]/60 rounded-xl p-5 flex flex-col justify-between transition-all group shadow-2xs"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-[rgba(56,189,248,0.12)] text-[#0284C7] border border-[#38BDF8]/30">
                        <CatIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-[#0F172A] group-hover:text-[#0284C7] transition-colors">
                          {category.name}
                        </h4>
                        <p className="text-[11px] font-mono text-[#64748B]">
                          {category.shortDesc}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-[#475569] bg-[#F1F5F9] px-2 py-0.5 rounded">
                      {category.sources.length} {category.sources.length === 1 ? 'index' : 'indexes'}
                    </span>
                  </div>

                  {/* Sub-sources pill links */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {category.sources.map((source) => (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => {
                          onSelectCategory(category.id);
                          onSelectSource(source.id);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] hover:bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] text-left text-xs font-medium text-[#334155] hover:text-[#0F172A] transition-colors flex items-center justify-between group/sub cursor-pointer shadow-2xs"
                      >
                        <span className="truncate">{source.name}</span>
                        <ArrowRight className="w-3 h-3 text-[#94A3B8] group-hover/sub:text-[#0284C7] shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory(category.id);
                    if (category.sources.length > 0) {
                      onSelectSource(category.sources[0].id);
                    }
                  }}
                  className="mt-4 pt-3 border-t border-[#E2E8F0] text-xs font-semibold text-[#64748B] hover:text-[#0284C7] flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span>Explore {category.name} Repositories</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Featured Accessions Presets */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#0284C7]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
              Verified Reference Presets
            </h3>
          </div>
          <span className="text-[11px] font-mono text-[#94A3B8]">
            Click to load &amp; search instantly
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {[
            {
              title: 'Human Beta-Globin (HBB)',
              acc: 'NM_000518',
              sourceId: 'ncbi-nucleotide' as DatabaseSourceId,
              cat: 'NCBI' as DatabaseCategory,
              type: 'mRNA'
            },
            {
              title: 'SARS-CoV-2 Genome',
              acc: 'NC_045512',
              sourceId: 'ncbi-nucleotide' as DatabaseSourceId,
              cat: 'NCBI' as DatabaseCategory,
              type: 'Viral RNA'
            },
            {
              title: 'Hemoglobin Beta Protein',
              acc: 'P68871',
              sourceId: 'uniprot-protein' as DatabaseSourceId,
              cat: 'UniProt' as DatabaseCategory,
              type: 'Protein'
            },
            {
              title: 'B-DNA Dodecamer (1BNA)',
              acc: '1BNA',
              sourceId: 'pdb-dna' as DatabaseSourceId,
              cat: 'RCSB_PDB' as DatabaseCategory,
              type: '3D DNA'
            }
          ].map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                onSelectCategory(preset.cat);
                onSelectSource(preset.sourceId);
                onApplyQuery(preset.acc, preset.sourceId);
              }}
              className="p-2.5 rounded-lg bg-[#F8FAFC] hover:bg-white border border-[#E2E8F0] hover:border-[#38BDF8]/40 text-left transition-all cursor-pointer group shadow-2xs"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono font-bold text-[#0284C7] group-hover:text-[#0369A1]">
                  {preset.acc}
                </span>
                <span className="text-[9px] font-mono text-[#475569] bg-[#E2E8F0] px-1.5 py-0.2 rounded">
                  {preset.type}
                </span>
              </div>
              <p className="text-[11px] text-[#334155] truncate font-sans">
                {preset.title}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
