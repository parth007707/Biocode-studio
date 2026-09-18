import React, { useState, useRef } from 'react';
import { parseFasta } from '../../../lib/bio';
import { 
  FileUp, 
  CheckCircle2, 
  AlertCircle, 
  Dna, 
  ArrowRight, 
  FileCode, 
  Sparkles,
  Trash2
} from 'lucide-react';

interface FastaImportViewProps {
  onAnalyzeInWorkbench: (fastaString: string) => void;
}

export const FastaImportView: React.FC<FastaImportViewProps> = ({ onAnalyzeInWorkbench }) => {
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [fileData, setFileData] = useState<{
    fileName: string;
    fileSize: number;
    rawText: string;
    parsedHeader: string | null;
    parsedSequence: string;
    sequenceLength: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setError(null);
    if (!file) return;

    const validExtensions = ['.fasta', '.fa', '.fna', '.faa', '.seq', '.txt'];
    const isExtensionValid = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!isExtensionValid) {
      setError(`Unsupported file format. Please upload a FASTA sequence file (${validExtensions.join(', ')}).`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        if (!content || !content.trim()) {
          setError('The uploaded file is empty.');
          return;
        }

        const parsed = parseFasta(content);
        setFileData({
          fileName: file.name,
          fileSize: file.size,
          rawText: content,
          parsedHeader: parsed.header,
          parsedSequence: parsed.sequence,
          sequenceLength: parsed.sequence.length
        });
      } catch (err: any) {
        setError(`Failed to parse FASTA file: ${err.message}`);
      }
    };
    reader.onerror = () => {
      setError('An error occurred while reading the file.');
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
            FASTA File Ingestion
          </span>
          <span className="text-xs text-slate-500 font-mono">/</span>
          <span className="text-xs text-slate-300 font-medium">
            Local Multi-Format Parser
          </span>
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">
          Upload Biological FASTA File
        </h2>
        <p className="text-xs text-slate-400">
          Upload raw genomic DNA, transcript RNA, or protein sequence FASTA files for automated ingestion and multi-engine processing.
        </p>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          dragActive
            ? 'border-emerald-500 bg-emerald-500/5 scale-[0.99]'
            : 'border-slate-800 hover:border-slate-700 bg-[#0B0F17]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".fasta,.fa,.fna,.faa,.seq,.txt"
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <FileUp className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">
              Drag and drop your FASTA file here, or <span className="text-emerald-400 underline">browse</span>
            </p>
            <p className="text-xs text-slate-500 font-mono">
              Supported formats: .fasta, .fa, .fna, .faa, .seq, .txt
            </p>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2.5 text-xs text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Parsed File Preview */}
      {fileData && (
        <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Parsed Sequence Details
              </h3>
            </div>

            <button
              type="button"
              onClick={() => setFileData(null)}
              className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear File</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">File Name</span>
              <span className="text-xs font-mono font-medium text-slate-200 truncate block">
                {fileData.fileName}
              </span>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">Sequence Length</span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {fileData.sequenceLength.toLocaleString()} residues / bp
              </span>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">FASTA Header</span>
              <span className="text-xs font-mono text-slate-300 truncate block">
                {fileData.parsedHeader ? `>${fileData.parsedHeader}` : 'No FASTA header'}
              </span>
            </div>
          </div>

          {/* Sequence Preview Snippet */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-mono text-slate-500">Residue Stream Preview:</span>
            <div className="p-3 bg-[#080B11] border border-slate-800 rounded-lg font-mono text-xs text-slate-300 break-all max-h-32 overflow-y-auto custom-scrollbar">
              {fileData.parsedSequence.slice(0, 300)}
              {fileData.parsedSequence.length > 300 && (
                <span className="text-slate-500 italic"> ...(+{fileData.parsedSequence.length - 300} more residues)</span>
              )}
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => onAnalyzeInWorkbench(fileData.rawText)}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs rounded-lg transition-all flex items-center gap-2 shadow-md shadow-emerald-500/20 cursor-pointer"
            >
              <Dna className="w-4 h-4" />
              <span>Analyze Sequence in Workbench</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
