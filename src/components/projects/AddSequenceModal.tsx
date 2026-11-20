import React, { useState, useEffect } from 'react';
import { X, Plus, Search, Dna, FileText, Loader2, Check, AlertCircle, Database } from 'lucide-react';
import { SequenceRecord } from '../../types';
import { bioService } from '../../services/bioService';
import { ExternalDatabaseSearchTab } from './ExternalDatabaseSearchTab';

interface AddSequenceModalProps {
  isOpen: boolean;
  projectId: string;
  userId?: string;
  existingSequenceIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export const AddSequenceModal: React.FC<AddSequenceModalProps> = ({
  isOpen,
  projectId,
  userId,
  existingSequenceIds,
  onClose,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'existing' | 'new' | 'external'>('existing');
  const [allSequences, setAllSequences] = useState<SequenceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Sequence Form State
  const [accession, setAccession] = useState<string>('');
  const [rawSequence, setRawSequence] = useState<string>('');
  const [sequenceType, setSequenceType] = useState<string>('Genomic DNA');
  const [organism, setOrganism] = useState<string>('Homo sapiens');
  const [definition, setDefinition] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadAvailableSequences();
      setErrorMsg(null);
      setSelectedSequenceId(null);
      setAccession('');
      setRawSequence('');
      setDefinition('');
      setOrganism('Homo sapiens');
      setSequenceType('Genomic DNA');
    }
  }, [isOpen, projectId]);

  const loadAvailableSequences = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Force refresh sequence records scoped to the active visitor session
      const records = await bioService.getSequenceRecords(userId, true);
      const safeRecords = Array.isArray(records) ? records : [];
      setAllSequences(safeRecords);
    } catch (err: any) {
      console.error('[AddSequenceModal] Error loading sequence records:', err);
      setErrorMsg(err?.message || 'Failed to retrieve sequence records from database.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddExisting = async () => {
    if (!selectedSequenceId) {
      setErrorMsg('Please select a sequence to add.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const ok = await bioService.addSequenceToProject(projectId, selectedSequenceId, userId);
      if (ok) {
        onSuccess();
        onClose();
      } else {
        setErrorMsg('Failed to add sequence to project.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error associating sequence with project.');
    } finally {
      setSubmitting(false);
    }
  };

  const cleanSequenceText = (seq: string): string => {
    return seq.replace(/[\s\r\n\t]+/g, '').toUpperCase();
  };

  const validateSequenceContent = (cleanSeq: string, seqType: string): string | null => {
    if (!cleanSeq) {
      return 'Sequence content is required. Please enter or paste valid sequence data.';
    }

    if (seqType === 'Genomic DNA' || seqType === 'DNA' || seqType === 'mRNA Transcript' || seqType === 'RNA') {
      const isRNA = seqType === 'mRNA Transcript' || seqType === 'RNA';
      const dnaPattern = /^[ACGTRYSWKMBDHVN]+$/i;
      const rnaPattern = /^[ACGURYSWKMBDHVN]+$/i;
      const pattern = isRNA ? rnaPattern : dnaPattern;

      if (!pattern.test(cleanSeq)) {
        return isRNA
          ? 'Invalid character(s) in RNA sequence. Allowed characters: A, C, G, U, N and IUPAC nucleotide codes.'
          : 'Invalid character(s) in DNA sequence. Allowed characters: A, C, G, T, N and IUPAC nucleotide codes.';
      }
    } else if (seqType === 'PROTEIN' || seqType === 'Protein Sequence') {
      const proteinPattern = /^[ACDEFGHIKLMNPQRSTVWYXZBJ*]+$/i;
      if (!proteinPattern.test(cleanSeq)) {
        return 'Invalid character(s) in Protein sequence. Allowed characters: standard single-letter amino acid codes (A-Z, *).';
      }
    }

    return null;
  };

  const handleSequenceInputChange = (val: string) => {
    setRawSequence(val);
    const trimmed = val.trim();
    if (trimmed.startsWith('>')) {
      const lines = trimmed.split('\n');
      const headerLine = lines[0].slice(1).trim();
      const spaceIdx = headerLine.search(/\s/);
      let parsedAcc = '';
      let parsedDef = '';
      if (spaceIdx !== -1) {
        parsedAcc = headerLine.slice(0, spaceIdx).trim();
        parsedDef = headerLine.slice(spaceIdx).trim();
      } else {
        parsedAcc = headerLine;
      }
      if (parsedAcc && !accession) {
        setAccession(parsedAcc);
      }
      if (parsedDef && !definition) {
        setDefinition(parsedDef);
      }
    }
  };

  const handleImportNew = async (e: React.FormEvent) => {
    e.preventDefault();

    let targetAcc = accession.trim();
    let targetDef = definition.trim();
    let rawContent = rawSequence.trim();

    if (rawContent.startsWith('>')) {
      const lines = rawContent.split('\n');
      const headerLine = lines[0].slice(1).trim();
      rawContent = lines.slice(1).join('');
      const spaceIdx = headerLine.search(/\s/);
      if (!targetAcc) {
        targetAcc = spaceIdx !== -1 ? headerLine.slice(0, spaceIdx).trim() : headerLine;
      }
      if (!targetDef && spaceIdx !== -1) {
        targetDef = headerLine.slice(spaceIdx).trim();
      }
    }

    const finalSeq = cleanSequenceText(rawContent);

    if (!targetAcc) {
      setErrorMsg('Sequence accession or identifier is required.');
      return;
    }

    const valError = validateSequenceContent(finalSeq, sequenceType);
    if (valError) {
      setErrorMsg(valError);
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await bioService.createSequenceRecord(userId, {
        source: 'Direct Input',
        accession: targetAcc,
        sequence: finalSeq,
        sequence_type: sequenceType,
        organism: organism.trim() || 'Homo sapiens',
        definition: targetDef || `${targetAcc} Sequence`,
        total_length: finalSeq.length,
        topology: 'linear',
        project_id: projectId,
        metadata: {
          imported_at: new Date().toISOString(),
          created_via: 'AddSequenceModal'
        }
      });

      if (res.error) {
        if (res.error.toLowerCase().includes('duplicate key') || res.error.toLowerCase().includes('unique constraint')) {
          throw new Error(`A sequence record with accession "${targetAcc}" already exists in the database.`);
        }
        throw new Error(`Database error: ${res.error}`);
      }

      if (res.data?.id) {
        const newSeqId = res.data.id;
        const assocOk = await bioService.addSequenceToProject(projectId, newSeqId, userId);
        if (!assocOk) {
          throw new Error('Sequence created in database, but failed to associate with project.');
        }
        onSuccess();
        onClose();
      } else {
        throw new Error('Failed to persist new sequence record into database.');
      }
    } catch (err: any) {
      console.error('[AddSequenceModal] Import error:', err);
      setErrorMsg(err.message || 'Failed to import and associate new sequence.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const safeExistingIds = Array.isArray(existingSequenceIds) ? existingSequenceIds : [];
  const unassociatedSequences = allSequences.filter((seq) => !safeExistingIds.includes(seq.id));

  const normalizeValue = (val: any): string => {
    if (val === null || val === undefined) return '';
    return String(val)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/gi, '');
  };

  const normalizeBasic = (val: any): string => {
    if (val === null || val === undefined) return '';
    return String(val).toLowerCase().trim();
  };

  const filteredSequences = unassociatedSequences.filter((seq) => {
    if (!searchQuery || !searchQuery.trim()) return true;
    const rawQ = normalizeBasic(searchQuery);
    const normQ = normalizeValue(searchQuery);

    const fieldsToSearch = [
      seq.accession,
      seq.definition,
      seq.organism,
      seq.sequence_type,
      seq.molecule_type,
      seq.source,
      seq.version,
      seq.topology,
      seq.sequence,
      seq.metadata ? (typeof seq.metadata === 'object' ? JSON.stringify(seq.metadata) : String(seq.metadata)) : ''
    ];

    return fieldsToSearch.some((field) => {
      if (!field) return false;
      const basicField = normalizeBasic(field);
      if (basicField.includes(rawQ)) return true;
      if (normQ && normalizeValue(field).includes(normQ)) return true;
      return false;
    });
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-2xl bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[92dvh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-[#E2E8F0] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-[#0284C7] shrink-0">
              <Dna className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-[#0F172A] tracking-tight">Add Sequence to Project</h3>
              <p className="text-xs text-[#64748B] truncate">Associate an existing database sequence or import a new one</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-4 sm:px-6 pt-3 sm:pt-4 border-b border-[#E2E8F0] flex items-center gap-4 shrink-0 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('existing')}
            className={`pb-3 text-xs font-medium border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'existing'
                ? 'border-[#38BDF8] text-[#0284C7] font-semibold'
                : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            Select Existing Sequence ({unassociatedSequences.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={`pb-3 text-xs font-medium border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'new'
                ? 'border-[#38BDF8] text-[#0284C7] font-semibold'
                : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            Import / Create New Sequence
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('external')}
            className={`pb-3 text-xs font-medium border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'external'
                ? 'border-[#38BDF8] text-[#0284C7] font-semibold'
                : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Search External Databases</span>
          </button>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1">
          {activeTab === 'existing' ? (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter sequence records by accession, organism, or definition..."
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono"
                />
              </div>

              {loading ? (
                <div className="py-12 text-center space-y-2">
                  <Loader2 className="w-6 h-6 text-[#0284C7] animate-spin mx-auto" />
                  <p className="text-xs font-mono text-[#64748B]">Querying database sequence records...</p>
                </div>
              ) : filteredSequences.length === 0 ? (
                <div className="py-12 text-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-6">
                  <Dna className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
                  <p className="text-xs font-medium text-[#334155]">
                    {searchQuery.trim()
                      ? `No sequence records matching "${searchQuery}"`
                      : 'No unassociated sequence records found'}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-1">
                    {searchQuery.trim()
                      ? 'Try adjusting your search query or clear filters.'
                      : 'All existing database sequences are already in this project, or try importing a new sequence.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                  {filteredSequences.map((seq) => {
                    const isSelected = selectedSequenceId === seq.id;
                    return (
                      <div
                        key={seq.id}
                        onClick={() => setSelectedSequenceId(seq.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-sky-50 border-[#38BDF8] text-[#0F172A] shadow-xs'
                            : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-[#CBD5E1] text-[#334155]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected ? 'border-[#0284C7] bg-[#0284C7] text-white' : 'border-[#CBD5E1]'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-mono font-bold text-[#0284C7] truncate">
                                {seq.accession}
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-[#475569] border border-[#E2E8F0]">
                                {seq.sequence_type || 'Genomic DNA'}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#64748B] truncate">{seq.definition || seq.organism}</p>
                          </div>
                        </div>
                        <div className="text-left sm:text-right text-[11px] font-mono text-[#64748B] shrink-0 pl-7 sm:pl-0 sm:ml-4">
                          {(seq.total_length || 0).toLocaleString()} {seq.sequence_type === 'PROTEIN' ? 'aa' : 'bp'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 sm:gap-3 pt-4 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto justify-center px-4 py-2 rounded-xl bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] hover:text-[#0F172A] text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddExisting}
                  disabled={!selectedSequenceId || submitting}
                  className="w-full sm:w-auto justify-center px-5 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Associate Selected Sequence</span>
                </button>
              </div>
            </div>
          ) : activeTab === 'new' ? (
            <form onSubmit={handleImportNew} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#334155]">Sequence Accession / ID *</label>
                  <input
                    type="text"
                    required
                    value={accession}
                    onChange={(e) => setAccession(e.target.value)}
                    placeholder="e.g., NM_000518.5"
                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#334155]">Sequence Type</label>
                  <select
                    value={sequenceType}
                    onChange={(e) => setSequenceType(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2.5 text-xs text-[#0F172A] focus:outline-none focus:border-[#38BDF8] font-mono cursor-pointer"
                  >
                    <option value="Genomic DNA">Genomic DNA</option>
                    <option value="mRNA Transcript">mRNA Transcript</option>
                    <option value="PROTEIN">Protein Sequence</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#334155]">Organism Reference</label>
                  <input
                    type="text"
                    value={organism}
                    onChange={(e) => setOrganism(e.target.value)}
                    placeholder="e.g., Homo sapiens"
                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#334155]">Definition / Description</label>
                  <input
                    type="text"
                    value={definition}
                    onChange={(e) => setDefinition(e.target.value)}
                    placeholder="e.g., GFP Green Fluorescent Protein Wild Type"
                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-[#334155]">Sequence Data (FASTA or Raw) *</label>
                  <div className="flex flex-wrap items-center gap-2">
                    {rawSequence.trim().startsWith('>') && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-50 text-[#0284C7] border border-sky-200 font-semibold">
                        ✓ FASTA Format Detected
                      </span>
                    )}
                    {rawSequence.trim().length > 0 && (
                      <span className="text-[10px] font-mono text-[#475569] bg-[#F1F5F9] px-2 py-0.5 rounded border border-[#CBD5E1]">
                        Length: {cleanSequenceText(rawSequence).length.toLocaleString()} {sequenceType === 'PROTEIN' || sequenceType === 'Protein Sequence' ? 'aa' : 'bp'}
                      </span>
                    )}
                  </div>
                </div>
                <textarea
                  rows={4}
                  required
                  value={rawSequence}
                  onChange={(e) => handleSequenceInputChange(e.target.value)}
                  placeholder="Paste FASTA (>Header...) or raw sequence data (e.g. ATGGATTT... or MSKGEE...)"
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-4 text-xs font-mono text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#38BDF8] resize-none uppercase"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 sm:gap-3 pt-4 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto justify-center px-4 py-2 rounded-xl bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] hover:text-[#0F172A] text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto justify-center px-5 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-all shadow-xs disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Import & Associate Sequence</span>
                </button>
              </div>
            </form>
          ) : (
            <ExternalDatabaseSearchTab
              projectId={projectId}
              userId={userId}
              existingSequenceIds={existingSequenceIds}
              allSequences={allSequences}
              onSuccess={onSuccess}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
};
