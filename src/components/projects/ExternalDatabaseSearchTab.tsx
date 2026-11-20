import React, { useState, useRef, useEffect } from 'react';
import { Search, Loader2, Database, Dna, Eye, Download, Check, AlertCircle, FileText, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { SequenceRecord } from '../../types';
import { ncbiAdapter, NCBIDocumentSummary } from '../../services/adapters/ncbiAdapter';
import { DatabaseSearchResult } from '../../services/adapters/types';
import { bioService } from '../../services/bioService';

interface ExternalDatabaseSearchTabProps {
  projectId: string;
  userId?: string;
  existingSequenceIds: string[];
  allSequences: SequenceRecord[];
  onSuccess: () => void;
  onClose: () => void;
}

export const cleanSequenceText = (seq: string): string => {
  return seq.replace(/[\s\r\n\t]+/g, '').toUpperCase();
};

export interface SequenceValidationResult {
  isValid: boolean;
  detectedMoleculeType: string;
  sequenceType: string;
  cleanSequence: string;
  invalidCharacters: string[];
  errorMessage?: string;
  wasTransformed?: boolean;
}

export const validateNCBISequence = (
  rawFastaOrSeq: string,
  record: Partial<NCBIDocumentSummary>
): SequenceValidationResult => {
  if (!rawFastaOrSeq || !rawFastaOrSeq.trim()) {
    return {
      isValid: false,
      detectedMoleculeType: 'Unknown',
      sequenceType: 'Unknown',
      cleanSequence: '',
      invalidCharacters: [],
      errorMessage: 'Sequence content is empty. Please ensure NCBI returned valid sequence data.'
    };
  }

  let seqBody = rawFastaOrSeq.trim();
  if (seqBody.startsWith('>')) {
    const lines = seqBody.split(/\r?\n/);
    seqBody = lines.slice(1).join('');
  }
  const cleanSeq = seqBody.replace(/[\s\r\n\t]+/g, '').toUpperCase();

  if (!cleanSeq) {
    return {
      isValid: false,
      detectedMoleculeType: 'Unknown',
      sequenceType: 'Unknown',
      cleanSequence: '',
      invalidCharacters: [],
      errorMessage: 'No biological residues found after stripping FASTA headers.'
    };
  }

  const isProteinDb = record.sourceDb === 'protein';
  const molTypeHint = (record.moltype || record.molecule_type || '').toLowerCase();
  const seqTypeHint = (record.sequence_type || record.title || record.definition || '').toLowerCase();

  if (isProteinDb || molTypeHint.includes('protein') || seqTypeHint.includes('protein')) {
    const validProteinPattern = /^[ACDEFGHIKLMNPQRSTVWYXZBJ*]+$/;
    if (validProteinPattern.test(cleanSeq)) {
      return {
        isValid: true,
        detectedMoleculeType: 'protein',
        sequenceType: 'Protein',
        cleanSequence: cleanSeq,
        invalidCharacters: []
      };
    } else {
      const invalidChars = Array.from(new Set(cleanSeq.replace(/[ACDEFGHIKLMNPQRSTVWYXZBJ*]/g, '').split('')));
      return {
        isValid: false,
        detectedMoleculeType: 'protein',
        sequenceType: 'Protein',
        cleanSequence: cleanSeq,
        invalidCharacters: invalidChars,
        errorMessage: `Sequence contains invalid character(s) for protein: ${invalidChars.join(', ')}.`
      };
    }
  }

  const hasT = /T/.test(cleanSeq);
  const hasU = /U/.test(cleanSeq);

  if (hasT && hasU) {
    return {
      isValid: false,
      detectedMoleculeType: 'Mixed Nucleotide (DNA/RNA)',
      sequenceType: 'Invalid',
      cleanSequence: cleanSeq,
      invalidCharacters: ['T and U'],
      errorMessage: 'Biologically invalid: Sequence contains both Thymine (T) and Uracil (U). DNA and RNA nucleotide alphabets cannot be combined.'
    };
  }

  const dnaPattern = /^[ACGTRYSWKMBDHVN]+$/;
  const rnaPattern = /^[ACGURYSWKMBDHVN]+$/;

  let detectedMol = 'DNA';
  let seqType = record.sequence_type || (seqTypeHint.includes('mrna') || molTypeHint.includes('mrna') || seqTypeHint.includes('transcript') ? 'mRNA Transcript' : 'Genomic DNA');
  let finalSeq = cleanSeq;
  let wasTransformed = false;

  if (hasU && !hasT) {
    detectedMol = 'RNA';
    seqType = 'RNA Transcript';
    if (!rnaPattern.test(cleanSeq)) {
      const invalidChars = Array.from(new Set(cleanSeq.replace(/[ACGURYSWKMBDHVN]/g, '').split('')));
      return {
        isValid: false,
        detectedMoleculeType: 'RNA',
        sequenceType: seqType,
        cleanSequence: cleanSeq,
        invalidCharacters: invalidChars,
        errorMessage: `Sequence contains invalid character(s) for RNA: ${invalidChars.join(', ')}.`
      };
    }
  } else {
    detectedMol = 'DNA';
    if (!dnaPattern.test(cleanSeq)) {
      const invalidChars = Array.from(new Set(cleanSeq.replace(/[ACGTRYSWKMBDHVN]/g, '').split('')));
      return {
        isValid: false,
        detectedMoleculeType: 'DNA',
        sequenceType: seqType,
        cleanSequence: cleanSeq,
        invalidCharacters: invalidChars,
        errorMessage: `Sequence contains invalid character(s) for DNA: ${invalidChars.join(', ')}.`
      };
    }

    const isExplicitRNA = molTypeHint === 'rna' || (record.accession && record.accession.startsWith('NR_'));
    if (isExplicitRNA && hasT) {
      finalSeq = cleanSeq.replace(/T/g, 'U');
      detectedMol = 'RNA';
      seqType = 'RNA Transcript';
      wasTransformed = true;
    }
  }

  return {
    isValid: true,
    detectedMoleculeType: detectedMol,
    sequenceType: seqType,
    cleanSequence: finalSeq,
    invalidCharacters: [],
    wasTransformed
  };
};

export const validateSequenceContent = (cleanSeq: string, seqType: string): string | null => {
  const result = validateNCBISequence(cleanSeq, { sequence_type: seqType });
  return result.isValid ? null : (result.errorMessage || 'Invalid sequence content');
};

export const ExternalDatabaseSearchTab: React.FC<ExternalDatabaseSearchTabProps> = ({
  projectId,
  userId,
  existingSequenceIds,
  allSequences,
  onSuccess,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDb, setSelectedDb] = useState<'nucleotide' | 'protein' | 'gene'>('nucleotide');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResult, setSearchResult] = useState<DatabaseSearchResult<NCBIDocumentSummary> | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Detail View State
  const [detailRecord, setDetailRecord] = useState<NCBIDocumentSummary | null>(null);
  const [detailFasta, setDetailFasta] = useState<string | null>(null);
  const [detailLoadingFasta, setDetailLoadingFasta] = useState<boolean>(false);
  const [detailFastaError, setDetailFastaError] = useState<string | null>(null);
  const [copiedFasta, setCopiedFasta] = useState<boolean>(false);

  // Import State
  const [importingAccession, setImportingAccession] = useState<string | null>(null);
  const [importStatusMsg, setImportStatusMsg] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const executeSearch = async (queryToSearch?: string, dbToSearch?: 'nucleotide' | 'protein' | 'gene') => {
    const term = (queryToSearch !== undefined ? queryToSearch : searchTerm).trim();
    const db = dbToSearch || selectedDb;

    if (!term) {
      setSearchError('Please enter a search query (e.g. BRCA1, TP53, EGFP, Homo sapiens BRCA1).');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      const result = await ncbiAdapter.search({
        db,
        term,
        retmax: 20,
        signal: controller.signal
      });

      if (controller.signal.aborted) return;

      if (result.status === 'error') {
        setSearchError(result.message || 'NCBI database search failed. Please try again.');
      } else {
        setSearchResult(result);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[ExternalDatabaseSearch] Search exception:', err);
      setSearchError(err.message || 'Failed to query NCBI Entrez database.');
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch();
  };

  const handlePresetSearch = (term: string, db: 'nucleotide' | 'protein' | 'gene' = 'nucleotide') => {
    setSearchTerm(term);
    setSelectedDb(db);
    executeSearch(term, db);
  };

  const handleViewDetails = async (record: NCBIDocumentSummary) => {
    setDetailRecord(record);
    setDetailFasta(null);
    setDetailFastaError(null);
    setDetailLoadingFasta(true);

    try {
      const fasta = await ncbiAdapter.fetchFasta(record.sourceDb, record.accession);
      setDetailFasta(fasta);
    } catch (err: any) {
      console.error('[ExternalDatabaseSearch] Error fetching FASTA details:', err);
      setDetailFastaError(err.message || 'Unable to retrieve complete sequence FASTA for this record.');
    } finally {
      setDetailLoadingFasta(false);
    }
  };

  const closeDetailsModal = () => {
    setDetailRecord(null);
    setDetailFasta(null);
    setDetailFastaError(null);
  };

  const handleCopyFasta = () => {
    if (detailFasta) {
      navigator.clipboard.writeText(detailFasta);
      setCopiedFasta(true);
      setTimeout(() => setCopiedFasta(false), 2000);
    }
  };

  // Central Import Handler
  const handleImportRecord = async (record: NCBIDocumentSummary, providedFasta?: string) => {
    setImportingAccession(record.accession);
    setImportStatusMsg(`Fetching complete record for ${record.accession}...`);
    setImportError(null);

    try {
      // 1. Obtain complete FASTA sequence from NCBI
      let rawFasta = providedFasta || '';
      if (!rawFasta) {
        rawFasta = await ncbiAdapter.fetchFasta(record.sourceDb, record.accession);
      }

      if (!rawFasta || !rawFasta.trim()) {
        throw new Error(`Failed to retrieve sequence data for ${record.accession} from NCBI.`);
      }

      // 2. Validate biological sequence against detected molecule type (Requirement 2 & 2F)
      const valRes = validateNCBISequence(rawFasta, record);

      if (!valRes.isValid) {
        const errorDetail = [
          'NCBI record retrieved, but sequence validation failed.',
          `Accession: ${record.accession}`,
          `Detected Molecule Type: ${valRes.detectedMoleculeType}`,
          `Invalid Character(s): ${valRes.invalidCharacters.join(', ') || 'None'}`,
          `Reason: ${valRes.errorMessage || 'Unknown sequence validation error.'}`
        ].join('\n');

        setImportError(errorDetail);
        setImportingAccession(null);
        setImportStatusMsg(null);
        return;
      }

      const cleanSeq = valRes.cleanSequence;
      setImportStatusMsg('Checking database for duplicate accessions...');

      // 3. Check duplicate in existing Supabase sequence records
      const targetAccClean = record.accession.trim().toLowerCase();
      const targetAccBase = targetAccClean.split('.')[0];

      const existingRecord = allSequences.find((seq) => {
        if (!seq.accession) return false;
        const accLower = seq.accession.trim().toLowerCase();
        const accBase = accLower.split('.')[0];
        return accLower === targetAccClean || accBase === targetAccBase;
      });

      const safeExistingIds = Array.isArray(existingSequenceIds) ? existingSequenceIds : [];

      if (existingRecord) {
        // Record already exists in Supabase
        const isAlreadyInProject = safeExistingIds.includes(existingRecord.id);

        if (isAlreadyInProject) {
          setImportStatusMsg(`Record ${existingRecord.accession} is already associated with this project.`);
          setTimeout(() => {
            setImportingAccession(null);
            setImportStatusMsg(null);
          }, 2000);
          return;
        }

        // Associate existing record with project
        setImportStatusMsg(`Associating existing record (${existingRecord.accession}) with project...`);
        const assocOk = await bioService.addSequenceToProject(projectId, existingRecord.id, userId);
        if (!assocOk) {
          throw new Error(`Failed to associate existing record ${existingRecord.accession} with project.`);
        }

        setImportStatusMsg(`Successfully associated ${existingRecord.accession} with project!`);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 800);
        return;
      }

      // 4. Record does NOT exist in Supabase — INSERT new record into `sequence_records`
      setImportStatusMsg(`Inserting ${record.accession} into sequence records...`);

      const dbLabel = getDatabaseLabel(record.sourceDb);
      const orgName = record.organism || 'Homo sapiens';
      const defText = record.definition || record.title || `${record.accession} NCBI Sequence`;

      const createRes = await bioService.createSequenceRecord(userId, {
        source: 'NCBI',
        accession: record.accession,
        version: record.version || (record.accession.includes('.') ? record.accession.split('.')[1] : undefined),
        organism: orgName,
        molecule_type: valRes.detectedMoleculeType,
        sequence_type: valRes.sequenceType,
        definition: defText,
        total_length: cleanSeq.length,
        topology: record.topology || 'linear',
        sequence: cleanSeq,
        project_id: projectId,
        metadata: {
          database: dbLabel,
          source_db: record.sourceDb,
          ncbi_uid: record.uid,
          external_database_id: record.uid,
          strand: record.strand,
          imported_at: new Date().toISOString(),
          imported_via: 'ExternalDatabaseSearch',
          was_transformed: valRes.wasTransformed || false
        }
      });

      if (createRes.error) {
        if (createRes.error.toLowerCase().includes('duplicate') || createRes.error.toLowerCase().includes('unique')) {
          setImportStatusMsg(`Accession ${record.accession} exists in database. Fetching latest sequence list...`);
          const latestRecords = await bioService.getSequenceRecords(userId, true);
          const match = (latestRecords || []).find(s => s.accession?.toLowerCase().includes(targetAccBase));
          if (match) {
            await bioService.addSequenceToProject(projectId, match.id, userId);
            onSuccess();
            onClose();
            return;
          }
        }
        throw new Error(`Database error: ${createRes.error}`);
      }

      if (!createRes.data?.id) {
        throw new Error('Database insertion did not return a valid record ID.');
      }

      const newSeqId = createRes.data.id;

      // 5. Associate inserted record with project
      setImportStatusMsg('Associating imported sequence with current project...');
      const assocSuccess = await bioService.addSequenceToProject(projectId, newSeqId, userId);

      if (!assocSuccess) {
        throw new Error('Sequence record inserted, but project association failed.');
      }

      setImportStatusMsg('Import completed successfully!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 600);

    } catch (err: any) {
      console.error('[ExternalDatabaseSearch] Import error:', err);
      setImportError(err.message || 'Failed to import sequence from NCBI.');
      setImportingAccession(null);
      setImportStatusMsg(null);
    }
  };

  const getDatabaseLabel = (db: string) => {
    switch (db) {
      case 'protein': return 'NCBI Protein';
      case 'gene': return 'NCBI Gene';
      case 'nucleotide':
      default:
        return 'NCBI Nucleotide';
    }
  };

  return (
    <div className="space-y-5">
      {/* Search Bar & Database Selector */}
      <form onSubmit={handleFormSubmit} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search NCBI by gene, accession, organism (e.g. BRCA1, TP53, EGFP, Homo sapiens BRCA1)"
              className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <select
              value={selectedDb}
              onChange={(e) => setSelectedDb(e.target.value as 'nucleotide' | 'protein' | 'gene')}
              className="w-full sm:w-auto min-w-0 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2.5 text-xs text-[#0F172A] focus:outline-none focus:border-[#38BDF8] font-mono cursor-pointer"
            >
              <option value="nucleotide">NCBI Nucleotide (DNA/RNA)</option>
              <option value="protein">NCBI Protein</option>
              <option value="gene">NCBI Gene</option>
            </select>

            <button
              type="submit"
              disabled={isSearching}
              className="w-full sm:w-auto justify-center px-4 py-2.5 bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Searching NCBI...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Search NCBI</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#64748B]">
          <span className="text-[#64748B] font-medium">Quick Queries:</span>
          <button
            type="button"
            onClick={() => handlePresetSearch('BRCA1', 'nucleotide')}
            className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-sky-50 text-[#0284C7] font-mono transition-colors border border-[#E2E8F0] cursor-pointer font-semibold"
          >
            BRCA1
          </button>
          <button
            type="button"
            onClick={() => handlePresetSearch('TP53', 'nucleotide')}
            className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-sky-50 text-[#0284C7] font-mono transition-colors border border-[#E2E8F0] cursor-pointer font-semibold"
          >
            TP53
          </button>
          <button
            type="button"
            onClick={() => handlePresetSearch('EGFP', 'nucleotide')}
            className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-sky-50 text-[#0284C7] font-mono transition-colors border border-[#E2E8F0] cursor-pointer font-semibold"
          >
            EGFP
          </button>
          <button
            type="button"
            onClick={() => handlePresetSearch('Homo sapiens BRCA1', 'nucleotide')}
            className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-sky-50 text-[#0284C7] font-mono transition-colors border border-[#E2E8F0] cursor-pointer font-semibold"
          >
            Homo sapiens BRCA1
          </button>
        </div>
      </form>

      {/* NCBI Query Information Display */}
      {searchResult && searchResult.constructedQuery && (
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-mono text-[#64748B] overflow-x-auto shadow-xs">
          <span className="text-[#0284C7] font-semibold shrink-0">NCBI Query Used:</span>
          <code className="text-[#0F172A] select-all font-mono whitespace-nowrap">{searchResult.constructedQuery}</code>
        </div>
      )}

      {/* Global Status / Import Notification */}
      {importStatusMsg && (
        <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-[#0284C7] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#0284C7] shrink-0" />
            <span>{importStatusMsg}</span>
          </div>
        </div>
      )}

      {importError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{importError}</span>
          </div>
          <button onClick={() => setImportError(null)} className="text-[#64748B] hover:text-[#0F172A] text-xs">Dismiss</button>
        </div>
      )}

      {searchError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{searchError}</span>
        </div>
      )}

      {/* Search Results List */}
      {isSearching ? (
        <div className="py-12 text-center space-y-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-6">
          <Loader2 className="w-8 h-8 text-[#0284C7] animate-spin mx-auto" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[#0F172A]">Querying NCBI Entrez E-Utilities API...</p>
            <p className="text-[11px] text-[#64748B] font-mono">Searching {selectedDb.toUpperCase()} database for "{searchTerm}"</p>
          </div>
        </div>
      ) : searchResult ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B] px-1">
            <span className="font-medium text-[#334155]">
              Search Results ({searchResult.totalCount.toLocaleString()} total matches)
            </span>
            <span className="font-mono text-[11px] text-[#64748B]">
              Showing top {searchResult.items.length} records • {searchResult.executionTimeMs}ms
            </span>
          </div>

          {searchResult.items.length === 0 ? (
            <div className="py-12 text-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-6">
              <Database className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
              <p className="text-xs font-medium text-[#334155]">No records found for "{searchResult.query}"</p>
              <p className="text-[11px] text-[#64748B] mt-1">
                Try adjusting your search terms or switching the target database (Nucleotide / Protein / Gene).
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
              {searchResult.items.map((item, idx) => {
                const isImporting = importingAccession === item.accession;
                const safeExistingIds = Array.isArray(existingSequenceIds) ? existingSequenceIds : [];
                const targetAccClean = item.accession.trim().toLowerCase();
                const existingRec = allSequences.find(s => s.accession?.trim().toLowerCase() === targetAccClean || s.accession?.trim().toLowerCase().startsWith(targetAccClean.split('.')[0]));
                const isAlreadyInProject = existingRec ? safeExistingIds.includes(existingRec.id) : false;

                return (
                  <div
                    key={item.uid ? `ext-res-${item.uid}` : `ext-res-${item.accession}-${idx}`}
                    className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#CBD5E1] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-[#0284C7] bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-md">
                          {item.accession}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-[#475569] border border-[#E2E8F0]">
                          {getDatabaseLabel(item.sourceDb)}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-[#475569] border border-[#E2E8F0]">
                          {item.sequence_type || item.molecule_type || 'Genomic DNA'}
                        </span>
                      </div>

                      <h4 className="text-xs font-medium text-[#0F172A] line-clamp-2 leading-relaxed">
                        {item.definition || item.title}
                      </h4>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#64748B] font-mono">
                        <span>Organism: <strong className="text-[#334155]">{item.organism || 'Homo sapiens'}</strong></span>
                        <span>Length: <strong className="text-[#334155]">{(item.length || 0).toLocaleString()} {item.sourceDb === 'protein' ? 'aa' : 'bp'}</strong></span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 self-stretch sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleViewDetails(item)}
                        className="px-3 py-1.5 rounded-lg bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#334155] text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#64748B]" />
                        <span>View Details</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleImportRecord(item)}
                        disabled={isImporting || isAlreadyInProject}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                          isAlreadyInProject
                            ? 'bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0] cursor-not-allowed'
                            : 'bg-[#0284C7] hover:bg-[#0369a1] text-white shadow-xs disabled:opacity-50'
                        }`}
                      >
                        {isImporting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Importing...</span>
                          </>
                        ) : isAlreadyInProject ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#0284C7]" />
                            <span>In Project</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>Import</span>
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
        <div className="py-12 text-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-6">
          <Database className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
          <p className="text-xs font-medium text-[#334155]">Search NCBI Entrez Biological Databases</p>
          <p className="text-[11px] text-[#64748B] mt-1 max-w-md mx-auto">
            Search millions of real DNA, RNA, and Protein records from NCBI E-Utilities. Type a gene name, accession, or organism above to begin.
          </p>
        </div>
      )}

      {/* Record Details Modal / Drawer */}
      {detailRecord && (
        <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-2xl bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[92dvh] animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 border-b border-[#E2E8F0] flex items-center justify-between gap-2 shrink-0 bg-[#F8FAFC]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-[#0284C7] shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-[#0284C7]">{detailRecord.accession}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-[#475569] border border-[#E2E8F0]">
                      {getDatabaseLabel(detailRecord.sourceDb)}
                    </span>
                  </div>
                  <h3 className="text-xs font-medium text-[#0F172A] truncate mt-0.5">{detailRecord.definition || detailRecord.title}</h3>
                </div>
              </div>

              <button
                type="button"
                onClick={closeDetailsModal}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              {/* Record Summary Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0] text-xs">
                <div>
                  <span className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider block">Accession</span>
                  <span className="font-mono text-[#0284C7] font-bold">{detailRecord.accession}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider block">Organism</span>
                  <span className="text-[#0F172A] font-medium truncate block">{detailRecord.organism || 'Homo sapiens'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider block">Sequence Type</span>
                  <span className="text-[#0F172A] font-mono">{detailRecord.sequence_type || detailRecord.molecule_type || 'Genomic DNA'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider block">Total Length</span>
                  <span className="text-[#0F172A] font-mono">{(detailRecord.length || 0).toLocaleString()} {detailRecord.sourceDb === 'protein' ? 'aa' : 'bp'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider block">Topology</span>
                  <span className="text-[#0F172A] font-mono">{detailRecord.topology || 'linear'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider block">Source Database</span>
                  <span className="text-[#0F172A] font-mono uppercase">{detailRecord.sourceDb}</span>
                </div>
              </div>

              {/* Definition */}
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider block">Full Definition</span>
                <p className="text-xs text-[#334155] bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] leading-relaxed font-sans">
                  {detailRecord.definition || detailRecord.title}
                </p>
              </div>

              {/* FASTA Sequence Viewer */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider block">
                    Authoritative FASTA Sequence
                  </span>
                  {detailFasta && (
                    <button
                      type="button"
                      onClick={handleCopyFasta}
                      className="text-[10px] font-mono text-[#0284C7] hover:text-[#0369a1] flex items-center gap-1 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 cursor-pointer font-semibold"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedFasta ? 'Copied!' : 'Copy FASTA'}</span>
                    </button>
                  )}
                </div>

                {detailLoadingFasta ? (
                  <div className="py-8 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-center space-y-2">
                    <Loader2 className="w-5 h-5 text-[#0284C7] animate-spin mx-auto" />
                    <p className="text-xs font-mono text-[#64748B]">Fetching complete sequence from NCBI...</p>
                  </div>
                ) : detailFastaError ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{detailFastaError}</span>
                  </div>
                ) : detailFasta ? (
                  <textarea
                    readOnly
                    rows={6}
                    value={detailFasta}
                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-3 text-[11px] font-mono text-[#0F172A] custom-scrollbar focus:outline-none resize-none"
                  />
                ) : null}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-3.5 sm:p-4 border-t border-[#E2E8F0] bg-[#F8FAFC] flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={closeDetailsModal}
                className="w-full sm:w-auto justify-center px-4 py-2 rounded-xl bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] hover:text-[#0F172A] text-xs font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  if (detailRecord) {
                    handleImportRecord(detailRecord, detailFasta || undefined);
                    closeDetailsModal();
                  }
                }}
                disabled={importingAccession === detailRecord.accession}
                className="w-full sm:w-auto justify-center px-5 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Import to BioCode Studio</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
