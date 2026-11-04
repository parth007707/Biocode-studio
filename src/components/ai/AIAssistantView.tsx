import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  RotateCcw, 
  Trash2, 
  Database, 
  Dna, 
  FolderKanban, 
  AlertCircle, 
  Check, 
  Copy, 
  History, 
  ChevronDown, 
  ChevronUp, 
  Info, 
  Activity, 
  Layers,
  HelpCircle,
  FlaskConical,
  MessageSquare
} from 'lucide-react';
import { 
  AiContextData, 
  AiConversation, 
  AiMessage, 
  AiSequenceContext, 
  AiProjectContext, 
  AiDashboardContext, 
  AiHistoryContext 
} from '../../types';
import { aiService } from '../../services/aiService';

interface AIAssistantViewProps {
  user?: any;
  activeContext?: AiContextData | null;
  onSelectContextTab?: (tab: string, id?: string) => void;
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  user,
  activeContext,
  onSelectContextTab,
}) => {
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<AiConversation | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [inputVal, setInputVal] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [isContextExpanded, setIsContextExpanded] = useState<boolean>(true);
  const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState<boolean>(false);

  const [primaryConfiguredModel, setPrimaryConfiguredModel] = useState<string>('gemini-3.1-flash-lite');
  const [lastModelUsed, setLastModelUsed] = useState<string>('gemini-3.1-flash-lite');

  const formatModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Gemini';
    if (modelId === 'gemini-3.1-flash-lite') return 'Gemini 3.1 Flash Lite';
    if (modelId === 'gemini-flash-lite-latest') return 'Gemini Flash Lite (Latest)';
    if (modelId === 'gemini-3.5-flash-lite') return 'Gemini 3.5 Flash Lite';
    if (modelId === 'gemini-3.8-flash') return 'Gemini 3.8 Flash';
    if (modelId === 'gemini-3.6-flash') return 'Gemini 3.6 Flash';
    return modelId.replace('models/', '');
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isGeneratingRef = useRef<boolean>(false);

  // Fetch actual backend model configuration on mount
  useEffect(() => {
    let isMounted = true;
    aiService.getAiConfig().then((cfg) => {
      if (isMounted && cfg?.primaryModel) {
        setPrimaryConfiguredModel(cfg.primaryModel);
        setLastModelUsed(cfg.primaryModel);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // React to activeContext changes (e.g. when opened from sequence workbench or project detail)
  useEffect(() => {
    if (activeContext && activeContext.type !== 'dashboard') {
      handleCreateNewSession();
    }
  }, [activeContext]);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // Load user's conversations on mount or user change
  useEffect(() => {
    const loadConversations = async () => {
      const convs = await aiService.getConversations(user?.id);
      setConversations(convs);

      if (convs.length > 0) {
        const latest = convs[0];
        setActiveConversation(latest);
        const msgs = await aiService.getMessages(latest.id);
        setMessages(msgs);
      } else {
        await handleCreateNewSession();
      }
    };

    loadConversations();
  }, [user?.id]);

  // Handle creating a brand new session
  const handleCreateNewSession = async () => {
    setErrorMessage(null);
    let title = 'General BioAI Session';
    let contextType = activeContext?.type || 'dashboard';

    if (activeContext?.type === 'sequence') {
      title = `Analysis: ${(activeContext as AiSequenceContext).accession}`;
    } else if (activeContext?.type === 'project') {
      title = `Project: ${(activeContext as AiProjectContext).projectName}`;
    } else if (activeContext?.type === 'history') {
      title = `History: ${(activeContext as AiHistoryContext).accession}`;
    }

    const newConv = await aiService.createConversation(
      user?.id,
      title,
      contextType as any,
      activeContext || undefined,
      (activeContext as AiProjectContext)?.projectId || (activeContext as AiSequenceContext)?.projectId,
      (activeContext as AiSequenceContext)?.sequenceId
    );

    setConversations((prev) => [newConv, ...prev.filter(c => c.id !== newConv.id)]);
    setActiveConversation(newConv);
    setMessages([]);

    // Add initial welcome greeting message
    const welcomeMsg = buildWelcomeMessage(activeContext);
    const savedWelcome = await aiService.saveMessage(
      newConv.id,
      'ai',
      'model',
      welcomeMsg,
      user?.id,
      { isWelcome: true }
    );

    setMessages([savedWelcome]);
  };

  // Switch to an existing conversation
  const handleSelectConversation = async (conv: AiConversation) => {
    setActiveConversation(conv);
    setErrorMessage(null);
    const msgs = await aiService.getMessages(conv.id);
    setMessages(msgs);
    setIsHistorySidebarOpen(false);
  };

  // Delete conversation
  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    await aiService.deleteConversation(convId);
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeConversation?.id === convId) {
      const remaining = conversations.filter((c) => c.id !== convId);
      if (remaining.length > 0) {
        handleSelectConversation(remaining[0]);
      } else {
        await handleCreateNewSession();
      }
    }
  };

  // Build welcome text based on context
  function buildWelcomeMessage(ctx?: AiContextData | null): string {
    if (!ctx || ctx.type === 'dashboard') {
      return `Hello. I am **BioAI**, your scientific assistant for BioCode Studio. 

I am connected to your active database and ready to answer questions regarding your sequence records, projects, structural validations, and bioinformatics pipelines.

How can I assist your research today?`;
    }

    if (ctx.type === 'sequence') {
      const seqCtx = ctx as AiSequenceContext;
      return `Hello. I have loaded the sequence context for **${seqCtx.accession}** (${seqCtx.sequenceType || 'Sequence'}, ${seqCtx.sequenceLength || 0} ${seqCtx.sequenceType === 'Protein' ? 'aa' : 'bp'}).

${seqCtx.selectedAnalysis ? `Active Analysis: **${seqCtx.selectedAnalysis}**` : ''}
${seqCtx.definition ? `Definition: *${seqCtx.definition}*` : ''}

You can ask me questions such as:
- *"What does the molecular weight and pI indicate?"*
- *"Explain the hydropathy result in simple terms."*
- *"What are the major structural characteristics of this sequence?"*
- *"Summarize this analysis with evidence from the current context."*`;
    }

    if (ctx.type === 'project') {
      const projCtx = ctx as AiProjectContext;
      return `Hello. I have loaded the project context for **"${projCtx.projectName}"** (${projCtx.organism || 'Homo sapiens'}).

Associated Sequences: **${projCtx.associatedSequences?.length || 0}**
${projCtx.researchObjective ? `Research Objective: *${projCtx.researchObjective}*` : ''}

How can I help you analyze the sequences or findings in this project?`;
    }

    if (ctx.type === 'history') {
      const histCtx = ctx as AiHistoryContext;
      return `Hello. I have loaded the historic analysis record for **${histCtx.accession}** (${histCtx.analysisType}).

How can I help you interpret these saved results?`;
    }

    return `Hello. I am BioAI, your scientific assistant. Ask me anything about your current BioCode Studio session.`;
  }

  // Handle sending a user prompt
  const handleSendPrompt = async (promptText?: string) => {
    const textToSend = promptText || inputVal;
    if (!textToSend.trim() || isGenerating || isGeneratingRef.current || !activeConversation) return;

    isGeneratingRef.current = true;
    setErrorMessage(null);
    setInputVal('');
    setIsGenerating(true);

    try {
      // Save user message to DB/state
      const userMsg = await aiService.saveMessage(
        activeConversation.id,
        'user',
        'user',
        textToSend,
        user?.id
      );

      setMessages((prev) => [...prev, userMsg]);

      // Build conversation history for API
      const historyForApi = messages
        .filter((m) => !m.metadata?.isWelcome)
        .map((m) => ({
          role: m.sender === 'user' ? ('user' as const) : ('model' as const),
          content: m.content,
        }));

      // Call server AI API route
      const aiResponse = await aiService.sendMessageToAi(
        textToSend,
        historyForApi,
        activeContext || undefined
      );

      if (aiResponse.modelUsed) {
        setLastModelUsed(aiResponse.modelUsed);
      }

      // Save AI response
      const aiMsg = await aiService.saveMessage(
        activeConversation.id,
        'ai',
        'model',
        aiResponse.text,
        user?.id,
        { modelUsed: aiResponse.modelUsed }
      );

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.error('[BioAI Generation Error]', err);
      if (err?.modelUsed) {
        setLastModelUsed(err.modelUsed);
      }
      setErrorMessage(
        err?.message || 'Failed to generate AI response. Please verify network connectivity.'
      );
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  };

  // Handle retrying the last failed request without creating a duplicate user message
  const handleRetry = async () => {
    if (isGenerating || isGeneratingRef.current || !activeConversation || messages.length === 0) return;

    const lastUserMsg = [...messages].reverse().find((m) => m.sender === 'user');
    if (!lastUserMsg) return;

    isGeneratingRef.current = true;
    setErrorMessage(null);
    setIsGenerating(true);

    try {
      // Build conversation history excluding the last user message to avoid duplication in history
      const historyForApi = messages
        .filter((m) => !m.metadata?.isWelcome && m.id !== lastUserMsg.id)
        .map((m) => ({
          role: m.sender === 'user' ? ('user' as const) : ('model' as const),
          content: m.content,
        }));

      const aiResponse = await aiService.sendMessageToAi(
        lastUserMsg.content,
        historyForApi,
        activeContext || undefined
      );

      if (aiResponse.modelUsed) {
        setLastModelUsed(aiResponse.modelUsed);
      }

      const aiMsg = await aiService.saveMessage(
        activeConversation.id,
        'ai',
        'model',
        aiResponse.text,
        user?.id,
        { modelUsed: aiResponse.modelUsed }
      );

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.error('[BioAI Retry Error]', err);
      if (err?.modelUsed) {
        setLastModelUsed(err.modelUsed);
      }
      setErrorMessage(
        err?.message || 'Failed to generate AI response. Please verify network connectivity.'
      );
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // Render context-specific prompt chips
  const renderContextPromptChips = () => {
    let prompts: string[] = [];

    if (!activeContext || activeContext.type === 'dashboard') {
      prompts = [
        "What can BioCode Studio help me analyze?",
        "Explain the workflow for sequence analysis and protein structures.",
        "How are sequence records and mutation histories stored?"
      ];
    } else if (activeContext.type === 'sequence') {
      const seq = activeContext as AiSequenceContext;
      prompts = [
        `What does the molecular weight and pI indicate for ${seq.accession}?`,
        "Explain the hydropathy result in simple terms.",
        "What are the major characteristics of this sequence?",
        "Summarize this analysis with evidence from current context.",
        "Which mutation or region is most significant?"
      ];
    } else if (activeContext.type === 'project') {
      const proj = activeContext as AiProjectContext;
      prompts = [
        `How many sequences are associated with project "${proj.projectName}"?`,
        "Summarize the research objectives and available analyses in this project.",
        "Which sequence in this project has the highest analyzed length?"
      ];
    } else if (activeContext.type === 'history') {
      prompts = [
        "Summarize this historic analysis.",
        "Explain the calculated results and biological significance."
      ];
    }

    return (
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-2 no-scrollbar text-xs">
        <span className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider shrink-0 flex items-center gap-1">
          <HelpCircle className="w-3 h-3 text-[#EC4899]" /> Prompts:
        </span>
        {prompts.map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendPrompt(p)}
            disabled={isGenerating}
            className="shrink-0 px-3 py-1 rounded-full bg-[#F8FAFC] hover:bg-[#FDF2F8] border border-[#E2E8F0] hover:border-[#F472B6]/50 text-[#475569] hover:text-[#DB2777] transition-all font-mono text-[11px] disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            {p}
          </button>
        ))}
      </div>
    );
  };

  // Render Formatted Message Text with Grounding Badge Highlights
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');

    return (
      <div className="space-y-2 text-xs leading-relaxed text-[#0F172A]">
        {lines.map((line, idx) => {
          let renderedLine = line;

          // Check for grounding tags
          const hasDbFact = line.includes('[DATABASE FACT]');
          const hasCalcRes = line.includes('[CALCULATED RESULT]');
          const hasAiInterp = line.includes('[AI INTERPRETATION]');
          const hasGenKnow = line.includes('[GENERAL BIOLOGICAL KNOWLEDGE]');

          // Headings
          if (line.startsWith('### ')) {
            return (
              <h3 key={idx} className="text-sm font-bold text-[#0F172A] font-mono mt-3 mb-1 border-b border-[#E2E8F0] pb-1 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#EC4899]" />
                {line.replace('### ', '')}
              </h3>
            );
          }

          if (line.startsWith('## ')) {
            return (
              <h2 key={idx} className="text-base font-bold text-[#0F172A] font-mono mt-4 mb-1">
                {line.replace('## ', '')}
              </h2>
            );
          }

          // Bullet points
          if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            const bulletText = line.trim().substring(2);
            return (
              <div key={idx} className="flex items-start gap-2 pl-2 my-1">
                <span className="text-[#EC4899] font-bold">•</span>
                <span className="flex-1">{parseInlineStyles(bulletText)}</span>
              </div>
            );
          }

          // Render grounding badge replacement if present
          if (hasDbFact || hasCalcRes || hasAiInterp || hasGenKnow) {
            return (
              <div key={idx} className="my-1.5 p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  {hasDbFact && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      DATABASE FACT
                    </span>
                  )}
                  {hasCalcRes && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-50 text-[#0284C7] border border-sky-200">
                      CALCULATED RESULT
                    </span>
                  )}
                  {hasAiInterp && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-pink-50 text-[#DB2777] border border-pink-200">
                      AI INTERPRETATION
                    </span>
                  )}
                  {hasGenKnow && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]">
                      GENERAL BIOLOGICAL KNOWLEDGE
                    </span>
                  )}
                </div>
                <div className="text-[#334155]">{parseInlineStyles(line.replace(/\[(DATABASE FACT|CALCULATED RESULT|AI INTERPRETATION|GENERAL BIOLOGICAL KNOWLEDGE)\]/g, ''))}</div>
              </div>
            );
          }

          if (!line.trim()) return <div key={idx} className="h-1" />;

          return <p key={idx}>{parseInlineStyles(line)}</p>;
        })}
      </div>
    );
  };

  // Helper to parse bold (**text**) and code (`code`) inline
  function parseInlineStyles(text: string) {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-[#0F172A]">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="bg-[#F1F5F9] border border-[#E2E8F0] text-[#0284C7] px-1.5 py-0.5 rounded font-mono text-[11px]">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#F8FAFC] text-[#0F172A] overflow-hidden font-sans">
      {/* Session History Sidebar (Collapsible) */}
      <div className={`${isHistorySidebarOpen ? 'w-72 border-r border-[#E2E8F0]' : 'w-0'} transition-all duration-300 overflow-hidden bg-white flex flex-col shrink-0`}>
        <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <h3 className="font-semibold text-xs text-[#0F172A] font-mono flex items-center gap-2">
            <History className="w-4 h-4 text-[#EC4899]" />
            BioAI Sessions
          </h3>
          <button
            onClick={() => setIsHistorySidebarOpen(false)}
            className="text-[#64748B] hover:text-[#0F172A] text-xs font-mono cursor-pointer"
          >
            Close
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={handleCreateNewSession}
            className="w-full py-2 px-3 rounded-xl bg-[#FDF2F8] border border-[#F472B6]/30 text-[#DB2777] font-mono text-xs hover:bg-[#FCE7F3] transition-all flex items-center justify-center gap-2 font-medium cursor-pointer shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#EC4899]" />
            + New BioAI Session
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1 py-2">
          {conversations.map((conv) => {
            const isActive = activeConversation?.id === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                className={`group p-2.5 rounded-xl text-xs cursor-pointer transition-all flex items-center justify-between border ${
                  isActive 
                    ? 'bg-[rgba(236,72,153,0.08)] border-[#F472B6]/40 text-[#0F172A] font-semibold' 
                    : 'bg-white border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                  <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#EC4899]' : 'text-[#94A3B8]'}`} />
                  <span className="truncate font-mono text-[11px]">{conv.title}</span>
                </div>
                <button
                  onClick={(e) => handleDeleteConversation(e, conv.id)}
                  title="Delete Session"
                  className="opacity-0 group-hover:opacity-100 text-[#94A3B8] hover:text-[#EF4444] p-1 rounded transition-opacity cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full bg-[#F8FAFC]">
        {/* Top Header Bar */}
        <div className="px-6 py-4 border-b border-[#E2E8F0] bg-white flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsHistorySidebarOpen(!isHistorySidebarOpen)}
              className="p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A] transition-colors cursor-pointer"
              title="Toggle History Sidebar"
            >
              <History className="w-4 h-4 text-[#EC4899]" />
            </button>
            <div>
              <h2 className="text-sm font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#EC4899]" />
                BioAI Scientific Assistant
              </h2>
              <p className="text-[11px] text-[#64748B] font-mono">
                Grounded Reasoning Engine • Powered by {formatModelDisplayName(lastModelUsed)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateNewSession}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#E2E8F0] text-[#475569] hover:text-[#DB2777] hover:border-[#F472B6]/40 text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>New Session</span>
            </button>

            <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1.5 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Context Connected
            </span>
          </div>
        </div>

        {/* CURRENT AI CONTEXT INDICATOR PANEL */}
        <div className="bg-white border-b border-[#E2E8F0]">
          <div 
            onClick={() => setIsContextExpanded(!isContextExpanded)}
            className="px-6 py-2.5 flex items-center justify-between cursor-pointer hover:bg-[#F8FAFC] transition-colors select-none"
          >
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-[#EC4899]" />
              <span className="text-xs font-bold font-mono text-[#DB2777] uppercase tracking-wider">AI CONTEXT</span>
              <span className="text-[11px] text-[#64748B] font-mono font-medium">
                ({activeContext?.type ? activeContext.type.toUpperCase() : 'GENERAL'})
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] text-[#64748B] font-mono">
                {activeContext?.type === 'sequence' && `Accession: ${(activeContext as AiSequenceContext).accession}`}
                {activeContext?.type === 'project' && `Project: ${(activeContext as AiProjectContext).projectName}`}
                {activeContext?.type === 'history' && `History: ${(activeContext as AiHistoryContext).accession}`}
                {(!activeContext || activeContext.type === 'dashboard') && 'General Dashboard Context'}
              </span>
              {isContextExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-[#64748B]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
              )}
            </div>
          </div>

          {/* Context Summary Cards Body */}
          {isContextExpanded && (
            <div className="px-6 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] text-xs font-mono grid grid-cols-1 md:grid-cols-4 gap-3">
              {(!activeContext || activeContext.type === 'dashboard') && (
                <>
                  <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                    <span className="text-[10px] text-[#64748B] uppercase">Context Mode</span>
                    <p className="font-semibold text-[#0F172A] mt-0.5">Dashboard Overview</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                    <span className="text-[10px] text-[#64748B] uppercase">Database Scope</span>
                    <p className="font-semibold text-[#0284C7] mt-0.5">BioCode Studio Schema</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                    <span className="text-[10px] text-[#64748B] uppercase">Capabilities</span>
                    <p className="font-semibold text-[#334155] mt-0.5">Full Bioinformatics Suite</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                    <span className="text-[10px] text-[#64748B] uppercase">Grounding Mode</span>
                    <p className="font-semibold text-emerald-600 mt-0.5">Strict (No Fabrication)</p>
                  </div>
                </>
              )}

              {activeContext?.type === 'sequence' && (() => {
                const seq = activeContext as AiSequenceContext;
                return (
                  <>
                    <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                      <span className="text-[10px] text-[#64748B] uppercase">Current Sequence</span>
                      <p className="font-bold text-[#0284C7] text-sm mt-0.5">{seq.accession}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                      <span className="text-[10px] text-[#64748B] uppercase">Type & Length</span>
                      <p className="font-semibold text-[#0F172A] mt-0.5">
                        {seq.sequenceType || 'Protein'} • {seq.sequenceLength || 0} {seq.sequenceType === 'Protein' ? 'aa' : 'bp'}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                      <span className="text-[10px] text-[#64748B] uppercase">Current Analysis</span>
                      <p className="font-semibold text-emerald-600 mt-0.5 truncate">
                        {seq.selectedAnalysis || 'General Property Screen'}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                      <span className="text-[10px] text-[#64748B] uppercase">Project Link</span>
                      <p className="font-semibold text-[#334155] mt-0.5 truncate">
                        {seq.projectId ? 'Linked to Project' : 'Standalone Workbench'}
                      </p>
                    </div>
                  </>
                );
              })()}

              {activeContext?.type === 'project' && (() => {
                const proj = activeContext as AiProjectContext;
                return (
                  <>
                    <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                      <span className="text-[10px] text-[#64748B] uppercase">Project Name</span>
                      <p className="font-bold text-[#0284C7] text-sm mt-0.5">{proj.projectName}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                      <span className="text-[10px] text-[#64748B] uppercase">Organism</span>
                      <p className="font-semibold text-[#0F172A] mt-0.5">{proj.organism || 'Homo sapiens'}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                      <span className="text-[10px] text-[#64748B] uppercase">Associated Sequences</span>
                      <p className="font-semibold text-emerald-600 mt-0.5">
                        {proj.associatedSequences?.length || 0} records
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                      <span className="text-[10px] text-[#64748B] uppercase">Research Objective</span>
                      <p className="font-semibold text-[#334155] mt-0.5 truncate">
                        {proj.researchObjective || 'Genomic mutation screen'}
                      </p>
                    </div>
                  </>
                );
              })()}

              {activeContext?.type === 'history' && (() => {
                const hist = activeContext as AiHistoryContext;
                return (
                  <>
                    <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                      <span className="text-[10px] text-[#64748B] uppercase">Accession</span>
                      <p className="font-bold text-[#0284C7] text-sm mt-0.5">{hist.accession}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs">
                      <span className="text-[10px] text-[#64748B] uppercase">Analysis Type</span>
                      <p className="font-semibold text-[#0F172A] mt-0.5">{hist.analysisType}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs col-span-2">
                      <span className="text-[10px] text-[#64748B] uppercase">Result Summary</span>
                      <p className="font-semibold text-[#334155] mt-0.5 truncate">{hist.resultSummary || 'Calculated'}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Chat Messages Log */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3.5 ${isUser ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                  isUser 
                    ? 'bg-[#0284C7] text-white border-[#0284C7] shadow-xs' 
                    : 'bg-[#FDF2F8] text-[#EC4899] border-[#F472B6]/40 shadow-xs'
                }`}>
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div className={`max-w-2xl rounded-2xl p-4 text-xs border ${
                  isUser
                    ? 'bg-white border-[#38BDF8]/40 text-[#0F172A] rounded-tr-xs shadow-2xs'
                    : 'bg-white border-[#E2E8F0] text-[#0F172A] rounded-tl-xs shadow-[0_4px_20px_rgba(15,23,42,0.04)]'
                }`}>
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E2E8F0] text-[10px] font-mono text-[#64748B]">
                    <span>{isUser ? 'You (Researcher)' : 'BioAI Copilot'} • {new Date(msg.created_at).toLocaleTimeString()}</span>
                    {!isUser && (
                      <button
                        onClick={() => handleCopyText(msg.id, msg.content)}
                        className="text-[#64748B] hover:text-[#EC4899] transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        {copiedMsgId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {isUser ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  ) : (
                    renderFormattedContent(msg.content)
                  )}
                </div>
              </div>
            );
          })}

          {/* Loading Generating State */}
          {isGenerating && (
            <div className="flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-xl bg-[#FDF2F8] border border-[#F472B6]/40 text-[#EC4899] flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 animate-spin text-[#EC4899]" />
              </div>
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 text-xs text-[#475569] font-mono flex items-center gap-3 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-[#EC4899] animate-ping" />
                <span>BioAI is analyzing context and generating response...</span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-red-800">BioAI Error</p>
                  <p className="mt-0.5 text-red-700">{errorMessage}</p>
                </div>
              </div>
              <button
                onClick={handleRetry}
                disabled={isGenerating}
                className="px-3 py-1 rounded bg-red-100 hover:bg-red-200 text-red-800 border border-red-300 text-[11px] font-bold shrink-0 disabled:opacity-50 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form Area */}
        <div className="p-4 border-t border-[#E2E8F0] bg-white shadow-xs">
          {/* Suggested Contextual Prompt Chips */}
          {renderContextPromptChips()}

          <form onSubmit={(e) => { e.preventDefault(); if (!isGenerating && !isGeneratingRef.current) handleSendPrompt(); }} className="relative">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              disabled={isGenerating}
              placeholder={
                isGenerating
                  ? "BioAI is analyzing..."
                  : activeContext?.type === 'sequence'
                  ? `Ask BioAI about ${(activeContext as AiSequenceContext).accession} (pI, MW, hydropathy, mutations)...`
                  : activeContext?.type === 'project'
                  ? `Ask BioAI about project "${(activeContext as AiProjectContext).projectName}"...`
                  : "Ask BioAI about molecular weight, pI, hydropathy, mutations, or scientific interpretations..."
              }
              className="w-full bg-[#F8FAFC] focus:bg-white border border-[#CBD5E1] rounded-xl pl-4 pr-28 py-3.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#EC4899] focus:ring-1 focus:ring-[#EC4899]/30 font-mono disabled:opacity-50 shadow-2xs transition-all"
            />

            <button
              type="submit"
              disabled={isGenerating || !inputVal.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg bg-[#EC4899] hover:bg-[#DB2777] text-white font-bold text-xs disabled:opacity-40 transition-all flex items-center gap-1.5 shadow-xs font-mono cursor-pointer"
            >
              <span>{isGenerating ? "Analyzing..." : "Send"}</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="flex items-center justify-between mt-2 text-[10px] text-[#64748B] font-mono px-1">
            <span>Grounding: Strict BioCode Studio Context Validation</span>
            <div className="flex items-center gap-2">
              <span className="text-emerald-700 font-medium">Model: {lastModelUsed}</span>
              {lastModelUsed !== primaryConfiguredModel && (
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-50 text-amber-700 border border-amber-200">
                  Fallback Active
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
