import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { DashboardView } from './components/dashboard/DashboardView';
import { AnalysisView } from './components/analysis/AnalysisView';
import { AIAssistantView } from './components/ai/AIAssistantView';
import { ProjectsView } from './components/projects/ProjectsView';
import { HistoryView } from './components/history/HistoryView';
import { SettingsView } from './components/settings/SettingsView';
import { BioErrorBoundary } from './components/common/BioErrorBoundary';
import { NavItem, AiContextData } from './types';
import { supabase, isSupabaseConfigured, ensureAnonymousSession } from './lib/supabase/client';
import { BackgroundParticles } from './components/common/BackgroundParticles';
import { BioSequenceProvider } from './context/BioSequenceContext';
import { bioService } from './services/bioService';

export default function App() {
  const parsePath = (path: string): { tab: NavItem; analysisId: string | null } => {
    // Redirect legacy auth routes directly to dashboard
    if (
      path === '/login' ||
      path === '/sign-in' ||
      path === '/auth/callback' ||
      path === '/auth-callback' ||
      path === '/reset-password' ||
      path === '/forgot-password'
    ) {
      return { tab: 'dashboard', analysisId: null };
    }

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
  const [activeTab, setActiveTab] = useState<NavItem>(initialRoute.tab);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(initialRoute.analysisId);
  const [activeAiContext, setActiveAiContext] = useState<AiContextData | null>({
    type: 'dashboard',
    totalSequences: 0,
    totalProjects: 0,
    totalAnalyses: 0,
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
  const [authReady, setAuthReady] = useState<boolean>(!isSupabaseConfigured);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isTabletSidebarExpanded, setIsTabletSidebarExpanded] = useState<boolean>(false);

  const navigateToTab = (tab: NavItem) => {
    setActiveTab(tab);
    setIsMobileSidebarOpen(false);
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
  };

  const handleOpenAiWithContext = (context: AiContextData) => {
    setActiveAiContext(context);
    setActiveTab('ai-assistant');
    setIsMobileSidebarOpen(false);
    window.history.pushState({}, '', '/ai-assistant');
  };

  // Sync browser back/forward history
  useEffect(() => {
    const handlePopState = () => {
      const { tab, analysisId } = parsePath(window.location.pathname);
      setActiveTab(tab);
      setSelectedAnalysisId(analysisId);
      setIsMobileSidebarOpen(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      return;
    }

    let isMounted = true;

    ensureAnonymousSession()
      .then(async (anonUser) => {
        if (anonUser?.id) {
          await bioService.migrateLocalGuestToUser(anonUser.id);
        }
        if (isMounted) {
          setUser(anonUser ?? null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUser(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setAuthReady(true);
        }
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) {
        bioService.migrateLocalGuestToUser(session.user.id).catch(() => {});
      }
      if (isMounted) {
        setUser(session?.user ?? null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

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
    setIsMobileSidebarOpen(false);
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
    setIsMobileSidebarOpen(false);
    window.history.pushState({}, '', '/sequence-analysis');
  };

  const currentNavItem: NavItem = activeTab || 'dashboard';

  const renderContent = () => {
    switch (currentNavItem) {
      case 'dashboard':
        return (
          <DashboardView 
            setActiveTab={navigateToTab} 
            user={user}
            authReady={authReady}
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
            initialWorkbenchData={workbenchInitialData} 
            onOpenAiWithContext={handleOpenAiWithContext}
          />
        );
      case 'ai-assistant':
        return (
          <AIAssistantView 
            user={user}
            authReady={authReady}
            activeContext={activeAiContext}
          />
        );
      case 'projects':
        return (
          <ProjectsView 
            user={user}
            authReady={authReady}
            onOpenWorkbench={handleOpenWorkbenchFromProject} 
            onOpenAiWithContext={handleOpenAiWithContext}
          />
        );
      case 'history':
        return (
          <HistoryView 
            user={user}
            authReady={authReady}
            initialAnalysisId={selectedAnalysisId}
            onSelectAnalysis={handleSelectAnalysis}
            onOpenWorkbench={handleOpenWorkbenchFromHistory}
            onOpenAiWithContext={handleOpenAiWithContext}
          />
        );
      case 'settings':
        return <SettingsView user={user} />;
      default:
        return <DashboardView setActiveTab={navigateToTab} user={user} authReady={authReady} />;
    }
  };

  return (
    <BioSequenceProvider userId={user?.id} authReady={authReady}>
      <div 
        className="flex min-h-screen lg:h-screen w-full text-[#0F172A] font-sans overflow-x-hidden lg:overflow-hidden selection:bg-[#38BDF8]/20 selection:text-[#0284C7] bg-[#F8FAFC] relative"
      >
        {/* Subtle molecular background data particles */}
        <BackgroundParticles />

        {/* Responsive Sidebar: Drawer on mobile, compact/collapsible rail on tablet, permanent 260px on desktop */}
        <Sidebar 
          activeTab={currentNavItem} 
          setActiveTab={navigateToTab}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          isTabletExpanded={isTabletSidebarExpanded}
          onToggleTabletExpand={() => setIsTabletSidebarExpanded((prev) => !prev)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 w-full lg:overflow-hidden bg-transparent">
          <TopHeader 
            activeTab={currentNavItem} 
            user={user}
            onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
          />
          
          <main className={`flex-1 min-w-0 ${(currentNavItem === 'analysis' || currentNavItem === 'ai-assistant') ? 'overflow-y-auto lg:overflow-hidden' : 'overflow-y-auto'} bg-transparent`}>
            <BioErrorBoundary moduleName={currentNavItem} key={currentNavItem}>
              {renderContent()}
            </BioErrorBoundary>
          </main>
        </div>
      </div>
    </BioSequenceProvider>
  );
}
