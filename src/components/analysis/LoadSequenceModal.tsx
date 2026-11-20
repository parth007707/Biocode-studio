import React, { useState, useEffect, useRef } from 'react';
import { X, Database, Dna, Search, ArrowRight, Loader2, Sparkles, CheckCircle2, Globe, AlertCircle, RotateCcw } from 'lucide-react';
import { useBioSequence } from '../../context/BioSequenceContext';
import { bioService } from '../../services/bioService';
import { uniprotAdapter, ncbiAdapter } from '../../services/adapters';
import { parseAndValidateFasta } from '../../lib/bio/sequenceParser';
import { SequenceRecord } from '../../types';

interface LoadSequenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: () => void;
  onOpenExplorer?: () => void;
}

interface TargetItem {
  accession: string;
  name: string;
  organism: string;
  sequenceType: 'PROTEIN' | 'DNA' | 'RNA';
  length: number;
  description: string;
  sequence?: string;
  source: 'BENCHMARK' | 'SAVED' | 'UNIPROT' | 'NCBI';
}

const SAMPLE_TARGETS: TargetItem[] = [
  {
    accession: 'P68871',
    name: 'Hemoglobin Subunit Beta (HBB)',
    organism: 'Homo sapiens',
    sequenceType: 'PROTEIN',
    length: 147,
    description: 'Adult hemoglobin beta chain responsible for oxygen transport in erythrocytes (UniProtKB Swiss-Prot P68871).',
    sequence: 'MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH',
    source: 'BENCHMARK'
  },
  {
    accession: 'NP_000537',
    name: 'Cellular Tumor Antigen p53',
    organism: 'Homo sapiens',
    sequenceType: 'PROTEIN',
    length: 393,
    description: 'Master tumor suppressor gene transcription factor regulating apoptosis and cell cycle arrest.',
    sequence: 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGPDEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTAKSVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHHERCSDSDGLAPPQHLIRVEGNLRVEYLDDRNTFRHSVVVPYEPPEVGSDCTTIHYNYMCNSSCMGGMNRRPILTIITLEDSSGNLLGRNSFEVRVCACPGRDRRTEEENLRKKGEPHHELPPGSTKRALPNNTSSSPQPKKKPLDGEYFTLQIRGRERFEMFRELNEALELKDAQAGKEPGGSRAHSSHLKSKKGQSTSRHKKLMFKTEGPDSD',
    source: 'BENCHMARK'
  },
  {
    accession: 'NM_000518',
    name: 'Hemoglobin Subunit Beta (HBB) mRNA',
    organism: 'Homo sapiens',
    sequenceType: 'RNA',
    length: 628,
    description: 'Human hemoglobin subunit beta transcript variant 1 mRNA (NCBI RefSeq NM_000518.5).',
    sequence: 'ACATTTGCTTCTGACACAACTGTGTTCACTAGCAACCTCAAACAGACACCATGGTGCATCTGACTCCTGAGGAGAAGTCTGCCGTTACTGCCCTGTGGGGCAAGGTGAACGTGGATGAAGTTGGTGGTGAGGCCCTGGGCAGGCTGCTGGTGGTCTACCCTTGGACCCAGAGGTTCTTTGAGTCCTTTGGGGATCTGTCCACTCCTGATGCTGTTATGGGCAACCCTAAGGTGAAGGCTCATGGCAAGAAAGTGCTCGGTGCCTTTAGTGATGGCCTGGCTCACCTGGACAACCTCAAGGGCACCTTTGCCACACTGAGTGAGCTGCACTGTGACAAGCTGCACGTGGATCCTGAGAACTTCAGGCTCCTGGGCAACGTGCTGGTCTGTGTGCTGGCCCATCACTTTGGCAAAGAATTCACCCCACCAGTGCAGGCTGCCTATCAGAAAGTGGTGGCTGGTGTGGCTAATGCCCTGGCCCACAAGTATCACTAAGCTCGCTTTCTTGCTGTCCAATTTCTATTAAAGGTTCCTTTGTTCCCTAAGTCCAACTACTAAACTGGGGGATATTATGAAGGGCCTTGAGCATCTGGATTCTGCCTAATAAAAAACATTTATTTTCATTGC',
    source: 'BENCHMARK'
  },
  {
    accession: 'NP_000546',
    name: 'Breast Cancer Type 1 Susceptibility Protein (BRCA1)',
    organism: 'Homo sapiens',
    sequenceType: 'PROTEIN',
    length: 300,
    description: 'Tumor suppressor involved in homologous recombination DNA repair (RING domain region).',
    sequence: 'MDLSALRVEEVQNVINAMQKILECPICLELIKEPVSTKCDHIFCKFCMLKLLNQKKGPSQCPLCKNDITKRSLQESTRFSQLVEELLKIICAFQLDTGLEYANSYNFAKKENNSPEHLKDEVSIIQSMGYRNRAKRLLQSEPENPSLQETSLSVQLSNLGTVRTLRTKQRIQPQKTSVYIELGSDSSEDTVNKATYCSVGDQELLQITPQGTRDEISLDSARKLYKTLKKEIKDFNKRLQDDLNLISRKQEK',
    source: 'BENCHMARK'
  },
  {
    accession: 'NP_000198',
    name: 'Insulin Precursor (Preproinsulin)',
    organism: 'Homo sapiens',
    sequenceType: 'PROTEIN',
    length: 110,
    description: 'Key metabolic peptide hormone regulating carbohydrate and fat metabolism.',
    sequence: 'MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQVELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN',
    source: 'BENCHMARK'
  },
  {
    accession: 'YP_009724390',
    name: 'SARS-CoV-2 Spike Glycoprotein (RBD Domain)',
    organism: 'Severe acute respiratory syndrome coronavirus 2',
    sequenceType: 'PROTEIN',
    length: 223,
    description: 'Receptor-binding domain (RBD) interacting with human ACE2 host receptor.',
    sequence: 'RVQPTESIVRFPNITNLCPFGEVFNATRFASVYAWNRKRISNCVADYSVLYNSASFSTFKCYGVSPTKLNDLCFTNVYADSFVIRGDEVRQIAPGQTGKIADYNYKLPDDFTGCVIAWNSNNLDSKVGGNYNYLYRLFRKSNLKPFERDISTEIYQAGSTPCNGVEGFNCYFPLQSYGFQPTNGVGYQPYRVVVLSFELLHAPATVCGPKKSTNLVKNKCVNF',
    source: 'BENCHMARK'
  },
  {
    accession: 'NP_000509',
    name: 'Hemoglobin Subunit Beta (HBB)',
    organism: 'Homo sapiens',
    sequenceType: 'PROTEIN',
    length: 147,
    description: 'Adult hemoglobin beta chain responsible for oxygen transport in erythrocytes (NCBI RefSeq NP_000509).',
    sequence: 'MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH',
    source: 'BENCHMARK'
  },
  {
    accession: 'P42212',
    name: 'Green Fluorescent Protein (GFP)',
    organism: 'Aequorea victoria',
    sequenceType: 'PROTEIN',
    length: 238,
    description: 'Bioluminescent jellyfish protein with internal fluorophore formation.',
    sequence: 'MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFSYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITHGMDELYK',
    source: 'BENCHMARK'
  }
];

export const LoadSequenceModal: React.FC<LoadSequenceModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  onOpenExplorer
}) => {
  const { loadTarget } = useBioSequence();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [savedSequences, setSavedSequences] = useState<SequenceRecord[]>([]);
  const [loadingSaved, setLoadingSaved] = useState<boolean>(false);

  // Online Search & Live Fetch State
  const [onlineResults, setOnlineResults] = useState<TargetItem[]>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState<boolean>(false);
  const [fetchingAccession, setFetchingAccession] = useState<string | null>(null);
  const [fetchStatusMsg, setFetchStatusMsg] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<{ accession: string; message: string; target: TargetItem } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSavedRecords();
      setFetchError(null);
      setFetchingAccession(null);
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [isOpen]);

  const loadSavedRecords = async () => {
    setLoadingSaved(true);
    try {
      const records = await bioService.getSequenceRecords();
      setSavedSequences(records || []);
    } catch (e) {
      console.warn('Could not load saved database sequences:', e);
    } finally {
      setLoadingSaved(false);
    }
  };

  // Debounced Online Query when user types in search bar
  useEffect(() => {
    const term = searchTerm.trim();
    if (!term || term.length < 2) {
      setOnlineResults([]);
      setIsSearchingOnline(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingOnline(true);
      try {
        const results: TargetItem[] = [];

        // Check if query looks like UniProt accession (e.g. P68871, P04637, Q9BYF1)
        const isUniProtAcc = /^[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]{5}$/i.test(term);

        if (isUniProtAcc) {
          // Direct entry metadata check for exact UniProt accession
          try {
            const entry = await uniprotAdapter.fetchEntryByAccession(term);
            if (entry) {
              results.push({
                accession: entry.metadata.primaryAccession,
                name: entry.metadata.proteinName,
                organism: entry.metadata.organismName,
                sequenceType: 'PROTEIN',
                length: entry.metadata.sequenceLength,
                description: `UniProtKB Reviewed Entry ${entry.metadata.primaryAccession}`,
                sequence: entry.fasta,
                source: 'UNIPROT'
              });
            }
          } catch {
            // fallback to search
          }
        }

        // Search UniProt
        const searchRes = await uniprotAdapter.search({ query: term, size: 4 });
        if (searchRes.items && searchRes.items.length > 0) {
          for (const item of searchRes.items) {
            if (!results.some((r) => r.accession.toUpperCase() === item.primaryAccession.toUpperCase())) {
              results.push({
                accession: item.primaryAccession,
                name: item.proteinName,
                organism: item.organismName,
                sequenceType: 'PROTEIN',
                length: item.sequenceLength,
                description: `UniProtKB ${item.reviewed ? 'Swiss-Prot' : 'TrEMBL'} Record (${item.uniProtkbId})`,
                source: 'UNIPROT'
              });
            }
          }
        }

        // Check NCBI if nucleotide-like accession (e.g. NM_000518, NC_045512)
        if (/^(NM_|NC_|NR_|XM_|NG_|M[0-9]+)/i.test(term)) {
          results.push({
            accession: term.toUpperCase(),
            name: `NCBI Nucleotide Record ${term.toUpperCase()}`,
            organism: 'Homo sapiens',
            sequenceType: 'RNA',
            length: 0,
            description: `Live NCBI Entrez Nucleotide Sequence Record`,
            source: 'NCBI'
          });
        }

        setOnlineResults(results);
      } catch (e) {
        console.warn('[LoadSequenceModal] Online search failed:', e);
      } finally {
        setIsSearchingOnline(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  if (!isOpen) return null;

  /**
   * Main Load Target Handler
   * Retrieves real sequence via unified sequence loader, validates FASTA, and commits to application state.
   */
  const handleLoadTarget = async (target: TargetItem) => {
    const acc = target.accession.trim().toUpperCase();
    setFetchError(null);
    setFetchingAccession(acc);
    setFetchStatusMsg(`Retrieving biological sequence for ${acc} from ${target.source === 'NCBI' ? 'NCBI Entrez' : 'UniProt REST API'}...`);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await loadTarget({
        accession: acc,
        source: target.source === 'NCBI' ? 'NCBI' : target.source === 'SAVED' ? 'SAVED' : target.source === 'BENCHMARK' ? 'BENCHMARK' : 'UNIPROT',
        sequenceType: target.sequenceType,
        name: target.name,
        definition: target.name || target.description,
        organism: target.organism,
        sequence: target.sequence,
        signal: controller.signal
      });

      if (!result.success || !result.sequence) {
        throw new Error(result.error || `Failed to retrieve sequence data for ${acc}`);
      }

      setFetchingAccession(null);
      setFetchStatusMsg(null);
      onClose();
      if (onSelect) onSelect();
    } catch (err: any) {
      console.warn(`[LoadSequenceModal] Failed to load target ${acc}:`, err);
      setFetchingAccession(null);
      setFetchStatusMsg(null);
      setFetchError({
        accession: acc,
        message: err.message || `Failed to retrieve sequence data from biological repository.`,
        target
      });
    }
  };

  const handleSelectSaved = (rec: SequenceRecord) => {
    handleLoadTarget({
      accession: rec.accession,
      name: rec.definition || rec.accession,
      organism: rec.organism || 'Homo sapiens',
      sequenceType: (rec.sequence_type === 'Genomic DNA' ? 'DNA' : rec.sequence_type === 'RNA' ? 'RNA' : 'PROTEIN') as any,
      length: rec.total_length || 0,
      description: rec.definition || 'Saved database sequence',
      sequence: rec.sequence,
      source: 'SAVED'
    });
  };

  const filteredSamples = SAMPLE_TARGETS.filter(
    (s) =>
      s.accession.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.organism.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSaved = savedSequences.filter(
    (s) =>
      s.accession.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.definition && s.definition.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/50 backdrop-blur-xs font-sans animate-fadeIn">
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-sky-200 shadow-2xl max-w-3xl w-full max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-gradient-to-r from-sky-50 to-indigo-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-[#0284C7] text-white shadow-xs shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-[#0F172A] font-display truncate">Load Biological Sequence Target</h3>
              <p className="text-xs text-slate-600 font-sans">Select a verified benchmark protein, saved project target, or query NCBI / UniProt</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Explorer Shortcut */}
        <div className="p-4 sm:p-6 pb-3 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by accession (e.g. P68871, NM_000518), gene name, or organism..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>
          {onOpenExplorer && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenExplorer();
              }}
              className="w-full sm:w-auto justify-center px-4 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-[#0284C7] border border-sky-200 text-xs font-semibold font-mono flex items-center gap-2 transition-colors shrink-0 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>Browse Data Explorer</span>
            </button>
          )}
        </div>

        {/* Loading / Error Notifications */}
        {fetchingAccession && (
          <div className="mx-4 sm:mx-6 mt-4 p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-800 flex items-center gap-2.5 animate-fadeIn">
            <Loader2 className="w-4 h-4 animate-spin text-[#0284C7] shrink-0" />
            <span className="font-mono">{fetchStatusMsg || `Loading ${fetchingAccession}...`}</span>
          </div>
        )}

        {fetchError && (
          <div className="mx-4 sm:mx-6 mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <div>
                <span className="font-semibold block font-mono">Failed to load target {fetchError.accession}:</span>
                <span className="text-[11px]">{fetchError.message}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleLoadTarget(fetchError.target)}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-mono font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Sequence List */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1">
          {/* Live Online Query Results (UniProt / NCBI) */}
          {searchTerm.trim().length >= 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-sky-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-sky-600" />
                  <span>Online Repositories (UniProtKB & NCBI Entrez)</span>
                </span>
                {isSearchingOnline && (
                  <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin text-sky-600" />
                    <span>Searching API...</span>
                  </span>
                )}
              </div>

              {onlineResults.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5">
                  {onlineResults.map((target) => (
                    <div
                      key={target.accession}
                      onClick={() => handleLoadTarget(target)}
                      className="p-3.5 sm:p-4 rounded-2xl border border-sky-200 hover:border-sky-400 bg-sky-50/30 hover:bg-sky-50 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 group"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sm text-[#0284C7]">{target.accession}</span>
                          <span className="text-[10px] font-mono bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-bold">
                            {target.source}
                          </span>
                          <span className="text-[10px] font-mono bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-bold">
                            {target.organism}
                          </span>
                          {target.length > 0 && (
                            <span className="text-[10px] font-mono text-slate-500">{target.length} {target.sequenceType === 'PROTEIN' ? 'aa' : 'bp'}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 font-sans font-medium">{target.name}</p>
                        <p className="text-[11px] text-slate-500 font-sans">{target.description}</p>
                      </div>
                      <button
                        type="button"
                        disabled={fetchingAccession === target.accession}
                        className="px-3.5 py-1.5 rounded-xl bg-white group-hover:bg-[#0284C7] group-hover:text-white border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        {fetchingAccession === target.accession ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Loading...</span>
                          </>
                        ) : (
                          <>
                            <span>Load Target</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                !isSearchingOnline && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 font-mono flex items-center justify-between">
                    <span>Query &quot;{searchTerm}&quot; on live repository</span>
                    <button
                      type="button"
                      onClick={() => handleLoadTarget({
                        accession: searchTerm.trim().toUpperCase(),
                        name: `Target ${searchTerm.trim().toUpperCase()}`,
                        organism: 'Homo sapiens',
                        sequenceType: 'PROTEIN',
                        length: 0,
                        description: `Live biological accession ${searchTerm.trim().toUpperCase()}`,
                        source: 'UNIPROT'
                      })}
                      className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <span>Fetch from UniProt</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {/* Saved Sequences from Supabase */}
          {filteredSaved.length > 0 && (
            <div className="space-y-3">
              <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                Saved Database Sequences ({filteredSaved.length})
              </span>
              <div className="grid grid-cols-1 gap-2.5">
                {filteredSaved.map((rec) => (
                  <div
                    key={rec.id}
                    onClick={() => handleSelectSaved(rec)}
                    className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 hover:border-sky-400 hover:bg-sky-50/50 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 group"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-[#0F172A]">{rec.accession}</span>
                        <span className="text-[10px] font-mono bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-bold">
                          {rec.sequence_type || 'Protein'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">{rec.total_length} aa</span>
                      </div>
                      <p className="text-xs text-slate-600 truncate max-w-lg">{rec.definition || 'Saved sequence target'}</p>
                    </div>
                    <button
                      type="button"
                      className="w-full sm:w-auto justify-center px-3.5 py-1.5 rounded-xl bg-white group-hover:bg-[#0284C7] group-hover:text-white border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs shrink-0 cursor-pointer"
                    >
                      <span>Load Target</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Curated Benchmark Library */}
          <div className="space-y-3">
            <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
              Curated Benchmark Sequences ({filteredSamples.length})
            </span>
            <div className="grid grid-cols-1 gap-2.5">
              {filteredSamples.map((sample) => (
                <div
                  key={sample.accession}
                  onClick={() => handleLoadTarget(sample)}
                  className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 hover:border-sky-400 hover:bg-sky-50/50 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm text-[#0F172A]">{sample.accession}</span>
                      <span className="font-bold text-xs text-slate-800 font-sans">{sample.name}</span>
                      <span className="text-[10px] font-mono bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-bold">
                        {sample.organism}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">{sample.length} {sample.sequenceType === 'PROTEIN' ? 'aa' : 'bp'}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-sans">{sample.description}</p>
                  </div>
                  <button
                    type="button"
                    disabled={fetchingAccession === sample.accession}
                    className="px-3.5 py-1.5 rounded-xl bg-white group-hover:bg-[#0284C7] group-hover:text-white border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {fetchingAccession === sample.accession ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Loading...</span>
                      </>
                    ) : (
                      <>
                        <span>Load Target</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
