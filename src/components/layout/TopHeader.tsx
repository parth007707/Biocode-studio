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

  const isConnected = healthStatus?.connected === true && (!healthStatus?.missingTables || healthStatus.missingTables.length === 0);

  return (
    <>
      <header className="h-16 border-b border-[#BAE6FD] flex items-center justify-between px-4 sm:px-6 md:px-8 bg-white/85 backdrop-blur-md sticky top-0 z-30 min-w-0 shadow-[0_2px_12px_rgba(14,165,233,0.04)]">
        {/* Page Title & Real Connection Breadcrumb */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <span className="text-xs font-mono text-[#0284C7] bg-[#F0F9FF] px-2 py-0.5 rounded border border-[#BAE6FD] hidden sm:inline font-medium shadow-xs">BioCode Studio</span>
          <span className="text-[#BAE6FD] hidden sm:inline font-bold">/</span>
          <h1 className="text-sm sm:text-base font-bold text-[#0F172A] tracking-tight truncate">
            {getTitle()}
          </h1>

          {/* Real verified Supabase health badge */}
          <div className="shrink-0">
            {isCheckingHealth ? (
              <span className="text-[11px] font-mono text-[#64748B] bg-[#F8FAFC] px-2 py-0.5 rounded border border-[#E2E8F0] animate-pulse flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] animate-ping" />
                <span className="hidden md:inline">Connecting...</span>
              </span>
            ) : healthStatus?.state === 'CONNECTED' ? (
              <button
                type="button"
                onClick={() => setIsDebugModalOpen(true)}
                className="text-[11px] font-mono text-[#16A34A] bg-[#F0FDF4] hover:bg-[#DCFCE7] px-2.5 py-1 rounded-md border border-[#BBF7D0] flex items-center gap-1.5 cursor-pointer transition-colors font-semibold shadow-2xs"
                title="Supabase Cloud database connection verified. Click for transaction diagnostics."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                <span>● Supabase Connected</span>
              </button>
            ) : healthStatus?.state === 'CONFIGURATION_ERROR' ? (
              <button
                type="button"
                onClick={() => setIsDebugModalOpen(true)}
                className="text-[11px] font-mono text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Supabase environment variables are missing."
              >
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                <span className="hidden sm:inline">Config Missing</span>
              </button>
            ) : healthStatus?.state === 'DATABASE_ERROR' ? (
              <button
                type="button"
                onClick={() => setIsDebugModalOpen(true)}
                className="text-[11px] font-mono text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                title={healthStatus?.errorMessage || 'Database schema error or permission denied.'}
              >
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                <span className="hidden sm:inline">DB Error</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsDebugModalOpen(true)}
                className="text-[11px] font-mono text-[#64748B] bg-[#F8FAFC] hover:bg-[#F1F5F9] px-2 py-0.5 rounded border border-[#E2E8F0] flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Supabase backend unreachable. Operating in offline mode."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8]" />
                <span>Offline Mode</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-3 sm:space-x-4 shrink-0">
          {/* Debug Logger Button */}
          <button
            type="button"
            onClick={() => setIsDebugModalOpen(true)}
            className="p-1.5 sm:px-2.5 sm:py-1 text-[#0284C7] hover:text-[#0369A1] hover:bg-[#E0F2FE] bg-[#F0F9FF] rounded-lg border border-[#BAE6FD] transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-mono shadow-2xs"
            title="Open Database Transaction & Diagnostic Logs"
          >
            <Terminal className="w-3.5 h-3.5 text-[#0284C7]" />
            <span className="hidden sm:inline text-[11px] font-medium">DB Logs</span>
          </button>

          {/* User Profile & Auth */}
          <div className="flex items-center space-x-2 sm:space-x-3 border-l border-[#BAE6FD] pl-3 sm:pl-4">
            {user ? (
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="flex items-center space-x-2 group cursor-pointer">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#E0F2FE] border border-[#7DD3FC] flex items-center justify-center text-xs font-bold text-[#0284C7]">
                    {userInitials}
                  </div>
                  <div className="hidden md:block text-left">
                    <div className="text-xs font-medium text-[#0F172A] group-hover:text-[#0284C7] truncate max-w-[120px]">{userDisplayName}</div>
                    <div className="text-[10px] font-mono text-[#16A34A] font-semibold">Authenticated</div>
                  </div>
                </div>
                <button
                  onClick={onSignOut}
                  className="p-1.5 text-[#64748B] hover:text-red-600 transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="text-[11px] font-mono text-[#0284C7] bg-[#F0F9FF] border border-[#BAE6FD] px-2.5 py-1 rounded-md flex items-center gap-2 font-medium shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7]" />
                <span className="hidden xs:inline">Lab Session</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Database Diagnostic Logger Modal */}
      <DatabaseDebugModal
        isOpen={isDebugModalOpen}
        onClose={() => setIsDebugModalOpen(false)}
      />
    </>
  );
};
