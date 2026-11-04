import React, { useState } from 'react';
import { Sparkles, Send, Loader2, ArrowRight, Check, Copy, AlertCircle, Bot } from 'lucide-react';
import { aiService } from '../../services/aiService';
import { AiContextData } from '../../types';

export interface BioAiQuickAnalysisProps {
  accession: string;
  organism?: string;
  sequenceType: string;
  totalLength: number;
  sequence: string;
  onOpenFullAi: (initialMessage?: string, context?: AiContextData) => void;
}

export const BioAiQuickAnalysis: React.FC<BioAiQuickAnalysisProps> = ({
  accession,
  organism,
  sequenceType,
  totalLength,
  sequence,
  onOpenFullAi
}) => {
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string>('gemini-3.1-flash-lite');
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    aiService.getAiConfig().then((cfg) => {
      if (isMounted && cfg?.primaryModel) {
        setModelUsed(cfg.primaryModel);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const quickPrompts = [
    'Explain biological function of this sequence',
    'Calculate key molecular properties',
    'Find potential functional regions and domains',
    'Summarize current analysis and structural risks'
  ];

  const handleAsk = async (queryText?: string) => {
    const q = (queryText || prompt).trim();
    if (!q || isLoading) return;

    if (queryText) {
      setPrompt(queryText);
    }

    setIsLoading(true);
    setError(null);
    setResponse(null);

    const context: AiContextData = {
      type: 'sequence',
      sequenceId: accession,
      accession,
      organism: organism || 'Homo sapiens',
      sequenceType: sequenceType || 'Protein',
      sequenceData: sequence.substring(0, 1500),
      sequenceLength: totalLength
    };

    try {
      const res = await aiService.sendMessageToAi(
        q,
        [],
        context
      );

      setResponse(res.text);
      if (res.modelUsed) {
        setModelUsed(res.modelUsed);
      }
    } catch (err: any) {
      console.error('[BioAI Quick Analysis] Error:', err);
      setError(err?.message || 'Failed to obtain AI analysis. Please verify network connection or retry.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!response) return;
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      className="border border-[#F9A8D4] rounded-2xl p-5 sm:p-6 relative overflow-hidden shadow-[0_4px_25px_rgba(236,72,153,0.06)]"
      style={{
        background: 'linear-gradient(135deg, #FDF2F8 0%, #FFF1F2 100%)'
      }}
    >
      {/* Subtle Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-[#F472B6]/15 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white border border-[#F9A8D4] flex items-center justify-center text-[#EC4899] shadow-xs">
            <Sparkles className="w-4 h-4 text-[#EC4899]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-[#0F172A] tracking-wide font-mono">
                BIOAI INTELLIGENCE PLATFORM
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white text-[#BE185D] border border-[#F9A8D4] font-semibold shadow-2xs">
                GROUNDED SCIENTIFIC COPILOT
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              Biological hypothesis generation, structural fold prediction, and variant impact modeling
            </p>
          </div>
        </div>

        {/* Current Active Sequence Context Pill */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/90 border border-[#F9A8D4] text-xs font-mono shadow-2xs shrink-0">
          <span className="text-[#9D174D] font-bold">TARGET:</span>
          <span className="text-[#0284C7] font-semibold">{accession}</span>
          <span className="text-[#F9A8D4]">•</span>
          <span className="text-[#475569]">{totalLength || sequence.length} {sequenceType.includes('Prot') ? 'aa' : 'bp'}</span>
        </div>
      </div>

      {/* Feature Capabilities Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3.5 relative z-10 text-xs font-mono">
        <div className="bg-white/80 border border-[#FBCFE8] rounded-xl p-2.5 flex items-center gap-2 text-[#9D174D] shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-[#EC4899]" />
          <span className="truncate">Biological Hypothesis Gen</span>
        </div>
        <div className="bg-white/80 border border-[#FBCFE8] rounded-xl p-2.5 flex items-center gap-2 text-[#9D174D] shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
          <span className="truncate">Structure & Function Analysis</span>
        </div>
        <div className="bg-white/80 border border-[#FBCFE8] rounded-xl p-2.5 flex items-center gap-2 text-[#9D174D] shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
          <span className="truncate">Mutation Impact Prediction</span>
        </div>
      </div>

      {/* Suggested Quick Prompt Pills */}
      <div className="flex flex-wrap gap-2 mb-3.5 relative z-10">
        {quickPrompts.map((qp, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleAsk(qp)}
            disabled={isLoading}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-white/90 hover:bg-white text-[#831843] hover:text-[#BE185D] border border-[#FBCFE8] hover:border-[#F9A8D4] transition-all font-mono cursor-pointer disabled:opacity-50 text-left shadow-2xs"
          >
            + {qp}
          </button>
        ))}
      </div>

      {/* Query Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAsk();
        }}
        className="relative flex items-center z-10"
      >
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={`Ask BioAI about ${accession} (e.g., "What functional motifs or domains are present?")...`}
          disabled={isLoading}
          className="w-full bg-white text-[#0F172A] placeholder-[#94A3B8] rounded-xl px-4 py-3 pr-32 border border-[#F9A8D4] focus:outline-none focus:border-[#EC4899] focus:ring-2 focus:ring-[#F9A8D4]/50 text-xs sm:text-sm font-mono transition-colors shadow-2xs"
        />
        <div className="absolute right-2 flex items-center gap-1.5">
          <button
            type="submit"
            disabled={!prompt.trim() || isLoading}
            className="px-4 py-1.5 rounded-lg bg-[#EC4899] hover:bg-[#DB2777] text-white font-bold font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="hidden sm:inline">Synthesizing...</span>
              </>
            ) : (
              <>
                <span>Ask BioAI</span>
                <Send className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Error state */}
      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono flex items-start gap-2 relative z-10">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* Response Box */}
      {response && (
        <div className="mt-4 p-4 rounded-xl bg-white border border-[#F9A8D4] space-y-3 shadow-xs relative z-10">
          <div className="flex items-center justify-between border-b border-[#FBCFE8] pb-2">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#EC4899]" />
              <span className="text-xs font-bold text-[#0F172A] font-mono">
                BIOAI SYNTHESIS
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#FDF2F8] text-[#BE185D] border border-[#F9A8D4]">
                {modelUsed}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs font-mono text-[#64748B] hover:text-[#0F172A] px-2 py-1 rounded hover:bg-[#FDF2F8] transition-colors flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#16A34A]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenFullAi(prompt, {
                  type: 'sequence',
                  sequenceId: accession,
                  accession,
                  organism,
                  sequenceType,
                  sequenceData: sequence,
                  sequenceLength: totalLength
                })}
                className="text-xs font-mono text-[#BE185D] hover:text-[#9D174D] px-2.5 py-1 rounded bg-[#FDF2F8] hover:bg-[#FCE7F3] border border-[#F9A8D4] transition-colors flex items-center gap-1 cursor-pointer font-semibold shadow-2xs"
              >
                <span>Explain in Full AI Copilot</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="text-xs sm:text-sm text-[#334155] leading-relaxed font-sans whitespace-pre-wrap max-h-64 overflow-y-auto pr-2">
            {response}
          </div>
        </div>
      )}
    </div>
  );
};
