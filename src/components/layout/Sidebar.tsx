import React from 'react';
import { 
  Dna, 
  LayoutDashboard, 
  Activity, 
  Sparkles, 
  FolderKanban, 
  History, 
  Settings, 
  Cpu, 
  ChevronRight,
} from 'lucide-react';
import { NavItem } from '../../types';

interface SidebarProps {
  activeTab: NavItem;
  setActiveTab: (tab: NavItem) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const navigationItems = [
    { id: 'dashboard' as NavItem, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'analysis' as NavItem, label: 'Sequence Analysis', icon: Activity },
    { id: 'ai-assistant' as NavItem, label: 'AI Assistant', icon: Sparkles, badge: 'BioAI' },
    { id: 'projects' as NavItem, label: 'Projects', icon: FolderKanban },
    { id: 'history' as NavItem, label: 'Analysis History', icon: History },
    { id: 'settings' as NavItem, label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-[260px] bg-white border-r border-slate-200/90 flex flex-col h-screen select-none shrink-0 z-20 overflow-hidden shadow-xs">
      {/* Brand Logo */}
      <div className="p-5 flex items-center space-x-3 border-b border-slate-100 bg-white">
        <div className="w-9 h-9 bg-sky-50 border border-sky-200 rounded-xl flex items-center justify-center text-sky-600 relative shrink-0 group shadow-xs">
          <Dna className="w-5 h-5 text-sky-600 transition-transform duration-500 group-hover:rotate-45" />
          <span className="w-2 h-2 rounded-full bg-emerald-500 absolute -top-0.5 -right-0.5 border-2 border-white shadow-xs" />
        </div>
        <div className="min-w-0">
          <span className="text-base font-[700] tracking-tight text-slate-900 truncate font-display block">
            BioCode <span className="text-sky-600">Studio</span>
          </span>
          <span className="text-[10px] font-sans font-medium text-slate-500 uppercase block tracking-wider">
            Research Platform
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto font-sans">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          // Color coded active identity for each section in clean light aesthetic
          const getActiveClasses = () => {
            switch (item.id) {
              case 'ai-assistant':
                return 'bg-pink-50 text-pink-700 font-[600] border-l-[3px] border-l-pink-500 border-y border-r border-pink-200/70 shadow-xs';
              case 'projects':
                return 'bg-purple-50 text-purple-700 font-[600] border-l-[3px] border-l-purple-500 border-y border-r border-purple-200/70 shadow-xs';
              case 'history':
                return 'bg-amber-50 text-amber-700 font-[600] border-l-[3px] border-l-amber-500 border-y border-r border-amber-200/70 shadow-xs';
              case 'settings':
                return 'bg-slate-100 text-slate-900 font-[600] border-l-[3px] border-l-slate-600 border-y border-r border-slate-200/70 shadow-xs';
              case 'dashboard':
              case 'analysis':
              default:
                return 'bg-sky-50 text-sky-700 font-[600] border-l-[3px] border-l-sky-500 border-y border-r border-sky-200/70 shadow-xs';
            }
          };

          const getIconColor = () => {
            if (!isActive) return 'text-slate-400 group-hover:text-slate-700';
            switch (item.id) {
              case 'ai-assistant': return 'text-pink-600';
              case 'projects': return 'text-purple-600';
              case 'history': return 'text-amber-600';
              case 'settings': return 'text-slate-700';
              default: return 'text-sky-600';
            }
          };

          const getChevronColor = () => {
            switch (item.id) {
              case 'ai-assistant': return 'text-pink-600';
              case 'projects': return 'text-purple-600';
              case 'history': return 'text-amber-600';
              case 'settings': return 'text-slate-500';
              default: return 'text-sky-600';
            }
          };

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-[500] transition-all duration-150 cursor-pointer group relative ${
                isActive
                  ? getActiveClasses()
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-3 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${getIconColor()}`}
                />
                <span className="truncate">{item.label}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                {item.badge && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                      item.id === 'ai-assistant'
                        ? 'bg-pink-100 text-pink-700 border border-pink-200'
                        : isActive
                        ? 'bg-sky-100 text-sky-700 border border-sky-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
                {isActive && (
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    <ChevronRight className={`w-3.5 h-3.5 ${getChevronColor()}`} />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Compact Engine Status */}
      <div className="p-3 border-t border-slate-200/80 bg-slate-50/70 font-sans">
        <div className="flex items-center justify-between text-xs px-2 py-1.5">
          <span className="text-slate-600 font-medium flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-sky-600" />
            <span>Research Engine</span>
          </span>
          <span className="flex items-center gap-1.5 font-semibold text-emerald-700 text-[11px] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Operational</span>
          </span>
        </div>
      </div>
    </aside>
  );
};
