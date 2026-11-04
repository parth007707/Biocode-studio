import React, { useState, useMemo } from 'react';
import { X, Dna, Plus, AlertCircle, CheckCircle2, Sparkles, FileText, ArrowRight } from 'lucide-react';
import { useBioSequence } from '../../context/BioSequenceContext';
import { validateBiologicalSequence } from '../../lib/bio';

interface NewSequenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export const NewSequenceModal: React.FC<NewSequenceModalProps> = ({
  isOpen,
  onClose,
  onCreated
}) => {
  const { createNewSequence } = useBioSequence();
  const [name, setName] = useState<string>('');
  const [accession, setAccession] = useState<string>('');
  const [organism, setOrganism] = useState<string>('Homo sapiens');
  const [sequenceType, setSequenceType] = useState<'PROTEIN' | 'DNA' | 'RNA'>('PROTEIN');
  const [rawSequence, setRawSequence] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const cleanSeq = useMemo(() => {
    return rawSequence.toUpperCase().replace(/[^A-Z*]/g, '');
  }, [rawSequence]);

  const validation = useMemo(() => {
    if (!cleanSeq) return null;
    return validateBiologicalSequence(cleanSeq, sequenceType);
  }, [cleanSeq, sequenceType]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Please specify a sequence name or title.');
      return;
    }
    if (!cleanSeq) {
      setErrorMsg('Please provide a valid biological sequence.');
      return;
    }
    if (validation && !validation.isValid) {
      setErrorMsg(`Invalid sequence: ${validation.totalInvalidCount} invalid character(s) detected.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const success = await createNewSequence({
        name: name.trim(),
        accession: accession.trim() || undefined,
        organism: organism.trim() || undefined,
        sequenceType,
        sequence: cleanSeq,
        description: description.trim() || undefined
      });

      if (success) {
        onClose();
        if (onCreated) onCreated();
      } else {
        setErrorMsg('Failed to initialize new sequence.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error creating sequence.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyPreset = (preset: { name: string; acc: string; org: string; type: 'PROTEIN' | 'DNA' | 'RNA'; seq: string; desc: string }) => {
    setName(preset.name);
    setAccession(preset.acc);
    setOrganism(preset.org);
    setSequenceType(preset.type);
    setRawSequence(preset.seq);
    setDescription(preset.desc);
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs font-sans animate-fadeIn">
      <div className="bg-white rounded-3xl border border-sky-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-sky-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-500 text-white shadow-xs">
              <Dna className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0F172A] font-display">Create Custom Biological Sequence</h3>
              <p className="text-xs text-slate-600 font-sans">Initialize a custom DNA, RNA, or Protein sequence for real-time analysis</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
              Quick Sample Presets:
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                { name: 'Test Protein', acc: 'CUSTOM_TEST_PROT', org: 'Synthetic', type: 'PROTEIN' as const, seq: 'MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQ', desc: 'Custom 33 aa synthetic alpha-helical peptide' },
                { name: 'Insulin Precursor', acc: 'NP_000198', org: 'Homo sapiens', type: 'PROTEIN' as const, seq: 'MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQVELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN', desc: 'Human insulin hormone precursor (110 aa)' },
                { name: 'GFP Fluorescent Protein', acc: 'P42212', org: 'Aequorea victoria', type: 'PROTEIN' as const, seq: 'MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFSYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITHGMDELYK', desc: 'Green fluorescent protein (238 aa)' }
              ].map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className="px-3 py-1 rounded-lg text-xs font-mono bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 transition-colors cursor-pointer"
                >
                  {p.name} ({p.seq.length} aa)
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Sequence Name / Title *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Test Protein or Alpha-Synuclein"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Accession / ID (Optional)</label>
              <input
                type="text"
                value={accession}
                onChange={(e) => setAccession(e.target.value)}
                placeholder="e.g. CUSTOM_001"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Sequence Type</label>
              <select
                value={sequenceType}
                onChange={(e) => setSequenceType(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                <option value="PROTEIN">PROTEIN (Amino Acids)</option>
                <option value="DNA">DNA (Genomic / Complementary)</option>
                <option value="RNA">RNA (Messenger / Non-coding)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Source Organism (Optional)</label>
              <input
                type="text"
                value={organism}
                onChange={(e) => setOrganism(e.target.value)}
                placeholder="e.g. Homo sapiens or Synthetic"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-700">Raw Biological Sequence *</label>
              <span className="font-mono text-xs font-bold text-[#0284C7] bg-sky-50 px-2.5 py-0.5 rounded border border-sky-200">
                Character Count: {rawSequence.length.toLocaleString()} | Validated: {cleanSeq.length.toLocaleString()} {sequenceType === 'PROTEIN' ? 'aa' : 'bp'}
              </span>
            </div>
            <textarea
              rows={5}
              value={rawSequence}
              onChange={(e) => setRawSequence(e.target.value)}
              placeholder={sequenceType === 'PROTEIN' ? 'MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQ...' : 'ATGCGATCGATCGATC...'}
              className="w-full p-3.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500 resize-none shadow-inner"
            />
            {cleanSeq ? (
              <div className="text-[11px] font-mono flex items-center justify-between text-emerald-700">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Validated {cleanSeq.length.toLocaleString()} {sequenceType.toLowerCase()} residues.</span>
                </span>
                <span className="text-slate-500">
                  {rawSequence.length - cleanSeq.length > 0 ? `${rawSequence.length - cleanSeq.length} whitespace/header chars ignored` : '100% clean'}
                </span>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">Description / Notes (Optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Synthetic variant research target"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Footer actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !cleanSeq || !name.trim()}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <span>Create &amp; Analyze Sequence</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
