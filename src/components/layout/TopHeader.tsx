import React, { useState, useEffect } from 'react';
import { Terminal, AlertTriangle, Menu } from 'lucide-react';
import { NavItem, SchemaHealthStatus } from '../../types';
import { bioService } from '../../services/bioService';
import { DatabaseDebugModal } from '../database/DatabaseDebugModal';

interface TopHeaderProps {
  activeTab: NavItem;
  user?: any;
  onOpenMobileMenu?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ activeTab, user, onOpenMobileMenu }) => {
  const [healthStatus, setHealthStatus] = useState<SchemaHealthStatus | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(true);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const verifyHealth = async () => {
      try {
        const h = await bioService.checkSchemaHealth();
        if (isMounted) {
          setHealthStatus(h);
        }
      } catch (err) {
        console.warn('[TopHeader] Health check failed:', err);
      } finally {
        if (isMounted) {
          setIsCheckingHealth(false);
        }
      }
    };

    verifyHealth();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const getTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Research Command Center';
      case 'analysis': return 'Sequence Analysis Workbench';
      case 'ai-assistant': return 'BioAI Assistant & Copilot';
      case 'projects': return 'Project Workspace Manager';
      case 'history': return 'Analysis History & Logs';
      case 'settings': return 'Platform Settings & Configurations';
      default: return 'BioCode Studio';
    }
  };

  return (
    <>
      <header className="h-16 border-b border-slate-200/90 flex items-center justify-between gap-2 px-3 sm:px-6 md:px-8 bg-white/95 backdrop-blur-md sticky top-0 z-30 min-w-0 shadow-xs">
        {/* Mobile Menu Trigger + Page Title & Connection Breadcrumb */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 font-sans">
          {onOpenMobileMenu && (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              aria-label="Open navigation menu"
              className="md:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80 shrink-0 cursor-pointer transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          <span className="text-xs font-display font-[700] text-sky-700 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200 hidden sm:inline shrink-0 shadow-2xs">
            BioCode Studio
          </span>
          <span className="text-slate-300 hidden sm:inline font-bold shrink-0">/</span>
          <h1 className="text-xs sm:text-base font-[700] text-slate-900 tracking-tight truncate font-display min-w-0">
            {getTitle()}
          </h1>

          {/* Real verified Supabase health badge */}
          <div className="shrink-0 font-sans">
            {isCheckingHealth ? (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-50 px-2 sm:px-2.5 py-1 rounded-md border border-slate-200 animate-pulse flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
                <span className="hidden md:inline">Connecting...</span>
              </span>
            ) : healthStatus?.state === 'CONNECTED' ? (
              <button
                type="button"
                onClick={() => setIsDebugModalOpen(true)}
                className="text-[11px] font-[600] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 sm:px-2.5 py-1 rounded-md border border-emerald-200 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                title="Supabase Cloud database connection verified. Click for transaction diagnostics."
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="hidden sm:inline">Supabase Connected</span>
                <span className="sm:hidden">DB</span>
              </button>
            ) : healthStatus?.state === 'CONFIGURATION_ERROR' ? (
              <button
                type="button"
                onClick={() => setIsDebugModalOpen(true)}
                className="text-[11px] font-[600] text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 sm:px-2.5 py-1 rounded-md border border-amber-200 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                title="Supabase environment variables are missing."
              >
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                <span className="hidden sm:inline">Config Missing</span>
              </button>
            ) : healthStatus?.state === 'DATABASE_ERROR' ? (
              <button
                type="button"
                onClick={() => setIsDebugModalOpen(true)}
                className="text-[11px] font-[600] text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 sm:px-2.5 py-1 rounded-md border border-rose-200 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                title={healthStatus?.errorMessage || 'Database schema error or permission denied.'}
              >
                <AlertTriangle className="w-3 h-3 text-rose-600" />
                <span className="hidden sm:inline">DB Error</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsDebugModalOpen(true)}
                className="text-[11px] font-[500] text-slate-600 bg-slate-50 hover:bg-slate-100 px-2 sm:px-2.5 py-1 rounded-md border border-slate-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Supabase backend unreachable. Operating in offline mode."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                <span className="hidden sm:inline">Offline Mode</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-2 sm:space-x-4 shrink-0 font-sans">
          {/* Debug Logger Button */}
          <button
            type="button"
            onClick={() => setIsDebugModalOpen(true)}
            className="p-1.5 sm:px-2.5 sm:py-1 text-slate-700 hover:text-slate-900 hover:bg-slate-100 bg-slate-50 rounded-lg border border-slate-200 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-[600] shadow-2xs"
            title="Open Database Transaction & Diagnostic Logs"
            aria-label="Open Database Transaction and Diagnostic Logs"
          >
            <Terminal className="w-3.5 h-3.5 text-sky-600" />
            <span className="hidden md:inline font-[600]">DB Logs</span>
          </button>

          {/* Research Session Badge */}
          <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-[600] hidden lg:inline shadow-2xs">
            Research Session: Active
          </span>
        </div>
      </header>

      {/* Database Diagnostics and SQL Migration Modal */}
      <DatabaseDebugModal 
        isOpen={isDebugModalOpen} 
        onClose={() => setIsDebugModalOpen(false)} 
      />
    </>
  );
};
