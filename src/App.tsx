import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { DashboardView } from './components/dashboard/DashboardView';
import { AnalysisView } from './components/analysis/AnalysisView';
import { AIAssistantView } from './components/ai/AIAssistantView';
import { ProjectsView } from './components/projects/ProjectsView';
import { HistoryView } from './components/history/HistoryView';
import { SettingsView } from './components/settings/SettingsView';
import { AuthModal } from './components/auth/AuthModal';
import { LoginPage } from './components/auth/LoginPage';
import { AuthCallbackView } from './components/auth/AuthCallbackView';
import { ResetPasswordView } from './components/auth/ResetPasswordView';
import { ForgotPasswordView } from './components/auth/ForgotPasswordView';
import { BioErrorBoundary } from './components/common/BioErrorBoundary';
import { NavItem, AiContextData } from './types';
import { supabase, isSupabaseConfigured, AUTH_REQUIRED } from './lib/supabase/client';
import { Dna, Loader2 } from 'lucide-react';
import { BackgroundParticles } from './components/common/BackgroundParticles';
import { BioSequenceProvider } from './context/BioSequenceContext';

export default function App() {
  const parsePath = (path: string): { tab: NavItem | 'login' | 'auth-callback' | 'reset-password' | 'forgot-password'; analysisId: string | null } => {
    if (path === '/login' || path === '/sign-in') return { tab: 'login', analysisId: null };
    if (path === '/auth/callback' || path === '/auth-callback') return { tab: 'auth-callback', analysisId: null };
    if (path === '/reset-password') return { tab: 'reset-password', analysisId: null };
    if (path === '/forgot-password') return { tab: 'forgot-password', analysisId: null };

    // Check if path is /analysis-history/:analysisId or /history/:analysisId
    const historyDetailMatch = path.match(/^\/(?:analysis-history|history)\/([a-zA-Z0-9_-]+)/);
    if (historyDetailMatch && historyDetailMatch[1]) {
      return { tab: 'history', analysisId: historyDetailMatch[1] };
    }
    if (path === '/sequence-analysis' || path === '/analysis') return { tab: 'analysis', analysisId: null };
    if (path === '/projects') return { tab: 'projects', analysisId: null };
    if (path === '/analysis-history' || path === '/history') return { tab: 'history', analysisId: null };
    if (path === '/ai-assistant') return { tab: 'ai-assistant', analysisId: null };
    if (path === '/settings') return { tab: 'settings', analysisId: null };

    // Query params fallback
    const params = new URLSearchParams(window.location.search);
    const qId = params.get('analysisId') || params.get('id');
    if (qId) {
      return { tab: 'history', analysisId: qId };
    }

    return { tab: 'dashboard', analysisId: null };
  };

  const initialRoute = parsePath(window.location.pathname);
  const [activeTab, setActiveTab] = useState<NavItem | 'login' | 'auth-callback' | 'reset-password' | 'forgot-password'>(initialRoute.tab);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(initialRoute.analysisId);
  const [activeAiContext, setActiveAiContext] = useState<AiContextData | null>({
    type: 'dashboard',
    totalSequences: 4,
    totalProjects: 1,
    totalAnalyses: 4,
    availableModules: ['Sequence Workbench', 'Structure Explorer', 'Mutation Tracker', 'Database Integrations']
  });
  const [workbenchInitialData, setWorkbenchInitialData] = useState<{
    sequence: string;
    metadata?: any;
    pipeline?: string;
    savedResults?: any;
    projectId?: string;
    sequenceId?: string;
  } | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  const handleOpenAiWithContext = (context: AiContextData) => {
    setActiveAiContext(context);
    setActiveTab('ai-assistant');
    window.history.pushState({}, '', '/ai-assistant');
  };

  const handleOpenAuth = () => {
    setIsAuthModalOpen(true);
  };

  // Sync browser back/forward history
  useEffect(() => {
    const handlePopState = () => {
      const { tab, analysisId } = parsePath(window.location.pathname);
      setActiveTab(tab);
      setSelectedAnalysisId(analysisId);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      console.log('[Auth] Supabase is not configured.');
      return;
    }

    // Check active session in background without blocking rendering
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('[Auth] getSession error:', error);
      }
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    console.log('[Auth] Signing out user...');
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleSelectAnalysis = (id: string | null) => {
    setSelectedAnalysisId(id);
    if (id) {
      window.history.pushState({}, '', `/analysis-history/${id}`);
    } else {
      window.history.pushState({}, '', '/analysis-history');
    }
  };

  const handleOpenWorkbenchFromHistory = (sequence: string, metadata?: any, pipeline?: string, savedResults?: any) => {
    setWorkbenchInitialData({ sequence, metadata, pipeline, savedResults });
    setActiveTab('analysis');
    window.history.pushState({}, '', '/sequence-analysis');
  };

  const handleOpenWorkbenchFromProject = (
    sequence: string,
    metadata?: any,
    pipeline?: string,
    savedResults?: any,
    projectId?: string,
    sequenceId?: string
  ) => {
    setWorkbenchInitialData({ sequence, metadata, pipeline, savedResults, projectId, sequenceId });
    setActiveTab('analysis');
    window.history.pushState({}, '', '/sequence-analysis');
  };

  // Standalone standalone views (LoginPage, AuthCallbackView, ResetPasswordView, ForgotPasswordView)
  if (activeTab === 'login') {
    return (
      <LoginPage 
        onSuccess={() => {
          setActiveTab('dashboard');
          window.history.pushState({}, '', '/dashboard');
        }}
        onContinueAsGuest={() => {
          setActiveTab('dashboard');
          window.history.pushState({}, '', '/dashboard');
        }}
      />
    );
  }

  if (activeTab === 'auth-callback') {
    return <AuthCallbackView />;
  }

  if (activeTab === 'reset-password') {
    return <ResetPasswordView />;
  }

  if (activeTab === 'forgot-password') {
    return <ForgotPasswordView />;
  }

  const currentNavItem: NavItem = (activeTab as NavItem) || 'dashboard';

  const renderContent = () => {
    switch (currentNavItem) {
      case 'dashboard':
        return (
          <DashboardView 
            setActiveTab={setActiveTab} 
            user={user} 
            onOpenAuth={handleOpenAuth} 
            onSelectAnalysis={(id) => {
              setSelectedAnalysisId(id);
              setActiveTab('history');
              window.history.pushState({}, '', `/analysis-history/${id}`);
            }}
            onOpenWorkbench={handleOpenWorkbenchFromProject}
            onOpenAiWithContext={handleOpenAiWithContext}
          />
        );
      case 'analysis':
        return (
          <AnalysisView 
            user={user} 
            onOpenAuth={handleOpenAuth} 
            initialWorkbenchData={workbenchInitialData} 
            onOpenAiWithContext={handleOpenAiWithContext}
          />
        );
      case 'ai-assistant':
        return (
          <AIAssistantView 
            user={user} 
            activeContext={activeAiContext}
          />
        );
      case 'projects':
        return (
          <ProjectsView 
            user={user} 
            onOpenAuth={handleOpenAuth} 
            onOpenWorkbench={handleOpenWorkbenchFromProject} 
            onOpenAiWithContext={handleOpenAiWithContext}
          />
        );
      case 'history':
        return (
          <HistoryView 
            user={user} 
            onOpenAuth={handleOpenAuth} 
            initialAnalysisId={selectedAnalysisId}
            onSelectAnalysis={handleSelectAnalysis}
            onOpenWorkbench={handleOpenWorkbenchFromHistory}
            onOpenAiWithContext={handleOpenAiWithContext}
          />
        );
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView setActiveTab={setActiveTab} user={user} onOpenAuth={handleOpenAuth} />;
    }
  };

  return (
    <BioSequenceProvider>
      <div 
        className="flex h-screen text-[#0F172A] font-sans overflow-hidden selection:bg-[#38BDF8]/20 selection:text-[#0284C7] bg-[#F8FAFC] relative"
      >
        {/* Subtle molecular background data particles */}
        <BackgroundParticles />

        {/* Left Sidebar (260px fixed width) */}
        <Sidebar activeTab={currentNavItem} setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'history') {
            setSelectedAnalysisId(null);
          }
          const pathMap: Record<NavItem, string> = {
            dashboard: '/dashboard',
            analysis: '/sequence-analysis',
            'ai-assistant': '/ai-assistant',
            projects: '/projects',
            history: selectedAnalysisId && tab === 'history' ? `/analysis-history/${selectedAnalysisId}` : '/analysis-history',
            settings: '/settings'
          };
          window.history.pushState({}, '', pathMap[tab] || '/dashboard');
        }} />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-transparent">
          <TopHeader 
            activeTab={currentNavItem} 
            user={user} 
            onSignOut={handleSignOut} 
            onOpenAuth={handleOpenAuth} 
          />
          
          <main className={`flex-1 ${currentNavItem === 'analysis' || currentNavItem === 'ai-assistant' ? 'overflow-hidden' : 'overflow-y-auto'} bg-transparent`}>
            <BioErrorBoundary moduleName={currentNavItem} key={currentNavItem}>
              {renderContent()}
            </BioErrorBoundary>
          </main>
        </div>

        {/* Auth Modal */}
        {isAuthModalOpen && (
          <AuthModal 
            onSuccess={() => {
              setIsAuthModalOpen(false);
            }} 
            onClose={() => {
              setIsAuthModalOpen(false);
            }}
          />
        )}
      </div>
    </BioSequenceProvider>
  );
}
