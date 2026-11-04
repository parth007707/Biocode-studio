import React, { useState, useEffect } from 'react';
import { Search, Bell, Shield, User, HelpCircle, LogOut, Terminal, CheckCircle2, AlertTriangle } from 'lucide-react';
import { NavItem, SchemaHealthStatus } from '../../types';
import { bioService } from '../../services/bioService';
import { DatabaseDebugModal } from '../database/DatabaseDebugModal';

interface TopHeaderProps {
  activeTab: NavItem;
  user: any;
  onSignOut: () => void;
  onOpenAuth: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ activeTab, user, onSignOut, onOpenAuth }) => {
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

  const userDisplayName = user?.user_metadata?.full_name || user?.email || 'Guest User';
  const userInitials = userDisplayName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'GU';

  return (
    <>
      <header className="h-16 border-b border-slate-200/90 flex items-center justify-between px-4 sm:px-6 md:px-8 bg-white/95 backdrop-blur-md sticky top-0 z-30 min-w-0 shadow-xs">
        {/* Page Title & Connection Breadcrumb */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 font-sans">
          <span className="text-xs font-display font-[700] text-sky-700 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200 hidden sm:inline shadow-2xs">
            BioCode Studio
          </span>
          <span className="text-slate-300 hidden sm:inline font-bold">/</span>
          <h1 className="text-sm sm:text-base font-[700] text-slate-900 tracking-tight truncate font-display">
            {getTitle()}
          </h1>

          {/* Real verified Supabase health badge */}
          <div className="shrink-0 font-sans">
            {isCheckingHealth ? (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200 animate-pulse flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
                <span className="hidden md:inline">Connecting...</span>
              </span>
            ) : healthStatus?.state === 'CONNECTED' ? (
              <button
                type="button"
                onClick={() => setIsDebugModalOpen(true)}
                className="text-[11px] font-[600] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                title="Supabase Cloud database connection verified. Click for transaction diagnostics."
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Supabase Connected</span>
              </button>
            ) : healthStatus?.state === 'CONFIGURATION_ERROR' ? (
              <button
                type="button"
                onClick={() => setIsDebugModalOpen(true)}
                className="text-[11px] font-[600] text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-md border border-amber-200 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                title="Supabase environment variables are missing."
              >
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                <span className="hidden sm:inline">Config Missing</span>
              </button>
            ) : healthStatus?.state === 'DATABASE_ERROR' ? (
              <button
                type="button"
                onClick={() => setIsDebugModalOpen(true)}
                className="text-[11px] font-[600] text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-md border border-rose-200 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                title={healthStatus?.errorMessage || 'Database schema error or permission denied.'}
              >
                <AlertTriangle className="w-3 h-3 text-rose-600" />
                <span className="hidden sm:inline">DB Error</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsDebugModalOpen(true)}
                className="text-[11px] font-[500] text-slate-600 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Supabase backend unreachable. Operating in offline mode."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                <span>Offline Mode</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-3 sm:space-x-4 shrink-0 font-sans">
          {/* Debug Logger Button */}
          <button
            type="button"
            onClick={() => setIsDebugModalOpen(true)}
            className="p-1.5 sm:px-2.5 sm:py-1 text-slate-700 hover:text-slate-900 hover:bg-slate-100 bg-slate-50 rounded-lg border border-slate-200 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-[600] shadow-2xs"
            title="Open Database Transaction & Diagnostic Logs"
          >
            <Terminal className="w-3.5 h-3.5 text-sky-600" />
            <span className="hidden md:inline font-[600]">DB Logs</span>
          </button>

          {/* Research Session Badge */}
          <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-[600] hidden md:inline shadow-2xs">
            Research Session: Active
          </span>

          {/* User Profile / Auth */}
          {user ? (
            <div className="flex items-center space-x-2">
              <div 
                className="w-8 h-8 rounded-full bg-sky-50 border border-sky-200 flex items-center justify-center text-xs font-[700] text-sky-700 font-display shadow-2xs"
                title={userDisplayName}
              >
                {userInitials}
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div 
                className="w-8 h-8 rounded-full bg-sky-50 border border-sky-200 flex items-center justify-center text-xs font-[700] text-sky-700 font-display shadow-2xs"
                title="Guest Mode (Local & Anonymous Cloud Sync)"
              >
                GU
              </div>
              <span className="text-xs font-sans text-slate-600 hidden lg:inline font-[500]">
                Guest Researcher
              </span>
              <button
                type="button"
                onClick={onOpenAuth}
                className="ml-1 px-3 py-1.5 bg-[#0284C7] hover:bg-[#0369a1] text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                title="Sign in to save research projects to cloud"
              >
                <User className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            </div>
          )}
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
